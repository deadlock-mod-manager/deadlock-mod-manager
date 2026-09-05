mod state;
mod types;

pub use state::GameBananaCatalogState;
pub use types::{
  CatalogDonationLinkDto, CatalogDownloadDto, CatalogDownloadsDto, CatalogModDto,
  CatalogModMetadataDto, CatalogPageDto, CatalogSyncStatusDto, CatalogUpdateDto, CatalogUpdatesDto,
  GameBananaFileserverDto, InstalledSubmissionDto,
};

use crate::errors::Error;
use crate::providers::SubmissionRef;
use crate::providers::gamebanana::catalog::{CatalogQuery, CatalogRecord, SyncOutcome};
use crate::providers::gamebanana::normalize_profile;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::State;
use tokio_util::sync::CancellationToken;

const LAST_INCREMENTAL_AT: &str = "last_incremental_at";
const LAST_FULL_SYNC_AT: &str = "last_full_sync_at";
const STALE_AFTER: Duration = Duration::from_secs(12 * 60 * 60);

#[tauri::command]
pub async fn synchronize_gamebanana_catalog(
  state: State<'_, GameBananaCatalogState>,
  force_refresh: bool,
  force_reconcile: bool,
) -> Result<CatalogSyncStatusDto, Error> {
  let backend = state.backend()?;
  let outcome = backend.synchronize(force_refresh, force_reconcile).await?;
  inspect_ready_state(&backend, Some(sync_outcome_name(outcome).to_string())).await
}

#[tauri::command]
pub async fn query_gamebanana_catalog(
  state: State<'_, GameBananaCatalogState>,
  policy: State<'_, super::policy::PolicyState>,
  mut query: CatalogQuery,
) -> Result<CatalogPageDto, Error> {
  let backend = state.backend()?;
  let stale = catalog_is_stale(&backend.catalog).await?;
  query.excluded_slugs = policy.unavailable_slugs()?;
  let mut page = CatalogPageDto::from_page(backend.catalog.query(query).await?, stale);
  for item in &mut page.items {
    policy.apply_to_mod(item)?;
  }
  Ok(page)
}

#[tauri::command]
pub async fn get_gamebanana_submission_detail(
  state: State<'_, GameBananaCatalogState>,
  policy: State<'_, super::policy::PolicyState>,
  remote_id: String,
) -> Result<CatalogModDto, Error> {
  let backend = state.backend()?;
  let submission = parse_submission(&remote_id)?;
  let cancel = CancellationToken::new();
  let mut mod_data = match backend.client.profile(&submission, &cancel).await {
    Ok(profile) => {
      let normalized =
        normalize_profile(&profile, submission.submission_type).ok_or_else(|| {
          Error::ProviderInvalidResponse("submission is not publicly available".to_string())
        })?;
      backend
        .catalog
        .upsert_records(vec![record_from_profile(
          submission,
          &profile,
          normalized.clone(),
        )])
        .await?;
      CatalogModDto::from_profile(&profile, normalized)
    }
    Err(provider_error) => backend
      .catalog
      .get(submission)
      .await?
      .map(CatalogModDto::from_record)
      .ok_or(provider_error)?,
  };
  if !policy.apply_to_mod(&mut mod_data)? {
    return Err(Error::InvalidInput(
      "This submission is unavailable by policy".to_string(),
    ));
  }
  Ok(mod_data)
}

#[tauri::command]
pub async fn get_gamebanana_submission_files(
  state: State<'_, GameBananaCatalogState>,
  policy: State<'_, super::policy::PolicyState>,
  remote_id: String,
) -> Result<CatalogDownloadsDto, Error> {
  submission_files(&state, &policy, &remote_id).await
}

#[tauri::command]
pub async fn resolve_gamebanana_download_candidates(
  state: State<'_, GameBananaCatalogState>,
  policy: State<'_, super::policy::PolicyState>,
  remote_id: String,
) -> Result<CatalogDownloadsDto, Error> {
  submission_files(&state, &policy, &remote_id).await
}

