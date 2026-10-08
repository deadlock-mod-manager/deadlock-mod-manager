//! Turns a config, the user's overrides and the catalog rules into the list of
//! entries that will be written, each with a status the UI can explain.
//!
//! Entries are deduplicated by path first (the last one wins, as in a file).
//! Rules, in order:
//! 1. Root keys (`PGIVersion`) and excluded sections (FileSystem, RenderModes,
//!    editor-only sections) → `Excluded`.
//! 2. Denied paths/patterns → `Denied`.
//! 3. ConVars: blocked → `Blocked`; not in the dump → `Removed` (with a
//!    `SectionKey` note when Valve's file sets the key in another section);
//!    concommand →
//!    `NotConvar`; devtools → `Omitted` unless the user enabled them or set a
//!    value; user omit → `Omitted`; same as live, or as the convar's default
//!    when the live file doesn't set it → `Unchanged`; object leaf
//!    for a key the live file lacks, a value where the file has a block, or
//!    text gameinfo.gi can't hold → `Unsupported`; otherwise `Applies`
//!    (+ `Clamped`/`TypeMismatch` notes).
//!    Camera and visibility convars apply as the author set them.
//! 4. Other sections: user omit → `Omitted`; same as live → `Unchanged`;
//!    otherwise `EngineSection` unless engine sections are included, then
//!    `Applies` (or `Unsupported` when the section is missing).
//!
//! Commenting a key out (`value: None`) only changes something when the live
//! file has the key; otherwise it is `Unchanged`.

use std::collections::{BTreeMap, HashMap};

use sha2::{Digest, Sha256};

use super::catalog::Catalog;
use super::live::{LiveGameinfo, normalize_value, path_key, values_equal};
use super::patch;
use super::types::{
  ConfigEntry, ConvarKind, ConvarMeta, ConvarStatus, EntryNote, EntryOverride, EntryStatus,
  GameplayClass, OverrideAction, PerfConfigSource, ResolvedConfig, ResolvedCounts, ResolvedEntry,
};
use crate::errors::Error;

pub struct ResolveOptions<'a> {
  pub overrides: &'a [EntryOverride],
  pub include_engine_sections: bool,
}

/// How many settings in one category it takes to get most of that category's
/// weight: `1 - e^(-n / 25)` is 18% at five settings, 63% at 25, 91% at 60.
/// Community configs set 5 to 70 settings per category, so a smaller constant
/// saturates every one of them and the scale stops telling them apart.
const CATEGORY_SATURATION: f32 = 25.0;

