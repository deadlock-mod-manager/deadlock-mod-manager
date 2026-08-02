use super::*;

impl ModManager {
  pub fn install_mod(
    &mut self,
    mut deadlock_mod: Mod,
    profile_folder: Option<String>,
  ) -> Result<Mod, Error> {
    log::info!(
      "Starting installation (enable) of mod: {} (profile: {profile_folder:?})",
      deadlock_mod.name,
    );

    if !self.config_manager.is_game_setup() {
      log::info!("Setting up game for mods...");
      self.setup_game_for_mods()?;
    }

    let addons_path = self.get_addons_path(profile_folder.as_deref())?;

    // Find prefixed VPKs in addons (mod is downloaded but not enabled)
    let mut prefixed_vpks = self
      .vpk_manager
      .find_prefixed_vpks(&addons_path, &deadlock_mod.id)?;

    // Recover older local imports that were added before prefixed VPKs were copied.
    if prefixed_vpks.is_empty() && deadlock_mod.id.starts_with("local-") {
      let local_files_dir = self
        .get_mods_store_path()?
        .join(&deadlock_mod.id)
        .join("files");

      if local_files_dir.exists() {
        log::info!(
          "No prefixed VPKs found for local mod {}, restoring from {:?}",
          deadlock_mod.id,
          local_files_dir
        );
        prefixed_vpks = self.vpk_manager.copy_vpks_with_prefix(
          &local_files_dir,
          &addons_path,
          &deadlock_mod.id,
        )?;
      }
    }

    if prefixed_vpks.is_empty() {
      log::error!("No prefixed VPKs found for mod {}", deadlock_mod.id);
      return Err(Error::ModInvalid(
        "Mod needs to be downloaded first. No VPK files found in addons folder.".into(),
      ));
    }

    log::info!("Found {} prefixed VPKs, enabling them", prefixed_vpks.len());

    let mut manifest = ProfileVpkManifest::open_for_write(&addons_path)?;
    let target_shard = Self::choose_shard_for(&addons_path, None, prefixed_vpks.len() as u32)?;
    let enabled_dir = addons_path.shard_dir(target_shard);

    let installed_vpks = self.vpk_manager.enable_vpks_in(
      &addons_path,
      &enabled_dir,
      &deadlock_mod.id,
      &prefixed_vpks,
    )?;

    deadlock_mod.installed_vpks = installed_vpks;
    deadlock_mod.original_vpk_names = prefixed_vpks
      .iter()
      .map(|name| {
        name
          .strip_prefix(&format!("{}_", deadlock_mod.id))
          .unwrap_or(name)
          .to_string()
      })
      .collect();

    if deadlock_mod.file_tree.is_none() && !deadlock_mod.original_vpk_names.is_empty() {
      let files: Vec<ModFile> = deadlock_mod
        .original_vpk_names
        .iter()
        .map(|name| ModFile {
          name: name.clone(),
          path: name.clone(),
          size: 0,
          is_selected: true,
          archive_name: String::new(),
        })
        .collect();
      let total_files = files.len();
      deadlock_mod.file_tree = Some(ModFileTree {
        files,
        total_files,
        has_multiple_files: total_files > 1,
      });
    }

    manifest.mark_enabled(
      &deadlock_mod.id,
      deadlock_mod.installed_vpks.clone(),
      deadlock_mod.original_vpk_names.clone(),
      deadlock_mod.install_order,
      target_shard,
    );
    if let Err(save_error) = manifest.save(&addons_path) {
      let rollback = self.vpk_manager.disable_vpks_in(
        &enabled_dir,
        &addons_path,
        &deadlock_mod.id,
        &deadlock_mod.installed_vpks,
        &deadlock_mod.original_vpk_names,
        MissingVpkPolicy::Strict,
      );
      return match rollback {
        Ok(_) => Err(save_error),
        Err(rollback_error) => Err(Error::RollbackFailed(format!(
          "Failed to save manifest: {save_error}. Failed to disable newly enabled VPKs: {rollback_error}"
        ))),
      };
    }

    log::info!("Adding mod to managed mods list");
    self.mod_repository.add_mod(deadlock_mod.clone());

    // If the mod has an install order, trigger a reorder to maintain correct
    // sequence. The install itself is already committed above, so a reorder
    // failure must not be reported as an install failure; keep the enabled mod
    // and just log a warning.
    if deadlock_mod.install_order.is_some() {
      log::info!("Mod has install order, triggering reorder to maintain sequence");
      match self.reorder_all_mods_for_profile(profile_folder.clone()) {
        Ok(()) => match ProfileVpkManifest::load(&addons_path) {
          Ok(reordered_manifest) => {
            if let Some(entry) = reordered_manifest.mods.get(&deadlock_mod.id) {
              deadlock_mod.installed_vpks = entry.current_vpks.clone();
              self.mod_repository.add_mod(deadlock_mod.clone());
            }
          }
          Err(error) => {
            log::warn!(
              "Mod {} installed and reordered, but the updated manifest could not be reloaded: {error}",
              deadlock_mod.id
            );
          }
        },
        Err(e) => {
          log::warn!(
            "Mod {} installed successfully but post-install reorder failed: {e}",
            deadlock_mod.id
          );
        }
      }
    }

    log::info!("Mod installation (enable) completed successfully");
    Ok(deadlock_mod)
  }

