use crate::errors::Error;
use crate::mod_manager::filesystem_helper::FileSystemHelper;
use crate::utils;
use log;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const MODDED_SEARCH_PATHS: &str = r#"
		SearchPaths
        {  
            Game_Language       citadel_*LANGUAGE*
            Game                citadel/addons
            Mod                 citadel
            Write               citadel          
            Game                citadel
            Mod                 core
            Write               core
            Game                core        
        }"#;

const VANILLA_SEARCH_PATHS: &str = r#"
		SearchPaths
        {  
            Game_Language       citadel_*LANGUAGE*
            Game                citadel
            Write               citadel          
            Game                citadel
            Write               core
            Game                core        
        }"#;

const MOD_MANAGER_MARKER_START: &str = "// Deadlock Mod Manager - Start";
const MOD_MANAGER_MARKER_END: &str = "// Deadlock Mod Manager - End";

/// Backup metadata for gameinfo.gi files
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameInfoBackup {
  pub original_hash: String,
  pub backup_path: PathBuf,
  pub created_at: u64,
  pub file_size: u64,
  pub is_vanilla: bool,
}

/// Status of gameinfo.gi file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameInfoStatus {
  pub current_hash: String,
  pub is_modified_by_mod_manager: bool,
  pub is_modified_externally: bool,
  pub backup_exists: bool,
  pub backup_valid: bool,
  pub syntax_valid: bool,
  pub has_mod_paths: bool,
}

/// Validation result for gameinfo.gi
#[derive(Debug, Clone)]
pub struct GameInfoValidation {
  pub is_valid: bool,
  pub errors: Vec<String>,
  pub warnings: Vec<String>,
  pub search_paths_found: bool,
  pub has_required_sections: bool,
}

/// Manages game configuration files and mod setup
pub struct GameConfigManager {
  filesystem: FileSystemHelper,
  game_setup: bool,
  backups: HashMap<PathBuf, GameInfoBackup>,
}

impl GameConfigManager {
  pub fn new() -> Self {
    Self {
      filesystem: FileSystemHelper::new(),
      game_setup: false,
      backups: HashMap::new(),
    }
  }

  /// Calculate SHA-256 hash of a file
  fn calculate_file_hash(&self, file_path: &Path) -> Result<String, Error> {
    use sha2::{Digest, Sha256};

    let content = fs::read(file_path)?;
    let mut hasher = Sha256::new();
    hasher.update(&content);
    let result = hasher.finalize();
    Ok(format!("{:x}", result))
  }

  /// Get current Unix timestamp
  fn current_timestamp(&self) -> u64 {
    SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .unwrap_or_default()
      .as_secs()
  }

  /// Check if content contains mod manager markers
  fn has_mod_manager_markers(&self, content: &str) -> bool {
    content.contains(MOD_MANAGER_MARKER_START) && content.contains(MOD_MANAGER_MARKER_END)
  }

  fn ensure_game_language_search_path(search_paths: &str) -> String {
    if search_paths.contains("Game_Language") {
      return search_paths.to_string();
    }

    if !search_paths.contains("{") {
      let excerpt = search_paths.chars().take(120).collect::<String>();
      log::debug!(
        "Skipping Game_Language injection: search_paths.replacen(\"{{\", ...) found no insertion point. excerpt={excerpt:?}"
      );
      return search_paths.to_string();
    }

    search_paths.replacen(
      "{",
      "{  \n            Game_Language       citadel_*LANGUAGE*",
      1,
    )
  }

  /// Validate gameinfo.gi syntax and structure
  pub fn validate_gameinfo_syntax(
    &self,
    gameinfo_path: &Path,
  ) -> Result<GameInfoValidation, Error> {
    if !gameinfo_path.exists() {
      return Ok(GameInfoValidation {
        is_valid: false,
        errors: vec!["gameinfo.gi file not found".to_string()],
        warnings: vec![],
        search_paths_found: false,
        has_required_sections: false,
      });
    }

    let content = fs::read_to_string(gameinfo_path)?;
    let mut validation = GameInfoValidation {
      is_valid: true,
      errors: vec![],
      warnings: vec![],
      search_paths_found: false,
      has_required_sections: false,
    };

    // Check for SearchPaths section
    if content.contains("SearchPaths") {
      validation.search_paths_found = true;
    } else {
      validation.is_valid = false;
      validation
        .errors
        .push("SearchPaths section not found".to_string());
    }

    // Check for proper brace matching in SearchPaths
    if let Some(start) = content.find("SearchPaths") {
      let remaining = &content[start..];
      if let Some(open_brace) = remaining.find('{') {
        if remaining[open_brace + 1..].find('}').is_some() {
          validation.has_required_sections = true;
        } else {
          validation.is_valid = false;
          validation
            .errors
            .push("SearchPaths section is not properly closed with '}'".to_string());
        }
      } else {
        validation.is_valid = false;
        validation
          .errors
          .push("SearchPaths section missing opening brace '{'".to_string());
      }
    }

    // Check for required game entries
    let required_entries = ["Game", "citadel"];
    for entry in &required_entries {
      if !content.contains(entry) {
        validation
          .warnings
          .push(format!("Missing recommended entry: {entry}"));
      }
    }

    // Check for external modifications
    if self.has_mod_manager_markers(&content) {
      validation
        .warnings
        .push("File was previously modified by mod manager".to_string());
    }

    Ok(validation)
  }

