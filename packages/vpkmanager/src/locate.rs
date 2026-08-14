//! Finding the VPKs that belong to a mod.
//!
//! Several features need this and none of them should work it out for
//! themselves: hero detection reads a mod's models, the analyzer inspects its
//! contents, the UI reports what is installed. Doing it by filename in each
//! place is what let those features disagree with each other — and with the
//! folder — as soon as a file was renamed.
//!
//! The answer comes from three sources, most trustworthy first: the fingerprints
//! the ledger has on file, the mod entry's recorded filenames, and finally the
//! `{mod_id}_` naming convention for files nothing has caught up with yet.

use std::collections::BTreeSet;
use std::path::PathBuf;

use crate::error::Result;
use crate::ledger::ProfileLedger;
use crate::profile::ProfileBase;
use crate::scan::scan_profile;

/// Every VPK belonging to `mod_id` in this profile, wherever it currently is,
/// enabled or not.
///
/// Reads only; nothing is repaired. Callers that want the ledger corrected
/// should reconcile first.
pub fn mod_vpks(base: &ProfileBase, mod_id: &str) -> Result<Vec<PathBuf>> {
    let mut found: BTreeSet<PathBuf> = BTreeSet::new();
    let ledger = ProfileLedger::load(base.path())?;

    // Fingerprinted files know which mod they are, whatever they are called.
    for (_, tracked) in ledger.tracked_for_mod(mod_id) {
        let path = tracked.path(base);
        if path.is_file() {
            found.insert(path);
        }
    }

    // Files the ledger names but has not fingerprinted yet.
    if let Some(entry) = ledger.mods.get(mod_id) {
        found.extend(
            entry
                .file_paths(base)
                .into_iter()
                .filter(|path| path.is_file()),
        );
    }

    // And anything the naming convention claims, which covers files that landed
    // in the folder since the last reconciliation.
    for file in scan_profile(base)? {
        if file.named_mod_id() == Some(mod_id) {
            found.insert(file.path);
        }
    }

    Ok(found.into_iter().collect())
}

/// Every VPK belonging to `mod_id` across every profile of a game install.
///
/// `addons_root` is the `citadel/addons` directory; the default profile and each
/// named profile inside it are searched.
pub fn mod_vpks_in_all_profiles(addons_root: &std::path::Path, mod_id: &str) -> Vec<PathBuf> {
    let mut found: BTreeSet<PathBuf> = BTreeSet::new();
    for base in crate::profile::profiles_in(addons_root) {
        match mod_vpks(&base, mod_id) {
            Ok(paths) => found.extend(paths),
            Err(error) => log::warn!(
                "Could not list the VPKs of mod {mod_id} in {}: {error}",
                base.path().display()
            ),
        }
    }
    found.into_iter().collect()
}

/// Every VPK under `dir`, recursively, sorted.
///
/// For directories outside a profile — a mod's download folder, an extracted
/// archive — where there is no shard layout to respect.
pub fn vpks_under(dir: &std::path::Path) -> Vec<PathBuf> {
    let mut found = Vec::new();
    collect(dir, &mut found);
    found.sort();
    found
}

fn collect(dir: &std::path::Path, found: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.filter_map(|entry| entry.ok()) {
        let path = entry.path();
        if path.is_dir() {
            collect(&path, found);
        } else if path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| {
                name.to_ascii_lowercase().ends_with(".vpk")
                    && !crate::profile::is_internal_artifact(name)
            })
        {
            found.push(path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fingerprint;
    use crate::profile::ShardIndex;
    use std::fs;

    fn base(temp: &tempfile::TempDir, profile: Option<&str>) -> ProfileBase {
        let mut path = temp.path().join("citadel").join("addons");
        if let Some(profile) = profile {
            path = path.join(profile);
        }
        fs::create_dir_all(&path).unwrap();
        ProfileBase::new(path).unwrap()
    }

    fn vpk(path: &std::path::Path) {
        let source = path.with_extension("src");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("a.txt"), path.to_string_lossy().as_bytes()).unwrap();
        crate::pack::pack_directory(&source, path).unwrap();
        fs::remove_dir_all(&source).unwrap();
    }

    /// The case filename matching gets wrong: the file was renamed, so only its
    /// fingerprint can still connect it to the mod.
    #[test]
    fn a_renamed_file_is_still_found_for_its_mod() {
        let temp = tempfile::tempdir().unwrap();
        let base = base(&temp, None);
        let path = base.join("pak01_dir.vpk");
        vpk(&path);
        fingerprint::stamp(&path, "650634", "cool_mod.vpk").unwrap();
        crate::reconcile::sync_profile(&base, crate::reconcile::Trust::Stat).unwrap();

        fs::rename(&path, base.join("pak44_dir.vpk")).unwrap();
        crate::reconcile::sync_profile(&base, crate::reconcile::Trust::Stat).unwrap();

        assert_eq!(
            mod_vpks(&base, "650634").unwrap(),
            vec![base.join("pak44_dir.vpk")]
        );
    }

    /// Enabled and disabled files, in whatever shard, all belong to the mod.
    #[test]
    fn enabled_and_disabled_files_are_both_returned() {
        let temp = tempfile::tempdir().unwrap();
        let base = base(&temp, None);
        let shard_two = base.shard_dir(ShardIndex::new(2).unwrap());
        fs::create_dir_all(&shard_two).unwrap();
        let enabled = shard_two.join("pak01_dir.vpk");
        vpk(&enabled);
        fingerprint::stamp(&enabled, "650634", "cool_mod.vpk").unwrap();
        let disabled = base.join("650634_spare.vpk");
        vpk(&disabled);
        crate::reconcile::sync_profile(&base, crate::reconcile::Trust::Stat).unwrap();

        assert_eq!(mod_vpks(&base, "650634").unwrap(), vec![disabled, enabled]);
    }

    /// A file dropped in by hand, before anything has reconciled, is still
    /// attributed by its prefix.
    #[test]
    fn an_unreconciled_prefixed_file_is_found() {
        let temp = tempfile::tempdir().unwrap();
        let base = base(&temp, None);
        let dropped = base.join("650634_dropped.vpk");
        vpk(&dropped);

        assert_eq!(mod_vpks(&base, "650634").unwrap(), vec![dropped]);
    }

    #[test]
    fn every_profile_of_an_install_is_searched() {
        let temp = tempfile::tempdir().unwrap();
        let default = base(&temp, None);
        let named = base(&temp, Some("profile_x"));
        let in_default = default.join("650634_a.vpk");
        let in_named = named.join("650634_b.vpk");
        vpk(&in_default);
        vpk(&in_named);

        let found = mod_vpks_in_all_profiles(default.path(), "650634");

        assert!(found.contains(&in_default), "{found:?}");
        assert!(found.contains(&in_named), "{found:?}");
    }

    #[test]
    fn other_mods_files_are_not_returned() {
        let temp = tempfile::tempdir().unwrap();
        let base = base(&temp, None);
        vpk(&base.join("650635_other.vpk"));

        assert!(mod_vpks(&base, "650634").unwrap().is_empty());
    }
}
