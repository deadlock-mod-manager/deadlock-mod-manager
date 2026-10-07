//! Mod transfer between mod managers through the manager-neutral
//! "Deadlock Mod Interchange" format (`rfcs/001-mod-interchange/proposal.md`).
//!
//! - `format`: the document, parsing and bundle reading
//! - `grimoire`: reader for Grimoire's native files (no Grimoire changes needed)
//! - `import` / `export`: interchange <-> DMM profile
//! - `ledger`: which interchange key became which DMM mod, and which source
//!   profile went into which DMM profile
//!
//! Supporting another mod manager means adding a reader and one entry in
//! [`SOURCES`]; the UI lists whatever this registry reports.

pub mod export;
pub mod format;
pub mod grimoire;
pub mod hash_cache;
pub mod import;
pub mod ledger;

use super::state::MANAGER;
use crate::app_runtime::AppHandle;
use crate::errors::Error;
use crate::mod_manager::addon_analyzer::AddonAnalyzer;
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use tauri::Emitter;

pub const READ_PROGRESS_EVENT: &str = "interchange-read-progress";
pub const IMPORT_PROGRESS_EVENT: &str = "interchange-import-progress";
pub const EXPORT_PROGRESS_EVENT: &str = "interchange-export-progress";

/// A mod manager DMM can read directly from disk.
struct SourceDefinition {
  id: &'static str,
  name: &'static str,
  /// Sections this reader can produce.
  sections: &'static [&'static str],
  detect: fn(Option<PathBuf>, Option<&Path>) -> SourceDetection,
  read:
    fn(&Path, Option<&Path>, &grimoire::ReadContext) -> Result<format::InterchangeDocument, Error>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadProgress {
  pub current: usize,
  pub total: usize,
  pub name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceDetection {
  pub found: bool,
  pub location: Option<String>,
  pub detail: Option<String>,
  pub searched: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InterchangeSourceInfo {
  pub id: String,
  pub name: String,
  pub sections: Vec<String>,
  #[serde(flatten)]
  pub detection: SourceDetection,
}

fn detect_grimoire(explicit: Option<PathBuf>, game: Option<&Path>) -> SourceDetection {
  let detection = grimoire::detect(explicit, game);
  SourceDetection {
    found: detection.found,
    location: detection.user_data_dir,
    detail: detection.deadlock_path,
    searched: detection.searched,
  }
}

const SOURCES: &[SourceDefinition] = &[SourceDefinition {
  id: grimoire::MANAGER_ID,
  name: "Grimoire",
  sections: &[
    format::SECTION_MODS,
    format::SECTION_PROFILES,
    format::SECTION_CROSSHAIRS,
  ],
  detect: detect_grimoire,
  read: grimoire::read_with,
}];

fn source(id: &str) -> Result<&'static SourceDefinition, Error> {
  SOURCES
    .iter()
    .find(|s| s.id == id)
    .ok_or_else(|| Error::InvalidInput(format!("Unknown mod manager: {id}")))
}

fn lock_manager() -> Result<std::sync::MutexGuard<'static, crate::mod_manager::ModManager>, Error> {
  MANAGER
    .lock()
    .map_err(|_| Error::BackgroundTaskFailed("Mod manager lock poisoned".to_string()))
}

fn dmm_game_path() -> Option<PathBuf> {
  super::state::game_path().ok()
}

async fn blocking<T: Send + 'static>(
  task: impl FnOnce() -> Result<T, Error> + Send + 'static,
) -> Result<T, Error> {
  tokio::task::spawn_blocking(task)
    .await
    .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}

#[tauri::command]
pub async fn list_interchange_sources() -> Result<Vec<InterchangeSourceInfo>, Error> {
  let game_path = dmm_game_path();
  blocking(move || {
    Ok(
      SOURCES
        .iter()
        .map(|s| InterchangeSourceInfo {
          id: s.id.to_string(),
          name: s.name.to_string(),
          sections: s.sections.iter().map(|x| (*x).to_string()).collect(),
          detection: (s.detect)(None, game_path.as_deref()),
        })
        .collect(),
    )
  })
  .await
}

/// Read a mod manager's library. `location` overrides auto-detection (the
/// user picked the manager's data folder by hand).
#[tauri::command]
pub async fn read_interchange_source(
  app_handle: AppHandle,
  source_id: String,
  location: Option<String>,
) -> Result<format::InterchangeDocument, Error> {
  let game_path = dmm_game_path();
  let app_data = lock_manager()?.get_app_local_data_path().ok();
  blocking(move || {
    let hashes = hash_cache::HashCache::open(app_data.as_deref());
    let dmm_store = app_data.as_ref().map(|dir| dir.join("mods"));
    let progress = |current: usize, total: usize, name: &str| {
      let payload = ReadProgress {
        current,
        total,
        name: name.to_string(),
      };
      if let Err(error) = app_handle.emit(READ_PROGRESS_EVENT, &payload) {
        log::warn!("Failed to emit read progress: {error}");
      }
    };
    let context = grimoire::ReadContext {
      hashes: &hashes,
      progress: &progress,
      dmm_store: dmm_store.as_deref(),
    };
    let definition = source(&source_id)?;
    let detection = (definition.detect)(location.map(PathBuf::from), game_path.as_deref());
    let dir = detection.location.ok_or_else(|| {
      Error::InvalidInput(format!(
        "{} was not found. Looked in: {}",
        definition.name,
        detection.searched.join(", ")
      ))
    })?;
    (definition.read)(&PathBuf::from(dir), game_path.as_deref(), &context)
  })
  .await
}

