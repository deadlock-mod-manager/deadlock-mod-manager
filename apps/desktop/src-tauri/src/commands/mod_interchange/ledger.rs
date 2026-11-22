//! Which interchange key became which DMM mod, and which source profile was
//! imported into which DMM profile.
//!
//! Local mods get an id derived from their key, but the user can later link
//! one to its GameBanana page, which changes the id. Without this ledger a
//! second import would bring the old local copy back next to the linked one,
//! and would create every source profile a second time.

use crate::errors::Error;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

const LEDGER_FILE: &str = "interchange-ledger.json";

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Ledger {
  #[serde(default)]
  pub version: u32,
  /// Interchange key -> DMM mod id.
  #[serde(default)]
  pub entries: BTreeMap<String, String>,
  /// `<source manager>:<profile key>` -> DMM profile id.
  #[serde(default)]
  pub profiles: BTreeMap<String, String>,
}

pub fn ledger_path(app_data: &Path) -> PathBuf {
  app_data.join(LEDGER_FILE)
}

/// A missing or unreadable ledger is an empty one: the worst case is a
/// duplicate prompt, never a failed import. An unreadable one is logged.
pub fn load(app_data: &Path) -> Ledger {
  let path = ledger_path(app_data);
  let text = match fs::read_to_string(&path) {
    Ok(text) => text,
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ledger::default(),
    Err(error) => {
      log::warn!(
        "Could not read the interchange ledger at {}: {error}",
        path.display()
      );
      return Ledger::default();
    }
  };
  serde_json::from_str(&text).unwrap_or_else(|error| {
    log::warn!(
      "Could not parse the interchange ledger at {}: {error}",
      path.display()
    );
    Ledger::default()
  })
}

pub fn save(app_data: &Path, ledger: &Ledger) -> Result<(), Error> {
  fs::create_dir_all(app_data)?;
  let path = ledger_path(app_data);
  let temp = path.with_extension("json.tmp");
  let bytes = serde_json::to_vec_pretty(&Ledger {
    version: 1,
    entries: ledger.entries.clone(),
    profiles: ledger.profiles.clone(),
  })
  .map_err(|e| Error::InvalidInput(format!("could not encode interchange ledger: {e}")))?;
  fs::write(&temp, bytes)?;
  if path.exists() {
    fs::remove_file(&path)?;
  }
  fs::rename(temp, path)?;
  Ok(())
}

/// Point every key that resolved to `from` at `to`.
pub fn relabel(ledger: &mut Ledger, from: &str, to: &str) {
  for value in ledger.entries.values_mut() {
    if value == from {
      *value = to.to_string();
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn round_trips_and_relabels() {
    let dir = tempfile::tempdir().unwrap();
    assert!(load(dir.path()).entries.is_empty());
    let mut ledger = Ledger::default();
    ledger
      .entries
      .insert("local:sha256:ab".into(), "local-x".into());
    relabel(&mut ledger, "local-x", "123");
    ledger
      .profiles
      .insert("grimoire:profile:p1".into(), "profile_1".into());
    save(dir.path(), &ledger).unwrap();
    let loaded = load(dir.path());
    assert_eq!(loaded.entries["local:sha256:ab"], "123");
    assert_eq!(loaded.profiles["grimoire:profile:p1"], "profile_1");
    fs::write(ledger_path(dir.path()), b"{broken").unwrap();
    assert!(load(dir.path()).entries.is_empty());
  }
}
