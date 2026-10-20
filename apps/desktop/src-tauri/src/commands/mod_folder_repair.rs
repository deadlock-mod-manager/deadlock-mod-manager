use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

use crate::errors::Error;
use crate::mod_manager::repair_backup::create_repair_backup;
use crate::mod_manager::shard::{
  CLEAR_STAGING_DIR, ProfileBase, REORDER_STAGING_DIR, ShardIndex, ShardLocator,
  UPDATE_STAGING_PREFIX,
};
use crate::mod_manager::vpk_manager::staging::{VpkSnapshot, quarantine_staging_directory};
use crate::mod_manager::vpk_manifest::ProfileVpkManifest;
use serde::Serialize;
use ts_rs::TS;

use super::profiles::{SeedManifestEntry, seed_manifest_entries};
use super::state::MANAGER;

#[derive(Debug, Serialize, PartialEq, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub enum ManifestStatus {
  Healthy,
  Missing,
  Corrupt,
}

#[derive(Debug, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct ModFolderRepairReport {
  applied: bool,
  untracked_files: Vec<String>,
  manifest_status: ManifestStatus,
  corrupt_manifest_backup: Option<String>,
  staging: Vec<String>,
  quarantined_staging: Vec<String>,
  backup_name: Option<String>,
  backup_path: Option<String>,
}

fn list_vpks(base: &ProfileBase) -> Result<Vec<ShardLocator>, Error> {
  let mut files = Vec::new();
  for (shard, directory) in base.existing_shards() {
    if fs::symlink_metadata(&directory)?.file_type().is_symlink() {
      return Err(Error::UnauthorizedPath(format!(
        "Addon shard is a symlink: {}",
        directory.display()
      )));
    }
    for entry in fs::read_dir(directory)? {
      let entry = entry?;
      if entry.file_type()?.is_file()
        && let Some(name) = entry.file_name().to_str()
        && name.to_ascii_lowercase().ends_with(".vpk")
      {
        files.push(ShardLocator::new(shard, name));
      }
    }
  }
  files.sort_by_key(ShardLocator::to_wire);
  Ok(files)
}

fn rebuild_manifest(
  base: &ProfileBase,
  entries: &[SeedManifestEntry],
) -> Result<ProfileVpkManifest, Error> {
  let files = list_vpks(base)?;
  let mut seeds = Vec::new();
  let mut claimed = BTreeSet::new();
  for entry in entries {
    let mut seed = entry.clone();
    let mut installed = Vec::new();
    let names_aligned = entry.original_vpk_names.len() == entry.current_vpks.len();
    let mut kept_names = Vec::new();
    for (index, name) in entry.current_vpks.iter().enumerate() {
      let normalized = name.replace('\\', "/");
      let matches: Vec<_> = files
        .iter()
        .filter(|file| {
          if normalized.contains('/') {
            file.to_wire() == normalized
              || (cfg!(windows) && file.to_wire().eq_ignore_ascii_case(&normalized))
          } else {
            file.filename == normalized
              || (cfg!(windows) && file.filename.eq_ignore_ascii_case(&normalized))
          }
        })
        .collect();
      if matches.len() > 1 {
        return Err(Error::ModInvalid(format!(
          "Cannot determine which shard owns {name}"
        )));
      }
      // A file missing from disk takes only its own name with it.
      if names_aligned && !matches.is_empty() {
        kept_names.push(entry.original_vpk_names[index].clone());
      }
      installed.extend(matches);
    }
    let shards: BTreeSet<_> = installed.iter().map(|file| file.shard).collect();
    if shards.len() > 1 {
      return Err(Error::ModInvalid(format!(
        "Mod {} spans multiple shards",
        entry.mod_id
      )));
    }
    seed.shard = installed
      .first()
      .map(|file| file.shard)
      .unwrap_or(ShardIndex::FIRST);
    seed.current_vpks = installed.iter().map(|file| file.filename.clone()).collect();
    let prefix = format!("{}_", entry.mod_id);
    seed.disabled_vpks = files
      .iter()
      .filter(|file| file.shard == ShardIndex::FIRST && file.filename.starts_with(&prefix))
      .map(|file| file.filename.clone())
      .collect();
    seed.enabled = !seed.current_vpks.is_empty();
    if !seed.enabled && seed.disabled_vpks.is_empty() {
      continue;
    }
    if !seed.enabled {
      // Parked files keep their original names after the mod id.
      seed.original_vpk_names = seed
        .disabled_vpks
        .iter()
        .map(|file| file[prefix.len()..].to_string())
        .collect();
    } else if names_aligned {
      seed.original_vpk_names = kept_names;
    }
    let paths: Vec<_> = if seed.enabled {
      seed
        .current_vpks
        .iter()
        .map(|name| ShardLocator::new(seed.shard, name).to_wire())
        .collect()
    } else {
      seed.disabled_vpks.clone()
    };
    for path in paths {
      if !claimed.insert(path.clone()) {
        return Err(Error::ModInvalid(format!(
          "Store records both claim {path}; repair cannot determine ownership"
        )));
      }
    }
    seeds.push(seed);
  }
  let mut manifest = ProfileVpkManifest::default();
  seed_manifest_entries(&mut manifest, seeds);
  Ok(manifest)
}

