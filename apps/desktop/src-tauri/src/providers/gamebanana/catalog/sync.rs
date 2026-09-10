use super::store::{Catalog, CatalogRecord};
use crate::errors::Error;
use crate::providers::gamebanana::hero_registry;
use crate::providers::gamebanana::{BulkHydration, GameBananaClient, IndexPage};
use crate::providers::{SubmissionProvider, SubmissionRef, SubmissionType};
use std::future::Future;
use std::pin::Pin;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio_util::sync::CancellationToken;

const INCREMENTAL_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);
const FULL_RECONCILIATION_INTERVAL: Duration = Duration::from_secs(7 * 24 * 60 * 60);
const HYDRATION_BATCH_SIZE: usize = 50;
const LAST_INCREMENTAL_AT: &str = "last_incremental_at";
const LAST_FULL_SYNC_AT: &str = "last_full_sync_at";

type SourceFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, Error>> + Send + 'a>>;

trait CatalogSource: Send + Sync {
  fn index<'a>(
    &'a self,
    submission_type: SubmissionType,
    page: u32,
    latest_modified: bool,
    cancel: &'a CancellationToken,
  ) -> SourceFuture<'a, IndexPage>;

  fn bulk_hydrate<'a>(
    &'a self,
    submissions: &'a [SubmissionRef],
    cancel: &'a CancellationToken,
  ) -> SourceFuture<'a, Vec<Option<BulkHydration>>>;
}

impl CatalogSource for GameBananaClient {
  fn index<'a>(
    &'a self,
    submission_type: SubmissionType,
    page: u32,
    latest_modified: bool,
    cancel: &'a CancellationToken,
  ) -> SourceFuture<'a, IndexPage> {
    Box::pin(GameBananaClient::index(
      self,
      submission_type,
      page,
      latest_modified,
      cancel,
    ))
  }

  fn bulk_hydrate<'a>(
    &'a self,
    submissions: &'a [SubmissionRef],
    cancel: &'a CancellationToken,
  ) -> SourceFuture<'a, Vec<Option<BulkHydration>>> {
    Box::pin(GameBananaClient::bulk_hydrate(self, submissions, cancel))
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncOutcome {
  Full,
  Incremental,
  Throttled,
}

pub struct CatalogSync {
  catalog: Catalog,
  source: Box<dyn CatalogSource>,
  sync_lock: tokio::sync::Mutex<()>,
}

impl CatalogSync {
  pub fn new(catalog: Catalog, source: GameBananaClient) -> Self {
    Self {
      catalog,
      source: Box::new(source),
      sync_lock: tokio::sync::Mutex::new(()),
    }
  }

  #[cfg(test)]
  fn with_source(catalog: Catalog, source: impl CatalogSource + 'static) -> Self {
    Self {
      catalog,
      source: Box::new(source),
      sync_lock: tokio::sync::Mutex::new(()),
    }
  }

  pub async fn synchronize(
    &self,
    force_refresh: bool,
    force_reconcile: bool,
    cancel: &CancellationToken,
  ) -> Result<SyncOutcome, Error> {
    let _sync_guard = self.sync_lock.lock().await;
    if force_reconcile
      || self.catalog.count_visible().await? == 0
      || self.full_reconciliation_due().await?
    {
      self.full_sync(cancel).await?;
      return Ok(SyncOutcome::Full);
    }

    self.incremental_sync(force_refresh, cancel).await
  }

  async fn full_sync(&self, cancel: &CancellationToken) -> Result<(), Error> {
    let mod_cursor = self.catalog.cursor(SubmissionType::Mod).await?;
    let sound_cursor = self.catalog.cursor(SubmissionType::Sound).await?;
    let snapshot_id = resumable_snapshot(&mod_cursor.snapshot_id, &sound_cursor.snapshot_id)
      .unwrap_or_else(new_snapshot_id);

    for submission_type in [SubmissionType::Mod, SubmissionType::Sound] {
      let cursor = self.catalog.cursor(submission_type).await?;
      if cursor.snapshot_id.as_deref() == Some(snapshot_id.as_str()) && cursor.snapshot_complete {
        continue;
      }
      let mut page_number = if cursor.snapshot_id.as_deref() == Some(snapshot_id.as_str()) {
        cursor.next_page
      } else {
        1
      };

      loop {
        let page = self
          .source
          .index(submission_type, page_number, false, cancel)
          .await?;
        let index_records = page.valid_records();
        let high_water_mark = index_records
          .iter()
          .filter_map(|record| record.date_modified)
          .max()
          .unwrap_or_default();
        let catalog_records = index_records
          .iter()
          .map(|record| from_index(record, submission_type, Some(snapshot_id.clone())))
          .collect();
        self
          .catalog
          .upsert_page(
            catalog_records,
            submission_type,
            page_number.saturating_add(1),
            Some(snapshot_id.clone()),
            page.metadata.is_complete,
          )
          .await?;
        self
          .catalog
          .set_high_water_mark(submission_type, high_water_mark)
          .await?;
        self
          .hydrate_records(
            &index_records,
            submission_type,
            Some(snapshot_id.clone()),
            cancel,
          )
          .await;

        if page.metadata.is_complete {
          break;
        }
        page_number = page_number.saturating_add(1);
      }
    }

    self.catalog.complete_snapshot(snapshot_id).await?;
    self
      .catalog
      .set_state(LAST_FULL_SYNC_AT, unix_timestamp().to_string())
      .await?;
    Ok(())
  }

