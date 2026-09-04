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
  shard::{self, ProfileBase, ShardIndex, ShardLocator},
  steam_manager::SteamManager,
  vpk_manager::staging::VpkStaging,
  vpk_manager::{MissingVpkPolicy, ShardAssignment, ShardPlacement, SwapRequest, VpkManager},
  vpk_manifest::{ProfileVpkManifest, ProfileVpkManifestEntry},
};
use log;
use std::{
  collections::{BTreeMap, HashSet},
  path::{Component, Path, PathBuf},
};
use tauri::Manager;

mod gameinfo;
mod lifecycle;
mod reorder;

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

pub struct RemovedModVpks {
  pub count: usize,
  pub install_order: Option<u32>,
}

pub struct VariantChangeResult {
  pub installed_vpks: Vec<String>,
  pub original_vpk_names: Vec<String>,
  pub file_tree: ModFileTree,
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

  pub(crate) fn get_addons_path(&self, profile_folder: Option<&str>) -> Result<ProfileBase, Error> {
    let game_path = self
      .steam_manager
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?;

    let addons_path = game_path.join("game").join("citadel").join("addons");
    let profile_path = match profile_folder {
      Some(folder) => {
        if !Self::is_safe_profile_folder(folder) {
          return Err(Error::InvalidInput(format!(
            "Invalid profile folder path: {folder}"
          )));
        }
        addons_path.join(folder)
      }
      None => addons_path,
    };
    ProfileBase::new(profile_path)
  }

  /// Profile folders may nest (`profiles/imported`), so this permits separators
  /// and only rejects components that escape the addons directory. It is not a
  /// mod-ID check; use [`Self::ensure_safe_mod_id`] for those.
  fn is_safe_profile_folder(folder: &str) -> bool {
    !folder.is_empty()
      && Path::new(folder)
        .components()
        .all(|component| matches!(component, Component::Normal(_)))
  }