  /// Get the current status of gameinfo.gi
  pub fn get_gameinfo_status(&mut self, game_path: &Path) -> Result<GameInfoStatus, Error> {
    let gameinfo_path = game_path.join("game").join("citadel").join("gameinfo.gi");

    if !gameinfo_path.exists() {
      return Err(Error::GameConfigParse(
        "gameinfo.gi file not found".to_string(),
      ));
    }

    let current_hash = self.calculate_file_hash(&gameinfo_path)?;
    let content = fs::read_to_string(&gameinfo_path)?;

    // Check if backup exists
    let backup_path = gameinfo_path.with_extension("gi.bak");
    let backup_exists = backup_path.exists();
    let mut backup_valid = false;

    if backup_exists && let Ok(backup_hash) = self.calculate_file_hash(&backup_path) {
      if let Some(backup_info) = self.backups.get(&gameinfo_path) {
        backup_valid = backup_info.original_hash == backup_hash;
      } else {
        // Load backup info if not in memory
        backup_valid = true; // Assume valid if we can read it
      }
    }

    // Check for external modifications
    let is_modified_by_mod_manager = self.has_mod_manager_markers(&content);
    let has_mod_paths = content.contains("citadel/addons");

    // Check if file was modified externally
    let mut is_modified_externally = false;
    if let Some(backup_info) = self.backups.get(&gameinfo_path)
      && backup_info.original_hash != current_hash
      && !is_modified_by_mod_manager
    {
      is_modified_externally = true;
    }

    // Validate syntax
    let validation = self.validate_gameinfo_syntax(&gameinfo_path)?;

    Ok(GameInfoStatus {
      current_hash,
      is_modified_by_mod_manager,
      is_modified_externally,
      backup_exists,
      backup_valid,
      syntax_valid: validation.is_valid,
      has_mod_paths,
    })
  }

  /// Create a backup of gameinfo.gi if none exists
  pub fn backup_gameinfo(&mut self, game_path: &Path) -> Result<(), Error> {
    let gameinfo_path = game_path.join("game").join("citadel").join("gameinfo.gi");
    let backup_path = gameinfo_path.with_extension("gi.bak");

    if !gameinfo_path.exists() {
      return Err(Error::GameConfigParse(
        "gameinfo.gi file not found".to_string(),
      ));
    }

    // Don't overwrite existing backups
    if backup_path.exists() {
      log::info!("Backup already exists at {backup_path:?}");
      return Ok(());
    }

    // Validate the file before backing it up
    let validation = self.validate_gameinfo_syntax(&gameinfo_path)?;
    if !validation.is_valid {
      log::warn!(
        "Backing up potentially invalid gameinfo.gi: {:?}",
        validation.errors
      );
    }

    // Create backup
    log::info!("Creating backup: {backup_path:?}");
    fs::copy(&gameinfo_path, &backup_path)?;

    // Preserve file permissions and metadata
    #[cfg(unix)]
    {
      let metadata = fs::metadata(&gameinfo_path)?;
      let permissions = metadata.permissions();
      fs::set_permissions(&backup_path, permissions)?;
    }

    // Calculate hash and store backup metadata
    let original_hash = self.calculate_file_hash(&gameinfo_path)?;
    let file_size = fs::metadata(&gameinfo_path)?.len();
    let content = fs::read_to_string(&gameinfo_path)?;
    let is_vanilla = !content.contains("citadel/addons") && !self.has_mod_manager_markers(&content);

    let backup_info = GameInfoBackup {
      original_hash: original_hash.clone(),
      backup_path: backup_path.clone(),
      created_at: self.current_timestamp(),
      file_size,
      is_vanilla,
    };

    self.backups.insert(gameinfo_path, backup_info);
    log::info!("Backup created successfully with hash: {original_hash}");

    Ok(())
  }

  /// Restore gameinfo.gi from backup
  pub fn restore_gameinfo_backup(&mut self, game_path: &Path) -> Result<(), Error> {
    let gameinfo_path = game_path.join("game").join("citadel").join("gameinfo.gi");
    let backup_path = gameinfo_path.with_extension("gi.bak");

    if !backup_path.exists() {
      return Err(Error::GameConfigParse(
        "No backup file found to restore from".to_string(),
      ));
    }

    // Validate backup integrity
    if let Some(backup_info) = self.backups.get(&gameinfo_path) {
      let backup_hash = self.calculate_file_hash(&backup_path)?;
      if backup_hash != backup_info.original_hash {
        log::warn!("Backup integrity check failed. Hash mismatch!");
        return Err(Error::GameConfigParse(
          "Backup file integrity check failed".to_string(),
        ));
      }
    }

    // Validate backup syntax before restoring
    let validation = self.validate_gameinfo_syntax(&backup_path)?;
    if !validation.is_valid {
      log::error!("Backup file is invalid: {:?}", validation.errors);
      return Err(Error::GameConfigParse(format!(
        "Backup file validation failed: {}",
        validation.errors.join(", ")
      )));
    }

    log::info!("Restoring gameinfo.gi from backup: {backup_path:?}");
    fs::copy(&backup_path, &gameinfo_path)?;

    // Verify restoration
    let restored_hash = self.calculate_file_hash(&gameinfo_path)?;
    if let Some(backup_info) = self.backups.get(&gameinfo_path)
      && restored_hash != backup_info.original_hash
    {
      log::error!("Restoration failed. File hash doesn't match backup.");
      return Err(Error::GameConfigParse(
        "File restoration verification failed".to_string(),
      ));
    }

    log::info!("gameinfo.gi restored successfully from backup");
    Ok(())
  }

