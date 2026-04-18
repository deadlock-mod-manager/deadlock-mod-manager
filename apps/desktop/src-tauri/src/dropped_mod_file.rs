use crate::errors::Error;
use std::path::{Path, PathBuf};

const SUPPORTED_MOD_EXTENSIONS: [&str; 4] = ["vpk", "zip", "rar", "7z"];

pub fn validate_dropped_mod_file_path(file_path: &str) -> Result<PathBuf, Error> {
  if file_path.trim().is_empty() {
    return Err(Error::InvalidInput(
      "Dropped file path cannot be empty".to_string(),
    ));
  }

  let path = Path::new(file_path);
  if !path.is_absolute() {
    return Err(Error::InvalidInput(
      "Dropped file path must be absolute".to_string(),
    ));
  }

  if !path.exists() {
    return Err(Error::ModFileNotFound);
  }

  let canonical_path = path.canonicalize().map_err(|error| {
    Error::InvalidInput(format!(
      "Failed to resolve dropped file path '{}': {error}",
      path.display()
    ))
  })?;

  if !canonical_path.is_file() {
    return Err(Error::InvalidInput(format!(
      "Dropped path '{}' must point to a file",
      canonical_path.display()
    )));
  }

  if !is_supported_mod_file(&canonical_path) {
    return Err(Error::InvalidInput(format!(
      "Dropped file '{}' is not a supported mod file",
      canonical_path.display()
    )));
  }

  Ok(canonical_path)
}

fn is_supported_mod_file(path: &Path) -> bool {
  path
    .extension()
    .and_then(|extension| extension.to_str())
    .map(|extension| extension.to_ascii_lowercase())
    .is_some_and(|extension| SUPPORTED_MOD_EXTENSIONS.contains(&extension.as_str()))
}

#[cfg(test)]
mod tests {
  use super::validate_dropped_mod_file_path;
  use crate::errors::Error;
  use std::fs;
  use std::path::PathBuf;
  use std::time::{SystemTime, UNIX_EPOCH};

  fn create_temp_dir() -> PathBuf {
    let unique_suffix = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("system clock should be after unix epoch")
      .as_nanos();
    let dir =
      std::env::temp_dir().join(format!("deadlock-mod-manager-dropped-file-{unique_suffix}"));
    fs::create_dir_all(&dir).expect("temp dir should be created");
    dir
  }

  #[test]
  fn accepts_supported_absolute_file_paths() {
    let dir = create_temp_dir();
    let file_path = dir.join("local-mod.vpk");
    fs::write(&file_path, b"test").expect("test file should be written");

    let validated = validate_dropped_mod_file_path(
      file_path
        .to_str()
        .expect("temp file path should be valid utf-8"),
    )
    .expect("supported dropped file should validate");

    assert_eq!(
      validated,
      file_path.canonicalize().expect("path should resolve")
    );

    fs::remove_dir_all(&dir).expect("temp dir should be removed");
  }

  #[test]
  fn rejects_relative_paths() {
    let error = validate_dropped_mod_file_path("relative/mod.vpk")
      .expect_err("relative paths should be rejected");

    assert!(matches!(error, Error::InvalidInput(message) if message.contains("absolute")));
  }

  #[test]
  fn rejects_unsupported_extensions() {
    let dir = create_temp_dir();
    let file_path = dir.join("notes.txt");
    fs::write(&file_path, b"test").expect("test file should be written");

    let error = validate_dropped_mod_file_path(
      file_path
        .to_str()
        .expect("temp file path should be valid utf-8"),
    )
    .expect_err("unsupported extensions should be rejected");

    assert!(
      matches!(error, Error::InvalidInput(message) if message.contains("supported mod file"))
    );

    fs::remove_dir_all(&dir).expect("temp dir should be removed");
  }
}
