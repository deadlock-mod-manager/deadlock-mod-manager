use crate::errors::Error;
use crate::steam_user::{self, SteamAccountDto};

/// Remembered Steam accounts, the one currently signed in first. Read-only: no
/// credentials are touched, so this needs no consent gate.
#[tauri::command]
pub async fn get_steam_accounts() -> Result<Vec<SteamAccountDto>, Error> {
  Ok(steam_user::list_accounts())
}
