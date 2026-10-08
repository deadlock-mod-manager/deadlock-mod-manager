use std::path::{Path, PathBuf};

use tauri::AppHandle;

use super::state::{MANAGER, get_api_url};
use crate::errors::Error;
use crate::mod_manager::perf_config::analyze::{self, AnalyzeContext};
use crate::mod_manager::perf_config::ops::{self, PerfContext};
use crate::mod_manager::perf_config::types::{
  CatalogSummary, ConvarMeta, ImportReport, ImportSource, PerfApplyRequest, PerfApplyResult,
  PerfExport, PerfStatus, ResolvedConfig,
};
use crate::mod_manager::perf_config::{catalog, client_version, share, staging};

fn app_data_dir(app_handle: &AppHandle) -> Result<PathBuf, Error> {
  crate::runtime_environment::app_local_data_dir(app_handle).map_err(Error::Tauri)
}

fn game_path() -> Option<PathBuf> {
  MANAGER
    .lock()
    .ok()?
    .get_steam_manager()
    .get_game_path()
    .cloned()
}

/// Runs `f` with a context for the current game folder and catalog.
fn with_context<T>(
  app_handle: &AppHandle,
  f: impl FnOnce(&PerfContext) -> Result<T, Error>,
) -> Result<T, Error> {
  run_in_context(app_handle, game_path().as_deref(), f)
}

/// [`with_context`] for operations that write gameinfo.gi. The manager lock is
/// held throughout, as every other gameinfo.gi writer holds it, so their
/// read-then-write cycles can't interleave and undo each other.
fn with_write_context<T>(
  app_handle: &AppHandle,
  f: impl FnOnce(&PerfContext) -> Result<T, Error>,
) -> Result<T, Error> {
  let manager = MANAGER
    .lock()
    .map_err(|_| Error::BackgroundTaskFailed("Mod manager lock poisoned".to_string()))?;
  let game_path = manager.get_steam_manager().get_game_path().cloned();
  run_in_context(app_handle, game_path.as_deref(), f)
}

fn run_in_context<T>(
  app_handle: &AppHandle,
  game_path: Option<&Path>,
  f: impl FnOnce(&PerfContext) -> Result<T, Error>,
) -> Result<T, Error> {
  let app_data_dir = app_data_dir(app_handle)?;
  let catalog = catalog::current();
  let ctx = PerfContext {
    game_path,
    app_data_dir: &app_data_dir,
    catalog: &catalog,
    build_id: game_path
      .and_then(client_version)
      .map(|version| version.to_string()),
  };
  f(&ctx)
}

#[tauri::command]
pub async fn perf_get_catalog(app_handle: AppHandle) -> Result<CatalogSummary, Error> {
  with_context(&app_handle, ops::catalog_summary)
}

/// Fetches a newer catalog from the API if there is one. Failing to reach the
/// API is not an error for the caller: the bundled catalog keeps working.
#[tauri::command]
pub async fn perf_refresh_catalog(app_handle: AppHandle) -> Result<CatalogSummary, Error> {
  let app_data_dir = app_data_dir(&app_handle)?;
  if let Err(error) = catalog::refresh_from_api(&get_api_url(), &app_data_dir).await {
    log::warn!("Performance catalog refresh failed: {error}");
  }
  with_context(&app_handle, ops::catalog_summary)
}

#[tauri::command]
pub async fn perf_get_status(app_handle: AppHandle) -> Result<PerfStatus, Error> {
  with_context(&app_handle, ops::status)
}

#[tauri::command]
pub async fn perf_resolve(
  app_handle: AppHandle,
  request: PerfApplyRequest,
) -> Result<ResolvedConfig, Error> {
  with_context(&app_handle, |ctx| ops::preview(ctx, &request))
}

#[tauri::command]
pub async fn perf_apply(
  app_handle: AppHandle,
  request: PerfApplyRequest,
  remove_foreign: bool,
  guard_permit: Option<String>,
) -> Result<PerfApplyResult, Error> {
  crate::game_guard::ensure_game_idle_locked("perf_apply", guard_permit.as_deref())?;
  with_write_context(&app_handle, |ctx| ops::apply(ctx, request, remove_foreign))
}

