mod batch;
mod cache;
mod mapping;
mod types;

pub use batch::{BatchDetectionItem, BatchDetectionResult, detect_heroes_batch};
pub use cache::VpkEntryCache;
pub use mapping::{canonical_sound_codename, sound_codename_for_hero};
pub use types::HeroDetectionResult;

use mapping::{HERO_PATH_PREFIXES, enum_key_for_display, lookup_hero, lookup_sound_hero};
use std::collections::HashMap;
use std::path::Path;
use vpk_parser::VpkEntry;

const CRITICAL_GAME_PATHS: [&str; 3] = [
    "scripts/abilities.vdata_c",
    "scripts/heroes.vdata_c",
    "scripts/generic_data.vdata_c",
];

fn extract_internal_name(path: &str) -> Option<&str> {
    let path = path.strip_prefix("materials/").unwrap_or(path);
    for prefix in &HERO_PATH_PREFIXES {
        if let Some(rest) = path.strip_prefix(prefix) {
            return rest.split('/').next().filter(|s| !s.is_empty());
        }
    }
    None
}

const VISUAL_EXTENSIONS: [&str; 5] = ["vmdl_c", "vmesh_c", "vmorf_c", "vmat_c", "vtex_c"];
const SOUND_EXTENSIONS: [&str; 3] = ["vsnd_c", "vsndevts_c", "vsndstck_c"];
const SOUND_HERO_PREFIXES: [&str; 3] = ["sounds/abilities/", "sounds/vo/", "sounds/voice/"];

fn sound_codename(path: &str) -> Option<&str> {
    SOUND_HERO_PREFIXES.iter().find_map(|prefix| {
        let (codename, tail) = path.strip_prefix(prefix)?.split_once('/')?;
        (!codename.is_empty() && !tail.is_empty()).then_some(codename)
    })
}

/// Panorama textures are UI art (hero cards, icons), which sound packs ship
/// too, so they never make a mod visual on their own.
fn is_visual(path: &str, ext: &str) -> bool {
    VISUAL_EXTENSIONS.contains(&ext) && !path.starts_with("panorama/")
}

fn is_sound(path: &str, ext: &str) -> bool {
    SOUND_EXTENSIONS.contains(&ext)
        || path.starts_with("sounds/")
        || path.starts_with("soundevents/")
}

/// The key with the most matches, or None when two keys tie for the lead.
fn sole_leader(counts: &HashMap<String, usize>) -> Option<&str> {
    let max = counts.values().max()?;
    let mut leaders = counts.iter().filter(|(_, count)| *count == max);
    let (leader, _) = leaders.next()?;
    leaders.next().is_none().then_some(leader.as_str())
}

pub fn detect_hero(entries: &[VpkEntry]) -> HeroDetectionResult {
    detect(entries.iter().map(|entry| entry.full_path.as_str()))
}

pub fn detect_hero_from_paths(paths: &[String]) -> HeroDetectionResult {
    detect(paths.iter().map(String::as_str))
}

