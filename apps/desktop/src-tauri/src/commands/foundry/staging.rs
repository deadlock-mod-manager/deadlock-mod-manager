//! Staging copies of the VPKs the Foundry loads.
//!
//! No VPK is ever parsed where the user keeps it. A source VPK is copied into a
//! temporary staging directory first, and every later read — entry listing,
//! texture and model decoding, workspace unpacking — goes through that copy. The
//! original in the game install or addon folder is opened exactly once, for the
//! copy, and never again while the skin is loaded. That keeps the Foundry from
//! holding a handle on a file the mod manager may be reconciling underneath it.
//!
//! The base game's `pak01_dir.vpk` is staged like any other VPK, but its
//! companion archives are not: the directory file is a few megabytes, the ~100
//! companions behind it are tens of gigabytes. Only the directory file is
//! parsed, so only it is copied; payload reads reach the companions in place
//! through the `.origin` sidecar (see `source2_model::vpk_extract`).

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

use crate::errors::Error;

use super::game::base_game_vpk_path;
use super::workspace::{copy_companion_archives, sanitize_workspace_name, short_path_hash};

/// Where staged copies live: `<temp>/deadlock-mod-manager/foundry-staged-vpk/<id>/`.
fn staging_root() -> PathBuf {
  std::env::temp_dir()
    .join("deadlock-mod-manager")
    .join("foundry-staged-vpk")
}

/// What to do with the `_NNN.vpk` archives beside a `_dir.vpk`.
enum Companions {
  /// Copy them into the staging directory, making the staged set standalone.
  Copy,
  /// Leave them in place and record their directory in the origin sidecar.
  Reference,
}

/// Per-staging-id lock, so two skin selections racing on the same source VPK
/// can't both be halfway through writing the same staged file.
fn stage_lock(id: &str) -> Arc<Mutex<()>> {
  static LOCKS: OnceLock<Mutex<HashMap<String, Arc<Mutex<()>>>>> = OnceLock::new();
  let locks = LOCKS.get_or_init(|| Mutex::new(HashMap::new()));
  let mut guard = locks
    .lock()
    .unwrap_or_else(|poisoned| poisoned.into_inner());
  Arc::clone(guard.entry(id.to_string()).or_default())
}

/// `<length>:<modified nanos>` of the source, used to decide whether an existing
/// staged copy is still current. Written next to the staged VPK rather than
/// inferred from its own metadata, because `fs::copy` preserves timestamps on
/// some platforms and not others.
fn source_stamp(path: &Path) -> Result<String, Error> {
  let metadata = std::fs::metadata(path)?;
  let modified = metadata
    .modified()
    .ok()
    .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
    .map(|since_epoch| since_epoch.as_nanos())
    .unwrap_or_default();
  Ok(format!("{}:{modified}", metadata.len()))
}

/// Copy through a `.part` file so an interrupted or concurrent copy can never
/// leave a truncated VPK in place of a complete one.
fn copy_atomic(source: &Path, dest: &Path) -> Result<(), Error> {
  let temp = dest.with_extension("part");
  if temp.exists() {
    std::fs::remove_file(&temp)?;
  }
  std::fs::copy(source, &temp)?;
  if dest.exists() {
    std::fs::remove_file(dest)?;
  }
  std::fs::rename(&temp, dest)?;
  Ok(())
}

/// Copy `source` into the staging area and return the path to parse instead.
///
/// Staging is skipped while an existing copy still matches the source's length
/// and modification time, so reopening the same skin costs nothing. A path that
/// is already inside the staging area is returned unchanged, which makes this
/// safe to call again on a manifest's `file_path`.
fn stage(source: &Path, companions: Companions) -> Result<PathBuf, Error> {
  let root = staging_root();
  if source.starts_with(&root) {
    return Ok(source.to_path_buf());
  }
  if !source.is_file() {
    return Err(Error::InvalidInput(format!(
      "VPK not found: {}",
      source.display()
    )));
  }

  let filename = source
    .file_name()
    .and_then(|name| name.to_str())
    .unwrap_or("source.vpk");
  let stem = source
    .file_stem()
    .and_then(|name| name.to_str())
    .unwrap_or("vpk");
  let id = format!(
    "{}-{}",
    sanitize_workspace_name(stem),
    short_path_hash(&source.to_string_lossy()),
  );
  let dir = root.join(&id);
  let staged = dir.join(filename);

  let lock = stage_lock(&id);
  let _guard = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

  std::fs::create_dir_all(&dir)?;
  let stamp = source_stamp(source)?;
  let stamp_path = staged.with_extension("stamp");
  let is_current = staged.is_file()
    && std::fs::read_to_string(&stamp_path)
      .map(|text| text.trim() == stamp)
      .unwrap_or(false);
  if is_current {
    return Ok(staged);
  }

  // Drop the stamp first: a copy that fails partway then leaves an obviously
  // stale staging dir rather than one that claims to be current.
  let _ = std::fs::remove_file(&stamp_path);
  copy_atomic(source, &staged)?;

  let sidecar = source2_model::vpk_extract::origin_sidecar_path(&staged);
  match companions {
    Companions::Copy => {
      let _ = std::fs::remove_file(&sidecar);
      copy_companion_archives(source, &dir)?;
    }
    Companions::Reference => {
      let origin = source.parent().unwrap_or_else(|| Path::new("."));
      std::fs::write(&sidecar, origin.to_string_lossy().as_bytes())?;
    }
  }
  std::fs::write(&stamp_path, &stamp)?;

  log::info!(
    "[Foundry] Staged VPK {} -> {}",
    source.display(),
    staged.display(),
  );
  Ok(staged)
}

/// Stage a skin VPK the user picked, companions included, and return the copy to
/// parse. The staged set is standalone: nothing reads the original afterwards.
pub(crate) fn stage_source_vpk(source: &Path) -> Result<PathBuf, Error> {
  stage(source, Companions::Copy)
}

/// Stage the base game's `pak01_dir.vpk` and return the copy to parse, or `None`
/// when the game isn't installed. Only the directory file is copied; its
/// companion archives stay in the game install (see the module docs).
pub(crate) fn staged_base_game_vpk() -> Result<Option<PathBuf>, Error> {
  let Some(base_vpk) = base_game_vpk_path()? else {
    return Ok(None);
  };
  stage(&base_vpk, Companions::Reference).map(Some)
}
