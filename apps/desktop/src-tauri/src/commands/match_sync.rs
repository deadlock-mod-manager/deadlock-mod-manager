use crate::app_runtime::AppHandle;
use crate::errors::Error;
use crate::game_presence;
use crate::match_sync::{self, MatchSyncStatusDto};

#[tauri::command]
pub async fn get_match_sync_status(app_handle: AppHandle) -> Result<MatchSyncStatusDto, Error> {
  Ok(match_sync::status(&app_handle)?)
}

#[tauri::command]
pub async fn set_match_sync_consent(app_handle: AppHandle, accepted: bool) -> Result<(), Error> {
  match_sync::set_consent(&app_handle, accepted)?;
  Ok(())
}

#[tauri::command]
pub async fn set_match_sync_enabled(app_handle: AppHandle, enabled: bool) -> Result<(), Error> {
  match_sync::set_enabled(&app_handle, enabled)?;
  // Enabling starts (and disabling stops) the game-exit detect-only watcher.
  game_presence::sync_monitoring_watcher(&app_handle);
  Ok(())
}

#[tauri::command]
pub async fn start_full_match_sync(app_handle: AppHandle) -> Result<(), Error> {
  match_sync::spawn_full_sync(app_handle)?;
  Ok(())
}

#[tauri::command]
pub async fn cancel_full_match_sync() -> Result<(), Error> {
  match_sync::cancel_full_sync();
  Ok(())
}

// Re-applies the persisted opt-in on startup: starts the background worker and the
// game-exit watcher iff the user previously opted in. A no-op otherwise.
#[tauri::command]
pub async fn resume_match_sync_monitoring(app_handle: AppHandle) -> Result<(), Error> {
  // Startup-only cleanup of persisted state for accounts removed from Steam entirely.
  match_sync::prune_forgotten_accounts(&app_handle);
  match_sync::start_background_worker(app_handle.clone());
  game_presence::sync_monitoring_watcher(&app_handle);
  Ok(())
}
