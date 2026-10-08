//! Steam's `logs/gameprocess_log.txt`, which records every tracked game
//! process and its exit code:
//!
//! ```text
//! [2026-10-04 22:27:59] AppID 1422450 adding PID 52896 as a tracked process "...\deadlock.exe -steam"
//! [2026-10-04 23:06:13] AppID 1422450 no longer tracking PID 52896, exit code 0
//! ```
//!
//! Timestamps are local time. On Linux Steam tracks the Proton wrapper, not
//! the PID we see, so exit lookups simply find nothing there; its start line
//! still says when the game was launched again. Steam also tracks helpers the
//! game starts (`nvngx_update.exe`, `steamerrorreporter64.exe`) under the same
//! app id, so only starts that mention `deadlock.exe` count.

use std::path::Path;
use std::sync::LazyLock;

use chrono::{DateTime, Local, NaiveDateTime, TimeZone, Utc};
use regex::Regex;

/// The log grows for years; the sessions we look up are near its end.
const TAIL_BYTES: u64 = 512 * 1024;

static EVENT_LINE: LazyLock<Regex> = LazyLock::new(|| {
  Regex::new(
    r"^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] AppID 1422450 (?:adding PID (\d+) as a tracked process(.*)|no longer tracking PID (\d+), exit code (-?\d+))",
  )
  .expect("valid steam log regex")
});

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SteamLogEvent {
  /// The game itself was launched, not one of its helpers.
  Started { pid: u32, at: DateTime<Utc> },
  Exited {
    pid: u32,
    exit_code: u32,
    at: DateTime<Utc>,
  },
}

pub fn read_tail(steam_path: &Path) -> Option<String> {
  super::read_tail(
    &steam_path.join("logs").join("gameprocess_log.txt"),
    TAIL_BYTES,
  )
}

pub fn parse_events(text: &str) -> Vec<SteamLogEvent> {
  parse_events_with(text, local_to_utc)
}

fn local_to_utc(time: NaiveDateTime) -> Option<DateTime<Utc>> {
  Local
    .from_local_datetime(&time)
    .earliest()
    .map(|time| time.with_timezone(&Utc))
}

fn parse_events_with(
  text: &str,
  to_utc: impl Fn(NaiveDateTime) -> Option<DateTime<Utc>>,
) -> Vec<SteamLogEvent> {
  text
    .lines()
    .filter_map(|line| {
      let captures = EVENT_LINE.captures(line)?;
      let at = NaiveDateTime::parse_from_str(&captures[1], "%Y-%m-%d %H:%M:%S")
        .ok()
        .and_then(&to_utc)?;
      if let Some(pid) = captures.get(2) {
        let command = captures.get(3)?.as_str().to_ascii_lowercase();
        return command
          .contains("deadlock.exe")
          .then_some(SteamLogEvent::Started {
            pid: pid.as_str().parse().ok()?,
            at,
          });
      }
      let exit_code: i64 = captures.get(5)?.as_str().parse().ok()?;
      Some(SteamLogEvent::Exited {
        pid: captures.get(4)?.as_str().parse().ok()?,
        // Steam prints NTSTATUS codes as signed numbers.
        exit_code: exit_code as u32,
        at,
      })
    })
    .collect()
}

/// The exit Steam logged for `pid` after `started_at`. Both clocks have
/// one-second resolution, so allow a second of rounding.
pub fn find_exit(
  events: &[SteamLogEvent],
  pid: u32,
  started_at: DateTime<Utc>,
) -> Option<(u32, DateTime<Utc>)> {
  let not_before = started_at - chrono::Duration::seconds(1);
  events.iter().find_map(|event| match *event {
    SteamLogEvent::Exited {
      pid: exited,
      exit_code,
      at,
    } if exited == pid && at >= not_before => Some((exit_code, at)),
    _ => None,
  })
}

