use super::*;

impl ModManager {
  /// Pick the last active shard when it has room, otherwise append a new shard.
  /// Filling holes in older shards would move a newly installed mod ahead of
  /// mods in later search paths and silently change load order.
  pub(crate) fn choose_shard_for(
    base: &ProfileBase,
    current_mod: Option<(ShardIndex, u32)>,
    needed: u32,
  ) -> Result<ShardIndex, Error> {
    if needed > shard::SHARD_CAPACITY {
      return Err(Error::ModInvalid(format!(
        "This mod has {needed} VPK files, more than the {} the engine allows per addon folder.",
        shard::SHARD_CAPACITY
      )));
    }
    if let Some((current_shard, current_count)) = current_mod {
      let current_dir = base.shard_dir(current_shard);
      let used_without_mod = naming::count_enabled_vpks(&current_dir).saturating_sub(current_count);
      if shard::SHARD_CAPACITY.saturating_sub(used_without_mod) >= needed {
        return Ok(current_shard);
      }
    }

    let mut last_active_shard = ShardIndex::FIRST;
    for shard_index in shard::all_shards().skip(1) {
      let dir = base.shard_dir(shard_index);
      if naming::count_enabled_vpks(&dir) > 0 {
        last_active_shard = shard_index;
      }
    }

    let active_dir = base.shard_dir(last_active_shard);
    let used = naming::count_enabled_vpks(&active_dir);
    if shard::SHARD_CAPACITY.saturating_sub(used) >= needed {
      return Ok(last_active_shard);
    }
    if last_active_shard.get() < shard::MAX_SHARDS {
      return Ok(ShardIndex::new(last_active_shard.get() + 1)?);
    }

    Err(Error::ModInvalid(format!(
      "Cannot enable this mod: all {} addon shard folders are full ({} files each). Disable some mods first.",
      shard::MAX_SHARDS,
      shard::SHARD_CAPACITY
    )))
  }

  pub(super) fn vpk_filenames(vpks: &[String]) -> Vec<String> {
    vpks.iter().map(|vpk| naming::file_name_of(vpk)).collect()
  }

  fn existing_vpk_filenames(addons_path: &Path, vpks: &[String]) -> Vec<String> {
    Self::vpk_filenames(vpks)
      .into_iter()
      .filter(|vpk| addons_path.join(vpk).exists())
      .collect()
  }

  pub(super) fn resolve_reorder_vpks(
    addons_path: &Path,
    manifest_vpks: &[String],
    fallback_vpks: &[String],
  ) -> Vec<String> {
    let manifest_filenames = Self::vpk_filenames(manifest_vpks);
    let existing_manifest_vpks = Self::existing_vpk_filenames(addons_path, &manifest_filenames);

    if !manifest_filenames.is_empty() && existing_manifest_vpks.len() == manifest_filenames.len() {
      return manifest_filenames;
    }

    let fallback_filenames = Self::vpk_filenames(fallback_vpks);
    let existing_fallback_vpks = Self::existing_vpk_filenames(addons_path, &fallback_filenames);

    if !existing_fallback_vpks.is_empty()
      && existing_fallback_vpks.len() == fallback_filenames.len()
    {
      return fallback_filenames;
    }

    if !existing_manifest_vpks.is_empty() {
      return existing_manifest_vpks;
    }

    existing_fallback_vpks
  }

  pub(super) fn reconcile_manifest_entry_for_reorder(
    base: &ProfileBase,
    entry: &mut ModEntry,
    fallback_vpks: &[String],
  ) -> bool {
    let enabled_dir = base.shard_dir(entry.shard);
    let resolved_vpks =
      Self::resolve_reorder_vpks(&enabled_dir, &entry.current_vpks, fallback_vpks);
    let can_enable_from_fallback = !fallback_vpks.is_empty();
    let mut changed = false;

    if entry.current_vpks != resolved_vpks {
      entry.current_vpks = resolved_vpks;
      changed = true;
    }

    if entry.current_vpks.is_empty() {
      if entry.enabled {
        entry.enabled = false;
        changed = true;
      }
    } else if entry.enabled || can_enable_from_fallback {
      if !entry.enabled {
        entry.enabled = true;
        changed = true;
      }

      if !entry.disabled_vpks.is_empty() {
        entry.disabled_vpks.clear();
        changed = true;
      }
    }

    changed
  }

