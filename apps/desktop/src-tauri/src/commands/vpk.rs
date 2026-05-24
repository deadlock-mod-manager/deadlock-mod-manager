use std::path::PathBuf;

use crate::errors::Error;
use crate::mod_manager::{AddonAnalyzer, AnalyzeAddonsResult};
use crate::app_runtime::AppHandle;
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
