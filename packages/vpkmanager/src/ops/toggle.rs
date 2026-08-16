//! Turning a mod's VPKs on and off, and swapping which variant is on.
//!
//! An enabled VPK is named `pak##_dir.vpk` in a shard directory; a disabled one
//! keeps its shipped name behind a `{mod_id}_` prefix in the profile base. Every
//! function here is one of those two renamings, done so that a failure part way
//! through puts every file back.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use super::{MissingVpkPolicy, SwapRequest};
use crate::error::{Result, VpkManagerError};
use crate::fingerprint;
use crate::fs_retry;
use crate::naming;
use crate::profile::{CLEAR_STAGING_DIR, ProfileBase, SHARD_CAPACITY};
use crate::staging::{PendingVpkOperation, RenameTransaction, VpkSnapshot, VpkStaging};

/// Enable VPKs, taking the prefixed sources from `disabled_dir` (always the
/// profile base) and writing the enabled `pak##_dir.vpk` into `enabled_dir`
/// (the target shard directory). The two are equal for shard 1.
pub fn enable_vpks_in(
    disabled_dir: &Path,
    enabled_dir: &Path,
    mod_id: &str,
    prefixed_vpks: &[String],
) -> Result<Vec<String>> {
    if prefixed_vpks.is_empty() {
        return Ok(Vec::new());
    }

    // Reject any missing source before touching the filesystem so a mod can
    // never be left partially enabled with silently dropped VPKs.
    let missing: Vec<String> = prefixed_vpks
        .iter()
        .filter(|name| !disabled_dir.join(name).exists())
        .cloned()
        .collect();
    if !missing.is_empty() {
        return Err(VpkManagerError::Vpk(format!(
            "Cannot enable mod {mod_id} because source VPK files are missing: {}",
            missing.join(", ")
        )));
    }

    if enabled_dir != disabled_dir {
        fs::create_dir_all(enabled_dir)?;
    }

    let source_count = prefixed_vpks.len() as u32;
    let used = naming::count_enabled_vpks(enabled_dir);
    if used + source_count > SHARD_CAPACITY {
        return Err(VpkManagerError::Vpk(format!(
            "Enabling mod {mod_id} would exceed the {SHARD_CAPACITY} VPK files allowed in one addon folder"
        )));
    }

    // Track successful renames (enabled path, original prefixed path) for rollback.
    let mut renamed = RenameTransaction::new();
    let mut new_names = Vec::new();

    for prefixed_name in prefixed_vpks {
        let old_path = disabled_dir.join(prefixed_name);
        let new_name = naming::next_free_enabled_vpk_name(enabled_dir)?;
        let new_path = enabled_dir.join(&new_name);

        if let Err(e) = fs_retry::retry_file_operation("rename", prefixed_name, || {
            fs::rename(&old_path, &new_path)
        }) {
            log::error!(
                "Failed to enable VPK {prefixed_name}: {e}, rolling back {count} already-renamed file(s)",
                count = renamed.len()
            );
            return Err(renamed.rollback(fs_retry::map_file_lock_error(
                "enable",
                prefixed_name,
                e,
            )));
        }

        renamed.record(new_path, old_path);
        new_names.push(new_name.clone());
        log::info!("Enabled VPK for mod {mod_id}: {prefixed_name} -> {new_name}");
    }

    renamed.commit();
    Ok(new_names)
}

