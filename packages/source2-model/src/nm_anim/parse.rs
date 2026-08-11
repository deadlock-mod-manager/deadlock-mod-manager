use super::*;
use crate::error::{Result, Source2Error};
use crate::kv3::KvValue;
use crate::resource::Resource;
use std::collections::BTreeSet;
use std::path::Path;

pub fn parse_nm_skeleton(resource: &Resource) -> Result<NmSkeleton> {
    let root = parse_data(resource)?;
    let bone_names = required_array(&root, "m_boneIDs")?
        .iter()
        .map(required_string_value)
        .collect::<Result<Vec<_>>>()?;
    let parent_indices = required_array(&root, "m_parentIndices")?
        .iter()
        .map(required_i32_value)
        .collect::<Result<Vec<_>>>()?;
    if bone_names.len() != parent_indices.len() {
        return Err(Source2Error::Resource(
            "NM skeleton bone and parent counts differ".into(),
        ));
    }
    let reference_pose = parse_reference_pose(&root, bone_names.len());
    Ok(NmSkeleton {
        name: required_string(&root, "m_ID")?,
        bone_names,
        parent_indices,
        reference_pose,
    })
}

/// Parses `m_parentSpaceReferencePose`: one array of 8 floats per bone laid out
/// as `[posX, posY, posZ, scale, quatX, quatY, quatZ, quatW]`. A missing or
/// malformed pose falls back to identity so additive clips still resolve.
pub(crate) fn parse_reference_pose(root: &KvValue, bone_count: usize) -> Vec<ReferenceTransform> {
    let entries = root
        .get("m_parentSpaceReferencePose")
        .and_then(KvValue::as_array);
    let mut pose = vec![ReferenceTransform::default(); bone_count];
    let Some(entries) = entries else {
        return pose;
    };
    for (bone, entry) in pose.iter_mut().zip(entries) {
        let Some(values) = entry.as_array() else {
            continue;
        };
        if values.len() < 8 {
            continue;
        }
        let mut floats = [0.0f32; 8];
        let mut ok = true;
        for (slot, value) in floats.iter_mut().zip(values) {
            match numeric_f32(value) {
                Some(number) => *slot = number,
                None => {
                    ok = false;
                    break;
                }
            }
        }
        if !ok {
            continue;
        }
        *bone = ReferenceTransform {
            translation: [floats[0], floats[1], floats[2]],
            scale: floats[3],
            rotation: [floats[4], floats[5], floats[6], floats[7]],
        };
    }
    pose
}

pub fn parse_nm_clip(resource: &Resource) -> Result<NmAnimationClip> {
    let root = parse_data(resource)?;
    let frame_count = required_usize(&root, "m_nNumFrames")?;
    let compressed_pose_offsets = required_array(&root, "m_compressedPoseOffsets")?
        .iter()
        .map(required_usize_value)
        .collect::<Result<Vec<_>>>()?;
    if compressed_pose_offsets.len() != frame_count {
        return Err(Source2Error::Resource(format!(
            "NM clip has {} frame offsets for {frame_count} frames",
            compressed_pose_offsets.len()
        )));
    }
    let track_settings = required_array(&root, "m_trackCompressionSettings")?
        .iter()
        .map(parse_track_setting)
        .collect::<Result<Vec<_>>>()?;
    Ok(NmAnimationClip {
        skeleton_path: required_string(&root, "m_skeleton")?,
        frame_count,
        duration_seconds: required_f32(&root, "m_flDuration")?,
        additive: required_bool(&root, "m_bIsAdditive")?,
        compressed_pose_data: required_binary(&root, "m_compressedPoseData")?.to_vec(),
        compressed_pose_offsets,
        track_settings,
    })
}

pub fn load_nm_animation(vpk_path: &Path, clip_path: &str) -> Result<NmAnimation> {
    let archive = crate::vpk_extract::VpkArchive::open(vpk_path)?;
    load_nm_animation_from_archive(&archive, clip_path)
}

