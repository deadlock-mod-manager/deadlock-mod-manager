//! Getting the player onto a community server, reliably.
//!
//! Deadlock drops a boot-time `+connect` often enough that launching with it
//! alone lands the player in the hideout instead of on the server. Steam's
//! `steam://connect/<ip:port>` handler does not have that problem — it is the
//! path the Deadworks launcher uses — but it only works with a literal
//! `ip:port` and needs the client to be far enough along to accept it.
//!
//! So we do both: launch with `+connect` for the fast path, then tail
//! `console.log` and re-issue `steam://connect` if the client reaches the
//! main menu without having connected to the server we asked for.

use std::net::SocketAddr;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::Emitter;
use tokio::net::lookup_host;

use crate::app_runtime::AppHandle;
use crate::errors::Error;
use crate::mod_manager::console_log_watcher::{get_console_log_path, read_new_content};

use super::state::MANAGER;

/// How long we wait for the Deadlock process to show up after launching.
const GAME_START_TIMEOUT: Duration = Duration::from_secs(180);
/// Overall budget for getting connected once the process is up.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(240);
/// Grace period after the client reaches the menu before we re-issue connect.
const READY_GRACE: Duration = Duration::from_secs(4);
/// Spacing between `steam://connect` attempts.
const RETRY_INTERVAL: Duration = Duration::from_secs(20);
const MAX_ATTEMPTS: u32 = 3;
const POLL_INTERVAL: Duration = Duration::from_millis(750);

const PROGRESS_EVENT: &str = "server-connect-progress";

/// Log lines that mean "the client finished loading and is idling in the
/// menu/hideout", i.e. it is ready to act on a connect request.
const READY_MARKERS: [&str; 3] = [
  "Host activate:",
  "Hideout Lobby Connection State",
  "CLoopModeLevelLoad::MaybeSwitchToGameLoop",
];

/// Log lines that, when they mention our address, mean we got there.
const CONNECT_MARKERS: [&str; 3] = [
  "Connected to '",
  "Opened Steam Net Connection",
  "Sending connect to",
];

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConnectProgress {
  /// `waiting-for-game` | `waiting-for-client` | `retrying` | `connected`
  /// | `timed-out` | `game-closed`
  status: String,
  address: String,
  attempt: u32,
}

fn emit(app: &AppHandle, status: &str, address: &str, attempt: u32) {
  let payload = ConnectProgress {
    status: status.to_string(),
    address: address.to_string(),
    attempt,
  };
  if let Err(error) = app.emit(PROGRESS_EVENT, payload) {
    log::warn!("Failed to emit server connect progress: {error}");
  }
}

fn is_game_running() -> bool {
  MANAGER
    .lock()
    .ok()
    .and_then(|mut manager| manager.is_game_running().ok())
    .unwrap_or(false)
}

fn game_path() -> Option<PathBuf> {
  let manager = MANAGER.lock().ok()?;
  manager.get_steam_manager().get_game_path().cloned()
}

fn open_steam_connect(address: &str, password: Option<&str>) -> Result<(), Error> {
  let uri = match password {
    Some(password) if !password.is_empty() => {
      format!(
        "steam://connect/{address}/{}",
        urlencoding::encode(password)
      )
    }
    _ => format!("steam://connect/{address}"),
  };

  let manager = MANAGER
    .lock()
    .map_err(|_| Error::InvalidInput("Manager lock poisoned".to_string()))?;
  manager.get_steam_manager().open_steam_uri(&uri)
}

/// Turn whatever the relay handed us into the literal `ip:port` Steam's
/// connect handler accepts, resolving hostnames along the way. Lobby ids and
/// anything else that isn't a host/port pair are rejected — those can only be
/// joined through `+connect`.
#[tauri::command]
pub async fn resolve_connect_address(address: String) -> Result<String, Error> {
  let trimmed = address.trim();
  if trimmed.is_empty() {
    return Err(Error::InvalidInput("Empty server address".to_string()));
  }

  if let Ok(socket) = trimmed.parse::<SocketAddr>() {
    return Ok(socket.to_string());
  }

  // `lookup_host` needs a host:port pair; anything else (lobby ids, bare
  // hostnames) is not something we can hand to steam://connect.
  let resolved = lookup_host(trimmed)
    .await
    .map_err(|error| Error::InvalidInput(format!("Could not resolve {trimmed}: {error}")))?
    // Steam's connect handler is happiest with IPv4 literals.
    .fold(None::<SocketAddr>, |best, candidate| match best {
      Some(current) if current.is_ipv4() => Some(current),
      _ => Some(candidate),
    })
    .ok_or_else(|| Error::InvalidInput(format!("No address found for {trimmed}")))?;

  Ok(resolved.to_string())
}

/// Watch the game onto `address`, re-issuing `steam://connect` if the
/// boot-time `+connect` was dropped. Returns immediately; progress is
/// reported through the `server-connect-progress` event.
#[tauri::command]
pub async fn watch_server_connect(
  app: AppHandle,
  address: String,
  password: Option<String>,
  cold_start: bool,
) -> Result<(), Error> {
  let Some(game_path) = game_path() else {
    return Err(Error::GamePathNotSet);
  };

  tauri::async_runtime::spawn(async move {
    run_watchdog(app, game_path, address, password, cold_start).await;
  });

  Ok(())
}