pub fn resolve(
  catalog: &Catalog,
  entries: &[ConfigEntry],
  live: &LiveGameinfo,
  options: &ResolveOptions,
) -> ResolvedConfig {
  let mut overrides: HashMap<String, &OverrideAction> = HashMap::new();
  for entry_override in options.overrides {
    overrides.insert(path_key(&entry_override.path), &entry_override.action);
  }

  let mut candidates: Vec<Candidate> = Vec::new();
  let mut positions: HashMap<String, usize> = HashMap::new();
  for entry in entries.iter().filter(|entry| !entry.path.is_empty()) {
    let key = path_key(&entry.path);
    let candidate = Candidate {
      path: &entry.path,
      config_value: entry.value.clone(),
      in_config: true,
      action: overrides.get(&key).copied(),
    };
    match positions.get(&key) {
      Some(&position) => candidates[position] = candidate,
      None => {
        positions.insert(key, candidates.len());
        candidates.push(candidate);
      }
    }
  }
  for entry_override in options.overrides {
    let key = path_key(&entry_override.path);
    if entry_override.path.is_empty() || positions.contains_key(&key) {
      continue;
    }
    if let Some(action @ OverrideAction::Set { .. }) = overrides.get(&key).copied() {
      positions.insert(key, candidates.len());
      candidates.push(Candidate {
        path: &entry_override.path,
        config_value: None,
        in_config: false,
        action: Some(action),
      });
    }
  }

  let resolved: Vec<ResolvedEntry> = candidates
    .into_iter()
    .map(|candidate| resolve_entry(catalog, live, options.include_engine_sections, candidate))
    .collect();

  let mut counts = ResolvedCounts::default();
  let mut applied_per_category: BTreeMap<String, u32> = BTreeMap::new();
  for entry in &resolved {
    let count = match entry.status {
      EntryStatus::Applies => &mut counts.applies,
      EntryStatus::Unchanged => &mut counts.unchanged,
      EntryStatus::Blocked => &mut counts.blocked,
      EntryStatus::Removed => &mut counts.removed,
      EntryStatus::NotConvar => &mut counts.not_convar,
      EntryStatus::EngineSection => &mut counts.engine_section,
      EntryStatus::Excluded => &mut counts.excluded,
      EntryStatus::Denied => &mut counts.denied,
      EntryStatus::Omitted => &mut counts.omitted,
      EntryStatus::Unsupported => &mut counts.unsupported,
    };
    *count += 1;
    if entry.overridden {
      counts.overridden += 1;
    }
    if entry.status == EntryStatus::Applies {
      *applied_per_category
        .entry(entry.category.clone())
        .or_default() += 1;
    }
  }

  ResolvedConfig {
    cut_score: cut_score_from_category_counts(catalog, &applied_per_category),
    rev: revision(&resolved, options.include_engine_sections),
    entries: resolved,
    counts,
  }
}

/// The config's own entries: from the catalog for presets, inline otherwise.
pub fn entries_for_source(
  catalog: &Catalog,
  source: &PerfConfigSource,
) -> Result<Vec<ConfigEntry>, Error> {
  match source {
    PerfConfigSource::Preset { id } => catalog
      .preset(id)
      .map(|preset| preset.entries.clone())
      .ok_or_else(|| Error::PerformanceConfig(format!("Unknown performance preset {id}"))),
    PerfConfigSource::Inline { definition } => Ok(definition.entries.clone()),
  }
}

/// Scale position from settings-per-category counts, for configs we only know
/// by their stats (GameBanana). `resolve` scores its `Applies` entries the
/// same way.
///
/// Each category saturates on its own and contributes up to its weight:
/// `score = Σ w_c · (1 − e^(−n_c / 25)) / Σ w_c`, summed over the catalog's
/// categories. A config that sets forty particle convars therefore doesn't
/// outrank one that trims shadows, textures and LOD, and categories with no
/// weight (network, camera) never move it.
pub fn cut_score_from_category_counts(catalog: &Catalog, counts: &BTreeMap<String, u32>) -> f32 {
  let total: f32 = catalog
    .categories()
    .iter()
    .map(|category| category.weight.max(0.0))
    .sum();
  if total <= 0.0 {
    return 0.0;
  }
  let score: f32 = counts
    .iter()
    .map(|(category, &count)| {
      let saturation = 1.0 - (-(count as f32) / CATEGORY_SATURATION).exp();
      catalog.category_weight(category).max(0.0) * saturation
    })
    .sum();
  (score / total).clamp(0.0, 1.0)
}

struct Candidate<'a> {
  path: &'a [String],
  config_value: Option<String>,
  in_config: bool,
  action: Option<&'a OverrideAction>,
}

