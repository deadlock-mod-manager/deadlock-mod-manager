//! The performance-config catalog: curated presets, GameBanana references,
//! convar metadata, the history of Valve's stock gameinfo.gi and the rules for
//! what we never write.
//!
//! `packages/perf-catalog` generates `data/catalog.json`; the app bundles that
//! file and the API serves newer revisions of it. A downloaded copy is used
//! only when it parses, has a schema version we understand, and is newer than
//! the bundled one, so a bad response can never replace a good catalog.

use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, PoisonError, RwLock};

use chrono::{Duration, NaiveDate};
use serde::{Deserialize, Serialize};

use super::types::{
  CatalogOrigin, CategoryInfo, ConfigEntry, ConvarMeta, PerfTier, PresetSourceInfo, VideoSetting,
};
use crate::errors::Error;

pub const SCHEMA_VERSION: u32 = 1;

const BUNDLED_JSON: &str =
  include_str!("../../../../../../packages/perf-catalog/data/catalog.json");
const CACHE_FILE: &str = "catalog.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogFile {
  pub schema_version: u32,
  /// Sortable revision, e.g. `2026.10.08-1`.
  pub version: String,
  pub generated_at: String,
  #[serde(default)]
  pub latest_build: Option<u32>,
  /// Newest game build in the convar dump history, which convar statuses
  /// describe. Newer than `latest_build` when gameinfo.gi didn't change.
  #[serde(default)]
  pub convar_build: Option<u32>,
  pub categories: Vec<CategoryInfo>,
  /// Lower-case section name (`scenesystem`) to category id, for edits outside
  /// ConVars.
  #[serde(default)]
  pub section_categories: BTreeMap<String, String>,
  pub convars: Vec<ConvarMeta>,
  /// Valve's stock files, newest first.
  #[serde(default)]
  pub stock: Vec<StockBuild>,
  #[serde(default)]
  pub presets: Vec<CatalogPreset>,
  #[serde(default)]
  pub community: Vec<CatalogCommunityConfig>,
  pub rules: CatalogRules,
}

