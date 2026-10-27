mod fbx;
mod history;
mod material;
mod scan;
mod stock;
#[cfg(test)]
mod tests;

use std::{collections::BTreeSet, path::Path};

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::modding_workspace::resolve;
use crate::{app_runtime::AppHandle, errors::Error};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub enum ModdingRepairKind {
  ShaderConversion,
  PathRepair,
  StockDependency,
  EmptyTemplate,
  MissingDependency,
  AmbiguousPath,
  UnsupportedShader,
  UnsupportedFeature,
  UnreadableSource,
  ExternalFbxTexture,
  UninspectedSource,
}

#[derive(Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingRepairIssue {
  pub id: String,
  pub kind: ModdingRepairKind,
  pub file: String,
  pub property: String,
  pub current: String,
  pub proposed: Option<String>,
  pub targets: Vec<String>,
  pub detail: String,
  pub repairable: bool,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingRepairScan {
  pub fingerprint: String,
  pub scanned_files: usize,
  pub issues: Vec<ModdingRepairIssue>,
  pub diagnostics: Vec<String>,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingRepairBackup {
  pub id: String,
  pub created_at: String,
  pub files: Vec<String>,
  pub restored: bool,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingRepairResult {
  pub backup_id: String,
  pub files: Vec<String>,
}

fn task_error(error: impl std::fmt::Display) -> Error {
  Error::BackgroundTaskFailed(error.to_string())
}

#[tauri::command]
pub async fn scan_modding_addon(
  app: AppHandle,
  addon_id: String,
) -> Result<ModdingRepairScan, Error> {
  let addon = resolve(&app, &addon_id)?;
  let config = super::modding_tools::get_modding_tools_config(app.clone())?;
  let cli = super::modding_import::cli_path(&app)?;
  tauri::async_runtime::spawn_blocking(move || {
    let stock = stock::Stock::open(&addon, &config, &cli);
    Ok(scan::scan(Path::new(&addon.content_path), &stock)?.report)
  })
  .await
  .map_err(task_error)?
}

#[tauri::command]
pub async fn apply_modding_repairs(
  app: AppHandle,
  addon_id: String,
  fingerprint: String,
  repair_ids: Vec<String>,
) -> Result<ModdingRepairResult, Error> {
  let addon = resolve(&app, &addon_id)?;
  let config = super::modding_tools::get_modding_tools_config(app.clone())?;
  let cli = super::modding_import::cli_path(&app)?;
  tauri::async_runtime::spawn_blocking(move || {
    let _build = super::modding_build::BUILD_LOCK
      .lock()
      .map_err(task_error)?;
    let _edit = super::modding_edits::EDIT_LOCK.lock().map_err(task_error)?;
    let root = Path::new(&addon.content_path);
    let stock = stock::Stock::open(&addon, &config, &cli);
    let scan = scan::scan(root, &stock)?;
    apply(root, scan, &fingerprint, repair_ids)
  })
  .await
  .map_err(task_error)?
}

fn apply(
  root: &Path,
  scan: scan::Scan,
  expected: &str,
  ids: Vec<String>,
) -> Result<ModdingRepairResult, Error> {
  if scan.report.fingerprint != expected {
    return Err(Error::InvalidInput(
      "Addon files or available stock dependencies changed since scanning. Re-scan before applying repairs.".into(),
    ));
  }
  let selected: BTreeSet<_> = ids.iter().cloned().collect();
  if selected.is_empty() || selected.len() != ids.len() || selected.len() > 8192 {
    return Err(Error::InvalidInput(
      "Select between 1 and 8192 distinct repairs".into(),
    ));
  }
  let changes = scan.changes(&selected)?;
  // S2V exports can take time. Recheck every addon file after staging and before writing.
  if scan::snapshot(root)? != scan.snapshot {
    return Err(Error::InvalidInput(
      "Addon files changed while preparing repairs. Re-scan before applying.".into(),
    ));
  }
  history::commit(root, changes)
}

#[tauri::command]
pub async fn list_modding_repair_backups(
  app: AppHandle,
  addon_id: String,
) -> Result<Vec<ModdingRepairBackup>, Error> {
  let root = resolve(&app, &addon_id)?.content_path;
  tauri::async_runtime::spawn_blocking(move || history::list(Path::new(&root)))
    .await
    .map_err(task_error)?
}

#[tauri::command]
pub async fn restore_modding_repairs(
  app: AppHandle,
  addon_id: String,
  backup_id: String,
) -> Result<(), Error> {
  let root = resolve(&app, &addon_id)?.content_path;
  tauri::async_runtime::spawn_blocking(move || {
    let _build = super::modding_build::BUILD_LOCK
      .lock()
      .map_err(task_error)?;
    let _edit = super::modding_edits::EDIT_LOCK.lock().map_err(task_error)?;
    history::restore(Path::new(&root), &backup_id)
  })
  .await
  .map_err(task_error)?
}