/// When Deadlock was next launched after `after`, not counting `own_pid`. A
/// later run overwrites console.log and writes its own crash dumps.
pub fn next_start(
  events: &[SteamLogEvent],
  after: DateTime<Utc>,
  own_pid: Option<u32>,
) -> Option<DateTime<Utc>> {
  events.iter().find_map(|event| match *event {
    SteamLogEvent::Started { pid, at } if at > after && Some(pid) != own_pid => Some(at),
    _ => None,
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  const LOG: &str = "\
[2026-10-04 22:25:16] AppID 1422450 no longer tracking PID 56128, exit code 0
[2026-10-04 22:25:16] Remove 1422450 from running list
[2026-10-04 22:27:59] AppID 1422450 adding PID 52896 as a tracked process \"V:\\Deadlock\\game\\bin\\win64\\deadlock.exe -steam -console -condebug\"
[2026-10-04 22:28:00] SSGL: change [1422450] LCT 352847128->0
[2026-10-04 22:28:05] AppID 1422450 adding PID 33048 as a tracked process \"C:\\WINDOWS\\System32\\DriverStore\\FileRepository\\nvmdi.inf_amd64\\nvngx_update.exe -api update -feature dlss\"
[2026-10-04 22:28:40] AppID 1422450 adding PID 33148 as a tracked process \"C:\\Program Files (x86)\\Steam\\steamerrorreporter64.exe -pid=52896\"
[2026-10-04 22:28:41] AppID 1422450 no longer tracking PID 52896, exit code -1073741819
[2026-10-04 22:29:10] AppID 3393110 no longer tracking PID 41736, exit code 1
[2026-10-04 22:30:00] AppID 1422450 adding PID 60000 as a tracked process \"deadlock.exe\"
[2026-10-04 23:06:13] AppID 1422450 no longer tracking PID 60000, exit code 3221225477
";

  fn utc(text: &str) -> DateTime<Utc> {
    NaiveDateTime::parse_from_str(text, "%Y-%m-%d %H:%M:%S")
      .unwrap()
      .and_utc()
  }

  fn events() -> Vec<SteamLogEvent> {
    parse_events_with(LOG, |time| Some(time.and_utc()))
  }

  #[test]
  fn parses_deadlock_starts_and_exits_only() {
    let events = events();

    // The helpers Steam tracks for the game are left out.
    assert_eq!(events.len(), 5);
    assert_eq!(
      events[1],
      SteamLogEvent::Started {
        pid: 52896,
        at: utc("2026-10-04 22:27:59"),
      }
    );
  }

  #[test]
  fn reads_signed_and_unsigned_exit_codes() {
    let events = events();

    assert_eq!(
      find_exit(&events, 52896, utc("2026-10-04 22:27:59")),
      Some((0xC000_0005, utc("2026-10-04 22:28:41")))
    );
    assert_eq!(
      find_exit(&events, 60000, utc("2026-10-04 22:30:00")).map(|(code, _)| code),
      Some(0xC000_0005)
    );
  }

  #[test]
  fn ignores_exits_from_before_the_session_and_other_pids() {
    let events = events();

    assert_eq!(find_exit(&events, 56128, utc("2026-10-04 22:27:59")), None);
    assert_eq!(find_exit(&events, 56128, utc("2026-10-04 22:25:18")), None);
    assert_eq!(find_exit(&events, 41736, utc("2026-10-04 22:00:00")), None);
  }

  #[test]
  fn finds_the_next_launch_of_the_game() {
    let events = events();

    assert_eq!(
      next_start(&events, utc("2026-10-04 22:27:59"), Some(52896)),
      Some(utc("2026-10-04 22:30:00"))
    );
    // Off Windows our PID isn't Steam's, but our own launch came first.
    assert_eq!(
      next_start(&events, utc("2026-10-04 22:28:01"), None),
      Some(utc("2026-10-04 22:30:00"))
    );
    assert_eq!(
      next_start(&events, utc("2026-10-04 22:30:00"), Some(60000)),
      None
    );
  }
}
