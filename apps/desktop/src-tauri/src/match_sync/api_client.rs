//! The deadlock-api calls this subsystem makes: read the to-fetch list (and release
//! the global list's claims once done with it), what is stored for the user's Steam
//! friends and which matches already have salts, and POST recovered salts to the same
//! route the httpcache scraper uses. Split into traits so [`super::sync`] can be tested
//! with spies.

use std::collections::HashMap;
use std::future::Future;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

use futures::{StreamExt as _, stream};
use reqwest::header::{COOKIE, HeaderMap, SET_COOKIE};
use serde::Deserialize;

use super::error::MatchSyncError;
use super::friends::GAP_SAMPLE;
use super::model::{ActiveFriend, FetchScope, SaltPayload, SaltsCheck};

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
// friends go on a cooldown at least this long anyway.
const STORED_HISTORY_TTL: Duration = Duration::from_secs(60 * 60);
// Requests in flight at once when reading friends' stored histories or checking salts.
const READ_CONCURRENCY: usize = 4;
// A stalled request must not hold up the pass, which only checks for cancellation between
// requests.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
// Account ids per profile request, which go in the query string: long request lines get
// rejected by some proxies.
const PROFILES_PER_REQUEST: usize = 100;

// Friends' stored histories, kept across passes so they aren't re-read every pass. Stored
// history belongs to the friend, so accounts sharing a friend share the entry.
#[derive(Default)]
pub struct StoredHistories(Mutex<HistoryCache>);

impl StoredHistories {
  fn lock(&self) -> MutexGuard<'_, HistoryCache> {
    self.0.lock().unwrap_or_else(PoisonError::into_inner)
  }

  pub fn clear(&self) {
    self.lock().0.clear();
  }
}

// Per friend: when their stored history was read, and the summary `active_friends`
// reports (`None` if deadlock-api has no stored match for them, or their history couldn't
// be read).
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

  // Checks `match_ids` in order until `limit` of them have no salts in deadlock-api, or
  // `cancel` is set. Stops at the first check that fails: fetching a match that can't be
  // checked could spend a GC request on salts deadlock-api already has.
  fn missing_salts(
    &self,
    match_ids: &[u64],
    limit: usize,
    cancel: &AtomicBool,
  ) -> impl Future<Output = SaltsCheck> + Send;
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
  histories: Arc<StoredHistories>,
}

