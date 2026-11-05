use crate::mod_manager::archive_extractor::ArchiveExtractor;
use crate::mod_manager::shard::ProfileBase;
use crate::mod_manager::vpk_manifest::ProfileVpkManifest;
use crate::{app_runtime::AppHandle, errors::Error};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
  io::Read,
  path::{Path, PathBuf},
  sync::Mutex,
};
use tauri::Manager;
use ts_rs::TS;

static LIBRARY_LOCK: Mutex<()> = Mutex::new(());

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingLibraryVpk {
  pub label: String,
  pub file_path: String,
}

pub(super) fn files(root: &Path) -> Result<Vec<PathBuf>, Error> {
  let mut pending = vec![(root.to_owned(), 0)];
  let mut files = Vec::new();
  while let Some((directory, depth)) = pending.pop() {
    if depth > 32 {
      return Err(Error::InvalidInput(
        "The mod folder is nested too deeply".into(),
      ));
    }
    for entry in std::fs::read_dir(directory)? {
      let entry = entry?;
      let kind = entry.file_type()?;
      if kind.is_dir() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.starts_with("prepared-") && name != "extracted" {
          pending.push((entry.path(), depth + 1));
        }
      } else if kind.is_file() {
        files.push(entry.path());
        if files.len() > 20_000 {
          return Err(Error::InvalidInput(
            "The mod folder contains too many files".into(),
          ));
        }
      }
    }
  }
  files.sort();
  Ok(files)
}

pub(super) fn is_directory_vpk(path: &Path) -> bool {
  if !path
    .extension()
    .is_some_and(|extension| extension.eq_ignore_ascii_case("vpk"))
  {
    return false;
  }
  let mut signature = [0; 4];
  std::fs::File::open(path)
    .and_then(|mut file| file.read_exact(&mut signature))
    .is_ok()
    && u32::from_le_bytes(signature) == 0x55aa1234
}

fn collect_library(root: &Path, cache: &Path) -> Result<Vec<ModdingLibraryVpk>, Error> {
  let _guard = LIBRARY_LOCK
    .lock()
    .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?;
  if !root.is_dir() {
    return Ok(Vec::new());
  }
  let extractor = ArchiveExtractor::new();
  let mut vpks = Vec::new();
  for file in files(root)? {
    let label = file
      .strip_prefix(root)
      .map_err(|error| Error::InvalidInput(error.to_string()))?
      .to_string_lossy()
      .replace('\\', "/");
    if is_directory_vpk(&file) {
      vpks.push(ModdingLibraryVpk {
        label,
        file_path: file.to_string_lossy().into_owned(),
      });
    } else if extractor.is_supported_archive(&file) {
      let metadata = file.metadata()?;
      let identity = format!(
        "{}:{}:{:?}",
        file.canonicalize()?.display(),
        metadata.len(),
        metadata.modified()?
      );
      let target = cache.join(format!("{:x}", Sha256::digest(identity.as_bytes())));
      if !target.is_dir() {
        std::fs::create_dir_all(cache)?;
        let temporary = tempfile::tempdir_in(cache)?;
        extractor.extract_archive(&file, temporary.path())?;
        std::fs::rename(temporary.path(), &target)?;
      }
      for vpk in files(&target)?
        .into_iter()
        .filter(|path| is_directory_vpk(path))
      {
        let relative = vpk
          .strip_prefix(&target)
          .map_err(|error| Error::InvalidInput(error.to_string()))?
          .to_string_lossy()
          .replace('\\', "/");
        vpks.push(ModdingLibraryVpk {
          label: format!("{label}/{relative}"),
          file_path: vpk.to_string_lossy().into_owned(),
        });
      }
    }
  }
  vpks.sort_by(|a, b| a.label.cmp(&b.label));
  Ok(vpks)
}

fn collect_mod_vpks(
  root: &Path,
  cache: &Path,
  profile: Option<&ProfileBase>,
  mod_id: &str,
) -> Result<Vec<ModdingLibraryVpk>, Error> {
  let mut vpks = collect_library(root, cache)?;
  if let Some(base) = profile {
    let manifest = ProfileVpkManifest::load(base)?;
    if let Some(entry) = manifest.mods.get(mod_id) {
      for path in entry.file_paths(base) {
        if is_directory_vpk(&path) {
          vpks.push(ModdingLibraryVpk {
            label: path
              .file_name()
              .unwrap_or_default()
              .to_string_lossy()
              .into_owned(),
            file_path: path.to_string_lossy().into_owned(),
          });
        }
      }
    }
  }
  vpks.sort_by(|a, b| a.label.cmp(&b.label));
  Ok(vpks)
}

