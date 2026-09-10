use crate::errors::Error;
use crate::proxy;
use chrono::{DateTime, Utc};
use futures::StreamExt;
use reqwest::header::RETRY_AFTER;
use serde::de::DeserializeOwned;
use std::collections::VecDeque;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::{Mutex, Semaphore};
use tokio_util::sync::CancellationToken;

const USER_AGENT: &str = concat!("DMM/", env!("CARGO_PKG_VERSION"));

#[derive(Debug, Clone)]
pub struct TransportConfig {
  pub connect_timeout: Duration,
  pub total_timeout: Duration,
  pub max_concurrency: usize,
  pub max_requests_per_window: usize,
  pub request_window: Duration,
  pub max_retries: u32,
  pub base_retry_delay: Duration,
  pub max_retry_delay: Duration,
  pub max_response_bytes: usize,
}

impl Default for TransportConfig {
  fn default() -> Self {
    Self {
      connect_timeout: Duration::from_secs(10),
      total_timeout: Duration::from_secs(30),
      max_concurrency: 4,
      max_requests_per_window: 60,
      request_window: Duration::from_secs(60),
      max_retries: 3,
      base_retry_delay: Duration::from_millis(500),
      max_retry_delay: Duration::from_secs(30),
      max_response_bytes: 5 * 1024 * 1024,
    }
  }
}

pub struct GameBananaTransport {
  client: reqwest::Client,
  concurrency: Arc<Semaphore>,
  budget: Arc<RequestBudget>,
  config: TransportConfig,
}

impl GameBananaTransport {
  pub fn new(config: TransportConfig) -> Result<Self, Error> {
    if config.max_concurrency == 0 || config.max_requests_per_window == 0 {
      return Err(Error::ProviderInvalidResponse(
        "request limits must be greater than zero".to_string(),
      ));
    }

    let client = proxy::build_http_client(|builder| {
      builder
        .user_agent(USER_AGENT)
        .connect_timeout(config.connect_timeout)
        .timeout(config.total_timeout)
        .redirect(reqwest::redirect::Policy::limited(3))
    })?;

    Ok(Self {
      client,
      concurrency: Arc::new(Semaphore::new(config.max_concurrency)),
      budget: Arc::new(RequestBudget::new(
        config.max_requests_per_window,
        config.request_window,
      )),
      config,
    })
  }

  pub async fn get_json<T>(
    &self,
    operation: &'static str,
    url: reqwest::Url,
    cancel: &CancellationToken,
  ) -> Result<T, Error>
  where
    T: DeserializeOwned,
  {
    for attempt in 0..=self.config.max_retries {
      self.budget.acquire(cancel).await?;
      let permit = tokio::select! {
        _ = cancel.cancelled() => return Err(Error::ProviderCancelled),
        permit = self.concurrency.clone().acquire_owned() => {
          permit.map_err(|_| Error::ProviderUnavailable("request limiter closed".to_string()))?
        }
      };

      let response = tokio::select! {
        _ = cancel.cancelled() => return Err(Error::ProviderCancelled),
        response = self.client.get(url.clone()).send() => {
          response.map_err(|error| Error::ProviderUnavailable(error_without_url(&error)))?
        }
      };
      let status = response.status();

      if status == reqwest::StatusCode::FORBIDDEN {
        return Err(Error::ProviderRefused);
      }

      if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        let retry_after = response
          .headers()
          .get(RETRY_AFTER)
          .and_then(|value| value.to_str().ok())
          .and_then(parse_retry_after)
          .unwrap_or_else(|| retry_delay(&self.config, attempt));
        drop(permit);
        if retry_after > self.config.max_retry_delay || attempt == self.config.max_retries {
          return Err(Error::ProviderRateLimited {
            retry_after_secs: retry_after.as_secs().max(1),
          });
        }
        wait_or_cancel(retry_after, cancel).await?;
        continue;
      }

      if status.is_server_error() {
        drop(permit);
        if attempt == self.config.max_retries {
          return Err(Error::ProviderUnavailable(format!(
            "{operation} failed with HTTP {status}"
          )));
        }
        wait_or_cancel(retry_delay(&self.config, attempt), cancel).await?;
        continue;
      }

      if !status.is_success() {
        return Err(Error::ProviderInvalidResponse(format!(
          "{operation} failed with HTTP {status}"
        )));
      }

      if response
        .content_length()
        .is_some_and(|size| size > self.config.max_response_bytes as u64)
      {
        return Err(Error::ProviderResponseTooLarge {
          limit: self.config.max_response_bytes,
        });
      }

      let mut body = Vec::new();
      let mut stream = response.bytes_stream();
      while let Some(chunk) = tokio::select! {
        _ = cancel.cancelled() => return Err(Error::ProviderCancelled),
        chunk = stream.next() => chunk,
      } {
        let chunk = chunk.map_err(|error| Error::ProviderUnavailable(error_without_url(&error)))?;
        if body.len().saturating_add(chunk.len()) > self.config.max_response_bytes {
          return Err(Error::ProviderResponseTooLarge {
            limit: self.config.max_response_bytes,
          });
        }
        body.extend_from_slice(&chunk);
      }
      drop(permit);

      return serde_json::from_slice(&body)
        .map_err(|error| Error::ProviderInvalidResponse(error.to_string()));
    }