/// Disable VPKs, reading the enabled `pak##_dir.vpk` from `enabled_dir` (the
/// mod's current shard) and writing the prefixed `{mod_id}_*.vpk` results into
/// `disabled_dir` (always the profile base). The two are equal for shard 1.
pub fn disable_vpks_in(
    enabled_dir: &Path,
    disabled_dir: &Path,
    mod_id: &str,
    installed_vpks: &[String],
    original_names: &[String],
    missing_policy: MissingVpkPolicy,
) -> Result<Vec<String>> {
    if installed_vpks.is_empty() {
        return Ok(Vec::new());
    }

    if original_names.len() != installed_vpks.len() {
        return Err(VpkManagerError::Vpk(format!(
            "Cannot disable mod because original VPK name count ({}) does not match installed VPK count ({})",
            original_names.len(),
            installed_vpks.len()
        )));
    }

    let missing_vpks: Vec<String> = installed_vpks
        .iter()
        .map(|vpk_name| naming::file_name_of(vpk_name))
        .filter(|vpk_name| !enabled_dir.join(vpk_name).exists())
        .collect();

    if !missing_vpks.is_empty() {
        match missing_policy {
            MissingVpkPolicy::Strict => {
                return Err(VpkManagerError::Vpk(format!(
                    "Cannot disable mod because enabled VPK files are missing: {}",
                    missing_vpks.join(", ")
                )));
            }
            MissingVpkPolicy::Reconcile => {
                if missing_vpks.len() == installed_vpks.len() {
                    log::warn!(
                        "Mod {mod_id} is marked enabled but none of its enabled VPK files exist; marking it disabled without renaming files"
                    );
                    return Ok(Vec::new());
                }

                log::warn!(
                    "Mod {mod_id} is missing some enabled VPK files; disabling only the files that still exist"
                );
            }
        }
    }

    let vpk_pairs: Vec<(String, String)> = installed_vpks
        .iter()
        .zip(original_names.iter())
        .map(|(installed_vpk, original_name)| {
            (naming::file_name_of(installed_vpk), original_name.clone())
        })
        .filter(|(vpk_name, _)| match missing_policy {
            MissingVpkPolicy::Strict => true,
            MissingVpkPolicy::Reconcile => {
                let exists = enabled_dir.join(vpk_name).exists();
                if !exists {
                    log::warn!("Enabled VPK file missing during disable: {vpk_name}");
                }
                exists
            }
        })
        .collect();

    if vpk_pairs.is_empty() {
        return Ok(Vec::new());
    }

    if enabled_dir != disabled_dir {
        fs::create_dir_all(disabled_dir)?;
    }

    // Track successful renames (prefixed path, original enabled path) for rollback.
    let mut renamed = RenameTransaction::new();
    let mut prefixed_out = Vec::new();

    for (vpk_name, original_name) in vpk_pairs {
        let old_path = enabled_dir.join(&vpk_name);
        let prefixed_name = format!("{mod_id}_{original_name}");
        let new_path = disabled_dir.join(&prefixed_name);

        if new_path.exists() {
            log::info!(
                "Prefixed destination already exists (newly staged variant), removing old active VPK: {vpk_name}"
            );
            if let Err(e) =
                fs_retry::retry_file_operation("remove", &vpk_name, || fs::remove_file(&old_path))
            {
                log::error!(
                    "Failed to remove old active VPK {vpk_name}: {e}, rolling back {count} already-renamed file(s)",
                    count = renamed.len()
                );
                return Err(
                    renamed.rollback(fs_retry::map_file_lock_error("disable", &vpk_name, e))
                );
            }
            // This was a deletion, not a rename: `new_path` already existed and is
            // not something we can restore, so it must not enter the rollback list.
            // Rolling it back would move the pre-existing staged variant into the
            // active slot and corrupt state.
        } else {
            if let Err(e) = fs_retry::retry_file_operation("rename", &vpk_name, || {
                fs::rename(&old_path, &new_path)
            }) {
                log::error!(
                    "Failed to disable VPK {vpk_name}: {e}, rolling back {count} already-renamed file(s)",
                    count = renamed.len()
                );
                return Err(
                    renamed.rollback(fs_retry::map_file_lock_error("disable", &vpk_name, e))
                );
            }
            renamed.record(new_path, old_path);
        }

        prefixed_out.push(prefixed_name.clone());
        log::info!("Disabled VPK for mod {mod_id}: {vpk_name} -> {prefixed_name}");
    }

    renamed.commit();
    Ok(prefixed_out)
}

/// Move every VPK in every shard aside, ready to be deleted on commit.
pub fn stage_clear_all_vpks(addons_path: &Path) -> Result<PendingVpkOperation<()>> {
    let base = ProfileBase::new(addons_path)?;

    let mut sources = Vec::new();
    for (_, dir) in base.existing_shards() {
        sources.extend(vpks_directly_in(&dir)?);
    }

    let mut staging = VpkStaging::claim(&base, CLEAR_STAGING_DIR)?;
    for source in sources {
        if let Err(error) = staging.stage(&base, &source) {
            return Err(staging.rollback(error));
        }
    }

    super::prune_empty_shard_dirs(&base);
    Ok(PendingVpkOperation::with_staging((), staging))
}

