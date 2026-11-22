mod game_check;
pub mod settings;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, LazyLock};
use std::time::Duration;

use deadlock_match_sync::api_client::{ApiClient, HttpClientFactory, StoredHistories};
use deadlock_match_sync::auth::{self, FixedAccountAuth};
use deadlock_match_sync::game_check::GameRunningCheck;
use deadlock_match_sync::gc_client::{self, GcMatchClient, SteamGcClient};
use deadlock_match_sync::model::{
  self, AccountStatus, AuthContext, FETCH_QUOTA_LIMIT, FETCH_QUOTA_WINDOW_SECS, QuotaKind,
  SyncProgress,
};
use deadlock_match_sync::quota;
use deadlock_match_sync::steam_id::account_id_of;
use deadlock_match_sync::sync::{SyncEngine, SyncPersistence};
use deadlock_match_sync::throttle::Throttle;
use serde::Serialize;
use tauri::Emitter;
use tokio::sync::Mutex;

use crate::app_runtime::AppHandle;

use game_check::SysGameRunningCheck;

pub use deadlock_match_sync::error::MatchSyncError;
pub use deadlock_match_sync::model::LocalMatch;

impl From<MatchSyncError> for crate::errors::Error {
  fn from(err: MatchSyncError) -> Self {
    crate::errors::Error::MatchSync {
      subcode: err.subcode(),
      message: err.to_string(),
    }
  }
}

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

static SYNC_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));
static STORED_HISTORIES: LazyLock<Arc<StoredHistories>> = LazyLock::new(Default::default);
static FULL_SYNC_RUNNING: AtomicBool = AtomicBool::new(false);
static FULL_SYNC_CANCEL: AtomicBool = AtomicBool::new(false);
static BACKGROUND_RUNNING: AtomicBool = AtomicBool::new(false);
static BACKGROUND_CANCEL: AtomicBool = AtomicBool::new(false);
static GC_REQUEST_COUNTER: LazyLock<Arc<AtomicU64>> = LazyLock::new(|| Arc::new(AtomicU64::new(0)));

struct AccountResources {
  throttle: Arc<Throttle>,
  gc_client: SteamGcClient,
}

static ACCOUNT_RESOURCES: LazyLock<std::sync::Mutex<HashMap<u64, Arc<AccountResources>>>> =
  LazyLock::new(|| std::sync::Mutex::new(HashMap::new()));

