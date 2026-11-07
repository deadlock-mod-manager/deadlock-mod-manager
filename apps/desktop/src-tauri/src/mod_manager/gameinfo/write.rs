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

/// Commit validated text at the file's target, keeping symlinks and permissions.
/// Comparisons detect edits made while preparing the replacement. External
/// editors do not share a lock with DMM: this is best-effort conflict detection,
/// not a filesystem compare-and-swap guarantee.
pub(crate) fn commit(path: &Path, expected: &str, updated: &str) -> Result<(), WriteError> {
  // Canonical paths also carry Windows' verbatim prefix for long game paths.
  let target = path.canonicalize()?;
  if fs::read_to_string(&target)? != expected {
    return Err(WriteError::Changed);
  }
  if expected == updated {
    return Ok(());
  }
  let permissions = fs::metadata(&target)?.permissions();
  if permissions.readonly() {
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
  staged.write_all(updated.as_bytes())?;
  staged.as_file().set_permissions(permissions)?;
  staged.as_file().sync_all()?;
  if fs::read_to_string(&target)? != expected {
    return Err(WriteError::Changed);
  }
  staged.persist(&target).map_err(|error| error.error)?;
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
    let result = commit(&path, "current", "new");
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
      commit(&path, "old", "new"),
      Err(WriteError::Changed)
    ));
    assert_eq!(fs::read_to_string(&path).unwrap(), "current");
    commit(&path, "current", "new").unwrap();
    assert_eq!(fs::read_to_string(&path).unwrap(), "new");
    assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    let timestamp = fs::metadata(&path).unwrap().modified().unwrap();
    commit(&path, "new", "new").unwrap();
    assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), timestamp);
  }
}
