//! `files.*`: access to the one file or folder the user picked while
//! granting. Paths from plugins are only ever relative names inside a picked
//! folder; the host resolves them, refuses traversal and anything that
//! redirects (symlinks, junctions, other reparse points), and applies the
//! request's extension filter to files.

use super::manifest::ExternalPluginFileKind as FileKind;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

pub const MAX_READ_BYTES: u64 = 1024 * 1024;
pub const MAX_WRITE_BYTES: usize = 4 * 1024 * 1024;
pub const MAX_LIST_ENTRIES: usize = 1000;
const MAX_RELATIVE_PATH: usize = 1024;
const MAX_COMPONENTS: usize = 32;

#[derive(Debug)]
pub enum FileError {
  /// Outside the grant: traversal, a redirect or a filtered extension.
  Denied(String),
  /// A malformed request.
  Invalid(String),
  Missing(String),
  /// Not text in the requested encoding.
  Encoding(String),
  Io(std::io::Error),
}

impl From<std::io::Error> for FileError {
  fn from(error: std::io::Error) -> Self {
    Self::Io(error)
  }
}

fn denied(message: impl Into<String>) -> FileError {
  FileError::Denied(message.into())
}

fn invalid(message: impl Into<String>) -> FileError {
  FileError::Invalid(message.into())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Encoding {
  Utf8,
  Base64,
}

impl Encoding {
  pub fn decode(self, data: &str) -> Result<Vec<u8>, FileError> {
    match self {
      Self::Utf8 => Ok(data.as_bytes().to_vec()),
      Self::Base64 => base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|error| invalid(format!("data is not base64: {error}"))),
    }
  }
}

pub fn encode_base64(bytes: &[u8]) -> String {
  base64::engine::general_purpose::STANDARD.encode(bytes)
}

/// Whether `path` passes an extension filter; an empty filter allows any.
pub fn extension_allowed(extensions: &[String], path: &Path) -> bool {
  extensions.is_empty()
    || path
      .extension()
      .and_then(|extension| extension.to_str())
      .is_some_and(|extension| {
        extensions
          .iter()
          .any(|allowed| allowed.eq_ignore_ascii_case(extension))
      })
}

/// Symlinks, junctions and every other reparse point count as redirects.
fn is_redirect(meta: &fs::Metadata) -> bool {
  #[cfg(windows)]
  {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    if meta.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
      return true;
    }
  }
  meta.file_type().is_symlink()
}

fn is_reserved_name(component: &str) -> bool {
  let stem = component
    .split('.')
    .next()
    .unwrap_or_default()
    .trim_end()
    .to_ascii_uppercase();
  matches!(
    stem.as_str(),
    "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$"
  ) || ((stem.starts_with("COM") || stem.starts_with("LPT"))
    && stem.len() == 4
    && stem.as_bytes()[3].is_ascii_digit())
}

/// Splits a plugin-supplied relative path into plain names. Traversal and
/// absolute paths are refusals; other malformed names are invalid input.
fn components(path: &str) -> Result<Vec<&str>, FileError> {
  if path.starts_with(['/', '\\']) || path.split(['/', '\\']).any(|part| part == "..") {
    return Err(denied("Paths must stay inside the granted folder"));
  }
  let parts: Vec<&str> = path.split('/').collect();
  let valid = !path.is_empty()
    && path.len() <= MAX_RELATIVE_PATH
    && parts.len() <= MAX_COMPONENTS
    && parts.iter().all(|part| {
      !part.is_empty()
        && *part != "."
        && !part.ends_with(['.', ' '])
        && !part
          .chars()
          .any(|ch| ch.is_control() || "\\:*?\"<>|".contains(ch))
        && !is_reserved_name(part)
    });
  if !valid {
    return Err(invalid(
      "path must be a relative path of plain names separated by /",
    ));
  }
  Ok(parts)
}

/// A granted file or folder: the canonical path recorded at grant time.
pub struct Scope<'a> {
  pub root: &'a Path,
  pub kind: FileKind,
  pub extensions: &'a [String],
}

/// What a plugin path resolved to.
#[derive(Debug)]
pub struct Resolved {
  pub path: PathBuf,
  /// `None` when the entry does not exist yet.
  pub meta: Option<fs::Metadata>,
  pub is_root: bool,
}

impl Resolved {
  pub fn is_dir(&self) -> bool {
    self.meta.as_ref().is_some_and(fs::Metadata::is_dir)
  }

