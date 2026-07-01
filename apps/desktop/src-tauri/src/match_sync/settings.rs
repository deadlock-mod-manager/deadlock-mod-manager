//! Persisted, off-by-default state for match-sync, in its own store file so writes
//! never race the zustand-managed `state.json`. The quota timestamps live here too,
//! which is what makes the daily fetch cap survive reboots and app restarts.

use std::sync::Arc;

use tauri_plugin_store::{Store, StoreExt};

use crate::app_runtime::{AppHandle, AppRuntime};

use super::error::MatchSyncError;
use super::model::{FETCH_QUOTA_LIMIT, FETCH_QUOTA_WINDOW_SECS, MatchSyncConfig};
use super::quota::QuotaWindow;

const STORE_FILE: &str = "match-sync.json";

const KEY_ENABLED: &str = "enabled";
const KEY_CONSENT: &str = "consent_accepted";
const KEY_FETCHED_IDS: &str = "fetched_ids";
const KEY_QUOTA_HITS: &str = "quota_hits";
const KEY_FULL_SYNC_COMPLETE: &str = "full_sync_complete";

const MAX_FETCHED_IDS: usize = 10_000;

pub fn now_secs() -> i64 {
  chrono::Utc::now().timestamp()
}

fn store(app: &AppHandle) -> Result<Arc<Store<AppRuntime>>, MatchSyncError> {
  app
    .store(STORE_FILE)
    .map_err(|e| MatchSyncError::Store(e.to_string()))
}

fn get_bool(store: &Store<AppRuntime>, key: &str, default: bool) -> bool {
  store
    .get(key)
    .and_then(|v| v.as_bool())
    .unwrap_or(default)
}

fn save(store: &Store<AppRuntime>) -> Result<(), MatchSyncError> {
  store.save().map_err(|e| MatchSyncError::Store(e.to_string()))
}

pub fn load_config(app: &AppHandle) -> Result<MatchSyncConfig, MatchSyncError> {
  let store = store(app)?;
  let default = MatchSyncConfig::default();
  Ok(MatchSyncConfig {
    enabled: get_bool(&store, KEY_ENABLED, default.enabled),
    consent_accepted: get_bool(&store, KEY_CONSENT, default.consent_accepted),
    full_sync_complete: get_bool(&store, KEY_FULL_SYNC_COMPLETE, default.full_sync_complete),
  })
}

pub fn set_consent(app: &AppHandle, accepted: bool) -> Result<(), MatchSyncError> {
  let store = store(app)?;
  store.set(KEY_CONSENT, accepted);
  save(&store)
}

pub fn set_enabled(app: &AppHandle, enabled: bool) -> Result<(), MatchSyncError> {
  let store = store(app)?;
  store.set(KEY_ENABLED, enabled);
  save(&store)
}

pub fn set_full_sync_complete(app: &AppHandle, complete: bool) -> Result<(), MatchSyncError> {
  let store = store(app)?;
  store.set(KEY_FULL_SYNC_COMPLETE, complete);
  save(&store)
}

pub fn load_fetched_ids(app: &AppHandle) -> Result<Vec<u64>, MatchSyncError> {
  let store = store(app)?;
  Ok(
    store
      .get(KEY_FETCHED_IDS)
      .and_then(|v| serde_json::from_value::<Vec<u64>>(v).ok())
      .unwrap_or_default(),
  )
}

pub fn save_fetched_ids(app: &AppHandle, ids: &[u64]) -> Result<(), MatchSyncError> {
  let store = store(app)?;
  let trimmed = if ids.len() > MAX_FETCHED_IDS {
    &ids[ids.len() - MAX_FETCHED_IDS..]
  } else {
    ids
  };
  store.set(KEY_FETCHED_IDS, serde_json::json!(trimmed));
  save(&store)
}

pub fn load_quota(app: &AppHandle) -> Result<QuotaWindow, MatchSyncError> {
  let store = store(app)?;
  let hits = store
    .get(KEY_QUOTA_HITS)
    .and_then(|v| serde_json::from_value::<Vec<i64>>(v).ok())
    .unwrap_or_default();
  Ok(QuotaWindow::new(
    hits,
    FETCH_QUOTA_LIMIT,
    FETCH_QUOTA_WINDOW_SECS,
  ))
}

pub fn save_quota(app: &AppHandle, quota: &QuotaWindow) -> Result<(), MatchSyncError> {
  let store = store(app)?;
  store.set(KEY_QUOTA_HITS, serde_json::json!(quota.snapshot()));
  save(&store)
}
