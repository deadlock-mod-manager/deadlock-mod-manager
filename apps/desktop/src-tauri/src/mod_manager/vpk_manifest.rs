use crate::errors::Error;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, fs, io::ErrorKind, path::Path};
use vpk_parser::{VpkParseOptions, VpkParser};

const MANIFEST_FILENAME: &str = ".dmm.json";
const CURRENT_MANIFEST_VERSION: u32 = 2;

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
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub desired_state: Option<ProfileVpkManifestDesiredState>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub disk_state: Option<ProfileVpkManifestDiskState>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub repair_reason: Option<ProfileVpkManifestRepairReason>,
  #[serde(default)]
  pub order: Option<u32>,
  #[serde(default)]
  pub current_vpks: Vec<String>,
  #[serde(default)]
  pub disabled_vpks: Vec<String>,
  #[serde(default, skip_serializing_if = "Vec::is_empty")]
  pub quarantined_vpks: Vec<String>,
  #[serde(default)]
  pub original_vpk_names: Vec<String>,
  #[serde(default, skip_serializing_if = "Vec::is_empty")]
  pub source_downloads: Vec<ProfileVpkManifestSourceDownload>,
  #[serde(default, skip_serializing_if = "Vec::is_empty")]
  pub vpk_fingerprints: Vec<ProfileVpkManifestVpkFingerprint>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProfileVpkManifestSourceDownload {
  pub name: String,
  pub size: u64,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub url: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub md5_checksum: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProfileVpkManifestVpkFingerprint {
  pub current_name: String,
  pub original_name: String,
  pub file_size: u64,
  pub fast_hash: String,
  pub sha256: String,
  pub manifest_sha256: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ProfileVpkManifestDesiredState {
  Enabled,
  Disabled,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ProfileVpkManifestDiskState {
  Active,
  Disabled,
  Missing,
  Mismatch,
  Unverified,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ProfileVpkManifestRepairReason {
  MissingEnabledVpks,
  MissingPayload,
  NeedsDownloadChoice,
  NeedsFileSelection,
  RepairFailed,
  FingerprintMismatch,
  UnverifiedManifest,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProfileVpkManifestVerification {
  pub disk_state: ProfileVpkManifestDiskState,
  pub repair_reason: Option<ProfileVpkManifestRepairReason>,
  pub details: Vec<String>,
}

impl ProfileVpkManifestEntry {
  pub fn desired_state(&self) -> ProfileVpkManifestDesiredState {
    self.desired_state.unwrap_or(if self.enabled {
      ProfileVpkManifestDesiredState::Enabled
    } else {
      ProfileVpkManifestDesiredState::Disabled
    })
  }

  pub fn wants_enabled(&self) -> bool {
    self.desired_state() == ProfileVpkManifestDesiredState::Enabled
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

    let mut migrated = manifest.version < CURRENT_MANIFEST_VERSION;
    if manifest.version < CURRENT_MANIFEST_VERSION {
      manifest.version = CURRENT_MANIFEST_VERSION;
    }

    for entry in manifest.mods.values_mut() {
      if entry.desired_state.is_none() {
        entry.desired_state = Some(if entry.enabled {
          ProfileVpkManifestDesiredState::Enabled
        } else {
          ProfileVpkManifestDesiredState::Disabled
        });
        migrated = true;
      }
      if entry.disk_state.is_none() {
        entry.disk_state = Some(Self::legacy_disk_state(entry));
        entry.repair_reason = if !entry.wants_enabled()
          && entry.disk_state == Some(ProfileVpkManifestDiskState::Missing)
        {
          Some(ProfileVpkManifestRepairReason::MissingPayload)
        } else {
          Self::repair_reason_for_disk_state(entry.disk_state.unwrap())
        };
        migrated = true;
      }
    }

    if migrated {
      log::info!(
        "Loaded legacy VPK manifest at {}; in-memory state was migrated to version {CURRENT_MANIFEST_VERSION}",
        manifest_path.display()
      );
    }

    Ok(manifest)
  }

  fn legacy_disk_state(entry: &ProfileVpkManifestEntry) -> ProfileVpkManifestDiskState {
    if entry.wants_enabled() {
      if entry.current_vpks.is_empty() {
        ProfileVpkManifestDiskState::Missing
      } else if entry.vpk_fingerprints.is_empty() {
        ProfileVpkManifestDiskState::Unverified
      } else {
        ProfileVpkManifestDiskState::Active
      }
    } else if entry.disabled_vpks.is_empty() {
      ProfileVpkManifestDiskState::Missing
    } else {
      ProfileVpkManifestDiskState::Disabled
    }
  }

  fn repair_reason_for_disk_state(
    disk_state: ProfileVpkManifestDiskState,
  ) -> Option<ProfileVpkManifestRepairReason> {
    match disk_state {
      ProfileVpkManifestDiskState::Active | ProfileVpkManifestDiskState::Disabled => None,
      ProfileVpkManifestDiskState::Missing => {
        Some(ProfileVpkManifestRepairReason::MissingEnabledVpks)
      }
      ProfileVpkManifestDiskState::Mismatch => {
        Some(ProfileVpkManifestRepairReason::FingerprintMismatch)
      }
      ProfileVpkManifestDiskState::Unverified => {
        Some(ProfileVpkManifestRepairReason::UnverifiedManifest)
      }
    }
  }

  fn next_available_order(&self) -> u32 {
    let mut orders: Vec<u32> = self.mods.values().filter_map(|entry| entry.order).collect();
    orders.sort_unstable();
    orders.dedup();

    if let Some(max_order) = orders.last()
      && let Some(next_order) = max_order.checked_add(1)
    {
      return next_order;
    }

    let mut next_order = 0u32;
    for order in orders {
      if order == next_order {
        if let Some(incremented) = next_order.checked_add(1) {
          next_order = incremented;
        }
      } else if order > next_order {
        break;
      }
    }
    next_order
  }

  fn resolved_order(&self, mod_id: &str, order: Option<u32>) -> u32 {
    order
      .or_else(|| self.mods.get(mod_id).and_then(|entry| entry.order))
      .unwrap_or_else(|| self.next_available_order())
  }

  pub fn assign_missing_orders(&mut self) -> bool {
    let mod_ids_without_order: Vec<String> = self
      .mods
      .iter()
      .filter(|(_, entry)| entry.order.is_none())
      .map(|(mod_id, _)| mod_id.clone())
      .collect();

    if mod_ids_without_order.is_empty() {
      return false;
    }

    for mod_id in mod_ids_without_order {
      let order = self.resolved_order(&mod_id, None);
      if let Some(entry) = self.mods.get_mut(&mod_id) {
        entry.order = Some(order);
      }
    }

    true
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
    let order = self.resolved_order(mod_id, order);
    let entry = self.mods.entry(mod_id.to_string()).or_default();
    let payload_names_changed = entry.current_vpks != current_vpks
      || (!original_vpk_names.is_empty() && entry.original_vpk_names != original_vpk_names);

    entry.enabled = true;
    entry.desired_state = Some(ProfileVpkManifestDesiredState::Enabled);
    entry.current_vpks = current_vpks;
    entry.disabled_vpks.clear();
    entry.quarantined_vpks.clear();
    if !original_vpk_names.is_empty() {
      entry.original_vpk_names = original_vpk_names;
    }
    if payload_names_changed {
      entry.vpk_fingerprints.clear();
    }
    entry.disk_state = Some(if entry.current_vpks.is_empty() {
      ProfileVpkManifestDiskState::Missing
    } else if entry.vpk_fingerprints.is_empty() {
      ProfileVpkManifestDiskState::Unverified
    } else {
      ProfileVpkManifestDiskState::Active
    });
    entry.repair_reason = Self::repair_reason_for_disk_state(entry.disk_state.unwrap());
    entry.order = Some(order);
  }

  pub fn mark_disabled(
    &mut self,
    mod_id: &str,
    disabled_vpks: Vec<String>,
    original_vpk_names: Vec<String>,
    order: Option<u32>,
  ) {
    let order = self.resolved_order(mod_id, order);
    let entry = self.mods.entry(mod_id.to_string()).or_default();
    entry.enabled = false;
    entry.desired_state = Some(ProfileVpkManifestDesiredState::Disabled);
    entry.current_vpks.clear();
    entry.disabled_vpks = disabled_vpks;
    entry.quarantined_vpks.clear();
    if !original_vpk_names.is_empty() {
      entry.original_vpk_names = original_vpk_names;
    }
    entry.disk_state = Some(if entry.disabled_vpks.is_empty() {
      ProfileVpkManifestDiskState::Missing
    } else {
      ProfileVpkManifestDiskState::Disabled
    });
    entry.repair_reason = if entry.disk_state == Some(ProfileVpkManifestDiskState::Missing) {
      Some(ProfileVpkManifestRepairReason::MissingPayload)
    } else {
      None
    };
    entry.order = Some(order);
  }

  pub fn remove_mod(&mut self, mod_id: &str) {
    self.mods.remove(mod_id);
  }

  pub fn update_repair_metadata(
    &mut self,
    addons_path: &Path,
    mod_id: &str,
    source_downloads: Vec<ProfileVpkManifestSourceDownload>,
  ) -> Result<(), Error> {
    let order = self.resolved_order(mod_id, None);
    let Some(entry) = self.mods.get_mut(mod_id) else {
      return Ok(());
    };

    if entry.order.is_none() {
      entry.order = Some(order);
    }
    entry.source_downloads = source_downloads;
    entry.vpk_fingerprints =
      Self::fingerprints_for_entry(addons_path, &entry.current_vpks, &entry.original_vpk_names)?;
    if entry.wants_enabled() {
      entry.disk_state = Some(if entry.current_vpks.is_empty() {
        ProfileVpkManifestDiskState::Missing
      } else if entry.vpk_fingerprints.len() == entry.current_vpks.len() {
        ProfileVpkManifestDiskState::Active
      } else {
        ProfileVpkManifestDiskState::Missing
      });
      entry.repair_reason = Self::repair_reason_for_disk_state(entry.disk_state.unwrap());
    }
    Ok(())
  }

  pub fn refresh_repair_metadata(&mut self, addons_path: &Path, mod_id: &str) -> Result<(), Error> {
    let source_downloads = self
      .mods
      .get(mod_id)
      .map(|entry| entry.source_downloads.clone())
      .unwrap_or_default();

    self.update_repair_metadata(addons_path, mod_id, source_downloads)
  }

  pub fn enabled_fingerprint_mismatches(
    &self,
    addons_path: &Path,
    mod_id: &str,
  ) -> Result<Vec<String>, Error> {
    let Some(entry) = self.mods.get(mod_id) else {
      return Ok(Vec::new());
    };

    if !entry.wants_enabled() || entry.current_vpks.is_empty() {
      return Ok(Vec::new());
    }

    if entry.vpk_fingerprints.is_empty() {
      return Ok(vec![
        "enabled VPKs have no stored fingerprints and cannot be verified".to_string(),
      ]);
    }

    if entry.current_vpks.len() != entry.vpk_fingerprints.len() {
      return Ok(vec![format!(
        "expected {} VPK fingerprints, found {} enabled VPK names",
        entry.vpk_fingerprints.len(),
        entry.current_vpks.len()
      )]);
    }

    let current_fingerprints =
      Self::fingerprints_for_entry(addons_path, &entry.current_vpks, &entry.original_vpk_names)?;

    let mut mismatches = Vec::new();
    for (index, expected) in entry.vpk_fingerprints.iter().enumerate() {
      let Some(actual) = current_fingerprints.get(index) else {
        mismatches.push(format!(
          "{} is missing",
          entry
            .current_vpks
            .get(index)
            .cloned()
            .unwrap_or_else(|| format!("VPK #{index}"))
        ));
        continue;
      };

      if actual.file_size != expected.file_size
        || actual.sha256 != expected.sha256
        || actual.manifest_sha256 != expected.manifest_sha256
      {
        mismatches.push(format!(
          "{} no longer matches stored fingerprint for {}",
          actual.current_name, expected.original_name
        ));
      }
    }

    Ok(mismatches)
  }

  pub fn mark_enabled_needs_repair(&mut self, mod_id: &str, quarantined_vpks: Vec<String>) {
    let order = self.resolved_order(mod_id, None);
    if let Some(entry) = self.mods.get_mut(mod_id) {
      entry.enabled = true;
      entry.desired_state = Some(ProfileVpkManifestDesiredState::Enabled);
      entry.current_vpks.clear();
      entry.quarantined_vpks = quarantined_vpks;
      entry.disk_state = Some(if entry.quarantined_vpks.is_empty() {
        ProfileVpkManifestDiskState::Missing
      } else {
        ProfileVpkManifestDiskState::Mismatch
      });
      entry.repair_reason = Self::repair_reason_for_disk_state(entry.disk_state.unwrap());
      if entry.order.is_none() {
        entry.order = Some(order);
      }
    }
  }

  pub fn verify_mod_disk_state(
    &self,
    addons_path: &Path,
    mod_id: &str,
  ) -> Result<Option<ProfileVpkManifestVerification>, Error> {
    let Some(entry) = self.mods.get(mod_id) else {
      return Ok(None);
    };

    if entry.wants_enabled() {
      if entry.current_vpks.is_empty() {
        let disk_state = if entry.quarantined_vpks.is_empty() {
          ProfileVpkManifestDiskState::Missing
        } else {
          ProfileVpkManifestDiskState::Mismatch
        };
        return Ok(Some(ProfileVpkManifestVerification {
          disk_state,
          repair_reason: Self::repair_reason_for_disk_state(disk_state),
          details: Vec::new(),
        }));
      }

      let missing: Vec<String> = entry
        .current_vpks
        .iter()
        .filter(|vpk| !addons_path.join(vpk).exists())
        .cloned()
        .collect();
      if !missing.is_empty() {
        return Ok(Some(ProfileVpkManifestVerification {
          disk_state: ProfileVpkManifestDiskState::Missing,
          repair_reason: Some(ProfileVpkManifestRepairReason::MissingEnabledVpks),
          details: missing,
        }));
      }

      let mismatches = self.enabled_fingerprint_mismatches(addons_path, mod_id)?;
      if entry.vpk_fingerprints.is_empty() {
        return Ok(Some(ProfileVpkManifestVerification {
          disk_state: ProfileVpkManifestDiskState::Unverified,
          repair_reason: Some(ProfileVpkManifestRepairReason::UnverifiedManifest),
          details: mismatches,
        }));
      }
      if !mismatches.is_empty() {
        return Ok(Some(ProfileVpkManifestVerification {
          disk_state: ProfileVpkManifestDiskState::Mismatch,
          repair_reason: Some(ProfileVpkManifestRepairReason::FingerprintMismatch),
          details: mismatches,
        }));
      }

      return Ok(Some(ProfileVpkManifestVerification {
        disk_state: ProfileVpkManifestDiskState::Active,
        repair_reason: None,
        details: Vec::new(),
      }));
    }

    let disabled_missing = entry.disabled_vpks.is_empty()
      || entry
        .disabled_vpks
        .iter()
        .any(|vpk| !addons_path.join(vpk).exists());
    if disabled_missing {
      return Ok(Some(ProfileVpkManifestVerification {
        disk_state: ProfileVpkManifestDiskState::Missing,
        repair_reason: Some(ProfileVpkManifestRepairReason::MissingPayload),
        details: entry.disabled_vpks.clone(),
      }));
    }

    Ok(Some(ProfileVpkManifestVerification {
      disk_state: ProfileVpkManifestDiskState::Disabled,
      repair_reason: None,
      details: Vec::new(),
    }))
  }

  pub fn apply_mod_verification(
    &mut self,
    mod_id: &str,
    verification: ProfileVpkManifestVerification,
  ) -> bool {
    let order = self.resolved_order(mod_id, None);
    let Some(entry) = self.mods.get_mut(mod_id) else {
      return false;
    };

    let changed = entry.disk_state != Some(verification.disk_state)
      || entry.repair_reason != verification.repair_reason
      || entry.order.is_none();
    entry.disk_state = Some(verification.disk_state);
    entry.repair_reason = verification.repair_reason;
    if entry.order.is_none() {
      entry.order = Some(order);
    }
    changed
  }

  fn fingerprints_for_entry(
    addons_path: &Path,
    current_vpks: &[String],
    original_vpk_names: &[String],
  ) -> Result<Vec<ProfileVpkManifestVpkFingerprint>, Error> {
    let mut fingerprints = Vec::new();
    for (index, current_name) in current_vpks.iter().enumerate() {
      let path = addons_path.join(current_name);
      if !path.exists() {
        log::warn!(
          "Skipping VPK fingerprint for missing manifest file: {}",
          path.display()
        );
        continue;
      }

      let vpk_data = fs::read(&path)?;
      let metadata = fs::metadata(&path)?;
      let last_modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .and_then(|duration| chrono::DateTime::from_timestamp(duration.as_secs() as i64, 0));
      let parsed = VpkParser::parse(
        vpk_data,
        VpkParseOptions {
          include_full_file_hash: true,
          file_path: path.to_string_lossy().to_string(),
          last_modified,
          include_merkle: false,
          include_entries: false,
        },
      )
      .map_err(|e| {
        Error::InvalidInput(format!(
          "Failed to fingerprint VPK file {}: {e}",
          path.display()
        ))
      })?;

      fingerprints.push(ProfileVpkManifestVpkFingerprint {
        current_name: current_name.clone(),
        original_name: original_vpk_names
          .get(index)
          .cloned()
          .unwrap_or_else(|| current_name.clone()),
        file_size: parsed.fingerprint.file_size as u64,
        fast_hash: parsed.fingerprint.fast_hash,
        sha256: parsed.fingerprint.sha256,
        manifest_sha256: parsed.manifest_sha256,
      });
    }

    Ok(fingerprints)
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

  #[test]
  fn mark_enabled_assigns_next_order_when_missing() {
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "existing",
      vec!["pak01_dir.vpk".to_string()],
      vec!["existing.vpk".to_string()],
      Some(3),
    );

    manifest.mark_enabled(
      "new",
      vec!["pak02_dir.vpk".to_string()],
      vec!["new.vpk".to_string()],
      None,
    );

    assert_eq!(manifest.mods.get("new").unwrap().order, Some(4));
  }

  #[test]
  fn mark_enabled_preserves_existing_order_when_order_is_missing() {
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "123",
      vec!["pak01_dir.vpk".to_string()],
      vec!["original.vpk".to_string()],
      Some(7),
    );

    manifest.mark_enabled(
      "123",
      vec!["pak02_dir.vpk".to_string()],
      vec!["replacement.vpk".to_string()],
      None,
    );

    assert_eq!(manifest.mods.get("123").unwrap().order, Some(7));
  }

  #[test]
  fn mark_disabled_assigns_order_when_missing() {
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "existing",
      vec!["pak01_dir.vpk".to_string()],
      vec!["existing.vpk".to_string()],
      Some(2),
    );

    manifest.mark_disabled(
      "disabled",
      vec!["disabled_pak01_dir.vpk".to_string()],
      vec!["pak01_dir.vpk".to_string()],
      None,
    );

    assert_eq!(manifest.mods.get("disabled").unwrap().order, Some(3));
  }

  #[test]
  fn assign_missing_orders_backfills_null_entries() {
    let mut manifest = ProfileVpkManifest::default();
    manifest.mods.insert(
      "ordered".to_string(),
      ProfileVpkManifestEntry {
        order: Some(5),
        ..Default::default()
      },
    );
    manifest.mods.insert(
      "missing".to_string(),
      ProfileVpkManifestEntry {
        order: None,
        ..Default::default()
      },
    );

    assert!(manifest.assign_missing_orders());
    assert_eq!(manifest.mods.get("missing").unwrap().order, Some(6));
  }

  #[test]
  fn saved_enabled_entries_do_not_serialize_null_order() {
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "123",
      vec!["pak01_dir.vpk".to_string()],
      vec!["original.vpk".to_string()],
      None,
    );

    let json = serde_json::to_string(&manifest).unwrap();

    assert!(!json.contains("\"order\":null"));
    assert!(json.contains("\"order\":0"));
  }

  #[test]
  fn mark_enabled_clears_stale_fingerprints_when_payload_changes() {
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "123",
      vec!["pak01_dir.vpk".to_string()],
      vec!["first.vpk".to_string()],
      Some(0),
    );
    manifest
      .mods
      .get_mut("123")
      .unwrap()
      .vpk_fingerprints
      .push(ProfileVpkManifestVpkFingerprint {
        current_name: "pak01_dir.vpk".to_string(),
        original_name: "first.vpk".to_string(),
        file_size: 1,
        fast_hash: "fast".to_string(),
        sha256: "sha".to_string(),
        manifest_sha256: "manifest".to_string(),
      });

    manifest.mark_enabled(
      "123",
      vec!["pak02_dir.vpk".to_string()],
      vec!["second.vpk".to_string()],
      Some(0),
    );

    assert!(
      manifest
        .mods
        .get("123")
        .unwrap()
        .vpk_fingerprints
        .is_empty()
    );
  }

  #[test]
  fn verify_enabled_without_fingerprints_is_unverified() {
    let temp = tempfile::tempdir().unwrap();
    fs::write(
      temp.path().join("pak01_dir.vpk"),
      b"not parsed without expected fingerprints",
    )
    .unwrap();
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "123",
      vec!["pak01_dir.vpk".to_string()],
      vec!["original.vpk".to_string()],
      Some(0),
    );

    let verification = manifest
      .verify_mod_disk_state(temp.path(), "123")
      .unwrap()
      .unwrap();

    assert_eq!(
      verification.disk_state,
      ProfileVpkManifestDiskState::Unverified
    );
    assert_eq!(
      verification.repair_reason,
      Some(ProfileVpkManifestRepairReason::UnverifiedManifest)
    );
  }

  #[test]
  fn mark_enabled_needs_repair_tracks_quarantine_separately() {
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "123",
      vec!["pak01_dir.vpk".to_string()],
      vec!["original.vpk".to_string()],
      Some(0),
    );

    manifest.mark_enabled_needs_repair("123", vec!["123_mismatch_pak01_dir.vpk".to_string()]);
    let entry = manifest.mods.get("123").unwrap();

    assert!(entry.current_vpks.is_empty());
    assert!(entry.disabled_vpks.is_empty());
    assert_eq!(
      entry.quarantined_vpks,
      vec!["123_mismatch_pak01_dir.vpk".to_string()]
    );
    assert_eq!(
      entry.disk_state,
      Some(ProfileVpkManifestDiskState::Mismatch)
    );
  }

  #[test]
  fn source_downloads_are_omitted_when_empty() {
    let manifest = ProfileVpkManifest::default();
    let json = serde_json::to_string(&manifest).unwrap();

    assert!(!json.contains("sourceDownloads"));
    assert!(!json.contains("vpkFingerprints"));
  }
}
