use crate::errors::Error;
use crate::steam_user::{self, SteamAccountDto};

#[tauri::command]
pub async fn get_steam_accounts() -> Result<Vec<SteamAccountDto>, Error> {
  if crate::runtime_environment::is_e2e_active() {
    return Ok(Vec::new());
  }
  let accounts = tauri::async_runtime::spawn_blocking(steam_user::list_accounts)
    .await
    .unwrap_or_else(|e| {
      log::warn!("steam account detection task failed: {e}");
      Vec::new()
    });
  Ok(accounts)
}
