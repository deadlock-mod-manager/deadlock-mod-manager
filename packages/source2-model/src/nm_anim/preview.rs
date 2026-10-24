use std::collections::{BTreeMap, BTreeSet};

use super::sequence::{
    clip_stem, coherent_phase_paths, family_prefix, is_additive_clip, is_in_air_variant,
};

pub const MAX_PREVIEW_SEQUENCE_CLIPS: usize = 8;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PreviewActionKind {
    Movement,
    Ability,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreviewAction {
    pub id: String,
    pub kind: PreviewActionKind,
    pub clips: Vec<String>,
    /// The ability name a clip group was found by, when its clips are not
    /// prefixed `ability_` and so do not name the ability themselves.
    pub ability: Option<String>,
}

const MOVEMENT: &[(&str, &[&[&str]])] = &[
    (
        "idle",
        &[
            &["out_of_combat_stand_idle"],
            &["weapon_stand_idle"],
            &["stand_idle"],
            &["idle"],
        ],
    ),
    ("heroSelect", &[&["ui_hero_select"], &["hero_select"]]),
    (
        "run",
        &[&["out_of_combat_run_n"], &["weapon_run_n"], &["run_n"]],
    ),
    ("weaponRun", &[&["weapon_run_n"]]),
    (
        "crouch",
        &[&["weapon_crouch_run_n"], &["out_of_combat_crouch_run_n"]],
    ),
    (
        "jump",
        &[&["jump_ground", "in_air_loop_apex", "in_air_loop_down"]],
    ),
    ("slide", &[&["slide_start", "slide_loop", "slide_getup"]]),
    ("dash", &[&["dash_ground"], &["dash_air_forward"]]),
    ("mantle", &[&["mantle_64"], &["mantle_96"], &["mantle_32"]]),
    ("melee", &[&["melee_quick_1", "melee_quick_2"]]),
    ("heavyMelee", &[&["melee_start", "melee_hit"]]),
    ("parry", &[&["parry", "parry_success"]]),
    (
        "reload",
        &[&["reload_idle_start", "reload_idle_round", "reload_idle_end"]],
    ),
    (
        "zipline",
        &[&["zipline_attached_start", "zipline_attached_loop"]],
    ),
    (
        "knockdown",
        &[&[
            "knockdown_large_start",
            "knockdown_large_loop",
            "knockdown_large_getup",
        ]],
    ),
];

fn squash(text: &str) -> String {
    text.chars()
        .filter(char::is_ascii_alphanumeric)
        .map(|ch| ch.to_ascii_lowercase())
        .collect()
}

/// A clip group named after an ability without the `ability_` prefix, and the
/// ability it names: its first one to three tokens spell the whole name, as
/// Bebop's `hyperbeam_fire` does for "Hyper Beam".
fn named_family<'a>(path: &str, ability_names: &'a [String]) -> Option<(String, &'a str)> {
    let stem = clip_stem(path);
    let tokens: Vec<_> = stem.split('_').collect();
    if tokens.contains(&"ability") {
        return None;
    }
    (1..tokens.len().min(4)).find_map(|count| {
        let family = tokens[..count].join("_");
        ability_names
            .iter()
            .find(|name| name.len() >= 4 && squash(name) == squash(&family))
            .map(|name| (family, name.as_str()))
    })
}

/// Select whole playable moves, excluding additive layers and stance fragments.
/// Ability phases share the resolver's ordering and directional policy.
/// `ability_names` (display names such as "Hyper Beam") find abilities whose
/// clips do not carry the `ability_` prefix.
pub fn preview_actions(
    paths: impl IntoIterator<Item = String>,
    ability_names: &[String],
) -> Vec<PreviewAction> {
    let paths: BTreeSet<_> = paths
        .into_iter()
        .filter(|path| {
            path.ends_with(".vnmclip_c") && !path.contains(".vnmclip+") && !is_additive_clip(path)
        })
        .collect();
    let find = |name: &str| {
        paths
            .iter()
            .find(|path| clip_stem(path) == name)
            .or_else(|| {
                paths.iter().find(|path| {
                    family_prefix(path).is_none() && clip_stem(path).ends_with(&format!("_{name}"))
                })
            })
            .cloned()
    };
    let mut actions: Vec<PreviewAction> = Vec::new();
    for &(id, alternatives) in MOVEMENT {
        for sequence in alternatives {
            if find(sequence[0]).is_none() {
                continue;
            }
            let clips: Vec<_> = sequence.iter().filter_map(|name| find(name)).collect();
            if !actions.iter().any(|action| action.clips == clips) {
                actions.push(PreviewAction {
                    id: id.to_string(),
                    kind: PreviewActionKind::Movement,
                    clips,
                    ability: None,
                });
            }
            break;
        }
    }
    let mut families: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut named: BTreeMap<String, &str> = BTreeMap::new();
    for path in paths {
        let family = match family_prefix(&path) {
            Some(family) => family,
            None => {
                let Some((family, ability)) = named_family(&path, ability_names) else {
                    continue;
                };
                named.insert(family.clone(), ability);
                family
            }
        };
        families.entry(family).or_default().push(path);
    }
    for (family, paths) in families {
        let Some(primary) = paths
            .iter()
            .find(|path| !is_in_air_variant(clip_stem(path)))
            .cloned()
        else {
            continue;
        };
        let clips: Vec<_> = coherent_phase_paths(&primary, &family, paths)
            .into_iter()
            .take(MAX_PREVIEW_SEQUENCE_CLIPS)
            .map(|(_, path)| path)
            .collect();
        if !clips.is_empty() {
            actions.push(PreviewAction {
                id: format!("ability:{}", family.trim_start_matches("ability_")),
                kind: PreviewActionKind::Ability,
                clips,
                ability: named.get(&family).map(|name| name.to_string()),
            });
        }
    }
    actions.truncate(512);
    actions
}

