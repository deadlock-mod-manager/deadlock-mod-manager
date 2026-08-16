//! Laying a profile's enabled VPKs out in load order across shard folders.
//!
//! The engine loads `pak##_dir.vpk` in numeric order within a search path, and
//! the search paths themselves are ordered. Reordering therefore means renaming
//! nearly every enabled file at once, which is why the whole pass runs through a
//! staging directory: until the last file is placed, every one of them can go
//! back where it was.

use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use super::{ShardAssignment, ShardPlacement};
use crate::error::{Result, VpkManagerError};
use crate::naming;
use crate::profile::{
    self, MAX_SHARDS, ProfileBase, REORDER_STAGING_DIR, SHARD_CAPACITY, ShardIndex,
};
use crate::staging::{PendingVpkOperation, RecoveryMode, VpkStaging, recover_staging_directory};

/// Reorder enabled VPKs across shard directories.
///
/// Mods are packed sequentially into shards, never splitting a mod across
/// shards, so the global load order remains stable.
pub fn reorder_vpks_sharded(
    ordered_mods: &[ShardAssignment],
    base: &Path,
) -> Result<Vec<ShardPlacement>> {
    Ok(stage_reorder_vpks_sharded(ordered_mods, base)?.commit())
}

pub fn stage_reorder_vpks_sharded(
    ordered_mods: &[ShardAssignment],
    base: &Path,
) -> Result<PendingVpkOperation<Vec<ShardPlacement>>> {
    if !base.exists() {
        return Err(VpkManagerError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Addons path not found: {base:?}"),
        )));
    }

    log::info!(
        "Starting sharded VPK reordering for {} mods",
        ordered_mods.len()
    );

    let base = ProfileBase::new(base)?;
    let temp_dir = base.join(REORDER_STAGING_DIR);
    if temp_dir.exists() {
        log::warn!("Recovering VPK files left by an interrupted reorder");
        recover_staging_directory(&base, &temp_dir, RecoveryMode::AvoidEnabledCollisions)?;
    }

    let duplicate_assignments = duplicate_assignments(ordered_mods);
    if !duplicate_assignments.is_empty() {
        return Err(VpkManagerError::Vpk(format!(
            "Cannot reorder mods because VPK files are assigned to multiple mods: {}",
            duplicate_assignments.join("; ")
        )));
    }

    let mut missing_vpks = Vec::new();
    for assignment in ordered_mods {
        let dir = base.shard_dir(assignment.shard);
        for old_vpk_name in &assignment.vpks {
            let filename = naming::file_name_of(old_vpk_name);
            if !dir.join(&filename).exists() {
                missing_vpks.push(format!("{}:{filename}", assignment.mod_id));
            }
        }
    }

    if !missing_vpks.is_empty() {
        return Err(VpkManagerError::Vpk(format!(
            "Cannot reorder mods because enabled VPK files are missing: {}",
            missing_vpks.join(", ")
        )));
    }

    let owned_vpks: HashSet<(ShardIndex, String)> = ordered_mods
        .iter()
        .flat_map(|assignment| {
            assignment
                .vpks
                .iter()
                .map(|vpk| (assignment.shard, naming::file_name_of(vpk)))
        })
        .collect();
    let orphan_sources = find_orphaned_enabled_vpks(&base, &owned_vpks)?;
    validate_capacity(ordered_mods, orphan_sources.len() as u32)?;

    let mut staging = VpkStaging::claim(&base, REORDER_STAGING_DIR)?;
    match place_everything(ordered_mods, orphan_sources, &base, &mut staging) {
        Ok(placements) => {
            prune_empty_shard_dirs(&base);
            Ok(PendingVpkOperation::with_staging(placements, staging))
        }
        Err(error) => {
            let error = staging.rollback(error);
            log::error!("Sharded reorder failed and was rolled back: {error}");
            Err(error)
        }
    }
}