  pub fn uninstall_mod(
    &mut self,
    mod_id: String,
    vpks: Vec<String>,
    profile_folder: Option<String>,
  ) -> Result<(), Error> {
    log::info!("Uninstalling (disabling) mod: {mod_id} (profile: {profile_folder:?})");

    let addons_path = self.get_addons_path(profile_folder.as_deref())?;

    if !addons_path.exists() {
      return Err(Error::GamePathNotSet);
    }

    let mut manifest = ProfileVpkManifest::open_for_write(&addons_path)?;
    let manifest_entry = manifest.mods.get(&mod_id).cloned();

    let (installed_vpks, original_vpk_names) = if let Some(entry) = manifest_entry.as_ref()
      && !entry.current_vpks.is_empty()
    {
      log::info!("Using manifest VPK state for mod {mod_id}");
      (
        entry.current_vpks.clone(),
        if entry.original_vpk_names.is_empty() {
          entry.current_vpks.clone()
        } else {
          entry.original_vpk_names.clone()
        },
      )
    } else if !vpks.is_empty() {
      log::warn!("Manifest has no enabled VPKs for {mod_id}, using frontend VPK state");
      let vpk_filenames = Self::vpk_filenames(&vpks);
      (vpk_filenames.clone(), vpk_filenames)
    } else if let Some(local_mod) = self.mod_repository.get_mod(&mod_id)
      && !local_mod.installed_vpks.is_empty()
    {
      log::warn!("Manifest has no enabled VPKs for {mod_id}, using in-memory repository state");
      (
        local_mod.installed_vpks.clone(),
        if local_mod.original_vpk_names.is_empty() {
          local_mod.installed_vpks.clone()
        } else {
          local_mod.original_vpk_names.clone()
        },
      )
    } else if manifest_entry
      .as_ref()
      .is_some_and(|entry| !entry.enabled && !entry.disabled_vpks.is_empty())
    {
      log::info!("Mod {mod_id} is already disabled according to the profile manifest");
      return Ok(());
    } else {
      return Err(Error::ModInvalid(format!(
        "Cannot disable mod {mod_id}: no enabled VPK files are recorded for this profile"
      )));
    };

    // Enabled VPKs live in the mod's shard; the disabled prefixed copies always
    // go back to the profile base dir.
    let shard_index = manifest_entry
      .as_ref()
      .map(|entry| entry.shard)
      .unwrap_or(ShardIndex::FIRST);
    let enabled_dir = addons_path.shard_dir(shard_index);

    let prefixed_vpks = self.vpk_manager.disable_vpks_in(
      &enabled_dir,
      &addons_path,
      &mod_id,
      &installed_vpks,
      &original_vpk_names,
      MissingVpkPolicy::Reconcile,
    )?;

    manifest.mark_disabled(&mod_id, prefixed_vpks.clone(), original_vpk_names);
    if let Err(save_error) = manifest.save(&addons_path) {
      let rollback =
        self
          .vpk_manager
          .enable_vpks_in(&addons_path, &enabled_dir, &mod_id, &prefixed_vpks);
      return match rollback {
        Ok(_) => Err(save_error),
        Err(rollback_error) => Err(Error::RollbackFailed(format!(
          "Failed to save manifest: {save_error}. Failed to re-enable VPKs: {rollback_error}"
        ))),
      };
    }

    // The mod's shard may now be empty; drop stray empty shard folders.
    VpkManager::prune_empty_shard_dirs(&addons_path);

    if let Some(mut local_mod) = self.mod_repository.get_mod(&mod_id).cloned() {
      local_mod.installed_vpks = Vec::new();
      self.mod_repository.add_mod(local_mod);
    }

    log::info!(
      "Disabled mod {mod_id} with {} prefixed VPKs",
      prefixed_vpks.len()
    );

    Ok(())
  }

