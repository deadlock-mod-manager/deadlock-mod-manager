use crate::errors::Error;
use crate::mod_manager::file_permissions::ensure_file_writable;
use crate::mod_manager::fs_retry::{map_file_lock_error, retry_file_operation};
use crate::mod_manager::shard::ProfileBase;
use crate::mod_manager::vpk_manager::VpkManager;
use std::{fs, io::ErrorKind};

/// Pre-V2 reorders parked bare pak names here without a rollback journal.
/// Restoring their original slots keeps the existing manifest valid. Once a
/// slot has been reused we cannot infer ownership, so stop before moving any
/// file or letting reconciliation forget the stranded mods.
pub(super) fn recover(base: &ProfileBase) -> Result<(), Error> {
  let staging = base.join("temp_reorder");
  let metadata = match fs::symlink_metadata(&staging) {
    Ok(metadata) => metadata,
    Err(error) if error.kind() == ErrorKind::NotFound => return Ok(()),
    Err(error) => return Err(error.into()),
  };
  if !metadata.file_type().is_dir() {
    return Err(Error::ModInvalid(format!(
      "Cannot recover legacy load-order files: {} is not a regular directory",
      staging.display()
    )));
  }

  let mut moves = Vec::new();
  for entry in fs::read_dir(&staging)? {
    let entry = entry?;
    let filename = entry.file_name();
    if !entry.file_type()?.is_file()
      || !filename
        .to_str()
        .is_some_and(|name| VpkManager::enabled_vpk_number(name).is_some())
    {
      return Err(Error::ModInvalid(format!(
        "Cannot recover legacy load-order files: unexpected entry at {}. The recovery folder was preserved.",
        entry.path().display()
      )));
    }
    let destination = base.join(&filename);
    match fs::symlink_metadata(&destination) {
      Ok(_) => {
        return Err(Error::ModInvalid(format!(
          "Cannot recover legacy load-order files: {} already exists. Both copies were preserved in {} and {}. Restore an addons backup or resolve the filename collision before retrying.",
          destination.display(),
          base.display(),
          staging.display()
        )));
      }
      Err(error) if error.kind() == ErrorKind::NotFound => {}
      Err(error) => return Err(error.into()),
    }
    ensure_file_writable(&entry.path())?;
    moves.push((entry.path(), destination));
  }
  moves.sort();

  log::info!(
    "Recovering {} legacy reordered VPKs from {}",
    moves.len(),
    staging.display()
  );
  for (source, destination) in moves {
    let label = source.display().to_string();
    retry_file_operation("recover legacy reorder", &label, || {
      fs::rename(&source, &destination)
    })
    .map_err(|error| map_file_lock_error("recover legacy reorder", &label, error))?;
  }
  // Keep unfinished recovery retryable: successful moves already match the
  // unchanged manifest, and any remaining payloads retain their original names.
  fs::remove_dir(staging)?;
  Ok(())
}

#[cfg(test)]
mod tests {
  use crate::mod_manager::shard::{ProfileBase, ShardIndex};
  use crate::mod_manager::vpk_manifest::ProfileVpkManifest;
  use std::fs;

  fn fixture(temp: &tempfile::TempDir) -> ProfileBase {
    let base = ProfileBase::new(temp.path().join("citadel/addons/profile_fixture")).unwrap();
    fs::create_dir_all(base.join("temp_reorder")).unwrap();
    base
  }

  #[test]
  fn legacy_reorder_recovers_the_reported_63_stranded_vpks() {
    let temp = tempfile::tempdir().unwrap();
    let base = fixture(&temp);
    let mut manifest = ProfileVpkManifest::default();
    for number in 1..=66 {
      let filename = format!("pak{number:02}_dir.vpk");
      let directory = if number <= 63 {
        base.join("temp_reorder")
      } else {
        base.to_path_buf()
      };
      fs::write(directory.join(&filename), format!("payload-{number}")).unwrap();
      manifest.mark_enabled(
        &format!("mod{number}"),
        vec![filename],
        vec![format!("original-{number}.vpk")],
        Some(number),
        ShardIndex::FIRST,
      );
    }
    for number in 1..=10 {
      fs::write(base.join(format!("{number}_disabled.vpk")), b"disabled").unwrap();
    }
    manifest.save(&base).unwrap();
    let manifest_bytes = fs::read(base.join(".dmm.json")).unwrap();

    let recovered = ProfileVpkManifest::open_for_write(&base).unwrap();

    assert_eq!(recovered, manifest);
    for number in 1..=66 {
      assert_eq!(
        fs::read(base.join(format!("pak{number:02}_dir.vpk"))).unwrap(),
        format!("payload-{number}").as_bytes()
      );
    }
    for number in 1..=10 {
      assert_eq!(
        fs::read(base.join(format!("{number}_disabled.vpk"))).unwrap(),
        b"disabled"
      );
    }
    assert!(!base.join("temp_reorder").exists());
    assert_eq!(fs::read(base.join(".dmm.json")).unwrap(), manifest_bytes);
    assert_eq!(ProfileVpkManifest::open_for_write(&base).unwrap(), manifest);
  }

