//! Reads the match currently being played out of the game's `console.log`.
//!
//! Deadlock logs a line when it joins a lobby and another when that lobby goes
//! away, so the newest `created` without a matching `destroyed` is the live match:
//!
//! ```text
//! 12:03:37 Lobby 174072581626958477 for Match 96996563 created
//! 12:35:54 Lobby 174072581626958477 for Match 96996563 destroyed
//! ```
//!
//! This needs `-condebug`, which the app already passes when launching the game.

use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};

use regex::Regex;
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveMatch {
  /// Both ids exceed `Number.MAX_SAFE_INTEGER`, so they cross the bridge as text.
  pub match_id: String,
  pub lobby_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveMatchStatus {
  /// False when the game never ran with `-condebug`; without the log there is
  /// nothing to read and the UI says so instead of waiting forever.
  pub console_log_available: bool,
  /// Sitting in matchmaking, waiting for a lobby.
  pub queued: bool,
  pub current: Option<LiveMatch>,
}

fn console_log_path(game_path: &Path) -> PathBuf {
  game_path.join("game").join("citadel").join("console.log")
}

/// What the log says the player is doing right now.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct LivePhase {
  pub queued: bool,
  pub current: Option<LiveMatch>,
}

/// Folds the matchmaking and lobby lines of `log` onto an already-known phase.
///
/// A single match writes several hundred kilobytes of engine chatter, so reading
/// a fixed-size tail is not safe - the `created` line of a running match is
/// already ~600 KB from the end by the time it finishes. Callers therefore keep
/// the phase and feed only what was appended since the last call.
///
/// The lines, in the order the game writes them:
/// ```text
/// 13:05:21 [GCClient] Send msg 9010 (k_EMsgClientToGCStartMatchmaking), 263 bytes
/// 13:06:06 Lobby 102014987589037612 for Match 97003070 created
/// 13:38:12 Lobby 102014987589037612 for Match 97003070 destroyed
/// ```
pub fn fold_phase(log: &str, previous: LivePhase) -> LivePhase {
  static RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
      r"Lobby (\d+) for Match (\d+) (created|destroyed)|k_EMsgClientToGC(Start|Stop)Matchmaking\b",
    )
    .expect("invalid regex")
  });

  let mut phase = previous;
  for capture in RE.captures_iter(log) {
    // The matchmaking arm has no lobby id; the alternation tells them apart.
    let Some(lobby_id) = capture.get(1) else {
      phase.queued = capture.get(4).is_some_and(|m| m.as_str() == "Start");
      continue;
    };
    let lobby_id = lobby_id.as_str().to_owned();
    let match_id = capture[2].to_owned();

    if &capture[3] == "created" {
      phase = LivePhase {
        queued: false,
        current: Some(LiveMatch { match_id, lobby_id }),
      };
    } else if phase
      .current
      .as_ref()
      // Only clear when the teardown belongs to the lobby we are tracking; an
      // unrelated line must not hide a running match.
      .is_some_and(|live| live.lobby_id == lobby_id)
    {
      phase.current = None;
    }
  }
  phase
}

#[derive(Default)]
struct ScanState {
  path: Option<PathBuf>,
  /// How far into the log we have folded, always on a line boundary.
  offset: u64,
  phase: LivePhase,
}

static STATE: LazyLock<Mutex<ScanState>> = LazyLock::new(Mutex::default);

/// Reads whatever was appended since the last call and folds it in. The first
/// call walks the whole log, which is what makes starting the app in the middle
/// of a match work; later calls only touch the new bytes.
pub fn status(game_path: &Path) -> LiveMatchStatus {
  let path = console_log_path(game_path);
  if !path.is_file() {
    return LiveMatchStatus::default();
  }

  let phase = phase(&path).unwrap_or_default();
  LiveMatchStatus {
    console_log_available: true,
    queued: phase.queued,
    current: phase.current,
  }
}