  pub fn name(&self) -> String {
    self
      .path
      .file_name()
      .map(|name| name.to_string_lossy().into_owned())
      .unwrap_or_default()
  }
}

fn lstat(path: &Path) -> Result<Option<fs::Metadata>, FileError> {
  match fs::symlink_metadata(path) {
    Ok(meta) => Ok(Some(meta)),
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
    Err(error) => Err(error.into()),
  }
}

fn redirected() -> FileError {
  denied("The granted path now redirects somewhere else; grant it again")
}

impl Scope<'_> {
  /// Resolves an optional relative `path`. File grants take no path; folder
  /// grants resolve it inside the folder. Existing entries come back
  /// canonical, checked to still be inside the grant.
  pub fn resolve(&self, path: Option<&str>) -> Result<Resolved, FileError> {
    let root_meta = lstat(self.root)?;
    if root_meta.as_ref().is_some_and(is_redirect) {
      return Err(redirected());
    }
    match (self.kind, path) {
      (FileKind::File, Some(_)) => Err(invalid("This plugin was granted one file; omit path")),
      (FileKind::File, None) => {
        let parent = self.root.parent().ok_or_else(redirected)?;
        let canonical_parent = fs::canonicalize(parent)
          .map_err(|_| FileError::Missing("The granted file's folder no longer exists".into()))?;
        if canonical_parent != parent {
          return Err(redirected());
        }
        if root_meta.as_ref().is_some_and(fs::Metadata::is_dir) {
          return Err(denied("The granted file is now a folder; grant it again"));
        }
        Ok(Resolved {
          path: self.root.to_path_buf(),
          meta: root_meta,
          is_root: true,
        })
      }
      (FileKind::Folder, path) => {
        let root_meta = root_meta
          .filter(fs::Metadata::is_dir)
          .ok_or_else(|| FileError::Missing("The granted folder no longer exists".into()))?;
        if fs::canonicalize(self.root)? != self.root {
          return Err(redirected());
        }
        let Some(path) = path else {
          return Ok(Resolved {
            path: self.root.to_path_buf(),
            meta: Some(root_meta),
            is_root: true,
          });
        };
        let parts = components(path)?;
        let mut current = self.root.to_path_buf();
        for (index, part) in parts.iter().enumerate() {
          current.push(part);
          let meta = lstat(&current)?;
          if meta.as_ref().is_some_and(is_redirect) {
            return Err(denied(format!(
              "{path} redirects outside the granted folder"
            )));
          }
          let last = index + 1 == parts.len();
          match meta {
            None if last => {
              return Ok(Resolved {
                path: current,
                meta: None,
                is_root: false,
              });
            }
            None => return Err(FileError::Missing(format!("{path} does not exist"))),
            Some(meta) if !last && !meta.is_dir() => {
              return Err(FileError::Missing(format!("{path} does not exist")));
            }
            Some(meta) if last => {
              let canonical = fs::canonicalize(&current)?;
              if !canonical.starts_with(self.root) {
                return Err(denied(format!(
                  "{path} resolves outside the granted folder"
                )));
              }
              return Ok(Resolved {
                path: canonical,
                meta: Some(meta),
                is_root: false,
              });
            }
            Some(_) => {}
          }
        }
        Err(invalid("path is empty"))
      }
    }
  }

  /// Resolves a path that must name a file (existing or not) passing the
  /// extension filter.
  pub fn resolve_file(&self, path: Option<&str>) -> Result<Resolved, FileError> {
    let resolved = self.resolve(path)?;
    if resolved.is_dir() || (resolved.is_root && self.kind == FileKind::Folder) {
      return Err(invalid("path names a folder; name a file inside it"));
    }
    if !extension_allowed(self.extensions, &resolved.path) {
      return Err(denied(format!(
        "{} has an extension this plugin may not access",
        resolved.name()
      )));
    }
    Ok(resolved)
  }
}

fn modified_at(meta: &fs::Metadata) -> Option<String> {
  meta
    .modified()
    .ok()
    .map(|modified| chrono::DateTime::<chrono::Utc>::from(modified).to_rfc3339())
}

fn kind_of(meta: &fs::Metadata) -> FileKind {
  if meta.is_dir() {
    FileKind::Folder
  } else {
    FileKind::File
  }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
  pub exists: bool,
  pub kind: Option<FileKind>,
  pub size: Option<u64>,
  pub modified_at: Option<String>,
}

