use super::*;
use crate::mod_manager::addons_backup_manager::AddonsBackup;
use serde::{Deserialize, Serialize};
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

/// Backups taken before an update hold only the mods being updated, so
/// updating one mod doesn't copy every profile's addons.
pub const UPDATE_BACKUP_PREFIX: &str = "addons-backup-update-";
const INDEX_FILE: &str = "update.json";
const VPKS_DIR: &str = "vpks";
const PARKED_DIR: &str = "parked";

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateBackupIndex {
  profile_folder: Option<String>,
  mods: Vec<BackedUpMod>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackedUpMod {
  mod_id: String,
  mod_name: String,
  enabled: bool,
  file_tree: Option<ModFileTree>,
  /// Stored under `<mod_id>/vpks/` by their original names, so restoring them
  /// as an update records the same original names.
  vpks: Vec<String>,
  /// Files Mod Options parked, stored under `<mod_id>/parked/`.
  parked: Vec<String>,
}

/// A mod about to be updated, with the file tree its installed version uses.
pub struct UpdateBackupTarget {
  pub mod_id: String,
  pub mod_name: String,
  pub file_tree: Option<ModFileTree>,
}

struct ModFiles {
  enabled: bool,
  vpks: Vec<(PathBuf, String)>,
  parked: Vec<PathBuf>,
}

/// Mod names shown in the backup list, or empty for other kinds of backup.
pub fn update_backup_mod_names(backup: &Path) -> Vec<String> {
  fs::read(backup.join(INDEX_FILE))
    .ok()
    .and_then(|bytes| serde_json::from_slice::<UpdateBackupIndex>(&bytes).ok())
    .map(|index| index.mods.into_iter().map(|m| m.mod_name).collect())
    .unwrap_or_default()
}

fn is_plain_file_name(name: &str) -> bool {
  !name.is_empty() && Path::new(name).file_name().and_then(|n| n.to_str()) == Some(name)
}

impl ModManager {
  fn update_backup_files(
    &self,
    base: &ProfileBase,
    manifest: &ProfileVpkManifest,
    mod_id: &str,
  ) -> Result<Option<ModFiles>, Error> {
    let Some(entry) = manifest.mods.get(mod_id) else {
      return Ok(None);
    };
    let installed: Vec<PathBuf> = entry
      .file_paths(base)
      .into_iter()
      .filter(|path| path.is_file())
      .collect();
    if installed.is_empty() {
      return Ok(None);
    }

    let disabled_prefix = format!("{mod_id}_");
    let installed_names: Vec<String> = installed
      .iter()
      .map(|path| {
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        name
          .strip_prefix(&disabled_prefix)
          .unwrap_or(&name)
          .to_string()
      })
      .collect();
    let originals = &entry.original_vpk_names;
    let originals_usable = originals.len() == installed.len()
      && originals.iter().all(|name| is_plain_file_name(name))
      && originals.iter().collect::<HashSet<_>>().len() == originals.len();
    let names = if originals_usable {
      originals.clone()
    } else {
      installed_names
    };

    let parked = self
      .vpk_manager
      .find_prefixed_vpks(base, mod_id)?
      .into_iter()
      .map(|name| base.join(name))
      .filter(|path| !installed.contains(path))
      .collect();

    Ok(Some(ModFiles {
      enabled: entry.enabled,
      vpks: installed.into_iter().zip(names).collect(),
      parked,
    }))
  }

  /// Bytes an update backup of these mods would copy.
  pub fn update_backup_size(
    &self,
    profile_folder: Option<&str>,
    mod_ids: &[String],
  ) -> Result<u64, Error> {
    let base = self.get_addons_path(profile_folder)?;
    let manifest = ProfileVpkManifest::load(&base)?;
    let mut bytes = 0;
    for mod_id in mod_ids {
      if let Some(files) = self.update_backup_files(&base, &manifest, mod_id)? {
        for path in files.vpks.iter().map(|(path, _)| path).chain(&files.parked) {
          bytes += fs::metadata(path)?.len();
        }
      }
    }
    Ok(bytes)
  }

  /// Copies the files of `mods` into a new backup in `directory`. Returns
  /// `None` when none of them has files to back up.
  pub fn create_update_backup(
    &self,
    profile_folder: Option<&str>,
    mods: &[UpdateBackupTarget],
    directory: &Path,
    filename: &str,
  ) -> Result<Option<AddonsBackup>, Error> {
    let base = self.get_addons_path(profile_folder)?;
    let manifest = ProfileVpkManifest::load(&base)?;
    fs::create_dir_all(directory)?;
    let staging = tempfile::Builder::new()
      .prefix(".update-")
      .tempdir_in(directory)?;

    let mut index = UpdateBackupIndex {
      profile_folder: profile_folder.map(str::to_string),
      mods: Vec::new(),
    };
    let mut file_size = 0;
    let mut addons_count = 0;
    for target in mods {
      let mod_id = &target.mod_id;
      Self::ensure_safe_mod_id(mod_id)?;
      let Some(files) = self.update_backup_files(&base, &manifest, mod_id)? else {
        continue;
      };
      let mod_dir = staging.path().join(mod_id);
      fs::create_dir_all(mod_dir.join(VPKS_DIR))?;
      for (source, name) in &files.vpks {
        file_size += fs::copy(source, mod_dir.join(VPKS_DIR).join(name))?;
        addons_count += 1;
      }
      let mut parked = Vec::new();
      if !files.parked.is_empty() {
        fs::create_dir_all(mod_dir.join(PARKED_DIR))?;
      }
      for source in &files.parked {
        let name = source.file_name().unwrap_or_default();
        file_size += fs::copy(source, mod_dir.join(PARKED_DIR).join(name))?;
        addons_count += 1;
        parked.push(name.to_string_lossy().into_owned());
      }
      index.mods.push(BackedUpMod {
        mod_id: mod_id.clone(),
        mod_name: target.mod_name.clone(),
        enabled: files.enabled,
        file_tree: target.file_tree.clone().or_else(|| {
          self
            .mod_repository
            .get_mod(mod_id)
            .and_then(|installed| installed.file_tree.clone())
        }),
        vpks: files.vpks.into_iter().map(|(_, name)| name).collect(),
        parked,
      });
    }
    if index.mods.is_empty() {
      return Ok(None);
    }

    fs::write(
      staging.path().join(INDEX_FILE),
      serde_json::to_vec_pretty(&index)
        .map_err(|error| Error::BackupCreationFailed(error.to_string()))?,
    )?;
    let filename = AddonsBackupManager::unused_backup_name(directory, filename);
    let destination = directory.join(&filename);
    fs::rename(staging.keep(), &destination)?;

    Ok(Some(AddonsBackup {
      file_name: filename,
      file_path: destination.to_string_lossy().into_owned(),
      created_at: SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs(),
      file_size,
      addons_count,
      mod_names: index.mods.into_iter().map(|m| m.mod_name).collect(),
    }))
  }

  /// Reinstalls each backed-up mod the way an update would, so the restored
  /// files take the mod's current load order slot. Returns the backup's
  /// profile folder and the restored mods with the VPKs they ended up in.
  pub fn restore_update_backup(
    &mut self,
    backup: &Path,
  ) -> Result<(Option<String>, Vec<Mod>), Error> {
    let index: UpdateBackupIndex = serde_json::from_slice(&fs::read(backup.join(INDEX_FILE))?)
      .map_err(|error| Error::BackupRestoreFailed(error.to_string()))?;
    let base = self.get_addons_path(index.profile_folder.as_deref())?;
    let manifest = ProfileVpkManifest::load(&base)?;
    let mut restored = Vec::new();

    for backed_up in index.mods {
      let mod_id = &backed_up.mod_id;
      Self::ensure_safe_mod_id(mod_id)?;
      let parked_prefix = format!("{mod_id}_");
      if !backed_up.vpks.iter().all(|name| is_plain_file_name(name))
        || !backed_up
          .parked
          .iter()
          .all(|name| is_plain_file_name(name) && name.starts_with(&parked_prefix))
      {
        return Err(Error::BackupRestoreFailed(format!(
          "Backup of {} lists an invalid file name",
          backed_up.mod_name
        )));
      }

      let mod_dir = backup.join(mod_id);
      let vpks: Vec<PathBuf> = backed_up
        .vpks
        .iter()
        .map(|name| mod_dir.join(VPKS_DIR).join(name))
        .collect();
      // Keep the state the player has now; only the files go back.
      let enabled = manifest
        .mods
        .get(mod_id)
        .map_or(backed_up.enabled, |entry| entry.enabled);
      restored.push(self.update_mod_from_prepared(
        mod_id,
        &backed_up.mod_name,
        &vpks,
        backed_up.file_tree,
        index.profile_folder.clone(),
        enabled,
      )?);

      for name in &backed_up.parked {
        let destination = base.join(name);
        if !destination.exists() {
          fs::copy(mod_dir.join(PARKED_DIR).join(name), destination)?;
        }
      }
    }

    self.reorder_all_mods_for_profile(index.profile_folder.clone())?;
    let manifest = ProfileVpkManifest::load(&base)?;
    for restored_mod in &mut restored {
      if let Some(entry) = manifest
        .mods
        .get(&restored_mod.id)
        .filter(|entry| entry.enabled)
      {
        restored_mod.installed_vpks = entry.current_vpks.clone();
      }
    }
    Ok((index.profile_folder, restored))
  }
}

#[cfg(test)]
mod tests {
  use super::super::tests::{game_dir, test_manager};
  use super::*;

  fn target() -> UpdateBackupTarget {
    UpdateBackupTarget {
      mod_id: "target".into(),
      mod_name: "Target".into(),
      file_tree: None,
    }
  }

  fn installed_profile(game: &Path) -> ProfileBase {
    let base = ProfileBase::new(game.join("game").join("citadel").join("addons")).unwrap();
    fs::create_dir_all(&*base).unwrap();
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "target",
      vec!["pak01_dir.vpk".into()],
      vec!["skin.vpk".into()],
      Some(0),
      ShardIndex::FIRST,
    );
    manifest.mark_enabled(
      "other",
      vec!["pak02_dir.vpk".into()],
      vec!["other.vpk".into()],
      Some(1),
      ShardIndex::FIRST,
    );
    manifest.save(&base).unwrap();
    fs::write(base.join("pak01_dir.vpk"), b"old skin").unwrap();
    fs::write(base.join("pak02_dir.vpk"), b"other mod").unwrap();
    fs::write(base.join("target_option.vpk"), b"old option").unwrap();
    base
  }

  /// Updating one mod used to copy every profile's addons (#1076).
  #[test]
  fn update_backup_holds_only_the_updated_mod() {
    let game = game_dir();
    let base = installed_profile(game.path());
    let manager = test_manager(game.path());
    let backups = game.path().join("backups");

    let ids = ["target".to_string()];
    assert_eq!(
      manager.update_backup_size(None, &ids).unwrap(),
      (b"old skin".len() + b"old option".len()) as u64
    );
    let backup = manager
      .create_update_backup(None, &[target()], &backups, "addons-backup-update-x")
      .unwrap()
      .unwrap();

    let path = Path::new(&backup.file_path);
    assert_eq!(backup.mod_names, ["Target"]);
    assert_eq!(
      fs::read(path.join("target/vpks/skin.vpk")).unwrap(),
      b"old skin"
    );
    assert!(path.join("target/parked/target_option.vpk").is_file());
    assert!(!path.join("other").exists());
    assert_eq!(update_backup_mod_names(path), ["Target"]);
    assert!(base.join("pak02_dir.vpk").is_file());

    let none = manager
      .create_update_backup(
        None,
        &[UpdateBackupTarget {
          mod_id: "missing".into(),
          mod_name: "Missing".into(),
          file_tree: None,
        }],
        &backups,
        "addons-backup-update-y",
      )
      .unwrap();
    assert!(none.is_none());
  }

  #[test]
  fn restoring_an_update_backup_brings_back_the_old_files() {
    let game = game_dir();
    let base = installed_profile(game.path());
    let mut manager = test_manager(game.path());
    let backups = game.path().join("backups");
    let backup = manager
      .create_update_backup(
        None,
        &[UpdateBackupTarget {
          file_tree: Some(ModFileTree {
            files: Vec::new(),
            total_files: 2,
            has_multiple_files: true,
          }),
          ..target()
        }],
        &backups,
        "addons-backup-update-x",
      )
      .unwrap()
      .unwrap();

    let update = game.path().join("skin.vpk");
    fs::write(&update, b"new skin").unwrap();
    manager
      .update_mod_from_prepared("target", "Target", &[update], None, None, true)
      .unwrap();
    assert!(!base.join("target_option.vpk").exists());

    let (profile_folder, restored) = manager
      .restore_update_backup(Path::new(&backup.file_path))
      .unwrap();
    assert_eq!(profile_folder, None);
    assert_eq!(
      restored[0].file_tree.as_ref().map(|tree| tree.total_files),
      Some(2)
    );

    let manifest = ProfileVpkManifest::load(&base).unwrap();
    let entry = &manifest.mods["target"];
    assert!(entry.enabled);
    assert_eq!(entry.original_vpk_names, ["skin.vpk"]);
    assert_eq!(
      fs::read(base.join(&entry.current_vpks[0])).unwrap(),
      b"old skin"
    );
    assert_eq!(
      fs::read(base.join("target_option.vpk")).unwrap(),
      b"old option"
    );
    let other = &manifest.mods["other"];
    assert_eq!(
      fs::read(base.join(&other.current_vpks[0])).unwrap(),
      b"other mod"
    );
  }

  /// Restored files take the slot the mod has at restore time, not the one it
  /// had when the backup was taken.
  #[test]
  fn restoring_keeps_a_load_order_changed_after_the_backup() {
    let game = game_dir();
    let base = installed_profile(game.path());
    let mut manager = test_manager(game.path());
    let backup = manager
      .create_update_backup(
        None,
        &[target()],
        &game.path().join("backups"),
        "addons-backup-update-x",
      )
      .unwrap()
      .unwrap();

    manager
      .reorder_mods_by_remote_id(
        vec![
          ("other".into(), vec!["pak02_dir.vpk".into()], 0),
          ("target".into(), vec!["pak01_dir.vpk".into()], 1),
        ],
        None,
      )
      .unwrap();
    let update = game.path().join("skin.vpk");
    fs::write(&update, b"new skin").unwrap();
    manager
      .update_mod_from_prepared("target", "Target", &[update], None, None, true)
      .unwrap();

    manager
      .restore_update_backup(Path::new(&backup.file_path))
      .unwrap();

    let manifest = ProfileVpkManifest::load(&base).unwrap();
    let (target, other) = (&manifest.mods["target"], &manifest.mods["other"]);
    assert_eq!(other.current_vpks, ["pak01_dir.vpk"]);
    assert_eq!(target.current_vpks, ["pak02_dir.vpk"]);
    assert_eq!(fs::read(base.join("pak01_dir.vpk")).unwrap(), b"other mod");
    assert_eq!(fs::read(base.join("pak02_dir.vpk")).unwrap(), b"old skin");
  }
}
