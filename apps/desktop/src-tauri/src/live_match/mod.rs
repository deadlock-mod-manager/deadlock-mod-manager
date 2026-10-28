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
//! scoreboard. The mod reads the values the game puts on its top-bar player
//! panels and prints one line per team whenever they change:
//!
//! ```text
//! 10/28 12:10:02 [PanoramaScript] [DMM-LIVE] {"v":1,"side":"friendly","clock":"6:25","players":[...]}
//! ```

use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};

use regex::Regex;
use serde::{Deserialize, Serialize};

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
  /// Matches played this session, which deadlock-api may not have ingested yet.
  pub recent_match_ids: Vec<String>,
  /// What the live bridge mod last reported. `None` until it reports, so the
  /// UI can tell a missing mod from a match that has not started.
  pub scoreboard: Option<LiveScoreboard>,
  /// The game's state name: `WaitingForPlayersToJoin`, `HeroSelection`,
  /// `MatchIntro`, `WaitForMapToLoad` and `PreGameWait` come before the
  /// zipline, `GameInProgress` is the match itself.
  pub game_state: Option<String>,
}

/// One player as the top bar shows them. Fields the HUD could not resolve stay
/// `None` rather than reading as zero.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveScoreboardPlayer {
  pub name: String,
  pub hero_id: Option<i64>,
  pub hero_name: Option<String>,
  pub souls: Option<u64>,
  pub level: Option<i64>,
  pub kills: Option<i64>,
  pub deaths: Option<i64>,
  pub assists: Option<i64>,
  pub objective_damage: Option<i64>,
  pub is_local: bool,
  pub is_dead: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveScoreboard {
  /// The in-game clock as the top bar prints it, e.g. `"12:34"`.
  pub clock: Option<String>,
  /// The local player's team, then the other one.
  pub friendly: Vec<LiveScoreboardPlayer>,
  pub enemy: Vec<LiveScoreboardPlayer>,
  /// The game's team number of `friendly`: 2 is the Hidden King, 3 the
  /// Archmother.
  pub friendly_team: u8,
  /// Log timestamp of the newest report, e.g. `"10/28 00:41:07"`.
  pub updated_at: Option<String>,
  /// Everyone the pre-match versus screen listed, with the account behind them
  /// when the HUD exposed it. Empty when the screen was never shown.
  pub roster: Vec<LiveRosterPlayer>,
  /// The two top-bar team panels as reported. Their ids (`TeamFriendly`,
  /// `TeamEnemy`) are fixed slots for teams 2 and 3, not relative to the local
  /// player, so which one is "friendly" is decided by where the local player sits.
  #[serde(skip)]
  slots: [Vec<LiveScoreboardPlayer>; 2],
}

