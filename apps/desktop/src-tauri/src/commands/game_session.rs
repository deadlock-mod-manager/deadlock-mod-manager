use crate::errors::Error;
use crate::game_session::{
  self,
  types::{ClientFingerprint, SessionAckOutcome, SessionReport},
};

/// Reports the frontend hasn't acknowledged yet, oldest first, including
/// sessions that ended while the app was closed.
#[tauri::command]
pub async fn session_pending_reports() -> Result<Vec<SessionReport>, Error> {
  Ok(game_session::pending_reports())
}

#[tauri::command]
pub async fn session_acknowledge(
  session_id: String,
  outcome: SessionAckOutcome,
) -> Result<(), Error> {
  game_session::acknowledge(&session_id, outcome);
  Ok(())
}

/// Attaches the active profile and its mods to a session. Without an id it
/// goes to the running session. Returns whether it was recorded.
#[tauri::command]
pub async fn session_record_client_fingerprint(
  session_id: Option<String>,
  data: ClientFingerprint,
) -> Result<bool, Error> {
  Ok(game_session::record_client_fingerprint(
    session_id.as_deref(),
    data,
  ))
}

/// Mirrors the "check for crashes" setting.
#[tauri::command]
pub async fn session_set_enabled(enabled: bool) -> Result<(), Error> {
  game_session::set_enabled(enabled);
  Ok(())
}
