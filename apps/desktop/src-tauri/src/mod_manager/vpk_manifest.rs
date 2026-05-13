use crate::errors::Error;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, fs, io::ErrorKind, path::Path};

const MANIFEST_FILENAME: &str = ".dmm.json";
const CURRENT_MANIFEST_VERSION: u32 = 1;

const fn current_manifest_version() -> u32 {
  CURRENT_MANIFEST_VERSION
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProfileVpkManifest {
  #[serde(default = "current_manifest_version")]
  pub version: u32,
  #[serde(default)]
  pub mods: BTreeMap<String, ProfileVpkManifestEntry>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProfileVpkManifestEntry {
  #[serde(default)]
  pub enabled: bool,
  #[serde(default)]
  pub order: Option<u32>,
  #[serde(default)]
  pub current_vpks: Vec<String>,
  #[serde(default)]
  pub disabled_vpks: Vec<String>,
  #[serde(default)]
  pub original_vpk_names: Vec<String>,
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

    if !manifest_path.exists() {
      return Ok(Self::default());
    }

    let manifest_json = fs::read_to_string(&manifest_path)?;
    let mut manifest: Self = serde_json::from_str(&manifest_json).map_err(|e| {
      Error::InvalidInput(format!(
        "Failed to parse VPK manifest at {}: {e}",
        manifest_path.display()
      ))
    })?;

    if manifest.version == 0 {
      manifest.version = CURRENT_MANIFEST_VERSION;
    }

    Ok(manifest)
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
  ) {
    let entry = self.mods.entry(mod_id.to_string()).or_default();
    entry.enabled = true;
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
    );

    manifest.mark_enabled(
      "123",
      vec!["pak02_dir.vpk".to_string()],
      Vec::new(),
      Some(1),
    );

    let entry = manifest.mods.get("123").unwrap();
    assert_eq!(entry.original_vpk_names, vec!["cool_mod.vpk".to_string()]);
    assert_eq!(entry.current_vpks, vec!["pak02_dir.vpk".to_string()]);
    assert_eq!(entry.order, Some(1));
  }
}
