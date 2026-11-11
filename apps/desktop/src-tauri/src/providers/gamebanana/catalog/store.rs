use super::categories::{
  CATEGORY_TAXONOMY, CatalogCategory, CategoryTaxonomy, decode_category_path,
};
use super::pool::ConnectionPool;
use super::schema::{submission, sync_cursor, sync_state};
use crate::errors::Error;
use crate::providers::gamebanana::EmbeddedVideo;
use crate::providers::{SubmissionProvider, SubmissionRef, SubmissionType};
use diesel::OptionalExtension;
use diesel::prelude::*;
use diesel::sqlite::Sqlite;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::Path;

pub(super) const INCOMPLETE_SNAPSHOT: &str = "snapshot_with_invalid_records";
pub(super) const LAST_FULL_SYNC_AT: &str = "last_full_sync_at";
const CATEGORY_SNAPSHOT_VERSION: &str = "category_path_snapshot_v2";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogRecord {
  pub submission: SubmissionRef,
  pub name: String,
  pub author: String,
  pub author_remote_id: Option<String>,
  pub description: String,
  pub profile_url: String,
  pub category: String,
  #[serde(default)]
  pub category_path: Vec<CatalogCategory>,
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
  pub images: Vec<String>,
  pub thumbnail_url: Option<String>,
  pub remote_added_at: i64,
  pub remote_updated_at: i64,
  pub files_updated_at: i64,
  pub last_seen_snapshot: Option<String>,
  pub audio_url: Option<String>,
  pub tags: Vec<String>,
  pub development_state: Option<String>,
  pub completion_percentage: Option<u8>,
  /// None means videos were not fetched; Some(empty) clears previously cached videos.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub videos: Option<Vec<EmbeddedVideo>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SnapshotCoverage {
  pub seen: u64,
  pub unhydrated: u64,
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
  pub author_remote_id: Option<String>,
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
  pub images: String,
  pub remote_added_at: i64,
  pub remote_updated_at: i64,
  pub files_updated_at: i64,
  pub last_seen_snapshot: Option<String>,
  pub audio_url: Option<String>,
  pub tags: String,
  pub development_state: Option<String>,
  pub completion_percentage: Option<i32>,
  pub thumbnail_url: Option<String>,
  pub category_path: String,
  pub videos: Option<String>,
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
  pub(super) async fn prepare_category_backfill(&self) -> Result<(), Error> {
    self
      .pool
      .run(|connection| {
        connection.immediate_transaction::<_, Error, _>(|connection| {
          if sync_state::table
            .find(CATEGORY_SNAPSHOT_VERSION)
            .count()
            .get_result::<i64>(connection)?
            > 0
          {
            return Ok(());
          }
          // An older snapshot may have completed a submission kind before full
          // category paths existed. Restart once, then resume committed pages.
          diesel::update(sync_cursor::table)
            .set((
              sync_cursor::next_page.eq(1_i64),
              sync_cursor::snapshot_id.eq(Option::<String>::None),
              sync_cursor::snapshot_complete.eq(false),
            ))
            .execute(connection)?;
          diesel::delete(sync_state::table.find(INCOMPLETE_SNAPSHOT)).execute(connection)?;
          diesel::insert_into(sync_state::table)
            .values(SyncStateRow {
              key: CATEGORY_SNAPSHOT_VERSION.to_string(),
              value: "1".to_string(),
            })
            .execute(connection)?;
          Ok(())
        })
      })
      .await
  }

  pub(super) async fn save_category_taxonomy(
    &self,
    taxonomy: CategoryTaxonomy,
  ) -> Result<(), Error> {
    self
      .pool
      .run(move |connection| {
        connection.immediate_transaction::<_, Error, _>(|connection| {
          for submission_type in SubmissionType::ALL {
            let kind = submission_type_name(submission_type);
            let rows = submission::table
              .filter(submission::provider.eq("gamebanana"))
              .filter(submission::submission_type.eq(kind))
              .select((
                submission::submission_id,
                submission::category_path,
                submission::category,
                submission::is_map,
              ))
              .load::<(String, String, String, bool)>(connection)?;
            for (id, encoded, category, is_map) in rows {
              let original = decode_category_path(&encoded)?;
              let Some(expanded) = original
                .last()
                .and_then(|leaf| taxonomy.path_for_leaf(submission_type, &leaf.key))
              else {
                continue;
              };
              let Some(root) = expanded.first() else {
                continue;
              };
              let updated_is_map = submission_type == SubmissionType::Mod && root.name == "Maps";
              // A fresh taxonomy also repairs the broad category after reparenting.
              if expanded != original || category != root.name || is_map != updated_is_map {
                let encoded = serde_json::to_string(expanded)
                  .map_err(|error| Error::Catalog(error.to_string()))?;
                diesel::update(submission::table.find(("gamebanana", kind, id)))
                  .set((
                    submission::category_path.eq(encoded),
                    submission::category.eq(&root.name),
                    submission::is_map.eq(updated_is_map),
                  ))
                  .execute(connection)?;
              }
            }
          }
          let state = SyncStateRow {
            key: CATEGORY_TAXONOMY.to_string(),
            value: serde_json::to_string(&taxonomy)
              .map_err(|error| Error::Catalog(error.to_string()))?,
          };
          diesel::insert_into(sync_state::table)
            .values(&state)
            .on_conflict(sync_state::key)
            .do_update()
            .set(sync_state::value.eq(&state.value))
            .execute(connection)?;
          Ok(())
        })
      })
      .await
  }

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
        connection.immediate_transaction::<_, Error, _>(|connection| {
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
        connection.immediate_transaction::<_, Error, _>(|connection| {
          let incomplete_snapshot = sync_state::table
            .find(INCOMPLETE_SNAPSHOT)
            .select(sync_state::value)
            .first::<String>(connection)
            .optional()?;
          let tombstoned = if incomplete_snapshot.as_deref() == Some(snapshot_id.as_str()) {
            0
          } else {
            diesel::update(
              submission::table
                .filter(submission::is_tombstoned.eq(false))
                .filter(
                  submission::last_seen_snapshot
                    .is_null()
                    .or(submission::last_seen_snapshot.ne(&snapshot_id)),
                ),
            )
            .set(submission::is_tombstoned.eq(true))
            .execute(connection)?
          };
          diesel::update(sync_cursor::table)
            .set((
              sync_cursor::next_page.eq(1_i64),
              sync_cursor::snapshot_id.eq(Option::<String>::None),
              sync_cursor::snapshot_complete.eq(false),
            ))
            .execute(connection)?;
          if incomplete_snapshot.as_deref() != Some(snapshot_id.as_str()) {
            diesel::delete(sync_state::table.find(INCOMPLETE_SNAPSHOT)).execute(connection)?;
          }
          Ok(tombstoned)
        })
      })
      .await
  }

  pub async fn snapshot_coverage(
    &self,
    submission_type: SubmissionType,
    snapshot_id: String,
  ) -> Result<SnapshotCoverage, Error> {
    self
      .pool
      .run(move |connection| {
        let in_snapshot = || {
          submission::table
            .filter(submission::submission_type.eq(submission_type_name(submission_type)))
            .filter(submission::last_seen_snapshot.eq(snapshot_id.clone()))
        };
        let seen = in_snapshot().count().get_result::<i64>(connection)?;
        let unhydrated = in_snapshot()
          .filter(submission::is_hydrated.eq(false))
          .count()
          .get_result::<i64>(connection)?;
        Ok(SnapshotCoverage {
          seen: count_to_u64(seen)?,
          unhydrated: count_to_u64(unhydrated)?,
        })
      })
      .await
  }

  pub async fn unseen_submissions(
    &self,
    submission_type: SubmissionType,
    snapshot_id: String,
  ) -> Result<Vec<SubmissionRef>, Error> {
    self
      .pool
      .run(move |connection| {
        let ids = submission::table
          .filter(submission::provider.eq(provider_name(SubmissionProvider::Gamebanana)))
          .filter(submission::submission_type.eq(submission_type_name(submission_type)))
          .filter(submission::is_tombstoned.eq(false))
          .filter(
            submission::last_seen_snapshot
              .is_null()
              .or(submission::last_seen_snapshot.ne(&snapshot_id)),
          )
          .select(submission::submission_id)
          .load::<String>(connection)?;
        Ok(
          ids
            .into_iter()
            .map(|submission_id| SubmissionRef {
              provider: SubmissionProvider::Gamebanana,
              submission_type,
              submission_id,
            })
            .collect(),
        )
      })
      .await
  }

  pub async fn mark_seen(
    &self,
    submissions: Vec<SubmissionRef>,
    snapshot_id: String,
  ) -> Result<(), Error> {
    self
      .pool
      .run(move |connection| {
        connection.immediate_transaction::<_, Error, _>(|connection| {
          for submission in submissions {
            diesel::update(submission::table.find((
              provider_name(submission.provider),
              submission_type_name(submission.submission_type),
              submission.submission_id,
            )))
            .set(submission::last_seen_snapshot.eq(&snapshot_id))
            .execute(connection)?;
          }
          Ok(())
        })
      })
      .await
  }

  /// Hides a submission GameBanana no longer serves publicly until a crawl sees it again.
  pub async fn tombstone(&self, submission: SubmissionRef) -> Result<(), Error> {
    self
      .pool
      .run(move |connection| {
        diesel::update(submission::table.find((
          provider_name(submission.provider),
          submission_type_name(submission.submission_type),
          submission.submission_id,
        )))
        .set(submission::is_tombstoned.eq(true))
        .execute(connection)?;
        Ok(())
      })
      .await
  }

  pub async fn count_visible(&self) -> Result<u64, Error> {
    self
      .pool
      .run(|connection| {
        let count = submission::table
          .filter(submission::is_tombstoned.eq(false))
          .filter(submission::submission_type.ne(submission_type_name(SubmissionType::Wip)))
          .count()
          .get_result::<i64>(connection)?;
        count_to_u64(count)
      })
      .await
  }

  /// Before sounds had their own `snd-` slug, a sound was saved under its bare
  /// GameBanana id, which looks like a mod id. Returns the ids the catalog
  /// knows only as sounds, or `None` until a full crawl has completed, since a
  /// mod missing from a partial catalog may just not be synced yet.
  pub async fn legacy_sound_ids(&self, ids: Vec<String>) -> Result<Option<Vec<String>>, Error> {
    self
      .pool
      .run(move |connection| {
        let crawled = sync_state::table
          .find(LAST_FULL_SYNC_AT)
          .count()
          .get_result::<i64>(connection)?
          > 0;
        if !crawled {
          return Ok(None);
        }
        let candidates = ids
          .iter()
          .flat_map(|id| [id.clone(), format!("snd-{id}")])
          .collect::<Vec<_>>();
        let known = submission::table
          .filter(submission::slug.eq_any(&candidates))
          .select(submission::slug)
          .load::<String>(connection)?
          .into_iter()
          .collect::<HashSet<_>>();
        Ok(Some(
          ids
            .into_iter()
            .filter(|id| !known.contains(id) && known.contains(&format!("snd-{id}")))
            .collect(),
        ))
      })
      .await
  }

  pub async fn hydration_candidates(
    &self,
    submission_type: SubmissionType,
    revisions: Vec<(String, i64)>,
  ) -> Result<HashSet<String>, Error> {
    self
      .pool
      .run(move |connection| {
        let ids = revisions.iter().map(|(id, _)| id).collect::<Vec<_>>();
        let cached = submission::table
          .filter(submission::provider.eq(provider_name(SubmissionProvider::Gamebanana)))
          .filter(submission::submission_type.eq(submission_type_name(submission_type)))
          .filter(submission::submission_id.eq_any(ids))
          .select((
            submission::submission_id,
            submission::remote_updated_at,
            submission::is_hydrated,
            submission::is_tombstoned,
          ))
          .load::<(String, i64, bool, bool)>(connection)?
          .into_iter()
          .map(|(id, modified, hydrated, tombstoned)| (id, (modified, hydrated, tombstoned)))
          .collect::<HashMap<_, _>>();
        Ok(
          revisions
            .into_iter()
            .filter_map(|(id, modified)| {
              let needed = modified <= 0
                || cached.get(&id).is_none_or(|(saved, hydrated, tombstoned)| {
                  !hydrated || *tombstoned || modified > *saved
                });
              needed.then_some(id)
            })
            .collect(),
        )
      })
      .await
  }

  pub async fn upsert_records(&self, records: Vec<CatalogRecord>) -> Result<(), Error> {
    self
      .pool
      .run(move |connection| {
        connection.immediate_transaction::<_, Error, _>(|connection| {
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

  pub async fn clear(&self) -> Result<(), Error> {
    self
      .pool
      .run(|connection| {
        connection.immediate_transaction::<_, Error, _>(|connection| {
          // Empty the index first: the delete trigger scans it once per submission.
          diesel::delete(super::schema::submission_fts::table).execute(connection)?;
          diesel::delete(submission::table).execute(connection)?;
          diesel::delete(super::schema::collection::table).execute(connection)?;
          diesel::delete(super::schema::update_cache::table).execute(connection)?;
          diesel::delete(sync_state::table).execute(connection)?;
          diesel::delete(sync_cursor::table).execute(connection)?;
          Ok(())
        })
      })
      .await
  }

  pub async fn invalidate_sync_state(&self) -> Result<(), Error> {
    self
      .pool
      .run(|connection| {
        connection.immediate_transaction::<_, Error, _>(|connection| {
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
    let slug = record
      .submission
      .to_slug()
      .map_err(|error| Error::InvalidInput(error.to_string()))?;
    Ok(Self {
      provider: provider_name(record.submission.provider).to_string(),
      submission_type: submission_type_name(record.submission.submission_type).to_string(),
      submission_id: record.submission.submission_id,
      slug,
      name: record.name,
      author: record.author,
      author_remote_id: record.author_remote_id,
      description: record.description,
      profile_url: record.profile_url,
      category: record.category,
      category_path: serde_json::to_string(&record.category_path)
        .map_err(|error| Error::Catalog(error.to_string()))?,
      videos: record
        .videos
        .map(|videos| serde_json::to_string(&videos))
        .transpose()
        .map_err(|error| Error::Catalog(error.to_string()))?,
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
      images: encode_images(&record.images)?,
      remote_added_at: record.remote_added_at,
      remote_updated_at: record.remote_updated_at,
      files_updated_at: record.files_updated_at,
      last_seen_snapshot: record.last_seen_snapshot,
      audio_url: record.audio_url,
      tags: encode_strings(&record.tags)?,
      development_state: record.development_state,
      completion_percentage: record.completion_percentage.map(i32::from),
      thumbnail_url: record
        .thumbnail_url
        .filter(|url| url.starts_with("https://")),
    })
  }

  fn merge(self, incoming: Self) -> Self {
    let hydrated = incoming.is_hydrated;
    let keeps_media = incoming.images == "[]";
    let category_path =
      if hydrated && incoming.category != "Other" && incoming.category != self.category {
        incoming.category_path
      } else {
        merge_category_paths(&self.category_path, &incoming.category_path, hydrated)
      };
    Self {
      provider: incoming.provider,
      submission_type: incoming.submission_type,
      submission_id: incoming.submission_id,
      slug: incoming.slug,
      name: incoming.name,
      author: incoming.author,
      author_remote_id: incoming.author_remote_id.or(self.author_remote_id),
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
      category_path,
      videos: incoming.videos.or(self.videos),
      hero: if hydrated { incoming.hero } else { self.hero },
      is_audio: incoming.is_audio,
      is_map: if hydrated {
        incoming.is_map
      } else {
        self.is_map
      },
      is_nsfw: incoming.is_nsfw,
      is_obsolete: incoming.is_obsolete,
      is_tombstoned: false,
      is_hydrated: hydrated
        || (self.is_hydrated && incoming.remote_updated_at <= self.remote_updated_at),
      has_files: incoming.has_files,
      download_count: if hydrated {
        incoming.download_count
      } else {
        self.download_count
      },
      likes: self.likes.max(incoming.likes),
      images: if keeps_media {
        self.images
      } else {
        incoming.images
      },
      remote_added_at: incoming.remote_added_at,
      remote_updated_at: self.remote_updated_at.max(incoming.remote_updated_at),
      files_updated_at: self.files_updated_at.max(incoming.files_updated_at),
      last_seen_snapshot: incoming.last_seen_snapshot.or(self.last_seen_snapshot),
      audio_url: incoming.audio_url,
      tags: if incoming.tags == "[]" {
        self.tags
      } else {
        incoming.tags
      },
      development_state: incoming.development_state,
      completion_percentage: incoming.completion_percentage,
      // Kept alongside `images`, which also survives updates without media.
      thumbnail_url: if keeps_media {
        self.thumbnail_url
      } else {
        incoming.thumbnail_url
      },
    }
  }
}

fn merge_category_paths(saved: &str, incoming: &str, authoritative: bool) -> String {
  let saved_path = decode_category_path(saved).unwrap_or_default();
  let incoming_path = decode_category_path(incoming).unwrap_or_default();
  if incoming_path.is_empty() {
    return saved.to_string();
  }
  if saved_path.is_empty() {
    return incoming.to_string();
  }
  let same_leaf = saved_path.last().map(|category| &category.key)
    == incoming_path.last().map(|category| &category.key);
  let mut ancestors = saved_path.iter();
  let compatible = incoming_path
    .iter()
    .all(|incoming| ancestors.by_ref().any(|saved| saved.key == incoming.key));
  if (same_leaf && compatible && incoming_path.len() < saved_path.len())
    || (!authoritative && !same_leaf)
  {
    return saved.to_string();
  }
  incoming.to_string()
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
  let changed = existing.as_ref().is_none_or(|existing| {
    incoming.remote_updated_at > existing.remote_updated_at
      || incoming.files_updated_at > existing.files_updated_at
  });
  if changed {
    diesel::delete(super::schema::update_cache::table.find((
      &incoming.provider,
      &incoming.submission_type,
      &incoming.submission_id,
    )))
    .execute(connection)?;
  }
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
    SubmissionType::Wip => "wip",
  }
}

pub(super) fn encode_images(images: &[String]) -> Result<String, Error> {
  let urls = images
    .iter()
    .filter(|url| url.starts_with("https://"))
    .cloned()
    .collect::<Vec<_>>();
  serde_json::to_string(&urls).map_err(|error| Error::Catalog(error.to_string()))
}

fn count_to_u64(count: i64) -> Result<u64, Error> {
  u64::try_from(count).map_err(|_| Error::Catalog("catalog count was negative".to_string()))
}

fn encode_strings(values: &[String]) -> Result<String, Error> {
  serde_json::to_string(values).map_err(|error| Error::Catalog(error.to_string()))
}

pub(super) fn decode_strings(value: &str) -> Result<Vec<String>, Error> {
  serde_json::from_str(value).map_err(|error| Error::Catalog(error.to_string()))
}

pub(super) fn decode_images(value: &str) -> Result<Vec<String>, Error> {
  let urls: Vec<String> =
    serde_json::from_str(value).map_err(|error| Error::Catalog(error.to_string()))?;
  Ok(
    urls
      .into_iter()
      .filter(|url| url.starts_with("https://"))
      .collect(),
  )
}

#[cfg(test)]
mod tests {
  use super::{Catalog, CatalogRecord};
  use crate::providers::SubmissionRef;
  use tempfile::tempdir;

  #[tokio::test]
  async fn sparse_category_updates_keep_ancestry_and_details_can_reassign() {
    let directory = tempdir().unwrap();
    let catalog = Catalog::open(directory.path().join("catalog.sqlite3"), 1)
      .await
      .unwrap();
    let category = |id, name: &str| super::CatalogCategory {
      key: format!("mod:{id}"),
      name: name.to_string(),
    };
    let mut entry = record("1", "Walker", "snapshot-a");
    entry.category = "Model Replacement".to_string();
    entry.category_path = vec![
      category(33154, "Model Replacement"),
      category(44691, "NPCs"),
      category(44458, "Walker"),
    ];
    catalog.upsert_records(vec![entry.clone()]).await.unwrap();

    let mut sparse = entry.clone();
    sparse.is_hydrated = false;
    sparse.category_path = vec![
      entry.category_path[0].clone(),
      entry.category_path[2].clone(),
    ];
    catalog.upsert_records(vec![sparse]).await.unwrap();
    let saved = catalog
      .get(entry.submission.clone())
      .await
      .unwrap()
      .unwrap();
    assert_eq!(saved.category_path, entry.category_path);

    let mut missing = entry.clone();
    missing.category_path.clear();
    catalog.upsert_records(vec![missing]).await.unwrap();
    let saved = catalog
      .get(entry.submission.clone())
      .await
      .unwrap()
      .unwrap();
    assert_eq!(saved.category_path, entry.category_path);

    entry.category_path.truncate(1);
    catalog.upsert_records(vec![entry.clone()]).await.unwrap();
    let saved = catalog
      .get(entry.submission.clone())
      .await
      .unwrap()
      .unwrap();
    assert_eq!(
      saved.category_path, entry.category_path,
      "Authoritative root-only reassignment must remove old descendants"
    );

    entry.category_path.push(category(44457, "Troopers"));
    catalog.upsert_records(vec![entry.clone()]).await.unwrap();
    let saved = catalog.get(entry.submission).await.unwrap().unwrap();
    assert_eq!(saved.category_path, entry.category_path);
  }

  #[tokio::test]
  async fn authoritative_root_changes_replace_or_clear_previous_category_keys() {
    for with_path in [true, false] {
      let directory = tempdir().unwrap();
      let catalog = Catalog::open(directory.path().join("catalog.sqlite3"), 1)
        .await
        .unwrap();
      let category = |id, name: &str| super::CatalogCategory {
        key: format!("mod:{id}"),
        name: name.to_string(),
      };
      let mut entry = record("1", "Walker", "snapshot-a");
      entry.category = "Model Replacement".to_string();
      entry.category_path = vec![
        category(33154, "Model Replacement"),
        category(44691, "NPCs"),
        category(44458, "Walker"),
      ];
      catalog.upsert_records(vec![entry.clone()]).await.unwrap();
      entry.category = "HUD".to_string();
      entry.category_path = if with_path {
        vec![category(123, "HUD"), category(44458, "Walker")]
      } else {
        Vec::new()
      };
      catalog.upsert_records(vec![entry.clone()]).await.unwrap();
      let saved = catalog.get(entry.submission).await.unwrap().unwrap();
      assert_eq!(saved.category, "HUD");
      assert_eq!(saved.category_path, entry.category_path);
    }
  }

  #[tokio::test]
  async fn category_backfill_restarts_legacy_snapshot_once_then_preserves_resumes() {
    let directory = tempdir().unwrap();
    let catalog = Catalog::open(directory.path().join("catalog.sqlite3"), 1)
      .await
      .unwrap();
    catalog
      .upsert_page(
        vec![record("1", "Old Mod", "old-snapshot")],
        crate::providers::SubmissionType::Mod,
        200,
        Some("old-snapshot".to_string()),
        true,
      )
      .await
      .unwrap();
    catalog
      .upsert_page(
        Vec::new(),
        crate::providers::SubmissionType::Sound,
        3,
        Some("old-snapshot".to_string()),
        false,
      )
      .await
      .unwrap();
    catalog
      .set_state(super::INCOMPLETE_SNAPSHOT, "old-snapshot".to_string())
      .await
      .unwrap();
    catalog
      .set_state("category_path_snapshot_v1", "1".to_string())
      .await
      .unwrap();
    catalog.prepare_category_backfill().await.unwrap();
    let cursor = catalog
      .cursor(crate::providers::SubmissionType::Mod)
      .await
      .unwrap();
    assert_eq!(cursor.next_page, 1);
    assert!(!cursor.snapshot_complete);
    assert!(cursor.snapshot_id.is_none());
    assert_eq!(
      catalog.count_visible().await.unwrap(),
      1,
      "Restarting metadata backfill keeps cached browsing available"
    );
    assert!(
      catalog
        .state(super::INCOMPLETE_SNAPSHOT)
        .await
        .unwrap()
        .is_none()
    );

    catalog
      .upsert_page(
        Vec::new(),
        crate::providers::SubmissionType::Mod,
        5,
        Some("new-snapshot".to_string()),
        false,
      )
      .await
      .unwrap();
    catalog.prepare_category_backfill().await.unwrap();
    let cursor = catalog
      .cursor(crate::providers::SubmissionType::Mod)
      .await
      .unwrap();
    assert_eq!(cursor.next_page, 5);
    assert_eq!(cursor.snapshot_id.as_deref(), Some("new-snapshot"));
  }

  #[tokio::test]
  async fn taxonomy_refresh_repairs_all_submission_kinds_and_keeps_numeric_ids_scoped() {
    let directory = tempdir().unwrap();
    let catalog = Catalog::open(directory.path().join("catalog.sqlite3"), 1)
      .await
      .unwrap();
    let mut paths = Vec::new();
    let mut entries = Vec::new();
    for (submission_type, slug, root) in [
      (crate::providers::SubmissionType::Mod, "1", "Maps"),
      (
        crate::providers::SubmissionType::Sound,
        "snd-1",
        "Abilities",
      ),
      (crate::providers::SubmissionType::Wip, "wip-1", "Skins"),
    ] {
      let path = vec![
        super::CatalogCategory::new(submission_type, 100, root),
        super::CatalogCategory::new(submission_type, 200, "Parent"),
        super::CatalogCategory::new(submission_type, 300, "Leaf"),
      ];
      let mut entry = record(slug, "Nested mod", "snapshot");
      entry.category = "Old root".to_string();
      entry.category_path = vec![path[2].clone()];
      entry.is_audio = submission_type == crate::providers::SubmissionType::Sound;
      entry.is_map = submission_type != crate::providers::SubmissionType::Mod;
      paths.push(path);
      entries.push(entry);
    }
    catalog.upsert_records(entries.clone()).await.unwrap();
    catalog
      .save_category_taxonomy(super::CategoryTaxonomy {
        refreshed_at: 1,
        paths: paths.clone(),
      })
      .await
      .unwrap();
    for (entry, expected) in entries.into_iter().zip(paths) {
      let saved = catalog
        .get(entry.submission.clone())
        .await
        .unwrap()
        .unwrap();
      assert_eq!(saved.category, expected[0].name);
      assert_eq!(saved.category_path, expected);
      assert_eq!(
        saved.is_map,
        entry.submission.submission_type == crate::providers::SubmissionType::Mod
      );
      assert_eq!(saved.is_audio, entry.is_audio);
    }
  }

  fn record(slug: &str, name: &str, snapshot: &str) -> CatalogRecord {
    CatalogRecord {
      submission: SubmissionRef::parse_slug(slug).unwrap(),
      name: name.to_string(),
      author: "DMM".to_string(),
      author_remote_id: Some("42".to_string()),
      description: "searchable catalog text".to_string(),
      profile_url: format!("https://gamebanana.com/mods/{slug}"),
      category: "Skins".to_string(),
      category_path: Vec::new(),
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
      images: Vec::new(),
      thumbnail_url: None,
      remote_added_at: 100,
      remote_updated_at: 200,
      files_updated_at: 0,
      last_seen_snapshot: Some(snapshot.to_string()),
      audio_url: None,
      tags: Vec::new(),
      development_state: None,
      completion_percentage: None,
      videos: None,
    }
  }

  #[tokio::test]
  async fn legacy_sound_ids_skip_mods_and_unfinished_crawls() {
    let directory = tempdir().unwrap();
    let catalog = Catalog::open(directory.path().join("catalog.sqlite3"), 1)
      .await
      .unwrap();
    catalog
      .upsert_page(
        vec![
          record("7", "Mod", "snapshot-a"),
          record("snd-7", "Sound sharing the mod id", "snapshot-a"),
          record("snd-8", "Sound", "snapshot-a"),
        ],
        crate::providers::SubmissionType::Sound,
        2,
        Some("snapshot-a".to_string()),
        false,
      )
      .await
      .unwrap();
    let ids = vec!["7".to_string(), "8".to_string(), "9".to_string()];
    assert_eq!(catalog.legacy_sound_ids(ids.clone()).await.unwrap(), None);

    catalog
      .complete_snapshot("snapshot-a".to_string())
      .await
      .unwrap();
    assert_eq!(catalog.legacy_sound_ids(ids.clone()).await.unwrap(), None);

    catalog
      .set_state(super::LAST_FULL_SYNC_AT, "123".to_string())
      .await
      .unwrap();
    assert_eq!(
      catalog.legacy_sound_ids(ids).await.unwrap(),
      Some(vec!["8".to_string()])
    );
  }

  #[tokio::test]
  async fn newer_catalog_record_drops_cached_update() {
    let directory = tempdir().unwrap();
    let catalog = Catalog::open(directory.path().join("catalog.sqlite3"), 1)
      .await
      .unwrap();
    let entry = record("1", "Cached entry", "snapshot-a");
    let submission = entry.submission.clone();
    catalog.upsert_records(vec![entry.clone()]).await.unwrap();
    let snapshot = crate::providers::gamebanana::UpdateSnapshot {
      remote_updated_at: 200,
      files: Vec::new(),
    };
    catalog
      .save_cached_update(submission.clone(), snapshot, 1_000)
      .await
      .unwrap();

    catalog.upsert_records(vec![entry.clone()]).await.unwrap();
    assert!(
      catalog
        .cached_update(submission.clone())
        .await
        .unwrap()
        .is_some()
    );

    catalog
      .upsert_records(vec![CatalogRecord {
        files_updated_at: 300,
        ..entry
      }])
      .await
      .unwrap();
    assert!(catalog.cached_update(submission).await.unwrap().is_none());
  }

  #[tokio::test]
  async fn changed_index_requires_hydration_again_until_details_are_saved() {
    let directory = tempdir().unwrap();
    let catalog = Catalog::open(directory.path().join("catalog.sqlite3"), 1)
      .await
      .unwrap();
    catalog
      .upsert_records(vec![record("1", "Cached entry", "snapshot-a")])
      .await
      .unwrap();
    let mut changed = record("1", "Updated entry", "snapshot-a");
    changed.remote_updated_at = 300;
    changed.is_hydrated = false;
    catalog.upsert_records(vec![changed.clone()]).await.unwrap();
    let pending = catalog
      .hydration_candidates(
        crate::providers::SubmissionType::Mod,
        vec![("1".to_string(), 300)],
      )
      .await
      .unwrap();
    assert!(
      pending.contains("1"),
      "Index changes alone must not count as saved details"
    );
    changed.is_hydrated = true;
    catalog.upsert_records(vec![changed]).await.unwrap();
    let pending = catalog
      .hydration_candidates(
        crate::providers::SubmissionType::Mod,
        vec![("1".to_string(), 300)],
      )
      .await
      .unwrap();
    assert!(pending.is_empty());
  }

  #[tokio::test]
  async fn clear_removes_entries_search_and_sync_state() {
    let directory = tempdir().unwrap();
    let catalog = Catalog::open(directory.path().join("catalog.sqlite3"), 1)
      .await
      .unwrap();
    catalog
      .upsert_page(
        vec![record("1", "Cached entry", "snapshot-a")],
        crate::providers::SubmissionType::Mod,
        2,
        Some("snapshot-a".to_string()),
        false,
      )
      .await
      .unwrap();
    catalog
      .set_state("last_full_sync_at", "123".to_string())
      .await
      .unwrap();
    catalog.clear().await.unwrap();
    assert_eq!(catalog.count_visible().await.unwrap(), 0);
    assert!(
      catalog
        .search_slugs("Cached".to_string())
        .await
        .unwrap()
        .is_empty()
    );
    assert_eq!(catalog.state("last_full_sync_at").await.unwrap(), None);
    let cursor = catalog
      .cursor(crate::providers::SubmissionType::Mod)
      .await
      .unwrap();
    assert_eq!(cursor.next_page, 1);
    assert_eq!(cursor.snapshot_id, None);
    assert_eq!(cursor.high_water_mark, 0);
    catalog
      .upsert_records(vec![record("2", "Rebuilt entry", "snapshot-b")])
      .await
      .unwrap();
    assert_eq!(catalog.count_visible().await.unwrap(), 1);
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

  #[tokio::test]
  async fn preview_images_round_trip_and_empty_updates_keep_them() {
    let directory = tempdir().unwrap();
    let catalog = Catalog::open(directory.path().join("catalog.sqlite3"), 1)
      .await
      .unwrap();
    let mut with_images = record("42", "Pink Drifter", "snapshot-a");
    with_images.images = vec![
      "https://images.gamebanana.com/img/ss/mods/a.jpg".to_string(),
      "http://insecure.example/img.jpg".to_string(),
    ];
    with_images.thumbnail_url =
      Some("https://images.gamebanana.com/img/ss/mods/530-90_a.jpg".to_string());
    with_images.likes = 4;
    catalog.upsert_records(vec![with_images]).await.unwrap();

    let stored = catalog
      .get(SubmissionRef::parse_slug("42").unwrap())
      .await
      .unwrap()
      .unwrap();
    assert_eq!(
      stored.images,
      ["https://images.gamebanana.com/img/ss/mods/a.jpg"]
    );
    assert_eq!(
      stored.thumbnail_url.as_deref(),
      Some("https://images.gamebanana.com/img/ss/mods/530-90_a.jpg")
    );
    assert_eq!(stored.likes, 4);

    let mut without_images = record("42", "Pink Drifter", "snapshot-b");
    without_images.likes = 1;
    catalog.upsert_records(vec![without_images]).await.unwrap();
    let stored = catalog
      .get(SubmissionRef::parse_slug("42").unwrap())
      .await
      .unwrap()
      .unwrap();
    assert_eq!(
      stored.images,
      ["https://images.gamebanana.com/img/ss/mods/a.jpg"]
    );
    assert_eq!(
      stored.thumbnail_url.as_deref(),
      Some("https://images.gamebanana.com/img/ss/mods/530-90_a.jpg")
    );
    assert_eq!(stored.likes, 4);
  }
}
