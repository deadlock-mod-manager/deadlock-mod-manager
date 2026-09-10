use super::types::{GameBananaFileserverDto, GameBananaFileserverStatsDto};
use crate::errors::Error;
use crate::providers::gamebanana::GameBananaClient;
use crate::providers::gamebanana::catalog::{Catalog, CatalogSync, SyncOutcome};
use std::path::Path;
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{Duration, Instant};
use tokio_util::sync::CancellationToken;

#[derive(Clone)]
pub struct GameBananaCatalogState {
  inner: CatalogStateInner,
}

#[derive(Clone)]
enum CatalogStateInner {
  Ready(Arc<CatalogBackend>),
  Unavailable(Arc<str>),
}

pub struct CatalogBackend {
  pub catalog: Catalog,
  pub client: GameBananaClient,
  sync: CatalogSync,
  cancellation: StdMutex<CancellationToken>,
  fileservers: tokio::sync::Mutex<Option<CachedFileservers>>,
}

struct CachedFileservers {
  loaded_at: Instant,
  values: Vec<GameBananaFileserverDto>,
}

impl GameBananaCatalogState {
  pub async fn open(path: impl AsRef<Path>) -> Self {
    match Self::try_open(path).await {
      Ok(backend) => Self {
        inner: CatalogStateInner::Ready(Arc::new(backend)),
      },
      Err(error) => {
        log::warn!("GameBanana catalog unavailable: {error}");
        Self {
          inner: CatalogStateInner::Unavailable(Arc::from(error.to_string())),
        }
      }
    }
  }

  async fn try_open(path: impl AsRef<Path>) -> Result<CatalogBackend, Error> {
    let catalog = Catalog::open(path, 2).await?;
    let client = GameBananaClient::new()?;
    let sync = CatalogSync::new(catalog.clone(), client.clone());
    Ok(CatalogBackend {
      catalog,
      client,
      sync,
      cancellation: StdMutex::new(CancellationToken::new()),
      fileservers: tokio::sync::Mutex::new(None),
    })
  }

  pub fn backend(&self) -> Result<Arc<CatalogBackend>, Error> {
    match &self.inner {
      CatalogStateInner::Ready(backend) => Ok(Arc::clone(backend)),
      CatalogStateInner::Unavailable(reason) => Err(Error::Catalog(reason.to_string())),
    }
  }

  pub fn unavailable_reason(&self) -> Option<String> {
    match &self.inner {
      CatalogStateInner::Ready(_) => None,
      CatalogStateInner::Unavailable(reason) => Some(reason.to_string()),
    }
  }
}

impl CatalogBackend {
  pub async fn synchronize(
    &self,
    force_refresh: bool,
    force_reconcile: bool,
  ) -> Result<SyncOutcome, Error> {
    let cancellation = {
      let mut current = self
        .cancellation
        .lock()
        .map_err(|error| Error::Catalog(format!("sync cancellation lock failed: {error}")))?;
      current.cancel();
      *current = CancellationToken::new();
      current.clone()
    };
    self
      .sync
      .synchronize(force_refresh, force_reconcile, &cancellation)
      .await
  }

  pub async fn fileservers(&self, force: bool) -> Result<Vec<GameBananaFileserverDto>, Error> {
    const TTL: Duration = Duration::from_secs(6 * 60 * 60);
    let mut cache = self.fileservers.lock().await;
    if !force
      && let Some(cached) = cache.as_ref()
      && cached.loaded_at.elapsed() < TTL
    {
      return Ok(cached.values.clone());
    }
    let page = self.client.fileservers(&CancellationToken::new()).await?;
    let values = page
      .records
      .into_iter()
      .filter(|record| {
        !record.domain.is_empty()
          && record
            .domain
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
      })
      .map(|record| {
        let domain = format!("{}.gamebanana.com", record.domain);
        let stats = record.stats.hour.map(|stats| GameBananaFileserverStatsDto {
          rate_bytes: stats.rate.max(0.0).floor() as u64,
          requests_per_hour: stats.requests,
        });
        GameBananaFileserverDto {
          id: record.id.to_string(),
          provider: "gamebanana".to_string(),
          domain: domain.clone(),
          name: record.domain,
          state: match record.state.as_str() {
            "up" => "up",
            "terminated" => "terminated",
            _ => "down",
          }
          .to_string(),
          url_template: format!("https://{domain}/{{category}}/{{filename}}"),
          stats,
        }
      })
      .collect::<Vec<_>>();
    *cache = Some(CachedFileservers {
      loaded_at: Instant::now(),
      values: values.clone(),
    });
    Ok(values)
  }
}
