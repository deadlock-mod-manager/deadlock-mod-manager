use crate::errors::Error;
use crate::mod_manager::vdata_history::VdataHistoryIndex;
use sha2::{Digest, Sha256};
use std::{
  fs,
  io::Write,
  path::{Path, PathBuf},
};

/// The install's observed game data file, keyed by the citadel path. None when
/// the platform has no cache folder; loads are then empty and saves skipped.
pub(super) fn path(citadel: &Path) -> Option<PathBuf> {
  let installation = hex::encode(Sha256::digest(citadel.as_os_str().as_encoded_bytes()));
  crate::runtime_environment::app_cache_dir("dev.stormix.deadlock-mod-manager").map(|root| {
    root
      .join("compatibility")
      .join(installation)
      .join("vdata-history.bin")
  })
}

pub(super) fn load(path: Option<&Path>) -> VdataHistoryIndex {
  let Some(path) = path else {
    return VdataHistoryIndex::default();
  };
  match fs::read(path) {
    Ok(bytes) => VdataHistoryIndex::from_bytes(&bytes).unwrap_or_else(|error| {
      log::warn!("Ignoring unreadable observed compatibility history: {error}");
      VdataHistoryIndex::default()
    }),
    Err(error) => {
      if error.kind() != std::io::ErrorKind::NotFound {
        log::warn!("Could not read observed compatibility history: {error}");
      }
      VdataHistoryIndex::default()
    }
  }
}

pub(super) fn digest(path: Option<&Path>) -> Option<String> {
  let bytes = fs::read(path?).ok()?;
  Some(hex::encode(Sha256::digest(bytes)))
}

pub(super) fn version(citadel: &Path) -> Option<u32> {
  fs::read_to_string(citadel.join("steam.inf"))
    .ok()?
    .lines()
    .find_map(|line| {
      line
        .trim()
        .strip_prefix("ClientVersion=")
        .and_then(|version| version.trim().parse().ok())
    })
}

pub(super) fn save(path: &Path, history: &VdataHistoryIndex) -> Result<(), Error> {
  let parent = path.parent().expect("cache path has a parent");
  fs::create_dir_all(parent)?;
  let mut staged = tempfile::NamedTempFile::new_in(parent)?;
  staged.write_all(&history.to_bytes().map_err(Error::ModInvalid)?)?;
  staged.as_file().sync_all()?;
  staged
    .persist(path)
    .map_err(|error| Error::Io(error.error))?;
  Ok(())
}
