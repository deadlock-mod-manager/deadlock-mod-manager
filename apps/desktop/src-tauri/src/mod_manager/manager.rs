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
  steam_manager::SteamManager,
  vpk_manager::VpkManager,
  vpk_manifest::ProfileVpkManifest,
};
use log;
use std::{
  collections::HashSet,
  path::{Component, Path, PathBuf},
};
use tauri::Manager;

const UNORDERED_FALLBACK_ORDER: u32 = u32::MAX;

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

  fn vpk_filenames(vpks: &[String]) -> Vec<String> {
    vpks
      .iter()
      .map(|vpk| {
        std::path::Path::new(vpk)
          .file_name()
          .map(|f| f.to_string_lossy().to_string())
          .unwrap_or_else(|| vpk.clone())
      })
      .collect()
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
    let game_path = self.find_game()?;

    // Toggle mods based on vanilla flag
    if vanilla {
      log::info!("Disabling mods...");
      self.toggle_mods(vanilla)?;
    } else {
      log::info!("Enabling mods for profile: {:?}...", profile_folder);
      // Use update_mod_path to set the correct profile folder path
      self
        .config_manager
        .update_mod_path(&game_path, profile_folder)?;
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

    log::info!("Adding mod to managed mods list");
    self.mod_repository.add_mod(deadlock_mod.clone());

    let mut manifest = ProfileVpkManifest::load(&addons_path)?;
    manifest.mark_enabled(
      &deadlock_mod.id,
      deadlock_mod.installed_vpks.clone(),
      deadlock_mod.original_vpk_names.clone(),
      deadlock_mod.install_order,
    );
    manifest.save(&addons_path)?;

    // If the mod has an install order, trigger a reorder to maintain correct sequence
    if deadlock_mod.install_order.is_some() {
      log::info!("Mod has install order, triggering reorder to maintain sequence");
      self.reorder_all_mods_for_profile(profile_folder)?;
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

    let prefixed_vpks =
      self
        .vpk_manager
        .disable_vpks(&addons_path, &mod_id, &installed_vpks, &original_vpk_names)?;

    manifest.mark_disabled(&mod_id, prefixed_vpks.clone(), original_vpk_names);
    manifest.save(&addons_path)?;

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

    let addons_path = self.get_addons_path(profile_folder.as_deref())?;
    let mut manifest = ProfileVpkManifest::load(&addons_path)?;
    let mut vpks_to_remove = manifest
      .mods
      .get(&mod_id)
      .map(|entry| entry.current_vpks.clone())
      .unwrap_or_default();

    if !addons_path.exists() {
      return Err(Error::GamePathNotSet);
    }

    if let Some(local_mod) = self.mod_repository.get_mod(&mod_id).cloned() {
      log::info!("Mod found in memory: {}", local_mod.name);
      vpks_to_remove.extend(local_mod.installed_vpks);
    } else {
      vpks_to_remove.extend(vpks);
    }

    let mut seen_vpks = HashSet::new();
    vpks_to_remove.retain(|vpk| seen_vpks.insert(vpk.clone()));

    if !vpks_to_remove.is_empty() {
      self
        .vpk_manager
        .remove_vpks(&vpks_to_remove, &addons_path)?;
    }
    self
      .vpk_manager
      .remove_vpks_by_mod_id(&addons_path, &mod_id)?;

    manifest.remove_mod(&mod_id);
    manifest.save(&addons_path)?;

    self.mod_repository.remove_mod(&mod_id);

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

  /// Reorder all mods based on their current install_order for a specific profile
  fn reorder_all_mods_for_profile(&mut self, profile_folder: Option<String>) -> Result<(), Error> {
    let addons_path = self.get_addons_path(profile_folder.as_deref())?;

    log::info!("Reordering all mods based on install order for profile: {profile_folder:?}");

    let mut manifest = ProfileVpkManifest::load(&addons_path)?;
    let mut ordered_manifest_entries: Vec<(String, u32, Vec<String>)> = manifest
      .mods
      .iter()
      .filter(|(_, entry)| entry.enabled && !entry.current_vpks.is_empty())
      .map(|(mod_id, entry)| {
        (
          mod_id.clone(),
          entry.order.unwrap_or(UNORDERED_FALLBACK_ORDER),
          entry.current_vpks.clone(),
        )
      })
      .collect();
    ordered_manifest_entries.sort_by_key(|(_, order, _)| *order);

    let mod_vpk_mapping: Vec<(String, Vec<String>)> = ordered_manifest_entries
      .into_iter()
      .map(|(mod_id, _, vpks)| (mod_id, vpks))
      .collect();

    if mod_vpk_mapping.is_empty() {
      log::info!("No enabled manifest VPKs need reordering");
      return Ok(());
    }

    let updated_vpk_mappings = self
      .vpk_manager
      .reorder_vpks(&mod_vpk_mapping, &addons_path)?;

    for (mod_id, new_vpk_names) in updated_vpk_mappings {
      if let Some(entry) = manifest.mods.get_mut(&mod_id) {
        entry.enabled = true;
        entry.current_vpks = new_vpk_names.clone();
        entry.disabled_vpks.clear();
      }

      if let Some(mut mod_entry) = self.mod_repository.remove_mod(&mod_id) {
        mod_entry.installed_vpks = new_vpk_names;
        self.mod_repository.add_mod(mod_entry);
      }
    }

    manifest.save(&addons_path)?;

    log::info!("All mods reordered successfully");
    Ok(())
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
      let was_known = manifest.mods.contains_key(&remote_id);
      let entry = manifest.mods.entry(remote_id.clone()).or_default();
      if entry.order != Some(order) {
        entry.order = Some(order);
        manifest_changed = true;
      }

      if !was_known && !vpk_files.is_empty() {
        entry.enabled = true;
        entry.current_vpks = vpk_files;
        manifest_changed = true;
      }

      if entry.enabled && !entry.current_vpks.is_empty() {
        mod_vpk_mapping.push((remote_id, entry.current_vpks.clone()));
      }
    }

    if mod_vpk_mapping.is_empty() {
      if manifest_changed {
        manifest.save(&addons_path)?;
      }
      log::warn!("No enabled VPK mappings available to reorder");
      return Ok(Vec::new());
    }

    // Reorder the VPK files and get the updated mappings
    let updated_mappings = self
      .vpk_manager
      .reorder_vpks(&mod_vpk_mapping, &addons_path)?;

    for (remote_id, new_vpks) in &updated_mappings {
      if let Some(entry) = manifest.mods.get_mut(remote_id) {
        entry.enabled = true;
        entry.current_vpks = new_vpks.clone();
        entry.disabled_vpks.clear();
      }

      if let Some(mut mod_entry) = self.mod_repository.remove_mod(remote_id) {
        mod_entry.installed_vpks = new_vpks.clone();
        self.mod_repository.add_mod(mod_entry);
      }
    }

    manifest.save(&addons_path)?;

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
        if entry.enabled && !entry.current_vpks.is_empty() {
          mod_vpk_mapping.push((mod_id.clone(), entry.current_vpks.clone()));
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
    let updated_vpk_mappings = self
      .vpk_manager
      .reorder_vpks(&mod_vpk_mapping, &addons_path)?;

    // Update mod data with new VPK names and re-add to repository
    let mut result_mods = Vec::new();
    for (mod_id, new_vpk_names) in updated_vpk_mappings {
      if let Some(entry) = manifest.mods.get_mut(&mod_id) {
        entry.enabled = true;
        entry.current_vpks = new_vpk_names.clone();
        entry.disabled_vpks.clear();
      }

      if let Some(index) = updated_mods
        .iter()
        .position(|mod_entry| mod_entry.id == mod_id)
      {
        let mut deadlock_mod = updated_mods.remove(index);
        deadlock_mod.installed_vpks = new_vpk_names;
        self.mod_repository.add_mod(deadlock_mod.clone());
        result_mods.push(deadlock_mod);
      }
    }

    for deadlock_mod in updated_mods {
      self.mod_repository.add_mod(deadlock_mod);
    }

    manifest.save(&addons_path)?;

    log::info!("Successfully reordered {} mods", result_mods.len());
    Ok(result_mods)
  }

  pub fn clear_mods(&mut self, profile_folder: Option<String>) -> Result<(), Error> {
    let addons_path = self.get_addons_path(profile_folder.as_deref())?;

    self.vpk_manager.clear_all_vpks(&addons_path)?;
    ProfileVpkManifest::default().save(&addons_path)?;
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
      log::info!(
        "Hydrated {hydrated} mods from manifest for profile {profile_folder:?}"
      );
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
    let (installed_vpks, original_names) = if let Some(entry) = manifest.mods.get(&mod_id)
      && !entry.current_vpks.is_empty()
    {
      log::info!("Using manifest VPKs for replacement");
      (entry.current_vpks.clone(), entry.original_vpk_names.clone())
    } else if !installed_vpks_from_frontend.is_empty() {
      log::info!("Using installed VPKs from frontend");
      (installed_vpks_from_frontend, Vec::new())
    } else if let Some(mod_info) = self.mod_repository.get_mod(&mod_id) {
      log::info!("Found mod in repository: {mod_id}");
      (
        mod_info.installed_vpks.clone(),
        mod_info.original_vpk_names.clone(),
      )
    } else {
      log::info!(
        "Mod not in repository and no installed VPKs provided, will find VPKs by prefix: {mod_id}"
      );
      // Mod not in repository - it might be disabled or the repository wasn't loaded
      // We'll let replace_vpks find the prefixed VPKs directly
      (Vec::new(), Vec::new())
    };

    // Use VpkManager to replace the files
    self.vpk_manager.replace_vpks(
      &addons_path,
      &mod_id,
      &source_vpk_paths,
      &installed_vpks,
      &original_names,
    )?;

    let new_original_names: Vec<String> = source_vpk_paths
      .iter()
      .filter_map(|p| p.file_name().map(|f| f.to_string_lossy().to_string()))
      .collect();

    let mut manifest = ProfileVpkManifest::load(&addons_path)?;
    if installed_vpks.is_empty() {
      let prefixed_vpks = self
        .vpk_manager
        .find_prefixed_vpks(&addons_path, &mod_id)?;
      manifest.mark_disabled(&mod_id, prefixed_vpks, new_original_names);
    } else {
      manifest.mark_enabled(&mod_id, installed_vpks, new_original_names, None);
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
  use super::ModManager;

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
}
