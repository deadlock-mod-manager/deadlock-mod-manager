use crate::errors::Error;
use crate::mod_manager::shard::{ProfileBase, ShardLocator};
use crate::mod_manager::vpk_manager::staging::VpkSnapshot;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::path::{Path, PathBuf};

pub const REPAIR_BACKUP_PREFIX: &str = "addons-backup-repair-";

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepairBackupIndex {
  profile_folder: Option<String>,
  files: Vec<String>,
}

pub fn create_repair_backup(
  base: &ProfileBase,
  directory: &Path,
  files: &[String],
) -> Result<PathBuf, Error> {
  fs::create_dir_all(directory)?;
  let name = format!(
    "{REPAIR_BACKUP_PREFIX}{}",
    chrono::Utc::now().format("%Y%m%dT%H%M%S%.9fZ")
  );
  let staging = tempfile::Builder::new()
    .prefix(".repair-")
    .tempdir_in(directory)?;
  for file in files {
    let source = base.locator_path(&ShardLocator::parse(file)?);
    let destination = staging.path().join("files").join(file);
    fs::create_dir_all(destination.parent().unwrap())?;
    fs::copy(source, &destination)?;
    OpenOptions::new()
      .write(true)
      .open(destination)?
      .sync_all()?;
  }
  let index = RepairBackupIndex {
    profile_folder: if base.file_name().and_then(|value| value.to_str()) == Some("addons") {
      None
    } else {
      Some(base.file_name().unwrap().to_string_lossy().into_owned())
    },
    files: files.to_vec(),
  };
  let index_path = staging.path().join("repair.json");
  fs::write(
    &index_path,
    serde_json::to_vec_pretty(&index)
      .map_err(|error| Error::BackupCreationFailed(error.to_string()))?,
  )?;
  OpenOptions::new()
    .write(true)
    .open(index_path)?
    .sync_all()?;
  let destination = directory.join(name);
  fs::rename(staging.path(), &destination)?;
  Ok(destination)
}

pub fn restore_repair_backup(backup: &Path, addons: &Path) -> Result<(), Error> {
  let index: RepairBackupIndex = serde_json::from_slice(&fs::read(backup.join("repair.json"))?)
    .map_err(|error| Error::BackupRestoreFailed(error.to_string()))?;
  let base = match index.profile_folder {
    Some(folder) => {
      if folder.is_empty()
        || !folder
          .chars()
          .all(|ch| ch.is_alphanumeric() || ch == '-' || ch == '_')
      {
        return Err(Error::BackupRestoreFailed(
          "Invalid repair profile folder".into(),
        ));
      }
      ProfileBase::new(addons.join(folder))?
    }
    None => ProfileBase::new(addons)?,
  };
  let mut copies = Vec::new();
  for file in &index.files {
    let locator = ShardLocator::parse(file)?;
    let destination = base.locator_path(&locator);
    if destination.exists() {
      return Err(Error::BackupRestoreFailed(format!(
        "Repair restore would overwrite {}",
        destination.display()
      )));
    }
    let source = backup.join("files").join(file);
    copies.push((source, destination));
  }
  let mut snapshot = VpkSnapshot::new()?;
  for (source, destination) in copies {
    fs::create_dir_all(destination.parent().unwrap())?;
    let mut output = OpenOptions::new()
      .write(true)
      .create_new(true)
      .open(&destination)?;
    snapshot.track(&destination);
    std::io::copy(&mut fs::File::open(source)?, &mut output)?;
    output.sync_all()?;
  }
  snapshot.commit();
  Ok(())
}
