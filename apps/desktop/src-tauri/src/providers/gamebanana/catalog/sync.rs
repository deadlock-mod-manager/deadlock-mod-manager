use super::store::{Catalog, CatalogRecord, INCOMPLETE_SNAPSHOT};
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
const LAST_INCOMPLETE_SNAPSHOT_AT: &str = "last_incomplete_snapshot_at";
const PREVIEW_IMAGES_VERSION: &str = "preview_images_v1";
const INCOMPLETE_RETRY_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);

type SourceFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, Error>> + Send + 'a>>;

trait CatalogSource: Send + Sync {
  fn record_counts<'a>(&'a self, cancel: &'a CancellationToken) -> SourceFuture<'a, [u64; 2]>;

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
  fn record_counts<'a>(&'a self, cancel: &'a CancellationToken) -> SourceFuture<'a, [u64; 2]> {
    Box::pin(async move {
      let mods = self.index(SubmissionType::Mod, 1, false, cancel).await?;
      let sounds = self.index(SubmissionType::Sound, 1, false, cancel).await?;
      Ok([mods.metadata.record_count, sounds.metadata.record_count])
    })
  }

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
  progress: tokio::sync::Mutex<(Option<String>, Option<u32>)>,
}

impl CatalogSync {
  pub fn new(catalog: Catalog, source: GameBananaClient) -> Self {
    Self {
      catalog,
      source: Box::new(source),
      sync_lock: tokio::sync::Mutex::new(()),
      progress: tokio::sync::Mutex::new((None, None)),
    }
  }

  #[cfg(test)]
  fn with_source(catalog: Catalog, source: impl CatalogSource + 'static) -> Self {
    Self {
      catalog,
      source: Box::new(source),
      sync_lock: tokio::sync::Mutex::new(()),
      progress: tokio::sync::Mutex::new((None, None)),
    }
  }

  pub async fn synchronize(
    &self,
    force_refresh: bool,
    force_reconcile: bool,
    cancel: &CancellationToken,
  ) -> Result<SyncOutcome, Error> {
    let _sync_guard = self.sync_lock.lock().await;
    *self.progress.lock().await = (None, None);
    let result = self.run_sync(force_refresh, force_reconcile, cancel).await;
    *self.progress.lock().await = (None, None);
    result
  }

  pub async fn progress(&self) -> (Option<String>, Option<u32>) {
    self.progress.lock().await.clone()
  }

  async fn report_progress(&self, submission_type: SubmissionType, percentage: Option<u32>) {
    let phase = match submission_type {
      SubmissionType::Mod => "mods",
      SubmissionType::Sound => "sounds",
    };
    *self.progress.lock().await = (Some(phase.to_string()), percentage);
  }

  async fn run_sync(
    &self,
    force_refresh: bool,
    force_reconcile: bool,
    cancel: &CancellationToken,
  ) -> Result<SyncOutcome, Error> {
    // A completed but malformed snapshot retains cached entries. Avoid crawling
    // the same malformed index again on every catalog request, including when
    // the catalog is empty or its last successful full sync is overdue.
    if !force_reconcile && self.catalog.state(INCOMPLETE_SNAPSHOT).await?.is_some() {
      let last_attempt = self
        .catalog
        .state(LAST_INCOMPLETE_SNAPSHOT_AT)
        .await?
        .and_then(|value| value.parse::<u64>().ok());
      if last_attempt.is_some_and(|last| {
        unix_timestamp().saturating_sub(last) < INCOMPLETE_RETRY_INTERVAL.as_secs()
      }) {
        return Ok(SyncOutcome::Throttled);
      }
    }
    if force_reconcile
      || self
        .catalog
        .cursor(SubmissionType::Mod)
        .await?
        .snapshot_id
        .is_some()
      || self
        .catalog
        .cursor(SubmissionType::Sound)
        .await?
        .snapshot_id
        .is_some()
      || self.catalog.state(INCOMPLETE_SNAPSHOT).await?.is_some()
      || self.catalog.count_visible().await? == 0
      || self.full_reconciliation_due().await?
      || self.catalog.state(PREVIEW_IMAGES_VERSION).await?.is_none()
    {
      self.full_sync(cancel).await?;
      return Ok(SyncOutcome::Full);
    }

    self.incremental_sync(force_refresh, cancel).await
  }

