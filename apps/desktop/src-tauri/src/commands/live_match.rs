use std::ffi::OsStr;
use std::path::{Path, PathBuf};

use crate::app_runtime::AppHandle;
use crate::errors::Error;
use crate::game_presence::resolve_game_path;
use crate::live_bridge::{self, LIVE_BRIDGE_FILE};
use crate::live_match::{self, LiveMatchStatus};
use crate::mod_manager::{ModManager, mods_store};

async fn blocking<T: Send + 'static>(
  work: impl FnOnce() -> T + Send + 'static,
) -> Result<T, Error> {
  tauri::async_runtime::spawn_blocking(work)
    .await
    .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))
}

async fn with_game<T: Send + 'static>(
  work: impl FnOnce(&Path) -> Result<T, Error> + Send + 'static,
) -> Result<T, Error> {
  blocking(move || {
    let game_path = live_match::cached_game_path(resolve_game_path).ok_or(Error::GamePathNotSet)?;
    work(&game_path)
  })
  .await?
}

#[tauri::command]
pub async fn get_live_match() -> Result<LiveMatchStatus, Error> {
  let status = blocking(|| {
    live_match::cached_game_path(resolve_game_path)
      .map(|game_path| live_match::status(&game_path))
      .unwrap_or_default()
  })
  .await
  .unwrap_or_else(|error| {
    log::warn!("live match detection task failed: {error}");
    LiveMatchStatus::default()
  });
  Ok(status)
}

fn library_copy(app_handle: &AppHandle, mod_id: &str) -> Result<PathBuf, Error> {
  ModManager::ensure_safe_mod_id(mod_id)?;
  Ok(
    mods_store::dir(app_handle)?
      .join(mod_id)
      .join("files")
      .join(LIVE_BRIDGE_FILE),
  )
}

#[tauri::command]
pub async fn build_live_bridge(app_handle: AppHandle, mod_id: String) -> Result<(), Error> {
  let destination = library_copy(&app_handle, &mod_id)?;
  with_game(move |game_path| live_bridge::build(game_path, &destination)).await
}

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

#[tauri::command]
pub async fn live_bridge_status(
  profile_folder: Option<String>,
  installed_vpk: Option<String>,
) -> Result<live_bridge::BridgeStatus, Error> {
  with_game(move |game_path| {
    let installed = installed_vpk
      .map(|name| installed_bridge(game_path, profile_folder.as_deref(), &name))
      .transpose()?;
    Ok(live_bridge::status(game_path, installed.as_deref()))
  })
  .await
}

#[tauri::command]
pub async fn update_live_bridge(
  app_handle: AppHandle,
  mod_id: String,
  profile_folder: Option<String>,
  installed_vpk: String,
) -> Result<(), Error> {
  let library_copy = library_copy(&app_handle, &mod_id)?;
  with_game(move |game_path| {
    crate::game_guard::ensure_game_idle_locked("update_live_bridge", None)?;
    let installed = installed_bridge(game_path, profile_folder.as_deref(), &installed_vpk)?;
    live_bridge::update(game_path, &library_copy, &installed)
  })
  .await
}
