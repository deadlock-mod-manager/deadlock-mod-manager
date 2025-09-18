use crate::errors::Error;
use crate::mod_manager::{
  addons_manager::AddonsManager,
  archive_extractor::ArchiveExtractor,
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
use tempfile;

/// Main orchestrator for mod management operations
pub struct ModManager {
  // Component instances
  steam_manager: SteamManager,
  process_manager: GameProcessManager,
  config_manager: GameConfigManager,
  archive_extractor: ArchiveExtractor,
  vpk_manager: VpkManager,
  addons_manager: AddonsManager,
  file_tree_analyzer: FileTreeAnalyzer,
  filesystem: FileSystemHelper,
  mod_repository: ModRepository,
}

impl ModManager {
  pub fn new() -> Self {
    let mut manager = Self {
      steam_manager: SteamManager::new(),
      process_manager: GameProcessManager::new(),
      config_manager: GameConfigManager::new(),
      archive_extractor: ArchiveExtractor::new(),
      vpk_manager: VpkManager::new(),
      addons_manager: AddonsManager::new(),
      file_tree_analyzer: FileTreeAnalyzer::new(),
      filesystem: FileSystemHelper::new(),
      mod_repository: ModRepository::new(),
    };

    // Try to find the game path on initialization
    if let Err(e) = manager.find_game() {
      log::warn!("Failed to find game path during initialization: {:?}", e);
    }

    manager
  }

  // Steam and Game Detection
  pub fn find_steam(&mut self) -> Result<(), Error> {
    self.steam_manager.find_steam()?;
    Ok(())
  }

  pub fn find_game(&mut self) -> Result<PathBuf, Error> {
    let game_path = self.steam_manager.find_game()?.clone();
    Ok(game_path)
  }

  // Game Process Management
  pub fn check_if_game_running(&mut self) -> Result<(), Error> {
    self.process_manager.ensure_game_not_running()
  }

  pub fn is_game_running(&mut self) -> Result<bool, Error> {
    self.process_manager.is_game_running()
  }

  pub fn stop_game(&mut self) -> Result<(), Error> {
    self.process_manager.stop_game()
  }

  // Game Configuration
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

    if vanilla {
      self.clear_mods()?;
    }

    Ok(())
  }

  // Game Launch
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

  // File Tree Analysis
  pub fn get_mod_file_tree(&self, mod_path: &PathBuf) -> Result<ModFileTree, Error> {
    self.file_tree_analyzer.get_mod_file_tree(mod_path)
  }

  // Mod Installation using addons system - extract directly to addons folder
  pub fn install_mod(&mut self, mut deadlock_mod: Mod) -> Result<Mod, Error> {
    log::info!("Starting installation of mod: {}", deadlock_mod.name);

    if !deadlock_mod.path.exists() {
      return Err(Error::ModFileNotFound);
    }

    if !self.config_manager.is_game_setup() {
      log::info!("Setting up game for mods...");
      self.setup_game_for_mods()?;
    }

    let game_path = self
      .steam_manager
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?;

    // Extract archives to temporary location first
    let mut temp_extracts = Vec::new();
    for entry in std::fs::read_dir(&deadlock_mod.path)? {
      let entry = entry?;
      let path = entry.path();

      if !self.archive_extractor.is_supported_archive(&path) {
        continue;
      }

      let temp_dir = tempfile::tempdir()?;
      log::info!("Processing archive: {:?}", path);

      self
        .archive_extractor
        .extract_archive(&path, temp_dir.path())?;

      temp_extracts.push(temp_dir);
    }

    // Find all VPK files in extracted archives
    let mut vpk_paths = Vec::new();
    for temp_dir in &temp_extracts {
      let vpk_files = self
        .filesystem
        .find_files_recursive(temp_dir.path(), "vpk")?;

      for (vpk_path, _) in vpk_files {
        vpk_paths.push(vpk_path.clone());
        log::info!("Found VPK file: {:?}", vpk_path);
      }
    }

    if vpk_paths.is_empty() {
      log::error!("No VPK files found in mod archives");
      return Err(Error::ModInvalid(
        "No VPK files found for installation".into(),
      ));
    }

    // Install mod using addons system (initially disabled)
    log::info!(
      "Installing {} VPKs to addons folder (disabled): {:?}",
      vpk_paths.len(),
      self.addons_manager.get_addons_path(&game_path)
    );
    
    let installed_vpks = self.addons_manager.install_mod(
      &deadlock_mod.id,
      &deadlock_mod.name,
      &vpk_paths,
      &game_path,
    )?;

    deadlock_mod.installed_vpks = installed_vpks;

    // Store the selected file tree for display purposes
    if let Some(file_tree) = &deadlock_mod.file_tree {
      let selected_files: Vec<_> = file_tree
        .files
        .iter()
        .filter(|f| f.is_selected)
        .cloned()
        .collect();

      deadlock_mod.file_tree = Some(ModFileTree {
        files: selected_files.clone(),
        total_files: selected_files.len(),
        has_multiple_files: selected_files.len() > 1,
      });

      log::info!(
        "Stored selected file tree: {} files selected",
        selected_files.len()
      );
    }

    log::info!("Adding mod to managed mods list");
    self.mod_repository.add_mod(deadlock_mod.clone());

    log::info!("Mod installation completed successfully");
    Ok(deadlock_mod)
  }

  // Mod Activation/Deactivation
  pub fn activate_mod(&mut self, mod_id: &str, mod_name: &str, vpks: &[String]) -> Result<(), Error> {
    log::info!("Activating mod: {}", mod_name);

    let game_path = self
      .steam_manager
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?;

    self.addons_manager.activate_mod(mod_id, mod_name, vpks, &game_path)?;
    Ok(())
  }

  pub fn deactivate_mod(&mut self, mod_id: &str, mod_name: &str, vpks: &[String]) -> Result<(), Error> {
    log::info!("Deactivating mod: {}", mod_name);

    let game_path = self
      .steam_manager
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?;

    self.addons_manager.deactivate_mod(mod_id, mod_name, vpks, &game_path)?;
    Ok(())
  }

  // Mod Uninstallation using addons system
  pub fn uninstall_mod(&mut self, mod_id: String, vpks: Vec<String>) -> Result<(), Error> {
    log::info!("Uninstalling mod: {}", mod_id);

    let game_path = self
      .steam_manager
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?;

    // Get mod name from repository if available
    let mod_name = if let Some(local_mod) = self.mod_repository.get_mod(&mod_id) {
      local_mod.name.clone()
    } else {
      // Fallback: try to extract from VPK names
      if let Some(first_vpk) = vpks.first() {
        // Extract mod name from VPK name (e.g., "_ModName_pak01_dir.vpk" -> "ModName")
        first_vpk
          .strip_prefix("_")
          .and_then(|s| s.split("_pak").next())
          .unwrap_or("Unknown")
          .to_string()
      } else {
        "Unknown".to_string()
      }
    };

    // Remove mod using addons system
    self.addons_manager.remove_mod(&mod_id, &mod_name, &vpks, &game_path)?;

    // Remove from repository
    self.mod_repository.remove_mod(&mod_id);

    Ok(())
  }

  pub fn purge_mod(&mut self, mod_id: String, vpks: Vec<String>) -> Result<(), Error> {
    log::info!("Purging mod: {}", mod_id);

    let game_path = self
      .steam_manager
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?;

    // Get mod name from repository if available
    let mod_name = if let Some(local_mod) = self.mod_repository.get_mod(&mod_id) {
      local_mod.name.clone()
    } else {
      // Fallback: try to extract from VPK names
      if let Some(first_vpk) = vpks.first() {
        // Extract mod name from VPK name (e.g., "_ModName_pak01_dir.vpk" -> "ModName")
        first_vpk
          .strip_prefix("_")
          .and_then(|s| s.split("_pak").next())
          .unwrap_or("Unknown")
          .to_string()
      } else {
        "Unknown".to_string()
      }
    };

    // Remove mod using addons system
    self.addons_manager.remove_mod(&mod_id, &mod_name, &vpks, &game_path)?;

    // Remove from repository
    self.mod_repository.remove_mod(&mod_id);

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

  // Mod Management
  pub fn clear_mods(&mut self) -> Result<(), Error> {
    let game_path = self
      .steam_manager
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?;
    let addons_path = game_path.join("game").join("citadel").join("addons");

    self.vpk_manager.clear_all_vpks(&addons_path)?;
    Ok(())
  }

  // Folder Operations
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

  pub fn open_mods_store(&self) -> Result<(), Error> {
    self.filesystem.open_mods_store()
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

  // Addons System Methods
  /// Get all installed mods from the addons system
  pub fn get_installed_mods_from_addons(&self) -> Result<Vec<crate::mod_manager::addons_manager::ModCatalogEntry>, Error> {
    let game_path = self
      .steam_manager
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?;

    self.addons_manager.get_installed_mods(&game_path)
  }

  /// Get active mods from the addons system
  pub fn get_active_mods_from_addons(&self) -> Result<Vec<crate::mod_manager::addons_manager::ActiveMod>, Error> {
    let game_path = self
      .steam_manager
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?;

    self.addons_manager.get_active_mods(&game_path)
  }
}

impl Default for ModManager {
  fn default() -> Self {
    Self::new()
  }
}
