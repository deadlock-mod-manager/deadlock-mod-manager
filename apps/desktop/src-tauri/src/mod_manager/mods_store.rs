//! Where downloaded and imported mods are kept. The default is `<app data>/mods`.
//! A location the user picks is saved in the state store, not the frontend's
//! persisted state, so Rust can resolve it before the frontend has hydrated.

use std::fs;
use std::path::{Path, PathBuf};

use tauri_plugin_fs::FsExt;
use tauri_plugin_store::StoreExt;

use crate::app_runtime::AppHandle;
use crate::errors::Error;
use crate::mod_manager::filesystem_helper::FileSystemHelper;

const LOCATION_KEY: &str = "mods_store_location";

/// Created inside the folder the user picks, so clearing the store never
/// deletes files of their own.
pub const CUSTOM_STORE_FOLDER: &str = "DeadlockModManager";

pub fn default_dir(app_handle: &AppHandle) -> Result<PathBuf, Error> {
  Ok(crate::runtime_environment::app_local_data_dir(app_handle)?.join("mods"))
}

pub fn custom_dir(app_handle: &AppHandle) -> Option<PathBuf> {
  let store = app_handle
    .store(crate::runtime_environment::state_store_path())
    .ok()?;
  store.get(LOCATION_KEY)?.as_str().map(PathBuf::from)
}

pub fn dir(app_handle: &AppHandle) -> Result<PathBuf, Error> {
  match custom_dir(app_handle) {
    Some(path) => Ok(path),
    None => default_dir(app_handle),
  }
}

pub fn save_custom_dir(app_handle: &AppHandle, path: Option<&Path>) -> Result<(), Error> {
  let store = app_handle
    .store(crate::runtime_environment::state_store_path())
    .map_err(|error| Error::InvalidInput(format!("Failed to access store: {error}")))?;
  match path {
    Some(path) => store.set(LOCATION_KEY, serde_json::json!(path.to_string_lossy())),
    None => {
      store.delete(LOCATION_KEY);
    }
  }
  store
    .save()
    .map_err(|error| Error::InvalidInput(format!("Failed to save store: {error}")))
}

/// Local imports are written by the frontend, whose file system scope only
/// covers app data unless a custom store is added to it.
pub fn allow_frontend_access(app_handle: &AppHandle, store_dir: &Path) {
  if let Err(error) = app_handle.fs_scope().allow_directory(store_dir, true) {
    log::warn!("Could not allow frontend access to {store_dir:?}: {error}");
  }
}

/// The store directory to use for a folder the user picked.
pub fn target_for(chosen: &Path) -> Result<PathBuf, Error> {
  if !chosen.is_absolute() || !chosen.is_dir() {
    return Err(Error::InvalidInput(format!(
      "{} is not an existing folder",
      chosen.display()
    )));
  }
  if chosen
    .file_name()
    .is_some_and(|name| name == CUSTOM_STORE_FOLDER)
  {
    return Ok(chosen.to_path_buf());
  }
  Ok(chosen.join(CUSTOM_STORE_FOLDER))
}

/// Moves every stored mod from `from` into `to`. Local imports exist only in
/// the store, so leaving them behind would lose them. A failed move is undone
/// as far as possible. `to` may not be inside `from` or contain it, nor be
/// inside a `forbidden` directory such as the game's addons.
pub fn relocate(from: &Path, to: &Path, forbidden: &[PathBuf]) -> Result<(), Error> {
  let created = !to.exists();
  fs::create_dir_all(to).map_err(|error| Error::io_context("create", to, error))?;
  let result = check_destination(from, to, forbidden);
  if result.is_err() && created {
    let _ = fs::remove_dir(to);
  }
  if !result? {
    return Ok(());
  }

  let filesystem = FileSystemHelper::new();
  if let Err(error) = filesystem.move_directory_contents(from, to) {
    if let Err(undo_error) = filesystem.move_directory_contents(to, from) {
      log::error!("Could not move mods back to {from:?}: {undo_error}");
    }
    return Err(error);
  }
  if from.exists()
    && let Err(error) = fs::remove_dir(from)
  {
    log::warn!("Moved the mod store but could not remove {from:?}: {error}");
  }
  Ok(())
}

