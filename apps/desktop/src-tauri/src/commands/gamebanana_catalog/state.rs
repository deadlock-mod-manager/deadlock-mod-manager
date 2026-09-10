use crate::errors::Error;
use crate::providers::gamebanana::GameBananaClient;
use crate::providers::gamebanana::catalog::{Catalog, CatalogSync, SyncOutcome};
use std::path::Path;
use std::sync::{Arc, Mutex};
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
  cancellation: Mutex<CancellationToken>,
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
      cancellation: Mutex::new(CancellationToken::new()),
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
}
