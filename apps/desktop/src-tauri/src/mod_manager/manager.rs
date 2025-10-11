use crate::errors::Error;
use crate::mod_manager::{
  addons_backup_manager::AddonsBackupManager,
  file_tree::{FileTreeAnalyzer, ModFileTree},
  filesystem_helper::FileSystemHelper,
  game_config_manager::GameConfigManager,
  game_process_manager::GameProcessManager,
  mod_repository::{Mod, ModRepository},
  steam_manager::SteamManager,
  vpk_manager::VpkManager,
};
use log;
use std::path::PathBuf;

pub struct ModManager {
  steam_manager: SteamManager,
  process_manager: GameProcessManager,
  config_manager: GameConfigManager,
  vpk_manager: VpkManager,
  file_tree_analyzer: FileTreeAnalyzer,
  filesystem: FileSystemHelper,
  mod_repository: ModRepository,
  addons_backup_manager: AddonsBackupManager,
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
    };

    // Try to find the game path on initialization
    if let Err(e) = manager.find_game() {
      log::warn!("Failed to find game path during initialization: {:?}", e);
    }

    manager
  }

  pub fn find_steam(&mut self) -> Result<(), Error> {
    self.steam_manager.find_steam()?;
    Ok(())
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

  pub fn is_game_running(&mut self) -> Result<bool, Error> {
    self.process_manager.is_game_running()
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

  pub fn run_game(&mut self, vanilla: bool, additional_args: String) -> Result<(), Error> {
    // Ensure game path is found
    self.find_game()?;

    // Toggle mods based on vanilla flag
    if vanilla {
      log::info!("Disabling mods...");
    } else {
      log::info!("Enabling mods...");
    }
    self.toggle_mods(vanilla)?;

    // Launch the game through Steam
    self.steam_manager.launch_game(&additional_args)?;

    Ok(())
  }

  pub fn get_mod_file_tree(&self, mod_path: &PathBuf) -> Result<ModFileTree, Error> {
    self.file_tree_analyzer.get_mod_file_tree(mod_path)
  }

  pub fn install_mod(&mut self, mut deadlock_mod: Mod) -> Result<Mod, Error> {
    log::info!(
      "Starting installation (enable) of mod: {}",
      deadlock_mod.name
    );

    if !self.config_manager.is_game_setup() {
      log::info!("Setting up game for mods...");
      self.setup_game_for_mods()?;
    }

    let game_path = self
      .steam_manager
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?;

    let addons_path = game_path.join("game").join("citadel").join("addons");

    // Find prefixed VPKs in addons (mod is downloaded but not enabled)
    let prefixed_vpks = self
      .vpk_manager
      .find_prefixed_vpks(&addons_path, &deadlock_mod.id)?;

    if prefixed_vpks.is_empty() {
      log::error!("No prefixed VPKs found for mod {}", deadlock_mod.id);
      return Err(Error::ModInvalid(
        "Mod needs to be downloaded first. No VPK files found in addons folder.".into(),
      ));
    }

    log::info!(
      "Found {} prefixed VPKs, enabling them by removing prefix",
      prefixed_vpks.len()
    );

    // Enable by renaming prefixed VPKs to sequential numbering
    let installed_vpks =
      self
        .vpk_manager
        .enable_vpks(&addons_path, &deadlock_mod.id, &prefixed_vpks)?;

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

    log::info!("Adding mod to managed mods list");
    self.mod_repository.add_mod(deadlock_mod.clone());

    // If the mod has an install order, trigger a reorder to maintain correct sequence
    if deadlock_mod.install_order.is_some() {
      log::info!("Mod has install order, triggering reorder to maintain sequence");
      self.reorder_all_mods()?;
    }

    log::info!("Mod installation (enable) completed successfully");
    Ok(deadlock_mod)
  }

  pub fn uninstall_mod(&mut self, mod_id: String, vpks: Vec<String>) -> Result<(), Error> {
    log::info!("Uninstalling (disabling) mod: {}", mod_id);

    let game_path = self
      .steam_manager
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?;
    let addons_path = game_path.join("game").join("citadel").join("addons");

    if !addons_path.exists() {
      return Err(Error::GamePathNotSet);
    }

    // Check if the mod is in memory
    if let Some(mut local_mod) = self.mod_repository.get_mod(&mod_id).cloned() {
      log::info!("Mod found in memory: {}", local_mod.name);

      // Disable by renaming installed VPKs to prefixed format
      let prefixed_vpks = self.vpk_manager.disable_vpks(
        &addons_path,
        &mod_id,
        &local_mod.installed_vpks,
        &local_mod.original_vpk_names,
      )?;

      // Update mod state to track prefixed VPKs
      local_mod.installed_vpks = Vec::new();
      self.mod_repository.add_mod(local_mod);

      log::info!(
        "Disabled mod {} with {} prefixed VPKs",
        mod_id,
        prefixed_vpks.len()
      );
    } else {
      log::warn!("Mod not found in repository, removing VPKs directly");
      self.vpk_manager.remove_vpks(&vpks, &addons_path)?;
    }

    Ok(())
  }

  pub fn purge_mod(&mut self, mod_id: String, vpks: Vec<String>) -> Result<(), Error> {
    log::info!("Purging mod: {}", mod_id);

    let game_path = self
      .steam_manager
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?;
    let addons_path = game_path.join("game").join("citadel").join("addons");

    if !addons_path.exists() {
      return Err(Error::GamePathNotSet);
    }

    // Remove VPK files from game (both installed and prefixed)
    if let Some(local_mod) = self.mod_repository.remove_mod(&mod_id) {
      log::info!("Mod found in memory: {}", local_mod.name);

      // Remove installed VPKs if any
      if !local_mod.installed_vpks.is_empty() {
        self
          .vpk_manager
          .remove_vpks(&local_mod.installed_vpks, &addons_path)?;
      }

      // Also remove any prefixed VPKs
      self
        .vpk_manager
        .remove_vpks_by_mod_id(&addons_path, &mod_id)?;
    } else {
      // Remove both specified VPKs and any prefixed VPKs
      self.vpk_manager.remove_vpks(&vpks, &addons_path)?;
      self
        .vpk_manager
        .remove_vpks_by_mod_id(&addons_path, &mod_id)?;
    }

    // Remove the mod's folder from user's local app data
    let mods_path = self.filesystem.get_mods_store_path()?;
    let user_mod_dir = mods_path.join(&mod_id);

    if user_mod_dir.exists() {
      log::info!("Removing user-mod folder: {:?}", user_mod_dir);
      self.filesystem.remove_directory_recursive(&user_mod_dir)?;
    } else {
      log::warn!("User-mod folder not found, skipping: {:?}", user_mod_dir);
    }

    Ok(())
  }

  /// Reorder all mods based on their current install_order
  fn reorder_all_mods(&mut self) -> Result<(), Error> {
    let game_path = self
      .steam_manager
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?;
    let addons_path = game_path.join("game").join("citadel").join("addons");

    log::info!("Reordering all mods based on install order");

    // Collect all mods and sort by install order
    let mut ordered_mods: Vec<Mod> = self.mod_repository.get_all_mods().cloned().collect();
    ordered_mods.sort_by_key(|mod_entry| mod_entry.install_order.unwrap_or(999));

    // Create mapping for reordering
    let mod_vpk_mapping: Vec<(String, Vec<String>)> = ordered_mods
      .iter()
      .map(|mod_entry| (mod_entry.id.clone(), mod_entry.installed_vpks.clone()))
      .collect();

    // Reorder the VPK files
    let updated_vpk_mappings = self
      .vpk_manager
      .reorder_vpks(&mod_vpk_mapping, &addons_path)?;

    // Update mod data with new VPK names
    for (mut mod_entry, (_, new_vpk_names)) in ordered_mods.into_iter().zip(updated_vpk_mappings) {
      mod_entry.installed_vpks = new_vpk_names;
      self.mod_repository.add_mod(mod_entry); // This will replace the existing mod
    }

    log::info!("All mods reordered successfully");
    Ok(())
  }

  /// Reorder mods based on their remote IDs and current VPK files
  pub fn reorder_mods_by_remote_id(
    &mut self,
    mod_order_data: Vec<(String, Vec<String>, u32)>, // (remote_id, current_vpks, order)
  ) -> Result<Vec<(String, Vec<String>)>, Error> {
    let game_path = self
      .steam_manager
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?;
    let addons_path = game_path.join("game").join("citadel").join("addons");

    log::info!(
      "Reordering mods by remote ID for {} mods",
      mod_order_data.len()
    );

    // Log the input data for debugging
    for (remote_id, vpks, order) in &mod_order_data {
      log::info!(
        "Input: mod {} has order {} with VPKs: {:?}",
        remote_id,
        order,
        vpks
      );
    }

    // Sort by order
    let mut sorted_data = mod_order_data;
    sorted_data.sort_by_key(|(_, _, order)| *order);

    // Log the sorted data
    log::info!("Sorted order:");
    for (i, (remote_id, vpks, order)) in sorted_data.iter().enumerate() {
      log::info!(
        "Position {}: mod {} (order {}) with VPKs: {:?}",
        i,
        remote_id,
        order,
        vpks
      );
    }

    // Create mapping for VPK reordering: (identifier, vpk_files)
    let mod_vpk_mapping: Vec<(String, Vec<String>)> = sorted_data
      .into_iter()
      .map(|(remote_id, vpk_files, _)| (remote_id, vpk_files))
      .collect();

    // Reorder the VPK files and get the updated mappings
    let updated_mappings = self
      .vpk_manager
      .reorder_vpks(&mod_vpk_mapping, &addons_path)?;

    log::info!("Mod reordering by remote ID completed successfully");
    Ok(updated_mappings)
  }

  /// Reorder mods based on the specified order
  pub fn reorder_mods(&mut self, mod_order_data: Vec<(String, u32)>) -> Result<Vec<Mod>, Error> {
    let game_path = self
      .steam_manager
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?;
    let addons_path = game_path.join("game").join("citadel").join("addons");

    log::info!("Reordering {} mods", mod_order_data.len());

    // Sort mod order data by the specified order
    let mut sorted_order = mod_order_data;
    sorted_order.sort_by_key(|(_, order)| *order);

    // Create mapping of mod_id -> vpk_files for reordering
    let mut mod_vpk_mapping = Vec::new();
    let mut updated_mods = Vec::new();

    for (mod_id, new_order) in sorted_order {
      if let Some(mut deadlock_mod) = self.mod_repository.remove_mod(&mod_id) {
        // Update the install order
        deadlock_mod.install_order = Some(new_order);

        // Add to mapping for VPK reordering
        mod_vpk_mapping.push((mod_id.clone(), deadlock_mod.installed_vpks.clone()));
        updated_mods.push(deadlock_mod);
      } else {
        log::warn!("Mod not found in repository: {}", mod_id);
      }
    }

    // Reorder the VPK files
    let updated_vpk_mappings = self
      .vpk_manager
      .reorder_vpks(&mod_vpk_mapping, &addons_path)?;

    // Update mod data with new VPK names and re-add to repository
    let mut result_mods = Vec::new();
    for (mut deadlock_mod, (_, new_vpk_names)) in updated_mods.into_iter().zip(updated_vpk_mappings)
    {
      deadlock_mod.installed_vpks = new_vpk_names;
      self.mod_repository.add_mod(deadlock_mod.clone());
      result_mods.push(deadlock_mod);
    }

    log::info!("Successfully reordered {} mods", result_mods.len());
    Ok(result_mods)
  }

  pub fn clear_mods(&mut self) -> Result<(), Error> {
    let game_path = self
      .steam_manager
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?;
    let addons_path = game_path.join("game").join("citadel").join("addons");

    self.vpk_manager.clear_all_vpks(&addons_path)?;
    Ok(())
  }

  pub fn open_mods_folder(&self) -> Result<(), Error> {
    let game_path = self
      .steam_manager
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?;
    let addons_path = game_path.join("game").join("citadel").join("addons");
    self
      .filesystem
      .open_folder(&addons_path.to_string_lossy().to_string())
  }

  pub fn open_game_folder(&self) -> Result<(), Error> {
    let game_path = self
      .steam_manager
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?;
    self
      .filesystem
      .open_folder(&game_path.to_string_lossy().to_string())
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

  /// Get the mods store path
  pub fn get_mods_store_path(&self) -> Result<std::path::PathBuf, Error> {
    self.filesystem.get_mods_store_path()
  }

  /// Validate and canonicalize a path to ensure it's within the allowed mods directory
  fn validate_path_within_mods_root(&self, path: &PathBuf) -> Result<PathBuf, Error> {
    // Get the mods root directory and canonicalize it
    let mods_root = self.filesystem.get_mods_store_path()?;
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

  /// Remove a mod folder from the filesystem
  pub fn remove_mod_folder(&self, mod_path: &PathBuf) -> Result<(), Error> {
    log::info!("Removing mod folder: {:?}", mod_path);

    // Validate and canonicalize the path to ensure it's within the mods directory
    let validated_path = self.validate_path_within_mods_root(mod_path)?;

    if !validated_path.exists() {
      log::warn!("Mod folder does not exist: {:?}", validated_path);
      return Ok(());
    }

    self
      .filesystem
      .remove_directory_recursive(&validated_path)?;
    log::info!("Successfully removed mod folder: {:?}", validated_path);
    Ok(())
  }

  pub fn get_addons_backup_manager(&mut self) -> &mut AddonsBackupManager {
    if let Some(game_path) = self.steam_manager.get_game_path() {
      self.addons_backup_manager.set_game_path(game_path.clone());
    }
    &mut self.addons_backup_manager
  }

  pub fn set_backup_manager_app_handle(&mut self, app_handle: tauri::AppHandle) {
    self.addons_backup_manager.set_app_handle(app_handle);
  }

  pub fn open_addons_backups_folder(&mut self) -> Result<(), Error> {
    let backup_manager = self.get_addons_backup_manager();
    let backup_dir = backup_manager.get_backup_directory()?;

    self.filesystem.create_directories(&backup_dir)?;

    self
      .filesystem
      .open_folder(&backup_dir.to_string_lossy().to_string())
  }
}

impl Default for ModManager {
  fn default() -> Self {
    Self::new()
  }
}