pub fn load_nm_animation_from_archive(
    archive: &crate::vpk_extract::VpkArchive,
    clip_path: &str,
) -> Result<NmAnimation> {
    let clip_path = compiled_resource_path(clip_path);
    let clip_bytes = archive.extract_entry(&clip_path)?;
    let clip_resource = Resource::parse(clip_bytes)?;
    let clip = parse_nm_clip(&clip_resource)?;
    let skeleton_path = compiled_resource_path(&clip.skeleton_path);
    let skeleton_bytes = archive.extract_entry(&skeleton_path)?;
    let skeleton_resource = Resource::parse(skeleton_bytes)?;
    let skeleton = parse_nm_skeleton(&skeleton_resource)?;
    if skeleton.bone_names.len() != clip.track_settings.len() {
        return Err(Source2Error::Resource(format!(
            "NM clip has {} tracks for {} skeleton bones",
            clip.track_settings.len(),
            skeleton.bone_names.len()
        )));
    }
    Ok(NmAnimation {
        clip_path,
        skeleton,
        clip,
    })
}

pub fn resolve_nm_clip(
    vpk_path: &Path,
    model_path: &str,
    cast_parameter: Option<&str>,
    ability_name: Option<&str>,
) -> Result<Option<NmClipMatch>> {
    let archive = crate::vpk_extract::VpkArchive::open(vpk_path)?;
    resolve_nm_clip_from_archive(&archive, model_path, cast_parameter, ability_name)
}

pub fn resolve_nm_clip_from_archive(
    archive: &crate::vpk_extract::VpkArchive,
    model_path: &str,
    cast_parameter: Option<&str>,
    ability_name: Option<&str>,
) -> Result<Option<NmClipMatch>> {
    let normalized_model_path = model_path.replace('\\', "/").to_ascii_lowercase();
    let Some((model_directory, _)) = normalized_model_path.rsplit_once('/') else {
        return Ok(None);
    };
    let clip_prefix = format!("{model_directory}/clips/");
    let clip_paths = archive
        .list_entries()
        .into_iter()
        .filter(|path| path.starts_with(&clip_prefix) && path.ends_with(".vnmclip_c"))
        .collect::<Vec<_>>();

    let graph_bindings = nm_graph_clip_bindings(archive, &normalized_model_path);
    let graph_match = best_nm_graph_match(&graph_bindings, cast_parameter, ability_name);
    let mut action_clip_paths = clip_paths.clone();
    action_clip_paths.extend(
        graph_bindings
            .iter()
            .map(|binding| binding.clip_path.clone()),
    );
    action_clip_paths.sort();
    action_clip_paths.dedup();

    let normalized_ability = ability_name
        .map(normalize_name)
        .map(|name| ability_query_without_model_scope(&name, &normalized_model_path))
        .filter(|name| !name.is_empty());
    let cast_match = cast_parameter
        .map(normalize_name)
        .filter(|cast| !cast.is_empty())
        .and_then(|cast| {
            best_nm_clip_match(&clip_paths, &cast, normalized_ability.as_deref(), true)
        });
    let ability_match = normalized_ability
        .as_deref()
        .and_then(|ability| best_nm_clip_match(&clip_paths, ability, None, false));
    let direct_match = [cast_match, ability_match]
        .into_iter()
        .flatten()
        .max_by(|left, right| {
            semantic_clip_overlap(
                &left.clip_path,
                cast_parameter,
                normalized_ability.as_deref(),
            )
            .cmp(&semantic_clip_overlap(
                &right.clip_path,
                cast_parameter,
                normalized_ability.as_deref(),
            ))
            .then_with(|| left.score.cmp(&right.score))
        });
    let generic_match = generic_cast_match(&action_clip_paths, cast_parameter);

    if let Some(graph_match) = graph_match {
        let graph_coverage = semantic_clip_coverage(
            &graph_match.clip_path,
            cast_parameter,
            normalized_ability.as_deref(),
        );
        if let Some(direct_match) = direct_match
            && semantic_clip_coverage(
                &direct_match.clip_path,
                cast_parameter,
                normalized_ability.as_deref(),
            ) > graph_coverage
        {
            return Ok(Some(direct_match));
        }
        let cast_is_generic = cast_parameter
            .map(normalize_name)
            .map(|cast| meaningful_tokens(&cast).is_empty())
            .unwrap_or(true);
        let graph_clip_is_generic =
            meaningful_tokens(&normalize_name(clip_name(&graph_match.clip_path))).is_empty();
        if cast_is_generic && graph_clip_is_generic {
            return Ok(generic_match.or(Some(graph_match)));
        }
        if !cast_is_generic || graph_coverage >= 50 {
            return Ok(Some(graph_match));
        }
        return Ok(generic_match);
    }

    if direct_match.is_some() {
        return Ok(direct_match);
    }

    Ok(generic_match)
}

