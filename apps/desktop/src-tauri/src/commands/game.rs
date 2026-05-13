use std::path::PathBuf;

use crate::errors::Error;

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
  vanilla: bool,
  additional_args: String,
  profile_folder: Option<String>,
) -> Result<(), Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  log::info!(
    "Starting game with args: {:?} (vanilla: {:?}, profile: {:?})",
    additional_args,
    vanilla,
    profile_folder
  );
  mod_manager.run_game(vanilla, additional_args, profile_folder)
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
