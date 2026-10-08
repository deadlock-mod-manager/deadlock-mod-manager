//! Config files extracted from archives (imports, GameBanana downloads, mod
//! downloads) wait here until the user reviews them.
//!
//! Layout: `<app data>/performance/staging/<id>/manifest.json`, with the
//! config files under `files/` at their paths inside the archive.
//!
//! An archive often holds several configs (tiers, translated copies, a stock
//! backup), so each becomes a variant. Variants are listed best first: the
//! untranslated, recommended, top-level file that actually changes something.
//! Translated copies whose settings match another variant point at it through
//! `duplicate_of`.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use serde::{Deserialize, Serialize};

use super::analyze;
use super::catalog::{self, Catalog};
use super::formats::{self, ParsedConfig};
use super::live::{normalize_value, path_key};
use super::types::{ImportFormat, ImportVariant};
use crate::errors::Error;

const MANIFEST_FILE: &str = "manifest.json";
const FILES_DIR: &str = "files";
const MAX_CONFIG_FILE_BYTES: u64 = 4 * 1024 * 1024;
const MAX_SCANNED_ENTRIES: usize = 20_000;
const MAX_SCAN_DEPTH: usize = 16;
const MAX_STAGED_FILES: usize = 200;
const STALE_AFTER: Duration = Duration::from_secs(24 * 60 * 60);

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
  label: Option<String>,
  variants: Vec<ImportVariant>,
  /// video.txt files, which are companions of a variant rather than variants.
  videos: Vec<String>,
}

/// A staged archive, opened for analysis.
pub struct StagedImport {
  pub id: String,
  /// Archive or mod name, for the suggested config name.
  pub label: Option<String>,
  pub variants: Vec<ImportVariant>,
  videos: Vec<String>,
  files_dir: PathBuf,
}

impl StagedImport {
  pub fn variant(&self, path: &str) -> Option<&ImportVariant> {
    self.variants.iter().find(|variant| variant.path == path)
  }

  pub fn read(&self, variant: &ImportVariant) -> Result<String, Error> {
    read_text(&self.files_dir.join(&variant.path))
  }

  /// The video.txt nearest to a variant: in its folder or that folder's
  /// `cfg/`, else the closest parent folder, up to the archive root.
  pub fn companion_video(&self, variant: &ImportVariant) -> Option<String> {
    let mut folder: Vec<&str> = variant.path.split('/').collect();
    folder.pop();
    loop {
      let in_folder = |video: &&String| {
        let mut parts: Vec<&str> = video.split('/').collect();
        parts.pop();
        parts == folder
          || (parts.len() == folder.len() + 1
            && parts.starts_with(&folder)
            && parts[folder.len()].eq_ignore_ascii_case("cfg"))
      };
      if let Some(video) = self.videos.iter().find(in_folder) {
        return read_text(&self.files_dir.join(video)).ok();
      }
      folder.pop()?;
    }
  }
}

pub fn staging_root(app_data_dir: &Path) -> PathBuf {
  catalog::cache_dir(app_data_dir).join("staging")
}

/// Copies config files out of an extracted mod archive. `None` when there are
/// none: a gameinfo.gi that only differs from stock outside ConVars and the
/// engine sections (the `citadel/addons` loader skins ship) doesn't count,
/// and neither does a lone video.txt.
pub fn stage_from_dir(
  app_data_dir: &Path,
  source_dir: &Path,
  label: &str,
) -> Result<Option<(String, Vec<ImportVariant>)>, Error> {
  let label = Some(label.trim()).filter(|label| !label.is_empty());
  let staged = stage(
    app_data_dir,
    source_dir,
    &catalog::current(),
    label,
    StageMode::ModDownload,
  )?;
  Ok(staged.map(|staged| (staged.id, staged.variants)))
}

/// Stages an archive the user chose to import. Unlike a mod download, every
/// config file counts, and an archive with only video.txt files lists those.
pub(super) fn stage_import(
  app_data_dir: &Path,
  source_dir: &Path,
  catalog: &Catalog,
  label: Option<&str>,
) -> Result<Option<StagedImport>, Error> {
  stage(app_data_dir, source_dir, catalog, label, StageMode::Import)
}

