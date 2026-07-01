//! The only two deadlock-api calls this subsystem makes: read the to-fetch list and
//! POST recovered salts to the same route the httpcache scraper uses. Split into
//! traits so [`super::sync`] can be tested with spies.

use std::future::Future;
use std::time::Duration;

use super::error::MatchSyncError;
use super::model::{FetchScope, SaltPayload};

const DEFAULT_BASE_URL: &str = "https://api.deadlock-api.com";
const POST_MAX_RETRIES: u32 = 5;
const POST_RETRY_DELAY: Duration = Duration::from_secs(3);

pub trait BackfillSource: Send + Sync {
  fn to_fetch(
    &self,
    scope: FetchScope,
  ) -> impl Future<Output = Result<Vec<u64>, MatchSyncError>> + Send;
}

pub trait SaltsSink: Send + Sync {
  fn post_salts(
    &self,
    salts: &[SaltPayload],
  ) -> impl Future<Output = Result<(), MatchSyncError>> + Send;
}

pub struct ApiClient {
  base_url: String,
}

impl Default for ApiClient {
  fn default() -> Self {
    Self {
      base_url: DEFAULT_BASE_URL.to_string(),
    }
  }
}

impl ApiClient {
  fn client(&self) -> Result<reqwest::Client, MatchSyncError> {
    crate::proxy::build_default_http_client().map_err(|e| MatchSyncError::Api(e.to_string()))
  }
}

impl BackfillSource for ApiClient {
  async fn to_fetch(&self, scope: FetchScope) -> Result<Vec<u64>, MatchSyncError> {
    let mut req = self
      .client()?
      .get(format!("{}/v1/matches/to-fetch", self.base_url));
    if let FetchScope::Account(account_id) = scope {
      req = req.query(&[("account_id", account_id)]);
    }
    let resp = req
      .send()
      .await
      .and_then(|r| r.error_for_status())
      .map_err(|e| MatchSyncError::Api(e.to_string()))?;
    resp
      .json::<Vec<u64>>()
      .await
      .map_err(|e| MatchSyncError::Api(format!("invalid to-fetch response: {e}")))
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