  fn apply_placements_to_manifest(manifest: &mut ProfileLedger, placements: &[ShardPlacement]) {
    for placement in placements {
      if let Some(entry) = manifest.mods.get_mut(&placement.mod_id) {
        entry.enabled = true;
        entry.shard = placement.shard;
        entry.current_vpks = placement.vpks.clone();
        entry.disabled_vpks.clear();
      }
    }
  }

  /// Enabled manifest entries in the order the engine must load them: mods with
  /// an explicit install order first and in that order, then the rest in the
  /// position they already occupy on disk, so a partially ordered profile does
  /// not get shuffled.
  pub(super) fn ordered_assignments(manifest: &ProfileLedger) -> Vec<ShardAssignment> {
    let mut ordered: Vec<((u8, u32, u32), ShardAssignment)> = manifest
      .mods
      .iter()
      .filter(|(_, entry)| entry.enabled && !entry.current_vpks.is_empty())
      .map(|(mod_id, entry)| {
        let first_vpk = entry
          .current_vpks
          .iter()
          .filter_map(|vpk| naming::enabled_vpk_number(&naming::file_name_of(vpk)))
          .min()
          .unwrap_or(u32::MAX);
        let sort_key = match entry.order {
          Some(order) => (0, order, first_vpk),
          None => (1, entry.shard.get(), first_vpk),
        };
        (
          sort_key,
          ShardAssignment {
            mod_id: mod_id.clone(),
            shard: entry.shard,
            vpks: entry.current_vpks.clone(),
          },
        )
      })
      .collect();
    ordered.sort_by_key(|(sort_key, _)| *sort_key);
    ordered
      .into_iter()
      .map(|(_, assignment)| assignment)
      .collect()
  }

  /// Move the VPKs, then record where they landed. The manifest write is the
  /// commit point: until it succeeds every file goes back where it was, so the
  /// manifest can never describe a layout that is not on disk.
  fn commit_reorder(
    &mut self,
    base: &ProfileBase,
    manifest: &mut ProfileLedger,
    assignments: &[ShardAssignment],
  ) -> Result<Vec<ShardPlacement>, Error> {
    let pending = ops::stage_reorder_vpks_sharded(assignments, base)?;
    Self::apply_placements_to_manifest(manifest, pending.value());
    if let Err(error) = manifest.save(base) {
      return Err(pending.rollback(error).into());
    }
    let placements = pending.commit();

    for placement in &placements {
      if let Some(mut mod_entry) = self.mod_repository.remove_mod(&placement.mod_id) {
        mod_entry.installed_vpks = placement.vpks.clone();
        self.mod_repository.add_mod(mod_entry);
      }
    }
    // A reorder renames nearly every enabled VPK, and routinely gives one file
    // the name another just had — at the same size and modified time. Only
    // re-reading each file can tell which is which afterwards.
    if let Err(error) = vpkmanager::reconcile::sync_profile(base, Trust::EveryFile) {
      log::warn!("Could not reconcile the profile ledger after a reorder: {error}");
    }
    Ok(placements)
  }

