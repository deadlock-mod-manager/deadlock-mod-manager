use super::{NmClipMatch, resolve_nm_clip_from_archive};
use crate::error::Result;
use crate::vpk_extract::VpkArchive;
use std::collections::BTreeSet;
use std::path::Path;

pub(super) fn clip_stem(path: &str) -> &str {
    path.rsplit('/')
        .next()
        .unwrap_or(path)
        .trim_end_matches("_c")
        .trim_end_matches(".vnmclip")
}

/// Phase tokens by playback order. Phases past the first only break ties, so
/// `dive_intro` plays before `dive_loop` and `fire` before `fire_loop`.
const PHASES: &[(i32, &[&str])] = &[
    (0, &["precast"]),
    (5, &["chargeup"]),
    (10, &["start", "takeoff", "upwards", "casting", "jump"]),
    (30, &["hover", "hold", "fly", "charge", "charging"]),
    (40, &["intro"]),
    (50, &["loop", "idle", "channeling"]),
    (55, &["dash", "dive"]),
    (58, &["attack", "hit", "shoot", "fire", "slam", "cast"]),
    (59, &["attached"]),
    (
        60,
        &[
            "impact",
            "crash",
            "land",
            "toss",
            "explosion",
            "explode",
            "damage",
            "throw",
        ],
    ),
    (65, &["finale", "counterattack"]),
    (70, &["end", "release", "castcomplete", "exit", "getup"]),
];

/// The clip named after the family alone, like `ability_uppercut`, is the
/// move's body: after its start and intro, before any loop or follow-up.
const BODY_RANK: i32 = 45;

/// Stance, direction and layer tokens. Like phases, they end an ability's
/// name inside a clip stem.
const VARIANTS: &[&str] = &[
    "in", "air", "inair", "up", "down", "crouch", "alt", "base", "turn", "run", "walk", "zipline",
    "stand", "add", "additive", "null", "aim", "forward", "backward", "left", "right", "n", "e",
    "s", "w", "ne", "nw", "se", "sw",
];

fn phase_token_rank(token: &str) -> Option<i32> {
    PHASES
        .iter()
        .find(|(_, tokens)| tokens.contains(&token))
        .map(|(rank, _)| *rank)
}

fn ends_name(token: &str) -> bool {
    phase_token_rank(token).is_some() || VARIANTS.contains(&token)
}

/// `ability_` plus the ability's name: every token up to the first phase or
/// variant, so `ability_sleep_dagger` and `ability_hook_cast_loop` group as
/// `ability_sleep_dagger` and `ability_hook`. The first name token is kept
/// even when it reads as a phase (`ability_charge`).
pub(super) fn family_prefix(path: &str) -> Option<String> {
    let tokens = clip_stem(path).split('_').collect::<Vec<_>>();
    let ability = tokens.iter().position(|token| *token == "ability")?;
    let first = tokens.get(ability + 1)?;
    let mut name = vec![*first];
    name.extend(
        tokens[ability + 2..]
            .iter()
            .take_while(|token| !ends_name(token)),
    );
    Some(format!("ability_{}", name.join("_")))
}

fn contains_token(name: &str, token: &str) -> bool {
    name.split('_').any(|candidate| candidate == token)
}

pub(super) fn is_additive_clip(path: &str) -> bool {
    let name = clip_stem(path);
    ["aim", "add", "additive", "null"]
        .iter()
        .any(|token| contains_token(name, token))
}

pub(super) fn is_in_air_variant(name: &str) -> bool {
    contains_token(name, "inair")
        || name
            .split('_')
            .collect::<Vec<_>>()
            .windows(2)
            .any(|tokens| tokens == ["in", "air"])
}

fn direction_token(name: &str) -> Option<&'static str> {
    const DIRECTIONS: [&str; 12] = [
        "forward", "backward", "left", "right", "n", "e", "s", "w", "ne", "nw", "se", "sw",
    ];
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

/// Where `name` plays within `family`: its first phase token, then its next
/// one to order variants of the same phase.
fn phase_rank(name: &str, family: &str) -> Option<(i32, i32)> {
    if name == family {
        return Some((BODY_RANK, 0));
    }
    let suffix = name.strip_prefix(family)?.strip_prefix('_')?;
    let mut ranks = suffix.split('_').filter_map(phase_token_rank);
    let first = ranks.next()?;
    Some((first, ranks.next().unwrap_or(0)))
}

pub(super) fn coherent_phase_paths(
    primary_path: &str,
    family: &str,
    paths: impl IntoIterator<Item = String>,
) -> Vec<(i32, String)> {
    let primary_in_air = is_in_air_variant(clip_stem(primary_path));
    let mut phases = paths
        .into_iter()
        .filter_map(|path| {
            let stem = clip_stem(&path);
            if is_additive_clip(&path) {
                return None;
            }
            let name = stem.find("ability_").map_or(stem, |index| &stem[index..]);
            let suffix = if name == family {
                ""
            } else {
                name.strip_prefix(family)?.strip_prefix('_')?
            };
            // Judge variants on what follows the name, so an ability called
            // "Paradoxical Swap" still keeps its own clips.
            if [
                "alt", "base", "swap", "turn", "run", "walk", "zipline", "stand", "up", "down",
                "crouch",
            ]
            .iter()
            .any(|token| contains_token(suffix, token))
            {
                return None;
            }
            if !primary_in_air && is_in_air_variant(suffix) {
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

    phases.sort_by(|left, right| {
        left.0
            .cmp(&right.0)
            .then_with(|| {
                clip_stem(&left.1)
                    .split('_')
                    .count()
                    .cmp(&clip_stem(&right.1).split('_').count())
            })
            .then_with(|| left.1.cmp(&right.1))
    });
    phases.dedup_by(|left, right| left.0 == right.0);
    phases
        .into_iter()
        .map(|((rank, _), path)| (rank, path))
        .collect()
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
