use super::pool::ConnectionPool;
use super::schema::{submission, sync_cursor, sync_state};
use crate::errors::Error;
use crate::providers::{SubmissionProvider, SubmissionRef, SubmissionType};
use diesel::OptionalExtension;
use diesel::prelude::*;
use diesel::sqlite::Sqlite;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogRecord {
  pub submission: SubmissionRef,
  pub name: String,
  pub author: String,
  pub description: String,
  pub profile_url: String,
  pub category: String,
  pub hero: Option<String>,
  pub is_audio: bool,
  pub is_map: bool,
  pub is_nsfw: bool,
  pub is_obsolete: bool,
  pub is_tombstoned: bool,
  pub is_hydrated: bool,
  pub has_files: bool,
  pub download_count: u64,
  pub likes: u64,
  pub remote_added_at: i64,
  pub remote_updated_at: i64,
  pub files_updated_at: i64,
  pub last_seen_snapshot: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncCursor {
  pub next_page: u32,
  pub snapshot_id: Option<String>,
  pub snapshot_complete: bool,
  pub high_water_mark: i64,
}

#[derive(Clone)]
pub struct Catalog {
  pub(super) pool: ConnectionPool,
}

#[derive(Debug, Clone, Queryable, Selectable, Identifiable, Insertable, AsChangeset)]
#[diesel(
  table_name = submission,
  primary_key(provider, submission_type, submission_id),
  treat_none_as_null = true,
  check_for_backend(Sqlite)
)]
pub(super) struct SubmissionRow {
  pub provider: String,
  pub submission_type: String,
  pub submission_id: String,
  pub slug: String,
  pub name: String,
  pub author: String,
  pub description: String,
  pub profile_url: String,
  pub category: String,
  pub hero: Option<String>,
  pub is_audio: bool,
  pub is_map: bool,
  pub is_nsfw: bool,
  pub is_obsolete: bool,
  pub is_tombstoned: bool,
  pub is_hydrated: bool,
  pub has_files: bool,
  pub download_count: i64,
  pub likes: i64,
  pub remote_added_at: i64,
  pub remote_updated_at: i64,
  pub files_updated_at: i64,
  pub last_seen_snapshot: Option<String>,
}

#[derive(Debug, Clone, Queryable, Selectable, Identifiable, Insertable, AsChangeset)]
#[diesel(table_name = sync_cursor, primary_key(submission_type), treat_none_as_null = true)]
struct SyncCursorRow {
  submission_type: String,
  next_page: i64,
  snapshot_id: Option<String>,
  snapshot_complete: bool,
  high_water_mark: i64,
}

#[derive(Debug, Insertable, AsChangeset)]
#[diesel(table_name = sync_state)]
struct SyncStateRow {
  key: String,
  value: String,
}

#[cfg(test)]
#[derive(QueryableByName)]
struct SlugRow {
  #[diesel(sql_type = diesel::sql_types::Text)]
  slug: String,
}

impl Catalog {
  pub async fn open(path: impl AsRef<Path>, pool_size: usize) -> Result<Self, Error> {
    Ok(Self {
      pool: ConnectionPool::open(path, pool_size).await?,
    })
  }

  pub async fn upsert_page(
    &self,
    records: Vec<CatalogRecord>,
    submission_type: SubmissionType,
    next_page: u32,
    snapshot_id: Option<String>,
    snapshot_complete: bool,
  ) -> Result<(), Error> {
    self
      .pool
      .run(move |connection| {
        connection.transaction::<_, Error, _>(|connection| {
          for record in records {
            upsert_record(connection, record)?;
          }
          let cursor = SyncCursorRow {
            submission_type: submission_type_name(submission_type).to_string(),
            next_page: i64::from(next_page),
            snapshot_id,
            snapshot_complete,
            high_water_mark: 0,
          };
          diesel::insert_into(sync_cursor::table)
            .values(&cursor)
            .on_conflict(sync_cursor::submission_type)
            .do_update()
            .set((
              sync_cursor::next_page.eq(cursor.next_page),
              sync_cursor::snapshot_id.eq(&cursor.snapshot_id),
              sync_cursor::snapshot_complete.eq(cursor.snapshot_complete),
            ))
            .execute(connection)?;
          Ok(())
        })
      })
      .await
  }