#[cfg(test)]
mod tests {
    use super::*;

    fn actions(names: &[&str]) -> Vec<PreviewAction> {
        preview_actions(
            names
                .iter()
                .map(|name| format!("models/a/clips/{name}.vnmclip_c")),
            &[],
        )
    }

    fn names(action: &PreviewAction) -> Vec<&str> {
        action.clips.iter().map(|path| clip_stem(path)).collect()
    }

    #[test]
    fn orders_ability_phases_and_excludes_fragments() {
        let selected = actions(&[
            "ability_leap_impact",
            "ability_leap_dive_loop",
            "ability_leap_hover",
            "ability_leap_dive_intro",
            "ability_leap_upwards",
            "ability_charge_toss",
            "ability_charge_inair_up",
            "ability_charge",
            "ability_charge_precast",
            "ability_ult_turn_left",
            "aim_ability_charge_start",
            "ability_charge_start_add",
        ]);
        assert_eq!(selected.len(), 2);
        assert_eq!(selected[0].id, "ability:charge");
        assert_eq!(
            names(&selected[0]),
            [
                "ability_charge_precast",
                "ability_charge",
                "ability_charge_toss"
            ]
        );
        assert_eq!(
            names(&selected[1]),
            [
                "ability_leap_upwards",
                "ability_leap_hover",
                "ability_leap_dive_intro",
                "ability_leap_dive_loop",
                "ability_leap_impact"
            ]
        );
    }

    #[test]
    fn multi_word_and_unprefixed_ability_names_form_actions() {
        // Haze's Sleep Dagger and Bebop's Grapple Arm and Hyper Beam, as the game
        // names them.
        let selected = preview_actions(
            [
                "ability_sleep_dagger",
                "ability_hook_attached_loop",
                "ability_hook_cast",
                "ability_hook_attached",
                "ability_hook_cast_loop",
                "sleep_start",
                "hyperbeam_fire_loop",
                "hyperbeam_charge",
                "hyperbeam_run_n",
                "hyperbeam_fire",
                "hyperbeam_stand_idle",
                "hyperbeam_charge_loop",
            ]
            .iter()
            .map(|name| format!("models/a/clips/{name}.vnmclip_c")),
            &["Hyper Beam".to_string(), "Sleep Dagger".to_string()],
        );
        let action = |id: &str| selected.iter().find(|action| action.id == id).unwrap();
        assert_eq!(
            names(action("ability:hyperbeam")),
            [
                "hyperbeam_charge",
                "hyperbeam_charge_loop",
                "hyperbeam_fire",
                "hyperbeam_fire_loop"
            ]
        );
        assert_eq!(
            names(action("ability:sleep_dagger")),
            ["ability_sleep_dagger"]
        );
        assert_eq!(
            names(action("ability:hook")),
            [
                "ability_hook_cast",
                "ability_hook_cast_loop",
                "ability_hook_attached",
                "ability_hook_attached_loop"
            ]
        );
        assert!(
            selected
                .iter()
                .all(|action| action.id != "ability:hook_attached")
        );
        assert_eq!(
            action("ability:hyperbeam").ability.as_deref(),
            Some("Hyper Beam")
        );
        assert!(selected.iter().all(|action| action.id != "ability:sleep"));
    }

    #[test]
    fn movement_requires_first_phase_and_deduplicates_alternatives() {
        let selected = actions(&[
            "weapon_stand_idle",
            "weapon_run_n",
            "weapon_run_ne",
            "aim_weapon_idle",
            "jump_ground",
            "in_air_loop_down",
            "slide_loop",
        ]);
        assert_eq!(
            selected
                .iter()
                .map(|action| action.id.as_str())
                .collect::<Vec<_>>(),
            ["idle", "run", "jump"]
        );
        assert_eq!(names(&selected[2]), ["jump_ground", "in_air_loop_down"]);
    }

    #[test]
    fn prefixed_clips_use_the_same_direction_and_phase_policy() {
        let selected = actions(&[
            "hero_weapon_stand_idle",
            "hero_ability_lunge_start_e",
            "hero_ability_lunge_start_n",
            "hero_ability_lunge_end_n",
            "hero_ability_lunge_start_n",
        ]);
        assert_eq!(selected.len(), 2);
        assert_eq!(selected[0].id, "idle");
        assert_eq!(
            names(&selected[1]),
            ["hero_ability_lunge_start_n", "hero_ability_lunge_end_n"]
        );
    }

    #[test]
    fn rejects_non_clips_and_companion_layers() {
        let selected = preview_actions(
            [
                "models/a/body.vmdl_c",
                "models/a/clips/aim_idle.vnmclip+non_additive.vnmclip_c",
                "models/a/clips/aim_weapon_stand_idle.vnmclip_c",
                "models/a/clips/add_weapon_run_n.vnmclip_c",
            ]
            .into_iter()
            .map(str::to_string),
            &[],
        );
        assert!(selected.is_empty());
    }
}
