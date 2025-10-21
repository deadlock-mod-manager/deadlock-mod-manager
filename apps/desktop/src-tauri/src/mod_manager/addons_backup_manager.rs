use crate::errors::Error;
use chrono::{DateTime, Local};
use log;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddonsBackup {
  pub file_name: String,
  pub file_path: String,
  pub created_at: u64,
  pub file_size: u64,
  pub addons_count: u32,
}

pub enum RestoreStrategy {
  Replace,
  Merge,
}

impl RestoreStrategy {
  pub fn from_str(s: &str) -> Result<Self, Error> {
    match s.to_lowercase().as_str() {
      "replace" => Ok(RestoreStrategy::Replace),
      "merge" => Ok(RestoreStrategy::Merge),
      _ => Err(Error::InvalidInput(format!(
        "Invalid restore strategy: {}. Must be 'replace' or 'merge'",
        s
      ))),
    }
  }
}

pub struct AddonsBackupManager {
  game_path: Option<PathBuf>,
  app_handle: Option<AppHandle>,
}

impl AddonsBackupManager {
  pub fn new() -> Self {
    Self {
      game_path: None,
      app_handle: None,
    }
  }

  pub fn set_app_handle(&mut self, app_handle: AppHandle) {
    self.app_handle = Some(app_handle);
  }

  pub fn set_game_path(&mut self, path: PathBuf) {
    self.game_path = Some(path);
  }

  /// Create a backup without requiring a mutable reference to self
  /// This is used for async operations where we don't hold locks
  pub fn create_backup_async(
    addons_path: PathBuf,
    backup_dir: PathBuf,
    filename: String,
    app_handle: AppHandle,
  ) -> Result<AddonsBackup, Error> {
    // Emit progress: initializing
    let _ = app_handle.emit(
      "backup-progress",
      serde_json::json!({
        "stage": "initializing",
        "progress": 0,
        "message": "Preparing backup..."
      }),
    );

    if !addons_path.exists() {
      return Err(Error::BackupCreationFailed(
        "Addons folder does not exist".to_string(),
      ));
    }

    // Emit progress: scanning
    let _ = app_handle.emit(
      "backup-progress",
      serde_json::json!({
        "stage": "scanning",
        "progress": 10,
        "message": "Scanning addons folder..."
      }),
    );

    fs::create_dir_all(&backup_dir).map_err(|e| {
      Error::BackupCreationFailed(format!("Failed to create backup directory: {}", e))
    })?;

    let backup_path = backup_dir.join(&filename);

    // Create backup directory
    fs::create_dir_all(&backup_path)
      .map_err(|e| Error::BackupCreationFailed(format!("Failed to create backup folder: {}", e)))?;

    // Count VPK files
    let entries: Vec<_> = fs::read_dir(&addons_path)
      .map_err(|e| Error::BackupCreationFailed(format!("Failed to read addons directory: {}", e)))?
      .filter_map(|entry| entry.ok())
      .filter(|entry| entry.path().is_file())
      .collect();

    let vpk_count = entries
      .iter()
      .filter(|entry| entry.path().extension().map_or(false, |ext| ext == "vpk"))
      .count();

    let total_files = entries.len();

    // Emit progress: copying
    let _ = app_handle.emit(
      "backup-progress",
      serde_json::json!({
        "stage": "copying",
        "progress": 20,
        "message": format!("Copying {} VPK files...", vpk_count)
      }),
    );

    log::info!(
      "Copying {} files ({} VPK files) from {:?} to {:?}",
      total_files,
      vpk_count,
      addons_path,
      backup_path
    );

    // Copy all files
    let mut total_size = 0u64;
    for (i, entry) in entries.iter().enumerate() {
      let path = entry.path();
      if let Some(file_name) = path.file_name() {
        let dest_path = backup_path.join(file_name);

        fs::copy(&path, &dest_path)
          .map_err(|e| Error::BackupCreationFailed(format!("Failed to copy file: {}", e)))?;

        if let Ok(metadata) = fs::metadata(&path) {
          total_size += metadata.len();
        }

        // Update progress
        let progress = 20 + ((i + 1) * 70 / total_files) as u32;
        let _ = app_handle.emit(
          "backup-progress",
          serde_json::json!({
            "stage": "copying",
            "progress": progress,
            "message": format!("Copying files... ({}/{})", i + 1, total_files)
          }),
        );
      }
    }

    // Emit progress: finalizing
    let _ = app_handle.emit(
      "backup-progress",
      serde_json::json!({
        "stage": "finalizing",
        "progress": 90,
        "message": "Finalizing backup..."
      }),
    );

    let created_at = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .unwrap_or_default()
      .as_secs();

    // Emit completion
    let _ = app_handle.emit(
      "backup-progress",
      serde_json::json!({
        "stage": "completed",
        "progress": 100,
        "message": format!("Backup created successfully: {}", filename)
      }),
    );

    log::info!(
      "Backup created successfully: {} ({} bytes, {} files, {} VPK files)",
      filename,
      total_size,
      total_files,
      vpk_count
    );

    Ok(AddonsBackup {
      file_name: filename,
      file_path: backup_path.to_string_lossy().to_string(),
      created_at,
      file_size: total_size,
      addons_count: vpk_count as u32,
    })
  }

