//! The deadlock-api calls this subsystem makes: read the to-fetch list (and release
//! the global list's claims once done with it) and what is stored for the user's Steam
//! friends, and POST recovered salts to the same route the httpcache scraper uses.
//! Split into traits so [`super::sync`] can be tested with spies.

use std::collections::HashMap;
use std::future::Future;
use std::sync::{LazyLock, Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

use reqwest::header::{COOKIE, HeaderMap, SET_COOKIE};
use serde::Deserialize;

use super::error::MatchSyncError;
use super::friends::GAP_SAMPLE;
use super::model::{ActiveFriend, FetchScope, SaltPayload};

const DEFAULT_BASE_URL: &str = "https://api.deadlock-api.com";
const POST_MAX_RETRIES: u32 = 5;
const POST_RETRY_DELAY: Duration = Duration::from_secs(3);
// The global to-fetch list claims its ids for 15 min so other workers skip them; this
// cookie identifies that list so it can be released once we're done with it.
const CLAIM_COOKIE: &str = "to_fetch_claim";
// The release runs inline at the end of a pass; an unresponsive API mustn't hold it up.
const RELEASE_TIMEOUT: Duration = Duration::from_secs(15);
// Friends who are active but not picked would otherwise have their stored history re-read
// every pass. Short enough that matches deadlock-api ingested since are soon seen; picked
// friends go on a far longer cooldown anyway.
const STORED_HISTORY_TTL: Duration = Duration::from_secs(60 * 60);

// Process-wide, since every pass builds a fresh client. Stored history belongs to the
// friend, so accounts sharing a friend share the entry.
static STORED_HISTORIES: LazyLock<Mutex<HistoryCache>> = LazyLock::new(Default::default);

fn stored_histories() -> MutexGuard<'static, HistoryCache> {
  STORED_HISTORIES
    .lock()
    .unwrap_or_else(PoisonError::into_inner)
}

// Per friend: when their stored history was read, and the summary `active_friends`
// reports (`None` if deadlock-api has no stored match for them).
#[derive(Default)]
struct HistoryCache(HashMap<u32, (Instant, Option<ActiveFriend>)>);

fn fresh(read_at: Instant, now: Instant) -> bool {
  now.duration_since(read_at) < STORED_HISTORY_TTL
}

impl HistoryCache {
  fn get(&self, account_id: u32, now: Instant) -> Option<Option<ActiveFriend>> {
    self
      .0
      .get(&account_id)
      .filter(|&&(read_at, _)| fresh(read_at, now))
      .map(|(_, friend)| friend.clone())
  }

  fn insert(&mut self, account_id: u32, now: Instant, friend: Option<ActiveFriend>) {
    self.0.insert(account_id, (now, friend));
  }

  fn prune(&mut self, now: Instant) {
    self.0.retain(|_, &mut (read_at, _)| fresh(read_at, now));
  }
}

pub trait BackfillSource: Send + Sync {
  fn to_fetch(
    &self,
    scope: FetchScope,
  ) -> impl Future<Output = Result<Vec<u64>, MatchSyncError>> + Send;

  // Hands the ids of the last global list we won't fetch back to other workers. Best
  // effort: a failed release only means they stay claimed until the claim expires.
  fn release_claim(&self) -> impl Future<Output = ()> + Send;

  // Of `account_ids`, the ones deadlock-api saw play in the last 30 days, with their
  // stored history. Friends whose history can't be read are skipped.
  fn active_friends(
    &self,
    account_ids: &[u32],
  ) -> impl Future<Output = Result<Vec<ActiveFriend>, MatchSyncError>> + Send;
}

pub trait SaltsSink: Send + Sync {
  fn post_salts(
    &self,
    salts: &[SaltPayload],
  ) -> impl Future<Output = Result<(), MatchSyncError>> + Send;
}

pub struct ApiClient {
  base_url: String,
  // The claim cookie of the last global to-fetch list, held here rather than in a
  // cookie store since every request builds a fresh client.
  claim: Mutex<Option<String>>,
}

impl Default for ApiClient {
  fn default() -> Self {
    Self {
      base_url: DEFAULT_BASE_URL.to_string(),
      claim: Mutex::new(None),
    }
  }
}

#[derive(Deserialize)]
struct SteamProfile {
  account_id: u32,
  matches_played_last_30d: Option<u64>,
}

#[derive(Deserialize)]
struct StoredMatch {
  match_id: u64,
  start_time: i64,
  #[serde(default)]
  match_duration_s: i64,
}

impl ApiClient {
  fn client(&self) -> Result<reqwest::Client, MatchSyncError> {
    crate::proxy::build_default_http_client().map_err(|e| MatchSyncError::Api(e.to_string()))
  }

  fn set_claim(&self, claim: Option<String>) {
    *self.claim.lock().unwrap_or_else(|e| e.into_inner()) = claim;
  }

  fn held_claim(&self) -> Option<String> {
    self.claim.lock().unwrap_or_else(|e| e.into_inner()).clone()
  }

