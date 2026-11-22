use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

use crate::errors::Error;

use super::game::{base_game_vpk_path, core_vpk_path};
use super::workspace::{copy_companion_archives, sanitize_workspace_name, short_path_hash};

fn staging_root() -> PathBuf {
  std::env::temp_dir()
    .join("deadlock-mod-manager")
    .join("foundry-staged-vpk")
}

enum Companions {
  Copy,
  Reference,
}

pub(crate) fn stage_lock(id: &str) -> Arc<Mutex<()>> {
  static LOCKS: OnceLock<Mutex<HashMap<String, Arc<Mutex<()>>>>> = OnceLock::new();
  let locks = LOCKS.get_or_init(|| Mutex::new(HashMap::new()));
  let mut guard = locks
    .lock()
    .unwrap_or_else(|poisoned| poisoned.into_inner());
  Arc::clone(guard.entry(id.to_string()).or_default())
}

pub(super) fn source_stamp(path: &Path) -> Result<String, Error> {
  fn stamp(hash: &mut Sha256, path: &Path) -> Result<(), Error> {
    let metadata = std::fs::metadata(path)?;
    hash.update(path.to_string_lossy().as_bytes());
    hash.update(metadata.len().to_le_bytes());
    hash.update(
      metadata
        .modified()?
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
        .to_le_bytes(),
    );
    Ok(())
  }
  let mut hash = Sha256::new();
  stamp(&mut hash, path)?;
  let mut file = std::fs::File::open(path)?;
  let mut header = [0; 12];
  file.read_exact(&mut header)?;
  hash.update(header);
  let version = u32::from_le_bytes(header[4..8].try_into().unwrap());
  if u32::from_le_bytes(header[..4].try_into().unwrap()) != 0x55aa1234 || !matches!(version, 1 | 2)
  {
    return Err(Error::Preview {
      kind: "previewCorruptArchive",
      message: "Invalid VPK header".into(),
    });
  }
  if version == 2 {
    let mut rest = [0; 16];
    file.read_exact(&mut rest)?;
    hash.update(rest);
  }
  let mut remaining = u32::from_le_bytes(header[8..12].try_into().unwrap()) as usize;
  if remaining > 64 * 1024 * 1024 {
    return Err(Error::Preview {
      kind: "previewUnsupported",
      message: "VPK directory exceeds the preview analysis limit".into(),
    });
  }
  let mut buffer = [0; 64 * 1024];
  while remaining > 0 {
    let count = remaining.min(buffer.len());
    file.read_exact(&mut buffer[..count])?;
    hash.update(&buffer[..count]);
    remaining -= count;
  }
  if let Some(base) = path
    .file_stem()
    .and_then(|stem| stem.to_str())
    .and_then(|stem| stem.strip_suffix("_dir"))
  {
    let mut companions = Vec::new();
    for entry in std::fs::read_dir(path.parent().unwrap_or_else(|| Path::new(".")))? {
      let path = entry?.path();
      let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default();
      let numbered = name
        .strip_prefix(&format!("{base}_"))
        .and_then(|name| name.strip_suffix(".vpk"));
      if numbered
        .is_some_and(|number| number.len() == 3 && number.bytes().all(|byte| byte.is_ascii_digit()))
        && path.is_file()
      {
        companions.push(path);
      }
    }
    companions.sort();
    for companion in companions {
      stamp(&mut hash, &companion)?;
    }
  }
  Ok(format!("{:x}", hash.finalize()))
}

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

pub(crate) fn stage_source_vpk(source: &Path) -> Result<PathBuf, Error> {
  stage(source, Companions::Copy)
}

pub(crate) fn staged_base_game_vpk() -> Result<Option<PathBuf>, Error> {
  let Some(base_vpk) = base_game_vpk_path()? else {
    return Ok(None);
  };
  stage(&base_vpk, Companions::Reference).map(Some)
}

pub(crate) fn staged_core_vpk() -> Result<Option<PathBuf>, Error> {
  let Some(core_vpk) = core_vpk_path()? else {
    return Ok(None);
  };
  stage(&core_vpk, Companions::Reference).map(Some)
}
