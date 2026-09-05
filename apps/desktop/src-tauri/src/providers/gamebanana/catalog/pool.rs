use super::schema;
use crate::errors::Error;
use diesel::connection::SimpleConnection;
use diesel::r2d2::{ConnectionManager, CustomizeConnection, Pool};
use diesel::sqlite::SqliteConnection;
use std::path::Path;

type DieselPool = Pool<ConnectionManager<SqliteConnection>>;

#[derive(Clone)]
pub struct ConnectionPool {
  inner: DieselPool,
}

#[derive(Debug)]
struct SqliteCustomizer;

impl CustomizeConnection<SqliteConnection, diesel::r2d2::Error> for SqliteCustomizer {
  fn on_acquire(&self, connection: &mut SqliteConnection) -> Result<(), diesel::r2d2::Error> {
    connection
      .batch_execute(
        "PRAGMA foreign_keys = ON;
         PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA busy_timeout = 5000;",
      )
      .map_err(diesel::r2d2::Error::QueryError)
  }
}

impl ConnectionPool {
  pub async fn open(path: impl AsRef<Path>, size: usize) -> Result<Self, Error> {
    let max_size = u32::try_from(size)
      .ok()
      .filter(|size| *size > 0)
      .ok_or_else(|| {
        Error::Catalog("connection pool size must be greater than zero".to_string())
      })?;
    let path = path.as_ref().to_path_buf();
    if let Some(parent) = path.parent() {
      std::fs::create_dir_all(parent)
        .map_err(|error| Error::Catalog(format!("failed to create catalog directory: {error}")))?;
    }
    let database_url = path
      .to_str()
      .ok_or_else(|| Error::Catalog("catalog path is not valid UTF-8".to_string()))?
      .to_string();

    let inner = tokio::task::spawn_blocking(move || {
      Pool::builder()
        .max_size(max_size)
        .connection_customizer(Box::new(SqliteCustomizer))
        .build(ConnectionManager::<SqliteConnection>::new(database_url))
        .map_err(schema::catalog_error)
    })
    .await
    .map_err(|error| Error::Catalog(format!("catalog pool task failed: {error}")))??;
    let pool = Self { inner };
    pool.run(schema::migrate).await?;
    Ok(pool)
  }

  pub async fn run<T, F>(&self, operation: F) -> Result<T, Error>
  where
    T: Send + 'static,
    F: FnOnce(&mut SqliteConnection) -> Result<T, Error> + Send + 'static,
  {
    let pool = self.inner.clone();
    tokio::task::spawn_blocking(move || {
      let mut connection = pool.get().map_err(schema::catalog_error)?;
      operation(&mut connection)
    })
    .await
    .map_err(|error| Error::Catalog(format!("catalog task failed: {error}")))?
  }
}
