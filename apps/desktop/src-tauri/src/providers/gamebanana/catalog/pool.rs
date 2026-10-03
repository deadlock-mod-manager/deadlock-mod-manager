use super::schema;
use crate::errors::Error;
use diesel::Connection;
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
        "PRAGMA busy_timeout = 5000;
         PRAGMA foreign_keys = ON;
         PRAGMA synchronous = NORMAL;",
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
      // WAL changes file-level state. Initialize it and the schema before the
      // pool opens connections concurrently, or fresh catalogs can lock during
      // connection acquisition before their busy timeout has been installed.
      let mut initial =
        SqliteConnection::establish(&database_url).map_err(schema::catalog_error)?;
      initial
        .batch_execute("PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;")
        .map_err(schema::catalog_error)?;
      schema::migrate(&mut initial)?;
      Pool::builder()
        .max_size(max_size)
        .connection_customizer(Box::new(SqliteCustomizer))
        .build(ConnectionManager::<SqliteConnection>::new(database_url))
        .map_err(schema::catalog_error)
    })
    .await
    .map_err(|error| Error::Catalog(format!("catalog pool task failed: {error}")))??;
    Ok(Self { inner })
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

#[cfg(test)]
mod tests {
  use super::ConnectionPool;
  use crate::errors::Error;
  use diesel::RunQueryDsl;
  use diesel::sql_query;
  use tempfile::tempdir;

  #[derive(diesel::QueryableByName)]
  struct JournalMode {
    #[diesel(sql_type = diesel::sql_types::Text)]
    journal_mode: String,
  }

  #[tokio::test]
  async fn fresh_catalogs_initialize_before_opening_pooled_connections() {
    let directory = tempdir().unwrap();
    for index in 0..8 {
      let pool = ConnectionPool::open(directory.path().join(format!("catalog-{index}.sqlite3")), 4)
        .await
        .unwrap();
      let mode = pool
        .run(|connection| {
          sql_query("PRAGMA journal_mode")
            .get_result::<JournalMode>(connection)
            .map(|result| result.journal_mode)
            .map_err(|error| Error::Catalog(error.to_string()))
        })
        .await
        .unwrap();
      assert_eq!(mode, "wal");
    }
  }
}