  pub fn purge_mod(
    &mut self,
    mod_id: String,
    vpks: Vec<String>,
    profile_folder: Option<String>,
  ) -> Result<(), Error> {
    let mods_path = self.get_mods_store_path()?;
    self.purge_mod_from(mod_id, vpks, profile_folder, &mods_path)
  }

  pub(crate) fn purge_mod_from(
    &mut self,
    mod_id: String,
    vpks: Vec<String>,
    profile_folder: Option<String>,
    mods_path: &Path,
  ) -> Result<(), Error> {
    log::info!("Purging mod: {mod_id} (profile: {profile_folder:?})");
    // Not redundant with the check in `remove_mod_vpks`: when the addons
    // directory is missing that call is skipped, and this is all that stands
    // between a traversing ID and the recursive delete below.
    Self::ensure_safe_mod_id(&mod_id)?;

    // A mod whose download failed never reached the addons directory, which
    // may not exist at all yet. Its downloaded files still have to go.
    let addons_path = self.get_addons_path(profile_folder.as_deref())?;
    if addons_path.path().exists() {
      self.remove_mod_vpks(&mod_id, &vpks, profile_folder)?;
    } else {
      log::info!("Addons path does not exist, skipping VPK cleanup: {addons_path:?}");
    }

    self.mod_repository.remove_mod(&mod_id);

    let user_mod_dir = mods_path.join(&mod_id);

    if user_mod_dir.exists() {
      log::info!("Removing user-mod folder: {user_mod_dir:?}");
      self.filesystem.remove_directory_recursive(&user_mod_dir)?;
    } else {
      log::warn!("User-mod folder not found, skipping: {user_mod_dir:?}");
    }

    Ok(())
  }

  /// Remove a mod's VPKs transactionally for updates and permanent purges.
  ///
  /// Files are first renamed to non-VPK staging names. The manifest is then
  /// committed without the mod, and only after that are the staged files
  /// deleted. A failed manifest write restores every staged file.
  pub fn remove_mod_vpks(
    &mut self,
    mod_id: &str,
    fallback_vpks: &[String],
    profile_folder: Option<String>,
  ) -> Result<RemovedModVpks, Error> {
    Self::ensure_safe_mod_id(mod_id)?;

    let addons_path = self.get_addons_path(profile_folder.as_deref())?;
    let mut manifest = ProfileVpkManifest::open_for_write(&addons_path)?;
    let manifest_entry = manifest.mods.get(mod_id).cloned();
    let install_order = manifest_entry.as_ref().and_then(|entry| entry.order);
    let mut sources = HashSet::new();

    if let Some(entry) = &manifest_entry {
      for path in entry.file_paths(&addons_path) {
        if path.is_file() {
          sources.insert(path);
        }
      }
    }

    for prefixed_vpk in self.vpk_manager.find_prefixed_vpks(&addons_path, mod_id)? {
      let path = addons_path.join(prefixed_vpk);
      if path.is_file() {
        sources.insert(path);
      }
    }

    let mut fallback_names = fallback_vpks.to_vec();
    if let Some(repository_mod) = self.mod_repository.get_mod(mod_id) {
      fallback_names.extend(repository_mod.installed_vpks.clone());
    }
    for fallback in fallback_names {
      let locator = ShardLocator::from_legacy_name(&fallback);
      let path = addons_path.locator_path(&locator);
      if path.is_file() {
        sources.insert(path);
      }
    }

    if sources.is_empty() && manifest_entry.is_none() {
      self.mod_repository.remove_mod(mod_id);
      return Ok(RemovedModVpks {
        count: 0,
        install_order,
      });
    }

    let staging_name = format!("{}{mod_id}", shard::UPDATE_STAGING_PREFIX);
    let mut staging = VpkStaging::claim(&addons_path, &staging_name)?;
    let mut ordered_sources: Vec<PathBuf> = sources.into_iter().collect();
    ordered_sources.sort();
    let removed_count = ordered_sources.len();
    for source in &ordered_sources {
      if let Err(error) = staging.stage(&addons_path, source) {
        return Err(staging.rollback(error));
      }
    }

    manifest.remove_mod(mod_id);
    if let Err(error) = manifest.save(&addons_path) {
      return Err(staging.rollback(error));
    }

    staging.commit();
    self.mod_repository.remove_mod(mod_id);
    VpkManager::prune_empty_shard_dirs(&addons_path);

    Ok(RemovedModVpks {
      count: removed_count,
      install_order,
    })
  }

