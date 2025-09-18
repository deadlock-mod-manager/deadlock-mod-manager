use std::sync::Mutex;

use crate::errors::Error;
use crate::mod_manager::archive_extractor::ArchiveExtractor;
use crate::mod_manager::{Mod, ModFileTree, ModManager};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::LazyLock;
use tauri::{AppHandle, Emitter, Manager};

static MANAGER: LazyLock<Mutex<ModManager>> = LazyLock::new(|| Mutex::new(ModManager::new()));

#[tauri::command]
pub async fn set_language(app_handle: AppHandle, language: String) -> Result<(), Error> {
  log::info!("Setting language to: {}", language);

  // Validate language code
  let supported_languages = ["en", "de", "fr", "ar", "pl", "gsw", "tr", "ru"];
  if !supported_languages.contains(&language.as_str()) {
    return Err(Error::InvalidInput(format!(
      "Unsupported language: {}",
      language
    )));
  }

  // Emit event to frontend to change language
  if let Some(window) = app_handle.get_webview_window("main") {
    window.emit("set-language", &language)?;
  }

  Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeepLinkData {
  pub download_url: String,
  pub mod_type: String,
  pub mod_id: String,
}

#[tauri::command]
pub async fn parse_deep_link(url: String) -> Result<DeepLinkData, Error> {
  log::info!("Parsing deep link: {}", url);

  // Expected format: deadlock-mod-manager:https://gamebanana.com/mmdl/1507124,Mod,616792
  // or: deadlock-modmanager:https://gamebanana.com/mmdl/1507124,Mod,616792

  let url = url.trim();

  // Remove the protocol prefix
  let data_part = if let Some(stripped) = url.strip_prefix("deadlock-mod-manager:") {
    stripped
  } else if let Some(stripped) = url.strip_prefix("deadlock-modmanager:") {
    stripped
  } else {
    return Err(Error::InvalidInput("Invalid deep link format".to_string()));
  };

  // Split by comma to get the three parts
  let parts: Vec<&str> = data_part.split(',').collect();

  if parts.len() != 3 {
    return Err(Error::InvalidInput(
      "Deep link must contain exactly 3 parts separated by commas".to_string(),
    ));
  }

  let download_url = parts[0].to_string();
  let mod_type = parts[1].to_string();
  let mod_id = parts[2].to_string();

  // Validate that the download URL is from gamebanana
  if !download_url.contains("gamebanana.com") {
    return Err(Error::InvalidInput(
      "Download URL must be from gamebanana.com".to_string(),
    ));
  }

  // Validate that mod_id is numeric
  if mod_id.parse::<u32>().is_err() {
    return Err(Error::InvalidInput("Mod ID must be numeric".to_string()));
  }

  log::info!(
    "Parsed deep link - Download URL: {}, Type: {}, Mod ID: {}",
    download_url,
    mod_type,
    mod_id
  );

  Ok(DeepLinkData {
    download_url,
    mod_type,
    mod_id,
  })
}

#[tauri::command]
pub async fn find_game_path() -> Result<String, Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  match (mod_manager.find_steam(), mod_manager.find_game()) {
    (Ok(_), Ok(game_path)) => {
      log::info!("Found game at: {:?}", game_path);
      Ok(game_path.to_string_lossy().to_string())
    }
    (Err(e), _) => {
      log::error!("Failed to find Steam: {}", e);
      Err(e)
    }
    (_, Err(e)) => {
      log::error!("Failed to find game: {}", e);
      Err(e)
    }
  }
}

#[tauri::command]
pub async fn get_mod_file_tree(mod_path: String) -> Result<ModFileTree, Error> {
  let mod_manager = MANAGER.lock().unwrap();
  let path = PathBuf::from(&mod_path);

  if !path.exists() {
    return Err(Error::ModFileNotFound);
  }

  let file_tree = mod_manager.get_mod_file_tree(&path)?;

  log::info!(
    "Got file tree for mod: {} files, has_multiple: {}",
    file_tree.total_files,
    file_tree.has_multiple_files
  );

  Ok(file_tree)
}

#[tauri::command]
pub async fn install_mod(deadlock_mod: Mod) -> Result<Mod, Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager.install_mod(deadlock_mod)
}

#[tauri::command]
pub async fn stop_game() -> Result<(), Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager.stop_game()
}

#[tauri::command]
pub async fn start_game(vanilla: bool, additional_args: String) -> Result<(), Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  log::info!(
    "Starting game with args: {:?} (vanilla: {:?})",
    additional_args,
    vanilla
  );
  mod_manager.run_game(vanilla, additional_args)
}

#[tauri::command]
pub async fn show_in_folder(path: String) -> Result<(), Error> {
  crate::utils::show_in_folder(&path)
}

#[tauri::command]
pub async fn clear_mods() -> Result<(), Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager.clear_mods()
}

