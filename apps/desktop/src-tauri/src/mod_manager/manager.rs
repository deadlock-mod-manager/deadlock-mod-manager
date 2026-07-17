use crate::app_runtime::AppHandle;
use crate::errors::Error;
use crate::mod_manager::{
  addons_backup_manager::AddonsBackupManager,
  autoexec_manager::AutoexecManager,
  file_tree::{FileTreeAnalyzer, ModFile, ModFileTree},
  filesystem_helper::FileSystemHelper,
  game_config_manager::GameConfigManager,
  game_process_manager::GameProcessManager,
  mod_repository::{Mod, ModRepository},
  shard,
  steam_manager::SteamManager,
  vpk_manager::{MissingVpkPolicy, ShardPlacement, VpkManager},
  vpk_manifest::{ProfileVpkManifest, ProfileVpkManifestEntry},
};
use log;
use std::{
  collections::HashSet,
  path::{Component, Path, PathBuf},
};
use tauri::Manager;

pub struct ModManager {
  steam_manager: SteamManager,
  process_manager: GameProcessManager,
  config_manager: GameConfigManager,
  vpk_manager: VpkManager,
  file_tree_analyzer: FileTreeAnalyzer,
  filesystem: FileSystemHelper,
  mod_repository: ModRepository,
  addons_backup_manager: AddonsBackupManager,
  autoexec_manager: AutoexecManager,
  app_handle: Option<AppHandle>,
}

impl ModManager {
  pub fn new() -> Self {
    let mut manager = Self {
      steam_manager: SteamManager::new(),
      process_manager: GameProcessManager::new(),
      config_manager: GameConfigManager::new(),
      vpk_manager: VpkManager::new(),
      file_tree_analyzer: FileTreeAnalyzer::new(),
      filesystem: FileSystemHelper::new(),
      mod_repository: ModRepository::new(),
      addons_backup_manager: AddonsBackupManager::new(),
      autoexec_manager: AutoexecManager::new(),
      app_handle: None,
    };

    // Try to find the game path on initialization
    if let Err(e) = manager.find_game() {
      log::warn!("Failed to find game path during initialization: {e:?}");
    }

    manager
  }

  pub fn find_steam(&mut self) -> Result<(), Error> {
    self.steam_manager.find_steam()?;
    Ok(())
  }

  pub fn find_steam_path(&mut self) -> Result<PathBuf, Error> {
    self.steam_manager.find_steam()?;
    self
      .steam_manager
      .get_steam_path()
      .ok_or(Error::SteamNotFound)
  }

  pub fn find_game(&mut self) -> Result<PathBuf, Error> {
    let game_path = self.steam_manager.find_game()?.clone();
    Ok(game_path)
  }

  pub fn set_game_path(&mut self, path: PathBuf) -> Result<PathBuf, Error> {
    self.steam_manager.set_game_path(path.clone())?;
    self.addons_backup_manager.set_game_path(path.clone());
    Ok(path)
  }

  pub fn set_steam_path(&mut self, path: PathBuf) -> Result<PathBuf, Error> {
    self.steam_manager.set_steam_dir(path)?;
    self
      .steam_manager
      .get_steam_path()
      .ok_or(Error::SteamNotFound)
  }

  pub fn clear_steam_path(&mut self) {
    self.steam_manager.clear_steam_dir();
  }

  pub fn is_game_running(&mut self) -> Result<bool, Error> {
    self.process_manager.is_game_running()
  }

  pub(crate) fn get_addons_path(&self, profile_folder: Option<&str>) -> Result<PathBuf, Error> {
    let game_path = self
      .steam_manager
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?;

    let addons_path = game_path.join("game").join("citadel").join("addons");
    Ok(match profile_folder {
      Some(folder) => {
        if !Self::is_safe_profile_folder(folder) {
          return Err(Error::InvalidInput(format!(
            "Invalid profile folder path: {folder}"
          )));
        }
        addons_path.join(folder)
      }
      None => addons_path,
    })
  }

  fn is_safe_profile_folder(folder: &str) -> bool {
    !folder.is_empty()
      && Path::new(folder)
        .components()
        .all(|component| matches!(component, Component::Normal(_)))
  }

