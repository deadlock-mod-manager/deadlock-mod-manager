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
//!
//! With the live bridge HUD mod installed, the same log also carries the
//! scoreboard; [`crate::live_bridge::protocol`] reads those lines.

use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};

use chrono::Local;
use regex::Regex;
use serde::Serialize;
use ts_rs::TS;

use crate::live_bridge::protocol::{self, BridgeLine, BridgeState, LiveScoreboard};

/// Where the match is. The game logs its state as it moves through them.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum GamePhase {
  /// From joining the lobby until the zipline.
  Pregame,
  InProgress,
  /// Any later state, e.g. the post-game screen.
  Ended,
}

impl GamePhase {
  fn from_state(name: &str) -> Self {
    match name {
      "WaitingForPlayersToJoin"
      | "HeroSelection"
      | "MatchIntro"
      | "WaitForMapToLoad"
      | "PreGameWait" => Self::Pregame,
      "GameInProgress" => Self::InProgress,
      _ => Self::Ended,
    }
  }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct LiveMatch {
  /// Both ids exceed `Number.MAX_SAFE_INTEGER`, so they cross the bridge as text.
  pub match_id: String,
  pub lobby_id: String,
  pub phase: GamePhase,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct LiveMatchStatus {
  /// False when the game never ran with `-condebug`; without the log there is
  /// nothing to read and the UI says so instead of waiting forever.
  pub console_log_available: bool,
  /// When the player started matchmaking, in Unix milliseconds. `None` when
  /// not sitting in the queue.
  #[ts(type = "number | null")]
  pub queued_since: Option<i64>,
  pub current: Option<LiveMatch>,
  /// Matches played this session, which deadlock-api may not have ingested yet.
  pub recent_match_ids: Vec<String>,
  /// What the live bridge mod last reported. `None` until it reports, so the
  /// UI can tell a missing mod from a match that has not started.
  pub scoreboard: Option<LiveScoreboard>,
}

fn console_log_path(game_path: &Path) -> PathBuf {
  game_path.join("game").join("citadel").join("console.log")
}

static GAME_PATH: LazyLock<Mutex<Option<PathBuf>>> = LazyLock::new(Mutex::default);

/// The install behind the console log, resolved at most once per app run.
///
/// Resolving it walks the Steam library folders behind the global mod-manager
/// lock, which is far more than a poll running every couple of seconds should
/// cost - and it would contend with whatever the mod library is doing. The
/// install does not move while the app is open, so it is only looked up again
/// once the directory stops being there.
pub fn cached_game_path(resolve: impl FnOnce() -> Option<PathBuf>) -> Option<PathBuf> {
  let mut cached = GAME_PATH.lock().ok()?;
  if cached.as_deref().is_some_and(|path| !path.is_dir()) {
    *cached = None;
  }
  if cached.is_none() {
    *cached = resolve();
  }
  cached.clone()
}

/// Matches from this session are worth remembering even after the lobby closes:
/// deadlock-api ingests with a day of delay, so they are exactly the ones its
/// history is missing.
const RECENT_LIMIT: usize = 20;

/// What the log says the player is doing right now.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct LivePhase {
  /// When matchmaking started, in Unix milliseconds, while still queued.
  pub queued_since: Option<i64>,
  pub current: Option<LiveMatch>,
  /// Every match id seen this session, newest last, capped at `RECENT_LIMIT`.
  pub recent_match_ids: Vec<String>,
  /// What the bridge reported. Kept after the lobby closes so the last match
  /// stays readable, and dropped when the next lobby is created.
  bridge: Option<BridgeState>,
}

#[cfg(feature = "plugins")]
impl LivePhase {
  pub(crate) fn scoreboard(&self) -> Option<LiveScoreboard> {
    self.bridge.as_ref().map(BridgeState::board)
  }
}

/// A line of `console.log` the live tab cares about.
enum LogEvent<'a> {
  Bridge(BridgeLine),
  /// The match's game state changed, e.g. to `GameInProgress`.
  GameState(&'a str),
  /// Matchmaking started, at this Unix millisecond.
  QueueStarted(i64),
  QueueStopped,
  LobbyCreated {
    lobby_id: &'a str,
    match_id: &'a str,
  },
  LobbyDestroyed {
    lobby_id: &'a str,
  },
}

/// What `line` means, if anything. Most of a log is engine chatter, so each
/// kind is ruled out with a substring check before anything costlier runs.
fn classify(line: &str) -> Option<LogEvent<'_>> {
  static RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
      r"Lobby (\d+) for Match (\d+) (created|destroyed)|k_EMsgClientToGC(Start|Stop)Matchmaking\b",
    )
    .expect("invalid regex")
  });

  // Checked first: a bridge line carries player names, which must never read
  // as one of the game's own lines.
  if let Some(bridge) = protocol::parse_line(line) {
    return Some(LogEvent::Bridge(bridge));
  }
  // The hideout's local server logs `ChangeGameState: HeroSelection (3)`; in
  // a match the client logs `OnGameStateChanged: GameInProgress (7)`. Only a
  // lobby's states count, so the hideout's never stand in for a match's.
  if let Some((_, rest)) = line
    .split_once("OnGameStateChanged: ")
    .or_else(|| line.split_once("ChangeGameState: "))
  {
    let (name, _) = rest.split_once(" (")?;
    return Some(LogEvent::GameState(name.trim()));
  }
  if !line.contains("Lobby ") && !line.contains("Matchmaking") {
    return None;
  }
  let capture = RE.captures(line)?;
  // The matchmaking arm has no lobby id; the alternation tells them apart.
  let Some(lobby_id) = capture.get(1) else {
    return Some(if &capture[4] == "Start" {
      let at = protocol::line_time_ms(line).unwrap_or_else(|| Local::now().timestamp_millis());
      LogEvent::QueueStarted(at)
    } else {
      LogEvent::QueueStopped
    });
  };
  let lobby_id = lobby_id.as_str();
  Some(if &capture[3] == "created" {
    LogEvent::LobbyCreated {
      lobby_id,
      match_id: capture.get(2)?.as_str(),
    }
  } else {
    LogEvent::LobbyDestroyed { lobby_id }
  })
}

