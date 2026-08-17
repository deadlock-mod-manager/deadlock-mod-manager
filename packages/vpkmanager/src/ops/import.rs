//! Bringing a mod's VPKs into a profile.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::fs::{File, OpenOptions};
use std::io;
use std::path::{Path, PathBuf};

use crate::error::{Result, VpkManagerError};
use crate::fingerprint;
use crate::fs_retry;
use crate::ledger::ProfileLedger;
use crate::profile::{ProfileBase, ShardIndex};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PrefixedVpkCopy {
    pub original_name: String,
    pub prefixed_name: String,
    pub status: PrefixedVpkCopyStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PrefixedVpkCopyStatus {
    Copied,
    AlreadyExists,
    MissingSource,
}

/// Copy VPKs out of an extracted mod directory into `destination_dir` under the
/// `{mod_id}_` prefix, fingerprinting each one as it lands.
///
/// `selected` filters by path relative to `source_dir` (forward slashes);
/// `None` copies every VPK found.
pub fn copy_vpks_with_prefix(
    source_dir: &Path,
    destination_dir: &Path,
    mod_id: &str,
    selected: Option<&[String]>,
) -> Result<Vec<String>> {
    let mut sources = Vec::new();
    collect_vpks(source_dir, &mut sources)?;
    sources.sort();

    if let Some(selected) = selected {
        let wanted: HashSet<String> = selected
            .iter()
            .map(|path| path.replace('\\', "/"))
            .collect();
        sources.retain(|path| {
            path.strip_prefix(source_dir)
                .map(|relative| relative.to_string_lossy().replace('\\', "/"))
                .is_ok_and(|relative| wanted.contains(&relative))
        });
        if sources.len() != wanted.len() {
            log::warn!(
                "Mod {mod_id}: {} of {} selected VPK files were not found in the extracted directory",
                wanted.len() - sources.len(),
                wanted.len()
            );
        }
    }

    fs::create_dir_all(destination_dir)?;

    let mut copied = Vec::new();
    for source in sources {
        let Some(file_name) = source.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        let prefixed_name = copy_prefixed_vpk(&source, destination_dir, mod_id, file_name)?;
        copied.push(prefixed_name);
    }

    Ok(copied)
}

/// Copy specific VPKs by their shipped filenames, reporting per file whether it
/// landed, was already staged, or was not in `source_dir` at all.
///
/// An existing `{mod_id}_{name}` is never overwritten; that file is the one the
/// profile already knows about.
pub fn copy_named_vpks_with_prefix(
    source_dir: &Path,
    destination_dir: &Path,
    mod_id: &str,
    original_names: &[String],
) -> Result<Vec<PrefixedVpkCopy>> {
    if original_names.is_empty() {
        return Ok(Vec::new());
    }

    let mut wanted = HashSet::new();
    for original_name in original_names {
        validate_original_vpk_name(original_name)?;
        if !wanted.insert(original_name.as_str()) {
            return Err(VpkManagerError::Invalid(format!(
                "Duplicate VPK filename requested: {original_name}"
            )));
        }
    }

    let mut sources = Vec::new();
    collect_vpks(source_dir, &mut sources)?;
    sources.sort();

    let mut by_name = HashMap::new();
    for source in sources {
        let Some(file_name) = source.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if !wanted.contains(file_name) {
            continue;
        }
        let file_name = file_name.to_string();
        if by_name.insert(file_name.clone(), source).is_some() {
            return Err(VpkManagerError::Invalid(format!(
                "Multiple VPK files named {file_name} were found in {}",
                source_dir.display()
            )));
        }
    }

    fs::create_dir_all(destination_dir)?;

    let mut copied = Vec::new();
    for original_name in original_names {
        let prefixed_name = format!("{mod_id}_{original_name}");
        let status = match by_name.get(original_name) {
            None => PrefixedVpkCopyStatus::MissingSource,
            Some(source) => match copy_prefixed_vpk(source, destination_dir, mod_id, original_name)
            {
                Ok(_) => PrefixedVpkCopyStatus::Copied,
                Err(VpkManagerError::Io(error)) if error.kind() == io::ErrorKind::AlreadyExists => {
                    PrefixedVpkCopyStatus::AlreadyExists
                }
                Err(error) => return Err(error),
            },
        };
        copied.push(PrefixedVpkCopy {
            original_name: original_name.clone(),
            prefixed_name,
            status,
        });
    }

    Ok(copied)
}

fn copy_prefixed_vpk(
    source: &Path,
    destination_dir: &Path,
    mod_id: &str,
    original_name: &str,
) -> Result<String> {
    validate_path_component("mod id", mod_id)?;
    validate_original_vpk_name(original_name)?;

    let prefixed_name = format!("{mod_id}_{original_name}");
    let destination = destination_dir.join(&prefixed_name);
    copy_into_new_file(source, &destination).map_err(VpkManagerError::Io)?;

    // Stamp on the way in: from here on this file is identifiable no matter
    // what it is later renamed to.
    if let Err(error) = fingerprint::stamp(&destination, mod_id, original_name) {
        log::warn!(
            "Copied {prefixed_name} but could not fingerprint it ({error}); the background backfill will retry"
        );
    }

    log::info!(
        "Copied VPK with prefix: {} -> {prefixed_name}",
        source.display()
    );
    Ok(prefixed_name)
}

fn validate_path_component(label: &str, value: &str) -> Result<()> {
    if value.is_empty()
        || value.contains('/')
        || value.contains('\\')
        || Path::new(value).is_absolute()
        || Path::new(value).file_name().and_then(|name| name.to_str()) != Some(value)
    {
        return Err(VpkManagerError::Invalid(format!(
            "Invalid {label} path component: {value}"
        )));
    }
    Ok(())
}

fn validate_original_vpk_name(original_name: &str) -> Result<()> {
    validate_path_component("VPK filename", original_name)?;
    if !original_name.to_lowercase().ends_with(".vpk") {
        return Err(VpkManagerError::Invalid(format!(
            "Invalid VPK filename: {original_name}"
        )));
    }
    Ok(())
}

/// Copy `source` to `destination`, claiming the name with `create_new` so an
/// existing VPK is never overwritten, and leaving nothing behind if the copy
/// itself fails.
fn copy_into_new_file(source: &Path, destination: &Path) -> io::Result<()> {
    let mut target = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)?;

    let written = File::open(source)
        .and_then(|mut source| io::copy(&mut source, &mut target))
        .and_then(|_| target.sync_all());
    if written.is_err() {
        drop(target);
        let _ = fs::remove_file(destination);
    }
    written
}

