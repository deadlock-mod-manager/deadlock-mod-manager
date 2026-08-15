use crate::app_runtime::AppHandle;
use crate::errors::Error;
use crate::forge_bridge;
use std::path::{Component, Path, PathBuf};
use tauri::Manager;

#[tauri::command]
pub async fn start_forge_bridge(app_handle: AppHandle) -> Result<u16, Error> {
  forge_bridge::start(app_handle).await
}

#[tauri::command]
pub async fn stop_forge_bridge() -> Result<(), Error> {
  forge_bridge::stop().await;
  Ok(())
}

/// Kept out of the renderer: bytes cross the IPC boundary as a JSON number
/// array, so a large sound build would cost gigabytes there.
#[tauri::command]
pub async fn place_forge_payload(
  app_handle: AppHandle,
  path: String,
  destination: String,
) -> Result<(), Error> {
  let staged = forge_bridge::peek_staged(&path)?;
  let mods_root = app_handle
    .path()
    .app_local_data_dir()
    .map_err(Error::Tauri)?
    .join("mods");
  let destination = contained_destination(&mods_root, &destination)?;

  if let Some(parent) = destination.parent() {
    tokio::fs::create_dir_all(parent).await?;
  }

  if tokio::fs::rename(&staged, &destination).await.is_err() {
    tokio::fs::copy(&staged, &destination).await?;
  }

  Ok(())
}

/// Checked rather than trusted, since it comes from the renderer. Traversal is
/// refused outright rather than normalised away.
fn contained_destination(mods_root: &Path, destination: &str) -> Result<PathBuf, Error> {
  let destination = PathBuf::from(destination);

  let escapes = destination
    .components()
    .any(|component| matches!(component, Component::ParentDir));

  if escapes || !destination.starts_with(mods_root) {
    return Err(Error::UnauthorizedPath(destination.display().to_string()));
  }

  Ok(destination)
}

#[tauri::command]
pub async fn finish_forge_install(path: String) -> Result<(), Error> {
  let staged = forge_bridge::staged_path(&path)?;

  // Freed before the delete: a file still held open would otherwise leave the
  // bridge refusing every later install, with nothing left to retry.
  forge_bridge::release_in_flight();

  if let Err(error) = tokio::fs::remove_file(&staged).await
    && error.kind() != std::io::ErrorKind::NotFound
  {
    log::warn!(
      "[ForgeBridge] Could not remove staged payload {}: {error}",
      staged.display()
    );
  }

  Ok(())
}

#[cfg(test)]
mod tests {
  use super::contained_destination;
  use std::path::{Path, PathBuf};

  #[test]
  fn accepts_a_path_inside_the_mods_folder() {
    let root = Path::new("/home/u/.local/share/app/mods");
    let inside = "/home/u/.local/share/app/mods/local-1/files/mod.vpk";
    assert_eq!(
      contained_destination(root, inside).expect("should be allowed"),
      PathBuf::from(inside)
    );
  }

  #[test]
  fn refuses_anything_outside_the_mods_folder() {
    let root = Path::new("/home/u/.local/share/app/mods");
    for outside in [
      "/home/u/.bashrc",
      "/home/u/.local/share/app/mods/../../../.bashrc",
      "/home/u/.local/share/app/modsevil/mod.vpk",
      "relative/mod.vpk",
    ] {
      assert!(
        contained_destination(root, outside).is_err(),
        "{outside} should be refused"
      );
    }
  }
}
