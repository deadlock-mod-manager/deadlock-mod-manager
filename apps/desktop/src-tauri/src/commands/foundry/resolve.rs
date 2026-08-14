//! Resolving a mod-manager mod id to the VPK on disk the Foundry should open.

use std::collections::HashSet;
use std::path::PathBuf;

use crate::errors::Error;
use vpkmanager::{locate, naming};

use crate::commands::state::MANAGER;

/// A VPK the Foundry could open: not a `_NNN.vpk` companion, which holds data
/// but no directory of its own.
fn is_openable(path: &std::path::Path) -> bool {
  path
    .file_name()
    .and_then(|name| name.to_str())
    .is_some_and(|name| !naming::is_multipart_companion(name))
}

fn push_candidate(out: &mut Vec<PathBuf>, seen: &mut HashSet<PathBuf>, path: PathBuf) {
  if path.exists() && seen.insert(path.clone()) {
    out.push(path);
  }
}

fn sort_store_candidates(candidates: &mut [PathBuf]) {
  candidates.sort_by(|a, b| {
    let a_stem = a.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    let b_stem = b.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    let a_is_dir = a_stem.ends_with("_dir");
    let b_is_dir = b_stem.ends_with("_dir");
    b_is_dir.cmp(&a_is_dir).then_with(|| {
      std::fs::metadata(b)
        .map(|m| m.len())
        .unwrap_or(0)
        .cmp(&std::fs::metadata(a).map(|m| m.len()).unwrap_or(0))
    })
  });
}

/// Resolve the absolute path to a mod's primary VPK from the DMM mod store
/// (`<app_local_data>/mods/<mod_id>/`). Downloaded mods keep their VPK under
/// `verified-vpk/`, local mods under `files/`, so the whole mod folder is
/// scanned. Installed mods may no longer have a cached VPK, so the active
/// profile's addons folder is used as a fallback.
#[tauri::command]
pub fn foundry_resolve_mod_vpk(
  mod_id: String,
  _installed_vpks: Option<Vec<String>>,
  profile_folder: Option<String>,
) -> Result<String, Error> {
  let (store_path, addons_path) = {
    let manager = MANAGER
      .lock()
      .map_err(|e| Error::InvalidInput(format!("manager lock poisoned: {e}")))?;
    (
      manager.get_mods_store_path()?,
      manager.get_addons_path(profile_folder.as_deref()).ok(),
    )
  };

  let mut candidates = Vec::new();
  let mut seen = HashSet::new();

  // What the mod has installed in this profile, wherever those files now are.
  if let Some(addons_path) = addons_path.as_ref().filter(|path| path.exists()) {
    for path in locate::mod_vpks(addons_path, &mod_id)?
      .into_iter()
      .filter(|path| is_openable(path))
    {
      push_candidate(&mut candidates, &mut seen, path);
    }
  }

  // Then the copy in the mod's own download folder, preferring a `_dir.vpk`
  // and, among equals, the largest file.
  let mod_dir = store_path.join(&mod_id);
  if mod_dir.exists() {
    let mut store_candidates: Vec<PathBuf> = locate::vpks_under(&mod_dir)
      .into_iter()
      .filter(|path| is_openable(path))
      .collect();
    sort_store_candidates(&mut store_candidates);
    for candidate in store_candidates {
      push_candidate(&mut candidates, &mut seen, candidate);
    }
  }

  let Some(chosen) = candidates.first() else {
    return Err(Error::InvalidInput(format!(
      "no VPK found for mod {mod_id}"
    )));
  };

  log::info!(
    "[Foundry] Resolved mod {mod_id} to VPK {} from {} candidates",
    chosen.display(),
    candidates.len()
  );

  Ok(chosen.to_string_lossy().to_string())
}
