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
use std::path::Path;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::Emitter;
use tokio::net::lookup_host;
use tokio_util::sync::CancellationToken;

use crate::app_runtime::AppHandle;
use crate::errors::Error;
use crate::mod_manager::console_log_watcher::ConsoleLogTail;

use super::game_process::{self, GAME_START_TIMEOUT, GameStartOutcome};
use super::state::{MANAGER, SERVER_CONNECT_WATCHDOG, game_path};

/// Overall budget for getting connected once the process is up.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(240);
/// Grace period after the client reaches the menu before we re-issue connect.
const READY_GRACE: Duration = Duration::from_secs(4);
/// Spacing between `steam://connect` attempts.
const RETRY_INTERVAL: Duration = Duration::from_secs(20);
const MAX_ATTEMPTS: u32 = 3;
/// Reading the tail of `console.log` is cheap, so we can do it often.
const LOG_POLL_INTERVAL: Duration = Duration::from_millis(750);
/// Checking whether Deadlock is alive means a full process-table scan under
/// the global manager lock, so it runs on a much coarser cadence.
const LIVENESS_INTERVAL: Duration = Duration::from_secs(5);

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

#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "kebab-case")]
pub enum ConnectStatus {
  WaitingForGame,
  WaitingForClient,
  Retrying,
  Connected,
  TimedOut,
  GameClosed,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConnectProgress {
  status: ConnectStatus,
  address: String,
  attempt: u32,
}

fn emit(app: &AppHandle, status: ConnectStatus, address: &str, attempt: u32) {
  let payload = ConnectProgress {
    status,
    address: address.to_string(),
    attempt,
  };
  if let Err(error) = app.emit(PROGRESS_EVENT, payload) {
    log::warn!("Failed to emit server connect progress: {error}");
  }
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

  let request = {
    let manager = MANAGER
      .lock()
      .map_err(|_| Error::BackgroundTaskFailed("Mod manager lock poisoned".to_string()))?;
    manager.get_steam_manager().uri_launch_request(&uri)?
  };
  request.spawn()?;
  Ok(())
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
///
/// Only one watchdog runs at a time: a second join cancels the first, so two
/// attempts can never interleave their progress on the shared event channel.
#[tauri::command]
pub async fn watch_server_connect(
  app: AppHandle,
  address: String,
  password: Option<String>,
  cold_start: bool,
) -> Result<(), Error> {
  let game_path = game_path()?;

  let cancel = CancellationToken::new();
  {
    let mut slot = SERVER_CONNECT_WATCHDOG
      .lock()
      .map_err(|_| Error::BackgroundTaskFailed("Connect watchdog lock poisoned".to_string()))?;
    if let Some(previous) = slot.replace(cancel.clone()) {
      log::info!("Cancelling the previous server connect watchdog");
      previous.cancel();
    }
  }

  tauri::async_runtime::spawn(async move {
    run_watchdog(
      &app,
      &game_path,
      &address,
      password.as_deref(),
      cold_start,
      &cancel,
    )
    .await;
  });

  Ok(())
}

/// Terminal state of a watchdog run, plus how many `steam://connect` retries
/// it took to get there.
struct WatchdogEnd {
  status: ConnectStatus,
  attempts: u32,
}

/// Runs the watchdog to completion, emitting exactly one terminal event unless
/// a newer watchdog superseded this one.
async fn run_watchdog(
  app: &AppHandle,
  game_path: &Path,
  address: &str,
  password: Option<&str>,
  cold_start: bool,
  cancel: &CancellationToken,
) {
  // On a cold start the game truncates console.log, so reading from the top
  // catches the early connect lines. When the client is already up we only
  // care about what happens from now on.
  let mut tail = if cold_start {
    ConsoleLogTail::from_start(game_path)
  } else {
    ConsoleLogTail::from_end(game_path)
  };

  if cold_start {
    emit(app, ConnectStatus::WaitingForGame, address, 0);
    if !await_game_start(app, address, cancel).await {
      return;
    }
  }

  emit(app, ConnectStatus::WaitingForClient, address, 0);

  match drive_connect(app, &mut tail, address, password, cancel).await {
    Some(end) => {
      log::info!(
        "Auto-connect to {address} finished as {:?} after {} attempt(s)",
        end.status,
        end.attempts
      );
      emit(app, end.status, address, end.attempts);
    }
    None => log::info!("Auto-connect to {address} was superseded"),
  }
}

/// Waits for the Deadlock process to appear. Returns false if we gave up or
/// were cancelled, having already emitted the terminal event in the former case.
async fn await_game_start(app: &AppHandle, address: &str, cancel: &CancellationToken) -> bool {
  match game_process::wait_for_game_start(GAME_START_TIMEOUT, LIVENESS_INTERVAL, cancel.cancelled())
    .await
  {
    Ok(GameStartOutcome::Running) => true,
    Ok(GameStartOutcome::Cancelled) => false,
    Ok(GameStartOutcome::TimedOut) => {
      log::warn!("Deadlock never started; giving up on auto-connect to {address}");
      emit(app, ConnectStatus::TimedOut, address, 0);
      false
    }
    Err(error) => {
      log::warn!("Could not check whether Deadlock is running: {error}");
      emit(app, ConnectStatus::TimedOut, address, 0);
      false
    }
  }
}

/// The main loop: tail the log for a connection, and once the client is idling
/// in the menu, re-issue `steam://connect` on a fixed cadence. Returns `None`
/// if a newer watchdog took over.
async fn drive_connect(
  app: &AppHandle,
  tail: &mut ConsoleLogTail,
  address: &str,
  password: Option<&str>,
  cancel: &CancellationToken,
) -> Option<WatchdogEnd> {
  let deadline = Instant::now() + CONNECT_TIMEOUT;
  let mut attempts: u32 = 0;
  let mut ready_since: Option<Instant> = None;
  let mut last_attempt: Option<Instant> = None;
  let mut last_liveness_check = Instant::now();

  loop {
    if Instant::now() >= deadline {
      return Some(WatchdogEnd {
        status: ConnectStatus::TimedOut,
        attempts,
      });
    }

    if last_liveness_check.elapsed() >= LIVENESS_INTERVAL {
      last_liveness_check = Instant::now();
      match game_process::is_game_running().await {
        // Cold start already waited for the process, so a miss here means the
        // player quit — nothing left to connect.
        Ok(false) => {
          return Some(WatchdogEnd {
            status: ConnectStatus::GameClosed,
            attempts,
          });
        }
        Ok(true) => {}
        Err(error) => log::warn!("Could not check whether Deadlock is running: {error}"),
      }
    }

    if let Some(chunk) = tail.read_new() {
      if chunk_reports_connection(&chunk, address) {
        return Some(WatchdogEnd {
          status: ConnectStatus::Connected,
          attempts,
        });
      }
      if ready_since.is_none() && chunk.lines().any(line_is_ready_marker) {
        ready_since = Some(Instant::now());
      }
    }

    let ready_long_enough = ready_since.is_some_and(|at| at.elapsed() >= READY_GRACE);
    let retry_due = last_attempt.is_none_or(|at| at.elapsed() >= RETRY_INTERVAL);

    if ready_long_enough && retry_due {
      if attempts >= MAX_ATTEMPTS {
        log::warn!("Exhausted auto-connect attempts for {address}");
        return Some(WatchdogEnd {
          status: ConnectStatus::TimedOut,
          attempts,
        });
      }

      attempts += 1;
      log::info!("Re-issuing steam://connect to {address} (attempt {attempts})");
      emit(app, ConnectStatus::Retrying, address, attempts);
      if let Err(error) = open_steam_connect(address, password) {
        log::warn!("steam://connect retry failed: {error}");
      }
      last_attempt = Some(Instant::now());
    }

    if sleep_or_cancel(LOG_POLL_INTERVAL, cancel).await {
      return None;
    }
  }
}

/// Sleeps for `duration`, returning true if the watchdog was cancelled instead.
async fn sleep_or_cancel(duration: Duration, cancel: &CancellationToken) -> bool {
  tokio::select! {
    () = tokio::time::sleep(duration) => false,
    () = cancel.cancelled() => true,
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

  #[test]
  fn connect_statuses_serialize_as_kebab_case() {
    assert_eq!(
      serde_json::to_string(&ConnectStatus::WaitingForGame).unwrap(),
      "\"waiting-for-game\""
    );
    assert_eq!(
      serde_json::to_string(&ConnectStatus::TimedOut).unwrap(),
      "\"timed-out\""
    );
  }

  #[tokio::test]
  async fn sleep_or_cancel_reports_cancellation() {
    let cancel = CancellationToken::new();
    cancel.cancel();
    assert!(sleep_or_cancel(Duration::from_secs(30), &cancel).await);
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
