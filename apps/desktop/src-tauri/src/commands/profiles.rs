use crate::download_manager::DownloadTask;
use crate::errors::Error;
use crate::mod_manager::Mod;
use tauri::{AppHandle, Emitter, Manager};

use super::downloads::get_download_manager;
use super::mods::InstalledModInfo;
use super::state::MANAGER;

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

  if profile_folder.contains("..") || profile_folder.contains('/') || profile_folder.contains('\\')
  {
    return Err(Error::InvalidInput(
      "Invalid profile folder name".to_string(),
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

  let addons_canonical = addons_path
    .canonicalize()
    .map_err(|_| Error::UnauthorizedPath("Unable to resolve addons directory".to_string()))?;
  let profile_canonical = profile_path.canonicalize().map_err(|_| {
    Error::UnauthorizedPath(format!(
      "Unable to resolve profile path: {}",
      profile_path.display()
    ))
  })?;

  if !profile_canonical.starts_with(&addons_canonical) {
    return Err(Error::UnauthorizedPath(
      "Profile folder must be within addons directory".to_string(),
    ));
  }

  std::fs::remove_dir_all(&profile_canonical)?;
  log::info!("Deleted profile folder: {profile_canonical:?}");

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

    if path.is_dir()
      && let Some(folder_name) = path.file_name().and_then(|n| n.to_str())
      && folder_name.starts_with("profile_")
    {
      profile_folders.push(folder_name.to_string());
      log::debug!("Found profile folder: {folder_name}");
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
    let path = entry?.path();

    if path.is_file()
      && let Some(file_name) = path.file_name().and_then(|n| n.to_str())
      && file_name.ends_with(".vpk")
    {
      vpk_files.push(file_name.to_string());
      log::debug!("Found VPK file: {file_name}");
    }
  }

  log::info!("Found {} VPK files in profile", vpk_files.len());
  Ok(vpk_files)
}

fn resolve_profile_vpk_path(
  profile_folder: Option<String>,
  vpk_name: &str,
) -> Result<std::path::PathBuf, Error> {
  if vpk_name.is_empty()
    || vpk_name.contains('/')
    || vpk_name.contains('\\')
    || vpk_name.contains("..")
    || !vpk_name.to_lowercase().ends_with(".vpk")
  {
    return Err(Error::InvalidInput(format!(
      "Invalid VPK file name: {vpk_name}"
    )));
  }

  let mod_manager = MANAGER.lock().unwrap();
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?;

  let addons_path = game_path.join("game").join("citadel").join("addons");
  let target_dir = if let Some(folder) = profile_folder {
    addons_path.join(folder)
  } else {
    addons_path.clone()
  };

  let vpk_path = target_dir.join(vpk_name);

  let addons_canonical = addons_path
    .canonicalize()
    .map_err(|_| Error::UnauthorizedPath("Unable to resolve addons directory".to_string()))?;
  let vpk_canonical = vpk_path.canonicalize().map_err(|_| {
    Error::UnauthorizedPath(format!(
      "Unable to resolve VPK path: {}",
      vpk_path.display()
    ))
  })?;

  if !vpk_canonical.starts_with(&addons_canonical) {
    return Err(Error::UnauthorizedPath(
      "VPK file must be within addons directory".to_string(),
    ));
  }

  Ok(vpk_canonical)
}

#[tauri::command]
pub async fn delete_profile_vpk(
  profile_folder: Option<String>,
  vpk_name: String,
) -> Result<(), Error> {
  log::info!("Deleting VPK {vpk_name} from profile {profile_folder:?}");
  let vpk_path = resolve_profile_vpk_path(profile_folder, &vpk_name)?;
  std::fs::remove_file(&vpk_path)?;
  log::info!("Deleted VPK file: {vpk_path:?}");
  Ok(())
}

#[tauri::command]
pub async fn show_profile_vpk_in_folder(
  profile_folder: Option<String>,
  vpk_name: String,
) -> Result<(), Error> {
  log::info!("Revealing VPK {vpk_name} from profile {profile_folder:?}");
  let vpk_path = resolve_profile_vpk_path(profile_folder, &vpk_name)?;
  crate::utils::show_in_folder(vpk_path.to_string_lossy().as_ref())
}

#[tauri::command]
pub async fn import_profile_batch(
  app_handle: AppHandle,
  profile_name: String,
  _profile_description: String,
  profile_folder: String,
  mods: Vec<super::downloads::ProfileImportMod>,
  import_type: String,
) -> Result<super::downloads::ProfileImportResult, Error> {
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

  let final_profile_folder = if import_type == "create" {
    let now = std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .unwrap();
    let timestamp_ms = now.as_millis();
    let nanos = now.subsec_nanos();

    let random_part = format!("{:x}", nanos).chars().take(9).collect::<String>();

    let profile_id = format!("profile_{}_{}", timestamp_ms, random_part);

    create_profile_folder(profile_id, profile_name.clone()).await?
  } else {
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

  let mut download_results: Vec<Result<(), String>> = Vec::new();

  for (index, mod_data) in mods.iter().enumerate() {
    app_handle
      .emit(
        "profile-import-progress",
        super::downloads::ProfileImportProgressEvent {
          current_step: "downloading".to_string(),
          current_mod_index: index,
          total_mods,
          current_mod_name: mod_data.mod_name.clone(),
          overall_progress: (index as f64 / total_mods as f64) * 50.0,
        },
      )
      .ok();

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
      is_profile_import: true,
      file_tree: mod_data.file_tree.clone(),
    };

    let manager = get_download_manager(app_handle.clone()).await;
    manager.queue_download(task).await?;

    let mut download_complete = false;
    let mut download_error: Option<String> = None;
    let start_time = std::time::Instant::now();
    let timeout_duration = std::time::Duration::from_secs(600);

    while !download_complete && start_time.elapsed() < timeout_duration {
      tokio::time::sleep(std::time::Duration::from_millis(500)).await;

      match manager.get_download_status(&mod_data.mod_id).await {
        Ok(Some(status)) => {
          if status.status == "downloading" {
            continue;
          }
          download_complete = true;
        }
        Ok(None) => {
          download_complete = true;
        }
        Err(e) => {
          download_error = Some(format!("Failed to check download status: {:?}", e));
          break;
        }
      }
    }

    if download_complete && download_error.is_none() {
      let game_path = MANAGER
        .lock()
        .unwrap()
        .get_steam_manager()
        .get_game_path()
        .ok_or(Error::GamePathNotSet)?
        .clone();

      let verify_path = game_path
        .join("game")
        .join("citadel")
        .join("addons")
        .join(&final_profile_folder);

      let vpk_manager = crate::mod_manager::vpk_manager::VpkManager::new();
      let mut vpks_found = false;
      let max_retries = 10;
      let mut retry_delay_ms = 100;

      for attempt in 0..max_retries {
        match vpk_manager.find_prefixed_vpks(&verify_path, &mod_data.mod_id) {
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
            if attempt < max_retries - 1 {
              log::debug!(
                "VPKs not found yet for mod {} (attempt {}/{}), waiting {}ms",
                mod_data.mod_id,
                attempt + 1,
                max_retries,
                retry_delay_ms
              );
              tokio::time::sleep(std::time::Duration::from_millis(retry_delay_ms)).await;
              retry_delay_ms = std::cmp::min(retry_delay_ms * 2, 1000);
            }
          }
          Err(e) => {
            log::error!("Failed to check VPKs for mod {}: {:?}", mod_data.mod_id, e);
            download_results.push(Err(format!("Failed to verify download: {:?}", e)));
            vpks_found = true;
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

  let mut succeeded = Vec::new();
  let mut failed = Vec::new();
  let mut installed_mods = Vec::new();

  for (index, (mod_data, download_result)) in mods.iter().zip(download_results.iter()).enumerate() {
    app_handle
      .emit(
        "profile-import-progress",
        super::downloads::ProfileImportProgressEvent {
          current_step: "installing".to_string(),
          current_mod_index: index,
          total_mods,
          current_mod_name: mod_data.mod_name.clone(),
          overall_progress: 50.0 + (index as f64 / total_mods as f64) * 50.0,
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

    let install_result = {
      let mut mod_manager = MANAGER.lock().unwrap();
      let deadlock_mod = Mod {
        id: mod_data.mod_id.clone(),
        name: mod_data.mod_name.clone(),
        is_map: mod_data.is_map,
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

  app_handle
    .emit(
      "profile-import-progress",
      super::downloads::ProfileImportProgressEvent {
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

  Ok(super::downloads::ProfileImportResult {
    profile_folder: final_profile_folder,
    succeeded,
    failed,
    installed_mods,
  })
}
