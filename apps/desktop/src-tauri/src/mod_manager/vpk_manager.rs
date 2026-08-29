use self::staging::{
  PendingVpkOperation, RecoveryMode, RenameTransaction, VpkSnapshot, VpkStaging,
  recover_staging_directory,
};
use crate::errors::Error;
use crate::mod_manager::filesystem_helper::FileSystemHelper;
use crate::mod_manager::fs_retry;
use crate::mod_manager::shard::{self, ProfileBase, ShardIndex};
use log;
use regex::Regex;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

mod naming;
mod operations;
mod reorder;
pub(crate) mod staging;

/// Final placement of a mod's enabled VPKs after a sharded reorder.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShardPlacement {
  pub mod_id: String,
  /// 1-based shard index the VPKs now live in.
  pub shard: ShardIndex,
  /// New `pak##_dir.vpk` filenames within that shard, in order.
  pub vpks: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShardAssignment {
  pub mod_id: String,
  pub shard: ShardIndex,
  pub vpks: Vec<String>,
}

/// Where a sharded reorder moved everything it touched.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ShardReorderOutcome {
  /// Final placement of every mod in the requested assignments.
  pub placements: Vec<ShardPlacement>,
  /// Enabled VPKs no assignment claimed, as old `(shard, filename)` to new
  /// `(shard, filename)`. A reorder renumbers these too, so records that still
  /// name them have to follow them.
  pub orphan_renames: BTreeMap<(ShardIndex, String), (ShardIndex, String)>,
}

pub struct SwapRequest<'a> {
  pub base: &'a ProfileBase,
  pub current_shard: ShardIndex,
  pub target_shard: ShardIndex,
  pub mod_id: &'a str,
  pub current_installed_vpks: &'a [String],
  pub current_original_names: &'a [String],
  pub selected_original_names: &'a [String],
}

/// How to handle enabled VPK files that are recorded but missing on disk.
pub enum MissingVpkPolicy {
  /// Fail if any recorded enabled VPK file is missing (variant switch, swap).
  Strict,
  /// Filter missing files, warn, and proceed with those that exist (uninstall/disable).
  Reconcile,
}

/// Manages VPK file operations and installation
pub struct VpkManager {
  filesystem: FileSystemHelper,
}

impl VpkManager {
  pub fn new() -> Self {
    Self {
      filesystem: FileSystemHelper::new(),
    }
  }
}