  pub async fn cursor(&self, submission_type: SubmissionType) -> Result<SyncCursor, Error> {
    self
      .pool
      .run(move |connection| {
        let row = sync_cursor::table
          .find(submission_type_name(submission_type))
          .select(SyncCursorRow::as_select())
          .first(connection)
          .optional()?;
        row.map(SyncCursor::try_from).transpose().map(|cursor| {
          cursor.unwrap_or(SyncCursor {
            next_page: 1,
            snapshot_id: None,
            snapshot_complete: false,
            high_water_mark: 0,
          })
        })
      })
      .await
  }

  pub async fn complete_snapshot(&self, snapshot_id: String) -> Result<usize, Error> {
    self
      .pool
      .run(move |connection| {
        connection.transaction::<_, Error, _>(|connection| {
          let tombstoned = diesel::update(
            submission::table
              .filter(submission::is_tombstoned.eq(false))
              .filter(
                submission::last_seen_snapshot
                  .is_null()
                  .or(submission::last_seen_snapshot.ne(&snapshot_id)),
              ),
          )
          .set(submission::is_tombstoned.eq(true))
          .execute(connection)?;
          diesel::update(sync_cursor::table)
            .set((
              sync_cursor::next_page.eq(1_i64),
              sync_cursor::snapshot_id.eq(Option::<String>::None),
              sync_cursor::snapshot_complete.eq(false),
            ))
            .execute(connection)?;
          Ok(tombstoned)
        })
      })
      .await
  }

  pub async fn count_visible(&self) -> Result<u64, Error> {
    self
      .pool
      .run(|connection| {
        let count = submission::table
          .filter(submission::is_tombstoned.eq(false))
          .count()
          .get_result::<i64>(connection)?;
        u64::try_from(count).map_err(|_| Error::Catalog("catalog count was negative".to_string()))
      })
      .await
  }

  pub async fn upsert_records(&self, records: Vec<CatalogRecord>) -> Result<(), Error> {
    self
      .pool
      .run(move |connection| {
        connection.transaction::<_, Error, _>(|connection| {
          for record in records {
            upsert_record(connection, record)?;
          }
          Ok(())
        })
      })
      .await
  }

  pub async fn set_high_water_mark(
    &self,
    submission_type: SubmissionType,
    high_water_mark: i64,
  ) -> Result<(), Error> {
    self
      .pool
      .run(move |connection| {
        let submission_type = submission_type_name(submission_type).to_string();
        let existing = sync_cursor::table
          .find(&submission_type)
          .select(SyncCursorRow::as_select())
          .first::<SyncCursorRow>(connection)
          .optional()?;
        let cursor = existing
          .map(|mut cursor| {
            cursor.high_water_mark = cursor.high_water_mark.max(high_water_mark);
            cursor
          })
          .unwrap_or(SyncCursorRow {
            submission_type,
            next_page: 1,
            snapshot_id: None,
            snapshot_complete: false,
            high_water_mark,
          });
        diesel::insert_into(sync_cursor::table)
          .values(&cursor)
          .on_conflict(sync_cursor::submission_type)
          .do_update()
          .set(sync_cursor::high_water_mark.eq(cursor.high_water_mark))
          .execute(connection)?;
        Ok(())
      })
      .await
  }

  pub async fn state(&self, key: &'static str) -> Result<Option<String>, Error> {
    self
      .pool
      .run(move |connection| {
        sync_state::table
          .find(key)
          .select(sync_state::value)
          .first(connection)
          .optional()
          .map_err(Error::from)
      })
      .await
  }

  pub async fn set_state(&self, key: &'static str, value: String) -> Result<(), Error> {
    self
      .pool
      .run(move |connection| {
        let state = SyncStateRow {
          key: key.to_string(),
          value,
        };
        diesel::insert_into(sync_state::table)
          .values(&state)
          .on_conflict(sync_state::key)
          .do_update()
          .set(sync_state::value.eq(&state.value))
          .execute(connection)?;
        Ok(())
      })
      .await
  }

  pub async fn invalidate_sync_state(&self) -> Result<(), Error> {
    self
      .pool
      .run(|connection| {
        connection.transaction::<_, Error, _>(|connection| {
          diesel::delete(sync_state::table).execute(connection)?;
          diesel::update(sync_cursor::table)
            .set((
              sync_cursor::next_page.eq(1_i64),
              sync_cursor::snapshot_id.eq(Option::<String>::None),
              sync_cursor::snapshot_complete.eq(false),
              sync_cursor::high_water_mark.eq(0_i64),
            ))
            .execute(connection)?;
          Ok(())
        })
      })
      .await
  }

