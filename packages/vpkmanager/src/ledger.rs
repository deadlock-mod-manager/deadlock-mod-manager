//! The book a profile keeps of its own mods: `.dmm.json`.
//!
//! Two layers live in this file, and they answer different questions.
//!
//! [`ModEntry`] is the *intent*: which mods this profile has, whether they are
//! meant to be enabled, and in what order. It is the part the user edits through
//! the app, and its shape has been on disk since v1.
//!
//! [`TrackedVpk`] is the *observation*: for every VPK the manager has ever
//! stamped, where that exact file was last seen. It is keyed by fingerprint id
//! rather than by filename, which is what lets a file be found again after it
//! has been renamed, moved between shards, or restored from a backup. This layer
//! is derived — [`crate::reconcile`] rebuilds it from what is actually on disk —
//! so a corrupted or missing `files` map costs a rescan, never a lost mod.

use std::collections::BTreeMap;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{Result, VpkManagerError};
use crate::profile::{
    CLEAR_STAGING_DIR, ProfileBase, REORDER_STAGING_DIR, ShardIndex, UPDATE_STAGING_PREFIX,
};
use crate::staging::{RecoveryMode, recover_staging_directory};

pub const LEDGER_FILENAME: &str = ".dmm.json";
pub const CURRENT_LEDGER_VERSION: u32 = 3;

const fn current_ledger_version() -> u32 {
    CURRENT_LEDGER_VERSION
}

