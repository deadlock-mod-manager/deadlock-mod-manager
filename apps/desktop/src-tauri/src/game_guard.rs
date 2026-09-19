//! Keeps file operations off the game install while Deadlock is running.
//!
//! Installing, removing or reordering mods renames and moves VPKs inside
//! `citadel/addons`, and the running game holds those files open. On Windows
//! the rename fails outright; worse, a mod that is half-applied when the engine
//! reads it can corrupt the load order. Every command that writes to the game
//! folder therefore asks here first.
//!
//! Two escape hatches exist, both driven by the user: a setting that turns the
//! whole guard off, and a one-shot override the app arms when someone confirms
//! "continue anyway" in the warning dialog.

use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use crate::commands::state::MANAGER;
use crate::errors::Error;
use crate::mod_manager::ModManager;

static ENFORCED: AtomicBool = AtomicBool::new(true);
static BYPASS_NEXT: AtomicBool = AtomicBool::new(false);

/// Answering "is Deadlock running" means a full process scan, and batch
/// operations ask once per mod. Within one such batch the answer cannot
/// meaningfully change, so it is reused for a moment.
const CACHE_TTL: Duration = Duration::from_millis(1500);
static LAST_ANSWER: Mutex<Option<(Instant, bool)>> = Mutex::new(None);

fn cached(last: Option<(Instant, bool)>, now: Instant, ttl: Duration) -> Option<bool> {
  last
    .filter(|(at, _)| now.duration_since(*at) < ttl)
    .map(|(_, running)| running)
}

/// Runs the scan unless a fresh answer is already on hand.
fn game_running(manager: &mut ModManager) -> Result<bool, Error> {
  let mut last = LAST_ANSWER
    .lock()
    .map_err(|_| Error::BackgroundTaskFailed("Game guard cache poisoned".to_string()))?;
  if let Some(running) = cached(*last, Instant::now(), CACHE_TTL) {
    return Ok(running);
  }
  let running = manager.is_game_running()?;
  *last = Some((Instant::now(), running));
  Ok(running)
}

/// Drops the cached answer so the next check scans again. Called after the app
/// starts or stops the game itself, where the state is known to have changed.
pub fn invalidate_cache() {
  if let Ok(mut last) = LAST_ANSWER.lock() {
    *last = None;
  }
}

/// Mirrors the user's setting. On by default: a fresh install protects itself
/// before the frontend has had a chance to sync anything.
pub fn set_enforced(enforced: bool) {
  ENFORCED.store(enforced, Ordering::SeqCst);
  log::info!(
    "Game file guard {}",
    if enforced { "enabled" } else { "disabled" }
  );
}

pub fn is_enforced() -> bool {
  ENFORCED.load(Ordering::SeqCst)
}

/// Lets exactly one upcoming operation through. Armed when the user confirms
/// the warning dialog, consumed by the very next guarded command.
pub fn allow_next() {
  BYPASS_NEXT.store(true, Ordering::SeqCst);
  log::warn!("Game file guard bypassed once by user confirmation");
}

/// Whether the game state still has to be inspected. Consumes the one-shot
/// override, so a confirmed operation cannot be blocked by a later check.
fn needs_check() -> bool {
  if crate::runtime_environment::records_game_launches() {
    return false;
  }
  if !is_enforced() {
    return false;
  }
  !BYPASS_NEXT.swap(false, Ordering::SeqCst)
}

/// Blocks the caller when Deadlock is running and the guard applies.
pub fn ensure_game_idle_locked() -> Result<(), Error> {
  if !needs_check() {
    return Ok(());
  }
  let mut manager = MANAGER
    .lock()
    .map_err(|_| Error::BackgroundTaskFailed("Mod manager lock poisoned".to_string()))?;
  if game_running(&mut manager)? {
    log::warn!("Blocked a game file operation: Deadlock is running");
    return Err(Error::GameRunning);
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::sync::Mutex;

  /// The guard is process-global state, so the cases cannot run in parallel.
  static SERIAL: Mutex<()> = Mutex::new(());

  fn reset() {
    ENFORCED.store(true, Ordering::SeqCst);
    BYPASS_NEXT.store(false, Ordering::SeqCst);
  }

  #[test]
  fn checks_the_game_by_default() {
    let _serial = SERIAL.lock().unwrap();
    reset();
    assert!(needs_check());
  }

  #[test]
  fn skips_the_check_when_the_user_turned_the_guard_off() {
    let _serial = SERIAL.lock().unwrap();
    reset();
    set_enforced(false);
    assert!(!needs_check());
    set_enforced(true);
    assert!(needs_check());
  }

  #[test]
  fn one_override_covers_one_operation_only() {
    let _serial = SERIAL.lock().unwrap();
    reset();
    allow_next();
    assert!(!needs_check(), "the confirmed operation runs");
    assert!(needs_check(), "the next one is guarded again");
  }

  #[test]
  fn a_fresh_answer_is_reused_and_a_stale_one_is_not() {
    let now = Instant::now();
    let ttl = Duration::from_millis(1500);
    let recent = now - Duration::from_millis(500);
    let old = now - Duration::from_millis(2000);

    assert_eq!(cached(Some((recent, true)), now, ttl), Some(true));
    assert_eq!(cached(Some((recent, false)), now, ttl), Some(false));
    assert_eq!(cached(Some((old, true)), now, ttl), None);
    assert_eq!(cached(None, now, ttl), None);
  }

  #[test]
  fn an_unused_override_survives_until_it_is_needed() {
    let _serial = SERIAL.lock().unwrap();
    reset();
    allow_next();
    set_enforced(false);
    assert!(!needs_check(), "the guard is off, nothing to consume");
    set_enforced(true);
    assert!(!needs_check(), "the override is still armed");
    assert!(needs_check());
  }
}
