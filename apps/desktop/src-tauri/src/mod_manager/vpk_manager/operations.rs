use super::*;

impl VpkManager {
  pub(crate) fn stage_clear_all_vpks(
    &self,
    addons_path: &Path,
  ) -> Result<PendingVpkOperation<()>, Error> {
    let base = ProfileBase::new(addons_path)?;

    let mut sources = Vec::new();
    for (_, dir) in base.existing_shards() {
      for vpk_path in self.filesystem.get_files_with_extension(&dir, "vpk")? {
        sources.push(vpk_path);
      }
    }

    let mut staging = VpkStaging::claim(&base, shard::CLEAR_STAGING_DIR)?;
    for source in sources {
      if let Err(error) = staging.stage(&base, &source) {
        return Err(staging.rollback(error));
      }
    }

    Self::prune_empty_shard_dirs(&base);
    Ok(PendingVpkOperation::with_staging((), staging))
  }

  /// Copy selected VPK files from extracted directory based on file tree selection
  pub fn copy_selected_vpks_with_prefix(
    &self,
    source_dir: &Path,
    destination_dir: &Path,
    mod_id: &str,
    file_tree: &crate::mod_manager::file_tree::ModFileTree,
  ) -> Result<Vec<String>, Error> {
    let mut prefixed_vpks = Vec::new();

    // Get all VPK files from source directory with their relative paths
    let mut all_vpk_files = Vec::new();
    self.collect_vpks_from_dir(source_dir, &mut all_vpk_files)?;

    log::info!(
      "Found {} VPK files in source directory for mod {}",
      all_vpk_files.len(),
      mod_id
    );

    // Create a map of relative paths to full paths
    let mut vpk_map: std::collections::HashMap<String, std::path::PathBuf> =
      std::collections::HashMap::new();
    for vpk_path in all_vpk_files {
      if let Ok(relative_path) = vpk_path.strip_prefix(source_dir) {
        let relative_str = relative_path.to_string_lossy().replace('\\', "/");
        log::debug!(
          "Mapping VPK path: {} -> {}",
          relative_str,
          vpk_path.display()
        );
        vpk_map.insert(relative_str, vpk_path);
      }
    }

    log::info!(
      "File tree has {} files, {} are selected",
      file_tree.files.len(),
      file_tree.files.iter().filter(|f| f.is_selected).count()
    );

    // Copy only selected files
    for file in &file_tree.files {
      log::debug!(
        "Processing file: {} (selected: {}, path: {})",
        file.name,
        file.is_selected,
        file.path
      );

      if !file.is_selected {
        continue;
      }

      // Match file path (normalize separators)
      let normalized_path = file.path.replace('\\', "/");
      if let Some(vpk_path) = vpk_map.get(&normalized_path) {
        if let Some(file_name) = vpk_path.file_name().and_then(|n| n.to_str()) {
          let prefixed_name = format!("{mod_id}_{file_name}");
          let dest_path = destination_dir.join(&prefixed_name);

          self.filesystem.copy_file(vpk_path, &dest_path)?;
          prefixed_vpks.push(prefixed_name.clone());

          log::info!(
            "Copied selected VPK with prefix: {} -> {prefixed_name}",
            vpk_path.display()
          );
        }
      } else {
        log::warn!(
          "Selected VPK file not found in extracted directory: {}",
          file.path
        );
      }
    }

    Ok(prefixed_vpks)
  }

  /// Copy VPK files from source directory to addons with mod ID prefix
  pub fn copy_vpks_with_prefix(
    &self,
    source_dir: &Path,
    destination_dir: &Path,
    mod_id: &str,
  ) -> Result<Vec<String>, Error> {
    let mut prefixed_vpks = Vec::new();
    let mut vpk_files = Vec::new();

    // Recursively collect all VPK files
    self.collect_vpks_from_dir(source_dir, &mut vpk_files)?;
    vpk_files.sort();

    for vpk_path in vpk_files {
      if let Some(file_name) = vpk_path.file_name().and_then(|n| n.to_str()) {
        let prefixed_name = format!("{mod_id}_{file_name}");
        let dest_path = destination_dir.join(&prefixed_name);

        self.filesystem.copy_file(&vpk_path, &dest_path)?;
        prefixed_vpks.push(prefixed_name.clone());

        log::info!(
          "Copied VPK with prefix: {} -> {prefixed_name}",
          vpk_path.display()
        );
      }
    }

    Ok(prefixed_vpks)
  }

