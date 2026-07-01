use serde::{Deserialize, Serialize};

pub const DEADLOCK_APP_ID: u32 = 1422450;

pub const FETCH_QUOTA_LIMIT: usize = 40;
pub const FETCH_QUOTA_WINDOW_SECS: i64 = 24 * 60 * 60;

// Matches the httpcache scraper so both ingest sources look identical server-side.
pub const INGEST_USERNAME: &str = "Mod Manager";

// refresh_token is a live account credential (user-auth.md): in-memory only, never
// logged/persisted/sent. Debug is hand-written to keep it out of logs.
#[derive(Clone)]
pub struct AuthContext {
  pub account_name: String,
  pub steam_id64: u64,
  pub refresh_token: String,
}

impl AuthContext {
  // deadlock-api expects the 32-bit Steam3 account id, not the SteamID64.
  pub fn account_id(&self) -> u32 {
    (self.steam_id64 & 0xFFFF_FFFF) as u32
  }
}

impl std::fmt::Debug for AuthContext {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    f.debug_struct("AuthContext")
      .field("account_name", &self.account_name)
      .field("steam_id64", &self.steam_id64)
      .field("refresh_token", &"<redacted>")
      .finish()
  }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MatchSalts {
  pub match_id: u64,
  pub cluster_id: Option<u32>,
  pub metadata_salt: Option<u32>,
  pub replay_salt: Option<u32>,
}

// One element of the `POST /v1/matches/salts` body; field names/nullability must
// match what the scraper already sends.
#[derive(Serialize, Debug, Clone)]
pub struct SaltPayload {
  pub match_id: u64,
  pub cluster_id: Option<u32>,
  pub metadata_salt: Option<u32>,
  pub replay_salt: Option<u32>,
  pub username: Option<String>,
}

impl From<&MatchSalts> for SaltPayload {
  fn from(s: &MatchSalts) -> Self {
    SaltPayload {
      match_id: s.match_id,
      cluster_id: s.cluster_id,
      metadata_salt: s.metadata_salt,
      replay_salt: s.replay_salt,
      username: Some(INGEST_USERNAME.to_string()),
    }
  }
}

#[derive(Debug, Clone, Copy)]
pub enum FetchScope {
  Account(u32),
  Global,
}

// One page of the GC `GetMatchHistory` response. `next_cursor` is the continuation
// token for the next (older) page, or None when history is exhausted.
#[derive(Debug, Clone, Default)]
pub struct MatchHistoryPage {
  pub match_ids: Vec<u64>,
  pub next_cursor: Option<u64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchSyncConfig {
  pub enabled: bool,
  pub consent_accepted: bool,
}

impl MatchSyncConfig {
  pub fn is_active(&self) -> bool {
    self.enabled && self.consent_accepted
  }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountStatus {
  pub steam_id64: u64,
  pub account_name: String,
  pub quota_limit: u32,
  pub quota_remaining: u32,
  pub quota_reset_at: Option<i64>,
  pub full_sync_complete: bool,
  pub available: bool,
  pub gc_unavailable: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncProgress {
  pub fetched: u32,
  pub skipped: u32,
  pub backfilled: u32,
  pub running: bool,
  pub quota_reached: bool,
  pub rate_limited: bool,
  pub quota_remaining: u32,
}