  /// Apply vanilla gameinfo.gi content to the game
  pub fn apply_vanilla_gameinfo(
    &mut self,
    game_path: &Path,
    vanilla_content: String,
  ) -> Result<(), Error> {
    log::info!("Applying vanilla gameinfo.gi content");

    let gameinfo_path = game_path.join("game").join("citadel").join("gameinfo.gi");

    // Validate the downloaded content
    let temp_path = gameinfo_path.with_extension("gi.tmp");
    fs::write(&temp_path, &vanilla_content)?;

    let validation = self.validate_gameinfo_syntax(&temp_path)?;
    fs::remove_file(&temp_path)?;

    if !validation.is_valid {
      log::warn!(
        "Downloaded vanilla gameinfo.gi has syntax issues: {:?}",
        validation.errors
      );
      // Fall back to backup restore
      return self.reset_to_vanilla_fallback(game_path);
    }

    // Create backup of current file before replacing
    if gameinfo_path.exists() {
      let backup_path = gameinfo_path.with_extension("gi.bak");
      if !backup_path.exists() {
        fs::copy(&gameinfo_path, &backup_path)?;
        log::info!("Created backup before vanilla reset: {backup_path:?}");
      }
    }

    // Write the vanilla content
    fs::write(&gameinfo_path, vanilla_content)?;
    log::info!("Successfully replaced gameinfo.gi with vanilla version");

    // Validate the result
    let status = self.get_gameinfo_status(game_path)?;
    if status.has_mod_paths {
      log::warn!("Warning: File may still contain mod paths after reset");
    }

    if !status.syntax_valid {
      return Err(Error::GameConfigParse(
        "Reset resulted in invalid gameinfo.gi".to_string(),
      ));
    }

    log::info!("Successfully applied vanilla gameinfo.gi");
    Ok(())
  }

  /// Fallback method to reset to vanilla using backup restore
  pub fn reset_to_vanilla_fallback(&mut self, game_path: &Path) -> Result<(), Error> {
    log::info!("Using fallback method to reset to vanilla state");

    // First try to restore from backup
    if let Err(e) = self.restore_gameinfo_backup(game_path) {
      log::warn!("Failed to restore from backup: {e}");
      // If backup restore fails, try to clean current file
      self.toggle_mods(game_path, true)?;
    }

    // Validate the result
    let status = self.get_gameinfo_status(game_path)?;
    if status.has_mod_paths {
      log::warn!("Warning: File may still contain mod paths after reset");
    }

    if !status.syntax_valid {
      return Err(Error::GameConfigParse(
        "Reset resulted in invalid gameinfo.gi".to_string(),
      ));
    }

    log::info!("Successfully reset to vanilla state using fallback method");
    Ok(())
  }

  /// Validate that the current patch was applied correctly
  pub fn validate_gameinfo_patch(
    &self,
    game_path: &Path,
    expected_vanilla: bool,
  ) -> Result<(), Error> {
    let gameinfo_path = game_path.join("game").join("citadel").join("gameinfo.gi");

    if !gameinfo_path.exists() {
      return Err(Error::GameConfigParse(
        "gameinfo.gi file not found".to_string(),
      ));
    }

    let content = fs::read_to_string(&gameinfo_path)?;
    let has_mod_paths = content.contains("citadel/addons");
    let has_markers = self.has_mod_manager_markers(&content);

    // Validate syntax
    let validation = self.validate_gameinfo_syntax(&gameinfo_path)?;
    if !validation.is_valid {
      return Err(Error::GameConfigParse(format!(
        "gameinfo.gi validation failed: {}",
        validation.errors.join(", ")
      )));
    }

    // Check if the patch state matches expectations
    if expected_vanilla && has_mod_paths {
      return Err(Error::GameConfigParse(
        "File should be in vanilla state but contains mod paths".to_string(),
      ));
    }

    if !expected_vanilla && !has_mod_paths {
      return Err(Error::GameConfigParse(
        "File should contain mod paths but appears to be vanilla".to_string(),
      ));
    }

    // Check for mod manager markers in modded state
    if !expected_vanilla && !has_markers {
      log::warn!("File is modded but missing mod manager tracking markers");
    }

    log::info!("gameinfo.gi patch validation successful (vanilla: {expected_vanilla})");
    Ok(())
  }

  /// Open gameinfo.gi file with the system's default editor
  pub fn open_gameinfo_with_editor(&self, game_path: &Path) -> Result<(), Error> {
    let gameinfo_path = game_path.join("game").join("citadel").join("gameinfo.gi");

    if !gameinfo_path.exists() {
      return Err(Error::GameConfigParse(
        "gameinfo.gi file not found".to_string(),
      ));
    }

    log::info!("Opening gameinfo.gi with system editor: {gameinfo_path:?}");
    utils::open_file_with_editor(gameinfo_path.to_string_lossy().as_ref())?;

    Ok(())
  }

