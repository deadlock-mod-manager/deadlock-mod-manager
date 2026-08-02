use crate::errors::Error;
use crate::game_presence::resolve_game_path;
use crate::live_match::{self, LiveMatchStatus};

/// Whether the game writes a console log at all, plus the match currently being
/// played. Both come from `console.log`, which only exists with `-condebug`.
#[tauri::command]
pub async fn get_live_match() -> Result<LiveMatchStatus, Error> {
  Ok(
    resolve_game_path()
      .map(|game_path| live_match::status(&game_path))
      .unwrap_or_default(),
  )
}
