mod mapping;
mod types;

pub use types::HeroDetectionResult;

use mapping::{lookup_hero, HERO_PATH_PREFIXES};
use std::collections::HashMap;
use vpk_parser::VpkEntry;

const CRITICAL_GAME_PATHS: [&str; 3] = [
    "scripts/abilities.vdata_c",
    "scripts/heroes.vdata_c",
    "scripts/generic_data.vdata_c",
];

fn extract_internal_name(path: &str) -> Option<&str> {
    for prefix in &HERO_PATH_PREFIXES {
        if let Some(rest) = path.strip_prefix(prefix) {
            return rest.split('/').next().filter(|s| !s.is_empty());
        }
    }
    None
}

fn find_critical_paths(paths: impl Iterator<Item = impl AsRef<str>>) -> Vec<String> {
    let mut found: Vec<String> = Vec::new();
    for path in paths {
        let p = path.as_ref();
        if CRITICAL_GAME_PATHS.contains(&p) && !found.contains(&p.to_string()) {
            found.push(p.to_string());
        }
    }
    found
}

pub fn detect_hero(entries: &[VpkEntry]) -> HeroDetectionResult {
    let mut hero_counts: HashMap<String, usize> = HashMap::new();
    let mut internal_names: Vec<String> = Vec::new();

    for entry in entries {
        if let Some(name) = extract_internal_name(&entry.full_path) {
            if !internal_names.contains(&name.to_string()) {
                internal_names.push(name.to_string());
            }

            if let Some(hero) = lookup_hero(name) {
                *hero_counts.entry(hero.enum_key.to_string()).or_insert(0) += 1;
            }
        }
    }

    let critical_paths = find_critical_paths(entries.iter().map(|e| &e.full_path));
    let uses_critical_paths = !critical_paths.is_empty();

    if hero_counts.is_empty() {
        return HeroDetectionResult {
            hero: None,
            hero_display: None,
            category: "other".to_string(),
            internal_names,
            uses_critical_paths,
            critical_paths,
        };
    }

    let primary_hero_key = hero_counts
        .iter()
        .max_by_key(|(_, count)| *count)
        .map(|(key, _)| key.clone())
        .unwrap();

    let display_name = internal_names
        .iter()
        .find_map(|name| lookup_hero(name))
        .filter(|h| h.enum_key == primary_hero_key)
        .map(|h| h.display_name.to_string());

    HeroDetectionResult {
        hero: Some(primary_hero_key),
        hero_display: display_name,
        category: "hero".to_string(),
        internal_names,
        uses_critical_paths,
        critical_paths,
    }
}

pub fn detect_hero_from_paths(paths: &[String]) -> HeroDetectionResult {
    let mut hero_counts: HashMap<String, usize> = HashMap::new();
    let mut internal_names: Vec<String> = Vec::new();

    for path in paths {
        if let Some(name) = extract_internal_name(path) {
            if !internal_names.contains(&name.to_string()) {
                internal_names.push(name.to_string());
            }

            if let Some(hero) = lookup_hero(name) {
                *hero_counts.entry(hero.enum_key.to_string()).or_insert(0) += 1;
            }
        }
    }

    let critical_paths = find_critical_paths(paths.iter());
    let uses_critical_paths = !critical_paths.is_empty();

    if hero_counts.is_empty() {
        return HeroDetectionResult {
            hero: None,
            hero_display: None,
            category: "other".to_string(),
            internal_names,
            uses_critical_paths,
            critical_paths,
        };
    }

    let primary_hero_key = hero_counts
        .iter()
        .max_by_key(|(_, count)| *count)
        .map(|(key, _)| key.clone())
        .unwrap();

    let display_name = internal_names
        .iter()
        .find_map(|name| lookup_hero(name))
        .filter(|h| h.enum_key == primary_hero_key)
        .map(|h| h.display_name.to_string());

    HeroDetectionResult {
        hero: Some(primary_hero_key),
        hero_display: display_name,
        category: "hero".to_string(),
        internal_names,
        uses_critical_paths,
        critical_paths,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_drifter() {
        let paths = vec![
            "models/heroes_wip/drifter/drifter.vmdl_c".to_string(),
            "models/heroes_wip/drifter/drifter_backup.vmdl_c".to_string(),
            "panorama/images/heroes/drifter_card_psd.vtex_c".to_string(),
        ];
        let result = detect_hero_from_paths(&paths);
        assert_eq!(result.hero, Some("Drifter".to_string()));
        assert_eq!(result.hero_display, Some("Drifter".to_string()));
        assert_eq!(result.category, "hero");
        assert!(!result.uses_critical_paths);
    }

    #[test]
    fn test_detect_other() {
        let paths = vec![
            "panorama/images/heroes/drifter_card_psd.vtex_c".to_string(),
            "sounds/custom/effect.wav".to_string(),
        ];
        let result = detect_hero_from_paths(&paths);
        assert_eq!(result.hero, None);
        assert_eq!(result.category, "other");
        assert!(!result.uses_critical_paths);
    }

    #[test]
    fn test_detect_staging_hero() {
        let paths = vec![
            "models/heroes_staging/gigawatt/model.vmdl_c".to_string(),
        ];
        let result = detect_hero_from_paths(&paths);
        assert_eq!(result.hero, Some("Seven".to_string()));
        assert_eq!(result.hero_display, Some("Seven".to_string()));
    }

    #[test]
    fn test_unmapped_internal_name() {
        let paths = vec!["models/heroes_wip/druid/model.vmdl_c".to_string()];
        let result = detect_hero_from_paths(&paths);
        assert_eq!(result.hero, None);
        assert_eq!(result.category, "other");
    }

    #[test]
    fn test_heroes_folder() {
        let paths = vec!["models/heroes/kelvin/model.vmdl_c".to_string()];
        let result = detect_hero_from_paths(&paths);
        assert_eq!(result.hero, Some("Kelvin".to_string()));
    }

    #[test]
    fn test_critical_paths_detected() {
        let paths = vec![
            "scripts/abilities.vdata_c".to_string(),
            "models/heroes_wip/drifter/drifter.vmdl_c".to_string(),
        ];
        let result = detect_hero_from_paths(&paths);
        assert!(result.uses_critical_paths);
        assert_eq!(result.critical_paths, vec!["scripts/abilities.vdata_c"]);
    }

    #[test]
    fn test_multiple_critical_paths() {
        let paths = vec![
            "scripts/abilities.vdata_c".to_string(),
            "scripts/heroes.vdata_c".to_string(),
            "scripts/generic_data.vdata_c".to_string(),
        ];
        let result = detect_hero_from_paths(&paths);
        assert!(result.uses_critical_paths);
        assert_eq!(result.critical_paths.len(), 3);
    }

    #[test]
    fn test_no_critical_paths() {
        let paths = vec![
            "scripts/other_file.vdata_c".to_string(),
            "sounds/custom/effect.wav".to_string(),
        ];
        let result = detect_hero_from_paths(&paths);
        assert!(!result.uses_critical_paths);
        assert!(result.critical_paths.is_empty());
    }
}