  /// Pick the last active shard when it has room, otherwise append a new shard.
  /// Filling holes in older shards would move a newly installed mod ahead of
  /// mods in later search paths and silently change load order.
  pub(crate) fn choose_shard_for(
    base: &Path,
    current_mod: Option<(u32, u32)>,
    needed: u32,
  ) -> Result<u32, Error> {
    if needed > shard::SHARD_CAPACITY {
      return Err(Error::ModInvalid(format!(
        "This mod has {needed} VPK files, more than the {} the engine allows per addon folder.",
        shard::SHARD_CAPACITY
      )));
    }
    if let Some((current_shard, current_count)) = current_mod {
      let current_dir = shard::shard_dir(base, current_shard);
      let used_without_mod =
        VpkManager::count_enabled_vpks(&current_dir).saturating_sub(current_count);
      if shard::SHARD_CAPACITY.saturating_sub(used_without_mod) >= needed {
        return Ok(current_shard);
      }
    }

    let mut last_active_shard = 1;
    for shard_index in 2..=shard::MAX_SHARDS {
      let dir = shard::shard_dir(base, shard_index);
      if VpkManager::count_enabled_vpks(&dir) > 0 {
        last_active_shard = shard_index;
      }
    }

    let active_dir = shard::shard_dir(base, last_active_shard);
    let used = VpkManager::count_enabled_vpks(&active_dir);
    if shard::SHARD_CAPACITY.saturating_sub(used) >= needed {
      return Ok(last_active_shard);
    }
    if last_active_shard < shard::MAX_SHARDS {
      return Ok(last_active_shard + 1);
    }

    Err(Error::ModInvalid(format!(
      "Cannot enable this mod: all {} addon shard folders are full ({} files each). Disable some mods first.",
      shard::MAX_SHARDS,
      shard::SHARD_CAPACITY
    )))
  }

  /// Ordered `Game` search paths required for a profile. Always includes shard 1.
  pub fn profile_gameinfo_paths(
    &self,
    profile_folder: Option<String>,
  ) -> Result<Vec<String>, Error> {
    let base = self.get_addons_path(profile_folder.as_deref())?;

    let mut max_shard = 1u32;
    // A missing manifest loads as an empty default; a malformed or unsupported
    // one must fail loudly rather than silently emit truncated search paths.
    let manifest = ProfileVpkManifest::load(&base)?;
    for entry in manifest.mods.values() {
      if entry.enabled && !entry.current_vpks.is_empty() {
        max_shard = max_shard.max(entry.shard.max(1));
      }
    }

    for shard_index in 2..=shard::MAX_SHARDS {
      let dir = shard::shard_dir(&base, shard_index);
      if dir.exists() && VpkManager::count_enabled_vpks(&dir) > 0 {
        max_shard = max_shard.max(shard_index);
      }
    }

    Ok(
      (1..=max_shard)
        .map(|s| shard::shard_search_path(profile_folder.as_deref(), s))
        .collect(),
    )
  }

  fn ensure_profile_sharding(&mut self, profile_folder: Option<String>) -> Result<(), Error> {
    let base = self.get_addons_path(profile_folder.as_deref())?;
    let needs_reorder = (1..=shard::MAX_SHARDS).any(|shard_index| {
      let dir = shard::shard_dir(&base, shard_index);
      VpkManager::count_enabled_vpks(&dir) > shard::SHARD_CAPACITY
        || VpkManager::has_out_of_range_enabled_vpks(&dir)
    });
    if needs_reorder {
      log::info!("Migrating legacy VPK numbering into addon shards for profile {profile_folder:?}");
      self.reorder_all_mods_for_profile(profile_folder)?;
    }
    Ok(())
  }

  /// Write the modded gameinfo.gi search paths for a single profile, expanding
  /// it into one `Game` line per shard.
  pub fn apply_profile_gameinfo(&mut self, profile_folder: Option<String>) -> Result<(), Error> {
    let game_path = self
      .steam_manager
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?
      .clone();
    self.ensure_profile_sharding(profile_folder.clone())?;
    let paths = self.profile_gameinfo_paths(profile_folder)?;
    self.config_manager.update_mod_paths(&game_path, &paths)
  }

  /// Write layered gameinfo.gi search paths: the server folder's shards first
  /// (higher precedence), then the active profile's shards.
  pub fn apply_layered_gameinfo(
    &mut self,
    server_folder: Option<String>,
    profile_folder: Option<String>,
  ) -> Result<(), Error> {
    let game_path = self
      .steam_manager
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?
      .clone();

    let mut paths = Vec::new();
    if let Some(server) = server_folder {
      self.ensure_profile_sharding(Some(server.clone()))?;
      paths.extend(self.profile_gameinfo_paths(Some(server))?);
    }
    self.ensure_profile_sharding(profile_folder.clone())?;
    paths.extend(self.profile_gameinfo_paths(profile_folder)?);

    self.config_manager.update_mod_paths(&game_path, &paths)
  }

  fn vpk_filenames(vpks: &[String]) -> Vec<String> {
    vpks.iter().map(|vpk| Self::vpk_filename(vpk)).collect()
  }

  fn vpk_filename(vpk: &str) -> String {
    std::path::Path::new(vpk)
      .file_name()
      .map(|filename| filename.to_string_lossy().to_string())
      .unwrap_or_else(|| vpk.to_string())
  }

