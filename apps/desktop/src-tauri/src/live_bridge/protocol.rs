//! What the live bridge prints to `console.log`, and the scoreboard it adds up
//! to.
//!
//! The script reads the values the game puts on its top-bar player panels and
//! prints one line per team whenever they change, plus the pre-match versus
//! screen's roster once it is shown:
//!
//! ```text
//! 10/28 12:10:02 [PanoramaScript] [DMM-LIVE] {"v":2,"side":"friendly","clock":"6:25","players":[...]}
//! 10/28 12:09:40 [PanoramaScript] [DMM-LIVE-ROSTER] {"v":2,"teams":[{"players":[{"n":"Okaza","id":"7656..."}]}]}
//! ```

use std::collections::HashMap;

use chrono::{DateTime, Datelike, Local, NaiveDateTime, TimeZone};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

const BRIDGE_TAG: &str = "[DMM-LIVE] ";
const ROSTER_TAG: &str = "[DMM-LIVE-ROSTER] ";
/// Bumped whenever the wire format changes, here and in the script. Lines from
/// any other version are skipped, and the rebuilt script makes an installed
/// bridge read as outdated.
const BRIDGE_VERSION: u32 = 2;
/// SteamID64 of account 0 in the public universe.
const STEAM_ID64_BASE: u64 = 76_561_197_960_265_728;
/// Every console line starts with a `MM/DD HH:MM:SS` stamp.
const STAMP_LEN: usize = "MM/DD HH:MM:SS".len();

/// The game's two teams.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum Team {
  /// Team 2, the top bar's `TeamFriendly` slot.
  #[default]
  HiddenKing,
  /// Team 3, the top bar's `TeamEnemy` slot.
  Archmother,
}

/// One player as the top bar shows them. Fields the HUD could not resolve stay
/// `None` rather than reading as zero.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct LiveScoreboardPlayer {
  pub name: String,
  /// The 32-bit account id deadlock-api keys players by, matched by name from
  /// the versus screen's roster. `None` when the screen did not list them.
  pub account_id: Option<u32>,
  pub hero_id: Option<u32>,
  pub hero_name: Option<String>,
  pub souls: Option<u32>,
  pub level: Option<i32>,
  pub kills: Option<i32>,
  pub deaths: Option<i32>,
  pub assists: Option<i32>,
  pub objective_damage: Option<i32>,
  pub is_local: bool,
  pub is_dead: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct LiveScoreboard {
  /// Game time on the top bar's clock, in seconds.
  pub clock_seconds: Option<u32>,
  /// The local player's team, then the other one.
  pub friendly: Vec<LiveScoreboardPlayer>,
  pub enemy: Vec<LiveScoreboardPlayer>,
  /// Which team `friendly` is. The Hidden King until the local player shows up
  /// on the top bar.
  pub team: Team,
  /// When the newest scoreboard line was logged, in Unix milliseconds.
  #[ts(type = "number | null")]
  pub reported_at: Option<i64>,
}

/// What the bridge has reported since the lobby was created, as it reported it.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct BridgeState {
  /// The two top-bar team panels. Their ids (`TeamFriendly`, `TeamEnemy`) are
  /// fixed slots for teams 2 and 3, not relative to the local player, so which
  /// one is "friendly" is decided by where the local player sits.
  slots: [Vec<LiveScoreboardPlayer>; 2],
  clock_seconds: Option<u32>,
  reported_at: Option<i64>,
  /// Account ids by name, from the versus screen.
  accounts: HashMap<String, u32>,
}

impl BridgeState {
  /// The board as the UI shows it: the local player's team first, with the
  /// roster's account ids filled in.
  pub fn board(&self) -> LiveScoreboard {
    let local_slot = usize::from(self.slots[1].iter().any(|player| player.is_local));
    let with_accounts = |slot: usize| {
      self.slots[slot]
        .iter()
        .map(|player| LiveScoreboardPlayer {
          account_id: self.accounts.get(&player.name).copied(),
          ..player.clone()
        })
        .collect()
    };
    LiveScoreboard {
      clock_seconds: self.clock_seconds,
      friendly: with_accounts(local_slot),
      enemy: with_accounts(1 - local_slot),
      team: if local_slot == 0 {
        Team::HiddenKing
      } else {
        Team::Archmother
      },
      reported_at: self.reported_at,
    }
  }
}