  async fn post_release(&self, claim: &str) -> Result<(), MatchSyncError> {
    self
      .client()?
      .post(format!("{}/v1/matches/to-fetch/release", self.base_url))
      .header(COOKIE, format!("{CLAIM_COOKIE}={claim}"))
      .timeout(RELEASE_TIMEOUT)
      .send()
      .await
      .and_then(|r| r.error_for_status())
      .map(|_| ())
      .map_err(|e| MatchSyncError::Api(e.to_string()))
  }

  // Of `account_ids`, the ones deadlock-api saw play Deadlock in the last 30 days.
  async fn recent_players(
    &self,
    client: &reqwest::Client,
    account_ids: &[u32],
  ) -> Result<Vec<u32>, MatchSyncError> {
    let mut players = Vec::new();
    for chunk in account_ids.chunks(1000) {
      let ids = chunk
        .iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(",");
      let req = client
        .get(format!("{}/v1/players/steam", self.base_url))
        .query(&[("account_ids", ids)]);
      let profiles: Vec<SteamProfile> = get_list(req).await?;
      players.extend(
        profiles
          .into_iter()
          .filter(|p| p.matches_played_last_30d.is_some_and(|n| n > 0))
          .map(|p| p.account_id),
      );
    }
    Ok(players)
  }

  async fn stored_history(
    &self,
    client: &reqwest::Client,
    account_id: u32,
  ) -> Result<Vec<StoredMatch>, MatchSyncError> {
    let url = format!("{}/v1/players/{account_id}/match-history", self.base_url);
    get_list(client.get(url)).await
  }
}

// deadlock-api answers 404 for queries that match nothing, so that reads as empty.
async fn get_list<T: serde::de::DeserializeOwned>(
  req: reqwest::RequestBuilder,
) -> Result<Vec<T>, MatchSyncError> {
  let resp = req
    .send()
    .await
    .map_err(|e| MatchSyncError::Api(e.to_string()))?;
  if resp.status() == reqwest::StatusCode::NOT_FOUND {
    return Ok(Vec::new());
  }
  resp
    .error_for_status()
    .map_err(|e| MatchSyncError::Api(e.to_string()))?
    .json()
    .await
    .map_err(|e| MatchSyncError::Api(format!("invalid response: {e}")))
}

// Only the newest `GAP_SAMPLE` starts are kept: the cadence never reads further back.
fn summarize(account_id: u32, history: &[StoredMatch]) -> Option<ActiveFriend> {
  Some(ActiveFriend {
    account_id,
    latest_match_id: history.iter().map(|m| m.match_id).max()?,
    last_end: history
      .iter()
      .map(|m| m.start_time + m.match_duration_s)
      .max()?,
    starts: history
      .iter()
      .take(GAP_SAMPLE)
      .map(|m| m.start_time)
      .collect(),
  })
}

// The claim cookie's value from a `Set-Cookie` header: everything after `name=` up to
// the first `;`. An empty value is the server clearing the cookie.
fn parse_claim_cookie(set_cookie: &str) -> Option<String> {
  let pair = set_cookie.split(';').next()?;
  let (name, value) = pair.split_once('=')?;
  let value = value.trim();
  (name.trim() == CLAIM_COOKIE && !value.is_empty()).then(|| value.to_string())
}

fn claim_from_headers(headers: &HeaderMap) -> Option<String> {
  headers
    .get_all(SET_COOKIE)
    .iter()
    .filter_map(|v| v.to_str().ok())
    .find_map(parse_claim_cookie)
}

impl BackfillSource for ApiClient {
  async fn to_fetch(&self, scope: FetchScope) -> Result<Vec<u64>, MatchSyncError> {
    let mut req = self
      .client()?
      .get(format!("{}/v1/matches/to-fetch", self.base_url));
    match scope {
      FetchScope::Account(account_id) => req = req.query(&[("account_id", account_id)]),
      // Sending the previous list's claim releases it before the new list is claimed.
      FetchScope::Global => {
        if let Some(claim) = self.held_claim() {
          req = req.header(COOKIE, format!("{CLAIM_COOKIE}={claim}"));
        }
      }
    }
    let resp = req
      .send()
      .await
      .and_then(|r| r.error_for_status())
      .map_err(|e| MatchSyncError::Api(e.to_string()))?;
    // A failed request keeps the held claim, so a later release still covers it. A
    // response without the cookie claimed nothing (or comes from an older API).
    if let FetchScope::Global = scope {
      self.set_claim(claim_from_headers(resp.headers()));
    }
    resp
      .json::<Vec<u64>>()
      .await
      .map_err(|e| MatchSyncError::Api(format!("invalid to-fetch response: {e}")))
  }

  async fn release_claim(&self) {
    let Some(claim) = self.held_claim() else {
      return;
    };
    if let Err(e) = self.post_release(&claim).await {
      log::warn!("match-sync: releasing the to-fetch claim failed: {e}");
    }
    // Cleared either way: the claim expires on its own, and retrying can't help.
    self.set_claim(None);
  }

