//! Finds the crash dump a session wrote, if any.
//!
//! Deadlock (through Steam's breakpad) writes
//! `game/bin/win64/deadlock_YYYY_MMDD_HHMMSS_<n>_<reason>.mdmp`; older builds
//! used a `project8_` prefix.

use std::path::Path;
use std::time::SystemTime;

use chrono::{DateTime, Duration, Utc};
use dmp_parser::DmpSummary;

use super::same_process_start;
use super::types::DumpSummary;

/// File times and our start time come from different clocks and roundings.
const START_SLACK: Duration = Duration::seconds(5);
/// Dumps of a hang can be written well after the last sign of life.
const END_SLACK: Duration = Duration::seconds(120);

/// The session whose dump we are looking for.
#[derive(Debug, Clone, Copy)]
pub struct DumpSearch {
  pub pid: Option<u32>,
  /// The OS's process start time (seconds since the epoch). A dump records
  /// the same moment, which tells runs apart where PIDs can't (Proton).
  pub process_start: Option<u64>,
  pub started_at: DateTime<Utc>,
  /// The last sign of life.
  pub ended_at: Option<DateTime<Utc>>,
  /// When a later run started; newer dumps are its own.
  pub next_start: Option<DateTime<Utc>>,
}

impl DumpSearch {
  fn covers(&self, written: DateTime<Utc>) -> bool {
    written >= self.started_at - START_SLACK
      && self
        .ended_at
        .is_none_or(|ended_at| written <= ended_at + END_SLACK)
      && self
        .next_start
        .is_none_or(|next_start| written < next_start)
  }

  /// A dump that records its process's start time must record ours. Without
  /// one, only Windows PIDs can be compared: under Proton the dump has Wine's.
  fn matches(&self, dump: &DmpSummary) -> bool {
    if let (Some(start), Some(created)) = (self.process_start, dump.process_create_time) {
      return u64::try_from(created.timestamp())
        .is_ok_and(|created| same_process_start(created, start));
    }
    !cfg!(windows)
      || self
        .pid
        .zip(dump.process_id)
        .is_none_or(|(pid, dump_pid)| pid == dump_pid)
  }
}

pub fn reason_from_file_name(name: &str) -> Option<String> {
  let stem = name.strip_suffix(".mdmp")?;
  let (_, reason) = stem.rsplit_once('_')?;
  (!reason.is_empty() && !reason.chars().all(|c| c.is_ascii_digit())).then(|| reason.to_string())
}

fn is_game_dump(name: &str) -> bool {
  let lower = name.to_ascii_lowercase();
  (lower.starts_with("deadlock_") || lower.starts_with("project8_")) && lower.ends_with(".mdmp")
}

/// The newest dump in `dir` written during the session by its process. A dump
/// that can't be read yet still counts.
pub fn find_session_dump(dir: &Path, search: &DumpSearch) -> Option<DumpSummary> {
  let mut candidates: Vec<(DateTime<Utc>, String)> = std::fs::read_dir(dir)
    .ok()?
    .flatten()
    .filter_map(|entry| {
      let name = entry.file_name().to_string_lossy().into_owned();
      if !is_game_dump(&name) {
        return None;
      }
      let modified: DateTime<Utc> = entry
        .metadata()
        .ok()?
        .modified()
        .ok()
        .map(DateTime::<Utc>::from)
        .unwrap_or_else(|| SystemTime::UNIX_EPOCH.into());
      search.covers(modified).then_some((modified, name))
    })
    .collect();
  candidates.sort_by_key(|(modified, _)| std::cmp::Reverse(*modified));

  candidates.into_iter().find_map(|(_, name)| {
    let parsed = dmp_parser::DmpParser::summarize_file(dir.join(&name)).ok();
    if parsed.as_ref().is_some_and(|dump| !search.matches(dump)) {
      return None;
    }
    let comment = parsed.as_ref().and_then(|dump| dump.comment.as_ref());
    Some(DumpSummary {
      reason: reason_from_file_name(&name),
      exception_code: parsed
        .as_ref()
        .and_then(|dump| dump.exception_code)
        .map(|code| format!("0x{code:08X}")),
      uptime_secs: comment.and_then(|comment| comment.uptime_secs),
      addon_count: comment
        .and_then(|comment| comment.addons.as_ref())
        .map(|addons| addons.len() as u32),
      file: name,
    })
  })
}

#[cfg(test)]
pub(super) mod tests {
  use super::*;

  const PROCESS_START: u32 = 1_760_000_000;

