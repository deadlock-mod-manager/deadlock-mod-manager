//! The live gameinfo.gi as values by path, with our own overlay stripped.
//!
//! Comparisons are case-insensitive on section and key names and normalise
//! values (`true`/`1`, `false`/`0`, `0.500`/`0.5`), so a config that writes
//! `true` where stock writes `1` is not a change.

use std::collections::{HashMap, HashSet};

use super::catalog::Catalog;
use super::patch::{self, SiteKind};
use super::types::ConfigEntry;
use crate::errors::Error;

pub struct LiveGameinfo {
  /// File text with our overlay removed, LF line endings.
  pub text: String,
  values: HashMap<String, String>,
  sections: HashSet<String>,
}

impl LiveGameinfo {
  /// Parses a gameinfo.gi (any line endings). Our own overlay is stripped
  /// first, so values are what the file holds without us.
  ///
  /// Every scalar below the root block counts, nested ones included
  /// (`ConVars/rate/max`). For a key that appears more than once the last
  /// occurrence wins, as it does in the engine.
  pub fn parse(text: &str) -> Result<Self, Error> {
    let (stripped, _) = patch::strip_overlay(text);
    let text = stripped.replace("\r\n", "\n");
    let sites = patch::parse_sites(&text)?;
    let values = patch::scalar_values(&sites);
    let sections = sites
      .iter()
      .filter(|site| matches!(site.kind, SiteKind::Object { .. }))
      .map(|site| path_key(&site.path))
      .collect();
    Ok(Self {
      text,
      values,
      sections,
    })
  }

  /// The catalog's newest stock file, standing in for a live file we don't
  /// have (previews before setup).
  pub fn latest_stock(catalog: &Catalog) -> Self {
    Self::from_entries(
      catalog
        .latest_stock()
        .map_or(&[][..], |stock| stock.entries.as_slice()),
    )
  }

  pub fn from_entries(entries: &[ConfigEntry]) -> Self {
    let mut values = HashMap::new();
    let mut sections = HashSet::new();
    for entry in entries {
      if let Some(value) = &entry.value {
        values.insert(path_key(&entry.path), value.clone());
      }
      for depth in 1..entry.path.len() {
        sections.insert(path_key(&entry.path[..depth]));
      }
    }
    Self {
      text: String::new(),
      values,
      sections,
    }
  }

  /// Last value at `path`, the one the engine uses.
  pub fn value(&self, path: &[String]) -> Option<&str> {
    self.values.get(&path_key(path)).map(String::as_str)
  }

  pub fn has_section(&self, section: &[String]) -> bool {
    self.sections.contains(&path_key(section))
  }
}

/// Lower-case, `/`-joined path used as a map key.
pub fn path_key(path: &[String]) -> String {
  path
    .iter()
    .map(|part| part.to_ascii_lowercase())
    .collect::<Vec<_>>()
    .join("/")
}

/// Canonical form for comparing values: booleans as `1`/`0`, numbers without
/// redundant zeros, everything else trimmed and lower-cased.
pub fn normalize_value(value: &str) -> String {
  let trimmed = value.trim();
  match trimmed.to_ascii_lowercase().as_str() {
    "true" => return "1".to_string(),
    "false" => return "0".to_string(),
    _ => {}
  }
  if let Ok(number) = trimmed.parse::<f64>()
    && number.is_finite()
  {
    if number.fract() == 0.0 && number.abs() < 1e15 {
      return format!("{}", number as i64);
    }
    return format!("{number}");
  }
  trimmed.to_ascii_lowercase()
}

pub fn values_equal(a: &str, b: &str) -> bool {
  normalize_value(a) == normalize_value(b)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::mod_manager::perf_config::patch::test_support::{fixture, path};

  #[test]
  fn normalizes_booleans_and_numbers() {
    assert!(values_equal("true", "1"));
    assert!(values_equal("FALSE", "0"));
    assert!(values_equal("0.500", "0.5"));
    assert!(values_equal("2.0", "2"));
    assert!(!values_equal("0.25", "0"));
    assert!(values_equal(" Default_Mix ", "default_mix"));
  }

  #[test]
  fn reads_values_by_path_from_stock() {
    let live = LiveGameinfo::parse(&fixture("stock-api-crlf.gi")).expect("parse");
    assert_eq!(live.value(&path("ConVars/fps_max")), Some("400"));
    assert_eq!(live.value(&path("convars/FPS_MAX")), Some("400"));
    assert_eq!(live.value(&path("ConVars/rate/max")), Some("1000000"));
    assert_eq!(
      live.value(&path("ConVars/voice_always_sample_mic/version")),
      Some("2")
    );
    assert_eq!(
      live.value(&path("SceneSystem/CSMCascadeResolution")),
      Some("2048")
    );
    assert_eq!(
      live.value(&path("NetworkSystem/BetaUniverse/FakeLoss")),
      Some(".1")
    );
    assert_eq!(live.value(&path("ConVars/rate")), None);
    assert!(live.has_section(&path("ConVars/rate")));
    assert!(live.has_section(&path("networksystem/betauniverse")));
    assert!(!live.has_section(&path("ConVars/fps_max")));
    assert!(
      live
        .value(&path("PGIVersion"))
        .is_some_and(|pgi| pgi.starts_with("39A735A4"))
    );
    assert!(!live.text.contains('\r'));
  }

  #[test]
  fn last_duplicate_wins() {
    let text = "GameInfo\n{\n\tConVars\n\t{\n\t\t\"a\" \"1\"\n\t\t\"a\" \"2\"\n\t}\n}\n";
    let live = LiveGameinfo::parse(text).expect("parse");
    assert_eq!(live.value(&path("ConVars/a")), Some("2"));
  }

  #[test]
  fn ignores_our_overlay() {
    let text = "GameInfo\n{\n\tConVars\n\t{\n\t\t// ==== Deadlock Mod Manager · Performance BEGIN (config=x rev=0123456789ab) ====\n\t\t// X [dmm-perf]\n\t\t\"new\"\t\t\"1\"\n\t\t// ==== Deadlock Mod Manager · Performance END ====\n\t\t\"fps_max\" \"0\" // dmm-perf was \"400\"\n\t}\n}\n";
    let live = LiveGameinfo::parse(text).expect("parse");
    assert_eq!(live.value(&path("ConVars/fps_max")), Some("400"));
    assert_eq!(live.value(&path("ConVars/new")), None);
  }

  #[test]
  fn unparseable_files_are_a_performance_error() {
    let error = LiveGameinfo::parse("GameInfo\n{\n\tConVars\n\t{\n").err();
    assert!(matches!(error, Some(Error::PerformanceConfig(_))));
  }
}
