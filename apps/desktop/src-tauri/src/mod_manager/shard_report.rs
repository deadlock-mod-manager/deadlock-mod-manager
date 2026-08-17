//! Consistency report for a profile's shard layout.
//!
//! Sharding only works when three sources agree: the shard directories on disk,
//! the profile manifest, and the `Game` search paths in gameinfo.gi. This module
//! compares them and names the disagreements, so developer mode can show what is
//! wrong rather than a wall of numbers to eyeball.

use crate::mod_manager::shard::{self, ProfileBase};
use serde::Serialize;
use vpkmanager::ledger::ProfileLedger;
use vpkmanager::naming;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShardInfo {
  pub index: u32,
  pub directory: String,
  pub exists: bool,
  /// `pak##_dir.vpk` files the engine will load from this directory.
  pub enabled_vpks: u32,
  /// Mods the manifest places in this shard.
  pub manifest_mods: u32,
  /// Pak numbers above the engine's per-directory limit. Always false once a
  /// profile has been migrated; a leftover from the pre-sharding layout.
  pub out_of_range_vpks: bool,
  /// Whether this shard's search path is present in gameinfo.gi.
  pub in_gameinfo: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShardReport {
  pub profile_folder: Option<String>,
  pub shard_capacity: u32,
  pub max_shards: u32,
  /// True once a profile spills past its first shard.
  pub sharding_active: bool,
  pub shards_in_use: u32,
  pub total_enabled_vpks: u32,
  pub manifest_version: u32,
  pub manifest_mods: u32,
  pub manifest_enabled_mods: u32,
  /// Search paths this profile's state implies.
  pub expected_search_paths: Vec<String>,
  /// Addon search paths actually written between the mod manager markers.
  pub gameinfo_search_paths: Vec<String>,
  pub search_paths_in_sync: bool,
  pub needs_migration: bool,
  pub shards: Vec<ShardInfo>,
  /// The disagreements, in the words the user needs to act on them.
  pub issues: Vec<String>,
}

/// Everything the report is derived from, gathered by the caller because each
/// piece comes from a different owner.
pub struct ShardReportInput<'a> {
  pub base: &'a ProfileBase,
  pub profile_folder: Option<String>,
  pub manifest: &'a ProfileLedger,
  pub expected_search_paths: Vec<String>,
  pub gameinfo_search_paths: Vec<String>,
  pub needs_migration: bool,
}