fn resolve_entry(
  catalog: &Catalog,
  live: &LiveGameinfo,
  include_engine_sections: bool,
  candidate: Candidate,
) -> ResolvedEntry {
  let path = candidate.path;
  let value = match candidate.action {
    Some(OverrideAction::Set { value }) => Some(value.clone()),
    _ => candidate.config_value.clone(),
  };
  let is_convar = path.len() >= 2 && path[0].eq_ignore_ascii_case("ConVars");
  let meta = is_convar
    .then(|| catalog.convar(&path[1]))
    .flatten()
    .cloned();
  let category = match &meta {
    Some(meta) => meta.category.clone(),
    None if is_convar => "other".to_string(),
    None => catalog.section_category(&path[0]).to_string(),
  };
  let check = Check {
    catalog,
    live,
    path,
    value: value.as_deref(),
    action: candidate.action,
  };
  let (status, notes) = if is_convar {
    check.convar(meta.as_ref())
  } else {
    check.section(include_engine_sections)
  };

  ResolvedEntry {
    path: path.to_vec(),
    live_value: live.value(path).map(str::to_string),
    config_value: candidate.config_value,
    in_config: candidate.in_config,
    value,
    status,
    notes,
    overridden: candidate.action.is_some(),
    category,
    gameplay: meta.as_ref().and_then(|meta| meta.gameplay),
    meta,
  }
}

struct Check<'a> {
  catalog: &'a Catalog,
  live: &'a LiveGameinfo,
  path: &'a [String],
  value: Option<&'a str>,
  action: Option<&'a OverrideAction>,
}

impl Check<'_> {
  /// Rules 1 and 2, shared by ConVars and other sections.
  fn excluded_or_denied(&self) -> Option<(EntryStatus, Vec<EntryNote>)> {
    let excluded = match self.path {
      [root_key] => Some(root_key.as_str()),
      _ => self.catalog.excluded_section(self.path),
    };
    if let Some(section) = excluded {
      let section = section.to_string();
      return Some((
        EntryStatus::Excluded,
        vec![EntryNote::ExcludedSection { section }],
      ));
    }
    if let Some(reason) = self.catalog.denied_reason(self.path) {
      let reason = reason.to_string();
      return Some((EntryStatus::Denied, vec![EntryNote::Denied { reason }]));
    }
    None
  }

  fn convar(&self, meta: Option<&ConvarMeta>) -> (EntryStatus, Vec<EntryNote>) {
    if let Some(result) = self.excluded_or_denied() {
      return result;
    }
    let section_key = || {
      self
        .catalog
        .stock_section_of(&self.path[1])
        .map(|section| EntryNote::SectionKey {
          section: section.to_string(),
        })
    };
    let Some(meta) = meta else {
      return (EntryStatus::Removed, section_key().into_iter().collect());
    };
    let since = || {
      meta
        .status_since_build
        .map(|build| EntryNote::SinceBuild { build })
        .into_iter()
        .collect()
    };
    match meta.status {
      ConvarStatus::Blocked => return (EntryStatus::Blocked, since()),
      ConvarStatus::Removed => {
        let notes = since().into_iter().chain(section_key()).collect();
        return (EntryStatus::Removed, notes);
      }
      ConvarStatus::NotConvar => return (EntryStatus::NotConvar, Vec::new()),
      ConvarStatus::Active => {}
    }
    let enabled = matches!(
      self.action,
      Some(OverrideAction::Enable | OverrideAction::Set { .. })
    );
    if meta.gameplay == Some(GameplayClass::Devtools) && !enabled {
      return (EntryStatus::Omitted, Vec::new());
    }
    if let Some(result) = self.omitted_or_unchanged(meta.default.as_deref()) {
      return result;
    }
    if let Some(result) = self.unsupported() {
      return result;
    }
    let notes = self
      .value
      .map(|value| value_notes(meta, value))
      .unwrap_or_default();
    (EntryStatus::Applies, notes)
  }

  fn section(&self, include_engine_sections: bool) -> (EntryStatus, Vec<EntryNote>) {
    if let Some(result) = self.excluded_or_denied() {
      return result;
    }
    if let Some(result) = self.omitted_or_unchanged(None) {
      return result;
    }
    let section = &self.path[0];
    let guarded = self
      .catalog
      .is_guarded_section(section)
      .then(|| EntryNote::GuardedSection {
        section: section.clone(),
      });
    if !include_engine_sections {
      return (EntryStatus::EngineSection, guarded.into_iter().collect());
    }
    if let Some(result) = self.unsupported() {
      return result;
    }
    (EntryStatus::Applies, guarded.into_iter().collect())
  }

  /// `default` is the convar's built-in value, which the game uses when the
  /// live file doesn't set the key.
  fn omitted_or_unchanged(&self, default: Option<&str>) -> Option<(EntryStatus, Vec<EntryNote>)> {
    if matches!(self.action, Some(OverrideAction::Omit)) {
      return Some((EntryStatus::Omitted, Vec::new()));
    }
    let unchanged = match (self.value, self.live.value(self.path)) {
      (None, None) => true,
      (Some(value), Some(live)) => values_equal(value, live),
      (Some(value), None) => default.is_some_and(|default| values_equal(value, default)),
      (None, Some(_)) => false,
    };
    unchanged.then(|| (EntryStatus::Unchanged, Vec::new()))
  }

  fn unsupported(&self) -> Option<(EntryStatus, Vec<EntryNote>)> {
    let writable = self.path.iter().all(|part| patch::is_writable_key(part))
      && self.value.is_none_or(patch::is_writable_value);
    if !writable {
      return Some((EntryStatus::Unsupported, Vec::new()));
    }
    let parent = &self.path[..self.path.len() - 1];
    if !self.live.has_section(parent) {
      let section = parent.join("/");
      return Some((
        EntryStatus::Unsupported,
        vec![EntryNote::MissingSection { section }],
      ));
    }
    if self.live.has_section(self.path) {
      return Some((EntryStatus::Unsupported, Vec::new()));
    }
    None
  }
}

