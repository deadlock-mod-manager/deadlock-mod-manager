//! Where a finished skin goes.
//!
//! Three destinations, all fed by the same freshly packed VPK:
//! - **File** — write it wherever the user pointed the save dialog.
//! - **New mod** — create a local mod in the store so it shows up in the library
//!   like any other, ready to install.
//! - **Replace source** — write over the VPK the Foundry loaded, so an already
//!   installed mod picks up the edits.
//!
//! Replacing is the destructive one, so it only ever targets the exact file the
//! user opened, keeps a `.bak` of it, and refuses a path that is not a VPK.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::commands::state::MANAGER;
use crate::errors::Error;

use super::types::{ExportDestinationKind, FoundryBuildResult};
use super::workspace::{build_workspace_vpk, sanitize_workspace_name};

/// Where the built VPK should land.
pub(crate) enum ExportDestination {
  File { output_path: PathBuf },
  NewMod { name: String },
  ReplaceSource { source_path: PathBuf },
}

/// What an export produced, on top of the build itself. `mod_id` is set for a
/// new mod so the frontend can add it to the library; `backup_path` is set when
/// an existing VPK was replaced.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct FoundryExportResult {
  pub destination: ExportDestinationKind,
  pub output_path: String,
  pub file_count: usize,
  pub size: u64,
  pub mod_id: Option<String>,
  pub mod_name: Option<String>,
  pub backup_path: Option<String>,
}

/// A local mod id in the shape the rest of the app expects.
fn new_local_mod_id() -> String {
  // The store folder is keyed by this, so it only needs to be unique and
  // filesystem-safe; the timestamp keeps ids sortable while debugging.
  let nanos = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|since| since.as_nanos())
    .unwrap_or_default();
  format!("local-foundry-{nanos:x}")
}

/// The metadata sidecar the mod store keeps beside a local mod's files, in the
/// same shape the local-import path writes.
fn write_mod_metadata(mod_dir: &Path, mod_id: &str, name: &str) -> Result<(), Error> {
  let created_at = chrono::Utc::now().to_rfc3339();
  let metadata = serde_json::json!({
    "id": mod_id,
    "kind": "local",
    "name": name,
    "author": "Mod Foundry",
    "link": serde_json::Value::Null,
    "description": "Created in the Mod Foundry.",
    "category": "Skins",
    "createdAt": created_at,
    "preview": "preview.svg",
    "_schema": 1,
  });
  std::fs::write(
    mod_dir.join("metadata.json"),
    serde_json::to_vec_pretty(&metadata)
      .map_err(|e| Error::InvalidInput(format!("failed to write mod metadata: {e}")))?,
  )?;
  Ok(())
}

/// A neutral placeholder tile, so a Foundry mod has cover art in the library
/// without the user having to supply one.
fn write_preview(mod_dir: &Path, name: &str) -> Result<(), Error> {
  let label = name
    .chars()
    .take(18)
    .map(|c| match c {
      '<' | '>' | '&' | '"' | '\'' => ' ',
      other => other,
    })
    .collect::<String>();
  // `r##"…"##`: the SVG's `fill="#…"` would close an `r#"…"#` string.
  let svg = format!(
    r##"<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
  <rect width="320" height="180" fill="#1a1712"/>
  <text x="160" y="86" fill="#e7d5a3" font-family="sans-serif" font-size="18" text-anchor="middle">{label}</text>
  <text x="160" y="112" fill="#8b8d98" font-family="sans-serif" font-size="12" text-anchor="middle">Mod Foundry</text>
</svg>
"##
  );
  std::fs::write(mod_dir.join("preview.svg"), svg)?;
  Ok(())
}

fn mods_store_path() -> Result<PathBuf, Error> {
  let manager = MANAGER
    .lock()
    .map_err(|e| Error::InvalidInput(format!("manager lock poisoned: {e}")))?;
  manager.get_mods_store_path()
}

/// Build the workspace and deliver it to `destination`.
pub(crate) fn export_workspace(
  workspace_root: PathBuf,
  destination: ExportDestination,
  name: Option<String>,
) -> Result<FoundryExportResult, Error> {
  match destination {
    ExportDestination::File { output_path } => {
      let build = build_workspace_vpk(workspace_root, Some(output_path), name)?;
      Ok(result(ExportDestinationKind::File, build, None, None, None))
    }

    ExportDestination::NewMod { name } => {
      let mod_id = new_local_mod_id();
      let mod_dir = mods_store_path()?.join(&mod_id);
      let files_dir = mod_dir.join("files");
      std::fs::create_dir_all(&files_dir)?;

      let vpk_name = format!("{}_dir.vpk", sanitize_workspace_name(&name));
      let build = build_workspace_vpk(
        workspace_root,
        Some(files_dir.join(vpk_name)),
        Some(name.clone()),
      )?;
      write_mod_metadata(&mod_dir, &mod_id, &name)?;
      write_preview(&mod_dir, &name)?;

      log::info!("[Foundry] Exported as new mod {mod_id} ({name})");
      Ok(result(
        ExportDestinationKind::NewMod,
        build,
        Some(mod_id),
        Some(name),
        None,
      ))
    }

    ExportDestination::ReplaceSource { source_path } => {
      if source_path.extension().and_then(|ext| ext.to_str()) != Some("vpk") {
        return Err(Error::InvalidInput(format!(
          "refusing to overwrite a non-VPK file: {}",
          source_path.display()
        )));
      }
      if !source_path.is_file() {
        return Err(Error::InvalidInput(format!(
          "the mod's VPK is no longer at {}",
          source_path.display()
        )));
      }

      // Keep the original alongside: an in-place overwrite is the one export
      // that destroys something, and a mod the user downloaded may not be
      // re-downloadable.
      let backup_path = source_path.with_extension("vpk.bak");
      std::fs::copy(&source_path, &backup_path)?;

      let build = build_workspace_vpk(workspace_root, Some(source_path.clone()), name)?;
      log::info!(
        "[Foundry] Replaced {} (backup at {})",
        source_path.display(),
        backup_path.display(),
      );
      Ok(result(
        ExportDestinationKind::ReplaceSource,
        build,
        None,
        None,
        Some(backup_path.to_string_lossy().to_string()),
      ))
    }
  }
}

fn result(
  destination: ExportDestinationKind,
  build: FoundryBuildResult,
  mod_id: Option<String>,
  mod_name: Option<String>,
  backup_path: Option<String>,
) -> FoundryExportResult {
  FoundryExportResult {
    destination,
    output_path: build.output_path,
    file_count: build.file_count,
    size: build.size,
    mod_id,
    mod_name,
    backup_path,
  }
}
