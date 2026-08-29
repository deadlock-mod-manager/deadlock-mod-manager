//! Developer-mode diagnostics for addon VPK sharding.

use super::state::MANAGER;
use crate::errors::Error;
use crate::mod_manager::shard_report::{self, ShardReport, ShardReportInput};
use vpkmanager::ledger::ProfileLedger;

#[tauri::command]
pub async fn get_shard_diagnostics(profile_folder: Option<String>) -> Result<ShardReport, Error> {
  let mod_manager = MANAGER
    .lock()
    .map_err(|_| Error::BackgroundTaskFailed("Mod manager lock poisoned".to_string()))?;
  let game_path = mod_manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?
    .clone();
  let base = mod_manager.get_addons_path(profile_folder.as_deref())?;
  let manifest = ProfileLedger::load(&base)?;

  Ok(shard_report::analyze(ShardReportInput {
    base: &base,
    manifest: &manifest,
    expected_search_paths: mod_manager.profile_gameinfo_paths(profile_folder.clone())?,
    gameinfo_search_paths: mod_manager
      .get_config_manager()
      .marker_addons_paths(&game_path)?,
    needs_migration: mod_manager.profile_needs_shard_migration(profile_folder.as_deref())?,
    profile_folder,
  }))
}

/// Force the shard layout and gameinfo.gi search paths back into agreement with
/// the manifest, without waiting for a profile switch.
#[tauri::command]
pub async fn resync_profile_shards(profile_folder: Option<String>) -> Result<(), Error> {
  log::info!("Resyncing shards for profile: {profile_folder:?}");
  let mut mod_manager = MANAGER
    .lock()
    .map_err(|_| Error::BackgroundTaskFailed("Mod manager lock poisoned".to_string()))?;
  mod_manager.migrate_profile_to_shards(profile_folder.clone())?;
  mod_manager.apply_profile_gameinfo(profile_folder)
}
