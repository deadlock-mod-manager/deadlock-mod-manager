use std::path::PathBuf;

use crate::errors::Error;
use crate::mod_manager::archive_extractor::ArchiveExtractor;
use crate::mod_manager::file_tree::{ModFile, ModFileTree};
use crate::mod_manager::filesystem_helper::FileSystemHelper;
use crate::mod_manager::vpk_manager::VpkManager;
use crate::mod_manager::vpk_manifest::ProfileVpkManifest;
use crate::mod_manager::Mod;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use super::downloads::get_download_manager;
use super::fonts::{apply_font_cleanup, prepare_font_cleanup};
use super::state::MANAGER;
use crate::download_manager::{DownloadFileDto, DownloadTask};

const ALLOWED_DOWNLOAD_HOSTS: &[&str] = &["gamebanana.com", "deadlockmods.app"];

fn sanitize_archive_name(name: &str) -> Result<String, Error> {
  if name.is_empty() {
    return Err(Error::InvalidInput(
      "Archive name cannot be empty".to_string(),
    ));
  }
  if name.contains('/') || name.contains('\\') || name.contains("..") {
    return Err(Error::InvalidInput(format!(
      "Archive name contains path separators or parent components: {name}"
    )));
  }
  let path = std::path::Path::new(name);
  match path.file_name().and_then(|f| f.to_str()) {
    Some(f) if f == name => Ok(f.to_string()),
    _ => Err(Error::InvalidInput(format!(
      "Invalid archive name: {name}"
    ))),
  }
}

fn validate_download_url(url: &str) -> Result<(), Error> {
  let parsed = reqwest::Url::parse(url)
    .map_err(|e| Error::InvalidInput(format!("Invalid download URL: {e}")))?;

  match parsed.scheme() {
    "http" | "https" => {}
    scheme => {
      return Err(Error::InvalidInput(format!(
        "Download URL scheme must be http or https, got: {scheme}"
      )));
    }
  }

  let host = parsed
    .host_str()
    .ok_or_else(|| Error::InvalidInput(format!("Download URL has no host: {url}")))?;

  let is_allowed = ALLOWED_DOWNLOAD_HOSTS.iter().any(|allowed| {
    host == *allowed || host.ends_with(&format!(".{allowed}"))
  });

  if !is_allowed {
    return Err(Error::InvalidInput(format!(
      "Download URL host not in allowlist: {host}"
    )));
  }

  Ok(())
}