/// Shard index a mod's enabled VPKs live in when the entry predates sharding
/// (ledger v1) or omits the field. Shard 1 is the profile base directory.
const fn default_shard() -> ShardIndex {
    ShardIndex::FIRST
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProfileLedger {
    #[serde(default = "current_ledger_version")]
    pub version: u32,
    #[serde(default)]
    pub mods: BTreeMap<String, ModEntry>,
    /// Every fingerprinted VPK and where it was last seen, keyed by fingerprint
    /// id. Rebuilt from disk by [`crate::reconcile`].
    #[serde(default)]
    pub files: BTreeMap<String, TrackedVpk>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ModEntry {
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

/// Whether a tracked file is currently loaded by the engine.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum VpkState {
    /// Named `pak##_dir.vpk` in a shard directory; the engine loads it.
    Enabled,
    /// Named `{mod_id}_*.vpk` in the profile base; parked, not loaded.
    Disabled,
}

/// One physical VPK file, identified by the fingerprint stamped inside it.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TrackedVpk {
    pub mod_id: String,
    pub shard: ShardIndex,
    pub filename: String,
    pub state: VpkState,
    /// The filename the mod shipped with, before any renaming.
    pub original_name: String,
    /// Identifies the file's *content*; two copies of one download share it.
    #[serde(default)]
    pub content_hash: String,
    /// Size and modified time as of the last scan, so a rescan can skip files
    /// that cannot have changed.
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub modified_at: u64,
    /// Unix seconds of the last scan that saw this file.
    #[serde(default)]
    pub last_seen: u64,
}

impl TrackedVpk {
    pub fn path(&self, base: &ProfileBase) -> PathBuf {
        base.shard_dir(self.shard).join(&self.filename)
    }

    /// Whether an on-disk file could be this record without re-reading it.
    pub fn matches_stat(&self, size: u64, modified_at: u64) -> bool {
        self.size == size && self.modified_at == modified_at
    }
}

impl Default for ModEntry {
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

impl ModEntry {
    pub fn file_paths(&self, base: &ProfileBase) -> Vec<PathBuf> {
        if self.enabled {
            let enabled_dir = base.shard_dir(self.shard);
            self.current_vpks
                .iter()
                .map(|vpk| enabled_dir.join(vpk))
                .collect()
        } else {
            self.disabled_vpks
                .iter()
                .map(|vpk| base.join(vpk))
                .collect()
        }
    }
}

impl Default for ProfileLedger {
    fn default() -> Self {
        Self {
            version: CURRENT_LEDGER_VERSION,
            mods: BTreeMap::new(),
            files: BTreeMap::new(),
        }
    }
}

impl ProfileLedger {
    /// Validate every ledger-backed profile in a shard-root snapshot.
    ///
    /// `root` contains sibling `addons`, `addons2`, ... directories, as used by
    /// both the live `citadel` tree and addons backups.
    pub fn validate_tree(root: &Path) -> Result<()> {
        let addons_root = root.join("addons");
        if !addons_root.is_dir() {
            return Err(VpkManagerError::Vpk(format!(
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

            if !profile_path.join(LEDGER_FILENAME).is_file() {
                continue;
            }
            let base = ProfileBase::from_snapshot(&profile_path)?;
            let ledger = Self::load(&profile_path)?;
            for (mod_id, entry) in ledger.mods {
                let missing: Vec<String> = entry
                    .file_paths(&base)
                    .into_iter()
                    .filter(|path| !path.is_file())
                    .map(|path| path.display().to_string())
                    .collect();
                if !missing.is_empty() {
                    return Err(VpkManagerError::Vpk(format!(
                        "Ledger entry {mod_id} references missing VPKs: {}",
                        missing.join(", ")
                    )));
                }
            }
        }

        Ok(())
    }

    pub fn shard_of(&self, mod_id: &str) -> ShardIndex {
        self.mods
            .get(mod_id)
            .map(|entry| entry.shard)
            .unwrap_or(ShardIndex::FIRST)
    }

    /// Read a profile's ledger without touching anything on disk.
    ///
    /// A crashed [`Self::save`] can leave the ledger only in the temp file; that
    /// case is resolved in memory here so reads see the committed data, and the
    /// files are reconciled by [`Self::open_for_write`].
    pub fn load(addons_path: &Path) -> Result<Self> {
        let ledger_path = addons_path.join(LEDGER_FILENAME);
        let temp_path = addons_path.join(format!("{LEDGER_FILENAME}.tmp"));

        let source_path = if ledger_path.exists() {
            Some(ledger_path.clone())
        } else if temp_path.exists() {
            Some(temp_path)
        } else {
            None
        };

        let mut ledger: Self = match source_path {
            Some(path) => {
                let json = fs::read_to_string(&path)?;
                serde_json::from_str(&json).map_err(|e| {
                    VpkManagerError::Invalid(format!(
                        "Failed to parse VPK ledger at {}: {e}",
                        path.display()
                    ))
                })?
            }
            None => Self::default(),
        };

        if ledger.version > CURRENT_LEDGER_VERSION {
            return Err(VpkManagerError::Invalid(format!(
                "VPK ledger at {} uses unsupported version {}",
                ledger_path.display(),
                ledger.version
            )));
        }

        if ledger.version < CURRENT_LEDGER_VERSION {
            ledger.version = CURRENT_LEDGER_VERSION;
        }

        Ok(ledger)
    }

    /// Read a profile's ledger and repair whatever a crashed operation left
    /// behind: a half-committed temp file and any staged VPKs still parked in a
    /// staging directory.
    ///
    /// Only mutation entry points may call this. Reads must use [`Self::load`],
    /// which never writes -- notably [`Self::validate_tree`], which walks backup
    /// snapshots that must come out byte-identical.
    pub fn open_for_write(addons_path: &Path) -> Result<Self> {
        Self::reconcile_temp_file(addons_path)?;
        let ledger = Self::load(addons_path)?;
        Self::recover_pending_staging(addons_path, &ledger)?;
        Ok(ledger)
    }

    /// Repair a profile in place without keeping the ledger around, for entry
    /// points that mutate the profile without reading it.
    pub fn recover_profile(addons_path: &Path) -> Result<()> {
        Self::open_for_write(addons_path).map(|_| ())
    }

    fn reconcile_temp_file(addons_path: &Path) -> Result<()> {
        let ledger_path = addons_path.join(LEDGER_FILENAME);
        let temp_path = addons_path.join(format!("{LEDGER_FILENAME}.tmp"));

        if !temp_path.exists() {
            return Ok(());
        }

        if ledger_path.exists() {
            fs::remove_file(&temp_path).map_err(|e| {
                VpkManagerError::Invalid(format!(
                    "Failed to remove stale VPK ledger temp file at {}: {e}",
                    temp_path.display()
                ))
            })?;
        } else {
            fs::rename(&temp_path, &ledger_path).map_err(|e| {
                VpkManagerError::Invalid(format!(
                    "Failed to recover VPK ledger temp file from {} to {}: {e}",
                    temp_path.display(),
                    ledger_path.display()
                ))
            })?;
        }

        Ok(())
    }

    fn recover_pending_staging(addons_path: &Path, ledger: &Self) -> Result<()> {
        let base = ProfileBase::from_snapshot(addons_path)?;
        let clear_staging = addons_path.join(CLEAR_STAGING_DIR);
        if clear_staging.is_dir() {
            if ledger.mods.is_empty() {
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
            if ledger.mods.contains_key(mod_id) {
                recover_staging_directory(&base, &path, RecoveryMode::Strict)?;
            } else {
                fs::remove_dir_all(path)?;
            }
        }
        Ok(())
    }

    pub fn save(&self, addons_path: &Path) -> Result<()> {
        fs::create_dir_all(addons_path)?;

        let ledger_path = addons_path.join(LEDGER_FILENAME);
        let temp_path = addons_path.join(format!("{LEDGER_FILENAME}.tmp"));
        let json = serde_json::to_string_pretty(self).map_err(|e| {
            VpkManagerError::Invalid(format!(
                "Failed to serialize VPK ledger at {}: {e}",
                ledger_path.display()
            ))
        })?;

        fs::write(&temp_path, json)?;
        if let Err(err) = fs::rename(&temp_path, &ledger_path) {
            if err.kind() == ErrorKind::AlreadyExists {
                fs::remove_file(&ledger_path)?;
                fs::rename(&temp_path, &ledger_path)?;
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

    /// Drop a mod and everything tracked for it.
    pub fn remove_mod(&mut self, mod_id: &str) {
        self.mods.remove(mod_id);
        self.files.retain(|_, tracked| tracked.mod_id != mod_id);
    }

    /// Record where a fingerprinted file currently is.
    pub fn track(&mut self, fingerprint_id: impl Into<String>, tracked: TrackedVpk) {
        self.files.insert(fingerprint_id.into(), tracked);
    }

    /// Stop tracking a file, without touching its mod's entry.
    pub fn untrack(&mut self, fingerprint_id: &str) -> Option<TrackedVpk> {
        self.files.remove(fingerprint_id)
    }

    pub fn tracked(&self, fingerprint_id: &str) -> Option<&TrackedVpk> {
        self.files.get(fingerprint_id)
    }

    /// Every file tracked for one mod, in ledger order.
    pub fn tracked_for_mod<'a>(
        &'a self,
        mod_id: &'a str,
    ) -> impl Iterator<Item = (&'a String, &'a TrackedVpk)> {
        self.files
            .iter()
            .filter(move |(_, tracked)| tracked.mod_id == mod_id)
    }

    /// The fingerprint id of the file at `shard`/`filename`, if one is tracked
    /// there.
    pub fn tracked_at(&self, shard: ShardIndex, filename: &str) -> Option<&str> {
        self.files
            .iter()
            .find(|(_, tracked)| tracked.shard == shard && tracked.filename == filename)
            .map(|(id, _)| id.as_str())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::profile::REORDER_STAGING_DIR;

    fn addons_base(temp: &tempfile::TempDir) -> PathBuf {
        let base = temp.path().join("citadel").join("addons");
        fs::create_dir_all(&base).unwrap();
        base
    }

    /// Byte-for-byte what the last pre-sharding release wrote: version 1, and no
    /// `shard` key anywhere. Every existing install has a file shaped like this,
    /// so upgrading it is the one path that cannot be allowed to break.
    const V1_LEDGER: &str = r#"{
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
    fn upgrades_a_v1_ledger_from_disk_to_the_current_version() {
        let temp = tempfile::tempdir().unwrap();
        let base = addons_base(&temp);
        fs::write(base.join(LEDGER_FILENAME), V1_LEDGER).unwrap();

        let loaded = ProfileLedger::load(&base).unwrap();

        assert_eq!(loaded.version, CURRENT_LEDGER_VERSION);
        assert_eq!(loaded.mods.len(), 2);
        // Nothing is fingerprinted yet; the files map fills in on the first scan.
        assert!(loaded.files.is_empty());

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
    fn saving_an_upgraded_v1_ledger_writes_the_current_version() {
        let temp = tempfile::tempdir().unwrap();
        let base = addons_base(&temp);
        fs::write(base.join(LEDGER_FILENAME), V1_LEDGER).unwrap();

        let loaded = ProfileLedger::load(&base).unwrap();
        loaded.save(&base).unwrap();

        let written = fs::read_to_string(base.join(LEDGER_FILENAME)).unwrap();
        assert!(written.contains(&format!("\"version\": {CURRENT_LEDGER_VERSION}")));
        assert!(written.contains("\"shard\": 1"));
        assert_eq!(ProfileLedger::load(&base).unwrap(), loaded);
    }

    /// A ledger written by a newer build must not be silently mis-parsed into
    /// a shard layout this build does not understand.
    #[test]
    fn load_rejects_a_ledger_from_a_future_version() {
        let temp = tempfile::tempdir().unwrap();
        let base = addons_base(&temp);
        fs::write(
            base.join(LEDGER_FILENAME),
            format!(
                r#"{{"version": {}, "mods": {{}}}}"#,
                CURRENT_LEDGER_VERSION + 1
            ),
        )
        .unwrap();

        let error = ProfileLedger::load(&base).unwrap_err();

        assert!(error.to_string().contains("unsupported version"));
    }

    /// Shard indexes outside `1..=MAX_SHARDS` cannot address a real directory, so
    /// a corrupted entry has to fail loudly rather than resolve to shard 1.
    #[test]
    fn load_rejects_an_out_of_range_shard() {
        let temp = tempfile::tempdir().unwrap();
        let base = addons_base(&temp);
        fs::write(
            base.join(LEDGER_FILENAME),
            r#"{"version": 2, "mods": {"1": {"enabled": true, "shard": 0}}}"#,
        )
        .unwrap();

        assert!(ProfileLedger::load(&base).is_err());
    }

    #[test]
    fn tracked_files_round_trip_through_the_file() {
        let temp = tempfile::tempdir().unwrap();
        let base = addons_base(&temp);
        let mut ledger = ProfileLedger::default();
        ledger.mark_enabled(
            "123",
            vec!["pak01_dir.vpk".to_string()],
            vec!["cool_mod.vpk".to_string()],
            Some(0),
            ShardIndex::FIRST,
        );
        ledger.track(
            "fingerprint-1",
            TrackedVpk {
                mod_id: "123".to_string(),
                shard: ShardIndex::FIRST,
                filename: "pak01_dir.vpk".to_string(),
                state: VpkState::Enabled,
                original_name: "cool_mod.vpk".to_string(),
                content_hash: "abc".to_string(),
                size: 42,
                modified_at: 7,
                last_seen: 9,
            },
        );

        ledger.save(&base).unwrap();
        let loaded = ProfileLedger::load(&base).unwrap();

        assert_eq!(loaded, ledger);
        assert_eq!(loaded.tracked("fingerprint-1").unwrap().mod_id, "123");
        assert_eq!(
            loaded.tracked_at(ShardIndex::FIRST, "pak01_dir.vpk"),
            Some("fingerprint-1")
        );
    }

    /// Removing a mod must take its tracked files with it, or a later scan would
    /// keep resurrecting a mod the user deleted.
    #[test]
    fn removing_a_mod_forgets_its_tracked_files() {
        let mut ledger = ProfileLedger::default();
        ledger.mark_enabled("123", vec![], vec![], None, ShardIndex::FIRST);
        ledger.track(
            "fingerprint-1",
            TrackedVpk {
                mod_id: "123".to_string(),
                shard: ShardIndex::FIRST,
                filename: "pak01_dir.vpk".to_string(),
                state: VpkState::Enabled,
                original_name: "cool_mod.vpk".to_string(),
                content_hash: String::new(),
                size: 0,
                modified_at: 0,
                last_seen: 0,
            },
        );

        ledger.remove_mod("123");

        assert!(ledger.mods.is_empty());
        assert!(ledger.files.is_empty());
    }

    #[test]
    fn open_for_write_recovers_temp_ledger_when_main_is_missing() {
        let temp = tempfile::tempdir().unwrap();
        let base = addons_base(&temp);
        let mut ledger = ProfileLedger::default();
        ledger.mark_enabled(
            "123",
            vec!["pak01_dir.vpk".to_string()],
            vec!["cool_mod.vpk".to_string()],
            Some(0),
            ShardIndex::FIRST,
        );
        let temp_path = base.join(format!("{LEDGER_FILENAME}.tmp"));
        fs::write(&temp_path, serde_json::to_string_pretty(&ledger).unwrap()).unwrap();

        // A read sees the committed data without moving the file...
        assert_eq!(ProfileLedger::load(&base).unwrap(), ledger);
        assert!(temp_path.exists());

        // ...and the write path is what reconciles it.
        let loaded = ProfileLedger::open_for_write(&base).unwrap();

        assert_eq!(loaded, ledger);
        assert!(base.join(LEDGER_FILENAME).exists());
        assert!(!temp_path.exists());
    }

    #[test]
    fn open_for_write_removes_stale_temp_ledger_when_main_exists() {
        let temp = tempfile::tempdir().unwrap();
        let base = addons_base(&temp);
        let mut ledger = ProfileLedger::default();
        ledger.mark_enabled(
            "123",
            vec!["pak01_dir.vpk".to_string()],
            vec!["cool_mod.vpk".to_string()],
            Some(0),
            ShardIndex::FIRST,
        );
        ledger.save(&base).unwrap();
        let temp_path = base.join(format!("{LEDGER_FILENAME}.tmp"));
        fs::write(&temp_path, "{}").unwrap();

        let loaded = ProfileLedger::open_for_write(&base).unwrap();

        assert_eq!(loaded, ledger);
        assert!(!temp_path.exists());
    }

    #[test]
    fn open_for_write_recovers_interrupted_reorder_staging() {
        let temp = tempfile::tempdir().unwrap();
        let base = addons_base(&temp);
        let staging = base.join(REORDER_STAGING_DIR);
        fs::create_dir_all(&staging).unwrap();
        fs::write(staging.join("s2__pak01_dir.vpk.pending"), b"vpk").unwrap();

        ProfileLedger::open_for_write(&base).unwrap();

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

        ProfileLedger::load(&base).unwrap();

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

        let mut ledger = ProfileLedger::default();
        ledger.mark_enabled(
            "123",
            vec!["pak01_dir.vpk".to_string()],
            vec!["cool_mod.vpk".to_string()],
            Some(0),
            ShardIndex::FIRST,
        );
        ledger.save(&profile).unwrap();
        fs::write(profile.join("pak01_dir.vpk"), b"vpk").unwrap();

        let staging = profile.join(REORDER_STAGING_DIR);
        fs::create_dir_all(&staging).unwrap();
        let staged = staging.join("s2__pak02_dir.vpk.pending");
        fs::write(&staged, b"staged vpk").unwrap();

        let orphan_staging = profile.join(format!("{UPDATE_STAGING_PREFIX}999"));
        fs::create_dir_all(&orphan_staging).unwrap();
        let orphan_staged = orphan_staging.join("s1__pak03_dir.vpk.pending");
        fs::write(&orphan_staged, b"orphan vpk").unwrap();

        ProfileLedger::validate_tree(&snapshot).unwrap();

        assert_eq!(fs::read(&staged).unwrap(), b"staged vpk");
        assert_eq!(fs::read(&orphan_staged).unwrap(), b"orphan vpk");
        assert!(
            !snapshot.join("addons2/profile_x/pak02_dir.vpk").exists(),
            "validation relocated a staged VPK inside the backup"
        );
    }

    #[test]
    fn validate_tree_checks_ledger_files_in_their_recorded_shards() {
        let temp = tempfile::tempdir().unwrap();
        let snapshot = temp.path().join("snapshot");
        let profile = snapshot.join("addons/profile_x");
        let shard_two = snapshot.join("addons2/profile_x");
        fs::create_dir_all(&profile).unwrap();

        let mut ledger = ProfileLedger::default();
        ledger.mark_enabled(
            "123",
            vec!["pak01_dir.vpk".to_string()],
            vec!["cool_mod.vpk".to_string()],
            Some(0),
            ShardIndex::new(2).unwrap(),
        );
        ledger.save(&profile).unwrap();

        let error = ProfileLedger::validate_tree(&snapshot).unwrap_err();
        assert!(error.to_string().contains("references missing VPKs"));

        fs::create_dir_all(&shard_two).unwrap();
        fs::write(shard_two.join("pak01_dir.vpk"), b"vpk").unwrap();
        ProfileLedger::validate_tree(&snapshot).unwrap();
    }

    #[test]
    fn mark_enabled_preserves_original_names_when_empty() {
        let mut ledger = ProfileLedger::default();
        ledger.mark_enabled(
            "123",
            vec!["pak01_dir.vpk".to_string()],
            vec!["cool_mod.vpk".to_string()],
            Some(0),
            ShardIndex::FIRST,
        );

        ledger.mark_enabled(
            "123",
            vec!["pak02_dir.vpk".to_string()],
            Vec::new(),
            Some(1),
            ShardIndex::new(2).unwrap(),
        );

        let entry = ledger.mods.get("123").unwrap();
        assert_eq!(entry.original_vpk_names, vec!["cool_mod.vpk".to_string()]);
        assert_eq!(entry.current_vpks, vec!["pak02_dir.vpk".to_string()]);
        assert_eq!(entry.order, Some(1));
        assert_eq!(entry.shard, ShardIndex::new(2).unwrap());
    }
}
