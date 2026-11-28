use crate::ingest_tool::error::IngestError;
use serde::Serialize;
use tokio::time::{Duration, sleep};

pub const CACHE_SCAN_USERNAME: &str = "Mod Manager (Cache)";
pub const LIVE_WATCHER_USERNAME: &str = "Mod Manager (Live)";
const DEADLOCK_API_URL: &str = "https://api.deadlock-api.com";
const REPORT_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Serialize, Debug, Clone, PartialEq, Eq, Hash)]
pub struct Salts {
  pub match_id: u64,
  pub cluster_id: u32,
  pub metadata_salt: Option<u32>,
  pub replay_salt: Option<u32>,
  pub username: String,
}

impl Salts {
  pub fn from_url(url: &str, username: &str) -> Option<Self> {
    // Expect URLs like: http://replay404.valve.net/1422450/37959196_937530290.meta.bz2 or http://replay183.valve.net/1422450/42476710_428480166.dem.bz2
    // Strip query parameters if present
    let base_url = url.split_once('?').map_or(url, |(path, _)| path);

    let (cluster_str, remaining) = base_url
      .strip_prefix("http://replay")?
      .split_once(".valve.net/")?;
    // remaining should be like "1422450/37959196_937530290.meta.bz2"
    let name = remaining.rsplit_once('/').map(|(_, name)| name)?;
    if name.ends_with(".meta.bz2") {
      let name = name.strip_suffix(".meta.bz2")?;
      let (match_str, salt_str) = name.split_once('_')?;

      Some(Self {
        cluster_id: cluster_str.parse().ok()?,
        match_id: match_str.parse().ok()?,
        metadata_salt: salt_str.parse().ok(),
        replay_salt: None,
        username: username.to_string(),
      })
    } else if name.ends_with(".dem.bz2") {
      let name = name.strip_suffix(".dem.bz2")?;
      let (match_str, salt_str) = name.split_once('_')?;

      Some(Self {
        cluster_id: cluster_str.parse().ok()?,
        match_id: match_str.parse().ok()?,
        replay_salt: salt_str.parse().ok(),
        metadata_salt: None,
        username: username.to_string(),
      })
    } else {
      None
    }
  }

  pub async fn ingest(&self) -> Result<(), IngestError> {
    let max_retries = 10;
    let mut attempt = 0;
    let client = crate::proxy::build_default_http_client()
      .map_err(|e| IngestError::FailedToIngest(e.to_string()))?;

    loop {
      attempt += 1;
      log::info!("Ingesting salts: {self:?} ({attempt}/{max_retries})");
      let response = client
        .post("https://api.deadlock-api.com/v1/matches/salts")
        .json(&[self])
        .send()
        .await
        .and_then(|r| r.error_for_status());

      match response {
        Ok(r) if r.status().is_success() => return Ok(()),
        Ok(resp) if attempt == max_retries => {
          let text = resp.text().await.unwrap_or_default();
          return Err(IngestError::FailedToIngest(text));
        }
        Err(e) if attempt == max_retries => {
          return Err(IngestError::RequestError(e));
        }
        Err(e) if e.status() == Some(reqwest::StatusCode::BAD_REQUEST) => {
          return Err(IngestError::RequestError(e));
        }
        _ => sleep(Duration::from_secs(3)).await, // Retry on error
      }
    }
  }

  pub async fn ingest_many(salts: &[Salts]) -> Result<(), IngestError> {
    let max_retries = 10;
    let mut attempt = 0;
    let client = crate::proxy::build_default_http_client()
      .map_err(|e| IngestError::FailedToIngest(e.to_string()))?;
    loop {
      attempt += 1;
      log::info!(
        "Ingesting {n} salts ({attempt}/{max_retries})",
        n = salts.len()
      );
      let response = client
        .post("https://api.deadlock-api.com/v1/matches/salts")
        .json(&salts)
        .send()
        .await
        .and_then(|r| r.error_for_status());

      match response {
        Ok(r) if r.status().is_success() => return Ok(()),
        Ok(resp) if attempt == max_retries => {
          let text = resp.text().await.unwrap_or_default();
          return Err(IngestError::FailedToIngest(text));
        }
        Err(e) if attempt == max_retries => {
          return Err(IngestError::RequestError(e));
        }
        Err(e) if e.status() == Some(reqwest::StatusCode::BAD_REQUEST) => {
          return Err(IngestError::RequestError(e));
        }
        _ => sleep(Duration::from_secs(3)).await, // Retry on error
      }
    }
  }
}

