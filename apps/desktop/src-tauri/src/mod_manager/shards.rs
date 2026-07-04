//! Shard allocation for exceeding the engine's per-search-path VPK cap.
//!
//! The Source 2 engine only mounts `pak01_dir.vpk`..`pak99_dir.vpk` (99 files)
//! from a single `Game` search path. To install more than 99 mods we spread the
//! enabled VPKs across several sibling addons folders, each registered as its own
//! search path in `gameinfo.gi`:
//!
//!   citadel/addons, citadel/addons2, citadel/addons3, ...  (root profile)
//!   citadel/addons/<profile>, citadel/addons2/<profile>, ... (named profile)
//!
//! Shard 1 is always the legacy base directory, so existing installs need no
//! migration: they simply become shard 1, and new mods spill into shard 2+.

use crate::errors::Error;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

use regex::Regex;

/// Max enabled VPKs the engine loads from one search-path directory.
pub const VPKS_PER_SHARD: u32 = 99;

/// Max shard directories per profile base folder (10 * 99 ~= 990 mods).
pub const MAX_SHARDS: u32 = 10;

static ENABLED_VPK_PATTERN: LazyLock<Regex> =
  LazyLock::new(|| Regex::new(r"^pak\d+_dir\.vpk$").expect("enabled VPK regex must be valid"));

/// Path of shard `shard` relative to `game/citadel/`.
///
/// Shard 1 is the legacy base directory; shard `k >= 2` appends the number so
/// `addons` -> `addons2` and `addons/<profile>` -> `addons2/<profile>`.
pub fn shard_rel_path(folder: Option<&str>, shard: u32) -> String {
  let addons_dir = if shard <= 1 {
    "addons".to_string()
  } else {
    format!("addons{shard}")
  };

  match folder {
    Some(p) if !p.is_empty() => format!("{addons_dir}/{p}"),
    _ => addons_dir,
  }
}

/// Search-path string written into `gameinfo.gi`, e.g. `citadel/addons2`.
pub fn shard_search_path(folder: Option<&str>, shard: u32) -> String {
  format!("citadel/{}", shard_rel_path(folder, shard))
}

/// On-disk directory of a shard.
pub fn shard_dir(game_path: &Path, folder: Option<&str>, shard: u32) -> PathBuf {
  let mut dir = game_path.join("game").join("citadel");
  for component in shard_rel_path(folder, shard).split('/') {
    dir = dir.join(component);
  }
  dir
}

/// Whether `dir` exists and holds at least one enabled `pak##_dir.vpk`.
pub fn dir_has_enabled_vpk(dir: &Path) -> bool {
  let Ok(entries) = std::fs::read_dir(dir) else {
    return false;
  };
  for entry in entries.flatten() {
    if entry.path().is_file()
      && let Some(name) = entry.file_name().to_str()
      && ENABLED_VPK_PATTERN.is_match(name)
    {
      return true;
    }
  }
  false
}

/// Count enabled `pak##_dir.vpk` files in `dir` (0 if it does not exist).
pub fn count_enabled_vpks(dir: &Path) -> u32 {
  let Ok(entries) = std::fs::read_dir(dir) else {
    return 0;
  };
  entries
    .flatten()
    .filter(|entry| {
      entry.path().is_file()
        && entry
          .file_name()
          .to_str()
          .is_some_and(|name| ENABLED_VPK_PATTERN.is_match(name))
    })
    .count() as u32
}

/// Pick the shard (1-based) for a mod needing `needed` enabled-VPK slots.
///
/// `counts[i]` is the current enabled-VPK count of shard `i + 1`. The mod's VPKs
/// are always kept together in one shard. Returns the first shard with room,
/// filling gaps before allocating a new one.
pub fn choose_shard_for(counts: &[u32], needed: u32) -> Result<u32, Error> {
  if needed == 0 {
    return Ok(1);
  }
  if needed > VPKS_PER_SHARD {
    return Err(Error::ModInvalid(format!(
      "This mod has {needed} VPK files, which exceeds the {VPKS_PER_SHARD}-file limit of a single addons folder and cannot be installed."
    )));
  }

  for shard in 1..=MAX_SHARDS {
    let current = counts.get((shard - 1) as usize).copied().unwrap_or(0);
    if current + needed <= VPKS_PER_SHARD {
      return Ok(shard);
    }
  }

  Err(Error::ModInvalid(format!(
    "All {MAX_SHARDS} addons folders are full (up to {} VPK files). Disable some mods before installing more.",
    MAX_SHARDS * VPKS_PER_SHARD
  )))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn rel_path_root_and_profile() {
    assert_eq!(shard_rel_path(None, 1), "addons");
    assert_eq!(shard_rel_path(None, 2), "addons2");
    assert_eq!(shard_rel_path(None, 10), "addons10");
    assert_eq!(shard_rel_path(Some("profile_x"), 1), "addons/profile_x");
    assert_eq!(shard_rel_path(Some("profile_x"), 3), "addons3/profile_x");
    // Empty folder behaves like root.
    assert_eq!(shard_rel_path(Some(""), 2), "addons2");
  }

  #[test]
  fn search_path_matches_issue_example() {
    assert_eq!(shard_search_path(None, 1), "citadel/addons");
    assert_eq!(shard_search_path(None, 2), "citadel/addons2");
    assert_eq!(
      shard_search_path(Some("profile_default"), 2),
      "citadel/addons2/profile_default"
    );
  }

  #[test]
  fn shard_dir_builds_nested_path() {
    let game = Path::new("/game");
    assert_eq!(
      shard_dir(game, None, 1),
      Path::new("/game/game/citadel/addons")
    );
    assert_eq!(
      shard_dir(game, None, 2),
      Path::new("/game/game/citadel/addons2")
    );
    assert_eq!(
      shard_dir(game, Some("profile_x"), 2),
      Path::new("/game/game/citadel/addons2/profile_x")
    );
  }

  #[test]
  fn choose_fills_first_shard_then_spills() {
    // Empty -> shard 1.
    assert_eq!(choose_shard_for(&[], 3).unwrap(), 1);
    // Shard 1 has room.
    assert_eq!(choose_shard_for(&[90], 5).unwrap(), 1);
    // Shard 1 would overflow (96 + 5 > 99) -> shard 2.
    assert_eq!(choose_shard_for(&[96], 5).unwrap(), 2);
    // Fills a gap in an earlier shard before a later one.
    assert_eq!(choose_shard_for(&[99, 10, 99], 5).unwrap(), 2);
  }

  #[test]
  fn choose_keeps_multi_vpk_mod_together() {
    // 98 used, mod needs 2 -> does not fit in shard 1, goes to shard 2 whole.
    assert_eq!(choose_shard_for(&[98], 2).unwrap(), 2);
  }

  #[test]
  fn choose_rejects_oversized_single_mod() {
    let err = choose_shard_for(&[0], 100).unwrap_err();
    assert!(err.to_string().contains("exceeds"));
  }

  #[test]
  fn choose_rejects_when_all_shards_full() {
    let counts = vec![99u32; MAX_SHARDS as usize];
    let err = choose_shard_for(&counts, 1).unwrap_err();
    assert!(err.to_string().contains("full"));
  }
}
