//! Per-plugin activity: what a plugin staged, installed, wrote, fetched,
//! announced or was refused, and what the user changed about it. Kept newest
//! first in the plugin's data directory. Routine reads are not recorded.

use super::manifest::ExternalPluginPermissionId;
use crate::{Error, lock};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use ts_rs::TS;

pub const MAX_ENTRIES: usize = 100;
/// A plugin that retries a refused call on every tick records it once per
/// window instead of once per tick.
const REPEAT_WINDOW_SECONDS: i64 = 60;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ExternalPluginActivityKind {
  Staged,
  Deployed,
  Wrote,
  Fetched,
  Notified,
  Blocked,
  Granted,
  Revoked,
  Updated,
  DataCleared,
  Stopped,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ExternalPluginActivity {
  pub at: String,
  pub kind: ExternalPluginActivityKind,
  pub permission: Option<ExternalPluginPermissionId>,
  pub method: Option<String>,
  pub hash: Option<String>,
  #[ts(type = "number | null")]
  pub size: Option<u64>,
  #[ts(type = "number | null")]
  pub resources: Option<u64>,
  pub file_name: Option<String>,
  pub profile_folder: Option<String>,
  /// The network host a `fetched` or refused `http.fetch` entry names.
  #[serde(default)]
  pub host: Option<String>,
  pub reason: Option<String>,
}

impl ExternalPluginActivity {
  pub fn new(kind: ExternalPluginActivityKind) -> Self {
    Self {
      at: chrono::Utc::now().to_rfc3339(),
      kind,
      permission: None,
      method: None,
      hash: None,
      size: None,
      resources: None,
      file_name: None,
      profile_folder: None,
      host: None,
      reason: None,
    }
  }

  /// Refusals, writes and fetches that repeat the newest entry within the
  /// window are dropped, so a plugin doing the same thing on every tick
  /// logs it once a minute.
  fn repeats(&self, newer: &Self) -> bool {
    use ExternalPluginActivityKind as Kind;
    let elapsed = chrono::DateTime::parse_from_rfc3339(&newer.at)
      .ok()
      .zip(chrono::DateTime::parse_from_rfc3339(&self.at).ok())
      .map(|(newer, older)| (newer - older).num_seconds());
    matches!(self.kind, Kind::Blocked | Kind::Wrote | Kind::Fetched)
      && newer.kind == self.kind
      && self.method == newer.method
      && self.permission == newer.permission
      && self.file_name == newer.file_name
      && self.host == newer.host
      && self.reason == newer.reason
      && elapsed.is_some_and(|seconds| seconds < REPEAT_WINDOW_SECONDS)
  }
}

pub struct ActivityLog {
  path: PathBuf,
  writing: Mutex<()>,
}

impl ActivityLog {
  pub fn new(data_dir: &Path) -> Self {
    Self {
      path: data_dir.join("activity.json"),
      writing: Mutex::new(()),
    }
  }

  /// A corrupt log starts over instead of blocking new entries.
  fn load(&self) -> Result<Vec<ExternalPluginActivity>, Error> {
    match fs::read(&self.path) {
      Ok(bytes) => Ok(serde_json::from_slice(&bytes).unwrap_or_else(|error| {
        log::warn!("[ExternalPlugins] Discarding a corrupt activity log: {error}");
        Vec::new()
      })),
      Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
      Err(error) => Err(error.into()),
    }
  }

  /// Newest first, at most `limit` entries.
  pub fn list(&self, limit: usize) -> Result<Vec<ExternalPluginActivity>, Error> {
    let mut entries = self.load()?;
    entries.truncate(limit);
    Ok(entries)
  }

  /// Adds `entry` as the newest one. Returns false when it repeats the
  /// newest entry within the repeat window and was not recorded.
  pub fn record(&self, entry: &ExternalPluginActivity) -> Result<bool, Error> {
    let _writing = lock(&self.writing);
    let mut entries = self.load()?;
    if entries.first().is_some_and(|newest| newest.repeats(entry)) {
      return Ok(false);
    }
    entries.insert(0, entry.clone());
    entries.truncate(MAX_ENTRIES);
    if let Some(parent) = self.path.parent() {
      fs::create_dir_all(parent)?;
    }
    let bytes =
      serde_json::to_vec(&entries).map_err(|error| Error::InvalidInput(error.to_string()))?;
    let partial = self.path.with_extension("json.part");
    fs::write(&partial, bytes)?;
    fs::rename(partial, &self.path)?;
    Ok(true)
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn entry(kind: ExternalPluginActivityKind, reason: &str) -> ExternalPluginActivity {
    ExternalPluginActivity {
      reason: Some(reason.into()),
      ..ExternalPluginActivity::new(kind)
    }
  }

  #[test]
  fn keeps_the_newest_hundred_across_reopens() {
    let dir = tempfile::tempdir().unwrap();
    let log = ActivityLog::new(dir.path());
    for index in 0..MAX_ENTRIES + 5 {
      log
        .record(&entry(
          ExternalPluginActivityKind::Updated,
          &index.to_string(),
        ))
        .unwrap();
    }
    let reopened = ActivityLog::new(dir.path());
    let entries = reopened.list(MAX_ENTRIES + 5).unwrap();
    assert_eq!(entries.len(), MAX_ENTRIES);
    assert_eq!(entries[0].reason.as_deref(), Some("104"));
    assert_eq!(entries[MAX_ENTRIES - 1].reason.as_deref(), Some("5"));
    assert_eq!(reopened.list(3).unwrap().len(), 3);
    assert!(!dir.path().join("activity.json.part").exists());
  }

  #[test]
  fn collapses_a_refusal_repeated_every_tick() {
    let dir = tempfile::tempdir().unwrap();
    let log = ActivityLog::new(dir.path());
    let blocked = entry(ExternalPluginActivityKind::Blocked, "permission_denied");
    assert!(log.record(&blocked).unwrap());
    assert!(!log.record(&blocked).unwrap());
    let other = ExternalPluginActivity {
      method: Some("mods.install".into()),
      ..blocked.clone()
    };
    assert!(log.record(&other).unwrap());
    let later = ExternalPluginActivity {
      at: (chrono::Utc::now() + chrono::Duration::seconds(REPEAT_WINDOW_SECONDS)).to_rfc3339(),
      ..other.clone()
    };
    assert!(log.record(&later).unwrap());
    assert_eq!(log.list(MAX_ENTRIES).unwrap().len(), 3);
  }
}