pub fn info(scope: &Scope<'_>, path: Option<&str>) -> Result<FileInfo, FileError> {
  let resolved = match scope.resolve(path) {
    Err(FileError::Missing(_)) => {
      return Ok(FileInfo {
        exists: false,
        kind: None,
        size: None,
        modified_at: None,
      });
    }
    other => other?,
  };
  if !resolved.is_dir() && !extension_allowed(scope.extensions, &resolved.path) {
    return Err(denied(format!(
      "{} has an extension this plugin may not access",
      resolved.name()
    )));
  }
  Ok(match &resolved.meta {
    None => FileInfo {
      exists: false,
      kind: None,
      size: None,
      modified_at: None,
    },
    Some(meta) => FileInfo {
      exists: true,
      kind: Some(kind_of(meta)),
      size: (!meta.is_dir()).then_some(meta.len()),
      modified_at: modified_at(meta),
    },
  })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListEntry {
  pub name: String,
  pub kind: FileKind,
  pub size: Option<u64>,
  pub modified_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Listing {
  pub entries: Vec<ListEntry>,
  /// More than [`MAX_LIST_ENTRIES`] entries matched; the rest are omitted.
  pub truncated: bool,
}

/// Entries of a folder, sorted by name. Redirects, files the extension
/// filter excludes and names that are not UTF-8 are left out.
pub fn list(scope: &Scope<'_>, path: Option<&str>) -> Result<Listing, FileError> {
  if scope.kind != FileKind::Folder {
    return Err(invalid("files.list needs a folder grant"));
  }
  let resolved = scope.resolve(path)?;
  if !resolved.is_dir() {
    return Err(match resolved.meta {
      None => FileError::Missing(format!("{} does not exist", resolved.name())),
      Some(_) => invalid("path names a file, not a folder"),
    });
  }
  let mut entries = Vec::new();
  for entry in fs::read_dir(&resolved.path)? {
    let entry = entry?;
    let Ok(name) = entry.file_name().into_string() else {
      continue;
    };
    let Ok(meta) = fs::symlink_metadata(entry.path()) else {
      continue;
    };
    if is_redirect(&meta)
      || (!meta.is_dir() && !extension_allowed(scope.extensions, Path::new(&name)))
    {
      continue;
    }
    entries.push(ListEntry {
      name,
      kind: kind_of(&meta),
      size: (!meta.is_dir()).then_some(meta.len()),
      modified_at: modified_at(&meta),
    });
  }
  entries.sort_by(|left, right| left.name.cmp(&right.name));
  let truncated = entries.len() > MAX_LIST_ENTRIES;
  entries.truncate(MAX_LIST_ENTRIES);
  Ok(Listing { entries, truncated })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Chunk {
  pub data: String,
  /// Size of the whole file.
  pub size: u64,
  /// The chunk reaches the end of the file.
  pub eof: bool,
}

/// Reads at most [`MAX_READ_BYTES`] from `offset`. A UTF-8 chunk ends on a
/// character boundary, so the next offset is `offset` plus its byte length.
pub fn read(
  scope: &Scope<'_>,
  path: Option<&str>,
  offset: u64,
  length: Option<u64>,
  encoding: Encoding,
) -> Result<Chunk, FileError> {
  let resolved = scope.resolve_file(path)?;
  if resolved.meta.is_none() {
    return Err(FileError::Missing(format!(
      "{} does not exist",
      resolved.name()
    )));
  }
  let length = length.unwrap_or(MAX_READ_BYTES);
  if length == 0 || length > MAX_READ_BYTES {
    return Err(invalid("length must be 1-1048576 bytes"));
  }
  let mut file = fs::File::open(&resolved.path)?;
  let size = file.metadata()?.len();
  let mut bytes = Vec::new();
  if offset < size {
    file.seek(SeekFrom::Start(offset))?;
    file.take(length).read_to_end(&mut bytes)?;
  }
  let end = offset.saturating_add(bytes.len() as u64);
  let data = match encoding {
    Encoding::Base64 => encode_base64(&bytes),
    Encoding::Utf8 => match String::from_utf8(bytes) {
      Ok(text) => text,
      Err(error) => {
        let valid = error.utf8_error().valid_up_to();
        let incomplete_tail = error.utf8_error().error_len().is_none() && end < size;
        if !incomplete_tail || valid == 0 {
          return Err(FileError::Encoding(
            "The file is not UTF-8 text at this offset; read it as base64".into(),
          ));
        }
        let mut bytes = error.into_bytes();
        bytes.truncate(valid);
        String::from_utf8(bytes).map_err(|_| FileError::Encoding("Invalid UTF-8".into()))?
      }
    },
  };
  let read_end = match encoding {
    Encoding::Utf8 => offset.saturating_add(data.len() as u64),
    Encoding::Base64 => end,
  };
  Ok(Chunk {
    data,
    size,
    eof: read_end >= size,
  })
}

/// Replaces the file with `bytes` through a temporary file in the same
/// folder, so readers see the old or the new content, never a mix.
pub fn write(scope: &Scope<'_>, path: Option<&str>, bytes: &[u8]) -> Result<Resolved, FileError> {
  if bytes.len() > MAX_WRITE_BYTES {
    return Err(invalid("Writes are limited to 4 MiB"));
  }
  let resolved = scope.resolve_file(path)?;
  let parent = resolved
    .path
    .parent()
    .ok_or_else(|| invalid("path has no parent folder"))?;
  let temporary = parent.join(format!(
    ".{}.{}-{}.dmm-part",
    resolved.name(),
    std::process::id(),
    chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
  ));
  let result = fs::write(&temporary, bytes).and_then(|()| fs::rename(&temporary, &resolved.path));
  if let Err(error) = result {
    let _ = fs::remove_file(&temporary);
    return Err(error.into());
  }
  Ok(resolved)
}

#[cfg(test)]
mod tests {
  use super::*;

  struct Granted {
    _dir: tempfile::TempDir,
    root: PathBuf,
    outside: PathBuf,
  }

  fn granted() -> Granted {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("work");
    fs::create_dir_all(root.join("sub")).unwrap();
    fs::write(root.join("a.json"), br#"{"a":1}"#).unwrap();
    fs::write(root.join("sub/b.json"), b"{}").unwrap();
    fs::write(root.join("secret.txt"), b"no").unwrap();
    let outside = dir.path().join("outside");
    fs::create_dir_all(&outside).unwrap();
    fs::write(outside.join("c.json"), b"{}").unwrap();
    let root = fs::canonicalize(root).unwrap();
    Granted {
      _dir: dir,
      root,
      outside,
    }
  }

  fn folder<'a>(root: &'a Path, extensions: &'a [String]) -> Scope<'a> {
    Scope {
      root,
      kind: FileKind::Folder,
      extensions,
    }
  }

  #[test]
  fn resolves_relative_paths_inside_the_folder_only() {
    let granted = granted();
    let json = ["json".to_owned()];
    let scope = folder(&granted.root, &json);
    assert_eq!(
      scope.resolve_file(Some("sub/b.json")).unwrap().path,
      granted.root.join("sub").join("b.json")
    );
    for escape in [
      "../outside/c.json",
      "sub/../../outside/c.json",
      "/etc/passwd",
      "\\Windows\\win.ini",
      "sub\\..\\..\\x.json",
    ] {
      assert!(
        matches!(scope.resolve(Some(escape)), Err(FileError::Denied(_))),
        "{escape}"
      );
    }
    for malformed in [
      "",
      "C:/x.json",
      "a.json:stream",
      "sub//b.json",
      "./a.json",
      "a.json.",
      "a.json ",
      "NUL.json",
      "sub\\b.json",
      "a\u{0}.json",
    ] {
      assert!(
        matches!(scope.resolve(Some(malformed)), Err(FileError::Invalid(_))),
        "{malformed:?}"
      );
    }
  }

  #[test]
  fn applies_the_extension_filter_to_files() {
    let granted = granted();
    let json = ["json".to_owned()];
    let scope = folder(&granted.root, &json);
    assert!(matches!(
      read(&scope, Some("secret.txt"), 0, None, Encoding::Utf8),
      Err(FileError::Denied(_))
    ));
    assert!(matches!(
      write(&scope, Some("new.exe"), b"x"),
      Err(FileError::Denied(_))
    ));
    assert!(matches!(
      info(&scope, Some("secret.txt")),
      Err(FileError::Denied(_))
    ));
    let names: Vec<_> = list(&scope, None)
      .unwrap()
      .entries
      .into_iter()
      .map(|entry| entry.name)
      .collect();
    assert_eq!(names, ["a.json", "sub"]);
    let any = folder(&granted.root, &[]);
    assert_eq!(list(&any, None).unwrap().entries.len(), 3);
  }

  #[test]
  fn file_grants_take_no_path() {
    let granted = granted();
    let file = granted.root.join("a.json");
    let scope = Scope {
      root: &file,
      kind: FileKind::File,
      extensions: &[],
    };
    assert!(matches!(
      scope.resolve(Some("a.json")),
      Err(FileError::Invalid(_))
    ));
    let chunk = read(&scope, None, 0, None, Encoding::Utf8).unwrap();
    assert_eq!(chunk.data, r#"{"a":1}"#);
    assert!(chunk.eof);
    assert!(matches!(list(&scope, None), Err(FileError::Invalid(_))));
  }

  #[test]
  fn reads_in_bounded_chunks_on_utf8_boundaries() {
    let granted = granted();
    fs::write(granted.root.join("text.json"), "aé".as_bytes()).unwrap();
    let scope = folder(&granted.root, &[]);
    let head = read(&scope, Some("text.json"), 0, Some(2), Encoding::Utf8).unwrap();
    assert_eq!((head.data.as_str(), head.size, head.eof), ("a", 3, false));
    let tail = read(&scope, Some("text.json"), 1, Some(2), Encoding::Utf8).unwrap();
    assert_eq!((tail.data.as_str(), tail.eof), ("é", true));
    let raw = read(&scope, Some("text.json"), 1, Some(1), Encoding::Base64).unwrap();
    assert_eq!(raw.data, encode_base64(&[0xc3]));
    assert!(matches!(
      read(&scope, Some("text.json"), 2, Some(1), Encoding::Utf8),
      Err(FileError::Encoding(_))
    ));
    assert!(matches!(
      read(
        &scope,
        Some("text.json"),
        0,
        Some(MAX_READ_BYTES + 1),
        Encoding::Utf8
      ),
      Err(FileError::Invalid(_))
    ));
    let past = read(&scope, Some("text.json"), 99, None, Encoding::Utf8).unwrap();
    assert!(past.data.is_empty() && past.eof);
  }

  #[test]
  fn writes_replace_files_atomically_within_limits() {
    let granted = granted();
    let scope = folder(&granted.root, &[]);
    write(&scope, Some("sub/out.json"), b"[1]").unwrap();
    write(&scope, Some("sub/out.json"), b"[2]").unwrap();
    assert_eq!(fs::read(granted.root.join("sub/out.json")).unwrap(), b"[2]");
    assert!(
      fs::read_dir(granted.root.join("sub"))
        .unwrap()
        .all(|entry| !entry
          .unwrap()
          .file_name()
          .to_string_lossy()
          .ends_with(".dmm-part"))
    );
    assert!(matches!(
      write(&scope, Some("big.bin"), &vec![0; MAX_WRITE_BYTES + 1]),
      Err(FileError::Invalid(_))
    ));
    assert!(matches!(
      write(&scope, Some("missing/out.json"), b"x"),
      Err(FileError::Missing(_))
    ));
    assert!(matches!(
      write(&scope, None, b"x"),
      Err(FileError::Invalid(_))
    ));
  }

  #[cfg(windows)]
  #[test]
  fn refuses_junctions_out_of_the_folder() {
    let granted = granted();
    let link = granted.root.join("link");
    let status = std::process::Command::new("cmd")
      .args(["/C", "mklink", "/J"])
      .arg(&link)
      .arg(&granted.outside)
      .output()
      .unwrap();
    assert!(status.status.success(), "{status:?}");
    let scope = folder(&granted.root, &[]);
    assert!(matches!(
      read(&scope, Some("link/c.json"), 0, None, Encoding::Utf8),
      Err(FileError::Denied(_))
    ));
    assert!(matches!(
      write(&scope, Some("link/c.json"), b"x"),
      Err(FileError::Denied(_))
    ));
    assert!(
      list(&scope, None)
        .unwrap()
        .entries
        .iter()
        .all(|entry| entry.name != "link")
    );
    assert_eq!(fs::read(granted.outside.join("c.json")).unwrap(), b"{}");
  }

  #[cfg(unix)]
  #[test]
  fn refuses_symlinks_out_of_the_folder() {
    let granted = granted();
    std::os::unix::fs::symlink(&granted.outside, granted.root.join("link")).unwrap();
    let scope = folder(&granted.root, &[]);
    assert!(matches!(
      read(&scope, Some("link/c.json"), 0, None, Encoding::Utf8),
      Err(FileError::Denied(_))
    ));
  }
}
