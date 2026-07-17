use crate::errors::Error;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, fs, io::ErrorKind, path::Path};

const MANIFEST_FILENAME: &str = ".dmm.json";
const CURRENT_MANIFEST_VERSION: u32 = 2;

const fn current_manifest_version() -> u32 {
  CURRENT_MANIFEST_VERSION
}

/// Shard index a mod's enabled VPKs live in when the entry predates sharding
/// (manifest v1) or omits the field. Shard 1 is the profile base directory.
const fn default_shard() -> u32 {
  1
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProfileVpkManifest {
  #[serde(default = "current_manifest_version")]
  pub version: u32,
  #[serde(default)]
  pub mods: BTreeMap<String, ProfileVpkManifestEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProfileVpkManifestEntry {
  #[serde(default)]
  pub enabled: bool,
  #[serde(default)]
  pub order: Option<u32>,
  /// 1-based shard index the enabled VPKs of this mod currently live in.
  /// All VPKs of a mod always share one shard so multi-file mods stay together.
  #[serde(default = "default_shard")]
  pub shard: u32,
  #[serde(default)]
  pub current_vpks: Vec<String>,
  #[serde(default)]
  pub disabled_vpks: Vec<String>,
  #[serde(default)]
  pub original_vpk_names: Vec<String>,
}

impl Default for ProfileVpkManifestEntry {
  fn default() -> Self {
    Self {
      enabled: false,
      order: None,
      shard: default_shard(),
      current_vpks: Vec::new(),
      disabled_vpks: Vec::new(),
      original_vpk_names: Vec::new(),
    }
  }
}

impl Default for ProfileVpkManifest {
  fn default() -> Self {
    Self {
      version: CURRENT_MANIFEST_VERSION,
      mods: BTreeMap::new(),
    }
  }
}

impl ProfileVpkManifest {
  pub fn load(addons_path: &Path) -> Result<Self, Error> {
    let manifest_path = addons_path.join(MANIFEST_FILENAME);
    let temp_path = addons_path.join(format!("{MANIFEST_FILENAME}.tmp"));

    if manifest_path.exists() && temp_path.exists() {
      fs::remove_file(&temp_path).map_err(|e| {
        Error::InvalidInput(format!(
          "Failed to remove stale VPK manifest temp file at {}: {e}",
          temp_path.display()
        ))
      })?;
    } else if !manifest_path.exists() && temp_path.exists() {
      fs::rename(&temp_path, &manifest_path).map_err(|e| {
        Error::InvalidInput(format!(
          "Failed to recover VPK manifest temp file from {} to {}: {e}",
          temp_path.display(),
          manifest_path.display()
        ))
      })?;
    }

    let mut manifest = if manifest_path.exists() {
      let manifest_json = fs::read_to_string(&manifest_path)?;
      serde_json::from_str(&manifest_json).map_err(|e| {
        Error::InvalidInput(format!(
          "Failed to parse VPK manifest at {}: {e}",
          manifest_path.display()
        ))
      })?
    } else {
      Self::default()
    };

    if manifest.version > CURRENT_MANIFEST_VERSION {
      return Err(Error::InvalidInput(format!(
        "VPK manifest at {} uses unsupported version {}",
        manifest_path.display(),
        manifest.version
      )));
    }

    if manifest.version < CURRENT_MANIFEST_VERSION {
      manifest.version = CURRENT_MANIFEST_VERSION;
    }

    for (mod_id, entry) in &manifest.mods {
      if !(1..=crate::mod_manager::shard::MAX_SHARDS).contains(&entry.shard) {
        return Err(Error::InvalidInput(format!(
          "VPK manifest entry {mod_id} has invalid shard {}",
          entry.shard
        )));
      }
    }

    Self::recover_pending_staging(addons_path, &manifest)?;
    Ok(manifest)
  }

  fn recover_pending_staging(addons_path: &Path, manifest: &Self) -> Result<(), Error> {
    let clear_staging = addons_path.join(".dmm-clear");
    if clear_staging.is_dir() {
      if manifest.mods.is_empty() {
        fs::remove_dir_all(&clear_staging)?;
      } else {
        Self::restore_staging_directory(addons_path, &clear_staging)?;
      }
    }

    if !addons_path.is_dir() {
      return Ok(());
    }
    for entry in fs::read_dir(addons_path)? {
      let entry = entry?;
      let path = entry.path();
      let entry_name = entry.file_name();
      let Some(mod_id) = entry_name
        .to_str()
        .and_then(|name| name.strip_prefix(".dmm-update-"))
        .filter(|_| path.is_dir())
      else {
        continue;
      };
      if manifest.mods.contains_key(mod_id) {
        Self::restore_staging_directory(addons_path, &path)?;
      } else {
        fs::remove_dir_all(path)?;
      }
    }
    Ok(())
  }

  fn restore_staging_directory(addons_path: &Path, staging_path: &Path) -> Result<(), Error> {
    for entry in fs::read_dir(staging_path)? {
      let staged_path = entry?.path();
      let staged_name = staged_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| Error::ModInvalid("Invalid VPK staging filename".to_string()))?;
      let encoded = staged_name
        .strip_suffix(".pending")
        .ok_or_else(|| Error::ModInvalid(format!("Invalid VPK staging file: {staged_name}")))?;
      let (shard_prefix, filename) = encoded
        .split_once("__")
        .ok_or_else(|| Error::ModInvalid(format!("Invalid VPK staging file: {staged_name}")))?;
      let shard_index = shard_prefix
        .strip_prefix('s')
        .and_then(|value| value.parse::<u32>().ok())
        .filter(|value| (1..=crate::mod_manager::shard::MAX_SHARDS).contains(value))
        .ok_or_else(|| Error::ModInvalid(format!("Invalid VPK staging shard: {staged_name}")))?;
      if Path::new(filename)
        .file_name()
        .and_then(|name| name.to_str())
        != Some(filename)
      {
        return Err(Error::ModInvalid(format!(
          "Invalid VPK staging destination: {staged_name}"
        )));
      }

      let destination =
        crate::mod_manager::shard::shard_dir(addons_path, shard_index).join(filename);
      if destination.exists() {
        return Err(Error::ModInvalid(format!(
          "Cannot recover VPK staging because {} already exists",
          destination.display()
        )));
      }
      if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)?;
      }
      fs::rename(staged_path, destination)?;
    }
    fs::remove_dir(staging_path)?;
    Ok(())
  }

  pub fn save(&self, addons_path: &Path) -> Result<(), Error> {
    fs::create_dir_all(addons_path)?;

    let manifest_path = addons_path.join(MANIFEST_FILENAME);
    let temp_path = addons_path.join(format!("{MANIFEST_FILENAME}.tmp"));
    let manifest_json = serde_json::to_string_pretty(self).map_err(|e| {
      Error::InvalidInput(format!(
        "Failed to serialize VPK manifest at {}: {e}",
        manifest_path.display()
      ))
    })?;

    fs::write(&temp_path, manifest_json)?;
    if let Err(err) = fs::rename(&temp_path, &manifest_path) {
      if err.kind() == ErrorKind::AlreadyExists {
        fs::remove_file(&manifest_path)?;
        fs::rename(&temp_path, &manifest_path)?;
      } else {
        return Err(err.into());
      }
    }

    Ok(())
  }

  pub fn mark_enabled(
    &mut self,
    mod_id: &str,
    current_vpks: Vec<String>,
    original_vpk_names: Vec<String>,
    order: Option<u32>,
    shard: u32,
  ) {
    let entry = self.mods.entry(mod_id.to_string()).or_default();
    entry.enabled = true;
    entry.shard = shard.max(1);
    entry.current_vpks = current_vpks;
    entry.disabled_vpks.clear();
    if !original_vpk_names.is_empty() {
      entry.original_vpk_names = original_vpk_names;
    }
    if order.is_some() {
      entry.order = order;
    }
  }

  pub fn mark_disabled(
    &mut self,
    mod_id: &str,
    disabled_vpks: Vec<String>,
    original_vpk_names: Vec<String>,
  ) {
    let entry = self.mods.entry(mod_id.to_string()).or_default();
    entry.enabled = false;
    entry.shard = default_shard();
    entry.current_vpks.clear();
    entry.disabled_vpks = disabled_vpks;
    if !original_vpk_names.is_empty() {
      entry.original_vpk_names = original_vpk_names;
    }
  }

  pub fn remove_mod(&mut self, mod_id: &str) {
    self.mods.remove(mod_id);
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn persists_profile_manifest() {
    let temp = tempfile::tempdir().unwrap();
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "123",
      vec!["pak01_dir.vpk".to_string()],
      vec!["cool_mod.vpk".to_string()],
      Some(0),
      1,
    );

    manifest.save(temp.path()).unwrap();
    let loaded = ProfileVpkManifest::load(temp.path()).unwrap();

    assert_eq!(loaded, manifest);
  }

  #[test]
  fn load_recovers_temp_manifest_when_main_is_missing() {
    let temp = tempfile::tempdir().unwrap();
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "123",
      vec!["pak01_dir.vpk".to_string()],
      vec!["cool_mod.vpk".to_string()],
      Some(0),
      1,
    );
    let temp_path = temp.path().join(format!("{MANIFEST_FILENAME}.tmp"));
    fs::write(&temp_path, serde_json::to_string_pretty(&manifest).unwrap()).unwrap();

    let loaded = ProfileVpkManifest::load(temp.path()).unwrap();

    assert_eq!(loaded, manifest);
    assert!(temp.path().join(MANIFEST_FILENAME).exists());
    assert!(!temp_path.exists());
  }

  #[test]
  fn load_removes_stale_temp_manifest_when_main_exists() {
    let temp = tempfile::tempdir().unwrap();
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "123",
      vec!["pak01_dir.vpk".to_string()],
      vec!["cool_mod.vpk".to_string()],
      Some(0),
      1,
    );
    manifest.save(temp.path()).unwrap();
    let temp_path = temp.path().join(format!("{MANIFEST_FILENAME}.tmp"));
    fs::write(&temp_path, "{}").unwrap();

    let loaded = ProfileVpkManifest::load(temp.path()).unwrap();

    assert_eq!(loaded, manifest);
    assert!(!temp_path.exists());
  }

  #[test]
  fn mark_enabled_preserves_original_names_when_empty() {
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "123",
      vec!["pak01_dir.vpk".to_string()],
      vec!["cool_mod.vpk".to_string()],
      Some(0),
      1,
    );

    manifest.mark_enabled(
      "123",
      vec!["pak02_dir.vpk".to_string()],
      Vec::new(),
      Some(1),
      2,
    );

    let entry = manifest.mods.get("123").unwrap();
    assert_eq!(entry.original_vpk_names, vec!["cool_mod.vpk".to_string()]);
    assert_eq!(entry.current_vpks, vec!["pak02_dir.vpk".to_string()]);
    assert_eq!(entry.order, Some(1));
    assert_eq!(entry.shard, 2);
  }
}
