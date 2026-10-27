use std::collections::{BTreeSet, HashMap};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};
use std::time::SystemTime;

use crate::app_runtime::AppHandle;
use crate::errors::Error;

const PARTICLE_HEADER: &[u8] = b"<!-- kv3 encoding:text:version{e21c7f3c-8a33-41c5-9977-a76d3a32aa0d} format:vpcf63:version{a6e6a69e-52d3-4527-8b9c-ff3bb91aca3e} -->";
type Stamp = (u64, Option<SystemTime>);
static NORMALIZE_LOCK: LazyLock<Mutex<HashMap<PathBuf, Stamp>>> = LazyLock::new(Mutex::default);

fn normalize_cached(path: &Path, cache: &mut HashMap<PathBuf, Stamp>) -> Result<bool, Error> {
  let metadata = std::fs::metadata(path)?;
  let stamp = (metadata.len(), metadata.modified().ok());
  if stamp.1.is_some() && cache.get(path) == Some(&stamp) {
    return Ok(false);
  }
  let changed = normalize_particle(path)?;
  let metadata = std::fs::metadata(path)?;
  if cache.len() >= 8192 {
    cache.clear();
  }
  cache.insert(path.to_owned(), (metadata.len(), metadata.modified().ok()));
  Ok(changed)
}

pub(super) fn normalize_selected_particles(
  root: &Path,
  selected: &[PathBuf],
) -> Result<usize, Error> {
  let mut cache = NORMALIZE_LOCK
    .lock()
    .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?;
  let mut pending = selected.to_vec();
  let mut seen = BTreeSet::new();
  let mut count = 0;
  while let Some(path) = pending.pop() {
    if !seen.insert(path.clone()) {
      continue;
    }
    if seen.len() > 8192 {
      return Err(Error::InvalidInput(
        "Particle dependency graph exceeds 8192 files".into(),
      ));
    }
    count += usize::from(normalize_cached(&path, &mut cache)?);
    let mut text = String::new();
    std::fs::File::open(path)?
      .take(4 * 1024 * 1024 + 1)
      .read_to_string(&mut text)?;
    if text.len() > 4 * 1024 * 1024 {
      return Err(Error::InvalidInput("Particle source exceeds 4 MB".into()));
    }
    let definition = super::modding_source::tree(&text)?;
    if let Some(children) = definition
      .get("m_Children")
      .and_then(|value| value.as_array())
    {
      for child in children {
        if let Some(reference) = child.get("m_ChildRef").and_then(|value| value.as_string()) {
          let path = super::modding_workspace::contained(root, &reference.replace('\\', "/"))?;
          if path.is_file() {
            pending.push(path);
          }
        }
      }
    }
  }
  Ok(count)
}

fn normalize_particle(path: &Path) -> Result<bool, Error> {
  let mut input = std::fs::File::open(path)?;
  let mut prefix = Vec::new();
  Read::by_ref(&mut input)
    .take(4096)
    .read_to_end(&mut prefix)?;
  let start = if prefix.starts_with(b"\xef\xbb\xbf") {
    3
  } else {
    0
  };
  if !prefix[start..].starts_with(b"<!-- kv3 ") {
    return Ok(false);
  }
  let Some(end) = prefix
    .windows(3)
    .position(|bytes| bytes == b"-->")
    .map(|end| end + 3)
  else {
    return Err(Error::InvalidInput(format!(
      "Particle has an unterminated KV3 header: {}",
      path.display()
    )));
  };
  if &prefix[start..end] == PARTICLE_HEADER {
    return Ok(false);
  }
  let mut replacement = tempfile::NamedTempFile::new_in(
    path
      .parent()
      .ok_or_else(|| Error::InvalidInput("Particle has no parent folder".into()))?,
  )?;
  replacement.write_all(&prefix[..start])?;
  replacement.write_all(PARTICLE_HEADER)?;
  input.seek(SeekFrom::Start(end as u64))?;
  std::io::copy(&mut input, &mut replacement)?;
  replacement
    .as_file()
    .set_permissions(input.metadata()?.permissions())?;
  replacement.as_file().sync_all()?;
  drop(input);
  replacement.persist(path).map_err(|error| error.error)?;
  Ok(true)
}

