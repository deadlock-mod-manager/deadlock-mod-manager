use crate::errors::Error;
use crate::mod_manager::shard::{ProfileBase, ShardIndex, ShardLocator};
use crate::mod_manager::vpk_manifest::ProfileVpkManifest;
use serde::Serialize;

use super::state::MANAGER;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileVpkSnapshot {
  manifest: ProfileVpkManifest,
  files: Vec<SnapshotVpkFile>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotVpkFile {
  shard: ShardIndex,
  filename: String,
  locator: String,
}

impl ProfileVpkSnapshot {
  fn read(base: &ProfileBase) -> Result<Self, Error> {
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
    Ok(Self { manifest, files })
  }
}

#[tauri::command]
pub async fn get_profile_vpk_snapshot(
  profile_folder: Option<String>,
) -> Result<ProfileVpkSnapshot, Error> {
  // Keep the filesystem listing and manifest in the same critical section:
  // a reorder between separate IPC reads would compare two different layouts.
  let mut manager = MANAGER.lock().unwrap();
  manager.migrate_profile_to_shards(profile_folder.clone())?;
  let base = manager.get_addons_path(profile_folder.as_deref())?;
  ProfileVpkSnapshot::read(&base)
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
    manifest.mark_enabled("mod", vec!["pak01_dir.vpk".into()], vec![], Some(0), shard_two);
    manifest.save(&base).unwrap();

    let snapshot = ProfileVpkSnapshot::read(&base).unwrap();
    assert_eq!(snapshot.manifest, manifest);
    assert_eq!(snapshot.files.len(), 2);
    assert_eq!(snapshot.files[0].locator, "pak01_dir.vpk");
    assert_eq!(snapshot.files[1].locator, "addons2/pak01_dir.vpk");
  }
}
