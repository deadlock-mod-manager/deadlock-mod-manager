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
//!
//! The check is a point-in-time answer, not a lock: the game can always start
//! a moment after it comes back idle, and a launch from outside the app cannot
//! be made atomic with it at all. Scanning on every call keeps that window as
//! narrow as a process scan allows.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard};

use crate::commands::state::MANAGER;
use crate::errors::Error;

static ENFORCED: AtomicBool = AtomicBool::new(true);

/// The operation the user confirmed in the warning dialog, waiting for that
/// same command to claim it. Keyed by name rather than a bare flag, so a
/// guarded command running concurrently cannot consume a confirmation meant
/// for another one.
static PERMIT: Mutex<Option<String>> = Mutex::new(None);

/// Nothing here can panic while the lock is held, so a poisoned permit is
/// recovered rather than left blocking every later operation.
fn permit() -> MutexGuard<'static, Option<String>> {
  PERMIT
    .lock()
    .unwrap_or_else(|poisoned| poisoned.into_inner())
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

/// Lets exactly one upcoming call of `operation` through. Armed when the user
/// confirms the warning dialog, claimed by the retry that follows it.
pub fn allow_next(operation: String) {
  log::warn!("Game file guard bypassed once for {operation} by user confirmation");
  *permit() = Some(operation);
}

/// Takes the permit if it belongs to this operation. One held for a different
/// operation is left where it is, for its own caller to claim.
fn claim_permit(operation: &str) -> bool {
  let mut permit = permit();
  if permit.as_deref() != Some(operation) {
    return false;
  }
  *permit = None;
  true
}

/// Whether the game state still has to be inspected for this operation.
fn needs_check(operation: &str) -> bool {
  if crate::runtime_environment::records_game_launches() {
    return false;
  }
  if !is_enforced() {
    return false;
  }
  !claim_permit(operation)
}

/// Blocks the caller when Deadlock is running and the guard applies.
pub fn ensure_game_idle_locked(operation: &str) -> Result<(), Error> {
  if !needs_check(operation) {
    return Ok(());
  }
  let mut manager = MANAGER
    .lock()
    .map_err(|_| Error::BackgroundTaskFailed("Mod manager lock poisoned".to_string()))?;
  if manager.is_game_running()? {
    log::warn!("Blocked {operation}: Deadlock is running");
    return Err(Error::GameRunning);
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  /// The guard is process-global state, so the cases cannot run in parallel.
  static SERIAL: Mutex<()> = Mutex::new(());

  fn reset() {
    ENFORCED.store(true, Ordering::SeqCst);
    *permit() = None;
  }

  #[test]
  fn checks_the_game_by_default() {
    let _serial = SERIAL.lock().unwrap();
    reset();
    assert!(needs_check("install_mod"));
  }

  #[test]
  fn skips_the_check_when_the_user_turned_the_guard_off() {
    let _serial = SERIAL.lock().unwrap();
    reset();
    set_enforced(false);
    assert!(!needs_check("install_mod"));
    set_enforced(true);
    assert!(needs_check("install_mod"));
  }

  #[test]
  fn one_override_covers_one_operation_only() {
    let _serial = SERIAL.lock().unwrap();
    reset();
    allow_next("install_mod".to_string());
    assert!(!needs_check("install_mod"), "the confirmed operation runs");
    assert!(needs_check("install_mod"), "the next one is guarded again");
  }

  #[test]
  fn another_command_cannot_claim_the_confirmed_one() {
    let _serial = SERIAL.lock().unwrap();
    reset();
    allow_next("install_mod".to_string());
    assert!(
      needs_check("clear_mods"),
      "a different command stays guarded"
    );
    assert!(
      !needs_check("install_mod"),
      "the confirmation is still there for its own command"
    );
  }

  #[test]
  fn an_unused_override_survives_until_it_is_needed() {
    let _serial = SERIAL.lock().unwrap();
    reset();
    allow_next("install_mod".to_string());
    set_enforced(false);
    assert!(
      !needs_check("install_mod"),
      "the guard is off, nothing to consume"
    );
    set_enforced(true);
    assert!(!needs_check("install_mod"), "the override is still armed");
    assert!(needs_check("install_mod"));
  }
}
