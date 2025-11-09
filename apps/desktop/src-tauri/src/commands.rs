use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

use crate::discord_rpc::{self, DiscordActivity, DiscordState};
use crate::download_manager::{DownloadFileDto, DownloadManager, DownloadStatus, DownloadTask};
use crate::errors::Error;
use crate::ingest_tool;
use crate::mod_manager::archive_extractor::ArchiveExtractor;
use crate::mod_manager::{
  AddonAnalyzer, AddonsBackup, AnalyzeAddonsResult, Mod, ModFileTree, ModManager,
};
use crate::reports::{CreateReportRequest, CreateReportResponse, ReportCounts, ReportService};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::LazyLock;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_store::StoreExt;
use tokio::sync::OnceCell;
use vpk_parser::{VpkParseOptions, VpkParsed, VpkParser};

pub(crate) static MANAGER: LazyLock<Mutex<ModManager>> =
  LazyLock::new(|| Mutex::new(ModManager::new()));
static API_URL: LazyLock<Mutex<String>> =
  LazyLock::new(|| Mutex::new("http://localhost:9000".to_string()));
static DOWNLOAD_MANAGER: OnceCell<DownloadManager> = OnceCell::const_new();

// Ingest tool state
static INGEST_WATCHER_RUNNING: LazyLock<Arc<AtomicBool>> =
  LazyLock::new(|| Arc::new(AtomicBool::new(false)));
static INGEST_WATCHER_GEN: LazyLock<Arc<AtomicUsize>> =
  LazyLock::new(|| Arc::new(AtomicUsize::new(0)));

#[tauri::command]
pub async fn set_api_url(api_url: String) -> Result<(), Error> {
  log::info!("Setting API URL to: {api_url}");

  if !api_url.starts_with("http://") && !api_url.starts_with("https://") {
    return Err(Error::InvalidInput(
      "API URL must start with http:// or https://".to_string(),
    ));
  }

  if let Ok(mut url) = API_URL.lock() {
    *url = api_url;
  } else {
    return Err(Error::InvalidInput(
      "Failed to acquire API URL lock".to_string(),
    ));
  }

  Ok(())
}

pub fn get_api_url() -> String {
  match API_URL.lock() {
    Ok(url) => url.clone(),
    Err(_) => {
      log::warn!("Failed to acquire API URL lock, using default");
      "http://localhost:9000".to_string()
    }
  }
}

#[tauri::command]
pub async fn set_language(app_handle: AppHandle, language: String) -> Result<(), Error> {
  log::info!("Setting language to: {language}");

  let supported_languages = [
    "en", "de", "fr", "ar", "pl", "gsw", "th", "tr", "ru", "zh-CN", "zh-TW",
  ];
  if !supported_languages.contains(&language.as_str()) {
    return Err(Error::InvalidInput(format!(
      "Unsupported language: {language}"
    )));
  }

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
  log::info!("Parsing deep link: {url}");

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

  log::info!("Parsed deep link - Download URL: {download_url}, Type: {mod_type}, Mod ID: {mod_id}");

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
pub async fn install_mod(deadlock_mod: Mod, profile_folder: Option<String>) -> Result<Mod, Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager.install_mod(deadlock_mod, profile_folder)
}

#[tauri::command]
pub async fn stop_game() -> Result<(), Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager.stop_game()
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
pub async fn show_in_folder(path: String) -> Result<(), Error> {
  crate::utils::show_in_folder(&path)
}

#[tauri::command]
pub async fn show_mod_in_store(mod_id: String) -> Result<(), Error> {
  let mod_manager = MANAGER.lock().unwrap();
  let mods_path = mod_manager.get_mods_store_path()?;
  let mod_folder = mods_path.join(&mod_id);

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
) -> Result<(), Error> {
  let mod_manager = MANAGER.lock().unwrap();
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?;

  let addons_path = if let Some(ref folder) = profile_folder {
    game_path
      .join("game")
      .join("citadel")
      .join("addons")
      .join(folder)
  } else {
    game_path.join("game").join("citadel").join("addons")
  };

  if !addons_path.exists() {
    return Err(Error::GamePathNotSet);
  }

  // Show the first VPK file if available, otherwise show the addons folder
  if let Some(first_vpk) = vpk_files.first() {
    let vpk_path = addons_path.join(first_vpk);
    if vpk_path.exists() {
      crate::utils::show_file_in_folder(vpk_path.to_string_lossy().as_ref())
    } else {
      crate::utils::show_in_folder(addons_path.to_string_lossy().as_ref())
    }
  } else {
    crate::utils::show_in_folder(addons_path.to_string_lossy().as_ref())
  }
}

#[tauri::command]
pub async fn clear_mods(profile_folder: Option<String>) -> Result<(), Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager.clear_mods(profile_folder)
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
pub async fn uninstall_mod(
  mod_id: String,
  vpks: Vec<String>,
  profile_folder: Option<String>,
) -> Result<(), Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager.uninstall_mod(mod_id, vpks, profile_folder)
}

#[tauri::command]
pub async fn purge_mod(
  mod_id: String,
  vpks: Vec<String>,
  profile_folder: Option<String>,
) -> Result<(), Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager.purge_mod(mod_id, vpks, profile_folder)
}

#[tauri::command]
pub async fn reorder_mods(
  mod_order_data: Vec<(String, u32)>,
  profile_folder: Option<String>,
) -> Result<Vec<Mod>, Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager.reorder_mods(mod_order_data, profile_folder)
}

