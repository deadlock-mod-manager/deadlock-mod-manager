//! VPKs a profile manifest claims but the disk no longer has, because the
//! user deleted them outside DMM.

use std::path::Path;

use serde::Serialize;

use crate::mod_manager::manager::ModManager;
use crate::mod_manager::shard::ProfileBase;
use crate::mod_manager::vpk_manifest::ProfileVpkManifestEntry;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MissingModFiles {
  pub mod_id: String,
  /// Original names of the claimed VPKs that are gone, as the user knows them.
  pub missing_vpks: Vec<String>,
  /// Every claimed VPK is gone and nothing can bring the mod back, so it no
  /// longer belongs in the library. Otherwise the mod is only broken.
  pub orphaned: bool,
}

/// What `entry` lost from disk, or `None` while every file it claims exists.
pub fn missing_mod_files(
  mod_id: &str,
  entry: &ProfileVpkManifestEntry,
  base: &ProfileBase,
  mods_store: Option<&Path>,
) -> Option<MissingModFiles> {
  let paths = entry.file_paths(base);
  let missing_vpks: Vec<String> = paths
    .iter()
    .enumerate()
    .filter(|(_, path)| !path.is_file())
    .map(|(index, path)| original_name(mod_id, entry, index, path))
    .collect();
  if missing_vpks.is_empty() {
    return None;
  }
  let orphaned =
    missing_vpks.len() == paths.len() && !mods_store.is_some_and(|store| restorable(store, mod_id));
  Some(MissingModFiles {
    mod_id: mod_id.to_string(),
    missing_vpks,
    orphaned,
  })
}

/// Enabled files are renamed to `pakNN_dir.vpk`, so their original name comes
/// from the manifest; parked files keep it behind the `<mod>_` prefix.
fn original_name(
  mod_id: &str,
  entry: &ProfileVpkManifestEntry,
  index: usize,
  path: &Path,
) -> String {
  let file_name = path
    .file_name()
    .map(|name| name.to_string_lossy().into_owned())
    .unwrap_or_default();
  if entry.enabled {
    if entry.original_vpk_names.len() == entry.current_vpks.len()
      && let Some(name) = entry.original_vpk_names.get(index)
    {
      return name.clone();
    }
    return file_name;
  }
  file_name
    .strip_prefix(&format!("{mod_id}_"))
    .map(str::to_string)
    .unwrap_or(file_name)
}

/// A local import keeps its VPKs in the mods store, and enabling it copies
/// them back into the profile (see `ModManager::install_mod`).
fn restorable(mods_store: &Path, mod_id: &str) -> bool {
  if !mod_id.starts_with("local-") || ModManager::ensure_safe_mod_id(mod_id).is_err() {
    return false;
  }
  std::fs::read_dir(mods_store.join(mod_id).join("files")).is_ok_and(|entries| {
    entries.flatten().any(|entry| {
      entry.path().is_file()
        && entry
          .file_name()
          .to_string_lossy()
          .to_ascii_lowercase()
          .ends_with(".vpk")
    })
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::mod_manager::shard::ShardIndex;
  use crate::mod_manager::vpk_manifest::ProfileVpkManifest;

  struct Fixture {
    _temp: tempfile::TempDir,
    base: ProfileBase,
    store: std::path::PathBuf,
  }

  fn fixture() -> Fixture {
    let temp = tempfile::tempdir().unwrap();
    let base = ProfileBase::new(temp.path().join("citadel/addons/profile")).unwrap();
    std::fs::create_dir_all(base.path()).unwrap();
    let store = temp.path().join("mods");
    Fixture {
      _temp: temp,
      base,
      store,
    }
  }

  fn enabled(manifest: &mut ProfileVpkManifest, mod_id: &str, vpks: &[&str], originals: &[&str]) {
    manifest.mark_enabled(
      mod_id,
      vpks.iter().map(|vpk| vpk.to_string()).collect(),
      originals.iter().map(|vpk| vpk.to_string()).collect(),
      Some(0),
      ShardIndex::FIRST,
    );
  }

  fn check(
    fixture: &Fixture,
    manifest: &ProfileVpkManifest,
    mod_id: &str,
  ) -> Option<MissingModFiles> {
    missing_mod_files(
      mod_id,
      &manifest.mods[mod_id],
      &fixture.base,
      Some(&fixture.store),
    )
  }

  #[test]
  fn present_files_are_not_missing() {
    let fixture = fixture();
    std::fs::write(fixture.base.join("pak01_dir.vpk"), b"vpk").unwrap();
    let mut manifest = ProfileVpkManifest::default();
    enabled(&mut manifest, "mod", &["pak01_dir.vpk"], &["skin.vpk"]);
    assert_eq!(check(&fixture, &manifest, "mod"), None);
  }

  #[test]
  fn a_mod_without_any_file_is_orphaned() {
    let fixture = fixture();
    let mut manifest = ProfileVpkManifest::default();
    enabled(&mut manifest, "mod", &["pak01_dir.vpk"], &["skin.vpk"]);
    assert_eq!(
      check(&fixture, &manifest, "mod"),
      Some(MissingModFiles {
        mod_id: "mod".into(),
        missing_vpks: vec!["skin.vpk".into()],
        orphaned: true,
      })
    );
  }

  #[test]
  fn a_parked_mod_reports_its_unprefixed_name() {
    let fixture = fixture();
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_disabled("mod", vec!["mod_skin.vpk".into()], vec!["skin.vpk".into()]);
    let missing = check(&fixture, &manifest, "mod").unwrap();
    assert_eq!(missing.missing_vpks, vec!["skin.vpk".to_string()]);
    assert!(missing.orphaned);
  }

  #[test]
  fn a_partly_deleted_mod_is_only_broken() {
    let fixture = fixture();
    std::fs::write(fixture.base.join("pak01_dir.vpk"), b"vpk").unwrap();
    let mut manifest = ProfileVpkManifest::default();
    enabled(
      &mut manifest,
      "mod",
      &["pak01_dir.vpk", "pak02_dir.vpk"],
      &["a.vpk", "b.vpk"],
    );
    let missing = check(&fixture, &manifest, "mod").unwrap();
    assert_eq!(missing.missing_vpks, vec!["b.vpk".to_string()]);
    assert!(!missing.orphaned);
  }

  #[test]
  fn a_local_import_in_the_mods_store_is_only_broken() {
    let fixture = fixture();
    let files = fixture.store.join("local-skin").join("files");
    std::fs::create_dir_all(&files).unwrap();
    std::fs::write(files.join("skin.vpk"), b"vpk").unwrap();
    let mut manifest = ProfileVpkManifest::default();
    enabled(
      &mut manifest,
      "local-skin",
      &["pak01_dir.vpk"],
      &["skin.vpk"],
    );
    assert!(!check(&fixture, &manifest, "local-skin").unwrap().orphaned);

    std::fs::remove_file(files.join("skin.vpk")).unwrap();
    assert!(check(&fixture, &manifest, "local-skin").unwrap().orphaned);
  }
}
