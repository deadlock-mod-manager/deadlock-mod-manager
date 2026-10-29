use crate::app_runtime::AppHandle;
use crate::errors::Error;
use crate::mod_manager::{
  addons_backup_manager::AddonsBackupManager,
  autoexec_manager::AutoexecManager,
  file_tree::{FileTreeAnalyzer, ModFile, ModFileTree},
  filesystem_helper::FileSystemHelper,
  game_config_manager::GameConfigManager,
  game_process_manager::GameProcessManager,
  missing_vpks::missing_mod_files,
  mod_repository::{Mod, ModRepository},
  shard::{self, ProfileBase, ShardIndex, ShardLocator},
  steam_manager::SteamManager,
  vpk_manager::staging::{PendingVpkOperation, VpkStaging},
  vpk_manager::{MissingVpkPolicy, ShardAssignment, ShardPlacement, SwapRequest, VpkManager},
  vpk_manifest::{ProfileVpkManifest, ProfileVpkManifestEntry},
};
use log;
use std::{
  collections::{BTreeMap, HashSet},
  path::{Component, Path, PathBuf},
  sync::Mutex,
};

mod analyzed;
pub use analyzed::AnalyzedModRegistration;
mod gameinfo;
#[cfg(test)]
mod legacy_reorder_tests;
mod lifecycle;
mod localization;
mod model_conflict_switch;
mod reorder;
pub(crate) mod update_backup;

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
  localization_overlay_plan_cache: Mutex<Option<localization::CachedLocalizationOverlayPlan>>,
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
      localization_overlay_plan_cache: Mutex::new(None),
    };

    // Harness worlds are configured explicitly during Tauri setup. Never scan
    // the host for Steam or Deadlock when an isolated runtime is active.
    if !crate::runtime_environment::is_e2e_active()
      && let Err(e) = manager.find_game()
    {
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

  pub fn game_processes(&mut self) -> Result<Vec<super::game_process_manager::GameProcess>, Error> {
    self.process_manager.game_processes()
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
      self.report_launch_step("disablingMods");
      self.toggle_mods(vanilla)?;
    } else {
      log::info!("Enabling mods for profile: {:?}...", profile_folder);
      self.report_launch_step("verifyingMods");
      self.validate_modded_launch_files(profile_folder.as_deref())?;
      let game_path = self
        .steam_manager
        .get_game_path()
        .ok_or(Error::GamePathNotSet)?;
      crate::mod_manager::file_permissions::ensure_file_writable(
        &game_path.join("game").join("citadel").join("gameinfo.gi"),
      )?;
      // A profile that still holds a pre-sharding layout must be spread across
      // shards before its search paths are written, or the extra `citadel/addonsN`
      // lines would be missing and the engine would silently drop everything
      // past the 99th pak file.
      self.migrate_profile_to_shards(profile_folder.clone())?;
      self.report_launch_step("checkingCompatibility");
      self.prepare_localization_overlay_with_progress(
        profile_folder.as_deref(),
        self.mod_compatibility_enabled(profile_folder.as_deref())?,
        || self.report_launch_step("mergingModData"),
      )?;
      self.report_launch_step("writingSearchPaths");
      self.apply_profile_gameinfo(profile_folder)?;
    }

    self.report_launch_step("applyingPerformance");
    self.reapply_performance_config();

    self.steam_manager.game_launch_request(&additional_args)
  }

  /// Tells the launch overlay which phase of `prepare_game_launch` is running.
  fn report_launch_step(&self, step: &str) {
    use tauri::Emitter;
    if let Some(app_handle) = &self.app_handle {
      let _ = app_handle.emit("launch-progress", step);
    }
  }

  fn validate_modded_launch_files(&self, profile_folder: Option<&str>) -> Result<(), Error> {
    let base = self.get_addons_path(profile_folder)?;
    // Recover staged files before checking, and check before migration can
    // reconcile missing manifest claims away.
    let manifest = ProfileVpkManifest::open_for_write(&base)?;
    let affected_mods: Vec<_> = manifest
      .mods
      .iter()
      .filter(|(mod_id, entry)| {
        entry.enabled && missing_mod_files(mod_id, entry, &base, None).is_some()
      })
      .map(|(mod_id, _)| crate::errors::MissingLaunchMod {
        id: mod_id.clone(),
        name: self
          .mod_repository
          .get_mod(mod_id)
          .map(|mod_info| mod_info.name.clone())
          .unwrap_or_else(|| mod_id.clone()),
      })
      .collect();
    if affected_mods.is_empty() {
      Ok(())
    } else {
      Err(Error::MissingEnabledModFiles(affected_mods))
    }
  }

  /// Puts the chosen performance config back into gameinfo.gi, which a game
  /// update or a reset may have replaced. A problem here never stops the
  /// launch: it is logged and reported to the frontend instead.
  pub(crate) fn reapply_performance_config(&self) {
    use crate::mod_manager::perf_config::{catalog, client_version, ops};
    use tauri::Emitter;

    let (Some(game_path), Ok(app_data_dir)) = (
      self.steam_manager.get_game_path(),
      self.get_app_local_data_path(),
    ) else {
      return;
    };
    let catalog = catalog::current();
    let ctx = ops::PerfContext {
      game_path: Some(game_path),
      app_data_dir: &app_data_dir,
      catalog: &catalog,
      build_id: client_version(game_path).map(|version| version.to_string()),
    };
    match ops::reapply_desired(&ctx, ops::HandEdits::Keep) {
      ops::ReapplyOutcome::Applied => log::info!("Re-applied performance config before launch"),
      ops::ReapplyOutcome::RemovedOrphan => {
        log::info!("Removed a performance config that is no longer chosen before launch")
      }
      ops::ReapplyOutcome::Failed(message) => {
        log::warn!("Could not re-apply performance config before launch: {message}");
        if let Some(app_handle) = &self.app_handle {
          let _ = app_handle.emit("performance-config-reapply-failed", message);
        }
      }
      ops::ReapplyOutcome::NothingDesired | ops::ReapplyOutcome::AlreadyInSync => {}
    }
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
    self.invalidate_localization_overlay(profile_folder.as_deref());
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

  pub fn set_app_handle(&mut self, app_handle: AppHandle) {
    self.app_handle = Some(app_handle);
  }

  pub fn get_app_local_data_path(&self) -> Result<std::path::PathBuf, Error> {
    let app_handle = self
      .app_handle
      .as_ref()
      .ok_or(Error::AppHandleNotInitialized)?;
    crate::runtime_environment::app_local_data_dir(app_handle).map_err(Error::Tauri)
  }

  pub fn get_mods_store_path(&self) -> Result<std::path::PathBuf, Error> {
    let app_handle = self
      .app_handle
      .as_ref()
      .ok_or(Error::AppHandleNotInitialized)?;
    crate::mod_manager::mods_store::dir(app_handle)
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
    if let Ok(directory) = self.get_app_local_data_path() {
      self
        .addons_backup_manager
        .set_repair_directory(directory.join("mod-folder-repair"));
    }
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
  pub(super) fn test_manager(game_path: &Path) -> ModManager {
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
      localization_overlay_plan_cache: Mutex::new(None),
    }
  }

  pub(super) fn game_dir() -> tempfile::TempDir {
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

  fn launch_world() -> (tempfile::TempDir, ModManager, ProfileBase) {
    let game = game_dir();
    fs::write(
      game.path().join("game/citadel/gameinfo.gi"),
      "\"GameInfo\"\n{\n\"FileSystem\"\n{\nSearchPaths\n{\nGame citadel\n}\n}\n}\n",
    )
    .unwrap();
    let steam = game.path().join("steam");
    fs::create_dir_all(steam.join("steamapps")).unwrap();
    for executable in ["steam.exe", "steam.sh", "steam"] {
      fs::write(steam.join(executable), b"fixture").unwrap();
    }
    let mut manager = test_manager(game.path());
    manager.set_steam_path(steam).unwrap();
    let base = manager.get_addons_path(Some("active")).unwrap();
    fs::create_dir_all(base.path()).unwrap();
    (game, manager, base)
  }

  fn launch_manifest(base: &ProfileBase) -> ProfileVpkManifest {
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "42",
      vec!["pak01_dir.vpk".into(), "pak02_dir.vpk".into()],
      vec!["skin.vpk".into(), "sound.vpk".into()],
      Some(0),
      ShardIndex::new(2).unwrap(),
    );
    manifest.save(base).unwrap();
    manifest
  }

  #[test]
  fn modded_launch_with_all_files_present_reapplies_gameinfo() {
    let (game, mut manager, base) = launch_world();
    launch_manifest(&base);
    let shard = base.shard_dir(ShardIndex::new(2).unwrap());
    fs::create_dir_all(&shard).unwrap();
    write_vpk(&shard, "pak01_dir.vpk");
    write_vpk(&shard, "pak02_dir.vpk");

    assert!(
      manager
        .prepare_game_launch(false, String::new(), Some("active".into()))
        .is_ok()
    );
    let gameinfo = fs::read_to_string(game.path().join("game/citadel/gameinfo.gi")).unwrap();
    assert!(gameinfo.contains("citadel/addons/active"));
    assert!(gameinfo.contains("citadel/addons2/active"));
  }

  #[test]
  fn modded_launch_with_missing_enabled_files_names_mod_and_preserves_gameinfo() {
    let (game, mut manager, base) = launch_world();
    let manifest = launch_manifest(&base);
    let shard = base.shard_dir(ShardIndex::new(2).unwrap());
    fs::create_dir_all(&shard).unwrap();
    write_vpk(&shard, "pak01_dir.vpk");
    manager.mod_repository.add_mod(Mod {
      id: "42".into(),
      name: "Fixture skin and sound".into(),
      is_map: false,
      installed_vpks: Vec::new(),
      file_tree: None,
      install_order: None,
      original_vpk_names: Vec::new(),
    });
    let gameinfo = game.path().join("game/citadel/gameinfo.gi");
    let before = fs::read(&gameinfo).unwrap();

    let result = manager.prepare_game_launch(false, String::new(), Some("active".into()));
    assert!(matches!(&result, Err(Error::MissingEnabledModFiles(mods))
      if mods.len() == 1 && mods[0].id == "42" && mods[0].name == "Fixture skin and sound"));
    assert_eq!(fs::read(gameinfo).unwrap(), before);
    assert_eq!(ProfileVpkManifest::load(&base).unwrap(), manifest);
  }

  #[test]
  fn modded_launch_with_missing_disabled_files_is_allowed() {
    let (_game, mut manager, base) = launch_world();
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_disabled("42", vec!["42_skin.vpk".into()], vec!["skin.vpk".into()]);
    manifest.save(&base).unwrap();

    assert!(
      manager
        .prepare_game_launch(false, String::new(), Some("active".into()))
        .is_ok()
    );
  }

  #[test]
  fn vanilla_launch_does_not_check_missing_enabled_files() {
    let (_game, mut manager, base) = launch_world();
    launch_manifest(&base);

    assert!(
      manager
        .prepare_game_launch(true, String::new(), Some("active".into()))
        .is_ok()
    );
  }

  #[test]
  fn modded_launch_reports_all_missing_mods_after_repository_hydration() {
    let (_game, mut manager, base) = launch_world();
    let mut manifest = launch_manifest(&base);
    manifest.mark_enabled(
      "43",
      vec!["pak03_dir.vpk".into()],
      vec!["other.vpk".into()],
      Some(1),
      ShardIndex::FIRST,
    );
    manifest.save(&base).unwrap();
    manager
      .hydrate_mods_from_manifest(Some("active".into()))
      .unwrap();

    let result = manager.prepare_game_launch(false, String::new(), Some("active".into()));
    assert!(matches!(result, Err(Error::MissingEnabledModFiles(mods))
      if mods.iter().map(|mod_info| mod_info.id.as_str()).collect::<Vec<_>>() == vec!["42", "43"]));
  }

  #[test]
  fn variant_swap_uses_manifest_mapping_instead_of_ui_tree_order() {
    let game = game_dir();
    let addons = game.path().join("game/citadel/addons");
    fs::create_dir_all(&addons).unwrap();
    fs::write(addons.join("pak01_dir.vpk"), b"blue bytes").unwrap();
    fs::write(addons.join("pak02_dir.vpk"), b"red bytes").unwrap();
    let base = crate::mod_manager::shard::ProfileBase::new(addons.clone()).unwrap();
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "42",
      vec!["pak01_dir.vpk".into(), "pak02_dir.vpk".into()],
      vec!["blue.vpk".into(), "red.vpk".into()],
      Some(0),
      shard::ShardIndex::FIRST,
    );
    manifest.save(&base).unwrap();
    let result = test_manager(game.path())
      .apply_variant_selection(
        "42",
        None,
        &["pak01_dir.vpk".into(), "pak02_dir.vpk".into()],
        &["red.vpk".into(), "blue.vpk".into()],
        vec!["blue.vpk".into()],
      )
      .unwrap();
    assert_eq!(result.original_vpk_names, vec!["blue.vpk"]);
    assert_eq!(
      fs::read(addons.join(&result.installed_vpks[0])).unwrap(),
      b"blue bytes"
    );
    assert_eq!(fs::read(addons.join("42_red.vpk")).unwrap(), b"red bytes");
    let saved = ProfileVpkManifest::load(&base).unwrap();
    assert_eq!(saved.mods["42"].original_vpk_names, vec!["blue.vpk"]);
    assert_eq!(saved.mods["42"].current_vpks, result.installed_vpks);
  }

  #[test]
  fn reorder_by_remote_id_reorders_files_inside_a_mod() {
    let game = game_dir();
    let addons = game.path().join("game/citadel/addons");
    fs::create_dir_all(&addons).unwrap();
    fs::write(addons.join("pak01_dir.vpk"), b"blue bytes").unwrap();
    fs::write(addons.join("pak02_dir.vpk"), b"red bytes").unwrap();
    let base = crate::mod_manager::shard::ProfileBase::new(addons.clone()).unwrap();
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "42",
      vec!["pak01_dir.vpk".into(), "pak02_dir.vpk".into()],
      vec!["blue.vpk".into(), "red.vpk".into()],
      Some(0),
      shard::ShardIndex::FIRST,
    );
    manifest.save(&base).unwrap();

    test_manager(game.path())
      .reorder_mods_by_remote_id(
        vec![(
          "42".into(),
          vec!["pak02_dir.vpk".into(), "pak01_dir.vpk".into()],
          0,
        )],
        None,
      )
      .unwrap();

    assert_eq!(
      fs::read(addons.join("pak01_dir.vpk")).unwrap(),
      b"red bytes"
    );
    assert_eq!(
      fs::read(addons.join("pak02_dir.vpk")).unwrap(),
      b"blue bytes"
    );
    let saved = ProfileVpkManifest::load(&base).unwrap();
    assert_eq!(
      saved.mods["42"].original_vpk_names,
      vec!["red.vpk", "blue.vpk"]
    );
  }

  #[test]
  fn variant_swap_enables_the_selection_in_the_given_order() {
    let game = game_dir();
    let addons = game.path().join("game/citadel/addons");
    fs::create_dir_all(&addons).unwrap();
    fs::write(addons.join("42_blue.vpk"), b"blue bytes").unwrap();
    fs::write(addons.join("42_red.vpk"), b"red bytes").unwrap();
    let result = test_manager(game.path())
      .apply_variant_selection(
        "42",
        None,
        &[],
        &[],
        vec!["red.vpk".into(), "blue.vpk".into()],
      )
      .unwrap();
    assert_eq!(result.original_vpk_names, vec!["red.vpk", "blue.vpk"]);
    assert_eq!(
      fs::read(addons.join(&result.installed_vpks[0])).unwrap(),
      b"red bytes"
    );
  }

  #[test]
  fn reenable_keeps_deselected_variants_inactive() {
    let game = game_dir();
    let citadel = game.path().join("game/citadel");
    fs::write(
      citadel.join("gameinfo.gi"),
      "\"GameInfo\"\n{\n\"FileSystem\"\n{\nSearchPaths\n{\nGame citadel\n}\n}\n}\n",
    )
    .unwrap();
    let addons = citadel.join("addons");
    fs::create_dir_all(&addons).unwrap();
    fs::write(addons.join("42_blue.vpk"), b"chosen blue").unwrap();
    fs::write(addons.join("42_red.vpk"), b"inactive red").unwrap();
    let file_tree = ModFileTree::from_options(
      &["blue.vpk".into(), "red.vpk".into()],
      &HashSet::from(["blue.vpk".into()]),
    );
    let mut manager = test_manager(game.path());
    // Arrange only the throwaway install; this variant test must not depend on
    // whether the user is running Deadlock elsewhere on the machine.
    manager
      .config_manager
      .setup_game_for_mods(game.path())
      .unwrap();
    let installed = manager
      .install_mod(
        Mod {
          id: "42".into(),
          name: "Variant fixture".into(),
          is_map: false,
          installed_vpks: Vec::new(),
          file_tree: Some(file_tree),
          install_order: None,
          original_vpk_names: Vec::new(),
        },
        None,
      )
      .unwrap();
    assert_eq!(installed.original_vpk_names, vec!["blue.vpk"]);
    assert_eq!(installed.installed_vpks.len(), 1);
    assert_eq!(
      fs::read(addons.join(&installed.installed_vpks[0])).unwrap(),
      b"chosen blue"
    );
    assert_eq!(
      fs::read(addons.join("42_red.vpk")).unwrap(),
      b"inactive red"
    );
    let manifest = ProfileVpkManifest::load(&ProfileBase::new(addons).unwrap()).unwrap();
    assert_eq!(manifest.mods["42"].original_vpk_names, vec!["blue.vpk"]);
    assert_eq!(manifest.mods["42"].current_vpks, installed.installed_vpks);
  }

  #[test]
  fn reenable_without_file_tree_keeps_the_disabled_file_order() {
    let game = game_dir();
    let citadel = game.path().join("game/citadel");
    fs::write(
      citadel.join("gameinfo.gi"),
      "\"GameInfo\"\n{\n\"FileSystem\"\n{\nSearchPaths\n{\nGame citadel\n}\n}\n}\n",
    )
    .unwrap();
    let addons = citadel.join("addons");
    fs::create_dir_all(&addons).unwrap();
    fs::write(addons.join("42_blue.vpk"), b"blue bytes").unwrap();
    fs::write(addons.join("42_red.vpk"), b"red bytes").unwrap();
    let base = ProfileBase::new(addons.clone()).unwrap();
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_disabled(
      "42",
      vec!["42_red.vpk".into(), "42_blue.vpk".into()],
      vec!["red.vpk".into(), "blue.vpk".into()],
    );
    manifest.save(&base).unwrap();
    let mut manager = test_manager(game.path());
    manager
      .config_manager
      .setup_game_for_mods(game.path())
      .unwrap();

    let installed = manager
      .install_mod(
        Mod {
          id: "42".into(),
          name: "Ordered fixture".into(),
          is_map: false,
          installed_vpks: Vec::new(),
          file_tree: None,
          install_order: None,
          original_vpk_names: Vec::new(),
        },
        None,
      )
      .unwrap();

    assert_eq!(installed.original_vpk_names, vec!["red.vpk", "blue.vpk"]);
    assert_eq!(
      fs::read(addons.join(&installed.installed_vpks[0])).unwrap(),
      b"red bytes"
    );
  }

  #[test]
  fn reenable_returns_mod_to_its_place_in_a_sharded_profile() {
    let game = game_dir();
    let citadel = game.path().join("game/citadel");
    fs::write(
      citadel.join("gameinfo.gi"),
      "\"GameInfo\"\n{\n\"FileSystem\"\n{\nSearchPaths\n{\nGame citadel\n}\n}\n}\n",
    )
    .unwrap();
    let addons = citadel.join("addons");
    fs::create_dir_all(&addons).unwrap();
    let base = ProfileBase::new(addons.clone()).unwrap();
    let shard_two = ShardIndex::new(2).unwrap();
    fs::create_dir_all(base.shard_dir(shard_two)).unwrap();

    // 100 ordered mods: mod03 is disabled, leaving a hole in the full base
    // shard, and mod99 sits alone in shard 2.
    let id = |i: u32| format!("mod{i:02}");
    let mut manifest = ProfileVpkManifest::default();
    for i in 0..100u32 {
      if i == 3 {
        let source = tempfile::tempdir().unwrap();
        fs::write(source.path().join("readme.txt"), id(i)).unwrap();
        vpkmanager::pack_directory(source.path(), &addons.join("mod03_mod03.vpk")).unwrap();
        manifest.mark_disabled(
          &id(i),
          vec!["mod03_mod03.vpk".into()],
          vec!["mod03.vpk".into()],
        );
        manifest.mods.get_mut(&id(i)).unwrap().order = Some(i);
        continue;
      }
      let (shard, vpk) = if i == 99 {
        (shard_two, "pak01_dir.vpk".to_string())
      } else {
        (ShardIndex::FIRST, format!("pak{:02}_dir.vpk", i + 1))
      };
      fs::write(base.shard_dir(shard).join(&vpk), id(i)).unwrap();
      manifest.mark_enabled(
        &id(i),
        vec![vpk],
        vec![format!("{}.vpk", id(i))],
        Some(i),
        shard,
      );
    }
    manifest.save(&base).unwrap();

    let expected_vpk = fs::read(addons.join("mod03_mod03.vpk")).unwrap();
    let installed = test_manager(game.path())
      .install_mod(
        Mod {
          id: id(3),
          name: "Re-enabled".into(),
          is_map: false,
          installed_vpks: Vec::new(),
          file_tree: None,
          install_order: None,
          original_vpk_names: Vec::new(),
        },
        None,
      )
      .unwrap();

    let manifest = ProfileVpkManifest::load(&base).unwrap();
    let mut load_order: Vec<_> = manifest
      .mods
      .iter()
      .map(|(mod_id, entry)| {
        assert!(entry.enabled, "{mod_id} is enabled");
        let pak = VpkManager::enabled_vpk_number(&entry.current_vpks[0]).unwrap();
        ((entry.shard, pak), mod_id.clone())
      })
      .collect();
    load_order.sort();
    assert_eq!(
      load_order
        .into_iter()
        .map(|(_, mod_id)| mod_id)
        .collect::<Vec<_>>(),
      (0..100u32).map(id).collect::<Vec<_>>()
    );
    let entry = &manifest.mods[&id(3)];
    assert_eq!(entry.shard, ShardIndex::FIRST);
    assert_eq!(installed.installed_vpks, entry.current_vpks);
    assert_eq!(
      fs::read(addons.join(&entry.current_vpks[0])).unwrap(),
      expected_vpk
    );
    assert_eq!(manifest.mods[&id(99)].shard, shard_two);
    assert_eq!(count_enabled(&addons), 99);
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

    assert_eq!(result, 1);
    assert!(!base.shard_dir(shard_two).join("pak01_dir.vpk").exists());
    assert_eq!(fs::read(base.join("pak01_dir.vpk")).unwrap(), b"other");
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

    assert_eq!(result, 1);
    assert!(!base.shard_dir(shard_two).join("pak01_dir.vpk").exists());
    assert_eq!(fs::read(base.join("pak01_dir.vpk")).unwrap(), b"other");
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

    assert_eq!(result, 1);
    assert_eq!(fs::read(base.join("pak01_dir.vpk")).unwrap(), b"other");
    assert!(!base.join("pak02_dir.vpk").exists());
    let after = ProfileVpkManifest::load(&base).unwrap();
    assert!(after.mods.contains_key("other"));
    assert!(!after.mods.contains_key("target"));
  }

  #[test]
  fn update_mod_from_prepared_keeps_disabled_files_out_of_game() {
    for previously_managed in [false, true] {
      let game = game_dir();
      let addons_path = game.path().join("game").join("citadel").join("addons");
      fs::create_dir_all(&addons_path).unwrap();
      let base = ProfileBase::new(&addons_path).unwrap();
      let mut manifest = ProfileVpkManifest::default();
      if previously_managed {
        fs::write(base.join("target_old.vpk"), b"old").unwrap();
        manifest.mark_disabled(
          "target",
          vec!["target_old.vpk".into()],
          vec!["old.vpk".into()],
        );
        manifest.save(&base).unwrap();
      }
      fs::write(base.join("other_saved.vpk"), b"other").unwrap();
      let prepared = game.path().join("new.vpk");
      fs::write(&prepared, b"new").unwrap();
      let updated = test_manager(game.path())
        .update_mod_from_prepared("target", "Target", &[prepared], None, None, false)
        .unwrap();
      assert!(updated.installed_vpks.is_empty());
      assert_eq!(fs::read(base.join("target_new.vpk")).unwrap(), b"new");
      assert!(!base.join("target_old.vpk").exists());
      assert!(!base.join("pak01_dir.vpk").exists());
      assert_eq!(fs::read(base.join("other_saved.vpk")).unwrap(), b"other");
      let manifest = ProfileVpkManifest::load(&base).unwrap();
      let entry = &manifest.mods["target"];
      assert!(!entry.enabled);
      assert!(entry.current_vpks.is_empty());
      assert_eq!(entry.disabled_vpks, vec!["target_new.vpk"]);
      assert_eq!(entry.original_vpk_names, vec!["new.vpk"]);
    }
  }

  #[test]
  fn update_mod_from_prepared_restores_disabled_files_on_failure() {
    let game = game_dir();
    let addons_path = game.path().join("game").join("citadel").join("addons");
    fs::create_dir_all(&addons_path).unwrap();
    let base = ProfileBase::new(&addons_path).unwrap();
    let mut manifest = ProfileVpkManifest::default();
    fs::write(base.join("target_old.vpk"), b"old").unwrap();
    manifest.mark_disabled(
      "target",
      vec!["target_old.vpk".into()],
      vec!["old.vpk".into()],
    );
    manifest.save(&base).unwrap();
    let prepared = game.path().join("missing.vpk");
    assert!(
      test_manager(game.path())
        .update_mod_from_prepared("target", "Target", &[prepared], None, None, false)
        .is_err()
    );
    assert_eq!(fs::read(base.join("target_old.vpk")).unwrap(), b"old");
    assert!(!base.join("target_missing.vpk").exists());
    let restored = ProfileVpkManifest::load(&base).unwrap();
    assert!(!restored.mods["target"].enabled);
    assert_eq!(
      restored.mods["target"].disabled_vpks,
      manifest.mods["target"].disabled_vpks
    );
  }

  #[test]
  fn update_mod_from_prepared_clears_only_that_mods_parked_files() {
    let game = game_dir();
    let addons_path = game.path().join("game").join("citadel").join("addons");
    fs::create_dir_all(&addons_path).unwrap();
    let base = crate::mod_manager::shard::ProfileBase::new(&addons_path).unwrap();
    let mut manifest = ProfileVpkManifest::default();
    write_owned_mod(
      &base,
      &mut manifest,
      "target",
      ShardIndex::FIRST,
      "pak01_dir.vpk",
      b"old-red",
    );
    manifest.save(&base).unwrap();
    fs::write(base.join("target_pak01-blue_dir.vpk"), b"old-blue").unwrap();
    fs::write(base.join("other_pak01-blue_dir.vpk"), b"other-blue").unwrap();
    let prepared = game.path().join("pak01-red_dir.vpk");
    fs::write(&prepared, b"new-red").unwrap();

    test_manager(game.path())
      .update_mod_from_prepared(
        "target",
        "Target",
        std::slice::from_ref(&prepared),
        None,
        None,
        true,
      )
      .unwrap();

    assert_eq!(fs::read(base.join("pak01_dir.vpk")).unwrap(), b"new-red");
    assert!(!base.join("target_pak01-blue_dir.vpk").exists());
    assert_eq!(
      fs::read(base.join("other_pak01-blue_dir.vpk")).unwrap(),
      b"other-blue"
    );
  }

  #[test]
  fn update_mod_from_prepared_enables_files_in_name_order() {
    let game = game_dir();
    let addons_path = game.path().join("game").join("citadel").join("addons");
    fs::create_dir_all(&addons_path).unwrap();
    let prepared_dir = game.path().join("prepared");
    fs::create_dir_all(&prepared_dir).unwrap();
    let red = prepared_dir.join("red.vpk");
    let blue = prepared_dir.join("blue.vpk");
    fs::write(&red, b"red").unwrap();
    fs::write(&blue, b"blue").unwrap();
    let updated = test_manager(game.path())
      .update_mod_from_prepared("target", "Target", &[red, blue], None, None, true)
      .unwrap();
    assert_eq!(updated.original_vpk_names, ["blue.vpk", "red.vpk"]);
    assert_eq!(
      fs::read(addons_path.join(&updated.installed_vpks[0])).unwrap(),
      b"blue"
    );
  }

  #[test]
  fn update_mod_from_prepared_enables_files_in_file_tree_order() {
    let game = game_dir();
    let addons_path = game.path().join("game").join("citadel").join("addons");
    fs::create_dir_all(&addons_path).unwrap();
    let prepared_dir = game.path().join("prepared");
    fs::create_dir_all(&prepared_dir).unwrap();
    let red = prepared_dir.join("red.vpk");
    let blue = prepared_dir.join("blue.vpk");
    fs::write(&red, b"red").unwrap();
    fs::write(&blue, b"blue").unwrap();
    let names = ["red.vpk".to_string(), "blue.vpk".to_string()];
    let tree = ModFileTree::from_options(&names, &names.iter().cloned().collect());
    let updated = test_manager(game.path())
      .update_mod_from_prepared("target", "Target", &[blue, red], Some(tree), None, true)
      .unwrap();
    assert_eq!(updated.original_vpk_names, ["red.vpk", "blue.vpk"]);
    assert_eq!(
      fs::read(addons_path.join(&updated.installed_vpks[0])).unwrap(),
      b"red"
    );
  }

  #[test]
  fn update_mod_from_prepared_replaces_files_without_touching_other_mods() {
    let game = game_dir();
    let addons_path = game.path().join("game").join("citadel").join("addons");
    fs::create_dir_all(&addons_path).unwrap();
    let base = crate::mod_manager::shard::ProfileBase::new(&addons_path).unwrap();
    let mut manifest = ProfileVpkManifest::default();
    write_owned_mod(
      &base,
      &mut manifest,
      "target",
      ShardIndex::FIRST,
      "pak01_dir.vpk",
      b"old-target",
    );
    write_owned_mod(
      &base,
      &mut manifest,
      "other",
      ShardIndex::FIRST,
      "pak02_dir.vpk",
      b"other",
    );
    manifest.save(&base).unwrap();

    let prepared_dir = game.path().join("prepared");
    fs::create_dir_all(&prepared_dir).unwrap();
    let prepared = prepared_dir.join("replacement.vpk");
    fs::write(&prepared, b"new-target").unwrap();

    let mut manager = test_manager(game.path());
    let preserved_tree = crate::mod_manager::file_tree::ModFileTree {
      files: vec![],
      total_files: 0,
      has_multiple_files: false,
    };
    manager.mod_repository.add_mod(Mod {
      id: "target".into(),
      name: "Original map".into(),
      is_map: true,
      installed_vpks: vec!["pak01_dir.vpk".into()],
      file_tree: Some(preserved_tree.clone()),
      install_order: Some(0),
      original_vpk_names: vec!["original.vpk".into()],
    });
    let overlay_path = game
      .path()
      .join("game")
      .join(ModManager::localization_overlay_search_path(None))
      .join(crate::mod_manager::localization_overlay::OVERLAY_VPK_NAME);
    fs::create_dir_all(overlay_path.parent().unwrap()).unwrap();
    fs::write(&overlay_path, b"stale merged data").unwrap();
    let updated = manager
      .update_mod_from_prepared(
        "target",
        "Target",
        std::slice::from_ref(&prepared),
        None,
        None,
        true,
      )
      .unwrap();

    assert!(
      !overlay_path.exists(),
      "updating a mod must invalidate merged data"
    );
    assert!(updated.is_map);
    assert_eq!(
      updated.file_tree.as_ref().unwrap().total_files,
      preserved_tree.total_files
    );
    assert_eq!(updated.name, "Target");

    assert_eq!(updated.installed_vpks, vec!["pak01_dir.vpk".to_string()]);
    assert_eq!(fs::read(base.join("pak01_dir.vpk")).unwrap(), b"new-target");
    assert_eq!(fs::read(base.join("pak02_dir.vpk")).unwrap(), b"other");
    let after = ProfileVpkManifest::load(&base).unwrap();
    assert_eq!(
      after.mods["target"].original_vpk_names,
      vec!["replacement.vpk".to_string()]
    );
    assert!(after.mods.contains_key("other"));
    manager
      .replace_mod_vpks("target".into(), vec![prepared], vec![], None)
      .unwrap();
    let replaced = manager.mod_repository.get_mod("target").unwrap();
    assert_eq!(replaced.name, "Target");
    assert!(replaced.is_map);
    assert!(replaced.file_tree.is_some());
  }
  #[test]
  fn forget_orphaned_mods_drops_only_mods_without_any_file() {
    let game = game_dir();
    let addons = game.path().join("game/citadel/addons");
    fs::create_dir_all(&addons).unwrap();
    write_vpk(&addons, "pak02_dir.vpk");
    let base = ProfileBase::new(addons).unwrap();
    let mut manifest = ProfileVpkManifest::default();
    for (mod_id, vpk) in [("gone", "pak01_dir.vpk"), ("present", "pak02_dir.vpk")] {
      manifest.mark_enabled(
        mod_id,
        vec![vpk.into()],
        vec![format!("{mod_id}.vpk")],
        Some(0),
        ShardIndex::FIRST,
      );
    }
    manifest.save(&base).unwrap();
    let bytes_before = fs::read(base.join("pak02_dir.vpk")).unwrap();

    let mut manager = test_manager(game.path());
    let forgotten = manager
      .forget_orphaned_mods(&["gone".into(), "present".into(), "unknown".into()], None)
      .unwrap();

    assert_eq!(forgotten, vec!["gone".to_string()]);
    let saved = ProfileVpkManifest::load(&base).unwrap();
    assert!(!saved.mods.contains_key("gone"));
    assert!(saved.mods.contains_key("present"));
    assert_eq!(fs::read(base.join("pak02_dir.vpk")).unwrap(), bytes_before);
  }
}