#[tauri::command]
pub async fn reorder_mods_by_remote_id(
  mod_order_data: Vec<(String, Vec<String>, u32)>,
  profile_folder: Option<String>,
) -> Result<Vec<(String, Vec<String>)>, Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager.reorder_mods_by_remote_id(mod_order_data, profile_folder)
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
  let api_url = get_api_url();

  // Get game path first
  let game_path = {
    let mod_manager = MANAGER.lock().unwrap();
    mod_manager
      .get_steam_manager()
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?
      .clone()
  };

  // Download vanilla gameinfo.gi
  let vanilla_content = {
    let url = format!("{api_url}/artifacts/deadlock/gameinfo.gi");
    log::info!("Downloading vanilla gameinfo.gi from: {url}");

    let client = reqwest::Client::new();
    let response = client
      .get(&url)
      .send()
      .await
      .map_err(|e| Error::NetworkError(format!("Failed to download vanilla gameinfo.gi: {e}")))?;

    if !response.status().is_success() {
      return Err(Error::NetworkError(format!(
        "Server returned error status: {}",
        response.status()
      )));
    }

    response
      .text()
      .await
      .map_err(|e| Error::NetworkError(format!("Failed to read response: {e}")))?
  };

  // Apply the vanilla content
  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager
    .get_config_manager_mut()
    .apply_vanilla_gameinfo(&game_path, vanilla_content)?;

  log::info!("Successfully reset to vanilla state using API");
  Ok(())
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

#[tauri::command]
pub async fn extract_archive(
  archive_path: String,
  target_path: String,
) -> Result<Vec<String>, Error> {
  log::info!("Extracting archive: {archive_path} to {target_path}");

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
  log::info!("Removing mod folder: {mod_path}");
  let mod_manager = MANAGER.lock().unwrap();
  let path = PathBuf::from(&mod_path);

  // ModManager now handles path validation and canonicalization
  mod_manager.remove_mod_folder(&path)?;
  Ok(())
}

#[tauri::command]
pub fn parse_vpk_file(
  file_path: String,
  include_full_file_hash: Option<bool>,
  include_merkle: Option<bool>,
) -> Result<VpkParsed, Error> {
  log::info!("Parsing VPK file: {file_path}");

  let path = PathBuf::from(&file_path);

  // Read the VPK file
  let vpk_data = std::fs::read(&path).map_err(|e| {
    log::error!("Failed to read VPK file {file_path}: {e}");
    e
  })?;

  // Get file metadata
  let metadata = std::fs::metadata(&path).map_err(|e| {
    log::error!("Failed to get metadata for {file_path}: {e}");
    e
  })?;

  let last_modified = metadata
    .modified()
    .ok()
    .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
    .and_then(|duration| chrono::DateTime::from_timestamp(duration.as_secs() as i64, 0));

  let options = VpkParseOptions {
    include_full_file_hash: include_full_file_hash.unwrap_or(false),
    file_path: file_path.clone(),
    last_modified,
    include_merkle: include_merkle.unwrap_or(false),
    include_entries: true, // Include entries for manual VPK parsing
  };

  let parsed = VpkParser::parse(vpk_data, options)
    .map_err(|e| Error::InvalidInput(format!("Failed to parse VPK file {file_path}: {e}")))?;

  log::info!(
    "Successfully parsed VPK: {} entries, version {}, manifest hash: {}",
    parsed.entries.len(),
    parsed.version,
    parsed.manifest_sha256
  );

  Ok(parsed)
}

#[tauri::command]
pub async fn check_addons_exist(profile_folder: Option<String>) -> Result<bool, Error> {
  let mod_manager = MANAGER.lock().unwrap();
  let game_path = match mod_manager.get_steam_manager().get_game_path() {
    Some(path) => path.clone(),
    None => return Ok(false),
  };
  drop(mod_manager);

  let addons_path = if let Some(ref folder) = profile_folder {
    game_path
      .join("game")
      .join("citadel")
      .join("addons")
      .join(folder)
  } else {
    game_path.join("game").join("citadel").join("addons")
  };

  if !addons_path.exists() {
    return Ok(false);
  }

  for entry in std::fs::read_dir(addons_path)? {
    let entry = entry?;
    if entry.path().extension().and_then(|e| e.to_str()) == Some("vpk") {
      log::info!("Found VPK file in addons folder");
      return Ok(true);
    }
  }

  Ok(false)
}

#[tauri::command]
pub async fn analyze_local_addons(
  app_handle: AppHandle,
  profile_folder: Option<String>,
) -> Result<AnalyzeAddonsResult, Error> {
  // Get the game path first, then release the lock
  let game_path = {
    let mod_manager = MANAGER.lock().unwrap();
    match mod_manager.get_steam_manager().get_game_path() {
      Some(path) => path.clone(),
      None => return Err(Error::GamePathNotSet),
    }
  }; // Lock is released here

  let analyzer = AddonAnalyzer::new();
  let result = analyzer
    .analyze_local_addons(game_path, profile_folder, Some(app_handle))
    .await?;
  Ok(result)
}

#[tauri::command]
pub async fn create_report(data: CreateReportRequest) -> Result<CreateReportResponse, Error> {
  let report_service = ReportService::new();
  report_service.create_report(data).await
}

