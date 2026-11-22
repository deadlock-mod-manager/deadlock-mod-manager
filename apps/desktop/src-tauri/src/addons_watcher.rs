use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::time::Duration;

use notify::event::ModifyKind;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::Emitter;

use crate::app_runtime::AppHandle;

pub const ADDONS_CHANGED_EVENT: &str = "addons-vpks-changed";

const QUIET_PERIOD: Duration = Duration::from_millis(500);

static WATCHER: Mutex<Option<(PathBuf, RecommendedWatcher)>> = Mutex::new(None);

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
    EventKind::Create(_)
      | EventKind::Remove(_)
      | EventKind::Modify(ModifyKind::Name(_) | ModifyKind::Data(_) | ModifyKind::Any)
  );
  relevant_kind && event.paths.iter().any(|path| is_addon_vpk(citadel, path))
}

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
  fn reports_content_changes_but_not_access_metadata() {
    use notify::event::{DataChange, MetadataKind};
    let root = Path::new("/game/citadel");
    let path = root.join("addons/pak01_dir.vpk");
    for kind in [ModifyKind::Data(DataChange::Any), ModifyKind::Any] {
      assert!(is_addon_vpk_change(
        root,
        &Event::new(EventKind::Modify(kind)).add_path(path.clone())
      ));
    }
    assert!(!is_addon_vpk_change(
      root,
      &Event::new(EventKind::Modify(ModifyKind::Metadata(
        MetadataKind::AccessTime
      )))
      .add_path(path)
    ));
  }

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