/// Every scalar value in one stock gameinfo.gi, except SearchPaths and list
/// sections.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StockBuild {
  pub build: u32,
  pub date: String,
  #[serde(default)]
  pub pgi_version: Option<String>,
  pub entries: Vec<ConfigEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogPreset {
  pub id: String,
  pub name: String,
  pub author: String,
  pub tier: PerfTier,
  pub blurb: String,
  #[serde(default)]
  pub highlights: Vec<String>,
  #[serde(default)]
  pub recommended: bool,
  #[serde(default)]
  pub version: Option<String>,
  #[serde(default)]
  pub updated_at: Option<String>,
  #[serde(default)]
  pub base_build: Option<u32>,
  pub source: PresetSourceInfo,
  /// The author's changes relative to `base_build`, not a whole file.
  pub entries: Vec<ConfigEntry>,
  #[serde(default)]
  pub video_settings: Vec<VideoSetting>,
  #[serde(default)]
  pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogCommunityConfig {
  pub id: String,
  pub gamebanana_id: u64,
  pub name: String,
  pub author: String,
  #[serde(default)]
  pub downloads: u64,
  #[serde(default)]
  pub updated_at: Option<String>,
  pub tier: PerfTier,
  pub blurb: String,
  #[serde(default)]
  pub base_build: Option<u32>,
  pub file_id: u64,
  #[serde(default)]
  pub variant_hint: Option<String>,
  #[serde(default)]
  pub settings_count: u32,
  #[serde(default)]
  pub engine_edit_count: u32,
  /// Settings per category, so the scale can place a config we don't ship.
  #[serde(default)]
  pub category_counts: BTreeMap<String, u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeniedRule {
  /// Exact path (case-insensitive). Either this or `pattern` is set.
  #[serde(default)]
  pub path: Option<Vec<String>>,
  /// Regex matched against the convar name (ConVars entries only).
  #[serde(default)]
  pub pattern: Option<String>,
  pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogRules {
  /// Sections we never write, as `/`-joined paths: `FileSystem`,
  /// `MaterialSystem2/RenderModes`, editor-only sections.
  pub excluded_sections: Vec<String>,
  /// Sections Valve's matchmaking message lists.
  pub guarded_sections: Vec<String>,
  #[serde(default)]
  pub denied: Vec<DeniedRule>,
}

/// A parsed catalog with lookup indexes.
#[derive(Debug)]
pub struct Catalog {
  pub file: CatalogFile,
  pub origin: CatalogOrigin,
  convar_index: HashMap<String, usize>,
  /// Section holding each key outside ConVars in the latest stock file, by
  /// lower-case key name.
  stock_sections: HashMap<String, String>,
  denied_patterns: Vec<(regex::Regex, String)>,
}

impl Catalog {
  pub fn from_file(file: CatalogFile, origin: CatalogOrigin) -> Result<Self, Error> {
    if file.schema_version != SCHEMA_VERSION {
      return Err(Error::PerformanceConfig(format!(
        "Unsupported catalog schema version {}",
        file.schema_version
      )));
    }
    let convar_index = file
      .convars
      .iter()
      .enumerate()
      .map(|(index, meta)| (meta.name.to_ascii_lowercase(), index))
      .collect();
    let denied_patterns = file
      .rules
      .denied
      .iter()
      .filter_map(|rule| {
        let pattern = rule.pattern.as_ref()?;
        match regex::RegexBuilder::new(pattern)
          .case_insensitive(true)
          .build()
        {
          Ok(regex) => Some((regex, rule.reason.clone())),
          Err(error) => {
            log::warn!("Ignoring invalid catalog deny pattern {pattern:?}: {error}");
            None
          }
        }
      })
      .collect();
    let stock_sections = file
      .stock
      .first()
      .map(|stock| index_stock_sections(&stock.entries))
      .unwrap_or_default();
    Ok(Self {
      file,
      origin,
      convar_index,
      stock_sections,
      denied_patterns,
    })
  }

  pub fn from_json(json: &str, origin: CatalogOrigin) -> Result<Self, Error> {
    let file: CatalogFile = serde_json::from_str(json)
      .map_err(|e| Error::PerformanceConfig(format!("Invalid performance catalog: {e}")))?;
    Self::from_file(file, origin)
  }

  pub fn bundled() -> Arc<Catalog> {
    static BUNDLED: LazyLock<Arc<Catalog>> = LazyLock::new(|| {
      Arc::new(
        Catalog::from_json(BUNDLED_JSON, CatalogOrigin::Bundled)
          .expect("bundled performance catalog must parse"),
      )
    });
    BUNDLED.clone()
  }

  pub fn version(&self) -> &str {
    &self.file.version
  }

  pub fn convar(&self, name: &str) -> Option<&ConvarMeta> {
    self
      .convar_index
      .get(&name.to_ascii_lowercase())
      .map(|&index| &self.file.convars[index])
  }

  pub fn preset(&self, id: &str) -> Option<&CatalogPreset> {
    self.file.presets.iter().find(|preset| preset.id == id)
  }

  pub fn presets(&self) -> &[CatalogPreset] {
    &self.file.presets
  }

  pub fn community(&self) -> &[CatalogCommunityConfig] {
    &self.file.community
  }

  /// Valve's stock files, newest first.
  pub fn stock_builds(&self) -> &[StockBuild] {
    &self.file.stock
  }

  pub fn latest_stock(&self) -> Option<&StockBuild> {
    self.file.stock.first()
  }

  /// The section outside ConVars where Valve's latest gameinfo.gi sets a key
  /// with this name (`SceneSystem` for `CubemapFog`), dot-joined.
  pub fn stock_section_of(&self, key: &str) -> Option<&str> {
    self
      .stock_sections
      .get(&key.to_ascii_lowercase())
      .map(String::as_str)
  }

  pub fn categories(&self) -> &[CategoryInfo] {
    &self.file.categories
  }

  pub fn category_weight(&self, id: &str) -> f32 {
    self
      .file
      .categories
      .iter()
      .find(|category| category.id == id)
      .map_or(0.0, |category| category.weight)
  }

  /// Category for an edit outside ConVars, by its top-level section.
  pub fn section_category(&self, section: &str) -> &str {
    self
      .file
      .section_categories
      .get(&section.to_ascii_lowercase())
      .map_or("other", String::as_str)
  }

  pub fn rules(&self) -> &CatalogRules {
    &self.file.rules
  }

  /// The excluded section this path falls in, if any.
  pub fn excluded_section(&self, path: &[String]) -> Option<&str> {
    self
      .file
      .rules
      .excluded_sections
      .iter()
      .find(|section| path_has_prefix(path, section))
      .map(String::as_str)
  }

  pub fn is_guarded_section(&self, section: &str) -> bool {
    self
      .file
      .rules
      .guarded_sections
      .iter()
      .any(|guarded| guarded.eq_ignore_ascii_case(section))
  }

  /// Why we refuse to write this path, if we do.
  pub fn denied_reason(&self, path: &[String]) -> Option<&str> {
    for rule in &self.file.rules.denied {
      if let Some(rule_path) = &rule.path
        && rule_path.len() == path.len()
        && rule_path
          .iter()
          .zip(path)
          .all(|(a, b)| a.eq_ignore_ascii_case(b))
      {
        return Some(&rule.reason);
      }
    }
    let is_convar = path.len() >= 2 && path[0].eq_ignore_ascii_case("ConVars");
    if is_convar {
      for (regex, reason) in &self.denied_patterns {
        if regex.is_match(&path[1]) {
          return Some(reason);
        }
      }
    }
    None
  }

  /// Case-insensitive substring search over names, labels and help text.
  pub fn search_convars(&self, query: &str, limit: usize) -> Vec<&ConvarMeta> {
    let needle = query.trim().to_ascii_lowercase();
    if needle.is_empty() {
      return Vec::new();
    }
    let mut ranked: Vec<(u8, &ConvarMeta)> = self
      .file
      .convars
      .iter()
      .filter_map(|meta| {
        let name = meta.name.to_ascii_lowercase();
        let rank = if name == needle {
          0
        } else if name.starts_with(&needle) {
          1
        } else if name.contains(&needle) {
          2
        } else if meta
          .label
          .as_deref()
          .is_some_and(|label| label.to_ascii_lowercase().contains(&needle))
        {
          3
        } else if meta
          .help
          .as_deref()
          .or(meta.description.as_deref())
          .is_some_and(|text| text.to_ascii_lowercase().contains(&needle))
        {
          4
        } else {
          return None;
        };
        Some((rank, meta))
      })
      .collect();
    ranked.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.name.cmp(&b.1.name)));
    ranked
      .into_iter()
      .take(limit)
      .map(|(_, meta)| meta)
      .collect()
  }
}

/// Whether `path` starts with the `/`-joined `prefix` (case-insensitive).
pub fn path_has_prefix(path: &[String], prefix: &str) -> bool {
  let parts: Vec<&str> = prefix.split('/').filter(|part| !part.is_empty()).collect();
  parts.len() <= path.len()
    && parts
      .iter()
      .zip(path)
      .all(|(a, b)| a.eq_ignore_ascii_case(b))
}

static CURRENT: LazyLock<RwLock<Arc<Catalog>>> = LazyLock::new(|| RwLock::new(Catalog::bundled()));

/// The newest valid catalog: a downloaded copy when it beats the bundled one.
pub fn current() -> Arc<Catalog> {
  CURRENT
    .read()
    .unwrap_or_else(PoisonError::into_inner)
    .clone()
}

fn set_current(catalog: Arc<Catalog>) {
  *CURRENT.write().unwrap_or_else(PoisonError::into_inner) = catalog;
}

pub fn cache_dir(app_data_dir: &Path) -> PathBuf {
  app_data_dir.join("performance")
}

/// Loads a previously downloaded catalog if it is newer than the bundled one.
/// Called once at startup; a broken cache file is ignored and left for the next
/// refresh to overwrite.
pub fn load_cached(app_data_dir: &Path) {
  if let Some(catalog) = read_cache(app_data_dir, today()) {
    log::info!("Using downloaded performance catalog {}", catalog.version());
    set_current(Arc::new(catalog));
  }
}

fn read_cache(app_data_dir: &Path, today: NaiveDate) -> Option<Catalog> {
  let json = std::fs::read_to_string(cache_dir(app_data_dir).join(CACHE_FILE)).ok()?;
  let catalog = Catalog::from_json(&json, CatalogOrigin::Downloaded)
    .and_then(|catalog| check_version_date(catalog.version(), today).map(|()| catalog));
  match catalog {
    Ok(catalog) => is_newer(catalog.version(), Catalog::bundled().version()).then_some(catalog),
    Err(error) => {
      log::warn!("Ignoring cached performance catalog: {error}");
      None
    }
  }
}

/// Fetches the API's catalog and adopts it when it is newer than what we have.
pub async fn refresh_from_api(api_url: &str, app_data_dir: &Path) -> Result<Arc<Catalog>, Error> {
  let url = format!("{api_url}/api/v2/perf-catalog");
  let client = crate::proxy::build_default_http_client()?;
  let response = client
    .get(&url)
    .send()
    .await
    .map_err(|e| Error::Network(format!("Failed to download performance catalog: {e}")))?;
  if !response.status().is_success() {
    return Err(Error::Network(format!(
      "Performance catalog request failed with status {}",
      response.status()
    )));
  }
  let json = response
    .text()
    .await
    .map_err(|e| Error::Network(format!("Failed to read performance catalog: {e}")))?;
  let catalog = Catalog::from_json(&json, CatalogOrigin::Downloaded)?;
  check_version_date(catalog.version(), today())?;
  let existing = current();
  if !is_newer(catalog.version(), existing.version()) {
    return Ok(existing);
  }
  let dir = cache_dir(app_data_dir);
  std::fs::create_dir_all(&dir)?;
  let mut file = tempfile::NamedTempFile::new_in(&dir)?;
  std::io::Write::write_all(&mut file, json.as_bytes())?;
  file
    .persist(dir.join(CACHE_FILE))
    .map_err(|e| Error::FileWriteFailed(e.to_string()))?;
  log::info!("Updated performance catalog to {}", catalog.version());
  let catalog = Arc::new(catalog);
  set_current(catalog.clone());
  Ok(catalog)
}

/// Versions are `YYYY.MM.DD-N`; compare the date, then the counter.
fn is_newer(candidate: &str, existing: &str) -> bool {
  fn key(version: &str) -> (String, u64) {
    let (date, counter) = version.split_once('-').unwrap_or((version, "0"));
    (date.to_string(), counter.parse().unwrap_or(0))
  }
  key(candidate) > key(existing)
}

/// Days a catalog version may run ahead of the local date (time zones, a
/// clock that's a little behind).
const MAX_DAYS_AHEAD: i64 = 2;

/// Refuses a version dated further ahead than [`MAX_DAYS_AHEAD`]: it would
/// stay "newer" than every real release until that date and pin itself.
fn check_version_date(version: &str, today: NaiveDate) -> Result<(), Error> {
  let date = version_date(version).ok_or_else(|| {
    Error::PerformanceConfig(format!(
      "Unrecognised performance catalog version {version:?}"
    ))
  })?;
  if date > today + Duration::days(MAX_DAYS_AHEAD) {
    return Err(Error::PerformanceConfig(format!(
      "Performance catalog {version} is dated in the future"
    )));
  }
  Ok(())
}

fn version_date(version: &str) -> Option<NaiveDate> {
  let (date, _) = version.split_once('-')?;
  NaiveDate::parse_from_str(date, "%Y.%m.%d").ok()
}

fn today() -> NaiveDate {
  chrono::Local::now().date_naive()
}

fn index_stock_sections(entries: &[ConfigEntry]) -> HashMap<String, String> {
  let mut sections = HashMap::new();
  for entry in entries {
    let [section @ .., key] = entry.path.as_slice() else {
      continue;
    };
    if section.is_empty() || section[0].eq_ignore_ascii_case("ConVars") {
      continue;
    }
    sections
      .entry(key.to_ascii_lowercase())
      .or_insert_with(|| section.join("."));
  }
  sections
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn refuses_versions_dated_in_the_future() {
    let today = NaiveDate::from_ymd_opt(2026, 10, 8).expect("date");
    assert!(check_version_date("2026.10.08-1", today).is_ok());
    assert!(check_version_date("2025.01.01-3", today).is_ok());
    assert!(check_version_date("2026.10.10-9", today).is_ok());
    assert!(check_version_date("2026.10.11-1", today).is_err());
    assert!(check_version_date("2099.01.01-1", today).is_err());
    assert!(check_version_date("2026.13.01-1", today).is_err());
    assert!(check_version_date("latest", today).is_err());
  }

  #[test]
  fn uses_a_cached_catalog_only_once_its_date_has_come() {
    let bundled = version_date(Catalog::bundled().version()).expect("bundled version date");
    let ahead = bundled + Duration::days(5);
    let mut file = Catalog::bundled().file.clone();
    file.version = format!("{}-1", ahead.format("%Y.%m.%d"));
    let dir = tempfile::tempdir().expect("tempdir");
    std::fs::create_dir_all(cache_dir(dir.path())).expect("cache dir");
    std::fs::write(
      cache_dir(dir.path()).join(CACHE_FILE),
      serde_json::to_string(&file).expect("json"),
    )
    .expect("write cache");

    assert!(read_cache(dir.path(), bundled).is_none());
    let cached = read_cache(dir.path(), ahead).expect("cached catalog");
    assert_eq!(cached.version(), file.version);
    assert_eq!(cached.origin, CatalogOrigin::Downloaded);
  }

  #[test]
  fn bundled_catalog_parses() {
    let catalog = Catalog::bundled();
    assert_eq!(catalog.file.schema_version, SCHEMA_VERSION);
  }

  #[test]
  fn compares_versions_by_date_then_counter() {
    assert!(is_newer("2026.10.09-1", "2026.10.08-3"));
    assert!(is_newer("2026.10.08-10", "2026.10.08-9"));
    assert!(!is_newer("2026.10.08-1", "2026.10.08-1"));
    assert!(!is_newer("2026.10.07-5", "2026.10.08-1"));
  }

  #[test]
  fn section_prefixes_match_case_insensitively() {
    let path = vec![
      "MaterialSystem2".to_string(),
      "RenderModes".to_string(),
      "game".to_string(),
    ];
    assert!(path_has_prefix(&path, "materialsystem2/rendermodes"));
    assert!(!path_has_prefix(&path, "MaterialSystem2/Other"));
    assert!(!path_has_prefix(&path[..1], "MaterialSystem2/RenderModes"));
  }
}