  #[test]
  fn legacy_reorder_collision_preserves_every_file_before_recovery_starts() {
    let temp = tempfile::tempdir().unwrap();
    let base = fixture(&temp);
    fs::write(base.join("temp_reorder/pak01_dir.vpk"), b"old first").unwrap();
    fs::write(base.join("temp_reorder/pak02_dir.vpk"), b"old second").unwrap();
    fs::write(base.join("pak02_dir.vpk"), b"reinstalled").unwrap();

    let error = ProfileVpkManifest::open_for_write(&base).unwrap_err();

    assert!(error.to_string().contains("pak02_dir.vpk"));
    assert_eq!(
      fs::read(base.join("pak02_dir.vpk")).unwrap(),
      b"reinstalled"
    );
    assert_eq!(
      fs::read(base.join("temp_reorder/pak01_dir.vpk")).unwrap(),
      b"old first"
    );
    assert_eq!(
      fs::read(base.join("temp_reorder/pak02_dir.vpk")).unwrap(),
      b"old second"
    );
    assert!(!base.join("pak01_dir.vpk").exists());

    fs::rename(base.join("pak02_dir.vpk"), base.join("replacement.vpk")).unwrap();
    ProfileVpkManifest::open_for_write(&base).unwrap();
    assert_eq!(fs::read(base.join("pak01_dir.vpk")).unwrap(), b"old first");
    assert_eq!(fs::read(base.join("pak02_dir.vpk")).unwrap(), b"old second");
    assert_eq!(
      fs::read(base.join("replacement.vpk")).unwrap(),
      b"reinstalled"
    );
  }

  #[test]
  fn legacy_reorder_reads_leave_staged_files_in_place() {
    let temp = tempfile::tempdir().unwrap();
    let base = fixture(&temp);
    fs::write(base.join("temp_reorder/pak01_dir.vpk"), b"staged").unwrap();

    ProfileVpkManifest::load(&base).unwrap();
    ProfileVpkManifest::validate_tree(&temp.path().join("citadel")).unwrap();

    assert_eq!(
      fs::read(base.join("temp_reorder/pak01_dir.vpk")).unwrap(),
      b"staged"
    );
    assert!(!base.join("pak01_dir.vpk").exists());
  }

  #[test]
  fn legacy_reorder_resumes_an_interrupted_recovery_without_touching_restored_files() {
    let temp = tempfile::tempdir().unwrap();
    let base = fixture(&temp);
    fs::write(base.join("pak01_dir.vpk"), b"already restored").unwrap();
    fs::write(base.join("temp_reorder/pak02_dir.vpk"), b"still staged").unwrap();

    ProfileVpkManifest::open_for_write(&base).unwrap();

    assert_eq!(
      fs::read(base.join("pak01_dir.vpk")).unwrap(),
      b"already restored"
    );
    assert_eq!(
      fs::read(base.join("pak02_dir.vpk")).unwrap(),
      b"still staged"
    );
    assert!(!base.join("temp_reorder").exists());
  }

  #[test]
  fn legacy_reorder_preserves_unexpected_entries_without_moving_any_files() {
    let temp = tempfile::tempdir().unwrap();
    let base = fixture(&temp);
    fs::write(base.join("temp_reorder/pak01_dir.vpk"), b"staged").unwrap();
    fs::create_dir(base.join("temp_reorder/unexpected")).unwrap();

    assert!(ProfileVpkManifest::open_for_write(&base).is_err());

    assert_eq!(
      fs::read(base.join("temp_reorder/pak01_dir.vpk")).unwrap(),
      b"staged"
    );
    assert!(base.join("temp_reorder/unexpected").is_dir());
    assert!(!base.join("pak01_dir.vpk").exists());
  }

  #[cfg(unix)]
  #[test]
  fn legacy_reorder_rejects_symlinked_recovery_folders_and_payloads() {
    use std::os::unix::fs::symlink;

    let temp = tempfile::tempdir().unwrap();
    let base = fixture(&temp);
    let outside = temp.path().join("outside");
    fs::create_dir(&outside).unwrap();
    fs::write(outside.join("pak01_dir.vpk"), b"protected").unwrap();
    fs::remove_dir(base.join("temp_reorder")).unwrap();
    symlink(&outside, base.join("temp_reorder")).unwrap();
    assert!(ProfileVpkManifest::open_for_write(&base).is_err());
    assert_eq!(
      fs::read(outside.join("pak01_dir.vpk")).unwrap(),
      b"protected"
    );

    fs::remove_file(base.join("temp_reorder")).unwrap();
    fs::create_dir(base.join("temp_reorder")).unwrap();
    symlink(
      outside.join("pak01_dir.vpk"),
      base.join("temp_reorder/pak01_dir.vpk"),
    )
    .unwrap();
    assert!(ProfileVpkManifest::open_for_write(&base).is_err());
    assert_eq!(
      fs::read(outside.join("pak01_dir.vpk")).unwrap(),
      b"protected"
    );
    assert!(!base.join("pak01_dir.vpk").exists());
  }

  #[cfg(windows)]
  #[test]
  fn legacy_reorder_recovers_remaining_files_after_a_windows_sharing_violation() {
    use std::os::windows::fs::OpenOptionsExt;

    let temp = tempfile::tempdir().unwrap();
    let base = fixture(&temp);
    fs::write(base.join("temp_reorder/pak01_dir.vpk"), b"first").unwrap();
    fs::write(base.join("temp_reorder/pak02_dir.vpk"), b"locked").unwrap();
    let locked = fs::OpenOptions::new()
      .read(true)
      .share_mode(0)
      .open(base.join("temp_reorder/pak02_dir.vpk"))
      .unwrap();

    let error = ProfileVpkManifest::open_for_write(&base).unwrap_err();
    assert!(matches!(error, crate::errors::Error::VpkInUse(_)));
    assert_eq!(fs::read(base.join("pak01_dir.vpk")).unwrap(), b"first");
    assert!(!base.join("pak02_dir.vpk").exists());
    drop(locked);

    ProfileVpkManifest::open_for_write(&base).unwrap();
    assert_eq!(fs::read(base.join("pak01_dir.vpk")).unwrap(), b"first");
    assert_eq!(fs::read(base.join("pak02_dir.vpk")).unwrap(), b"locked");
    assert!(!base.join("temp_reorder").exists());
  }
}
