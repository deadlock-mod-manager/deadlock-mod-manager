//! Legacy outer markers cannot distinguish our profiles from another tool's.
//! Only a readable DMM manifest can establish ownership of a base or named folder.

use super::*;
use crate::mod_manager::shard::{ProfileBase, ShardIndex};
use crate::mod_manager::vpk_manager::VpkManager;
use crate::mod_manager::vpk_manifest::ProfileVpkManifest;

pub(super) fn claims(game_path: &Path, content: &str) -> Result<Vec<String>, Error> {
  if !content
    .lines()
    .any(|line| line.trim() == gameinfo_search_paths::LEGACY_START)
  {
    return Ok(Vec::new());
  }
  let addons = game_path.join("game/citadel/addons");
  let entries = match fs::read_dir(&addons) {
    Ok(entries) => entries,
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
    Err(error) => return Err(error.into()),
  };
  let mut paths = profile_claims(&addons, None)?;
  for entry in entries {
    let entry = entry?;
    if !entry.file_type()?.is_dir() {
      continue;
    }
    let folder = entry.file_name();
    let Some(folder) = folder.to_str() else {
      continue;
    };
    if !shard::is_valid_search_path(&format!("citadel/addons/{folder}")) {
      continue;
    }
    paths.extend(profile_claims(&entry.path(), Some(folder))?);
  }
  Ok(paths)
}

fn profile_claims(path: &Path, folder: Option<&str>) -> Result<Vec<String>, Error> {
  if !ProfileVpkManifest::exists(path) {
    return Ok(Vec::new());
  }
  let Ok(manifest) = ProfileVpkManifest::load(path) else {
    return Ok(Vec::new());
  };
  // Disabled entries retain their previous shard. Legacy writers also mounted
  // every shard through the highest with enabled VPKs on disk, including gaps.
  let mut highest = manifest
    .mods
    .values()
    .map(|entry| entry.shard)
    .max()
    .unwrap_or(ShardIndex::FIRST);
  for (index, directory) in ProfileBase::new(path)?.shards().skip(1) {
    if VpkManager::count_enabled_vpks(&directory) > 0 {
      highest = highest.max(index);
    }
  }
  Ok(
    shard::all_shards()
      .take_while(|index| *index <= highest)
      .map(|index| index.search_path(folder))
      .collect(),
  )
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::mod_manager::vpk_manifest::ProfileVpkManifestEntry;

  #[test]
  fn empty_manifests_do_not_claim_unused_overflow_directories() {
    for folder in [None, Some("profile_owned")] {
      let game = tempfile::tempdir().unwrap();
      let base = game.path().join("game/citadel/addons");
      let path = folder.map_or_else(|| base.clone(), |folder| base.join(folder));
      fs::create_dir_all(&path).unwrap();
      ProfileVpkManifest::default().save(&path).unwrap();
      let profile = ProfileBase::new(&path).unwrap();
      let overflow = profile.shard_dir(ShardIndex::new(2).unwrap());
      fs::create_dir_all(&overflow).unwrap();
      fs::write(overflow.join("readme.txt"), "another tool's directory").unwrap();
      assert_eq!(
        claims(game.path(), gameinfo_search_paths::LEGACY_START).unwrap(),
        [ShardIndex::FIRST.search_path(folder)]
      );
    }
  }

  #[test]
  fn retained_records_and_legacy_disk_shards_bound_overflow_claims() {
    for folder in [None, Some("profile_owned")] {
      for on_disk in [false, true] {
        let game = tempfile::tempdir().unwrap();
        let base = game.path().join("game/citadel/addons");
        let path = folder.map_or_else(|| base.clone(), |folder| base.join(folder));
        fs::create_dir_all(&path).unwrap();
        let mut manifest = ProfileVpkManifest::default();
        if on_disk {
          manifest.version = 1;
          // Pre-sharding metadata cannot identify where these files live.
          let overflow = ProfileBase::new(&path)
            .unwrap()
            .shard_dir(ShardIndex::new(3).unwrap());
          fs::create_dir_all(&overflow).unwrap();
          fs::write(overflow.join("pak01_dir.vpk"), "legacy payload").unwrap();
        } else {
          manifest.mods.insert(
            "disabled-mod".into(),
            ProfileVpkManifestEntry {
              shard: ShardIndex::new(3).unwrap(),
              ..Default::default()
            },
          );
        }
        manifest.save(&path).unwrap();
        let expected: Vec<_> = shard::all_shards()
          .take(3)
          .map(|index| index.search_path(folder))
          .collect();
        assert_eq!(
          claims(game.path(), gameinfo_search_paths::LEGACY_START).unwrap(),
          expected
        );
      }
    }
  }

  #[test]
  fn versioned_markers_skip_legacy_manifest_scanning() {
    let directory = tempfile::tempdir().unwrap();
    let citadel = directory.path().join("game/citadel");
    fs::create_dir_all(&citadel).unwrap();
    // Make an accidental scan observable without platform-specific permissions.
    fs::write(citadel.join("addons"), "not a directory").unwrap();
    let versioned = include_str!("../gameinfo_search_paths/fixtures/deadworks-after-dmm.gi");
    assert!(claims(directory.path(), versioned).unwrap().is_empty());
    let legacy = format!(" \t{}\r\n", gameinfo_search_paths::LEGACY_START);
    assert!(claims(directory.path(), &legacy).is_err());
  }
}