  #[cfg(test)]
  pub async fn search_slugs(&self, query: String) -> Result<Vec<String>, Error> {
    self
      .pool
      .run(move |connection| {
        diesel::sql_query(
          "SELECT submission.slug
           FROM submission_fts
           JOIN submission USING(provider, submission_type, submission_id)
           WHERE submission_fts MATCH ? AND submission.is_tombstoned = 0
           ORDER BY submission.slug",
        )
        .bind::<diesel::sql_types::Text, _>(query)
        .load::<SlugRow>(connection)
        .map(|rows| rows.into_iter().map(|row| row.slug).collect())
        .map_err(Error::from)
      })
      .await
  }
}

impl SubmissionRow {
  fn from_record(record: CatalogRecord) -> Result<Self, Error> {
    let slug = record.submission.to_slug();
    Ok(Self {
      provider: provider_name(record.submission.provider).to_string(),
      submission_type: submission_type_name(record.submission.submission_type).to_string(),
      submission_id: record.submission.submission_id,
      slug,
      name: record.name,
      author: record.author,
      description: record.description,
      profile_url: record.profile_url,
      category: record.category,
      hero: record.hero,
      is_audio: record.is_audio,
      is_map: record.is_map,
      is_nsfw: record.is_nsfw,
      is_obsolete: record.is_obsolete,
      is_tombstoned: record.is_tombstoned,
      is_hydrated: record.is_hydrated,
      has_files: record.has_files,
      download_count: i64::try_from(record.download_count)
        .map_err(|_| Error::Catalog("download count exceeds SQLite range".to_string()))?,
      likes: i64::try_from(record.likes)
        .map_err(|_| Error::Catalog("like count exceeds SQLite range".to_string()))?,
      remote_added_at: record.remote_added_at,
      remote_updated_at: record.remote_updated_at,
      files_updated_at: record.files_updated_at,
      last_seen_snapshot: record.last_seen_snapshot,
    })
  }

  fn merge(self, incoming: Self) -> Self {
    let hydrated = incoming.is_hydrated;
    Self {
      provider: incoming.provider,
      submission_type: incoming.submission_type,
      submission_id: incoming.submission_id,
      slug: incoming.slug,
      name: incoming.name,
      author: incoming.author,
      description: if hydrated {
        incoming.description
      } else {
        self.description
      },
      profile_url: incoming.profile_url,
      category: if hydrated {
        incoming.category
      } else {
        self.category
      },
      hero: if hydrated { incoming.hero } else { self.hero },
      is_audio: incoming.is_audio,
      is_map: if hydrated {
        incoming.is_map
      } else {
        self.is_map
      },
      is_nsfw: if hydrated {
        incoming.is_nsfw
      } else {
        self.is_nsfw
      },
      is_obsolete: incoming.is_obsolete,
      is_tombstoned: false,
      is_hydrated: self.is_hydrated || hydrated,
      has_files: incoming.has_files,
      download_count: if hydrated {
        incoming.download_count
      } else {
        self.download_count
      },
      likes: self.likes.max(incoming.likes),
      remote_added_at: incoming.remote_added_at,
      remote_updated_at: self.remote_updated_at.max(incoming.remote_updated_at),
      files_updated_at: self.files_updated_at.max(incoming.files_updated_at),
      last_seen_snapshot: incoming.last_seen_snapshot.or(self.last_seen_snapshot),
    }
  }
}

impl TryFrom<SyncCursorRow> for SyncCursor {
  type Error = Error;

  fn try_from(row: SyncCursorRow) -> Result<Self, Self::Error> {
    Ok(Self {
      next_page: u32::try_from(row.next_page)
        .map_err(|_| Error::Catalog("catalog cursor page is out of range".to_string()))?,
      snapshot_id: row.snapshot_id,
      snapshot_complete: row.snapshot_complete,
      high_water_mark: row.high_water_mark,
    })
  }
}

fn upsert_record(
  connection: &mut diesel::sqlite::SqliteConnection,
  record: CatalogRecord,
) -> Result<(), Error> {
  let incoming = SubmissionRow::from_record(record)?;
  let existing = submission::table
    .find((
      &incoming.provider,
      &incoming.submission_type,
      &incoming.submission_id,
    ))
    .select(SubmissionRow::as_select())
    .first::<SubmissionRow>(connection)
    .optional()?;
  let row = existing
    .map(|existing| existing.merge(incoming.clone()))
    .unwrap_or(incoming);
  diesel::insert_into(submission::table)
    .values(&row)
    .on_conflict((
      submission::provider,
      submission::submission_type,
      submission::submission_id,
    ))
    .do_update()
    .set(&row)
    .execute(connection)?;
  Ok(())
}