fn read_manifest(
  base: &ProfileBase,
  entries: &[SeedManifestEntry],
) -> Result<(ManifestStatus, ProfileVpkManifest), Error> {
  let path = if base.join(".dmm.json").exists() {
    base.join(".dmm.json")
  } else {
    base.join(".dmm.json.tmp")
  };
  if !path.exists() {
    return Ok((ManifestStatus::Missing, rebuild_manifest(base, entries)?));
  }
  let bytes = fs::read(path)?;
  match serde_json::from_slice::<ProfileVpkManifest>(&bytes) {
    Ok(manifest) => Ok((ManifestStatus::Healthy, manifest.validate_version(base)?)),
    Err(_) => Ok((ManifestStatus::Corrupt, rebuild_manifest(base, entries)?)),
  }
}

fn staging_folders(base: &ProfileBase) -> Result<(Vec<String>, Vec<String>), Error> {
  let mut pending = Vec::new();
  let mut recovered = Vec::new();
  if !base.exists() {
    return Ok((pending, recovered));
  }
  for entry in fs::read_dir(base)? {
    let entry = entry?;
    let name = entry.file_name().to_string_lossy().into_owned();
    if name.starts_with(".dmm-recovered-") && entry.file_type()?.is_dir() {
      recovered.push(name);
    } else if (name == CLEAR_STAGING_DIR
      || name == REORDER_STAGING_DIR
      || name.starts_with(UPDATE_STAGING_PREFIX))
      && entry.file_type()?.is_dir()
    {
      pending.push(name);
    }
  }
  pending.sort();
  recovered.sort();
  Ok((pending, recovered))
}

fn untracked_files(
  base: &ProfileBase,
  manifest: &ProfileVpkManifest,
) -> Result<Vec<String>, Error> {
  let mut owned = BTreeSet::new();
  for entry in manifest.mods.values() {
    for name in &entry.current_vpks {
      owned.insert(ShardLocator::new(entry.shard, name).to_wire());
    }
    owned.extend(entry.disabled_vpks.iter().cloned());
  }
  Ok(
    list_vpks(base)?
      .into_iter()
      .map(|file| file.to_wire())
      .filter(|file| {
        if cfg!(windows) {
          !owned.iter().any(|name| name.eq_ignore_ascii_case(file))
        } else {
          !owned.contains(file)
        }
      })
      .collect(),
  )
}

fn repair_mod_folder_at(
  base: &ProfileBase,
  backup_directory: &Path,
  entries: &[SeedManifestEntry],
  dry_run: bool,
) -> Result<ModFolderRepairReport, Error> {
  let (status, mut manifest) = read_manifest(base, entries)?;
  let (staging, quarantined_staging) = staging_folders(base)?;
  let mut report = ModFolderRepairReport {
    applied: !dry_run,
    untracked_files: untracked_files(base, &manifest)?,
    manifest_status: status,
    corrupt_manifest_backup: None,
    staging,
    quarantined_staging,
    backup_name: None,
    backup_path: None,
  };
  if dry_run {
    return Ok(report);
  }

  if report.manifest_status == ManifestStatus::Healthy {
    manifest = ProfileVpkManifest::open_for_write(base)?;
  } else {
    for folder in &report.staging {
      quarantine_staging_directory(
        &base.join(folder),
        "Missing or corrupt manifest cannot establish whether staging committed",
      )?;
    }
  }
  report.quarantined_staging = staging_folders(base)?.1;
  if report.manifest_status != ManifestStatus::Healthy {
    if report.manifest_status == ManifestStatus::Corrupt {
      let source = if base.join(".dmm.json").exists() {
        base.join(".dmm.json")
      } else {
        base.join(".dmm.json.tmp")
      };
      let destination = base.join(format!(
        ".dmm.json.corrupt-{}",
        chrono::Utc::now().format("%Y%m%dT%H%M%S%.9fZ")
      ));
      fs::rename(source, &destination)?;
      report.corrupt_manifest_backup = Some(destination.to_string_lossy().into_owned());
    }
    manifest.save(base)?;
  }
  report.untracked_files = untracked_files(base, &manifest)?;
  if !report.untracked_files.is_empty() {
    let backup = create_repair_backup(base, backup_directory, &report.untracked_files)?;
    report.backup_name = Some(backup.file_name().unwrap().to_string_lossy().into_owned());
    report.backup_path = Some(backup.to_string_lossy().into_owned());
    let mut snapshot = VpkSnapshot::new()?;
    for file in &report.untracked_files {
      let path = base.locator_path(&ShardLocator::parse(file)?);
      snapshot.capture(&path)?;
      fs::remove_file(path)?;
    }
    manifest.save(base)?;
    snapshot.commit();
  }
  log::info!("Mod folder repair at {}: {report:?}", base.display());
  Ok(report)
}

