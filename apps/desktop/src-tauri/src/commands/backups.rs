use crate::app_runtime::AppHandle;
use crate::errors::Error;
use crate::mod_manager::AddonsBackup;
use crate::mod_manager::addons_backup_manager::AddonsBackupManager;

use super::state::MANAGER;

#[tauri::command]
pub async fn create_addons_backup(
  app_handle: AppHandle,
  max_backups: u32,
) -> Result<AddonsBackup, Error> {
  log::info!("Creating addons backup");

  let (addons_path, backup_dir, filename) = {
    let mut mod_manager = MANAGER.lock().unwrap();
    mod_manager.set_backup_manager_app_handle(app_handle.clone());
    let backup_manager = mod_manager.get_addons_backup_manager();

    let addons_path = backup_manager.get_addons_path()?;
    let backup_dir = backup_manager.get_backup_directory()?;
    let filename = backup_manager.generate_backup_filename();

    (addons_path, backup_dir, filename)
  };

  let result = tokio::task::spawn_blocking(move || {
    AddonsBackupManager::create_backup_async(addons_path, backup_dir, filename, app_handle)
  })
  .await
  .map_err(|e| Error::BackupCreationFailed(format!("Task join error: {e}")))?;

  if max_backups > 0 {
    let mut mod_manager = MANAGER.lock().unwrap();
    let backup_manager = mod_manager.get_addons_backup_manager();
    if let Err(e) = backup_manager.prune_old_backups(max_backups) {
      log::error!("Failed to prune old backups: {:?}", e);
    }
  }

  result
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
  backup_manager
    .restore_backup(&file_name, restore_strategy)
    .inspect_err(|e| log::error!("Failed to restore addons backup '{file_name}': {e}"))
}

#[tauri::command]
pub async fn delete_addons_backup(file_name: String) -> Result<(), Error> {
  log::info!("Deleting addons backup: {file_name}");
  let mut mod_manager = MANAGER.lock().unwrap();
  let backup_manager = mod_manager.get_addons_backup_manager();
  backup_manager.delete_backup(&file_name)
}

#[tauri::command]
pub async fn get_addons_backup_info(file_name: String) -> Result<AddonsBackup, Error> {
  log::info!("Getting addons backup info: {file_name}");
  let mut mod_manager = MANAGER.lock().unwrap();
  let backup_manager = mod_manager.get_addons_backup_manager();
  backup_manager.get_backup_info(&file_name)
}

#[tauri::command]
pub async fn prune_addons_backups(max_count: u32) -> Result<u32, Error> {
  log::info!("Pruning addons backups to max {max_count}");
  let mut mod_manager = MANAGER.lock().unwrap();
  let backup_manager = mod_manager.get_addons_backup_manager();
  backup_manager.prune_old_backups(max_count)
}

#[tauri::command]
pub async fn open_addons_backups_folder() -> Result<(), Error> {
  log::info!("Opening addons backups folder");
  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager.open_addons_backups_folder()
}