impl ApiClient {
  pub fn new(histories: Arc<StoredHistories>) -> Self {
    Self {
      base_url: DEFAULT_BASE_URL.to_string(),
      claim: Mutex::new(None),
      histories,
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
  start_time: i64,
  #[serde(default)]
  match_duration_s: i64,
}

impl ApiClient {
  fn client(&self) -> Result<reqwest::Client, MatchSyncError> {
    crate::proxy::build_http_client(|b| b.timeout(REQUEST_TIMEOUT))
      .map_err(|e| MatchSyncError::Api(e.to_string()))
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
      .map_err(MatchSyncError::from)
  }

  // Of `account_ids`, the ones deadlock-api saw play Deadlock in the last 30 days.
  async fn recent_players(
    &self,
    client: &reqwest::Client,
    account_ids: &[u32],
  ) -> Result<Vec<u32>, MatchSyncError> {
    let mut players = Vec::new();
    for chunk in account_ids.chunks(PROFILES_PER_REQUEST) {
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
    let resp = client.get(url).send().await?;
    match resp.status() {
      reqwest::StatusCode::NOT_FOUND => {
        drain(resp).await;
        Ok(Vec::new())
      }
      // deadlock-api reads accounts its bots are friends with from Steam, only a few times an
      // hour per IP. Past that it answers 429 with the stored history, which is all this
      // needs.
      reqwest::StatusCode::TOO_MANY_REQUESTS => read_list(resp).await,
      _ => read_list(resp.error_for_status()?).await,
    }
  }

  // Whether deadlock-api stores salts for `match_id`, without letting it ask Steam.
  async fn salts_stored(
    &self,
    client: &reqwest::Client,
    match_id: u64,
  ) -> Result<bool, MatchSyncError> {
    let req = client
      .get(format!("{}/v1/matches/{match_id}/salts", self.base_url))
      .query(&[("disable_steam", true)]);
    let Some(resp) = send_found(req).await? else {
      return Ok(false);
    };
    drain(resp).await;
    Ok(true)
  }
}

// Sends `req`; `None` for the 404 deadlock-api answers when it has nothing stored.
async fn send_found(
  req: reqwest::RequestBuilder,
) -> Result<Option<reqwest::Response>, MatchSyncError> {
  let resp = req.send().await?;
  if resp.status() == reqwest::StatusCode::NOT_FOUND {
    drain(resp).await;
    return Ok(None);
  }
  Ok(Some(resp.error_for_status()?))
}

// Reads an answered response to the end so its connection can serve the next request.
// The status already said what was needed, so a failed read changes nothing.
async fn drain(resp: reqwest::Response) {
  let _ = resp.bytes().await;
}

async fn get_list<T: serde::de::DeserializeOwned>(
  req: reqwest::RequestBuilder,
) -> Result<Vec<T>, MatchSyncError> {
  match send_found(req).await? {
    Some(resp) => read_list(resp).await,
    None => Ok(Vec::new()),
  }
}

async fn read_list<T: serde::de::DeserializeOwned>(
  resp: reqwest::Response,
) -> Result<Vec<T>, MatchSyncError> {
  resp
    .json()
    .await
    .map_err(|e| MatchSyncError::Api(format!("invalid response: {}", e.without_url())))
}

// Only the newest `GAP_SAMPLE` starts are kept: the cadence never reads further back.
fn summarize(account_id: u32, history: &[StoredMatch]) -> Option<ActiveFriend> {
  Some(ActiveFriend {
    account_id,
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
    let resp = req.send().await.and_then(|r| r.error_for_status())?;
    // A failed request keeps the held claim, so a later release still covers it. A
    // response without the cookie claimed nothing (or comes from an older API).
    if let FetchScope::Global = scope {
      self.set_claim(claim_from_headers(resp.headers()));
    }
    resp
      .json::<Vec<u64>>()
      .await
      .map_err(|e| MatchSyncError::Api(format!("invalid to-fetch response: {}", e.without_url())))
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
    let players = self.recent_players(&client, account_ids).await?;
    let now = Instant::now();
    let mut active = Vec::new();
    let mut uncached = Vec::new();
    {
      let mut cache = self.histories.lock();
      cache.prune(now);
      for account_id in players {
        match cache.get(account_id, now) {
          Some(friend) => active.extend(friend),
          None => uncached.push(account_id),
        }
      }
    }

    let client = &client;
    let mut reads = stream::iter(uncached)
      .map(|account_id| async move { (account_id, self.stored_history(client, account_id).await) })
      .buffer_unordered(READ_CONCURRENCY);
    let mut read = Vec::new();
    while let Some((account_id, history)) = reads.next().await {
      let failed = history.is_err();
      read.push((account_id, history));
      // A failing or stalled API would most likely fail the rest too; one is enough, and
      // the friends left unread are read on a later pass.
      if failed {
        break;
      }
    }
    let read_at = Instant::now();
    let mut last_error = None;
    let mut cache = self.histories.lock();
    for (account_id, history) in read {
      let friend = match history {
        Ok(history) => summarize(account_id, &history),
        // A failed read is cached as "nothing stored", so it isn't retried every pass.
        Err(e) => {
          last_error = Some(e);
          None
        }
      };
      cache.insert(account_id, read_at, friend.clone());
      active.extend(friend);
    }
    drop(cache);
    if let Some(e) = last_error {
      log::warn!("match-sync: a friend's stored history is unavailable: {e}");
    }
    Ok(active)
  }

  async fn missing_salts(
    &self,
    match_ids: &[u64],
    limit: usize,
    cancel: &AtomicBool,
  ) -> SaltsCheck {
    let mut check = SaltsCheck::default();
    if match_ids.is_empty() || limit == 0 {
      return check;
    }
    let client = match self.client() {
      Ok(client) => client,
      Err(e) => {
        log::warn!("match-sync: stored salts unavailable: {e}");
        return check;
      }
    };
    let client = &client;
    let mut results = stream::iter(match_ids.iter().copied())
      .map(|match_id| async move { (match_id, self.salts_stored(client, match_id).await) })
      .buffered(READ_CONCURRENCY);
    while check.missing.len() < limit
      && !cancel.load(Ordering::Relaxed)
      && let Some((match_id, stored)) = results.next().await
    {
      match stored {
        Ok(true) => check.stored.push(match_id),
        Ok(false) => check.missing.push(match_id),
        Err(e) => {
          log::warn!("match-sync: stored salts unavailable: {e}");
          break;
        }
      }
    }
    check
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
        Err(e)
          if attempt >= POST_MAX_RETRIES
            || e.status() == Some(reqwest::StatusCode::BAD_REQUEST) =>
        {
          return Err(e.into());
        }
        Err(_) => tokio::time::sleep(POST_RETRY_DELAY).await,
      }
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use reqwest::header::HeaderValue;

  #[tokio::test]
  async fn api_errors_leave_the_url_out() {
    // Nothing listens on port 1, so this fails without leaving the machine.
    let client = reqwest::Client::builder().no_proxy().build().unwrap();
    let e = client
      .get("http://127.0.0.1:1/v1/players/12345678/match-history")
      .send()
      .await
      .unwrap_err();
    assert!(e.to_string().contains("12345678"));
    assert!(!MatchSyncError::from(e).to_string().contains("12345678"));
  }

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
        start_time: 2_000,
        match_duration_s: 1_500,
      },
      StoredMatch {
        start_time: 1_000,
        match_duration_s: 3_000,
      },
    ];
    let friend = summarize(7, &history).unwrap();
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