pub fn analyze(input: ShardReportInput<'_>) -> ShardReport {
  let profile_folder = input.profile_folder;
  let mut shards = Vec::new();
  let mut issues = Vec::new();
  let mut total_enabled_vpks = 0;
  let mut shards_in_use = 0;

  for (index, directory) in input.base.shards() {
    let enabled_vpks = naming::count_enabled_vpks(&directory);
    let manifest_mods = input
      .manifest
      .mods
      .values()
      .filter(|entry| entry.enabled && entry.shard == index && !entry.current_vpks.is_empty())
      .count() as u32;
    let search_path = index.search_path(profile_folder.as_deref());
    let in_gameinfo = input.gameinfo_search_paths.contains(&search_path);
    let out_of_range_vpks = naming::has_out_of_range_enabled_vpks(&directory);

    total_enabled_vpks += enabled_vpks;
    if enabled_vpks > 0 {
      shards_in_use += 1;
    }

    if enabled_vpks > 0 && !in_gameinfo {
      issues.push(format!(
        "Shard {index} holds {enabled_vpks} enabled VPKs but {search_path} is not in gameinfo.gi, so the engine will not load them."
      ));
    }
    if manifest_mods > 0 && enabled_vpks == 0 {
      issues.push(format!(
        "The manifest places {manifest_mods} mod(s) in shard {index}, but no enabled VPKs exist there."
      ));
    }
    if enabled_vpks > shard::SHARD_CAPACITY {
      issues.push(format!(
        "Shard {index} holds {enabled_vpks} enabled VPKs, over the engine limit of {}.",
        shard::SHARD_CAPACITY
      ));
    }
    if out_of_range_vpks {
      issues.push(format!(
        "Shard {index} contains pak files numbered above {} that the engine ignores.",
        shard::SHARD_CAPACITY
      ));
    }

    shards.push(ShardInfo {
      index: index.get(),
      directory: directory.to_string_lossy().to_string(),
      exists: directory.exists(),
      enabled_vpks,
      manifest_mods,
      out_of_range_vpks,
      in_gameinfo,
    });
  }

  let missing_paths = input
    .expected_search_paths
    .iter()
    .filter(|path| !input.gameinfo_search_paths.contains(path))
    .count();
  if missing_paths > 0 {
    issues.push(format!(
      "gameinfo.gi is missing {missing_paths} expected search path(s). Switch profiles or launch the game to rewrite it."
    ));
  }
  if input.needs_migration {
    issues.push(
      "This profile still uses the pre-sharding layout and will be migrated on the next profile switch or game launch.".to_string(),
    );
  }

  ShardReport {
    profile_folder,
    shard_capacity: shard::SHARD_CAPACITY,
    max_shards: shard::MAX_SHARDS,
    sharding_active: shards_in_use > 1,
    shards_in_use,
    total_enabled_vpks,
    manifest_version: input.manifest.version,
    manifest_mods: input.manifest.mods.len() as u32,
    manifest_enabled_mods: input
      .manifest
      .mods
      .values()
      .filter(|entry| entry.enabled)
      .count() as u32,
    search_paths_in_sync: missing_paths == 0,
    expected_search_paths: input.expected_search_paths,
    gameinfo_search_paths: input.gameinfo_search_paths,
    needs_migration: input.needs_migration,
    shards,
    issues,
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::mod_manager::shard::ShardIndex;
  use std::fs;

  fn profile(temp: &tempfile::TempDir) -> ProfileBase {
    let path = temp.path().join("citadel").join("addons").join("profile_x");
    fs::create_dir_all(&path).unwrap();
    ProfileBase::new(path).unwrap()
  }

  fn write_pak(dir: &std::path::Path, name: &str) {
    fs::create_dir_all(dir).unwrap();
    fs::write(dir.join(name), b"vpk").unwrap();
  }

  fn report(base: &ProfileBase, manifest: &ProfileLedger, gameinfo: &[&str]) -> ShardReport {
    analyze(ShardReportInput {
      base,
      profile_folder: Some("profile_x".to_string()),
      manifest,
      expected_search_paths: vec![
        "citadel/addons/profile_x".to_string(),
        "citadel/addons2/profile_x".to_string(),
      ],
      gameinfo_search_paths: gameinfo.iter().map(|p| p.to_string()).collect(),
      needs_migration: false,
    })
  }

  fn two_shard_manifest() -> ProfileLedger {
    let mut manifest = ProfileLedger::default();
    manifest.mark_enabled(
      "base",
      vec!["pak01_dir.vpk".to_string()],
      vec!["a.vpk".to_string()],
      Some(0),
      ShardIndex::FIRST,
    );
    manifest.mark_enabled(
      "overflow",
      vec!["pak01_dir.vpk".to_string()],
      vec!["b.vpk".to_string()],
      Some(1),
      ShardIndex::new(2).unwrap(),
    );
    manifest
  }

  #[test]
  fn a_consistent_two_shard_profile_reports_no_issues() {
    let temp = tempfile::tempdir().unwrap();
    let base = profile(&temp);
    write_pak(base.path(), "pak01_dir.vpk");
    write_pak(
      &base.shard_dir(ShardIndex::new(2).unwrap()),
      "pak01_dir.vpk",
    );

    let report = report(
      &base,
      &two_shard_manifest(),
      &["citadel/addons/profile_x", "citadel/addons2/profile_x"],
    );

    assert!(report.issues.is_empty(), "{:?}", report.issues);
    assert!(report.sharding_active);
    assert!(report.search_paths_in_sync);
    assert_eq!(report.shards_in_use, 2);
    assert_eq!(report.total_enabled_vpks, 2);
  }

  /// The exact failure a user hits after an upgrade: the files are sharded
  /// correctly but gameinfo.gi still lists only the base folder.
  #[test]
  fn an_overflow_shard_missing_from_gameinfo_is_reported() {
    let temp = tempfile::tempdir().unwrap();
    let base = profile(&temp);
    write_pak(base.path(), "pak01_dir.vpk");
    write_pak(
      &base.shard_dir(ShardIndex::new(2).unwrap()),
      "pak01_dir.vpk",
    );

    let report = report(&base, &two_shard_manifest(), &["citadel/addons/profile_x"]);

    assert!(!report.search_paths_in_sync);
    assert!(
      report
        .issues
        .iter()
        .any(|issue| issue.contains("citadel/addons2/profile_x is not in gameinfo.gi")),
      "{:?}",
      report.issues
    );
  }

  #[test]
  fn a_manifest_pointing_at_an_empty_shard_is_reported() {
    let temp = tempfile::tempdir().unwrap();
    let base = profile(&temp);
    write_pak(base.path(), "pak01_dir.vpk");

    let report = report(
      &base,
      &two_shard_manifest(),
      &["citadel/addons/profile_x", "citadel/addons2/profile_x"],
    );

    assert!(
      report
        .issues
        .iter()
        .any(|issue| issue.contains("places 1 mod(s) in shard 2")),
      "{:?}",
      report.issues
    );
  }

  #[test]
  fn leftover_out_of_range_pak_numbers_are_reported() {
    let temp = tempfile::tempdir().unwrap();
    let base = profile(&temp);
    write_pak(base.path(), "pak01_dir.vpk");
    write_pak(base.path(), "pak150_dir.vpk");

    let report = report(
      &base,
      &ProfileLedger::default(),
      &["citadel/addons/profile_x", "citadel/addons2/profile_x"],
    );

    assert!(report.shards[0].out_of_range_vpks);
    assert!(
      report
        .issues
        .iter()
        .any(|issue| issue.contains("numbered above 99")),
      "{:?}",
      report.issues
    );
  }
}