#[tauri::command]
pub async fn check_gamebanana_catalog_updates(
  state: State<'_, GameBananaCatalogState>,
  policy: State<'_, super::policy::PolicyState>,
  submissions: Vec<InstalledSubmissionDto>,
) -> Result<CatalogUpdatesDto, Error> {
  let backend = state.backend()?;
  let now = unix_timestamp();
  let mut resolved = Vec::new();
  let mut pending = Vec::new();
  let mut unknown = Vec::new();
  for installed in submissions {
    let submission = parse_submission(&installed.remote_id)?;
    if resolved.iter().any(
      |(existing, _, _): &(
        SubmissionRef,
        InstalledSubmissionDto,
        crate::providers::gamebanana::UpdateSnapshot,
      )| existing == &submission,
    ) || pending
      .iter()
      .any(|(existing, _): &(SubmissionRef, InstalledSubmissionDto)| existing == &submission)
    {
      continue;
    }
    match backend.catalog.cached_update(submission.clone()).await? {
      Some(cached) if now.saturating_sub(cached.checked_at) < 6 * 60 * 60 => {
        resolved.push((submission, installed, cached.snapshot));
      }
      _ => pending.push((submission, installed)),
    }
  }

  for submission_type in [
    crate::providers::SubmissionType::Mod,
    crate::providers::SubmissionType::Sound,
  ] {
    let matching = pending
      .iter()
      .filter(|(submission, _)| submission.submission_type == submission_type)
      .cloned()
      .collect::<Vec<_>>();
    for batch in matching.chunks(50) {
      let identities = batch
        .iter()
        .map(|(submission, _)| submission.clone())
        .collect::<Vec<_>>();
      match backend
        .client
        .bulk_updates(&identities, &CancellationToken::new())
        .await
      {
        Ok(snapshots) => {
          for ((submission, installed), snapshot) in batch.iter().cloned().zip(snapshots) {
            if let Some(snapshot) = snapshot {
              backend
                .catalog
                .save_cached_update(submission.clone(), snapshot.clone(), now)
                .await?;
              resolved.push((submission, installed, snapshot));
            } else {
              unknown.push(submission.to_slug());
            }
          }
        }
        Err(error) => {
          log::warn!("GameBanana bulk update check failed: {error}");
          for (submission, installed) in batch.iter().cloned() {
            if let Some(cached) = backend.catalog.cached_update(submission.clone()).await? {
              resolved.push((submission, installed, cached.snapshot));
            } else {
              unknown.push(submission.to_slug());
            }
          }
        }
      }
    }
  }

  let mut updates = Vec::new();
  for (submission, installed, snapshot) in resolved {
    let selected_changed = !installed.selected_file_ids.is_empty()
      && installed.selected_file_ids.iter().any(|selected| {
        !snapshot
          .files
          .iter()
          .any(|file| file.id.to_string() == *selected)
      });
    let file_updated = snapshot
      .files
      .iter()
      .filter_map(|file| file.date_added)
      .max()
      .is_some_and(|updated| updated > installed.installed_at);
    if (snapshot.remote_updated_at > installed.installed_at || file_updated || selected_changed)
      && let Some(record) = backend.catalog.get(submission).await?
    {
      let mut mod_data = CatalogModDto::from_record(record);
      if !policy.apply_to_mod(&mut mod_data)? || !mod_data.downloadable {
        continue;
      }
      updates.push(CatalogUpdateDto {
        r#mod: mod_data,
        downloads: snapshot
          .files
          .into_iter()
          .map(CatalogDownloadDto::from)
          .collect(),
      });
    }
  }
  Ok(CatalogUpdatesDto { updates, unknown })
}

#[tauri::command]
pub async fn inspect_gamebanana_catalog_state(
  state: State<'_, GameBananaCatalogState>,
) -> Result<CatalogSyncStatusDto, Error> {
  match state.backend() {
    Ok(backend) => inspect_ready_state(&backend, None).await,
    Err(_) => Ok(CatalogSyncStatusDto {
      available: false,
      count: 0,
      stale: true,
      last_incremental_at: None,
      last_full_sync_at: None,
      outcome: None,
      unavailable_reason: state.unavailable_reason(),
    }),
  }
}

#[tauri::command]
pub async fn invalidate_gamebanana_catalog_state(
  state: State<'_, GameBananaCatalogState>,
) -> Result<(), Error> {
  state.backend()?.catalog.invalidate_sync_state().await
}

#[tauri::command]
pub async fn get_gamebanana_fileservers(
  state: State<'_, GameBananaCatalogState>,
  force_refresh: bool,
) -> Result<Vec<GameBananaFileserverDto>, Error> {
  state.backend()?.fileservers(force_refresh).await
}

