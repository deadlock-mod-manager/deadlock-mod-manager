mod api_client;
mod auth;
mod error;
mod game_check;
mod gc_client;
mod model;
mod quota;
pub mod settings;
mod sync;
mod throttle;

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, LazyLock};
use std::time::Duration;

use serde::Serialize;
use tauri::Emitter;
use tokio::sync::Mutex;

use crate::app_runtime::AppHandle;

use api_client::ApiClient;
use auth::FixedAccountAuth;
use game_check::SysGameRunningCheck;
use gc_client::SteamGcClient;
use model::{AccountStatus, AuthContext, FETCH_QUOTA_LIMIT, FETCH_QUOTA_WINDOW_SECS, SyncProgress};
use sync::{SyncEngine, SyncPersistence};
use throttle::Throttle;

pub use error::MatchSyncError;

// One GC request every 2 minutes: GetMatchMetaData is rate-limited per-account by
// Steam's GC, and a fast throttle (the old 2s value) reliably tripped that limit.
const GC_MIN_INTERVAL: Duration = Duration::from_secs(2 * 60);
const BACKGROUND_PASS_INTERVAL_SECS: u64 = 15 * 60;
const PROGRESS_EVENT: &str = "match-sync-progress";
const ERROR_EVENT: &str = "match-sync-error";

#[derive(Clone, Serialize)]
struct MatchSyncErrorPayload {
  message: String,
}

fn emit_error(app: &AppHandle, err: &MatchSyncError) {
  let _ = app.emit(
    ERROR_EVENT,
    MatchSyncErrorPayload {
      message: err.to_string(),
    },
  );
}

// One serializer for every run so concurrent syncs can't race a per-account persisted
// quota (a lost update there would let the hard cap be exceeded).
static SYNC_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));
static FULL_SYNC_RUNNING: AtomicBool = AtomicBool::new(false);
static FULL_SYNC_CANCEL: AtomicBool = AtomicBool::new(false);
static BACKGROUND_RUNNING: AtomicBool = AtomicBool::new(false);
static BACKGROUND_CANCEL: AtomicBool = AtomicBool::new(false);
// Aggregate across all accounts: session_fetches is a simple per-session total.
static GC_REQUEST_COUNTER: LazyLock<Arc<AtomicU64>> =
  LazyLock::new(|| Arc::new(AtomicU64::new(0)));

// Each account gets its own independent throttle (2-min GC spacing) and its own GC
// session, keyed by steam_id64. Never hold this lock across an `.await`.
struct AccountResources {
  throttle: Arc<Throttle>,
  gc_client: Arc<SteamGcClient>,
}

static ACCOUNT_RESOURCES: LazyLock<std::sync::Mutex<HashMap<u64, Arc<AccountResources>>>> =
  LazyLock::new(|| std::sync::Mutex::new(HashMap::new()));

fn resources_for(steam_id64: u64) -> Arc<AccountResources> {
  let mut map = ACCOUNT_RESOURCES.lock().unwrap();
  Arc::clone(map.entry(steam_id64).or_insert_with(|| {
    Arc::new(AccountResources {
      throttle: Arc::new(Throttle::new(GC_MIN_INTERVAL)),
      gc_client: Arc::new(SteamGcClient::new()),
    })
  }))
}

fn prune_resources(current_ids: &[u64]) {
  let mut map = ACCOUNT_RESOURCES.lock().unwrap();
  map.retain(|id, _| current_ids.contains(id));
}

struct AppPersistence {
  app: AppHandle,
  steam_id64: u64,
  account_name: String,
  account_index: u32,
  account_total: u32,
  // Set when the engine swallows a GC failure for this account (see
  // `SyncPersistence::record_gc_error`). The run still returns Ok, so this shared flag
  // is the orchestrator's only view into "this account's GC connection is broken".
  gc_error_seen: Arc<AtomicBool>,
}

// Wraps the engine's per-account `SyncProgress` with which account (of how many) it
// belongs to, so the UI can show "account X of N" during a long sequential batch.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MatchSyncProgressEvent<'a> {
  account_name: &'a str,
  account_index: u32,
  account_total: u32,
  progress: &'a SyncProgress,
}