  async fn full_reconciliation_due(&self) -> Result<bool, Error> {
    let last_full_sync = self
      .catalog
      .state(LAST_FULL_SYNC_AT)
      .await?
      .and_then(|value| value.parse::<u64>().ok())
      .unwrap_or_default();
    Ok(unix_timestamp().saturating_sub(last_full_sync) >= FULL_RECONCILIATION_INTERVAL.as_secs())
  }

  async fn incremental_sync(
    &self,
    force: bool,
    cancel: &CancellationToken,
  ) -> Result<SyncOutcome, Error> {
    let now = unix_timestamp();
    let last_refresh = self
      .catalog
      .state(LAST_INCREMENTAL_AT)
      .await?
      .and_then(|value| value.parse::<u64>().ok())
      .unwrap_or_default();
    if !force && now.saturating_sub(last_refresh) < INCREMENTAL_INTERVAL.as_secs() {
      return Ok(SyncOutcome::Throttled);
    }

    for submission_type in [SubmissionType::Mod, SubmissionType::Sound] {
      let high_water_mark = self.catalog.cursor(submission_type).await?.high_water_mark;
      let mut newest = high_water_mark;
      let mut page_number = 1;
      loop {
        let page = self
          .source
          .index(submission_type, page_number, true, cancel)
          .await?;
        let index_records = page.valid_records();
        let crossed_high_water = high_water_mark > 0
          && index_records.iter().any(|record| {
            record
              .date_modified
              .is_some_and(|modified| modified < high_water_mark)
          });
        newest = index_records
          .iter()
          .filter_map(|record| record.date_modified)
          .max()
          .unwrap_or(newest)
          .max(newest);
        self
          .catalog
          .upsert_records(
            index_records
              .iter()
              .map(|record| from_index(record, submission_type, None))
              .collect(),
          )
          .await?;
        self
          .hydrate_records(&index_records, submission_type, None, cancel)
          .await;

        if page.metadata.is_complete || crossed_high_water {
          break;
        }
        page_number = page_number.saturating_add(1);
      }
      self
        .catalog
        .set_high_water_mark(submission_type, newest)
        .await?;
    }
    self
      .catalog
      .set_state(LAST_INCREMENTAL_AT, now.to_string())
      .await?;
    Ok(SyncOutcome::Incremental)
  }

  async fn hydrate_records(
    &self,
    index_records: &[crate::providers::gamebanana::models::IndexSubmission],
    submission_type: SubmissionType,
    snapshot_id: Option<String>,
    cancel: &CancellationToken,
  ) {
    for batch in index_records.chunks(HYDRATION_BATCH_SIZE) {
      let submissions = batch
        .iter()
        .map(|record| submission_ref(record.id, submission_type))
        .collect::<Vec<_>>();
      let Ok(hydrated) = self.source.bulk_hydrate(&submissions, cancel).await else {
        continue;
      };
      let records = batch
        .iter()
        .zip(hydrated)
        .filter_map(|(index, hydration)| {
          hydration
            .map(|record| from_hydration(index, record, submission_type, snapshot_id.clone()))
        })
        .collect();
      if let Err(error) = self.catalog.upsert_records(records).await {
        log::warn!("GameBanana catalog hydration commit failed: {error}");
      }
    }
  }
}

