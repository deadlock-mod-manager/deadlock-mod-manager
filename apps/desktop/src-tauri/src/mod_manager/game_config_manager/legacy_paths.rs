//! Legacy outer markers cannot distinguish our profiles from another tool's.
//! Only a readable DMM manifest can establish ownership of a base or named folder.

use super::*;
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
  let mut paths = Vec::new();
  if ProfileVpkManifest::exists(&addons) && ProfileVpkManifest::load(&addons).is_ok() {
    paths.extend(shard::all_shards().map(|shard| shard.search_path(None)));
  }
  for entry in entries {
    let entry = entry?;
    if !entry.file_type()?.is_dir() {
      continue;
    }
    let folder = entry.file_name();
    let Some(folder) = folder.to_str() else {
      continue;
    };
    if !shard::is_valid_search_path(&format!("citadel/addons/{folder}"))
      || !ProfileVpkManifest::exists(&entry.path())
      || ProfileVpkManifest::load(&entry.path()).is_err()
    {
      continue;
    }
    paths.extend(shard::all_shards().map(|shard| shard.search_path(Some(folder))));
  }
  Ok(paths)
}

#[cfg(test)]
mod tests {
  use super::*;

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