/// A line the bridge printed.
pub enum BridgeLine {
  /// One top-bar team panel, and when the line was logged.
  Scores {
    report: BridgeReport,
    reported_at: Option<i64>,
  },
  /// The versus screen's roster.
  Roster(RosterReport),
  /// A line from another bridge version, or one that does not parse. Skipped
  /// rather than clearing what is already on screen.
  Unreadable,
}

/// What `line` carries, or `None` when the bridge did not print it.
pub fn parse_line(line: &str) -> Option<BridgeLine> {
  if let Some(json) = after_tag(line, BRIDGE_TAG) {
    return Some(match parse_report(json) {
      Some(report) => BridgeLine::Scores {
        report,
        reported_at: line_time_ms(line),
      },
      None => BridgeLine::Unreadable,
    });
  }
  let json = after_tag(line, ROSTER_TAG)?;
  Some(parse_report(json).map_or(BridgeLine::Unreadable, BridgeLine::Roster))
}

impl BridgeState {
  /// Folds a bridge line into `state`, starting the board on the first one
  /// that carries anything.
  pub fn apply(state: &mut Option<Self>, line: BridgeLine) {
    match line {
      BridgeLine::Scores {
        report,
        reported_at,
      } => {
        let state = state.get_or_insert_with(Self::default);
        state.slots[report.side.slot()] = report.players.into_iter().map(Into::into).collect();
        if let Some(seconds) = report.clock.as_deref().and_then(clock_seconds) {
          state.clock_seconds = Some(seconds);
        }
        if reported_at.is_some() {
          state.reported_at = reported_at;
        }
      }
      BridgeLine::Roster(report) => {
        state.get_or_insert_with(Self::default).accounts = report
          .teams
          .into_iter()
          .flat_map(|team| team.players)
          .filter_map(|entry| Some((entry.n?, account_id(&entry.id?)?)))
          .collect();
      }
      BridgeLine::Unreadable => {}
    }
  }
}

fn after_tag<'a>(line: &'a str, tag: &str) -> Option<&'a str> {
  line.find(tag).map(|start| &line[start + tag.len()..])
}

/// Every report carries the bridge version beside its own fields.
#[derive(Deserialize)]
struct Versioned<T> {
  v: u32,
  #[serde(flatten)]
  report: T,
}

/// `json` as a report of this bridge version.
fn parse_report<T: DeserializeOwned>(json: &str) -> Option<T> {
  let Versioned { v, report } = serde_json::from_str::<Versioned<T>>(json).ok()?;
  (v == BRIDGE_VERSION).then_some(report)
}

/// When a console line was logged, from its stamp, in Unix milliseconds.
pub fn line_time_ms(line: &str) -> Option<i64> {
  line
    .get(..STAMP_LEN)
    .and_then(|stamp| log_time_ms(stamp, Local::now()))
}

/// The top-bar team panel a report comes from. A side the bridge does not
/// know fails to parse, so the report is skipped.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
enum Side {
  Friendly,
  Enemy,
}

impl Side {
  /// The panel's index in [`BridgeState`]'s slots.
  fn slot(self) -> usize {
    match self {
      Self::Friendly => 0,
      Self::Enemy => 1,
    }
  }
}

/// The bridge's wire format. Keys are short because a line is written every
/// time a number on the scoreboard changes.
#[derive(Deserialize)]
pub struct BridgeReport {
  side: Side,
  clock: Option<String>,
  players: Vec<BridgePlayer>,
}

#[derive(Deserialize)]
struct BridgePlayer {
  n: Option<String>,
  hid: Option<u32>,
  hn: Option<String>,
  s: Option<String>,
  l: Option<i32>,
  k: Option<i32>,
  d: Option<i32>,
  a: Option<i32>,
  o: Option<i32>,
  me: Option<bool>,
  dead: Option<bool>,
}

#[derive(Deserialize)]
pub struct RosterReport {
  teams: Vec<RosterTeam>,
}

#[derive(Deserialize)]
struct RosterTeam {
  players: Vec<RosterEntry>,
}

