//! `storage`: a JSON key/value namespace per plugin. The namespace
//! comes from the host-established identity; keys never name paths.

use crate::Error;
use serde_json::{Map, Value};
use std::fs;
use std::path::{Path, PathBuf};

pub const MAX_STORAGE_BYTES: usize = 1024 * 1024;
pub const MAX_KEYS: usize = 256;

pub struct PluginStorage {
  path: PathBuf,
}

pub fn is_valid_key(key: &str) -> bool {
  (1..=64).contains(&key.len())
    && key
      .bytes()
      .all(|byte| byte.is_ascii_alphanumeric() || b"._-:".contains(&byte))
}

impl PluginStorage {
  pub fn new(data_dir: &Path) -> Self {
    Self {
      path: data_dir.join("storage.json"),
    }
  }

  fn load(&self) -> Result<Map<String, Value>, Error> {
    match fs::read(&self.path) {
      Ok(bytes) => serde_json::from_slice(&bytes)
        .map_err(|error| Error::InvalidInput(format!("Plugin storage is corrupt: {error}"))),
      Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Map::new()),
      Err(error) => Err(error.into()),
    }
  }

  /// Bytes on disk, 0 when nothing was stored yet.
  pub fn size(&self) -> u64 {
    fs::metadata(&self.path).map_or(0, |meta| meta.len())
  }

  pub fn clear(&self) -> Result<(), Error> {
    for path in [self.path.with_extension("json.part"), self.path.clone()] {
      match fs::remove_file(path) {
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => return Err(error.into()),
        _ => {}
      }
    }
    Ok(())
  }

  pub fn get(&self, key: &str) -> Result<Value, Error> {
    Ok(self.load()?.remove(key).unwrap_or(Value::Null))
  }

  /// Stores `value` under `key`; `null` deletes it.
  pub fn set(&self, key: &str, value: Value) -> Result<(), StorageError> {
    let mut map = self.load()?;
    if value.is_null() {
      map.remove(key);
    } else {
      map.insert(key.to_owned(), value);
    }
    if map.len() > MAX_KEYS {
      return Err(StorageError::Quota("Plugin storage is limited to 256 keys"));
    }
    let bytes = serde_json::to_vec(&map).map_err(|error| Error::InvalidInput(error.to_string()))?;
    if bytes.len() > MAX_STORAGE_BYTES {
      return Err(StorageError::Quota("Plugin storage is limited to 1 MiB"));
    }
    if let Some(parent) = self.path.parent() {
      fs::create_dir_all(parent).map_err(Error::from)?;
    }
    let partial = self.path.with_extension("json.part");
    fs::write(&partial, bytes).map_err(Error::from)?;
    fs::rename(partial, &self.path).map_err(Error::from)?;
    Ok(())
  }
}

#[derive(Debug)]
pub enum StorageError {
  Quota(&'static str),
  Host(Error),
}

impl From<Error> for StorageError {
  fn from(error: Error) -> Self {
    Self::Host(error)
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn stores_deletes_and_enforces_quota() {
    let dir = tempfile::tempdir().unwrap();
    let storage = PluginStorage::new(dir.path());
    storage.set("history", serde_json::json!(["a"])).unwrap();
    assert_eq!(storage.get("history").unwrap(), serde_json::json!(["a"]));
    storage.set("history", Value::Null).unwrap();
    assert_eq!(storage.get("history").unwrap(), Value::Null);
    let big = Value::String("x".repeat(MAX_STORAGE_BYTES));
    assert!(matches!(
      storage.set("big", big),
      Err(StorageError::Quota(_))
    ));
    assert!(!is_valid_key("../x"));
    assert!(!is_valid_key(""));
  }
}