  /// Helper method to recursively collect VPK files
  fn collect_vpks_from_dir(
    &self,
    dir: &Path,
    vpk_files: &mut Vec<std::path::PathBuf>,
  ) -> Result<(), Error> {
    for entry in fs::read_dir(dir)? {
      let entry = entry?;
      let path = entry.path();

      if path.is_dir() {
        self.collect_vpks_from_dir(&path, vpk_files)?;
      } else if path.extension().is_some_and(|ext| ext == "vpk") {
        vpk_files.push(path);
      }
    }
    Ok(())
  }

  /// Find all VPK files with a specific mod ID prefix
  pub fn find_prefixed_vpks(&self, addons_path: &Path, mod_id: &str) -> Result<Vec<String>, Error> {
    let mut prefixed_vpks = Vec::new();

    if !addons_path.exists() {
      return Ok(prefixed_vpks);
    }

    let prefix = format!("{mod_id}_");

    for entry in fs::read_dir(addons_path)? {
      let entry = entry?;
      let path = entry.path();

      if path.is_file()
        && path.extension().is_some_and(|ext| ext == "vpk")
        && let Some(file_name) = path.file_name().and_then(|n| n.to_str())
        && file_name.starts_with(&prefix)
      {
        prefixed_vpks.push(file_name.to_string());
      }
    }

    prefixed_vpks.sort();
    Ok(prefixed_vpks)
  }

  /// Enable VPKs, taking the prefixed sources from `disabled_dir` (always the
  /// profile base) and writing the enabled `pak##_dir.vpk` into `enabled_dir`
  /// (the target shard directory). The two are equal for shard 1.
  pub fn enable_vpks_in(
    &self,
    disabled_dir: &Path,
    enabled_dir: &Path,
    mod_id: &str,
    prefixed_vpks: &[String],
  ) -> Result<Vec<String>, Error> {
    if prefixed_vpks.is_empty() {
      return Ok(Vec::new());
    }

    // Reject any missing source before touching the filesystem so a mod can
    // never be left partially enabled with silently dropped VPKs.
    let missing: Vec<String> = prefixed_vpks
      .iter()
      .filter(|name| !disabled_dir.join(name).exists())
      .cloned()
      .collect();
    if !missing.is_empty() {
      return Err(Error::ModInvalid(format!(
        "Cannot enable mod {mod_id} because source VPK files are missing: {}",
        missing.join(", ")
      )));
    }

    if enabled_dir != disabled_dir {
      fs::create_dir_all(enabled_dir)?;
    }

    let source_count = prefixed_vpks.len() as u32;
    let used = Self::count_enabled_vpks(enabled_dir);
    if used + source_count > shard::SHARD_CAPACITY {
      return Err(Error::ModInvalid(format!(
        "Enabling mod {mod_id} would exceed the {} VPK files allowed in one addon folder",
        shard::SHARD_CAPACITY
      )));
    }

    // Track successful renames (enabled path, original prefixed path) for rollback.
    let mut renamed = RenameTransaction::new();
    let mut new_names = Vec::new();

    for prefixed_name in prefixed_vpks {
      let old_path = disabled_dir.join(prefixed_name);

      let new_name = naming::next_free_enabled_vpk_name(enabled_dir)?;
      let new_path = enabled_dir.join(&new_name);

      if let Err(e) =
        fs_retry::retry_file_operation("rename", prefixed_name, || fs::rename(&old_path, &new_path))
      {
        log::error!(
          "Failed to enable VPK {prefixed_name}: {e}, rolling back {count} already-renamed file(s)",
          count = renamed.len()
        );
        return Err(renamed.rollback(fs_retry::map_file_lock_error("enable", prefixed_name, e)));
      }

      renamed.record(new_path, old_path);
      new_names.push(new_name.clone());
      log::info!("Enabled VPK for mod {mod_id}: {prefixed_name} -> {new_name}");
    }

    renamed.commit();
    Ok(new_names)
  }

