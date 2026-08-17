//! Looking at what is actually in a profile's shard directories.
//!
//! This is deliberately dumb: it lists files, classifies them by name, and
//! stats them. It never opens a VPK — deciding which files are worth opening is
//! [`crate::reconcile`]'s job, and it uses the stat data here to skip the ones
//! that cannot have changed since the last scan.

use std::fs;
use std::path::PathBuf;
use std::time::UNIX_EPOCH;

use crate::error::Result;
use crate::naming;
use crate::profile::{ProfileBase, ShardIndex, is_internal_artifact};

/// What a file's name says about it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum VpkKind {
    /// `pak##_dir.vpk` — the engine loads this.
    Enabled { number: u32 },
    /// `{mod_id}_*.vpk` — parked by the mod manager, not loaded.
    Disabled { mod_id: String },
    /// A VPK the naming convention says nothing about. Either the user dropped
    /// it in by hand, or it is a mod file that was renamed outside the app.
    Foreign,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScannedVpk {
    pub shard: ShardIndex,
    pub filename: String,
    pub path: PathBuf,
    pub kind: VpkKind,
    pub size: u64,
    /// Unix seconds; 0 when the platform does not report one.
    pub modified_at: u64,
}

impl ScannedVpk {
    pub fn is_enabled(&self) -> bool {
        matches!(self.kind, VpkKind::Enabled { .. })
    }

    /// The mod this file's *name* claims it belongs to, which is a guess: only
    /// a fingerprint is authoritative.
    pub fn named_mod_id(&self) -> Option<&str> {
        match &self.kind {
            VpkKind::Disabled { mod_id } => Some(mod_id),
            _ => None,
        }
    }
}

/// Every VPK in every existing shard of a profile, shard order then filename.
pub fn scan_profile(base: &ProfileBase) -> Result<Vec<ScannedVpk>> {
    let mut found = Vec::new();
    for (shard, dir) in base.existing_shards() {
        let entries = match fs::read_dir(&dir) {
            Ok(entries) => entries,
            // A shard directory can vanish between the existence check and the
            // read; that is drift, not an error.
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error.into()),
        };

        let mut shard_files = Vec::new();
        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            let Some(filename) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            if is_internal_artifact(filename) || !path.is_file() {
                continue;
            }
            if !filename.to_ascii_lowercase().ends_with(".vpk") {
                continue;
            }

            let metadata = entry.metadata()?;
            let modified_at = metadata
                .modified()
                .ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map(|since| since.as_secs())
                .unwrap_or_default();

            shard_files.push(ScannedVpk {
                shard,
                filename: filename.to_string(),
                kind: classify(filename),
                path: path.clone(),
                size: metadata.len(),
                modified_at,
            });
        }

        shard_files.sort_by(|left, right| left.filename.cmp(&right.filename));
        found.extend(shard_files);
    }

    Ok(found)
}

fn classify(filename: &str) -> VpkKind {
    if let Some(number) = naming::enabled_vpk_number(filename) {
        return VpkKind::Enabled { number };
    }
    match naming::mod_id_from_prefix(filename) {
        Some(mod_id) => VpkKind::Disabled { mod_id },
        None => VpkKind::Foreign,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base(temp: &tempfile::TempDir) -> ProfileBase {
        let path = temp.path().join("citadel").join("addons");
        fs::create_dir_all(&path).unwrap();
        ProfileBase::new(path).unwrap()
    }

    #[test]
    fn classifies_every_name_shape_a_profile_holds() {
        assert_eq!(classify("pak03_dir.vpk"), VpkKind::Enabled { number: 3 });
        assert_eq!(
            classify("650634_cool.vpk"),
            VpkKind::Disabled {
                mod_id: "650634".to_string()
            }
        );
        assert_eq!(
            classify("local-abc_skin.vpk"),
            VpkKind::Disabled {
                mod_id: "local-abc".to_string()
            }
        );
        assert_eq!(classify("something_else.vpk"), VpkKind::Foreign);
    }

    #[test]
    fn scans_across_shards_and_skips_our_own_artifacts() {
        let temp = tempfile::tempdir().unwrap();
        let base = base(&temp);
        let shard_two = base.shard_dir(ShardIndex::new(2).unwrap());
        fs::create_dir_all(&shard_two).unwrap();

        fs::write(base.join("pak01_dir.vpk"), b"a").unwrap();
        fs::write(base.join("650634_cool.vpk"), b"bb").unwrap();
        fs::write(base.join(".dmm.json"), b"{}").unwrap();
        fs::write(base.join(".pak01_dir.vpk.dmm-stamp"), b"partial").unwrap();
        fs::write(base.join("notes.txt"), b"not a vpk").unwrap();
        fs::create_dir_all(base.join(".dmm-reorder")).unwrap();
        fs::write(shard_two.join("pak01_dir.vpk"), b"ccc").unwrap();

        let found = scan_profile(&base).unwrap();

        assert_eq!(
            found
                .iter()
                .map(|vpk| (vpk.shard.get(), vpk.filename.as_str()))
                .collect::<Vec<_>>(),
            vec![
                (1, "650634_cool.vpk"),
                (1, "pak01_dir.vpk"),
                (2, "pak01_dir.vpk"),
            ]
        );
        assert_eq!(found[0].size, 2);
        assert_eq!(
            found[0].named_mod_id(),
            Some("650634"),
            "a disabled file names its mod"
        );
        assert!(found[1].is_enabled());
    }

    #[test]
    fn scanning_a_profile_with_no_directories_finds_nothing() {
        let temp = tempfile::tempdir().unwrap();
        let base =
            ProfileBase::new(temp.path().join("citadel").join("addons").join("gone")).unwrap();

        assert!(scan_profile(&base).unwrap().is_empty());
    }
}
