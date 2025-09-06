use crate::errors::Error;
use crate::mod_manager::filesystem_helper::FileSystemHelper;
use log;
use std::fs;
use std::path::{Path, PathBuf};

const MODDED_SEARCH_PATHS: &str = r#"
		SearchPaths
        {  
            Game                citadel/addons
            Mod                 citadel
            Write               citadel          
            Game                citadel
            Mod                 core
            Write               core
            Game                core        
            AddonRoot           citadel_addons
    		OfficialAddonRoot   citadel_community_addons
        }"#;

const VANILLA_SEARCH_PATHS: &str = r#"
		SearchPaths
        {  
            Game                citadel
            Write               citadel          
            Game                citadel
            Write               core
            Game                core        
        }"#;

/// Manages game configuration files and mod setup
pub struct GameConfigManager {
    filesystem: FileSystemHelper,
    game_setup: bool,
}

impl GameConfigManager {
    pub fn new() -> Self {
        Self {
            filesystem: FileSystemHelper::new(),
            game_setup: false,
        }
    }

    /// Setup the game for mods by creating necessary directories and modifying config
    pub fn setup_game_for_mods(&mut self, game_path: &Path) -> Result<(), Error> {
        if self.game_setup {
            log::info!("Game already setup");
            return Ok(());
        }

        // Create mods directory: game_path/game/citadel/addons/
        let addons_path = game_path.join("game").join("citadel").join("addons");
        self.filesystem.create_directories(&addons_path)?;
        log::info!("Created addons directory: {:?}", addons_path);

        // Modify gameinfo.gi to enable mod loading
        let gameinfo_path = game_path.join("game").join("citadel").join("gameinfo.gi");
        self.modify_search_paths(&gameinfo_path, false)?;

        // Mark game as setup
        self.game_setup = true;
        log::info!("Game setup for mods completed");

        Ok(())
    }

    /// Toggle between modded and vanilla game configuration
    pub fn toggle_mods(&self, game_path: &Path, vanilla: bool) -> Result<(), Error> {
        let gameinfo_path = game_path.join("game").join("citadel").join("gameinfo.gi");
        self.modify_search_paths(&gameinfo_path, vanilla)?;

        if vanilla {
            log::info!("Game configured for vanilla mode");
        } else {
            log::info!("Game configured for modded mode");
        }

        Ok(())
    }

    /// Modify the search paths in gameinfo.gi
    pub fn modify_search_paths(&self, gameinfo_path: &Path, vanilla: bool) -> Result<(), Error> {
        log::info!(
            "Modifying search paths for gameinfo.gi: {:?}",
            gameinfo_path
        );

        if !gameinfo_path.exists() {
            return Err(Error::GameConfigParse(
                "gameinfo.gi file not found".to_string(),
            ));
        }

        // Read gameinfo.gi
        let gameinfo_content = fs::read_to_string(gameinfo_path)?;

        // Backup gameinfo.gi to gameinfo.gi.bak
        let backup_path = gameinfo_path.with_extension("gi.bak");
        if !backup_path.exists() {
            log::info!("Creating backup: {:?}", backup_path);
            fs::copy(gameinfo_path, &backup_path)?;
        }

        // Find the SearchPaths section
        let search_paths_start = gameinfo_content
            .find("SearchPaths")
            .ok_or_else(|| Error::GameConfigParse("SearchPaths section not found".into()))?;

        let relative_end = gameinfo_content[search_paths_start..]
            .find('}')
            .ok_or_else(|| {
                Error::GameConfigParse("Could not find end of SearchPaths section".into())
            })?;

        let search_paths_end = search_paths_start + relative_end + 1;
        let search_paths_section = &gameinfo_content[search_paths_start - 1..search_paths_end];

        // Use the appropriate search paths based on vanilla flag
        let new_search_paths_section = if vanilla {
            VANILLA_SEARCH_PATHS
        } else {
            MODDED_SEARCH_PATHS
        };

        // Replace the old search paths section with the new one
        let new_gameinfo_content =
            gameinfo_content.replace(search_paths_section, new_search_paths_section);

        log::info!("Writing updated gameinfo.gi: {:?}", gameinfo_path);
        log::debug!("> New search paths section: {:?}", new_search_paths_section);
        fs::write(gameinfo_path, new_gameinfo_content)?;

        Ok(())
    }

    /// Restore the original gameinfo.gi from backup
    pub fn restore_original_config(&self, game_path: &Path) -> Result<(), Error> {
        let gameinfo_path = game_path.join("game").join("citadel").join("gameinfo.gi");
        let backup_path = gameinfo_path.with_extension("gi.bak");

        if backup_path.exists() {
            log::info!("Restoring original gameinfo.gi from backup");
            fs::copy(&backup_path, &gameinfo_path)?;
            Ok(())
        } else {
            Err(Error::GameConfigParse(
                "No backup file found to restore from".to_string(),
            ))
        }
    }

    /// Check if the game has been set up for mods
    pub fn is_game_setup(&self) -> bool {
        self.game_setup
    }

    /// Force mark game as setup (useful when loading state)
    pub fn mark_game_as_setup(&mut self) {
        self.game_setup = true;
    }

    /// Check if a backup of the original gameinfo.gi exists
    pub fn has_config_backup(&self, game_path: &Path) -> bool {
        let backup_path = game_path
            .join("game")
            .join("citadel")
            .join("gameinfo.gi.bak");
        backup_path.exists()
    }

    /// Get the paths for game configuration files
    pub fn get_config_paths(&self, game_path: &Path) -> GameConfigPaths {
        let base_path = game_path.join("game").join("citadel");

        GameConfigPaths {
            gameinfo: base_path.join("gameinfo.gi"),
            gameinfo_backup: base_path.join("gameinfo.gi.bak"),
            addons_dir: base_path.join("addons"),
        }
    }

    /// Validate that all required game files exist for mod installation
    pub fn validate_game_files(&self, game_path: &Path) -> Result<(), Error> {
        let config_paths = self.get_config_paths(game_path);

        if !config_paths.gameinfo.exists() {
            return Err(Error::GameConfigParse(
                "gameinfo.gi not found. Make sure Deadlock is properly installed.".to_string(),
            ));
        }

        let citadel_dir = game_path.join("game").join("citadel");
        if !citadel_dir.exists() {
            return Err(Error::GameConfigParse(
                "Citadel game directory not found. Make sure Deadlock is properly installed."
                    .to_string(),
            ));
        }

        Ok(())
    }
}

/// Paths for important game configuration files
#[derive(Debug, Clone)]
pub struct GameConfigPaths {
    pub gameinfo: PathBuf,
    pub gameinfo_backup: PathBuf,
    pub addons_dir: PathBuf,
}

impl Default for GameConfigManager {
    fn default() -> Self {
        Self::new()
    }
}