/// Whether anything has to move: false when `to` already is `from`.
fn check_destination(from: &Path, to: &Path, forbidden: &[PathBuf]) -> Result<bool, Error> {
  let to = to
    .canonicalize()
    .map_err(|error| Error::io_context("resolve", to, error))?;
  if let Ok(from) = from.canonicalize() {
    if to == from {
      return Ok(false);
    }
    if to.starts_with(&from) || from.starts_with(&to) {
      return Err(Error::InvalidInput(
        "The new download cache location can't be inside the current one, or contain it"
          .to_string(),
      ));
    }
  }
  if forbidden
    .iter()
    .filter_map(|path| path.canonicalize().ok())
    .any(|path| to.starts_with(path))
  {
    return Err(Error::InvalidInput(
      "The download cache can't be inside the game's addons folder".to_string(),
    ));
  }

  let probe = to.join(".dmm-write-test");
  fs::write(&probe, b"").map_err(|error| Error::io_context("write to", &to, error))?;
  let _ = fs::remove_file(&probe);
  Ok(true)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn picked_folder_gets_its_own_store_folder() {
    let root = tempfile::tempdir().unwrap();

    assert_eq!(
      target_for(root.path()).unwrap(),
      root.path().join(CUSTOM_STORE_FOLDER)
    );
    let existing_store = root.path().join(CUSTOM_STORE_FOLDER);
    fs::create_dir(&existing_store).unwrap();
    assert_eq!(target_for(&existing_store).unwrap(), existing_store);
  }

  #[test]
  fn picked_path_must_be_an_existing_absolute_folder() {
    let root = tempfile::tempdir().unwrap();
    let file = root.path().join("file.txt");
    fs::write(&file, b"").unwrap();

    for path in [Path::new("relative"), &root.path().join("missing"), &file] {
      assert!(
        matches!(target_for(path), Err(Error::InvalidInput(_))),
        "accepted {path:?}"
      );
    }
  }

  #[test]
  fn relocate_moves_downloads_and_local_imports() {
    let root = tempfile::tempdir().unwrap();
    let from = root.path().join("app-data/mods");
    let to = root.path().join("other-drive").join(CUSTOM_STORE_FOLDER);
    fs::create_dir_all(from.join("gb-1/files")).unwrap();
    fs::create_dir_all(from.join("local-abc/files")).unwrap();
    fs::write(from.join("gb-1/files/mod.vpk"), b"remote").unwrap();
    fs::write(from.join("local-abc/files/mine.vpk"), b"local").unwrap();
    fs::create_dir_all(to.parent().unwrap()).unwrap();

    relocate(&from, &to, &[]).unwrap();

    assert_eq!(fs::read(to.join("gb-1/files/mod.vpk")).unwrap(), b"remote");
    assert_eq!(
      fs::read(to.join("local-abc/files/mine.vpk")).unwrap(),
      b"local"
    );
    assert!(!from.exists());
    assert!(!to.join(".dmm-write-test").exists());
  }

  #[test]
  fn relocate_refuses_nested_or_addons_destinations() {
    let root = tempfile::tempdir().unwrap();
    let from = root.path().join("mods");
    let addons = root.path().join("game/citadel/addons");
    fs::create_dir_all(from.join("gb-1")).unwrap();
    fs::create_dir_all(&addons).unwrap();

    for to in [
      from.join("gb-1").join(CUSTOM_STORE_FOLDER),
      addons.join(CUSTOM_STORE_FOLDER),
    ] {
      let error = relocate(&from, &to, std::slice::from_ref(&addons)).unwrap_err();
      assert!(matches!(error, Error::InvalidInput(_)), "{error}");
      assert!(!to.exists(), "left {to:?} behind");
    }
    assert!(from.join("gb-1").is_dir());
  }

  #[test]
  fn relocate_to_the_current_store_changes_nothing() {
    let root = tempfile::tempdir().unwrap();
    let store = root.path().join(CUSTOM_STORE_FOLDER);
    fs::create_dir_all(store.join("gb-1")).unwrap();

    relocate(&store, &store, &[]).unwrap();

    assert!(store.join("gb-1").is_dir());
  }
}