  /// Setup the game for mods by creating necessary directories and modifying config
  pub fn setup_game_for_mods(&mut self, game_path: &Path) -> Result<(), Error> {
    if self.game_setup {
      log::info!("Game already setup");
      return Ok(());
    }

    log::info!("Setting up game for mods at: {game_path:?}");

    // Validate game files first
    self.validate_game_files(game_path)?;

    // Create backup before any modifications
    if let Err(e) = self.backup_gameinfo(game_path) {
      log::warn!("Failed to create backup: {e}");
      // Continue anyway, but log the warning
    }

    // Create mods directory: game_path/game/citadel/addons/
    let addons_path = game_path.join("game").join("citadel").join("addons");
    self.filesystem.create_directories(&addons_path)?;
    log::info!("Created addons directory: {addons_path:?}");

    // Setup replays symlink to ensure replays are saved consistently
    if let Err(e) = self.setup_replays_symlink(game_path) {
      log::warn!("Failed to setup replays symlink: {e}");
      // Continue anyway - this is not critical for mod functionality
    }

    // Modify gameinfo.gi to enable mod loading
    let gameinfo_path = game_path.join("game").join("citadel").join("gameinfo.gi");
    self.modify_search_paths(&gameinfo_path, false)?;

    // Validate the patch was applied correctly
    if let Err(e) = self.validate_gameinfo_patch(game_path, false) {
      log::error!("Mod setup validation failed: {e}");
      // Try to restore backup on failure
      if let Err(restore_err) = self.restore_gameinfo_backup(game_path) {
        log::error!("Failed to restore backup after failed setup: {restore_err}");
      }
      return Err(e);
    }

    // Mark game as setup
    self.game_setup = true;
    log::info!("Game setup for mods completed successfully");

    Ok(())
  }

  /// Toggle between modded and vanilla game configuration
  pub fn toggle_mods(&self, game_path: &Path, vanilla: bool) -> Result<(), Error> {
    log::info!("Toggling mods: vanilla={vanilla}");

    let gameinfo_path = game_path.join("game").join("citadel").join("gameinfo.gi");

    // Validate file exists and syntax before modification
    let validation = self.validate_gameinfo_syntax(&gameinfo_path)?;
    if !validation.is_valid {
      log::error!("Cannot modify invalid gameinfo.gi: {:?}", validation.errors);
      return Err(Error::GameConfigParse(format!(
        "gameinfo.gi validation failed: {}",
        validation.errors.join(", ")
      )));
    }

    self.modify_search_paths(&gameinfo_path, vanilla)?;

    // Validate the changes were applied correctly
    if let Err(e) = self.validate_gameinfo_patch(game_path, vanilla) {
      log::error!("Toggle validation failed: {e}");
      return Err(e);
    }

    if vanilla {
      log::info!("Game configured for vanilla mode");
    } else {
      log::info!("Game configured for modded mode");
    }

    Ok(())
  }

