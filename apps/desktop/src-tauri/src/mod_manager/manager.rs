use crate::errors::Error;
use crate::mod_manager::{
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

    // Mod Installation
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

        let mod_files_path = deadlock_mod.path.join("files");

        // Clear per-mod cache
        if mod_files_path.exists() {
            log::info!("Clearing existing mod cache at: {:?}", mod_files_path);
            self.filesystem
                .remove_directory_recursive(&mod_files_path)?;
        }
        self.filesystem.create_directories(&mod_files_path)?;
        log::info!("Created mod files directory at: {:?}", mod_files_path);

        // Extract archives to temp locations first
        let mut temp_extracts = Vec::new();
        for entry in std::fs::read_dir(&deadlock_mod.path)? {
            let entry = entry?;
            let path = entry.path();

            if !self.archive_extractor.is_supported_archive(&path) {
                continue;
            }

            let temp_dir = tempfile::tempdir()?;
            log::info!("Processing archive: {:?}", path);

            self.archive_extractor
                .extract_archive(&path, temp_dir.path())?;

            temp_extracts.push(temp_dir);
        }

        // If we have file_tree info with selected files, use selective installation
        let mut selected_vpks = Vec::new();
        if let Some(file_tree) = &deadlock_mod.file_tree {
            log::info!("Using selective installation based on file tree");

            // Copy only selected files
            for temp_dir in &temp_extracts {
                let vpk_files = self
                    .filesystem
                    .find_files_recursive(temp_dir.path(), "vpk")?;

                for (vpk_path, _) in vpk_files {
                    let relative_path = vpk_path
                        .strip_prefix(temp_dir.path())
                        .unwrap_or(&vpk_path)
                        .to_string_lossy()
                        .to_string();

                    // Check if this file is selected in the file tree
                    if file_tree
                        .files
                        .iter()
                        .any(|f| f.path == relative_path && f.is_selected)
                    {
                        // Copy this VPK file to cache
                        if let Some(file_name) = vpk_path.file_name() {
                            let dest_path = mod_files_path.join(file_name);
                            std::fs::copy(&vpk_path, &dest_path)?;
                            selected_vpks.push(file_name.to_string_lossy().to_string());
                            log::info!("Selected file for installation: {:?}", file_name);
                        }
                    }
                }
            }
        } else {
            // Fallback: copy all VPKs (for backward compatibility)
            log::info!("No file tree found, installing all VPKs");
            for temp_dir in &temp_extracts {
                let mut vpks = self
                    .vpk_manager
                    .copy_vpks_from_directory(temp_dir.path(), &mod_files_path)?;
                selected_vpks.append(&mut vpks);
            }
        }

        if selected_vpks.is_empty() {
            log::error!("No VPK files selected or found in mod");
            return Err(Error::ModInvalid(
                "No VPK files selected for installation".into(),
            ));
        }

        // Install selected VPKs to game addons directory
        let addons_path = game_path.join("game").join("citadel").join("addons");
        log::info!(
            "Installing {} selected VPKs to game addons: {:?}",
            selected_vpks.len(),
            addons_path
        );
        let installed_vpks = self
            .vpk_manager
            .copy_vpks_from_directory(&mod_files_path, &addons_path)?;

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

    // Mod Uninstallation
    pub fn uninstall_mod(&mut self, mod_id: String, vpks: Vec<String>) -> Result<(), Error> {
        log::info!("Uninstalling mod: {}", mod_id);

        let game_path = self
            .steam_manager
            .get_game_path()
            .ok_or(Error::GamePathNotSet)?;
        let addons_path = game_path.join("game").join("citadel").join("addons");

        if !addons_path.exists() {
            return Err(Error::GamePathNotSet);
        }

        // Check if the mod is in memory
        if let Some(local_mod) = self.mod_repository.get_mod(&mod_id) {
            log::info!("Mod found in memory: {}", local_mod.name);
            self.vpk_manager
                .remove_vpks(&local_mod.installed_vpks, &addons_path)?;
            self.mod_repository.remove_mod(&mod_id);
        } else {
            // Just remove the vpk files from citadel/addons
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

        // Remove VPK files from game
        if let Some(local_mod) = self.mod_repository.remove_mod(&mod_id) {
            log::info!("Mod found in memory: {}", local_mod.name);
            self.vpk_manager
                .remove_vpks(&local_mod.installed_vpks, &addons_path)?;
        } else {
            self.vpk_manager.remove_vpks(&vpks, &addons_path)?;
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
        self.filesystem
            .open_folder(&addons_path.to_string_lossy().to_string())
    }

    pub fn open_game_folder(&self) -> Result<(), Error> {
        let game_path = self
            .steam_manager
            .get_game_path()
            .ok_or(Error::GamePathNotSet)?;
        self.filesystem
            .open_folder(&game_path.to_string_lossy().to_string())
    }

    pub fn open_mods_store(&self) -> Result<(), Error> {
        self.filesystem.open_mods_store()
    }
}

impl Default for ModManager {
    fn default() -> Self {
        Self::new()
    }
}
