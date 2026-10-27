use super::modding_workspace::{ModdingHierarchy, contained, relative, resolve};
use crate::{app_runtime::AppHandle, errors::Error};
use std::{
  collections::BTreeSet,
  path::{Path, PathBuf},
};

fn copy_files(root: &Path, sources: &[PathBuf]) -> Result<usize, Error> {
  if sources.is_empty() || sources.len() > 256 {
    return Err(Error::InvalidInput(
      "Drop between 1 and 256 files at a time".into(),
    ));
  }
  std::fs::create_dir_all(root)?;
  let mut names = BTreeSet::new();
  let mut files = Vec::new();
  for source in sources {
    let name = source
      .file_name()
      .and_then(|name| name.to_str())
      .ok_or_else(|| Error::InvalidInput("Invalid dropped file name".into()))?;
    relative(name, false)?;
    let target = contained(root, name)?;
    if !names.insert(name.to_owned()) || target.symlink_metadata().is_ok() {
      return Err(Error::InvalidInput(format!(
        "The destination already exists: {name}"
      )));
    }
    if !source.is_file() {
      return Err(Error::InvalidInput("Drop files rather than folders".into()));
    }
    let mut temporary = tempfile::NamedTempFile::new_in(root)?;
    std::io::copy(&mut std::fs::File::open(source)?, &mut temporary)?;
    temporary.as_file().sync_all()?;
    files.push((temporary, target));
  }
  let mut copied = Vec::new();
  for (temporary, target) in files {
    if let Err(error) = temporary.persist_noclobber(&target) {
      for path in copied {
        let _ = std::fs::remove_file(path);
      }
      return Err(Error::Io(error.error));
    }
    copied.push(target);
  }
  Ok(copied.len())
}

#[tauri::command]
pub async fn import_modding_local_files(
  app: AppHandle,
  addon_id: String,
  hierarchy: ModdingHierarchy,
  sources: Vec<String>,
) -> Result<usize, Error> {
  let root = resolve(&app, &addon_id)?.root(hierarchy);
  tauri::async_runtime::spawn_blocking(move || {
    let copied = copy_files(
      &root,
      &sources.into_iter().map(PathBuf::from).collect::<Vec<_>>(),
    )?;
    if matches!(hierarchy, ModdingHierarchy::Content) {
      super::modding_image_compiler::sync(&root)?;
    }
    Ok(copied)
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn imports_into_root_and_preserves_sources_without_overwriting() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path().join("addon");
    let source = directory.path().join("sound.wav");
    std::fs::write(&source, b"audio").unwrap();
    assert_eq!(copy_files(&root, std::slice::from_ref(&source)).unwrap(), 1);
    assert_eq!(std::fs::read(root.join("sound.wav")).unwrap(), b"audio");
    assert!(source.exists());
    std::fs::write(&source, b"replacement").unwrap();
    assert!(copy_files(&root, &[source]).is_err());
    assert_eq!(std::fs::read(root.join("sound.wav")).unwrap(), b"audio");
  }
  #[test]
  fn a_batch_collision_leaves_the_addon_unchanged() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path().join("addon");
    std::fs::create_dir(&root).unwrap();
    let first = directory.path().join("first.txt");
    let second = directory.path().join("existing.txt");
    std::fs::write(&first, b"first").unwrap();
    std::fs::write(&second, b"second").unwrap();
    std::fs::write(root.join("existing.txt"), b"keep").unwrap();
    assert!(copy_files(&root, &[first, second]).is_err());
    assert!(!root.join("first.txt").exists());
    assert_eq!(std::fs::read_dir(root).unwrap().count(), 1);
  }
}