pub(super) fn provider_name(provider: SubmissionProvider) -> &'static str {
  match provider {
    SubmissionProvider::Gamebanana => "gamebanana",
    SubmissionProvider::Local => "local",
  }
}

pub(super) fn submission_type_name(submission_type: SubmissionType) -> &'static str {
  match submission_type {
    SubmissionType::Mod => "mod",
    SubmissionType::Sound => "sound",
  }
}

#[cfg(test)]
mod tests {
  use super::{Catalog, CatalogRecord};
  use crate::providers::SubmissionRef;
  use tempfile::tempdir;

  fn record(slug: &str, name: &str, snapshot: &str) -> CatalogRecord {
    CatalogRecord {
      submission: SubmissionRef::parse_slug(slug).unwrap(),
      name: name.to_string(),
      author: "DMM".to_string(),
      description: "searchable catalog text".to_string(),
      profile_url: format!("https://gamebanana.com/mods/{slug}"),
      category: "Skins".to_string(),
      hero: None,
      is_audio: false,
      is_map: false,
      is_nsfw: false,
      is_obsolete: false,
      is_tombstoned: false,
      is_hydrated: true,
      has_files: true,
      download_count: 10,
      likes: 2,
      remote_added_at: 100,
      remote_updated_at: 200,
      files_updated_at: 0,
      last_seen_snapshot: Some(snapshot.to_string()),
    }
  }

  #[tokio::test]
  async fn page_commit_updates_cursor_and_fts_atomically() {
    let directory = tempdir().unwrap();
    let catalog = Catalog::open(directory.path().join("catalog.sqlite3"), 2)
      .await
      .unwrap();

    catalog
      .upsert_page(
        vec![record("42", "Pink Drifter", "snapshot-a")],
        crate::providers::SubmissionType::Mod,
        2,
        Some("snapshot-a".to_string()),
        false,
      )
      .await
      .unwrap();

    assert_eq!(catalog.count_visible().await.unwrap(), 1);
    assert_eq!(
      catalog
        .search_slugs("searchable".to_string())
        .await
        .unwrap(),
      vec!["42"]
    );
    assert_eq!(
      catalog
        .cursor(crate::providers::SubmissionType::Mod)
        .await
        .unwrap()
        .next_page,
      2
    );
  }

  #[tokio::test]
  async fn only_completed_snapshots_tombstone_unseen_rows() {
    let directory = tempdir().unwrap();
    let catalog = Catalog::open(directory.path().join("catalog.sqlite3"), 1)
      .await
      .unwrap();
    catalog
      .upsert_page(
        vec![
          record("1", "Seen once", "snapshot-a"),
          record("2", "Will remain", "snapshot-a"),
        ],
        crate::providers::SubmissionType::Mod,
        2,
        Some("snapshot-a".to_string()),
        false,
      )
      .await
      .unwrap();

    catalog
      .upsert_page(
        vec![record("2", "Will remain", "snapshot-b")],
        crate::providers::SubmissionType::Mod,
        2,
        Some("snapshot-b".to_string()),
        false,
      )
      .await
      .unwrap();
    assert_eq!(catalog.count_visible().await.unwrap(), 2);

    assert_eq!(
      catalog
        .complete_snapshot("snapshot-b".to_string())
        .await
        .unwrap(),
      1
    );
    assert_eq!(catalog.count_visible().await.unwrap(), 1);
  }

  #[tokio::test]
  async fn mod_and_sound_numeric_ids_do_not_collide() {
    let directory = tempdir().unwrap();
    let catalog = Catalog::open(directory.path().join("catalog.sqlite3"), 1)
      .await
      .unwrap();
    let mut sound = record("snd-42", "Sound", "snapshot-a");
    sound.is_audio = true;
    sound.profile_url = "https://gamebanana.com/sounds/42".to_string();

    catalog
      .upsert_page(
        vec![record("42", "Mod", "snapshot-a")],
        crate::providers::SubmissionType::Mod,
        2,
        Some("snapshot-a".to_string()),
        true,
      )
      .await
      .unwrap();
    catalog
      .upsert_page(
        vec![sound],
        crate::providers::SubmissionType::Sound,
        2,
        Some("snapshot-a".to_string()),
        true,
      )
      .await
      .unwrap();

    assert_eq!(catalog.count_visible().await.unwrap(), 2);
  }
}
