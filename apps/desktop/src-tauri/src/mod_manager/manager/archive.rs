use super::ModManager;
use crate::errors::Error;
use crate::mod_manager::archive_extractor::ArchiveExtractor;
use crate::mod_manager::file_tree::is_plain_vpk_name;
use crate::mod_manager::shard::ProfileBase;
use crate::mod_manager::vpk_manager::VpkManager;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

/// Records placed VPKs in the profile manifest. Callers pass a function that
/// takes the mod manager lock only for this step, not for the copy before it.
pub(crate) type RecordImport<'a> = &'a dyn Fn(&Path, &str, Vec<String>) -> Result<(), Error>;

/// Per-mod lock for archive copies. Every profile shares the mod's `extracted`
/// folders, so two copies of one mod must not run at once. Take it before the
/// mod manager lock, never while holding it: recording takes that lock.
fn mod_copy_lock(mod_id: &str) -> Arc<Mutex<()>> {
  static LOCKS: OnceLock<Mutex<HashMap<String, Arc<Mutex<()>>>>> = OnceLock::new();
  let mut locks = LOCKS
    .get_or_init(Default::default)
    .lock()
    .unwrap_or_else(|poisoned| poisoned.into_inner());
  Arc::clone(locks.entry(mod_id.to_string()).or_default())
}

impl ModManager {
  /// The mod store and validated addons folder an archive copy works with.
  pub(crate) fn archive_copy_paths(
    &self,
    profile_folder: Option<&str>,
  ) -> Result<(PathBuf, ProfileBase), Error> {
    let destination = self.get_addons_path(profile_folder)?;
    Ok((self.get_mods_store_path()?, destination))
  }

  pub(crate) fn copy_selected_vpks_from(
    mods_path: &Path,
    destination_path: &Path,
    mod_id: &str,
    file_tree: &crate::mod_manager::file_tree::ModFileTree,
    record: RecordImport,
  ) -> Result<(), Error> {
    ModManager::ensure_safe_mod_id(mod_id)?;
    let lock = mod_copy_lock(mod_id);
    let _guard = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let mod_dir = mods_path.join(mod_id);

    let extracted_dir = mod_dir.join("extracted");

    if !extracted_dir.exists() {
      log::warn!("Extracted directory not found, falling back to archive extraction");

      let extractor = ArchiveExtractor::new();
      let mut archive_path: Option<PathBuf> = None;

      if mod_dir.exists() {
        for entry in std::fs::read_dir(&mod_dir)? {
          let entry = entry?;
          let path = entry.path();
          if extractor.is_supported_archive(&path) {
            archive_path = Some(path);
            break;
          }
        }
      }

      let Some(archive_path) = archive_path else {
        // A first install deletes the archive after placing the selected VPKs
        // under this mod's prefix. Re-enabling it finds them already there.
        if !selection_already_placed(destination_path, mod_id, file_tree)? {
          return Err(Error::ModFileNotFound);
        }
        log::info!("Selected VPKs for mod {mod_id} are already placed; nothing to copy");
        return Ok(());
      };

      log::info!("Extracting archive: {archive_path:?}");
      // An existing `extracted` folder is reused as complete, so extract beside
      // it and move it into place only once the whole archive is out.
      let staging_dir = mod_dir.join("extracted.partial");
      if staging_dir.exists() {
        std::fs::remove_dir_all(&staging_dir)?;
      }
      extractor.extract_archive(&archive_path, &staging_dir)?;
      std::fs::rename(&staging_dir, &extracted_dir)?;
    } else {
      log::info!("Using already-extracted directory: {extracted_dir:?}");
    }

    if !destination_path.exists() {
      std::fs::create_dir_all(destination_path)?;
    }

    let vpk_manager = VpkManager::new();
    let prefixed_vpks = vpk_manager.place_selected_vpks_with_prefix(
      &extracted_dir,
      destination_path,
      mod_id,
      file_tree,
    )?;
    record(destination_path, mod_id, prefixed_vpks)?;

    log::info!("Removing extracted directory: {extracted_dir:?}");
    std::fs::remove_dir_all(&extracted_dir)?;

    let extractor = ArchiveExtractor::new();
    for entry in std::fs::read_dir(&mod_dir)? {
      let entry = entry?;
      let path = entry.path();
      if extractor.is_supported_archive(&path) {
        log::info!("Removing archive: {path:?}");
        std::fs::remove_file(&path)?;
      }
    }

    log::info!("Successfully copied selected VPKs for mod: {}", mod_id);
    Ok(())
  }

  pub(crate) fn copy_local_mod_vpks_from(
    mods_path: &Path,
    destination_path: &Path,
    mod_id: &str,
    record: RecordImport,
  ) -> Result<Vec<String>, Error> {
    ModManager::ensure_safe_mod_id(mod_id)?;
    let lock = mod_copy_lock(mod_id);
    let _guard = lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let files_dir = mods_path.join(mod_id).join("files");

    if !files_dir.exists() {
      return Err(Error::ModFileNotFound);
    }

    if !destination_path.exists() {
      std::fs::create_dir_all(destination_path)?;
    }

    let vpk_manager = VpkManager::new();
    let prefixed_vpks = vpk_manager.copy_vpks_with_prefix(&files_dir, destination_path, mod_id)?;

    if prefixed_vpks.is_empty() {
      log::warn!("No VPK files found in mod files directory: {files_dir:?}");
      return Err(Error::InvalidInput(
        "No VPK files found in mod directory".to_string(),
      ));
    }

    record(destination_path, mod_id, prefixed_vpks.clone())?;

    log::info!(
      "Successfully copied {} VPKs for local mod: {}",
      prefixed_vpks.len(),
      mod_id
    );
    Ok(prefixed_vpks)
  }

