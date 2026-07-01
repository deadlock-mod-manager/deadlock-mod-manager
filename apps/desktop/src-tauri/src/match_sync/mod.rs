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

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, LazyLock};
use std::time::Duration;

use serde::Serialize;
use tauri::Emitter;
use tokio::sync::Mutex;

use crate::app_runtime::AppHandle;

use api_client::ApiClient;
use auth::LocalSteamAuth;
use game_check::SysGameRunningCheck;
use gc_client::SteamGcClient;
use model::{FETCH_QUOTA_LIMIT, SyncProgress};
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

// One serializer for every run so concurrent syncs can't race the persisted quota
// (a lost update there would let the hard cap be exceeded).
static SYNC_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));
static FULL_SYNC_RUNNING: AtomicBool = AtomicBool::new(false);
static FULL_SYNC_CANCEL: AtomicBool = AtomicBool::new(false);
static BACKGROUND_RUNNING: AtomicBool = AtomicBool::new(false);
static GC_REQUEST_COUNTER: LazyLock<Arc<AtomicU64>> =
  LazyLock::new(|| Arc::new(AtomicU64::new(0)));
static THROTTLE: LazyLock<Arc<Throttle>> =
  LazyLock::new(|| Arc::new(Throttle::new(GC_MIN_INTERVAL)));

struct AppPersistence {
  app: AppHandle,
}

impl SyncPersistence for AppPersistence {
  fn now(&self) -> i64 {
    settings::now_secs()
  }
  fn load_quota(&self) -> quota::QuotaWindow {
    settings::load_quota(&self.app).unwrap_or_else(|e| {
      log::error!("match-sync: failed to load quota: {e}");
      quota::QuotaWindow::new(Vec::new(), FETCH_QUOTA_LIMIT, model::FETCH_QUOTA_WINDOW_SECS)
    })
  }
  fn save_quota(&self, quota: &quota::QuotaWindow) {
    if let Err(e) = settings::save_quota(&self.app, quota) {
      log::error!("match-sync: failed to persist quota: {e}");
    }
  }
  fn load_fetched(&self) -> Vec<u64> {
    settings::load_fetched_ids(&self.app).unwrap_or_default()
  }
  fn persist_fetched(&self, ids: &[u64]) {
    if let Err(e) = settings::save_fetched_ids(&self.app, ids) {
      log::error!("match-sync: failed to persist fetched ids: {e}");
    }
  }
  fn set_full_sync_complete(&self, complete: bool) {
    if let Err(e) = settings::set_full_sync_complete(&self.app, complete) {
      log::error!("match-sync: failed to persist full-sync completion: {e}");
    }
  }
  fn emit_progress(&self, progress: &SyncProgress) {
    let _ = self.app.emit(PROGRESS_EVENT, progress);
  }
}

type ProdEngine = SyncEngine<
  LocalSteamAuth,
  SteamGcClient,
  ApiClient,
  ApiClient,
  AppPersistence,
  SysGameRunningCheck,
>;

fn build_engine(app: AppHandle) -> ProdEngine {
  SyncEngine::new(
    LocalSteamAuth,
    SteamGcClient::new(),
    ApiClient::default(),
    ApiClient::default(),
    AppPersistence { app },
    SysGameRunningCheck::new(),
    Arc::clone(&THROTTLE),
    Arc::clone(&GC_REQUEST_COUNTER),
  )
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchSyncStatusDto {
  pub enabled: bool,
  pub consent_accepted: bool,
  pub full_sync_running: bool,
  pub full_sync_complete: bool,
  pub quota_limit: u32,
  pub quota_remaining: u32,
  pub quota_reset_at: Option<i64>,
  pub session_fetches: u64,
}

pub fn status(app: &AppHandle) -> Result<MatchSyncStatusDto, MatchSyncError> {
  let config = settings::load_config(app)?;
  let quota = settings::load_quota(app)?;
  let now = settings::now_secs();
  Ok(MatchSyncStatusDto {
    enabled: config.enabled,
    consent_accepted: config.consent_accepted,
    full_sync_running: FULL_SYNC_RUNNING.load(Ordering::Relaxed),
    full_sync_complete: config.full_sync_complete,
    quota_limit: FETCH_QUOTA_LIMIT as u32,
    quota_remaining: quota.remaining(now) as u32,
    quota_reset_at: quota.reset_at(now),
    session_fetches: GC_REQUEST_COUNTER.load(Ordering::Relaxed),
  })
}

pub fn set_consent(app: &AppHandle, accepted: bool) -> Result<(), MatchSyncError> {
  settings::set_consent(app, accepted)
}

pub fn set_enabled(app: &AppHandle, enabled: bool) -> Result<(), MatchSyncError> {
  if enabled {
    if !settings::load_config(app)?.consent_accepted {
      return Err(MatchSyncError::ConsentRequired);
    }
  } else {
    cancel_full_sync();
  }
  settings::set_enabled(app, enabled)?;
  if enabled {
    start_background_worker(app.clone());
  }
  Ok(())
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
    let engine = build_engine(app.clone());
    match engine
      .run_full_sync_if_enabled(&config, &FULL_SYNC_CANCEL)
      .await
    {
      Ok(p) => log::info!("match-sync: full sync finished: {p:?}"),
      Err(e) => {
        log::warn!("match-sync: full sync failed: {e}");
        emit_error(&app, &e);
      }
    }
    FULL_SYNC_RUNNING.store(false, Ordering::Relaxed);
  });
  Ok(())
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

// Skips entirely when the 24h quota is already spent, avoiding a connect for nothing.
async fn background_pass(app: &AppHandle) {
  let config = match settings::load_config(app) {
    Ok(c) if c.is_active() => c,
    _ => return,
  };
  if settings::load_quota(app)
    .map(|q| q.remaining(settings::now_secs()) == 0)
    .unwrap_or(true)
  {
    return;
  }
  let Ok(guard) = SYNC_LOCK.try_lock() else {
    return;
  };
  let engine = build_engine(app.clone());
  match engine.run_background_pass(&config).await {
    Ok(Some(p)) => log::info!("match-sync: background pass finished: {p:?}"),
    Ok(None) => {}
    Err(e) => log::warn!("match-sync: background pass failed: {e}"),
  }
  drop(guard);
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
      ..MatchSyncConfig::default()
    };
    assert!(!c.is_active());
    c.consent_accepted = true;
    assert!(c.is_active());
  }
}