fn ability_query_without_model_scope(ability: &str, model_path: &str) -> String {
    let mut scope = model_path
        .split('/')
        .rev()
        .take(2)
        .flat_map(|component| meaningful_tokens(&normalize_name(component)))
        .collect::<Vec<_>>();
    scope.sort();
    scope.dedup();
    let filtered = meaningful_tokens(ability)
        .into_iter()
        .filter(|token| !scope.contains(token))
        .collect::<Vec<_>>();
    if filtered.is_empty() {
        ability.to_string()
    } else {
        filtered.join("_")
    }
}

fn generic_cast_match(clip_paths: &[String], cast_parameter: Option<&str>) -> Option<NmClipMatch> {
    let cast = cast_parameter.map(normalize_name)?;
    let generic = meaningful_tokens(&cast).is_empty();
    let wanted: &[&str] = if cast.contains("throw") {
        &["throw", "item_throw"]
    } else if cast.contains("channel") {
        &["cast_channeling_start", "cast_start", "generic_cast_start"]
    } else {
        &["cast_start", "generic_cast_start", "throw"]
    };
    clip_paths
        .iter()
        .filter_map(|path| {
            let candidate = normalize_name(clip_name(path));
            wanted
                .iter()
                .position(|wanted| {
                    candidate == *wanted || candidate.ends_with(&format!("_{wanted}"))
                })
                .map(|rank| (rank, candidate.len(), path))
        })
        .min_by_key(|(rank, length, _)| (*rank, *length))
        .map(|(_, _, clip_path)| NmClipMatch {
            clip_path: (*clip_path).clone(),
            score: if generic { 5_000 } else { 1_000 },
            reason: if generic {
                "nm-generic-cast".into()
            } else {
                "nm-generic-cast-fallback".into()
            },
        })
}

fn semantic_clip_overlap(
    clip_path: &str,
    cast_parameter: Option<&str>,
    normalized_ability: Option<&str>,
) -> i32 {
    let clip_tokens = meaningful_tokens(&normalize_name(clip_name(clip_path)));
    let cast_tokens = cast_parameter
        .map(normalize_name)
        .map(|value| meaningful_tokens(&value))
        .unwrap_or_default();
    let ability_tokens = normalized_ability
        .map(meaningful_tokens)
        .unwrap_or_default();
    token_overlap(&cast_tokens, &clip_tokens) * 2 + token_overlap(&ability_tokens, &clip_tokens)
}

fn semantic_clip_coverage(
    clip_path: &str,
    cast_parameter: Option<&str>,
    normalized_ability: Option<&str>,
) -> i32 {
    let clip_tokens = meaningful_tokens(&normalize_name(clip_name(clip_path)));
    let cast_tokens = cast_parameter
        .map(normalize_name)
        .map(|value| meaningful_tokens(&value))
        .unwrap_or_default();
    let ability_tokens = normalized_ability
        .map(meaningful_tokens)
        .unwrap_or_default();
    semantic_token_coverage(&cast_tokens, &clip_tokens)
        .max(semantic_token_coverage(&ability_tokens, &clip_tokens))
}

fn semantic_token_coverage(wanted: &[String], candidate: &[String]) -> i32 {
    if wanted.is_empty() || candidate.is_empty() {
        return 0;
    }
    let wanted_compact = wanted.concat();
    let candidate_compact = candidate.concat();
    if wanted_compact.contains(&candidate_compact) || candidate_compact.contains(&wanted_compact) {
        return 100;
    }
    let overlap = token_overlap(wanted, candidate);
    overlap * 100 / wanted.len().max(candidate.len()) as i32
}