/// Model and material folders name the hero a skin is for. A sound-only mod has
/// neither, so its `sounds/abilities/<codename>/` folders name the hero instead,
/// but only when no model folder was found at all.
fn detect<'a>(paths: impl Iterator<Item = &'a str>) -> HeroDetectionResult {
    let mut hero_counts: HashMap<String, usize> = HashMap::new();
    let mut sound_hero_counts: HashMap<String, usize> = HashMap::new();
    let mut internal_names: Vec<String> = Vec::new();
    let mut critical_paths: Vec<String> = Vec::new();
    let mut has_visual = false;
    let mut has_sound = false;

    for path in paths {
        if let Some(name) = extract_internal_name(path) {
            if !internal_names.iter().any(|known| known == name) {
                internal_names.push(name.to_string());
            }
            if let Some(hero) = lookup_hero(name) {
                *hero_counts.entry(hero.enum_key.to_string()).or_insert(0) += 1;
            }
        }

        if let Some(display) = sound_codename(path).and_then(lookup_sound_hero) {
            *sound_hero_counts.entry(display.to_string()).or_insert(0) += 1;
        }

        if CRITICAL_GAME_PATHS.contains(&path) && !critical_paths.iter().any(|known| known == path)
        {
            critical_paths.push(path.to_string());
        }

        let ext = path.rsplit_once('.').map_or("", |(_, ext)| ext);
        has_visual |= is_visual(path, ext);
        has_sound |= is_sound(path, ext);
    }

    let content = if has_visual {
        "visual"
    } else if has_sound {
        "sound"
    } else {
        "other"
    };

    let (hero, hero_display, category) = if hero_counts.is_empty() {
        match sole_leader(&sound_hero_counts) {
            Some(display) => (
                Some(enum_key_for_display(display)),
                Some(display.to_string()),
                "other",
            ),
            None => (None, None, "other"),
        }
    } else {
        match sole_leader(&hero_counts) {
            Some(key) => {
                let display = internal_names
                    .iter()
                    .find_map(|name| lookup_hero(name).filter(|h| h.enum_key == key))
                    .map(|h| h.display_name.to_string());
                (Some(key.to_string()), display, "hero")
            }
            None => (None, None, "other"),
        }
    };

    HeroDetectionResult {
        hero,
        hero_display,
        category: category.to_string(),
        content: content.to_string(),
        internal_names,
        uses_critical_paths: !critical_paths.is_empty(),
        critical_paths,
    }
}

pub fn detect_hero_from_vpk_files(
    vpk_paths: &[impl AsRef<Path>],
    cache: &VpkEntryCache,
) -> HeroDetectionResult {
    let mut all_entries = Vec::new();
    for path in vpk_paths {
        if let Some(entries) = cache.get_or_parse(path.as_ref()) {
            all_entries.extend(entries);
        }
    }
    detect_hero(&all_entries)
}

#[cfg(test)]
mod tests {
    #[test]
    fn texture_only_assets_use_the_shared_hero_registry() {
        let paths = vec!["materials/models/heroes/kelvin/body_color.vtex_c".to_string()];
        let result = super::detect_hero_from_paths(&paths);
        assert_eq!(result.hero_display.as_deref(), Some("Kelvin"));
        let mixed = vec![
            paths[0].clone(),
            "materials/models/heroes_wip/haze/body_color.vtex_c".to_string(),
        ];
        assert!(super::detect_hero_from_paths(&mixed).hero.is_none());
    }
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
        let paths = vec!["models/heroes_staging/gigawatt/model.vmdl_c".to_string()];
        let result = detect_hero_from_paths(&paths);
        assert_eq!(result.hero, Some("Seven".to_string()));
        assert_eq!(result.hero_display, Some("Seven".to_string()));
    }

    #[test]
    fn sound_only_mods_take_their_hero_from_the_sound_folders() {
        let paths = vec![
            "soundevents/hero/inferno.vsndevts_c".to_string(),
            "sounds/abilities/inferno/afterburn_01.vsnd_c".to_string(),
            "sounds/vo/inferno/kill_01.vsnd_c".to_string(),
            "panorama/images/heroes/inferno_card_psd.vtex_c".to_string(),
        ];
        let result = detect_hero_from_paths(&paths);
        assert_eq!(result.content, "sound");
        assert_eq!(result.hero_display.as_deref(), Some("Infernus"));
        assert_eq!(result.hero.as_deref(), Some("Infernus"));
        assert_eq!(result.category, "other");
    }

    #[test]
    fn a_skin_bundling_sounds_stays_visual() {
        let paths = vec![
            "models/heroes_wip/haze/haze.vmdl_c".to_string(),
            "sounds/abilities/inferno/afterburn_01.vsnd_c".to_string(),
        ];
        let result = detect_hero_from_paths(&paths);
        assert_eq!(result.content, "visual");
        assert_eq!(result.hero.as_deref(), Some("Haze"));
        assert_eq!(result.category, "hero");
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
