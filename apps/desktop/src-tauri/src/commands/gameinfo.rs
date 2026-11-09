use crate::errors::Error;
use crate::mod_manager::game_config_manager::GameInfoResetSource;
use std::path::PathBuf;

use super::state::{MANAGER, get_api_url};

pub async fn reset_to_vanilla_internal() -> Result<GameInfoResetSource, Error> {
  let api_url = get_api_url();

  let game_path = {
    let mod_manager = MANAGER.lock().unwrap();
    mod_manager
      .get_steam_manager()
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?
      .clone()
  };

  let vanilla_content = async {
    let url = format!("{api_url}/artifacts/deadlock/gameinfo.gi");
    log::info!("Downloading vanilla gameinfo.gi from: {url}");

    let client = crate::proxy::build_default_http_client()?;
    let response = client
      .get(&url)
      .send()
      .await
      .map_err(|e| Error::Network(format!("Failed to download vanilla gameinfo.gi: {e}")))?;

    if !response.status().is_success() {
      return Err(Error::Network(format!(
        "Server returned error status: {}",
        response.status()
      )));
    }

    response
      .text()
      .await
      .map_err(|e| Error::Network(format!("Failed to read response: {e}")))
  }
  .await;

  let mut mod_manager = MANAGER.lock().unwrap();
  let source = mod_manager
    .get_config_manager_mut()
    .reset_gameinfo(&game_path, vanilla_content)?;

  log::info!("Applied gameinfo recovery using {source:?}");
  Ok(source)
}

#[tauri::command]
pub async fn backup_gameinfo() -> Result<(), Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  let game_path = match mod_manager.get_steam_manager().get_game_path() {
    Some(path) => path.clone(),
    None => return Err(Error::GamePathNotSet),
  };
  mod_manager
    .get_config_manager_mut()
    .backup_gameinfo(&game_path)
}

#[tauri::command]
pub async fn restore_gameinfo_backup(guard_permit: Option<String>) -> Result<(), Error> {
  crate::game_guard::ensure_game_idle_locked("restore_gameinfo_backup", guard_permit.as_deref())?;
  let mut mod_manager = MANAGER.lock().unwrap();
  let game_path = match mod_manager.get_steam_manager().get_game_path() {
    Some(path) => path.clone(),
    None => return Err(Error::GamePathNotSet),
  };
  mod_manager
    .get_config_manager_mut()
    .restore_gameinfo_backup(&game_path)
}

#[tauri::command]
pub async fn reset_to_vanilla(guard_permit: Option<String>) -> Result<GameInfoResetSource, Error> {
  crate::game_guard::ensure_game_idle_locked("reset_to_vanilla", guard_permit.as_deref())?;
  reset_to_vanilla_internal().await
}

#[tauri::command]
/// None means there are no DMM mounts for an exit cleanup to remove.
pub async fn gameinfo_cleanup_revision() -> Result<Option<u64>, Error> {
  let manager = MANAGER.lock().unwrap();
  let game_path = manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?;
  manager.get_config_manager().cleanup_revision(game_path)
}

/// Skip stale observations and active launches, including when the manual guard is off.
#[tauri::command]
pub async fn remove_mod_search_paths(expected_revision: u64) -> Result<bool, Error> {
  let Ok(_launch_guard) = super::game::GAMEINFO_LAUNCH.try_lock() else {
    return Ok(false);
  };
  let mut manager = MANAGER.lock().unwrap();
  if manager.is_game_running()? {
    return Ok(false);
  }
  let game_path = manager
    .get_steam_manager()
    .get_game_path()
    .cloned()
    .ok_or(Error::GamePathNotSet)?;
  manager
    .get_config_manager_mut()
    .remove_mod_paths_at_revision(&game_path, expected_revision)
}

#[cfg(test)]
mod cleanup_tests {
  use super::*;

  #[tokio::test]
  async fn cleanup_skips_a_launch_instead_of_removing_its_staged_paths() {
    let _launch = crate::commands::game::GAMEINFO_LAUNCH.lock().await;
    assert!(matches!(remove_mod_search_paths(0).await, Ok(false)));
  }
}

#[tauri::command]
pub async fn make_file_writable(path: PathBuf) -> Result<(), Error> {
  let manager = MANAGER.lock().unwrap();
  let game_path = manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?;
  crate::mod_manager::file_permissions::make_file_writable(game_path, &path)
}

#[tauri::command]
pub async fn validate_gameinfo_patch(expected_vanilla: bool) -> Result<(), Error> {
  let mod_manager = MANAGER.lock().unwrap();
  let game_path = match mod_manager.get_steam_manager().get_game_path() {
    Some(path) => path.clone(),
    None => return Err(Error::GamePathNotSet),
  };
  mod_manager
    .get_config_manager()
    .validate_gameinfo_patch(&game_path, expected_vanilla)
}

/// Whether gameinfo.gi still lists our addon search paths. Polled by the
/// broken-mods banner, so it reads the file without holding the manager lock.
#[tauri::command]
pub async fn gameinfo_has_mod_paths() -> Result<bool, Error> {
  let game_path = MANAGER
    .lock()
    .unwrap()
    .get_steam_manager()
    .get_game_path()
    .cloned()
    .ok_or(Error::GamePathNotSet)?;
  let content =
    std::fs::read_to_string(game_path.join("game").join("citadel").join("gameinfo.gi"))?;
  crate::mod_manager::game_config_manager::GameConfigManager::has_mod_search_paths(
    &game_path, &content,
  )
}

#[tauri::command]
pub async fn get_gameinfo_status()
-> Result<crate::mod_manager::game_config_manager::GameInfoStatus, Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  let game_path = match mod_manager.get_steam_manager().get_game_path() {
    Some(path) => path.clone(),
    None => return Err(Error::GamePathNotSet),
  };
  mod_manager
    .get_config_manager_mut()
    .get_gameinfo_status(&game_path)
}

#[tauri::command]
pub async fn open_gameinfo_editor() -> Result<(), Error> {
  let mod_manager = MANAGER.lock().unwrap();
  let game_path = match mod_manager.get_steam_manager().get_game_path() {
    Some(path) => path.clone(),
    None => return Err(Error::GamePathNotSet),
  };
  mod_manager
    .get_config_manager()
    .open_gameinfo_with_editor(&game_path)
}