  /// Mod IDs are joined onto the mods store path and the result is deleted
  /// recursively, so a traversing ID would reach outside the store.
  pub(crate) fn ensure_safe_mod_id(mod_id: &str) -> Result<(), Error> {
    if mod_id.contains("..") || mod_id.contains('/') || mod_id.contains('\\') {
      return Err(Error::InvalidInput(
        "Invalid mod ID: path traversal not allowed".to_string(),
      ));
    }

    Ok(())
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

  pub fn prepare_game_launch(
    &mut self,
    vanilla: bool,
    additional_args: String,
    profile_folder: Option<String>,
  ) -> Result<super::steam_uri_launcher::SteamUriLaunchRequest, Error> {
    // Ensure game path is found
    self.find_game()?;

    // Toggle mods based on vanilla flag
    if vanilla {
      log::info!("Disabling mods...");
      self.toggle_mods(vanilla)?;
    } else {
      log::info!("Enabling mods for profile: {:?}...", profile_folder);
      // A profile that still holds a pre-sharding layout must be spread across
      // shards before its search paths are written, or the extra `citadel/addonsN`
      // lines would be missing and the engine would silently drop everything
      // past the 99th pak file.
      self.migrate_profile_to_shards(profile_folder.clone())?;
      self.apply_profile_gameinfo(profile_folder)?;
    }

    self.steam_manager.game_launch_request(&additional_args)
  }

  pub fn get_mod_file_tree(&self, mod_path: &PathBuf) -> Result<ModFileTree, Error> {
    self.file_tree_analyzer.get_mod_file_tree(mod_path)
  }

  pub fn clear_mods(&mut self, profile_folder: Option<String>) -> Result<(), Error> {
    let addons_path = self.get_addons_path(profile_folder.as_deref())?;

    let pending = self.vpk_manager.stage_clear_all_vpks(&addons_path)?;
    if let Err(error) = ProfileVpkManifest::default().save(&addons_path) {
      return Err(pending.rollback(error));
    }
    pending.commit();
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

  pub fn get_app_local_data_path(&self) -> Result<std::path::PathBuf, Error> {
    let app_handle = self
      .app_handle
      .as_ref()
      .ok_or(Error::AppHandleNotInitialized)?;
    app_handle.path().app_local_data_dir().map_err(Error::Tauri)
  }

  pub fn get_mods_store_path(&self) -> Result<std::path::PathBuf, Error> {
    Ok(self.get_app_local_data_path()?.join("mods"))
  }

  pub fn get_profile_vpk_manifest(
    &self,
    profile_folder: Option<String>,
  ) -> Result<ProfileVpkManifest, Error> {
    let addons_path = self.get_addons_path(profile_folder.as_deref())?;
    ProfileVpkManifest::load(&addons_path)
  }

  /// Validate and canonicalize a path to ensure it's within the allowed mods directory.
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
    Self::ensure_safe_mod_id(mod_id)?;
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
  use crate::mod_manager::shard::ShardIndex;
  use crate::mod_manager::vpk_manifest::{ProfileVpkManifest, ProfileVpkManifestEntry};

  use super::*;
  use std::fs;

  fn write_vpk(addons_path: &std::path::Path, name: &str) {
    fs::write(addons_path.join(name), b"test vpk").unwrap();
  }

  /// Builds a manager pointing at a throwaway game install, bypassing the
  /// Steam lookup and the app handle that `ModManager::new` depends on.
  fn test_manager(game_path: &Path) -> ModManager {
    let mut manager = test_manager_without_game_path();

    manager
      .steam_manager
      .set_game_path(game_path.to_path_buf())
      .unwrap();

    manager
  }

  fn test_manager_without_game_path() -> ModManager {
    ModManager {
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
    }
  }

  fn game_dir() -> tempfile::TempDir {
    let game = tempfile::tempdir().unwrap();
    let citadel = game.path().join("game").join("citadel");
    fs::create_dir_all(&citadel).unwrap();
    fs::write(citadel.join("gameinfo.gi"), b"").unwrap();
    game
  }

  fn downloaded_mod(mods_store: &std::path::Path, mod_id: &str) -> PathBuf {
    let mod_dir = mods_store.join(mod_id);
    fs::create_dir_all(&mod_dir).unwrap();
    fs::write(mod_dir.join("mod.zip"), b"downloaded archive").unwrap();
    mod_dir
  }

  fn count_enabled(dir: &std::path::Path) -> u32 {
    crate::mod_manager::vpk_manager::VpkManager::count_enabled_vpks(dir)
  }

  fn addons_base(temp: &tempfile::TempDir) -> crate::mod_manager::shard::ProfileBase {
    let path = temp.path().join("citadel").join("addons");
    fs::create_dir_all(&path).unwrap();
    crate::mod_manager::shard::ProfileBase::new(path).unwrap()
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
    let base = addons_base(&temp);
    let mut entry = ProfileVpkManifestEntry {
      enabled: true,
      current_vpks: vec!["pak01_dir.vpk".to_string()],
      ..Default::default()
    };

    let changed = ModManager::reconcile_manifest_entry_for_reorder(&base, &mut entry, &[]);

    assert!(changed);
    assert!(!entry.enabled);
    assert!(entry.current_vpks.is_empty());
  }

  #[test]
  fn reorder_manifest_reconciliation_does_not_enable_disabled_entries_without_fallback() {
    let temp = tempfile::tempdir().unwrap();
    let base = addons_base(&temp);
    write_vpk(&base, "pak01_dir.vpk");
    let mut entry = ProfileVpkManifestEntry {
      enabled: false,
      current_vpks: vec!["pak01_dir.vpk".to_string()],
      ..Default::default()
    };

    let changed = ModManager::reconcile_manifest_entry_for_reorder(&base, &mut entry, &[]);

    assert!(!changed);
    assert!(!entry.enabled);
    assert_eq!(entry.current_vpks, vec!["pak01_dir.vpk".to_string()]);
  }

  /// The whole point of the upgrade: a profile that predates sharding has every
  /// mod on shard 1 with no install order, and must come out of the reorder in
  /// exactly the order the engine was already loading it.
  #[test]
  fn legacy_profile_without_install_order_keeps_its_pak_order() {
    let mut manifest = ProfileVpkManifest::default();
    for (mod_id, vpk) in [
      ("third", "pak03_dir.vpk"),
      ("first", "pak01_dir.vpk"),
      ("second", "pak02_dir.vpk"),
    ] {
      manifest.mods.insert(
        mod_id.to_string(),
        ProfileVpkManifestEntry {
          enabled: true,
          current_vpks: vec![vpk.to_string()],
          ..Default::default()
        },
      );
    }

    let ordered = ModManager::ordered_assignments(&manifest);

    assert_eq!(
      ordered
        .iter()
        .map(|a| a.mod_id.as_str())
        .collect::<Vec<_>>(),
      vec!["first", "second", "third"]
    );
  }

  /// An explicit install order always wins over the on-disk position, and mods
  /// that never got one are appended behind them rather than interleaved.
  #[test]
  fn explicit_install_order_precedes_unordered_mods() {
    let mut manifest = ProfileVpkManifest::default();
    manifest.mods.insert(
      "unordered".to_string(),
      ProfileVpkManifestEntry {
        enabled: true,
        current_vpks: vec!["pak01_dir.vpk".to_string()],
        ..Default::default()
      },
    );
    manifest.mods.insert(
      "ordered".to_string(),
      ProfileVpkManifestEntry {
        enabled: true,
        order: Some(7),
        current_vpks: vec!["pak09_dir.vpk".to_string()],
        ..Default::default()
      },
    );

    let ordered = ModManager::ordered_assignments(&manifest);

    assert_eq!(
      ordered
        .iter()
        .map(|a| a.mod_id.as_str())
        .collect::<Vec<_>>(),
      vec!["ordered", "unordered"]
    );
  }

  /// Across shards the load order follows the shard index, so an already
  /// sharded profile is not reshuffled by a reorder that changes nothing.
  #[test]
  fn unordered_mods_sort_by_shard_then_pak_number() {
    let mut manifest = ProfileVpkManifest::default();
    for (mod_id, shard, vpk) in [
      ("shard2_low", 2, "pak01_dir.vpk"),
      ("shard1_high", 1, "pak80_dir.vpk"),
      ("shard1_low", 1, "pak02_dir.vpk"),
    ] {
      manifest.mods.insert(
        mod_id.to_string(),
        ProfileVpkManifestEntry {
          enabled: true,
          shard: ShardIndex::new(shard).unwrap(),
          current_vpks: vec![vpk.to_string()],
          ..Default::default()
        },
      );
    }

    let ordered = ModManager::ordered_assignments(&manifest);

    assert_eq!(
      ordered
        .iter()
        .map(|a| a.mod_id.as_str())
        .collect::<Vec<_>>(),
      vec!["shard1_low", "shard1_high", "shard2_low"]
    );
  }

  #[test]
  fn disabled_and_empty_entries_are_not_assigned_a_slot() {
    let mut manifest = ProfileVpkManifest::default();
    manifest.mods.insert(
      "disabled".to_string(),
      ProfileVpkManifestEntry {
        enabled: false,
        current_vpks: vec!["pak01_dir.vpk".to_string()],
        ..Default::default()
      },
    );
    manifest.mods.insert(
      "enabled_but_empty".to_string(),
      ProfileVpkManifestEntry {
        enabled: true,
        ..Default::default()
      },
    );

    assert!(ModManager::ordered_assignments(&manifest).is_empty());
  }

  fn enabled_entry(order: u32, vpk: &str) -> ProfileVpkManifestEntry {
    ProfileVpkManifestEntry {
      enabled: true,
      order: Some(order),
      current_vpks: vec![vpk.to_string()],
      ..Default::default()
    }
  }

  /// A VPK claimed by two mods is a stale record, not a reason to give up: the
  /// reorder used to abort, which left the profile permanently unorderable.
  #[test]
  fn reorder_recovers_when_two_mods_claim_the_same_vpk() {
    let game = game_dir();
    let base_path = game.path().join("game").join("citadel").join("addons");
    fs::create_dir_all(&base_path).unwrap();
    let base = ProfileBase::new(&base_path).unwrap();
    write_vpk(&base_path, "pak01_dir.vpk");

    let mut manifest = ProfileVpkManifest::default();
    manifest
      .mods
      .insert("first".to_string(), enabled_entry(1, "pak01_dir.vpk"));
    manifest
      .mods
      .insert("second".to_string(), enabled_entry(2, "pak01_dir.vpk"));
    manifest.save(&base).unwrap();

    let mut manager = test_manager(game.path());
    manager.reorder_all_mods_for_profile(None).unwrap();

    let manifest = ProfileVpkManifest::load(&base).unwrap();
    assert!(manifest.mods["first"].enabled);
    assert_eq!(
      manifest.mods["first"].current_vpks,
      vec!["pak01_dir.vpk".to_string()]
    );
    assert!(!manifest.mods["second"].enabled);
    assert!(manifest.mods["second"].current_vpks.is_empty());
    assert!(base_path.join("pak01_dir.vpk").exists());
  }

  /// An entry the reorder skipped still names files the reorder renumbers. Its
  /// record has to follow them, or it ends up claiming a file that now belongs
  /// to another mod and the next reorder sees a duplicate.
  #[test]
  fn reorder_resyncs_entries_it_did_not_move() {
    let game = game_dir();
    let base_path = game.path().join("game").join("citadel").join("addons");
    fs::create_dir_all(&base_path).unwrap();
    let base = ProfileBase::new(&base_path).unwrap();
    write_vpk(&base_path, "pak01_dir.vpk");
    write_vpk(&base_path, "pak05_dir.vpk");

    let mut manifest = ProfileVpkManifest::default();
    manifest
      .mods
      .insert("mapped".to_string(), enabled_entry(1, "pak01_dir.vpk"));
    manifest.mods.insert(
      "unmapped".to_string(),
      ProfileVpkManifestEntry {
        enabled: false,
        current_vpks: vec!["pak05_dir.vpk".to_string()],
        ..Default::default()
      },
    );
    manifest.save(&base).unwrap();

    let mut manager = test_manager(game.path());
    manager.reorder_all_mods_for_profile(None).unwrap();

    let manifest = ProfileVpkManifest::load(&base).unwrap();
    assert_eq!(
      manifest.mods["mapped"].current_vpks,
      vec!["pak01_dir.vpk".to_string()]
    );
    // pak05 was compacted to pak02 as an unclaimed file; the record follows it
    // instead of pointing at the file "mapped" now owns.
    assert_eq!(
      manifest.mods["unmapped"].current_vpks,
      vec!["pak02_dir.vpk".to_string()]
    );
    assert!(base_path.join("pak02_dir.vpk").exists());
  }

  /// The full upgrade, as an existing install experiences it: a v1 manifest and
  /// 150 pak files crammed into one addons folder, read from disk, reordered
  /// into shards. Load order must survive the move unchanged, and the manifest
  /// must end up describing where the files actually are.
  #[test]
  fn upgrading_a_legacy_over_capacity_profile_shards_it_without_reordering_mods() {
    let temp = tempfile::tempdir().unwrap();
    let base_path = temp.path().join("citadel").join("addons");
    fs::create_dir_all(&base_path).unwrap();

    let mut v1_mods = Vec::new();
    for i in 1..=150u32 {
      let vpk = format!("pak{i:02}_dir.vpk");
      write_vpk(&base_path, &vpk);
      // No `shard` and no `order`: exactly what the pre-sharding build wrote.
      v1_mods.push(format!(
        r#""mod{i}": {{"enabled": true, "currentVpks": ["{vpk}"], "originalVpkNames": ["m{i}.vpk"]}}"#
      ));
    }
    fs::write(
      base_path.join(".dmm.json"),
      format!(r#"{{"version": 1, "mods": {{{}}}}}"#, v1_mods.join(",")),
    )
    .unwrap();

    let base = crate::mod_manager::shard::ProfileBase::new(&base_path).unwrap();
    let mut manifest = ProfileVpkManifest::load(&base).unwrap();
    let assignments = ModManager::ordered_assignments(&manifest);
    assert_eq!(assignments.len(), 150);

    let placements = crate::mod_manager::vpk_manager::VpkManager::new()
      .reorder_vpks_sharded(&assignments, &base)
      .unwrap();

    // Load order is unchanged: mod N still loads Nth overall.
    assert_eq!(
      placements
        .iter()
        .map(|placement| placement.mod_id.as_str())
        .collect::<Vec<_>>(),
      (1..=150u32).map(|i| format!("mod{i}")).collect::<Vec<_>>()
    );

    let shard_two = ShardIndex::new(2).unwrap();
    assert!(
      placements[..99]
        .iter()
        .all(|p| p.shard == ShardIndex::FIRST)
    );
    assert!(placements[99..].iter().all(|p| p.shard == shard_two));

    // Both shards are within the engine's per-directory limit, and the
    // out-of-range pak numbers that made this profile broken are gone.
    assert_eq!(count_enabled(&base.shard_dir(ShardIndex::FIRST)), 99);
    assert_eq!(count_enabled(&base.shard_dir(shard_two)), 51);
    assert!(
      !base
        .shard_dir(ShardIndex::FIRST)
        .join("pak100_dir.vpk")
        .exists()
    );

    // The manifest now points at the real locations, upgraded to the current version.
    for placement in &placements {
      let entry = manifest.mods.get_mut(&placement.mod_id).unwrap();
      entry.shard = placement.shard;
      entry.current_vpks = placement.vpks.clone();
      for path in entry.file_paths(&base) {
        assert!(
          path.is_file(),
          "manifest points at a missing file: {path:?}"
        );
      }
    }
  }

  #[test]
  fn choose_shard_appends_new_shard_when_current_is_full() {
    let temp = tempfile::tempdir().unwrap();
    let addons_path = temp.path().join("citadel").join("addons");
    fs::create_dir_all(&addons_path).unwrap();

    // Fill the base shard (citadel/addons) to the engine's 99-file capacity.
    for i in 1..=99u32 {
      write_vpk(&addons_path, &format!("pak{i:02}_dir.vpk"));
    }

    // A newly enabled mod must overflow into shard 2 rather than being rejected.
    let base = crate::mod_manager::shard::ProfileBase::new(addons_path).unwrap();
    let chosen = ModManager::choose_shard_for(&base, None, 1).unwrap();
    assert_eq!(chosen, ShardIndex::new(2).unwrap());
  }

  #[test]
  fn purge_deletes_downloaded_files_when_addons_directory_is_missing() {
    let game = game_dir();
    let mods_store = tempfile::tempdir().unwrap();
    let mod_dir = downloaded_mod(mods_store.path(), "650634");
    let mut manager = test_manager(game.path());

    assert!(
      !game
        .path()
        .join("game")
        .join("citadel")
        .join("addons")
        .exists()
    );

    manager
      .purge_mod_from("650634".to_string(), Vec::new(), None, mods_store.path())
      .unwrap();

    assert!(!mod_dir.exists());
  }

  #[test]
  fn purge_deletes_downloaded_files_when_game_path_is_not_set() {
    let mods_store = tempfile::tempdir().unwrap();
    let mod_dir = downloaded_mod(mods_store.path(), "650634");
    let mut manager = test_manager_without_game_path();

    manager
      .purge_mod_from("650634".to_string(), Vec::new(), None, mods_store.path())
      .unwrap();

    assert!(!mod_dir.exists());
  }

  #[test]
  fn purge_deletes_downloaded_files_and_installed_vpks_when_addons_exist() {
    let game = game_dir();
    let addons_path = game.path().join("game").join("citadel").join("addons");
    fs::create_dir_all(&addons_path).unwrap();
    write_vpk(&addons_path, "pak01_dir.vpk");

    let mods_store = tempfile::tempdir().unwrap();
    let mod_dir = downloaded_mod(mods_store.path(), "650634");
    let mut manager = test_manager(game.path());

    manager
      .purge_mod_from(
        "650634".to_string(),
        vec!["pak01_dir.vpk".to_string()],
        None,
        mods_store.path(),
      )
      .unwrap();

    assert!(!mod_dir.exists());
    assert!(!addons_path.join("pak01_dir.vpk").exists());
  }

  #[test]
  fn purge_rejects_mod_ids_that_escape_the_mods_store() {
    let game = game_dir();
    let root = tempfile::tempdir().unwrap();
    let mods_store = root.path().join("mods");
    fs::create_dir_all(&mods_store).unwrap();

    let outside = root.path().join("victim");
    fs::create_dir_all(&outside).unwrap();
    fs::write(outside.join("keep.txt"), b"not yours to delete").unwrap();

    let mut manager = test_manager(game.path());

    for mod_id in ["../victim", "..\\victim", "/etc"] {
      let result = manager.purge_mod_from(mod_id.to_string(), Vec::new(), None, &mods_store);

      assert!(matches!(result, Err(Error::InvalidInput(_))), "{mod_id}");
    }

    assert!(outside.join("keep.txt").exists());
  }

  /// `remove_mod_vpks` is public and reached directly by the batch-update path,
  /// where it is the only guard on the mod ID. It once used the profile-folder
  /// predicate, which permits separators.
  #[test]
  fn remove_mod_vpks_rejects_mod_ids_with_separators() {
    let game = game_dir();
    let addons_path = game.path().join("game").join("citadel").join("addons");
    fs::create_dir_all(&addons_path).unwrap();
    let mut manager = test_manager(game.path());

    for mod_id in ["profiles/imported", "../victim", "..\\victim", "/etc"] {
      let result = manager.remove_mod_vpks(mod_id, &[], None);

      assert!(matches!(result, Err(Error::InvalidInput(_))), "{mod_id}");
    }
  }

  fn write_owned_mod(
    addons_path: &crate::mod_manager::shard::ProfileBase,
    manifest: &mut ProfileVpkManifest,
    mod_id: &str,
    shard: ShardIndex,
    filename: &str,
    contents: &[u8],
  ) {
    let dir = addons_path.shard_dir(shard);
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join(filename), contents).unwrap();
    manifest.mark_enabled(
      mod_id,
      vec![filename.to_string()],
      vec![format!("{mod_id}.vpk")],
      None,
      shard,
    );
  }

  /// A stale frontend `pak01_dir.vpk` used to resolve to shard 1 even when the
  /// target lived in shard 2, deleting another mod's file.
  #[test]
  fn remove_mod_vpks_ignores_stale_filename_when_manifest_owns_the_mod() {
    let game = game_dir();
    let addons_path = game.path().join("game").join("citadel").join("addons");
    fs::create_dir_all(&addons_path).unwrap();
    let base = crate::mod_manager::shard::ProfileBase::new(&addons_path).unwrap();
    let shard_two = ShardIndex::new(2).unwrap();
    let mut manifest = ProfileVpkManifest::default();
    write_owned_mod(
      &base,
      &mut manifest,
      "target",
      shard_two,
      "pak01_dir.vpk",
      b"target",
    );
    write_owned_mod(
      &base,
      &mut manifest,
      "other",
      ShardIndex::FIRST,
      "pak01_dir.vpk",
      b"other",
    );
    manifest.save(&base).unwrap();

    let mut manager = test_manager(game.path());
    manager.mod_repository.add_mod(Mod {
      id: "target".into(),
      name: "target".into(),
      is_map: false,
      installed_vpks: vec!["pak01_dir.vpk".into()],
      file_tree: None,
      install_order: None,
      original_vpk_names: vec!["target.vpk".into()],
    });

    let result = manager
      .remove_mod_vpks("target", &["pak01_dir.vpk".into()], None)
      .unwrap();

    assert_eq!(result.count, 1);
    assert!(!base.shard_dir(shard_two).join("pak01_dir.vpk").exists());
    assert_eq!(
      fs::read(base.join("pak01_dir.vpk")).unwrap(),
      b"other"
    );
    let after = ProfileVpkManifest::load(&base).unwrap();
    assert!(!after.mods.contains_key("target"));
    assert!(after.mods.contains_key("other"));
  }

  #[test]
  fn remove_mod_vpks_does_not_cross_shards_for_identical_filenames() {
    let game = game_dir();
    let addons_path = game.path().join("game").join("citadel").join("addons");
    fs::create_dir_all(&addons_path).unwrap();
    let base = crate::mod_manager::shard::ProfileBase::new(&addons_path).unwrap();
    let shard_two = ShardIndex::new(2).unwrap();
    let mut manifest = ProfileVpkManifest::default();
    write_owned_mod(
      &base,
      &mut manifest,
      "target",
      shard_two,
      "pak01_dir.vpk",
      b"target",
    );
    write_owned_mod(
      &base,
      &mut manifest,
      "other",
      ShardIndex::FIRST,
      "pak01_dir.vpk",
      b"other",
    );
    manifest.save(&base).unwrap();

    let mut manager = test_manager(game.path());
    let result = manager.remove_mod_vpks("target", &[], None).unwrap();

    assert_eq!(result.count, 1);
    assert!(!base.shard_dir(shard_two).join("pak01_dir.vpk").exists());
    assert_eq!(
      fs::read(base.join("pak01_dir.vpk")).unwrap(),
      b"other"
    );
  }

  /// Without a manifest entry, fallback names are still shard-1-resolved, but
  /// they must not delete a file another entry already claims.
  #[test]
  fn remove_mod_vpks_skips_fallback_paths_claimed_by_another_mod() {
    let game = game_dir();
    let addons_path = game.path().join("game").join("citadel").join("addons");
    fs::create_dir_all(&addons_path).unwrap();
    let base = crate::mod_manager::shard::ProfileBase::new(&addons_path).unwrap();
    let mut manifest = ProfileVpkManifest::default();
    write_owned_mod(
      &base,
      &mut manifest,
      "other",
      ShardIndex::FIRST,
      "pak01_dir.vpk",
      b"other",
    );
    fs::write(base.join("pak02_dir.vpk"), b"orphan").unwrap();
    manifest.save(&base).unwrap();

    let mut manager = test_manager(game.path());
    let result = manager
      .remove_mod_vpks(
        "target",
        &["pak01_dir.vpk".into(), "pak02_dir.vpk".into()],
        None,
      )
      .unwrap();

    assert_eq!(result.count, 1);
    assert_eq!(
      fs::read(base.join("pak01_dir.vpk")).unwrap(),
      b"other"
    );
    assert!(!base.join("pak02_dir.vpk").exists());
    let after = ProfileVpkManifest::load(&base).unwrap();
    assert!(after.mods.contains_key("other"));
    assert!(!after.mods.contains_key("target"));
  }
}