pub(super) fn open(app_data_dir: &Path, staging_id: &str) -> Result<StagedImport, Error> {
  let dir = staging_dir(app_data_dir, staging_id)?;
  let manifest: Manifest = fs::read(dir.join(MANIFEST_FILE))
    .ok()
    .and_then(|bytes| serde_json::from_slice(&bytes).ok())
    .ok_or_else(|| {
      Error::PerformanceConfig("This import has expired; open the file again".to_string())
    })?;
  Ok(StagedImport {
    id: staging_id.to_string(),
    label: manifest.label,
    variants: manifest.variants,
    videos: manifest.videos,
    files_dir: dir.join(FILES_DIR),
  })
}

pub fn discard(app_data_dir: &Path, staging_id: &str) -> Result<(), Error> {
  let dir = staging_dir(app_data_dir, staging_id)?;
  match fs::remove_dir_all(&dir) {
    Err(error) if error.kind() != std::io::ErrorKind::NotFound => Err(error.into()),
    _ => Ok(()),
  }
}

/// Deletes staging folders older than a day. Called at startup.
pub fn cleanup_stale(app_data_dir: &Path) {
  let Ok(entries) = fs::read_dir(staging_root(app_data_dir)) else {
    return;
  };
  let now = SystemTime::now();
  for entry in entries.flatten() {
    let is_stale = entry
      .metadata()
      .and_then(|metadata| metadata.modified())
      .is_ok_and(|modified| now.duration_since(modified).unwrap_or_default() > STALE_AFTER);
    if is_stale
      && entry.file_type().is_ok_and(|kind| kind.is_dir())
      && let Err(error) = fs::remove_dir_all(entry.path())
    {
      log::warn!(
        "Couldn't remove stale performance staging folder {:?}: {error}",
        entry.path()
      );
    }
  }
}