  /// Modify the search paths in gameinfo.gi
  pub fn modify_search_paths(&self, gameinfo_path: &Path, vanilla: bool) -> Result<(), Error> {
    log::info!("Modifying search paths for gameinfo.gi: {gameinfo_path:?} (vanilla: {vanilla})");

    if !gameinfo_path.exists() {
      return Err(Error::GameConfigParse(
        "gameinfo.gi file not found".to_string(),
      ));
    }

    // Read and validate current file
    let gameinfo_content = fs::read_to_string(gameinfo_path)?;
    let validation = self.validate_gameinfo_syntax(gameinfo_path)?;

    if !validation.is_valid {
      log::warn!(
        "Modifying potentially invalid gameinfo.gi: {:?}",
        validation.errors
      );
    }

    // Create backup if it doesn't exist
    let backup_path = gameinfo_path.with_extension("gi.bak");
    if !backup_path.exists() {
      log::info!("Creating backup: {backup_path:?}");
      fs::copy(gameinfo_path, &backup_path)?;
    }

    // Find what section to replace based on whether markers exist
    let (section_start, section_end, _section_content) =
      if gameinfo_content.contains(MOD_MANAGER_MARKER_START) {
        // If markers exist, replace the entire marked section
        let marker_start = gameinfo_content
          .find(MOD_MANAGER_MARKER_START)
          .ok_or_else(|| Error::GameConfigParse("Mod manager start marker not found".into()))?;
        let marker_end_pos = gameinfo_content
          .find(MOD_MANAGER_MARKER_END)
          .ok_or_else(|| Error::GameConfigParse("Mod manager end marker not found".into()))?;
        let marker_end = marker_end_pos + MOD_MANAGER_MARKER_END.len();

        // Find the actual start (include preceding whitespace/newline)
        let actual_start =
          if marker_start > 0 && gameinfo_content.chars().nth(marker_start - 1) == Some('\n') {
            marker_start - 1
          } else {
            marker_start
          };

        (
          actual_start,
          marker_end,
          &gameinfo_content[actual_start..marker_end],
        )
      } else {
        // No markers, find and replace just the SearchPaths section
        let search_paths_start = gameinfo_content
          .find("SearchPaths")
          .ok_or_else(|| Error::GameConfigParse("SearchPaths section not found".into()))?;

        let relative_end = gameinfo_content[search_paths_start..]
          .find('}')
          .ok_or_else(|| {
            Error::GameConfigParse("Could not find end of SearchPaths section".into())
          })?;

        let search_paths_end = search_paths_start + relative_end + 1;

        // Include the tab/whitespace before SearchPaths
        let section_start = if search_paths_start > 0
          && gameinfo_content.chars().nth(search_paths_start - 1) == Some('\t')
        {
          search_paths_start - 1
        } else {
          search_paths_start
        };

        (
          section_start,
          search_paths_end,
          &gameinfo_content[section_start..search_paths_end],
        )
      };

    // Use the appropriate search paths based on vanilla flag
    let base_search_paths = if vanilla {
      VANILLA_SEARCH_PATHS
    } else {
      MODDED_SEARCH_PATHS
    };
    let base_search_paths = Self::ensure_game_language_search_path(base_search_paths);

    // Create the replacement content
    let replacement_content = if vanilla {
      base_search_paths
    } else {
      format!("\n{MOD_MANAGER_MARKER_START}\n{base_search_paths}\n{MOD_MANAGER_MARKER_END}")
    };

    // Replace the identified section with the new content
    let mut new_gameinfo_content = gameinfo_content.clone();
    new_gameinfo_content.replace_range(section_start..section_end, &replacement_content);

    // Validate the new content before writing
    let temp_path = gameinfo_path.with_extension("gi.tmp");
    fs::write(&temp_path, &new_gameinfo_content)?;

    let temp_validation = self.validate_gameinfo_syntax(&temp_path)?;
    fs::remove_file(&temp_path)?;

    if !temp_validation.is_valid {
      log::error!("Generated content is invalid: {:?}", temp_validation.errors);
      return Err(Error::GameConfigParse(format!(
        "Generated gameinfo.gi would be invalid: {}",
        temp_validation.errors.join(", ")
      )));
    }

    log::info!("Writing updated gameinfo.gi: {gameinfo_path:?}");
    log::debug!("Replacement content: {replacement_content}");

    // Write the new content
    fs::write(gameinfo_path, &new_gameinfo_content)?;

    // Final validation
    let final_validation = self.validate_gameinfo_syntax(gameinfo_path)?;
    if !final_validation.is_valid {
      log::error!("Final validation failed: {:?}", final_validation.errors);

      // Try to restore backup
      if backup_path.exists() {
        log::info!("Restoring backup due to validation failure");
        fs::copy(&backup_path, gameinfo_path)?;
      }

      return Err(Error::GameConfigParse(format!(
        "Final validation failed: {}",
        final_validation.errors.join(", ")
      )));
    }

    log::info!("Successfully modified search paths (vanilla: {vanilla})");
    Ok(())
  }

  /// Setup replays symlink to ensure replays are saved to a consistent location
  ///
  /// When launching modded, replays are saved to citadel/addons/replays/
  /// When launching vanilla, replays are saved to citadel/replays/
  /// This creates a symlink from citadel/replays -> citadel/addons/replays/
  /// so all replays are stored in one place regardless of launch mode.
  pub fn setup_replays_symlink(&self, game_path: &Path) -> Result<(), Error> {
    let citadel_path = game_path.join("game").join("citadel");
    let vanilla_replays_path = citadel_path.join("replays");
    let modded_replays_path = citadel_path.join("addons").join("replays");

    log::info!("Setting up replays symlink");
    log::debug!(
      "Vanilla replays path: {:?}, Modded replays path: {:?}",
      vanilla_replays_path,
      modded_replays_path
    );

    // Ensure the target directory (addons/replays) exists
    self.filesystem.create_directories(&modded_replays_path)?;

    // Check current state of citadel/replays
    if vanilla_replays_path.exists() {
      // First check if both paths already point to the same location
      // This handles both symlinks and Windows junctions correctly
      if self
        .filesystem
        .paths_point_to_same_location(&vanilla_replays_path, &modded_replays_path)
      {
        log::info!("Replays paths already point to the same location");
        return Ok(());
      }

      // Check if it's a symlink pointing elsewhere
      if self.filesystem.is_symlink(&vanilla_replays_path) {
        log::info!(
          "Replays symlink points to wrong location, recreating: {:?}",
          vanilla_replays_path
        );
        self.filesystem.remove_symlink(&vanilla_replays_path)?;
      } else if vanilla_replays_path.is_dir() {
        // It's a regular directory - move contents to modded location and remove it
        log::info!(
          "Moving existing replays from {:?} to {:?}",
          vanilla_replays_path,
          modded_replays_path
        );
        self
          .filesystem
          .move_directory_contents(&vanilla_replays_path, &modded_replays_path)?;

        // Remove the now-empty directory
        fs::remove_dir(&vanilla_replays_path).map_err(|e| {
          Error::Io(std::io::Error::new(
            e.kind(),
            format!(
              "Failed to remove replays directory after moving contents: {}",
              e
            ),
          ))
        })?;
        log::info!("Removed original replays directory");
      } else {
        // It's a file (unlikely but handle it)
        log::warn!(
          "citadel/replays exists but is not a directory, removing: {:?}",
          vanilla_replays_path
        );
        fs::remove_file(&vanilla_replays_path)?;
      }
    }

    // Create the symlink: citadel/replays -> citadel/addons/replays
    self
      .filesystem
      .create_directory_symlink(&modded_replays_path, &vanilla_replays_path)?;

    log::info!("Replays symlink created successfully");
    Ok(())
  }

