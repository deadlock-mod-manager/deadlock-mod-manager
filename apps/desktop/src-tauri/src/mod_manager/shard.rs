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
    (Some(profile), None) => {
      !profile.is_empty()
        && Path::new(profile)
          .components()
          .all(|component| matches!(component, std::path::Component::Normal(_)))
    }
    _ => false,
  }
}
