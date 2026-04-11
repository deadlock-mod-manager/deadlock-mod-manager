use dmodpkg::ModConfig;
use std::path::{Path, PathBuf};

const DMM_FILENAME: &str = "dmm.json";

/// Search for a `dmm.json` file in the given directory, checking the root
/// and one level of subdirectories (common when a mod archive contains a
/// top-level folder).
pub fn find_dmm_json(dir: &Path) -> Option<PathBuf> {
  let root = dir.join(DMM_FILENAME);
  if root.exists() {
    return Some(root);
  }

  let entries = std::fs::read_dir(dir).ok()?;
  for entry in entries.flatten() {
    if entry.file_type().ok()?.is_dir() {
      let nested = entry.path().join(DMM_FILENAME);
      if nested.exists() {
        return Some(nested);
      }
    }
  }

  None
}

/// Read and parse a `dmm.json` file, applying lenient validation.
pub fn parse_dmm_json(path: &Path) -> Result<ModConfig, crate::errors::Error> {
  let content = std::fs::read_to_string(path)?;
  let config: ModConfig =
    serde_json::from_str(&content).map_err(|e| crate::errors::Error::ModInvalid(e.to_string()))?;
  config
    .validate_dmm()
    .map_err(|e| crate::errors::Error::ModInvalid(e.to_string()))?;
  Ok(config)
}
