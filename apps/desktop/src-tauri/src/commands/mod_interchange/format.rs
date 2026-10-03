//! The manager-neutral "Deadlock Mod Interchange" document (see
//! `rfcs/001-mod-interchange/proposal.md`). Every reader produces it, every importer
//! consumes it, so a new mod manager only has to speak this one shape.

use crate::errors::Error;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::{Component, Path, PathBuf};

pub const FORMAT_ID: &str = "deadlock-mod-interchange";
pub const FORMAT_VERSION: u32 = 1;
pub const MANIFEST_FILENAME: &str = "mod-interchange.json";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterchangeSource {
  #[serde(default)]
  pub manager: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub manager_version: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub profile_name: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SubmissionKind {
  Mod,
  Sound,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameBananaOrigin {
  pub submission_type: SubmissionKind,
  pub submission_id: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub file_id: Option<u64>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub file_name: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalOrigin {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub local_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "provider")]
pub enum InterchangeOrigin {
  #[serde(rename = "gamebanana")]
  GameBanana(GameBananaOrigin),
  #[serde(rename = "local")]
  Local(LocalOrigin),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterchangeFile {
  pub name: String,
  pub path: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub sha256: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub size: Option<u64>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub selected: Option<bool>,
}

impl InterchangeFile {
  pub fn is_selected(&self) -> bool {
    self.selected.unwrap_or(true)
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterchangeMod {
  pub key: String,
  pub name: String,
  #[serde(default)]
  pub enabled: bool,
  #[serde(default)]
  pub order: u32,
  pub origin: InterchangeOrigin,
  #[serde(default)]
  pub author: Option<String>,
  #[serde(default)]
  pub description: Option<String>,
  #[serde(default)]
  pub category: Option<String>,
  #[serde(default)]
  pub hero: Option<String>,
  #[serde(default)]
  pub thumbnail_url: Option<String>,
  #[serde(default)]
  pub link: Option<String>,
  #[serde(default)]
  pub nsfw: Option<bool>,
  #[serde(default)]
  pub files: Vec<InterchangeFile>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub extensions: Option<serde_json::Value>,
}

/// One mod's membership in a profile.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InterchangeProfileMod {
  pub mod_key: String,
  #[serde(default)]
  pub enabled: bool,
  #[serde(default)]
  pub order: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterchangeProfile {
  pub key: String,
  pub name: String,
  #[serde(default)]
  pub active: bool,
  #[serde(default)]
  pub description: Option<String>,
  #[serde(default)]
  pub mods: Vec<InterchangeProfileMod>,
  #[serde(default)]
  pub crosshair_key: Option<String>,
  #[serde(default)]
  pub autoexec: Option<Vec<String>>,
}

/// A crosshair as the game's own `citadel_crosshair_*` convars.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterchangeCrosshair {
  pub key: String,
  pub name: String,
  #[serde(default)]
  pub active: bool,
  #[serde(default)]
  pub convars: std::collections::BTreeMap<String, String>,
}

pub const SECTION_MODS: &str = "mods";
pub const SECTION_PROFILES: &str = "profiles";
pub const SECTION_CROSSHAIRS: &str = "crosshairs";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterchangeDocument {
  pub format: String,
  pub version: u32,
  #[serde(default)]
  pub created_at: Option<String>,
  #[serde(default)]
  pub source: InterchangeSource,
  /// Sections the producer included (`mods`, `profiles`, `crosshairs`).
  #[serde(default)]
  pub contents: Vec<String>,
  #[serde(default)]
  pub mods: Vec<InterchangeMod>,
  #[serde(default)]
  pub profiles: Vec<InterchangeProfile>,
  #[serde(default)]
  pub crosshairs: Vec<InterchangeCrosshair>,
  #[serde(default)]
  pub warnings: Vec<String>,
}

impl InterchangeDocument {
  pub fn new(source: InterchangeSource) -> Self {
    Self {
      format: FORMAT_ID.to_string(),
      version: FORMAT_VERSION,
      created_at: Some(chrono::Utc::now().to_rfc3339()),
      source,
      contents: vec![SECTION_MODS.to_string()],
      mods: Vec::new(),
      profiles: Vec::new(),
      crosshairs: Vec::new(),
      warnings: Vec::new(),
    }
  }

  /// Record that a section is present (idempotent).
  pub fn include(&mut self, section: &str) {
    if !self.contents.iter().any(|existing| existing == section) {
      self.contents.push(section.to_string());
    }
  }
}

/// Parse an optional array section entry by entry; broken entries become
/// warnings. Duplicate keys keep the first entry.
fn parse_section<T: serde::de::DeserializeOwned>(
  object: &serde_json::Map<String, serde_json::Value>,
  name: &str,
  key_of: impl Fn(&T) -> &str,
  warnings: &mut Vec<String>,
) -> Vec<T> {
  let mut parsed = Vec::new();
  let mut seen = std::collections::HashSet::new();
  let entries = object
    .get(name)
    .and_then(|v| v.as_array())
    .cloned()
    .unwrap_or_default();
  for (index, entry) in entries.into_iter().enumerate() {
    match serde_json::from_value::<T>(entry) {
      Ok(item) if key_of(&item).trim().is_empty() => {
        warnings.push(format!("Skipped {name} entry #{index}: it has no key"));
      }
      Ok(item) if !seen.insert(key_of(&item).to_string()) => {
        warnings.push(format!("Skipped duplicate {name} key {}", key_of(&item)));
      }
      Ok(item) => parsed.push(item),
      Err(error) => warnings.push(format!("Skipped unreadable {name} entry #{index}: {error}")),
    }
  }
  parsed
}

/// Parse a document leniently: the envelope must be valid, but a single broken
/// mod entry only costs that entry (reported as a warning), never the import.
pub fn parse_document(json: &str) -> Result<InterchangeDocument, Error> {
  let raw: serde_json::Value = serde_json::from_str(json)
    .map_err(|e| Error::InvalidInput(format!("{MANIFEST_FILENAME} is not valid JSON: {e}")))?;
  let object = raw
    .as_object()
    .ok_or_else(|| Error::InvalidInput(format!("{MANIFEST_FILENAME} must be a JSON object")))?;

  let format = object.get("format").and_then(|v| v.as_str()).unwrap_or("");
  if format != FORMAT_ID {
    return Err(Error::InvalidInput(format!(
      "Not a mod interchange document (format is \"{format}\", expected \"{FORMAT_ID}\")"
    )));
  }
  let version = object
    .get("version")
    .and_then(|v| v.as_u64())
    .ok_or_else(|| Error::InvalidInput("Interchange document has no version".to_string()))?;
  if version == 0 || version > u64::from(FORMAT_VERSION) {
    return Err(Error::InvalidInput(format!(
      "Unsupported interchange version {version} (this build understands {FORMAT_VERSION})"
    )));
  }

  let source = object
    .get("source")
    .cloned()
    .and_then(|v| serde_json::from_value::<InterchangeSource>(v).ok())
    .unwrap_or_default();
  let created_at = object
    .get("createdAt")
    .and_then(|v| v.as_str())
    .map(str::to_string);
  let mut warnings: Vec<String> = object
    .get("warnings")
    .and_then(|v| v.as_array())
    .map(|items| {
      items
        .iter()
        .filter_map(|item| item.as_str().map(str::to_string))
        .collect()
    })
    .unwrap_or_default();

  let mods: Vec<InterchangeMod> = parse_section(
    object,
    SECTION_MODS,
    |m: &InterchangeMod| &m.key,
    &mut warnings,
  );
  let mut profiles: Vec<InterchangeProfile> = parse_section(
    object,
    SECTION_PROFILES,
    |p: &InterchangeProfile| &p.key,
    &mut warnings,
  );
  let crosshairs: Vec<InterchangeCrosshair> = parse_section(
    object,
    SECTION_CROSSHAIRS,
    |c: &InterchangeCrosshair| &c.key,
    &mut warnings,
  );
  drop_dangling_profile_entries(&mods, &mut profiles, &mut warnings);

  let mut contents: Vec<String> = object
    .get("contents")
    .and_then(|v| v.as_array())
    .map(|items| {
      items
        .iter()
        .filter_map(|i| i.as_str().map(str::to_string))
        .collect()
    })
    .unwrap_or_default();
  // Older documents have no `contents`: infer it from what is there.
  for (section, present) in [
    (SECTION_MODS, true),
    (SECTION_PROFILES, !profiles.is_empty()),
    (SECTION_CROSSHAIRS, !crosshairs.is_empty()),
  ] {
    if present && !contents.iter().any(|c| c == section) {
      contents.push(section.to_string());
    }
  }

  Ok(InterchangeDocument {
    format: FORMAT_ID.to_string(),
    version: version as u32,
    created_at,
    source,
    contents,
    mods,
    profiles,
    crosshairs,
    warnings,
  })
}

/// A profile may only point at mods the document carries; anything else is
/// dropped with a warning instead of being guessed.
pub fn drop_dangling_profile_entries(
  mods: &[InterchangeMod],
  profiles: &mut [InterchangeProfile],
  warnings: &mut Vec<String>,
) {
  let mod_keys: std::collections::HashSet<&str> = mods.iter().map(|m| m.key.as_str()).collect();
  for profile in profiles.iter_mut() {
    let before = profile.mods.len();
    profile
      .mods
      .retain(|entry| mod_keys.contains(entry.mod_key.as_str()));
    let dropped = before - profile.mods.len();
    if dropped > 0 {
      warnings.push(format!(
        "Profile {}: {dropped} entry(s) point at mods that are not available",
        profile.name
      ));
    }
  }
}

/// Accepts either a bundle directory or the path of its manifest file.
pub fn manifest_path_for(path: &Path) -> PathBuf {
  if path.is_dir() {
    path.join(MANIFEST_FILENAME)
  } else {
    path.to_path_buf()
  }
}

/// Read a bundle from disk and rewrite every file path to an absolute path.
/// Paths that are absolute, contain `..`, or escape the bundle are dropped
/// (the mod is then skipped at import time for having no files).
pub fn read_bundle(path: &Path) -> Result<InterchangeDocument, Error> {
  let manifest_path = manifest_path_for(path);
  let json = std::fs::read_to_string(&manifest_path)
    .map_err(|e| Error::InvalidInput(format!("Could not read {}: {e}", manifest_path.display())))?;
  let mut document = parse_document(&json)?;
  let base = manifest_path
    .parent()
    .ok_or_else(|| Error::InvalidInput("Bundle manifest has no parent directory".to_string()))?;
  let base = base.canonicalize().unwrap_or_else(|_| base.to_path_buf());

  let mut warnings = Vec::new();
  for entry in &mut document.mods {
    entry
      .files
      .retain_mut(|file| match resolve_bundle_path(&base, &file.path) {
        Some(resolved) => {
          file.path = resolved.to_string_lossy().to_string();
          true
        }
        None => {
          warnings.push(format!(
            "{}: ignored file path outside the bundle ({})",
            entry.name, file.path
          ));
          false
        }
      });
  }
  document.warnings.extend(warnings);
  Ok(document)
}

fn resolve_bundle_path(base: &Path, relative: &str) -> Option<PathBuf> {
  let relative = Path::new(relative);
  if relative.is_absolute()
    || relative
      .components()
      .any(|c| !matches!(c, Component::Normal(_) | Component::CurDir))
  {
    return None;
  }
  let joined = base.join(relative);
  match joined.canonicalize() {
    Ok(canonical) if canonical.starts_with(base) => Some(canonical),
    Ok(_) => None,
    // Missing files are reported by the importer, not here.
    Err(_) => Some(joined),
  }
}

/// A value is safe to use as a file name only if it is exactly one plain
/// component ending in `.vpk`.
pub fn is_plain_vpk_name(name: &str) -> bool {
  !name.is_empty()
    && !name.contains('/')
    && !name.contains('\\')
    && Path::new(name).file_name().and_then(|n| n.to_str()) == Some(name)
    && name.to_ascii_lowercase().ends_with(".vpk")
}

/// Lowercase, filesystem-safe slug used for folder and file names.
pub fn slugify(value: &str, max_len: usize) -> String {
  let mut slug = String::new();
  let mut last_dash = true;
  for ch in value.chars() {
    if ch.is_ascii_alphanumeric() {
      slug.push(ch.to_ascii_lowercase());
      last_dash = false;
    } else if !last_dash {
      slug.push('_');
      last_dash = true;
    }
    if slug.len() >= max_len {
      break;
    }
  }
  slug.trim_matches('_').to_string()
}

pub fn sha256_file(path: &Path) -> Result<String, Error> {
  let mut file = std::fs::File::open(path)?;
  let mut hasher = Sha256::new();
  let mut buffer = vec![0u8; 1 << 20];
  loop {
    let read = file.read(&mut buffer)?;
    if read == 0 {
      break;
    }
    hasher.update(&buffer[..read]);
  }
  Ok(format!("{:x}", hasher.finalize()))
}

pub fn sha256_hex(value: &str) -> String {
  format!("{:x}", Sha256::digest(value.as_bytes()))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn parse_keeps_good_entries_and_reports_bad_ones() {
    let json = r#"{
      "format": "deadlock-mod-interchange",
      "version": 1,
      "futureField": true,
      "mods": [
        {"key": "gamebanana:mod:1", "name": "A", "enabled": true, "order": 0,
         "origin": {"provider": "gamebanana", "submissionType": "mod", "submissionId": "1"},
         "files": [{"name": "a_dir.vpk", "path": "files/a/a_dir.vpk"}]},
        {"key": "x:1", "name": "B", "origin": {"provider": "somewhere-else"}},
        {"key": "gamebanana:mod:1", "name": "dup",
         "origin": {"provider": "local"}}
      ]
    }"#;
    let document = parse_document(json).unwrap();
    assert_eq!(document.mods.len(), 1);
    assert_eq!(document.warnings.len(), 2);
    assert_eq!(document.contents, vec!["mods".to_string()]);
    assert!(document.mods[0].files[0].is_selected());
  }

  #[test]
  fn parse_reads_optional_sections_and_drops_dangling_profile_entries() {
    let json = r#"{
      "format": "deadlock-mod-interchange",
      "version": 1,
      "mods": [{"key": "local:a", "name": "A", "origin": {"provider": "local"}}],
      "profiles": [{"key": "p1", "name": "Ranked", "active": true,
        "mods": [{"modKey": "local:a", "enabled": true}, {"modKey": "missing"}]}],
      "crosshairs": [{"key": "c1", "name": "Dot", "convars": {"citadel_crosshair_pip_gap": "4"}}]
    }"#;
    let document = parse_document(json).unwrap();
    assert_eq!(document.contents, ["mods", "profiles", "crosshairs"]);
    assert_eq!(document.profiles[0].mods.len(), 1);
    assert_eq!(
      document.crosshairs[0].convars["citadel_crosshair_pip_gap"],
      "4"
    );
    assert!(document.warnings.iter().any(|w| w.contains("Ranked")));
  }

  #[test]
  fn parse_rejects_wrong_format_and_future_versions() {
    assert!(parse_document(r#"{"format": "other", "version": 1}"#).is_err());
    assert!(parse_document(r#"{"format": "deadlock-mod-interchange", "version": 2}"#).is_err());
  }

  #[test]
  fn bundle_paths_cannot_escape_the_bundle() {
    let dir = tempfile::tempdir().unwrap();
    let base = dir.path().canonicalize().unwrap();
    assert!(resolve_bundle_path(&base, "../outside.vpk").is_none());
    assert!(resolve_bundle_path(&base, "files/a.vpk").is_some());
  }

  #[test]
  fn plain_vpk_names() {
    assert!(is_plain_vpk_name("pak01_dir.vpk"));
    assert!(!is_plain_vpk_name("../pak01_dir.vpk"));
    assert!(!is_plain_vpk_name("readme.txt"));
  }
}
