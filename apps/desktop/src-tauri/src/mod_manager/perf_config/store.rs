//! The desired overlay, persisted as `<app data>/performance/active.json`.

use std::fs;
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};

use super::catalog::cache_dir;
use super::types::DesiredOverlay;
use crate::errors::Error;

const FILE: &str = "active.json";

fn file_path(app_data_dir: &Path) -> PathBuf {
  cache_dir(app_data_dir).join(FILE)
}

/// The saved choice. A file we can't read or parse counts as no choice: the
/// user picks again rather than every launch failing on it.
pub fn load(app_data_dir: &Path) -> Option<DesiredOverlay> {
  let path = file_path(app_data_dir);
  let json = match fs::read_to_string(&path) {
    Ok(json) => json,
    Err(error) if error.kind() == ErrorKind::NotFound => return None,
    Err(error) => {
      log::warn!("Ignoring unreadable {}: {error}", path.display());
      return None;
    }
  };
  serde_json::from_str(&json)
    .inspect_err(|error| log::warn!("Ignoring corrupt {}: {error}", path.display()))
    .ok()
}

pub fn save(app_data_dir: &Path, desired: &DesiredOverlay) -> Result<(), Error> {
  let dir = cache_dir(app_data_dir);
  fs::create_dir_all(&dir)?;
  let json = serde_json::to_vec_pretty(desired).map_err(|error| {
    Error::PerformanceConfig(format!("Failed to save performance config: {error}"))
  })?;
  let mut file = tempfile::NamedTempFile::new_in(&dir)?;
  file.write_all(&json)?;
  file.as_file().sync_all()?;
  file
    .persist(dir.join(FILE))
    .map_err(|error| Error::FileWriteFailed(error.to_string()))?;
  Ok(())
}

pub fn clear(app_data_dir: &Path) -> Result<(), Error> {
  match fs::remove_file(file_path(app_data_dir)) {
    Err(error) if error.kind() != ErrorKind::NotFound => Err(error.into()),
    _ => Ok(()),
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::mod_manager::perf_config::types::{
    PerfApplyRequest, PerfConfigSource, ResolvedCounts,
  };

  fn desired() -> DesiredOverlay {
    DesiredOverlay {
      request: PerfApplyRequest {
        config_id: "preset:test".to_string(),
        name: "Test".to_string(),
        source: PerfConfigSource::Preset {
          id: "test".to_string(),
        },
        overrides: Vec::new(),
        include_engine_sections: false,
      },
      rev: "0123456789ab".to_string(),
      applied_at: "2026-10-08T12:00:00+00:00".to_string(),
      counts: ResolvedCounts::default(),
    }
  }

  #[test]
  fn saves_loads_and_clears() {
    let dir = tempfile::tempdir().expect("tempdir");
    assert_eq!(load(dir.path()), None);
    save(dir.path(), &desired()).expect("save");
    assert_eq!(load(dir.path()), Some(desired()));
    clear(dir.path()).expect("clear");
    assert_eq!(load(dir.path()), None);
    clear(dir.path()).expect("clearing twice is fine");
  }

  #[test]
  fn a_corrupt_file_reads_as_nothing_chosen() {
    let dir = tempfile::tempdir().expect("tempdir");
    fs::create_dir_all(cache_dir(dir.path())).expect("mkdir");
    fs::write(file_path(dir.path()), "{ not json").expect("write");
    assert_eq!(load(dir.path()), None);
  }
}