pub(crate) fn nm_graph_clip_bindings(
    archive: &crate::vpk_extract::VpkArchive,
    model_path: &str,
) -> Vec<NmGraphClipBinding> {
    let Ok(bytes) = archive.extract_entry(model_path) else {
        return Vec::new();
    };
    let Ok(resource) = Resource::parse(bytes) else {
        return Vec::new();
    };
    let Ok(model) = parse_data(&resource) else {
        return Vec::new();
    };
    let graph_paths = model
        .get("m_animGraph2Refs")
        .and_then(KvValue::as_array)
        .into_iter()
        .flatten()
        .filter_map(|reference| reference.get("m_hGraph").and_then(KvValue::as_string))
        .map(compiled_resource_path)
        .collect::<Vec<_>>();
    let mut visited = BTreeSet::new();
    let mut bindings = Vec::new();
    for graph_path in graph_paths {
        collect_graph_bindings(archive, &graph_path, &mut visited, &mut bindings);
    }
    bindings
}

pub(crate) fn collect_graph_bindings(
    archive: &crate::vpk_extract::VpkArchive,
    graph_path: &str,
    visited: &mut BTreeSet<String>,
    bindings: &mut Vec<NmGraphClipBinding>,
) {
    let graph_path = compiled_resource_path(graph_path);
    if !visited.insert(graph_path.clone()) {
        return;
    }
    let Ok(bytes) = archive.extract_entry(&graph_path) else {
        return;
    };
    let Ok(resource) = Resource::parse(bytes) else {
        return;
    };
    let Ok(graph) = parse_data(&resource) else {
        return;
    };
    let resources = graph
        .get("m_resources")
        .and_then(KvValue::as_array)
        .unwrap_or(&[]);
    let nodes = graph
        .get("m_nodes")
        .and_then(KvValue::as_array)
        .unwrap_or(&[]);

    for node in nodes {
        if node.get("_class").and_then(KvValue::as_string)
            != Some("CNmStateMachineNode::CDefinition")
        {
            continue;
        }
        let Some(states) = node.get("m_stateDefinitions").and_then(KvValue::as_array) else {
            continue;
        };
        for state in states {
            let Some(state_node_idx) = node_index(state, "m_nStateNodeIdx") else {
                continue;
            };
            let clip_paths =
                clips_under_node(nodes, resources, state_node_idx, &mut BTreeSet::new());
            if let Some(condition_idx) = node_index(state, "m_nEntryConditionNodeIdx") {
                add_graph_bindings(nodes, condition_idx, &clip_paths, bindings);
            }
            if let Some(transitions) = state
                .get("m_transitionDefinitions")
                .and_then(KvValue::as_array)
            {
                for transition in transitions {
                    let Some(condition_idx) = node_index(transition, "m_nConditionNodeIdx") else {
                        continue;
                    };
                    let target_clips = node_index(transition, "m_nTargetStateIdx")
                        .and_then(|target| states.get(target))
                        .and_then(|target| node_index(target, "m_nStateNodeIdx"))
                        .map(|target| {
                            clips_under_node(nodes, resources, target, &mut BTreeSet::new())
                        })
                        .unwrap_or_default();
                    add_graph_bindings(nodes, condition_idx, &target_clips, bindings);
                }
            }
        }
    }

    for resource in resources.iter().filter_map(KvValue::as_string) {
        if resource.contains(".vnmgraph") {
            collect_graph_bindings(archive, resource, visited, bindings);
        }
    }
}

pub(crate) fn node_index(value: &KvValue, key: &str) -> Option<usize> {
    value
        .get(key)?
        .as_i64()
        .and_then(|index| usize::try_from(index).ok())
}

pub(crate) fn graph_node(nodes: &[KvValue], index: usize) -> Option<&KvValue> {
    nodes
        .get(index)
        .filter(|node| node_index(node, "m_nNodeIdx").is_none_or(|node_index| node_index == index))
}