#[tauri::command]
pub async fn get_report_counts(mod_id: String) -> Result<ReportCounts, Error> {
  let report_service = ReportService::new();
  report_service.get_report_counts(&mod_id).await
}

#[tauri::command]
pub async fn store_auth_token(app_handle: AppHandle, token: String) -> Result<(), Error> {
  log::info!("Storing authentication token");

  let store = app_handle
    .store("state.json")
    .map_err(|e| Error::InvalidInput(format!("Failed to access store: {e}")))?;

  store.set("auth_token", serde_json::json!(token));

  store
    .save()
    .map_err(|e| Error::InvalidInput(format!("Failed to save store: {e}")))?;

  Ok(())
}

#[tauri::command]
pub async fn get_auth_token(app_handle: AppHandle) -> Result<Option<String>, Error> {
  log::debug!("Retrieving authentication token");

  let store = app_handle
    .store("state.json")
    .map_err(|e| Error::InvalidInput(format!("Failed to access store: {e}")))?;

  let token = store.get("auth_token");

  match token {
    Some(value) => {
      if let Some(token_str) = value.as_str() {
        Ok(Some(token_str.to_string()))
      } else {
        Ok(None)
      }
    }
    None => Ok(None),
  }
}

#[tauri::command]
pub async fn clear_auth_token(app_handle: AppHandle) -> Result<(), Error> {
  log::info!("Clearing authentication token");

  let store = app_handle
    .store("state.json")
    .map_err(|e| Error::InvalidInput(format!("Failed to access store: {e}")))?;

  let _ = store.delete("auth_token");

  store
    .save()
    .map_err(|e| Error::InvalidInput(format!("Failed to save store: {e}")))?;

  Ok(())
}

#[tauri::command]
pub async fn create_addons_backup(app_handle: AppHandle) -> Result<AddonsBackup, Error> {
  log::info!("Creating addons backup");

  // Get backup manager and paths - release lock quickly
  let (addons_path, backup_dir, filename) = {
    let mut mod_manager = MANAGER.lock().unwrap();
    mod_manager.set_backup_manager_app_handle(app_handle.clone());
    let backup_manager = mod_manager.get_addons_backup_manager();

    let addons_path = backup_manager.get_addons_path()?;
    let backup_dir = backup_manager.get_backup_directory()?;
    let filename = backup_manager.generate_backup_filename();

    (addons_path, backup_dir, filename)
  }; // Lock released here

  // Run the backup creation in a blocking task WITHOUT holding the lock
  tokio::task::spawn_blocking(move || {
    crate::mod_manager::addons_backup_manager::AddonsBackupManager::create_backup_async(
      addons_path,
      backup_dir,
      filename,
      app_handle,
    )
  })
  .await
  .map_err(|e| Error::BackupCreationFailed(format!("Task join error: {e}")))?
}

#[tauri::command]
pub async fn list_addons_backups() -> Result<Vec<AddonsBackup>, Error> {
  log::info!("Listing addons backups");
  let mut mod_manager = MANAGER.lock().unwrap();
  let backup_manager = mod_manager.get_addons_backup_manager();
  backup_manager.list_backups()
}

#[tauri::command]
pub async fn restore_addons_backup(file_name: String, strategy: String) -> Result<(), Error> {
  log::info!("Restoring addons backup: {file_name} with strategy: {strategy}");
  let mut mod_manager = MANAGER.lock().unwrap();
  let backup_manager = mod_manager.get_addons_backup_manager();
  let restore_strategy =
    crate::mod_manager::addons_backup_manager::RestoreStrategy::from_str(&strategy)?;
  backup_manager.restore_backup(&file_name, restore_strategy)
}

#[tauri::command]
pub async fn delete_addons_backup(file_name: String) -> Result<(), Error> {
  log::info!("Deleting addons backup: {file_name}");
  let mut mod_manager = MANAGER.lock().unwrap();
  let backup_manager = mod_manager.get_addons_backup_manager();
  backup_manager.delete_backup(&file_name)
}

#[tauri::command]
pub async fn open_addons_backups_folder() -> Result<(), Error> {
  log::info!("Opening addons backups folder");
  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager.open_addons_backups_folder()
}

#[tauri::command]
pub async fn get_addons_backup_info(file_name: String) -> Result<AddonsBackup, Error> {
  log::info!("Getting addons backup info: {file_name}");
  let mut mod_manager = MANAGER.lock().unwrap();
  let backup_manager = mod_manager.get_addons_backup_manager();
  backup_manager.get_backup_info(&file_name)
}

async fn get_download_manager(app_handle: AppHandle) -> &'static DownloadManager {
  DOWNLOAD_MANAGER
    .get_or_init(|| async { DownloadManager::new(app_handle) })
    .await
}

#[tauri::command]
pub async fn queue_download(
  app_handle: AppHandle,
  mod_id: String,
  files: Vec<DownloadFileDto>,
  profile_folder: Option<String>,
) -> Result<(), Error> {
  log::info!(
    "Received download request for mod: {mod_id} with {} files (profile: {profile_folder:?})",
    files.len()
  );

  let app_local_data_dir = app_handle
    .path()
    .app_local_data_dir()
    .map_err(Error::Tauri)?;

  let target_dir = app_local_data_dir.join("mods").join(&mod_id);

  let task = DownloadTask {
    mod_id,
    files,
    target_dir,
    profile_folder,
  };

  let manager = get_download_manager(app_handle).await;
  manager.queue_download(task).await
}

