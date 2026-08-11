use super::*;

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
        .commit(),
    )
  }

  pub(crate) fn stage_reorder_vpks_sharded(
    &self,
    ordered_mods: &[ShardAssignment],
    base: &Path,
  ) -> Result<PendingVpkOperation<Vec<ShardPlacement>>, Error> {
    if !base.exists() {
      return Err(Error::Io(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        format!("Addons path not found: {base:?}"),
      )));
    }

    log::info!(
      "Starting sharded VPK reordering for {} mods",
      ordered_mods.len()
    );

    let base = ProfileBase::new(base)?;
    let temp_dir = base.join(shard::REORDER_STAGING_DIR);
    if temp_dir.exists() {
      log::warn!("Recovering VPK files left by an interrupted reorder");
      recover_staging_directory(&base, &temp_dir, RecoveryMode::AvoidEnabledCollisions)?;
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

    let owned_vpks: std::collections::HashSet<(ShardIndex, String)> = ordered_mods
      .iter()
      .flat_map(|assignment| {
        assignment
          .vpks
          .iter()
          .map(|vpk| (assignment.shard, Self::vpk_filename(vpk)))
      })
      .collect();
    let orphan_sources = Self::find_orphaned_enabled_vpks(&base, &owned_vpks)?;
    Self::validate_reorder_capacity(ordered_mods, orphan_sources.len() as u32)?;

    let mut staging = VpkStaging::claim(&base, shard::REORDER_STAGING_DIR)?;
    let result = Self::reorder_sharded_inner(ordered_mods, orphan_sources, &base, &mut staging);

    match result {
      Ok(placements) => {
        Self::prune_empty_shard_dirs(&base);
        Ok(PendingVpkOperation::with_staging(placements, staging))
      }
      Err(error) => {
        let error = staging.rollback(error);
        log::error!("Sharded reorder failed and was rolled back: {error}");
        Err(error)
      }
    }
  }

  /// Stage every enabled VPK (grouped by mod, orphans last), then place them
  /// back sequentially across shards.
  fn reorder_sharded_inner(
    ordered_mods: &[ShardAssignment],
    orphan_sources: Vec<(ShardIndex, PathBuf)>,
    base: &ProfileBase,
    staging: &mut VpkStaging,
  ) -> Result<Vec<ShardPlacement>, Error> {
    let mut staged_by_mod: Vec<(String, Vec<PathBuf>)> = Vec::new();
    let mut orphan_staged = Vec::new();

    for assignment in ordered_mods {
      let dir = base.shard_dir(assignment.shard);
      let mut staged = Vec::new();
      for vpk in &assignment.vpks {
        staged.push(staging.stage(base, &dir.join(Self::vpk_filename(vpk)))?);
      }
      staged_by_mod.push((assignment.mod_id.clone(), staged));
    }

    for (_, source) in orphan_sources {
      orphan_staged.push(staging.stage(base, &source)?);
    }

    let mut placements = Vec::new();
    let mut current_shard = 1u32;
    let mut used = 0u32;

    for (mod_id, staged) in &staged_by_mod {
      let (shard_used, names) =
        Self::place_staged_group(base, staging, &mut current_shard, &mut used, staged)?;
      placements.push(ShardPlacement {
        mod_id: mod_id.clone(),
        shard: shard_used,
        vpks: names,
      });
    }

    for orphan in &orphan_staged {
      Self::place_staged_group(
        base,
        staging,
        &mut current_shard,
        &mut used,
        std::slice::from_ref(orphan),
      )?;
    }

    Ok(placements)
  }

  /// Move a group of staged files into the current shard, opening a new shard
  /// first if the group would overflow `SHARD_CAPACITY`. The whole group always
  /// lands in one shard so a mod's VPKs stay together. Returns the shard used
  /// and the new pak filenames.
  fn place_staged_group(
    base: &ProfileBase,
    staging: &mut VpkStaging,
    current_shard: &mut u32,
    used: &mut u32,
    staged: &[PathBuf],
  ) -> Result<(ShardIndex, Vec<String>), Error> {
    let count = staged.len() as u32;
    if count > 0 && *used + count > shard::SHARD_CAPACITY {
      *current_shard += 1;
      *used = 0;
      if *current_shard > shard::MAX_SHARDS {
        return Err(Error::ModInvalid(format!(
          "Cannot enable this many VPK files: all {} addon shard folders are full ({} files each, ~{} total). Disable some mods first.",
          shard::MAX_SHARDS,
          shard::SHARD_CAPACITY,
          shard::MAX_SHARDS * shard::SHARD_CAPACITY
        )));
      }
    }
    let dir = base.shard_dir(ShardIndex::new(*current_shard)?);
    fs::create_dir_all(&dir)?;
    let mut names = Vec::new();
    for staged_vpk in staged {
      *used += 1;
      let new_name = naming::enabled_vpk_name(*used);
      let destination = dir.join(&new_name);
      staging.place(staged_vpk, &destination)?;
      names.push(new_name);
    }
    Ok((ShardIndex::new(*current_shard)?, names))
  }

  fn find_orphaned_enabled_vpks(
    base: &ProfileBase,
    owned_vpks: &std::collections::HashSet<(ShardIndex, String)>,
  ) -> Result<Vec<(ShardIndex, PathBuf)>, Error> {
    let mut orphans = Vec::new();
    for (shard_index, dir) in base.existing_shards() {
      for entry in fs::read_dir(&dir)? {
        let path = entry?.path();
        let Some(filename) = path.file_name().and_then(|name| name.to_str()) else {
          continue;
        };
        if path.is_file()
          && Self::is_enabled_vpk_name(filename)
          && !owned_vpks.contains(&(shard_index, filename.to_string()))
        {
          orphans.push((shard_index, path));
        }
      }
    }
    orphans.sort_by_key(|(shard_index, path)| {
      (
        *shard_index,
        path
          .file_name()
          .and_then(|name| name.to_str())
          .and_then(Self::enabled_vpk_number)
          .unwrap_or(u32::MAX),
      )
    });
    Ok(orphans)
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