#[tauri::command]
pub async fn install_mod(deadlock_mod: Mod, profile_folder: Option<String>) -> Result<Mod, Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager.install_mod(deadlock_mod, profile_folder)
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
  let game_path = {
    let mod_manager = MANAGER.lock().unwrap();
    mod_manager.get_steam_manager().get_game_path().cloned()
  };

  let prepared_font_cleanup = if let Some(game_path) = game_path.as_ref() {
    prepare_font_cleanup(game_path, &mod_id)?
  } else {
    log::warn!("Skipping font cleanup for mod {mod_id}: game path not configured");
    None
  };

  {
    let mut mod_manager = MANAGER.lock().unwrap();
    mod_manager.purge_mod(mod_id.clone(), vpks, profile_folder)?;
  }

  if let Some(cleanup) = prepared_font_cleanup {
    apply_font_cleanup(cleanup)?;
  }

  Ok(())
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
pub async fn clear_mods(profile_folder: Option<String>) -> Result<(), Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager.clear_mods(profile_folder)
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchUpdateMod {
  pub mod_id: String,
  pub mod_name: String,
  pub download_files: Vec<DownloadFileDto>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub file_tree: Option<ModFileTree>,
  #[serde(default)]
  pub installed_vpks: Vec<String>,
  #[serde(default)]
  pub is_map: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchUpdateResult {
  pub backup_name: String,
  pub succeeded: Vec<String>,
  pub failed: Vec<(String, String)>,
  pub installed_mods: Vec<InstalledModInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchUpdateProgressEvent {
  pub current_step: String,
  pub current_mod_index: usize,
  pub total_mods: usize,
  pub current_mod_name: String,
  pub overall_progress: f64,
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

#[tauri::command]
pub async fn batch_update_mods(
  app_handle: AppHandle,
  mods: Vec<BatchUpdateMod>,
  profile_folder: String,
  skip_backup: bool,
  max_backups: u32,
) -> Result<BatchUpdateResult, Error> {
  use crate::mod_manager::addons_backup_manager::AddonsBackupManager;

  log::info!(
    "Starting batch mod update: {} mods, profile: {}, skip_backup: {}, max_backups: {}",
    mods.len(),
    profile_folder,
    skip_backup,
    max_backups
  );

  let total_mods = mods.len();
  if total_mods == 0 {
    return Err(Error::InvalidInput(
      "No mods provided for update".to_string(),
    ));
  }

  let (addons_path, filename) = {
    let mut mod_manager = MANAGER.lock().unwrap();
    mod_manager.set_backup_manager_app_handle(app_handle.clone());
    let backup_manager = mod_manager.get_addons_backup_manager();

    let addons_path = backup_manager.get_addons_path()?;
    let filename = backup_manager.generate_backup_filename();

    (addons_path, filename)
  };

  if !skip_backup {
    log::info!("Creating addons backup before updating mods");

    let backup_dir = {
      let mut mod_manager = MANAGER.lock().unwrap();
      let backup_manager = mod_manager.get_addons_backup_manager();
      backup_manager.get_backup_directory()?
    };

    let backup_result = tokio::task::spawn_blocking({
      let addons_path = addons_path.clone();
      let filename = filename.clone();
      let app_handle = app_handle.clone();
      move || {
        AddonsBackupManager::create_backup_async(addons_path, backup_dir, filename, app_handle)
      }
    })
    .await;

    match backup_result {
      Ok(Ok(_)) => log::info!("Backup created successfully: {}", filename),
      Ok(Err(e)) => {
        log::error!("Failed to create backup: {:?}", e);
        return Err(Error::BackupCreationFailed(format!(
          "Failed to create backup before update: {:?}",
          e
        )));
      }
      Err(e) => {
        log::error!("Failed to spawn backup task: {:?}", e);
        return Err(Error::BackupCreationFailed(format!(
          "Failed to create backup before update: {:?}",
          e
        )));
      }
    }

    if max_backups > 0 {
      let mut mod_manager = MANAGER.lock().unwrap();
      let backup_manager = mod_manager.get_addons_backup_manager();
      if let Err(e) = backup_manager.prune_old_backups(max_backups) {
        log::error!("Failed to prune old backups: {:?}", e);
      }
    }
  } else {
    log::info!("Skipping addons backup (disabled by user)");
  }

  let mut succeeded = Vec::new();
  let mut failed = Vec::new();
  let mut installed_mods = Vec::new();

  for (index, mod_data) in mods.iter().enumerate() {
    let progress_pct = (index as f64 / total_mods as f64) * 100.0;

    app_handle
      .emit(
        "batch-update-progress",
        BatchUpdateProgressEvent {
          current_step: "cleaning".to_string(),
          current_mod_index: index,
          total_mods,
          current_mod_name: mod_data.mod_name.clone(),
          overall_progress: progress_pct,
        },
      )
      .ok();

    let addons_path_for_profile = if profile_folder.is_empty() {
      addons_path.clone()
    } else {
      addons_path.join(&profile_folder)
    };

    let vpk_manager = crate::mod_manager::vpk_manager::VpkManager::new();
    let cleanup_result = vpk_manager
      .find_prefixed_vpks(&addons_path_for_profile, &mod_data.mod_id)
      .and_then(|old_vpks| {
        for vpk in &old_vpks {
          let vpk_path = addons_path_for_profile.join(vpk);
          if vpk_path.exists() {
            std::fs::remove_file(&vpk_path)?;
            log::info!("Removed old prefixed VPK: {:?}", vpk_path);
          }
        }
        Ok(old_vpks.len())
      });

    match cleanup_result {
      Ok(count) => log::info!("Removed {} old VPKs for mod {}", count, mod_data.mod_id),
      Err(e) => {
        log::error!(
          "Failed to remove old VPKs for mod {}: {:?}",
          mod_data.mod_id,
          e
        );
        failed.push((
          mod_data.mod_id.clone(),
          format!("Failed to remove old VPKs: {:?}", e),
        ));
        continue;
      }
    }

    let installed_vpk_cleanup_result: Result<usize, Error> = {
      let mut mod_manager = MANAGER.lock().unwrap();
      if let Some(existing_mod) = mod_manager
        .get_mod_repository()
        .get_mod(&mod_data.mod_id)
        .cloned()
      {
        let mut removed_count = 0;
        for vpk in &existing_mod.installed_vpks {
          let vpk_path = addons_path_for_profile.join(vpk);
          if vpk_path.exists() {
            if let Err(e) = std::fs::remove_file(&vpk_path) {
              log::error!("Failed to remove installed VPK {:?}: {:?}", vpk_path, e);
            } else {
              log::info!("Removed old installed VPK: {:?}", vpk_path);
              removed_count += 1;
            }
          }
        }
        mod_manager
          .get_mod_repository_mut()
          .remove_mod(&mod_data.mod_id);
        Ok(removed_count)
      } else {
        Ok(0)
      }
    };

    let repo_cleanup_count = match installed_vpk_cleanup_result {
      Ok(count) if count > 0 => {
        log::info!(
          "Removed {} currently installed VPKs for mod {}",
          count,
          mod_data.mod_id
        );
        count
      }
      Ok(_) => {
        log::debug!(
          "No currently installed VPKs to remove for mod {}",
          mod_data.mod_id
        );
        0
      }
      Err(e) => {
        log::warn!(
          "Error during installed VPK cleanup for mod {}: {:?}",
          mod_data.mod_id,
          e
        );
        0
      }
    };

    let prefixed_cleanup_count = cleanup_result.unwrap_or(0);
    if prefixed_cleanup_count == 0
      && repo_cleanup_count == 0
      && !mod_data.installed_vpks.is_empty()
    {
      log::info!(
        "Using frontend-provided VPK list for cleanup of mod {} ({} VPKs)",
        mod_data.mod_id,
        mod_data.installed_vpks.len()
      );
      for vpk in &mod_data.installed_vpks {
        let vpk_filename = std::path::Path::new(vpk)
          .file_name()
          .map(|f| f.to_string_lossy().to_string())
          .unwrap_or_else(|| vpk.clone());
        let vpk_path = addons_path_for_profile.join(&vpk_filename);
        if vpk_path.exists() {
          if let Err(e) = std::fs::remove_file(&vpk_path) {
            log::error!(
              "Failed to remove frontend-provided VPK {:?}: {:?}",
              vpk_path,
              e
            );
          } else {
            log::info!("Removed frontend-provided installed VPK: {:?}", vpk_path);
          }
        }
      }
    }

    app_handle
      .emit(
        "batch-update-progress",
        BatchUpdateProgressEvent {
          current_step: "downloading".to_string(),
          current_mod_index: index,
          total_mods,
          current_mod_name: mod_data.mod_name.clone(),
          overall_progress: progress_pct + (1.0 / total_mods as f64) * 30.0,
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
      profile_folder: if profile_folder.is_empty() {
        None
      } else {
        Some(profile_folder.clone())
      },
      is_profile_import: false,
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

    if !download_complete || download_error.is_some() {
      let err_msg = download_error.unwrap_or_else(|| "Download timeout".to_string());
      log::error!("Download failed for mod {}: {}", mod_data.mod_id, err_msg);
      failed.push((mod_data.mod_id.clone(), err_msg));
      continue;
    }

    let mut vpks_found = false;
    let max_retries = 10;
    let mut retry_delay_ms = 100;

    for attempt in 0..max_retries {
      match vpk_manager.find_prefixed_vpks(&addons_path_for_profile, &mod_data.mod_id) {
        Ok(vpks) if !vpks.is_empty() => {
          log::info!(
            "Download completed for mod: {} (found {} VPKs after {} attempts)",
            mod_data.mod_id,
            vpks.len(),
            attempt + 1
          );
          vpks_found = true;
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
          failed.push((
            mod_data.mod_id.clone(),
            format!("Failed to verify download: {:?}", e),
          ));
          break;
        }
      }
    }

    if !vpks_found {
      if !failed.iter().any(|(id, _)| id == &mod_data.mod_id) {
        log::error!(
          "Download completed but no VPKs found for mod: {} after {} retries",
          mod_data.mod_id,
          max_retries
        );
        failed.push((
          mod_data.mod_id.clone(),
          "Download completed but no VPKs found".to_string(),
        ));
      }
      continue;
    }

    app_handle
      .emit(
        "batch-update-progress",
        BatchUpdateProgressEvent {
          current_step: "installing".to_string(),
          current_mod_index: index,
          total_mods,
          current_mod_name: mod_data.mod_name.clone(),
          overall_progress: progress_pct + (1.0 / total_mods as f64) * 80.0,
        },
      )
      .ok();

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

      mod_manager.install_mod(
        deadlock_mod,
        if profile_folder.is_empty() {
          None
        } else {
          Some(profile_folder.clone())
        },
      )
    };

    match install_result {
      Ok(installed_mod) => {
        log::info!("Successfully updated mod: {}", mod_data.mod_id);
        succeeded.push(mod_data.mod_id.clone());

        installed_mods.push(InstalledModInfo {
          mod_id: installed_mod.id.clone(),
          mod_name: installed_mod.name.clone(),
          installed_vpks: installed_mod.installed_vpks.clone(),
          file_tree: installed_mod.file_tree.clone(),
        });
      }
      Err(e) => {
        log::error!("Failed to install updated mod {}: {:?}", mod_data.mod_id, e);
        failed.push((mod_data.mod_id.clone(), format!("{:?}", e)));
      }
    }
  }

  app_handle
    .emit(
      "batch-update-progress",
      BatchUpdateProgressEvent {
        current_step: "complete".to_string(),
        current_mod_index: total_mods,
        total_mods,
        current_mod_name: String::new(),
        overall_progress: 100.0,
      },
    )
    .ok();

  log::info!(
    "Batch mod update completed: {} succeeded, {} failed",
    succeeded.len(),
    failed.len()
  );

  Ok(BatchUpdateResult {
    backup_name: filename,
    succeeded,
    failed,
    installed_mods,
  })
}

#[tauri::command]
pub async fn register_analyzed_mod(
  mod_id: String,
  mod_name: String,
  installed_vpks: Vec<String>,
  profile_folder: Option<String>,
) -> Result<(), Error> {
  let mut mod_manager = MANAGER.lock().unwrap();

  if mod_manager.get_mod_repository().get_mod(&mod_id).is_none() {
    log::info!(
      "Registering analyzed mod in repository: {} ({}) with {} VPKs (profile: {profile_folder:?})",
      mod_name,
      mod_id,
      installed_vpks.len()
    );
    let deadlock_mod = Mod {
      id: mod_id.clone(),
      name: mod_name,
      is_map: false,
      installed_vpks: installed_vpks.clone(),
      file_tree: None,
      install_order: None,
      original_vpk_names: Vec::new(),
    };
    mod_manager.get_mod_repository_mut().add_mod(deadlock_mod);
  } else {
    log::debug!("Mod {} already registered in repository, skipping", mod_id);
  }

  let addons_path = mod_manager.get_addons_path(profile_folder.as_deref())?;
  let mut manifest = ProfileVpkManifest::load(&addons_path)?;
  if !manifest.mods.contains_key(&mod_id) {
    manifest.mark_enabled(&mod_id, installed_vpks, Vec::new(), None);
    manifest.save(&addons_path)?;
    log::info!("Persisted analyzed mod {mod_id} to profile manifest");
  }

  Ok(())
}

fn resolve_addons_path(
  game_path: &std::path::Path,
  profile_folder: Option<&str>,
) -> PathBuf {
  let base = game_path.join("game").join("citadel").join("addons");
  match profile_folder {
    Some(folder) => base.join(folder),
    None => base,
  }
}

fn build_options_file_tree(
  available_originals: &[String],
  selected_originals: &std::collections::HashSet<String>,
) -> ModFileTree {
  let files: Vec<ModFile> = available_originals
    .iter()
    .map(|name| ModFile {
      name: name.clone(),
      path: name.clone(),
      size: 0,
      is_selected: selected_originals.contains(name),
      archive_name: String::new(),
    })
    .collect();
  let total_files = files.len();
  ModFileTree {
    files,
    total_files,
    has_multiple_files: total_files > 1,
  }
}

#[tauri::command]
pub async fn get_mod_available_options(
  mod_id: String,
  profile_folder: Option<String>,
  current_installed_vpks: Vec<String>,
  current_original_names: Vec<String>,
) -> Result<ModFileTree, Error> {
  log::info!(
    "Getting available options for mod {mod_id} (profile: {profile_folder:?}, currently enabled: {})",
    current_installed_vpks.len()
  );

  let game_path = {
    let manager = MANAGER.lock().unwrap();
    manager
      .get_steam_manager()
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?
      .clone()
  };
  let addons_path = resolve_addons_path(&game_path, profile_folder.as_deref());

  if !addons_path.exists() {
    return Err(Error::GamePathNotSet);
  }

  let vpk_manager = VpkManager::new();
  let prefixed_vpks = vpk_manager.find_prefixed_vpks(&addons_path, &mod_id)?;

  let prefix = format!("{mod_id}_");
  let disabled_originals: Vec<String> = prefixed_vpks
    .iter()
    .filter_map(|name| name.strip_prefix(&prefix).map(|s| s.to_string()))
    .collect();

  let enabled_originals: Vec<String> = current_installed_vpks
    .iter()
    .enumerate()
    .map(|(i, vpk)| {
      current_original_names
        .get(i)
        .cloned()
        .unwrap_or_else(|| vpk.clone())
    })
    .collect();

  let mut available: Vec<String> = enabled_originals.clone();
  for name in disabled_originals {
    if !available.contains(&name) {
      available.push(name);
    }
  }
  available.sort();

  let selected_set: std::collections::HashSet<String> =
    enabled_originals.into_iter().collect();
  Ok(build_options_file_tree(&available, &selected_set))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwapModOptionsResult {
  pub installed_vpks: Vec<String>,
  pub original_vpk_names: Vec<String>,
  pub file_tree: ModFileTree,
}

#[tauri::command]
pub async fn swap_mod_options(
  mod_id: String,
  profile_folder: Option<String>,
  current_installed_vpks: Vec<String>,
  current_original_names: Vec<String>,
  selected_original_names: Vec<String>,
) -> Result<SwapModOptionsResult, Error> {
  log::info!(
    "Swapping options for mod {mod_id} (profile: {profile_folder:?}): {} -> {} files",
    current_installed_vpks.len(),
    selected_original_names.len()
  );

  if selected_original_names.is_empty() {
    return Err(Error::InvalidInput(
      "At least one VPK file must be selected. To remove the mod, disable it instead.".into(),
    ));
  }

  let game_path = {
    let manager = MANAGER.lock().unwrap();
    manager
      .get_steam_manager()
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?
      .clone()
  };
  let addons_path = resolve_addons_path(&game_path, profile_folder.as_deref());

  let vpk_manager = VpkManager::new();
  let new_installed_vpks = vpk_manager.swap_enabled_vpks(
    &addons_path,
    &mod_id,
    &current_installed_vpks,
    &current_original_names,
    &selected_original_names,
  )?;

  let prefixed_vpks = vpk_manager.find_prefixed_vpks(&addons_path, &mod_id)?;
  let prefix = format!("{mod_id}_");
  let disabled_originals: Vec<String> = prefixed_vpks
    .iter()
    .filter_map(|name| name.strip_prefix(&prefix).map(|s| s.to_string()))
    .collect();

  let mut available: Vec<String> = selected_original_names.clone();
  for name in disabled_originals {
    if !available.contains(&name) {
      available.push(name);
    }
  }
  available.sort();

  let selected_set: std::collections::HashSet<String> =
    selected_original_names.iter().cloned().collect();
  let file_tree = build_options_file_tree(&available, &selected_set);

  {
    let mut manager = MANAGER.lock().unwrap();
    if let Some(existing) = manager.get_mod_repository().get_mod(&mod_id).cloned() {
      let mut updated = existing;
      updated.installed_vpks = new_installed_vpks.clone();
      updated.original_vpk_names = selected_original_names.clone();
      updated.file_tree = Some(file_tree.clone());
      manager.get_mod_repository_mut().add_mod(updated);
    }
  }

  Ok(SwapModOptionsResult {
    installed_vpks: new_installed_vpks,
    original_vpk_names: selected_original_names,
    file_tree,
  })
}

#[derive(Debug, Clone, Deserialize)]
pub struct MissingVariantArchive {
  pub url: String,
  pub archive_name: String,
  pub wanted_originals: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FetchMissingModVariantsResult {
  pub staged_originals: Vec<String>,
  pub skipped_originals: Vec<String>,
  pub missing_originals: Vec<String>,
}

#[tauri::command]
pub async fn fetch_missing_mod_variants(
  mod_id: String,
  profile_folder: Option<String>,
  archives: Vec<MissingVariantArchive>,
) -> Result<FetchMissingModVariantsResult, Error> {
  use std::collections::HashSet;

  log::info!(
    "Fetching missing mod variants for {mod_id} (profile: {profile_folder:?}, {} archives)",
    archives.len()
  );

  let game_path = {
    let manager = MANAGER.lock().unwrap();
    manager
      .get_steam_manager()
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?
      .clone()
  };
  let addons_path = resolve_addons_path(&game_path, profile_folder.as_deref());

  if !addons_path.exists() {
    return Err(Error::GamePathNotSet);
  }

  let vpk_manager = VpkManager::new();
  let prefix = format!("{mod_id}_");

  let existing_disabled: HashSet<String> = vpk_manager
    .find_prefixed_vpks(&addons_path, &mod_id)?
    .into_iter()
    .filter_map(|n| n.strip_prefix(&prefix).map(|s| s.to_string()))
    .collect();

  let mut staged: Vec<String> = Vec::new();
  let mut skipped: Vec<String> = Vec::new();
  let mut missing: Vec<String> = Vec::new();

  let client = reqwest::Client::builder()
    .build()
    .map_err(|e| Error::Network(format!("Failed to build HTTP client: {e}")))?;

  for archive in archives {
    let to_fetch: Vec<String> = archive
      .wanted_originals
      .iter()
      .filter(|name| !existing_disabled.contains(*name) && !staged.contains(name))
      .cloned()
      .collect();

    for name in &archive.wanted_originals {
      if existing_disabled.contains(name) || staged.contains(name) {
        skipped.push(name.clone());
      }
    }

    if to_fetch.is_empty() {
      log::info!(
        "Archive {} has no missing originals to fetch (all already staged)",
        archive.archive_name
      );
      continue;
    }

    validate_download_url(&archive.url)?;
    let safe_archive_name = sanitize_archive_name(&archive.archive_name)?;

    log::info!(
      "Downloading archive {} from {} for {} missing originals",
      safe_archive_name,
      archive.url,
      to_fetch.len()
    );

    let response = client
      .get(&archive.url)
      .send()
      .await
      .map_err(|e| Error::Network(format!("Failed to fetch {}: {e}", archive.url)))?;

    if !response.status().is_success() {
      return Err(Error::DownloadFailed(format!(
        "{} returned status {}",
        archive.url,
        response.status()
      )));
    }

    let bytes = response
      .bytes()
      .await
      .map_err(|e| Error::DownloadFailed(format!("Failed reading body for {}: {e}", archive.url)))?;

    let temp_dir = tempfile::tempdir()?;
    let archive_path = temp_dir.path().join(&safe_archive_name);
    std::fs::write(&archive_path, &bytes)?;

    let extract_dir = temp_dir.path().join("extracted");
    std::fs::create_dir_all(&extract_dir)?;

    let extractor = ArchiveExtractor::new();
    extractor.extract_archive(&archive_path, &extract_dir)?;

    let filesystem = FileSystemHelper::new();
    let vpk_files = filesystem.find_files_recursive(&extract_dir, "vpk")?;

    let mut by_name: std::collections::HashMap<String, std::path::PathBuf> =
      std::collections::HashMap::new();
    for (path, _) in vpk_files {
      if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
        by_name.insert(name.to_string(), path);
      }
    }

    for original in to_fetch {
      match by_name.get(&original) {
        Some(src) => {
          let dest = addons_path.join(format!("{mod_id}_{original}"));
          filesystem.copy_file(src, &dest)?;
          log::info!("Staged missing VPK {original} -> {}", dest.display());
          staged.push(original);
        }
        None => {
          log::warn!(
            "Requested VPK {original} not found in archive {}",
            archive.archive_name
          );
          missing.push(original);
        }
      }
    }
  }

  Ok(FetchMissingModVariantsResult {
    staged_originals: staged,
    skipped_originals: skipped,
    missing_originals: missing,
  })
}

#[derive(Debug, Clone, Serialize)]
pub struct StageDownloadArchiveResult {
  pub staged_originals: Vec<String>,
}

#[tauri::command]
pub async fn stage_download_archive(
  mod_id: String,
  profile_folder: Option<String>,
  archive_url: String,
  archive_name: String,
) -> Result<StageDownloadArchiveResult, Error> {
  log::info!(
    "Staging download archive for {mod_id} (profile: {profile_folder:?}): {archive_name}"
  );

  let game_path = {
    let manager = MANAGER.lock().unwrap();
    manager
      .get_steam_manager()
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?
      .clone()
  };
  let addons_path = resolve_addons_path(&game_path, profile_folder.as_deref());

  if !addons_path.exists() {
    return Err(Error::GamePathNotSet);
  }

  validate_download_url(&archive_url)?;
  let safe_archive_name = sanitize_archive_name(&archive_name)?;

  let client = reqwest::Client::builder()
    .build()
    .map_err(|e| Error::Network(format!("Failed to build HTTP client: {e}")))?;

  let response = client
    .get(&archive_url)
    .send()
    .await
    .map_err(|e| Error::Network(format!("Failed to fetch {}: {e}", archive_url)))?;

  if !response.status().is_success() {
    return Err(Error::DownloadFailed(format!(
      "{} returned status {}",
      archive_url,
      response.status()
    )));
  }

  let bytes = response
    .bytes()
    .await
    .map_err(|e| Error::DownloadFailed(format!("Failed reading body for {}: {e}", archive_url)))?;

  let temp_dir = tempfile::tempdir()?;
  let archive_path = temp_dir.path().join(&safe_archive_name);
  std::fs::write(&archive_path, &bytes)?;

  let extract_dir = temp_dir.path().join("extracted");
  std::fs::create_dir_all(&extract_dir)?;

  let extractor = ArchiveExtractor::new();
  extractor.extract_archive(&archive_path, &extract_dir)?;

  let filesystem = FileSystemHelper::new();
  let vpk_files = filesystem.find_files_recursive(&extract_dir, "vpk")?;

  if vpk_files.is_empty() {
    return Err(Error::InvalidInput(format!(
      "No VPK files found in archive {safe_archive_name}"
    )));
  }

  let prefix = format!("{mod_id}_");
  let mut staged: Vec<String> = Vec::new();

  for (path, _) in &vpk_files {
    if let Some(original) = path.file_name().and_then(|s| s.to_str()) {
      let dest = addons_path.join(format!("{prefix}{original}"));
      if dest.exists() {
        log::info!("Skipping already-staged VPK: {original}");
        staged.push(original.to_string());
        continue;
      }
      filesystem.copy_file(path, &dest)?;
      log::info!("Staged VPK {original} -> {}", dest.display());
      staged.push(original.to_string());
    }
  }

  log::info!(
    "Staged {} VPK(s) from archive {archive_name}: {:?}",
    staged.len(),
    staged
  );

  Ok(StageDownloadArchiveResult {
    staged_originals: staged,
  })
}

#[derive(Debug, Clone, Serialize)]
pub struct SwitchDownloadVariantResult {
  pub installed_vpks: Vec<String>,
  pub original_vpk_names: Vec<String>,
  pub file_tree: ModFileTree,
}

#[tauri::command]
pub async fn switch_mod_download_variant(
  mod_id: String,
  profile_folder: Option<String>,
  archive_url: String,
  archive_name: String,
  current_installed_vpks: Vec<String>,
  current_original_names: Vec<String>,
) -> Result<SwitchDownloadVariantResult, Error> {
  log::info!(
    "Switching download variant for {mod_id} (profile: {profile_folder:?}) to archive {archive_name}"
  );

  let game_path = {
    let manager = MANAGER.lock().unwrap();
    manager
      .get_steam_manager()
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?
      .clone()
  };
  let addons_path = resolve_addons_path(&game_path, profile_folder.as_deref());

  if !addons_path.exists() {
    return Err(Error::GamePathNotSet);
  }

  validate_download_url(&archive_url)?;
  let safe_archive_name = sanitize_archive_name(&archive_name)?;

  log::info!("Downloading archive {} from {}", safe_archive_name, archive_url);

  let client = reqwest::Client::builder()
    .build()
    .map_err(|e| Error::Network(format!("Failed to build HTTP client: {e}")))?;

  let response = client
    .get(&archive_url)
    .send()
    .await
    .map_err(|e| Error::Network(format!("Failed to fetch {}: {e}", archive_url)))?;

  if !response.status().is_success() {
    return Err(Error::DownloadFailed(format!(
      "{} returned status {}",
      archive_url,
      response.status()
    )));
  }

  let bytes = response
    .bytes()
    .await
    .map_err(|e| Error::DownloadFailed(format!("Failed reading body for {}: {e}", archive_url)))?;

  let temp_dir = tempfile::tempdir()?;
  let archive_path = temp_dir.path().join(&safe_archive_name);
  std::fs::write(&archive_path, &bytes)?;

  let extract_dir = temp_dir.path().join("extracted");
  std::fs::create_dir_all(&extract_dir)?;

  let extractor = ArchiveExtractor::new();
  extractor.extract_archive(&archive_path, &extract_dir)?;

  let filesystem = FileSystemHelper::new();
  let vpk_files = filesystem.find_files_recursive(&extract_dir, "vpk")?;

  let new_originals: Vec<String> = vpk_files
    .iter()
    .filter_map(|(path, _)| path.file_name().and_then(|s| s.to_str()).map(|s| s.to_string()))
    .collect();

  if new_originals.is_empty() {
    return Err(Error::InvalidInput(format!(
      "No VPK files found in archive {safe_archive_name}"
    )));
  }

  log::info!(
    "Found {} VPK(s) in archive: {:?}",
    new_originals.len(),
    new_originals
  );

  let staging_dir = tempfile::tempdir()?;
  let mut staged_pairs: Vec<(String, PathBuf)> = Vec::new();
  for original in &new_originals {
    if let Some(src) = vpk_files.iter().find_map(|(path, _)| {
      path
        .file_name()
        .and_then(|s| s.to_str())
        .filter(|s| *s == original.as_str())
        .map(|_| path)
    }) {
      let staged_path = staging_dir.path().join(original);
      filesystem.copy_file(src, &staged_path)?;
      staged_pairs.push((original.clone(), staged_path));
    }
  }

  let vpk_manager = VpkManager::new();
  let prefix = format!("{mod_id}_");

  if !current_installed_vpks.is_empty() {
    vpk_manager.disable_vpks(
      &addons_path,
      &mod_id,
      &current_installed_vpks,
      &current_original_names,
    )?;
  }

  let mut prefixed_names: Vec<String> = Vec::new();
  for (original, staged_path) in &staged_pairs {
    let prefixed = format!("{prefix}{original}");
    let dest = addons_path.join(&prefixed);
    filesystem.copy_file(staged_path, &dest)?;
    prefixed_names.push(prefixed.clone());
    log::info!("Staged VPK {original} -> {}", dest.display());
  }

  let new_installed_vpks = match vpk_manager.enable_vpks(&addons_path, &mod_id, &prefixed_names) {
    Ok(installed) => installed,
    Err(e) => {
      log::error!("Failed to enable new VPKs for variant switch: {e}, restoring previous state");
      if !current_installed_vpks.is_empty() {
        let old_prefixed: Vec<String> = current_original_names
          .iter()
          .map(|name| format!("{mod_id}_{name}"))
          .collect();
        if let Err(restore_err) = vpk_manager.enable_vpks(&addons_path, &mod_id, &old_prefixed) {
          log::error!("Failed to restore previous VPKs for mod {mod_id}: {restore_err}");
        }
      }
      return Err(e);
    }
  };

  log::info!(
    "Variant switch complete: {} VPKs enabled as {:?}",
    new_installed_vpks.len(),
    new_installed_vpks
  );

  let vpk_prefixed = vpk_manager.find_prefixed_vpks(&addons_path, &mod_id)?;
  let disabled_originals: Vec<String> = vpk_prefixed
    .iter()
    .filter_map(|name| name.strip_prefix(&prefix).map(|s| s.to_string()))
    .collect();

  let mut available: Vec<String> = new_originals.clone();
  for name in disabled_originals {
    if !available.contains(&name) {
      available.push(name);
    }
  }
  available.sort();

  let selected_set: std::collections::HashSet<String> = new_originals.iter().cloned().collect();
  let file_tree = build_options_file_tree(&available, &selected_set);

  {
    let mut manager = MANAGER.lock().unwrap();
    if let Some(existing) = manager.get_mod_repository().get_mod(&mod_id).cloned() {
      let mut updated = existing;
      updated.installed_vpks = new_installed_vpks.clone();
      updated.original_vpk_names = new_originals.clone();
      updated.file_tree = Some(file_tree.clone());
      manager.get_mod_repository_mut().add_mod(updated);
    }
  }

  Ok(SwitchDownloadVariantResult {
    installed_vpks: new_installed_vpks,
    original_vpk_names: new_originals,
    file_tree,
  })
}