#[tauri::command]
pub async fn cancel_download(app_handle: AppHandle, mod_id: String) -> Result<(), Error> {
  let manager = get_download_manager(app_handle).await;
  manager.cancel_download(&mod_id).await
}

#[tauri::command]
pub async fn get_download_status(
  app_handle: AppHandle,
  mod_id: String,
) -> Result<Option<DownloadStatus>, Error> {
  let manager = get_download_manager(app_handle).await;
  manager.get_download_status(&mod_id).await
}

#[tauri::command]
pub async fn get_all_downloads(app_handle: AppHandle) -> Result<Vec<DownloadStatus>, Error> {
  let manager = get_download_manager(app_handle).await;
  manager.get_all_downloads().await
}

#[tauri::command]
pub async fn copy_selected_vpks_from_archive(
  mod_id: String,
  file_tree: crate::mod_manager::file_tree::ModFileTree,
  profile_folder: Option<String>,
) -> Result<(), Error> {
  use crate::mod_manager::archive_extractor::ArchiveExtractor;
  use crate::mod_manager::vpk_manager::VpkManager;

  log::info!(
    "Copying selected VPKs from archive for mod: {} (profile: {profile_folder:?})",
    mod_id
  );

  let mod_manager = MANAGER.lock().unwrap();
  let mods_path = mod_manager.get_mods_store_path()?;
  let mod_dir = mods_path.join(&mod_id);

  // Find archive in mod directory
  let extractor = ArchiveExtractor::new();
  let mut archive_path: Option<PathBuf> = None;

  for entry in std::fs::read_dir(&mod_dir)? {
    let entry = entry?;
    let path = entry.path();
    if extractor.is_supported_archive(&path) {
      archive_path = Some(path);
      break;
    }
  }

  let archive_path = archive_path.ok_or(Error::ModFileNotFound)?;

  // Get game path and addons path
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?
    .clone();

  let addons_path = if let Some(ref folder) = profile_folder {
    game_path
      .join("game")
      .join("citadel")
      .join("addons")
      .join(folder)
  } else {
    game_path.join("game").join("citadel").join("addons")
  };

  // Create addons directory if it doesn't exist
  if !addons_path.exists() {
    std::fs::create_dir_all(&addons_path)?;
  }

  drop(mod_manager); // Release lock before extraction

  // Extract archive to temp directory
  let temp_dir = tempfile::tempdir()?;
  log::info!("Extracting archive: {archive_path:?}");
  extractor.extract_archive(&archive_path, temp_dir.path())?;

  // Copy selected VPKs
  let vpk_manager = VpkManager::new();
  vpk_manager.copy_selected_vpks_with_prefix(
    temp_dir.path(),
    &addons_path,
    &mod_id,
    &file_tree,
  )?;

  // Delete archive after copying
  log::info!("Removing archive: {archive_path:?}");
  std::fs::remove_file(&archive_path)?;

  log::info!("Successfully copied selected VPKs for mod: {}", mod_id);
  Ok(())
}

#[tauri::command]
pub async fn replace_mod_vpks(
  mod_id: String,
  source_vpk_paths: Vec<String>,
  installed_vpks: Option<Vec<String>>,
  profile_folder: Option<String>,
) -> Result<(), Error> {
  log::info!(
    "Replacing VPK files for mod {mod_id}: {} files (profile: {profile_folder:?})",
    source_vpk_paths.len()
  );

  let source_paths: Vec<PathBuf> = source_vpk_paths.iter().map(PathBuf::from).collect();

  // Validate all source files exist and are VPK files
  for path in &source_paths {
    if !path.exists() {
      return Err(Error::ModFileNotFound);
    }
    if path.extension().and_then(|e| e.to_str()) != Some("vpk") {
      return Err(Error::InvalidInput(format!(
        "File is not a VPK: {:?}",
        path.file_name().unwrap_or_default()
      )));
    }
  }

  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager.replace_mod_vpks(
    mod_id,
    source_paths,
    installed_vpks.unwrap_or_default(),
    profile_folder,
  )?;

  log::info!("VPK replacement command completed successfully");
  Ok(())
}

// ============================================================================
// Profile Management Commands
// ============================================================================

#[tauri::command]
pub async fn create_profile_folder(
  profile_id: String,
  profile_name: String,
) -> Result<String, Error> {
  log::info!("Creating profile folder for: {profile_id} - {profile_name}");

  let sanitized_name = profile_name
    .to_lowercase()
    .chars()
    .map(|c| {
      if c.is_alphanumeric() || c == '-' || c == '_' {
        c
      } else if c.is_whitespace() {
        '-'
      } else {
        '_'
      }
    })
    .collect::<String>()
    .trim_matches(|c| c == '-' || c == '_')
    .to_string();

  let folder_name = format!("{}_{}", profile_id, sanitized_name);

  let mod_manager = MANAGER.lock().unwrap();
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?;

  let addons_path = game_path.join("game").join("citadel").join("addons");
  let profile_folder = addons_path.join(&folder_name);

  if profile_folder.exists() {
    log::warn!("Profile folder already exists: {profile_folder:?}");
    return Ok(folder_name);
  }

  std::fs::create_dir_all(&profile_folder)?;
  log::info!("Created profile folder: {profile_folder:?}");

  Ok(folder_name)
}

