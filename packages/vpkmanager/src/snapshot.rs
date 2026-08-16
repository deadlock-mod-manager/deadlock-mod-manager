//! Copying a profile's shard trees, for backup and restore.
//!
//! A backup is the one operation that moves VPKs around wholesale, and the rules
//! for which files belong in a copy are VPK rules: a half-finished staging
//! directory must not be captured, a ledger that was only written to its temp
//! file must be, and symlinks are not followed out of the tree. Those rules live
//! here so a backup cannot drift from what the rest of the crate believes a
//! profile is.
//!
//! Where the copies go, when they are taken and how they are pruned is the
//! app's business, not this crate's.

use std::fs;
use std::path::Path;

use crate::ledger::LEDGER_FILENAME;
use crate::profile::is_internal_artifact;

/// What a copied or measured tree contains.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct SnapshotStats {
    pub bytes: u64,
    pub files: u64,
    pub vpks: u32,
}

impl SnapshotStats {
    pub fn add(&mut self, other: Self) {
        self.bytes += other.bytes;
        self.files += other.files;
        self.vpks += other.vpks;
    }
}

/// Copy a shard tree into `destination`, leaving out anything that belongs to an
/// operation rather than to the user's addons.
pub fn copy_tree(source: &Path, destination: &Path) -> std::io::Result<SnapshotStats> {
    fs::create_dir_all(destination)?;
    let mut stats = SnapshotStats::default();
    let temp_ledger = format!("{LEDGER_FILENAME}.tmp");

    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let entry_name = entry.file_name();
        let entry_name = entry_name.to_string_lossy();

        if entry_name.as_ref() == temp_ledger {
            // A temp ledger with no canonical `.dmm.json` sibling is the only
            // surviving record of this profile's mod ownership (the process
            // crashed between writing the temp file and renaming it into place).
            // Canonicalize it into the copy so restore and validation see it.
            // When `.dmm.json` already exists the temp file is stale and skipped.
            if !source.join(LEDGER_FILENAME).exists() {
                stats.bytes += fs::copy(&source_path, destination.join(LEDGER_FILENAME))?;
                stats.files += 1;
            }
            continue;
        }
        if is_internal_artifact(entry_name.as_ref()) {
            continue;
        }

        let file_type = entry.file_type()?;
        if file_type.is_symlink() {
            log::warn!("Skipping symlink while copying an addons snapshot: {source_path:?}");
            continue;
        }

        let destination_path = destination.join(entry.file_name());
        if file_type.is_dir() {
            stats.add(copy_tree(&source_path, &destination_path)?);
        } else if file_type.is_file() {
            stats.bytes += fs::copy(&source_path, &destination_path)?;
            stats.files += 1;
            if is_vpk(&source_path) {
                stats.vpks += 1;
            }
        }
    }

    Ok(stats)
}

/// Measure a tree without copying it.
pub fn tree_stats(path: &Path) -> std::io::Result<SnapshotStats> {
    let mut stats = SnapshotStats::default();
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let entry_path = entry.path();
        let file_type = entry.file_type()?;
        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() {
            stats.add(tree_stats(&entry_path)?);
        } else if file_type.is_file() {
            stats.bytes += entry.metadata()?.len();
            stats.files += 1;
            if is_vpk(&entry_path) {
                stats.vpks += 1;
            }
        }
    }
    Ok(stats)
}

fn is_vpk(path: &Path) -> bool {
    path.extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("vpk"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::profile::REORDER_STAGING_DIR;

    #[test]
    fn copying_skips_staging_and_counts_vpks() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("addons");
        fs::create_dir_all(source.join("profile_x")).unwrap();
        fs::create_dir_all(source.join(REORDER_STAGING_DIR)).unwrap();
        fs::write(source.join("pak01_dir.vpk"), b"vpk").unwrap();
        fs::write(source.join(LEDGER_FILENAME), b"{}").unwrap();
        fs::write(source.join("profile_x/pak01_dir.vpk"), b"vpk").unwrap();
        fs::write(
            source
                .join(REORDER_STAGING_DIR)
                .join("s1__pak09_dir.vpk.pending"),
            b"staged",
        )
        .unwrap();

        let destination = temp.path().join("backup");
        let stats = copy_tree(&source, &destination).unwrap();

        assert_eq!(stats.vpks, 2);
        assert_eq!(stats.files, 3);
        assert!(!destination.join(REORDER_STAGING_DIR).exists());
        assert!(destination.join("profile_x/pak01_dir.vpk").is_file());
        assert_eq!(tree_stats(&destination).unwrap(), stats);
    }

    /// A ledger that only exists as a temp file is the profile's sole record of
    /// which mod owns what; a backup that dropped it would restore a folder full
    /// of VPKs nothing claims.
    #[test]
    fn a_temp_only_ledger_is_canonicalized_into_the_copy() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("addons");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join(format!("{LEDGER_FILENAME}.tmp")), b"{}").unwrap();

        let destination = temp.path().join("backup");
        copy_tree(&source, &destination).unwrap();

        assert!(destination.join(LEDGER_FILENAME).is_file());
        assert!(!destination.join(format!("{LEDGER_FILENAME}.tmp")).exists());
    }

    /// When the canonical ledger is there, the leftover temp file is stale.
    #[test]
    fn a_stale_temp_ledger_is_left_out() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("addons");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join(LEDGER_FILENAME), b"{\"version\":3}").unwrap();
        fs::write(source.join(format!("{LEDGER_FILENAME}.tmp")), b"stale").unwrap();

        let destination = temp.path().join("backup");
        copy_tree(&source, &destination).unwrap();

        assert_eq!(
            fs::read(destination.join(LEDGER_FILENAME)).unwrap(),
            b"{\"version\":3}"
        );
    }
}
