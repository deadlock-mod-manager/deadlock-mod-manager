use crate::app_runtime::AppHandle;
use crate::errors::Error;
use crate::forge_bridge;

#[tauri::command]
pub async fn start_forge_bridge(app_handle: AppHandle) -> Result<u16, Error> {
  forge_bridge::start(app_handle).await
}

#[tauri::command]
pub async fn stop_forge_bridge() -> Result<(), Error> {
  forge_bridge::stop();
  Ok(())
}

/// The frontend calls this once the user has accepted or declined, which frees
/// the slot for the next request and removes the staged payload.
#[tauri::command]
pub async fn finish_forge_install(path: String) -> Result<(), Error> {
  let staged = crate::forge_bridge::staged_path(&path)?;
  if staged.exists() {
    tokio::fs::remove_file(&staged).await?;
  }
  forge_bridge::release_in_flight();
  Ok(())
}