pub(crate) fn clips_under_node(
    nodes: &[KvValue],
    resources: &[KvValue],
    index: usize,
    visited: &mut BTreeSet<usize>,
) -> Vec<String> {
    if !visited.insert(index) {
        return Vec::new();
    }
    let Some(node) = graph_node(nodes, index) else {
        return Vec::new();
    };
    let class = node
        .get("_class")
        .and_then(KvValue::as_string)
        .unwrap_or_default();
    if class == "CNmClipNode::CDefinition" {
        return node_index(node, "m_nDataSlotIdx")
            .and_then(|slot| resources.get(slot))
            .and_then(KvValue::as_string)
            .map(compiled_resource_path)
            .into_iter()
            .collect();
    }
    let mut child_indices = Vec::new();
    if let KvValue::Object(fields) = node {
        for (key, value) in fields {
            if (key.ends_with("NodeIdx") || key.ends_with("NodeIndex"))
                && !key.contains("Condition")
                && !key.contains("Weight")
                && let Some(index) = value.as_i64().and_then(|index| usize::try_from(index).ok())
            {
                child_indices.push(index);
            }
        }
    }
    if let Some(states) = node.get("m_stateDefinitions").and_then(KvValue::as_array) {
        child_indices.extend(
            states
                .iter()
                .filter_map(|state| node_index(state, "m_nStateNodeIdx")),
        );
    }
    child_indices
        .into_iter()
        .flat_map(|child| clips_under_node(nodes, resources, child, visited))
        .collect()
}

pub(crate) fn condition_ids(
    nodes: &[KvValue],
    index: usize,
    visited: &mut BTreeSet<usize>,
) -> Vec<String> {
    if !visited.insert(index) {
        return Vec::new();
    }
    let Some(node) = graph_node(nodes, index) else {
        return Vec::new();
    };
    let mut ids = node
        .get("m_comparisionIDs")
        .or_else(|| node.get("m_comparisonIDs"))
        .and_then(KvValue::as_array)
        .into_iter()
        .flatten()
        .filter_map(KvValue::as_string)
        .map(str::to_string)
        .collect::<Vec<_>>();
    if let Some(input) = node_index(node, "m_nInputValueNodeIdx") {
        ids.extend(condition_ids(nodes, input, visited));
    }
    if let Some(children) = node
        .get("m_conditionNodeIndices")
        .and_then(KvValue::as_array)
    {
        for child in children.iter().filter_map(KvValue::as_i64) {
            if let Ok(child) = usize::try_from(child) {
                ids.extend(condition_ids(nodes, child, visited));
            }
        }
    }
    ids.sort();
    ids.dedup();
    ids
}

pub(crate) fn add_graph_bindings(
    nodes: &[KvValue],
    condition_idx: usize,
    clip_paths: &[String],
    bindings: &mut Vec<NmGraphClipBinding>,
) {
    let ids = condition_ids(nodes, condition_idx, &mut BTreeSet::new());
    if ids.is_empty() {
        return;
    }
    bindings.extend(clip_paths.iter().map(|clip_path| NmGraphClipBinding {
        ids: ids.clone(),
        clip_path: clip_path.clone(),
    }));
}

pub(crate) fn best_nm_graph_match(
    bindings: &[NmGraphClipBinding],
    cast_parameter: Option<&str>,
    ability_name: Option<&str>,
) -> Option<NmClipMatch> {
    let clip_paths = bindings
        .iter()
        .map(|binding| binding.clip_path.clone())
        .collect::<Vec<_>>();
    let cast_tokens = cast_parameter
        .map(normalize_name)
        .map(|value| meaningful_tokens(&value))
        .map(|tokens| discriminative_tokens(tokens, &clip_paths))
        .map(|tokens| discriminative_graph_tokens(tokens, bindings))
        .unwrap_or_default();
    let ability_tokens = ability_name
        .map(normalize_name)
        .map(|value| meaningful_tokens(&value))
        .map(|tokens| discriminative_tokens(tokens, &clip_paths))
        .map(|tokens| discriminative_graph_tokens(tokens, bindings))
        .unwrap_or_default();
    bindings
        .iter()
        .filter_map(|binding| {
            let (cast_overlap, ability_overlap) = binding
                .ids
                .iter()
                .map(|id| meaningful_tokens(&normalize_name(id)))
                .map(|tokens| {
                    (
                        token_overlap(&cast_tokens, &tokens),
                        token_overlap(&ability_tokens, &tokens),
                    )
                })
                .max_by_key(|(cast, ability)| cast * 3 + ability * 2)
                .unwrap_or_default();
            if (!cast_tokens.is_empty() && cast_overlap == 0)
                || (cast_tokens.is_empty()
                    && (ability_tokens.is_empty() || ability_overlap < ability_tokens.len() as i32))
            {
                return None;
            }
            let overlap = cast_overlap * 3 + ability_overlap * 2;
            let clip_tokens = meaningful_tokens(&normalize_name(clip_name(&binding.clip_path)));
            let clip_cast_overlap = token_overlap(&cast_tokens, &clip_tokens);
            let clip_ability_overlap = token_overlap(&ability_tokens, &clip_tokens);
            let start_bonus = i32::from(binding.clip_path.contains("start")) * 100;
            let locomotion_preference = if binding.clip_path.contains("stand_idle") {
                120
            } else {
                -(i32::from(binding.clip_path.contains("crouch")) * 80
                    + i32::from(binding.clip_path.contains("item")) * 60
                    + i32::from(binding.clip_path.contains("aim_")) * 40)
            };
            Some(NmClipMatch {
                clip_path: binding.clip_path.clone(),
                score: 30_000
                    + overlap * 1_000
                    + clip_cast_overlap * 2_000
                    + clip_ability_overlap * 500
                    + start_bonus
                    + locomotion_preference,
                reason: "nm-graph-state".into(),
            })
        })
        .max_by(|left, right| {
            left.score
                .cmp(&right.score)
                .then_with(|| right.clip_path.cmp(&left.clip_path))
        })
}

