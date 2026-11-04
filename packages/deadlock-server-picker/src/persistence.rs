use std::{
  fs::File,
  io::{Read, Write},
  path::Path,
};

use serde::{Deserialize, Serialize, de::DeserializeOwned};

use crate::{PickerError, ServerPickerPreset, catalog::valid_location_id};

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct Preferences {
  pub blocked_locations: Vec<String>,
  pub presets: Vec<ServerPickerPreset>,
  pub operation_pending: bool,
}

impl Preferences {
  pub fn validate(&self) -> Result<(), PickerError> {
    validate_selection(&self.blocked_locations)?;
    if self.presets.len() > 50 {
      return Err(PickerError::Validation(
        "At most 50 presets are supported".into(),
      ));
    }
    for preset in &self.presets {
      if preset.id.len() > 64 || !valid_preset_name(&preset.name) {
        return Err(PickerError::Validation("Invalid preset".into()));
      }
      validate_selection(&preset.blocked_locations)?;
    }
    Ok(())
  }
}

/// Counts characters, not bytes, so non-Latin names get the same 100 limit.
pub(crate) fn valid_preset_name(name: &str) -> bool {
  !name.trim().is_empty() && name.chars().count() <= 100 && !name.chars().any(char::is_control)
}

pub(crate) fn validate_selection(ids: &[String]) -> Result<(), PickerError> {
  if ids.len() > 512 || ids.iter().any(|id| !valid_location_id(id)) {
    return Err(PickerError::Validation("Invalid relay selection".into()));
  }
  Ok(())
}

pub(crate) fn read<T: DeserializeOwned>(
  path: &Path,
  maximum_bytes: usize,
) -> Result<Option<T>, PickerError> {
  let file = match File::open(path) {
    Ok(file) => file,
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
    Err(error) => return Err(error.into()),
  };
  let mut bytes = Vec::new();
  file
    .take(maximum_bytes as u64 + 1)
    .read_to_end(&mut bytes)?;
  if bytes.len() > maximum_bytes {
    return Err(PickerError::Validation(
      "Saved server picker data is too large".into(),
    ));
  }
  Ok(Some(serde_json::from_slice(&bytes)?))
}

pub(crate) fn write<T: Serialize>(path: &Path, value: &T) -> Result<(), PickerError> {
  let parent = path
    .parent()
    .ok_or_else(|| PickerError::Validation("Invalid storage directory".into()))?;
  std::fs::create_dir_all(parent)?;
  let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
  serde_json::to_writer(&mut temporary, value)?;
  temporary.flush()?;
  temporary.as_file().sync_all()?;
  temporary
    .persist(path)
    .map_err(|error| PickerError::Storage(error.error))?;
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn atomically_replaces_preferences_and_bounds_reads() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("preferences.json");
    assert!(read::<Preferences>(&path, 1024).unwrap().is_none());
    write(&path, &Preferences::default()).unwrap();
    let changed = Preferences {
      blocked_locations: vec!["ams".into()],
      ..Preferences::default()
    };
    write(&path, &changed).unwrap();
    assert_eq!(
      read::<Preferences>(&path, 1024)
        .unwrap()
        .unwrap()
        .blocked_locations,
      ["ams"]
    );
    assert!(read::<Preferences>(&path, 2).is_err());
  }

  #[test]
  fn preset_name_limit_counts_characters() {
    assert!(valid_preset_name(&"Я".repeat(100)));
    assert!(!valid_preset_name(&"Я".repeat(101)));
    assert!(!valid_preset_name(
      "Europe
"
    ));
    assert!(!valid_preset_name("  "));
  }
}