#[tauri::command]
pub async fn delete_profile_folder(profile_folder: String) -> Result<(), Error> {
  log::info!("Deleting profile folder: {profile_folder}");

  if profile_folder.is_empty() || profile_folder == "." || profile_folder == ".." {
    return Err(Error::InvalidInput(
      "Invalid profile folder name".to_string(),
    ));
  }

  if !profile_folder.starts_with("profile_") {
    return Err(Error::InvalidInput(
      "Profile folder must start with 'profile_'".to_string(),
    ));
  }

  let mod_manager = MANAGER.lock().unwrap();
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?;

  let addons_path = game_path.join("game").join("citadel").join("addons");
  let profile_path = addons_path.join(&profile_folder);

  if !profile_path.exists() {
    log::warn!("Profile folder does not exist: {profile_path:?}");
    return Ok(());
  }

  if !profile_path.starts_with(&addons_path) {
    return Err(Error::InvalidInput(
      "Profile folder must be within addons directory".to_string(),
    ));
  }

  std::fs::remove_dir_all(&profile_path)?;
  log::info!("Deleted profile folder: {profile_path:?}");

  Ok(())
}

#[tauri::command]
pub async fn switch_profile(profile_folder: Option<String>) -> Result<(), Error> {
  log::info!("Switching to profile folder: {profile_folder:?}");

  let mut mod_manager = MANAGER.lock().unwrap();
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?
    .clone();

  mod_manager
    .get_config_manager_mut()
    .update_mod_path(&game_path, profile_folder)?;

  log::info!("Successfully switched profile");
  Ok(())
}

#[tauri::command]
pub async fn list_profile_folders() -> Result<Vec<String>, Error> {
  log::info!("Listing profile folders in addons directory");

  let mod_manager = MANAGER.lock().unwrap();
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?;

  let addons_path = game_path.join("game").join("citadel").join("addons");

  if !addons_path.exists() {
    log::warn!("Addons path does not exist: {addons_path:?}");
    return Ok(Vec::new());
  }

  let mut profile_folders = Vec::new();

  for entry in std::fs::read_dir(&addons_path)? {
    let entry = entry?;
    let path = entry.path();

    if path.is_dir() {
      if let Some(folder_name) = path.file_name().and_then(|n| n.to_str()) {
        if folder_name.starts_with("profile_") {
          profile_folders.push(folder_name.to_string());
          log::debug!("Found profile folder: {folder_name}");
        }
      }
    }
  }

  log::info!("Found {} profile folders", profile_folders.len());
  Ok(profile_folders)
}

#[tauri::command]
pub async fn get_profile_installed_vpks(
  profile_folder: Option<String>,
) -> Result<Vec<String>, Error> {
  log::info!("Getting installed VPKs for profile: {profile_folder:?}");

  let mod_manager = MANAGER.lock().unwrap();
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?;

  let addons_path = if let Some(folder) = profile_folder {
    game_path
      .join("game")
      .join("citadel")
      .join("addons")
      .join(folder)
  } else {
    game_path.join("game").join("citadel").join("addons")
  };

  if !addons_path.exists() {
    log::warn!("Addons path does not exist: {addons_path:?}");
    return Ok(Vec::new());
  }

  let mut vpk_files = Vec::new();

  for entry in std::fs::read_dir(&addons_path)? {
    let entry = entry?;
    let path = entry.path();

    if path.is_file() {
      if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
        // Return all .vpk files (both enabled pak##_dir.vpk and prefixed ones)
        if file_name.ends_with(".vpk") {
          vpk_files.push(file_name.to_string());
          log::debug!("Found VPK file: {file_name}");
        }
      }
    }
  }

  log::info!("Found {} VPK files in profile", vpk_files.len());
  Ok(vpk_files)
}

// ============================================================================
// Ingest Tool Commands
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IngestStatus {
  pub is_running: bool,
  pub cache_directory: Option<String>,
}

/// Trigger a one-time scan of the Steam cache directory
#[tauri::command]
pub async fn trigger_cache_scan() -> Result<(), Error> {
  log::info!("Triggering cache scan");

  let cache_dir = ingest_tool::get_cache_directory()
    .ok_or_else(|| Error::InvalidInput("Could not find Steam cache directory".to_string()))?;

  // Run the scan in a background task
  tokio::task::spawn(async move {
    ingest_tool::initial_cache_dir_ingest(&cache_dir).await;
  });

  Ok(())
}