/// Swap which of a mod's variants is enabled, in one reversible step.
pub fn stage_enabled_vpk_swap(
    request: SwapRequest<'_>,
) -> Result<PendingVpkOperation<Vec<String>>> {
    if !request.base.exists() {
        return Err(VpkManagerError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Addons path not found: {:?}", request.base.path()),
        )));
    }

    log::info!(
        "Swapping enabled VPKs for mod {}: {} currently enabled -> {} newly selected",
        request.mod_id,
        request.current_installed_vpks.len(),
        request.selected_original_names.len()
    );
    let unique_selection: HashSet<&String> = request.selected_original_names.iter().collect();
    if unique_selection.len() != request.selected_original_names.len() {
        return Err(VpkManagerError::Invalid(
            "Selected VPK filenames must be unique".to_string(),
        ));
    }

    let mut snapshot = VpkSnapshot::new()?;
    match swap_inner(&request, &mut snapshot) {
        Ok(installed) => Ok(PendingVpkOperation::with_snapshot(installed, snapshot)),
        Err(error) => Err(snapshot.rollback(error)),
    }
}

/// Disable the mod's current variant and enable the selected one, recording
/// every file it touches in `snapshot`. Uses `?` throughout; the caller turns
/// any early return into a full restore.
fn swap_inner(request: &SwapRequest<'_>, snapshot: &mut VpkSnapshot) -> Result<Vec<String>> {
    let current_enabled_dir = request.base.shard_dir(request.current_shard);
    let target_enabled_dir = request.base.shard_dir(request.target_shard);

    for current_vpk in request.current_installed_vpks {
        let source = current_enabled_dir.join(naming::file_name_of(current_vpk));
        if !source.is_file() {
            return Err(VpkManagerError::NotFound(source.display().to_string()));
        }
        snapshot.capture(&source)?;
    }
    for prefixed in super::find_prefixed_vpks(request.base, request.mod_id)? {
        snapshot.capture(&request.base.join(prefixed))?;
    }
    // The disabled copies this swap is about to write do not exist yet.
    for original in request.current_original_names {
        snapshot.track(request.base.join(format!("{}_{original}", request.mod_id)));
    }

    if !request.current_installed_vpks.is_empty() {
        disable_vpks_in(
            &current_enabled_dir,
            request.base,
            request.mod_id,
            request.current_installed_vpks,
            request.current_original_names,
            MissingVpkPolicy::Strict,
        )?;
    }

    let prefixed_to_enable: Vec<String> = request
        .selected_original_names
        .iter()
        .map(|name| format!("{}_{name}", request.mod_id))
        .collect();
    if let Some(missing) = prefixed_to_enable
        .iter()
        .find(|prefixed| !request.base.join(prefixed).exists())
    {
        return Err(VpkManagerError::NotFound(missing.clone()));
    }

    let installed = enable_vpks_in(
        request.base,
        &target_enabled_dir,
        request.mod_id,
        &prefixed_to_enable,
    )?;
    for vpk in &installed {
        snapshot.track(target_enabled_dir.join(naming::file_name_of(vpk)));
    }
    Ok(installed)
}

