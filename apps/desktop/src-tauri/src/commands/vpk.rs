use std::path::PathBuf;

use crate::app_runtime::AppHandle;
use crate::errors::Error;
use crate::mod_manager::{AddonAnalyzer, AnalyzeAddonsResult};
use vpk_parser::{VpkParseOptions, VpkParsed, VpkParser};

use super::state::MANAGER;

#[tauri::command]
pub fn parse_vpk_file(
  file_path: String,
  include_full_file_hash: Option<bool>,
  include_merkle: Option<bool>,
) -> Result<VpkParsed, Error> {
  log::info!("Parsing VPK file: {file_path}");

  let path = PathBuf::from(&file_path);

  let vpk_data = std::fs::read(&path).map_err(|e| {
    log::error!("Failed to read VPK file {file_path}: {e}");
    e
  })?;

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
    include_entries: true,
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
  let profile_base = match mod_manager.get_addons_path(profile_folder.as_deref()) {
    Ok(path) => path,
    Err(Error::GamePathNotSet) => return Ok(false),
    Err(error) => return Err(error),
  };
  drop(mod_manager);

  if !profile_base.exists() {
    return Ok(false);
  }
  let has_vpks = !vpkmanager::scan::scan_profile(&profile_base)?.is_empty();
  if has_vpks {
    log::info!("Found VPK file in addons folder");
  }
  Ok(has_vpks)
}

#[tauri::command]
pub async fn analyze_local_addons(
  app_handle: AppHandle,
  profile_folder: Option<String>,
) -> Result<AnalyzeAddonsResult, Error> {
  let game_path = {
    let mod_manager = MANAGER.lock().unwrap();
    match mod_manager.get_steam_manager().get_game_path() {
      Some(path) => path.clone(),
      None => return Err(Error::GamePathNotSet),
    }
  };

  let analyzer = AddonAnalyzer::new();
  let result = analyzer
    .analyze_local_addons(game_path, profile_folder, Some(app_handle))
    .await?;
  Ok(result)
}

#[tauri::command]
pub async fn clear_all_mods_data() -> Result<u64, Error> {
  let mod_manager = MANAGER.lock().unwrap();
  mod_manager.clear_all_mods_data()
}
