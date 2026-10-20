use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StateFileRecovery {
  pub reason: String,
  pub folder: String,
  pub backup_path: Option<String>,
}

static RECOVERY: OnceLock<Option<StateFileRecovery>> = OnceLock::new();

fn backup_path(path: &Path) -> PathBuf {
  let timestamp = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|elapsed| elapsed.as_secs())
    .unwrap_or_default();
  path.with_extension(format!("unreadable-{timestamp}.json"))
}

// tauri-plugin-store ignores load errors: an unreadable state file opens as an
// empty store, and the plugin saves that empty store over the file on exit.
// Moving the file aside first keeps the user's data and lets the app say what
// happened instead of silently starting over.
fn quarantine_unreadable(path: &Path) -> Option<StateFileRecovery> {
  let reason = match std::fs::read(path) {
    Ok(bytes) => match serde_json::from_slice::<HashMap<String, Value>>(&bytes) {
      Ok(_) => return None,
      Err(error) => error.to_string(),
    },
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => return None,
    Err(error) => error.to_string(),
  };

  let backup = backup_path(path);
  let backup_path = match std::fs::rename(path, &backup) {
    Ok(()) => Some(backup.to_string_lossy().into_owned()),
    Err(error) => {
      log::error!("Failed to move unreadable state file aside: {error}");
      None
    }
  };
  log::error!(
    "State file {} is unreadable ({reason}); backup: {backup_path:?}",
    path.display()
  );

  Some(StateFileRecovery {
    reason,
    folder: path
      .parent()
      .map(|parent| parent.to_string_lossy().into_owned())
      .unwrap_or_default(),
    backup_path,
  })
}

pub fn inspect(path: &Path) {
  let _ = RECOVERY.set(quarantine_unreadable(path));
}

pub fn recovery() -> Option<StateFileRecovery> {
  RECOVERY.get().cloned().flatten()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn moves_a_corrupt_state_file_aside_and_keeps_its_bytes() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("state.json");
    std::fs::write(&path, b"{\"local-config\": \"trunc").unwrap();

    let recovery = quarantine_unreadable(&path).expect("corrupt file is reported");

    assert!(!path.exists());
    let backup = recovery.backup_path.expect("corrupt file is moved aside");
    assert_eq!(
      std::fs::read(&backup).unwrap(),
      b"{\"local-config\": \"trunc"
    );
    assert_eq!(recovery.folder, dir.path().to_string_lossy());
  }

  #[test]
  fn treats_an_empty_state_file_as_unreadable() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("state.json");
    std::fs::write(&path, b"").unwrap();

    assert!(quarantine_unreadable(&path).is_some());
  }

  #[test]
  fn leaves_a_valid_or_missing_state_file_alone() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("state.json");
    assert_eq!(quarantine_unreadable(&path), None);

    std::fs::write(&path, b"{\"local-config\": \"{}\"}").unwrap();
    assert_eq!(quarantine_unreadable(&path), None);
    assert!(path.exists());
  }
}