/// Replace a mod's VPK files with new ones, in place.
///
/// Handles both enabled (`pak##_dir.vpk`) and disabled (`{mod_id}_*.vpk`) mods.
pub fn replace_vpks(
    addons_path: &Path,
    enabled_dir: &Path,
    mod_id: &str,
    source_vpk_paths: &[PathBuf],
    installed_vpks: &[String],
) -> Result<()> {
    if source_vpk_paths.is_empty() {
        return Err(VpkManagerError::Invalid(
            "No VPK files provided for replacement".into(),
        ));
    }

    if !addons_path.exists() {
        return Err(VpkManagerError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Addons path not found: {addons_path:?}"),
        )));
    }

    log::info!(
        "Replacing {} VPK file(s) for mod {mod_id}",
        source_vpk_paths.len()
    );

    // A mod with installed VPKs is enabled; otherwise its files are parked under
    // the prefix.
    let (destinations, label): (Vec<PathBuf>, &str) = if !installed_vpks.is_empty() {
        if source_vpk_paths.len() != installed_vpks.len() {
            return Err(VpkManagerError::Invalid(format!(
                "Replacement VPK count ({}) does not match installed VPK count ({})",
                source_vpk_paths.len(),
                installed_vpks.len()
            )));
        }
        (
            installed_vpks
                .iter()
                .map(|vpk| enabled_dir.join(naming::file_name_of(vpk)))
                .collect(),
            "enabled",
        )
    } else {
        let prefixed_vpks = super::find_prefixed_vpks(addons_path, mod_id)?;
        if prefixed_vpks.is_empty() {
            return Err(VpkManagerError::NotFound(format!(
                "no {mod_id}_*.vpk files in {}",
                addons_path.display()
            )));
        }
        if source_vpk_paths.len() != prefixed_vpks.len() {
            return Err(VpkManagerError::Invalid(format!(
                "Replacement VPK count ({}) does not match mod VPK count ({})",
                source_vpk_paths.len(),
                prefixed_vpks.len()
            )));
        }
        (
            prefixed_vpks
                .iter()
                .map(|vpk| addons_path.join(vpk))
                .collect(),
            "disabled",
        )
    };

    for (source, destination) in source_vpk_paths.iter().zip(destinations.iter()) {
        if !destination.exists() {
            log::warn!("VPK to replace not found: {}", destination.display());
            continue;
        }
        fs::copy(source, destination)?;

        // The replacement is different bytes in the same slot, so the old
        // fingerprint no longer describes it.
        let original_name = source
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_default();
        if let Err(error) = fingerprint::stamp(destination, mod_id, &original_name) {
            log::warn!(
                "Replaced {} but could not re-fingerprint it: {error}",
                destination.display()
            );
        }
        log::info!(
            "Replaced {label} VPK: {} with {original_name}",
            destination.display()
        );
    }

    log::info!("VPK replacement completed successfully for mod {mod_id}");
    Ok(())
}