/// Start watching the cache directory for new files
#[tauri::command]
pub async fn start_cache_watcher() -> Result<(), Error> {
  log::info!("Starting cache watcher");

  let cache_dir = ingest_tool::get_cache_directory()
    .ok_or_else(|| Error::InvalidInput("Could not find Steam cache directory".to_string()))?;

  if INGEST_WATCHER_RUNNING
    .compare_exchange(false, true, Ordering::AcqRel, Ordering::Relaxed)
    .is_err()
  {
    log::warn!("Cache watcher is already running");
    return Ok(());
  }

  let generation = INGEST_WATCHER_GEN.fetch_add(1, Ordering::Relaxed) + 1;
  let running_flag = Arc::clone(&INGEST_WATCHER_RUNNING);
  let gen_counter = Arc::clone(&INGEST_WATCHER_GEN);

  // Spawn a background task to watch the cache directory
  tokio::task::spawn(async move {
    log::info!("Cache watcher task started");
    let mut requested_stop = false;

    // Run initial scan
    ingest_tool::initial_cache_dir_ingest(&cache_dir).await;

    // Start watching
    loop {
      if !running_flag.load(Ordering::Relaxed) {
        log::info!("Cache watcher stopped by flag");
        requested_stop = true;
        break;
      }

      match ingest_tool::watch_cache_dir(&cache_dir, Arc::clone(&running_flag)).await {
        Ok(_) => {
          log::info!("Cache watcher exited normally");
          break;
        }
        Err(e) => {
          log::error!("Cache watcher error: {e:?}");
          // Wait a bit before retrying
          tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

          // Check if we should still be running
          if !running_flag.load(Ordering::Relaxed) {
            requested_stop = true;
            break;
          }
          log::info!("Restarting cache watcher after error");
        }
      }
    }

    if !requested_stop && gen_counter.load(Ordering::Relaxed) == generation {
      running_flag.store(false, Ordering::Relaxed);
    }
    log::info!("Cache watcher thread exited");
  });

  Ok(())
}

/// Stop the cache directory watcher
#[tauri::command]
pub async fn stop_cache_watcher() -> Result<(), Error> {
  log::info!("Stopping cache watcher");
  INGEST_WATCHER_RUNNING.store(false, Ordering::Relaxed);
  Ok(())
}

/// Get the current status of the ingest tool
#[tauri::command]
pub async fn get_ingest_status() -> Result<IngestStatus, Error> {
  let is_running = INGEST_WATCHER_RUNNING.load(Ordering::Relaxed);
  let cache_directory = ingest_tool::get_cache_directory().map(|p| p.display().to_string());

  Ok(IngestStatus {
    is_running,
    cache_directory,
  })
}

/// Initialize the ingest tool on app startup (if enabled)
#[tauri::command]
pub async fn initialize_ingest_tool() -> Result<(), Error> {
  log::info!("Initializing ingest tool on startup");

  // Check if already running
  if INGEST_WATCHER_RUNNING.load(Ordering::Relaxed) {
    log::warn!("Cache watcher is already running, skipping initialization");
    return Ok(());
  }

  let cache_dir = match ingest_tool::get_cache_directory() {
    Some(dir) => dir,
    None => {
      log::warn!("Could not find Steam cache directory, ingest tool will not start");
      return Ok(()); // Don't fail the app startup
    }
  };

  log::info!("Found cache directory: {}", cache_dir.display());

  // Run initial scan
  log::info!("Running initial cache scan");
  ingest_tool::initial_cache_dir_ingest(&cache_dir).await;

  // Start the watcher
  log::info!("Starting cache watcher");
  let generation = INGEST_WATCHER_GEN.fetch_add(1, Ordering::Relaxed) + 1;
  INGEST_WATCHER_RUNNING.store(true, Ordering::Relaxed);

  let running = INGEST_WATCHER_RUNNING.clone();
  let gen_counter = INGEST_WATCHER_GEN.clone();
  tokio::task::spawn(async move {
    if let Err(e) = ingest_tool::watch_cache_dir(&cache_dir, running.clone()).await {
      log::error!("Cache watcher error: {e}");
    }
    // Only clear the running flag if we're still the current generation
    if gen_counter.load(Ordering::Relaxed) == generation {
      running.store(false, Ordering::Relaxed);
      log::info!("Cache watcher stopped");
    } else {
      log::info!("Cache watcher stopped but not clearing flag - newer generation exists");
    }
  });

  log::info!("Ingest tool initialized successfully");
  Ok(())
}

// ============================================================================
// Discord RPC Commands
// ============================================================================

#[tauri::command]
pub async fn set_discord_presence(
  state: State<'_, DiscordState>,
  application_id: String,
  activity: DiscordActivity,
) -> Result<(), Error> {
  discord_rpc::ensure_connection_and_set_presence(&state, &application_id, activity)
    .await
    .map_err(|e| Error::InvalidInput(e))
}

#[tauri::command]
pub async fn clear_discord_presence(state: State<'_, DiscordState>) -> Result<(), Error> {
  log::info!("Clearing Discord presence");

  let mut client_lock = state
    .client
    .lock()
    .map_err(|e| Error::InvalidInput(format!("Failed to acquire Discord client lock: {}", e)))?;

  if let Some(client) = client_lock.as_mut() {
    discord_rpc::clear_presence(client)
      .map_err(|e| Error::InvalidInput(format!("Failed to clear presence: {}", e)))?;
  }

  Ok(())
}

#[tauri::command]
pub async fn disconnect_discord(state: State<'_, DiscordState>) -> Result<(), Error> {
  log::info!("Disconnecting from Discord");

  let mut client_lock = state
    .client
    .lock()
    .map_err(|e| Error::InvalidInput(format!("Failed to acquire Discord client lock: {}", e)))?;

  if let Some(client) = client_lock.as_mut() {
    discord_rpc::disconnect_discord(client)
      .map_err(|e| Error::InvalidInput(format!("Failed to disconnect: {}", e)))?;
    *client_lock = None;
  }

  Ok(())
}

