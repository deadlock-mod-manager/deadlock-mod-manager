use std::future::pending;
use std::path::PathBuf;
use std::time::Duration;

use crate::app_runtime::AppHandle;
use crate::errors::Error;
use crate::mod_manager::steam_uri_launcher::SteamUriLaunchMonitor;
use futures::FutureExt;
use tauri::Emitter;

use super::game_process::{GAME_START_TIMEOUT, GameStartOutcome, wait_for_game_start};
use super::gameinfo::reset_to_vanilla_internal;
use super::state::MANAGER;

const GAME_LAUNCH_POLL_INTERVAL: Duration = Duration::from_secs(2);

async fn await_launched_game(monitor: SteamUriLaunchMonitor) -> Result<(), Error> {
  let launcher = monitor.wait().fuse();
  let game = wait_for_game_start(GAME_START_TIMEOUT, GAME_LAUNCH_POLL_INTERVAL, pending()).fuse();
  futures::pin_mut!(launcher, game);

  loop {
    futures::select! {
      launcher_result = launcher => launcher_result?,
      game_result = game => return match game_result? {
        GameStartOutcome::Running => {
          log::info!("Confirmed Deadlock process started");
          Ok(())
        }
        GameStartOutcome::TimedOut => Err(Error::GameLaunchFailed(format!(
          "Steam accepted the launch request, but Deadlock did not start within {} seconds",
          GAME_START_TIMEOUT.as_secs()
        ))),
        GameStartOutcome::Cancelled => unreachable!("normal game launches are not cancellable"),
      }
    }
  }
}

#[tauri::command]
pub async fn find_game_path() -> Result<String, Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  match (mod_manager.find_steam(), mod_manager.find_game()) {
    (Ok(_), Ok(game_path)) => {
      log::info!("Found game at: {game_path:?}");
      Ok(game_path.to_string_lossy().to_string())
    }
    (Err(e), _) => {
      log::error!("Failed to find Steam: {e}");
      Err(e)
    }
    (_, Err(e)) => {
      log::error!("Failed to find game: {e}");
      Err(e)
    }
  }
}

#[tauri::command]
pub async fn set_game_path(path: String) -> Result<String, Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  let path_buf = PathBuf::from(&path);
  let game_path = mod_manager.set_game_path(path_buf)?;
  log::info!("Game path manually set to: {game_path:?}");
  Ok(game_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn find_steam_path() -> Result<String, Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  let steam_path = mod_manager.find_steam_path()?;
  log::info!("Found Steam at: {steam_path:?}");
  Ok(steam_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn set_steam_path(path: String) -> Result<String, Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  let path_buf = PathBuf::from(&path);
  let steam_path = mod_manager.set_steam_path(path_buf)?;
  log::info!("Steam path manually set to: {steam_path:?}");
  Ok(steam_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn clear_steam_path() -> Result<(), Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager.clear_steam_path();
  Ok(())
}

#[tauri::command]
pub async fn start_game(
  app_handle: AppHandle,
  vanilla: bool,
  additional_args: String,
  profile_folder: Option<String>,
) -> Result<(), Error> {
  log::info!(
    "Starting game with args: {:?} (vanilla: {:?}, profile: {:?})",
    additional_args,
    vanilla,
    profile_folder
  );

  let first_result = {
    let mut mod_manager = MANAGER.lock().unwrap();
    mod_manager.prepare_game_launch(vanilla, additional_args.clone(), profile_folder.clone())
  };

  let request = match first_result {
    Ok(request) => request,
    Err(Error::GameConfigParse(msg)) => {
      log::warn!("Game config parse failed: {msg}, attempting auto-reset to vanilla");

      reset_to_vanilla_internal().await?;

      let request = {
        let mut mod_manager = MANAGER.lock().unwrap();
        mod_manager.prepare_game_launch(vanilla, additional_args, profile_folder)?
      };

      app_handle.emit("gameinfo-auto-reset", ()).ok();
      log::info!("Auto-recovery succeeded after gameinfo reset");
      request
    }
    Err(error) => return Err(error),
  };

  await_launched_game(request.spawn()?).await
}

/// Launch the game without touching `gameinfo.gi`.
///
/// The server-browser join flow writes its own (possibly layered) addon path
/// set via `apply_server_gameinfo` before launching; going through
/// `start_game` here would overwrite that with the active profile alone and
/// the server's required mods would never load.
#[tauri::command]
pub async fn launch_game_direct(additional_args: String) -> Result<(), Error> {
  log::info!("Launching game without gameinfo changes, args: {additional_args:?}");

  let request = {
    let mod_manager = MANAGER.lock().unwrap();
    mod_manager
      .get_steam_manager()
      .game_launch_request(&additional_args)?
  };

  await_launched_game(request.spawn()?).await
}

#[tauri::command]
pub async fn stop_game() -> Result<(), Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager.stop_game()
}

#[tauri::command]
pub async fn is_game_running() -> Result<bool, Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager.is_game_running()
}