  fn filter_existing_vpk_pairs(
    enabled_dir: &Path,
    installed_vpks: &[String],
    original_names: &[String],
  ) -> Vec<(String, String)> {
    installed_vpks
      .iter()
      .zip(original_names.iter())
      .filter_map(|(installed_vpk, original_name)| {
        let vpk_name = Self::vpk_filename(installed_vpk);
        if enabled_dir.join(&vpk_name).exists() {
          Some((vpk_name, original_name.clone()))
        } else {
          log::warn!("Enabled VPK file missing during disable: {vpk_name}");
          None
        }
      })
      .collect()
  }

  /// Disable VPKs, reading the enabled `pak##_dir.vpk` from `enabled_dir` (the
  /// mod's current shard) and writing the prefixed `{mod_id}_*.vpk` results into
  /// `disabled_dir` (always the profile base). The two are equal for shard 1.
  pub fn disable_vpks_in(
    &self,
    enabled_dir: &Path,
    disabled_dir: &Path,
    mod_id: &str,
    installed_vpks: &[String],
    original_names: &[String],
    missing_policy: MissingVpkPolicy,
  ) -> Result<Vec<String>, Error> {
    if installed_vpks.is_empty() {
      return Ok(Vec::new());
    }

    if original_names.len() != installed_vpks.len() {
      return Err(Error::ModInvalid(format!(
        "Cannot disable mod because original VPK name count ({}) does not match installed VPK count ({})",
        original_names.len(),
        installed_vpks.len()
      )));
    }

    let missing_vpks: Vec<String> = installed_vpks
      .iter()
      .map(|vpk_name| Self::vpk_filename(vpk_name))
      .filter(|vpk_name| !enabled_dir.join(vpk_name).exists())
      .collect();

    if !missing_vpks.is_empty() {
      match missing_policy {
        MissingVpkPolicy::Strict => {
          return Err(Error::ModInvalid(format!(
            "Cannot disable mod because enabled VPK files are missing: {}",
            missing_vpks.join(", ")
          )));
        }
        MissingVpkPolicy::Reconcile => {
          if missing_vpks.len() == installed_vpks.len() {
            log::warn!(
              "Mod {mod_id} is marked enabled but none of its enabled VPK files exist; marking it disabled without renaming files"
            );
            return Ok(Vec::new());
          }

          log::warn!(
            "Mod {mod_id} is missing some enabled VPK files; disabling only the files that still exist"
          );
        }
      }
    }

    let vpk_pairs = match missing_policy {
      MissingVpkPolicy::Strict => installed_vpks
        .iter()
        .zip(original_names.iter())
        .map(|(installed_vpk, original_name)| {
          (Self::vpk_filename(installed_vpk), original_name.clone())
        })
        .collect::<Vec<_>>(),
      MissingVpkPolicy::Reconcile => {
        Self::filter_existing_vpk_pairs(enabled_dir, installed_vpks, original_names)
      }
    };

    if vpk_pairs.is_empty() {
      return Ok(Vec::new());
    }

    if enabled_dir != disabled_dir {
      fs::create_dir_all(disabled_dir)?;
    }

    // Track successful renames (prefixed path, original enabled path) for rollback.
    let mut renamed = RenameTransaction::new();
    let mut prefixed_out = Vec::new();

    for (vpk_name, original_name) in vpk_pairs {
      let old_path = enabled_dir.join(&vpk_name);

      let prefixed_name = format!("{mod_id}_{original_name}");
      let new_path = disabled_dir.join(&prefixed_name);

      if new_path.exists() {
        log::info!(
          "Prefixed destination already exists (newly staged variant), removing old active VPK: {vpk_name}"
        );
        if let Err(e) =
          fs_retry::retry_file_operation("remove", &vpk_name, || fs::remove_file(&old_path))
        {
          log::error!(
            "Failed to remove old active VPK {vpk_name}: {e}, rolling back {count} already-renamed file(s)",
            count = renamed.len()
          );
          return Err(renamed.rollback(fs_retry::map_file_lock_error("disable", &vpk_name, e)));
        }
        // This was a deletion, not a rename: `new_path` already existed and is
        // not something we can restore, so it must not enter the rollback list.
        // Rolling it back would move the pre-existing staged variant into the
        // active slot and corrupt state.
      } else {
        if let Err(e) =
          fs_retry::retry_file_operation("rename", &vpk_name, || fs::rename(&old_path, &new_path))
        {
          log::error!(
            "Failed to disable VPK {vpk_name}: {e}, rolling back {count} already-renamed file(s)",
            count = renamed.len()
          );
          return Err(renamed.rollback(fs_retry::map_file_lock_error("disable", &vpk_name, e)));
        }
        renamed.record(new_path, old_path);
      }

      prefixed_out.push(prefixed_name.clone());
      log::info!("Disabled VPK for mod {mod_id}: {vpk_name} -> {prefixed_name}");
    }

    renamed.commit();
    Ok(prefixed_out)
  }