  pub fn hydrate_mods_from_manifest(
    &mut self,
    profile_folder: Option<String>,
  ) -> Result<usize, Error> {
    self.migrate_profile_to_shards(profile_folder.clone())?;
    let addons_path = self.get_addons_path(profile_folder.as_deref())?;
    let manifest = ProfileVpkManifest::load(&addons_path)?;

    let mut hydrated = 0usize;
    for (mod_id, entry) in &manifest.mods {
      if self.mod_repository.get_mod(mod_id).is_some() {
        continue;
      }

      let installed_vpks = if entry.enabled {
        entry.current_vpks.clone()
      } else {
        Vec::new()
      };

      let deadlock_mod = Mod {
        id: mod_id.clone(),
        name: mod_id.clone(),
        is_map: false,
        installed_vpks,
        file_tree: None,
        install_order: entry.order,
        original_vpk_names: entry.original_vpk_names.clone(),
      };
      self.mod_repository.add_mod(deadlock_mod);
      hydrated += 1;
    }

    if hydrated > 0 {
      log::info!("Hydrated {hydrated} mods from manifest for profile {profile_folder:?}");
    }

    Ok(hydrated)
  }

  /// Replace VPK files for a mod
  pub fn replace_mod_vpks(
    &mut self,
    mod_id: String,
    source_vpk_paths: Vec<std::path::PathBuf>,
    installed_vpks_from_frontend: Vec<String>,
    profile_folder: Option<String>,
  ) -> Result<(), Error> {
    log::info!("Replacing VPK files for mod: {mod_id} (profile: {profile_folder:?})");
    log::info!("Installed VPKs from frontend: {installed_vpks_from_frontend:?}");

    let addons_path = self.get_addons_path(profile_folder.as_deref())?;

    // Use VPK info from frontend first, then try repository, then look for prefixed VPKs
    let manifest = ProfileVpkManifest::open_for_write(&addons_path)?;
    let target_shard = manifest
      .mods
      .get(&mod_id)
      .map(|entry| entry.shard)
      .unwrap_or(ShardIndex::FIRST);
    let enabled_dir = addons_path.shard_dir(target_shard);
    let installed_vpks = if let Some(entry) = manifest.mods.get(&mod_id)
      && !entry.current_vpks.is_empty()
    {
      log::info!("Using manifest VPKs for replacement");
      entry.current_vpks.clone()
    } else if !installed_vpks_from_frontend.is_empty() {
      log::info!("Using installed VPKs from frontend");
      installed_vpks_from_frontend
    } else if let Some(mod_info) = self.mod_repository.get_mod(&mod_id) {
      log::info!("Found mod in repository: {mod_id}");
      mod_info.installed_vpks.clone()
    } else {
      log::info!(
        "Mod not in repository and no installed VPKs provided, will find VPKs by prefix: {mod_id}"
      );
      // Mod not in repository - it might be disabled or the repository wasn't loaded
      // We'll let replace_vpks find the prefixed VPKs directly
      Vec::new()
    };

    // Use VpkManager to replace the files
    self.vpk_manager.replace_vpks(
      &addons_path,
      &enabled_dir,
      &mod_id,
      &source_vpk_paths,
      &installed_vpks,
    )?;

    let new_original_names: Vec<String> = source_vpk_paths
      .iter()
      .filter_map(|p| p.file_name().map(|f| f.to_string_lossy().to_string()))
      .collect();

    let mut manifest = ProfileVpkManifest::load(&addons_path)?;
    if installed_vpks.is_empty() {
      let prefixed_vpks = self.vpk_manager.find_prefixed_vpks(&addons_path, &mod_id)?;
      manifest.mark_disabled(&mod_id, prefixed_vpks, new_original_names);
    } else {
      manifest.mark_enabled(
        &mod_id,
        installed_vpks,
        new_original_names,
        None,
        target_shard,
      );
    }
    manifest.save(&addons_path)?;

    log::info!("Successfully replaced VPK files for mod: {mod_id}");
    Ok(())
  }
}
