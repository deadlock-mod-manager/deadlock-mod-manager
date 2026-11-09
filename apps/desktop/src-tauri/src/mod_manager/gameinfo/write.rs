use std::fs;
use std::io::Write;
use std::path::Path;

#[derive(Debug, thiserror::Error)]
pub(crate) enum WriteError {
  #[error("gameinfo.gi changed while edits were being prepared; try again")]
  Changed,
  #[error(transparent)]
  Io(#[from] std::io::Error),
}

/// Read a byte snapshot, returning `None` when the file is missing.
pub(crate) fn read(path: &Path) -> std::io::Result<Option<Vec<u8>>> {
  match fs::read(path) {
    Ok(content) => Ok(Some(content)),
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
    Err(error) => Err(error),
  }
}

/// Commit validated content at the file's target, keeping symlinks and permissions.
/// `None` means the file was missing; creation never replaces an existing entry.
/// Comparisons detect edits made while preparing the replacement. External
/// editors do not share a lock with DMM: this is best-effort conflict detection,
/// not a filesystem compare-and-swap guarantee.
pub(crate) fn commit(
  path: &Path,
  expected: Option<&[u8]>,
  updated: &[u8],
) -> Result<(), WriteError> {
  // Canonical paths also carry Windows' verbatim prefix for long game paths.
  let target = if expected.is_some() {
    path.canonicalize().map_err(|error| {
      if error.kind() == std::io::ErrorKind::NotFound {
        WriteError::Changed
      } else {
        WriteError::Io(error)
      }
    })?
  } else {
    let name = path.file_name().ok_or_else(|| {
      std::io::Error::new(
        std::io::ErrorKind::InvalidInput,
        "gameinfo.gi has no filename",
      )
    })?;
    path
      .parent()
      .filter(|parent| !parent.as_os_str().is_empty())
      .unwrap_or_else(|| Path::new("."))
      .canonicalize()?
      .join(name)
  };
  if read(&target)?.as_deref() != expected {
    return Err(WriteError::Changed);
  }
  if expected == Some(updated) {
    return Ok(());
  }
  let permissions = if expected.is_some() {
    Some(fs::metadata(&target)?.permissions())
  } else {
    None
  };
  if permissions
    .as_ref()
    .is_some_and(|permissions| permissions.readonly())
  {
    return Err(
      std::io::Error::new(
        std::io::ErrorKind::PermissionDenied,
        "gameinfo.gi is read-only",
      )
      .into(),
    );
  }
  let directory = target.parent().ok_or_else(|| {
    std::io::Error::new(
      std::io::ErrorKind::InvalidInput,
      "gameinfo.gi has no parent directory",
    )
  })?;
  let mut staged = tempfile::NamedTempFile::new_in(directory)?;
  staged.write_all(updated)?;
  if let Some(permissions) = permissions {
    staged.as_file().set_permissions(permissions)?;
  }
  staged.as_file().sync_all()?;
  if read(&target)?.as_deref() != expected {
    return Err(WriteError::Changed);
  }
  if expected.is_none() {
    staged.persist_noclobber(&target).map_err(|error| {
      if error.error.kind() == std::io::ErrorKind::AlreadyExists {
        WriteError::Changed
      } else {
        WriteError::Io(error.error)
      }
    })?;
  } else {
    staged.persist(&target).map_err(|error| error.error)?;
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn readonly_targets_are_not_replaced_or_left_with_staging_files() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("gameinfo.gi");
    fs::write(&path, "current").unwrap();
    let original_permissions = fs::metadata(&path).unwrap().permissions();
    let mut readonly = original_permissions.clone();
    readonly.set_readonly(true);
    fs::set_permissions(&path, readonly).unwrap();
    let result = commit(&path, Some(b"current"), b"new");
    fs::set_permissions(&path, original_permissions).unwrap();
    assert!(
      matches!(result, Err(WriteError::Io(error)) if error.kind() == std::io::ErrorKind::PermissionDenied)
    );
    assert_eq!(fs::read_to_string(&path).unwrap(), "current");
    assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
  }

  #[test]
  fn stale_edits_are_rejected_and_staging_files_are_cleaned_up() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("gameinfo.gi");
    fs::write(&path, "current").unwrap();
    assert!(matches!(
      commit(&path, Some(b"old"), b"new"),
      Err(WriteError::Changed)
    ));
    assert_eq!(fs::read_to_string(&path).unwrap(), "current");
    commit(&path, Some(b"current"), b"new").unwrap();
    assert_eq!(fs::read_to_string(&path).unwrap(), "new");
    assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    let timestamp = fs::metadata(&path).unwrap().modified().unwrap();
    commit(&path, Some(b"new"), b"new").unwrap();
    assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), timestamp);
  }

  #[test]
  fn damaged_files_are_compared_as_bytes_before_recovery() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("gameinfo.gi");
    let current = [0xff, 0xfe, b'{'];
    fs::write(&path, current).unwrap();
    assert!(matches!(
      commit(&path, Some(&[0xff]), b"backup"),
      Err(WriteError::Changed)
    ));
    assert_eq!(fs::read(&path).unwrap(), current);
    commit(&path, Some(&current), b"backup").unwrap();
    assert_eq!(fs::read(&path).unwrap(), b"backup");
    assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
  }

  #[test]
  fn creation_does_not_replace_a_file_that_appeared_after_observation() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("gameinfo.gi");
    commit(&path, None, b"backup").unwrap();
    assert_eq!(fs::read(&path).unwrap(), b"backup");
    fs::write(&path, b"external edit").unwrap();
    assert!(matches!(
      commit(&path, None, b"backup"),
      Err(WriteError::Changed)
    ));
    assert_eq!(fs::read(&path).unwrap(), b"external edit");
    assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
  }

  #[test]
  fn a_deleted_observed_file_is_not_recreated() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("gameinfo.gi");
    fs::write(&path, b"current").unwrap();
    let observed = read(&path).unwrap();
    fs::remove_file(&path).unwrap();
    assert!(matches!(
      commit(&path, observed.as_deref(), b"backup"),
      Err(WriteError::Changed)
    ));
    assert!(!path.exists());
    assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 0);
  }
}
