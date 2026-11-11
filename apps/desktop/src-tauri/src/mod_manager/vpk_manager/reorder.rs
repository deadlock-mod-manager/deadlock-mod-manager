use super::*;
use std::collections::HashSet;

impl VpkManager {
  /// Reorder enabled VPKs across shard directories.
  ///
  /// Mods are packed sequentially into shards, never splitting a mod across
  /// shards, so the global load order remains stable.
  pub fn reorder_vpks_sharded(
    &self,
    ordered_mods: &[ShardAssignment],
    base: &Path,
  ) -> Result<Vec<ShardPlacement>, Error> {
    Ok(
      self
        .stage_reorder_vpks_sharded(ordered_mods, base)?
        .commit()
        .placements,
    )
  }

  pub(crate) fn stage_reorder_vpks_sharded(
    &self,
    ordered_mods: &[ShardAssignment],
    base: &Path,
  ) -> Result<PendingVpkOperation<ShardReorderOutcome>, Error> {
    crate::mod_manager::file_permissions::prepare_profile_for_write(base)?;

    log::info!(
      "Starting sharded VPK reordering for {} mods",
      ordered_mods.len()
    );

    let base = ProfileBase::new(base)?;
    let temp_dir = base.join(shard::REORDER_STAGING_DIR);
    if temp_dir.exists() {
      log::warn!("Recovering VPK files left by an interrupted reorder");
      let manifest = crate::mod_manager::vpk_manifest::ProfileVpkManifest::load(&base)?;
      recover_staging_directory(
        &base,
        &temp_dir,
        RecoveryMode::AvoidEnabledCollisions,
        &manifest,
      )?;
    }

    let duplicate_assignments = Self::duplicate_sharded_assignments(ordered_mods);
    if !duplicate_assignments.is_empty() {
      return Err(Error::ModInvalid(format!(
        "Cannot reorder mods because VPK files are assigned to multiple mods: {}",
        duplicate_assignments.join("; ")
      )));
    }

    let mut missing_vpks = Vec::new();
    for assignment in ordered_mods {
      let dir = base.shard_dir(assignment.shard);
      for old_vpk_name in &assignment.vpks {
        let filename = Self::vpk_filename(old_vpk_name);
        if !dir.join(&filename).exists() {
          missing_vpks.push(format!("{}:{filename}", assignment.mod_id));
        }
      }
    }

    if !missing_vpks.is_empty() {
      return Err(Error::ModInvalid(format!(
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
          .map(|vpk| (assignment.shard, Self::vpk_filename(vpk)))
      })
      .collect();
    let on_disk = Self::enabled_vpks_on_disk(&base)?;
    let mut orphan_sources: Vec<(ShardIndex, String)> = on_disk
      .iter()
      .filter(|vpk| !owned_vpks.contains(*vpk))
      .cloned()
      .collect();
    // The name breaks ties such as `pak1` and `pak01`, which share a number.
    orphan_sources.sort_by_key(|(shard_index, filename)| {
      (
        *shard_index,
        Self::enabled_vpk_number(filename),
        filename.clone(),
      )
    });
    Self::validate_reorder_capacity(ordered_mods, orphan_sources.len() as u32)?;

    let mut staging = VpkStaging::claim(&base, shard::REORDER_STAGING_DIR)?;
    let result = Self::reorder_sharded_inner(
      ordered_mods,
      orphan_sources,
      &on_disk,
      &base,
      &mut staging,
    );

    match result {
      Ok(outcome) => {
        Self::prune_empty_shard_dirs(&base);
        Ok(PendingVpkOperation::with_staging(outcome, staging))
      }
      Err(error) => {
        let error = staging.rollback(error);
        log::error!("Sharded reorder failed and was rolled back: {error}");
        Err(error)
      }
    }
  }

  /// Give every enabled VPK its slot (grouped by mod, orphans last), then move
  /// only the files whose slot changes. Each move is journaled and flushed to
  /// disk, so leaving files that keep their slot alone is what keeps a small
  /// change to a long load order cheap.
  fn reorder_sharded_inner(
    ordered_mods: &[ShardAssignment],
    orphan_sources: Vec<(ShardIndex, String)>,
    on_disk: &HashSet<(ShardIndex, String)>,
    base: &ProfileBase,
    staging: &mut VpkStaging,
  ) -> Result<ShardReorderOutcome, Error> {
    let mut slots = SlotCursor { shard: 1, used: 0 };
    let mut moves: Vec<(PathBuf, PathBuf)> = Vec::new();
    let mut placements = Vec::new();

    for assignment in ordered_mods {
      let (shard_used, names) = slots.next_group(assignment.vpks.len() as u32)?;
      for (vpk, name) in assignment.vpks.iter().zip(&names) {
        let filename = Self::vpk_filename(vpk);
        // A case-insensitive disk resolves `PAK01_DIR.VPK` as `pak01_dir.vpk`,
        // but slot allocation reads names case-sensitively, so a file stays
        // only when its directory entry already has the exact slot name.
        let stays = (assignment.shard, &filename) == (shard_used, name)
          && on_disk.contains(&(shard_used, filename.clone()));
        if !stays {
          moves.push((
            base.shard_dir(assignment.shard).join(filename),
            base.shard_dir(shard_used).join(name),
          ));
        }
      }
      placements.push(ShardPlacement {
        mod_id: assignment.mod_id.clone(),
        shard: shard_used,
        vpks: names,
      });
    }

    let mut orphan_renames = BTreeMap::new();
    for (shard_index, filename) in orphan_sources {
      let (shard_used, mut names) = slots.next_group(1)?;
      let new_name = names.remove(0);
      if (shard_index, &filename) != (shard_used, &new_name) {
        moves.push((
          base.shard_dir(shard_index).join(&filename),
          base.shard_dir(shard_used).join(&new_name),
        ));
      }
      orphan_renames.insert((shard_index, filename), (shard_used, new_name));
    }

    // Park every mover before placing any, so a destination another mover
    // still occupies is free by the time it is filled. A file that keeps its
    // slot is never a destination, because no two files share a slot.
    let mut staged = Vec::with_capacity(moves.len());
    for (source, _) in &moves {
      staged.push(staging.stage(base, source)?);
    }
    for (staged_vpk, (_, destination)) in staged.iter().zip(&moves) {
      staging.place(staged_vpk, destination)?;
    }

    Ok(ShardReorderOutcome {
      placements,
      orphan_renames,
    })
  }

  /// Every enabled-named VPK file in the profile's shards, spelled exactly as
  /// its directory entry is.
  fn enabled_vpks_on_disk(base: &ProfileBase) -> Result<HashSet<(ShardIndex, String)>, Error> {
    let mut vpks = HashSet::new();
    for (shard_index, dir) in base.existing_shards() {
      for entry in fs::read_dir(&dir)? {
        let path = entry?.path();
        let Some(filename) = path.file_name().and_then(|name| name.to_str()) else {
          continue;
        };
        if Self::is_enabled_vpk_name(filename) && path.is_file() {
          vpks.insert((shard_index, filename.to_string()));
        }
      }
    }
    Ok(vpks)
  }

  fn validate_reorder_capacity(
    ordered_mods: &[ShardAssignment],
    orphan_count: u32,
  ) -> Result<(), Error> {
    let mut current_shard = 1u32;
    let mut used = 0u32;
    for assignment in ordered_mods {
      let count = assignment.vpks.len() as u32;
      if count > shard::SHARD_CAPACITY {
        return Err(Error::ModInvalid(format!(
          "Mod {} has {count} VPK files and cannot fit in one addon folder",
          assignment.mod_id
        )));
      }
      if used + count > shard::SHARD_CAPACITY {
        current_shard += 1;
        used = 0;
      }
      used += count;
    }
    let remaining_in_current = shard::SHARD_CAPACITY - used;
    let additional_shards = orphan_count
      .saturating_sub(remaining_in_current)
      .div_ceil(shard::SHARD_CAPACITY);
    if current_shard + additional_shards > shard::MAX_SHARDS {
      return Err(Error::ModInvalid(format!(
        "Cannot reorder VPKs: all {} addon folders would be exceeded",
        shard::MAX_SHARDS
      )));
    }
    Ok(())
  }

  pub(crate) fn prune_empty_shard_dirs(base: &ProfileBase) {
    for shard_index in shard::all_shards().skip(1) {
      let dir = base.shard_dir(shard_index);
      if dir.exists()
        && let Ok(mut entries) = fs::read_dir(&dir)
        && entries.next().is_none()
      {
        let _ = fs::remove_dir(&dir);
      }
    }
  }

  fn duplicate_sharded_assignments(ordered_mods: &[ShardAssignment]) -> Vec<String> {
    let mut owners_by_vpk: BTreeMap<(ShardIndex, String), Vec<String>> = BTreeMap::new();

    for assignment in ordered_mods {
      for vpk_name in &assignment.vpks {
        owners_by_vpk
          .entry((assignment.shard, Self::vpk_filename(vpk_name)))
          .or_default()
          .push(assignment.mod_id.clone());
      }
    }

    owners_by_vpk
      .into_iter()
      .filter_map(|((_, vpk_name), owners)| {
        if owners.len() > 1 {
          Some(format!("{vpk_name} -> {}", owners.join(", ")))
        } else {
          None
        }
      })
      .collect()
  }
}

/// Hands out `pak##_dir.vpk` slots in load order, opening the next shard when a
/// group would overflow `SHARD_CAPACITY`. A group always lands in one shard so a
/// mod's VPKs stay together.
struct SlotCursor {
  shard: u32,
  used: u32,
}

impl SlotCursor {
  fn next_group(&mut self, count: u32) -> Result<(ShardIndex, Vec<String>), Error> {
    if count > 0 && self.used + count > shard::SHARD_CAPACITY {
      self.shard += 1;
      self.used = 0;
      if self.shard > shard::MAX_SHARDS {
        return Err(Error::ModInvalid(format!(
          "Cannot enable this many VPK files: all {} addon shard folders are full ({} files each, ~{} total). Disable some mods first.",
          shard::MAX_SHARDS,
          shard::SHARD_CAPACITY,
          shard::MAX_SHARDS * shard::SHARD_CAPACITY
        )));
      }
    }
    let names = (self.used + 1..=self.used + count)
      .map(naming::enabled_vpk_name)
      .collect();
    self.used += count;
    Ok((ShardIndex::new(self.shard)?, names))
  }
}