#[derive(Deserialize)]
struct RosterEntry {
  n: Option<String>,
  /// The account behind the avatar, as a SteamID64 or a 32-bit account id.
  id: Option<String>,
}

impl From<BridgePlayer> for LiveScoreboardPlayer {
  fn from(player: BridgePlayer) -> Self {
    Self {
      name: player.n.unwrap_or_default(),
      account_id: None,
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
fn parse_souls(text: &str) -> Option<u32> {
  let text = strip_tags(text).trim().replace(',', "");
  if let Some(thousands) = text.strip_suffix(['k', 'K']) {
    let value: f64 = thousands.parse().ok()?;
    return (value >= 0.0).then(|| (value * 1000.0).round() as u32);
  }
  text.parse().ok()
}

/// `"12:34"` or `"1:02:03"` as seconds; `None` for anything else, including
/// the countdown before the horn.
fn clock_seconds(clock: &str) -> Option<u32> {
  let parts: Vec<&str> = clock.trim().split(':').collect();
  let well_formed = (2..=3).contains(&parts.len())
    && parts.iter().enumerate().all(|(index, part)| {
      !part.is_empty()
        && part.bytes().all(|byte| byte.is_ascii_digit())
        && (index == 0 || part.len() <= 2)
    });
  if !well_formed {
    return None;
  }
  parts.iter().try_fold(0u32, |total, part| {
    total.checked_mul(60)?.checked_add(part.parse().ok()?)
  })
}

/// An account id from either a SteamID64 or a bare 32-bit account id.
fn account_id(raw: &str) -> Option<u32> {
  let value: u64 = raw.trim().parse().ok()?;
  let account = value.checked_sub(STEAM_ID64_BASE).unwrap_or(value);
  u32::try_from(account).ok().filter(|id| *id > 0)
}

/// A console line's `MM/DD HH:MM:SS` stamp, which is local time without a
/// year, as Unix milliseconds. A stamp more than a day ahead of `now` is from
/// last year: a late December line read on January 1st.
fn log_time_ms(stamp: &str, now: DateTime<Local>) -> Option<i64> {
  let at_year = |year: i32| {
    let at = NaiveDateTime::parse_from_str(&format!("{year}/{stamp}"), "%Y/%m/%d %H:%M:%S").ok()?;
    Local
      .from_local_datetime(&at)
      .earliest()
      .map(|at| at.timestamp_millis())
  };
  let reported = at_year(now.year())?;
  if reported - now.timestamp_millis() > 24 * 60 * 60 * 1000 {
    return at_year(now.year() - 1);
  }
  Some(reported)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::live_bridge::BRIDGE_SOURCE;

  #[test]
  fn the_script_prints_what_this_parser_reads() {
    for declaration in [
      format!("var VERSION = {BRIDGE_VERSION};"),
      format!("var TAG = \"{}\";", BRIDGE_TAG.trim_end()),
      format!("var ROSTER_TAG = \"{}\";", ROSTER_TAG.trim_end()),
    ] {
      assert!(BRIDGE_SOURCE.contains(&declaration), "{declaration}");
    }
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
  fn reads_the_clock_and_nothing_else() {
    assert_eq!(clock_seconds("12:34"), Some(754));
    assert_eq!(clock_seconds("1:02:03"), Some(3723));
    assert_eq!(clock_seconds("-0:10"), None);
    assert_eq!(clock_seconds("12:345"), None);
    assert_eq!(clock_seconds("soon"), None);
  }

  #[test]
  fn dates_a_log_stamp_in_the_year_it_was_written() {
    let now = Local.with_ymd_and_hms(2027, 1, 1, 0, 0, 5).unwrap();
    let new_year = Local.with_ymd_and_hms(2027, 1, 1, 0, 0, 1).unwrap();
    let new_years_eve = Local.with_ymd_and_hms(2026, 12, 31, 23, 59, 58).unwrap();

    assert_eq!(
      log_time_ms("01/01 00:00:01", now),
      Some(new_year.timestamp_millis())
    );
    assert_eq!(
      log_time_ms("12/31 23:59:58", now),
      Some(new_years_eve.timestamp_millis())
    );
    assert_eq!(log_time_ms("04:25:53 Chan", now), None);
  }
}
