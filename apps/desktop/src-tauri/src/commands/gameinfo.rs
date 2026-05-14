use crate::errors::Error;

use super::state::{MANAGER, get_api_url};

pub async fn reset_to_vanilla_internal() -> Result<(), Error> {
  let api_url = get_api_url();

  let game_path = {
    let mod_manager = MANAGER.lock().unwrap();
    mod_manager
      .get_steam_manager()
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?
      .clone()
  };

  let vanilla_content = {
    let url = format!("{api_url}/artifacts/deadlock/gameinfo.gi");
    log::info!("Downloading vanilla gameinfo.gi from: {url}");

    let client = crate::proxy::build_default_http_client()?;
    let response = client
      .get(&url)
      .send()
      .await
      .map_err(|e| Error::Network(format!("Failed to download vanilla gameinfo.gi: {e}")))?;

    if !response.status().is_success() {
      return Err(Error::Network(format!(
        "Server returned error status: {}",
        response.status()
      )));
    }

    response
      .text()
      .await
      .map_err(|e| Error::Network(format!("Failed to read response: {e}")))?
  };

  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager
    .get_config_manager_mut()
    .apply_vanilla_gameinfo(&game_path, vanilla_content)?;

  log::info!("Successfully reset to vanilla state using API");
  Ok(())
}

#[tauri::command]
pub async fn backup_gameinfo() -> Result<(), Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  let game_path = match mod_manager.get_steam_manager().get_game_path() {
    Some(path) => path.clone(),
    None => return Err(Error::GamePathNotSet),
  };
  mod_manager
    .get_config_manager_mut()
    .backup_gameinfo(&game_path)
}

#[tauri::command]
pub async fn restore_gameinfo_backup() -> Result<(), Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  let game_path = match mod_manager.get_steam_manager().get_game_path() {
    Some(path) => path.clone(),
    None => return Err(Error::GamePathNotSet),
  };
  mod_manager
    .get_config_manager_mut()
    .restore_gameinfo_backup(&game_path)
}

#[tauri::command]
pub async fn reset_to_vanilla() -> Result<(), Error> {
  reset_to_vanilla_internal().await
}

#[tauri::command]
pub async fn validate_gameinfo_patch(expected_vanilla: bool) -> Result<(), Error> {
  let mod_manager = MANAGER.lock().unwrap();
  let game_path = match mod_manager.get_steam_manager().get_game_path() {
    Some(path) => path.clone(),
    None => return Err(Error::GamePathNotSet),
  };
  mod_manager
    .get_config_manager()
    .validate_gameinfo_patch(&game_path, expected_vanilla)
}

#[tauri::command]
pub async fn get_gameinfo_status()
-> Result<crate::mod_manager::game_config_manager::GameInfoStatus, Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  let game_path = match mod_manager.get_steam_manager().get_game_path() {
    Some(path) => path.clone(),
    None => return Err(Error::GamePathNotSet),
  };
  mod_manager
    .get_config_manager_mut()
    .get_gameinfo_status(&game_path)
}

#[tauri::command]
pub async fn open_gameinfo_editor() -> Result<(), Error> {
  let mod_manager = MANAGER.lock().unwrap();
  let game_path = match mod_manager.get_steam_manager().get_game_path() {
    Some(path) => path.clone(),
    None => return Err(Error::GamePathNotSet),
  };
  mod_manager
    .get_config_manager()
    .open_gameinfo_with_editor(&game_path)
}
