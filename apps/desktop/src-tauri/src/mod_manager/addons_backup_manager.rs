use crate::app_runtime::AppHandle;
use crate::errors::Error;
use crate::mod_manager::shard;
use crate::mod_manager::vpk_manifest::ProfileVpkManifest;
use chrono::{DateTime, Local};
use log;
use serde::{Deserialize, Serialize};
use std::cmp::Reverse;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Emitter;

#[derive(Default)]
struct BackupStats {
  bytes: u64,
  files: u64,
  vpks: u32,
}

impl BackupStats {
  fn add(&mut self, other: Self) {
    self.bytes += other.bytes;
    self.files += other.files;
    self.vpks += other.vpks;
  }
}

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
        "Invalid restore strategy: {s}. Must be 'replace' or 'merge'"
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
      Error::BackupCreationFailed(format!("Failed to create backup directory: {e}"))
    })?;

    let backup_path = backup_dir.join(&filename);
    if backup_path.exists() {
      return Err(Error::BackupCreationFailed(format!(
        "Backup already exists: {}",
        backup_path.display()
      )));
    }
    // Build into a hidden staging directory and only rename it to the final
    // (listable) name after validation succeeds, so an interrupted or invalid
    // backup can never be listed, restored, deleted, or pruned. The name does
    // not start with `addons-backup-`, so `list_backups` ignores it.
    let staging_path = backup_dir.join(format!(".{filename}.staging"));
    if staging_path.exists() {
      let _ = fs::remove_dir_all(&staging_path);
    }
    fs::create_dir_all(&staging_path)
      .map_err(|e| Error::BackupCreationFailed(format!("Failed to create backup folder: {e}")))?;

    let citadel_path = addons_path.parent().ok_or_else(|| {
      Error::BackupCreationFailed("Addons folder has no parent directory".to_string())
    })?;
    let shard_roots: Vec<PathBuf> = (1..=shard::MAX_SHARDS)
      .map(|index| citadel_path.join(shard::shard_root_name(index)))
      .filter(|path| path.exists())
      .collect();

    // Emit progress: copying
    let _ = app_handle.emit(
      "backup-progress",
      serde_json::json!({
        "stage": "copying",
        "progress": 20,
        "message": "Copying addon folders..."
      }),
    );

    let mut stats = BackupStats::default();
    for (index, source_root) in shard_roots.iter().enumerate() {
      let root_name = source_root
        .file_name()
        .ok_or_else(|| Error::BackupCreationFailed("Addon shard root has no name".to_string()))?;
      let copied = Self::copy_tree(source_root, &staging_path.join(root_name)).map_err(|e| {
        let _ = fs::remove_dir_all(&staging_path);
        Error::BackupCreationFailed(format!(
          "Failed to copy addon folder {}: {e}",
          source_root.display()
        ))
      })?;
      stats.add(copied);

      let progress = 20 + (((index + 1) * 70 / shard_roots.len().max(1)) as u32);
      let _ = app_handle.emit(
        "backup-progress",
        serde_json::json!({
          "stage": "copying",
          "progress": progress,
          "message": format!("Copying addon folders... ({}/{})", index + 1, shard_roots.len())
        }),
      );
    }

    if let Err(error) = Self::validate_snapshot(&staging_path) {
      let _ = fs::remove_dir_all(&staging_path);
      return Err(Error::BackupCreationFailed(format!(
        "Created backup is inconsistent: {error}"
      )));
    }

    // Publish the validated snapshot atomically.
    if let Err(error) = fs::rename(&staging_path, &backup_path) {
      let _ = fs::remove_dir_all(&staging_path);
      return Err(Error::BackupCreationFailed(format!(
        "Failed to finalize backup: {error}"
      )));
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
        "message": format!("Backup created successfully: {filename}")
      }),
    );

    log::info!(
      "Backup created successfully: {filename} ({} bytes, {} files, {} VPK files)",
      stats.bytes,
      stats.files,
      stats.vpks
    );

    Ok(AddonsBackup {
      file_name: filename,
      file_path: backup_path.to_string_lossy().to_string(),
      created_at,
      file_size: stats.bytes,
      addons_count: stats.vpks,
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

  fn copy_tree(source: &Path, destination: &Path) -> std::io::Result<BackupStats> {
    fs::create_dir_all(destination)?;
    let mut stats = BackupStats::default();

    for entry in fs::read_dir(source)? {
      let entry = entry?;
      let source_path = entry.path();
      let entry_name = entry.file_name();
      let entry_name = entry_name.to_string_lossy();
      if matches!(
        entry_name.as_ref(),
        ".dmm-clear" | ".dmm-reorder" | "temp_reorder" | ".dmm.json.tmp"
      ) || entry_name.starts_with(".dmm-update-")
      {
        continue;
      }
      let file_type = entry.file_type()?;
      if file_type.is_symlink() {
        log::warn!("Skipping symlink while copying addons backup: {source_path:?}");
        continue;
      }

      let destination_path = destination.join(entry.file_name());
      if file_type.is_dir() {
        stats.add(Self::copy_tree(&source_path, &destination_path)?);
      } else if file_type.is_file() {
        let bytes = fs::copy(&source_path, &destination_path)?;
        stats.bytes += bytes;
        stats.files += 1;
        if source_path
          .extension()
          .is_some_and(|extension| extension.eq_ignore_ascii_case("vpk"))
        {
          stats.vpks += 1;
        }
      }
    }

    Ok(stats)
  }

  fn tree_stats(path: &Path) -> std::io::Result<BackupStats> {
    let mut stats = BackupStats::default();
    for entry in fs::read_dir(path)? {
      let entry = entry?;
      let entry_path = entry.path();
      let file_type = entry.file_type()?;
      if file_type.is_symlink() {
        continue;
      }
      if file_type.is_dir() {
        stats.add(Self::tree_stats(&entry_path)?);
      } else if file_type.is_file() {
        stats.bytes += entry.metadata()?.len();
        stats.files += 1;
        if entry_path
          .extension()
          .is_some_and(|extension| extension.eq_ignore_ascii_case("vpk"))
        {
          stats.vpks += 1;
        }
      }
    }
    Ok(stats)
  }

  fn validate_snapshot(root: &Path) -> Result<(), Error> {
    let addons_root = root.join("addons");
    if !addons_root.is_dir() {
      return Err(Error::BackupRestoreFailed(format!(
        "Snapshot has no addons directory at {}",
        addons_root.display()
      )));
    }

    let mut profile_bases = vec![addons_root.clone()];
    profile_bases.extend(
      fs::read_dir(&addons_root)?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.is_dir() && path.join(".dmm.json").is_file()),
    );

    for profile_base in profile_bases {
      if !profile_base.join(".dmm.json").is_file() {
        continue;
      }
      let manifest = ProfileVpkManifest::load(&profile_base)?;
      for (mod_id, entry) in manifest.mods {
        let files = if entry.enabled {
          let enabled_dir = shard::shard_dir(&profile_base, entry.shard.max(1));
          entry
            .current_vpks
            .iter()
            .map(|vpk| enabled_dir.join(vpk))
            .collect::<Vec<_>>()
        } else {
          entry
            .disabled_vpks
            .iter()
            .map(|vpk| profile_base.join(vpk))
            .collect::<Vec<_>>()
        };
        let missing: Vec<String> = files
          .into_iter()
          .filter(|path| !path.is_file())
          .map(|path| path.display().to_string())
          .collect();
        if !missing.is_empty() {
          return Err(Error::BackupRestoreFailed(format!(
            "Manifest entry {mod_id} references missing VPKs: {}",
            missing.join(", ")
          )));
        }
      }
    }

    Ok(())
  }

  fn restore_staged_roots(
    citadel_path: &Path,
    staging_path: &Path,
    staged_roots: &[String],
  ) -> Vec<String> {
    let mut failures = Vec::new();
    for shard_index in 1..=shard::MAX_SHARDS {
      let current = citadel_path.join(shard::shard_root_name(shard_index));
      if current.exists()
        && let Err(error) = fs::remove_dir_all(&current)
      {
        failures.push(format!("failed to remove {}: {error}", current.display()));
      }
    }

    for root_name in staged_roots.iter().rev() {
      let current = citadel_path.join(root_name);
      let staged = staging_path.join(root_name);
      if staged.exists()
        && let Err(error) = fs::rename(&staged, &current)
      {
        failures.push(format!(
          "failed to restore {} to {}: {error}",
          staged.display(),
          current.display()
        ));
      }
    }
    failures
  }

  fn restore_moved_roots_only(
    citadel_path: &Path,
    staging_path: &Path,
    staged_roots: &[String],
  ) -> Vec<String> {
    let mut failures = Vec::new();
    for root_name in staged_roots.iter().rev() {
      let staged = staging_path.join(root_name);
      let current = citadel_path.join(root_name);
      if let Err(error) = fs::rename(&staged, &current) {
        failures.push(format!(
          "failed to restore {} to {}: {error}",
          staged.display(),
          current.display()
        ));
      }
    }
    failures
  }

  fn parse_backup_filename(&self, filename: &str) -> Option<u64> {
    let without_ext = filename.strip_suffix(".7z").unwrap_or(filename);
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
      if path.is_dir()
        && let Some(filename) = path.file_name().and_then(|n| n.to_str())
        && filename.starts_with("addons-backup-")
      {
        let stats = Self::tree_stats(&path).unwrap_or_default();

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

        backups.push(AddonsBackup {
          file_name: filename.to_string(),
          file_path: path.to_string_lossy().to_string(),
          created_at,
          file_size: stats.bytes,
          addons_count: stats.vpks,
        });
      }
    }

    backups.sort_by_key(|backup| Reverse(backup.created_at));

    log::info!("Found {} backup(s)", backups.len());
    Ok(backups)
  }

  pub fn restore_backup(&self, file_name: &str, strategy: RestoreStrategy) -> Result<(), Error> {
    log::info!(
      "Restoring backup: {file_name} with strategy: {:?}",
      match strategy {
        RestoreStrategy::Replace => "replace",
        RestoreStrategy::Merge => "merge",
      }
    );

    let backup_path = self.resolve_backup_path(file_name)?;

    if !backup_path.exists() {
      return Err(Error::BackupNotFound);
    }

    let addons_path = self.get_addons_path()?;
    let citadel_path = addons_path.parent().ok_or_else(|| {
      Error::BackupRestoreFailed("Addons folder has no parent directory".to_string())
    })?;
    let is_structured_backup = backup_path.join("addons").is_dir();
    let staging_path = citadel_path.join(".dmm-restore-staging");
    if staging_path.exists() {
      return Err(Error::BackupRestoreFailed(format!(
        "A previous restore staging directory still exists at {}",
        staging_path.display()
      )));
    }
    fs::create_dir_all(&staging_path).map_err(|error| {
      Error::BackupRestoreFailed(format!(
        "Failed to create restore staging directory: {error}"
      ))
    })?;

    let mut staged_roots = Vec::new();
    for shard_index in 1..=shard::MAX_SHARDS {
      let root_name = shard::shard_root_name(shard_index);
      let shard_root = citadel_path.join(&root_name);
      if !shard_root.exists() {
        continue;
      }
      if let Err(error) = fs::rename(&shard_root, staging_path.join(&root_name)) {
        let rollback_failures =
          Self::restore_moved_roots_only(citadel_path, &staging_path, &staged_roots);
        let _ = fs::remove_dir(&staging_path);
        if rollback_failures.is_empty() {
          return Err(Error::BackupRestoreFailed(format!(
            "Failed to stage addon folder {}: {error}",
            shard_root.display()
          )));
        }
        return Err(Error::RollbackFailed(format!(
          "Failed to stage addon folder {}: {error}. Failed to restore: {}",
          shard_root.display(),
          rollback_failures.join(", ")
        )));
      }
      staged_roots.push(root_name);
    }

    log::info!("Restoring backup from {backup_path:?} to {addons_path:?}");

    let restore_result = (|| -> Result<(), Error> {
      if matches!(strategy, RestoreStrategy::Merge) {
        for root_name in &staged_roots {
          Self::copy_tree(&staging_path.join(root_name), &citadel_path.join(root_name)).map_err(
            |error| {
              Error::BackupRestoreFailed(format!(
                "Failed to prepare existing addon folder for merge: {error}"
              ))
            },
          )?;
        }
      }

      if is_structured_backup {
        for shard_index in 1..=shard::MAX_SHARDS {
          let root_name = shard::shard_root_name(shard_index);
          let source = backup_path.join(&root_name);
          if source.exists() {
            Self::copy_tree(&source, &citadel_path.join(root_name)).map_err(|error| {
              Error::BackupRestoreFailed(format!("Failed to restore addon folder: {error}"))
            })?;
          }
        }
      } else {
        Self::copy_tree(&backup_path, &addons_path).map_err(|error| {
          Error::BackupRestoreFailed(format!("Failed to restore legacy addon backup: {error}"))
        })?;
      }

      Self::validate_snapshot(citadel_path)
    })();

    if let Err(error) = restore_result {
      let rollback_failures =
        Self::restore_staged_roots(citadel_path, &staging_path, &staged_roots);
      let _ = fs::remove_dir_all(&staging_path);
      if rollback_failures.is_empty() {
        return Err(error);
      }
      return Err(Error::RollbackFailed(format!(
        "Restore failed: {error}. Failed to restore previous addon folders: {}",
        rollback_failures.join(", ")
      )));
    }

    // The restore is already committed: the backup roots are active and the
    // old roots only survive as leftovers in the staging dir. Removing them is
    // best-effort cleanup and must never turn a successful restore into a
    // failure.
    if let Err(error) = fs::remove_dir_all(&staging_path) {
      log::warn!(
        "Backup restored successfully, but failed to remove restore staging directory {}: {error}",
        staging_path.display()
      );
    }

    log::info!("Backup restored successfully");
    Ok(())
  }

  pub fn delete_backup(&self, file_name: &str) -> Result<(), Error> {
    log::info!("Deleting backup: {file_name}");

    let backup_path = self.resolve_backup_path(file_name)?;

    if !backup_path.exists() {
      return Err(Error::BackupNotFound);
    }

    // Remove the entire backup directory
    fs::remove_dir_all(&backup_path)
      .map_err(|e| Error::BackupRestoreFailed(format!("Failed to delete backup directory: {e}")))?;

    log::info!("Backup deleted successfully");
    Ok(())
  }

  pub fn prune_old_backups(&self, max_count: u32) -> Result<u32, Error> {
    let backups = self.list_backups()?;
    let total = backups.len() as u32;

    if max_count == 0 || total <= max_count {
      return Ok(0);
    }

    let to_remove = &backups[max_count as usize..];
    let mut pruned = 0u32;

    for backup in to_remove {
      match self.delete_backup(&backup.file_name) {
        Ok(()) => {
          log::info!("Pruned old backup: {}", backup.file_name);
          pruned += 1;
        }
        Err(e) => {
          log::error!("Failed to prune backup {}: {:?}", backup.file_name, e);
        }
      }
    }

    log::info!("Pruned {pruned} old backup(s), kept {max_count}");
    Ok(pruned)
  }

  pub fn get_backup_info(&self, file_name: &str) -> Result<AddonsBackup, Error> {
    let backup_path = self.resolve_backup_path(file_name)?;

    if !backup_path.exists() {
      return Err(Error::BackupNotFound);
    }

    let metadata = fs::metadata(&backup_path)?;
    let stats = Self::tree_stats(&backup_path)?;

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

    Ok(AddonsBackup {
      file_name: file_name.to_string(),
      file_path: backup_path.to_string_lossy().to_string(),
      created_at,
      file_size: stats.bytes,
      addons_count: stats.vpks,
    })
  }

  fn resolve_backup_path(&self, file_name: &str) -> Result<PathBuf, Error> {
    if !file_name.starts_with("addons-backup-")
      || file_name.contains("..")
      || file_name.contains('/')
      || file_name.contains('\\')
    {
      return Err(Error::InvalidInput(
        "Invalid addons backup name".to_string(),
      ));
    }
    Ok(self.get_backup_directory()?.join(file_name))
  }
}