/// Folds the matchmaking, lobby and live bridge lines of `log` onto an
/// already-known phase.
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
  fold_observing(log, previous, |_, _| {})
}

fn fold_observing(
  log: &str,
  previous: LivePhase,
  mut observe: impl FnMut(&LivePhase, &LivePhase),
) -> LivePhase {
  let mut phase = previous;
  // Line by line, because a lobby line resets the board and has to be seen in
  // order with the bridge lines around it.
  for event in log.lines().filter_map(classify) {
    let before = phase.clone();
    match event {
      LogEvent::Bridge(line) => BridgeState::apply(&mut phase.bridge, line),
      LogEvent::GameState(name) => {
        if let Some(live) = phase.current.as_mut() {
          live.phase = GamePhase::from_state(name);
        }
      }
      LogEvent::QueueStarted(at) => phase.queued_since = Some(at),
      LogEvent::QueueStopped => phase.queued_since = None,
      LogEvent::LobbyCreated { lobby_id, match_id } => {
        if !phase.recent_match_ids.iter().any(|id| id == match_id) {
          phase.recent_match_ids.push(match_id.to_owned());
          if phase.recent_match_ids.len() > RECENT_LIMIT {
            phase.recent_match_ids.remove(0);
          }
        }
        phase.queued_since = None;
        phase.current = Some(LiveMatch {
          match_id: match_id.to_owned(),
          lobby_id: lobby_id.to_owned(),
          phase: GamePhase::Pregame,
        });
        phase.bridge = None;
      }
      // Only clear when the teardown belongs to the lobby we are tracking; an
      // unrelated line must not hide a running match.
      LogEvent::LobbyDestroyed { lobby_id } => {
        if phase
          .current
          .as_ref()
          .is_some_and(|live| live.lobby_id == lobby_id)
        {
          phase.current = None;
        }
      }
    }
    observe(&before, &phase);
  }
  phase
}