  pub fn apply_variant_selection(
    &mut self,
    mod_id: &str,
    profile_folder: Option<String>,
    current_installed_vpks: &[String],
    current_original_names: &[String],
    selected_original_names: Vec<String>,
  ) -> Result<VariantChangeResult, Error> {
    let addons_path = self.get_addons_path(profile_folder.as_deref())?;
    let mut manifest = ProfileLedger::open_for_write(&addons_path)?;
    let current_shard = manifest.shard_of(mod_id);
    let target_shard = Self::choose_shard_for(
      &addons_path,
      Some((current_shard, current_installed_vpks.len() as u32)),
      selected_original_names.len() as u32,
    )?;

    let pending = ops::stage_enabled_vpk_swap(SwapRequest {
      base: &addons_path,
      current_shard,
      target_shard,
      mod_id,
      current_installed_vpks,
      current_original_names,
      selected_original_names: &selected_original_names,
    })?;
    manifest.mark_enabled(
      mod_id,
      pending.value().clone(),
      selected_original_names.clone(),
      None,
      target_shard,
    );
    if let Err(error) = manifest.save(&addons_path) {
      return Err(pending.rollback(error).into());
    }
    let installed = pending.commit();

    let prefix = format!("{mod_id}_");
    let mut available = selected_original_names.clone();
    for name in ops::find_prefixed_vpks(&addons_path, mod_id)? {
      if let Some(original) = name.strip_prefix(&prefix)
        && !available.iter().any(|available| available == original)
      {
        available.push(original.to_string());
      }
    }
    available.sort();
    let selected: HashSet<String> = selected_original_names.iter().cloned().collect();
    let file_tree = ModFileTree::from_options(&available, &selected);

    self.reorder_all_mods_for_profile(profile_folder)?;
    let reordered_manifest = ProfileLedger::load(&addons_path)?;
    let installed_vpks = reordered_manifest
      .mods
      .get(mod_id)
      .filter(|entry| entry.enabled)
      .map(|entry| entry.current_vpks.clone())
      .ok_or_else(|| {
        Error::ModInvalid(format!(
          "Mod {mod_id} is missing from the manifest after reordering"
        ))
      })?;

    if let Some(existing) = self.mod_repository.get_mod(mod_id).cloned() {
      let mut updated = existing;
      updated.installed_vpks = installed_vpks.clone();
      updated.original_vpk_names = selected_original_names.clone();
      updated.file_tree = Some(file_tree.clone());
      self.mod_repository.add_mod(updated);
    }

    log::info!(
      "Applied variant selection for mod {mod_id}: {} VPKs enabled before reorder",
      installed.len()
    );
    Ok(VariantChangeResult {
      installed_vpks,
      original_vpk_names: selected_original_names,
      file_tree,
    })
  }

  pub(super) fn reorder_all_mods_for_profile(
    &mut self,
    profile_folder: Option<String>,
  ) -> Result<(), Error> {
    let addons_path = self.get_addons_path(profile_folder.as_deref())?;

    log::info!("Reordering all mods based on install order for profile: {profile_folder:?}");

    let mut manifest = ProfileLedger::open_for_write(&addons_path)?;
    let mut manifest_changed = false;
    for entry in manifest.mods.values_mut() {
      manifest_changed |= Self::reconcile_manifest_entry_for_reorder(&addons_path, entry, &[]);
    }
    let assignments = Self::ordered_assignments(&manifest);

    if assignments.is_empty() {
      if manifest_changed {
        manifest.save(&addons_path)?;
      }
      // Enabled VPKs the manifest does not know about still need compacting, or
      // a legacy profile would keep its out-of-range pak numbers forever.
      let has_unmanaged_enabled_vpks = shard::all_shards()
        .any(|shard_index| naming::count_enabled_vpks(&addons_path.shard_dir(shard_index)) > 0);
      if has_unmanaged_enabled_vpks {
        ops::reorder_vpks_sharded(&[], &addons_path)?;
        log::info!("Reordered unmanaged enabled VPKs without manifest entries");
      } else {
        log::info!("No enabled VPKs need reordering");
      }
      return Ok(());
    }

    self.commit_reorder(&addons_path, &mut manifest, &assignments)?;

    log::info!("All mods reordered successfully");
    Ok(())
  }

