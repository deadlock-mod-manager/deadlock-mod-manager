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

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{LazyLock, Mutex, MutexGuard};

use crate::commands::state::MANAGER;
use crate::errors::Error;

static ENFORCED: AtomicBool = AtomicBool::new(true);

static NEXT_PERMIT: AtomicU64 = AtomicU64::new(1);

/// Confirmations from the warning dialog, keyed by a token only the confirmed
/// retry carries. A name alone is not enough: two `purge_mod` calls can be in
/// flight at once, and the one the user never confirmed must not take the
/// other's permit.
static PERMITS: LazyLock<Mutex<HashMap<String, String>>> =
  LazyLock::new(|| Mutex::new(HashMap::new()));

/// Nothing here can panic while the lock is held, so a poisoned map is
/// recovered rather than left blocking every later operation.
fn permits() -> MutexGuard<'static, HashMap<String, String>> {
  PERMITS
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

/// Lets exactly one call of `operation` through: the one that comes back with
/// the returned token. Armed when the user confirms the warning dialog.
pub fn allow_next(operation: String) -> String {
  let token = NEXT_PERMIT.fetch_add(1, Ordering::Relaxed).to_string();
  log::warn!("Game file guard bypassed once for {operation} by user confirmation");
  permits().insert(token.clone(), operation);
  token
}

/// Takes the permit if this call carries its token and is the operation it
/// was granted for. Anything else leaves it for its own caller.
fn claim_permit(operation: &str, token: Option<&str>) -> bool {
  let Some(token) = token else {
    return false;
  };
  let mut permits = permits();
  if permits.get(token).map(String::as_str) != Some(operation) {
    return false;
  }
  permits.remove(token);
  true
}

/// Whether the game state still has to be inspected for this call.
fn needs_check(operation: &str, permit: Option<&str>) -> bool {
  if crate::runtime_environment::records_game_launches() {
    return false;
  }
  if !is_enforced() {
    return false;
  }
  !claim_permit(operation, permit)
}

/// Blocks the caller when Deadlock is running and the guard applies. `permit`
/// is the token from `allow_next`, passed only by a retry the user confirmed.
pub fn ensure_game_idle_locked(operation: &str, permit: Option<&str>) -> Result<(), Error> {
  if !needs_check(operation, permit) {
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
    permits().clear();
  }

  #[test]
  fn checks_the_game_by_default() {
    let _serial = SERIAL.lock().unwrap();
    reset();
    assert!(needs_check("install_mod", None));
  }

  #[test]
  fn skips_the_check_when_the_user_turned_the_guard_off() {
    let _serial = SERIAL.lock().unwrap();
    reset();
    set_enforced(false);
    assert!(!needs_check("install_mod", None));
    set_enforced(true);
    assert!(needs_check("install_mod", None));
  }

  #[test]
  fn one_override_covers_one_operation_only() {
    let _serial = SERIAL.lock().unwrap();
    reset();
    let token = allow_next("install_mod".to_string());
    assert!(
      !needs_check("install_mod", Some(&token)),
      "the confirmed operation runs"
    );
    assert!(
      needs_check("install_mod", Some(&token)),
      "the token cannot be reused"
    );
  }

  #[test]
  fn a_concurrent_call_of_the_same_command_cannot_claim_it() {
    let _serial = SERIAL.lock().unwrap();
    reset();
    let token = allow_next("purge_mod".to_string());
    assert!(
      needs_check("purge_mod", None),
      "the unconfirmed call stays guarded"
    );
    assert!(
      !needs_check("purge_mod", Some(&token)),
      "the confirmed retry still gets its permit"
    );
  }

  #[test]
  fn another_command_cannot_claim_the_confirmed_one() {
    let _serial = SERIAL.lock().unwrap();
    reset();
    let token = allow_next("install_mod".to_string());
    assert!(
      needs_check("clear_mods", Some(&token)),
      "a different command stays guarded even with the token"
    );
    assert!(
      !needs_check("install_mod", Some(&token)),
      "the confirmation is still there for its own command"
    );
  }

  #[test]
  fn an_unused_override_survives_until_it_is_needed() {
    let _serial = SERIAL.lock().unwrap();
    reset();
    let token = allow_next("install_mod".to_string());
    set_enforced(false);
    assert!(
      !needs_check("install_mod", Some(&token)),
      "the guard is off, nothing to consume"
    );
    set_enforced(true);
    assert!(
      !needs_check("install_mod", Some(&token)),
      "the override is still armed"
    );
    assert!(needs_check("install_mod", Some(&token)));
  }
}