#[derive(Default)]
struct ScanState {
  path: Option<PathBuf>,
  /// When the log we folded was created. The game overwrites it on every start,
  /// so a different value means a new session and everything we know about the
  /// old one - the offset, and a match whose teardown line we will never see
  /// because the game was closed on it - is stale.
  created: Option<std::time::SystemTime>,
  /// How far into the log we have folded, always on a line boundary.
  offset: u64,
  phase: LivePhase,
}

static STATE: LazyLock<Mutex<ScanState>> = LazyLock::new(Mutex::default);

#[cfg(feature = "plugins")]
pub(crate) fn reset_observation(replay: bool) {
  let mut state = STATE.lock().unwrap_or_else(|error| error.into_inner());
  crate::external_plugins::events::game::observe_live(&state.phase, &LivePhase::default(), replay);
  *state = ScanState::default();
}

#[cfg(feature = "plugins")]
pub(crate) fn seed_observation() {
  let state = STATE.lock().unwrap_or_else(|error| error.into_inner());
  crate::external_plugins::events::game::observe_live(&LivePhase::default(), &state.phase, false);
}

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
    queued_since: phase.queued_since,
    current: phase.current,
    recent_match_ids: phase.recent_match_ids,
    scoreboard: phase.bridge.as_ref().map(BridgeState::board),
  }
}