/// Remove shard directories a mod left empty, so a profile that shrank back
/// under the per-folder limit stops advertising extra search paths.
pub fn prune_empty_shard_dirs(base: &ProfileBase) {
    for shard_index in profile::all_shards().skip(1) {
        let dir = base.shard_dir(shard_index);
        if dir.exists()
            && let Ok(mut entries) = fs::read_dir(&dir)
            && entries.next().is_none()
        {
            let _ = fs::remove_dir(&dir);
        }
    }
}

/// Stage every enabled VPK (grouped by mod, orphans last), then place them back
/// sequentially across shards.
fn place_everything(
    ordered_mods: &[ShardAssignment],
    orphan_sources: Vec<(ShardIndex, PathBuf)>,
    base: &ProfileBase,
    staging: &mut VpkStaging,
) -> Result<Vec<ShardPlacement>> {
    let mut staged_by_mod: Vec<(String, Vec<PathBuf>)> = Vec::new();
    let mut orphan_staged = Vec::new();

    for assignment in ordered_mods {
        let dir = base.shard_dir(assignment.shard);
        let mut staged = Vec::new();
        for vpk in &assignment.vpks {
            staged.push(staging.stage(base, &dir.join(naming::file_name_of(vpk)))?);
        }
        staged_by_mod.push((assignment.mod_id.clone(), staged));
    }

    for (_, source) in orphan_sources {
        orphan_staged.push(staging.stage(base, &source)?);
    }

    let mut placements = Vec::new();
    let mut cursor = ShardCursor::default();

    for (mod_id, staged) in &staged_by_mod {
        let (shard, vpks) = cursor.place_group(base, staging, staged)?;
        placements.push(ShardPlacement {
            mod_id: mod_id.clone(),
            shard,
            vpks,
        });
    }

    for orphan in &orphan_staged {
        cursor.place_group(base, staging, std::slice::from_ref(orphan))?;
    }

    Ok(placements)
}

/// Where the next group of VPKs goes: which shard is being filled, and how full
/// it is.
struct ShardCursor {
    shard: u32,
    used: u32,
}

impl Default for ShardCursor {
    fn default() -> Self {
        Self { shard: 1, used: 0 }
    }
}

impl ShardCursor {
    /// Move a group of staged files into the current shard, opening a new shard
    /// first if the group would overflow it. The whole group always lands in one
    /// shard so a mod's VPKs stay together.
    fn place_group(
        &mut self,
        base: &ProfileBase,
        staging: &mut VpkStaging,
        staged: &[PathBuf],
    ) -> Result<(ShardIndex, Vec<String>)> {
        let count = staged.len() as u32;
        if count > 0 && self.used + count > SHARD_CAPACITY {
            self.shard += 1;
            self.used = 0;
            if self.shard > MAX_SHARDS {
                return Err(VpkManagerError::Vpk(format!(
                    "Cannot enable this many VPK files: all {MAX_SHARDS} addon shard folders are full ({SHARD_CAPACITY} files each, ~{} total). Disable some mods first.",
                    MAX_SHARDS * SHARD_CAPACITY
                )));
            }
        }

        let shard = ShardIndex::new(self.shard)?;
        let dir = base.shard_dir(shard);
        fs::create_dir_all(&dir)?;
        let mut names = Vec::new();
        for staged_vpk in staged {
            self.used += 1;
            let new_name = naming::enabled_vpk_name(self.used);
            staging.place(staged_vpk, &dir.join(&new_name))?;
            names.push(new_name);
        }
        Ok((shard, names))
    }
}

fn find_orphaned_enabled_vpks(
    base: &ProfileBase,
    owned_vpks: &HashSet<(ShardIndex, String)>,
) -> Result<Vec<(ShardIndex, PathBuf)>> {
    let mut orphans = Vec::new();
    for (shard_index, dir) in base.existing_shards() {
        for entry in fs::read_dir(&dir)? {
            let path = entry?.path();
            let Some(filename) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            if path.is_file()
                && naming::is_enabled_vpk_name(filename)
                && !owned_vpks.contains(&(shard_index, filename.to_string()))
            {
                orphans.push((shard_index, path));
            }
        }
    }
    orphans.sort_by_key(|(shard_index, path)| {
        (
            *shard_index,
            path.file_name()
                .and_then(|name| name.to_str())
                .and_then(naming::enabled_vpk_number)
                .unwrap_or(u32::MAX),
        )
    });
    Ok(orphans)
}

