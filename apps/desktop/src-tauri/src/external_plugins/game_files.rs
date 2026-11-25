//! The game's own archive for plugins with a `gameFiles` grant: the base
//! `game/citadel/pak01_dir.vpk`, never a mod. Its directory is parsed once and
//! again whenever the file changes, such as after a game update.
use dmm_plugin_runtime::{Error as RuntimeError, GameEntry};
use source2_model::vpk_extract::VpkArchive;
use std::{
  collections::BTreeMap,
  fs,
  path::{Path, PathBuf},
  sync::{Arc, Mutex},
  time::SystemTime,
};

/// Larger resources (maps) are refused instead of read into memory.
const MAX_GAME_FILE_BYTES: usize = 64 * 1024 * 1024;

type Stamp = (u64, SystemTime);

fn host_error(message: impl Into<String>) -> RuntimeError {
  RuntimeError::Host {
    code: "host_error",
    message: message.into(),
  }
}

#[derive(Default)]
pub struct GameArchive {
  opened: Mutex<Option<(PathBuf, Stamp, Arc<VpkArchive>)>>,
}

impl GameArchive {
  fn open(&self, game_path: &Path) -> Result<Arc<VpkArchive>, RuntimeError> {
    let path = game_path.join("game").join("citadel").join("pak01_dir.vpk");
    let meta =
      fs::metadata(&path).map_err(|_| host_error("Deadlock's game files were not found"))?;
    let stamp = (meta.len(), meta.modified()?);
    let mut opened = self
      .opened
      .lock()
      .map_err(|_| host_error("game archive lock poisoned"))?;
    if let Some((current, seen, archive)) = opened.as_ref()
      && *current == path
      && *seen == stamp
    {
      return Ok(Arc::clone(archive));
    }
    let archive = Arc::new(VpkArchive::open(&path).map_err(|error| host_error(error.to_string()))?);
    *opened = Some((path, stamp, Arc::clone(&archive)));
    Ok(archive)
  }

  pub fn entries(&self, game_path: &Path, folder: &str) -> Result<Vec<GameEntry>, RuntimeError> {
    let prefix = if folder.is_empty() {
      String::new()
    } else {
      format!("{folder}/")
    };
    let mut entries = BTreeMap::new();
    for path in self.open(game_path)?.list_entries() {
      let path = path.to_ascii_lowercase();
      let Some(rest) = path.strip_prefix(&prefix) else {
        continue;
      };
      let (name, folder) = match rest.split_once('/') {
        Some((name, _)) => (name, true),
        None => (rest, false),
      };
      *entries.entry(name.to_owned()).or_insert(false) |= folder;
    }
    Ok(
      entries
        .into_iter()
        .map(|(name, folder)| GameEntry { name, folder })
        .collect(),
    )
  }

  pub fn read(&self, game_path: &Path, path: &str) -> Result<Option<Vec<u8>>, RuntimeError> {
    let archive = self.open(game_path)?;
    if !archive.contains_entry(path) {
      return Ok(None);
    }
    archive
      .extract_entry_limited(path, MAX_GAME_FILE_BYTES)
      .map(Some)
      .map_err(|error| host_error(error.to_string()))
  }
}