pub(crate) fn discriminative_graph_tokens(
    tokens: Vec<String>,
    bindings: &[NmGraphClipBinding],
) -> Vec<String> {
    if bindings.is_empty() {
        return tokens;
    }
    tokens
        .into_iter()
        .filter(|token| {
            let occurrences = bindings
                .iter()
                .filter(|binding| {
                    binding
                        .ids
                        .iter()
                        .any(|id| meaningful_tokens(&normalize_name(id)).contains(token))
                })
                .count();
            occurrences * 2 <= bindings.len()
        })
        .collect()
}

pub(crate) fn best_nm_clip_match(
    clip_paths: &[String],
    wanted: &str,
    secondary: Option<&str>,
    cast_match: bool,
) -> Option<NmClipMatch> {
    let wanted_tokens = discriminative_tokens(meaningful_tokens(wanted), clip_paths);
    let secondary_tokens = secondary.map(meaningful_tokens).unwrap_or_default();
    let mut matches = clip_paths
        .iter()
        .filter_map(|clip_path| {
            let candidate = normalize_name(clip_name(clip_path));
            if candidate == wanted {
                return Some(NmClipMatch {
                    clip_path: clip_path.clone(),
                    score: if cast_match { 20_000 } else { 10_000 },
                    reason: if cast_match {
                        "nm-cast-exact".into()
                    } else {
                        "nm-ability-exact".into()
                    },
                });
            }
            let candidate_tokens = meaningful_tokens(&candidate);
            let overlap = token_overlap(&wanted_tokens, &candidate_tokens);
            let compact_match = !wanted_tokens.is_empty()
                && !candidate_tokens.is_empty()
                && (wanted_tokens.concat().contains(&candidate_tokens.concat())
                    || candidate_tokens.concat().contains(&wanted_tokens.concat()));
            if overlap == 0 && !compact_match {
                return None;
            }
            let token_count = wanted_tokens.len().max(candidate_tokens.len()).max(1) as i32;
            let coverage = if compact_match {
                100
            } else {
                (overlap * 100) / token_count
            };
            if coverage < 50 {
                return None;
            }
            let secondary_overlap = token_overlap(&secondary_tokens, &candidate_tokens);
            let phase_bonus = if candidate.contains("start") {
                80
            } else if candidate.contains("intro") {
                60
            } else if candidate.contains("complete") || candidate.contains("release") {
                40
            } else {
                0
            };
            let score = if cast_match {
                (overlap * 2_000) + coverage + (secondary_overlap * 100)
            } else {
                (overlap * 1_000) + coverage
            } - candidate_tokens.len() as i32
                + phase_bonus;
            Some(NmClipMatch {
                clip_path: clip_path.clone(),
                score,
                reason: if cast_match {
                    "nm-cast-tokens".into()
                } else {
                    "nm-ability-tokens".into()
                },
            })
        })
        .collect::<Vec<_>>();
    matches.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then_with(|| left.clip_path.cmp(&right.clip_path))
    });
    matches.into_iter().next()
}