fn resources_for(steam_id64: u64) -> Arc<AccountResources> {
  let mut map = ACCOUNT_RESOURCES.lock().unwrap();
  Arc::clone(map.entry(steam_id64).or_insert_with(|| {
    Arc::new(AccountResources {
      throttle: Arc::new(Throttle::new(GC_MIN_INTERVAL)),
      gc_client: SteamGcClient::new(),
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
  gc_error_seen: Arc<AtomicBool>,
}

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
  fn load_quota(&self, kind: QuotaKind) -> Result<quota::QuotaWindow, MatchSyncError> {
    settings::load_quota(&self.app, self.steam_id64, kind)
  }
  fn save_quota(&self, kind: QuotaKind, quota: &quota::QuotaWindow) -> Result<(), MatchSyncError> {
    settings::save_quota(&self.app, self.steam_id64, kind, quota)
  }
  fn friend_cooldowns(&self) -> HashMap<u32, i64> {
    settings::load_friend_cooldowns(&self.app).unwrap_or_default()
  }
  fn set_friend_cooldowns(&self, cooldowns: &[(u32, i64)]) {
    if let Err(e) = settings::set_friend_cooldowns(&self.app, cooldowns, self.now()) {
      log::error!("match-sync: failed to persist friend cooldowns: {e}");
    }
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
  fn account_list_drained_at(&self) -> Option<i64> {
    settings::load_account_list_drained_at(&self.app, self.steam_id64)
  }
  fn set_account_list_drained_at(&self, at: Option<i64>) {
    if let Err(e) = settings::set_account_list_drained_at(&self.app, self.steam_id64, at) {
      log::error!("match-sync: failed to persist the account list check: {e}");
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
    if err.backs_off_gc() {
      self.gc_error_seen.store(true, Ordering::Relaxed);
    }
  }
}

type ProdEngine = SyncEngine<
  FixedAccountAuth,
  SteamGcClient,
  ApiClient,
  ApiClient,
  AppPersistence,
  SysGameRunningCheck,
>;

fn api_client() -> ApiClient {
  let http: HttpClientFactory = Arc::new(|timeout| {
    crate::proxy::build_http_client(|b| b.timeout(timeout)).map_err(|e| e.to_string())
  });
  ApiClient::new(http, Arc::clone(&STORED_HISTORIES))
}

fn remembered_accounts() -> Result<(PathBuf, Vec<(u64, String)>), MatchSyncError> {
  let steam = steamlocate::SteamDir::locate()
    .map_err(|e| MatchSyncError::AuthUnavailable(format!("Steam not found: {e}")))?;
  let accounts = crate::steam_user::remembered_accounts(steam.path())
    .map_err(MatchSyncError::AuthUnavailable)?
    .into_iter()
    .map(|account| (account.steam_id64, account.account_name.to_lowercase()))
    .collect();
  Ok((steam.path().to_path_buf(), accounts))
}

fn list_available_accounts() -> Result<Vec<(u64, String)>, MatchSyncError> {
  let (steam_dir, accounts) = remembered_accounts()?;
  auth::list_available_accounts(&steam_dir, accounts)
}

fn recover_included(app: &AppHandle) -> Result<Vec<AuthContext>, MatchSyncError> {
  let (steam_dir, mut accounts) = remembered_accounts()?;
  let excluded = settings::load_excluded_accounts(app)?;
  accounts.retain(|(steam_id64, _)| !excluded.contains(&account_id_of(*steam_id64)));
  auth::recover_all(&steam_dir, accounts)
}

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
    resources.gc_client.clone(),
    api_client(),
    api_client(),
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

const GC_BACKOFF_SECS: i64 = 24 * 60 * 60;

fn gc_backoff_active(backoff_until: Option<i64>, now: i64) -> bool {
  backoff_until.is_some_and(|until| now < until)
}

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

fn discover_accounts(
  config: &model::MatchSyncConfig,
  discover: impl FnOnce() -> Result<Vec<(u64, String)>, MatchSyncError>,
  prune: impl FnOnce(&[u64]),
) -> Vec<(u64, String)> {
  if !config.is_active() {
    return Vec::new();
  }
  let Ok(accounts) = discover() else {
    return Vec::new();
  };
  let ids: Vec<u64> = accounts.iter().map(|(id, _)| *id).collect();
  prune(&ids);
  accounts
}

pub fn status(app: &AppHandle) -> Result<MatchSyncStatusDto, MatchSyncError> {
  let config = settings::load_config(app)?;
  let now = settings::now_secs();
  let available = discover_accounts(&config, list_available_accounts, prune_resources);
  let excluded = settings::load_excluded_accounts(app).unwrap_or_else(|e| {
    log::warn!("match-sync: excluded accounts load failed: {e}");
    Vec::new()
  });

  let accounts = available
    .into_iter()
    .map(|(steam_id64, account_name)| {
      let quota = settings::load_quota(app, steam_id64, QuotaKind::Salts).unwrap_or_else(|e| {
        log::warn!("match-sync: quota load failed: {e}");
        quota::QuotaWindow::new(Vec::new(), FETCH_QUOTA_LIMIT, FETCH_QUOTA_WINDOW_SECS)
      });
      let account_id = account_id_of(steam_id64);
      AccountStatus {
        steam_id64,
        account_id,
        account_name,
        quota_limit: FETCH_QUOTA_LIMIT as u32,
        quota_remaining: quota.remaining(now) as u32,
        quota_reset_at: quota.reset_at(now),
        full_sync_complete: settings::load_full_sync_complete(app, steam_id64),
        gc_unavailable: gc_backoff_active(settings::load_gc_backoff_until(app, steam_id64), now),
        excluded: excluded.contains(&account_id),
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

pub async fn recent_local_matches(app: &AppHandle, account_id: u32) -> Vec<LocalMatch> {
  match settings::load_config(app) {
    Ok(config) if config.is_active() => {}
    _ => return Vec::new(),
  }

  if SysGameRunningCheck::new().is_game_running() {
    return Vec::new();
  }

  let contexts = match recover_included(app) {
    Ok(contexts) => contexts,
    Err(e) => {
      log::debug!("match-sync: no Steam session for local history: {e}");
      return Vec::new();
    }
  };

  let Some(ctx) = contexts.into_iter().find(|c| c.account_id() == account_id) else {
    log::debug!("match-sync: no Steam session for account {account_id}");
    return Vec::new();
  };

  let resources = resources_for(ctx.steam_id64);
  if !resources.throttle.try_acquire().await {
    return Vec::new();
  }
  let result = resources
    .gc_client
    .fetch_match_history(&ctx, account_id, None)
    .await;
  resources.gc_client.disconnect().await;
  match result {
    Ok(page) => page.matches,
    Err(e) => {
      log::debug!("match-sync: local history unavailable: {e}");
      Vec::new()
    }
  }
}

pub fn set_consent(app: &AppHandle, accepted: bool) -> Result<(), MatchSyncError> {
  if !accepted {
    cancel_background_work();
  }
  settings::set_consent(app, accepted)?;
  if accepted {
    prune_forgotten_accounts(app);
    start_background_worker(app.clone());
  }
  Ok(())
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
    prune_forgotten_accounts(app);
    start_background_worker(app.clone());
  }
  Ok(())
}

#[cfg(debug_assertions)]
pub fn reset_config(app: &AppHandle) -> Result<(), MatchSyncError> {
  cancel_background_work();
  settings::reset_config(app)
}

pub fn prune_forgotten_accounts(app: &AppHandle) {
  if !should_monitor(app) {
    forget_friends(app);
    return;
  }
  match remembered_accounts().map(|(_, accounts)| accounts) {
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

fn forget_friends(app: &AppHandle) {
  STORED_HISTORIES.clear();
  if let Err(e) = settings::clear_friend_cooldowns(app) {
    log::warn!("match-sync: failed to clear friend cooldowns: {e}");
  }
}

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
    let engine = build_engine(
      app.clone(),
      ctx,
      i as u32 + 1,
      total,
      Arc::clone(&gc_error_seen),
    );
    let result = run_engine(engine).await;
    resources_for(ctx.steam_id64).gc_client.disconnect().await;
    match &result {
      Ok(Some(p)) => log::info!(
        "match-sync: {label} finished for {}: {p:?}",
        ctx.account_name
      ),
      Ok(None) => {}
      Err(e) => {
        log::warn!("match-sync: {label} failed for {}: {e}", ctx.account_name);
        if notify_on_error {
          emit_error(app, e);
        }
      }
    }
    apply_gc_backoff(
      app,
      ctx,
      backoff,
      gc_error_seen.load(Ordering::Relaxed),
      now,
    );
    if let BatchControl::Abort = batch_control(&result) {
      break;
    }
  }
}

async fn run_full_sync_batch(app: &AppHandle, config: &model::MatchSyncConfig) {
  let contexts = match recover_included(app) {
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

pub fn on_game_exit(app: AppHandle) {
  gc_client::end_launch_hold();
  tokio::spawn(async move {
    background_pass(&app).await;
  });
}

pub async fn release_for_game_launch() {
  gc_client::hold_for_launch();
  let clients: Vec<_> = ACCOUNT_RESOURCES
    .lock()
    .unwrap()
    .values()
    .map(|resources| resources.gc_client.clone())
    .collect();
  futures::future::join_all(clients.iter().map(|client| client.release())).await;
}

pub fn should_monitor(app: &AppHandle) -> bool {
  settings::load_config(app)
    .map(|c| c.is_active())
    .unwrap_or(false)
}

async fn background_pass(app: &AppHandle) {
  let config = match settings::load_config(app) {
    Ok(c) if c.is_active() => c,
    _ => return,
  };
  let Ok(_guard) = SYNC_LOCK.try_lock() else {
    return;
  };
  let contexts = match recover_included(app) {
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
      settings::load_quota(app, ctx.steam_id64, QuotaKind::Salts)
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
  BACKGROUND_CANCEL.store(false, Ordering::Relaxed);
  if BACKGROUND_RUNNING
    .compare_exchange(false, true, Ordering::AcqRel, Ordering::Relaxed)
    .is_err()
  {
    return;
  }
  tokio::spawn(async move {
    while should_monitor(&app) {
      background_pass(&app).await;
      let mut slept = 0;
      while slept < BACKGROUND_PASS_INTERVAL_SECS && should_monitor(&app) {
        tokio::time::sleep(Duration::from_secs(5)).await;
        slept += 5;
      }
    }
    {
      let _guard = SYNC_LOCK.lock().await;
      forget_friends(&app);
    }
    BACKGROUND_RUNNING.store(false, Ordering::Relaxed);
    if should_monitor(&app) {
      start_background_worker(app);
    }
  });
}

#[cfg(test)]
mod config_tests {
  use deadlock_match_sync::model::MatchSyncConfig;

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
mod discovery_tests {
  use super::*;

  #[test]
  fn inactive_status_never_reads_steam_accounts() {
    for (enabled, consent_accepted) in [(false, false), (false, true), (true, false)] {
      let config = model::MatchSyncConfig {
        enabled,
        consent_accepted,
      };
      let accounts = discover_accounts(
        &config,
        || panic!("Steam account discovery must not run"),
        |_| panic!("Inactive sync must retain account resources"),
      );
      assert!(accounts.is_empty());
    }
  }

  #[test]
  fn active_status_discovers_accounts() {
    let config = model::MatchSyncConfig {
      enabled: true,
      consent_accepted: true,
    };
    let expected = vec![(123, "test-account".to_string())];
    let mut pruned_ids = Vec::new();
    assert_eq!(
      discover_accounts(
        &config,
        || Ok(expected.clone()),
        |ids| pruned_ids.extend_from_slice(ids),
      ),
      expected
    );
    assert_eq!(pruned_ids, vec![123]);
  }

  #[test]
  fn unavailable_steam_remains_an_empty_status() {
    let config = model::MatchSyncConfig {
      enabled: true,
      consent_accepted: true,
    };
    assert!(
      discover_accounts(
        &config,
        || Err(MatchSyncError::AuthUnavailable("Steam unavailable".into())),
        |_| panic!("Failed discovery must retain account resources"),
      )
      .is_empty()
    );
  }

  #[test]
  fn successful_empty_inventory_still_prunes_resources() {
    let config = model::MatchSyncConfig {
      enabled: true,
      consent_accepted: true,
    };
    let mut pruned = false;
    let accounts = discover_accounts(
      &config,
      || Ok(Vec::new()),
      |ids| {
        assert!(ids.is_empty());
        pruned = true;
      },
    );
    assert!(accounts.is_empty());
    assert!(pruned);
  }
}

#[cfg(test)]
mod batch_tests {
  use super::*;

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
    let results: Vec<Result<(), MatchSyncError>> = vec![Ok(()), Ok(())];
    assert_eq!(drive_batch(&results, |_| false), vec![0, 1]);
  }

  #[test]
  fn game_running_aborts_the_whole_batch() {
    let results: Vec<Result<(), MatchSyncError>> = vec![Err(MatchSyncError::GameRunning), Ok(())];
    assert_eq!(drive_batch(&results, |_| false), vec![0]);
  }

  #[test]
  fn cancel_before_second_account_skips_it() {
    let results: Vec<Result<(), MatchSyncError>> = vec![Ok(()), Ok(())];
    assert_eq!(drive_batch(&results, |i| i >= 1), vec![0]);
  }

  #[test]
  fn generic_error_on_first_account_still_runs_the_second() {
    let results: Vec<Result<(), MatchSyncError>> = vec![Err(MatchSyncError::Disabled), Ok(())];
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
