use std::path::PathBuf;

use crate::errors::Error;
use crate::mod_manager::archive_extractor::ArchiveExtractor;

use super::state::MANAGER;

#[tauri::command]
pub async fn extract_archive(
  archive_path: String,
  target_path: String,
) -> Result<Vec<String>, Error> {
  log::info!("Extracting archive: {archive_path} to {target_path}");

  let archive_path = PathBuf::from(&archive_path);
  let target_path = PathBuf::from(&target_path);

  if !archive_path.exists() {
    return Err(Error::ModFileNotFound);
  }

  let mod_manager = MANAGER.lock().unwrap();
  let validated_target_path = mod_manager.validate_extract_target_path(&target_path)?;
  drop(mod_manager);

  std::fs::create_dir_all(&validated_target_path)?;

  let extractor = ArchiveExtractor::new();
  extractor.extract_archive(&archive_path, &validated_target_path)?;

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
pub async fn copy_selected_vpks_from_archive(
  mod_id: String,
  file_tree: crate::mod_manager::file_tree::ModFileTree,
  profile_folder: Option<String>,
  _is_map: bool,
) -> Result<(), Error> {
  use crate::mod_manager::archive_extractor::ArchiveExtractor;
  use crate::mod_manager::vpk_manager::VpkManager;

  log::info!(
    "Copying selected VPKs from extracted directory for mod: {} (profile: {profile_folder:?})",
    mod_id
  );

  let mod_manager = MANAGER.lock().unwrap();
  let mods_path = mod_manager.get_mods_store_path()?;
  let mod_dir = mods_path.join(&mod_id);

  let extracted_dir = mod_dir.join("extracted");

  if !extracted_dir.exists() {
    log::warn!("Extracted directory not found, falling back to archive extraction");

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

    std::fs::create_dir_all(&extracted_dir)?;
    log::info!("Extracting archive: {archive_path:?}");
    extractor.extract_archive(&archive_path, &extracted_dir)?;
  } else {
    log::info!("Using already-extracted directory: {extracted_dir:?}");
  }

  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?
    .clone();

  let destination_path = if let Some(ref folder) = profile_folder {
    game_path
      .join("game")
      .join("citadel")
      .join("addons")
      .join(folder)
  } else {
    game_path.join("game").join("citadel").join("addons")
  };

  if !destination_path.exists() {
    std::fs::create_dir_all(&destination_path)?;
  }

  drop(mod_manager);

  let vpk_manager = VpkManager::new();
  vpk_manager.copy_selected_vpks_with_prefix(
    &extracted_dir,
    &destination_path,
    &mod_id,
    &file_tree,
  )?;

  log::info!("Removing extracted directory: {extracted_dir:?}");
  std::fs::remove_dir_all(&extracted_dir)?;

  let extractor = ArchiveExtractor::new();
  for entry in std::fs::read_dir(&mod_dir)? {
    let entry = entry?;
    let path = entry.path();
    if extractor.is_supported_archive(&path) {
      log::info!("Removing archive: {path:?}");
      std::fs::remove_file(&path)?;
      break;
    }
  }

  log::info!("Successfully copied selected VPKs for mod: {}", mod_id);
  Ok(())
}

#[tauri::command]
pub async fn copy_local_mod_vpks(
  mod_id: String,
  profile_folder: Option<String>,
  _is_map: bool,
) -> Result<Vec<String>, Error> {
  use crate::mod_manager::vpk_manager::VpkManager;

  log::info!(
    "Copying VPKs from local mod files directory for mod: {} (profile: {profile_folder:?})",
    mod_id
  );

  let mod_manager = MANAGER.lock().unwrap();
  let mods_path = mod_manager.get_mods_store_path()?;
  let mod_dir = mods_path.join(&mod_id);
  let files_dir = mod_dir.join("files");

  if !files_dir.exists() {
    return Err(Error::ModFileNotFound);
  }

  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?
    .clone();

  let destination_path = if let Some(ref folder) = profile_folder {
    game_path
      .join("game")
      .join("citadel")
      .join("addons")
      .join(folder)
  } else {
    game_path.join("game").join("citadel").join("addons")
  };

  if !destination_path.exists() {
    std::fs::create_dir_all(&destination_path)?;
  }

  drop(mod_manager);

  let vpk_manager = VpkManager::new();
  let prefixed_vpks = vpk_manager.copy_vpks_with_prefix(&files_dir, &destination_path, &mod_id)?;

  if prefixed_vpks.is_empty() {
    log::warn!("No VPK files found in mod files directory: {files_dir:?}");
    return Err(Error::InvalidInput(
      "No VPK files found in mod directory".to_string(),
    ));
  }

  log::info!(
    "Successfully copied {} VPKs for local mod: {}",
    prefixed_vpks.len(),
    mod_id
  );
  Ok(prefixed_vpks)
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

#[tauri::command]
pub async fn read_dropped_mod_file(file_path: String) -> Result<Vec<u8>, Error> {
  let validated_path = crate::dropped_mod_file::validate_dropped_mod_file_path(&file_path)?;

  log::info!(
    "Reading dropped mod file from path: {}",
    validated_path.display()
  );

  tokio::fs::read(&validated_path).await.map_err(Error::from)
}
