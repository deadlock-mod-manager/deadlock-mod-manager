//! The deadlock-api calls this subsystem makes: read the to-fetch list (and release
//! the global list's claims once done with it) and POST recovered salts to the same
//! route the httpcache scraper uses. Split into traits so [`super::sync`] can be
//! tested with spies.

use std::future::Future;
use std::sync::Mutex;
use std::time::Duration;

use reqwest::header::{COOKIE, HeaderMap, SET_COOKIE};

use super::error::MatchSyncError;
use super::model::{FetchScope, SaltPayload};

const DEFAULT_BASE_URL: &str = "https://api.deadlock-api.com";
const POST_MAX_RETRIES: u32 = 5;
const POST_RETRY_DELAY: Duration = Duration::from_secs(3);
// The global to-fetch list claims its ids for 15 min so other workers skip them; this
// cookie identifies that list so it can be released once we're done with it.
const CLAIM_COOKIE: &str = "to_fetch_claim";
// The release runs inline at the end of a pass; an unresponsive API mustn't hold it up.
const RELEASE_TIMEOUT: Duration = Duration::from_secs(15);

pub trait BackfillSource: Send + Sync {
  fn to_fetch(
    &self,
    scope: FetchScope,
  ) -> impl Future<Output = Result<Vec<u64>, MatchSyncError>> + Send;

  // Hands the ids of the last global list we won't fetch back to other workers. Best
  // effort: a failed release only means they stay claimed until the claim expires.
  fn release_claim(&self) -> impl Future<Output = ()> + Send;
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
}
