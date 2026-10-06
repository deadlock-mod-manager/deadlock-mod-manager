//! Tells the frontend when a VPK under the game's addons roots appears,
//! disappears, or is renamed, so files the user deletes outside DMM are
//! noticed while DMM is open. The frontend then reconciles every profile
//! against its manifest; this module only reports that something changed.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::time::Duration;

use notify::event::ModifyKind;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::Emitter;

use crate::app_runtime::AppHandle;

pub const ADDONS_CHANGED_EVENT: &str = "addons-vpks-changed";

/// DMM's own operations rename many files in a row; report a burst once,
/// after it goes quiet.
const QUIET_PERIOD: Duration = Duration::from_millis(500);

/// The watched `citadel` directory and its watcher. Dropping the watcher ends
/// its debounce thread.
static WATCHER: Mutex<Option<(PathBuf, RecommendedWatcher)>> = Mutex::new(None);

/// Watch every `addons*` root under `citadel`. Shard roots such as `addons2`
/// are created on demand, so the watch covers `citadel` itself. Calling this
/// again for the same directory is a no-op; a new directory replaces the old
/// watch.
pub fn watch(app_handle: AppHandle, citadel: PathBuf) -> notify::Result<()> {
  let mut current = WATCHER.lock().unwrap_or_else(|poison| poison.into_inner());
  if current.as_ref().is_some_and(|(path, _)| *path == citadel) {
    return Ok(());
  }

  let (tx, rx) = std::sync::mpsc::channel();
  let root = citadel.clone();
  let mut watcher = notify::recommended_watcher(move |result: notify::Result<Event>| {
    if let Ok(event) = result
      && is_addon_vpk_change(&root, &event)
    {
      let _ = tx.send(());
    }
  })?;
  watcher.watch(&citadel, RecursiveMode::Recursive)?;
  std::thread::spawn(move || report_bursts(&rx, &app_handle));

  log::info!("Watching addon VPKs under {}", citadel.display());
  *current = Some((citadel, watcher));
  Ok(())
}

fn report_bursts(rx: &Receiver<()>, app_handle: &AppHandle) {
  while rx.recv().is_ok() {
    loop {
      match rx.recv_timeout(QUIET_PERIOD) {
        Ok(()) => continue,
        Err(RecvTimeoutError::Timeout) => break,
        Err(RecvTimeoutError::Disconnected) => return,
      }
    }
    if let Err(error) = app_handle.emit(ADDONS_CHANGED_EVENT, ()) {
      log::warn!("Failed to report changed addon VPKs: {error}");
    }
  }
}

fn is_addon_vpk_change(citadel: &Path, event: &Event) -> bool {
  let relevant_kind = matches!(
    event.kind,
    EventKind::Create(_) | EventKind::Remove(_) | EventKind::Modify(ModifyKind::Name(_))
  );
  relevant_kind && event.paths.iter().any(|path| is_addon_vpk(citadel, path))
}

/// A `.vpk` anywhere below an `addons` or `addonsN` root of `citadel`. The
/// game's own paks sit directly in `citadel` and do not count.
fn is_addon_vpk(citadel: &Path, path: &Path) -> bool {
  let is_vpk = path
    .extension()
    .is_some_and(|extension| extension.eq_ignore_ascii_case("vpk"));
  let in_addons_root = path
    .strip_prefix(citadel)
    .ok()
    .and_then(|relative| relative.components().next())
    .and_then(|root| root.as_os_str().to_str())
    .is_some_and(|root| {
      root
        .strip_prefix("addons")
        .is_some_and(|suffix| suffix.chars().all(|c| c.is_ascii_digit()))
    });
  is_vpk && in_addons_root
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn only_vpks_below_addons_roots_count() {
    let citadel = Path::new("/game/citadel");
    for (path, expected) in [
      ("/game/citadel/addons/pak01_dir.vpk", true),
      ("/game/citadel/addons/profile/pak01_dir.VPK", true),
      ("/game/citadel/addons2/profile/pak01_dir.vpk", true),
      ("/game/citadel/addons/profile/.dmm.json", false),
      ("/game/citadel/pak01_dir.vpk", false),
      ("/game/citadel/addons_backup/pak01_dir.vpk", false),
      ("/game/citadel/console.log", false),
      ("/elsewhere/addons/pak01_dir.vpk", false),
    ] {
      assert_eq!(is_addon_vpk(citadel, Path::new(path)), expected, "{path}");
    }
  }
}