pub(crate) fn discriminative_tokens(tokens: Vec<String>, clip_paths: &[String]) -> Vec<String> {
    if clip_paths.is_empty() {
        return tokens;
    }
    let uncommon = tokens
        .iter()
        .filter(|token| {
            let occurrences = clip_paths
                .iter()
                .filter(|path| meaningful_tokens(&normalize_name(clip_name(path))).contains(token))
                .count();
            occurrences * 2 <= clip_paths.len()
        })
        .cloned()
        .collect::<Vec<_>>();
    if uncommon.is_empty() {
        tokens
    } else {
        uncommon
    }
}

pub(crate) fn clip_name(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

pub(crate) fn normalize_name(value: &str) -> String {
    let value = value
        .strip_suffix(".vnmclip_c")
        .or_else(|| value.strip_suffix(".vnmclip"))
        .unwrap_or(value);
    let chars = value.trim().chars().collect::<Vec<_>>();
    let mut normalized = String::with_capacity(chars.len());
    for (index, character) in chars.iter().copied().enumerate() {
        if !character.is_ascii_alphanumeric() {
            if !normalized.ends_with('_') {
                normalized.push('_');
            }
            continue;
        }
        let previous = index.checked_sub(1).and_then(|index| chars.get(index));
        let next = chars.get(index + 1);
        let starts_word = character.is_ascii_uppercase()
            && previous.is_some_and(|previous| {
                previous.is_ascii_lowercase()
                    || previous.is_ascii_digit()
                    || (previous.is_ascii_uppercase()
                        && next.is_some_and(|next| next.is_ascii_lowercase()))
            });
        if starts_word && !normalized.ends_with('_') {
            normalized.push('_');
        }
        normalized.push(character.to_ascii_lowercase());
    }
    loop {
        let stripped = normalized
            .strip_prefix("act_dota_")
            .or_else(|| normalized.strip_prefix("act_citadel_"))
            .or_else(|| normalized.strip_prefix("act_"))
            .or_else(|| normalized.strip_prefix("e_"))
            .or_else(|| normalized.strip_prefix("b_"));
        let Some(stripped) = stripped else {
            break;
        };
        normalized = stripped.to_string();
    }
    normalized
        .split('_')
        .filter(|token| !token.is_empty())
        .collect::<Vec<_>>()
        .join("_")
}

pub(crate) fn meaningful_tokens(value: &str) -> Vec<String> {
    value
        .split('_')
        .filter(|token| {
            !token.is_empty()
                && !matches!(
                    *token,
                    "ability"
                        | "citadel"
                        | "projectile"
                        | "generic"
                        | "cast"
                        | "casting"
                        | "channeling"
                        | "active"
                        | "start"
                        | "intro"
                        | "loop"
                        | "end"
                        | "complete"
                        | "release"
                        | "idle"
                        | "stand"
                        | "throw"
                        | "item"
                )
        })
        .map(str::to_string)
        .collect()
}

pub(crate) fn token_overlap(left: &[String], right: &[String]) -> i32 {
    left.iter()
        .filter(|token| right.iter().any(|candidate| candidate == *token))
        .count() as i32
}

pub(crate) fn parse_track_setting(value: &KvValue) -> Result<TrackCompressionSetting> {
    Ok(TrackCompressionSetting {
        translation: [
            parse_range(required_value(value, "m_translationRangeX")?)?,
            parse_range(required_value(value, "m_translationRangeY")?)?,
            parse_range(required_value(value, "m_translationRangeZ")?)?,
        ],
        scale: parse_range(required_value(value, "m_scaleRange")?)?,
        constant_rotation: parse_f32_array::<4>(required_value(value, "m_constantRotation")?)?,
        rotation_static: required_bool(value, "m_bIsRotationStatic")?,
        translation_static: required_bool(value, "m_bIsTranslationStatic")?,
        scale_static: required_bool(value, "m_bIsScaleStatic")?,
    })
}

pub(crate) fn parse_range(value: &KvValue) -> Result<QuantizationRange> {
    Ok(QuantizationRange {
        start: required_f32(value, "m_flRangeStart")?,
        length: required_f32(value, "m_flRangeLength")?,
    })
}

pub(crate) fn compiled_resource_path(path: &str) -> String {
    let path = path.replace('\\', "/");
    if path.ends_with("_c") {
        path
    } else {
        format!("{path}_c")
    }
}

pub(crate) fn parse_data(resource: &Resource) -> Result<KvValue> {
    let data = resource
        .block_bytes("DATA")
        .ok_or_else(|| Source2Error::Resource("NM resource has no DATA block".into()))?;
    crate::kv3::parse(data)
}

pub(crate) fn required_value<'a>(value: &'a KvValue, key: &str) -> Result<&'a KvValue> {
    value
        .get(key)
        .ok_or_else(|| Source2Error::Resource(format!("NM resource is missing {key}")))
}

