use crate::app_runtime::AppHandle;
use crate::errors::Error;
use crate::forge_bridge;
use crate::staged_files::{self, Stager};

#[tauri::command]
pub async fn start_forge_bridge(app_handle: AppHandle) -> Result<u16, Error> {
  forge_bridge::start(app_handle).await
}

#[tauri::command]
pub async fn stop_forge_bridge() -> Result<(), Error> {
  forge_bridge::stop().await;
  Ok(())
}

#[tauri::command]
pub async fn finish_forge_install(path: String) -> Result<(), Error> {
  let staged = staged_files::take(Stager::Forge, &path)?;

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
