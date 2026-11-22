use super::{format::is_plain_vpk_name, hash_cache::HashCache, import::copy_file};
use crate::errors::Error;
use crate::mod_manager::{ModManager, shard::ProfileBase, vpk_manifest::ProfileVpkManifest};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

/// Repair ownership after another manager moves already imported VPKs. Only
/// claimed slots and DMM's cached bytes participate; foreign files stay intact.
pub(super) fn reconcile_imported_files(
  base: &ProfileBase,
  store: &Path,
  hashes: &HashCache,
) -> Result<(), Error> {
  let mut manifest = ProfileVpkManifest::open_for_write(base)?;
  let mut paths = HashSet::new();
  let mut has_cached_files = false;
  for (mod_id, entry) in &manifest.mods {
    paths.extend(
      entry
        .file_paths(base)
        .into_iter()
        .filter(|path| path.is_file()),
    );
    if ModManager::ensure_safe_mod_id(mod_id).is_ok() {
      paths.extend(entry.original_vpk_names.iter().filter_map(|name| {
        let path = store.join(mod_id).join("files").join(name);
        if is_plain_vpk_name(name) && path.is_file() {
          has_cached_files = true;
          Some(path)
        } else {
          None
        }
      }));
    }
  }
  if !has_cached_files {
    return Ok(());
  }
  let paths: Vec<PathBuf> = paths.into_iter().collect();
  let content: HashMap<PathBuf, String> = paths
    .iter()
    .cloned()
    .zip(hashes.hash_all(&paths, &|_, _, _| {}))
    .filter_map(|(path, hash)| hash.ok().map(|hash| (path, hash)))
    .collect();
  let mut slots = HashMap::new();
  for entry in manifest.mods.values().filter(|entry| entry.enabled) {
    for name in &entry.current_vpks {
      if let Some(hash) = content.get(&base.shard_dir(entry.shard).join(name)) {
        slots
          .entry((entry.shard, hash.clone()))
          .or_insert_with(Vec::new)
          .push(name.clone());
      }
    }
  }

  let mut changed = false;
  let mut restores = Vec::new();
  for (mod_id, entry) in &mut manifest.mods {
    let current = entry.file_paths(base);
    if ModManager::ensure_safe_mod_id(mod_id).is_err()
      || current.len() != entry.original_vpk_names.len()
    {
      continue;
    }
    for (index, (target, original)) in current.iter().zip(&entry.original_vpk_names).enumerate() {
      if !is_plain_vpk_name(original) {
        continue;
      }
      let cached = store.join(mod_id).join("files").join(original);
      let Some(expected) = content.get(&cached) else {
        continue;
      };
      if content.get(target) == Some(expected) {
        continue;
      }
      if entry.enabled
        && let Some(matches) = slots.get(&(entry.shard, expected.clone()))
        && matches.len() == 1
      {
        entry.current_vpks[index] = matches[0].clone();
        changed = true;
      } else if !target.exists() {
        restores.push((cached, target.clone()));
      }
    }
  }
  if !changed && restores.is_empty() {
    return Ok(());
  }
  let mut claimed = HashSet::new();
  if manifest
    .mods
    .values()
    .flat_map(|entry| entry.file_paths(base))
    .any(|path| !claimed.insert(path))
  {
    return Err(Error::ModInvalid(
      "Cannot reconcile imported VPKs with conflicting ownership".into(),
    ));
  }
  for (cached, target) in restores {
    copy_file(&cached, &target, cached.metadata()?.len())?;
  }
  manifest.save(base)?;
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::mod_manager::shard::ShardIndex;
  use crate::mod_manager::vpk_manifest::ProfileVpkManifest;
  use std::fs;

  #[test]
  fn swapped_slots_follow_cached_content_without_moving_files() {
    let root = tempfile::tempdir().unwrap();
    let base = ProfileBase::new(root.path().join("citadel/addons")).unwrap();
    fs::create_dir_all(base.path()).unwrap();
    let store = root.path().join("mods");
    let mut manifest = ProfileVpkManifest::default();
    for (id, slot, bytes) in [
      ("1", "pak01_dir.vpk", b"alpha"),
      ("2", "pak02_dir.vpk", b"bravo"),
    ] {
      let files = store.join(id).join("files");
      fs::create_dir_all(&files).unwrap();
      fs::write(files.join("skin.vpk"), bytes).unwrap();
      manifest.mark_enabled(
        id,
        vec![slot.into()],
        vec!["skin.vpk".into()],
        None,
        ShardIndex::FIRST,
      );
    }
    manifest.save(&base).unwrap();
    fs::write(base.join("pak01_dir.vpk"), b"bravo").unwrap();
    fs::write(base.join("pak02_dir.vpk"), b"alpha").unwrap();
    let hashes = HashCache::open(None);

    reconcile_imported_files(&base, &store, &hashes).unwrap();
    let repaired = ProfileVpkManifest::load(&base).unwrap();
    assert_eq!(repaired.mods["1"].current_vpks, ["pak02_dir.vpk"]);
    assert_eq!(repaired.mods["2"].current_vpks, ["pak01_dir.vpk"]);
    assert_eq!(fs::read(base.join("pak01_dir.vpk")).unwrap(), b"bravo");
    assert_eq!(fs::read(base.join("pak02_dir.vpk")).unwrap(), b"alpha");
    reconcile_imported_files(&base, &store, &hashes).unwrap();
    assert_eq!(
      ProfileVpkManifest::load(&base).unwrap().mods["1"].current_vpks,
      ["pak02_dir.vpk"]
    );
  }

  #[test]
  fn missing_parked_files_are_restored_without_changing_foreign_files() {
    let root = tempfile::tempdir().unwrap();
    let base = ProfileBase::new(root.path().join("citadel/addons")).unwrap();
    fs::create_dir_all(base.join(".disabled")).unwrap();
    let store = root.path().join("mods");
    let files = store.join("snd-2/files");
    fs::create_dir_all(&files).unwrap();
    fs::write(files.join("sound.vpk"), b"sound").unwrap();
    fs::write(base.join(".disabled/snd-2_sound.vpk"), b"sound").unwrap();
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_disabled(
      "snd-2",
      vec!["snd-2_sound.vpk".into()],
      vec!["sound.vpk".into()],
    );
    manifest.save(&base).unwrap();

    reconcile_imported_files(&base, &store, &HashCache::open(None)).unwrap();
    assert_eq!(fs::read(base.join("snd-2_sound.vpk")).unwrap(), b"sound");
    assert_eq!(
      fs::read(base.join(".disabled/snd-2_sound.vpk")).unwrap(),
      b"sound"
    );
    assert!(!ProfileVpkManifest::load(&base).unwrap().mods["snd-2"].enabled);

    fs::write(base.join("snd-2_sound.vpk"), b"foreign").unwrap();
    reconcile_imported_files(&base, &store, &HashCache::open(None)).unwrap();
    assert_eq!(fs::read(base.join("snd-2_sound.vpk")).unwrap(), b"foreign");
  }

  #[test]
  fn an_unresolved_owner_prevents_a_partial_remap() {
    let root = tempfile::tempdir().unwrap();
    let base = ProfileBase::new(root.path().join("citadel/addons")).unwrap();
    fs::create_dir_all(base.path()).unwrap();
    let store = root.path().join("mods");
    fs::create_dir_all(store.join("1/files")).unwrap();
    fs::write(store.join("1/files/skin.vpk"), b"alpha").unwrap();
    let mut manifest = ProfileVpkManifest::default();
    for (id, slot) in [("1", "pak01_dir.vpk"), ("2", "pak02_dir.vpk")] {
      manifest.mark_enabled(
        id,
        vec![slot.into()],
        vec!["skin.vpk".into()],
        None,
        ShardIndex::FIRST,
      );
    }
    manifest.save(&base).unwrap();
    fs::write(base.join("pak01_dir.vpk"), b"foreign").unwrap();
    fs::write(base.join("pak02_dir.vpk"), b"alpha").unwrap();
    let before = fs::read(base.join(".dmm.json")).unwrap();

    assert!(reconcile_imported_files(&base, &store, &HashCache::open(None)).is_err());
    assert_eq!(fs::read(base.join(".dmm.json")).unwrap(), before);
    assert_eq!(fs::read(base.join("pak01_dir.vpk")).unwrap(), b"foreign");
    assert_eq!(fs::read(base.join("pak02_dir.vpk")).unwrap(), b"alpha");
  }
}
