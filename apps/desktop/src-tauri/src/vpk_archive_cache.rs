use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

use source2_model::vpk_extract::VpkArchive;

use crate::errors::Error;

#[derive(PartialEq, Eq, Hash, Clone)]
struct ArchiveKey {
  path: PathBuf,
  overlay: Option<PathBuf>,
  len: u64,
  modified_nanos: u128,
  staged_revision: Option<String>,
}

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
    staged_revision: std::fs::read_to_string(path.with_extension("stamp")).ok(),
  })
}

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

  let archive = Arc::new(
    VpkArchive::open_with_overlay(path, overlay)
      .map_err(|e| Error::InvalidInput(format!("failed to open VPK {}: {e}", path.display())))?,
  );

  let mut cached = cache()
    .lock()
    .map_err(|e| Error::InvalidInput(format!("archive cache poisoned: {e}")))?;
  cached.retain(|(cached_key, _)| *cached_key != key);
  cached.push((key, Arc::clone(&archive)));
  if cached.len() > MAX_CACHED_ARCHIVES {
    cached.remove(0);
  }
  Ok(archive)
}

pub(crate) fn clear_archive_cache() {
  if let Ok(mut cached) = cache().lock() {
    cached.clear();
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn a_new_staging_revision_invalidates_an_equal_size_equal_time_archive() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("pak01_dir.vpk");
    let mut bytes = 0x55aa1234u32.to_le_bytes().to_vec();
    bytes.extend_from_slice(&1u32.to_le_bytes());
    bytes.extend_from_slice(&1u32.to_le_bytes());
    bytes.push(0);
    std::fs::write(&path, bytes).unwrap();
    std::fs::write(path.with_extension("stamp"), "game-revision-one").unwrap();
    let first = open_archive(&path, None).unwrap();
    assert!(Arc::ptr_eq(&first, &open_archive(&path, None).unwrap()));
    std::fs::write(path.with_extension("stamp"), "game-revision-two").unwrap();
    assert!(!Arc::ptr_eq(&first, &open_archive(&path, None).unwrap()));
  }
}
