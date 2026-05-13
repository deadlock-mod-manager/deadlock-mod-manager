use crate::errors::Error;

use super::state::MANAGER;

#[tauri::command]
pub async fn show_in_folder(path: String) -> Result<(), Error> {
  crate::utils::show_in_folder(&path)
}

#[tauri::command]
pub async fn show_mod_in_store(mod_id: String) -> Result<(), Error> {
  let mod_manager = MANAGER.lock().unwrap();
  let mod_folder = mod_manager.get_validated_mod_folder_path(&mod_id)?;

  if mod_folder.exists() {
    crate::utils::show_in_folder(mod_folder.to_string_lossy().as_ref())
  } else {
    Err(Error::ModFileNotFound)
  }
}

#[tauri::command]
pub async fn show_mod_in_game(
  vpk_files: Vec<String>,
  profile_folder: Option<String>,
  _is_map: Option<bool>,
) -> Result<(), Error> {
  let mod_manager = MANAGER.lock().unwrap();
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?;

  let target_path = if let Some(ref folder) = profile_folder {
    game_path
      .join("game")
      .join("citadel")
      .join("addons")
      .join(folder)
  } else {
    game_path.join("game").join("citadel").join("addons")
  };

  if !target_path.exists() {
    return Err(Error::GamePathNotSet);
  }

  if let Some(first_vpk) = vpk_files.first() {
    let vpk_path = target_path.join(first_vpk);
    if vpk_path.exists() {
      crate::utils::show_file_in_folder(vpk_path.to_string_lossy().as_ref())
    } else {
      crate::utils::show_in_folder(target_path.to_string_lossy().as_ref())
    }
  } else {
    crate::utils::show_in_folder(target_path.to_string_lossy().as_ref())
  }
}

#[tauri::command]
pub async fn open_mods_folder(profile_folder: Option<String>) -> Result<(), Error> {
  let mod_manager = MANAGER.lock().unwrap();
  mod_manager.open_mods_folder(profile_folder)
}

#[tauri::command]
pub async fn open_game_folder() -> Result<(), Error> {
  let mod_manager = MANAGER.lock().unwrap();
  mod_manager.open_game_folder()
}

#[tauri::command]
pub async fn open_mods_data_folder() -> Result<(), Error> {
  let mod_manager = MANAGER.lock().unwrap();
  mod_manager.open_mods_data_folder()
}

#[tauri::command]
pub async fn remove_mod_folder(mod_path: String) -> Result<(), Error> {
  log::info!("Removing mod folder: {mod_path}");
  let mod_manager = MANAGER.lock().unwrap();
  let path = std::path::PathBuf::from(&mod_path);

  mod_manager.remove_mod_folder(&path)?;
  Ok(())
}
