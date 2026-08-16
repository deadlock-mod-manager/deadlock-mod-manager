//! Fingerprinting a profile's older VPKs in the background.
//!
//! Mods installed from now on are stamped as they are copied in, but a profile
//! that predates fingerprinting is full of files that are not, and stamping one
//! means rewriting it. Doing that for a hundred-mod library while the user waits
//! is not acceptable, so it happens here instead: whenever a profile is opened,
//! a task works through its unstamped files a few at a time.
//!
//! Each pass takes the manager lock, stamps a small batch, and lets go, so a mod
//! operation the user triggers never queues behind more than one batch. Only one
//! task per profile runs at a time.

use std::collections::HashSet;
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

use crate::commands::state::MANAGER;

/// VPKs stamped per batch before the lock is released.
const BATCH_SIZE: usize = 4;

/// Breathing room between batches, so the app stays responsive while a large
/// profile is worked through.
const PAUSE_BETWEEN_BATCHES: Duration = Duration::from_millis(400);

/// Give up rather than loop forever if a profile somehow never settles.
const MAX_BATCHES: usize = 500;

/// Profiles with a task already running, keyed the way the UI names them.
static RUNNING: LazyLock<Mutex<HashSet<String>>> = LazyLock::new(|| Mutex::new(HashSet::new()));

fn key_for(profile_folder: Option<&str>) -> String {
  profile_folder.unwrap_or("<default>").to_string()
}

/// Start working through `profile_folder`'s unstamped VPKs, unless a task for
/// that profile is already doing so.
pub fn spawn_for_profile(profile_folder: Option<String>) {
  let key = key_for(profile_folder.as_deref());
  if !RUNNING.lock().unwrap().insert(key.clone()) {
    return;
  }

  tauri::async_runtime::spawn(async move {
    run(profile_folder).await;
    RUNNING.lock().unwrap().remove(&key);
  });
}

async fn run(profile_folder: Option<String>) {
  for _ in 0..MAX_BATCHES {
    let outcome = MANAGER
      .lock()
      .unwrap()
      .backfill_fingerprints(profile_folder.as_deref(), BATCH_SIZE);

    match outcome {
      Ok(true) => {}
      Ok(false) => return,
      Err(error) => {
        log::warn!("Stopped fingerprinting profile {profile_folder:?} after an error: {error}");
        return;
      }
    }

    tokio::time::sleep(PAUSE_BETWEEN_BATCHES).await;
  }

  log::warn!("Fingerprint backfill for profile {profile_folder:?} hit its batch limit");
}
