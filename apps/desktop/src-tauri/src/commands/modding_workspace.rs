use std::collections::BTreeSet;
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use ts_rs::TS;

use super::modding_tools::get_modding_tools_config;
use crate::app_runtime::AppHandle;
use crate::errors::Error;

#[derive(Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingAddon {
  pub id: String,
  pub name: String,
  pub sdk_root: String,
  pub content_path: String,
  pub game_path: String,
  pub archive_path: String,
}

#[derive(Clone, Copy, Deserialize, Serialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export, rename_all = "lowercase")]
pub enum ModdingHierarchy {
  Content,
  Game,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingFile {
  pub path: String,
  pub name: String,
  pub directory: bool,
  pub size: u64,
}

pub(super) fn relative(path: &str, allow_empty: bool) -> Result<&Path, Error> {
  if (!allow_empty && path.is_empty())
    || path.contains(['\\', ':', ',', '\0'])
    || !Path::new(path)
      .components()
      .all(|part| matches!(part, Component::Normal(_)))
  {
    return Err(Error::InvalidInput("Invalid addon-relative path".into()));
  }
  Ok(Path::new(path))
}

pub(super) fn contained(root: &Path, path: &str) -> Result<PathBuf, Error> {
  let target = root.join(relative(path, true)?);
  let canonical_root = root.canonicalize()?;
  let mut ancestor = target.as_path();
  while !ancestor.exists() {
    ancestor = ancestor
      .parent()
      .ok_or_else(|| Error::InvalidInput("Missing addon root".into()))?;
  }
  if !ancestor.canonicalize()?.starts_with(canonical_root) {
    return Err(Error::InvalidInput(
      "The path points outside this addon".into(),
    ));
  }
  Ok(target)
}

impl ModdingAddon {
  pub(super) fn root(&self, hierarchy: ModdingHierarchy) -> PathBuf {
    PathBuf::from(match hierarchy {
      ModdingHierarchy::Content => &self.content_path,
      ModdingHierarchy::Game => &self.game_path,
    })
  }
}

pub(super) fn discover(roots: &[PathBuf], archive: &Path) -> Result<Vec<ModdingAddon>, Error> {
  let mut addons = Vec::new();
  let mut seen = BTreeSet::new();
  for sdk in roots {
    if !sdk.is_dir() {
      continue;
    }
    let sdk = sdk.canonicalize()?;
    let mut names = BTreeSet::new();
    for hierarchy in ["content", "game"] {
      let parent = sdk.join(hierarchy).join("citadel_addons");
      if !parent.is_dir() {
        continue;
      }
      for entry in std::fs::read_dir(parent)? {
        let entry = entry?;
        if entry.path().is_dir() {
          let name = entry.file_name().to_string_lossy().into_owned();
          if !name.starts_with('.') && !name.starts_with(".tmp") {
            names.insert(name);
          }
        }
      }
    }
    for name in names {
      let content = sdk.join("content/citadel_addons").join(&name);
      let game = sdk.join("game/citadel_addons").join(&name);
      let folder = if content.exists() {
        content.canonicalize()?
      } else {
        game.canonicalize()?
      };
      let canonical_name = folder
        .file_name()
        .ok_or_else(|| Error::InvalidInput("Missing addon name".into()))?;
      let canonical_sdk = folder
        .parent()
        .and_then(Path::parent)
        .and_then(Path::parent)
        .ok_or_else(|| Error::InvalidInput("Invalid addon installation layout".into()))?;
      let identity = canonical_sdk.join("citadel_addons").join(canonical_name);
      if !seen.insert(identity.clone()) {
        continue;
      }
      let id = format!(
        "{:x}",
        Sha256::digest(identity.to_string_lossy().as_bytes())
      );
      addons.push(ModdingAddon {
        id,
        name,
        sdk_root: sdk.to_string_lossy().into_owned(),
        content_path: content.to_string_lossy().into_owned(),
        game_path: game.to_string_lossy().into_owned(),
        archive_path: archive.to_string_lossy().into_owned(),
      });
    }
  }
  addons.sort_by(|a, b| a.name.cmp(&b.name).then(a.sdk_root.cmp(&b.sdk_root)));
  Ok(addons)
}

#[tauri::command]
pub fn list_modding_addons(app: AppHandle) -> Result<Vec<ModdingAddon>, Error> {
  let config = get_modding_tools_config(app)?;
  discover(
    &[
      PathBuf::from(config.csdk),
      PathBuf::from(config.prepared_sdk),
    ],
    &super::state::game_path()?.join("game/citadel/pak01_dir.vpk"),
  )
}

pub(super) fn resolve(app: &AppHandle, id: &str) -> Result<ModdingAddon, Error> {
  list_modding_addons(app.clone())?
    .into_iter()
    .find(|addon| addon.id == id)
    .ok_or_else(|| {
      Error::InvalidInput("This addon is no longer available; refresh the addon list".into())
    })
}

#[tauri::command]
pub async fn list_modding_files(
  app: AppHandle,
  addon_id: String,
  hierarchy: ModdingHierarchy,
  directory: String,
) -> Result<Vec<ModdingFile>, Error> {
  let root = super::modding_local::resolve_read(&app, &addon_id)?.root(hierarchy);
  relative(&directory, true)?;
  tauri::async_runtime::spawn_blocking(move || {
    if !root.exists() {
      return Ok(Vec::new());
    }
    let parent = contained(&root, &directory)?;
    if !parent.exists() {
      return Ok(Vec::new());
    }
    let mut files = Vec::new();
    for entry in std::fs::read_dir(parent)? {
      let entry = entry?;
      let kind = entry.file_type()?;
      if kind.is_symlink() || entry.file_name().to_string_lossy().starts_with(".tmp") {
        continue;
      }
      let metadata = entry.metadata()?;
      let name = entry.file_name().to_string_lossy().into_owned();
      files.push(ModdingFile {
        path: if directory.is_empty() {
          name.clone()
        } else {
          format!("{directory}/{name}")
        },
        name,
        directory: metadata.is_dir(),
        size: metadata.len(),
      });
    }
    files.sort_by(|a, b| {
      b.directory
        .cmp(&a.directory)
        .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(files)
  })
  .await
  .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?
}

pub(super) fn mount(addon: &ModdingAddon, sdk: &Path) -> Result<String, Error> {
  let alias = if Path::new(&addon.sdk_root).canonicalize()? == sdk.canonicalize()?
    && addon
      .name
      .bytes()
      .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_')
  {
    addon.name.clone()
  } else {
    format!("dmm_link_{}", &addon.id[..16])
  };
  for hierarchy in [ModdingHierarchy::Content, ModdingHierarchy::Game] {
    let original = addon.root(hierarchy);
    std::fs::create_dir_all(&original)?;
    let tree = match hierarchy {
      ModdingHierarchy::Content => "content",
      ModdingHierarchy::Game => "game",
    };
    let mounted = sdk.join(tree).join("citadel_addons").join(&alias);
    if mounted.exists() {
      if mounted.canonicalize()? != original.canonicalize()? {
        return Err(Error::InvalidInput(
          "Another addon already occupies the SDK mount path".into(),
        ));
      }
    } else {
      std::fs::create_dir_all(
        mounted
          .parent()
          .ok_or_else(|| Error::InvalidInput("Missing addon mount parent".into()))?,
      )?;
      crate::mod_manager::filesystem_helper::FileSystemHelper::new()
        .create_directory_symlink(&original.canonicalize()?, &mounted)?;
    }
  }
  let support = tempfile::tempdir()?;
  std::fs::create_dir(support.path().join("tools"))?;
  for (source, destination) in [
    (
      "game/citadel_addons/dmm_workbench/toolscenelightrigs.vdata_c",
      "toolscenelightrigs.vdata_c",
    ),
    (
      "game/citadel/tools/modeldoc_editor_presets.txt",
      "tools/modeldoc_editor_presets.txt",
    ),
  ] {
    std::fs::copy(sdk.join(source), support.path().join(destination))?;
  }
  std::fs::write(
    support.path().join("addoninfo.txt"),
    "\"AddonInfo\" { \"IsTemplate\" \"0\" \"IsPlayable\" \"0\" }\n",
  )?;
  super::modding_import::publish_missing(support.path(), Path::new(&addon.game_path))?;
  Ok(alias)
}

#[tauri::command]
pub async fn launch_modding_addon(app: AppHandle, addon_id: String) -> Result<(), Error> {
  let addon = resolve(&app, &addon_id)?;
  super::modding_tools::launch_tool(
    app,
    super::modding_tools::ModdingTool::AssetBrowser,
    Some(addon),
  )
  .await
}

#[tauri::command]
pub async fn find_modding_clip_model(
  app: AppHandle,
  addon_id: Option<String>,
  clip: String,
  archive: Option<bool>,
  archive_path: Option<String>,
) -> Result<Option<String>, Error> {
  relative(&clip, false)?;
  let addon = addon_id
    .map(|id| super::modding_local::resolve_read(&app, &id))
    .transpose()?;
  let archive_path =
    archive_path.or_else(|| addon.as_ref().map(|addon| addon.archive_path.clone()));
  tauri::async_runtime::spawn_blocking(move || {
    if archive.unwrap_or(false) {
      let base =
        super::foundry::open_archive(&super::modding_archive::archive_path(archive_path)?, None)?;
      let mut directory = Path::new(&clip).parent();
      while let Some(parent) = directory {
        let prefix = parent.to_string_lossy().replace('\\', "/");
        let mut models: Vec<_> = base
          .entries_with_sizes()
          .filter(|(path, _)| {
            path.ends_with(".vmdl_c") && Path::new(path).parent() == Some(Path::new(&prefix))
          })
          .map(|(path, _)| path.to_owned())
          .collect();
        models.sort();
        if let Some(model) = models.into_iter().next() {
          return Ok(Some(model));
        }
        directory = parent.parent();
      }
      return Ok(None);
    }
    let addon =
      addon.ok_or_else(|| Error::InvalidInput("Choose an addon to preview this clip".into()))?;
    let root = Path::new(&addon.game_path);
    let mut directory = Path::new(&clip).parent();
    while let Some(parent) = directory {
      let path = parent.to_string_lossy().replace('\\', "/");
      let folder = contained(root, &path)?;
      if folder.is_dir() {
        let mut models = Vec::new();
        for entry in std::fs::read_dir(folder)? {
          let entry = entry?;
          if entry.file_type()?.is_file()
            && entry.file_name().to_string_lossy().ends_with(".vmdl_c")
          {
            models.push(
              parent
                .join(entry.file_name())
                .to_string_lossy()
                .replace('\\', "/"),
            );
          }
        }
        models.sort();
        if let Some(model) = models.into_iter().next() {
          return Ok(Some(model));
        }
      }
      directory = parent.parent();
    }
    Ok(None)
  })
  .await
  .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn discovers_both_hierarchies_and_preserves_original_paths() {
    let temp = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(temp.path().join("content/citadel_addons/original")).unwrap();
    std::fs::create_dir_all(temp.path().join("game/citadel_addons/compiled_only")).unwrap();
    let addons = discover(
      &[temp.path().into(), temp.path().into()],
      Path::new("pak.vpk"),
    )
    .unwrap();
    assert_eq!(addons.len(), 2);
    let compiled_id = addons
      .iter()
      .find(|addon| addon.name == "compiled_only")
      .unwrap()
      .id
      .clone();
    std::fs::create_dir_all(temp.path().join("content/citadel_addons/compiled_only")).unwrap();
    let after_import = discover(&[temp.path().into()], Path::new("pak.vpk")).unwrap();
    assert_eq!(
      compiled_id,
      after_import
        .iter()
        .find(|addon| addon.name == "compiled_only")
        .unwrap()
        .id
    );

    assert!(addons.iter().any(|addon| {
      addon
        .content_path
        .ends_with("content/citadel_addons/original")
    }));
  }
  #[test]
  fn paths_cannot_traverse_or_follow_an_external_link() {
    for path in [
      "../escape",
      "/absolute",
      "models/../escape",
      "C:/escape",
      "models\\file",
      "a,b",
    ] {
      assert!(relative(path, false).is_err());
    }
    let root = tempfile::tempdir().unwrap();
    assert!(contained(root.path(), "models/new/file").is_ok());
    #[cfg(unix)]
    {
      let outside = tempfile::tempdir().unwrap();
      std::os::unix::fs::symlink(outside.path(), root.path().join("escape")).unwrap();
      assert!(contained(root.path(), "escape/new").is_err());
    }
  }
}