  /// Check if the game has been set up for mods
  pub fn is_game_setup(&self) -> bool {
    self.game_setup
  }

  /// Each entry produces one `Game citadel/addons[/<folder>]` line, in order.
  /// `None` (and empty input) falls back to the root `addons` directory.
  fn generate_modded_search_paths_multi(folders: &[Option<String>]) -> String {
    let resolved: Vec<String> = if folders.is_empty() {
      vec!["citadel/addons".to_string()]
    } else {
      folders
        .iter()
        .map(|f| match f {
          Some(name) if !name.is_empty() => format!("citadel/addons/{}", name),
          _ => "citadel/addons".to_string(),
        })
        .collect()
    };

    let game_lines = resolved
      .iter()
      .map(|p| format!("            Game                {}", p))
      .collect::<Vec<_>>()
      .join("\n");

    let search_paths = format!(
      r#"
		SearchPaths
        {{  
            Game_Language       citadel_*LANGUAGE*
{}
            Mod                 citadel
            Write               citadel          
            Game                citadel
            Mod                 core
            Write               core
            Game                core        
        }}"#,
      game_lines
    );

    Self::ensure_game_language_search_path(&search_paths)
  }

  /// `citadel/addons[/...]` paths inside the marker block, in source order.
  /// Returns an empty vec when the markers are absent.
  pub fn marker_addons_paths(&self, game_path: &Path) -> Result<Vec<String>, Error> {
    let gameinfo_path = game_path.join("game").join("citadel").join("gameinfo.gi");

    if !gameinfo_path.exists() {
      return Ok(Vec::new());
    }

    let content = fs::read_to_string(&gameinfo_path)?;

    let Some(start) = content.find(MOD_MANAGER_MARKER_START) else {
      return Ok(Vec::new());
    };
    let block_start = start + MOD_MANAGER_MARKER_START.len();
    if block_start > content.len() {
      return Ok(Vec::new());
    }
    let Some(end_rel) = content[block_start..].find(MOD_MANAGER_MARKER_END) else {
      return Ok(Vec::new());
    };
    let block = &content[block_start..block_start + end_rel];

    let mut paths = Vec::new();
    for line in block.lines() {
      let trimmed = line.trim();
      let Some(rest) = trimmed.strip_prefix("Game") else {
        continue;
      };
      let value = rest.trim();
      if value.starts_with("citadel/addons") {
        paths.push(value.to_string());
      }
    }
    Ok(paths)
  }

  /// Single-folder convenience wrapper around `update_mod_path_multi`.
  pub fn update_mod_path(
    &mut self,
    game_path: &Path,
    profile_folder: Option<String>,
  ) -> Result<(), Error> {
    self.update_mod_path_multi(game_path, &[profile_folder])
  }

  /// Update gameinfo.gi with one or more `Game citadel/addons[/...]` entries.
  /// The first folder is highest-precedence (engine reads it first).
  pub fn update_mod_path_multi(
    &mut self,
    game_path: &Path,
    folders: &[Option<String>],
  ) -> Result<(), Error> {
    log::info!("Updating mod path for folders: {folders:?}");

    if !self.game_setup {
      log::info!("Game not setup yet, setting up for mods...");
      self.setup_game_for_mods(game_path)?;
    }

    let gameinfo_path = game_path.join("game").join("citadel").join("gameinfo.gi");

    // Validate file exists and syntax before modification
    let validation = self.validate_gameinfo_syntax(&gameinfo_path)?;
    if !validation.is_valid {
      log::error!("Cannot modify invalid gameinfo.gi: {:?}", validation.errors);
      return Err(Error::GameConfigParse(format!(
        "gameinfo.gi validation failed: {}",
        validation.errors.join(", ")
      )));
    }

    // Read current content
    let gameinfo_content = fs::read_to_string(&gameinfo_path)?;

    // Create backup if it doesn't exist
    let backup_path = gameinfo_path.with_extension("gi.bak");
    if !backup_path.exists() {
      log::info!("Creating backup: {backup_path:?}");
      fs::copy(&gameinfo_path, &backup_path)?;
    }

    // Find the mod manager section to replace
    let (section_start, section_end, _section_content) =
      if let Some(start_pos) = gameinfo_content.find(MOD_MANAGER_MARKER_START) {
        if let Some(end_pos) = gameinfo_content.find(MOD_MANAGER_MARKER_END) {
          let end_pos = end_pos + MOD_MANAGER_MARKER_END.len();
          (start_pos, end_pos, &gameinfo_content[start_pos..end_pos])
        } else {
          log::warn!(
            "Found start marker but not end marker, replacing from marker to end of SearchPaths"
          );
          let search_paths_end = gameinfo_content[start_pos..]
            .find("}")
            .map(|pos| start_pos + pos + 1)
            .unwrap_or(gameinfo_content.len());
          (
            start_pos,
            search_paths_end,
            &gameinfo_content[start_pos..search_paths_end],
          )
        }
      } else {
        return Err(Error::GameConfigParse(
          "Mod manager markers not found in gameinfo.gi. Game may not be set up for mods yet."
            .to_string(),
        ));
      };

    let modded_search_paths = Self::generate_modded_search_paths_multi(folders);
    let replacement_content =
      format!("\n{MOD_MANAGER_MARKER_START}\n{modded_search_paths}\n{MOD_MANAGER_MARKER_END}");

    // Replace the section
    let mut new_gameinfo_content = gameinfo_content.clone();
    new_gameinfo_content.replace_range(section_start..section_end, &replacement_content);

    // Validate the new content before writing
    let temp_path = gameinfo_path.with_extension("gi.tmp");
    fs::write(&temp_path, &new_gameinfo_content)?;

    let temp_validation = self.validate_gameinfo_syntax(&temp_path)?;
    fs::remove_file(&temp_path)?;

    if !temp_validation.is_valid {
      log::error!("Generated content is invalid: {:?}", temp_validation.errors);
      return Err(Error::GameConfigParse(format!(
        "Generated gameinfo.gi would be invalid: {}",
        temp_validation.errors.join(", ")
      )));
    }

    log::info!("Writing updated gameinfo.gi with profile path");
    fs::write(&gameinfo_path, &new_gameinfo_content)?;

    // Final validation
    let final_validation = self.validate_gameinfo_syntax(&gameinfo_path)?;
    if !final_validation.is_valid {
      log::error!("Final validation failed: {:?}", final_validation.errors);

      // Try to restore backup
      if backup_path.exists() {
        log::info!("Restoring backup due to validation failure");
        fs::copy(&backup_path, &gameinfo_path)?;
      }

      return Err(Error::GameConfigParse(format!(
        "Final validation failed: {}",
        final_validation.errors.join(", ")
      )));
    }

    log::info!("Successfully updated mod path with folders: {folders:?}");
    Ok(())
  }

