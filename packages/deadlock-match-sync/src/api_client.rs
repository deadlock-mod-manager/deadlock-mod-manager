use std::collections::{HashMap, HashSet};
use std::future::Future;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

use reqwest::header::{COOKIE, HeaderMap, SET_COOKIE};
use serde::{Deserialize, Serialize};

use super::auth::now_secs;
use super::error::MatchSyncError;
use super::friends::GAP_SAMPLE;
use super::model::{ActiveFriend, Attempt, FetchScope, SaltPayload, SaltsCheck};

const DEFAULT_BASE_URL: &str = "https://api.deadlock-api.com";
const POST_MAX_RETRIES: u32 = 5;
const POST_RETRY_DELAY: Duration = Duration::from_secs(3);
const CLAIM_COOKIE: &str = "to_fetch_claim";
const RELEASE_TIMEOUT: Duration = Duration::from_secs(15);
const STORED_HISTORY_TTL: Duration = Duration::from_secs(60 * 60);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const IDS_PER_REQUEST: usize = 100;
const ACTIVE_WINDOW_SECS: i64 = 30 * 24 * 60 * 60;

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

  fn release_claim(&self, attempts: &[Attempt]) -> impl Future<Output = ()> + Send;

  fn active_friends(
    &self,
    account_ids: &[u32],
  ) -> impl Future<Output = Result<Vec<ActiveFriend>, MatchSyncError>> + Send;

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

pub type HttpClientFactory = Arc<dyn Fn(Duration) -> Result<reqwest::Client, String> + Send + Sync>;

pub struct ApiClient {
  base_url: String,
  http: HttpClientFactory,
  claim: Mutex<Option<String>>,
  histories: Arc<StoredHistories>,
}

impl ApiClient {
  pub fn new(http: HttpClientFactory, histories: Arc<StoredHistories>) -> Self {
    Self {
      base_url: DEFAULT_BASE_URL.to_string(),
      http,
      claim: Mutex::new(None),
      histories,
    }
  }
}

#[derive(Deserialize)]
struct RecentMatches {
  account_id: u32,
  matches: Vec<StoredMatch>,
}

#[derive(Deserialize)]
struct StoredMatch {
  start_time: i64,
  #[serde(default)]
  match_duration_s: i64,
}

#[derive(Serialize)]
struct ReleaseReport<'a> {
  attempts: &'a [Attempt],
}

impl ApiClient {
  fn client(&self) -> Result<reqwest::Client, MatchSyncError> {
    (self.http)(REQUEST_TIMEOUT).map_err(MatchSyncError::Api)
  }

  fn set_claim(&self, claim: Option<String>) {
    *self.claim.lock().unwrap_or_else(|e| e.into_inner()) = claim;
  }

  fn held_claim(&self) -> Option<String> {
    self.claim.lock().unwrap_or_else(|e| e.into_inner()).clone()
  }

  async fn post_release(&self, claim: &str, attempts: &[Attempt]) -> Result<(), MatchSyncError> {
    self
      .client()?
      .post(format!("{}/v1/matches/to-fetch/release", self.base_url))
      .header(COOKIE, format!("{CLAIM_COOKIE}={claim}"))
      .json(&ReleaseReport { attempts })
      .timeout(RELEASE_TIMEOUT)
      .send()
      .await
      .and_then(|r| r.error_for_status())
      .map(|_| ())
      .map_err(MatchSyncError::from)
  }

  async fn get_batch<I: ToString, T: serde::de::DeserializeOwned>(
    &self,
    client: &reqwest::Client,
    path: &str,
    param: &str,
    ids: &[I],
    extra: &[(&str, String)],
  ) -> Result<Vec<T>, MatchSyncError> {
    let ids = ids.iter().map(I::to_string).collect::<Vec<_>>().join(",");
    let req = client
      .get(format!("{}{path}", self.base_url))
      .query(&[(param, ids)])
      .query(extra);
    get_list(req).await
  }
}

async fn get_list<T: serde::de::DeserializeOwned>(
  req: reqwest::RequestBuilder,
) -> Result<Vec<T>, MatchSyncError> {
  read_list(req.send().await?.error_for_status()?).await
}