async fn submission_files(
  state: &State<'_, GameBananaCatalogState>,
  policy: &State<'_, super::policy::PolicyState>,
  remote_id: &str,
) -> Result<CatalogDownloadsDto, Error> {
  policy.ensure_download_allowed(remote_id)?;
  let backend = state.backend()?;
  let submission = parse_submission(remote_id)?;
  let page = backend
    .client
    .download_page(&submission, &CancellationToken::new())
    .await?;
  if page.is_trashed || page.is_withheld {
    return Err(Error::ProviderInvalidResponse(
      "submission files are not publicly available".to_string(),
    ));
  }
  let downloads = page
    .files
    .into_iter()
    .map(CatalogDownloadDto::from)
    .collect::<Vec<_>>();
  let count = u64::try_from(downloads.len())
    .map_err(|_| Error::ProviderInvalidResponse("too many submission files".to_string()))?;
  Ok(CatalogDownloadsDto { downloads, count })
}

async fn inspect_ready_state(
  backend: &state::CatalogBackend,
  outcome: Option<String>,
) -> Result<CatalogSyncStatusDto, Error> {
  let last_incremental_at = timestamp_state(&backend.catalog, LAST_INCREMENTAL_AT).await?;
  let last_full_sync_at = timestamp_state(&backend.catalog, LAST_FULL_SYNC_AT).await?;
  Ok(CatalogSyncStatusDto {
    available: true,
    count: backend.catalog.count_visible().await?,
    stale: is_stale(last_incremental_at.or(last_full_sync_at)),
    last_incremental_at,
    last_full_sync_at,
    outcome,
    unavailable_reason: None,
  })
}

async fn catalog_is_stale(
  catalog: &crate::providers::gamebanana::catalog::Catalog,
) -> Result<bool, Error> {
  let last_incremental_at = timestamp_state(catalog, LAST_INCREMENTAL_AT).await?;
  let last_full_sync_at = timestamp_state(catalog, LAST_FULL_SYNC_AT).await?;
  Ok(is_stale(last_incremental_at.or(last_full_sync_at)))
}

async fn timestamp_state(
  catalog: &crate::providers::gamebanana::catalog::Catalog,
  key: &'static str,
) -> Result<Option<u64>, Error> {
  Ok(
    catalog
      .state(key)
      .await?
      .and_then(|value| value.parse().ok()),
  )
}

fn is_stale(timestamp: Option<u64>) -> bool {
  let now = unix_timestamp();
  timestamp.is_none_or(|value| now.saturating_sub(value) >= STALE_AFTER.as_secs())
}

fn unix_timestamp() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_secs()
}

fn parse_submission(remote_id: &str) -> Result<SubmissionRef, Error> {
  let submission = SubmissionRef::parse_slug(remote_id)
    .map_err(|_| Error::ProviderInvalidResponse("invalid submission identity".to_string()))?;
  if submission.provider != crate::providers::SubmissionProvider::Gamebanana {
    return Err(Error::ProviderInvalidResponse(
      "operation requires a GameBanana submission".to_string(),
    ));
  }
  Ok(submission)
}

fn record_from_profile(
  submission: SubmissionRef,
  profile: &crate::providers::gamebanana::Profile,
  normalized: crate::providers::gamebanana::NormalizedSubmission,
) -> CatalogRecord {
  CatalogRecord {
    submission,
    name: normalized.name,
    author: normalized.author,
    description: normalized.description,
    profile_url: profile.profile_url.clone(),
    category: normalized.category,
    hero: normalized.hero,
    is_audio: normalized.is_audio,
    is_map: normalized.is_map,
    is_nsfw: normalized.is_nsfw,
    is_obsolete: normalized.is_obsolete,
    is_tombstoned: false,
    is_hydrated: true,
    has_files: !profile.files.is_empty(),
    download_count: normalized.download_count,
    likes: normalized.likes,
    remote_added_at: normalized.remote_added_at,
    remote_updated_at: normalized.remote_updated_at,
    files_updated_at: profile
      .files
      .iter()
      .filter_map(|file| file.date_added)
      .max()
      .unwrap_or_default(),
    last_seen_snapshot: None,
  }
}

fn sync_outcome_name(outcome: SyncOutcome) -> &'static str {
  match outcome {
    SyncOutcome::Full => "full",
    SyncOutcome::Incremental => "incremental",
    SyncOutcome::Throttled => "throttled",
  }
}