#[tauri::command]
pub async fn list_modding_library_vpks(
  app: AppHandle,
  mod_id: String,
  profile_folder: Option<String>,
) -> Result<Vec<ModdingLibraryVpk>, Error> {
  let part = super::modding_workspace::relative(&mod_id, false)?;
  if part.components().count() != 1 {
    return Err(Error::InvalidInput("Invalid library mod id".into()));
  }
  let root = crate::mod_manager::mods_store::dir(&app)?.join(part);
  let cache = app.path().app_cache_dir()?.join("workbench-library-vpks");
  let profile = super::state::MANAGER
    .lock()
    .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
    .get_addons_path(profile_folder.as_deref())
    .ok();
  tauri::async_runtime::spawn_blocking(move || {
    collect_mod_vpks(&root, &cache, profile.as_ref(), &mod_id)
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::mod_manager::shard::ShardIndex;

  #[test]
  fn library_finds_installed_vpk_when_download_cache_is_missing() {
    let root = tempfile::tempdir().unwrap();
    let cache = tempfile::tempdir().unwrap();
    let base = ProfileBase::new(root.path().join("citadel/addons")).unwrap();
    std::fs::create_dir_all(base.path()).unwrap();
    let path = base.join("pak01_dir.vpk");
    let bytes = 0x55aa1234u32.to_le_bytes();
    std::fs::write(&path, bytes).unwrap();
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "626054",
      vec!["pak01_dir.vpk".into()],
      vec!["pak64_dir.vpk".into()],
      None,
      ShardIndex::FIRST,
    );
    manifest.save(&base).unwrap();

    let vpks = collect_mod_vpks(
      &root.path().join("missing-cache"),
      cache.path(),
      Some(&base),
      "626054",
    )
    .unwrap();
    assert_eq!(vpks.len(), 1);
    assert_eq!(vpks[0].file_path, path.to_string_lossy());
    assert_eq!(std::fs::read(path).unwrap(), bytes);
    assert!(
      collect_mod_vpks(
        &root.path().join("missing-cache"),
        cache.path(),
        Some(&base),
        "other-mod"
      )
      .unwrap()
      .is_empty()
    );
  }

  #[test]
  fn library_finds_sharded_and_disabled_vpks_in_the_selected_profile() {
    let root = tempfile::tempdir().unwrap();
    let cache = tempfile::tempdir().unwrap();
    let base = ProfileBase::new(root.path().join("citadel/addons/profile_test")).unwrap();
    let shard = ShardIndex::new(2).unwrap();
    std::fs::create_dir_all(base.path()).unwrap();
    std::fs::create_dir_all(base.shard_dir(shard)).unwrap();
    let enabled = base.shard_dir(shard).join("pak01_dir.vpk");
    let disabled = base.join("disabled_skin.vpk");
    for path in [&enabled, &disabled] {
      std::fs::write(path, 0x55aa1234u32.to_le_bytes()).unwrap();
    }
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "enabled",
      vec!["pak01_dir.vpk".into()],
      Vec::new(),
      None,
      shard,
    );
    manifest.mark_disabled("disabled", vec!["disabled_skin.vpk".into()], Vec::new());
    manifest.save(&base).unwrap();

    let store = root.path().join("missing-cache");
    let vpks = collect_mod_vpks(&store, cache.path(), Some(&base), "enabled").unwrap();
    assert_eq!(vpks.len(), 1);
    assert_eq!(vpks[0].file_path, enabled.to_string_lossy());
    let vpks = collect_mod_vpks(&store, cache.path(), Some(&base), "disabled").unwrap();
    assert_eq!(vpks.len(), 1);
    assert_eq!(vpks[0].file_path, disabled.to_string_lossy());
  }

  #[test]
  fn library_lists_only_directory_vpks_and_ignores_prepared_duplicates() {
    let root = tempfile::tempdir().unwrap();
    std::fs::write(
      root.path().join("skin_dir.vpk"),
      0x55aa1234u32.to_le_bytes(),
    )
    .unwrap();
    std::fs::write(root.path().join("skin_000.vpk"), b"payload").unwrap();
    std::fs::create_dir(root.path().join("prepared-old")).unwrap();
    std::fs::write(
      root.path().join("prepared-old/duplicate.vpk"),
      0x55aa1234u32.to_le_bytes(),
    )
    .unwrap();
    let cache = tempfile::tempdir().unwrap();
    let result = collect_library(root.path(), cache.path()).unwrap();
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].label, "skin_dir.vpk");
  }
  #[test]
  fn zipped_library_vpks_keep_companions_and_reuse_cache() {
    use std::io::Write;
    let root = tempfile::tempdir().unwrap();
    let cache = tempfile::tempdir().unwrap();
    let path = root.path().join("skin.zip");
    let mut zip = zip::ZipWriter::new(std::fs::File::create(&path).unwrap());
    zip
      .start_file(
        "nested/skin_dir.vpk",
        zip::write::SimpleFileOptions::default(),
      )
      .unwrap();
    zip.write_all(&0x55aa1234u32.to_le_bytes()).unwrap();
    zip
      .start_file(
        "nested/skin_000.vpk",
        zip::write::SimpleFileOptions::default(),
      )
      .unwrap();
    zip.write_all(b"companion bytes").unwrap();
    zip.finish().unwrap();
    let before = std::fs::read(&path).unwrap();
    let first = collect_library(root.path(), cache.path()).unwrap();
    assert_eq!(first.len(), 1);
    assert_eq!(first[0].label, "skin.zip/nested/skin_dir.vpk");
    let file = PathBuf::from(&first[0].file_path);
    assert_eq!(
      std::fs::read(file.with_file_name("skin_000.vpk")).unwrap(),
      b"companion bytes"
    );
    assert!(!file.starts_with(root.path()));
    let second = collect_library(root.path(), cache.path()).unwrap();
    assert_eq!(first[0].file_path, second[0].file_path);
    assert_eq!(std::fs::read_dir(cache.path()).unwrap().count(), 1);
    assert_eq!(before, std::fs::read(path).unwrap());
  }
}
