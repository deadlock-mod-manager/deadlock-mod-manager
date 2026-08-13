//! Resolving a mod-manager mod id to the VPK on disk the Foundry should open.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use crate::errors::Error;
use crate::mod_manager::vpk_manifest::ProfileVpkManifest;

use crate::commands::state::MANAGER;

/// Recursively collect `.vpk` files under `dir` (bounded depth), skipping the
/// multi-part companion archives (`*_NNN.vpk`) so only dir/standalone VPKs match.
fn collect_vpks(dir: &std::path::Path, depth: usize, out: &mut Vec<PathBuf>) {
  if depth > 6 {
    return;
  }
  let Ok(entries) = std::fs::read_dir(dir) else {
    return;
  };
  for entry in entries.flatten() {
    let path = entry.path();
    if path.is_dir() {
      collect_vpks(&path, depth + 1, out);
    } else if path.extension().and_then(|e| e.to_str()) == Some("vpk") {
      let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
      // Skip `<base>_003.vpk` numbered archives; keep `_dir.vpk` and plain names.
      let is_numbered_archive = stem
        .rsplit_once('_')
        .map(|(_, tail)| tail.len() == 3 && tail.chars().all(|c| c.is_ascii_digit()))
        .unwrap_or(false);
      if !is_numbered_archive {
        out.push(path);
      }
    }
  }
}

fn collect_vpks_shallow(dir: &Path, out: &mut Vec<PathBuf>) {
  let Ok(entries) = std::fs::read_dir(dir) else {
    return;
  };
  for entry in entries.flatten() {
    let path = entry.path();
    if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("vpk") {
      out.push(path);
    }
  }
}

fn push_candidate(out: &mut Vec<PathBuf>, seen: &mut HashSet<PathBuf>, path: PathBuf) {
  if path.exists() && seen.insert(path.clone()) {
    out.push(path);
  }
}

fn push_named_vpks(
  out: &mut Vec<PathBuf>,
  seen: &mut HashSet<PathBuf>,
  base_dir: &Path,
  names: &[String],
) {
  for name in names {
    let filename = Path::new(name)
      .file_name()
      .map(PathBuf::from)
      .unwrap_or_else(|| PathBuf::from(name));
    push_candidate(out, seen, base_dir.join(filename));
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
  installed_vpks: Option<Vec<String>>,
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

  if let Some(addons_path) = addons_path.as_ref().filter(|path| path.exists()) {
    if let Ok(manifest) = ProfileVpkManifest::load(addons_path)
      && let Some(entry) = manifest.mods.get(&mod_id)
    {
      push_named_vpks(&mut candidates, &mut seen, addons_path, &entry.current_vpks);
      push_named_vpks(
        &mut candidates,
        &mut seen,
        addons_path,
        &entry.disabled_vpks,
      );
    }

    if let Some(installed_vpks) = installed_vpks.as_ref() {
      push_named_vpks(&mut candidates, &mut seen, addons_path, installed_vpks);
    }
  }

  let mod_dir = store_path.join(&mod_id);
  if mod_dir.exists() {
    let mut store_candidates = Vec::new();
    collect_vpks(&mod_dir, 0, &mut store_candidates);
    sort_store_candidates(&mut store_candidates);
    for candidate in store_candidates {
      push_candidate(&mut candidates, &mut seen, candidate);
    }
  }

  if let Some(addons_path) = addons_path.as_ref().filter(|path| path.exists()) {
    let mut prefixed = Vec::new();
    collect_vpks_shallow(addons_path, &mut prefixed);
    prefixed.sort();
    for candidate in prefixed {
      let filename = candidate
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or_default();
      if filename.starts_with(&format!("{mod_id}_")) {
        push_candidate(&mut candidates, &mut seen, candidate);
      }
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