async fn read_list<T: serde::de::DeserializeOwned>(
  resp: reqwest::Response,
) -> Result<Vec<T>, MatchSyncError> {
  resp
    .json()
    .await
    .map_err(|e| MatchSyncError::Api(format!("invalid response: {}", e.without_url())))
}

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
      FetchScope::Global(limit) => {
        req = req.query(&[("limit", limit)]);
        if let Some(claim) = self.held_claim() {
          req = req.header(COOKIE, format!("{CLAIM_COOKIE}={claim}"));
        }
      }
    }
    let resp = req.send().await.and_then(|r| r.error_for_status())?;
    if let FetchScope::Global(_) = scope {
      self.set_claim(claim_from_headers(resp.headers()));
    }
    resp
      .json::<Vec<u64>>()
      .await
      .map_err(|e| MatchSyncError::Api(format!("invalid to-fetch response: {}", e.without_url())))
  }

  async fn release_claim(&self, attempts: &[Attempt]) {
    let Some(claim) = self.held_claim() else {
      return;
    };
    if let Err(e) = self.post_release(&claim, attempts).await {
      log::warn!("match-sync: releasing the to-fetch claim failed: {e}");
    }
    self.set_claim(None);
  }

  async fn active_friends(&self, account_ids: &[u32]) -> Result<Vec<ActiveFriend>, MatchSyncError> {
    let now = Instant::now();
    let mut known = Vec::new();
    let mut uncached = Vec::new();
    {
      let mut cache = self.histories.lock();
      cache.prune(now);
      for &account_id in account_ids {
        match cache.get(account_id, now) {
          Some(friend) => known.extend(friend),
          None => uncached.push(account_id),
        }
      }
    }

    if !uncached.is_empty() {
      let client = self.client()?;
      for chunk in uncached.chunks(IDS_PER_REQUEST) {
        let players: Vec<RecentMatches> = self
          .get_batch(
            &client,
            "/v1/players/recent-matches",
            "account_ids",
            chunk,
            &[("limit", GAP_SAMPLE.to_string())],
          )
          .await?;
        let mut read: HashMap<u32, Option<ActiveFriend>> =
          chunk.iter().map(|&account_id| (account_id, None)).collect();
        for player in players {
          read.insert(
            player.account_id,
            summarize(player.account_id, &player.matches),
          );
        }
        let read_at = Instant::now();
        let mut cache = self.histories.lock();
        for (account_id, friend) in read {
          cache.insert(account_id, read_at, friend.clone());
          known.extend(friend);
        }
      }
    }

    let cutoff = now_secs().saturating_sub(ACTIVE_WINDOW_SECS);
    Ok(known.into_iter().filter(|f| f.last_end >= cutoff).collect())
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
    for chunk in match_ids.chunks(IDS_PER_REQUEST) {
      if check.missing.len() >= limit || cancel.load(Ordering::Relaxed) {
        break;
      }
      let stored = self
        .get_batch(&client, "/v1/matches/salts/stored", "match_ids", chunk, &[])
        .await;
      let stored: HashSet<u64> = match stored {
        Ok(stored) => stored.into_iter().collect(),
        Err(e) => {
          log::warn!("match-sync: stored salts unavailable: {e}");
          break;
        }
      };
      for &match_id in chunk {
        if check.missing.len() >= limit {
          break;
        }
        if stored.contains(&match_id) {
          check.stored.push(match_id);
        } else {
          check.missing.push(match_id);
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
    let client = reqwest::Client::builder().no_proxy().build().unwrap();
    let e = client
      .get("http://127.0.0.1:1/v1/players/12345678/match-history")
      .send()
      .await
      .unwrap_err();
    assert!(e.to_string().contains("12345678"));
    assert!(!MatchSyncError::from(e).to_string().contains("12345678"));
  }

  fn serve_once(status: &'static str, body: &'static str) -> String {
    use std::io::{Read as _, Write as _};
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    std::thread::spawn(move || {
      let (mut stream, _) = listener.accept().unwrap();
      let _ = stream.read(&mut [0; 4096]);
      let response = format!(
        "HTTP/1.1 {status}\r\ncontent-type: application/json\r\ncontent-length: {}\r\n\
         connection: close\r\n\r\n{body}",
        body.len()
      );
      stream.write_all(response.as_bytes()).unwrap();
    });
    format!("http://{addr}/v1/matches/salts/stored")
  }

  #[tokio::test]
  async fn batch_lists_fail_on_a_missing_route() {
    let client = reqwest::Client::builder().no_proxy().build().unwrap();
    let url = serve_once("404 Not Found", "[]");
    assert!(get_list::<u64>(client.get(url)).await.is_err());
  }

  #[tokio::test]
  async fn batch_lists_read_empty_and_full_answers() {
    let client = reqwest::Client::builder().no_proxy().build().unwrap();
    let empty = serve_once("200 OK", "[]");
    assert_eq!(
      get_list::<u64>(client.get(empty)).await.unwrap(),
      Vec::<u64>::new()
    );
    let full = serve_once("200 OK", "[3,1]");
    assert_eq!(get_list::<u64>(client.get(full)).await.unwrap(), vec![3, 1]);
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
