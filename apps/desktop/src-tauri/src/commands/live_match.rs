use std::path::{Component, Path, PathBuf};

use crate::app_runtime::AppHandle;
use crate::commands::forge::contained_destination;
use crate::errors::Error;
use crate::game_presence::resolve_game_path;
use crate::live_bridge;
use crate::live_match::{self, LiveMatchStatus};

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

/// Builds the live bridge HUD mod from the installed game into `destination`,
/// a file inside a mod's folder in the mods store. The renderer then adds it to
/// the library like any other local VPK.
#[tauri::command]
pub async fn build_live_bridge(app_handle: AppHandle, destination: String) -> Result<(), Error> {
  let mods_root = crate::mod_manager::mods_store::dir(&app_handle)?;
  let destination = contained_destination(&mods_root, &destination)?;
  tauri::async_runtime::spawn_blocking(move || {
    let game_path = live_match::cached_game_path(resolve_game_path).ok_or(Error::GamePathNotSet)?;
    live_bridge::build(&game_path, &destination)
  })
  .await
  .map_err(|error| Error::InvalidInput(format!("Building the live bridge failed: {error}")))?
}

/// The addons folder of `profile_folder`, or the root one for `None`. Profile
/// folders may nest but never climb out of the addons folder.
fn bridge_addons(game_path: &Path, profile_folder: Option<&str>) -> Result<PathBuf, Error> {
  let addons = game_path.join("game").join("citadel").join("addons");
  match profile_folder {
    None => Ok(addons),
    Some(folder)
      if !folder.is_empty()
        && Path::new(folder)
          .components()
          .all(|component| matches!(component, Component::Normal(_))) =>
    {
      Ok(addons.join(folder))
    }
    Some(_) => Err(Error::InvalidInput("Invalid profile folder".to_string())),
  }
}

/// Whether the live bridge is in the profile's addons folder, however it got
/// there, and whether it was built from an older game or an older bridge.
#[tauri::command]
pub async fn live_bridge_status(
  profile_folder: Option<String>,
) -> Result<live_bridge::BridgeStatus, Error> {
  tauri::async_runtime::spawn_blocking(move || {
    let game_path = live_match::cached_game_path(resolve_game_path).ok_or(Error::GamePathNotSet)?;
    let addons = bridge_addons(&game_path, profile_folder.as_deref())?;
    Ok(live_bridge::status(&game_path, &addons))
  })
  .await
  .map_err(|error| Error::InvalidInput(format!("Checking the live bridge failed: {error}")))?
}

/// Rebuilds the installed bridge from the current game. `library_copy` is the
/// bridge's file in the mods store, refreshed along with it. Refused while the
/// game runs, like every other write to the game's files.
#[tauri::command]
pub async fn update_live_bridge(
  app_handle: AppHandle,
  profile_folder: Option<String>,
  library_copy: Option<String>,
) -> Result<(), Error> {
  let library_copy = match library_copy {
    Some(copy) => {
      let mods_root = crate::mod_manager::mods_store::dir(&app_handle)?;
      Some(contained_destination(&mods_root, &copy)?)
    }
    None => None,
  };
  tauri::async_runtime::spawn_blocking(move || {
    crate::game_guard::ensure_game_idle_locked("update_live_bridge", None)?;
    let game_path = live_match::cached_game_path(resolve_game_path).ok_or(Error::GamePathNotSet)?;
    let addons = bridge_addons(&game_path, profile_folder.as_deref())?;
    live_bridge::update(&game_path, &addons, library_copy.as_deref())
  })
  .await
  .map_err(|error| Error::InvalidInput(format!("Updating the live bridge failed: {error}")))?
}
