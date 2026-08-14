//! Bringing a mod's VPKs into a profile.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use crate::error::Result;
use crate::fingerprint;

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
        let prefixed_name = format!("{mod_id}_{file_name}");
        let destination = destination_dir.join(&prefixed_name);
        fs::copy(&source, &destination)?;

        // Stamp on the way in: from here on this file is identifiable no matter
        // what it is later renamed to.
        if let Err(error) = fingerprint::stamp(&destination, mod_id, file_name) {
            log::warn!(
                "Copied {prefixed_name} but could not fingerprint it ({error}); the background backfill will retry"
            );
        }

        copied.push(prefixed_name.clone());
        log::info!(
            "Copied VPK with prefix: {} -> {prefixed_name}",
            source.display()
        );
    }

    Ok(copied)
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

/// Every `.vpk` under `dir`, recursively.
fn collect_vpks(dir: &Path, found: &mut Vec<PathBuf>) -> Result<()> {
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        if path.is_dir() {
            collect_vpks(&path, found)?;
        } else if path.extension().is_some_and(|ext| ext == "vpk") {
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