#[tauri::command]
pub async fn read_interchange_bundle(path: String) -> Result<format::InterchangeDocument, Error> {
  blocking(move || format::read_bundle(&PathBuf::from(path))).await
}

#[tauri::command]
pub async fn import_interchange_mods(
  app_handle: AppHandle,
  request: import::InterchangeImportRequest,
) -> Result<import::InterchangeImportReport, Error> {
  blocking(move || {
    let mut manager = lock_manager()?;
    import::import(&mut manager, request, &|progress| {
      if let Err(error) = app_handle.emit(IMPORT_PROGRESS_EVENT, &progress) {
        log::warn!("Failed to emit import progress: {error}");
      }
    })
  })
  .await
}

#[tauri::command]
pub async fn export_interchange_bundle(
  app_handle: AppHandle,
  request: export::InterchangeExportRequest,
) -> Result<export::InterchangeExportReport, Error> {
  blocking(move || {
    let manager = lock_manager()?;
    export::export(&manager, request, &|progress| {
      if let Err(error) = app_handle.emit(EXPORT_PROGRESS_EVENT, &progress) {
        log::warn!("Failed to emit export progress: {error}");
      }
    })
  })
  .await
}

/// Interchange key -> DMM mod id for everything imported so far.
#[tauri::command]
pub async fn get_interchange_ledger() -> Result<BTreeMap<String, String>, Error> {
  blocking(|| {
    let app_data = lock_manager()?.get_app_local_data_path()?;
    Ok(ledger::load(&app_data).entries)
  })
  .await
}

/// `<source manager>:<profile key>` -> the DMM profile it was imported into.
#[tauri::command]
pub async fn get_interchange_profile_ledger() -> Result<BTreeMap<String, String>, Error> {
  blocking(|| {
    let app_data = lock_manager()?.get_app_local_data_path()?;
    Ok(ledger::load(&app_data).profiles)
  })
  .await
}

/// Remember that a source profile was imported into `profile_id`, so the next
/// import fills that profile again instead of creating another one.
#[tauri::command]
pub async fn record_interchange_profile(key: String, profile_id: String) -> Result<(), Error> {
  blocking(move || {
    // Held for the write, like an import's own ledger update.
    let manager = lock_manager()?;
    let app_data = manager.get_app_local_data_path()?;
    let mut entries = ledger::load(&app_data);
    entries.profiles.insert(key, profile_id);
    ledger::save(&app_data, &entries)
  })
  .await
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentifyResult {
  pub mod_id: String,
  pub remote_id: Option<String>,
  pub mod_name: Option<String>,
  pub mod_author: Option<String>,
  pub certainty: Option<u8>,
  pub error: Option<String>,
}

/// Look imported local mods up by content hash, the same lookup as
/// "Analyze local addons". Never fails as a whole: each mod reports its own
/// outcome.
#[tauri::command]
pub async fn identify_interchange_mods(mod_ids: Vec<String>) -> Result<Vec<IdentifyResult>, Error> {
  let store = {
    let manager = lock_manager()?;
    manager.get_mods_store_path()?
  };
  let analyzer = AddonAnalyzer::new();
  let mut results = Vec::with_capacity(mod_ids.len());
  for mod_id in mod_ids {
    let mut result = IdentifyResult {
      mod_id: mod_id.clone(),
      remote_id: None,
      mod_name: None,
      mod_author: None,
      certainty: None,
      error: None,
    };
    let files_dir = store.join(&mod_id).join("files");
    let first = std::fs::read_dir(&files_dir).ok().and_then(|entries| {
      let mut vpks: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x.eq_ignore_ascii_case("vpk")))
        .collect();
      vpks.sort();
      vpks.into_iter().next()
    });
    match first {
      None => result.error = Some("no stored VPK to analyze".to_string()),
      Some(path) => match analyzer.identify_file(&path).await {
        Ok(Some((remote_id, info))) => {
          result.remote_id = Some(remote_id);
          result.mod_name = info.mod_name;
          result.mod_author = info.mod_author;
          result.certainty = Some(info.certainty);
        }
        Ok(None) => {}
        Err(error) => result.error = Some(error.to_string()),
      },
    }
    results.push(result);
  }
  Ok(results)
}

/// Link an imported local mod to its GameBanana submission: the mod keeps its
/// files and place in every profile, only its id changes.
#[tauri::command]
pub async fn relabel_interchange_mod(from: String, to: String) -> Result<(), Error> {
  use crate::providers::{SubmissionProvider, SubmissionRef};
  let from_ref = SubmissionRef::parse_slug(&from)
    .map_err(|_| Error::InvalidInput(format!("Invalid mod id {from}")))?;
  let to_ref = SubmissionRef::parse_slug(&to)
    .map_err(|_| Error::InvalidInput(format!("Invalid mod id {to}")))?;
  if from_ref.provider != SubmissionProvider::Local
    || to_ref.provider != SubmissionProvider::Gamebanana
  {
    return Err(Error::InvalidInput(
      "Only a local mod can be linked to a GameBanana submission".to_string(),
    ));
  }
  blocking(move || {
    let manager = lock_manager()?;
    let app_data = manager.get_app_local_data_path()?;
    let game_path = manager
      .get_steam_manager()
      .get_game_path()
      .cloned()
      .ok_or(Error::GamePathNotSet)?;
    super::identity_migration::relabel_mod_on_disk(&app_data, &game_path, &from, &to)?;
    let mut entries = ledger::load(&app_data);
    ledger::relabel(&mut entries, &from, &to);
    ledger::save(&app_data, &entries)
  })
  .await
}