#[tauri::command]
pub async fn repair_mod_folder(
  profile_folder: Option<String>,
  entries: Vec<SeedManifestEntry>,
  dry_run: bool,
  guard_permit: Option<String>,
) -> Result<ModFolderRepairReport, Error> {
  crate::game_guard::ensure_game_idle_locked("repair_mod_folder", guard_permit.as_deref())?;
  let mut manager = MANAGER.lock().unwrap();
  let base = manager.get_addons_path(profile_folder.as_deref())?;
  let backup_directory = manager.get_app_local_data_path()?.join("mod-folder-repair");
  let report = repair_mod_folder_at(&base, &backup_directory, &entries, dry_run)?;
  if !dry_run {
    manager.hydrate_mods_from_manifest(profile_folder)?;
  }
  Ok(report)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::mod_manager::addons_backup_manager::{AddonsBackupManager, RestoreStrategy};

  fn world(temp: &tempfile::TempDir) -> (ProfileBase, std::path::PathBuf) {
    let base = ProfileBase::new(temp.path().join("game/game/citadel/addons/profile_test")).unwrap();
    fs::create_dir_all(&base).unwrap();
    (base, temp.path().join("app-data/mod-folder-repair"))
  }

  fn write(base: &ProfileBase, name: &str, bytes: &[u8]) {
    let path = base.locator_path(&ShardLocator::parse(name).unwrap());
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, bytes).unwrap();
  }

  fn seed(id: &str, names: &[&str]) -> SeedManifestEntry {
    SeedManifestEntry {
      mod_id: id.into(),
      enabled: !names.is_empty(),
      shard: ShardIndex::FIRST,
      current_vpks: names.iter().map(|name| (*name).into()).collect(),
      disabled_vpks: vec![],
      original_vpk_names: vec!["original.vpk".into()],
      order: Some(0),
    }
  }

  #[test]
  fn detects_untracked_vpks_in_shards_without_touching_owned_disabled_or_local_files() {
    let temp = tempfile::tempdir().unwrap();
    let (base, backups) = world(&temp);
    for name in [
      "pak01_dir.vpk",
      "123_disabled.vpk",
      "local-abc_skin.vpk",
      "old-version.vpk",
      "addons2/stray.vpk",
      "addons2/pak01_dir.vpk",
    ] {
      write(&base, name, name.as_bytes());
    }
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "enabled",
      vec!["pak01_dir.vpk".into()],
      vec![],
      Some(0),
      ShardIndex::FIRST,
    );
    manifest.mark_disabled("123", vec!["123_disabled.vpk".into()], vec![]);
    manifest.mark_disabled("local-abc", vec!["local-abc_skin.vpk".into()], vec![]);
    manifest.save(&base).unwrap();
    let neighbour = base.parent().unwrap().join("profile_other/protected.vpk");
    fs::create_dir_all(neighbour.parent().unwrap()).unwrap();
    fs::write(&neighbour, b"protected").unwrap();
    let preview = repair_mod_folder_at(&base, &backups, &[], true).unwrap();
    assert_eq!(
      preview.untracked_files,
      [
        "addons2/pak01_dir.vpk",
        "addons2/stray.vpk",
        "old-version.vpk"
      ]
    );
    assert!(!backups.exists());
    let applied = repair_mod_folder_at(&base, &backups, &[], false).unwrap();
    assert_eq!(applied.untracked_files, preview.untracked_files);
    for name in ["pak01_dir.vpk", "123_disabled.vpk", "local-abc_skin.vpk"] {
      assert_eq!(fs::read(base.join(name)).unwrap(), name.as_bytes());
    }
    assert_eq!(fs::read(neighbour).unwrap(), b"protected");
    assert_eq!(ProfileVpkManifest::load(&base).unwrap(), manifest);
  }

  #[test]
  fn repair_backup_is_listed_not_pruned_and_restores_original_profile_and_shards() {
    let temp = tempfile::tempdir().unwrap();
    let (base, backups) = world(&temp);
    write(&base, "stray.vpk", b"base");
    write(&base, "addons2/stray.vpk", b"shard");
    let report = repair_mod_folder_at(&base, &backups, &[], false).unwrap();
    assert!(!base.join("stray.vpk").exists());
    let mut manager = AddonsBackupManager::new();
    manager.set_game_path(temp.path().join("game"));
    manager.set_repair_directory(backups);
    let listed = manager.list_backups().unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].addons_count, 2);
    assert_eq!(manager.prune_old_backups(1).unwrap(), 0);
    manager
      .restore_backup(report.backup_name.as_ref().unwrap(), RestoreStrategy::Merge)
      .unwrap();
    assert_eq!(fs::read(base.join("stray.vpk")).unwrap(), b"base");
    assert_eq!(
      fs::read(base.locator_path(&ShardLocator::parse("addons2/stray.vpk").unwrap())).unwrap(),
      b"shard"
    );
    fs::write(base.join("stray.vpk"), b"new owned file").unwrap();
    assert!(
      manager
        .restore_backup(
          report.backup_name.as_ref().unwrap(),
          RestoreStrategy::Replace
        )
        .is_err()
    );
    assert_eq!(fs::read(base.join("stray.vpk")).unwrap(), b"new owned file");
  }

  #[test]
  fn corrupt_manifest_is_preserved_and_rebuilt_using_store_records() {
    let temp = tempfile::tempdir().unwrap();
    let (base, backups) = world(&temp);
    fs::write(base.join(".dmm.json"), b"{truncated").unwrap();
    write(&base, "addons2/pak01_dir.vpk", b"owned");
    write(&base, "local-abc_skin.vpk", b"disabled local");
    write(&base, "orphan.vpk", b"untracked");
    let entries = vec![
      seed("enabled", &["addons2/pak01_dir.vpk"]),
      seed("local-abc", &[]),
    ];
    let preview = repair_mod_folder_at(&base, &backups, &entries, true).unwrap();
    assert_eq!(preview.manifest_status, ManifestStatus::Corrupt);
    assert_eq!(preview.untracked_files, ["orphan.vpk"]);
    assert_eq!(fs::read(base.join(".dmm.json")).unwrap(), b"{truncated");
    let report = repair_mod_folder_at(&base, &backups, &entries, false).unwrap();
    assert_eq!(
      fs::read(report.corrupt_manifest_backup.unwrap()).unwrap(),
      b"{truncated"
    );
    let manifest = ProfileVpkManifest::load(&base).unwrap();
    assert_eq!(manifest.mods["enabled"].shard, ShardIndex::new(2).unwrap());
    assert_eq!(
      manifest.mods["enabled"].original_vpk_names,
      ["original.vpk"]
    );
    assert_eq!(
      manifest.mods["local-abc"].disabled_vpks,
      ["local-abc_skin.vpk"]
    );
    assert_eq!(manifest.mods["local-abc"].original_vpk_names, ["skin.vpk"]);
    assert_eq!(
      fs::read(base.join("local-abc_skin.vpk")).unwrap(),
      b"disabled local"
    );
  }

  #[test]
  fn rebuild_keeps_original_names_paired_with_the_files_left_on_disk() {
    let temp = tempfile::tempdir().unwrap();
    let (base, backups) = world(&temp);
    write(&base, "pak02_dir.vpk", b"blue");
    write(&base, "pak03_dir.vpk", b"stale");
    let mut variants = seed("variants", &["pak01_dir.vpk", "pak02_dir.vpk"]);
    variants.original_vpk_names = vec!["red.vpk".into(), "blue.vpk".into()];
    let mut stale = seed("stale", &["pak03_dir.vpk"]);
    stale.original_vpk_names = vec!["red.vpk".into(), "blue.vpk".into()];
    repair_mod_folder_at(&base, &backups, &[variants, stale], false).unwrap();
    let manifest = ProfileVpkManifest::load(&base).unwrap();
    assert_eq!(manifest.mods["variants"].current_vpks, ["pak02_dir.vpk"]);
    assert_eq!(manifest.mods["variants"].original_vpk_names, ["blue.vpk"]);
    assert!(manifest.mods["stale"].original_vpk_names.is_empty());
  }

  #[test]
  fn invalid_staging_is_moved_aside_and_reported_automatically() {
    let temp = tempfile::tempdir().unwrap();
    let (base, backups) = world(&temp);
    ProfileVpkManifest::default().save(&base).unwrap();
    let staging = base.join(REORDER_STAGING_DIR);
    fs::create_dir(&staging).unwrap();
    fs::write(staging.join(".transaction.jsonl"), b"invalid\n").unwrap();
    fs::write(staging.join("s1__pak01_dir.vpk.pending"), b"retained").unwrap();
    let preview = repair_mod_folder_at(&base, &backups, &[], true).unwrap();
    assert_eq!(preview.staging, [REORDER_STAGING_DIR]);
    assert!(staging.exists());
    ProfileVpkManifest::open_for_write(&base).unwrap();
    assert!(!staging.exists());
    let report = repair_mod_folder_at(&base, &backups, &[], false).unwrap();
    assert_eq!(report.quarantined_staging.len(), 1);
    let recovered = base.join(&report.quarantined_staging[0]);
    assert_eq!(
      fs::read(recovered.join("s1__pak01_dir.vpk.pending")).unwrap(),
      b"retained"
    );
    assert_eq!(
      fs::read(recovered.join(".transaction.jsonl")).unwrap(),
      b"invalid\n"
    );
  }

  #[test]
  fn corrupt_manifest_never_discards_staging_based_on_reconstructed_ownership() {
    let temp = tempfile::tempdir().unwrap();
    let (base, backups) = world(&temp);
    fs::write(base.join(".dmm.json"), b"corrupt").unwrap();
    let staging = base.join(CLEAR_STAGING_DIR);
    fs::create_dir(&staging).unwrap();
    fs::write(staging.join("s1__pak01_dir.vpk.pending"), b"retained").unwrap();
    let report = repair_mod_folder_at(&base, &backups, &[], false).unwrap();
    assert_eq!(report.quarantined_staging.len(), 1);
    assert_eq!(
      fs::read(
        base
          .join(&report.quarantined_staging[0])
          .join("s1__pak01_dir.vpk.pending")
      )
      .unwrap(),
      b"retained"
    );
    assert!(ProfileVpkManifest::load(&base).unwrap().mods.is_empty());
  }

  #[test]
  fn ambiguous_store_records_and_future_manifests_are_left_alone() {
    let temp = tempfile::tempdir().unwrap();
    let (base, backups) = world(&temp);
    fs::write(base.join(".dmm.json"), b"corrupt").unwrap();
    write(&base, "pak01_dir.vpk", b"one");
    write(&base, "addons2/pak01_dir.vpk", b"two");
    assert!(
      repair_mod_folder_at(
        &base,
        &backups,
        &[seed("ambiguous", &["pak01_dir.vpk"])],
        false
      )
      .is_err()
    );
    assert_eq!(fs::read(base.join(".dmm.json")).unwrap(), b"corrupt");
    fs::write(base.join(".dmm.json"), br#"{"version":999,"mods":{}}"#).unwrap();
    assert!(repair_mod_folder_at(&base, &backups, &[], false).is_err());
    assert!(!backups.exists());
  }

  #[cfg(windows)]
  #[test]
  fn manifest_ownership_respects_windows_filename_case() {
    let temp = tempfile::tempdir().unwrap();
    let (base, backups) = world(&temp);
    write(&base, "local-abc_SKIN.vpk", b"owned");
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_disabled("local-abc", vec!["local-abc_skin.vpk".into()], vec![]);
    manifest.save(&base).unwrap();
    let report = repair_mod_folder_at(&base, &backups, &[], false).unwrap();
    assert!(report.untracked_files.is_empty());
    assert_eq!(fs::read(base.join("local-abc_SKIN.vpk")).unwrap(), b"owned");
    fs::write(base.join(".dmm.json"), b"corrupt").unwrap();
    let report = repair_mod_folder_at(
      &base,
      &backups,
      &[seed("local-abc", &["local-abc_skin.vpk"])],
      false,
    )
    .unwrap();
    assert!(report.untracked_files.is_empty());
    assert_eq!(fs::read(base.join("local-abc_SKIN.vpk")).unwrap(), b"owned");
  }
}
