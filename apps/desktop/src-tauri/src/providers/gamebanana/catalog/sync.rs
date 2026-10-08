use super::store::{Catalog, CatalogRecord, INCOMPLETE_SNAPSHOT};
use crate::errors::Error;
use crate::providers::gamebanana::client::MAX_HYDRATION_ITEMS;
use crate::providers::gamebanana::hero_registry;
use crate::providers::gamebanana::{
  BulkHydration, GameBananaClient, IndexPage, is_nsfw_visibility, parse_tags,
};
use crate::providers::{SubmissionProvider, SubmissionRef, SubmissionType};
use std::future::Future;
use std::pin::Pin;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio_util::sync::CancellationToken;

const INCREMENTAL_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);
const FULL_RECONCILIATION_INTERVAL: Duration = Duration::from_secs(7 * 24 * 60 * 60);
const LAST_INCREMENTAL_AT: &str = "last_incremental_at";
const LAST_FULL_SYNC_AT: &str = "last_full_sync_at";
const LAST_INCOMPLETE_SNAPSHOT_AT: &str = "last_incomplete_snapshot_at";
const PREVIEW_IMAGES_VERSION: &str = "preview_images_v1";
const HYDRATION_VERSION: &str = "bulk_hydration_v2";
const THUMBNAILS_VERSION: &str = "thumbnails_v1";
const AUTHOR_REMOTE_ID_VERSION: &str = "author_remote_id_v1";
// Bumping any of these forces one full resync to backfill existing catalogs.
const BACKFILL_VERSIONS: [&str; 4] = [
  PREVIEW_IMAGES_VERSION,
  HYDRATION_VERSION,
  THUMBNAILS_VERSION,
  AUTHOR_REMOTE_ID_VERSION,
];
const INCOMPLETE_RETRY_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);
// Private or trashed submissions legitimately hydrate to nothing; more than this means
// hydration itself is failing and the snapshot must not be trusted.
const MAX_UNHYDRATED_PERCENT: u64 = 5;
const UNHYDRATED_ALLOWANCE: u64 = 25;
// Rows a crawl missed are re-checked before tombstoning; more misses than this mean the
// crawl itself went wrong.
const MAX_TOMBSTONE_CONFIRMATIONS: usize = 400;
// Sync runs once per launch, so a rate limit that aborted it would stall the crawl until
// the next launch. Wait it out a few times instead.
const MAX_RATE_LIMIT_WAITS: u32 = 5;
const MAX_RATE_LIMIT_WAIT: Duration = Duration::from_secs(5 * 60);

type SourceFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, Error>> + Send + 'a>>;

