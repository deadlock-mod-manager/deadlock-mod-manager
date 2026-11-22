//! Validates and unpacks a plugin archive into a fresh directory. Nothing
//! from the archive decides where a file lands except its validated
//! relative name, and every size is checked against what was actually read.

use super::abi;
use super::manifest::{PluginManifest, is_safe_package_path};
use crate::Error;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};

pub const MAX_ARCHIVE_BYTES: u64 = 64 * 1024 * 1024;
pub const MAX_EXPANDED_BYTES: u64 = 128 * 1024 * 1024;
pub const MAX_ENTRY_BYTES: u64 = 32 * 1024 * 1024;
pub const MAX_ENTRIES: usize = 1024;
pub const MAX_MANIFEST_BYTES: u64 = 64 * 1024;
const MANIFEST: &str = "manifest.json";

#[derive(Debug)]
pub struct ExtractedPackage {
  pub manifest: PluginManifest,
  pub archive_hash: String,
  pub archive_size: u64,
  pub backend_hash: Option<String>,
}

fn invalid(message: impl Into<String>) -> Error {
  Error::InvalidInput(message.into())
}

/// Unpacks `archive` into `destination`, which must not exist yet. With
/// `expected_hash`, an archive whose SHA-256 differs is refused before any
/// entry is read.
pub fn extract(
  archive: &Path,
  destination: &Path,
  expected_hash: Option<&str>,
) -> Result<ExtractedPackage, Error> {
  let metadata = fs::symlink_metadata(archive)?;
  if !metadata.is_file() {
    return Err(invalid("Select a plugin package file"));
  }
  if metadata.len() > MAX_ARCHIVE_BYTES {
    return Err(invalid("Plugin archive exceeds the 64 MiB limit"));
  }
  let mut bytes = Vec::new();
  fs::File::open(archive)?
    .take(MAX_ARCHIVE_BYTES + 1)
    .read_to_end(&mut bytes)?;
  let archive_size = bytes.len() as u64;
  if archive_size > MAX_ARCHIVE_BYTES {
    return Err(invalid("Plugin archive exceeds the 64 MiB limit"));
  }
  let archive_hash = format!("{:x}", Sha256::digest(&bytes));
  if expected_hash.is_some_and(|expected| expected != archive_hash) {
    return Err(invalid(
      "Plugin archive does not match its published SHA-256",
    ));
  }
  let mut zip = zip::ZipArchive::new(io::Cursor::new(bytes))
    .map_err(|error| invalid(format!("Plugin package is not a ZIP archive: {error}")))?;
  if zip.len() > MAX_ENTRIES {
    return Err(invalid("Plugin archive has too many entries"));
  }

  fs::create_dir(destination)?;
  let mut seen = HashSet::new();
  let mut expanded = 0u64;
  for index in 0..zip.len() {
    let mut entry = zip.by_index(index)?;
    let raw_name = entry.name().to_owned();
    let name = raw_name.strip_suffix('/').unwrap_or(&raw_name);
    let Some(target) = package_file(destination, name) else {
      return Err(invalid(format!(
        "Plugin archive entry {raw_name:?} has an unsafe path"
      )));
    };
    if entry.is_symlink() || entry.encrypted() {
      return Err(invalid(format!(
        "Plugin archive entry {name} is a symlink or encrypted"
      )));
    }
    if !seen.insert(name.to_ascii_lowercase()) {
      return Err(invalid(format!("Plugin archive lists {name} twice")));
    }
    if entry.is_dir() {
      fs::create_dir_all(&target)?;
      continue;
    }
    if let Some(parent) = target.parent() {
      fs::create_dir_all(parent)?;
    }
    let limit = MAX_ENTRY_BYTES.min(MAX_EXPANDED_BYTES - expanded);
    let mut output = fs::OpenOptions::new()
      .write(true)
      .create_new(true)
      .open(&target)?;
    let written = io::copy(&mut (&mut entry).take(limit + 1), &mut output)?;
    output.flush()?;
    if written > limit {
      return Err(invalid("Plugin archive expands beyond its size limits"));
    }
    expanded += written;
  }

  let manifest_path = destination.join(MANIFEST);
  let manifest_meta = fs::symlink_metadata(&manifest_path)
    .map_err(|_| invalid("Plugin archive has no manifest.json at its root"))?;
  if !manifest_meta.is_file() || manifest_meta.len() > MAX_MANIFEST_BYTES {
    return Err(invalid("manifest.json must be a file of at most 64 KiB"));
  }
  let manifest = PluginManifest::parse(&fs::read(&manifest_path)?).map_err(invalid)?;
  if let Some(ui) = &manifest.ui
    && !package_file(destination, ui).is_some_and(|path| path.is_file())
  {
    return Err(invalid(format!("Plugin ui entry {ui} is missing")));
  }
  let backend_hash = match &manifest.backend {
    Some(backend) => {
      let path = package_file(destination, backend)
        .filter(|path| path.is_file())
        .ok_or_else(|| invalid(format!("Plugin backend {backend} is missing")))?;
      let bytes = fs::read(path)?;
      abi::validate_module(&bytes).map_err(invalid)?;
      Some(format!("{:x}", Sha256::digest(&bytes)))
    }
    None => None,
  };
  Ok(ExtractedPackage {
    manifest,
    archive_hash,
    archive_size,
    backend_hash,
  })
}

