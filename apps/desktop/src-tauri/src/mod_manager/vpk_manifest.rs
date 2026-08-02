use crate::errors::Error;
use crate::mod_manager::shard::{
  CLEAR_STAGING_DIR, ProfileBase, REORDER_STAGING_DIR, ShardIndex, UPDATE_STAGING_PREFIX,
};
use crate::mod_manager::vpk_manager::staging::{RecoveryMode, recover_staging_directory};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, fs, io::ErrorKind, path::Path};

const MANIFEST_FILENAME: &str = ".dmm.json";
const CURRENT_MANIFEST_VERSION: u32 = 2;

const fn current_manifest_version() -> u32 {
  CURRENT_MANIFEST_VERSION
}

/// Shard index a mod's enabled VPKs live in when the entry predates sharding
/// (manifest v1) or omits the field. Shard 1 is the profile base directory.
const fn default_shard() -> ShardIndex {
  ShardIndex::FIRST
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
  pub shard: ShardIndex,
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

impl ProfileVpkManifestEntry {
  pub fn file_paths(&self, base: &ProfileBase) -> Vec<std::path::PathBuf> {
    if self.enabled {
      let enabled_dir = base.shard_dir(self.shard);
      self
        .current_vpks
        .iter()
        .map(|vpk| enabled_dir.join(vpk))
        .collect()
    } else {
      self
        .disabled_vpks
        .iter()
        .map(|vpk| base.join(vpk))
        .collect()
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
  /// Validate every manifest-backed profile in a shard-root snapshot.
  ///
  /// `root` contains sibling `addons`, `addons2`, ... directories, as used by
  /// both the live `citadel` tree and addons backups.
  pub fn validate_tree(root: &Path) -> Result<(), Error> {
    let addons_root = root.join("addons");
    if !addons_root.is_dir() {
      return Err(Error::ModInvalid(format!(
        "Snapshot has no addons directory at {}",
        addons_root.display()
      )));
    }

    let mut pending = vec![addons_root];
    while let Some(profile_path) = pending.pop() {
      for entry in fs::read_dir(&profile_path)? {
        let entry = entry?;
        if entry.file_type()?.is_dir() {
          pending.push(entry.path());
        }
      }

      if !profile_path.join(MANIFEST_FILENAME).is_file() {
        continue;
      }
      let base = ProfileBase::from_snapshot(&profile_path)?;
      let manifest = Self::load(&profile_path)?;
      for (mod_id, entry) in manifest.mods {
        let missing: Vec<String> = entry
          .file_paths(&base)
          .into_iter()
          .filter(|path| !path.is_file())
          .map(|path| path.display().to_string())
          .collect();
        if !missing.is_empty() {
          return Err(Error::ModInvalid(format!(
            "Manifest entry {mod_id} references missing VPKs: {}",
            missing.join(", ")
          )));
        }
      }
    }

    Ok(())
  }

  pub fn shard_of(&self, mod_id: &str) -> ShardIndex {
    self
      .mods
      .get(mod_id)
      .map(|entry| entry.shard)
      .unwrap_or(ShardIndex::FIRST)
  }

  /// Read a profile's manifest without touching anything on disk.
  ///
  /// A crashed [`Self::save`] can leave the manifest only in the temp file; that
  /// case is resolved in memory here so reads see the committed data, and the
  /// files are reconciled by [`Self::open_for_write`].
  pub fn load(addons_path: &Path) -> Result<Self, Error> {
    let manifest_path = addons_path.join(MANIFEST_FILENAME);
    let temp_path = addons_path.join(format!("{MANIFEST_FILENAME}.tmp"));

    let source_path = if manifest_path.exists() {
      Some(manifest_path.clone())
    } else if temp_path.exists() {
      Some(temp_path)
    } else {
      None
    };

    let mut manifest = match source_path {
      Some(path) => {
        let manifest_json = fs::read_to_string(&path)?;
        serde_json::from_str(&manifest_json).map_err(|e| {
          Error::InvalidInput(format!(
            "Failed to parse VPK manifest at {}: {e}",
            path.display()
          ))
        })?
      }
      None => Self::default(),
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

    Ok(manifest)
  }

  /// Read a profile's manifest and repair whatever a crashed operation left
  /// behind: a half-committed manifest temp file and any staged VPKs still
  /// parked in a staging directory.
  ///
  /// Only mutation entry points may call this. Reads must use [`Self::load`],
  /// which never writes -- notably [`Self::validate_tree`], which walks backup
  /// snapshots that must come out byte-identical.
  pub fn open_for_write(addons_path: &Path) -> Result<Self, Error> {
    Self::reconcile_manifest_temp_file(addons_path)?;
    let manifest = Self::load(addons_path)?;
    Self::recover_pending_staging(addons_path, &manifest)?;
    Ok(manifest)
  }

  /// Repair a profile in place without keeping the manifest around, for entry
  /// points that mutate the profile without reading it.
  pub fn recover_profile(addons_path: &Path) -> Result<(), Error> {
    Self::open_for_write(addons_path).map(|_| ())
  }

  fn reconcile_manifest_temp_file(addons_path: &Path) -> Result<(), Error> {
    let manifest_path = addons_path.join(MANIFEST_FILENAME);
    let temp_path = addons_path.join(format!("{MANIFEST_FILENAME}.tmp"));

    if !temp_path.exists() {
      return Ok(());
    }

    if manifest_path.exists() {
      fs::remove_file(&temp_path).map_err(|e| {
        Error::InvalidInput(format!(
          "Failed to remove stale VPK manifest temp file at {}: {e}",
          temp_path.display()
        ))
      })?;
    } else {
      fs::rename(&temp_path, &manifest_path).map_err(|e| {
        Error::InvalidInput(format!(
          "Failed to recover VPK manifest temp file from {} to {}: {e}",
          temp_path.display(),
          manifest_path.display()
        ))
      })?;
    }

    Ok(())
  }

  fn recover_pending_staging(addons_path: &Path, manifest: &Self) -> Result<(), Error> {
    let base = ProfileBase::from_snapshot(addons_path)?;
    let clear_staging = addons_path.join(CLEAR_STAGING_DIR);
    if clear_staging.is_dir() {
      if manifest.mods.is_empty() {
        fs::remove_dir_all(&clear_staging)?;
      } else {
        recover_staging_directory(&base, &clear_staging, RecoveryMode::Strict)?;
      }
    }

    let reorder_staging = addons_path.join(REORDER_STAGING_DIR);
    if reorder_staging.is_dir() {
      recover_staging_directory(
        &base,
        &reorder_staging,
        RecoveryMode::AvoidEnabledCollisions,
      )?;
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
        .and_then(|name| name.strip_prefix(UPDATE_STAGING_PREFIX))
        .filter(|_| path.is_dir())
      else {
        continue;
      };
      if manifest.mods.contains_key(mod_id) {
        recover_staging_directory(&base, &path, RecoveryMode::Strict)?;
      } else {
        fs::remove_dir_all(path)?;
      }
    }
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
    shard: ShardIndex,
  ) {
    let entry = self.mods.entry(mod_id.to_string()).or_default();
    entry.enabled = true;
    entry.shard = shard;
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

  fn addons_base(temp: &tempfile::TempDir) -> std::path::PathBuf {
    let base = temp.path().join("citadel").join("addons");
    fs::create_dir_all(&base).unwrap();
    base
  }

  /// Byte-for-byte what the last pre-sharding release wrote: version 1, and no
  /// `shard` key anywhere. Every existing install has a file shaped like this,
  /// so upgrading it is the one path that cannot be allowed to break.
  const V1_MANIFEST: &str = r#"{
  "version": 1,
  "mods": {
    "123456": {
      "enabled": true,
      "order": 0,
      "currentVpks": [
        "pak01_dir.vpk",
        "pak02_dir.vpk"
      ],
      "disabledVpks": [],
      "originalVpkNames": [
        "cool_mod.vpk",
        "cool_mod_2.vpk"
      ]
    },
    "local-abc": {
      "enabled": false,
      "order": 3,
      "currentVpks": [],
      "disabledVpks": [
        "local-abc_skin.vpk"
      ],
      "originalVpkNames": [
        "skin.vpk"
      ]
    }
  }
}"#;

  #[test]
  fn upgrades_a_v1_manifest_from_disk_to_the_current_version() {
    let temp = tempfile::tempdir().unwrap();
    let base = addons_base(&temp);
    fs::write(base.join(MANIFEST_FILENAME), V1_MANIFEST).unwrap();

    let loaded = ProfileVpkManifest::load(&base).unwrap();

    assert_eq!(loaded.version, CURRENT_MANIFEST_VERSION);
    assert_eq!(loaded.mods.len(), 2);

    // Pre-sharding installs kept every enabled VPK in the profile base.
    let enabled = loaded.mods.get("123456").unwrap();
    assert_eq!(enabled.shard, ShardIndex::FIRST);
    assert!(enabled.enabled);
    assert_eq!(enabled.order, Some(0));
    assert_eq!(
      enabled.current_vpks,
      vec!["pak01_dir.vpk".to_string(), "pak02_dir.vpk".to_string()]
    );
    assert_eq!(
      enabled.original_vpk_names,
      vec!["cool_mod.vpk".to_string(), "cool_mod_2.vpk".to_string()]
    );

    let disabled = loaded.mods.get("local-abc").unwrap();
    assert_eq!(disabled.shard, ShardIndex::FIRST);
    assert!(!disabled.enabled);
    assert_eq!(
      disabled.disabled_vpks,
      vec!["local-abc_skin.vpk".to_string()]
    );

    // A v1 entry resolves against the base directory, exactly where its files are.
    let profile = ProfileBase::new(&base).unwrap();
    assert_eq!(
      enabled.file_paths(&profile),
      vec![base.join("pak01_dir.vpk"), base.join("pak02_dir.vpk")]
    );
  }

  /// The upgrade is only in memory until something saves; the next write must
  /// persist it so the file stops being re-upgraded on every load.
  #[test]
  fn saving_an_upgraded_v1_manifest_writes_the_current_version() {
    let temp = tempfile::tempdir().unwrap();
    let base = addons_base(&temp);
    fs::write(base.join(MANIFEST_FILENAME), V1_MANIFEST).unwrap();

    let loaded = ProfileVpkManifest::load(&base).unwrap();
    loaded.save(&base).unwrap();

    let written = fs::read_to_string(base.join(MANIFEST_FILENAME)).unwrap();
    assert!(written.contains(&format!("\"version\": {CURRENT_MANIFEST_VERSION}")));
    assert!(written.contains("\"shard\": 1"));
    assert_eq!(ProfileVpkManifest::load(&base).unwrap(), loaded);
  }

  /// A manifest written by a newer build must not be silently mis-parsed into
  /// a shard layout this build does not understand.
  #[test]
  fn load_rejects_a_manifest_from_a_future_version() {
    let temp = tempfile::tempdir().unwrap();
    let base = addons_base(&temp);
    fs::write(
      base.join(MANIFEST_FILENAME),
      format!(
        r#"{{"version": {}, "mods": {{}}}}"#,
        CURRENT_MANIFEST_VERSION + 1
      ),
    )
    .unwrap();

    let error = ProfileVpkManifest::load(&base).unwrap_err();

    assert!(error.to_string().contains("unsupported version"));
  }

  /// Shard indexes outside `1..=MAX_SHARDS` cannot address a real directory, so
  /// a corrupted entry has to fail loudly rather than resolve to shard 1.
  #[test]
  fn load_rejects_an_out_of_range_shard() {
    let temp = tempfile::tempdir().unwrap();
    let base = addons_base(&temp);
    fs::write(
      base.join(MANIFEST_FILENAME),
      r#"{"version": 2, "mods": {"1": {"enabled": true, "shard": 0}}}"#,
    )
    .unwrap();

    assert!(ProfileVpkManifest::load(&base).is_err());
  }

  #[test]
  fn persists_profile_manifest() {
    let temp = tempfile::tempdir().unwrap();
    let base = addons_base(&temp);
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "123",
      vec!["pak01_dir.vpk".to_string()],
      vec!["cool_mod.vpk".to_string()],
      Some(0),
      ShardIndex::FIRST,
    );

    manifest.save(&base).unwrap();
    let loaded = ProfileVpkManifest::load(&base).unwrap();

    assert_eq!(loaded, manifest);
  }

  #[test]
  fn open_for_write_recovers_temp_manifest_when_main_is_missing() {
    let temp = tempfile::tempdir().unwrap();
    let base = addons_base(&temp);
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "123",
      vec!["pak01_dir.vpk".to_string()],
      vec!["cool_mod.vpk".to_string()],
      Some(0),
      ShardIndex::FIRST,
    );
    let temp_path = base.join(format!("{MANIFEST_FILENAME}.tmp"));
    fs::write(&temp_path, serde_json::to_string_pretty(&manifest).unwrap()).unwrap();

    // A read sees the committed data without moving the file...
    assert_eq!(ProfileVpkManifest::load(&base).unwrap(), manifest);
    assert!(temp_path.exists());

    // ...and the write path is what reconciles it.
    let loaded = ProfileVpkManifest::open_for_write(&base).unwrap();

    assert_eq!(loaded, manifest);
    assert!(base.join(MANIFEST_FILENAME).exists());
    assert!(!temp_path.exists());
  }

  #[test]
  fn open_for_write_removes_stale_temp_manifest_when_main_exists() {
    let temp = tempfile::tempdir().unwrap();
    let base = addons_base(&temp);
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "123",
      vec!["pak01_dir.vpk".to_string()],
      vec!["cool_mod.vpk".to_string()],
      Some(0),
      ShardIndex::FIRST,
    );
    manifest.save(&base).unwrap();
    let temp_path = base.join(format!("{MANIFEST_FILENAME}.tmp"));
    fs::write(&temp_path, "{}").unwrap();

    let loaded = ProfileVpkManifest::open_for_write(&base).unwrap();

    assert_eq!(loaded, manifest);
    assert!(!temp_path.exists());
  }

  #[test]
  fn open_for_write_recovers_interrupted_reorder_staging() {
    let temp = tempfile::tempdir().unwrap();
    let base = addons_base(&temp);
    let staging = base.join(REORDER_STAGING_DIR);
    fs::create_dir_all(&staging).unwrap();
    fs::write(staging.join("s2__pak01_dir.vpk.pending"), b"vpk").unwrap();

    ProfileVpkManifest::open_for_write(&base).unwrap();

    assert_eq!(
      fs::read(temp.path().join("citadel/addons2/pak01_dir.vpk")).unwrap(),
      b"vpk"
    );
    assert!(!staging.exists());
  }

  /// Reads must never repair. Recovery relocates files across shards, so a read
  /// that triggered it would mutate whatever tree it was pointed at.
  #[test]
  fn load_leaves_interrupted_staging_alone() {
    let temp = tempfile::tempdir().unwrap();
    let base = addons_base(&temp);
    let staging = base.join(REORDER_STAGING_DIR);
    fs::create_dir_all(&staging).unwrap();
    let staged = staging.join("s2__pak01_dir.vpk.pending");
    fs::write(&staged, b"vpk").unwrap();

    ProfileVpkManifest::load(&base).unwrap();

    assert_eq!(fs::read(&staged).unwrap(), b"vpk");
    assert!(!temp.path().join("citadel/addons2/pak01_dir.vpk").exists());
  }

  /// Backups are validated by walking the snapshot. A snapshot taken mid-operation
  /// contains staging directories by construction, and validating it must not
  /// relocate or delete their contents.
  #[test]
  fn validate_tree_does_not_mutate_the_snapshot() {
    let temp = tempfile::tempdir().unwrap();
    let snapshot = temp.path().join("snapshot");
    let profile = snapshot.join("addons/profile_x");
    fs::create_dir_all(&profile).unwrap();

    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "123",
      vec!["pak01_dir.vpk".to_string()],
      vec!["cool_mod.vpk".to_string()],
      Some(0),
      ShardIndex::FIRST,
    );
    manifest.save(&profile).unwrap();
    fs::write(profile.join("pak01_dir.vpk"), b"vpk").unwrap();

    let staging = profile.join(REORDER_STAGING_DIR);
    fs::create_dir_all(&staging).unwrap();
    let staged = staging.join("s2__pak02_dir.vpk.pending");
    fs::write(&staged, b"staged vpk").unwrap();

    let orphan_staging = profile.join(format!("{UPDATE_STAGING_PREFIX}999"));
    fs::create_dir_all(&orphan_staging).unwrap();
    let orphan_staged = orphan_staging.join("s1__pak03_dir.vpk.pending");
    fs::write(&orphan_staged, b"orphan vpk").unwrap();

    ProfileVpkManifest::validate_tree(&snapshot).unwrap();

    assert_eq!(fs::read(&staged).unwrap(), b"staged vpk");
    assert_eq!(fs::read(&orphan_staged).unwrap(), b"orphan vpk");
    assert!(
      !snapshot.join("addons2/profile_x/pak02_dir.vpk").exists(),
      "validation relocated a staged VPK inside the backup"
    );
  }

  #[test]
  fn validate_tree_checks_manifest_files_in_their_recorded_shards() {
    let temp = tempfile::tempdir().unwrap();
    let snapshot = temp.path().join("snapshot");
    let profile = snapshot.join("addons/profile_x");
    let shard_two = snapshot.join("addons2/profile_x");
    fs::create_dir_all(&profile).unwrap();

    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "123",
      vec!["pak01_dir.vpk".to_string()],
      vec!["cool_mod.vpk".to_string()],
      Some(0),
      ShardIndex::new(2).unwrap(),
    );
    manifest.save(&profile).unwrap();

    let error = ProfileVpkManifest::validate_tree(&snapshot).unwrap_err();
    assert!(error.to_string().contains("references missing VPKs"));

    fs::create_dir_all(&shard_two).unwrap();
    fs::write(shard_two.join("pak01_dir.vpk"), b"vpk").unwrap();
    ProfileVpkManifest::validate_tree(&snapshot).unwrap();
  }

  #[test]
  fn mark_enabled_preserves_original_names_when_empty() {
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "123",
      vec!["pak01_dir.vpk".to_string()],
      vec!["cool_mod.vpk".to_string()],
      Some(0),
      ShardIndex::FIRST,
    );

    manifest.mark_enabled(
      "123",
      vec!["pak02_dir.vpk".to_string()],
      Vec::new(),
      Some(1),
      ShardIndex::new(2).unwrap(),
    );

    let entry = manifest.mods.get("123").unwrap();
    assert_eq!(entry.original_vpk_names, vec!["cool_mod.vpk".to_string()]);
    assert_eq!(entry.current_vpks, vec!["pak02_dir.vpk".to_string()]);
    assert_eq!(entry.order, Some(1));
    assert_eq!(entry.shard, ShardIndex::new(2).unwrap());
  }
}