    Err(Error::ProviderUnavailable(format!(
      "{operation} exhausted its retry budget"
    )))
  }
}

struct RequestBudget {
  limit: usize,
  window: Duration,
  requests: Mutex<VecDeque<Instant>>,
}

impl RequestBudget {
  fn new(limit: usize, window: Duration) -> Self {
    Self {
      limit,
      window,
      requests: Mutex::new(VecDeque::with_capacity(limit)),
    }
  }

  async fn acquire(&self, cancel: &CancellationToken) -> Result<(), Error> {
    loop {
      let wait = {
        let now = Instant::now();
        let mut requests = self.requests.lock().await;
        while requests
          .front()
          .is_some_and(|timestamp| now.duration_since(*timestamp) >= self.window)
        {
          requests.pop_front();
        }

        if requests.len() < self.limit {
          requests.push_back(now);
          return Ok(());
        }

        requests
          .front()
          .map(|timestamp| self.window.saturating_sub(now.duration_since(*timestamp)))
          .unwrap_or_default()
      };

      wait_or_cancel(wait, cancel).await?;
    }
  }
}

fn retry_delay(config: &TransportConfig, attempt: u32) -> Duration {
  let multiplier = 1u32.checked_shl(attempt.min(16)).unwrap_or(u32::MAX);
  let exponential = config
    .base_retry_delay
    .saturating_mul(multiplier)
    .min(config.max_retry_delay);
  let jitter_ceiling = config.base_retry_delay.as_millis().max(1) as u64;
  let jitter_seed = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .subsec_nanos() as u64;
  exponential
    .saturating_add(Duration::from_millis(jitter_seed % jitter_ceiling))
    .min(config.max_retry_delay)
}

fn parse_retry_after(value: &str) -> Option<Duration> {
  if let Ok(seconds) = value.trim().parse::<u64>() {
    return Some(Duration::from_secs(seconds));
  }

  let deadline = DateTime::parse_from_rfc2822(value)
    .ok()?
    .with_timezone(&Utc);
  let seconds = deadline.signed_duration_since(Utc::now()).num_seconds();
  Some(Duration::from_secs(seconds.max(0) as u64))
}

async fn wait_or_cancel(duration: Duration, cancel: &CancellationToken) -> Result<(), Error> {
  tokio::select! {
    _ = cancel.cancelled() => Err(Error::ProviderCancelled),
    _ = tokio::time::sleep(duration) => Ok(()),
  }
}

fn error_without_url(error: &reqwest::Error) -> String {
  if error.is_timeout() {
    "request timed out".to_string()
  } else if error.is_connect() {
    "connection failed".to_string()
  } else if error.is_decode() {
    "response decoding failed".to_string()
  } else {
    "request failed".to_string()
  }
}

#[cfg(test)]
mod tests {
  use super::{
    GameBananaTransport, RequestBudget, TransportConfig, parse_retry_after, retry_delay,
  };
  use crate::errors::Error;
  use serde_json::Value;
  use std::sync::Arc;
  use std::time::Duration;
  use tokio::io::{AsyncReadExt, AsyncWriteExt};
  use tokio::net::TcpListener;
  use tokio_util::sync::CancellationToken;

  #[test]
  fn retry_after_supports_seconds_and_http_dates() {
    assert_eq!(parse_retry_after("12"), Some(Duration::from_secs(12)));
    assert_eq!(
      parse_retry_after("Wed, 21 Oct 2015 07:28:00 GMT"),
      Some(Duration::ZERO)
    );
    assert_eq!(parse_retry_after("soon"), None);
  }

  #[test]
  fn exponential_backoff_is_jittered_but_capped() {
    let config = TransportConfig {
      base_retry_delay: Duration::from_millis(100),
      max_retry_delay: Duration::from_millis(450),
      ..TransportConfig::default()
    };

    assert!(
      (Duration::from_millis(100)..Duration::from_millis(200)).contains(&retry_delay(&config, 0))
    );
    assert!(
      (Duration::from_millis(200)..Duration::from_millis(300)).contains(&retry_delay(&config, 1))
    );
    assert_eq!(retry_delay(&config, 8), Duration::from_millis(450));
  }