impl SyncPersistence for AppPersistence {
  fn now(&self) -> i64 {
    settings::now_secs()
  }
  fn load_quota(&self) -> Result<quota::QuotaWindow, MatchSyncError> {
    settings::load_quota(&self.app, self.steam_id64)
  }
  fn save_quota(&self, quota: &quota::QuotaWindow) -> Result<(), MatchSyncError> {
    settings::save_quota(&self.app, self.steam_id64, quota)
  }
  fn load_fetched(&self) -> Vec<u64> {
    settings::load_fetched_ids(&self.app, self.steam_id64).unwrap_or_default()
  }
  fn persist_fetched(&self, ids: &[u64]) {
    if let Err(e) = settings::save_fetched_ids(&self.app, self.steam_id64, ids) {
      log::error!("match-sync: failed to persist fetched ids: {e}");
    }
  }
  fn set_full_sync_complete(&self, complete: bool) {
    if let Err(e) = settings::set_full_sync_complete(&self.app, self.steam_id64, complete) {
      log::error!("match-sync: failed to persist full-sync completion: {e}");
    }
  }
  fn emit_progress(&self, progress: &SyncProgress) {
    let _ = self.app.emit(
      PROGRESS_EVENT,
      MatchSyncProgressEvent {
        account_name: &self.account_name,
        account_index: self.account_index,
        account_total: self.account_total,
        progress,
      },
    );
  }
  fn record_gc_error(&self, err: &MatchSyncError) {
    // Only a broken GC connection warrants a backoff; the hook is only ever called from
    // GC swallow points, but match defensively so a future caller can't misfire it.
    if matches!(err, MatchSyncError::GcUnavailable(_)) {
      self.gc_error_seen.store(true, Ordering::Relaxed);
    }
  }
}

type ProdEngine = SyncEngine<
  FixedAccountAuth,
  Arc<SteamGcClient>,
  ApiClient,
  ApiClient,
  AppPersistence,
  SysGameRunningCheck,
>;

fn build_engine(
  app: AppHandle,
  ctx: &AuthContext,
  account_index: u32,
  account_total: u32,
  gc_error_seen: Arc<AtomicBool>,
) -> ProdEngine {
  let resources = resources_for(ctx.steam_id64);
  SyncEngine::new(
    FixedAccountAuth(ctx.clone()),
    Arc::clone(&resources.gc_client),
    ApiClient::default(),
    ApiClient::default(),
    AppPersistence {
      app,
      steam_id64: ctx.steam_id64,
      account_name: ctx.account_name.clone(),
      account_index,
      account_total,
      gc_error_seen,
    },
    SysGameRunningCheck::new(),
    Arc::clone(&resources.throttle),
    Arc::clone(&GC_REQUEST_COUNTER),
  )
}

// The batch-level decision for one account's engine result: `GameRunning` is a
// machine-wide wall (every remaining account would hit it immediately), so it aborts
// the whole batch; every other outcome — Ok (finished / quota-reached / rate-limited)
// or a per-account Err — is local, so the batch moves on to the next account.
enum BatchControl {
  Continue,
  Abort,
}

fn batch_control<T>(result: &Result<T, MatchSyncError>) -> BatchControl {
  match result {
    Err(MatchSyncError::GameRunning) => BatchControl::Abort,
    _ => BatchControl::Continue,
  }
}

// An account whose GC handshake is known-broken (e.g. it doesn't own the game) fails
// identically every pass; back it off for a day so the loops skip it instead of
// re-paying the connect/timeout cost each tick.
const GC_BACKOFF_SECS: i64 = 24 * 60 * 60;

fn gc_backoff_active(backoff_until: Option<i64>, now: i64) -> bool {
  backoff_until.is_some_and(|until| now < until)
}

// The backoff a run's GC-error flag implies: `Some(deadline)` when the account saw a
// swallowed GC failure this run, `None` to clear (a once-broken account that starts
// working again must not stay skipped). GC failures never reach the run's outer
// `Result` (the engine swallows them best-effort), so this is driven by the shared flag
// the engine sets via `record_gc_error`, not by inspecting the returned result.
fn gc_backoff_from_flag(gc_error_seen: bool, now: i64) -> Option<i64> {
  gc_error_seen.then_some(now + GC_BACKOFF_SECS)
}

