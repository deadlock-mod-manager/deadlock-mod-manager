use crate::{Error, PluginHost, SessionDenied, manifest, package};
use std::{fs, path::PathBuf};

/// The information a native UI adapter needs to open an authenticated view.
pub struct PluginView {
  pub plugin_id: String,
  pub name: String,
  pub generation: u64,
  pub entry: String,
}

pub struct ViewAsset {
  pub path: PathBuf,
  pub bytes: Vec<u8>,
}

impl PluginHost {
  pub fn view(&self, id: &str) -> Result<PluginView, Error> {
    let plugin = self.active(id)?;
    let ui = plugin
      .manifest
      .ui
      .as_ref()
      .ok_or_else(|| Error::InvalidInput("This plugin has no interface".into()))?;
    Ok(PluginView {
      plugin_id: plugin.id,
      name: plugin.manifest.name,
      generation: plugin.generation,
      entry: ui.rsplit('/').next().unwrap_or(ui).to_owned(),
    })
  }

  /// Session authorization, package confinement and asset limits stay together.
  /// `None` means the requested resource is absent or unsafe.
  pub fn read_view_asset(
    &self,
    id: &str,
    generation: u64,
    path: &str,
  ) -> Result<Option<ViewAsset>, SessionDenied> {
    let plugin = self.authorize(id, generation)?;
    if !manifest::is_safe_package_path(path) {
      return Ok(None);
    }
    let Some(ui) = plugin.manifest.ui.as_ref() else {
      return Ok(None);
    };
    let root = match ui.rsplit_once('/') {
      Some((dir, _)) => match package::package_file(&plugin.package_dir, dir) {
        Some(root) => root,
        None => return Ok(None),
      },
      None => plugin.package_dir,
    };
    let Some(file) = package::package_file(&root, path) else {
      return Ok(None);
    };
    match fs::symlink_metadata(&file) {
      Ok(meta) if meta.is_file() && meta.len() <= 32 * 1024 * 1024 => {}
      _ => return Ok(None),
    }
    let Ok(bytes) = fs::read(&file) else {
      return Ok(None);
    };
    if bytes.len() > 32 * 1024 * 1024 {
      return Ok(None);
    }
    Ok(Some(ViewAsset {
      path: PathBuf::from(path),
      bytes,
    }))
  }
}