  /// A minimal minidump: a MiscInfo stream (PID and, if given, the process
  /// start time) and a comment stream.
  pub fn synthetic_dump(pid: u32, process_start: Option<u32>, comment: &str) -> Vec<u8> {
    let directory_rva = 32u32;
    let misc_rva = directory_rva + 2 * 12;
    let misc_size = 24u32;
    let comment_rva = misc_rva + misc_size;
    let mut comment_bytes = comment.as_bytes().to_vec();
    comment_bytes.push(0);

    let mut bytes = Vec::new();
    for value in [0x504D_444D, 0xA793, 2, directory_rva, 0, 1_776_714_968] {
      bytes.extend_from_slice(&u32::to_le_bytes(value));
    }
    bytes.extend_from_slice(&0u64.to_le_bytes());
    for value in [
      15,
      misc_size,
      misc_rva,
      10,
      comment_bytes.len() as u32,
      comment_rva,
    ] {
      bytes.extend_from_slice(&u32::to_le_bytes(value));
    }
    let flags = if process_start.is_some() {
      0x1 | 0x2
    } else {
      0x1
    };
    for value in [misc_size, flags, pid, process_start.unwrap_or(0), 0, 0] {
      bytes.extend_from_slice(&u32::to_le_bytes(value));
    }
    bytes.extend_from_slice(&comment_bytes);
    bytes
  }

  fn search(pid: u32, process_start: Option<u32>) -> DumpSearch {
    DumpSearch {
      pid: Some(pid),
      process_start: process_start.map(u64::from),
      started_at: Utc::now() - Duration::seconds(60),
      ended_at: None,
      next_start: None,
    }
  }

  fn write_dump(dir: &tempfile::TempDir, bytes: &[u8]) {
    std::fs::write(
      dir.path().join("deadlock_2026_1008_120041_0_crash.mdmp"),
      bytes,
    )
    .unwrap();
  }

  #[test]
  fn reads_the_reason_from_the_file_name() {
    assert_eq!(
      reason_from_file_name("deadlock_2026_0420_215608_2_accessviolation.mdmp").as_deref(),
      Some("accessviolation")
    );
    assert_eq!(
      reason_from_file_name("project8_2024_0919_222736_0_error.mdmp").as_deref(),
      Some("error")
    );
    assert_eq!(
      reason_from_file_name("deadlock_2026_0420_215608.mdmp"),
      None
    );
  }

  #[test]
  fn finds_a_dump_written_during_the_session() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(
      dir
        .path()
        .join("deadlock_2026_1008_120041_0_accessviolation.mdmp"),
      synthetic_dump(4242, None, "Crash\nUptime( 41.25 )\nAddons: \n"),
    )
    .unwrap();
    std::fs::write(dir.path().join("deadlock.exe"), b"").unwrap();

    let dump = find_session_dump(
      dir.path(),
      &DumpSearch {
        ended_at: Some(Utc::now()),
        ..search(4242, None)
      },
    )
    .unwrap();

    assert_eq!(
      dump.file,
      "deadlock_2026_1008_120041_0_accessviolation.mdmp"
    );
    assert_eq!(dump.reason.as_deref(), Some("accessviolation"));
    assert_eq!(dump.uptime_secs, Some(41.25));
    assert_eq!(dump.addon_count, Some(0));
  }

  #[test]
  fn ignores_dumps_from_before_the_session() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(
      dir.path().join("deadlock_2026_0101_000000_0_error.mdmp"),
      synthetic_dump(4242, None, "error\n"),
    )
    .unwrap();

    let later = DumpSearch {
      started_at: Utc::now() + Duration::seconds(60),
      ..search(4242, None)
    };
    assert_eq!(find_session_dump(dir.path(), &later), None);
  }

  #[test]
  fn a_dump_that_cannot_be_read_still_counts() {
    let dir = tempfile::tempdir().unwrap();
    write_dump(&dir, b"partially written");

    let dump = find_session_dump(dir.path(), &search(4242, Some(PROCESS_START))).unwrap();

    assert_eq!(dump.reason.as_deref(), Some("crash"));
    assert_eq!(dump.uptime_secs, None);
  }

  #[test]
  fn matches_a_dump_by_its_process_start_time() {
    let dir = tempfile::tempdir().unwrap();
    // Under Proton the dump names Wine's PID, not the one we track.
    write_dump(
      &dir,
      &synthetic_dump(1111, Some(PROCESS_START + 1), "Crash\n"),
    );

    assert!(find_session_dump(dir.path(), &search(4242, Some(PROCESS_START))).is_some());
  }

  #[test]
  fn skips_the_dump_of_another_run() {
    let dir = tempfile::tempdir().unwrap();
    write_dump(
      &dir,
      &synthetic_dump(4242, Some(PROCESS_START + 600), "Crash\n"),
    );

    assert_eq!(
      find_session_dump(dir.path(), &search(4242, Some(PROCESS_START))),
      None
    );
  }

  #[test]
  fn stops_looking_where_a_later_run_started() {
    let dir = tempfile::tempdir().unwrap();
    write_dump(&dir, &synthetic_dump(4242, None, "Crash\n"));

    let later_run = DumpSearch {
      next_start: Some(Utc::now() - Duration::seconds(10)),
      ..search(4242, None)
    };
    assert_eq!(find_session_dump(dir.path(), &later_run), None);
    assert!(find_session_dump(dir.path(), &search(4242, None)).is_some());
  }

  #[cfg(windows)]
  #[test]
  fn without_a_start_time_skips_dumps_of_other_pids_on_windows() {
    let dir = tempfile::tempdir().unwrap();
    write_dump(&dir, &synthetic_dump(1111, None, "Crash\n"));

    assert_eq!(
      find_session_dump(dir.path(), &search(4242, Some(PROCESS_START))),
      None
    );
  }
}