fn apply_gc_backoff(
  app: &AppHandle,
  ctx: &AuthContext,
  prev: Option<i64>,
  gc_error_seen: bool,
  now: i64,
) {
  match gc_backoff_from_flag(gc_error_seen, now) {
    Some(until) => {
      if let Err(e) = settings::set_gc_backoff_until(app, ctx.steam_id64, Some(until)) {
        log::warn!(
          "match-sync: failed to persist GC backoff for {}: {e}",
          ctx.account_name
        );
      }
    }
    None => {
      if prev.is_some()
        && let Err(e) = settings::set_gc_backoff_until(app, ctx.steam_id64, None)
      {
        log::warn!(
          "match-sync: failed to clear GC backoff for {}: {e}",
          ctx.account_name
        );
      }
    }
  }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchSyncStatusDto {
  pub enabled: bool,
  pub consent_accepted: bool,
  pub full_sync_running: bool,
  pub session_fetches: u64,
  pub accounts: Vec<AccountStatus>,
}

pub fn status(app: &AppHandle) -> Result<MatchSyncStatusDto, MatchSyncError> {
  let config = settings::load_config(app)?;
  let now = settings::now_secs();
  // Cheap, no-decrypt discovery: an unreachable Steam/vdf is a valid empty state, not
  // a reason to fail the ~2s frontend poll.
  let available = auth::list_available_accounts().unwrap_or_default();
  let ids: Vec<u64> = available.iter().map(|(id, _)| *id).collect();
  prune_resources(&ids);

  let accounts = available
    .into_iter()
    .map(|(steam_id64, account_name)| {
      let quota = settings::load_quota(app, steam_id64).unwrap_or_else(|e| {
        log::warn!("match-sync: quota load failed for {steam_id64}: {e}");
        quota::QuotaWindow::new(Vec::new(), FETCH_QUOTA_LIMIT, FETCH_QUOTA_WINDOW_SECS)
      });
      AccountStatus {
        steam_id64,
        account_name,
        quota_limit: FETCH_QUOTA_LIMIT as u32,
        quota_remaining: quota.remaining(now) as u32,
        quota_reset_at: quota.reset_at(now),
        full_sync_complete: settings::load_full_sync_complete(app, steam_id64),
        gc_unavailable: gc_backoff_active(
          settings::load_gc_backoff_until(app, steam_id64),
          now,
        ),
      }
    })
    .collect();

  Ok(MatchSyncStatusDto {
    enabled: config.enabled,
    consent_accepted: config.consent_accepted,
    full_sync_running: FULL_SYNC_RUNNING.load(Ordering::Relaxed),
    session_fetches: GC_REQUEST_COUNTER.load(Ordering::Relaxed),
    accounts,
  })
}

pub fn set_consent(app: &AppHandle, accepted: bool) -> Result<(), MatchSyncError> {
  if !accepted {
    cancel_background_work();
  }
  settings::set_consent(app, accepted)
}

pub fn set_enabled(app: &AppHandle, enabled: bool) -> Result<(), MatchSyncError> {
  if enabled {
    if !settings::load_config(app)?.consent_accepted {
      return Err(MatchSyncError::ConsentRequired);
    }
  } else {
    cancel_background_work();
  }
  settings::set_enabled(app, enabled)?;
  if enabled {
    start_background_worker(app.clone());
  }
  Ok(())
}

// Drops persisted per-account state (quota/fetched/completion) and in-memory resources
// for accounts no longer remembered in loginusers.vdf AT ALL. Startup-only: temporarily
// non-decryptable accounts stay remembered, so they are never pruned here.
pub fn prune_forgotten_accounts(app: &AppHandle) {
  match auth::all_remembered_accounts() {
    Ok(accounts) => {
      let ids: Vec<u64> = accounts.iter().map(|(id, _)| *id).collect();
      prune_resources(&ids);
      if let Err(e) = settings::prune_forgotten_accounts(app, &ids) {
        log::warn!("match-sync: failed to prune forgotten accounts: {e}");
      }
    }
    Err(e) => log::warn!("match-sync: could not list remembered accounts for pruning: {e}"),
  }
}

// Stops both the one-time full sync and any in-flight background pass immediately,
// so opt-out takes effect right away rather than after the current pass finishes.
fn cancel_background_work() {
  FULL_SYNC_CANCEL.store(true, Ordering::Relaxed);
  BACKGROUND_CANCEL.store(true, Ordering::Relaxed);
}

pub fn cancel_full_sync() {
  FULL_SYNC_CANCEL.store(true, Ordering::Relaxed);
}

pub fn spawn_full_sync(app: AppHandle) -> Result<(), MatchSyncError> {
  let config = settings::load_config(&app)?;
  if !config.consent_accepted {
    return Err(MatchSyncError::ConsentRequired);
  }
  if !config.enabled {
    return Err(MatchSyncError::Disabled);
  }
  if FULL_SYNC_RUNNING
    .compare_exchange(false, true, Ordering::AcqRel, Ordering::Relaxed)
    .is_err()
  {
    return Err(MatchSyncError::AlreadyRunning);
  }
  FULL_SYNC_CANCEL.store(false, Ordering::Relaxed);

  tokio::spawn(async move {
    let _guard = SYNC_LOCK.lock().await;
    run_full_sync_batch(&app, &config).await;
    FULL_SYNC_RUNNING.store(false, Ordering::Relaxed);
  });
  Ok(())
}

// Shared per-account loop for both the one-time full sync and the recurring background
// pass: check cancel, skip accounts under GC backoff (and any pass-specific skip),
// build an engine, run it, log/report the result, then update GC backoff. Cancellation
// is checked between accounts (a quota-exhausted run and a cancelled run both return
// Ok, so the flag is the only reliable signal here).
async fn run_account_batch<F, Fut>(
  app: &AppHandle,
  contexts: &[AuthContext],
  cancel: &AtomicBool,
  label: &str,
  notify_on_error: bool,
  skip_if: impl Fn(&AppHandle, &AuthContext, i64) -> bool,
  mut run_engine: F,
) where
  F: FnMut(ProdEngine) -> Fut,
  Fut: std::future::Future<Output = Result<Option<SyncProgress>, MatchSyncError>>,
{
  let total = contexts.len() as u32;
  for (i, ctx) in contexts.iter().enumerate() {
    if cancel.load(Ordering::Relaxed) {
      break;
    }
    let now = settings::now_secs();
    let backoff = settings::load_gc_backoff_until(app, ctx.steam_id64);
    if gc_backoff_active(backoff, now) {
      log::info!(
        "match-sync: skipping {}, GC unavailable until {:?}",
        ctx.account_name,
        backoff
      );
      continue;
    }
    if skip_if(app, ctx, now) {
      continue;
    }
    let gc_error_seen = Arc::new(AtomicBool::new(false));
    let engine = build_engine(app.clone(), ctx, i as u32 + 1, total, Arc::clone(&gc_error_seen));
    let result = run_engine(engine).await;
    match &result {
      Ok(Some(p)) => log::info!("match-sync: {label} finished for {}: {p:?}", ctx.account_name),
      Ok(None) => {}
      Err(e) => {
        log::warn!("match-sync: {label} failed for {}: {e}", ctx.account_name);
        if notify_on_error {
          emit_error(app, e);
        }
      }
    }
    apply_gc_backoff(app, ctx, backoff, gc_error_seen.load(Ordering::Relaxed), now);
    if let BatchControl::Abort = batch_control(&result) {
      break;
    }
  }
}

// Sequentially full-syncs every currently-decryptable account, each with its own quota
// bucket and throttle.
async fn run_full_sync_batch(app: &AppHandle, config: &model::MatchSyncConfig) {
  let contexts = match auth::recover_all() {
    Ok(c) => c,
    Err(e) => {
      log::warn!("match-sync: full sync failed: {e}");
      emit_error(app, &e);
      return;
    }
  };
  run_account_batch(
    app,
    &contexts,
    &FULL_SYNC_CANCEL,
    "full sync",
    true,
    |_, _, _| false,
    |engine| async move {
      engine
        .run_full_sync_if_enabled(config, &FULL_SYNC_CANCEL)
        .await
        .map(Some)
    },
  )
  .await;
}

// Called by the game-presence watcher on the "game closed" transition.
pub fn on_game_exit(app: AppHandle) {
  tokio::spawn(async move {
    background_pass(&app).await;
  });
}

pub fn should_monitor(app: &AppHandle) -> bool {
  settings::load_config(app)
    .map(|c| c.is_active())
    .unwrap_or(false)
}

// One sequential pass over every currently-decryptable account. Each account's spent
// quota is checked before connecting (independent buckets), so an exhausted account is
// skipped without blocking the others.
async fn background_pass(app: &AppHandle) {
  let config = match settings::load_config(app) {
    Ok(c) if c.is_active() => c,
    _ => return,
  };
  let Ok(_guard) = SYNC_LOCK.try_lock() else {
    return;
  };
  let contexts = match auth::recover_all() {
    Ok(c) => c,
    Err(e) => {
      log::warn!("match-sync: background pass could not recover any account: {e}");
      return;
    }
  };
  run_account_batch(
    app,
    &contexts,
    &BACKGROUND_CANCEL,
    "background pass",
    false,
    |app, ctx, now| {
      settings::load_quota(app, ctx.steam_id64)
        .map(|q| q.remaining(now) == 0)
        .unwrap_or(true)
    },
    |engine| {
      let config = &config;
      async move { engine.run_background_pass(config, &BACKGROUND_CANCEL).await }
    },
  )
  .await;
}

pub fn start_background_worker(app: AppHandle) {
  if !should_monitor(&app) {
    return;
  }
  if BACKGROUND_RUNNING
    .compare_exchange(false, true, Ordering::AcqRel, Ordering::Relaxed)
    .is_err()
  {
    return;
  }
  BACKGROUND_CANCEL.store(false, Ordering::Relaxed);
  tokio::spawn(async move {
    while should_monitor(&app) {
      background_pass(&app).await;
      let mut slept = 0;
      while slept < BACKGROUND_PASS_INTERVAL_SECS && should_monitor(&app) {
        tokio::time::sleep(Duration::from_secs(5)).await;
        slept += 5;
      }
    }
    BACKGROUND_RUNNING.store(false, Ordering::Relaxed);
    // A quick disable/re-enable while this task was still shutting down could have
    // seen BACKGROUND_RUNNING as true and returned early; make sure that isn't lost.
    if should_monitor(&app) {
      start_background_worker(app);
    }
  });
}

#[cfg(test)]
mod config_tests {
  use super::model::MatchSyncConfig;

  #[test]
  fn active_requires_both_enabled_and_consent() {
    let mut c = MatchSyncConfig {
      enabled: true,
      consent_accepted: false,
    };
    assert!(!c.is_active());
    c.consent_accepted = true;
    assert!(c.is_active());
  }
}

#[cfg(test)]
mod batch_tests {
  use super::*;

  // Mirrors the real per-account loop's control flow (check-cancel-then-attempt, then
  // decide abort/continue from the engine's result) using the REAL `batch_control`, so
  // the stop/continue/abort decision is exercised directly against hand-crafted result
  // sequences without wiring full engine/GC/auth spies end to end.
  fn drive_batch<T>(
    results: &[Result<T, MatchSyncError>],
    mut cancelled_before: impl FnMut(usize) -> bool,
  ) -> Vec<usize> {
    let mut attempted = Vec::new();
    for (i, result) in results.iter().enumerate() {
      if cancelled_before(i) {
        break;
      }
      attempted.push(i);
      if let BatchControl::Abort = batch_control(result) {
        break;
      }
    }
    attempted
  }

  #[test]
  fn quota_reached_first_account_still_runs_the_second() {
    // Both are Ok: a quota-reached run is indistinguishable from a finished one at this
    // level, and neither is a reason to stop the batch.
    let results: Vec<Result<(), MatchSyncError>> = vec![Ok(()), Ok(())];
    assert_eq!(drive_batch(&results, |_| false), vec![0, 1]);
  }

  #[test]
  fn game_running_aborts_the_whole_batch() {
    let results: Vec<Result<(), MatchSyncError>> =
      vec![Err(MatchSyncError::GameRunning), Ok(())];
    assert_eq!(drive_batch(&results, |_| false), vec![0]);
  }

  #[test]
  fn cancel_before_second_account_skips_it() {
    let results: Vec<Result<(), MatchSyncError>> = vec![Ok(()), Ok(())];
    // Cancel flips true only once the first account has completed.
    assert_eq!(drive_batch(&results, |i| i >= 1), vec![0]);
  }

  #[test]
  fn generic_error_on_first_account_still_runs_the_second() {
    let results: Vec<Result<(), MatchSyncError>> =
      vec![Err(MatchSyncError::Disabled), Ok(())];
    assert_eq!(drive_batch(&results, |_| false), vec![0, 1]);
  }
}

#[cfg(test)]
mod gc_backoff_tests {
  use super::*;

  const NOW: i64 = 1_000_000;

  #[test]
  fn future_backoff_skips_the_account() {
    assert!(gc_backoff_active(Some(NOW + 60), NOW));
  }

  #[test]
  fn past_or_unset_backoff_does_not_skip() {
    assert!(!gc_backoff_active(Some(NOW - 1), NOW));
    assert!(!gc_backoff_active(Some(NOW), NOW));
    assert!(!gc_backoff_active(None, NOW));
  }

  #[test]
  fn gc_error_flag_sets_a_day_out_backoff() {
    assert_eq!(gc_backoff_from_flag(true, NOW), Some(NOW + GC_BACKOFF_SECS));
  }

  #[test]
  fn no_gc_error_flag_clears_backoff() {
    assert_eq!(gc_backoff_from_flag(false, NOW), None);
  }
}
