//! `<app data>/sessions/`: the running session (so a crash while the app is
//! closed is still analyzed at the next start), reports the frontend hasn't
//! acknowledged yet, and the last build we saw.

use std::io::Write;
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

use super::types::{SessionFingerprint, SessionReport};

const CURRENT_FILE: &str = "current.json";
const PENDING_FILE: &str = "pending.json";
const STATE_FILE: &str = "state.json";

/// A session that is still running (or that we haven't analyzed yet).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRecord {
  pub session_id: String,
  /// `None` under Flatpak, where the host's processes are invisible.
  pub pid: Option<u32>,
  /// The OS's process start time (seconds since the epoch), to tell our
  /// process from a later one that reuses the PID.
  pub process_start: Option<u64>,
  pub started_at: DateTime<Utc>,
  pub launched_by_dmm: bool,
  pub dmm_stop_requested: bool,
  pub build_changed: bool,
  pub game_path: PathBuf,
  pub steam_path: Option<PathBuf>,
  pub fingerprint: SessionFingerprint,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildStamp {
  pub client_version: Option<u32>,
  pub steam_build_id: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackerState {
  pub last_build: Option<BuildStamp>,
}

pub fn sessions_dir(app_data_dir: &Path) -> PathBuf {
  app_data_dir.join("sessions")
}

pub fn load_current(dir: &Path) -> Option<SessionRecord> {
  read_json(&dir.join(CURRENT_FILE))
}

pub fn save_current(dir: &Path, record: Option<&SessionRecord>) {
  let path = dir.join(CURRENT_FILE);
  match record {
    Some(record) => write_json(&path, record),
    None => {
      if let Err(error) = std::fs::remove_file(&path)
        && error.kind() != std::io::ErrorKind::NotFound
      {
        log::warn!("Could not remove {}: {error}", path.display());
      }
    }
  }
}

pub fn load_pending(dir: &Path) -> Vec<SessionReport> {
  read_json(&dir.join(PENDING_FILE)).unwrap_or_default()
}

pub fn save_pending(dir: &Path, reports: &[SessionReport]) {
  write_json(&dir.join(PENDING_FILE), &reports);
}

pub fn load_state(dir: &Path) -> TrackerState {
  read_json(&dir.join(STATE_FILE)).unwrap_or_default()
}

pub fn save_state(dir: &Path, state: &TrackerState) {
  write_json(&dir.join(STATE_FILE), state);
}

fn read_json<T: DeserializeOwned>(path: &Path) -> Option<T> {
  let text = std::fs::read_to_string(path).ok()?;
  serde_json::from_str(&text)
    .inspect_err(|error| log::warn!("Ignoring unreadable {}: {error}", path.display()))
    .ok()
}

/// Session files are rewritten while the game runs; a torn write would lose
/// the session, so write to a temp file and rename it over the old one.
fn write_json<T: Serialize + ?Sized>(path: &Path, value: &T) {
  let result = (|| -> std::io::Result<()> {
    let dir = path.parent().unwrap_or(Path::new("."));
    std::fs::create_dir_all(dir)?;
    let bytes = serde_json::to_vec_pretty(value)?;
    let mut file = tempfile::NamedTempFile::new_in(dir)?;
    file.write_all(&bytes)?;
    file.persist(path).map_err(|error| error.error)?;
    Ok(())
  })();
  if let Err(error) = result {
    log::warn!("Could not write {}: {error}", path.display());
  }
}

#[cfg(test)]
pub(super) mod tests {
  use super::*;
  use crate::game_session::types::SessionClassification;

  pub fn fingerprint() -> SessionFingerprint {
    SessionFingerprint {
      client_version: Some(6417),
      steam_build_id: Some("20412345".to_string()),
      launch_args: vec!["-condebug".to_string()],
      condebug: true,
      autoexec_hash: None,
      addon_paths: Vec::new(),
      perf_config: None,
      client: None,
    }
  }

  pub fn record(pid: Option<u32>) -> SessionRecord {
    SessionRecord {
      session_id: "1760000000000-4242".to_string(),
      pid,
      process_start: Some(1_760_000_000),
      started_at: DateTime::from_timestamp(1_760_000_000, 0).unwrap(),
      launched_by_dmm: true,
      dmm_stop_requested: false,
      build_changed: false,
      game_path: PathBuf::from("/games/Deadlock"),
      steam_path: None,
      fingerprint: fingerprint(),
    }
  }

  #[test]
  fn the_running_session_survives_a_restart() {
    let dir = tempfile::tempdir().unwrap();
    let record = record(Some(4242));

    save_current(dir.path(), Some(&record));
    assert_eq!(load_current(dir.path()), Some(record));

    save_current(dir.path(), None);
    assert_eq!(load_current(dir.path()), None);
  }

  #[test]
  fn pending_reports_round_trip() {
    let dir = tempfile::tempdir().unwrap();
    let report = SessionReport {
      session_id: "s1".to_string(),
      started_at: "2026-10-08T12:00:00Z".to_string(),
      ended_at: Some("2026-10-08T12:00:41Z".to_string()),
      uptime_secs: Some(41),
      exit_code: Some(0xC000_0005),
      exit_code_source: None,
      classification: SessionClassification::Crash,
      dump: None,
      console_clean: Some(false),
      launched_by_dmm: true,
      dmm_stopped: false,
      build_changed: false,
      recovered: false,
      fingerprint: fingerprint(),
    };

    save_pending(dir.path(), std::slice::from_ref(&report));
    assert_eq!(load_pending(dir.path()), vec![report]);
  }

  #[test]
  fn a_corrupt_file_is_treated_as_missing() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join(CURRENT_FILE), "{ not json").unwrap();

    assert_eq!(load_current(dir.path()), None);
    assert!(load_pending(dir.path()).is_empty());
  }
}