  /// Get the paths for game configuration files
  /// Validate that all required game files exist for mod installation
  pub fn validate_game_files(&self, game_path: &Path) -> Result<(), Error> {
    let gameinfo_path = game_path.join("game").join("citadel").join("gameinfo.gi");

    if !gameinfo_path.exists() {
      return Err(Error::GameConfigParse(
        "gameinfo.gi not found. Make sure Deadlock is properly installed.".to_string(),
      ));
    }

    let citadel_dir = game_path.join("game").join("citadel");
    if !citadel_dir.exists() {
      return Err(Error::GameConfigParse(
        "Citadel game directory not found. Make sure Deadlock is properly installed.".to_string(),
      ));
    }

    Ok(())
  }
}

impl Default for GameConfigManager {
  fn default() -> Self {
    Self::new()
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use tempfile::TempDir;

  fn setup_game_dir() -> (TempDir, std::path::PathBuf) {
    let dir = TempDir::new().expect("tempdir");
    let game_path = dir.path().to_path_buf();
    let citadel = game_path.join("game").join("citadel");
    std::fs::create_dir_all(&citadel).expect("create citadel dir");
    (dir, game_path)
  }

  fn write_gameinfo(game_path: &Path, body: &str) {
    let path = game_path.join("game").join("citadel").join("gameinfo.gi");
    std::fs::write(path, body).expect("write gameinfo");
  }

  #[test]
  fn generate_modded_search_paths_multi_empty_falls_back_to_root() {
    let out = GameConfigManager::generate_modded_search_paths_multi(&[]);
    assert!(out.contains("Game                citadel/addons\n"));
  }

  #[test]
  fn generate_modded_search_paths_multi_single_none_uses_root() {
    let out = GameConfigManager::generate_modded_search_paths_multi(&[None]);
    assert!(out.contains("Game                citadel/addons\n"));
    assert!(!out.contains("citadel/addons/"));
  }

  #[test]
  fn generate_modded_search_paths_multi_single_some_uses_subfolder() {
    let out =
      GameConfigManager::generate_modded_search_paths_multi(&[Some("profile_default".to_string())]);
    assert!(out.contains("Game                citadel/addons/profile_default\n"));
  }

  #[test]
  fn generate_modded_search_paths_multi_two_folders_preserve_order() {
    let out = GameConfigManager::generate_modded_search_paths_multi(&[
      Some("server_abc".to_string()),
      Some("profile_default".to_string()),
    ]);
    let server_idx = out
      .find("citadel/addons/server_abc")
      .expect("server line present");
    let profile_idx = out
      .find("citadel/addons/profile_default")
      .expect("profile line present");
    assert!(
      server_idx < profile_idx,
      "server folder must precede profile folder for engine precedence"
    );
  }

  #[test]
  fn generate_modded_search_paths_multi_empty_string_treated_as_root() {
    let out = GameConfigManager::generate_modded_search_paths_multi(&[Some(String::new())]);
    assert!(out.contains("Game                citadel/addons\n"));
  }

  #[test]
  fn marker_addons_paths_returns_empty_when_no_file() {
    let (_dir, game_path) = setup_game_dir();
    // Don't create gameinfo.gi at all.
    let mgr = GameConfigManager::new();
    let result = mgr.marker_addons_paths(&game_path).expect("ok");
    assert!(result.is_empty());
  }

  #[test]
  fn marker_addons_paths_returns_empty_without_markers() {
    let (_dir, game_path) = setup_game_dir();
    write_gameinfo(&game_path, "no markers here\nGame citadel/addons\n");
    let mgr = GameConfigManager::new();
    let result = mgr.marker_addons_paths(&game_path).expect("ok");
    assert!(result.is_empty());
  }

  #[test]
  fn marker_addons_paths_parses_single_addon_entry() {
    let (_dir, game_path) = setup_game_dir();
    let body = format!(
      "{start}\n  Game  citadel/addons/profile_default\n  Mod  citadel\n{end}\n",
      start = MOD_MANAGER_MARKER_START,
      end = MOD_MANAGER_MARKER_END,
    );
    write_gameinfo(&game_path, &body);
    let mgr = GameConfigManager::new();
    let result = mgr.marker_addons_paths(&game_path).expect("ok");
    assert_eq!(result, vec!["citadel/addons/profile_default".to_string()]);
  }

  #[test]
  fn marker_addons_paths_parses_multiple_entries_in_order() {
    let (_dir, game_path) = setup_game_dir();
    let body = format!(
      "{start}\n  Game  citadel/addons/server_xyz\n  Game  citadel/addons/profile_default\n  Mod  citadel\n{end}\n",
      start = MOD_MANAGER_MARKER_START,
      end = MOD_MANAGER_MARKER_END,
    );
    write_gameinfo(&game_path, &body);
    let mgr = GameConfigManager::new();
    let result = mgr.marker_addons_paths(&game_path).expect("ok");
    assert_eq!(
      result,
      vec![
        "citadel/addons/server_xyz".to_string(),
        "citadel/addons/profile_default".to_string(),
      ]
    );
  }

  #[test]
  fn marker_addons_paths_ignores_non_addons_game_lines() {
    let (_dir, game_path) = setup_game_dir();
    let body = format!(
      "{start}\n  Game  citadel\n  Game  citadel/addons/server_xyz\n{end}\n",
      start = MOD_MANAGER_MARKER_START,
      end = MOD_MANAGER_MARKER_END,
    );
    write_gameinfo(&game_path, &body);
    let mgr = GameConfigManager::new();
    let result = mgr.marker_addons_paths(&game_path).expect("ok");
    assert_eq!(result, vec!["citadel/addons/server_xyz".to_string()]);
  }

  /// Build a minimally valid gameinfo.gi with the mod-manager marker block
  /// containing a stale `server_xxx` Game entry. Used by the integration-style
  /// tests that exercise `update_mod_path_multi` end-to-end without needing
  /// the full Tauri MANAGER plumbing.
  fn fixture_gameinfo_with_server_entry() -> String {
    format!(
      r#"
"GameInfo"
{{
  game        "Deadlock"
  title       "Deadlock"
  FileSystem
  {{
    SearchPaths
    {{
      Game        citadel
    }}
{start}

    SearchPaths
    {{
      Game_Language       citadel_*LANGUAGE*
      Game                citadel/addons/server_stale
      Game                citadel/addons/profile_default
      Mod                 citadel
      Write               citadel
      Game                citadel
      Mod                 core
      Write               core
      Game                core
    }}
{end}
  }}
}}
"#,
      start = MOD_MANAGER_MARKER_START,
      end = MOD_MANAGER_MARKER_END,
    )
  }

  #[test]
  fn update_mod_path_multi_replaces_stale_server_with_profile() {
    let (_dir, game_path) = setup_game_dir();
    write_gameinfo(&game_path, &fixture_gameinfo_with_server_entry());

    let mut mgr = GameConfigManager::new();
    mgr.game_setup = true; // skip setup_game_for_mods (which expects vanilla layout)

    mgr
      .update_mod_path(&game_path, Some("profile_default".to_string()))
      .expect("update should succeed");

    let result = mgr.marker_addons_paths(&game_path).expect("read markers");
    assert_eq!(
      result,
      vec!["citadel/addons/profile_default".to_string()],
      "stale server_ entry must be gone after update"
    );
  }

  #[test]
  fn update_mod_path_multi_with_layered_server_then_profile() {
    let (_dir, game_path) = setup_game_dir();
    write_gameinfo(&game_path, &fixture_gameinfo_with_server_entry());

    let mut mgr = GameConfigManager::new();
    mgr.game_setup = true;

    mgr
      .update_mod_path_multi(
        &game_path,
        &[
          Some("server_new".to_string()),
          Some("profile_default".to_string()),
        ],
      )
      .expect("update should succeed");

    let result = mgr.marker_addons_paths(&game_path).expect("read markers");
    assert_eq!(
      result,
      vec![
        "citadel/addons/server_new".to_string(),
        "citadel/addons/profile_default".to_string(),
      ],
      "layered server folder should precede profile folder"
    );
  }

  #[test]
  fn update_mod_path_multi_root_falls_back_when_none() {
    let (_dir, game_path) = setup_game_dir();
    write_gameinfo(&game_path, &fixture_gameinfo_with_server_entry());

    let mut mgr = GameConfigManager::new();
    mgr.game_setup = true;

    mgr
      .update_mod_path(&game_path, None)
      .expect("update should succeed");

    let result = mgr.marker_addons_paths(&game_path).expect("read markers");
    assert_eq!(
      result,
      vec!["citadel/addons".to_string()],
      "None profile must produce a single root addons line"
    );
  }
}