  fn existing_vpk_filenames(addons_path: &Path, vpks: &[String]) -> Vec<String> {
    Self::vpk_filenames(vpks)
      .into_iter()
      .filter(|vpk| addons_path.join(vpk).exists())
      .collect()
  }

  fn resolve_reorder_vpks(
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

  fn reconcile_manifest_entry_for_reorder(
    base: &Path,
    entry: &mut ProfileVpkManifestEntry,
    fallback_vpks: &[String],
  ) -> bool {
    let enabled_dir = shard::shard_dir(base, entry.shard.max(1));
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

  fn apply_placements_to_manifest(
    manifest: &mut ProfileVpkManifest,
    placements: &[ShardPlacement],
  ) {
    for placement in placements {
      if let Some(entry) = manifest.mods.get_mut(&placement.mod_id) {
        entry.enabled = true;
        entry.shard = placement.shard;
        entry.current_vpks = placement.vpks.clone();
        entry.disabled_vpks.clear();
      }
    }
  }

  pub fn stop_game(&mut self) -> Result<(), Error> {
    self.process_manager.stop_game()
  }

  pub fn setup_game_for_mods(&mut self) -> Result<(), Error> {
    // Ensure game is not running before setup
    self.process_manager.ensure_game_not_running()?;

    if self.config_manager.is_game_setup() {
      log::info!("Game already setup");
      return Ok(());
    }

    let game_path = self.steam_manager.find_game()?;
    self.config_manager.validate_game_files(game_path)?;
    self.config_manager.setup_game_for_mods(game_path)?;

    Ok(())
  }

  pub fn toggle_mods(&mut self, vanilla: bool) -> Result<(), Error> {
    let game_path = self
      .steam_manager
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?;

    self.config_manager.toggle_mods(game_path, vanilla)?;

    Ok(())
  }

  pub fn run_game(
    &mut self,
    vanilla: bool,
    additional_args: String,
    profile_folder: Option<String>,
  ) -> Result<(), Error> {
    // Ensure game path is found
    self.find_game()?;

    // Toggle mods based on vanilla flag
    if vanilla {
      log::info!("Disabling mods...");
      self.toggle_mods(vanilla)?;
    } else {
      log::info!("Enabling mods for profile: {:?}...", profile_folder);
      self.apply_profile_gameinfo(profile_folder)?;
    }

    // Launch the game through Steam
    self.steam_manager.launch_game(&additional_args)?;

    Ok(())
  }

  pub fn get_mod_file_tree(&self, mod_path: &PathBuf) -> Result<ModFileTree, Error> {
    self.file_tree_analyzer.get_mod_file_tree(mod_path)
  }

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

    let mut manifest = ProfileVpkManifest::load(&addons_path)?;
    let target_shard = Self::choose_shard_for(&addons_path, None, prefixed_vpks.len() as u32)?;
    let enabled_dir = shard::shard_dir(&addons_path, target_shard);

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
        Ok(()) => {
          let reordered_manifest = ProfileVpkManifest::load(&addons_path)?;
          if let Some(entry) = reordered_manifest.mods.get(&deadlock_mod.id) {
            deadlock_mod.installed_vpks = entry.current_vpks.clone();
            self.mod_repository.add_mod(deadlock_mod.clone());
          }
        }
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

    let mut manifest = ProfileVpkManifest::load(&addons_path)?;
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
    let shard_index = manifest_entry.as_ref().map(|e| e.shard.max(1)).unwrap_or(1);
    let enabled_dir = shard::shard_dir(&addons_path, shard_index);

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
    log::info!("Purging mod: {mod_id} (profile: {profile_folder:?})");

    self.remove_mod_vpks_for_update(&mod_id, &vpks, profile_folder)?;

    let mods_path = self.get_mods_store_path()?;
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
  pub fn remove_mod_vpks_for_update(
    &mut self,
    mod_id: &str,
    fallback_vpks: &[String],
    profile_folder: Option<String>,
  ) -> Result<(usize, Option<u32>), Error> {
    if !Self::is_safe_profile_folder(mod_id) {
      return Err(Error::InvalidInput(format!("Invalid mod ID: {mod_id}")));
    }

    let addons_path = self.get_addons_path(profile_folder.as_deref())?;
    let mut manifest = ProfileVpkManifest::load(&addons_path)?;
    let manifest_entry = manifest.mods.get(mod_id).cloned();
    let install_order = manifest_entry.as_ref().and_then(|entry| entry.order);
    let staging_dir = addons_path.join(format!(".dmm-update-{mod_id}"));
    let mut sources = HashSet::new();

    if let Some(entry) = &manifest_entry {
      if entry.enabled {
        let enabled_dir = shard::shard_dir(&addons_path, entry.shard.max(1));
        for vpk in &entry.current_vpks {
          let path = enabled_dir.join(Self::vpk_filename(vpk));
          if path.is_file() {
            sources.insert(path);
          }
        }
      } else {
        for vpk in &entry.disabled_vpks {
          let path = addons_path.join(Self::vpk_filename(vpk));
          if path.is_file() {
            sources.insert(path);
          }
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
      let normalized = fallback.replace('\\', "/");
      let (shard_index, filename) = normalized
        .split_once('/')
        .and_then(|(root, filename)| {
          root
            .strip_prefix("addons")
            .and_then(|value| value.parse::<u32>().ok())
            .filter(|value| (2..=shard::MAX_SHARDS).contains(value))
            .map(|value| (value, filename.to_string()))
        })
        .unwrap_or_else(|| (1, Self::vpk_filename(&normalized)));
      let path = shard::shard_dir(&addons_path, shard_index).join(filename);
      if path.is_file() {
        sources.insert(path);
      }
    }

    if sources.is_empty() && manifest_entry.is_none() {
      self.mod_repository.remove_mod(mod_id);
      return Ok((0, install_order));
    }

    std::fs::create_dir_all(&staging_dir)?;

    let mut staged: Vec<(PathBuf, PathBuf)> = Vec::new();
    let mut ordered_sources: Vec<PathBuf> = sources.into_iter().collect();
    ordered_sources.sort();
    for source in ordered_sources {
      let source_shard = (1..=shard::MAX_SHARDS)
        .find(|shard_index| {
          source
            .parent()
            .is_some_and(|parent| parent == shard::shard_dir(&addons_path, *shard_index))
        })
        .ok_or_else(|| {
          Error::ModInvalid(format!(
            "Cannot stage VPK outside profile shards: {}",
            source.display()
          ))
        })?;
      let filename = source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| Error::ModInvalid("VPK filename is not valid UTF-8".to_string()))?;
      let staged_path = staging_dir.join(format!("s{source_shard}__{filename}.pending"));
      if let Err(error) = std::fs::rename(&source, &staged_path) {
        let mut rollback_failures = Vec::new();
        for (staged_path, source) in staged.into_iter().rev() {
          if let Err(rollback_error) = std::fs::rename(&staged_path, &source) {
            rollback_failures.push(format!(
              "{} -> {}: {rollback_error}",
              staged_path.display(),
              source.display()
            ));
          }
        }
        let _ = std::fs::remove_dir(&staging_dir);
        if !rollback_failures.is_empty() {
          return Err(Error::RollbackFailed(format!(
            "Failed to stage {}: {error}. Failed to restore: {}",
            source.display(),
            rollback_failures.join(", ")
          )));
        }
        return Err(error.into());
      }
      staged.push((staged_path, source));
    }

    manifest.remove_mod(mod_id);
    if let Err(error) = manifest.save(&addons_path) {
      let mut rollback_failures = Vec::new();
      for (staged_path, source) in staged.into_iter().rev() {
        if let Err(rollback_error) = std::fs::rename(&staged_path, &source) {
          rollback_failures.push(format!(
            "{} -> {}: {rollback_error}",
            staged_path.display(),
            source.display()
          ));
        }
      }
      let _ = std::fs::remove_dir(&staging_dir);
      if rollback_failures.is_empty() {
        return Err(error);
      }
      return Err(Error::RollbackFailed(format!(
        "Failed to save manifest: {error}. Failed to restore: {}",
        rollback_failures.join(", ")
      )));
    }

    let removed_count = staged.len();
    if let Err(error) = std::fs::remove_dir_all(&staging_dir) {
      log::warn!(
        "Updated manifest but failed to remove non-VPK update staging directory {staging_dir:?}: {error}"
      );
    }
    self.mod_repository.remove_mod(mod_id);
    VpkManager::prune_empty_shard_dirs(&addons_path);

    Ok((removed_count, install_order))
  }

  /// Reorder all mods based on their current install_order for a specific profile
  fn reorder_all_mods_for_profile(&mut self, profile_folder: Option<String>) -> Result<(), Error> {
    let addons_path = self.get_addons_path(profile_folder.as_deref())?;

    log::info!("Reordering all mods based on install order for profile: {profile_folder:?}");

    let mut manifest = ProfileVpkManifest::load(&addons_path)?;
    let mut manifest_changed = false;
    let mut ordered_manifest_entries = Vec::new();
    for (mod_id, entry) in &mut manifest.mods {
      manifest_changed |= Self::reconcile_manifest_entry_for_reorder(&addons_path, entry, &[]);

      if entry.enabled && !entry.current_vpks.is_empty() {
        let first_vpk_number = entry
          .current_vpks
          .iter()
          .filter_map(|vpk| VpkManager::enabled_vpk_number(&Self::vpk_filename(vpk)))
          .min()
          .unwrap_or(u32::MAX);
        let sort_key = match entry.order {
          Some(order) => (0, order, first_vpk_number),
          None => (1, entry.shard.max(1), first_vpk_number),
        };
        ordered_manifest_entries.push((
          mod_id.clone(),
          sort_key,
          entry.shard.max(1),
          entry.current_vpks.clone(),
        ));
      }
    }
    ordered_manifest_entries.sort_by_key(|(_, sort_key, _, _)| *sort_key);

    let mod_vpk_mapping: Vec<(String, u32, Vec<String>)> = ordered_manifest_entries
      .into_iter()
      .map(|(mod_id, _, shard_index, vpks)| (mod_id, shard_index, vpks))
      .collect();

    if mod_vpk_mapping.is_empty() {
      if manifest_changed {
        manifest.save(&addons_path)?;
      }
      let has_unmanaged_enabled_vpks = (1..=shard::MAX_SHARDS).any(|shard_index| {
        VpkManager::count_enabled_vpks(&shard::shard_dir(&addons_path, shard_index)) > 0
      });
      if has_unmanaged_enabled_vpks {
        self.vpk_manager.reorder_vpks_sharded(&[], &addons_path)?;
        log::info!("Reordered unmanaged enabled VPKs without manifest entries");
      } else {
        log::info!("No enabled VPKs need reordering");
      }
      return Ok(());
    }

    let placements = self.vpk_manager.reorder_vpks_sharded_with_commit(
      &mod_vpk_mapping,
      &addons_path,
      |placements| {
        Self::apply_placements_to_manifest(&mut manifest, placements);
        manifest.save(&addons_path)
      },
    )?;

    for placement in placements {
      if let Some(mut mod_entry) = self.mod_repository.remove_mod(&placement.mod_id) {
        mod_entry.installed_vpks = placement.vpks;
        self.mod_repository.add_mod(mod_entry);
      }
    }

    log::info!("All mods reordered successfully");
    Ok(())
  }

  pub(crate) fn reorder_profile_after_variant_change(
    &mut self,
    profile_folder: Option<String>,
    mod_id: &str,
  ) -> Result<Vec<String>, Error> {
    self.reorder_all_mods_for_profile(profile_folder.clone())?;
    let addons_path = self.get_addons_path(profile_folder.as_deref())?;
    let manifest = ProfileVpkManifest::load(&addons_path)?;
    manifest
      .mods
      .get(mod_id)
      .filter(|entry| entry.enabled)
      .map(|entry| entry.current_vpks.clone())
      .ok_or_else(|| {
        Error::ModInvalid(format!(
          "Mod {mod_id} is missing from the manifest after reordering"
        ))
      })
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

    // Log the input data for debugging
    for (remote_id, vpks, order) in &mod_order_data {
      log::info!("Input: mod {remote_id} has order {order} with VPKs: {vpks:?}");
    }

    // Sort by order
    let mut sorted_data = mod_order_data;
    sorted_data.sort_by_key(|(_, _, order)| *order);

    let mut manifest = ProfileVpkManifest::load(&addons_path)?;

    // Log the sorted data
    log::info!("Sorted order:");
    for (i, (remote_id, vpks, order)) in sorted_data.iter().enumerate() {
      log::info!("Position {i}: mod {remote_id} (order {order}) with VPKs: {vpks:?}");
    }

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
        mod_vpk_mapping.push((remote_id, entry.shard.max(1), entry.current_vpks.clone()));
      }
    }

    if mod_vpk_mapping.is_empty() {
      if manifest_changed {
        manifest.save(&addons_path)?;
      }
      log::warn!("No enabled VPK mappings available to reorder");
      return Ok(Vec::new());
    }

    // Reorder the VPK files and get the updated placements
    let placements = self.vpk_manager.reorder_vpks_sharded_with_commit(
      &mod_vpk_mapping,
      &addons_path,
      |placements| {
        Self::apply_placements_to_manifest(&mut manifest, placements);
        manifest.save(&addons_path)
      },
    )?;

    let mut updated_mappings = Vec::new();
    for placement in placements {
      if let Some(mut mod_entry) = self.mod_repository.remove_mod(&placement.mod_id) {
        mod_entry.installed_vpks = placement.vpks.clone();
        self.mod_repository.add_mod(mod_entry);
      }

      updated_mappings.push((placement.mod_id, placement.vpks));
    }

    log::info!("Mod reordering by remote ID completed successfully");
    Ok(updated_mappings)
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

    // Sort mod order data by the specified order
    let mut sorted_order = mod_order_data;
    sorted_order.sort_by_key(|(_, order)| *order);

    let mut manifest = ProfileVpkManifest::load(&addons_path)?;
    let mut mod_vpk_mapping = Vec::new();
    let mut updated_mods = Vec::new();
    let mut manifest_changed = false;

    for (mod_id, new_order) in sorted_order {
      if let Some(entry) = manifest.mods.get_mut(&mod_id) {
        if entry.order != Some(new_order) {
          entry.order = Some(new_order);
          manifest_changed = true;
        }
        manifest_changed |= Self::reconcile_manifest_entry_for_reorder(&addons_path, entry, &[]);
        if entry.enabled && !entry.current_vpks.is_empty() {
          mod_vpk_mapping.push((
            mod_id.clone(),
            entry.shard.max(1),
            entry.current_vpks.clone(),
          ));
        }
      }

      if let Some(mut deadlock_mod) = self.mod_repository.remove_mod(&mod_id) {
        deadlock_mod.install_order = Some(new_order);
        updated_mods.push(deadlock_mod);
      } else {
        log::debug!("Mod {mod_id} not found in in-memory repository while reordering");
      }
    }

    if mod_vpk_mapping.is_empty() {
      if manifest_changed {
        manifest.save(&addons_path)?;
      }
      for deadlock_mod in updated_mods {
        self.mod_repository.add_mod(deadlock_mod);
      }
      log::warn!("No enabled manifest VPKs available to reorder");
      return Ok(Vec::new());
    }

    // Reorder the VPK files
    let placements = self.vpk_manager.reorder_vpks_sharded_with_commit(
      &mod_vpk_mapping,
      &addons_path,
      |placements| {
        Self::apply_placements_to_manifest(&mut manifest, placements);
        manifest.save(&addons_path)
      },
    )?;

    // Update mod data with new VPK names and re-add to repository
    let mut result_mods = Vec::new();
    for placement in placements {
      if let Some(index) = updated_mods
        .iter()
        .position(|mod_entry| mod_entry.id == placement.mod_id)
      {
        let mut deadlock_mod = updated_mods.remove(index);
        deadlock_mod.installed_vpks = placement.vpks;
        self.mod_repository.add_mod(deadlock_mod.clone());
        result_mods.push(deadlock_mod);
      }
    }

    for deadlock_mod in updated_mods {
      self.mod_repository.add_mod(deadlock_mod);
    }

    log::info!("Successfully reordered {} mods", result_mods.len());
    Ok(result_mods)
  }

  pub fn clear_mods(&mut self, profile_folder: Option<String>) -> Result<(), Error> {
    let addons_path = self.get_addons_path(profile_folder.as_deref())?;

    self
      .vpk_manager
      .clear_all_vpks_with_commit(&addons_path, || {
        ProfileVpkManifest::default().save(&addons_path)
      })?;
    Ok(())
  }

  pub fn open_mods_folder(&self, profile_folder: Option<String>) -> Result<(), Error> {
    let addons_path = self.get_addons_path(profile_folder.as_deref())?;

    self
      .filesystem
      .open_folder(addons_path.to_string_lossy().as_ref())
  }

  pub fn open_game_folder(&self) -> Result<(), Error> {
    let game_path = self
      .steam_manager
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?;
    self
      .filesystem
      .open_folder(game_path.to_string_lossy().as_ref())
  }

  pub fn open_mods_data_folder(&self) -> Result<(), Error> {
    let mods_path = self.get_mods_store_path()?;
    self.filesystem.create_directories(&mods_path)?;
    self
      .filesystem
      .open_folder(mods_path.to_string_lossy().as_ref())
  }

  pub fn clear_download_cache(&self) -> Result<u64, Error> {
    let mods_path = self.get_mods_store_path()?;
    if !mods_path.exists() {
      return Ok(0);
    }

    let mut freed = 0u64;
    for entry in std::fs::read_dir(&mods_path)? {
      let entry = entry?;
      let path = entry.path();
      if !path.is_dir() {
        continue;
      }
      if entry.file_name().to_string_lossy().starts_with("local-") {
        continue;
      }
      freed += dir_size(&path);
      self.filesystem.remove_directory_recursive(&path)?;
    }

    log::info!("Cleared download cache: {freed} bytes freed");
    Ok(freed)
  }

  pub fn clear_all_mods_data(&self) -> Result<u64, Error> {
    let mods_path = self.get_mods_store_path()?;
    if !mods_path.exists() {
      return Ok(0);
    }

    let size = dir_size(&mods_path);
    self.filesystem.remove_directory_recursive(&mods_path)?;
    self.filesystem.create_directories(&mods_path)?;
    log::info!("Cleared all mods data: {size} bytes freed");
    Ok(size)
  }

  /// Get a reference to the steam manager
  pub fn get_steam_manager(&self) -> &SteamManager {
    &self.steam_manager
  }

  /// Get a reference to the config manager
  pub fn get_config_manager(&self) -> &GameConfigManager {
    &self.config_manager
  }

  /// Get a mutable reference to the config manager
  pub fn get_config_manager_mut(&mut self) -> &mut GameConfigManager {
    &mut self.config_manager
  }

  /// Get a reference to the mod repository
  pub fn get_mod_repository(&self) -> &ModRepository {
    &self.mod_repository
  }

  /// Get a mutable reference to the mod repository
  pub fn get_mod_repository_mut(&mut self) -> &mut ModRepository {
    &mut self.mod_repository
  }

  pub fn set_app_handle(&mut self, app_handle: AppHandle) {
    self.app_handle = Some(app_handle);
  }

  pub fn get_mods_store_path(&self) -> Result<std::path::PathBuf, Error> {
    let app_handle = self
      .app_handle
      .as_ref()
      .ok_or(Error::AppHandleNotInitialized)?;
    let app_local_data_dir = app_handle
      .path()
      .app_local_data_dir()
      .map_err(Error::Tauri)?;
    Ok(app_local_data_dir.join("mods"))
  }

  pub fn get_profile_vpk_manifest(
    &self,
    profile_folder: Option<String>,
  ) -> Result<ProfileVpkManifest, Error> {
    let addons_path = self.get_addons_path(profile_folder.as_deref())?;
    ProfileVpkManifest::load(&addons_path)
  }

  pub fn hydrate_mods_from_manifest(
    &mut self,
    profile_folder: Option<String>,
  ) -> Result<usize, Error> {
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
    let manifest = ProfileVpkManifest::load(&addons_path)?;
    let target_shard = manifest
      .mods
      .get(&mod_id)
      .map(|e| e.shard.max(1))
      .unwrap_or(1);
    let enabled_dir = shard::shard_dir(&addons_path, target_shard);
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

  /// Validate and canonicalize a path to ensure it's within the allowed mods directory
  fn validate_path_within_mods_root(&self, path: &PathBuf) -> Result<PathBuf, Error> {
    let mods_root = self.get_mods_store_path()?;
    self.filesystem.create_directories(&mods_root)?;
    let canonical_mods_root = mods_root
      .canonicalize()
      .map_err(|_| Error::UnauthorizedPath("Unable to resolve mods directory".to_string()))?;

    // Canonicalize the requested path
    let canonical_path = if path.is_absolute() {
      path.canonicalize().map_err(|_| {
        Error::UnauthorizedPath(format!("Unable to resolve path: {}", path.display()))
      })?
    } else {
      // For relative paths, resolve them relative to the mods root
      mods_root.join(path).canonicalize().map_err(|_| {
        Error::UnauthorizedPath(format!(
          "Unable to resolve relative path: {}",
          path.display()
        ))
      })?
    };

    // Verify the canonicalized path is within the mods root
    if !canonical_path.starts_with(&canonical_mods_root) {
      return Err(Error::UnauthorizedPath(format!(
        "Path '{}' is outside the allowed mods directory '{}'",
        canonical_path.display(),
        canonical_mods_root.display()
      )));
    }

    Ok(canonical_path)
  }

  /// Public method to validate extract target paths for use by commands
  pub fn validate_extract_target_path(&self, path: &PathBuf) -> Result<PathBuf, Error> {
    self.validate_path_within_mods_root(path)
  }

  /// Validate and resolve a mod folder path, rejecting path traversal in mod_id.
  pub fn get_validated_mod_folder_path(&self, mod_id: &str) -> Result<PathBuf, Error> {
    if mod_id.contains("..") || mod_id.contains('/') || mod_id.contains('\\') {
      return Err(Error::InvalidInput(
        "Invalid mod ID: path traversal not allowed".to_string(),
      ));
    }
    let mods_root = self.get_mods_store_path()?;
    let mod_folder = mods_root.join(mod_id);
    if mod_folder.exists() {
      self.validate_path_within_mods_root(&mod_folder)
    } else {
      Ok(mod_folder)
    }
  }

  /// Remove a mod folder from the filesystem
  pub fn remove_mod_folder(&self, mod_path: &PathBuf) -> Result<(), Error> {
    log::info!("Removing mod folder: {mod_path:?}");

    // Validate and canonicalize the path to ensure it's within the mods directory
    let validated_path = self.validate_path_within_mods_root(mod_path)?;

    if !validated_path.exists() {
      log::warn!("Mod folder does not exist: {validated_path:?}");
      return Ok(());
    }

    self
      .filesystem
      .remove_directory_recursive(&validated_path)?;
    log::info!("Successfully removed mod folder: {validated_path:?}");
    Ok(())
  }

  pub fn get_addons_backup_manager(&mut self) -> &mut AddonsBackupManager {
    if let Some(game_path) = self.steam_manager.get_game_path() {
      self.addons_backup_manager.set_game_path(game_path.clone());
    }
    &mut self.addons_backup_manager
  }

  pub fn set_backup_manager_app_handle(&mut self, app_handle: AppHandle) {
    self.addons_backup_manager.set_app_handle(app_handle);
  }

  pub fn open_addons_backups_folder(&mut self) -> Result<(), Error> {
    let backup_manager = self.get_addons_backup_manager();
    let backup_dir = backup_manager.get_backup_directory()?;

    self.filesystem.create_directories(&backup_dir)?;

    self
      .filesystem
      .open_folder(backup_dir.to_string_lossy().as_ref())
  }

  pub fn get_autoexec_manager(&self) -> &AutoexecManager {
    &self.autoexec_manager
  }
}

impl Default for ModManager {
  fn default() -> Self {
    Self::new()
  }
}

fn dir_size(path: &std::path::Path) -> u64 {
  std::fs::read_dir(path)
    .map(|entries| {
      entries
        .filter_map(|e| e.ok())
        .map(|e| {
          let meta = e.metadata().ok();
          if e.path().is_dir() {
            dir_size(&e.path())
          } else {
            meta.map_or(0, |m| m.len())
          }
        })
        .sum()
    })
    .unwrap_or(0)
}

#[cfg(test)]
mod tests {
  use crate::mod_manager::vpk_manifest::ProfileVpkManifestEntry;

  use super::ModManager;
  use std::fs;

  fn write_vpk(addons_path: &std::path::Path, name: &str) {
    fs::write(addons_path.join(name), b"test vpk").unwrap();
  }

  #[test]
  fn profile_folder_validation_rejects_path_escape_components() {
    assert!(ModManager::is_safe_profile_folder("profile_123"));
    assert!(ModManager::is_safe_profile_folder("server_abc"));
    assert!(ModManager::is_safe_profile_folder("profiles/imported"));

    assert!(!ModManager::is_safe_profile_folder(""));
    assert!(!ModManager::is_safe_profile_folder("."));
    assert!(!ModManager::is_safe_profile_folder("../profile_123"));
    assert!(!ModManager::is_safe_profile_folder("/tmp/profile_123"));

    #[cfg(windows)]
    assert!(!ModManager::is_safe_profile_folder("C:\\tmp\\profile_123"));
  }

  #[test]
  fn reorder_vpk_resolution_prefers_valid_manifest_names() {
    let temp = tempfile::tempdir().unwrap();
    write_vpk(temp.path(), "pak01_dir.vpk");
    write_vpk(temp.path(), "pak02_dir.vpk");

    let resolved = ModManager::resolve_reorder_vpks(
      temp.path(),
      &["pak01_dir.vpk".to_string()],
      &["pak02_dir.vpk".to_string()],
    );

    assert_eq!(resolved, vec!["pak01_dir.vpk".to_string()]);
  }

  #[test]
  fn reorder_vpk_resolution_uses_frontend_names_when_manifest_is_stale() {
    let temp = tempfile::tempdir().unwrap();
    write_vpk(temp.path(), "pak02_dir.vpk");

    let resolved = ModManager::resolve_reorder_vpks(
      temp.path(),
      &["pak01_dir.vpk".to_string()],
      &["pak02_dir.vpk".to_string()],
    );

    assert_eq!(resolved, vec!["pak02_dir.vpk".to_string()]);
  }

  #[test]
  fn reorder_manifest_reconciliation_disables_entries_without_existing_vpks() {
    let temp = tempfile::tempdir().unwrap();
    let mut entry = ProfileVpkManifestEntry {
      enabled: true,
      current_vpks: vec!["pak01_dir.vpk".to_string()],
      ..Default::default()
    };

    let changed = ModManager::reconcile_manifest_entry_for_reorder(temp.path(), &mut entry, &[]);

    assert!(changed);
    assert!(!entry.enabled);
    assert!(entry.current_vpks.is_empty());
  }

  #[test]
  fn reorder_manifest_reconciliation_does_not_enable_disabled_entries_without_fallback() {
    let temp = tempfile::tempdir().unwrap();
    write_vpk(temp.path(), "pak01_dir.vpk");
    let mut entry = ProfileVpkManifestEntry {
      enabled: false,
      current_vpks: vec!["pak01_dir.vpk".to_string()],
      ..Default::default()
    };

    let changed = ModManager::reconcile_manifest_entry_for_reorder(temp.path(), &mut entry, &[]);

    assert!(!changed);
    assert!(!entry.enabled);
    assert_eq!(entry.current_vpks, vec!["pak01_dir.vpk".to_string()]);
  }
}