/// Staging ids are the random names of the folders we create; anything else
/// could name a path outside the staging root.
fn staging_dir(app_data_dir: &Path, staging_id: &str) -> Result<PathBuf, Error> {
  let valid = !staging_id.is_empty()
    && staging_id.len() <= 64
    && staging_id
      .chars()
      .all(|char| char.is_ascii_alphanumeric() || char == '-' || char == '_');
  if !valid {
    return Err(Error::InvalidInput("Invalid staging id".to_string()));
  }
  Ok(staging_root(app_data_dir).join(staging_id))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum StageMode {
  ModDownload,
  Import,
}

struct Candidate {
  /// Path inside the archive, `/`-separated.
  path: String,
  format: ImportFormat,
  parsed: ParsedConfig,
  facts: analyze::VariantFacts,
}

fn stage(
  app_data_dir: &Path,
  source_dir: &Path,
  catalog: &Catalog,
  label: Option<&str>,
  mode: StageMode,
) -> Result<Option<StagedImport>, Error> {
  let (mut candidates, videos) = collect(source_dir, catalog);
  if mode == StageMode::ModDownload {
    candidates.retain(|candidate| candidate.facts.performance_changes);
  }
  let video_only = candidates.is_empty();
  if video_only && (mode == StageMode::ModDownload || videos.is_empty()) {
    return Ok(None);
  }

  let variants = if video_only {
    videos
      .iter()
      .zip(variant_labels(&videos))
      .map(|(path, label)| ImportVariant {
        path: path.clone(),
        label,
        format: ImportFormat::VideoTxt,
        duplicate_of: None,
      })
      .collect()
  } else {
    rank_variants(candidates)
  };

  let root = staging_root(app_data_dir);
  fs::create_dir_all(&root)?;
  let dir = tempfile::Builder::new()
    .prefix("")
    .rand_bytes(12)
    .tempdir_in(&root)?;
  let files_dir = dir.path().join(FILES_DIR);
  for path in variants
    .iter()
    .map(|variant| &variant.path)
    .chain(videos.iter())
  {
    let target = files_dir.join(path);
    if let Some(parent) = target.parent() {
      fs::create_dir_all(parent)?;
    }
    fs::copy(source_dir.join(path), target)?;
  }
  let manifest = Manifest {
    label: label.map(str::to_string),
    variants,
    videos,
  };
  let json = serde_json::to_vec(&manifest)
    .map_err(|e| Error::PerformanceConfig(format!("Couldn't stage the import: {e}")))?;
  fs::write(dir.path().join(MANIFEST_FILE), json)?;

  let dir = dir.keep();
  let id = dir
    .file_name()
    .map(|name| name.to_string_lossy().to_string())
    .unwrap_or_default();
  Ok(Some(StagedImport {
    id,
    label: manifest.label,
    variants: manifest.variants,
    videos: manifest.videos,
    files_dir,
  }))
}

/// Config files under `source_dir`, and the video.txt files beside them.
/// Links are not followed and oversized or unreadable files are skipped.
fn collect(source_dir: &Path, catalog: &Catalog) -> (Vec<Candidate>, Vec<String>) {
  let mut candidates = Vec::new();
  let mut videos = Vec::new();
  let mut pending = vec![(source_dir.to_path_buf(), Vec::<String>::new())];
  let mut scanned = 0;
  while let Some((dir, prefix)) = pending.pop() {
    let Ok(entries) = fs::read_dir(&dir) else {
      continue;
    };
    for entry in entries.flatten() {
      scanned += 1;
      if scanned > MAX_SCANNED_ENTRIES || candidates.len() + videos.len() >= MAX_STAGED_FILES {
        break;
      }
      let Ok(kind) = entry.file_type() else {
        continue;
      };
      let name = entry.file_name().to_string_lossy().to_string();
      let mut parts = prefix.clone();
      parts.push(name.clone());
      if kind.is_dir() {
        if parts.len() < MAX_SCAN_DEPTH {
          pending.push((entry.path(), parts));
        }
        continue;
      }
      if !kind.is_file() || !is_config_file_name(&name) {
        continue;
      }
      let path = parts.join("/");
      let Some(text) = entry
        .metadata()
        .ok()
        .filter(|metadata| metadata.len() <= MAX_CONFIG_FILE_BYTES)
        .and_then(|_| read_text(&entry.path()).ok())
      else {
        continue;
      };
      match formats::detect_format(&text, Some(&name)) {
        Some(ImportFormat::VideoTxt) => videos.push(path),
        Some(
          format @ (ImportFormat::FullGameinfo
          | ImportFormat::ConvarsSnippet
          | ImportFormat::Cfg
          | ImportFormat::OverridesGi),
        ) => {
          let parsed = formats::parse(&text, format);
          if parsed.leaves.is_empty() {
            continue;
          }
          let facts = analyze::variant_facts(catalog, &parsed);
          candidates.push(Candidate {
            path,
            format: parsed.format,
            parsed,
            facts,
          });
        }
        _ => {}
      }
    }
  }
  candidates.sort_by(|a, b| a.path.cmp(&b.path));
  videos.sort();
  (candidates, videos)
}

/// Text files named like documentation. Readmes often quote a few convars
/// between paragraphs, which would read as a cfg.
const DOCUMENT_WORDS: &[&str] = &[
  "readme",
  "read me",
  "read_me",
  "how to",
  "instruction",
  "install",
  "license",
  "credits",
  "changelog",
  "description",
];

fn is_config_file_name(name: &str) -> bool {
  let lower = name.to_lowercase();
  if lower.ends_with(".gi") || lower.ends_with(".cfg") {
    return true;
  }
  lower.ends_with(".txt") && !DOCUMENT_WORDS.iter().any(|word| lower.contains(word))
}

fn read_text(path: &Path) -> Result<String, Error> {
  Ok(formats::decode_text(&fs::read(path)?))
}

/// Orders candidates best first and marks copies whose settings match a
/// better-ranked variant of the same format.
fn rank_variants(candidates: Vec<Candidate>) -> Vec<ImportVariant> {
  let richest = candidates
    .iter()
    .map(|candidate| convar_count(&candidate.parsed))
    .max()
    .unwrap_or_default();
  let mut ranked: Vec<(i32, Candidate)> = candidates
    .into_iter()
    .map(|candidate| (preference(&candidate, richest), candidate))
    .collect();
  ranked.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.path.cmp(&b.1.path)));

  let paths: Vec<String> = ranked
    .iter()
    .map(|(_, candidate)| candidate.path.clone())
    .collect();
  let labels = variant_labels(&paths);
  let mut originals: HashMap<(ImportFormat, SettingsSignature), String> = HashMap::new();
  let mut variants: Vec<ImportVariant> = Vec::new();
  for ((_, candidate), label) in ranked.into_iter().zip(labels) {
    let key = (candidate.format, settings_signature(&candidate.parsed));
    let duplicate_of = originals.get(&key).cloned();
    if duplicate_of.is_none() {
      originals.insert(key, candidate.path.clone());
    }
    variants.push(ImportVariant {
      path: candidate.path,
      label,
      format: candidate.format,
      duplicate_of,
    });
  }
  variants.sort_by_key(|variant| variant.duplicate_of.is_some());
  variants
}