#[tauri::command]
pub async fn perf_remove(
  app_handle: AppHandle,
  guard_permit: Option<String>,
) -> Result<PerfStatus, Error> {
  crate::game_guard::ensure_game_idle_locked("perf_remove", guard_permit.as_deref())?;
  with_write_context(&app_handle, ops::remove)
}

/// Writes the chosen config back into gameinfo.gi after a game update or a
/// reset removed it, or removes an overlay when no config is chosen.
#[tauri::command]
pub async fn perf_reapply(
  app_handle: AppHandle,
  guard_permit: Option<String>,
) -> Result<PerfStatus, Error> {
  crate::game_guard::ensure_game_idle_locked("perf_reapply", guard_permit.as_deref())?;
  with_write_context(&app_handle, |ctx| {
    match ops::reapply_desired(ctx, ops::HandEdits::Overwrite) {
      ops::ReapplyOutcome::Failed(message) => Err(Error::PerformanceConfig(message)),
      _ => ops::status(ctx),
    }
  })
}

/// Background check (app start, window focus): writes the chosen config back
/// if a game update or reset replaced gameinfo.gi. Hand edits are kept, and
/// nothing is written while Deadlock runs. Returns whether the file changed.
#[tauri::command]
pub async fn perf_sync(app_handle: AppHandle) -> Result<bool, Error> {
  let mut manager = MANAGER
    .lock()
    .map_err(|_| Error::BackgroundTaskFailed("Mod manager lock poisoned".to_string()))?;
  if manager.is_game_running()? {
    return Ok(false);
  }
  let game_path = manager.get_steam_manager().get_game_path().cloned();
  run_in_context(
    &app_handle,
    game_path.as_deref(),
    |ctx| match ops::reapply_desired(ctx, ops::HandEdits::Keep) {
      ops::ReapplyOutcome::Applied | ops::ReapplyOutcome::RemovedOrphan => Ok(true),
      ops::ReapplyOutcome::NothingDesired | ops::ReapplyOutcome::AlreadyInSync => Ok(false),
      ops::ReapplyOutcome::Failed(message) => Err(Error::PerformanceConfig(message)),
    },
  )
}

#[tauri::command]
pub async fn perf_analyze_import(
  app_handle: AppHandle,
  source: ImportSource,
) -> Result<ImportReport, Error> {
  let ctx = AnalyzeContext {
    catalog: catalog::current(),
    game_path: game_path(),
    app_data_dir: app_data_dir(&app_handle)?,
  };
  analyze::analyze(&ctx, source).await
}

#[tauri::command]
pub async fn perf_export(
  app_handle: AppHandle,
  request: PerfApplyRequest,
) -> Result<PerfExport, Error> {
  let resolved = with_context(&app_handle, |ctx| ops::preview(ctx, &request))?;
  Ok(PerfExport {
    share_code: share::encode(&request)?,
    snippet: share::snippet(&resolved),
  })
}

#[tauri::command]
pub async fn perf_search_convars(query: String, limit: u32) -> Result<Vec<ConvarMeta>, Error> {
  let catalog = catalog::current();
  Ok(
    catalog
      .search_convars(&query, limit.min(200) as usize)
      .into_iter()
      .cloned()
      .collect(),
  )
}

#[tauri::command]
pub async fn perf_get_convars(names: Vec<String>) -> Result<Vec<ConvarMeta>, Error> {
  let catalog = catalog::current();
  Ok(
    names
      .iter()
      .filter_map(|name| catalog.convar(name).cloned())
      .collect(),
  )
}

#[tauri::command]
pub async fn perf_discard_staging(app_handle: AppHandle, staging_id: String) -> Result<(), Error> {
  staging::discard(&app_data_dir(&app_handle)?, &staging_id)
}
