use std::path::Path;

use crate::app_runtime::AppHandle;
use crate::errors::Error;
use crate::mod_manager::missing_vpks::{MissingModFiles, missing_mod_files};
use crate::mod_manager::shard::{ProfileBase, ShardIndex, ShardLocator};
use crate::mod_manager::vpk_manifest::ProfileVpkManifest;
use serde::Serialize;

use super::state::MANAGER;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileVpkSnapshot {
  manifest: ProfileVpkManifest,
  files: Vec<SnapshotVpkFile>,
  /// Manifest entries whose VPKs the user deleted outside DMM.
  missing: Vec<MissingModFiles>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotVpkFile {
  shard: ShardIndex,
  filename: String,
  locator: String,
}

impl ProfileVpkSnapshot {
  fn read(base: &ProfileBase, mods_store: Option<&Path>) -> Result<Self, Error> {
    let manifest = ProfileVpkManifest::load(base)?;
    let mut files = Vec::new();
    for (shard, dir) in base.existing_shards() {
      for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_file()
          && let Some(filename) = path.file_name().and_then(|name| name.to_str())
          && filename.to_ascii_lowercase().ends_with(".vpk")
        {
          files.push(SnapshotVpkFile {
            shard,
            filename: filename.to_string(),
            locator: ShardLocator::new(shard, filename).to_wire(),
          });
        }
      }
    }
    files.sort_by(|a, b| (a.shard, &a.filename).cmp(&(b.shard, &b.filename)));
    let missing = manifest
      .mods
      .iter()
      .filter_map(|(mod_id, entry)| missing_mod_files(mod_id, entry, base, mods_store))
      .collect();
    Ok(Self {
      manifest,
      files,
      missing,
    })
  }
}

#[tauri::command]
pub async fn get_profile_vpk_snapshot(
  profile_folder: Option<String>,
) -> Result<ProfileVpkSnapshot, Error> {
  // Keep the filesystem listing and manifest in the same critical section:
  // a reorder between separate IPC reads would compare two different layouts.
  let mut manager = MANAGER
    .lock()
    .map_err(|_| Error::BackgroundTaskFailed("Mod manager lock poisoned".to_string()))?;
  manager.migrate_profile_to_shards(profile_folder.clone())?;
  let base = manager.get_addons_path(profile_folder.as_deref())?;
  let mods_store = manager.get_mods_store_path().ok();
  ProfileVpkSnapshot::read(&base, mods_store.as_deref())
}

/// Forget mods whose every VPK was deleted outside DMM. Only mods that are
/// still orphaned under the manager lock are dropped; their ids are returned.
#[tauri::command]
pub async fn forget_orphaned_mods(
  profile_folder: Option<String>,
  mod_ids: Vec<String>,
) -> Result<Vec<String>, Error> {
  let mut manager = MANAGER
    .lock()
    .map_err(|_| Error::BackgroundTaskFailed("Mod manager lock poisoned".to_string()))?;
  manager.forget_orphaned_mods(&mod_ids, profile_folder)
}

/// Start reporting VPK changes under the game's addons roots as
/// `addons-vpks-changed` events. Safe to call again, e.g. after the game path
/// changes.
#[tauri::command]
pub async fn watch_addons_vpks(app_handle: AppHandle) -> Result<(), Error> {
  let citadel = {
    let manager = MANAGER
      .lock()
      .map_err(|_| Error::BackgroundTaskFailed("Mod manager lock poisoned".to_string()))?;
    let addons = manager.get_addons_path(None)?;
    addons
      .parent()
      .map(Path::to_path_buf)
      .ok_or(Error::GamePathNotSet)?
  };
  crate::addons_watcher::watch(app_handle, citadel)
    .map_err(|error| Error::BackgroundTaskFailed(format!("Failed to watch addons: {error}")))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn snapshot_distinguishes_same_filename_in_different_shards() {
    let temp = tempfile::tempdir().unwrap();
    let base = ProfileBase::new(temp.path().join("citadel/addons")).unwrap();
    let shard_two = ShardIndex::new(2).unwrap();
    for shard in [ShardIndex::FIRST, shard_two] {
      std::fs::create_dir_all(base.shard_dir(shard)).unwrap();
      std::fs::write(base.shard_dir(shard).join("pak01_dir.vpk"), b"fixture").unwrap();
    }
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "mod",
      vec!["pak01_dir.vpk".into()],
      vec![],
      Some(0),
      shard_two,
    );
    manifest.save(&base).unwrap();

    let snapshot = ProfileVpkSnapshot::read(&base, None).unwrap();
    assert_eq!(snapshot.manifest, manifest);
    assert_eq!(snapshot.files.len(), 2);
    assert_eq!(snapshot.files[0].locator, "pak01_dir.vpk");
    assert_eq!(snapshot.files[1].locator, "addons2/pak01_dir.vpk");
  }
}
