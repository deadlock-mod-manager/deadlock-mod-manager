//! A process-wide cache of opened VPK archives.
//!
//! Opening `pak01_dir.vpk` costs ~550 ms: the 6 MB directory is read and its
//! ~1M entries are parsed into an index. Every Foundry command that touches the
//! base game paid that toll again, which on the paint tab meant paying it for
//! the coverage scan, then again for each apply.
//!
//! The archives here are immutable once opened, so they are shared behind an
//! `Arc` rather than copied. The cache is keyed by path *and* the source file's
//! length and modification time, so a staged VPK that gets re-staged (the user
//! reloaded a mod that changed on disk) is reopened instead of served stale.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

use source2_model::vpk_extract::VpkArchive;

use crate::errors::Error;

/// Identity of a cached archive: where it is, plus what it looked like when it
/// was opened.
#[derive(PartialEq, Eq, Hash, Clone)]
struct ArchiveKey {
  path: PathBuf,
  overlay: Option<PathBuf>,
  len: u64,
  modified_nanos: u128,
}

/// Bounded so a long session that opens many skins cannot grow without limit.
/// A handful is plenty: in practice it is the base pak plus the loaded skin.
const MAX_CACHED_ARCHIVES: usize = 6;

type Cache = Mutex<Vec<(ArchiveKey, Arc<VpkArchive>)>>;

fn cache() -> &'static Cache {
  static CACHE: OnceLock<Cache> = OnceLock::new();
  CACHE.get_or_init(|| Mutex::new(Vec::new()))
}

fn key_for(path: &Path, overlay: Option<&Path>) -> Result<ArchiveKey, Error> {
  let metadata = std::fs::metadata(path)?;
  let modified_nanos = metadata
    .modified()
    .ok()
    .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
    .map(|since| since.as_nanos())
    .unwrap_or_default();
  Ok(ArchiveKey {
    path: path.to_path_buf(),
    overlay: overlay.map(Path::to_path_buf),
    len: metadata.len(),
    modified_nanos,
  })
}

/// An opened archive, from the cache when its source is unchanged.
///
/// `overlay` is part of the identity, not a mutable property: an archive opened
/// with a workspace shadowing it answers differently from one without, so the
/// two are cached separately.
///
/// Note the overlay's *contents* are deliberately not part of the key. The
/// overlay is a directory of files the user is actively editing, and hashing it
/// on every call would cost more than it saves; callers that need to see fresh
/// edits (the preview decode) read through `VpkArchive`, which hits the
/// filesystem per entry and therefore always sees the current bytes.
pub(crate) fn open_archive(path: &Path, overlay: Option<&Path>) -> Result<Arc<VpkArchive>, Error> {
  let key = key_for(path, overlay)?;

  {
    let cached = cache()
      .lock()
      .map_err(|e| Error::InvalidInput(format!("archive cache poisoned: {e}")))?;
    if let Some((_, archive)) = cached.iter().find(|(cached_key, _)| *cached_key == key) {
      return Ok(Arc::clone(archive));
    }
  }

  // Opened outside the lock: parsing the base pak takes long enough that
  // holding the mutex would serialize every other command behind it.
  let archive = Arc::new(
    VpkArchive::open_with_overlay(path, overlay)
      .map_err(|e| Error::InvalidInput(format!("failed to open VPK {}: {e}", path.display())))?,
  );

  let mut cached = cache()
    .lock()
    .map_err(|e| Error::InvalidInput(format!("archive cache poisoned: {e}")))?;
  // A concurrent caller may have inserted the same archive; either is fine, but
  // keep one entry per key.
  cached.retain(|(cached_key, _)| *cached_key != key);
  cached.push((key, Arc::clone(&archive)));
  if cached.len() > MAX_CACHED_ARCHIVES {
    cached.remove(0);
  }
  Ok(archive)
}

/// Forget every cached archive. Called when a skin is unloaded: a parsed pak01
/// index is hundreds of megabytes of strings, which is not worth holding for
/// something the user has closed.
pub(crate) fn clear_archive_cache() {
  if let Ok(mut cached) = cache().lock() {
    cached.clear();
  }
}
