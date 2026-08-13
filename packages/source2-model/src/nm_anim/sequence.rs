use super::{NmClipMatch, resolve_nm_clip_from_archive};
use crate::error::Result;
use crate::vpk_extract::VpkArchive;
use std::collections::BTreeSet;
use std::path::Path;

fn clip_stem(path: &str) -> &str {
    path.rsplit('/')
        .next()
        .unwrap_or(path)
        .trim_end_matches("_c")
        .trim_end_matches(".vnmclip")
}

fn family_prefix(path: &str) -> Option<String> {
    let tokens = clip_stem(path).split('_').collect::<Vec<_>>();
    let ability = tokens.iter().position(|token| *token == "ability")?;
    let name = tokens.get(ability + 1)?;
    Some(format!("ability_{name}"))
}

fn contains_token(name: &str, token: &str) -> bool {
    name.split('_').any(|candidate| candidate == token)
}

fn is_in_air_variant(name: &str) -> bool {
    contains_token(name, "inair")
        || name
            .split('_')
            .collect::<Vec<_>>()
            .windows(2)
            .any(|tokens| tokens == ["in", "air"])
}

fn direction_token(name: &str) -> Option<&'static str> {
    const DIRECTIONS: [&str; 8] = ["forward", "backward", "left", "right", "n", "e", "s", "w"];
    DIRECTIONS
        .into_iter()
        .find(|direction| contains_token(name, direction))
}

fn direction_preference(direction: &str) -> usize {
    match direction {
        "forward" => 8,
        "n" => 7,
        "e" => 6,
        "s" => 5,
        "w" => 4,
        "right" => 3,
        "left" => 2,
        "backward" => 1,
        _ => 0,
    }
}

fn phase_rank(name: &str, family: &str) -> Option<i32> {
    if name == family {
        return Some(20);
    }
    if contains_token(name, "precast") {
        Some(0)
    } else if ["start", "takeoff", "upwards"]
        .iter()
        .any(|token| contains_token(name, token))
    {
        Some(10)
    } else if contains_token(name, "hover") {
        Some(30)
    } else if contains_token(name, "intro") {
        Some(40)
    } else if contains_token(name, "loop") {
        Some(50)
    } else if ["impact", "crash", "land", "toss"]
        .iter()
        .any(|token| contains_token(name, token))
    {
        Some(60)
    } else if ["end", "release"]
        .iter()
        .any(|token| contains_token(name, token))
    {
        Some(70)
    } else {
        None
    }
}

fn coherent_phase_paths(
    primary_path: &str,
    family: &str,
    paths: impl IntoIterator<Item = String>,
) -> Vec<(i32, String)> {
    let primary_in_air = is_in_air_variant(clip_stem(primary_path));
    let mut phases = paths
        .into_iter()
        .filter_map(|path| {
            let name = clip_stem(&path);
            if !(name == family || name.starts_with(&format!("{family}_"))) {
                return None;
            }
            if !primary_in_air && is_in_air_variant(name) {
                return None;
            }
            if ["up", "down", "crouch"]
                .iter()
                .any(|token| contains_token(name, token))
            {
                return None;
            }
            phase_rank(name, family).map(|rank| (rank, path))
        })
        .collect::<Vec<_>>();

    let directions = phases
        .iter()
        .filter_map(|(_, path)| direction_token(clip_stem(path)))
        .collect::<BTreeSet<_>>();
    if let Some(direction) = directions.into_iter().max_by_key(|direction| {
        let matching = phases.iter().filter(|(_, path)| {
            direction_token(clip_stem(path)).is_none_or(|candidate| candidate == *direction)
        });
        let ranks = matching
            .clone()
            .map(|(rank, _)| *rank)
            .collect::<BTreeSet<_>>();
        (
            ranks.len(),
            matching.count(),
            direction_preference(direction),
        )
    }) {
        phases.retain(|(_, path)| {
            direction_token(clip_stem(path)).is_none_or(|candidate| candidate == direction)
        });
    }

    phases.sort_by(|left, right| left.0.cmp(&right.0).then_with(|| left.1.cmp(&right.1)));
    phases.dedup_by(|left, right| left.1 == right.1);
    phases
}

pub fn resolve_nm_clip_sequence(
    vpk_path: &Path,
    model_path: &str,
    cast_parameter: Option<&str>,
    ability_name: Option<&str>,
) -> Result<Vec<NmClipMatch>> {
    let archive = VpkArchive::open(vpk_path)?;
    resolve_nm_clip_sequence_from_archive(&archive, model_path, cast_parameter, ability_name)
}

