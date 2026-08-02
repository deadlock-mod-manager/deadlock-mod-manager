use serde::{Deserialize, Serialize};

pub const DEADLOCK_APP_ID: u32 = 1422450;

pub const FETCH_QUOTA_LIMIT: usize = 40;
pub const FETCH_QUOTA_WINDOW_SECS: i64 = 24 * 60 * 60;

// Quota slots the background pass keeps free from global backfill, so a user's own
// freshly-played matches (fetched first, and not subject to this reserve) always have
// headroom against a bottomless global to-fetch list. Sized for ~4 matches/day plus
// margin for two sessions straddling the rolling 24h window.
pub const BACKFILL_QUOTA_RESERVE: usize = 8;

// Matches the httpcache scraper so both ingest sources look identical server-side.
pub const INGEST_USERNAME: &str = "Mod Manager";

// refresh_token is a live account credential: in-memory only, never
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

/// A match as Valve's Game Coordinator reports it. The field names deliberately
/// mirror deadlock-api's `match-history` entries so the frontend can merge the
/// two without a translation layer - the GC knows about today's matches hours
/// before the API has ingested them.
#[derive(Debug, Clone, Default, Serialize)]
pub struct LocalMatch {
  pub match_id: u64,
  pub hero_id: u32,
  pub hero_level: u32,
  pub start_time: u32,
  pub game_mode: i32,
  pub match_mode: i32,
  pub player_team: i32,
  pub player_kills: u32,
  pub player_deaths: u32,
  pub player_assists: u32,
  pub denies: u32,
  pub net_worth: u32,
  pub last_hits: u32,
  pub match_duration_s: u32,
  pub match_result: u32,
  pub team_abandoned: Option<bool>,
  pub abandoned_time_s: Option<u32>,
  pub objectives_mask_team0: u64,
  pub objectives_mask_team1: u64,
}

// One page of the GC `GetMatchHistory` response. `next_cursor` is the continuation
// token for the next (older) page, or None when history is exhausted.
#[derive(Debug, Clone, Default)]
pub struct MatchHistoryPage {
  pub matches: Vec<LocalMatch>,
  pub next_cursor: Option<u64>,
}

impl MatchHistoryPage {
  /// The ids alone, for the sync engine - it only ever walks the page by id.
  pub fn match_ids(&self) -> Vec<u64> {
    self.matches.iter().map(|m| m.match_id).collect()
  }
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