/// Find all VPK files with a specific mod ID prefix in `addons_path`.
pub fn find_prefixed_vpks(addons_path: &Path, mod_id: &str) -> Result<Vec<String>> {
    let mut prefixed = Vec::new();
    if !addons_path.exists() {
        return Ok(prefixed);
    }

    let prefix = format!("{mod_id}_");
    for entry in fs::read_dir(addons_path)? {
        let path = entry?.path();
        if path.is_file()
            && path.extension().is_some_and(|ext| ext == "vpk")
            && let Some(file_name) = path.file_name().and_then(|name| name.to_str())
            && file_name.starts_with(&prefix)
        {
            prefixed.push(file_name.to_string());
        }
    }

    prefixed.sort();
    Ok(prefixed)
}

pub fn delete_unmanaged_vpk(base: &ProfileBase, shard: ShardIndex, filename: &str) -> Result<()> {
    validate_original_vpk_name(filename)?;

    let shard_dir = base.shard_dir(shard);
    let path = shard_dir.join(filename);
    let shard_dir = shard_dir.canonicalize()?;
    let path = path
        .canonicalize()
        .map_err(|_| VpkManagerError::NotFound(filename.to_string()))?;
    if !path.starts_with(&shard_dir) {
        return Err(VpkManagerError::Invalid(format!(
            "VPK file must stay inside profile shard: {}",
            path.display()
        )));
    }

    let ledger = ProfileLedger::load(base)?;
    let is_managed = ledger.mods.values().any(|entry| {
        entry.file_paths(base).into_iter().any(|candidate| {
            candidate
                .canonicalize()
                .is_ok_and(|candidate| candidate == path)
        })
    });
    if is_managed {
        return Err(VpkManagerError::Invalid(format!(
            "Cannot delete managed VPK as an unmatched file: {filename}"
        )));
    }

    // A file that cannot be read as a VPK carries no identity to protect, and
    // refusing here would leave a corrupt stray with no way to remove it.
    match fingerprint::read(&path) {
        Ok(Some(_)) => {
            return Err(VpkManagerError::Invalid(format!(
                "Cannot delete fingerprinted VPK as an unmatched file: {filename}"
            )));
        }
        Ok(None) => {}
        Err(error) => log::warn!("Could not read a fingerprint from {filename}: {error}"),
    }

    let label = path.display().to_string();
    fs_retry::retry_file_operation("remove", &label, || fs::remove_file(&path))
        .map_err(|error| fs_retry::map_file_lock_error("remove", &label, error))?;
    Ok(())
}

