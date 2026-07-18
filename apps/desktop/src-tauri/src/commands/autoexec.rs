use crate::errors::Error;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::mod_manager::AutoexecConfig;

use super::state::MANAGER;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CrosshairConfigJson {
  gap: f64,
  width: f64,
  height: f64,
  #[serde(rename = "pipOpacity")]
  pip_opacity: f64,
  #[serde(rename = "dotOpacity")]
  dot_opacity: f64,
  #[serde(rename = "dotOutlineOpacity")]
  dot_outline_opacity: f64,
  color: ColorJson,
  #[serde(rename = "pipBorder")]
  pip_border: bool,
  #[serde(rename = "pipGapStatic")]
  pip_gap_static: bool,
  hero: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ColorJson {
  r: u8,
  g: u8,
  b: u8,
}

fn generate_crosshair_config_string(config: &CrosshairConfigJson) -> String {
  format!(
    "citadel_crosshair_color_r \"{}\"\ncitadel_crosshair_color_g \"{}\"\ncitadel_crosshair_color_b \"{}\"\ncitadel_crosshair_pip_border \"{}\"\ncitadel_crosshair_pip_gap_static \"{}\"\ncitadel_crosshair_pip_opacity \"{}\"\ncitadel_crosshair_pip_width \"{}\"\ncitadel_crosshair_pip_height \"{}\"\ncitadel_crosshair_pip_gap \"{}\"\ncitadel_crosshair_dot_opacity \"{}\"\ncitadel_crosshair_dot_outline_opacity \"{}\"",
    config.color.r,
    config.color.g,
    config.color.b,
    config.pip_border,
    config.pip_gap_static,
    config.pip_opacity,
    config.width,
    config.height,
    config.gap,
    config.dot_opacity,
    config.dot_outline_opacity
  )
}

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

  let crosshair_config: CrosshairConfigJson = serde_json::from_value(config)
    .map_err(|e| Error::InvalidInput(format!("Invalid crosshair config: {e}")))?;

  let config_string = generate_crosshair_config_string(&crosshair_config);

  let mod_manager = MANAGER.lock().unwrap();
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?;

  mod_manager
    .get_autoexec_manager()
    .update_crosshair_section(game_path, &config_string)
}

#[tauri::command]
pub async fn remove_crosshair_from_autoexec() -> Result<(), Error> {
  log::info!("Removing crosshair section from autoexec config");

  let mod_manager = MANAGER.lock().unwrap();
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?;

  mod_manager
    .get_autoexec_manager()
    .remove_crosshair_section(game_path)
}

#[tauri::command]
pub async fn disable_custom_crosshairs() -> Result<(), Error> {
  log::info!("Disabling custom crosshairs");

  let mut mod_manager = MANAGER.lock().unwrap();
  if mod_manager.is_game_running()? {
    return Err(Error::GameRunning);
  }
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?;

  mod_manager
    .get_autoexec_manager()
    .disable_custom_crosshairs(game_path)
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
