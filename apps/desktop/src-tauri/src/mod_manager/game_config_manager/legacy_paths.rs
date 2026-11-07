//! Legacy outer markers cannot distinguish our profiles from another tool's.
//! Only a readable DMM manifest can establish ownership of a named folder.

use super::*;
use crate::mod_manager::vpk_manifest::ProfileVpkManifest;

pub(super) fn claims(game_path: &Path, content: &str) -> Result<Vec<String>, Error> {
  if !content.contains(gameinfo_search_paths::LEGACY_START) {
    return Ok(Vec::new());
  }
  let addons = game_path.join("game/citadel/addons");
  let entries = match fs::read_dir(&addons) {
    Ok(entries) => entries,
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
    Err(error) => return Err(error.into()),
  };
  let mut paths = Vec::new();
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