trait CatalogSource: Send + Sync {
  fn record_counts<'a>(&'a self, cancel: &'a CancellationToken) -> SourceFuture<'a, [u64; 3]>;

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
  fn record_counts<'a>(&'a self, cancel: &'a CancellationToken) -> SourceFuture<'a, [u64; 3]> {
    Box::pin(async move {
      let mut counts = [0; 3];
      for (count, submission_type) in counts.iter_mut().zip(SubmissionType::ALL) {
        *count = self
          .index(submission_type, 1, false, cancel)
          .await?
          .metadata
          .record_count;
      }
      Ok(counts)
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
    *self.progress.lock().await = (
      Some(submission_type.gamebanana_path().to_string()),
      percentage,
    );
  }

  async fn run_sync(
    &self,
    force_refresh: bool,
    force_reconcile: bool,
    cancel: &CancellationToken,
  ) -> Result<SyncOutcome, Error> {
    let incomplete = self.catalog.state(INCOMPLETE_SNAPSHOT).await?.is_some();
    let full_sync_due = force_reconcile
      || incomplete
      || self.snapshot_in_progress().await?
      || self.catalog.count_visible().await? == 0
      || self.full_reconciliation_due().await?
      || self.backfill_due().await?;
    if full_sync_due && (force_reconcile || !incomplete || self.incomplete_retry_due().await?) {
      self.full_sync(cancel).await?;
      return Ok(SyncOutcome::Full);
    }

    // While an incomplete crawl waits to be retried, new uploads still arrive incrementally.
    self.incremental_sync(force_refresh, cancel).await
  }

  pub async fn clear(&self) -> Result<(), Error> {
    let _sync_guard = self.sync_lock.lock().await;
    self.catalog.clear().await
  }

  async fn incomplete_retry_due(&self) -> Result<bool, Error> {
    let last_attempt = self
      .catalog
      .state(LAST_INCOMPLETE_SNAPSHOT_AT)
      .await?
      .and_then(|value| value.parse::<u64>().ok());
    Ok(last_attempt.is_none_or(|last| {
      unix_timestamp().saturating_sub(last) >= INCOMPLETE_RETRY_INTERVAL.as_secs()
    }))
  }

  async fn snapshot_in_progress(&self) -> Result<bool, Error> {
    for submission_type in SubmissionType::ALL {
      if self
        .catalog
        .cursor(submission_type)
        .await?
        .snapshot_id
        .is_some()
      {
        return Ok(true);
      }
    }
    Ok(false)
  }

  async fn full_sync(&self, cancel: &CancellationToken) -> Result<(), Error> {
    let counts = self
      .patiently(cancel, || self.source.record_counts(cancel))
      .await?;
    let total = counts.iter().sum();
    let mut completed = 0_u64;
    let mut cursor_snapshots = Vec::with_capacity(SubmissionType::ALL.len());
    for submission_type in SubmissionType::ALL {
      cursor_snapshots.push(self.catalog.cursor(submission_type).await?.snapshot_id);
    }
    let snapshot_id = resumable_snapshot(&cursor_snapshots).unwrap_or_else(new_snapshot_id);

    for (submission_type, count) in SubmissionType::ALL.into_iter().zip(counts) {
      let cursor = self.catalog.cursor(submission_type).await?;
      if cursor.snapshot_id.as_deref() == Some(snapshot_id.as_str()) && cursor.snapshot_complete {
        self
          .verify_snapshot_coverage(submission_type, &snapshot_id, count)
          .await?;
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

      let expected_records = loop {
        let page = self
          .patiently(cancel, || {
            self
              .source
              .index(submission_type, page_number, false, cancel)
          })
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
        // Hydrate before committing the cursor, so an aborted page is crawled again on resume.
        self
          .hydrate_records(
            &index_records,
            submission_type,
            Some(snapshot_id.clone()),
            cancel,
          )
          .await?;
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
          break page.metadata.record_count;
        }
        page_number = page_number.saturating_add(1);
      };
      self
        .verify_snapshot_coverage(submission_type, &snapshot_id, expected_records)
        .await?;
      completed = completed.saturating_add(count);
    }

    if self.catalog.state(INCOMPLETE_SNAPSHOT).await?.is_none() {
      self.confirm_unseen(&snapshot_id, cancel).await?;
    }
    self.catalog.complete_snapshot(snapshot_id).await?;
    if self.catalog.state(INCOMPLETE_SNAPSHOT).await?.is_none() {
      self
        .catalog
        .set_state(LAST_FULL_SYNC_AT, unix_timestamp().to_string())
        .await?;
      for version in BACKFILL_VERSIONS {
        self.catalog.set_state(version, "1".to_string()).await?;
      }
    } else {
      self
        .catalog
        .set_state(LAST_INCOMPLETE_SNAPSHOT_AT, unix_timestamp().to_string())
        .await?;
    }
    Ok(())
  }

  async fn backfill_due(&self) -> Result<bool, Error> {
    for version in BACKFILL_VERSIONS {
      if self.catalog.state(version).await?.is_none() {
        return Ok(true);
      }
    }
    Ok(false)
  }

  /// A crawl that saw fewer rows than GameBanana reports, or failed to hydrate them, must
  /// not tombstone the rows it missed or record the backfill as done.
  async fn verify_snapshot_coverage(
    &self,
    submission_type: SubmissionType,
    snapshot_id: &str,
    expected_records: u64,
  ) -> Result<(), Error> {
    let coverage = self
      .catalog
      .snapshot_coverage(submission_type, snapshot_id.to_string())
      .await?;
    let missed = coverage.seen < expected_records;
    let unhydrated = coverage.unhydrated
      > (coverage.seen * MAX_UNHYDRATED_PERCENT / 100).max(UNHYDRATED_ALLOWANCE);
    if missed || unhydrated {
      log::warn!(
        "GameBanana {submission_type:?} snapshot is incomplete: saw {} of {expected_records} records, {} unhydrated",
        coverage.seen,
        coverage.unhydrated
      );
      self.mark_incomplete(snapshot_id).await?;
    }
    Ok(())
  }

  /// Paging shifts when a submission disappears mid-crawl, so a row the crawl missed may
  /// still be live. Ask GameBanana about each one and keep those that still resolve.
  async fn confirm_unseen(
    &self,
    snapshot_id: &str,
    cancel: &CancellationToken,
  ) -> Result<(), Error> {
    for submission_type in SubmissionType::ALL {
      let unseen = self
        .catalog
        .unseen_submissions(submission_type, snapshot_id.to_string())
        .await?;
      if unseen.len() > MAX_TOMBSTONE_CONFIRMATIONS {
        log::warn!(
          "GameBanana {submission_type:?} crawl missed {} cached records; keeping them",
          unseen.len()
        );
        return self.mark_incomplete(snapshot_id).await;
      }
      for batch in unseen.chunks(MAX_HYDRATION_ITEMS) {
        let hydrated = match self
          .patiently(cancel, || self.source.bulk_hydrate(batch, cancel))
          .await
        {
          Ok(hydrated) => hydrated,
          Err(error) => {
            log::warn!("GameBanana could not confirm unseen {submission_type:?} records: {error}");
            return self.mark_incomplete(snapshot_id).await;
          }
        };
        let live = batch
          .iter()
          .zip(hydrated)
          .filter(|(_, hydration)| hydration.is_some())
          .map(|(submission, _)| submission.clone())
          .collect::<Vec<_>>();
        self
          .catalog
          .mark_seen(live, snapshot_id.to_string())
          .await?;
      }
    }
    Ok(())
  }

  async fn mark_incomplete(&self, snapshot_id: &str) -> Result<(), Error> {
    self
      .catalog
      .set_state(INCOMPLETE_SNAPSHOT, snapshot_id.to_string())
      .await
  }

  async fn patiently<'a, T>(
    &self,
    cancel: &CancellationToken,
    request: impl Fn() -> SourceFuture<'a, T>,
  ) -> Result<T, Error> {
    let mut waits = 0;
    loop {
      match request().await {
        Err(Error::ProviderRateLimited { retry_after_secs }) if waits < MAX_RATE_LIMIT_WAITS => {
          waits += 1;
          let delay = Duration::from_secs(retry_after_secs).min(MAX_RATE_LIMIT_WAIT);
          log::info!("GameBanana rate limited the catalog sync; resuming in {delay:?}");
          tokio::select! {
            () = tokio::time::sleep(delay) => {}
            () = cancel.cancelled() => return Err(Error::ProviderCancelled),
          }
        }
        result => return result,
      }
    }
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

    for submission_type in SubmissionType::ALL {
      let high_water_mark = self.catalog.cursor(submission_type).await?.high_water_mark;
      self.report_progress(submission_type, None).await;
      let mut newest = high_water_mark;
      let mut page_number = 1;
      loop {
        let page = self
          .patiently(cancel, || {
            self
              .source
              .index(submission_type, page_number, true, cancel)
          })
          .await?;
        let index_records = page.valid_records();
        if index_records.len() != page.records.len() {
          log::warn!(
            "GameBanana {submission_type:?} index skipped {} invalid records",
            page.records.len() - index_records.len()
          );
        }
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
        let records = index_records
          .iter()
          .map(|record| from_index(record, submission_type, None))
          .collect::<Vec<_>>();
        let pending = self
          .catalog
          .hydration_candidates(
            submission_type,
            records
              .iter()
              .map(|record| {
                (
                  record.submission.submission_id.clone(),
                  record.remote_updated_at,
                )
              })
              .collect(),
          )
          .await?;
        self.catalog.upsert_records(records).await?;
        let changed = index_records
          .into_iter()
          .filter(|record| pending.contains(&record.id.to_string()))
          .collect::<Vec<_>>();
        self
          .hydrate_records(&changed, submission_type, None, cancel)
          .await?;

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
  ) -> Result<(), Error> {
    for batch in index_records.chunks(MAX_HYDRATION_ITEMS) {
      let submissions = batch
        .iter()
        .map(|record| submission_ref(record.id, submission_type))
        .collect::<Vec<_>>();
      let hydrated = match self
        .patiently(cancel, || self.source.bulk_hydrate(&submissions, cancel))
        .await
      {
        Ok(hydrated) => hydrated,
        // Stop instead of hammering GameBanana; the sync resumes on the next run.
        Err(
          error @ (Error::ProviderCancelled
          | Error::ProviderRateLimited { .. }
          | Error::ProviderRefused),
        ) => return Err(error),
        Err(error) => {
          log::warn!("GameBanana catalog hydration failed: {error}");
          if let Some(snapshot_id) = &snapshot_id {
            self.mark_incomplete(snapshot_id).await?;
          }
          continue;
        }
      };
      let records = batch
        .iter()
        .zip(hydrated)
        .filter_map(|(index, hydration)| {
          hydration
            .map(|record| from_hydration(index, record, submission_type, snapshot_id.clone()))
        })
        .collect::<Vec<_>>();
      if records.is_empty() {
        log::warn!(
          "GameBanana {submission_type:?} hydration returned no usable records for a batch of {}",
          batch.len()
        );
      }
      if let Err(error) = self.catalog.upsert_records(records).await {
        log::warn!("GameBanana catalog hydration commit failed: {error}");
        if let Some(snapshot_id) = &snapshot_id {
          self.mark_incomplete(snapshot_id).await?;
        }
      }
    }
    Ok(())
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
      submission_type.gamebanana_path(),
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
    author_remote_id: record
      .submitter
      .as_ref()
      .and_then(|submitter| (submitter.id > 0).then(|| submitter.id.to_string())),
    description: String::new(),
    profile_url,
    category,
    hero: None,
    is_audio: submission_type == SubmissionType::Sound,
    is_map: false,
    is_nsfw: record
      .initial_visibility
      .as_deref()
      .is_some_and(is_nsfw_visibility),
    is_obsolete: record.is_obsolete,
    is_tombstoned: false,
    is_hydrated: false,
    has_files: record.has_files,
    download_count: 0,
    likes: record.likes,
    images: record.preview_media.image_urls(),
    thumbnail_url: record.preview_media.thumbnail_url(),
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
    audio_url: record.preview_media.audio_url(),
    tags: parse_tags(&record.tags),
    development_state: record.development_state.clone(),
    completion_percentage: record.completion_percentage,
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
  record.download_count = hydration.download_count;
  record.files_updated_at = hydration.files_updated_at.unwrap_or_default();
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

/// Resumes the in-progress snapshot only when every type that has one agrees on it.
fn resumable_snapshot(cursor_snapshots: &[Option<String>]) -> Option<String> {
  let mut snapshots = cursor_snapshots.iter().flatten();
  let first = snapshots.next()?;
  snapshots
    .all(|snapshot| snapshot == first)
    .then(|| first.clone())
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
  use std::collections::{HashSet, VecDeque};
  use std::sync::Mutex;
  use tempfile::tempdir;
  use tokio_util::sync::CancellationToken;

  /// Only submissions served by an index page are still live on the fake GameBanana.
  struct FakeSource {
    pages: Mutex<VecDeque<Result<IndexPage, Error>>>,
    served: Mutex<HashSet<String>>,
  }

  impl CatalogSource for FakeSource {
    fn record_counts<'a>(&'a self, _cancel: &'a CancellationToken) -> SourceFuture<'a, [u64; 3]> {
      Box::pin(async { Ok([800, 200, 0]) })
    }

    // Mods and sounds pop the queued pages in order; WIP indexes are always empty.
    fn index<'a>(
      &'a self,
      submission_type: SubmissionType,
      _page: u32,
      _latest_modified: bool,
      _cancel: &'a CancellationToken,
    ) -> SourceFuture<'a, IndexPage> {
      Box::pin(async move {
        if submission_type == SubmissionType::Wip {
          return Ok(empty_page());
        }
        let page = self.pages.lock().unwrap().pop_front().unwrap();
        if let Ok(page) = &page {
          let mut served = self.served.lock().unwrap();
          for record in page.valid_records() {
            served.insert(record.id.to_string());
          }
        }
        page
      })
    }

    fn bulk_hydrate<'a>(
      &'a self,
      submissions: &'a [SubmissionRef],
      _cancel: &'a CancellationToken,
    ) -> SourceFuture<'a, Vec<Option<BulkHydration>>> {
      let served = self.served.lock().unwrap().clone();
      Box::pin(async move {
        Ok(
          submissions
            .iter()
            .map(|submission| {
              served
                .contains(&submission.submission_id)
                .then(|| BulkHydration {
                  name: format!("Submission {}", submission.submission_id),
                  download_count: 5,
                  category: "Drifter".to_string(),
                  root_category: "Skins".to_string(),
                  description: String::new(),
                  text: "hydrated text".to_string(),
                  files_updated_at: Some(42),
                })
            })
            .collect(),
        )
      })
    }
  }

  /// Serves the same index as `FakeSource` but every bulk request fails, like a broken endpoint.
  struct UnhydratedSource(FakeSource);

  impl CatalogSource for UnhydratedSource {
    fn record_counts<'a>(&'a self, cancel: &'a CancellationToken) -> SourceFuture<'a, [u64; 3]> {
      self.0.record_counts(cancel)
    }

    fn index<'a>(
      &'a self,
      submission_type: SubmissionType,
      page: u32,
      latest_modified: bool,
      cancel: &'a CancellationToken,
    ) -> SourceFuture<'a, IndexPage> {
      self.0.index(submission_type, page, latest_modified, cancel)
    }

