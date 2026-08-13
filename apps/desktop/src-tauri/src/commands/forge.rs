use crate::app_runtime::AppHandle;
use crate::errors::Error;
use crate::forge_bridge;
use std::path::PathBuf;

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
pub async fn place_forge_payload(path: String, destination: String) -> Result<(), Error> {
  let staged = forge_bridge::peek_staged(&path)?;
  let destination = PathBuf::from(destination);

  if let Some(parent) = destination.parent() {
    tokio::fs::create_dir_all(parent).await?;
  }

  if tokio::fs::rename(&staged, &destination).await.is_err() {
    tokio::fs::copy(&staged, &destination).await?;
  }

  Ok(())
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
