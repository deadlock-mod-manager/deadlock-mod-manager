//! Importer: interchange document -> DMM profile.
//!
//! Each mod ends up exactly where DMM's own download path would put it:
//! - its VPKs are kept in the mod store (`<app data>/mods/<id>/files`) so DMM
//!   can re-enable or restore them later,
//! - the selected VPKs are parked in the profile as `<id>_<name>.vpk` and
//!   recorded as disabled in `.dmm.json`,
//! - enabled mods then go through the normal `install_mod` path.
//!
//! A mod whose enabled VPKs already sit in a slot this profile loads (both
//! managers share `citadel/addons`) is adopted in place instead, so the game
//! never loads the same mod twice. Failures stay per mod: one bad entry never
//! aborts the rest of the import.

use super::format::{
  InterchangeDocument, InterchangeMod, InterchangeOrigin, SubmissionKind, is_plain_vpk_name,
  sha256_hex,
};
use crate::errors::Error;
use crate::mod_manager::Mod;
use crate::mod_manager::ModManager;
use crate::mod_manager::file_tree::{ModFile, ModFileTree};
use crate::mod_manager::shard::{ProfileBase, ShardIndex};
use crate::mod_manager::vpk_manifest::ProfileVpkManifest;
use crate::providers::SubmissionRef;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterchangeImportRequest {
  pub document: InterchangeDocument,
  /// Keys of the mods to import; `None` imports everything.
  #[serde(default)]
  pub keys: Option<Vec<String>>,
  pub profile_folder: Option<String>,
  /// First load-order slot for the imported mods (after the existing ones).
  #[serde(default)]
  pub start_order: u32,
  /// Mod ids already in the library, as the frontend store knows them.
  #[serde(default)]
  pub known_mod_ids: Vec<String>,
  /// Load order of the mods already in the profile, as the library shows it.
  /// DMM leaves `order` empty in `.dmm.json` for mods it installed itself;
  /// without these the imported mods would be laid out ahead of them.
  #[serde(default)]
  pub existing_orders: std::collections::BTreeMap<String, u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ImportStatus {
  Imported,
  Skipped,
  Failed,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedMod {
  pub key: String,
  pub mod_id: Option<String>,
  pub status: ImportStatus,
  pub reason: Option<String>,
  pub enabled: bool,
  pub adopted_in_place: bool,
  pub installed_vpks: Vec<String>,
  pub file_tree: Option<ModFileTree>,
  pub install_order: Option<u32>,
}

impl ImportedMod {
  fn skipped(key: &str, mod_id: Option<String>, reason: impl Into<String>) -> Self {
    Self::not_imported(key, mod_id, ImportStatus::Skipped, reason)
  }

  fn failed(key: &str, mod_id: Option<String>, reason: impl Into<String>) -> Self {
    Self::not_imported(key, mod_id, ImportStatus::Failed, reason)
  }

  fn not_imported(
    key: &str,
    mod_id: Option<String>,
    status: ImportStatus,
    reason: impl Into<String>,
  ) -> Self {
    Self {
      key: key.to_string(),
      mod_id,
      status,
      reason: Some(reason.into()),
      enabled: false,
      adopted_in_place: false,
      installed_vpks: Vec::new(),
      file_tree: None,
      install_order: None,
    }
  }
}

/// Emitted once per mod while an import runs.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportProgress {
  pub current: usize,
  pub total: usize,
  pub key: String,
  pub name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InterchangeImportReport {
  pub results: Vec<ImportedMod>,
  pub warnings: Vec<String>,
}

/// Format a hex seed as a UUID so the result passes DMM's `local-<uuid>` check.
fn uuid_from_seed(seed: &str) -> String {
  let hash = sha256_hex(seed);
  format!(
    "{}-{}-{}-{}-{}",
    &hash[0..8],
    &hash[8..12],
    &hash[12..16],
    &hash[16..20],
    &hash[20..32]
  )
}

/// The DMM library id for an entry. Local mods without a usable UUID get one
/// derived from their key, so importing the same file twice is idempotent.
pub fn dmm_mod_id(entry: &InterchangeMod) -> Result<String, String> {
  let candidate = match &entry.origin {
    InterchangeOrigin::GameBanana(origin) => {
      let id = origin.submission_id.trim();
      match origin.submission_type {
        SubmissionKind::Mod => id.to_string(),
        SubmissionKind::Sound => format!("snd-{id}"),
      }
    }
    InterchangeOrigin::Local(origin) => {
      let own = origin
        .local_id
        .as_deref()
        .map(|id| id.trim().trim_start_matches("local-").to_ascii_lowercase())
        .map(|id| format!("local-{id}"))
        .filter(|slug| SubmissionRef::parse_slug(slug).is_ok());
      own.unwrap_or_else(|| format!("local-{}", uuid_from_seed(&entry.key)))
    }
  };
  SubmissionRef::parse_slug(&candidate)
    .map(|_| candidate.clone())
    .map_err(|_| format!("unsupported mod identity \"{candidate}\""))
}

struct UsableFile {
  name: String,
  source: PathBuf,
  size: u64,
  selected: bool,
}

fn usable_files(entry: &InterchangeMod) -> (Vec<UsableFile>, Vec<String>) {
  let mut usable = Vec::new();
  let mut missing = Vec::new();
  let mut names = HashSet::new();
  for file in &entry.files {
    let source = PathBuf::from(&file.path);
    let Ok(stat) = fs::metadata(&source) else {
      missing.push(file.name.clone());
      continue;
    };
    if !stat.is_file()
      || !source
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("vpk"))
    {
      missing.push(file.name.clone());
      continue;
    }
    let name = if is_plain_vpk_name(&file.name) {
      file.name.clone()
    } else {
      source
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("mod_dir.vpk")
        .to_string()
    };
    // Two files may not share a name inside one mod's store folder.
    let mut unique = name.clone();
    let mut counter = 2;
    while !names.insert(unique.to_lowercase()) {
      let stem = name.trim_end_matches(".vpk").trim_end_matches("_dir");
      unique = format!("{stem}_{counter}_dir.vpk");
      counter += 1;
    }
    usable.push(UsableFile {
      name: unique,
      source,
      size: stat.len(),
      selected: file.is_selected(),
    });
  }
  if !usable.is_empty() && !usable.iter().any(|file| file.selected) {
    usable[0].selected = true;
  }
  (usable, missing)
}

fn file_tree_for(files: &[UsableFile]) -> ModFileTree {
  let files: Vec<ModFile> = files
    .iter()
    .map(|file| ModFile {
      name: file.name.clone(),
      path: file.name.clone(),
      size: file.size,
      is_selected: file.selected,
      archive_name: String::new(),
    })
    .collect();
  let total_files = files.len();
  ModFileTree {
    files,
    total_files,
    has_multiple_files: total_files > 1,
  }
}

fn same_size(path: &Path, size: u64) -> bool {
  fs::metadata(path).is_ok_and(|stat| stat.len() == size)
}

fn copy_file(source: &Path, destination: &Path, size: u64) -> Result<(), Error> {
  if same_size(destination, size)
    && fs::canonicalize(source).ok() == fs::canonicalize(destination).ok()
  {
    return Ok(());
  }
  if let Some(parent) = destination.parent() {
    fs::create_dir_all(parent)?;
  }
  let temp = destination.with_extension("vpk.importing");
  fs::copy(source, &temp)?;
  if destination.exists() {
    fs::remove_file(destination)?;
  }
  fs::rename(&temp, destination)?;
  Ok(())
}

fn write_local_metadata(
  mod_dir: &Path,
  mod_id: &str,
  entry: &InterchangeMod,
  source_manager: &str,
) -> Result<(), Error> {
  let path = mod_dir.join("metadata.json");
  if path.exists() {
    return Ok(());
  }
  let metadata = serde_json::json!({
    "id": mod_id,
    "kind": "local",
    "name": entry.name,
    "author": entry.author.clone().unwrap_or_else(|| "Unknown".to_string()),
    "link": entry.link,
    "description": entry.description,
    "category": entry.category,
    "createdAt": chrono::Utc::now().to_rfc3339(),
    "preview": serde_json::Value::Null,
    "importedFrom": source_manager,
    "_schema": 1,
  });
  fs::write(
    path,
    serde_json::to_vec_pretty(&metadata)
      .map_err(|e| Error::InvalidInput(format!("failed to write mod metadata: {e}")))?,
  )?;
  Ok(())
}

/// Enabled pak files that already sit in one shard of this profile and that
/// no other mod claims can be adopted where they are.
fn in_place_shard(
  base: &ProfileBase,
  manifest: &ProfileVpkManifest,
  selected: &[&UsableFile],
) -> Option<(ShardIndex, Vec<String>)> {
  let mut shard = None;
  let mut names = Vec::new();
  for file in selected {
    let parent = file.source.parent()?;
    let name = file.source.file_name()?.to_str()?.to_string();
    crate::mod_manager::vpk_manager::VpkManager::enabled_vpk_number(&name)?;
    let found = base
      .shards()
      .find(|(_, dir)| fs::canonicalize(dir).ok() == fs::canonicalize(parent).ok())
      .map(|(index, _)| index)?;
    if shard.is_some_and(|existing| existing != found) {
      return None;
    }
    shard = Some(found);
    names.push(name);
  }
  let shard = shard?;
  let claimed = manifest.mods.values().any(|entry| {
    entry.enabled
      && entry.shard == shard
      && entry
        .current_vpks
        .iter()
        .any(|vpk| names.iter().any(|name| name.eq_ignore_ascii_case(vpk)))
  });
  (!claimed).then_some((shard, names))
}

struct Placed {
  enabled: bool,
  adopted_in_place: bool,
  reason: Option<String>,
}

fn place_mod(
  manager: &mut ModManager,
  base: &ProfileBase,
  profile_folder: &Option<String>,
  mod_id: &str,
  entry: &InterchangeMod,
  files: &[UsableFile],
  order: u32,
) -> Result<Placed, Error> {
  let selected: Vec<&UsableFile> = files.iter().filter(|file| file.selected).collect();
  let originals: Vec<String> = selected.iter().map(|file| file.name.clone()).collect();

  if entry.enabled {
    let mut manifest = ProfileVpkManifest::open_for_write(base)?;
    if let Some((shard, names)) = in_place_shard(base, &manifest, &selected) {
      manifest.mark_enabled(mod_id, names, originals, Some(order), shard);
      manifest.save(base)?;
      return Ok(Placed {
        enabled: true,
        adopted_in_place: true,
        reason: None,
      });
    }
  }

  let mut prefixed = Vec::new();
  for file in &selected {
    let parked = format!("{mod_id}_{}", file.name);
    copy_file(&file.source, &base.join(&parked), file.size)?;
    prefixed.push(parked);
  }
  let mut manifest = ProfileVpkManifest::open_for_write(base)?;
  manifest.mark_disabled(mod_id, prefixed, originals);
  if let Some(saved) = manifest.mods.get_mut(mod_id) {
    saved.order = Some(order);
  }
  manifest.save(base)?;

  if !entry.enabled {
    return Ok(Placed {
      enabled: false,
      adopted_in_place: false,
      reason: None,
    });
  }

  let install = manager.install_mod(
    Mod {
      id: mod_id.to_string(),
      name: entry.name.clone(),
      is_map: false,
      installed_vpks: Vec::new(),
      file_tree: Some(file_tree_for(files)),
      install_order: None,
      original_vpk_names: Vec::new(),
    },
    profile_folder.clone(),
  );
  match install {
    Ok(_) => Ok(Placed {
      enabled: true,
      adopted_in_place: false,
      reason: None,
    }),
    // The mod is safely parked; the user can enable it from the library.
    Err(error) => Ok(Placed {
      enabled: false,
      adopted_in_place: false,
      reason: Some(format!("imported disabled: could not be enabled ({error})")),
    }),
  }
}

/// A manifest save can fail after writing `.dmm.json.tmp`, which the loader
/// reads as committed. If the mod is in the profile, it was imported: report
/// it so, or a later import would skip it as a duplicate without a ledger entry.
fn committed_despite(base: &ProfileBase, mod_id: &str, error: Error) -> Result<Placed, Error> {
  let Some(saved) = ProfileVpkManifest::load(base)
    .ok()
    .and_then(|manifest| manifest.mods.get(mod_id).cloned())
  else {
    return Err(error);
  };
  Ok(Placed {
    enabled: saved.enabled,
    // Only the in-place path saves an enabled entry before it can fail.
    adopted_in_place: saved.enabled,
    reason: Some(format!("profile manifest was not finalized ({error})")),
  })
}

pub fn import(
  manager: &mut ModManager,
  request: InterchangeImportRequest,
  progress: &dyn Fn(ImportProgress),
) -> Result<InterchangeImportReport, Error> {
  let app_data = manager.get_app_local_data_path()?;
  import_into(manager, &app_data, request, progress)
}

/// [`import`] with DMM's app data folder (ledger and mod store) given.
pub fn import_into(
  manager: &mut ModManager,
  app_data: &Path,
  request: InterchangeImportRequest,
  progress: &dyn Fn(ImportProgress),
) -> Result<InterchangeImportReport, Error> {
  let base = manager.get_addons_path(request.profile_folder.as_deref())?;
  fs::create_dir_all(base.path())?;
  let store = app_data.join("mods");
  let mut ledger = super::ledger::load(app_data);
  let source_manager = if request.document.source.manager.is_empty() {
    "unknown".to_string()
  } else {
    request.document.source.manager.clone()
  };

  let wanted: Option<HashSet<&str>> = request
    .keys
    .as_ref()
    .map(|keys| keys.iter().map(String::as_str).collect());
  let mut entries: Vec<&InterchangeMod> = request
    .document
    .mods
    .iter()
    .filter(|entry| {
      wanted
        .as_ref()
        .is_none_or(|keys| keys.contains(entry.key.as_str()))
    })
    .collect();
  entries.sort_by_key(|entry| entry.order);

  let existing = ProfileVpkManifest::load(&base)?;
  let mut known: HashSet<String> = request.known_mod_ids.iter().cloned().collect();
  known.extend(existing.mods.keys().cloned());

  let mut results = Vec::new();
  let mut next_order = request.start_order;
  let mut any_enabled = false;
  let total = entries.len();
  for (index, entry) in entries.into_iter().enumerate() {
    progress(ImportProgress {
      current: index,
      total,
      key: entry.key.clone(),
      name: entry.name.clone(),
    });
    // An earlier import of this key may since have been linked to its
    // GameBanana page; keep using the id the user chose.
    let remembered = ledger
      .entries
      .get(&entry.key)
      .filter(|id| SubmissionRef::parse_slug(id).is_ok())
      .cloned();
    let mod_id = match remembered.map(Ok).unwrap_or_else(|| dmm_mod_id(entry)) {
      Ok(id) => id,
      Err(reason) => {
        results.push(ImportedMod::failed(&entry.key, None, reason));
        continue;
      }
    };
    if !known.insert(mod_id.clone()) {
      results.push(ImportedMod::skipped(
        &entry.key,
        Some(mod_id),
        "already in this profile",
      ));
      continue;
    }

    let (files, missing) = usable_files(entry);
    if files.is_empty() {
      results.push(ImportedMod::skipped(
        &entry.key,
        Some(mod_id),
        if entry.files.is_empty() {
          "the source lists no VPK files".to_string()
        } else {
          format!("VPK files not found: {}", missing.join(", "))
        },
      ));
      continue;
    }

    let mod_dir = store.join(&mod_id);
    let files_dir = mod_dir.join("files");
    let stored = files
      .iter()
      .try_for_each(|file| copy_file(&file.source, &files_dir.join(&file.name), file.size));
    if let Err(error) = stored {
      results.push(ImportedMod::failed(
        &entry.key,
        Some(mod_id),
        format!("could not copy files: {error}"),
      ));
      continue;
    }
    if matches!(entry.origin, InterchangeOrigin::Local(_))
      && let Err(error) = write_local_metadata(&mod_dir, &mod_id, entry, &source_manager)
    {
      log::warn!("Could not write metadata for imported mod {mod_id}: {error}");
    }

    let order = next_order;
    let placed = place_mod(
      manager,
      &base,
      &request.profile_folder,
      &mod_id,
      entry,
      &files,
      order,
    )
    .or_else(|error| committed_despite(&base, &mod_id, error));
    match placed {
      Ok(placed) => {
        next_order += 1;
        any_enabled |= placed.enabled;
        ledger.entries.insert(entry.key.clone(), mod_id.clone());
        let mut reason = placed.reason;
        if !missing.is_empty() {
          let note = format!("missing variant file(s): {}", missing.join(", "));
          reason = Some(match reason {
            Some(existing) => format!("{existing}; {note}"),
            None => note,
          });
        }
        results.push(ImportedMod {
          key: entry.key.clone(),
          mod_id: Some(mod_id),
          status: ImportStatus::Imported,
          reason,
          enabled: placed.enabled,
          adopted_in_place: placed.adopted_in_place,
          installed_vpks: Vec::new(),
          file_tree: Some(file_tree_for(&files)),
          install_order: Some(order),
        });
      }
      Err(error) => results.push(ImportedMod::failed(
        &entry.key,
        Some(mod_id),
        error.to_string(),
      )),
    }
  }

  progress(ImportProgress {
    current: total,
    total,
    key: String::new(),
    name: String::new(),
  });
  let mut warnings = Vec::new();
  if let Err(error) = super::ledger::save(app_data, &ledger) {
    warnings.push(format!("Could not remember the imported mods: {error}"));
  }
  let imported: Vec<String> = results
    .iter()
    .filter(|result| result.status == ImportStatus::Imported)
    .filter_map(|result| result.mod_id.clone())
    .collect();
  if !imported.is_empty() {
    // Write the final order once, then let DMM lay the pak files out, instead
    // of reshuffling the profile after every single mod.
    let mut manifest = ProfileVpkManifest::open_for_write(&base)?;
    for (id, order) in &request.existing_orders {
      if let Some(saved) = manifest.mods.get_mut(id)
        && saved.order.is_none()
      {
        saved.order = Some(*order);
      }
    }
    for result in &results {
      if let (Some(id), Some(order)) = (&result.mod_id, result.install_order)
        && let Some(saved) = manifest.mods.get_mut(id)
      {
        saved.order = Some(order);
      }
    }
    manifest.save(&base)?;
    if any_enabled
      && let Err(error) = manager.reorder_all_mods_for_profile(request.profile_folder.clone())
    {
      warnings.push(format!(
        "Mods were imported, but the final load order could not be applied: {error}"
      ));
    }
  }

  let manifest = ProfileVpkManifest::load(&base)?;
  for result in &mut results {
    if let Some(id) = &result.mod_id
      && result.status == ImportStatus::Imported
      && let Some(saved) = manifest.mods.get(id)
    {
      result.enabled = saved.enabled;
      result.installed_vpks = if saved.enabled {
        saved.current_vpks.clone()
      } else {
        Vec::new()
      };
    }
  }

  log::info!(
    "Interchange import from {source_manager}: {} imported, {} skipped, {} failed",
    imported.len(),
    results
      .iter()
      .filter(|r| r.status == ImportStatus::Skipped)
      .count(),
    results
      .iter()
      .filter(|r| r.status == ImportStatus::Failed)
      .count(),
  );
  Ok(InterchangeImportReport { results, warnings })
}

#[cfg(test)]
mod tests {
  use super::super::format::{GameBananaOrigin, LocalOrigin};
  use super::*;

  #[test]
  fn a_readable_temp_manifest_counts_as_imported() {
    let root = tempfile::tempdir().unwrap();
    let addons = root.path().join("game/citadel/addons");
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_disabled(
      "local-1",
      vec!["local-1_a.vpk".into()],
      vec!["a.vpk".into()],
    );
    manifest.save(&addons).unwrap();
    // A rename that failed after the temp file was written.
    fs::rename(addons.join(".dmm.json"), addons.join(".dmm.json.tmp")).unwrap();
    let base = ProfileBase::new(&addons).unwrap();

    let placed = committed_despite(&base, "local-1", Error::InvalidInput("rename".into())).unwrap();
    assert!(!placed.enabled);
    assert!(placed.reason.is_some());
    assert!(committed_despite(&base, "local-2", Error::InvalidInput("rename".into())).is_err());
  }

  fn entry(origin: InterchangeOrigin, key: &str) -> InterchangeMod {
    InterchangeMod {
      key: key.to_string(),
      name: "x".to_string(),
      enabled: true,
      order: 0,
      origin,
      author: None,
      description: None,
      category: None,
      hero: None,
      thumbnail_url: None,
      link: None,
      nsfw: None,
      files: Vec::new(),
      extensions: None,
    }
  }

  #[test]
  fn maps_identities_to_dmm_ids() {
    let gb = |kind, id: &str| {
      entry(
        InterchangeOrigin::GameBanana(GameBananaOrigin {
          submission_type: kind,
          submission_id: id.to_string(),
          file_id: None,
          file_name: None,
        }),
        "k",
      )
    };
    assert_eq!(
      dmm_mod_id(&gb(SubmissionKind::Mod, "650634")).unwrap(),
      "650634"
    );
    assert_eq!(
      dmm_mod_id(&gb(SubmissionKind::Sound, "12")).unwrap(),
      "snd-12"
    );
    assert!(dmm_mod_id(&gb(SubmissionKind::Mod, "012")).is_err());

    let own = entry(
      InterchangeOrigin::Local(LocalOrigin {
        local_id: Some("local-0F8FAD5B-D9CB-469F-A165-70867728950E".to_string()),
      }),
      "local:x",
    );
    assert_eq!(
      dmm_mod_id(&own).unwrap(),
      "local-0f8fad5b-d9cb-469f-a165-70867728950e"
    );

    let derived = entry(
      InterchangeOrigin::Local(LocalOrigin::default()),
      "local:sha256:ab",
    );
    let first = dmm_mod_id(&derived).unwrap();
    assert_eq!(first, dmm_mod_id(&derived).unwrap());
    assert!(SubmissionRef::parse_slug(&first).is_ok());
  }
}