  pub fn get_addons_path(&self) -> Result<PathBuf, Error> {
    let game_path = self.game_path.as_ref().ok_or(Error::GamePathNotSet)?;
    Ok(game_path.join("game").join("citadel").join("addons"))
  }

  pub fn get_backup_directory(&self) -> Result<PathBuf, Error> {
    let game_path = self.game_path.as_ref().ok_or(Error::GamePathNotSet)?;
    Ok(
      game_path
        .join("game")
        .join("citadel")
        .join("addons-backups"),
    )
  }

  pub fn generate_backup_filename(&self) -> String {
    let now = Local::now();
    format!("addons-backup-{}", now.format("%Y-%m-%d_%H-%M-%S"))
  }

  fn parse_backup_filename(&self, filename: &str) -> Option<u64> {
    // Extract timestamp from filename format: addons-backup-YYYY-MM-DD_HH-MM-SS.7z
    let without_ext = filename.strip_suffix(".7z")?;
    let without_prefix = without_ext.strip_prefix("addons-backup-")?;

    let datetime_str = without_prefix.replace('_', " ").replace('-', ":");
    let parts: Vec<&str> = datetime_str.split(' ').collect();
    if parts.len() != 2 {
      return None;
    }

    let date_parts: Vec<&str> = parts[0].split(':').collect();
    let time_parts: Vec<&str> = parts[1].split(':').collect();

    if date_parts.len() != 3 || time_parts.len() != 3 {
      return None;
    }

    let year = date_parts[0].parse::<i32>().ok()?;
    let month = date_parts[1].parse::<u32>().ok()?;
    let day = date_parts[2].parse::<u32>().ok()?;
    let hour = time_parts[0].parse::<u32>().ok()?;
    let minute = time_parts[1].parse::<u32>().ok()?;
    let second = time_parts[2].parse::<u32>().ok()?;

    let naive_date = chrono::NaiveDate::from_ymd_opt(year, month, day)?;
    let naive_time = chrono::NaiveTime::from_hms_opt(hour, minute, second)?;
    let naive_datetime = chrono::NaiveDateTime::new(naive_date, naive_time);

    let datetime: DateTime<Local> =
      DateTime::from_naive_utc_and_offset(naive_datetime, *Local::now().offset());

    Some(datetime.timestamp() as u64)
  }

  fn count_vpk_files_in_archive(&self, backup_path: &Path) -> Result<u32, Error> {
    // Count VPK files in backup directory
    let count = fs::read_dir(backup_path)
      .map_err(|e| Error::BackupRestoreFailed(format!("Failed to read backup directory: {}", e)))?
      .filter_map(|entry| entry.ok())
      .filter(|entry| entry.path().extension().map_or(false, |ext| ext == "vpk"))
      .count();

    Ok(count as u32)
  }