fn from_index(
  record: &crate::providers::gamebanana::models::IndexSubmission,
  submission_type: SubmissionType,
  snapshot_id: Option<String>,
) -> CatalogRecord {
  let category = record
    .root_category
    .as_ref()
    .map(|category| category.name.trim())
    .filter(|category| !category.is_empty())
    .unwrap_or("Other")
    .to_string();
  let profile_url = if record.profile_url.is_empty() {
    format!(
      "https://gamebanana.com/{}/{}",
      match submission_type {
        SubmissionType::Mod => "mods",
        SubmissionType::Sound => "sounds",
      },
      record.id
    )
  } else {
    record.profile_url.clone()
  };

  CatalogRecord {
    submission: submission_ref(record.id, submission_type),
    name: record.name.clone(),
    author: record
      .submitter
      .as_ref()
      .map(|submitter| submitter.name.trim())
      .filter(|author| !author.is_empty())
      .unwrap_or("Unknown")
      .to_string(),
    description: String::new(),
    profile_url,
    category,
    hero: None,
    is_audio: submission_type == SubmissionType::Sound,
    is_map: false,
    is_nsfw: false,
    is_obsolete: record.is_obsolete,
    is_tombstoned: false,
    is_hydrated: false,
    has_files: record.has_files,
    download_count: 0,
    likes: 0,
    remote_added_at: record
      .date_added
      .filter(|value| *value > 0)
      .unwrap_or_default(),
    remote_updated_at: record
      .date_modified
      .filter(|value| *value > 0)
      .or(record.date_added.filter(|value| *value > 0))
      .unwrap_or_default(),
    files_updated_at: 0,
    last_seen_snapshot: snapshot_id,
  }
}

fn from_hydration(
  index: &crate::providers::gamebanana::models::IndexSubmission,
  hydration: BulkHydration,
  submission_type: SubmissionType,
  snapshot_id: Option<String>,
) -> CatalogRecord {
  let mut record = from_index(index, submission_type, snapshot_id);
  let description = if hydration.text.is_empty() {
    hydration.description
  } else {
    hydration.text
  };
  let category = if hydration.root_category.trim().is_empty() {
    hydration.category.trim()
  } else {
    hydration.root_category.trim()
  };
  record.name = hydration.name;
  record.description = description;
  record.category = if category.is_empty() {
    "Other"
  } else {
    category
  }
  .to_string();
  record.hero = hero_registry::resolve_from_skin_category(
    Some(record.category.as_str()),
    Some(hydration.category.as_str()),
    &record.name,
  );
  record.is_map = submission_type == SubmissionType::Mod && record.category == "Maps";
  record.is_nsfw = hydration.is_nsfw;
  record.download_count = hydration.download_count;
  record.is_hydrated = true;
  record
}

fn submission_ref(id: u64, submission_type: SubmissionType) -> SubmissionRef {
  SubmissionRef {
    provider: SubmissionProvider::Gamebanana,
    submission_type,
    submission_id: id.to_string(),
  }
}

fn resumable_snapshot(
  mod_snapshot: &Option<String>,
  sound_snapshot: &Option<String>,
) -> Option<String> {
  match (mod_snapshot, sound_snapshot) {
    (Some(mod_snapshot), Some(sound_snapshot)) if mod_snapshot == sound_snapshot => {
      Some(mod_snapshot.clone())
    }
    (Some(snapshot), None) | (None, Some(snapshot)) => Some(snapshot.clone()),
    _ => None,
  }
}

fn new_snapshot_id() -> String {
  format!(
    "snapshot-{}",
    SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .unwrap_or_default()
      .as_nanos()
  )
}

fn unix_timestamp() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_secs()
}

#[cfg(test)]
mod tests {
  use super::{CatalogSource, CatalogSync, SourceFuture};
  use crate::errors::Error;
  use crate::providers::gamebanana::{BulkHydration, IndexPage};
  use crate::providers::{SubmissionRef, SubmissionType};
  use std::collections::VecDeque;
  use std::sync::Mutex;
  use tempfile::tempdir;
  use tokio_util::sync::CancellationToken;

  struct FakeSource {
    pages: Mutex<VecDeque<Result<IndexPage, Error>>>,
  }

