use super::modding_local::{ModdingWorkspaceSource, source};
use crate::{errors::Error, mod_manager::archive_extractor::ArchiveExtractor};
use std::{
  path::{Path, PathBuf},
  sync::Mutex,
};

static PACKAGES: Mutex<()> = Mutex::new(());

pub(super) fn supported(path: &Path) -> bool {
  path
    .extension()
    .and_then(|extension| extension.to_str())
    .is_some_and(|extension| {
      matches!(
        extension.to_ascii_lowercase().as_str(),
        "zip" | "rar" | "7z"
      )
    })
}

fn package_root(target: &Path) -> Result<PathBuf, Error> {
  let mut root = target.to_owned();
  for _ in 0..32 {
    let entries = std::fs::read_dir(&root)?.collect::<Result<Vec<_>, _>>()?;
    if entries.len() != 1 || !entries[0].file_type()?.is_dir() {
      break;
    }
    let name = entries[0].file_name();
    if [
      "models",
      "materials",
      "particles",
      "sounds",
      "panorama",
      "content",
      "game",
    ]
    .iter()
    .any(|folder| name.eq_ignore_ascii_case(folder))
    {
      break;
    }
    root = entries[0].path();
  }
  Ok(root)
}

pub(super) fn open(
  path: &Path,
  cache: &Path,
  archive: &Path,
) -> Result<Vec<ModdingWorkspaceSource>, Error> {
  let _guard = PACKAGES
    .lock()
    .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?;
  let path = path.canonicalize()?;
  let metadata = path.metadata()?;
  let identity = format!(
    "{}:{}:{:?}",
    path.display(),
    metadata.len(),
    metadata.modified()?
  );
  let target = cache.join(super::modding_edits::fingerprint(identity.as_bytes()));
  if !target.is_dir() {
    std::fs::create_dir_all(cache)?;
    let temporary = tempfile::tempdir_in(cache)?;
    let extension = path
      .extension()
      .unwrap_or_default()
      .to_string_lossy()
      .to_ascii_lowercase();
    let normalized = temporary.path().join(format!("package.{extension}"));
    let input = if path
      .extension()
      .is_some_and(|original| original == extension.as_str())
    {
      path.as_path()
    } else {
      std::fs::copy(&path, &normalized)?;
      &normalized
    };
    let files = temporary.path().join("files");
    ArchiveExtractor::new().extract_archive(input, &files)?;
    // Publish only a completely extracted and validated package.
    std::fs::rename(&files, &target)?;
  }
  let mut result = Vec::new();
  for vpk in super::modding_library::files(&target)?
    .into_iter()
    .filter(|file| super::modding_library::is_directory_vpk(file))
  {
    let mut entry = source(&vpk, &[], archive)?;
    if let ModdingWorkspaceSource::Archive { label, .. } = &mut entry {
      *label = vpk
        .strip_prefix(&target)
        .map_err(|error| Error::InvalidInput(error.to_string()))?
        .to_string_lossy()
        .replace('\\', "/");
    }
    result.push(entry);
  }
  let root = package_root(&target)?;
  let mut entry = source(&root, &[], archive)?;
  if let ModdingWorkspaceSource::Local { addon, .. } = &mut entry {
    addon.name = path
      .file_name()
      .unwrap_or_default()
      .to_string_lossy()
      .into_owned();
  }
  result.push(entry);
  Ok(result)
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::io::Write;
  fn zip(path: &Path, name: &str, bytes: &[u8]) {
    let mut zip = zip::ZipWriter::new(std::fs::File::create(path).unwrap());
    zip
      .start_file(name, zip::write::SimpleFileOptions::default())
      .unwrap();
    zip.write_all(bytes).unwrap();
    zip.finish().unwrap();
  }
  #[test]
  fn source_packages_preserve_asset_paths_and_original_archive() {
    let root = tempfile::tempdir().unwrap();
    let cache = tempfile::tempdir().unwrap();
    let path = root.path().join("addon.ZIP");
    zip(&path, "my_addon/models/test.dmx", b"dmx");
    let before = std::fs::read(&path).unwrap();
    let first = open(&path, cache.path(), Path::new("base.vpk")).unwrap();
    let ModdingWorkspaceSource::Local { addon, .. } = &first[0] else {
      panic!("expected source folder")
    };
    assert!(
      Path::new(&addon.content_path)
        .join("models/test.dmx")
        .is_file()
    );
    assert_eq!(addon.name, "addon.ZIP");
    open(&path, cache.path(), Path::new("base.vpk")).unwrap();
    assert_eq!(std::fs::read_dir(cache.path()).unwrap().count(), 1);
    assert_eq!(std::fs::read(path).unwrap(), before);
  }
  #[test]
  fn failed_package_extraction_never_publishes_a_cache_or_escapes_it() {
    let root = tempfile::tempdir().unwrap();
    let cache = root.path().join("cache");
    let path = root.path().join("bad.zip");
    zip(&path, "../../escaped.txt", b"no");
    assert!(open(&path, &cache, Path::new("base.vpk")).is_err());
    assert!(!root.path().join("escaped.txt").exists());
    assert_eq!(std::fs::read_dir(cache).unwrap().count(), 0);
  }
}
