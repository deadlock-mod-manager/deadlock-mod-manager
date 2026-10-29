use std::ffi::OsStr;
use std::path::{Path, PathBuf};

use crate::app_runtime::AppHandle;
use crate::commands::forge::contained_destination;
use crate::errors::Error;
use crate::game_presence::resolve_game_path;
use crate::live_bridge;
use crate::live_match::{self, LiveMatchStatus};
use crate::mod_manager::ModManager;

/// Whether the game writes a console log at all, plus the match currently being
/// played. Both come from `console.log`, which only exists with `-condebug`.
///
/// The log can be tens of megabytes and the frontend polls this every few
/// seconds, so the read runs on the blocking pool rather than on a runtime thread.
#[tauri::command]
pub async fn get_live_match() -> Result<LiveMatchStatus, Error> {
  let status = tauri::async_runtime::spawn_blocking(|| {
    live_match::cached_game_path(resolve_game_path)
      .map(|game_path| live_match::status(&game_path))
      .unwrap_or_default()
  })
  .await
  .unwrap_or_else(|e| {
    log::warn!("live match detection task failed: {e}");
    LiveMatchStatus::default()
  });
  Ok(status)
}

/// Runs `work` against the installed game on the blocking pool. `action` names
/// it in the error when the task itself fails.
async fn with_game<T: Send + 'static>(
  action: &'static str,
  work: impl FnOnce(&Path) -> Result<T, Error> + Send + 'static,
) -> Result<T, Error> {
  tauri::async_runtime::spawn_blocking(move || {
    let game_path = live_match::cached_game_path(resolve_game_path).ok_or(Error::GamePathNotSet)?;
    work(&game_path)
  })
  .await
  .map_err(|error| Error::InvalidInput(format!("{action} the live bridge failed: {error}")))?
}

/// Builds the live bridge HUD mod from the installed game into `destination`,
/// a file inside a mod's folder in the mods store. The renderer then adds it to
/// the library like any other local VPK.
#[tauri::command]
pub async fn build_live_bridge(app_handle: AppHandle, destination: String) -> Result<(), Error> {
  let mods_root = crate::mod_manager::mods_store::dir(&app_handle)?;
  let destination = contained_destination(&mods_root, &destination)?;
  with_game("Building", move |game_path| {
    live_bridge::build(game_path, &destination)
  })
  .await
}

/// The enabled bridge's file in the profile's addons folder. `installed_vpk`
/// is the name the library recorded for it, so it must be a bare file name.
fn installed_bridge(
  game_path: &Path,
  profile_folder: Option<&str>,
  installed_vpk: &str,
) -> Result<PathBuf, Error> {
  if Path::new(installed_vpk).file_name() != Some(OsStr::new(installed_vpk)) {
    return Err(Error::InvalidInput(format!(
      "Invalid addon file name: {installed_vpk}"
    )));
  }
  Ok(ModManager::profile_addons_dir(game_path, profile_folder)?.join(installed_vpk))
}

/// Whether the enabled live bridge was built from the current game and bridge.
/// `installed_vpk` is `None` when the library has no enabled bridge.
#[tauri::command]
pub async fn live_bridge_status(
  profile_folder: Option<String>,
  installed_vpk: Option<String>,
) -> Result<live_bridge::BridgeStatus, Error> {
  with_game("Checking", move |game_path| {
    let installed = installed_vpk
      .map(|name| installed_bridge(game_path, profile_folder.as_deref(), &name))
      .transpose()?;
    Ok(live_bridge::status(game_path, installed.as_deref()))
  })
  .await
}

/// Rebuilds the bridge's file in the mods store from the current game and
/// copies it over the enabled one. Refused while the game runs, like every
/// other write to the game's files.
#[tauri::command]
pub async fn update_live_bridge(
  app_handle: AppHandle,
  profile_folder: Option<String>,
  library_copy: String,
  installed_vpk: String,
) -> Result<(), Error> {
  let mods_root = crate::mod_manager::mods_store::dir(&app_handle)?;
  let library_copy = contained_destination(&mods_root, &library_copy)?;
  with_game("Updating", move |game_path| {
    crate::game_guard::ensure_game_idle_locked("update_live_bridge", None)?;
    let installed = installed_bridge(game_path, profile_folder.as_deref(), &installed_vpk)?;
    live_bridge::update(game_path, &library_copy, &installed)
  })
  .await
}