#[tauri::command]
pub async fn open_mods_folder() -> Result<(), Error> {
  let mod_manager = MANAGER.lock().unwrap();
  mod_manager.open_mods_folder()
}

#[tauri::command]
pub async fn open_game_folder() -> Result<(), Error> {
  let mod_manager = MANAGER.lock().unwrap();
  mod_manager.open_game_folder()
}

#[tauri::command]
pub async fn open_mods_store() -> Result<(), Error> {
  let mod_manager = MANAGER.lock().unwrap();
  mod_manager.open_mods_store()
}

#[tauri::command]
pub async fn uninstall_mod(mod_id: String, vpks: Vec<String>) -> Result<(), Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager.uninstall_mod(mod_id, vpks)
}

#[tauri::command]
pub async fn purge_mod(mod_id: String, vpks: Vec<String>) -> Result<(), Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager.purge_mod(mod_id, vpks)
}

#[tauri::command]
pub async fn is_game_running() -> Result<bool, Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager.is_game_running()
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
  let mut mod_manager = MANAGER.lock().unwrap();
  let game_path = match mod_manager.get_steam_manager().get_game_path() {
    Some(path) => path.clone(),
    None => return Err(Error::GamePathNotSet),
  };
  mod_manager
    .get_config_manager_mut()
    .reset_to_vanilla(&game_path)
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
pub async fn get_gameinfo_status(
) -> Result<crate::mod_manager::game_config_manager::GameInfoStatus, Error> {
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

#[tauri::command]
pub async fn extract_archive(
  archive_path: String,
  target_path: String,
) -> Result<Vec<String>, Error> {
  log::info!("Extracting archive: {} to {}", archive_path, target_path);

  let archive_path = PathBuf::from(&archive_path);
  let target_path = PathBuf::from(&target_path);

  // Validate paths
  if !archive_path.exists() {
    return Err(Error::ModFileNotFound);
  }

  // Validate that target path is within the allowed mods directory
  let mod_manager = MANAGER.lock().unwrap();
  let validated_target_path = mod_manager.validate_extract_target_path(&target_path)?;
  drop(mod_manager); // Release the lock before the potentially long-running extraction

  // Create target directory if it doesn't exist
  std::fs::create_dir_all(&validated_target_path)?;

  let extractor = ArchiveExtractor::new();
  extractor.extract_archive(&archive_path, &validated_target_path)?;

  // Find all VPK files in the extracted directory
  let mut vpk_files = Vec::new();
  find_vpk_files(&validated_target_path, &mut vpk_files)?;

  log::info!("Extracted {} VPK files", vpk_files.len());
  Ok(vpk_files)
}

fn find_vpk_files(dir: &PathBuf, vpk_files: &mut Vec<String>) -> Result<(), Error> {
  if dir.is_dir() {
    for entry in std::fs::read_dir(dir)? {
      let entry = entry?;
      let path = entry.path();

      if path.is_dir() {
        find_vpk_files(&path, vpk_files)?;
      } else if path.extension().and_then(|e| e.to_str()) == Some("vpk") {
        vpk_files.push(path.file_name().unwrap().to_string_lossy().to_string());
      }
    }
  }
  Ok(())
}

#[tauri::command]
pub async fn remove_mod_folder(mod_path: String) -> Result<(), Error> {
  log::info!("Removing mod folder: {}", mod_path);
  let mod_manager = MANAGER.lock().unwrap();
  let path = PathBuf::from(&mod_path);

  // ModManager now handles path validation and canonicalization
  mod_manager.remove_mod_folder(&path)?;
  Ok(())
}

// Addons System Commands
#[tauri::command]
pub async fn activate_mod(mod_id: String, mod_name: String, vpks: Vec<String>) -> Result<(), Error> {
  log::info!("Activating mod: {} ({})", mod_name, mod_id);
  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager.activate_mod(&mod_id, &mod_name, &vpks)
}

#[tauri::command]
pub async fn deactivate_mod(mod_id: String, mod_name: String, vpks: Vec<String>) -> Result<(), Error> {
  log::info!("Deactivating mod: {} ({})", mod_name, mod_id);
  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager.deactivate_mod(&mod_id, &mod_name, &vpks)
}

#[tauri::command]
pub async fn get_installed_mods_from_addons() -> Result<Vec<crate::mod_manager::addons_manager::ModCatalogEntry>, Error> {
  log::info!("Getting installed mods from addons system");
  let mod_manager = MANAGER.lock().unwrap();
  mod_manager.get_installed_mods_from_addons()
}

#[tauri::command]
pub async fn get_active_mods_from_addons() -> Result<Vec<crate::mod_manager::addons_manager::ActiveMod>, Error> {
  log::info!("Getting active mods from addons system");
  let mod_manager = MANAGER.lock().unwrap();
  mod_manager.get_active_mods_from_addons()
}