  /// Reorder mods based on their remote IDs and current VPK files
  pub fn reorder_mods_by_remote_id(
    &mut self,
    mod_order_data: Vec<(String, Vec<String>, u32)>, // (remote_id, current_vpks, order)
    profile_folder: Option<String>,
  ) -> Result<Vec<(String, Vec<String>)>, Error> {
    let addons_path = self.get_addons_path(profile_folder.as_deref())?;

    log::info!(
      "Reordering mods by remote ID for {} mods in profile: {:?}",
      mod_order_data.len(),
      profile_folder
    );

    let mut sorted_data = mod_order_data;
    sorted_data.sort_by_key(|(_, _, order)| *order);

    let mut manifest = ProfileLedger::open_for_write(&addons_path)?;
    let mut mod_vpk_mapping = Vec::new();
    let mut manifest_changed = false;
    for (remote_id, vpk_files, order) in sorted_data {
      let vpk_files = Self::vpk_filenames(&vpk_files);
      let entry = manifest.mods.entry(remote_id.clone()).or_default();
      if entry.order != Some(order) {
        entry.order = Some(order);
        manifest_changed = true;
      }

      manifest_changed |=
        Self::reconcile_manifest_entry_for_reorder(&addons_path, entry, &vpk_files);

      if entry.enabled && !entry.current_vpks.is_empty() {
        mod_vpk_mapping.push(ShardAssignment {
          mod_id: remote_id,
          shard: entry.shard,
          vpks: entry.current_vpks.clone(),
        });
      }
    }

    if mod_vpk_mapping.is_empty() {
      if manifest_changed {
        manifest.save(&addons_path)?;
      }
      log::warn!("No enabled VPK mappings available to reorder");
      return Ok(Vec::new());
    }

    let placements = self.commit_reorder(&addons_path, &mut manifest, &mod_vpk_mapping)?;

    log::info!("Mod reordering by remote ID completed successfully");
    Ok(
      placements
        .into_iter()
        .map(|placement| (placement.mod_id, placement.vpks))
        .collect(),
    )
  }

  /// Reorder mods based on the specified order
  pub fn reorder_mods(
    &mut self,
    mod_order_data: Vec<(String, u32)>,
    profile_folder: Option<String>,
  ) -> Result<Vec<Mod>, Error> {
    let addons_path = self.get_addons_path(profile_folder.as_deref())?;

    log::info!(
      "Reordering {} mods for profile: {profile_folder:?}",
      mod_order_data.len()
    );

    let mut sorted_order = mod_order_data;
    sorted_order.sort_by_key(|(_, order)| *order);

    let mut manifest = ProfileLedger::open_for_write(&addons_path)?;
    let mut mod_vpk_mapping = Vec::new();
    let mut manifest_changed = false;

    for (mod_id, new_order) in sorted_order {
      if let Some(entry) = manifest.mods.get_mut(&mod_id) {
        if entry.order != Some(new_order) {
          entry.order = Some(new_order);
          manifest_changed = true;
        }
        manifest_changed |= Self::reconcile_manifest_entry_for_reorder(&addons_path, entry, &[]);
        if entry.enabled && !entry.current_vpks.is_empty() {
          mod_vpk_mapping.push(ShardAssignment {
            mod_id: mod_id.clone(),
            shard: entry.shard,
            vpks: entry.current_vpks.clone(),
          });
        }
      }

      if let Some(mut deadlock_mod) = self.mod_repository.get_mod(&mod_id).cloned() {
        deadlock_mod.install_order = Some(new_order);
        self.mod_repository.add_mod(deadlock_mod);
      } else {
        log::debug!("Mod {mod_id} not found in in-memory repository while reordering");
      }
    }

    if mod_vpk_mapping.is_empty() {
      if manifest_changed {
        manifest.save(&addons_path)?;
      }
      log::warn!("No enabled manifest VPKs available to reorder");
      return Ok(Vec::new());
    }

    // `commit_reorder` has already written the new VPK names into the
    // repository, so the reordered mods can just be read back out.
    let placements = self.commit_reorder(&addons_path, &mut manifest, &mod_vpk_mapping)?;
    let result_mods: Vec<Mod> = placements
      .iter()
      .filter_map(|placement| self.mod_repository.get_mod(&placement.mod_id).cloned())
      .collect();

    log::info!("Successfully reordered {} mods", result_mods.len());
    Ok(result_mods)
  }
}
