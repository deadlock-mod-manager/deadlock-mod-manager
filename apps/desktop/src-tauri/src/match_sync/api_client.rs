//! The deadlock-api calls this subsystem makes: read the to-fetch list and what is
//! stored for the user's Steam friends, and POST recovered salts to the same route the
//! httpcache scraper uses. Split into traits so [`super::sync`] can be tested with spies.

use std::future::Future;
use std::time::Duration;

use serde::Deserialize;

use super::error::MatchSyncError;
use super::model::{ActiveFriend, FetchScope, SaltPayload};

const DEFAULT_BASE_URL: &str = "https://api.deadlock-api.com";
const POST_MAX_RETRIES: u32 = 5;
const POST_RETRY_DELAY: Duration = Duration::from_secs(3);

pub trait BackfillSource: Send + Sync {
  fn to_fetch(
    &self,
    scope: FetchScope,
  ) -> impl Future<Output = Result<Vec<u64>, MatchSyncError>> + Send;

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
}

impl Default for ApiClient {
  fn default() -> Self {
    Self {
      base_url: DEFAULT_BASE_URL.to_string(),
    }
  }
}

#[derive(Deserialize)]
struct SteamProfile {
  account_id: u32,
  #[serde(default)]
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

  // deadlock-api answers 404 for queries that match nothing, so that reads as empty.
  async fn get_list<T: serde::de::DeserializeOwned>(
    &self,
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
      let profiles: Vec<SteamProfile> = self.get_list(req).await?;
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
    self.get_list(client.get(url)).await
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

  async fn active_friends(&self, account_ids: &[u32]) -> Result<Vec<ActiveFriend>, MatchSyncError> {
    // One client for the whole batch, so the per-friend requests share connections.
    let client = self.client()?;
    let mut active = Vec::new();
    for account_id in self.recent_players(&client, account_ids).await? {
      let history = match self.stored_history(&client, account_id).await {
        Ok(history) => history,
        Err(e) => {
          log::warn!("match-sync: stored history of friend {account_id}: {e}");
          continue;
        }
      };
      let (Some(latest_match_id), Some(last_end)) = (
        history.iter().map(|m| m.match_id).max(),
        history
          .iter()
          .map(|m| m.start_time + m.match_duration_s)
          .max(),
      ) else {
        continue;
      };
      active.push(ActiveFriend {
        account_id,
        latest_match_id,
        last_end,
        starts: history.iter().map(|m| m.start_time).collect(),
      });
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
