use std::path::PathBuf;

use crate::app_runtime::AppHandle;
use crate::errors::Error;
use tauri::Emitter;

use super::gameinfo::reset_to_vanilla_internal;
use super::state::MANAGER;

#[tauri::command]
pub async fn find_game_path() -> Result<String, Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  match (mod_manager.find_steam(), mod_manager.find_game()) {
    (Ok(_), Ok(game_path)) => {
      log::info!("Found game at: {game_path:?}");
      Ok(game_path.to_string_lossy().to_string())
    }
    (Err(e), _) => {
      log::error!("Failed to find Steam: {e}");
      Err(e)
    }
    (_, Err(e)) => {
      log::error!("Failed to find game: {e}");
      Err(e)
    }
  }
}

#[tauri::command]
pub async fn set_game_path(path: String) -> Result<String, Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  let path_buf = PathBuf::from(&path);
  let game_path = mod_manager.set_game_path(path_buf)?;
  log::info!("Game path manually set to: {game_path:?}");
  Ok(game_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn start_game(
  app_handle: AppHandle,
  vanilla: bool,
  additional_args: String,
  profile_folder: Option<String>,
) -> Result<(), Error> {
  log::info!(
    "Starting game with args: {:?} (vanilla: {:?}, profile: {:?})",
    additional_args,
    vanilla,
    profile_folder
  );

  let first_result = {
    let mut mod_manager = MANAGER.lock().unwrap();
    mod_manager.run_game(vanilla, additional_args.clone(), profile_folder.clone())
  };

  if let Err(Error::GameConfigParse(ref msg)) = first_result {
    log::warn!("Game config parse failed: {msg}, attempting auto-reset to vanilla");

    reset_to_vanilla_internal().await?;

    let mut mod_manager = MANAGER.lock().unwrap();
    mod_manager.run_game(vanilla, additional_args, profile_folder)?;

    app_handle.emit("gameinfo-auto-reset", ()).ok();
    log::info!("Auto-recovery succeeded, game launched after gameinfo reset");

    return Ok(());
  }

  first_result
}

#[tauri::command]
pub async fn stop_game() -> Result<(), Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager.stop_game()
}

#[tauri::command]
pub async fn is_game_running() -> Result<bool, Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager.is_game_running()
}
