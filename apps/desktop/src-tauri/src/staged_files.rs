//! Files Rust received or downloaded for the renderer to add as local mods.
//! The renderer only reports paths back, so only a path listed here is ever
//! moved into the mods folder or deleted.

use crate::errors::Error;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Who staged a file, so one feature's cleanup never claims another's files.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Stager {
  Forge,
  Source,
}

static STAGED: Mutex<Vec<(Stager, PathBuf)>> = Mutex::new(Vec::new());

fn poisoned() -> Error {
  Error::InvalidInput("Install staging state is poisoned".to_string())
}

pub fn remember(stager: Stager, path: &Path) {
  if let Ok(mut staged) = STAGED.lock() {
    staged.push((stager, path.to_path_buf()));
  }
}

pub fn forget(path: &Path) {
  if let Ok(mut staged) = STAGED.lock() {
    staged.retain(|(_, staged)| staged != path);
  }
}

/// Forgets everything `stager` staged, returning it so it can be deleted.
pub fn drain(stager: Stager) -> Vec<PathBuf> {
  let Ok(mut staged) = STAGED.lock() else {
    return Vec::new();
  };
  let (drained, kept) = std::mem::take(&mut *staged)
    .into_iter()
    .partition(|(owner, _)| *owner == stager);
  *staged = kept;
  drained.into_iter().map(|(_, path)| path).collect()
}

/// Resolves a reported path to a staged file, whoever staged it.
pub fn peek(candidate: &str) -> Result<PathBuf, Error> {
  let candidate = PathBuf::from(candidate);
  let staged = STAGED.lock().map_err(|_| poisoned())?;

  if staged.iter().any(|(_, path)| *path == candidate) {
    Ok(candidate)
  } else {
    Err(Error::UnauthorizedPath(candidate.display().to_string()))
  }
}

/// Resolves a reported path to a file `stager` staged, and forgets it.
pub fn take(stager: Stager, candidate: &str) -> Result<PathBuf, Error> {
  let candidate = PathBuf::from(candidate);
  let mut staged = STAGED.lock().map_err(|_| poisoned())?;

  match staged
    .iter()
    .position(|(owner, path)| *owner == stager && *path == candidate)
  {
    Some(index) => Ok(staged.remove(index).1),
    None => Err(Error::UnauthorizedPath(candidate.display().to_string())),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn only_hands_out_paths_it_staged() {
    let path = std::env::temp_dir().join("dmm-staged-files-test/mod.zip");
    let reported = path.to_string_lossy().into_owned();
    assert!(peek(&reported).is_err());

    remember(Stager::Source, &path);
    assert_eq!(peek(&reported).expect("staged"), path);
    assert!(take(Stager::Forge, &reported).is_err());
    assert_eq!(take(Stager::Source, &reported).expect("staged"), path);
    assert!(take(Stager::Source, &reported).is_err());
  }

  #[test]
  fn drains_only_the_stagers_own_files() {
    let source = std::env::temp_dir().join("dmm-staged-files-test/source.zip");
    remember(Stager::Source, &source);

    drain(Stager::Forge);
    assert_eq!(
      take(Stager::Source, &source.to_string_lossy()).expect("kept"),
      source
    );
  }
}