/// The bridge's wire format. Keys are short because a line is written every
/// time a number on the scoreboard changes.
#[derive(Deserialize)]
struct BridgeReport {
  v: u32,
  side: String,
  clock: Option<String>,
  players: Vec<BridgePlayer>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveRosterPlayer {
  pub name: String,
  /// The 32-bit account id deadlock-api keys players by.
  pub account_id: Option<u32>,
}

#[derive(Deserialize)]
struct RosterReport {
  v: u32,
  teams: Vec<RosterTeam>,
}

#[derive(Deserialize)]
struct RosterTeam {
  players: Vec<RosterEntry>,
}

#[derive(Deserialize)]
struct RosterEntry {
  n: Option<String>,
  /// Whatever the avatar panel exposed, by property name.
  #[serde(default)]
  ids: std::collections::BTreeMap<String, String>,
}

#[derive(Deserialize)]
struct BridgePlayer {
  n: Option<String>,
  hid: Option<i64>,
  hn: Option<String>,
  s: Option<String>,
  l: Option<i64>,
  k: Option<i64>,
  d: Option<i64>,
  a: Option<i64>,
  o: Option<i64>,
  me: Option<bool>,
  dead: Option<bool>,
}

const BRIDGE_TAG: &str = "[DMM-LIVE] ";
const ROSTER_TAG: &str = "[DMM-LIVE-ROSTER] ";
/// SteamID64 of account 0 in the public universe.
const STEAM_ID64_BASE: u64 = 76_561_197_960_265_728;
const BRIDGE_VERSION: u32 = 1;

/// Drops inline markup: the top bar styles the thousands suffix, so souls read
/// as `2.0<span class="demote">k</span>`.
fn strip_tags(text: &str) -> String {
  let mut out = String::with_capacity(text.len());
  let mut in_tag = false;
  for c in text.chars() {
    match c {
      '<' => in_tag = true,
      '>' => in_tag = false,
      _ if !in_tag => out.push(c),
      _ => {}
    }
  }
  out
}

/// Souls as the top bar prints them: `"980"`, `"9,870"` or `"12.3k"`.
fn parse_souls(text: &str) -> Option<u64> {
  let text = strip_tags(text).trim().replace(',', "");
  if let Some(thousands) = text.strip_suffix(['k', 'K']) {
    let value: f64 = thousands.parse().ok()?;
    return (value >= 0.0).then(|| (value * 1000.0).round() as u64);
  }
  text.parse().ok()
}

impl From<BridgePlayer> for LiveScoreboardPlayer {
  fn from(player: BridgePlayer) -> Self {
    Self {
      name: player.n.unwrap_or_default(),
      hero_id: player.hid,
      hero_name: player.hn,
      souls: player.s.as_deref().and_then(parse_souls),
      level: player.l,
      kills: player.k,
      deaths: player.d,
      assists: player.a,
      objective_damage: player.o,
      is_local: player.me.unwrap_or(false),
      is_dead: player.dead.unwrap_or(false),
    }
  }
}

/// An account id from either a SteamID64 or a bare 32-bit account id.
fn account_id(raw: &str) -> Option<u32> {
  let value: u64 = raw.trim().parse().ok()?;
  let account = value.checked_sub(STEAM_ID64_BASE).unwrap_or(value);
  u32::try_from(account).ok().filter(|id| *id > 0)
}

fn apply_roster_line(line: &str, board: &mut Option<LiveScoreboard>) {
  let Some(start) = line.find(ROSTER_TAG) else {
    return;
  };
  let Ok(report) = serde_json::from_str::<RosterReport>(&line[start + ROSTER_TAG.len()..]) else {
    return;
  };
  if report.v != BRIDGE_VERSION {
    return;
  }
  let roster = report
    .teams
    .into_iter()
    .flat_map(|team| team.players)
    .filter_map(|entry| {
      let name = entry.n?;
      // Prefer an explicit account id, then anything that parses as one.
      let account_id = ["accountid", "accountId", "attr_accountid"]
        .iter()
        .filter_map(|key| entry.ids.get(*key))
        .chain(entry.ids.values())
        .find_map(|raw| account_id(raw));
      Some(LiveRosterPlayer { name, account_id })
    })
    .collect();
  board.get_or_insert_with(LiveScoreboard::default).roster = roster;
}

/// Applies one bridge line to the board. Lines from a bridge version this
/// build does not know, or that fail to parse, are skipped rather than
/// clearing what is already on screen.
fn apply_bridge_line(line: &str, board: &mut Option<LiveScoreboard>) {
  let Some(start) = line.find(BRIDGE_TAG) else {
    return;
  };
  let Ok(report) = serde_json::from_str::<BridgeReport>(&line[start + BRIDGE_TAG.len()..]) else {
    return;
  };
  if report.v != BRIDGE_VERSION {
    return;
  }
  let slot = match report.side.as_str() {
    "friendly" => 0,
    "enemy" => 1,
    _ => return,
  };
  let players: Vec<LiveScoreboardPlayer> = report.players.into_iter().map(Into::into).collect();
  let board = board.get_or_insert_with(LiveScoreboard::default);
  board.slots[slot] = players;
  let local_slot = if board.slots[1].iter().any(|player| player.is_local) {
    1
  } else {
    0
  };
  board.friendly = board.slots[local_slot].clone();
  board.enemy = board.slots[1 - local_slot].clone();
  // The top-bar layout gives the `TeamFriendly` slot team 2, `TeamEnemy` team 3.
  board.friendly_team = if local_slot == 0 { 2 } else { 3 };
  if report.clock.is_some() {
    board.clock = report.clock;
  }
  // `MM/DD HH:MM:SS` at the start of every console line.
  if line.as_bytes().get(2) == Some(&b'/') {
    board.updated_at = line.get(..14).map(str::to_owned);
  }
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
  pub queued: bool,
  pub current: Option<LiveMatch>,
  /// Every match id seen this session, newest last, capped at `RECENT_LIMIT`.
  pub recent_match_ids: Vec<String>,
  /// The bridge's latest board. Kept after the lobby closes so the last match
  /// stays readable, and dropped when the next lobby is created.
  pub scoreboard: Option<LiveScoreboard>,
  /// The game's own state name from its newest `ChangeGameState` line, e.g.
  /// `HeroSelection` or `GameInProgress`. Reset when a lobby is created, so
  /// the hideout's states never stand in for a match's.
  pub game_state: Option<String>,
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
  static RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
      r"Lobby (\d+) for Match (\d+) (created|destroyed)|k_EMsgClientToGC(Start|Stop)Matchmaking\b",
    )
    .expect("invalid regex")
  });

  let mut phase = previous;
  // Line by line, because a lobby line resets the board and has to be seen in
  // order with the bridge lines around it.
  for line in log.lines() {
    if line.contains(BRIDGE_TAG) {
      apply_bridge_line(line, &mut phase.scoreboard);
      continue;
    }
    if line.contains(ROSTER_TAG) {
      apply_roster_line(line, &mut phase.scoreboard);
      continue;
    }
    // The hideout's local server logs `ChangeGameState: HeroSelection (3)`; in
    // a match the client logs `OnGameStateChanged: GameInProgress (7)`.
    if let Some(rest) = line
      .split_once("OnGameStateChanged: ")
      .or_else(|| line.split_once("ChangeGameState: "))
      .map(|(_, rest)| rest)
    {
      if let Some((name, _)) = rest.split_once(" (") {
        phase.game_state = Some(name.trim().to_owned());
      }
      continue;
    }
    if !line.contains("Lobby ") && !line.contains("Matchmaking") {
      continue;
    }
    for capture in RE.captures_iter(line) {
      // The matchmaking arm has no lobby id; the alternation tells them apart.
      let Some(lobby_id) = capture.get(1) else {
        phase.queued = capture.get(4).is_some_and(|m| m.as_str() == "Start");
        continue;
      };
      let lobby_id = lobby_id.as_str().to_owned();
      let match_id = capture[2].to_owned();

      if &capture[3] == "created" {
        if !phase.recent_match_ids.contains(&match_id) {
          phase.recent_match_ids.push(match_id.clone());
          if phase.recent_match_ids.len() > RECENT_LIMIT {
            phase.recent_match_ids.remove(0);
          }
        }
        phase.queued = false;
        phase.current = Some(LiveMatch { match_id, lobby_id });
        phase.scoreboard = None;
        phase.game_state = None;
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
    recent_match_ids: phase.recent_match_ids,
    scoreboard: phase.scoreboard,
    game_state: phase.game_state,
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

  const FRIENDLY: &str = r#"10/28 00:41:07 [PanoramaScript] [DMM-LIVE] {"v":1,"side":"friendly","clock":"12:34","players":[{"n":"Okaza","hid":13,"hn":"Haze","s":"12.3k","l":14,"k":5,"d":1,"a":7,"o":4210,"me":true,"dead":false}]}"#;
  const ENEMY: &str = r#"10/28 00:41:09 [PanoramaScript] [DMM-LIVE] {"v":1,"side":"enemy","clock":"12:36","players":[{"n":"Rival","hid":6,"hn":"Abrams","s":"9,870","l":12,"k":2,"d":3,"a":4,"o":null,"me":false,"dead":true}]}"#;

  #[test]
  fn reads_both_teams_from_the_bridge() {
    let board = fold_phase(
      &format!("{CREATED}\n{FRIENDLY}\n{ENEMY}\n"),
      LivePhase::default(),
    )
    .scoreboard
    .unwrap();

    assert_eq!(board.clock.as_deref(), Some("12:36"));
    assert_eq!(board.updated_at.as_deref(), Some("10/28 00:41:09"));
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
  fn reads_the_phase_and_the_roster() {
    let roster = r#"10/28 04:30:01 [PanoramaScript] [DMM-LIVE-ROSTER] {"v":1,"teams":[{"t":1,"players":[{"n":"Okaza","ids":{"steamid":"76561198276744320"}},{"n":"Bot0","ids":{}}]},{"t":2,"players":[{"n":"Rival","ids":{"accountid":"1234"}}]}]}"#;
    let board = fold_phase(&format!("{roster}\n"), LivePhase::default())
      .scoreboard
      .unwrap();

    assert_eq!(board.roster[0].account_id, Some(316_478_592));
    assert_eq!(board.roster[1].account_id, None);
    assert_eq!(board.roster[2].account_id, Some(1234));
  }

  #[test]
  fn follows_the_game_state_of_the_match_not_the_hideout() {
    // The hideout runs straight through every state to GameInProgress.
    let hideout =
      "04:25:53 ChangeGameState: HeroSelection (3)\n04:25:53 ChangeGameState: GameInProgress (7)\n";
    let in_hideout = fold_phase(hideout, LivePhase::default());
    assert!(in_hideout.current.is_none());

    // Captured from a real match: the client logs OnGameStateChanged.
    let joined = fold_phase(
      &format!("{CREATED}\n10/28 04:34:07 OnGameStateChanged: MatchIntro (4)\n"),
      in_hideout,
    );
    assert_eq!(joined.game_state.as_deref(), Some("MatchIntro"));

    let started = fold_phase(
      "10/28 04:34:43 OnGameStateChanged: GameInProgress (7)\n",
      joined,
    );
    assert_eq!(started.game_state.as_deref(), Some("GameInProgress"));
  }

  #[test]
  fn parses_souls_the_way_the_top_bar_prints_them() {
    assert_eq!(parse_souls("980"), Some(980));
    assert_eq!(parse_souls("9,870"), Some(9_870));
    assert_eq!(parse_souls("12.3k"), Some(12_300));
    assert_eq!(
      parse_souls(r#"2.0<span class="demote">k</span>"#),
      Some(2_000)
    );
    assert_eq!(parse_souls("?"), None);
  }

  #[test]
  fn the_local_players_team_is_friendly_whichever_slot_it_is_in() {
    // Captured from a real match: the local player sat in the `TeamEnemy` slot.
    let enemy_slot = r#"10/28 03:31:52 [PanoramaScript] [DMM-LIVE] {"v":1,"side":"enemy","clock":null,"players":[{"n":"Snôòpy","hid":null,"hn":"Wraith","s":"2.0<span class=\"demote\">k</span>","l":4,"k":0,"d":0,"a":0,"o":9,"me":true,"dead":false}]}"#;
    let friendly_slot = r#"10/28 03:31:52 [PanoramaScript] [DMM-LIVE] {"v":1,"side":"friendly","clock":null,"players":[{"n":"Paige","hid":null,"hn":"Paige","s":"1.2<span class=\"demote\">k</span>","l":2,"k":0,"d":0,"a":0,"o":0,"me":false,"dead":false}]}"#;

    let board = fold_phase(
      &format!("{friendly_slot}\n{enemy_slot}\n"),
      LivePhase::default(),
    )
    .scoreboard
    .unwrap();

    assert_eq!(board.friendly[0].name, "Snôòpy");
    assert_eq!(board.friendly[0].souls, Some(2_000));
    assert_eq!(board.enemy[0].name, "Paige");
    // Statlocker showed this player on the Archmother.
    assert_eq!(board.friendly_team, 3);

    // A later report for the other slot must not move the teams around.
    let board = fold_phase(
      friendly_slot,
      LivePhase {
        scoreboard: Some(board),
        ..Default::default()
      },
    )
    .scoreboard
    .unwrap();
    assert_eq!(board.friendly[0].name, "Snôòpy");
    assert_eq!(board.enemy[0].name, "Paige");
  }

  #[test]
  fn a_new_lobby_starts_an_empty_board() {
    let played = fold_phase(
      &format!("{CREATED}\n{FRIENDLY}\n{DESTROYED}\n"),
      LivePhase::default(),
    );
    // The finished match stays readable until the next one forms.
    assert!(played.scoreboard.is_some());

    let next = fold_phase("Lobby 2 for Match 333 created\n", played);
    assert!(next.scoreboard.is_none());
  }

  #[test]
  fn a_report_for_an_unknown_side_starts_no_board() {
    let phase = fold_phase(
      "[DMM-LIVE] {\"v\":1,\"side\":\"TeamRenamed\",\"players\":[]}\n",
      LivePhase::default(),
    );

    assert!(phase.scoreboard.is_none());
  }

  #[test]
  fn skips_bridge_lines_it_cannot_read() {
    let phase = fold_phase(
      &format!(
        "{FRIENDLY}\n[DMM-LIVE] not json\n[DMM-LIVE] {{\"v\":2,\"side\":\"friendly\",\"players\":[]}}\n"
      ),
      LivePhase::default(),
    );

    assert_eq!(phase.scoreboard.unwrap().friendly.len(), 1);
  }
}
