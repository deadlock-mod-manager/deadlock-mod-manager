//! Persisted, on-by-default state for match-sync, in its own store file so writes
//! never race the zustand-managed `state.json`. The quota timestamps live here too,
//! which is what makes the daily fetch cap survive reboots and app restarts.

use std::collections::HashMap;
use std::sync::Arc;

use tauri_plugin_store::{Store, StoreExt};

use crate::app_runtime::{AppHandle, AppRuntime};

use super::error::MatchSyncError;
use super::model::{
  FETCH_QUOTA_LIMIT, FETCH_QUOTA_WINDOW_SECS, FRIEND_HISTORY_QUOTA_LIMIT, MatchSyncConfig,
};
use super::quota::QuotaWindow;

const STORE_FILE: &str = "match-sync.json";

const KEY_ENABLED: &str = "enabled";
const KEY_CONSENT: &str = "consent_accepted";
const KEY_CONSENT_VERSION: &str = "consent_version";
const KEY_FETCHED_IDS: &str = "fetched_ids";
const KEY_QUOTA_HITS: &str = "quota_hits";
const KEY_FULL_SYNC_COMPLETE: &str = "full_sync_complete";
const KEY_GC_BACKOFF: &str = "gc_backoff_until";
const KEY_HISTORY_HITS: &str = "history_hits";
// Global, not per account: a friend shared by several accounts is looked up once.
const KEY_FRIEND_COOLDOWNS: &str = "friend_cooldowns";

const MAX_FETCHED_IDS: usize = 10_000;

/// Bump to ask every user again. Choices saved under an older version are
/// ignored, so the config falls back to the default: off, no consent.
/// Version 1 consent could be given just by viewing the onboarding step.
const CONSENT_VERSION: u64 = 2;

pub fn now_secs() -> i64 {
  chrono::Utc::now().timestamp()
}

fn store(app: &AppHandle) -> Result<Arc<Store<AppRuntime>>, MatchSyncError> {
  app
    .store(STORE_FILE)
    .map_err(|e| MatchSyncError::Store(e.to_string()))
}

fn get_bool(store: &Store<AppRuntime>, key: &str, default: bool) -> bool {
  store.get(key).and_then(|v| v.as_bool()).unwrap_or(default)
}

fn save(store: &Store<AppRuntime>) -> Result<(), MatchSyncError> {
  store
    .save()
    .map_err(|e| MatchSyncError::Store(e.to_string()))
}

pub fn load_config(app: &AppHandle) -> Result<MatchSyncConfig, MatchSyncError> {
  let store = store(app)?;
  let default = MatchSyncConfig::default();
  if !has_current_consent_version(&store) {
    return Ok(default);
  }
  Ok(MatchSyncConfig {
    enabled: get_bool(&store, KEY_ENABLED, default.enabled),
    consent_accepted: get_bool(&store, KEY_CONSENT, default.consent_accepted),
  })
}

fn has_current_consent_version(store: &Store<AppRuntime>) -> bool {
  store.get(KEY_CONSENT_VERSION).and_then(|v| v.as_u64()) == Some(CONSENT_VERSION)
}

// The first write under a new version must not revive the old consent value.
fn stamp_consent_version(store: &Store<AppRuntime>) {
  if !has_current_consent_version(store) {
    store.set(KEY_CONSENT, false);
    store.set(KEY_CONSENT_VERSION, CONSENT_VERSION);
  }
}

pub fn set_consent(app: &AppHandle, accepted: bool) -> Result<(), MatchSyncError> {
  let store = store(app)?;
  stamp_consent_version(&store);
  store.set(KEY_CONSENT, accepted);
  // enabled=true with consent_accepted=false is never a valid persisted state.
  if !accepted {
    store.set(KEY_ENABLED, false);
  }
  save(&store)
}

#[cfg(debug_assertions)]
pub fn reset_config(app: &AppHandle) -> Result<(), MatchSyncError> {
  let store = store(app)?;
  store.delete(KEY_ENABLED);
  store.delete(KEY_CONSENT);
  store.delete(KEY_CONSENT_VERSION);
  save(&store)
}

pub fn set_enabled(app: &AppHandle, enabled: bool) -> Result<(), MatchSyncError> {
  let store = store(app)?;
  stamp_consent_version(&store);
  store.set(KEY_ENABLED, enabled);
  save(&store)
}

pub fn load_full_sync_complete(app: &AppHandle, steam_id64: u64) -> bool {
  match store(app) {
    Ok(store) => get_bool(
      &store,
      &format!("{KEY_FULL_SYNC_COMPLETE}::{steam_id64}"),
      false,
    ),
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

fn load_window(
  app: &AppHandle,
  key: &str,
  steam_id64: u64,
  limit: usize,
) -> Result<QuotaWindow, MatchSyncError> {
  let store = store(app)?;
  let hits = store
    .get(format!("{key}::{steam_id64}"))
    .and_then(|v| serde_json::from_value::<Vec<i64>>(v).ok())
    .unwrap_or_default();
  Ok(QuotaWindow::new(hits, limit, FETCH_QUOTA_WINDOW_SECS))
}

fn save_window(
  app: &AppHandle,
  key: &str,
  steam_id64: u64,
  quota: &QuotaWindow,
) -> Result<(), MatchSyncError> {
  let store = store(app)?;
  store.set(
    format!("{key}::{steam_id64}"),
    serde_json::json!(quota.snapshot()),
  );
  save(&store)
}

pub fn load_quota(app: &AppHandle, steam_id64: u64) -> Result<QuotaWindow, MatchSyncError> {
  load_window(app, KEY_QUOTA_HITS, steam_id64, FETCH_QUOTA_LIMIT)
}

pub fn save_quota(
  app: &AppHandle,
  steam_id64: u64,
  quota: &QuotaWindow,
) -> Result<(), MatchSyncError> {
  save_window(app, KEY_QUOTA_HITS, steam_id64, quota)
}

// Friend match-history lookups have their own, smaller 24h cap.
pub fn load_history_quota(app: &AppHandle, steam_id64: u64) -> Result<QuotaWindow, MatchSyncError> {
  load_window(
    app,
    KEY_HISTORY_HITS,
    steam_id64,
    FRIEND_HISTORY_QUOTA_LIMIT,
  )
}

pub fn save_history_quota(
  app: &AppHandle,
  steam_id64: u64,
  quota: &QuotaWindow,
) -> Result<(), MatchSyncError> {
  save_window(app, KEY_HISTORY_HITS, steam_id64, quota)
}

// Friend account id -> unix time before which their history isn't looked up again.
pub fn load_friend_cooldowns(app: &AppHandle) -> Result<HashMap<u32, i64>, MatchSyncError> {
  Ok(
    store(app)?
      .get(KEY_FRIEND_COOLDOWNS)
      .and_then(|v| serde_json::from_value(v).ok())
      .unwrap_or_default(),
  )
}

// Records a friend's cooldown and drops the ones that already expired.
pub fn set_friend_cooldown(
  app: &AppHandle,
  account_id: u32,
  until: i64,
  now: i64,
) -> Result<(), MatchSyncError> {
  let mut cooldowns = load_friend_cooldowns(app)?;
  cooldowns.retain(|_, &mut t| t > now);
  cooldowns.insert(account_id, until);
  let store = store(app)?;
  store.set(KEY_FRIEND_COOLDOWNS, serde_json::json!(cooldowns));
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
    KEY_HISTORY_HITS,
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
