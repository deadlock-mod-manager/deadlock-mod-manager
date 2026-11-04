use crate::{Error, PluginHost, SessionDenied, lock, manifest, package};
use std::{fs, path::PathBuf};

/// The information a native UI adapter needs to open an authenticated view.
/// `token` names this generation's view in frame URLs and relayed calls, so
/// a frame reaches only its own plugin and goes stale when the plugin updates.
#[derive(Debug, Clone)]
pub struct PluginView {
  pub plugin_id: String,
  pub name: String,
  pub generation: u64,
  pub entry: String,
  pub token: String,
}

pub struct ViewAsset {
  pub path: PathBuf,
  pub bytes: Vec<u8>,
}

impl PluginHost {
  pub fn view(&self, id: &str) -> Result<PluginView, Error> {
    let plugin = self.active(id)?;
    let mut views = lock(&self.views);
    if let Some(view) = views
      .get(id)
      .filter(|view| view.generation == plugin.generation)
    {
      return Ok(view.clone());
    }
    let ui = plugin
      .manifest
      .ui
      .as_ref()
      .ok_or_else(|| Error::InvalidInput("This plugin has no interface".into()))?;
    let mut random = [0u8; 32];
    getrandom::fill(&mut random)
      .map_err(|error| Error::InvalidInput(format!("Cannot open the plugin view: {error}")))?;
    let view = PluginView {
      plugin_id: plugin.id,
      name: plugin.manifest.name,
      generation: plugin.generation,
      entry: ui.rsplit('/').next().unwrap_or(ui).to_owned(),
      token: random.iter().map(|byte| format!("{byte:02x}")).collect(),
    };
    views.insert(id.to_owned(), view.clone());
    Ok(view)
  }

  /// The view a frame URL or relayed call names, while its generation is current.
  pub fn view_session(&self, token: &str) -> Result<PluginView, SessionDenied> {
    let view = lock(&self.views)
      .values()
      .find(|view| view.token == token)
      .cloned()
      .ok_or(SessionDenied::Stale)?;
    self.authorize(&view.plugin_id, view.generation)?;
    Ok(view)
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