    fn bulk_hydrate<'a>(
      &'a self,
      submissions: &'a [SubmissionRef],
      _cancel: &'a CancellationToken,
    ) -> SourceFuture<'a, Vec<Option<BulkHydration>>> {
      Box::pin(async move {
        Err(Error::ProviderInvalidResponse(format!(
          "bulk hydration returned 0 records for {} submissions",
          submissions.len()
        )))
      })
    }
  }

  fn empty_page() -> IndexPage {
    serde_json::from_value(serde_json::json!({
      "_aMetadata": {"_nRecordCount": 0, "_nPerpage": 50, "_bIsComplete": true},
      "_aRecords": []
    }))
    .unwrap()
  }

  #[tokio::test]
  async fn crawl_that_misses_reported_records_does_not_tombstone() {
    let directory = tempdir().unwrap();
    let catalog = super::Catalog::open(directory.path().join("catalog.sqlite3"), 2)
      .await
      .unwrap();
    CatalogSync::with_source(
      catalog.clone(),
      FakeSource {
        served: Mutex::default(),
        pages: Mutex::new(VecDeque::from([Ok(page(1, true)), Ok(page(2, true))])),
      },
    )
    .full_sync(&CancellationToken::new())
    .await
    .unwrap();
    let mut short_page = page(3, true);
    short_page.metadata.record_count = 2;

    // GameBanana reports two mods but the crawl only sees one, as when pages shift mid-crawl.
    CatalogSync::with_source(
      catalog.clone(),
      FakeSource {
        served: Mutex::default(),
        pages: Mutex::new(VecDeque::from([Ok(short_page), Ok(page(2, true))])),
      },
    )
    .full_sync(&CancellationToken::new())
    .await
    .unwrap();

    assert_eq!(catalog.count_visible().await.unwrap(), 3);
    assert!(
      catalog
        .state(super::INCOMPLETE_SNAPSHOT)
        .await
        .unwrap()
        .is_some()
    );
  }

  #[tokio::test]
  async fn rows_missed_by_a_shifting_crawl_survive_when_still_live() {
    let directory = tempdir().unwrap();
    let catalog = super::Catalog::open(directory.path().join("catalog.sqlite3"), 2)
      .await
      .unwrap();
    CatalogSync::with_source(
      catalog.clone(),
      FakeSource {
        served: Mutex::default(),
        pages: Mutex::new(VecDeque::from([
          Ok(page_with_modified(&[(1, 1), (2, 1)], true)),
          Ok(page(9, true)),
        ])),
      },
    )
    .full_sync(&CancellationToken::new())
    .await
    .unwrap();

    // Mod 2 is still live on GameBanana but slipped between pages on this crawl;
    // mod 1 was deleted.
    CatalogSync::with_source(
      catalog.clone(),
      FakeSource {
        served: Mutex::new(HashSet::from(["2".to_string()])),
        pages: Mutex::new(VecDeque::from([Ok(page(3, true)), Ok(page(9, true))])),
      },
    )
    .full_sync(&CancellationToken::new())
    .await
    .unwrap();

    let visible = catalog
      .query(super::super::CatalogQuery {
        page_size: 50,
        ..super::super::CatalogQuery::default()
      })
      .await
      .unwrap();
    let mut slugs = visible
      .items
      .iter()
      .map(|item| item.submission.to_slug().unwrap())
      .collect::<Vec<_>>();
    slugs.sort();
    assert_eq!(slugs, ["2", "3", "snd-9"]);
  }

  #[tokio::test]
  async fn rate_limited_crawl_waits_and_continues() {
    let directory = tempdir().unwrap();
    let catalog = super::Catalog::open(directory.path().join("catalog.sqlite3"), 2)
      .await
      .unwrap();

    CatalogSync::with_source(
      catalog.clone(),
      FakeSource {
        served: Mutex::default(),
        pages: Mutex::new(VecDeque::from([
          Err(Error::ProviderRateLimited {
            retry_after_secs: 0,
          }),
          Ok(page(1, true)),
          Ok(page(2, true)),
        ])),
      },
    )
    .full_sync(&CancellationToken::new())
    .await
    .unwrap();

    assert_eq!(catalog.count_visible().await.unwrap(), 2);
    assert_eq!(
      catalog
        .state(super::HYDRATION_VERSION)
        .await
        .unwrap()
        .as_deref(),
      Some("1")
    );
  }

  #[tokio::test]
  async fn failed_hydration_does_not_complete_the_backfill() {
    let directory = tempdir().unwrap();
    let catalog = super::Catalog::open(directory.path().join("catalog.sqlite3"), 2)
      .await
      .unwrap();

    CatalogSync::with_source(
      catalog.clone(),
      UnhydratedSource(FakeSource {
        served: Mutex::default(),
        pages: Mutex::new(VecDeque::from([Ok(page(1, true)), Ok(page(2, true))])),
      }),
    )
    .full_sync(&CancellationToken::new())
    .await
    .unwrap();

    assert!(
      catalog
        .state(super::INCOMPLETE_SNAPSHOT)
        .await
        .unwrap()
        .is_some()
    );
    assert!(
      catalog
        .state(super::HYDRATION_VERSION)
        .await
        .unwrap()
        .is_none()
    );
  }

  #[test]
  fn index_rows_carry_visibility_nsfw_tags_audio_and_wip_state() {
    let page: IndexPage = serde_json::from_value(serde_json::json!({
      "_aRecords": [{
        "_idRow": 103122,
        "_sModelName": "Wip",
        "_sName": "Projeto Dublalock",
        "_sProfileUrl": "https://gamebanana.com/wips/103122",
        "_sInitialVisibility": "warn",
        "_aTags": ["Software Used: Audacity", {"_sTitle": "Hero", "_sValue": "Billy"}, 7],
        "_sDevelopmentState": "In Development",
        "_iCompletionPercentage": 3,
        "_aPreviewMedia": {"_aMetadata": {"_sAudioUrl": "https://files.gamebanana.com/a.mp3"}}
      }]
    }))
    .unwrap();
    let record = super::from_index(&page.valid_records()[0], SubmissionType::Wip, None);

    assert_eq!(record.submission.to_slug().unwrap(), "wip-103122");
    assert!(record.is_nsfw);
    assert_eq!(record.tags, ["Software Used: Audacity", "Hero Billy"]);
    assert_eq!(
      record.audio_url.as_deref(),
      Some("https://files.gamebanana.com/a.mp3")
    );
    assert_eq!(record.development_state.as_deref(), Some("In Development"));
    assert_eq!(record.completion_percentage, Some(3));
  }

  #[test]
  fn snapshots_resume_only_when_every_cursor_agrees() {
    let a = Some("snapshot-a".to_string());
    let b = Some("snapshot-b".to_string());
    assert_eq!(super::resumable_snapshot(&[a.clone(), None, a.clone()]), a);
    assert_eq!(super::resumable_snapshot(&[a, None, b]), None);
    assert_eq!(super::resumable_snapshot(&[None, None, None]), None);
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
      served: Mutex::default(),
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
      served: Mutex::default(),
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
        served: Mutex::default(),
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
        served: Mutex::default(),
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
        served: Mutex::default(),
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
        served: Mutex::default(),
        pages: Mutex::new(VecDeque::from([Ok(page(3, true)), Ok(page(4, true))])),
      },
    );
    assert_eq!(
      throttled
        .synchronize(false, false, &CancellationToken::new())
        .await
        .unwrap(),
      super::SyncOutcome::Throttled
    );
    // The full retry stays throttled, but new uploads still arrive incrementally.
    assert_eq!(
      throttled
        .synchronize(true, false, &CancellationToken::new())
        .await
        .unwrap(),
      super::SyncOutcome::Incremental
    );
    // Expire only the retry timestamp, without waiting in the test.
    catalog
      .set_state(super::LAST_INCOMPLETE_SNAPSHOT_AT, "0".to_string())
      .await
      .unwrap();

    let clean = CatalogSync::with_source(
      catalog.clone(),
      FakeSource {
        served: Mutex::default(),
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
        served: Mutex::default(),
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
    // A fresh synchronizer reads the persisted backoff and only syncs incrementally.
    let restarted = CatalogSync::with_source(
      catalog.clone(),
      FakeSource {
        served: Mutex::default(),
        pages: Mutex::new(VecDeque::from([
          Ok(page(2, true)),
          Ok(page(4, true)),
          Ok(page(2, true)),
          Ok(page(4, true)),
        ])),
      },
    );
    assert_eq!(
      restarted
        .synchronize(false, false, &CancellationToken::new())
        .await
        .unwrap(),
      super::SyncOutcome::Incremental
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
      served: Mutex::default(),
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

  struct TrackingSource {
    source: FakeSource,
    hydrated: std::sync::Arc<Mutex<Vec<String>>>,
  }

  impl CatalogSource for TrackingSource {
    fn record_counts<'a>(&'a self, cancel: &'a CancellationToken) -> SourceFuture<'a, [u64; 3]> {
      self.source.record_counts(cancel)
    }

    fn index<'a>(
      &'a self,
      submission_type: SubmissionType,
      page: u32,
      latest_modified: bool,
      cancel: &'a CancellationToken,
    ) -> SourceFuture<'a, IndexPage> {
      self
        .source
        .index(submission_type, page, latest_modified, cancel)
    }

    fn bulk_hydrate<'a>(
      &'a self,
      submissions: &'a [SubmissionRef],
      cancel: &'a CancellationToken,
    ) -> SourceFuture<'a, Vec<Option<BulkHydration>>> {
      self
        .hydrated
        .lock()
        .unwrap()
        .extend(submissions.iter().map(|entry| entry.to_slug().unwrap()));
      self.source.bulk_hydrate(submissions, cancel)
    }
  }

  #[tokio::test]
  async fn incremental_refresh_hydrates_only_new_changed_or_incomplete_entries() {
    let directory = tempdir().unwrap();
    let catalog = super::Catalog::open(directory.path().join("catalog.sqlite3"), 2)
      .await
      .unwrap();
    let cached = page_with_modified(&[(11, 110), (10, 100), (8, 109), (9, 90)], true);
    let records = cached
      .valid_records()
      .iter()
      .map(|index| {
        let mut record = super::from_index(index, SubmissionType::Mod, None);
        record.is_hydrated = index.id != 8;
        record.description = "saved description".to_string();
        record
      })
      .collect();
    catalog.upsert_records(records).await.unwrap();
    catalog
      .set_high_water_mark(SubmissionType::Mod, 110)
      .await
      .unwrap();
    let hydrated = std::sync::Arc::new(Mutex::new(Vec::new()));
    let changed = || {
      page_with_modified(
        &[
          (13, 120),
          (10, 115),
          (12, 110),
          (11, 110),
          (8, 109),
          (9, 90),
        ],
        false,
      )
    };
    let source = TrackingSource {
      source: FakeSource {
        served: Mutex::default(),
        pages: Mutex::new(VecDeque::from([
          Ok(changed()),
          Ok(empty_page()),
          Ok(changed()),
          Ok(empty_page()),
        ])),
      },
      hydrated: hydrated.clone(),
    };
    let sync = CatalogSync::with_source(catalog.clone(), source);
    sync
      .incremental_sync(true, &CancellationToken::new())
      .await
      .unwrap();
    assert_eq!(*hydrated.lock().unwrap(), ["13", "10", "12", "8"]);
    hydrated.lock().unwrap().clear();
    sync
      .incremental_sync(true, &CancellationToken::new())
      .await
      .unwrap();
    assert!(
      hydrated.lock().unwrap().is_empty(),
      "Repeated refresh must not fetch unchanged details"
    );
    let saved = catalog
      .get(SubmissionRef::parse_slug("11").unwrap())
      .await
      .unwrap()
      .unwrap();
    assert_eq!(saved.description, "saved description");
    assert_eq!(catalog.count_visible().await.unwrap(), 6);
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
        served: Mutex::default(),
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
    assert_eq!(
      catalog
        .state(super::HYDRATION_VERSION)
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
        served: Mutex::default(),
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