pub(crate) fn required_array<'a>(value: &'a KvValue, key: &str) -> Result<&'a [KvValue]> {
    required_value(value, key)?
        .as_array()
        .ok_or_else(|| Source2Error::Resource(format!("NM field {key} is not an array")))
}

pub(crate) fn required_binary<'a>(value: &'a KvValue, key: &str) -> Result<&'a [u8]> {
    match required_value(value, key)? {
        KvValue::Binary(bytes) => Ok(bytes),
        _ => Err(Source2Error::Resource(format!(
            "NM field {key} is not binary"
        ))),
    }
}

pub(crate) fn required_string(value: &KvValue, key: &str) -> Result<String> {
    required_string_value(required_value(value, key)?)
}

pub(crate) fn required_string_value(value: &KvValue) -> Result<String> {
    value
        .as_string()
        .map(str::to_string)
        .ok_or_else(|| Source2Error::Resource("NM value is not a string".into()))
}

pub(crate) fn required_bool(value: &KvValue, key: &str) -> Result<bool> {
    required_value(value, key)?
        .as_bool()
        .ok_or_else(|| Source2Error::Resource(format!("NM field {key} is not boolean")))
}

pub(crate) fn required_i32_value(value: &KvValue) -> Result<i32> {
    value
        .as_i64()
        .and_then(|value| i32::try_from(value).ok())
        .ok_or_else(|| Source2Error::Resource("NM value is not i32".into()))
}

pub(crate) fn required_usize(value: &KvValue, key: &str) -> Result<usize> {
    required_usize_value(required_value(value, key)?)
}

pub(crate) fn required_usize_value(value: &KvValue) -> Result<usize> {
    match value {
        KvValue::Int(value) => usize::try_from(*value).ok(),
        KvValue::UInt(value) => usize::try_from(*value).ok(),
        _ => None,
    }
    .ok_or_else(|| Source2Error::Resource("NM value is not usize".into()))
}

pub(crate) fn required_f32(value: &KvValue, key: &str) -> Result<f32> {
    numeric_f32(required_value(value, key)?)
        .ok_or_else(|| Source2Error::Resource(format!("NM field {key} is not numeric")))
}

pub(crate) fn numeric_f32(value: &KvValue) -> Option<f32> {
    match value {
        KvValue::Float(value) => Some(*value as f32),
        KvValue::Int(value) => Some(*value as f32),
        KvValue::UInt(value) => Some(*value as f32),
        _ => None,
    }
}

pub(crate) fn parse_f32_array<const N: usize>(value: &KvValue) -> Result<[f32; N]> {
    let values = value
        .as_array()
        .ok_or_else(|| Source2Error::Resource("NM value is not a float array".into()))?;
    if values.len() != N {
        return Err(Source2Error::Resource(format!(
            "NM float array has {} values, expected {N}",
            values.len()
        )));
    }
    let mut output = [0.0; N];
    for (output, value) in output.iter_mut().zip(values) {
        *output = numeric_f32(value)
            .ok_or_else(|| Source2Error::Resource("NM array value is not numeric".into()))?;
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::ability_query_without_model_scope;

    #[test]
    fn hero_namespace_is_not_an_animation_match_token() {
        assert_eq!(
            ability_query_without_model_scope(
                "ability_viper_snakedash",
                "models/heroes_staging/viper/viper.vmdl_c",
            ),
            "snakedash"
        );
        assert_eq!(
            ability_query_without_model_scope(
                "ability_abrams_siphon_life",
                "models/heroes/abrams/abrams.vmdl_c",
            ),
            "siphon_life"
        );
    }
}
