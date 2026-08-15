use crate::errors::Error;
use crate::steam_user::{self, SteamAccountDto};

/// Remembered Steam accounts, the one currently signed in first. Read-only: no
/// credentials are touched, so this needs no consent gate.
///
/// Locating Steam and stat-ing every account's userdata is filesystem work, so it
/// runs on the blocking pool instead of a runtime thread.
#[tauri::command]
pub async fn get_steam_accounts() -> Result<Vec<SteamAccountDto>, Error> {
  let accounts = tauri::async_runtime::spawn_blocking(steam_user::list_accounts)
    .await
    .unwrap_or_else(|e| {
      log::warn!("steam account detection task failed: {e}");
      Vec::new()
    });
  Ok(accounts)
}