  #[tokio::test]
  async fn cancelled_budget_wait_stops_without_consuming_another_slot() {
    let budget = Arc::new(RequestBudget::new(1, Duration::from_secs(60)));
    let cancel = CancellationToken::new();
    budget.acquire(&cancel).await.unwrap();

    let waiting_budget = Arc::clone(&budget);
    let waiting_cancel = cancel.clone();
    let waiter = tokio::spawn(async move { waiting_budget.acquire(&waiting_cancel).await });
    cancel.cancel();

    assert!(matches!(
      waiter.await.unwrap(),
      Err(crate::errors::Error::ProviderCancelled)
    ));
  }

  #[tokio::test]
  async fn maps_provider_statuses_without_exposing_response_bodies() {
    let config = TransportConfig {
      max_retries: 0,
      ..TransportConfig::default()
    };
    let transport = GameBananaTransport::new(config).unwrap();
    let cancel = CancellationToken::new();

    let forbidden = serve_once("HTTP/1.1 403 Forbidden\r\nContent-Length: 6\r\n\r\nsecret").await;
    let result = transport
      .get_json::<Value>("profile", forbidden, &cancel)
      .await;
    assert!(matches!(result, Err(Error::ProviderRefused)), "{result:?}");

    let limited =
      serve_once("HTTP/1.1 429 Too Many Requests\r\nRetry-After: 7\r\nContent-Length: 0\r\n\r\n")
        .await;
    let result = transport
      .get_json::<Value>("profile", limited, &cancel)
      .await;
    assert!(matches!(
      result,
      Err(Error::ProviderRateLimited {
        retry_after_secs: 7
      })
    ));

    let unavailable =
      serve_once("HTTP/1.1 503 Service Unavailable\r\nContent-Length: 9\r\n\r\nsensitive").await;
    let result = transport
      .get_json::<Value>("profile", unavailable, &cancel)
      .await;
    assert!(
      matches!(result, Err(Error::ProviderUnavailable(message)) if !message.contains("sensitive"))
    );
  }

  #[tokio::test]
  async fn does_not_wait_for_retry_after_beyond_the_configured_limit() {
    let config = TransportConfig {
      max_retries: 1,
      max_retry_delay: Duration::from_secs(1),
      ..TransportConfig::default()
    };
    let transport = GameBananaTransport::new(config).unwrap();
    let cancel = CancellationToken::new();
    let limited = serve_once(
      "HTTP/1.1 429 Too Many Requests\r\nRetry-After: 120\r\nContent-Length: 0\r\n\r\n",
    )
    .await;

    let result = transport
      .get_json::<Value>("profile", limited, &cancel)
      .await;

    assert!(matches!(
      result,
      Err(Error::ProviderRateLimited {
        retry_after_secs: 120
      })
    ));
  }

  #[tokio::test]
  async fn rejects_invalid_or_oversized_responses() {
    let config = TransportConfig {
      max_retries: 0,
      max_response_bytes: 4,
      ..TransportConfig::default()
    };
    let transport = GameBananaTransport::new(config).unwrap();
    let cancel = CancellationToken::new();

    let oversized = serve_once("HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\n12345").await;
    let result = transport
      .get_json::<Value>("profile", oversized, &cancel)
      .await;
    assert!(
      matches!(result, Err(Error::ProviderResponseTooLarge { limit: 4 })),
      "{result:?}"
    );

    let invalid = serve_once("HTTP/1.1 200 OK\r\nContent-Length: 4\r\n\r\nnope").await;
    let result = transport
      .get_json::<Value>("profile", invalid, &cancel)
      .await;
    assert!(matches!(result, Err(Error::ProviderInvalidResponse(_))));
  }

  async fn serve_once(response: &'static str) -> reqwest::Url {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move {
      let (mut stream, _) = listener.accept().await.unwrap();
      let mut request = Vec::new();
      while !request.windows(4).any(|window| window == b"\r\n\r\n") {
        let mut chunk = [0; 256];
        let read = stream.read(&mut chunk).await.unwrap();
        if read == 0 {
          break;
        }
        request.extend_from_slice(&chunk[..read]);
      }
      stream.write_all(response.as_bytes()).await.unwrap();
      stream.shutdown().await.unwrap();
    });

    reqwest::Url::parse(&format!("http://{address}/fixture")).unwrap()
  }
}