fn phase(path: &Path) -> Option<LivePhase> {
  use std::io::{Read, Seek, SeekFrom};

  let mut state = STATE.lock().ok()?;

  // A different install, or a log that belongs to a different run of the game,
  // starts over. Truncation alone is not enough to notice the latter: a fresh
  // log can already be past where the last one was read by the time we look.
  let metadata = std::fs::metadata(path).ok()?;
  let len = metadata.len();
  let created = metadata.created().ok();
  if state.path.as_deref() != Some(path) || state.created != created || len < state.offset {
    *state = ScanState {
      path: Some(path.to_path_buf()),
      created,
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

  #[cfg(feature = "plugins")]
  let initial = state.offset == 0;
  state.offset += end as u64 + 1;
  let previous = std::mem::take(&mut state.phase);
  #[cfg(feature = "plugins")]
  {
    state.phase = if initial {
      let phase = fold_phase(&chunk, previous);
      crate::external_plugins::events::game::observe_live(&LivePhase::default(), &phase, false);
      phase
    } else {
      fold_observing(&chunk, previous, |before, after| {
        crate::external_plugins::events::game::observe_live(before, after, true)
      })
    };
  }
  #[cfg(not(feature = "plugins"))]
  {
    state.phase = fold_phase(&chunk, previous);
  }
  Some(state.phase.clone())
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::live_bridge::protocol::Team;

  const CREATED: &str = "08/02 12:03:37 Lobby 174072581626958477 for Match 96996563 created";
  const DESTROYED: &str = "08/02 12:35:54 Lobby 174072581626958477 for Match 96996563 destroyed";

  const QUEUED: &str =
    "08/02 13:05:21 [GCClient] Send msg 9010 (k_EMsgClientToGCStartMatchmaking), 263 bytes";

  #[test]
  fn observes_transient_lobbies_even_when_they_close_in_the_same_read() {
    let mut transitions = Vec::new();
    fold_observing(
      &format!("{CREATED}\n{DESTROYED}\n"),
      LivePhase::default(),
      |before, after| {
        transitions.push((
          before.current.as_ref().map(|live| live.match_id.clone()),
          after.current.as_ref().map(|live| live.match_id.clone()),
        ));
      },
    );
    assert_eq!(
      transitions,
      vec![
        (None, Some("96996563".into())),
        (Some("96996563".into()), None)
      ]
    );
  }

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
  fn remembers_the_matches_of_this_session() {
    let phase = fold_phase(
      &format!("Lobby 1 for Match 111 created\nLobby 1 for Match 111 destroyed\n{CREATED}\n"),
      LivePhase::default(),
    );

    assert_eq!(phase.recent_match_ids, vec!["111", "96996563"]);
  }

  #[test]
  fn reports_the_matchmaking_queue() {
    let phase = fold_phase(QUEUED, LivePhase::default());

    assert_eq!(phase.queued_since, protocol::line_time_ms(QUEUED));
    assert!(phase.queued_since.is_some());
    assert!(phase.current.is_none());
  }

  #[test]
  fn leaves_the_queue_once_the_lobby_exists() {
    let phase = fold_phase(&format!("{QUEUED}\n{CREATED}\n"), LivePhase::default());

    assert_eq!(phase.queued_since, None);
    assert_eq!(phase.current.unwrap().match_id, "96996563");
  }

  #[test]
  fn clears_the_queue_when_matchmaking_is_cancelled() {
    let queued = fold_phase(QUEUED, LivePhase::default());
    let cancelled = fold_phase(
      "[GCClient] Send msg 9012 (k_EMsgClientToGCStopMatchmaking), 8 bytes",
      queued,
    );

    assert_eq!(cancelled.queued_since, None);
  }

  const FRIENDLY: &str = r#"10/28 00:41:07 [PanoramaScript] [DMM-LIVE] {"v":2,"side":"friendly","clock":"12:34","players":[{"n":"Okaza","hid":13,"hn":"Haze","s":"12.3k","l":14,"k":5,"d":1,"a":7,"o":4210,"me":true,"dead":false}]}"#;
  const ENEMY: &str = r#"10/28 00:41:09 [PanoramaScript] [DMM-LIVE] {"v":2,"side":"enemy","clock":"12:36","players":[{"n":"Rival","hid":6,"hn":"Abrams","s":"9,870","l":12,"k":2,"d":3,"a":4,"o":null,"me":false,"dead":true}]}"#;

  fn board(phase: &LivePhase) -> LiveScoreboard {
    phase.bridge.as_ref().expect("a board").board()
  }

  #[test]
  fn reads_both_teams_from_the_bridge() {
    let board = board(&fold_phase(
      &format!("{CREATED}\n{FRIENDLY}\n{ENEMY}\n"),
      LivePhase::default(),
    ));

    assert_eq!(board.clock_seconds, Some(12 * 60 + 36));
    assert!(board.reported_at.is_some());
    let me = &board.friendly[0];
    assert_eq!(me.name, "Okaza");
    assert_eq!(me.hero_id, Some(13));
    assert_eq!(me.souls, Some(12_300));
    assert_eq!(me.objective_damage, Some(4210));
    assert!(me.is_local);
    let rival = &board.enemy[0];
    assert_eq!(rival.souls, Some(9_870));
    assert_eq!(rival.objective_damage, None);
    assert!(rival.is_dead);
  }

  #[test]
  fn gives_players_the_accounts_the_versus_screen_listed() {
    let roster = r#"10/28 04:30:01 [PanoramaScript] [DMM-LIVE-ROSTER] {"v":2,"teams":[{"players":[{"n":"Okaza","id":"76561198276744320"},{"n":"Bot0","id":null}]},{"players":[{"n":"Rival","id":"1234"}]}]}"#;
    // The roster comes before the top bar exists, and must still apply to it.
    let board = board(&fold_phase(
      &format!("{roster}\n{FRIENDLY}\n{ENEMY}\n"),
      LivePhase::default(),
    ));

    assert_eq!(board.friendly[0].account_id, Some(316_478_592));
    assert_eq!(board.enemy[0].account_id, Some(1234));
  }

  #[test]
  fn follows_the_game_state_of_the_match_not_the_hideout() {
    // The hideout runs straight through every state to GameInProgress.
    let hideout =
      "04:25:53 ChangeGameState: HeroSelection (3)\n04:25:53 ChangeGameState: GameInProgress (7)\n";
    let in_hideout = fold_phase(hideout, LivePhase::default());
    assert!(in_hideout.current.is_none());

    // Captured from a real match: the client logs OnGameStateChanged.
    let joined = fold_phase(&format!("{CREATED}\n"), in_hideout);
    assert_eq!(joined.current.as_ref().unwrap().phase, GamePhase::Pregame);
    let intro = fold_phase(
      "10/28 04:34:07 OnGameStateChanged: MatchIntro (4)\n",
      joined,
    );
    assert_eq!(intro.current.as_ref().unwrap().phase, GamePhase::Pregame);

    let started = fold_phase(
      "10/28 04:34:43 OnGameStateChanged: GameInProgress (7)\n",
      intro,
    );
    assert_eq!(
      started.current.as_ref().unwrap().phase,
      GamePhase::InProgress
    );
  }

  #[test]
  fn the_local_players_team_is_friendly_whichever_slot_it_is_in() {
    // Captured from a real match: the local player sat in the `TeamEnemy` slot.
    let enemy_slot = r#"10/28 03:31:52 [PanoramaScript] [DMM-LIVE] {"v":2,"side":"enemy","clock":null,"players":[{"n":"Snôòpy","hid":null,"hn":"Wraith","s":"2.0<span class=\"demote\">k</span>","l":4,"k":0,"d":0,"a":0,"o":9,"me":true,"dead":false}]}"#;
    let friendly_slot = r#"10/28 03:31:52 [PanoramaScript] [DMM-LIVE] {"v":2,"side":"friendly","clock":null,"players":[{"n":"Paige","hid":null,"hn":"Paige","s":"1.2<span class=\"demote\">k</span>","l":2,"k":0,"d":0,"a":0,"o":0,"me":false,"dead":false}]}"#;

    let phase = fold_phase(
      &format!("{friendly_slot}\n{enemy_slot}\n"),
      LivePhase::default(),
    );
    let first = board(&phase);

    assert_eq!(first.friendly[0].name, "Snôòpy");
    assert_eq!(first.friendly[0].souls, Some(2_000));
    assert_eq!(first.enemy[0].name, "Paige");
    // Statlocker showed this player on the Archmother.
    assert_eq!(first.team, Team::Archmother);

    // A later report for the other slot must not move the teams around.
    let later = board(&fold_phase(friendly_slot, phase));
    assert_eq!(later.friendly[0].name, "Snôòpy");
    assert_eq!(later.enemy[0].name, "Paige");
  }

  #[test]
  fn a_new_lobby_starts_an_empty_board() {
    let played = fold_phase(
      &format!("{CREATED}\n{FRIENDLY}\n{DESTROYED}\n"),
      LivePhase::default(),
    );
    // The finished match stays readable until the next one forms.
    assert!(played.bridge.is_some());

    let next = fold_phase("Lobby 2 for Match 333 created\n", played);
    assert!(next.bridge.is_none());
  }

  #[test]
  fn a_report_for_an_unknown_side_starts_no_board() {
    let phase = fold_phase(
      "[DMM-LIVE] {\"v\":2,\"side\":\"TeamRenamed\",\"players\":[]}\n",
      LivePhase::default(),
    );

    assert!(phase.bridge.is_none());
  }

  #[test]
  fn skips_bridge_lines_it_cannot_read() {
    let phase = fold_phase(
      &format!(
        "{FRIENDLY}\n[DMM-LIVE] not json\n[DMM-LIVE] {{\"v\":1,\"side\":\"friendly\",\"players\":[]}}\n"
      ),
      LivePhase::default(),
    );

    assert_eq!(board(&phase).friendly.len(), 1);
  }
}