pub(super) fn normalize_particles(root: &Path) -> Result<usize, Error> {
  let mut cache = NORMALIZE_LOCK
    .lock()
    .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?;
  if !root.is_dir() {
    return Ok(0);
  }
  let mut count = 0;
  let mut pending = vec![root.to_path_buf()];
  while let Some(directory) = pending.pop() {
    for entry in std::fs::read_dir(directory)? {
      let entry = entry?;
      if entry.file_name().to_string_lossy().starts_with('.') {
        continue;
      }
      let kind = entry.file_type()?;
      if kind.is_dir() {
        pending.push(entry.path());
      } else if kind.is_file()
        && entry
          .path()
          .extension()
          .is_some_and(|ext| ext.eq_ignore_ascii_case("vpcf"))
        && normalize_cached(&entry.path(), &mut cache)?
      {
        count += 1;
      }
    }
  }
  if count > 0 {
    log::info!(
      "[Workbench] Normalized {count} particle headers in {}",
      root.display()
    );
  }
  Ok(count)
}

#[tauri::command]
pub async fn prepare_modding_addon_files(app: AppHandle, addon_id: String) -> Result<usize, Error> {
  let addon = super::modding_workspace::resolve(&app, &addon_id)?;
  tauri::async_runtime::spawn_blocking(move || {
    let root = Path::new(&addon.content_path);
    let particles = normalize_particles(root)?;
    let images = super::modding_image_compiler::sync(root)?;
    Ok(particles + images.len())
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn selected_particle_preparation_follows_children_without_reading_unrelated_sources() {
    let root = tempfile::tempdir().unwrap();
    let parent = root.path().join("parent.vpcf");
    let child = root.path().join("child.vpcf");
    let header = "<!-- kv3 encoding:text:version{old} format:vpcf60:version{old} -->";
    std::fs::write(
      &parent,
      format!("{header}\n{{ m_Children = [ {{ m_ChildRef = resource:\"child.vpcf\" }} ] }}"),
    )
    .unwrap();
    std::fs::write(
      &child,
      format!("{header}\n{{ m_Children = [ {{ m_ChildRef = resource:\"parent.vpcf\" }} ] }}"),
    )
    .unwrap();
    std::fs::write(root.path().join("unrelated.vpcf"), b"<!-- kv3 broken").unwrap();
    assert_eq!(
      normalize_selected_particles(root.path(), std::slice::from_ref(&parent)).unwrap(),
      2
    );
    assert!(std::fs::read(&parent).unwrap().starts_with(PARTICLE_HEADER));
    assert!(std::fs::read(&child).unwrap().starts_with(PARTICLE_HEADER));
    assert_eq!(
      normalize_selected_particles(root.path(), &[parent]).unwrap(),
      0
    );
    assert_eq!(
      std::fs::read(root.path().join("unrelated.vpcf")).unwrap(),
      b"<!-- kv3 broken"
    );
  }

  #[test]
  fn normalizes_nested_particles_without_changing_bodies_or_compiled_files() {
    let root = tempfile::tempdir().unwrap();
    std::fs::create_dir(root.path().join("nested")).unwrap();
    let old = b"<!-- kv3 encoding:text:version{old} format:vpcf60:version{old} -->";
    let body = b"\r\n{\r\n  label = \"keep body exactly\"\r\n}\r\n";
    let source = root.path().join("nested/effect.vpcf");
    let bytes = [b"\xef\xbb\xbf".as_slice(), old, body].concat();
    std::fs::write(&source, &bytes).unwrap();
    std::fs::write(root.path().join("effect.vpcf_c"), &bytes).unwrap();
    std::fs::write(root.path().join("other.vmat"), &bytes).unwrap();
    assert_eq!(normalize_particles(root.path()).unwrap(), 1);
    assert_eq!(
      std::fs::read(source).unwrap(),
      [b"\xef\xbb\xbf".as_slice(), PARTICLE_HEADER, body].concat()
    );
    assert_eq!(
      std::fs::read(root.path().join("effect.vpcf_c")).unwrap(),
      bytes
    );
    assert_eq!(
      std::fs::read(root.path().join("other.vmat")).unwrap(),
      bytes
    );
    assert_eq!(normalize_particles(root.path()).unwrap(), 0);
  }

  #[cfg(unix)]
  #[test]
  fn does_not_follow_symlinks_outside_the_addon() {
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    let original = b"<!-- kv3 old -->\n{}";
    std::fs::write(outside.path().join("outside.vpcf"), original).unwrap();
    std::os::unix::fs::symlink(outside.path(), root.path().join("linked")).unwrap();
    std::os::unix::fs::symlink(
      outside.path().join("outside.vpcf"),
      root.path().join("linked.vpcf"),
    )
    .unwrap();
    assert_eq!(normalize_particles(root.path()).unwrap(), 0);
    assert_eq!(
      std::fs::read(outside.path().join("outside.vpcf")).unwrap(),
      original
    );
  }
}
