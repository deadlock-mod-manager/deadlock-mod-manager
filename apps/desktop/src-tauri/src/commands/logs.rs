use std::sync::Arc;
use std::sync::atomic::Ordering;

use crate::errors::Error;
use crate::logs::{CrashDumpInfo, LogInfo, crash_dumps, log_manager};
use tauri::{AppHandle, Emitter};

use super::state::{CONSOLE_LOG_WATCHER_RUNNING, MANAGER};

#[tauri::command]
pub async fn get_log_info(app_handle: AppHandle) -> Result<LogInfo, Error> {
  log_manager::get_log_info(&app_handle).await
}

#[tauri::command]
pub async fn open_logs_folder(app_handle: AppHandle) -> Result<(), Error> {
  log_manager::open_logs_folder(&app_handle)
}

#[tauri::command]
pub async fn open_log_file(app_handle: AppHandle) -> Result<(), Error> {
  log_manager::open_log_file(&app_handle)
}

#[tauri::command]
pub async fn get_logs_for_ai(
  app_handle: AppHandle,
  max_chars: usize,
  log_source: String,
) -> Result<String, Error> {
  log_manager::get_logs_for_ai(&app_handle, max_chars, &log_source).await
}

#[tauri::command]
pub async fn get_crash_dumps_info() -> Result<CrashDumpInfo, Error> {
  crash_dumps::get_crash_dumps_info()
}

#[tauri::command]
pub async fn open_crash_dumps_folder() -> Result<(), Error> {
  crash_dumps::open_crash_dumps_folder()
}

#[tauri::command]
pub async fn parse_crash_dump(file_path: String) -> Result<String, Error> {
  crash_dumps::parse_crash_dump(&file_path)
}

#[tauri::command]
pub async fn parse_latest_crash_dump() -> Result<String, Error> {
  crash_dumps::parse_latest_crash_dump()
}

#[tauri::command]
pub async fn open_latest_crash_dump_parsed() -> Result<(), Error> {
  crash_dumps::open_latest_crash_dump_parsed()
}

#[tauri::command]
pub async fn watch_console_log(app_handle: AppHandle) -> Result<(), Error> {
  log::info!("Starting console log watcher for connect code");

  let game_path = {
    let mod_manager = MANAGER.lock().unwrap();
    mod_manager
      .get_steam_manager()
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?
      .clone()
  };

  if CONSOLE_LOG_WATCHER_RUNNING
    .compare_exchange(false, true, Ordering::AcqRel, Ordering::Relaxed)
    .is_err()
  {
    log::warn!("Console log watcher is already running");
    return Ok(());
  }

  let running_flag = Arc::clone(&CONSOLE_LOG_WATCHER_RUNNING);

  tokio::task::spawn(async move {
    use crate::mod_manager::console_log_watcher;

    let result = console_log_watcher::watch_for_connect_code(&game_path, running_flag).await;

    CONSOLE_LOG_WATCHER_RUNNING.store(false, Ordering::Relaxed);

    if let Some(code) = result {
      log::info!("Emitting map-connect-code event: {code}");
      let _ = app_handle.emit("map-connect-code", code);
    }
  });

  Ok(())
}

#[tauri::command]
pub async fn stop_watching_console_log() -> Result<(), Error> {
  log::info!("Stopping console log watcher");
  CONSOLE_LOG_WATCHER_RUNNING.store(false, Ordering::Relaxed);
  Ok(())
}