/// Asks deadlock-api for the match's metadata: a request for a match it doesn't know
/// queues the match for salts. The usual answer for a match that just ended is a 404.
pub async fn report_ended_match(match_id: u64) -> Result<(), IngestError> {
  let client = crate::proxy::build_default_http_client()
    .map_err(|e| IngestError::FailedToIngest(e.to_string()))?;
  report_ended_match_to(&client, DEADLOCK_API_URL, match_id).await
}

async fn report_ended_match_to(
  client: &reqwest::Client,
  base_url: &str,
  match_id: u64,
) -> Result<(), IngestError> {
  let response = client
    .get(format!("{base_url}/v1/matches/metadata"))
    .query(&[("match_ids", match_id)])
    .timeout(REPORT_TIMEOUT)
    .send()
    .await
    .map_err(IngestError::RequestError)?;
  if response.status() == reqwest::StatusCode::NOT_FOUND {
    return Ok(());
  }
  response
    .error_for_status()
    .map(|_| ())
    .map_err(IngestError::RequestError)
}

#[cfg(test)]
mod tests {
  use super::*;

  // Answers the first request on a local port with `status`, and returns the base URL.
  fn serve_once(status: &'static str) -> String {
    use std::io::{Read as _, Write as _};
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    std::thread::spawn(move || {
      let (mut stream, _) = listener.accept().unwrap();
      let _ = stream.read(&mut [0; 4096]);
      let response = format!("HTTP/1.1 {status}\r\ncontent-length: 0\r\nconnection: close\r\n\r\n");
      stream.write_all(response.as_bytes()).unwrap();
    });
    format!("http://{addr}")
  }

  #[tokio::test]
  async fn ended_match_reports_take_a_404_as_queued() {
    let client = reqwest::Client::builder().no_proxy().build().unwrap();
    let not_found = serve_once("404 Not Found");
    assert!(report_ended_match_to(&client, &not_found, 1).await.is_ok());
    let failing = serve_once("500 Internal Server Error");
    assert!(report_ended_match_to(&client, &failing, 1).await.is_err());
  }

  #[test]
  fn test_extract_salts() {
    #[allow(clippy::type_complexity)]
    let cases: &[(&str, u32, u64, Option<u32>, Option<u32>)] = &[
      (
        "http://replay404.valve.net/1422450/37959196_937530290.meta.bz2",
        404,
        37959196,
        Some(937530290),
        None,
      ),
      (
        "http://replay400.valve.net/1422450/38090632_88648761.meta.bz2",
        400,
        38090632,
        Some(88648761),
        None,
      ),
      (
        "http://replay183.valve.net/1422450/42476710_428480166.meta.bz2",
        183,
        42476710,
        Some(428480166),
        None,
      ),
      (
        "http://replay183.valve.net/1422450/42476710_428480166.dem.bz2",
        183,
        42476710,
        None,
        Some(428480166),
      ),
      (
        "http://replay404.valve.net/1422450/37959196_937530290.meta.bz2?v=2",
        404,
        37959196,
        Some(937530290),
        None,
      ),
      (
        "http://replay183.valve.net/1422450/42476710_428480166.dem.bz2?v=2",
        183,
        42476710,
        None,
        Some(428480166),
      ),
    ];

    for &(url, cluster_id, match_id, metadata_salt, replay_salt) in cases {
      let salts = Salts::from_url(url, "test").unwrap();
      assert_eq!(salts.cluster_id, cluster_id);
      assert_eq!(salts.match_id, match_id);
      assert_eq!(salts.metadata_salt, metadata_salt);
      assert_eq!(salts.replay_salt, replay_salt);
    }
  }
}