impl Default for VpkManager {
  fn default() -> Self {
    Self::new()
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::mod_manager::vpk_manager::MissingVpkPolicy;
  use std::fs;

  fn write_vpk(addons_path: &std::path::Path, name: &str) {
    fs::write(addons_path.join(name), b"test vpk").unwrap();
  }

  /// `ProfileBase` only accepts `citadel/addons`-rooted paths, so tests that
  /// reach the shard layout need a real addons tree rather than a bare tempdir.
  fn addons_base(temp: &tempfile::TempDir) -> std::path::PathBuf {
    let addons_path = temp.path().join("citadel").join("addons");
    fs::create_dir_all(&addons_path).unwrap();
    addons_path
  }

  fn assignment(mod_id: impl Into<String>, filename: impl Into<String>) -> ShardAssignment {
    ShardAssignment {
      mod_id: mod_id.into(),
      shard: ShardIndex::FIRST,
      vpks: vec![filename.into()],
    }
  }

  #[test]
  fn detects_disabled_local_mod_prefixes() {
    assert_eq!(
      VpkManager::extract_mod_id_from_prefix("local-abc-123_mod.vpk"),
      Some("local-abc-123".to_string())
    );
    assert_eq!(
      VpkManager::extract_mod_id_from_prefix("123456_mod.vpk"),
      Some("123456".to_string())
    );
    assert_eq!(
      VpkManager::extract_mod_id_from_prefix("pak01_dir.vpk"),
      None
    );
  }

  #[test]
  fn reorder_keeps_disabled_local_vpks_disabled() {
    let temp = tempfile::tempdir().unwrap();
    let addons_path = addons_base(&temp);
    let addons_path = addons_path.as_path();
    write_vpk(addons_path, "pak01_dir.vpk");
    write_vpk(addons_path, "local-abc-123_original.vpk");

    let manager = VpkManager::new();
    let updated = manager
      .reorder_vpks_sharded(&[assignment("123456", "pak01_dir.vpk")], addons_path)
      .unwrap();

    assert_eq!(updated.len(), 1);
    assert_eq!(updated[0].mod_id, "123456");
    assert_eq!(updated[0].shard, ShardIndex::FIRST);
    assert_eq!(updated[0].vpks, vec!["pak01_dir.vpk".to_string()]);
    assert!(addons_path.join("local-abc-123_original.vpk").exists());
    assert!(!addons_path.join("pak02_dir.vpk").exists());
  }

  #[test]
  fn reorder_errors_before_mutating_when_vpk_is_assigned_to_multiple_mods() {
    let temp = tempfile::tempdir().unwrap();
    let addons_path = addons_base(&temp);
    let addons_path = addons_path.as_path();
    write_vpk(addons_path, "pak01_dir.vpk");

    let manager = VpkManager::new();
    let err = manager
      .reorder_vpks_sharded(
        &[
          assignment("first", "pak01_dir.vpk"),
          assignment("second", "pak01_dir.vpk"),
        ],
        addons_path,
      )
      .unwrap_err();

    assert!(err.to_string().contains(
      "Cannot reorder mods because VPK files are assigned to multiple mods: pak01_dir.vpk -> first, second"
    ));
    assert!(addons_path.join("pak01_dir.vpk").exists());
    assert!(!addons_path.join(shard::REORDER_STAGING_DIR).exists());
  }

  #[test]
  fn disable_errors_when_enabled_vpk_is_missing() {
    let temp = tempfile::tempdir().unwrap();
    let manager = VpkManager::new();

    let err = manager
      .disable_vpks_in(
        temp.path(),
        temp.path(),
        "123456",
        &["pak01_dir.vpk".to_string()],
        &["original.vpk".to_string()],
        MissingVpkPolicy::Strict,
      )
      .unwrap_err();

    assert!(err.to_string().contains("enabled VPK files are missing"));
  }

  #[test]
  fn disable_errors_when_original_name_count_does_not_match() {
    let temp = tempfile::tempdir().unwrap();
    write_vpk(temp.path(), "pak01_dir.vpk");
    write_vpk(temp.path(), "pak02_dir.vpk");
    let manager = VpkManager::new();

    let err = manager
      .disable_vpks_in(
        temp.path(),
        temp.path(),
        "123456",
        &["pak01_dir.vpk".to_string(), "pak02_dir.vpk".to_string()],
        &["first.vpk".to_string()],
        MissingVpkPolicy::Strict,
      )
      .unwrap_err();

    assert!(
      err
        .to_string()
        .contains("original VPK name count (1) does not match installed VPK count (2)")
    );
  }

  #[test]
  fn disable_reconciles_when_enabled_vpk_is_missing() {
    let temp = tempfile::tempdir().unwrap();
    let manager = VpkManager::new();

    let result = manager
      .disable_vpks_in(
        temp.path(),
        temp.path(),
        "123456",
        &["pak01_dir.vpk".to_string()],
        &["original.vpk".to_string()],
        MissingVpkPolicy::Reconcile,
      )
      .unwrap();

    assert!(result.is_empty());
  }

  #[test]
  fn disable_reconciles_partial_missing() {
    let temp = tempfile::tempdir().unwrap();
    write_vpk(temp.path(), "pak01_dir.vpk");
    let manager = VpkManager::new();

    let result = manager
      .disable_vpks_in(
        temp.path(),
        temp.path(),
        "123456",
        &["pak01_dir.vpk".to_string(), "pak02_dir.vpk".to_string()],
        &["first.vpk".to_string(), "second.vpk".to_string()],
        MissingVpkPolicy::Reconcile,
      )
      .unwrap();

    assert_eq!(result, vec!["123456_first.vpk".to_string()]);
    assert!(temp.path().join("123456_first.vpk").exists());
    assert!(!temp.path().join("pak01_dir.vpk").exists());
  }

  /// The core feature: more than 99 enabled VPKs are spread across sibling
  /// `addons`/`addons2` folders, bypassing the engine's 99-file-per-directory
  /// limit while preserving global load order.
  #[test]
  fn sharding_spreads_more_than_99_vpks_across_addon_folders() {
    let temp = tempfile::tempdir().unwrap();
    let addons_path = addons_base(&temp);
    let addons_path = addons_path.as_path();

    // 150 single-file mods, currently all crammed into the base folder
    // (the legacy "over the 99 limit" state on disk).
    let mut ordered = Vec::new();
    for i in 1..=150u32 {
      let name = format!("pak{i:02}_dir.vpk");
      write_vpk(addons_path, &name);
      ordered.push(assignment(format!("mod{i}"), name));
    }

    let manager = VpkManager::new();
    let placements = manager.reorder_vpks_sharded(&ordered, addons_path).unwrap();

    let base = ProfileBase::new(addons_path).unwrap();
    let shard1 = base.shard_dir(ShardIndex::FIRST);
    let shard2 = base.shard_dir(ShardIndex::new(2).unwrap());

    // Shard 1 (citadel/addons) fills to capacity, shard 2 (citadel/addons2)
    // takes the overflow.
    assert_eq!(VpkManager::count_enabled_vpks(&shard1), 99);
    assert_eq!(VpkManager::count_enabled_vpks(&shard2), 51);

    // Load order preserved: mods 1..99 in shard 1, 100..150 in shard 2.
    assert_eq!(placements.len(), 150);
    assert_eq!(placements[0].shard, ShardIndex::FIRST);
    assert_eq!(placements[98].shard, ShardIndex::FIRST);
    assert_eq!(placements[99].shard, ShardIndex::new(2).unwrap());
    assert_eq!(placements[149].shard, ShardIndex::new(2).unwrap());
    assert!(shard2.join("pak01_dir.vpk").is_file());
    assert!(shard2.join("pak51_dir.vpk").is_file());
    // No mod is split: shard 2 numbering restarts at pak01.
    assert!(!shard2.join("pak100_dir.vpk").exists());
  }

  /// Fix regression guard: disabling a mod whose prefixed destination already
  /// exists (a newly staged variant) must remove the active copy and keep the
  /// pre-existing variant intact — never clobber it via a bogus rollback rename.
  #[test]
  fn disable_with_existing_prefixed_destination_removes_active_copy() {
    let temp = tempfile::tempdir().unwrap();
    let addons_path = addons_base(&temp);
    let addons_path = addons_path.as_path();
    write_vpk(addons_path, "pak01_dir.vpk"); // active
    write_vpk(addons_path, "123456_original.vpk"); // pre-existing staged variant

    let manager = VpkManager::new();
    let out = manager
      .disable_vpks_in(
        addons_path,
        addons_path,
        "123456",
        &["pak01_dir.vpk".to_string()],
        &["original.vpk".to_string()],
        MissingVpkPolicy::Strict,
      )
      .unwrap();

    assert_eq!(out, vec!["123456_original.vpk".to_string()]);
    assert!(!addons_path.join("pak01_dir.vpk").exists()); // active removed
    assert!(addons_path.join("123456_original.vpk").exists()); // preserved
  }

  /// Fix regression guard: enabling must reject a missing source up front
  /// instead of warn-and-skip, so a mod can never be left partially enabled.
  #[test]
  fn enable_rejects_missing_source_before_renaming() {
    let temp = tempfile::tempdir().unwrap();
    let addons_path = addons_base(&temp);
    let addons_path = addons_path.as_path();
    write_vpk(addons_path, "123456_a.vpk"); // 123456_b.vpk is intentionally missing

    let manager = VpkManager::new();
    let err = manager
      .enable_vpks_in(
        addons_path,
        addons_path,
        "123456",
        &["123456_a.vpk".to_string(), "123456_b.vpk".to_string()],
      )
      .unwrap_err();

    assert!(err.to_string().contains("source VPK files are missing"));
    // Nothing was renamed: existing source untouched, no pak## created.
    assert!(addons_path.join("123456_a.vpk").exists());
    assert!(!addons_path.join("pak01_dir.vpk").exists());
  }

  /// Disabled copies always live in the profile base, whatever shard the mod is
  /// enabled in — otherwise re-enabling could not find its sources.
  #[test]
  fn enabling_and_disabling_cross_the_shard_boundary() {
    let temp = tempfile::tempdir().unwrap();
    let base = ProfileBase::new(addons_base(&temp)).unwrap();
    let shard_two = base.shard_dir(ShardIndex::new(2).unwrap());
    write_vpk(&base, "123456_overflow.vpk");

    let manager = VpkManager::new();
    let enabled = manager
      .enable_vpks_in(
        &base,
        &shard_two,
        "123456",
        &["123456_overflow.vpk".to_string()],
      )
      .unwrap();

    assert_eq!(enabled, vec!["pak01_dir.vpk".to_string()]);
    assert!(shard_two.join("pak01_dir.vpk").is_file());
    assert!(!base.join("123456_overflow.vpk").exists());

    let disabled = manager
      .disable_vpks_in(
        &shard_two,
        &base,
        "123456",
        &enabled,
        &["overflow.vpk".to_string()],
        MissingVpkPolicy::Strict,
      )
      .unwrap();

    assert_eq!(disabled, vec!["123456_overflow.vpk".to_string()]);
    assert!(base.join("123456_overflow.vpk").is_file());
    assert!(!shard_two.join("pak01_dir.vpk").exists());
  }

  /// Clearing a profile has to empty every shard, not just the base, or the
  /// engine would keep loading whatever was left behind in `addons2`.
  #[test]
  fn clearing_a_profile_empties_every_shard() {
    let temp = tempfile::tempdir().unwrap();
    let base = ProfileBase::new(addons_base(&temp)).unwrap();
    let shard_two = base.shard_dir(ShardIndex::new(2).unwrap());
    fs::create_dir_all(&shard_two).unwrap();
    write_vpk(&base, "pak01_dir.vpk");
    write_vpk(&base, "123456_disabled.vpk");
    fs::write(shard_two.join("pak01_dir.vpk"), b"test vpk").unwrap();

    VpkManager::new()
      .stage_clear_all_vpks(&base)
      .unwrap()
      .commit();

    assert_eq!(VpkManager::count_enabled_vpks(&base), 0);
    assert!(!base.join("123456_disabled.vpk").exists());
    assert!(!shard_two.join("pak01_dir.vpk").exists());
  }

  /// Fix regression guard: if a hard crash interrupts the placement phase, some
  /// files sit at their new `pak##` names and others are still staged. Recovery
  /// must never overwrite an already-placed file when restoring a staged one.
  #[test]
  fn reorder_recovery_does_not_clobber_already_placed_files() {
    let temp = tempfile::tempdir().unwrap();
    let base_path = addons_base(&temp);
    let base = ProfileBase::new(base_path).unwrap();

    fs::write(base.join("pak01_dir.vpk"), b"placed").unwrap();
    // A staged file whose original name collides with the placed one.
    let reorder = base.join(".dmm-reorder");
    fs::create_dir_all(&reorder).unwrap();
    fs::write(reorder.join("s1__pak01_dir.vpk"), b"staged").unwrap();

    recover_staging_directory(&base, &reorder, RecoveryMode::AvoidEnabledCollisions).unwrap();

    // Neither file is lost: the placed file keeps its slot, the staged file is
    // recovered into a free one.
    assert_eq!(fs::read(base.join("pak01_dir.vpk")).unwrap(), b"placed");
    assert_eq!(fs::read(base.join("pak02_dir.vpk")).unwrap(), b"staged");
  }
}