/// Every `.vpk` directly inside `dir`, sorted.
fn vpks_directly_in(dir: &Path) -> Result<Vec<PathBuf>> {
    let mut files = Vec::new();
    if !dir.exists() {
        return Ok(files);
    }
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        if path.is_file() && path.extension().is_some_and(|ext| ext == "vpk") {
            files.push(path);
        }
    }
    files.sort();
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::super::test_support::{addons_base, profile, write_vpk};
    use super::*;
    use crate::profile::ShardIndex;

    #[test]
    fn disable_errors_when_enabled_vpk_is_missing() {
        let temp = tempfile::tempdir().unwrap();

        let err = disable_vpks_in(
            temp.path(),
            temp.path(),
            "123456",
            &["pak01_dir.vpk".to_string()],
            &["original.vpk".to_string()],
            MissingVpkPolicy::Strict,
        )
        .unwrap_err();

        assert!(err.to_string().contains("enabled VPK files are missing"));
    }

    #[test]
    fn disable_errors_when_original_name_count_does_not_match() {
        let temp = tempfile::tempdir().unwrap();
        write_vpk(temp.path(), "pak01_dir.vpk");
        write_vpk(temp.path(), "pak02_dir.vpk");

        let err = disable_vpks_in(
            temp.path(),
            temp.path(),
            "123456",
            &["pak01_dir.vpk".to_string(), "pak02_dir.vpk".to_string()],
            &["first.vpk".to_string()],
            MissingVpkPolicy::Strict,
        )
        .unwrap_err();

        assert!(
            err.to_string()
                .contains("original VPK name count (1) does not match installed VPK count (2)")
        );
    }

    #[test]
    fn disable_reconciles_when_enabled_vpk_is_missing() {
        let temp = tempfile::tempdir().unwrap();

        let result = disable_vpks_in(
            temp.path(),
            temp.path(),
            "123456",
            &["pak01_dir.vpk".to_string()],
            &["original.vpk".to_string()],
            MissingVpkPolicy::Reconcile,
        )
        .unwrap();

        assert!(result.is_empty());
    }

    #[test]
    fn disable_reconciles_partial_missing() {
        let temp = tempfile::tempdir().unwrap();
        write_vpk(temp.path(), "pak01_dir.vpk");

        let result = disable_vpks_in(
            temp.path(),
            temp.path(),
            "123456",
            &["pak01_dir.vpk".to_string(), "pak02_dir.vpk".to_string()],
            &["first.vpk".to_string(), "second.vpk".to_string()],
            MissingVpkPolicy::Reconcile,
        )
        .unwrap();

        assert_eq!(result, vec!["123456_first.vpk".to_string()]);
        assert!(temp.path().join("123456_first.vpk").exists());
        assert!(!temp.path().join("pak01_dir.vpk").exists());
    }

    /// Fix regression guard: disabling a mod whose prefixed destination already
    /// exists (a newly staged variant) must remove the active copy and keep the
    /// pre-existing variant intact — never clobber it via a bogus rollback rename.
    #[test]
    fn disable_with_existing_prefixed_destination_removes_active_copy() {
        let temp = tempfile::tempdir().unwrap();
        let addons_path = addons_base(&temp);
        let addons_path = addons_path.as_path();
        write_vpk(addons_path, "pak01_dir.vpk"); // active
        write_vpk(addons_path, "123456_original.vpk"); // pre-existing staged variant

        let out = disable_vpks_in(
            addons_path,
            addons_path,
            "123456",
            &["pak01_dir.vpk".to_string()],
            &["original.vpk".to_string()],
            MissingVpkPolicy::Strict,
        )
        .unwrap();

        assert_eq!(out, vec!["123456_original.vpk".to_string()]);
        assert!(!addons_path.join("pak01_dir.vpk").exists()); // active removed
        assert!(addons_path.join("123456_original.vpk").exists()); // preserved
    }

    /// Fix regression guard: enabling must reject a missing source up front
    /// instead of warn-and-skip, so a mod can never be left partially enabled.
    #[test]
    fn enable_rejects_missing_source_before_renaming() {
        let temp = tempfile::tempdir().unwrap();
        let addons_path = addons_base(&temp);
        let addons_path = addons_path.as_path();
        write_vpk(addons_path, "123456_a.vpk"); // 123456_b.vpk is intentionally missing

        let err = enable_vpks_in(
            addons_path,
            addons_path,
            "123456",
            &["123456_a.vpk".to_string(), "123456_b.vpk".to_string()],
        )
        .unwrap_err();

        assert!(err.to_string().contains("source VPK files are missing"));
        // Nothing was renamed: existing source untouched, no pak## created.
        assert!(addons_path.join("123456_a.vpk").exists());
        assert!(!addons_path.join("pak01_dir.vpk").exists());
    }

    /// Disabled copies always live in the profile base, whatever shard the mod is
    /// enabled in — otherwise re-enabling could not find its sources.
    #[test]
    fn enabling_and_disabling_cross_the_shard_boundary() {
        let temp = tempfile::tempdir().unwrap();
        let base = profile(&temp);
        let shard_two = base.shard_dir(ShardIndex::new(2).unwrap());
        write_vpk(&base, "123456_overflow.vpk");

        let enabled = enable_vpks_in(
            &base,
            &shard_two,
            "123456",
            &["123456_overflow.vpk".to_string()],
        )
        .unwrap();

        assert_eq!(enabled, vec!["pak01_dir.vpk".to_string()]);
        assert!(shard_two.join("pak01_dir.vpk").is_file());
        assert!(!base.join("123456_overflow.vpk").exists());

        let disabled = disable_vpks_in(
            &shard_two,
            &base,
            "123456",
            &enabled,
            &["overflow.vpk".to_string()],
            MissingVpkPolicy::Strict,
        )
        .unwrap();

        assert_eq!(disabled, vec!["123456_overflow.vpk".to_string()]);
        assert!(base.join("123456_overflow.vpk").is_file());
        assert!(!shard_two.join("pak01_dir.vpk").exists());
    }

    /// Clearing a profile has to empty every shard, not just the base, or the
    /// engine would keep loading whatever was left behind in `addons2`.
    #[test]
    fn clearing_a_profile_empties_every_shard() {
        let temp = tempfile::tempdir().unwrap();
        let base = profile(&temp);
        let shard_two = base.shard_dir(ShardIndex::new(2).unwrap());
        fs::create_dir_all(&shard_two).unwrap();
        write_vpk(&base, "pak01_dir.vpk");
        write_vpk(&base, "123456_disabled.vpk");
        write_vpk(&shard_two, "pak01_dir.vpk");

        stage_clear_all_vpks(&base).unwrap().commit();

        assert_eq!(naming::count_enabled_vpks(&base), 0);
        assert!(!base.join("123456_disabled.vpk").exists());
        assert!(!shard_two.join("pak01_dir.vpk").exists());
    }
}
