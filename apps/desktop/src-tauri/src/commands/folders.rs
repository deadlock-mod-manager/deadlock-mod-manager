use super::state::MANAGER;
use crate::errors::Error;

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
  mod_id: String,
  vpk_files: Vec<String>,
  profile_folder: Option<String>,
  _is_map: Option<bool>,
) -> Result<(), Error> {
  let mod_manager = MANAGER.lock().unwrap();
  let base = mod_manager.get_addons_path(profile_folder.as_deref())?;
  let manifest = vpkmanager::ledger::ProfileLedger::load(&base)?;
  let shard_index = manifest
    .mods
    .get(&mod_id)
    .map(|entry| entry.shard)
    .ok_or_else(|| {
      Error::ModInvalid(format!(
        "Cannot locate mod {mod_id}: refresh the VPK scan first"
      ))
    })?;
  let target_path = base.shard_dir(shard_index);

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
