use crate::errors::Error;
use crate::game_presence::resolve_game_path;
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
