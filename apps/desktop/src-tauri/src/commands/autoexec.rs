use crate::errors::Error;
use crate::mod_manager::crosshair_settings::CrosshairConfig;
use serde_json::Value;

use crate::mod_manager::AutoexecConfig;

use super::state::MANAGER;

#[tauri::command]
pub async fn get_autoexec_config() -> Result<AutoexecConfig, Error> {
  log::info!("Getting autoexec config");
  let mod_manager = MANAGER.lock().unwrap();
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?;

  mod_manager
    .get_autoexec_manager()
    .get_editable_content(game_path)
}

#[tauri::command]
pub async fn update_autoexec_config(
  full_content: String,
  readonly_sections: Vec<crate::mod_manager::ReadonlySection>,
) -> Result<AutoexecConfig, Error> {
  log::info!("Updating autoexec config");
  let mod_manager = MANAGER.lock().unwrap();
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?;

  mod_manager.get_autoexec_manager().update_editable_content(
    game_path,
    &full_content,
    &readonly_sections,
  )
}

#[tauri::command]
pub async fn open_autoexec_folder() -> Result<(), Error> {
  log::info!("Opening autoexec folder");
  let mod_manager = MANAGER.lock().unwrap();
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?;

  mod_manager
    .get_autoexec_manager()
    .open_autoexec_folder(game_path)
}

#[tauri::command]
pub async fn open_autoexec_editor() -> Result<(), Error> {
  log::info!("Opening autoexec editor");
  let mod_manager = MANAGER.lock().unwrap();
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?;

  mod_manager
    .get_autoexec_manager()
    .open_autoexec_editor(game_path)
}

#[tauri::command]
pub async fn apply_crosshair_to_autoexec(config: Value) -> Result<(), Error> {
  log::info!("Applying crosshair to autoexec config");

  let crosshair_config: CrosshairConfig = serde_json::from_value(config)
    .map_err(|e| Error::InvalidInput(format!("Invalid crosshair config: {e}")))?;

  let mut mod_manager = MANAGER.lock().unwrap();
  if mod_manager.is_game_running()? {
    return Err(Error::GameRunning);
  }
  mod_manager.find_steam()?;
  let userdata = mod_manager.get_steam_manager().crosshair_userdata_path()?;
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?;

  mod_manager
    .get_autoexec_manager()
    .apply_crosshair(game_path, &crosshair_config, Some(&userdata))
}

#[tauri::command]
pub async fn remove_crosshair_from_autoexec() -> Result<(), Error> {
  disable_custom_crosshairs().await
}

#[tauri::command]
pub async fn disable_custom_crosshairs() -> Result<(), Error> {
  log::info!("Disabling custom crosshairs");

  let mut mod_manager = MANAGER.lock().unwrap();
  if mod_manager.is_game_running()? {
    return Err(Error::GameRunning);
  }
  let userdata = match mod_manager
    .find_steam()
    .and_then(|_| mod_manager.get_steam_manager().crosshair_userdata_path())
  {
    Ok(path) => Some(path),
    Err(error) => {
      log::warn!("Steam userdata unavailable; restoring game crosshair settings only: {error}");
      None
    }
  };
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?;

  mod_manager
    .get_autoexec_manager()
    .disable_custom_crosshairs(game_path, userdata.as_deref())
}

#[tauri::command]
pub async fn add_map_command_to_autoexec(map_name: String) -> Result<(), Error> {
  log::info!("Adding map command to autoexec: {map_name}");
  let mod_manager = MANAGER.lock().unwrap();
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?;

  mod_manager
    .get_autoexec_manager()
    .add_map_command(game_path, &map_name)
}

#[tauri::command]
pub async fn remove_map_command_from_autoexec() -> Result<(), Error> {
  log::info!("Removing map command from autoexec");
  let mod_manager = MANAGER.lock().unwrap();
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?;

  mod_manager
    .get_autoexec_manager()
    .remove_map_command(game_path)
}

#[tauri::command]
pub async fn get_map_command_from_autoexec() -> Result<Option<String>, Error> {
  let mod_manager = MANAGER.lock().unwrap();
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?;

  mod_manager
    .get_autoexec_manager()
    .get_map_command(game_path)
}
