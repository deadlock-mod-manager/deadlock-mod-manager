use super::state::MANAGER;
use crate::errors::Error;
use crate::mod_manager::conflicts::{self, ConflictIgnoreAction, ProfileConflicts};
use crate::mod_manager::shard::ProfileBase;

fn profile_base(profile_folder: Option<&str>) -> Result<ProfileBase, Error> {
  MANAGER.lock().unwrap().get_addons_path(profile_folder)
}

#[tauri::command]
pub async fn get_profile_conflicts(
  profile_folder: Option<String>,
) -> Result<ProfileConflicts, Error> {
  let base = profile_base(profile_folder.as_deref())?;
  tauri::async_runtime::spawn_blocking(move || conflicts::detect_profile_conflicts(&base))
    .await
    .map_err(|e| Error::InvalidInput(format!("Conflict scan task failed: {e}")))?
}

#[tauri::command]
pub async fn update_conflict_ignores(
  profile_folder: Option<String>,
  actions: Vec<ConflictIgnoreAction>,
) -> Result<(), Error> {
  let base = profile_base(profile_folder.as_deref())?;
  tauri::async_runtime::spawn_blocking(move || {
    conflicts::update_profile_conflict_ignores(&base, actions)
  })
  .await
  .map_err(|e| Error::InvalidInput(format!("Conflict ignore task failed: {e}")))?
}