  pub fn list_backups(&self) -> Result<Vec<AddonsBackup>, Error> {
    let backup_dir = self.get_backup_directory()?;

    if !backup_dir.exists() {
      log::info!("Backup directory does not exist, returning empty list");
      return Ok(Vec::new());
    }

    let mut backups = Vec::new();

    for entry in fs::read_dir(&backup_dir)? {
      let entry = entry?;
      let path = entry.path();

      // Look for directories (backups are now directories, not files)
      if path.is_dir() {
        if let Some(filename) = path.file_name().and_then(|n| n.to_str()) {
          if filename.starts_with("addons-backup-") {
            // Calculate total size of all files in the backup directory
            let mut file_size = 0u64;
            if let Ok(entries) = fs::read_dir(&path) {
              for entry in entries.flatten() {
                if let Ok(metadata) = entry.metadata() {
                  if metadata.is_file() {
                    file_size += metadata.len();
                  }
                }
              }
            }

            let created_at = if let Some(timestamp) = self.parse_backup_filename(filename) {
              timestamp
            } else {
              let metadata = fs::metadata(&path)?;
              metadata
                .created()
                .or_else(|_| metadata.modified())
                .unwrap_or(SystemTime::now())
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs()
            };

            let addons_count = self.count_vpk_files_in_archive(&path).unwrap_or(0);

            backups.push(AddonsBackup {
              file_name: filename.to_string(),
              file_path: path.to_string_lossy().to_string(),
              created_at,
              file_size,
              addons_count,
            });
          }
        }
      }
    }

    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    log::info!("Found {} backup(s)", backups.len());
    Ok(backups)
  }

  pub fn restore_backup(&self, file_name: &str, strategy: RestoreStrategy) -> Result<(), Error> {
    log::info!(
      "Restoring backup: {} with strategy: {:?}",
      file_name,
      match strategy {
        RestoreStrategy::Replace => "replace",
        RestoreStrategy::Merge => "merge",
      }
    );

    let backup_dir = self.get_backup_directory()?;
    let backup_path = backup_dir.join(file_name);

    if !backup_path.exists() {
      return Err(Error::BackupNotFound);
    }

    let addons_path = self.get_addons_path()?;

    if matches!(strategy, RestoreStrategy::Replace) {
      if addons_path.exists() {
        log::info!("Clearing addons folder before restore");
        fs::remove_dir_all(&addons_path).map_err(|e| {
          Error::BackupRestoreFailed(format!("Failed to clear addons folder: {}", e))
        })?;
      }
      fs::create_dir_all(&addons_path).map_err(|e| {
        Error::BackupRestoreFailed(format!("Failed to create addons folder: {}", e))
      })?;
    } else {
      fs::create_dir_all(&addons_path).map_err(|e| {
        Error::BackupRestoreFailed(format!("Failed to create addons folder: {}", e))
      })?;
    }

    log::info!(
      "Restoring backup from {:?} to {:?}",
      backup_path,
      addons_path
    );

    for entry in fs::read_dir(&backup_path)
      .map_err(|e| Error::BackupRestoreFailed(format!("Failed to read backup directory: {}", e)))?
    {
      let entry = entry.map_err(|e| {
        Error::BackupRestoreFailed(format!("Failed to read directory entry: {}", e))
      })?;
      let path = entry.path();

      if path.is_file() {
        if let Some(file_name) = path.file_name() {
          let dest_path = addons_path.join(file_name);
          fs::copy(&path, &dest_path)
            .map_err(|e| Error::BackupRestoreFailed(format!("Failed to restore file: {}", e)))?;
        }
      }
    }

    log::info!("Backup restored successfully");
    Ok(())
  }

  pub fn delete_backup(&self, file_name: &str) -> Result<(), Error> {
    log::info!("Deleting backup: {}", file_name);

    let backup_dir = self.get_backup_directory()?;
    let backup_path = backup_dir.join(file_name);

    if !backup_path.exists() {
      return Err(Error::BackupNotFound);
    }

    // Remove the entire backup directory
    fs::remove_dir_all(&backup_path).map_err(|e| {
      Error::BackupRestoreFailed(format!("Failed to delete backup directory: {}", e))
    })?;

    log::info!("Backup deleted successfully");
    Ok(())
  }

  pub fn get_backup_info(&self, file_name: &str) -> Result<AddonsBackup, Error> {
    let backup_dir = self.get_backup_directory()?;
    let backup_path = backup_dir.join(file_name);

    if !backup_path.exists() {
      return Err(Error::BackupNotFound);
    }

    let metadata = fs::metadata(&backup_path)?;
    let file_size = metadata.len();

    let created_at = if let Some(timestamp) = self.parse_backup_filename(file_name) {
      timestamp
    } else {
      metadata
        .created()
        .or_else(|_| metadata.modified())
        .unwrap_or(SystemTime::now())
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
    };

    let addons_count = self.count_vpk_files_in_archive(&backup_path).unwrap_or(0);

    Ok(AddonsBackup {
      file_name: file_name.to_string(),
      file_path: backup_path.to_string_lossy().to_string(),
      created_at,
      file_size,
      addons_count,
    })
  }
}
