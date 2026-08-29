use std::path::PathBuf;

use crate::app_runtime::AppHandle;
use crate::errors::Error;
use crate::mod_manager::Mod;
use crate::mod_manager::file_tree::ModFileTree;
use crate::mod_manager::shard;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};
use vpkmanager::ledger::ProfileLedger;
use vpkmanager::ops;

use super::downloads::get_download_manager;
use super::fonts::{apply_font_cleanup, prepare_font_cleanup};
use super::state::MANAGER;
use crate::download_manager::{DownloadFileDto, DownloadTask};

/// A VPK value is safe to join onto a shard directory and persist in the
/// manifest only if it is exactly one normal filename component: no separators,
/// no `.`/`..`, no absolute or parent-directory forms.
fn is_plain_vpk_filename(name: &str) -> bool {
  !name.is_empty()
    && !name.contains('/')
    && !name.contains('\\')
    && std::path::Path::new(name)
      .file_name()
      .and_then(|f| f.to_str())
      == Some(name)
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

    let profile_folder_option = if profile_folder.is_empty() {
      None
    } else {
      Some(profile_folder.clone())
    };
    let removed = {
      let mut mod_manager = MANAGER.lock().unwrap();
      match mod_manager.remove_mod_vpks(
        &mod_data.mod_id,
        &mod_data.installed_vpks,
        profile_folder_option.clone(),
      ) {
        Ok(result) => result,
        Err(error) => {
          log::error!(
            "Failed to prepare mod {} for update: {:?}",
            mod_data.mod_id,
            error
          );
          failed.push((
            mod_data.mod_id.clone(),
            format!("Failed to remove old VPKs: {error:?}"),
          ));
          continue;
        }
      }
    };
    log::info!(
      "Removed {} old VPKs for mod {} before update",
      removed.count,
      mod_data.mod_id
    );
    let install_order = removed.install_order;

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
      profile_folder: profile_folder_option.clone(),
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
      match ops::find_prefixed_vpks(&addons_path_for_profile, &mod_data.mod_id) {
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
        install_order,
        original_vpk_names: Vec::new(),
      };

      mod_manager.install_mod(deadlock_mod, profile_folder_option)
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

  let addons_path = mod_manager.get_addons_path(profile_folder.as_deref())?;
  let mut manifest = ProfileLedger::open_for_write(&addons_path)?;

  let install_order = manifest.mods.get(&mod_id).and_then(|e| e.order);

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
      install_order,
      original_vpk_names: Vec::new(),
    };
    mod_manager.get_mod_repository_mut().add_mod(deadlock_mod);
  }

  if let Some(bad) = installed_vpks
    .iter()
    .find(|vpk| !is_plain_vpk_filename(vpk))
  {
    return Err(Error::InvalidInput(format!(
      "Invalid analyzed VPK filename: {bad}"
    )));
  }

  let discovered_shard = shard::all_shards()
    .find(|shard_index| {
      let shard_dir = addons_path.shard_dir(*shard_index);
      installed_vpks
        .iter()
        .all(|vpk| shard_dir.join(vpk).exists())
    })
    .ok_or_else(|| {
      Error::ModInvalid(format!(
        "Analyzed VPK files for mod {mod_id} do not exist together in one addon shard"
      ))
    })?;
  manifest.mark_enabled(
    &mod_id,
    installed_vpks,
    Vec::new(),
    install_order,
    discovered_shard,
  );
  // mark_enabled skips overwriting original_vpk_names when passed empty,
  // so explicitly clear stale originals from a previous install.
  if let Some(entry) = manifest.mods.get_mut(&mod_id) {
    entry.original_vpk_names.clear();
  }
  manifest.save(&addons_path)?;
  log::info!("Persisted analyzed mod {mod_id} to profile manifest");

  Ok(())
}

pub(crate) fn resolve_addons_path(
  profile_folder: Option<&str>,
) -> Result<vpkmanager::profile::ProfileBase, Error> {
  MANAGER.lock().unwrap().get_addons_path(profile_folder)
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

  let addons_path = resolve_addons_path(profile_folder.as_deref())?;

  if !addons_path.exists() {
    return Err(Error::GamePathNotSet);
  }

  let prefixed_vpks = ops::find_prefixed_vpks(&addons_path, &mod_id)?;

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

  let selected_set: std::collections::HashSet<String> = enabled_originals.into_iter().collect();
  Ok(ModFileTree::from_options(&available, &selected_set))
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

  let result = MANAGER.lock().unwrap().apply_variant_selection(
    &mod_id,
    profile_folder,
    &current_installed_vpks,
    &current_original_names,
    selected_original_names,
  )?;

  Ok(SwapModOptionsResult {
    installed_vpks: result.installed_vpks,
    original_vpk_names: result.original_vpk_names,
    file_tree: result.file_tree,
  })
}