fn convar_count(parsed: &ParsedConfig) -> usize {
  parsed
    .leaves
    .iter()
    .filter(|leaf| {
      leaf
        .path
        .first()
        .is_some_and(|section| section.eq_ignore_ascii_case("ConVars"))
    })
    .count()
}

/// Higher is better. Translated copies, stock backups, partial files and
/// files buried in folders rank low; "recommended" ranks high.
fn preference(candidate: &Candidate, richest: usize) -> i32 {
  let mut score = match candidate.format {
    ImportFormat::FullGameinfo | ImportFormat::ConvarsSnippet => 0,
    ImportFormat::Cfg => -30,
    _ => -50,
  };
  if !candidate.facts.has_changes {
    score -= 300;
  }
  match language(&candidate.path) {
    Some(language) if language.english => score += 20,
    Some(_) => score -= 200,
    None => {}
  }
  let path = candidate.path.to_lowercase();
  for (keyword, weight) in [
    ("recommended", 40),
    ("fps", 15),
    ("default", 10),
    ("potato", -10),
    ("testing", -10),
    ("extreme", -10),
    ("example", -50),
    ("backup", -30),
  ] {
    if path.contains(keyword) {
      score += weight;
    }
  }
  if words(&path).any(|word| word == "old") {
    score -= 30;
  }
  score -= 5 * candidate.path.matches('/').count() as i32;
  // Far fewer convars than the richest file: a stock copy or a fragment.
  if convar_count(&candidate.parsed) * 10 < richest * 4 {
    score -= 60;
  }
  score
}

type SettingsSignature = Vec<(String, String)>;

/// Normalized settings, ignoring FileSystem (translations mount their own
/// language folder) and comments, so translated copies compare equal.
fn settings_signature(parsed: &ParsedConfig) -> SettingsSignature {
  let leaves: Vec<_> = parsed
    .leaves
    .iter()
    .filter(|leaf| {
      !leaf
        .path
        .first()
        .is_some_and(|section| section.eq_ignore_ascii_case("FileSystem"))
    })
    .cloned()
    .collect();
  let (entries, _) = formats::collapse(&leaves);
  let mut signature: SettingsSignature = entries
    .into_iter()
    .map(|entry| {
      (
        path_key(&entry.path),
        entry
          .value
          .as_deref()
          .map(normalize_value)
          .unwrap_or_default(),
      )
    })
    .collect();
  signature.sort();
  signature
}

struct Language {
  name: &'static str,
  english: bool,
}

/// Language folder names seen in config archives, with their display name.
/// Codes only count as a whole folder name (`ru/`), names also inside one
/// (`FPS Configs (Russian)`).
const LANGUAGES: &[(&str, &str)] = &[
  ("english", "English"),
  ("russian", "Russian"),
  ("ukrainian", "Ukrainian"),
  ("belarusian", "Belarusian"),
  ("kazakh", "Kazakh"),
  ("uzbek", "Uzbek"),
  ("brazilian", "Portuguese (Brazil)"),
  ("portuguese", "Portuguese"),
  ("czech", "Czech"),
  ("french", "French"),
  ("german", "German"),
  ("italian", "Italian"),
  ("japanese", "Japanese"),
  ("schinese", "Simplified Chinese"),
  ("tchinese", "Traditional Chinese"),
  ("chinese", "Chinese"),
  ("spanish", "Spanish"),
  ("latam", "Spanish (Latin America)"),
  ("turkish", "Turkish"),
  ("arabic", "Arabic"),
  ("polish", "Polish"),
  ("koreana", "Korean"),
  ("korean", "Korean"),
  ("thai", "Thai"),
  ("vietnamese", "Vietnamese"),
  ("indonesian", "Indonesian"),
  ("hungarian", "Hungarian"),
  ("romanian", "Romanian"),
  ("русский", "Russian"),
  ("українська", "Ukrainian"),
  ("português", "Portuguese"),
  ("español", "Spanish"),
  ("deutsch", "German"),
  ("français", "French"),
];
const LANGUAGE_CODES: &[(&str, &str)] = &[
  ("en", "English"),
  ("eu", "English"),
  ("ru", "Russian"),
  ("ua", "Ukrainian"),
  ("uk", "Ukrainian"),
  ("pt", "Portuguese"),
  ("br", "Portuguese (Brazil)"),
  ("de", "German"),
  ("fr", "French"),
  ("es", "Spanish"),
  ("it", "Italian"),
  ("jp", "Japanese"),
  ("cn", "Chinese"),
  ("kr", "Korean"),
  ("tr", "Turkish"),
  ("pl", "Polish"),
  ("ar", "Arabic"),
  ("cz", "Czech"),
  ("vi", "Vietnamese"),
];