/// Every `.vpk` under `dir`, recursively.
///
/// Extracted archives are untrusted input, so symlinks are not followed: one
/// pointing at an ancestor would recurse until the stack gave out.
fn collect_vpks(dir: &Path, found: &mut Vec<PathBuf>) -> Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let path = entry.path();
        if file_type.is_dir() {
            collect_vpks(&path, found)?;
        } else if file_type.is_file() && path.extension().is_some_and(|ext| ext == "vpk") {
            found.push(path);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::super::test_support::{profile, real_vpk};
    use super::*;

    /// A downloaded mod is fingerprinted as it is copied into the profile, so it
    /// is identifiable before it has ever been enabled.
    #[test]
    fn copying_a_mod_into_a_profile_fingerprints_it() {
        let temp = tempfile::tempdir().unwrap();
        let extracted = temp.path().join("extracted");
        fs::create_dir_all(extracted.join("nested")).unwrap();
        real_vpk(&extracted.join("first.vpk"));
        real_vpk(&extracted.join("nested").join("second.vpk"));
        let base = profile(&temp);

        let copied = copy_vpks_with_prefix(&extracted, &base, "650634", None).unwrap();

        assert_eq!(
            copied,
            vec![
                "650634_first.vpk".to_string(),
                "650634_second.vpk".to_string()
            ]
        );
        let stamp = fingerprint::read(&base.join("650634_first.vpk"))
            .unwrap()
            .unwrap();
        assert_eq!(stamp.mod_id, "650634");
        assert_eq!(stamp.original_name, "first.vpk");
    }

    /// Only the files the user picked in the file tree are installed.
    #[test]
    fn copying_honours_a_selection() {
        let temp = tempfile::tempdir().unwrap();
        let extracted = temp.path().join("extracted");
        fs::create_dir_all(extracted.join("nested")).unwrap();
        real_vpk(&extracted.join("first.vpk"));
        real_vpk(&extracted.join("nested").join("second.vpk"));
        let base = profile(&temp);

        let copied = copy_vpks_with_prefix(
            &extracted,
            &base,
            "650634",
            Some(&["nested/second.vpk".to_string()]),
        )
        .unwrap();

        assert_eq!(copied, vec!["650634_second.vpk".to_string()]);
        assert!(!base.join("650634_first.vpk").exists());
    }

    #[test]
    fn copying_named_vpks_skips_existing_prefixed_files() {
        let temp = tempfile::tempdir().unwrap();
        let extracted = temp.path().join("extracted");
        fs::create_dir_all(&extracted).unwrap();
        real_vpk(&extracted.join("first.vpk"));
        real_vpk(&extracted.join("second.vpk"));
        let base = profile(&temp);
        super::super::test_support::write_vpk(&base, "650634_first.vpk");

        let copied = copy_named_vpks_with_prefix(
            &extracted,
            &base,
            "650634",
            &["first.vpk".to_string(), "second.vpk".to_string()],
        )
        .unwrap();

        assert_eq!(
            copied,
            vec![
                PrefixedVpkCopy {
                    original_name: "first.vpk".to_string(),
                    prefixed_name: "650634_first.vpk".to_string(),
                    status: PrefixedVpkCopyStatus::AlreadyExists,
                },
                PrefixedVpkCopy {
                    original_name: "second.vpk".to_string(),
                    prefixed_name: "650634_second.vpk".to_string(),
                    status: PrefixedVpkCopyStatus::Copied,
                },
            ]
        );
        assert_eq!(
            fs::read(base.join("650634_first.vpk")).unwrap(),
            b"test vpk"
        );
        assert!(
            fingerprint::read(&base.join("650634_second.vpk"))
                .unwrap()
                .is_some()
        );
    }

    #[test]
    fn copying_named_vpks_ignores_duplicate_unrequested_names() {
        let temp = tempfile::tempdir().unwrap();
        let extracted = temp.path().join("extracted");
        fs::create_dir_all(extracted.join("nested")).unwrap();
        real_vpk(&extracted.join("keep.vpk"));
        real_vpk(&extracted.join("ignored.vpk"));
        real_vpk(&extracted.join("nested").join("ignored.vpk"));
        let base = profile(&temp);

        let copied =
            copy_named_vpks_with_prefix(&extracted, &base, "650634", &["keep.vpk".to_string()])
                .unwrap();

        assert_eq!(copied.len(), 1);
        assert_eq!(copied[0].prefixed_name, "650634_keep.vpk");
    }

    #[test]
    fn copying_named_vpks_rejects_duplicate_requested_names() {
        let temp = tempfile::tempdir().unwrap();
        let extracted = temp.path().join("extracted");
        fs::create_dir_all(&extracted).unwrap();
        real_vpk(&extracted.join("first.vpk"));
        let base = profile(&temp);

        let error = copy_named_vpks_with_prefix(
            &extracted,
            &base,
            "650634",
            &["first.vpk".to_string(), "first.vpk".to_string()],
        )
        .unwrap_err();

        assert!(matches!(error, VpkManagerError::Invalid(_)));
    }

    #[test]
    fn copying_named_vpks_rejects_path_components() {
        let temp = tempfile::tempdir().unwrap();
        let extracted = temp.path().join("extracted");
        fs::create_dir_all(&extracted).unwrap();
        let base = profile(&temp);

        let error = copy_named_vpks_with_prefix(
            &extracted,
            &base,
            "650634",
            &["../escape.vpk".to_string()],
        )
        .unwrap_err();

        assert!(matches!(error, VpkManagerError::Invalid(_)));
    }

    #[test]
    fn copying_named_vpks_reports_missing_sources() {
        let temp = tempfile::tempdir().unwrap();
        let extracted = temp.path().join("extracted");
        fs::create_dir_all(&extracted).unwrap();
        let base = profile(&temp);

        let copied =
            copy_named_vpks_with_prefix(&extracted, &base, "650634", &["missing.vpk".to_string()])
                .unwrap();

        assert_eq!(
            copied,
            vec![PrefixedVpkCopy {
                original_name: "missing.vpk".to_string(),
                prefixed_name: "650634_missing.vpk".to_string(),
                status: PrefixedVpkCopyStatus::MissingSource,
            }]
        );
    }

    #[test]
    fn unmanaged_vpk_delete_goes_through_profile_boundary_checks() {
        let temp = tempfile::tempdir().unwrap();
        let base = profile(&temp);
        real_vpk(&base.join("stray.vpk"));

        delete_unmanaged_vpk(&base, ShardIndex::FIRST, "stray.vpk").unwrap();

        assert!(!base.join("stray.vpk").exists());
    }

    #[test]
    fn unmanaged_vpk_delete_rejects_fingerprinted_vpks() {
        let temp = tempfile::tempdir().unwrap();
        let base = profile(&temp);
        let path = base.join("stray.vpk");
        real_vpk(&path);
        fingerprint::stamp(&path, "650634", "stray.vpk").unwrap();

        let error = delete_unmanaged_vpk(&base, ShardIndex::FIRST, "stray.vpk").unwrap_err();

        assert!(matches!(error, VpkManagerError::Invalid(_)));
        assert!(path.exists());
    }

    /// A truncated download is unreadable as a VPK, so it carries no identity
    /// worth protecting — and refusing would leave the user unable to remove it.
    #[test]
    fn unmanaged_vpk_delete_removes_a_file_that_is_not_a_vpk() {
        let temp = tempfile::tempdir().unwrap();
        let base = profile(&temp);
        fs::write(base.join("truncated.vpk"), b"not a vpk at all").unwrap();

        delete_unmanaged_vpk(&base, ShardIndex::FIRST, "truncated.vpk").unwrap();

        assert!(!base.join("truncated.vpk").exists());
    }

    #[test]
    fn unmanaged_vpk_delete_rejects_managed_enabled_vpks() {
        let temp = tempfile::tempdir().unwrap();
        let base = profile(&temp);
        super::super::test_support::write_vpk(&base, "pak01_dir.vpk");
        let mut ledger = ProfileLedger::default();
        ledger.mark_enabled(
            "650634",
            vec!["pak01_dir.vpk".to_string()],
            vec!["cool_mod.vpk".to_string()],
            Some(0),
            ShardIndex::FIRST,
        );
        ledger.save(&base).unwrap();

        let error = delete_unmanaged_vpk(&base, ShardIndex::FIRST, "pak01_dir.vpk").unwrap_err();

        assert!(matches!(error, VpkManagerError::Invalid(_)));
        assert!(base.join("pak01_dir.vpk").exists());
    }

    #[test]
    fn prefixed_vpks_of_other_mods_are_not_returned() {
        let temp = tempfile::tempdir().unwrap();
        let base = profile(&temp);
        super::super::test_support::write_vpk(&base, "650634_a.vpk");
        super::super::test_support::write_vpk(&base, "650635_b.vpk");
        super::super::test_support::write_vpk(&base, "pak01_dir.vpk");

        assert_eq!(
            find_prefixed_vpks(&base, "650634").unwrap(),
            vec!["650634_a.vpk".to_string()]
        );
    }
}
