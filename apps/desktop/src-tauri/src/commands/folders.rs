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
  mod_id: String,
  vpk_files: Vec<String>,
  profile_folder: Option<String>,
  _is_map: Option<bool>,
) -> Result<(), Error> {
  let mod_manager = MANAGER.lock().unwrap();
  let base = mod_manager.get_addons_path(profile_folder.as_deref())?;
  let manifest = crate::mod_manager::vpk_manifest::ProfileVpkManifest::load(&base)?;
  let shard_index = manifest
    .mods
    .get(&mod_id)
    .map(|entry| entry.shard.max(1))
    .or_else(|| {
      // No manifest entry: only trust a shard when exactly one contains the
      // mod's files. If several shards share a matching basename (or none do),
      // fall back to the profile base rather than revealing an arbitrary shard.
      let matching: Vec<u32> = (1..=crate::mod_manager::shard::MAX_SHARDS)
        .filter(|shard_index| {
          let dir = crate::mod_manager::shard::shard_dir(&base, *shard_index);
          vpk_files.iter().any(|vpk| {
            std::path::Path::new(vpk)
              .file_name()
              .is_some_and(|filename| dir.join(filename).is_file())
          })
        })
        .collect();
      (matching.len() == 1).then(|| matching[0])
    })
    .unwrap_or(1);
  let target_path = crate::mod_manager::shard::shard_dir(&base, shard_index);

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