/// Check up front that the requested layout fits, so a reorder that cannot
/// succeed fails before it has moved a single file.
fn validate_capacity(ordered_mods: &[ShardAssignment], orphan_count: u32) -> Result<()> {
    let mut current_shard = 1u32;
    let mut used = 0u32;
    for assignment in ordered_mods {
        let count = assignment.vpks.len() as u32;
        if count > SHARD_CAPACITY {
            return Err(VpkManagerError::Vpk(format!(
                "Mod {} has {count} VPK files and cannot fit in one addon folder",
                assignment.mod_id
            )));
        }
        if used + count > SHARD_CAPACITY {
            current_shard += 1;
            used = 0;
        }
        used += count;
    }
    let additional_shards = orphan_count
        .saturating_sub(SHARD_CAPACITY - used)
        .div_ceil(SHARD_CAPACITY);
    if current_shard + additional_shards > MAX_SHARDS {
        return Err(VpkManagerError::Vpk(format!(
            "Cannot reorder VPKs: all {MAX_SHARDS} addon folders would be exceeded"
        )));
    }
    Ok(())
}

/// VPK files more than one mod claims, which would make the reorder ambiguous.
fn duplicate_assignments(ordered_mods: &[ShardAssignment]) -> Vec<String> {
    let mut owners_by_vpk: BTreeMap<(ShardIndex, String), Vec<String>> = BTreeMap::new();

    for assignment in ordered_mods {
        for vpk_name in &assignment.vpks {
            owners_by_vpk
                .entry((assignment.shard, naming::file_name_of(vpk_name)))
                .or_default()
                .push(assignment.mod_id.clone());
        }
    }

    owners_by_vpk
        .into_iter()
        .filter_map(|((_, vpk_name), owners)| {
            (owners.len() > 1).then(|| format!("{vpk_name} -> {}", owners.join(", ")))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::super::test_support::{addons_base, write_vpk};
    use super::*;

    fn assignment(mod_id: impl Into<String>, filename: impl Into<String>) -> ShardAssignment {
        ShardAssignment {
            mod_id: mod_id.into(),
            shard: ShardIndex::FIRST,
            vpks: vec![filename.into()],
        }
    }

    #[test]
    fn reorder_keeps_disabled_local_vpks_disabled() {
        let temp = tempfile::tempdir().unwrap();
        let addons_path = addons_base(&temp);
        let addons_path = addons_path.as_path();
        write_vpk(addons_path, "pak01_dir.vpk");
        write_vpk(addons_path, "local-abc-123_original.vpk");

        let updated =
            reorder_vpks_sharded(&[assignment("123456", "pak01_dir.vpk")], addons_path).unwrap();

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

        let err = reorder_vpks_sharded(
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
        assert!(!addons_path.join(REORDER_STAGING_DIR).exists());
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

        let placements = reorder_vpks_sharded(&ordered, addons_path).unwrap();

        let base = ProfileBase::new(addons_path).unwrap();
        let shard1 = base.shard_dir(ShardIndex::FIRST);
        let shard2 = base.shard_dir(ShardIndex::new(2).unwrap());

        // Shard 1 (citadel/addons) fills to capacity, shard 2 (citadel/addons2)
        // takes the overflow.
        assert_eq!(naming::count_enabled_vpks(&shard1), 99);
        assert_eq!(naming::count_enabled_vpks(&shard2), 51);

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

    /// A mod bigger than one shard can never be placed, and saying so before
    /// moving anything is the difference between a clear error and a mess.
    #[test]
    fn a_mod_too_large_for_one_shard_is_rejected_up_front() {
        let oversized = ShardAssignment {
            mod_id: "650634".to_string(),
            shard: ShardIndex::FIRST,
            vpks: (0..=SHARD_CAPACITY)
                .map(|i| format!("pak{i:02}_dir.vpk"))
                .collect(),
        };

        let err = validate_capacity(&[oversized], 0).unwrap_err();

        assert!(err.to_string().contains("cannot fit in one addon folder"));
    }
}