fn phase(path: &Path) -> Option<LivePhase> {
  use std::io::{Read, Seek, SeekFrom};

  let mut state = STATE.lock().ok()?;

  // A different install or a truncated file (new game session) starts over.
  let len = std::fs::metadata(path).ok()?.len();
  if state.path.as_deref() != Some(path) || len < state.offset {
    *state = ScanState {
      path: Some(path.to_path_buf()),
      ..Default::default()
    };
  }
  if len == state.offset {
    return Some(state.phase.clone());
  }

  let mut file = std::fs::File::open(path).ok()?;
  file.seek(SeekFrom::Start(state.offset)).ok()?;
  let mut buf = Vec::with_capacity((len - state.offset) as usize);
  file.read_to_end(&mut buf).ok()?;

  // Stop at the last complete line so a half-written one is re-read next time.
  let Some(end) = buf.iter().rposition(|byte| *byte == b'\n') else {
    return Some(state.phase.clone());
  };
  let chunk = String::from_utf8_lossy(&buf[..=end]).into_owned();

  state.offset += end as u64 + 1;
  state.phase = fold_phase(&chunk, std::mem::take(&mut state.phase));
  Some(state.phase.clone())
}

#[cfg(test)]
mod tests {
  use super::*;

  const CREATED: &str = "08/02 12:03:37 Lobby 174072581626958477 for Match 96996563 created";
  const DESTROYED: &str = "08/02 12:35:54 Lobby 174072581626958477 for Match 96996563 destroyed";

  const QUEUED: &str =
    "08/02 13:05:21 [GCClient] Send msg 9010 (k_EMsgClientToGCStartMatchmaking), 263 bytes";

  /// Folding a whole log at once, the way the first scan of a session does.
  fn fold_matches_from(log: &str) -> Option<LiveMatch> {
    fold_phase(log, LivePhase::default()).current
  }

  #[test]
  fn finds_the_match_of_the_open_lobby() {
    let live = fold_matches_from(&format!("noise\n{CREATED}\nmore noise\n")).unwrap();

    assert_eq!(live.match_id, "96996563");
    assert_eq!(live.lobby_id, "174072581626958477");
  }

  #[test]
  fn reports_nothing_once_the_lobby_is_torn_down() {
    assert!(fold_matches_from(&format!("{CREATED}\n{DESTROYED}\n")).is_none());
  }

  #[test]
  fn keeps_the_newest_lobby_across_several_matches() {
    let log =
      format!("Lobby 1 for Match 111 created\nLobby 1 for Match 111 destroyed\n{CREATED}\n");

    assert_eq!(fold_matches_from(&log).unwrap().match_id, "96996563");
  }

  #[test]
  fn ignores_a_teardown_for_a_different_lobby() {
    let log = format!("{CREATED}\nLobby 999 for Match 222 destroyed\n");

    assert_eq!(fold_matches_from(&log).unwrap().match_id, "96996563");
  }

  #[test]
  fn handles_a_log_without_any_lobby_lines() {
    assert!(fold_matches_from("just engine noise\n").is_none());
  }

  #[test]
  fn carries_state_across_chunks_so_a_long_match_is_not_lost() {
    // The `created` line scrolls far out of any fixed tail window while the
    // match runs; folding chunk by chunk keeps it.
    let live = fold_phase(CREATED, LivePhase::default());
    let still_live = fold_phase(&"engine noise\n".repeat(50_000), live);

    assert_eq!(still_live.current.as_ref().unwrap().match_id, "96996563");
    assert!(fold_phase(DESTROYED, still_live).current.is_none());
  }

  #[test]
  fn reports_the_matchmaking_queue() {
    let phase = fold_phase(QUEUED, LivePhase::default());

    assert!(phase.queued);
    assert!(phase.current.is_none());
  }

  #[test]
  fn leaves_the_queue_once_the_lobby_exists() {
    let phase = fold_phase(&format!("{QUEUED}\n{CREATED}\n"), LivePhase::default());

    assert!(!phase.queued);
    assert_eq!(phase.current.unwrap().match_id, "96996563");
  }

  #[test]
  fn clears_the_queue_when_matchmaking_is_cancelled() {
    let queued = fold_phase(QUEUED, LivePhase::default());
    let cancelled = fold_phase(
      "[GCClient] Send msg 9012 (k_EMsgClientToGCStopMatchmaking), 8 bytes",
      queued,
    );

    assert!(!cancelled.queued);
  }
}
