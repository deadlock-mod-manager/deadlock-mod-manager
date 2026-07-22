//! Addon VPK sharding.
//!
//! The Source 2 engine only loads up to 99 `pak##_dir.vpk` files per search-path
//! directory. To let a profile hold more enabled mods than that, we spread the
//! enabled VPKs across sibling `citadel/addonsN` directories and register one
//! `Game citadel/addonsN/<...>` search-path line per shard in `gameinfo.gi`.
//!
//! Layout for a profile named `profile_x`:
//!   - Shard 1 is `citadel/addons/profile_x`.
//!   - Shard k >= 2 is `citadel/addons<k>/profile_x`.
//!
//! Disabled (prefixed `{mod_id}_*.vpk`) files and the `.dmm.json` manifest always
//! live in the base dir regardless of which shard a mod's enabled VPKs occupy.

use std::fs;
use std::path::{Path, PathBuf};

/// Max enabled `pak##_dir.vpk` files the engine loads per search-path directory.
pub const SHARD_CAPACITY: u32 = 99;

/// Max number of shard roots per profile (`addons`, `addons2` ..= `addons10`).
pub const MAX_SHARDS: u32 = 10;

/// On-disk directory that holds a shard's enabled pak files. `base` is either
/// `citadel/addons` for the default profile or `citadel/addons/<profile>`.
pub fn shard_dir(base: &Path, shard: u32) -> PathBuf {
  if shard <= 1 {
    return base.to_path_buf();
  }

  let Some(addons_root) = (base.file_name().and_then(|name| name.to_str()) == Some("addons"))
    .then_some(base)
    .or_else(|| {
      base
        .parent()
        .filter(|parent| parent.file_name().and_then(|name| name.to_str()) == Some("addons"))
    })
  else {
    return base.to_path_buf();
  };
  let Some(citadel_dir) = addons_root.parent() else {
    return base.to_path_buf();
  };

  let shard_root = citadel_dir.join(shard_root_name(shard));
  if base == addons_root {
    shard_root
  } else if let Some(profile_folder) = base.file_name() {
    shard_root.join(profile_folder)
  } else {
    shard_root
  }
}

/// Delete every existing shard directory for a profile `base` transactionally.
///
/// Each existing shard is first moved aside to a sibling staging name; only once
/// *all* shards have been staged are the staged directories removed. If staging
/// any shard fails, the already-staged shards are renamed back so a partial
/// failure leaves the profile intact rather than half-deleted. Returns whether
/// any shard existed.
pub fn remove_profile_shards(base: &Path) -> std::io::Result<bool> {
  let mut staged: Vec<(PathBuf, PathBuf)> = Vec::new();

  for shard_index in 1..=MAX_SHARDS {
    let dir = shard_dir(base, shard_index);
    if !dir.exists() {
      continue;
    }
    let staging = shard_delete_staging(&dir);
    if let Err(err) = fs::rename(&dir, &staging) {
      // Roll back the shards staged so far to their original names.
      for (original, staging) in staged.iter().rev() {
        if let Err(rollback_err) = fs::rename(staging, original) {
          log::error!("Failed to roll back staged shard {staging:?}: {rollback_err}");
        }
      }
      return Err(err);
    }
    staged.push((dir, staging));
  }

  let removed = !staged.is_empty();
  for (_, staging) in &staged {
    fs::remove_dir_all(staging)?;
  }
  Ok(removed)
}

/// Pick a unique sibling staging path for a shard directory about to be deleted.
fn shard_delete_staging(dir: &Path) -> PathBuf {
  let file_name = dir
    .file_name()
    .and_then(|name| name.to_str())
    .unwrap_or("shard");
  for attempt in 0..u32::MAX {
    let candidate = dir.with_file_name(format!(".dmm-deleting-{file_name}-{attempt}"));
    if !candidate.exists() {
      return candidate;
    }
  }
  dir.with_file_name(format!(".dmm-deleting-{file_name}"))
}

pub fn shard_root_name(shard: u32) -> String {
  if shard <= 1 {
    "addons".to_string()
  } else {
    format!("addons{shard}")
  }
}

pub fn shard_search_path(profile_folder: Option<&str>, shard: u32) -> String {
  let root = shard_root_name(shard);
  match profile_folder {
    Some(profile) => format!("citadel/{root}/{profile}"),
    None => format!("citadel/{root}"),
  }
}

pub fn is_valid_search_path(path: &str) -> bool {
  let mut segments = path.split('/');
  if segments.next() != Some("citadel") {
    return false;
  }

  let Some(root) = segments.next() else {
    return false;
  };
  let valid_root = root == "addons"
    || root
      .strip_prefix("addons")
      .and_then(|value| value.parse::<u32>().ok())
      .is_some_and(|value| (2..=MAX_SHARDS).contains(&value));
  if !valid_root {
    return false;
  }

  match (segments.next(), segments.next()) {
    (None, None) => true,
    (Some(profile), None) => is_gameinfo_safe_profile(profile),
    _ => false,
  }
}

/// Profile/server folder names are interpolated verbatim into `Game
/// citadel/addonsN/<profile>` lines in gameinfo.gi. Restrict them to a strict
/// allowlist so characters that are safe path components but unsafe in the KV
/// syntax (spaces, quotes, braces, control chars) can never reach that file.
/// Created folders are already sanitized to this set; this is defense in depth.
fn is_gameinfo_safe_profile(profile: &str) -> bool {
  !profile.is_empty()
    && profile
      .chars()
      .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::path::Path;

  #[test]
  fn shard_dir_resolves_sibling_addon_folders() {
    // Default profile: base is `citadel/addons`; shard N is the sibling
    // `citadel/addonsN`.
    let base = Path::new("/game/citadel/addons");
    assert_eq!(shard_dir(base, 1), base);
    assert_eq!(shard_dir(base, 2), Path::new("/game/citadel/addons2"));
    assert_eq!(shard_dir(base, 10), Path::new("/game/citadel/addons10"));

    // Named profile: shard N lives under `citadel/addonsN/<profile>`.
    let profile = Path::new("/game/citadel/addons/profile_x");
    assert_eq!(shard_dir(profile, 1), profile);
    assert_eq!(
      shard_dir(profile, 2),
      Path::new("/game/citadel/addons2/profile_x")
    );
  }

  #[test]
  fn valid_search_paths_accept_safe_profiles_and_shards() {
    assert!(is_valid_search_path("citadel/addons"));
    assert!(is_valid_search_path("citadel/addons/profile_123_my-mod"));
    assert!(is_valid_search_path("citadel/addons2/server_abc"));
    assert!(is_valid_search_path("citadel/addons10/profile_x"));
  }

  #[test]
  fn valid_search_paths_reject_unsafe_or_out_of_range() {
    // Hardened allowlist: characters that survive `Path::components()` but break
    // gameinfo.gi KV syntax must be rejected.
    assert!(!is_valid_search_path("citadel/addons/evil profile")); // space
    assert!(!is_valid_search_path("citadel/addons/pro\"file")); // quote
    assert!(!is_valid_search_path("citadel/addons/pro{file}")); // braces
    assert!(!is_valid_search_path("citadel/addons/../escape")); // traversal
    assert!(!is_valid_search_path("citadel/addons/a/b")); // nested
    assert!(!is_valid_search_path("citadel/addons11/profile")); // shard > MAX
    assert!(!is_valid_search_path("citadel/addons1/profile")); // shard 1 must be "addons"
    assert!(!is_valid_search_path("other/addons/profile")); // wrong root
  }
}
