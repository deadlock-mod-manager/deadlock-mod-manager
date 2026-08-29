use std::path::{Path, PathBuf};

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

  let extractor = ArchiveExtractor::new();
  extractor.extract_archive(&archive_path, &validated_target_path)?;

  let mut vpk_files = Vec::new();
  find_vpk_files(&validated_target_path, &mut vpk_files)?;

  log::info!("Extracted {} VPK files", vpk_files.len());
  Ok(vpk_files)
}

fn find_vpk_files(dir: &Path, vpk_files: &mut Vec<String>) -> Result<(), Error> {
  if dir.is_dir() {
    for entry in std::fs::read_dir(dir)? {
      let entry = entry?;
      let path = entry.path();

      if path.is_dir() {
        find_vpk_files(&path, vpk_files)?;
      } else if path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("vpk"))
        && let Some(file_name) = path.file_name()
      {
        vpk_files.push(file_name.to_string_lossy().to_string());
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
pub async fn import_path_backed_mod_file(
  file_path: String,
  mod_id: String,
) -> Result<Vec<String>, Error> {
  let source_path = crate::dropped_mod_file::validate_dropped_mod_file_path(&file_path)?;
  let (mod_dir, files_dir) = {
    let mod_manager = MANAGER.lock().unwrap();
    let mod_dir = mod_manager.get_validated_mod_folder_path(&mod_id)?;
    let files_dir = mod_manager.validate_extract_target_path(&mod_dir.join("files"))?;
    (mod_dir, files_dir)
  };

  log::info!(
    "Importing path-backed mod file without renderer bytes: {}",
    source_path.display()
  );

  tokio::task::spawn_blocking(move || {
    import_path_backed_mod_file_sync(&source_path, &mod_dir, &files_dir)
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}

fn import_path_backed_mod_file_sync(
  source_path: &Path,
  mod_dir: &Path,
  files_dir: &Path,
) -> Result<Vec<String>, Error> {
  let extension = source_path
    .extension()
    .and_then(|extension| extension.to_str())
    .map(str::to_ascii_lowercase)
    .ok_or_else(|| Error::InvalidInput("Mod file has no supported extension".to_string()))?;
  let file_name = source_path
    .file_name()
    .ok_or_else(|| Error::InvalidInput("Mod file path does not contain a file name".to_string()))?;
  let mut normalized_file_name = PathBuf::from(file_name);
  normalized_file_name.set_extension(&extension);

  if extension == "vpk" {
    let destination = files_dir.join(&normalized_file_name);
    std::fs::copy(source_path, &destination)?;
    return Ok(vec![normalized_file_name.to_string_lossy().to_string()]);
  }

  let staged_archive = mod_dir.join(&normalized_file_name);
  if staged_archive.exists() {
    return Err(Error::InvalidInput(format!(
      "Import staging path already exists: {}",
      staged_archive.display()
    )));
  }

  std::fs::copy(source_path, &staged_archive)?;
  let extraction_result = (|| {
    ArchiveExtractor::new().extract_archive(&staged_archive, files_dir)?;
    let mut vpk_files = Vec::new();
    find_vpk_files(files_dir, &mut vpk_files)?;
    Ok::<Vec<String>, Error>(vpk_files)
  })();

  match extraction_result {
    Ok(vpk_files) => {
      std::fs::remove_file(&staged_archive).map_err(|error| {
        Error::ModExtractionFailed(format!(
          "Import succeeded but the staged archive could not be removed at '{}': {error}",
          staged_archive.display()
        ))
      })?;
      log::info!(
        "Imported path-backed archive and removed staging file: {}",
        staged_archive.display()
      );
      Ok(vpk_files)
    }
    Err(error) => {
      if let Err(cleanup_error) = clear_partial_extraction(files_dir) {
        log::warn!(
          "Failed to clear partial extraction at '{}': {cleanup_error}",
          files_dir.display()
        );
      }

      log::error!(
        "Path-backed archive import failed; recoverable archive retained at '{}': {error}",
        staged_archive.display()
      );
      Err(Error::ModExtractionFailed(format!(
        "{error}. The staged archive was retained at '{}' for recovery",
        staged_archive.display()
      )))
    }
  }
}

fn clear_partial_extraction(files_dir: &Path) -> Result<(), Error> {
  if files_dir.exists() {
    std::fs::remove_dir_all(files_dir)?;
  }
  std::fs::create_dir_all(files_dir)?;
  Ok(())
}

#[cfg(test)]
mod path_backed_import_tests {
  use super::import_path_backed_mod_file_sync;
  use crate::errors::Error;
  use std::fs;
  use std::io::Write;

  fn create_import_dirs() -> (tempfile::TempDir, std::path::PathBuf, std::path::PathBuf) {
    let temp = tempfile::tempdir().expect("temp directory should be created");
    let mod_dir = temp.path().join("local-test");
    let files_dir = mod_dir.join("files");
    fs::create_dir_all(&files_dir).expect("mod files directory should be created");
    (temp, mod_dir, files_dir)
  }

  #[test]
  fn copies_vpk_directly_into_the_mod_files_directory() {
    let (temp, mod_dir, files_dir) = create_import_dirs();
    let source = temp.path().join("hero.vpk");
    fs::write(&source, b"vpk payload").expect("source VPK should be written");

    let imported = import_path_backed_mod_file_sync(&source, &mod_dir, &files_dir)
      .expect("path-backed VPK should import");

    assert_eq!(imported, vec!["hero.vpk"]);
    assert_eq!(
      fs::read(files_dir.join("hero.vpk")).expect("copied VPK should be readable"),
      b"vpk payload"
    );
  }

  #[test]
  fn removes_a_successfully_extracted_staging_archive() {
    let (temp, mod_dir, files_dir) = create_import_dirs();
    let source = temp.path().join("hero.zip");
    let zip_file = fs::File::create(&source).expect("ZIP should be created");
    let mut zip = zip::ZipWriter::new(zip_file);
    zip
      .start_file("nested/hero.vpk", zip::write::SimpleFileOptions::default())
      .expect("ZIP entry should start");
    zip
      .write_all(b"vpk payload")
      .expect("ZIP entry should be written");
    zip.finish().expect("ZIP should finish");

    let imported = import_path_backed_mod_file_sync(&source, &mod_dir, &files_dir)
      .expect("path-backed ZIP should import");

    assert_eq!(imported, vec!["hero.vpk"]);
    assert!(files_dir.join("nested/hero.vpk").exists());
    assert!(!mod_dir.join("hero.zip").exists());
  }

  #[test]
  fn retains_a_failed_archive_and_clears_partial_output() {
    let (temp, mod_dir, files_dir) = create_import_dirs();
    let source = temp.path().join("broken.zip");
    fs::write(&source, b"not a zip").expect("invalid ZIP should be written");
    fs::write(files_dir.join("partial.txt"), b"partial").expect("partial output should be written");

    let error = import_path_backed_mod_file_sync(&source, &mod_dir, &files_dir)
      .expect_err("invalid ZIP should fail");

    assert!(matches!(error, Error::ModExtractionFailed(message) if message.contains("retained")));
    assert!(mod_dir.join("broken.zip").exists());
    assert_eq!(
      fs::read_dir(&files_dir)
        .expect("files directory should remain readable")
        .count(),
      0
    );
  }
}