  pub(crate) fn record_prefixed_import(
    &self,
    destination_path: &Path,
    mod_id: &str,
    prefixed_vpks: Vec<String>,
  ) -> Result<(), Error> {
    let mut manifest =
      crate::mod_manager::vpk_manifest::ProfileVpkManifest::open_for_write(destination_path)?;
    let original_names: Vec<String> = prefixed_vpks
      .iter()
      .map(|name| {
        name
          .strip_prefix(&format!("{mod_id}_"))
          .unwrap_or(name)
          .to_string()
      })
      .collect();
    manifest.mark_disabled(mod_id, prefixed_vpks, original_names);
    manifest.save(destination_path)
  }
}

/// Whether every selected VPK sits in `destination`, whole, under the name
/// `place_selected_vpks_with_prefix` gives it: the tree's name when it is a
/// plain `.vpk` name, otherwise the source file's name.
fn selection_already_placed(
  destination: &Path,
  mod_id: &str,
  file_tree: &crate::mod_manager::file_tree::ModFileTree,
) -> Result<bool, Error> {
  let placed = VpkManager::new().find_prefixed_vpks(destination, mod_id)?;
  let mut selected = file_tree
    .files
    .iter()
    .filter(|file| file.is_selected)
    .peekable();
  if selected.peek().is_none() {
    return Ok(!placed.is_empty());
  }
  Ok(selected.all(|file| {
    let name = if is_plain_vpk_name(&file.name) {
      Some(file.name.as_str())
    } else {
      // Placement matches archive paths with `/` separators on every platform.
      file
        .path
        .rsplit(['/', '\\'])
        .next()
        .filter(|name| !name.is_empty())
    };
    name.is_some_and(|name| {
      let prefixed = format!("{mod_id}_{name}");
      // A size of 0 means the tree doesn't know it.
      placed.contains(&prefixed)
        && (file.size == 0
          || std::fs::metadata(destination.join(&prefixed))
            .is_ok_and(|placed| placed.len() == file.size))
    })
  }))
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::mod_manager::file_tree::ModFileTree;

  #[test]
  fn archive_profile_paths_reject_escape_before_any_filesystem_effect() {
    let game = super::super::tests::game_dir();
    let manager = super::super::tests::test_manager(game.path());
    let outside = game.path().join("outside");
    let absolute = outside.to_string_lossy().into_owned();
    for folder in ["../outside", absolute.as_str()] {
      assert!(matches!(
        manager.archive_copy_paths(Some(folder)),
        Err(Error::InvalidInput(_))
      ));
      assert!(!outside.exists());
      assert!(!game.path().join("game/citadel/outside").exists());
    }
  }

  #[test]
  fn reenabling_after_the_archive_was_consumed_needs_every_selected_vpk() {
    let mods = tempfile::tempdir().unwrap();
    std::fs::create_dir(mods.path().join("42")).unwrap();
    let addons = tempfile::tempdir().unwrap();
    let selected = |name: &str| crate::mod_manager::file_tree::ModFile {
      name: name.to_string(),
      path: format!("variant/{name}"),
      size: 6,
      is_selected: true,
      archive_name: "mod.zip".to_string(),
    };
    let mut tree = ModFileTree::from_options(&[], &std::collections::HashSet::new());
    tree.files = vec![selected("a.vpk"), selected("b.vpk")];
    let record: RecordImport = &|_, _, _| panic!("nothing new was placed");

    std::fs::write(addons.path().join("42_a.vpk"), b"placed").unwrap();
    assert!(matches!(
      ModManager::copy_selected_vpks_from(mods.path(), addons.path(), "42", &tree, record),
      Err(Error::ModFileNotFound)
    ));

    std::fs::write(addons.path().join("42_b.vpk"), b"pla").unwrap();
    assert!(matches!(
      ModManager::copy_selected_vpks_from(mods.path(), addons.path(), "42", &tree, record),
      Err(Error::ModFileNotFound)
    ));

    std::fs::write(addons.path().join("42_b.vpk"), b"placed").unwrap();
    ModManager::copy_selected_vpks_from(mods.path(), addons.path(), "42", &tree, record).unwrap();

    // A tree name that isn't a plain VPK name falls back to the archive
    // path's file name, whichever separator the archive used.
    tree.files = vec![crate::mod_manager::file_tree::ModFile {
      name: "Variant A".to_string(),
      path: "variant\\a.vpk".to_string(),
      ..selected("a.vpk")
    }];
    ModManager::copy_selected_vpks_from(mods.path(), addons.path(), "42", &tree, record).unwrap();
  }
}