  pub async fn clear(&self) -> Result<(), Error> {
    let _sync_guard = self.sync_lock.lock().await;
    self.catalog.clear().await
  }

  async fn full_sync(&self, cancel: &CancellationToken) -> Result<(), Error> {
    let counts = self.source.record_counts(cancel).await?;
    let total = counts[0].saturating_add(counts[1]);
    let mut completed = 0_u64;
    let mod_cursor = self.catalog.cursor(SubmissionType::Mod).await?;
    let sound_cursor = self.catalog.cursor(SubmissionType::Sound).await?;
    let snapshot_id = resumable_snapshot(&mod_cursor.snapshot_id, &sound_cursor.snapshot_id)
      .unwrap_or_else(new_snapshot_id);

    for (submission_type, count) in [SubmissionType::Mod, SubmissionType::Sound]
      .into_iter()
      .zip(counts)
    {
      let cursor = self.catalog.cursor(submission_type).await?;
      if cursor.snapshot_id.as_deref() == Some(snapshot_id.as_str()) && cursor.snapshot_complete {
        completed = completed.saturating_add(count);
        continue;
      }
      let mut page_number = if cursor.snapshot_id.as_deref() == Some(snapshot_id.as_str()) {
        cursor.next_page
      } else {
        1
      };

      self
        .report_progress(submission_type, catalog_percentage(completed, total))
        .await;

      loop {
        let page = self
          .source
          .index(submission_type, page_number, false, cancel)
          .await?;
        self
          .report_progress(
            submission_type,
            catalog_percentage(
              completed.saturating_add(
                (u64::from(page_number.saturating_sub(1)) * u64::from(page.metadata.per_page))
                  .min(count),
              ),
              total,
            ),
          )
          .await;
        let index_records = page.valid_records();
        if index_records.len() != page.records.len() {
          self
            .catalog
            .set_state(INCOMPLETE_SNAPSHOT, snapshot_id.clone())
            .await?;
          log::warn!(
            "GameBanana index skipped invalid records; retaining unseen catalog entries for this snapshot"
          );
        }
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

        self
          .report_progress(
            submission_type,
            catalog_percentage(
              completed.saturating_add(if page.metadata.is_complete {
                count
              } else {
                (u64::from(page_number) * u64::from(page.metadata.per_page)).min(count)
              }),
              total,
            ),
          )
          .await;
        if page.metadata.is_complete {
          break;
        }
        page_number = page_number.saturating_add(1);
      }
      completed = completed.saturating_add(count);
    }

    self.catalog.complete_snapshot(snapshot_id).await?;
    if self.catalog.state(INCOMPLETE_SNAPSHOT).await?.is_none() {
      self
        .catalog
        .set_state(LAST_FULL_SYNC_AT, unix_timestamp().to_string())
        .await?;
      self
        .catalog
        .set_state(PREVIEW_IMAGES_VERSION, "1".to_string())
        .await?;
    } else {
      self
        .catalog
        .set_state(LAST_INCOMPLETE_SNAPSHOT_AT, unix_timestamp().to_string())
        .await?;
    }
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
      self.report_progress(submission_type, None).await;
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

fn catalog_percentage(completed: u64, total: u64) -> Option<u32> {
  if total == 0 {
    return None;
  }
  Some((completed.saturating_mul(100) / total).min(99) as u32)
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
    likes: record.likes,
    images: record.preview_media.image_urls(),
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
  #[test]
  fn progress_weights_mods_and_sounds_by_their_combined_record_count() {
    let mods = 800;
    let sounds = 200;
    let total = mods + sounds;
    assert_eq!(super::catalog_percentage(0, total), Some(0));
    assert_eq!(super::catalog_percentage(400, total), Some(40));
    assert_eq!(super::catalog_percentage(mods, total), Some(80));
    assert_eq!(super::catalog_percentage(mods + 100, total), Some(90));
    assert_eq!(super::catalog_percentage(total, total), Some(99));
    assert_eq!(super::catalog_percentage(0, 0), None);
  }

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
    fn record_counts<'a>(&'a self, _cancel: &'a CancellationToken) -> SourceFuture<'a, [u64; 2]> {
      Box::pin(async { Ok([800, 200]) })
    }

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
    catalog
      .set_state(
        super::LAST_FULL_SYNC_AT,
        super::unix_timestamp().to_string(),
      )
      .await
      .unwrap();
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
    assert_eq!(
      sync
        .synchronize(false, false, &CancellationToken::new())
        .await
        .unwrap(),
      super::SyncOutcome::Full
    );
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
  async fn malformed_rows_do_not_tombstone_cached_entries_after_resuming() {
    let directory = tempdir().unwrap();
    let catalog = super::Catalog::open(directory.path().join("catalog.sqlite3"), 2)
      .await
      .unwrap();
    let initial = CatalogSync::with_source(
      catalog.clone(),
      FakeSource {
        pages: Mutex::new(VecDeque::from([Ok(page(1, true)), Ok(page(4, true))])),
      },
    );
    initial.full_sync(&CancellationToken::new()).await.unwrap();

    let mut malformed = page(2, false);
    malformed.records.push(serde_json::json!({
      "_idRow": 1,
      "_sModelName": "Mod",
      "_sName": []
    }));
    let interrupted = CatalogSync::with_source(
      catalog.clone(),
      FakeSource {
        pages: Mutex::new(VecDeque::from([
          Ok(malformed),
          Err(Error::ProviderUnavailable("offline".to_string())),
        ])),
      },
    );
    assert!(
      interrupted
        .full_sync(&CancellationToken::new())
        .await
        .is_err()
    );

    let resumed = CatalogSync::with_source(
      catalog.clone(),
      FakeSource {
        pages: Mutex::new(VecDeque::from([Ok(page(3, true)), Ok(page(4, true))])),
      },
    );
    resumed.full_sync(&CancellationToken::new()).await.unwrap();
    assert_eq!(catalog.count_visible().await.unwrap(), 4);
    assert!(
      catalog
        .state(super::INCOMPLETE_SNAPSHOT)
        .await
        .unwrap()
        .is_some()
    );

    let throttled = CatalogSync::with_source(
      catalog.clone(),
      FakeSource {
        pages: Mutex::new(VecDeque::new()),
      },
    );
    assert_eq!(
      throttled
        .synchronize(false, false, &CancellationToken::new())
        .await
        .unwrap(),
      super::SyncOutcome::Throttled
    );
    assert_eq!(
      throttled
        .synchronize(true, false, &CancellationToken::new())
        .await
        .unwrap(),
      super::SyncOutcome::Throttled
    );
    // Expire only the retry timestamp, without waiting in the test.
    catalog
      .set_state(super::LAST_INCOMPLETE_SNAPSHOT_AT, "0".to_string())
      .await
      .unwrap();

    let clean = CatalogSync::with_source(
      catalog.clone(),
      FakeSource {
        pages: Mutex::new(VecDeque::from([Ok(page(2, true)), Ok(page(4, true))])),
      },
    );
    assert_eq!(
      clean
        .synchronize(false, false, &CancellationToken::new())
        .await
        .unwrap(),
      super::SyncOutcome::Full
    );
    assert_eq!(catalog.count_visible().await.unwrap(), 2);
    assert_eq!(
      catalog.state(super::INCOMPLETE_SNAPSHOT).await.unwrap(),
      None
    );
  }

  #[tokio::test]
  async fn incomplete_empty_catalog_retries_are_persisted_and_explicitly_overridable() {
    let directory = tempdir().unwrap();
    let catalog = super::Catalog::open(directory.path().join("catalog.sqlite3"), 2)
      .await
      .unwrap();
    let mut malformed = page(1, true);
    malformed.records = vec![serde_json::json!({"_idRow": "invalid"})];
    let sync = CatalogSync::with_source(
      catalog.clone(),
      FakeSource {
        pages: Mutex::new(VecDeque::from([Ok(malformed.clone()), Ok(malformed)])),
      },
    );
    sync
      .synchronize(false, false, &CancellationToken::new())
      .await
      .unwrap();
    assert_eq!(catalog.count_visible().await.unwrap(), 0);
    assert!(
      catalog
        .state(super::LAST_FULL_SYNC_AT)
        .await
        .unwrap()
        .is_none()
    );
    drop(sync);
    // A fresh synchronizer reads the persisted backoff and makes no request.
    let restarted = CatalogSync::with_source(
      catalog.clone(),
      FakeSource {
        pages: Mutex::new(VecDeque::from([Ok(page(2, true)), Ok(page(4, true))])),
      },
    );
    assert_eq!(
      restarted
        .synchronize(false, false, &CancellationToken::new())
        .await
        .unwrap(),
      super::SyncOutcome::Throttled
    );
    assert_eq!(
      restarted
        .synchronize(false, true, &CancellationToken::new())
        .await
        .unwrap(),
      super::SyncOutcome::Full
    );
    assert!(
      catalog
        .state(super::INCOMPLETE_SNAPSHOT)
        .await
        .unwrap()
        .is_none()
    );
    assert!(
      catalog
        .state(super::LAST_FULL_SYNC_AT)
        .await
        .unwrap()
        .is_some()
    );
    assert_eq!(catalog.count_visible().await.unwrap(), 2);
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

  fn page_with_preview(id: u64) -> IndexPage {
    serde_json::from_value(serde_json::json!({
      "_aMetadata": {
        "_nRecordCount": 1,
        "_nPerpage": 1,
        "_bIsComplete": true
      },
      "_aRecords": [{
        "_idRow": id,
        "_sModelName": "Mod",
        "_sName": format!("Submission {id}"),
        "_sProfileUrl": format!("https://gamebanana.com/mods/{id}"),
        "_nLikeCount": 7,
        "_aPreviewMedia": {
          "_aImages": [{
            "_sBaseUrl": "https://images.gamebanana.com/img/ss/mods",
            "_sFile": format!("{id}.jpg")
          }]
        }
      }]
    }))
    .unwrap()
  }

  #[tokio::test]
  async fn completed_catalog_recrawls_once_to_backfill_preview_images() {
    let directory = tempdir().unwrap();
    let catalog = super::Catalog::open(directory.path().join("catalog.sqlite3"), 2)
      .await
      .unwrap();
    catalog
      .upsert_records(vec![super::from_index(
        &page(11, true).valid_records()[0],
        SubmissionType::Mod,
        None,
      )])
      .await
      .unwrap();
    catalog
      .set_state(
        super::LAST_FULL_SYNC_AT,
        super::unix_timestamp().to_string(),
      )
      .await
      .unwrap();

    let sync = CatalogSync::with_source(
      catalog.clone(),
      FakeSource {
        pages: Mutex::new(VecDeque::from([
          Ok(page_with_preview(11)),
          Ok(page(12, true)),
        ])),
      },
    );
    assert_eq!(
      sync
        .synchronize(false, false, &CancellationToken::new())
        .await
        .unwrap(),
      super::SyncOutcome::Full
    );
    let stored = catalog
      .get(SubmissionRef::parse_slug("11").unwrap())
      .await
      .unwrap()
      .unwrap();
    assert_eq!(
      stored.images,
      ["https://images.gamebanana.com/img/ss/mods/11.jpg"]
    );
    assert_eq!(stored.likes, 7);
    assert_eq!(
      catalog
        .state(super::PREVIEW_IMAGES_VERSION)
        .await
        .unwrap()
        .as_deref(),
      Some("1")
    );

    catalog
      .set_state(
        super::LAST_INCREMENTAL_AT,
        super::unix_timestamp().to_string(),
      )
      .await
      .unwrap();
    let throttled = CatalogSync::with_source(
      catalog.clone(),
      FakeSource {
        pages: Mutex::new(VecDeque::new()),
      },
    );
    assert_eq!(
      throttled
        .synchronize(false, false, &CancellationToken::new())
        .await
        .unwrap(),
      super::SyncOutcome::Throttled
    );
  }
}
