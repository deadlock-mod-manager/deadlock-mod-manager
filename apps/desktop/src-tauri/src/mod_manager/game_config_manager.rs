use crate::errors::Error;
use crate::mod_manager::filesystem_helper::FileSystemHelper;
use crate::utils;
use kv_parser::{is_patch_already_applied, DiffApplicator, DocumentDiff, ParseOptions, Parser, Serializer};
use log;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

// Legacy markers - kept for backward compatibility detection and cleanup
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

  /// Modify the search paths in gameinfo.gi using kv-parser
  pub fn modify_search_paths(&self, gameinfo_path: &Path, vanilla: bool) -> Result<(), Error> {
    self.modify_search_paths_with_profile(gameinfo_path, vanilla, None)
  }

  /// Modify the search paths in gameinfo.gi using kv-parser with optional profile
  fn modify_search_paths_with_profile(
    &self,
    gameinfo_path: &Path,
    vanilla: bool,
    profile_folder: Option<String>,
  ) -> Result<(), Error> {
    log::info!(
      "Modifying search paths for gameinfo.gi: {:?} (vanilla: {}, profile: {:?})",
      gameinfo_path,
      vanilla,
      profile_folder
    );

    if !gameinfo_path.exists() {
      return Err(Error::GameConfigParse(
        "gameinfo.gi file not found".to_string(),
      ));
    }

    // Create backup if it doesn't exist
    let backup_path = gameinfo_path.with_extension("gi.bak");
    if !backup_path.exists() {
      log::info!("Creating backup: {:?}", backup_path);
      fs::copy(gameinfo_path, &backup_path)?;
    }

    // Read current content
    let gameinfo_content = fs::read_to_string(gameinfo_path)?;

    // Parse the gameinfo file
    let parse_result = Parser::parse(&gameinfo_content, ParseOptions::default())
      .map_err(|e| Error::GameConfigParse(format!("Failed to parse gameinfo.gi: {e}")))?;

    // Load the appropriate patch from embedded JSON files
    let diff = if vanilla {
      Self::load_disable_mods_patch()?
    } else {
      Self::load_enable_mods_patch(profile_folder.clone())?
    };

    // Check if patch is already applied
    match is_patch_already_applied(&gameinfo_content, &diff) {
      Ok(true) => {
        log::info!(
          "Patch already applied (vanilla: {}, profile: {:?}), skipping modification",
          vanilla,
          profile_folder
        );
        return Ok(());
      }
      Ok(false) => {
        log::debug!("Patch not yet applied, proceeding with modification");
      }
      Err(e) => {
        log::warn!("Failed to check if patch is already applied: {}, proceeding with modification", e);
      }
    }

    // Apply the diff to the AST for perfect formatting preservation
    let patched_ast = DiffApplicator::apply_to_ast(&parse_result.ast, &diff)
      .map_err(|e| Error::GameConfigParse(format!("Failed to apply patch: {e}")))?;

    // Serialize back to string
    let patched_content = Serializer::serialize_ast(&patched_ast);

    // Validate the new content before writing
    let temp_path = gameinfo_path.with_extension("gi.tmp");
    fs::write(&temp_path, &patched_content)?;

    let temp_validation = self.validate_gameinfo_syntax(&temp_path)?;
    fs::remove_file(&temp_path)?;

    if !temp_validation.is_valid {
      log::error!("Generated content is invalid: {:?}", temp_validation.errors);
      return Err(Error::GameConfigParse(format!(
        "Generated gameinfo.gi would be invalid: {}",
        temp_validation.errors.join(", ")
      )));
    }

    // Write the patched content
    fs::write(gameinfo_path, &patched_content)?;

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

    log::info!(
      "Successfully modified search paths (vanilla: {}, profile: {:?})",
      vanilla,
      profile_folder
    );
    Ok(())
  }

  /// Load and parse the enable-mods patch from embedded JSON
  fn load_enable_mods_patch(profile_folder: Option<String>) -> Result<DocumentDiff, Error> {
    const ENABLE_PATCH: &str = include_str!("../../../patches/enable-mods.patch.json");

    // Apply profile placeholder substitution
    let patch_json = if let Some(ref folder) = profile_folder {
      ENABLE_PATCH.replace("/{{PROFILE}}", &format!("/{}", folder))
    } else {
      ENABLE_PATCH.replace("/{{PROFILE}}", "")
    };

    log::debug!("Enable mods patch after substitution: {}", patch_json);

    serde_json::from_str(&patch_json)
      .map_err(|e| Error::GameConfigParse(format!("Failed to parse enable-mods patch: {e}")))
  }

  /// Load and parse the disable-mods patch from embedded JSON
  fn load_disable_mods_patch() -> Result<DocumentDiff, Error> {
    const DISABLE_PATCH: &str = include_str!("../../../patches/disable-mods.patch.json");

    serde_json::from_str(DISABLE_PATCH)
      .map_err(|e| Error::GameConfigParse(format!("Failed to parse disable-mods patch: {e}")))
  }

  /// Check if the game has been set up for mods
  pub fn is_game_setup(&self) -> bool {
    self.game_setup
  }

  /// Update the mod path in gameinfo.gi for profile switching
  pub fn update_mod_path(
    &mut self,
    game_path: &Path,
    profile_folder: Option<String>,
  ) -> Result<(), Error> {
    log::info!("Updating mod path for profile folder: {:?}", profile_folder);

    if !self.game_setup {
      log::info!("Game not setup yet, setting up for mods...");
      self.setup_game_for_mods(game_path)?;
    }

    let gameinfo_path = game_path.join("game").join("citadel").join("gameinfo.gi");

    // Use the kv-parser based approach
    self.modify_search_paths_with_profile(&gameinfo_path, false, profile_folder)?;

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