fn value_notes(meta: &ConvarMeta, value: &str) -> Vec<EntryNote> {
  let number = value
    .trim()
    .parse::<f64>()
    .ok()
    .filter(|number| number.is_finite());
  let matches_kind = match meta.kind {
    ConvarKind::Bool => matches!(normalize_value(value).as_str(), "0" | "1"),
    ConvarKind::Int => number.is_some_and(|number| number.fract() == 0.0),
    ConvarKind::Float => number.is_some(),
    _ => true,
  };
  let mut notes = Vec::new();
  if !matches_kind {
    notes.push(EntryNote::TypeMismatch {
      expected: meta.kind,
    });
  }
  if matches!(meta.kind, ConvarKind::Int | ConvarKind::Float)
    && let Some(number) = number
  {
    let bound = match (meta.min, meta.max) {
      (Some(min), _) if number < min => Some(min),
      (_, Some(max)) if number > max => Some(max),
      _ => None,
    };
    if let Some(bound) = bound {
      notes.push(EntryNote::Clamped {
        effective: normalize_value(&bound.to_string()),
      });
    }
  }
  notes
}

/// First 12 hex chars of a SHA-256 over what will be written: the `Applies`
/// entries sorted by path, then whether engine sections were included.
fn revision(entries: &[ResolvedEntry], include_engine_sections: bool) -> String {
  let mut applied: Vec<(String, &ResolvedEntry)> = entries
    .iter()
    .filter(|entry| entry.status == EntryStatus::Applies)
    .map(|entry| (path_key(&entry.path), entry))
    .collect();
  applied.sort_by(|a, b| a.0.cmp(&b.0));
  let mut hasher = Sha256::new();
  for (_, entry) in applied {
    hasher.update(entry.path.join("/").as_bytes());
    match &entry.value {
      Some(value) => {
        hasher.update(b"=");
        hasher.update(value.as_bytes());
      }
      None => hasher.update(b"#"),
    }
    hasher.update(b"\n");
  }
  hasher.update(if include_engine_sections {
    b"engine-sections:1".as_slice()
  } else {
    b"engine-sections:0".as_slice()
  });
  hex::encode(&hasher.finalize()[..6])
}

#[cfg(test)]
#[path = "resolve_tests.rs"]
mod tests;