fn language(path: &str) -> Option<Language> {
  path.split('/').rev().find_map(component_language)
}

fn component_language(component: &str) -> Option<Language> {
  let lower = component.to_lowercase();
  let stem = lower
    .rsplit_once('.')
    .map_or(lower.as_str(), |(stem, _)| stem);
  let name = LANGUAGE_CODES
    .iter()
    .find(|(code, _)| *code == stem)
    .or_else(|| {
      LANGUAGES
        .iter()
        .find(|(word, _)| words(&lower).any(|candidate| candidate == *word))
    })
    .map(|(_, name)| *name)?;
  Some(Language {
    name,
    english: name == "English",
  })
}

fn words(text: &str) -> impl Iterator<Item = &str> {
  text
    .split(|char: char| !char.is_alphanumeric())
    .filter(|word| !word.is_empty())
}

/// Labels from paths: folders shared by every variant, wrapper folders such
/// as `gameinfo (now with 15 languages)` and plain file names are dropped,
/// so `dyson build/gameinfo (…)/russian/gameinfo.gi` reads `Russian`.
fn variant_labels(paths: &[String]) -> Vec<String> {
  let split: Vec<Vec<&str>> = paths.iter().map(|path| path.split('/').collect()).collect();
  let common = split
    .first()
    .map(|first| {
      let folders = &first[..first.len() - 1];
      (0..folders.len())
        .take_while(|&index| {
          split
            .iter()
            .all(|parts| parts.len() > index + 1 && parts[index] == folders[index])
        })
        .count()
    })
    .unwrap_or_default();
  let labels: Vec<String> = split
    .iter()
    .map(|parts| {
      let (file, folders) = parts
        .split_last()
        .map_or(("", &[][..]), |(file, folders)| (*file, folders));
      let mut label: Vec<String> = folders[common.min(folders.len())..]
        .iter()
        .filter(|folder| {
          let lower = folder.to_lowercase();
          !lower.starts_with("gameinfo")
            && !["localization", "translations", "cfg", "game", "citadel"].contains(&lower.as_str())
        })
        .map(|folder| {
          component_language(folder)
            .filter(|_| {
              LANGUAGES
                .iter()
                .chain(LANGUAGE_CODES)
                .any(|(word, _)| folder.eq_ignore_ascii_case(word))
            })
            .map_or_else(
              || (*folder).to_string(),
              |language| language.name.to_string(),
            )
        })
        .collect();
      let lower_file = file.to_lowercase();
      let stem = lower_file
        .rsplit_once('.')
        .map_or(lower_file.as_str(), |(stem, _)| stem);
      if stem == "gameinfo" || stem == "video" {
        if label.is_empty() {
          label.push(file.to_string());
        }
      } else if let Some(rest) = stem.strip_prefix("gameinfo") {
        let rest = rest.trim_matches(|char: char| !char.is_alphanumeric());
        label.push(if rest.is_empty() {
          file.to_string()
        } else {
          rest.to_string()
        });
      } else {
        label.push(file.to_string());
      }
      label.join(" / ")
    })
    .collect();
  labels
    .iter()
    .enumerate()
    .map(|(index, label)| {
      if labels.iter().filter(|other| *other == label).count() > 1 {
        paths[index].clone()
      } else {
        label.clone()
      }
    })
    .collect()
}

#[cfg(test)]
#[path = "staging_tests.rs"]
mod tests;
