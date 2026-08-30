use super::schema::update_cache;
use super::store::{Catalog, provider_name, submission_type_name};
use crate::errors::Error;
use crate::providers::SubmissionRef;
use crate::providers::gamebanana::UpdateSnapshot;
use diesel::OptionalExtension;
use diesel::prelude::*;

#[derive(Debug, Clone)]
pub struct CachedUpdate {
  pub snapshot: UpdateSnapshot,
  pub checked_at: u64,
}

#[derive(Debug, Queryable, Selectable, Identifiable, Insertable, AsChangeset)]
#[diesel(
  table_name = update_cache,
  primary_key(provider, submission_type, submission_id)
)]
struct UpdateCacheRow {
  provider: String,
  submission_type: String,
  submission_id: String,
  payload: String,
  checked_at: i64,
}

impl Catalog {
  pub async fn cached_update(
    &self,
    submission: SubmissionRef,
  ) -> Result<Option<CachedUpdate>, Error> {
    self
      .pool
      .run(move |connection| {
        let row = update_cache::table
          .find((
            provider_name(submission.provider),
            submission_type_name(submission.submission_type),
            submission.submission_id,
          ))
          .select(UpdateCacheRow::as_select())
          .first::<UpdateCacheRow>(connection)
          .optional()
          .map_err(Error::from)?;
        row
          .map(|row| {
            let snapshot = serde_json::from_str(&row.payload)
              .map_err(|error| Error::Catalog(format!("invalid update cache entry: {error}")))?;
            let checked_at = u64::try_from(row.checked_at)
              .map_err(|_| Error::Catalog("update cache timestamp was negative".to_string()))?;
            Ok(CachedUpdate {
              snapshot,
              checked_at,
            })
          })
          .transpose()
      })
      .await
  }

  pub async fn save_cached_update(
    &self,
    submission: SubmissionRef,
    snapshot: UpdateSnapshot,
    checked_at: u64,
  ) -> Result<(), Error> {
    let payload = serde_json::to_string(&snapshot)
      .map_err(|error| Error::Catalog(format!("failed to encode update cache: {error}")))?;
    let checked_at = i64::try_from(checked_at)
      .map_err(|_| Error::Catalog("update cache timestamp exceeds SQLite range".to_string()))?;
    let row = UpdateCacheRow {
      provider: provider_name(submission.provider).to_string(),
      submission_type: submission_type_name(submission.submission_type).to_string(),
      submission_id: submission.submission_id,
      payload,
      checked_at,
    };
    self
      .pool
      .run(move |connection| {
        diesel::insert_into(update_cache::table)
          .values(&row)
          .on_conflict((
            update_cache::provider,
            update_cache::submission_type,
            update_cache::submission_id,
          ))
          .do_update()
          .set((
            update_cache::payload.eq(&row.payload),
            update_cache::checked_at.eq(row.checked_at),
          ))
          .execute(connection)?;
        Ok(())
      })
      .await
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::providers::gamebanana::SubmissionFile;
  use tempfile::tempdir;

  #[tokio::test]
  async fn update_cache_round_trips_and_replaces_by_provider_identity() {
    let directory = tempdir().unwrap();
    let catalog = Catalog::open(directory.path().join("catalog.sqlite3"), 1)
      .await
      .unwrap();
    let submission = SubmissionRef::parse_slug("snd-42").unwrap();
    let first = UpdateSnapshot {
      remote_updated_at: 100,
      files: Vec::new(),
    };
    catalog
      .save_cached_update(submission.clone(), first, 200)
      .await
      .unwrap();

    let cached = catalog
      .cached_update(submission.clone())
      .await
      .unwrap()
      .unwrap();
    assert_eq!(cached.snapshot.remote_updated_at, 100);
    assert_eq!(cached.checked_at, 200);

    let replacement = UpdateSnapshot {
      remote_updated_at: 300,
      files: vec![SubmissionFile {
        id: 7,
        name: "sound.zip".to_string(),
        size: 12,
        download_url: "https://gamebanana.com/dl/7".to_string(),
        date_added: Some(250),
        md5: None,
      }],
    };
    catalog
      .save_cached_update(submission.clone(), replacement, 400)
      .await
      .unwrap();

    let cached = catalog.cached_update(submission).await.unwrap().unwrap();
    assert_eq!(cached.snapshot.remote_updated_at, 300);
    assert_eq!(cached.snapshot.files[0].id, 7);
    assert_eq!(cached.checked_at, 400);
  }
}
