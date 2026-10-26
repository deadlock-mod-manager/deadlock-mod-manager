use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};

use super::state::MANAGER;
use crate::errors::Error;
use crate::mod_manager::steam_launch_options;

async fn steam_running() -> Result<bool, Error> {
  #[cfg(target_os = "linux")]
  if crate::flatpak::running_in_flatpak() {
    return crate::flatpak::game_process::is_steam_running().await;
  }
  tokio::task::spawn_blocking(|| {
    let mut system = System::new();
    system.refresh_processes_specifics(
      ProcessesToUpdate::All,
      true,
      ProcessRefreshKind::nothing().without_tasks(),
    );
    system.processes().values().any(|process| {
      process.name().to_str().is_some_and(|name| {
        ["steam", "steam.exe", "steam_osx"]
          .iter()
          .any(|candidate| name.eq_ignore_ascii_case(candidate))
      })
    })
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))
}

#[tauri::command]
pub async fn clear_steam_condebug() -> Result<(), Error> {
  let running = steam_running().await?;
  tokio::task::spawn_blocking(move || {
    let steam = {
      let mut manager = MANAGER
        .lock()
        .map_err(|_| Error::BackgroundTaskFailed("Mod manager lock poisoned".into()))?;
      match manager.find_steam() {
        Ok(()) => manager
          .get_steam_manager()
          .get_steam_path()
          .ok_or(Error::SteamNotFound)?,
        Err(Error::SteamNotFound) => return Ok(()),
        Err(error) => return Err(error),
      }
    };
    let Some(account) = crate::steam_user::list_accounts_in(&steam)
      .into_iter()
      .find(|account| account.is_active)
    else {
      return Ok(());
    };
    let path = steam
      .join("userdata")
      .join(account.account_id.to_string())
      .join("config")
      .join("localconfig.vdf");
    steam_launch_options::clear_condebug(&path, running)
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}