  impl CatalogSource for FakeSource {
    fn index<'a>(
      &'a self,
      _submission_type: SubmissionType,
      _page: u32,
      _latest_modified: bool,
      _cancel: &'a CancellationToken,
    ) -> SourceFuture<'a, IndexPage> {
      Box::pin(async move { self.pages.lock().unwrap().pop_front().unwrap() })
    }

    fn bulk_hydrate<'a>(
      &'a self,
      submissions: &'a [SubmissionRef],
      _cancel: &'a CancellationToken,
    ) -> SourceFuture<'a, Vec<Option<BulkHydration>>> {
      Box::pin(async move {
        Ok(
          submissions
            .iter()
            .map(|submission| BulkHydration {
              name: format!("Submission {}", submission.submission_id),
              download_count: 5,
              category: "Drifter".to_string(),
              root_category: "Skins".to_string(),
              is_nsfw: false,
              description: String::new(),
              text: "hydrated text".to_string(),
            })
            .map(Some)
            .collect(),
        )
      })
    }
  }

  fn page(id: u64, complete: bool) -> IndexPage {
    serde_json::from_value(serde_json::json!({
      "_aMetadata": {
        "_nRecordCount": 1,
        "_nPerpage": 1,
        "_bIsComplete": complete
      },
      "_aRecords": [{
        "_idRow": id,
        "_sModelName": "Mod",
        "_sName": format!("Submission {id}"),
        "_sProfileUrl": format!("https://gamebanana.com/mods/{id}"),
        "_tsDateModified": id
      }]
    }))
    .unwrap()
  }

  fn page_with_modified(ids: &[(u64, i64)], complete: bool) -> IndexPage {
    let records = ids
      .iter()
      .map(|(id, modified)| {
        serde_json::json!({
          "_idRow": id,
          "_sModelName": "Mod",
          "_sName": format!("Submission {id}"),
          "_sProfileUrl": format!("https://gamebanana.com/mods/{id}"),
          "_tsDateModified": modified
        })
      })
      .collect::<Vec<_>>();
    serde_json::from_value(serde_json::json!({
      "_aMetadata": {
        "_nRecordCount": records.len(),
        "_nPerpage": records.len(),
        "_bIsComplete": complete
      },
      "_aRecords": records
    }))
    .unwrap()
  }

  #[tokio::test]
  async fn interrupted_full_sync_resumes_from_the_committed_page() {
    let directory = tempdir().unwrap();
    let catalog = super::Catalog::open(directory.path().join("catalog.sqlite3"), 2)
      .await
      .unwrap();
    let first_source = FakeSource {
      pages: Mutex::new(VecDeque::from([
        Ok(page(1, false)),
        Err(Error::ProviderUnavailable("offline".to_string())),
      ])),
    };
    let sync = CatalogSync::with_source(catalog.clone(), first_source);
    assert!(sync.full_sync(&CancellationToken::new()).await.is_err());
    assert_eq!(catalog.count_visible().await.unwrap(), 1);
    assert_eq!(
      catalog.cursor(SubmissionType::Mod).await.unwrap().next_page,
      2
    );

    let resumed_source = FakeSource {
      pages: Mutex::new(VecDeque::from([Ok(page(2, true)), Ok(page(3, true))])),
    };
    let sync = CatalogSync::with_source(catalog.clone(), resumed_source);
    sync.full_sync(&CancellationToken::new()).await.unwrap();
    assert_eq!(catalog.count_visible().await.unwrap(), 3);
    assert!(
      catalog
        .cursor(SubmissionType::Mod)
        .await
        .unwrap()
        .snapshot_id
        .is_none()
    );
  }

  #[tokio::test]
  async fn incremental_sync_overlaps_the_high_water_mark_and_throttles() {
    let directory = tempdir().unwrap();
    let catalog = super::Catalog::open(directory.path().join("catalog.sqlite3"), 2)
      .await
      .unwrap();
    catalog
      .set_high_water_mark(SubmissionType::Mod, 100)
      .await
      .unwrap();
    let source = FakeSource {
      pages: Mutex::new(VecDeque::from([
        Ok(page_with_modified(&[(11, 110), (10, 100)], false)),
        Ok(page_with_modified(&[(9, 90)], false)),
        Ok(page_with_modified(&[(20, 120)], true)),
      ])),
    };
    let sync = CatalogSync::with_source(catalog.clone(), source);

    assert_eq!(
      sync
        .incremental_sync(true, &CancellationToken::new())
        .await
        .unwrap(),
      super::SyncOutcome::Incremental
    );
    assert_eq!(
      catalog
        .cursor(SubmissionType::Mod)
        .await
        .unwrap()
        .high_water_mark,
      110
    );
    assert_eq!(
      sync
        .incremental_sync(false, &CancellationToken::new())
        .await
        .unwrap(),
      super::SyncOutcome::Throttled
    );
  }
}