// ============================================================================
// Profile Import Batch Command
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileImportMod {
  pub mod_id: String,
  pub mod_name: String,
  pub download_files: Vec<DownloadFileDto>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub file_tree: Option<ModFileTree>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileImportProgressEvent {
  pub current_step: String, // "downloading" | "installing" | "complete"
  pub current_mod_index: usize,
  pub total_mods: usize,
  pub current_mod_name: String,
  pub overall_progress: f64, // 0-100
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledModInfo {
  pub mod_id: String,
  pub mod_name: String,
  pub installed_vpks: Vec<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub file_tree: Option<ModFileTree>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileImportResult {
  pub profile_folder: String,
  pub succeeded: Vec<String>,
  pub failed: Vec<(String, String)>, // (mod_id, error_message)
  pub installed_mods: Vec<InstalledModInfo>, // Mods that were successfully installed
}

#[tauri::command]
pub async fn import_profile_batch(
  app_handle: AppHandle,
  profile_name: String,
  _profile_description: String,
  profile_folder: String,
  mods: Vec<ProfileImportMod>,
  import_type: String, // "create" | "override"
) -> Result<ProfileImportResult, Error> {
  log::info!(
    "Starting batch profile import: {} mods, type: {}, folder: {}",
    mods.len(),
    import_type,
    profile_folder
  );

  let total_mods = mods.len();
  if total_mods == 0 {
    return Err(Error::InvalidInput(
      "No mods provided for import".to_string(),
    ));
  }

  // Step 1: Create/validate profile folder
  let final_profile_folder = if import_type == "create" {
    // Generate a profile ID matching the pattern used by createProfile (profile_timestamp_random)
    // Use milliseconds timestamp + nanoseconds for uniqueness (similar to TypeScript's Date.now() + random)
    let now = std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .unwrap();
    let timestamp_ms = now.as_millis();
    let nanos = now.subsec_nanos();

    // Create a simple "random" part from nanoseconds (base36-like encoding)
    // This mimics TypeScript's Math.random().toString(36).substr(2, 9)
    let random_part = format!("{:x}", nanos).chars().take(9).collect::<String>();

    let profile_id = format!("profile_{}_{}", timestamp_ms, random_part);

    create_profile_folder(profile_id, profile_name.clone()).await?
  } else {
    // Override mode: use provided folder name
    let mod_manager = MANAGER.lock().unwrap();
    let game_path = mod_manager
      .get_steam_manager()
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?;

    let addons_path = game_path.join("game").join("citadel").join("addons");
    let profile_path = addons_path.join(&profile_folder);

    if !profile_path.exists() {
      std::fs::create_dir_all(&profile_path)?;
      log::info!("Created profile folder for override: {profile_path:?}");
    }

    profile_folder
  };

  // Step 2: Download all mods sequentially
  let mut download_results: Vec<Result<(), String>> = Vec::new();

  for (index, mod_data) in mods.iter().enumerate() {
    // Emit batch progress event
    app_handle
      .emit(
        "profile-import-progress",
        ProfileImportProgressEvent {
          current_step: "downloading".to_string(),
          current_mod_index: index,
          total_mods,
          current_mod_name: mod_data.mod_name.clone(),
          overall_progress: (index as f64 / total_mods as f64) * 50.0, // 0-50% for downloads
        },
      )
      .ok();

    // Queue the download
    let app_local_data_dir = app_handle
      .path()
      .app_local_data_dir()
      .map_err(Error::Tauri)?;
    let target_dir = app_local_data_dir.join("mods").join(&mod_data.mod_id);

    let task = DownloadTask {
      mod_id: mod_data.mod_id.clone(),
      files: mod_data.download_files.clone(),
      target_dir,
      profile_folder: Some(final_profile_folder.clone()),
    };

    let manager = get_download_manager(app_handle.clone()).await;
    manager.queue_download(task).await?;

    // Poll download status until complete or error
    let mut download_complete = false;
    let mut download_error: Option<String> = None;
    let start_time = std::time::Instant::now();
    let timeout_duration = std::time::Duration::from_secs(600); // 10 minute timeout per mod

    while !download_complete && start_time.elapsed() < timeout_duration {
      tokio::time::sleep(std::time::Duration::from_millis(500)).await;

      match manager.get_download_status(&mod_data.mod_id).await {
        Ok(Some(status)) => {
          // Download is still in progress
          if status.status == "downloading" {
            continue;
          }
          // Download completed (status removed from active downloads)
          download_complete = true;
        }
        Ok(None) => {
          // Download completed (status removed from active downloads)
          download_complete = true;
        }
        Err(e) => {
          download_error = Some(format!("Failed to check download status: {:?}", e));
          break;
        }
      }
    }

    // Check if download actually completed by verifying files exist
    // Add retry logic to wait for file processing to complete
    if download_complete && download_error.is_none() {
      // Get game path and addons path (drop lock before await)
      let addons_path = {
        let mod_manager = MANAGER.lock().unwrap();
        let game_path = mod_manager
          .get_steam_manager()
          .get_game_path()
          .ok_or(Error::GamePathNotSet)?;

        if import_type == "create" {
          game_path
            .join("game")
            .join("citadel")
            .join("addons")
            .join(&final_profile_folder)
        } else {
          game_path
            .join("game")
            .join("citadel")
            .join("addons")
            .join(&final_profile_folder)
        }
      };

      // Retry logic to wait for VPKs to appear (file processing happens asynchronously)
      let vpk_manager = crate::mod_manager::vpk_manager::VpkManager::new();
      let mut vpks_found = false;
      let max_retries = 10;
      let mut retry_delay_ms = 100; // Start with 100ms delay

      for attempt in 0..max_retries {
        match vpk_manager.find_prefixed_vpks(&addons_path, &mod_data.mod_id) {
          Ok(vpks) if !vpks.is_empty() => {
            log::info!(
              "Download completed for mod: {} (found {} VPKs after {} attempts)",
              mod_data.mod_id,
              vpks.len(),
              attempt + 1
            );
            vpks_found = true;
            download_results.push(Ok(()));
            break;
          }
          Ok(_) => {
            // No VPKs found yet, wait and retry
            if attempt < max_retries - 1 {
              log::debug!(
                "VPKs not found yet for mod {} (attempt {}/{}), waiting {}ms",
                mod_data.mod_id,
                attempt + 1,
                max_retries,
                retry_delay_ms
              );
              tokio::time::sleep(std::time::Duration::from_millis(retry_delay_ms)).await;
              // Exponential backoff: double the delay each time (capped at 1 second)
              retry_delay_ms = std::cmp::min(retry_delay_ms * 2, 1000);
            }
          }
          Err(e) => {
            log::error!("Failed to check VPKs for mod {}: {:?}", mod_data.mod_id, e);
            download_results.push(Err(format!("Failed to verify download: {:?}", e)));
            vpks_found = true; // Mark as handled to avoid duplicate error
            break;
          }
        }
      }

      if !vpks_found {
        log::error!(
          "Download completed but no VPKs found for mod: {} after {} retries",
          mod_data.mod_id,
          max_retries
        );
        download_results.push(Err("Download completed but no VPKs found".to_string()));
      }
    } else if download_error.is_some() {
      log::error!(
        "Download failed for mod {}: {:?}",
        mod_data.mod_id,
        download_error
      );
      download_results.push(Err(download_error.unwrap()));
    } else {
      log::error!("Download timeout for mod: {}", mod_data.mod_id);
      download_results.push(Err("Download timeout".to_string()));
    }
  }

  // Step 3: Install all successfully downloaded mods
  let mut succeeded = Vec::new();
  let mut failed = Vec::new();
  let mut installed_mods = Vec::new();

  for (index, (mod_data, download_result)) in mods.iter().zip(download_results.iter()).enumerate() {
    // Emit batch progress event
    app_handle
      .emit(
        "profile-import-progress",
        ProfileImportProgressEvent {
          current_step: "installing".to_string(),
          current_mod_index: index,
          total_mods,
          current_mod_name: mod_data.mod_name.clone(),
          overall_progress: 50.0 + (index as f64 / total_mods as f64) * 50.0, // 50-100% for installs
        },
      )
      .ok();

    if download_result.is_err() {
      failed.push((
        mod_data.mod_id.clone(),
        download_result.as_ref().unwrap_err().clone(),
      ));
      continue;
    }

    // If mod has file tree with multiple files, copy selected VPKs from archive first
    if let Some(ref file_tree) = mod_data.file_tree {
      if file_tree.has_multiple_files {
        log::info!(
          "Mod {} has multiple files, copying selected VPKs from archive",
          mod_data.mod_id
        );

        // Copy selected VPKs from archive
        if let Err(e) = copy_selected_vpks_from_archive(
          mod_data.mod_id.clone(),
          file_tree.clone(),
          Some(final_profile_folder.clone()),
        )
        .await
        {
          log::error!(
            "Failed to copy selected VPKs for mod {}: {:?}",
            mod_data.mod_id,
            e
          );
          failed.push((
            mod_data.mod_id.clone(),
            format!("Failed to copy selected VPKs: {:?}", e),
          ));
          continue;
        }
      }
    }

    // Install the mod
    let install_result = {
      let mut mod_manager = MANAGER.lock().unwrap();
      let deadlock_mod = Mod {
        id: mod_data.mod_id.clone(),
        name: mod_data.mod_name.clone(),
        installed_vpks: Vec::new(),
        file_tree: mod_data.file_tree.clone(),
        install_order: None,
        original_vpk_names: Vec::new(),
      };

      mod_manager.install_mod(deadlock_mod, Some(final_profile_folder.clone()))
    };

    match install_result {
      Ok(installed_mod) => {
        log::info!("Successfully installed mod: {}", mod_data.mod_id);
        succeeded.push(mod_data.mod_id.clone());

        // Collect installed mod information
        installed_mods.push(InstalledModInfo {
          mod_id: installed_mod.id.clone(),
          mod_name: installed_mod.name.clone(),
          installed_vpks: installed_mod.installed_vpks.clone(),
          file_tree: installed_mod.file_tree.clone(),
        });
      }
      Err(e) => {
        log::error!("Failed to install mod {}: {:?}", mod_data.mod_id, e);
        failed.push((mod_data.mod_id.clone(), format!("{:?}", e)));
      }
    }
  }

  // Emit completion event
  app_handle
    .emit(
      "profile-import-progress",
      ProfileImportProgressEvent {
        current_step: "complete".to_string(),
        current_mod_index: total_mods,
        total_mods,
        current_mod_name: String::new(),
        overall_progress: 100.0,
      },
    )
    .ok();

  log::info!(
    "Batch profile import completed: {} succeeded, {} failed",
    succeeded.len(),
    failed.len()
  );

  Ok(ProfileImportResult {
    profile_folder: final_profile_folder,
    succeeded,
    failed,
    installed_mods,
  })
}