/// Resolves a manifest-relative path inside an unpacked package.
pub fn package_file(root: &Path, relative: &str) -> Option<PathBuf> {
  is_safe_package_path(relative).then(|| {
    relative
      .split('/')
      .fold(root.to_path_buf(), |path, part| path.join(part))
  })
}

#[cfg(test)]
pub(crate) mod tests {
  use super::*;
  use zip::write::SimpleFileOptions;

  /// Every catalog permission, as the lifecycle tests grant it.
  pub(crate) fn full_permissions() -> serde_json::Value {
    serde_json::json!([
      { "id": "files", "kind": "file", "extensions": ["vpk"], "access": "read" },
      { "id": "mods", "access": ["read", "install"], "profiles": "picked" },
      { "id": "network", "hosts": ["api.example.com"] },
      { "id": "game" },
      { "id": "events", "types": ["game.started"] },
      { "id": "storage" },
      { "id": "notifications" }
    ])
  }

  pub(crate) fn manifest_json(version: &str) -> String {
    serde_json::json!({
      "schemaVersion": 1,
      "id": "example.creator-workspace-bridge",
      "name": "Creator Workspace Bridge",
      "version": version,
      "sdkVersion": 1,
      "ui": "ui/index.html",
      "backend": "backend.wasm",
      "permissions": {
        "required": full_permissions(),
        "optional": []
      }
    })
    .to_string()
  }

  pub(crate) fn write_archive(path: &Path, entries: &[(&str, &[u8])]) {
    let mut writer = zip::ZipWriter::new(fs::File::create(path).unwrap());
    for (name, bytes) in entries {
      writer
        .start_file(*name, SimpleFileOptions::default())
        .unwrap();
      writer.write_all(bytes).unwrap();
    }
    writer.finish().unwrap();
  }

  pub(crate) fn plugin_archive(path: &Path, version: &str) {
    let wasm = crate::abi::tests::test_guest();
    write_archive(
      path,
      &[
        ("manifest.json", manifest_json(version).as_bytes()),
        (
          "ui/index.html",
          b"<!doctype html><script src=\"app.js\"></script>",
        ),
        ("ui/app.js", b"console.log(1)"),
        ("backend.wasm", &wasm),
      ],
    );
  }

  #[test]
  fn unpacks_a_valid_package() {
    let dir = tempfile::tempdir().unwrap();
    let archive = dir.path().join("plugin.zip");
    plugin_archive(&archive, "0.1.0");
    let package = extract(&archive, &dir.path().join("out"), None).unwrap();
    assert_eq!(package.manifest.id, "example.creator-workspace-bridge");
    assert!(package.backend_hash.is_some());
    assert!(dir.path().join("out/ui/app.js").is_file());
  }

  #[test]
  fn rejects_traversal_duplicates_and_bad_backends() {
    let dir = tempfile::tempdir().unwrap();
    let manifest = manifest_json("0.1.0");
    let cases: Vec<Vec<(&str, &[u8])>> = vec![
      vec![
        ("../escape.txt", b"x"),
        ("manifest.json", manifest.as_bytes()),
      ],
      vec![("/abs.txt", b"x")],
      vec![("a\\b.txt", b"x")],
      vec![("UI/index.html", b"x"), ("ui/index.html", b"y")],
      vec![
        ("manifest.json", manifest.as_bytes()),
        ("ui/index.html", b"x"),
        ("backend.wasm", b"\0asm\x01\0\0\0"),
      ],
      vec![
        ("manifest.json", manifest.as_bytes()),
        ("backend.wasm", b""),
      ],
    ];
    for (index, entries) in cases.iter().enumerate() {
      let archive = dir.path().join(format!("case-{index}.zip"));
      write_archive(&archive, entries);
      let out = dir.path().join(format!("out-{index}"));
      assert!(
        extract(&archive, &out, None).is_err(),
        "case {index} must fail"
      );
      assert!(!dir.path().join("escape.txt").exists());
    }
  }

  #[test]
  fn enforces_expanded_size_from_actual_bytes() {
    let dir = tempfile::tempdir().unwrap();
    let archive = dir.path().join("bomb.zip");
    let mut writer = zip::ZipWriter::new(fs::File::create(&archive).unwrap());
    writer
      .start_file(
        "big.bin",
        SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated),
      )
      .unwrap();
    let chunk = vec![0u8; 1024 * 1024];
    for _ in 0..(MAX_ENTRY_BYTES / chunk.len() as u64 + 1) {
      writer.write_all(&chunk).unwrap();
    }
    writer.finish().unwrap();
    assert!(fs::metadata(&archive).unwrap().len() < MAX_ARCHIVE_BYTES);
    assert!(extract(&archive, &dir.path().join("out"), None).is_err());
  }
}
