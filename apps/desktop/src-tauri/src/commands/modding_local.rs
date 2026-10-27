use super::modding_workspace::{ModdingAddon, ModdingHierarchy, list_modding_addons};
use crate::{app_runtime::AppHandle, errors::Error};
use serde::Serialize;
use std::{
  collections::HashMap,
  path::{Path, PathBuf},
  sync::{LazyLock, Mutex},
};
use tauri::Manager;
use ts_rs::TS;

#[derive(Clone, Serialize, TS)]
#[serde(
  tag = "kind",
  rename_all = "camelCase",
  rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum ModdingWorkspaceSource {
  Addon {
    addon_id: String,
    hierarchy: ModdingHierarchy,
    path: String,
  },
  Archive {
    file_path: String,
    label: String,
  },
  Local {
    addon: ModdingAddon,
    path: String,
  },
}

static LOCAL_ROOTS: LazyLock<Mutex<HashMap<String, ModdingAddon>>> =
  LazyLock::new(|| Mutex::new(HashMap::new()));

pub(super) fn resolve_read(app: &AppHandle, id: &str) -> Result<ModdingAddon, Error> {
  if id.starts_with("local:") {
    return LOCAL_ROOTS
      .lock()
      .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
      .get(id)
      .cloned()
      .ok_or_else(|| Error::InvalidInput("Reopen this local comparison source".into()));
  }
  super::modding_workspace::resolve(app, id)
}

fn asset_root(file: &Path) -> PathBuf {
  let parent = file.parent().unwrap_or(file);
  for ancestor in parent.ancestors() {
    if ancestor
      .file_name()
      .and_then(|name| name.to_str())
      .is_some_and(|name| {
        ["models", "materials", "sounds", "particles", "panorama"].contains(&name)
      })
    {
      return ancestor.parent().unwrap_or(parent).to_owned();
    }
  }
  parent.to_owned()
}

pub(super) fn source(
  path: &Path,
  addons: &[ModdingAddon],
  archive: &Path,
) -> Result<ModdingWorkspaceSource, Error> {
  let path = path.canonicalize()?;
  for addon in addons {
    for (root, hierarchy) in [
      (&addon.content_path, ModdingHierarchy::Content),
      (&addon.game_path, ModdingHierarchy::Game),
    ] {
      if let Ok(root) = Path::new(root).canonicalize()
        && let Ok(relative) = path.strip_prefix(root)
      {
        return Ok(ModdingWorkspaceSource::Addon {
          addon_id: addon.id.clone(),
          hierarchy,
          path: if path.is_file() {
            relative.to_string_lossy().replace('\\', "/")
          } else {
            String::new()
          },
        });
      }
    }
  }
  if path.is_file()
    && path
      .extension()
      .is_some_and(|ext| ext.eq_ignore_ascii_case("vpk"))
  {
    let mut path = path;
    let stem = path
      .file_stem()
      .and_then(|name| name.to_str())
      .unwrap_or("");
    if let Some((base, part)) = stem.rsplit_once('_')
      && part.len() == 3
      && part.bytes().all(|ch| ch.is_ascii_digit())
    {
      let directory = path.with_file_name(format!("{base}_dir.vpk"));
      if directory.is_file() {
        path = directory;
      }
    }
    let file_path = path.to_string_lossy().into_owned();
    super::foundry::open_archive(&path, None)?;
    return Ok(ModdingWorkspaceSource::Archive {
      label: path.file_name().unwrap().to_string_lossy().into_owned(),
      file_path,
    });
  }
  if !path.is_dir() && !path.is_file() {
    return Err(Error::InvalidInput(
      "Drop a local folder or asset file".into(),
    ));
  }
  let root = if path.is_dir() {
    path.clone()
  } else {
    asset_root(&path)
  };
  let selected = if path.is_file() {
    path
      .strip_prefix(&root)
      .map_err(|error| Error::InvalidInput(error.to_string()))?
      .to_string_lossy()
      .replace('\\', "/")
  } else {
    String::new()
  };
  let id = format!(
    "local:{}",
    super::modding_edits::fingerprint(root.to_string_lossy().as_bytes())
  );
  let addon = ModdingAddon {
    id: id.clone(),
    name: root
      .file_name()
      .unwrap_or_default()
      .to_string_lossy()
      .into_owned(),
    sdk_root: String::new(),
    content_path: root.to_string_lossy().into_owned(),
    game_path: root.to_string_lossy().into_owned(),
    archive_path: archive.to_string_lossy().into_owned(),
  };
  let mut roots = LOCAL_ROOTS
    .lock()
    .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?;
  if roots.len() >= 128 && !roots.contains_key(&id) {
    return Err(Error::InvalidInput(
      "Close and reopen DMM before opening more than 128 different local folders".into(),
    ));
  }
  roots.insert(id, addon.clone());
  Ok(ModdingWorkspaceSource::Local {
    addon,
    path: selected,
  })
}

#[tauri::command]
pub async fn open_modding_workspace_source(
  app: AppHandle,
  path: String,
) -> Result<Vec<ModdingWorkspaceSource>, Error> {
  let cache = app
    .path()
    .app_cache_dir()?
    .join("workbench-source-packages");
  let addons = list_modding_addons(app.clone()).unwrap_or_default();
  let archive = super::state::game_path()?.join("game/citadel/pak01_dir.vpk");
  tauri::async_runtime::spawn_blocking(move || {
    let path = Path::new(&path);
    if super::modding_package::supported(path) {
      super::modding_package::open(path, &cache, &archive)
    } else {
      source(path, &addons, &archive).map(|source| vec![source])
    }
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn local_files_preserve_virtual_paths_and_are_not_discovered_as_addons() {
    let dir = tempfile::tempdir().unwrap();
    let model = dir.path().join("models/hero/test.vmdl_c");
    std::fs::create_dir_all(model.parent().unwrap()).unwrap();
    std::fs::write(&model, b"model").unwrap();
    let ModdingWorkspaceSource::Local { addon, path } =
      source(&model, &[], Path::new("base.vpk")).unwrap()
    else {
      panic!("expected local source")
    };
    assert_eq!(path, "models/hero/test.vmdl_c");
    assert_eq!(Path::new(&addon.game_path), dir.path());
    assert!(addon.id.starts_with("local:"));
    assert_eq!(addon.content_path, addon.game_path);
  }
  #[test]
  fn dropped_addon_files_select_the_existing_project_without_copying() {
    let dir = tempfile::tempdir().unwrap();
    let content = dir.path().join("content");
    std::fs::create_dir(&content).unwrap();
    let file = content.join("source.vmdl");
    std::fs::write(&file, b"source").unwrap();
    let addon = ModdingAddon {
      id: "existing".into(),
      name: "addon".into(),
      sdk_root: String::new(),
      content_path: content.to_string_lossy().into_owned(),
      game_path: String::new(),
      archive_path: String::new(),
    };
    let ModdingWorkspaceSource::Addon {
      addon_id,
      hierarchy,
      path,
    } = source(&file, &[addon], Path::new("base.vpk")).unwrap()
    else {
      panic!("expected addon")
    };
    assert_eq!(addon_id, "existing");
    assert!(matches!(hierarchy, ModdingHierarchy::Content));
    assert_eq!(path, "source.vmdl");
  }
}
