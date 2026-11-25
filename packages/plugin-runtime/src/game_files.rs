//! `gameFiles.*`: read-only access to resources in the game's own archives,
//! limited to the extensions the user approved. Paths name resources inside
//! the archives, never files on disk; the adapter decides which archives
//! those are.

use crate::Error;
use crate::adapter::HostAdapter;
use crate::files::{MAX_LIST_ENTRIES, MAX_READ_BYTES, encode_base64};
use crate::manifest::ExternalPluginFileKind as FileKind;
use serde::Serialize;

const MAX_PATH: usize = 260;
const MAX_COMPONENTS: usize = 32;

#[derive(Debug)]
pub enum GameFileError {
  Denied(String),
  Invalid(String),
  Missing(String),
  Host(Error),
}

impl From<Error> for GameFileError {
  fn from(error: Error) -> Self {
    Self::Host(error)
  }
}

/// A lowercase `/`-separated resource path without traversal.
fn normalize(path: &str) -> Result<String, GameFileError> {
  let valid = !path.is_empty()
    && path.len() <= MAX_PATH
    && path.split('/').count() <= MAX_COMPONENTS
    && path.split('/').all(|component| {
      !component.is_empty()
        && component != "."
        && component != ".."
        && !component
          .chars()
          .any(|character| character.is_control() || matches!(character, '\\' | ':'))
    });
  if !valid {
    return Err(GameFileError::Invalid(
      "path must be a relative /-separated resource path".into(),
    ));
  }
  Ok(path.to_ascii_lowercase())
}

fn extension_allowed(extensions: &[String], name: &str) -> bool {
  name.rsplit_once('.').is_some_and(|(stem, extension)| {
    !stem.is_empty() && extensions.iter().any(|allowed| allowed == extension)
  })
}

#[derive(Debug, Serialize)]
pub struct ListEntry {
  name: String,
  kind: FileKind,
}

#[derive(Debug, Serialize)]
pub struct Listing {
  entries: Vec<ListEntry>,
  truncated: bool,
}

/// Folders and granted resources directly inside `path`, or at the root of
/// the archives, sorted by name.
pub fn list(
  adapter: &dyn HostAdapter,
  extensions: &[String],
  path: Option<&str>,
) -> Result<Listing, GameFileError> {
  let folder = path.map(normalize).transpose()?.unwrap_or_default();
  let mut entries: Vec<ListEntry> = adapter
    .game_entries(&folder)?
    .into_iter()
    .filter(|entry| entry.folder || extension_allowed(extensions, &entry.name))
    .map(|entry| ListEntry {
      name: entry.name,
      kind: if entry.folder {
        FileKind::Folder
      } else {
        FileKind::File
      },
    })
    .collect();
  entries.sort_by(|a, b| a.name.cmp(&b.name));
  let truncated = entries.len() > MAX_LIST_ENTRIES;
  entries.truncate(MAX_LIST_ENTRIES);
  Ok(Listing { entries, truncated })
}

#[derive(Debug, Serialize)]
pub struct Chunk {
  /// Base64; game resources are binary.
  data: String,
  size: u64,
  eof: bool,
}

pub fn read(
  adapter: &dyn HostAdapter,
  extensions: &[String],
  path: &str,
  offset: u64,
  length: Option<u64>,
) -> Result<Chunk, GameFileError> {
  let path = normalize(path)?;
  if !extension_allowed(extensions, &path) {
    return Err(GameFileError::Denied(
      "This plugin was not granted that kind of game file".into(),
    ));
  }
  let length = length.unwrap_or(MAX_READ_BYTES);
  if length == 0 || length > MAX_READ_BYTES {
    return Err(GameFileError::Invalid(
      "length must be 1-1048576 bytes".into(),
    ));
  }
  let bytes = adapter
    .read_game_file(&path)?
    .ok_or_else(|| GameFileError::Missing(format!("The game has no {path}")))?;
  let size = bytes.len() as u64;
  let start = offset.min(size) as usize;
  let end = offset.saturating_add(length).min(size) as usize;
  Ok(Chunk {
    data: encode_base64(&bytes[start..end]),
    size,
    eof: end as u64 >= size,
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::adapter::tests::TestProfiles;

  fn adapter() -> (tempfile::TempDir, TestProfiles) {
    let dir = tempfile::tempdir().unwrap();
    let adapter = TestProfiles::new(dir.path().to_path_buf());
    adapter.add_game_file("models/heroes/shiv/shiv.vmdl_c", b"model bytes");
    adapter.add_game_file("models/heroes/shiv/shiv.vnmskel_c", b"skeleton");
    adapter.add_game_file("models/heroes/shiv/materials/body.vmat_c", b"material");
    (dir, adapter)
  }

  fn granted() -> Vec<String> {
    vec!["vmat_c".into(), "vmdl_c".into()]
  }

  #[test]
  fn lists_folders_and_only_granted_extensions() {
    let (_dir, adapter) = adapter();
    let names = |path: Option<&str>| -> Vec<String> {
      list(&adapter, &granted(), path)
        .unwrap()
        .entries
        .into_iter()
        .map(|entry| entry.name)
        .collect()
    };
    assert_eq!(names(None), ["models"]);
    assert_eq!(
      names(Some("Models/Heroes/Shiv")),
      ["materials", "shiv.vmdl_c"],
      "paths are case-insensitive and the skeleton is filtered out"
    );
  }

  #[test]
  fn reads_in_chunks_and_refuses_other_extensions_and_traversal() {
    let (_dir, adapter) = adapter();
    let path = "models/heroes/shiv/shiv.vmdl_c";
    let first = read(&adapter, &granted(), path, 0, Some(5)).unwrap();
    assert_eq!(
      (first.data.as_str(), first.size, first.eof),
      ("bW9kZWw=", 11, false)
    );
    let rest = read(&adapter, &granted(), path, 5, None).unwrap();
    assert!(rest.eof);
    let past = read(&adapter, &granted(), path, 99, None).unwrap();
    assert_eq!((past.data.as_str(), past.eof), ("", true));

    assert!(matches!(
      read(
        &adapter,
        &granted(),
        "models/heroes/shiv/shiv.vnmskel_c",
        0,
        None
      ),
      Err(GameFileError::Denied(_))
    ));
    assert!(matches!(
      read(
        &adapter,
        &granted(),
        "models/heroes/shiv/gone.vmdl_c",
        0,
        None
      ),
      Err(GameFileError::Missing(_))
    ));
    for path in [
      "../pak.vmdl_c",
      "/models/a.vmdl_c",
      "models//a.vmdl_c",
      "c:/a.vmdl_c",
      "",
    ] {
      assert!(
        matches!(
          read(&adapter, &granted(), path, 0, None),
          Err(GameFileError::Invalid(_))
        ),
        "{path}"
      );
    }
    assert!(matches!(
      read(&adapter, &granted(), path, 0, Some(MAX_READ_BYTES + 1)),
      Err(GameFileError::Invalid(_))
    ));
  }
}