  async fn active_friends(&self, account_ids: &[u32]) -> Result<Vec<ActiveFriend>, MatchSyncError> {
    // One client for the whole batch, so the per-friend requests share connections.
    let client = self.client()?;
    let now = Instant::now();
    stored_histories().prune(now);
    let mut active = Vec::new();
    for account_id in self.recent_players(&client, account_ids).await? {
      // A statement of its own, so the cache lock is released before the request.
      let cached = stored_histories().get(account_id, now);
      let friend = match cached {
        Some(friend) => friend,
        None => {
          let history = match self.stored_history(&client, account_id).await {
            Ok(history) => history,
            Err(e) => {
              log::warn!("match-sync: a friend's stored history is unavailable: {e}");
              continue;
            }
          };
          let friend = summarize(account_id, &history);
          stored_histories().insert(account_id, Instant::now(), friend.clone());
          friend
        }
      };
      active.extend(friend);
    }
    Ok(active)
  }
}

impl SaltsSink for ApiClient {
  async fn post_salts(&self, salts: &[SaltPayload]) -> Result<(), MatchSyncError> {
    if salts.is_empty() {
      return Ok(());
    }
    let url = format!("{}/v1/matches/salts", self.base_url);
    let mut attempt = 0;
    loop {
      attempt += 1;
      let result = self
        .client()?
        .post(&url)
        .json(salts)
        .send()
        .await
        .and_then(|r| r.error_for_status());

      match result {
        Ok(_) => return Ok(()),
        // 400 means the payload itself is wrong; retrying can't help.
        Err(e) if e.status() == Some(reqwest::StatusCode::BAD_REQUEST) => {
          return Err(MatchSyncError::Api(e.to_string()));
        }
        Err(e) if attempt >= POST_MAX_RETRIES => return Err(MatchSyncError::Api(e.to_string())),
        Err(_) => tokio::time::sleep(POST_RETRY_DELAY).await,
      }
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use reqwest::header::HeaderValue;

  #[test]
  fn parses_the_claim_cookie_up_to_the_first_attribute() {
    assert_eq!(
      parse_claim_cookie(
        "to_fetch_claim=0b6c3a52-6b9e-4f0e-9a43-7d1f1c2e9a10; Path=/v1/matches/to-fetch; \
         Max-Age=900; HttpOnly; Secure; SameSite=Strict"
      )
      .as_deref(),
      Some("0b6c3a52-6b9e-4f0e-9a43-7d1f1c2e9a10")
    );
    assert_eq!(
      parse_claim_cookie("to_fetch_claim=abc").as_deref(),
      Some("abc")
    );
  }

  #[test]
  fn ignores_cleared_and_unrelated_cookies() {
    assert_eq!(
      parse_claim_cookie("to_fetch_claim=; Path=/v1/matches/to-fetch; Max-Age=0"),
      None
    );
    assert_eq!(parse_claim_cookie("other=abc; Path=/"), None);
    assert_eq!(parse_claim_cookie("to_fetch_claimx=abc"), None);
    assert_eq!(parse_claim_cookie("garbage"), None);
  }

  #[test]
  fn finds_the_claim_among_several_set_cookie_headers() {
    let mut headers = HeaderMap::new();
    assert_eq!(claim_from_headers(&headers), None);
    headers.append(SET_COOKIE, HeaderValue::from_static("other=1; Path=/"));
    headers.append(
      SET_COOKIE,
      HeaderValue::from_static("to_fetch_claim=abc; Path=/v1/matches/to-fetch; Max-Age=900"),
    );
    assert_eq!(claim_from_headers(&headers).as_deref(), Some("abc"));
  }

  #[test]
  fn summarizes_stored_history_or_nothing() {
    let history = [
      StoredMatch {
        match_id: 12,
        start_time: 2_000,
        match_duration_s: 1_500,
      },
      StoredMatch {
        match_id: 11,
        start_time: 1_000,
        match_duration_s: 3_000,
      },
    ];
    let friend = summarize(7, &history).unwrap();
    assert_eq!(friend.latest_match_id, 12);
    assert_eq!(friend.last_end, 4_000);
    assert_eq!(friend.starts, vec![2_000, 1_000]);
    assert!(summarize(7, &[]).is_none());
  }

  #[test]
  fn cached_histories_expire_after_the_ttl() {
    let read_at = Instant::now();
    let mut cache = HistoryCache::default();
    cache.insert(7, read_at, None);
    cache.insert(
      8,
      read_at + STORED_HISTORY_TTL,
      summarize(
        8,
        &[StoredMatch {
          match_id: 1,
          start_time: 0,
          match_duration_s: 0,
        }],
      ),
    );

    let before_expiry = read_at + STORED_HISTORY_TTL - Duration::from_secs(1);
    assert!(matches!(cache.get(7, before_expiry), Some(None)));
    let expired = read_at + STORED_HISTORY_TTL;
    assert!(cache.get(7, expired).is_none());
    assert!(cache.get(9, read_at).is_none());

    cache.prune(expired);
    assert_eq!(cache.0.len(), 1);
    assert!(matches!(cache.get(8, expired), Some(Some(_))));
  }
}