async fn run_watchdog(
  app: AppHandle,
  game_path: PathBuf,
  address: String,
  password: Option<String>,
  cold_start: bool,
) {
  let log_path = get_console_log_path(&game_path);

  // On a cold start the game truncates console.log, so reading from the top
  // is safe and catches the early connect lines. When the client is already
  // up we only care about what happens from now on.
  let mut offset: u64 = if cold_start {
    0
  } else {
    std::fs::metadata(&log_path).map(|m| m.len()).unwrap_or(0)
  };

  if cold_start {
    emit(&app, "waiting-for-game", &address, 0);
    let deadline = Instant::now() + GAME_START_TIMEOUT;
    while !is_game_running() {
      if Instant::now() >= deadline {
        log::warn!("Deadlock never started; giving up on auto-connect to {address}");
        emit(&app, "timed-out", &address, 0);
        return;
      }
      tokio::time::sleep(POLL_INTERVAL).await;
    }
  }

  emit(&app, "waiting-for-client", &address, 0);

  let deadline = Instant::now() + CONNECT_TIMEOUT;
  let mut attempts: u32 = 0;
  let mut ready_since: Option<Instant> = None;
  let mut last_attempt: Option<Instant> = None;

  loop {
    if Instant::now() >= deadline {
      log::warn!("Auto-connect to {address} timed out after {attempts} attempt(s)");
      emit(&app, "timed-out", &address, attempts);
      return;
    }

    if !is_game_running() {
      // Cold start already waited for the process, so a miss here means the
      // player quit — nothing left to connect.
      log::info!("Deadlock is no longer running; stopping auto-connect to {address}");
      emit(&app, "game-closed", &address, attempts);
      return;
    }

    if let Some(chunk) = read_new_content(&log_path, &mut offset) {
      if chunk_reports_connection(&chunk, &address) {
        log::info!("Client reported a connection to {address}");
        emit(&app, "connected", &address, attempts);
        return;
      }
      if ready_since.is_none() && chunk.lines().any(line_is_ready_marker) {
        ready_since = Some(Instant::now());
      }
    }

    let ready_long_enough = ready_since.is_some_and(|at| at.elapsed() >= READY_GRACE);
    let retry_due = last_attempt.is_none_or(|at| at.elapsed() >= RETRY_INTERVAL);

    if ready_long_enough && retry_due && attempts < MAX_ATTEMPTS {
      attempts += 1;
      log::info!("Re-issuing steam://connect to {address} (attempt {attempts})");
      emit(&app, "retrying", &address, attempts);
      if let Err(error) = open_steam_connect(&address, password.as_deref()) {
        log::warn!("steam://connect retry failed: {error}");
      }
      last_attempt = Some(Instant::now());
    }

    if attempts >= MAX_ATTEMPTS && last_attempt.is_some_and(|at| at.elapsed() >= RETRY_INTERVAL) {
      log::warn!("Exhausted auto-connect attempts for {address}");
      emit(&app, "timed-out", &address, attempts);
      return;
    }

    tokio::time::sleep(POLL_INTERVAL).await;
  }
}

fn line_is_ready_marker(line: &str) -> bool {
  READY_MARKERS.iter().any(|marker| line.contains(marker))
}

/// A connect line has to mention both the address and a connection verb —
/// the address alone shows up in unrelated chatter like ping summaries.
fn chunk_reports_connection(chunk: &str, address: &str) -> bool {
  chunk.lines().any(|line| {
    line.contains(address) && CONNECT_MARKERS.iter().any(|marker| line.contains(marker))
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn detects_a_connection_to_the_requested_address() {
    let chunk = "[Client] CL:  Connected to '203.0.113.10:27015'\n";
    assert!(chunk_reports_connection(chunk, "203.0.113.10:27015"));
  }

  #[test]
  fn ignores_connections_to_other_servers() {
    let chunk = "[Client] CL:  Connected to '127.0.0.1:27015'\n";
    assert!(!chunk_reports_connection(chunk, "203.0.113.10:27015"));
  }

  #[test]
  fn ignores_the_address_without_a_connection_verb() {
    let chunk = "[Networking] Ping histogram for 203.0.113.10:27015\n";
    assert!(!chunk_reports_connection(chunk, "203.0.113.10:27015"));
  }

  #[test]
  fn recognizes_the_client_reaching_the_menu() {
    assert!(line_is_ready_marker(
      "[HostStateManager] Host activate: Loading (dl_hideout)"
    ));
    assert!(!line_is_ready_marker(
      "[Server] SV:  Spawn Server: dl_hideout"
    ));
  }

  #[tokio::test]
  async fn resolves_a_literal_socket_address() {
    assert_eq!(
      resolve_connect_address("203.0.113.10:27015".to_string())
        .await
        .unwrap(),
      "203.0.113.10:27015"
    );
  }

  #[tokio::test]
  async fn rejects_a_lobby_id() {
    assert!(
      resolve_connect_address("[76561198000000000]".to_string())
        .await
        .is_err()
    );
  }
}
