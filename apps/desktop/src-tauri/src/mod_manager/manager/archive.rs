use super::ModManager;
use crate::errors::Error;
use crate::mod_manager::archive_extractor::ArchiveExtractor;
use crate::mod_manager::vpk_manager::VpkManager;
use std::path::PathBuf;

impl ModManager {
  pub(crate) fn copy_selected_vpks_from_archive(
    &self,
    mod_id: &str,
    file_tree: &crate::mod_manager::file_tree::ModFileTree,
    profile_folder: Option<&str>,
  ) -> Result<(), Error> {
    let destination_path = self.get_addons_path(profile_folder)?;
    let mods_path = self.get_mods_store_path()?;
    self.copy_selected_vpks_from(&mods_path, &destination_path, mod_id, file_tree)
  }

  fn copy_selected_vpks_from(
    &self,
    mods_path: &std::path::Path,
    destination_path: &std::path::Path,
    mod_id: &str,
    file_tree: &crate::mod_manager::file_tree::ModFileTree,
  ) -> Result<(), Error> {
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
        if VpkManager::new()
          .find_prefixed_vpks(destination_path, mod_id)?
          .is_empty()
        {
          return Err(Error::ModFileNotFound);
        }
        log::info!("Selected VPKs for mod {mod_id} are already placed; nothing to copy");
        return Ok(());
      };

      log::info!("Extracting archive: {archive_path:?}");
      extractor.extract_archive(&archive_path, &extracted_dir)?;
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
    self.record_prefixed_import(destination_path, mod_id, prefixed_vpks)?;

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

  pub(crate) fn copy_local_mod_vpks(
    &self,
    mod_id: &str,
    profile_folder: Option<&str>,
  ) -> Result<Vec<String>, Error> {
    let destination_path = self.get_addons_path(profile_folder)?;
    let mods_path = self.get_mods_store_path()?;
    let mod_dir = mods_path.join(mod_id);
    let files_dir = mod_dir.join("files");

    if !files_dir.exists() {
      return Err(Error::ModFileNotFound);
    }

    if !destination_path.exists() {
      std::fs::create_dir_all(&destination_path)?;
    }

    let vpk_manager = VpkManager::new();
    let prefixed_vpks = vpk_manager.copy_vpks_with_prefix(&files_dir, &destination_path, mod_id)?;

    if prefixed_vpks.is_empty() {
      log::warn!("No VPK files found in mod files directory: {files_dir:?}");
      return Err(Error::InvalidInput(
        "No VPK files found in mod directory".to_string(),
      ));
    }

    self.record_prefixed_import(&destination_path, mod_id, prefixed_vpks.clone())?;

    log::info!(
      "Successfully copied {} VPKs for local mod: {}",
      prefixed_vpks.len(),
      mod_id
    );
    Ok(prefixed_vpks)
  }

  pub(crate) fn record_prefixed_import(
    &self,
    destination_path: &std::path::Path,
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
    let tree = ModFileTree::from_options(&[], &std::collections::HashSet::new());
    for folder in ["../outside", absolute.as_str()] {
      assert!(matches!(
        manager.copy_local_mod_vpks("42", Some(folder)),
        Err(Error::InvalidInput(_))
      ));
      assert!(matches!(
        manager.copy_selected_vpks_from_archive("42", &tree, Some(folder)),
        Err(Error::InvalidInput(_))
      ));
      assert!(!outside.exists());
      assert!(!game.path().join("game/citadel/outside").exists());
      assert!(!game.path().join("game/citadel/addons").exists());
    }
  }

  #[test]
  fn reenabling_after_the_archive_was_consumed_reuses_the_placed_vpks() {
    let game = super::super::tests::game_dir();
    let manager = super::super::tests::test_manager(game.path());
    let mods = tempfile::tempdir().unwrap();
    std::fs::create_dir(mods.path().join("42")).unwrap();
    let addons = game.path().join("game/citadel/addons");
    std::fs::create_dir_all(&addons).unwrap();
    let tree = ModFileTree::from_options(&[], &std::collections::HashSet::new());

    assert!(matches!(
      manager.copy_selected_vpks_from(mods.path(), &addons, "42", &tree),
      Err(Error::ModFileNotFound)
    ));

    std::fs::write(addons.join("42_pak01_dir.vpk"), b"placed").unwrap();
    manager
      .copy_selected_vpks_from(mods.path(), &addons, "42", &tree)
      .unwrap();
    assert_eq!(
      std::fs::read(addons.join("42_pak01_dir.vpk")).unwrap(),
      b"placed"
    );
  }
}