pub fn resolve_nm_clip_sequence_from_archive(
    archive: &VpkArchive,
    model_path: &str,
    cast_parameter: Option<&str>,
    ability_name: Option<&str>,
) -> Result<Vec<NmClipMatch>> {
    let Some(primary) =
        resolve_nm_clip_from_archive(archive, model_path, cast_parameter, ability_name)?
    else {
        return Ok(Vec::new());
    };
    let Some(family) = family_prefix(&primary.clip_path) else {
        return Ok(vec![primary]);
    };
    let directory = primary
        .clip_path
        .rsplit_once('/')
        .map(|(directory, _)| directory)
        .unwrap_or("");
    let phases = coherent_phase_paths(
        &primary.clip_path,
        &family,
        archive
            .list_entries()
            .into_iter()
            .filter(|path| path.starts_with(directory) && path.ends_with(".vnmclip_c")),
    );
    if phases.len() <= 1 {
        return Ok(vec![primary]);
    }
    Ok(phases
        .into_iter()
        .map(|(rank, clip_path)| NmClipMatch {
            score: primary.score - rank,
            reason: "nm-phase-sequence".to_string(),
            clip_path,
        })
        .collect())
}

fn semantic_tokens(path: &str) -> Vec<&str> {
    clip_stem(path)
        .split('_')
        .filter(|token| {
            !matches!(
                *token,
                "ability"
                    | "aim"
                    | "weapon"
                    | "stand"
                    | "crouch"
                    | "idle"
                    | "run"
                    | "active"
                    | "start"
                    | "intro"
                    | "loop"
                    | "end"
                    | "up"
                    | "down"
            )
        })
        .collect()
}

pub fn resolve_nm_additive_overlay(
    vpk_path: &Path,
    base_clip_path: &str,
) -> Result<Option<NmClipMatch>> {
    let archive = VpkArchive::open(vpk_path)?;
    resolve_nm_additive_overlay_from_archive(&archive, base_clip_path)
}

pub fn resolve_nm_additive_overlay_from_archive(
    archive: &VpkArchive,
    base_clip_path: &str,
) -> Result<Option<NmClipMatch>> {
    let wanted = semantic_tokens(base_clip_path);
    if wanted.is_empty() {
        return Ok(None);
    }
    let directory = base_clip_path
        .rsplit_once('/')
        .map(|(directory, _)| directory)
        .unwrap_or("");
    Ok(archive
        .list_entries()
        .into_iter()
        .filter(|path| path.starts_with(directory) && path.ends_with(".vnmclip_c"))
        .filter(|path| clip_stem(path).starts_with("aim_"))
        .filter(|path| {
            let name = clip_stem(path);
            !contains_token(name, "up") && !contains_token(name, "down")
        })
        .filter_map(|clip_path| {
            let candidate = semantic_tokens(&clip_path);
            let overlap = wanted
                .iter()
                .filter(|token| candidate.contains(token))
                .count() as i32;
            (overlap > 0).then(|| NmClipMatch {
                score: overlap * 1_000
                    + i32::from(clip_stem(&clip_path).contains("weapon_idle")) * 100,
                reason: "nm-additive-overlay".to_string(),
                clip_path,
            })
        })
        .max_by(|left, right| left.score.cmp(&right.score)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn orders_common_ability_phases() {
        assert!(
            phase_rank("ability_leap_upwards", "ability_leap")
                < phase_rank("ability_leap_hover", "ability_leap")
        );
        assert!(
            phase_rank("ability_leap_dive_intro", "ability_leap")
                < phase_rank("ability_leap_dive_loop", "ability_leap")
        );
        assert!(
            phase_rank("ability_leap_dive_loop", "ability_leap")
                < phase_rank("ability_leap_impact", "ability_leap")
        );
    }

    #[test]
    fn selects_one_coherent_directional_sequence() {
        let paths = [
            "ability_lunge_in_air_start_e.vnmclip_c",
            "ability_lunge_in_air_start_n.vnmclip_c",
            "ability_lunge_in_air_start_s.vnmclip_c",
            "ability_lunge_in_air_start_w.vnmclip_c",
            "ability_lunge_start_e.vnmclip_c",
            "ability_lunge_start_n.vnmclip_c",
            "ability_lunge_start_s.vnmclip_c",
            "ability_lunge_start_w.vnmclip_c",
            "ability_lunge_end_n.vnmclip_c",
        ]
        .into_iter()
        .map(str::to_string);

        let selected =
            coherent_phase_paths("ability_lunge_start_e.vnmclip_c", "ability_lunge", paths)
                .into_iter()
                .map(|(_, path)| path)
                .collect::<Vec<_>>();

        assert_eq!(
            selected,
            [
                "ability_lunge_start_n.vnmclip_c",
                "ability_lunge_end_n.vnmclip_c"
            ]
        );
    }
}
