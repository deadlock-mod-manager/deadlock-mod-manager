use std::sync::Mutex;

use crate::discord_rpc::{self, DiscordActivity, DiscordState};
use crate::download_manager::{DownloadFileDto, DownloadManager, DownloadStatus, DownloadTask};
use crate::errors::Error;
use crate::mod_manager::archive_extractor::ArchiveExtractor;
use crate::mod_manager::{
  AddonAnalyzer, AddonsBackup, AnalyzeAddonsResult, Mod, ModFileTree, ModManager,
};
use crate::reports::{CreateReportRequest, CreateReportResponse, ReportCounts, ReportService};
use log;
use reqwest;
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

#[tauri::command]
pub async fn set_api_url(api_url: String) -> Result<(), Error> {
  log::info!("Setting API URL to: {}", api_url);

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
  log::info!("Setting language to: {}", language);

  let supported_languages = [
    "en", "de", "fr", "ar", "pl", "gsw", "th", "tr", "ru", "zh-CN", "zh-TW",
  ];
  if !supported_languages.contains(&language.as_str()) {
    return Err(Error::InvalidInput(format!(
      "Unsupported language: {}",
      language
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
  log::info!("Parsing deep link: {}", url);

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
pub async fn set_game_path(path: String) -> Result<String, Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  let path_buf = PathBuf::from(&path);
  let game_path = mod_manager.set_game_path(path_buf)?;
  log::info!("Game path manually set to: {:?}", game_path);
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
pub async fn show_mod_in_store(mod_id: String) -> Result<(), Error> {
  let mod_manager = MANAGER.lock().unwrap();
  let mods_path = mod_manager.get_mods_store_path()?;
  let mod_folder = mods_path.join(&mod_id);

  if mod_folder.exists() {
    crate::utils::show_in_folder(&mod_folder.to_string_lossy().to_string())
  } else {
    Err(Error::ModFileNotFound)
  }
}

#[tauri::command]
pub async fn show_mod_in_game(vpk_files: Vec<String>) -> Result<(), Error> {
  let mod_manager = MANAGER.lock().unwrap();
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?;
  let addons_path = game_path.join("game").join("citadel").join("addons");

  if !addons_path.exists() {
    return Err(Error::GamePathNotSet);
  }

  // Show the first VPK file if available, otherwise show the addons folder
  if let Some(first_vpk) = vpk_files.first() {
    let vpk_path = addons_path.join(first_vpk);
    if vpk_path.exists() {
      crate::utils::show_file_in_folder(&vpk_path.to_string_lossy().to_string())
    } else {
      crate::utils::show_in_folder(&addons_path.to_string_lossy().to_string())
    }
  } else {
    crate::utils::show_in_folder(&addons_path.to_string_lossy().to_string())
  }
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
pub async fn reorder_mods(mod_order_data: Vec<(String, u32)>) -> Result<Vec<Mod>, Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager.reorder_mods(mod_order_data)
}

#[tauri::command]
pub async fn reorder_mods_by_remote_id(
  mod_order_data: Vec<(String, Vec<String>, u32)>,
) -> Result<Vec<(String, Vec<String>)>, Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager.reorder_mods_by_remote_id(mod_order_data)
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
    let url = format!("{}/artifacts/deadlock/gameinfo.gi", api_url);
    log::info!("Downloading vanilla gameinfo.gi from: {}", url);

    let client = reqwest::Client::new();
    let response =
      client.get(&url).send().await.map_err(|e| {
        Error::NetworkError(format!("Failed to download vanilla gameinfo.gi: {}", e))
      })?;

    if !response.status().is_success() {
      return Err(Error::NetworkError(format!(
        "Server returned error status: {}",
        response.status()
      )));
    }

    response
      .text()
      .await
      .map_err(|e| Error::NetworkError(format!("Failed to read response: {}", e)))?
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

#[tauri::command]
pub fn parse_vpk_file(
  file_path: String,
  include_full_file_hash: Option<bool>,
  include_merkle: Option<bool>,
) -> Result<VpkParsed, Error> {
  log::info!("Parsing VPK file: {}", file_path);

  let path = PathBuf::from(&file_path);

  // Read the VPK file
  let vpk_data = std::fs::read(&path).map_err(|e| {
    log::error!("Failed to read VPK file {}: {}", file_path, e);
    e
  })?;

  // Get file metadata
  let metadata = std::fs::metadata(&path).map_err(|e| {
    log::error!("Failed to get metadata for {}: {}", file_path, e);
    e
  })?;

  let last_modified = metadata
    .modified()
    .ok()
    .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
    .map(|duration| chrono::DateTime::from_timestamp(duration.as_secs() as i64, 0))
    .flatten();

  let options = VpkParseOptions {
    include_full_file_hash: include_full_file_hash.unwrap_or(false),
    file_path: file_path.clone(),
    last_modified,
    include_merkle: include_merkle.unwrap_or(false),
    include_entries: true, // Include entries for manual VPK parsing
  };

  let parsed = VpkParser::parse(vpk_data, options)
    .map_err(|e| Error::InvalidInput(format!("Failed to parse VPK file {}: {}", file_path, e)))?;

  log::info!(
    "Successfully parsed VPK: {} entries, version {}, manifest hash: {}",
    parsed.entries.len(),
    parsed.version,
    parsed.manifest_sha256
  );

  Ok(parsed)
}

#[tauri::command]
pub async fn check_addons_exist() -> Result<bool, Error> {
  let mod_manager = MANAGER.lock().unwrap();
  let game_path = match mod_manager.get_steam_manager().get_game_path() {
    Some(path) => path.clone(),
    None => return Ok(false),
  };
  drop(mod_manager);

  let addons_path = game_path.join("game").join("citadel").join("addons");

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
pub async fn analyze_local_addons(app_handle: AppHandle) -> Result<AnalyzeAddonsResult, Error> {
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
    .analyze_local_addons(game_path, Some(app_handle))
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
    .map_err(|e| Error::InvalidInput(format!("Failed to access store: {}", e)))?;

  store.set("auth_token", serde_json::json!(token));

  store
    .save()
    .map_err(|e| Error::InvalidInput(format!("Failed to save store: {}", e)))?;

  Ok(())
}

#[tauri::command]
pub async fn get_auth_token(app_handle: AppHandle) -> Result<Option<String>, Error> {
  log::debug!("Retrieving authentication token");

  let store = app_handle
    .store("state.json")
    .map_err(|e| Error::InvalidInput(format!("Failed to access store: {}", e)))?;

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
    .map_err(|e| Error::InvalidInput(format!("Failed to access store: {}", e)))?;

  let _ = store.delete("auth_token");

  store
    .save()
    .map_err(|e| Error::InvalidInput(format!("Failed to save store: {}", e)))?;

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
  .map_err(|e| Error::BackupCreationFailed(format!("Task join error: {}", e)))?
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
  log::info!(
    "Restoring addons backup: {} with strategy: {}",
    file_name,
    strategy
  );
  let mut mod_manager = MANAGER.lock().unwrap();
  let backup_manager = mod_manager.get_addons_backup_manager();
  let restore_strategy =
    crate::mod_manager::addons_backup_manager::RestoreStrategy::from_str(&strategy)?;
  backup_manager.restore_backup(&file_name, restore_strategy)
}

#[tauri::command]
pub async fn delete_addons_backup(file_name: String) -> Result<(), Error> {
  log::info!("Deleting addons backup: {}", file_name);
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
  log::info!("Getting addons backup info: {}", file_name);
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
) -> Result<(), Error> {
  log::info!(
    "Received download request for mod: {} with {} files",
    mod_id,
    files.len()
  );

  let app_local_data_dir = app_handle
    .path()
    .app_local_data_dir()
    .map_err(|e| Error::Tauri(e))?;

  let target_dir = app_local_data_dir.join("mods").join(&mod_id);

  let task = DownloadTask {
    mod_id,
    files,
    target_dir,
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
pub async fn replace_mod_vpks(
  mod_id: String,
  source_vpk_paths: Vec<String>,
  installed_vpks: Option<Vec<String>>,
) -> Result<(), Error> {
  log::info!(
    "Replacing VPK files for mod {}: {} files",
    mod_id,
    source_vpk_paths.len()
  );

  let source_paths: Vec<PathBuf> = source_vpk_paths.iter().map(|s| PathBuf::from(s)).collect();

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
  mod_manager.replace_mod_vpks(mod_id, source_paths, installed_vpks.unwrap_or_default())?;

  log::info!("VPK replacement command completed successfully");
  Ok(())
}

// Discord RPC Commands

#[tauri::command]
pub async fn set_discord_presence(
  state: State<'_, DiscordState>,
  application_id: String,
  activity: DiscordActivity,
) -> Result<(), Error> {
  log::info!("Setting Discord presence for app ID: {}", application_id);
  log::info!("Activity data: {:?}", activity);

  // Check if we need to create a new client
  let needs_new_client = {
    let client_lock = state
      .client
      .lock()
      .map_err(|e| Error::InvalidInput(format!("Failed to acquire Discord client lock: {}", e)))?;
    client_lock.is_none()
  };

  // If client doesn't exist, create a new one
  if needs_new_client {
    log::info!("No Discord client found, attempting to connect...");

    // Try multiple times to connect
    let mut connect_attempts = 0;
    let max_connect_attempts = 3;

    while connect_attempts < max_connect_attempts {
      match discord_rpc::connect_discord(&application_id) {
        Ok(client) => {
          log::info!("Successfully connected to Discord");

          // Store the client
          {
            let mut client_lock = state.client.lock().map_err(|e| {
              Error::InvalidInput(format!("Failed to acquire Discord client lock: {}", e))
            })?;
            *client_lock = Some(client);
          }

          // Wait a bit for the connection to stabilize
          tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
          break;
        }
        Err(e) => {
          connect_attempts += 1;
          log::warn!("Connection attempt {} failed: {}", connect_attempts, e);

          if connect_attempts < max_connect_attempts {
            tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
          }
        }
      }
    }

    if connect_attempts >= max_connect_attempts {
      log::error!(
        "Failed to connect to Discord after {} attempts",
        max_connect_attempts
      );
      log::info!("Discord might not be running or the Application ID might be invalid");
      return Err(Error::InvalidInput(
        "Failed to connect to Discord. Make sure Discord is running and you're logged in."
          .to_string(),
      ));
    }
  }

  // Set the presence
  let mut attempts = 0;
  let max_attempts = 3;

  while attempts < max_attempts {
    let result = {
      let mut client_lock = state.client.lock().map_err(|e| {
        Error::InvalidInput(format!("Failed to acquire Discord client lock: {}", e))
      })?;

      if let Some(client) = client_lock.as_mut() {
        log::info!("Setting Discord presence... (attempt {})", attempts + 1);
        discord_rpc::set_presence(client, activity.clone())
      } else {
        Err("No Discord client available".to_string())
      }
    };

    match result {
      Ok(_) => {
        log::info!("Discord presence set successfully");
        return Ok(());
      }
      Err(e) => {
        attempts += 1;
        log::warn!("Attempt {} failed to set Discord presence: {}", attempts, e);

        // If the IPC pipe was closed (Windows os error 232 or similar), try to reconnect once per attempt
        let should_reconnect = e.contains("pipe")
          || e.contains("Pipe")
          || e.contains("os error 232")
          || e.contains("Broken pipe");
        if should_reconnect {
          log::info!("Detected closed Discord IPC pipe. Reconnecting...");

          // Drop the old client and create a new one
          {
            let mut client_lock = state.client.lock().map_err(|e| {
              Error::InvalidInput(format!("Failed to acquire Discord client lock: {}", e))
            })?;
            *client_lock = None;
          }

          let mut reconnected = false;
          match discord_rpc::connect_discord(&application_id) {
            Ok(client) => {
              // Limit the mutex guard lifetime to this inner block
              {
                let mut guard = state.client.lock().map_err(|e| {
                  Error::InvalidInput(format!("Failed to acquire Discord client lock: {}", e))
                })?;
                *guard = Some(client);
              } // guard dropped here
              reconnected = true;
            }
            Err(conn_err) => {
              log::warn!("Reconnection attempt failed: {}", conn_err);
            }
          }

          if reconnected {
            // small delay to stabilize connection (no mutex guards held)
            tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
            log::info!("Reconnected to Discord IPC successfully");
          }
        }

        if attempts < max_attempts {
          tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        }
      }
    }
  }

  log::error!(
    "Failed to set Discord presence after {} attempts",
    max_attempts
  );
  Err(Error::InvalidInput(
    "Failed to set Discord presence after multiple attempts".to_string(),
  ))
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