  pub(crate) fn stage_enabled_vpk_swap(
    &self,
    request: SwapRequest<'_>,
  ) -> Result<PendingVpkOperation<Vec<String>>, Error> {
    if !request.base.exists() {
      return Err(Error::Io(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        format!("Addons path not found: {:?}", request.base.path()),
      )));
    }

    log::info!(
      "Swapping enabled VPKs for mod {}: {} currently enabled -> {} newly selected",
      request.mod_id,
      request.current_installed_vpks.len(),
      request.selected_original_names.len()
    );
    let unique_selection: std::collections::HashSet<&String> =
      request.selected_original_names.iter().collect();
    if unique_selection.len() != request.selected_original_names.len() {
      return Err(Error::InvalidInput(
        "Selected VPK filenames must be unique".to_string(),
      ));
    }

    let mut snapshot = VpkSnapshot::new()?;
    match self.swap_enabled_vpks_inner(&request, &mut snapshot) {
      Ok(installed) => Ok(PendingVpkOperation::with_snapshot(installed, snapshot)),
      Err(error) => Err(snapshot.rollback(error)),
    }
  }

  /// Disable the mod's current variant and enable the selected one, recording
  /// every file it touches in `snapshot`. Uses `?` throughout; the caller turns
  /// any early return into a full restore.
  fn swap_enabled_vpks_inner(
    &self,
    request: &SwapRequest<'_>,
    snapshot: &mut VpkSnapshot,
  ) -> Result<Vec<String>, Error> {
    let current_enabled_dir = request.base.shard_dir(request.current_shard);
    let target_enabled_dir = request.base.shard_dir(request.target_shard);

    for current_vpk in request.current_installed_vpks {
      let source = current_enabled_dir.join(Self::vpk_filename(current_vpk));
      if !source.is_file() {
        return Err(Error::ModFileNotFound);
      }
      snapshot.capture(&source)?;
    }
    for prefixed in self.find_prefixed_vpks(request.base, request.mod_id)? {
      snapshot.capture(&request.base.join(prefixed))?;
    }
    // The disabled copies this swap is about to write do not exist yet.
    for original in request.current_original_names {
      snapshot.track(request.base.join(format!("{}_{original}", request.mod_id)));
    }

    if !request.current_installed_vpks.is_empty() {
      self.disable_vpks_in(
        &current_enabled_dir,
        request.base,
        request.mod_id,
        request.current_installed_vpks,
        request.current_original_names,
        MissingVpkPolicy::Strict,
      )?;
    }

    let prefixed_to_enable: Vec<String> = request
      .selected_original_names
      .iter()
      .map(|name| format!("{}_{name}", request.mod_id))
      .collect();
    if prefixed_to_enable
      .iter()
      .any(|prefixed| !request.base.join(prefixed).exists())
    {
      return Err(Error::ModFileNotFound);
    }

    let installed = self.enable_vpks_in(
      request.base,
      &target_enabled_dir,
      request.mod_id,
      &prefixed_to_enable,
    )?;
    for vpk in &installed {
      snapshot.track(target_enabled_dir.join(Self::vpk_filename(vpk)));
    }
    Ok(installed)
  }

  /// Replace VPK files for a mod with new ones
  /// Handles both enabled (pak##_dir.vpk) and disabled (modid_*.vpk) mods
  pub fn replace_vpks(
    &self,
    addons_path: &Path,
    enabled_dir: &Path,
    mod_id: &str,
    source_vpk_paths: &[std::path::PathBuf],
    installed_vpks: &[String],
  ) -> Result<(), Error> {
    if source_vpk_paths.is_empty() {
      return Err(Error::InvalidInput(
        "No VPK files provided for replacement".into(),
      ));
    }

    if !addons_path.exists() {
      return Err(Error::Io(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        format!("Addons path not found: {addons_path:?}"),
      )));
    }

    log::info!(
      "Replacing {} VPK file(s) for mod {mod_id}",
      source_vpk_paths.len()
    );

    // Determine if mod is enabled (has installed_vpks) or disabled (has prefixed VPKs)
    let is_enabled = !installed_vpks.is_empty();

    if is_enabled {
      // Mod is enabled - replace pak##_dir.vpk files
      if source_vpk_paths.len() != installed_vpks.len() {
        return Err(Error::InvalidInput(format!(
          "Replacement VPK count ({}) does not match installed VPK count ({})",
          source_vpk_paths.len(),
          installed_vpks.len()
        )));
      }

      for (source_path, installed_vpk) in source_vpk_paths.iter().zip(installed_vpks.iter()) {
        let dest_path = enabled_dir.join(Self::vpk_filename(installed_vpk));

        if !dest_path.exists() {
          log::warn!("Installed VPK not found: {installed_vpk}");
          continue;
        }

        self.filesystem.copy_file(source_path, &dest_path)?;
        log::info!(
          "Replaced enabled VPK: {installed_vpk} with {:?}",
          source_path.file_name().unwrap_or_default()
        );
      }
    } else {
      // Mod is disabled - replace prefixed VPKs
      log::info!("Looking for prefixed VPKs with pattern: {mod_id}_*.vpk");
      let prefixed_vpks = self.find_prefixed_vpks(addons_path, mod_id)?;
      log::info!(
        "Found {} prefixed VPK(s): {prefixed_vpks:?}",
        prefixed_vpks.len()
      );

      if prefixed_vpks.is_empty() {
        // List all VPK files in addons to help debug
        let all_vpks: Vec<String> = fs::read_dir(addons_path)
          .ok()
          .map(|entries| {
            entries
              .filter_map(|e| e.ok())
              .filter(|e| e.path().extension().is_some_and(|ext| ext == "vpk"))
              .filter_map(|e| e.file_name().to_str().map(String::from))
              .collect()
          })
          .unwrap_or_default();
        log::warn!("No prefixed VPKs found. All VPKs in addons: {all_vpks:?}");
        return Err(Error::ModFileNotFound);
      }

      if source_vpk_paths.len() != prefixed_vpks.len() {
        return Err(Error::InvalidInput(format!(
          "Replacement VPK count ({}) does not match mod VPK count ({})",
          source_vpk_paths.len(),
          prefixed_vpks.len()
        )));
      }

      for (source_path, prefixed_vpk) in source_vpk_paths.iter().zip(prefixed_vpks.iter()) {
        let dest_path = addons_path.join(prefixed_vpk);

        if !dest_path.exists() {
          log::warn!("Prefixed VPK not found: {prefixed_vpk}");
          continue;
        }

        self.filesystem.copy_file(source_path, &dest_path)?;
        log::info!(
          "Replaced disabled VPK: {prefixed_vpk} with {:?}",
          source_path.file_name().unwrap_or_default()
        );
      }
    }

    log::info!("VPK replacement completed successfully for mod {mod_id}");
    Ok(())
  }
}
