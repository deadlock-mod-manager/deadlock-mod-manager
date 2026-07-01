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
const KEY_GC_BACKOFF: &str = "gc_backoff_until";

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
  })
}

pub fn set_consent(app: &AppHandle, accepted: bool) -> Result<(), MatchSyncError> {
  let store = store(app)?;
  store.set(KEY_CONSENT, accepted);
  // enabled=true with consent_accepted=false is never a valid persisted state.
  if !accepted {
    store.set(KEY_ENABLED, false);
  }
  save(&store)
}

pub fn set_enabled(app: &AppHandle, enabled: bool) -> Result<(), MatchSyncError> {
  let store = store(app)?;
  store.set(KEY_ENABLED, enabled);
  save(&store)
}

pub fn load_full_sync_complete(app: &AppHandle, steam_id64: u64) -> bool {
  match store(app) {
    Ok(store) => get_bool(&store, &format!("{KEY_FULL_SYNC_COMPLETE}::{steam_id64}"), false),
    Err(_) => false,
  }
}

pub fn set_full_sync_complete(
  app: &AppHandle,
  steam_id64: u64,
  complete: bool,
) -> Result<(), MatchSyncError> {
  let store = store(app)?;
  store.set(format!("{KEY_FULL_SYNC_COMPLETE}::{steam_id64}"), complete);
  save(&store)
}

pub fn load_fetched_ids(app: &AppHandle, steam_id64: u64) -> Result<Vec<u64>, MatchSyncError> {
  let store = store(app)?;
  Ok(
    store
      .get(format!("{KEY_FETCHED_IDS}::{steam_id64}"))
      .and_then(|v| serde_json::from_value::<Vec<u64>>(v).ok())
      .unwrap_or_default(),
  )
}

pub fn save_fetched_ids(
  app: &AppHandle,
  steam_id64: u64,
  ids: &[u64],
) -> Result<(), MatchSyncError> {
  let store = store(app)?;
  let trimmed = if ids.len() > MAX_FETCHED_IDS {
    &ids[ids.len() - MAX_FETCHED_IDS..]
  } else {
    ids
  };
  store.set(
    format!("{KEY_FETCHED_IDS}::{steam_id64}"),
    serde_json::json!(trimmed),
  );
  save(&store)
}

// Unix timestamp until which this account's GC handshake is known-broken (e.g. it
// doesn't own the game), so the loops can skip it instead of re-paying the connect cost.
pub fn load_gc_backoff_until(app: &AppHandle, steam_id64: u64) -> Option<i64> {
  store(app)
    .ok()?
    .get(format!("{KEY_GC_BACKOFF}::{steam_id64}"))
    .and_then(|v| v.as_i64())
}

pub fn set_gc_backoff_until(
  app: &AppHandle,
  steam_id64: u64,
  until: Option<i64>,
) -> Result<(), MatchSyncError> {
  let store = store(app)?;
  let key = format!("{KEY_GC_BACKOFF}::{steam_id64}");
  match until {
    Some(ts) => store.set(key, ts),
    None => {
      store.delete(key);
    }
  }
  save(&store)
}

pub fn load_quota(app: &AppHandle, steam_id64: u64) -> Result<QuotaWindow, MatchSyncError> {
  let store = store(app)?;
  let hits = store
    .get(format!("{KEY_QUOTA_HITS}::{steam_id64}"))
    .and_then(|v| serde_json::from_value::<Vec<i64>>(v).ok())
    .unwrap_or_default();
  Ok(QuotaWindow::new(
    hits,
    FETCH_QUOTA_LIMIT,
    FETCH_QUOTA_WINDOW_SECS,
  ))
}

pub fn save_quota(
  app: &AppHandle,
  steam_id64: u64,
  quota: &QuotaWindow,
) -> Result<(), MatchSyncError> {
  let store = store(app)?;
  store.set(
    format!("{KEY_QUOTA_HITS}::{steam_id64}"),
    serde_json::json!(quota.snapshot()),
  );
  save(&store)
}

pub fn prune_forgotten_accounts(
  app: &AppHandle,
  current_ids: &[u64],
) -> Result<(), MatchSyncError> {
  let store = store(app)?;
  let prefixes = [
    KEY_QUOTA_HITS,
    KEY_FETCHED_IDS,
    KEY_FULL_SYNC_COMPLETE,
    KEY_GC_BACKOFF,
  ];
  let stale: Vec<String> = store
    .keys()
    .into_iter()
    .filter(|key| {
      prefixes.iter().any(|prefix| {
        key
          .strip_prefix(&format!("{prefix}::"))
          .and_then(|id| id.parse::<u64>().ok())
          .is_some_and(|id| !current_ids.contains(&id))
      })
    })
    .collect();
  if stale.is_empty() {
    return Ok(());
  }
  for key in stale {
    store.delete(key);
  }
  save(&store)
}
