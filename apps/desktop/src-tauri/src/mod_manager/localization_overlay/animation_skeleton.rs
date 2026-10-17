use super::asset_compatibility::{AssetRepair, AssetWarning, RepairKind, WarningKind};
use super::{
  CompiledDataSource, Kv3Value, Resource, animation_masks, animation_model_evidence,
  animation_poses, decode_compiled_data, kv3, normalize_path, object_set_case_insensitive,
  resources::ResourceSnapshot, runtime_values_equal,
};
use crate::errors::Error;
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn is_path(path: &str) -> bool {
  let path = normalize_path(path);
  path.starts_with("models/")
    && path.ends_with(".vnmskel_c")
    && path.split('/').all(|part| !matches!(part, "" | "." | ".."))
}

pub(super) fn prepare(
  resources: &ResourceSnapshot,
  sources: &BTreeMap<String, Vec<CompiledDataSource>>,
  models: &BTreeMap<String, Vec<CompiledDataSource>>,
  animation_inputs: &animation_model_evidence::AnimationInputs,
  repairs: &mut Vec<AssetRepair>,
  warnings: &mut Vec<AssetWarning>,
) -> Result<BTreeMap<String, Vec<u8>>, Error> {
  let mut output = BTreeMap::new();
  if sources.is_empty() {
    return Ok(output);
  }
  for (path, sources) in sources {
    let Some(bytes) = resources.game_bytes(path)? else {
      continue;
    };
    let candidates: Option<Vec<_>> = sources
      .iter()
      .map(|source| {
        let structural = if animation_inputs.needs_dependency_proof(&source.mod_id) {
          None
        } else {
          repair_resource(&source.bytes, &bytes)
        };
        structural.or_else(|| {
          let evidence =
            animation_model_evidence::find(resources, models, animation_inputs, source, path)?;
          repair_with_evidence(&source.bytes, &bytes, Some(&evidence))
        })
      })
      .collect();
    if let Some(candidates) = candidates.filter(|candidates| {
      !candidates.is_empty()
        && candidates
          .iter()
          .all(|(bytes, _)| bytes == &candidates[0].0)
    }) {
      let (repaired, kind) = candidates.into_iter().next().unwrap();
      if repaired == sources[0].bytes {
        continue;
      }
      log::info!("Refreshed compatible animation layout for {path}");
      for source in sources {
        repairs.push(AssetRepair {
          mod_id: source.mod_id.clone(),
          source_vpk: source.source_vpk.clone(),
          file_path: path.clone(),
          kind: kind.clone(),
        });
      }
      output.insert(path.clone(), repaired);
    } else {
      for source in sources {
        let changed = decode_compiled_data(&source.bytes, &source.source_vpk)
          .ok()
          .zip(decode_compiled_data(&bytes, path).ok())
          .is_some_and(|((_, old, _), (_, current, _))| {
            old.get("m_boneIDs") != current.get("m_boneIDs")
          });
        if !changed {
          continue;
        }
        warnings.push(AssetWarning {
          mod_id: source.mod_id.clone(), source_vpk: source.source_vpk.clone(),
          file_path: path.clone(), kind: WarningKind::UnverifiedSkeleton,
          detail: "Bone hierarchy, reference poses, metadata, or competing mod settings cannot be safely rebased".into(),
        });
      }
    }
  }
  Ok(output)
}

/// Retain authored masks while inheriting the current sampled bone layout.
/// A changed bind pose, hierarchy or unsupported metadata prevents repair.
fn repair_resource(source: &[u8], base: &[u8]) -> Option<(Vec<u8>, RepairKind)> {
  repair_with_evidence(source, base, None)
}

fn repair_with_evidence(
  source: &[u8],
  base: &[u8],
  evidence: Option<&animation_model_evidence::ModelEvidence>,
) -> Option<(Vec<u8>, RepairKind)> {
  let (_, old, old_encoding) = decode_compiled_data(source, "mod animation skeleton").ok()?;
  let (format, mut current, mut current_encoding) =
    decode_compiled_data(base, "current animation skeleton").ok()?;
  if equivalent_rigs(&old, &current) == Some(true) {
    return Some((base.to_vec(), RepairKind::AnimationSkeleton));
  }
  if equivalent_layout_with_evidence(&old, &current, evidence) != Some(true) {
    return None;
  }
  let (masks, encoding) =
    animation_masks::rebase(&old, &current, &old_encoding, &current_encoding)?;
  *current.get_mut("m_maskDefinitions")? = masks;
  *current_encoding.get_mut("m_maskDefinitions")? = encoding;
  animation_poses::preserve(&old, &old_encoding, &mut current, &mut current_encoding)?;
  if evidence.is_some() && animation_poses::self_consistent(&current) != Some(true) {
    return None;
  }
  let payload = kv3::encode_preserving(&current, &current_encoding, &format).ok()?;
  let bytes = Resource::parse(base)
    .ok()?
    .rebuild_with_data_preserving(&payload)
    .ok()?;
  let (decoded_format, decoded, decoded_encoding) =
    decode_compiled_data(&bytes, "rebased animation skeleton").ok()?;
  if decoded_format != format
    || !runtime_values_equal(&decoded, &current)
    || !kv3::encoding_preserved(&current, &current_encoding, &decoded_encoding)
  {
    return None;
  }
  Some((bytes, RepairKind::AnimationSkeletonRebased))
}

fn equivalent_rigs(old: &Kv3Value, current: &Kv3Value) -> Option<bool> {
  if !equivalent_layout(old, current)? {
    return Some(false);
  }
  let old_indices = old
    .get("m_boneIDs")?
    .as_array()?
    .iter()
    .enumerate()
    .map(|(index, name)| Some((name.as_str()?, index)))
    .collect::<Option<BTreeMap<_, _>>>()?;
  for (current_index, name) in current.get("m_boneIDs")?.as_array()?.iter().enumerate() {
    let Some(&old_index) = old_indices.get(name.as_str()?) else {
      continue;
    };
    for field in ["m_parentSpaceReferencePose", "m_modelSpaceReferencePose"] {
      if !equivalent_pose(
        old.get(field)?.as_array()?.get(old_index)?,
        current.get(field)?.as_array()?.get(current_index)?,
      )? {
        return Some(false);
      }
    }
  }
  let bones = current
    .get("m_boneIDs")?
    .as_array()?
    .iter()
    .map(|name| name.as_str().map(str::to_owned))
    .collect::<Option<BTreeSet<_>>>()?;
  let old_masks = canonical_masks(old.get("m_maskDefinitions")?, &bones)?;
  let current_masks = canonical_masks(current.get("m_maskDefinitions")?, &bones)?;
  Some(
    old_masks.keys().eq(current_masks.keys())
      && old_masks
        .iter()
        .all(|(name, value)| runtime_values_equal(value, &current_masks[name])),
  )
}

/// Compare semantic rig data rather than index order and compiler float noise.
/// Unknown metadata, changed hierarchy, and poses outside the drift bounds fail closed.
fn equivalent_layout(old: &Kv3Value, current: &Kv3Value) -> Option<bool> {
  equivalent_layout_with_evidence(old, current, None)
}

fn equivalent_layout_with_evidence(
  old: &Kv3Value,
  current: &Kv3Value,
  evidence: Option<&animation_model_evidence::ModelEvidence>,
) -> Option<bool> {
  let names = |root: &Kv3Value| -> Option<Vec<String>> {
    root
      .get("m_boneIDs")?
      .as_array()?
      .iter()
      .map(|value| value.as_str().map(str::to_owned))
      .collect()
  };
  let old_names = names(old)?;
  let current_names = names(current)?;
  for rig in [old, current] {
    if !super::asset_compatibility::valid_skeleton(
      rig,
      "m_boneIDs",
      "m_parentIndices",
      &[
        ("m_parentSpaceReferencePose", 8),
        ("m_modelSpaceReferencePose", 8),
      ],
    ) {
      return Some(false);
    }
    if evidence.is_some() && animation_poses::self_consistent(rig) != Some(true) {
      return Some(false);
    }
  }
  let indices = |names: &[String]| {
    names
      .iter()
      .enumerate()
      .map(|(index, name)| (name.clone(), index))
      .collect::<BTreeMap<_, _>>()
  };
  let old_indices = indices(&old_names);
  let current_indices = indices(&current_names);
  if old_names.is_empty()
    || current_names.is_empty()
    || old_indices.len() != old_names.len()
    || current_indices.len() != current_names.len()
  {
    return Some(false);
  }

  let old_parents = old.get("m_parentIndices")?.as_array()?;
  let current_parents = current.get("m_parentIndices")?.as_array()?;
  if old_parents.len() != old_names.len() || current_parents.len() != current_names.len() {
    return Some(false);
  }
  let parent_name = |parents: &[Kv3Value], names: &[String], index: usize| -> Option<String> {
    let parent = parents.get(index)?.as_int()?;
    if parent == -1 {
      Some(String::new())
    } else {
      names.get(usize::try_from(parent).ok()?).cloned()
    }
  };
  // Only known terminal helpers can disappear; hierarchy joints and custom bones stay protected.
  for (name, index) in &old_indices {
    if current_indices.contains_key(name) {
      continue;
    }
    let parent = old_parents.get(*index)?.as_int()?;
    let parent_name = usize::try_from(parent)
      .ok()
      .and_then(|index| old_names.get(index));
    let terminal = ["_end", "_end_L", "_end_R"]
      .iter()
      .any(|suffix| name.ends_with(suffix));
    let twist = name.split_once("_TWIST").is_some_and(|(stem, suffix)| {
      suffix.chars().all(|ch| ch.is_ascii_digit())
        && parent_name.is_some_and(|parent| parent == stem)
    });
    let aim_helper =
      name == "scapulaAimUp_JNT" && parent_name.is_some_and(|parent| parent == "spine_3");
    let knee_helper = ["L", "R"].iter().any(|side| {
      name == &format!("knee_helper_{side}")
        && parent_name.is_some_and(|parent| parent == &format!("leg_upper_{side}"))
    });
    if !(terminal || twist || aim_helper || knee_helper)
      || parent_name.is_none_or(|name| !current_indices.contains_key(name))
      || old_parents
        .iter()
        .any(|value| value.as_int() == Some(*index as i64))
    {
      // Every removed branch must end at a surviving ancestor; no retained sample
      // may depend on it. The named-parent comparison below protects retained joints.
      let mut ancestor = parent;
      while ancestor != -1 {
        let index = usize::try_from(ancestor).ok()?;
        if current_indices.contains_key(old_names.get(index)?) {
          break;
        }
        ancestor = old_parents.get(index)?.as_int()?;
      }
      if ancestor == -1
        || !evidence.is_some_and(|evidence| {
          parent_name.is_some_and(|parent| evidence.permits_removed(name, parent))
        })
      {
        return Some(false);
      }
    }
  }
  for (name, current_index) in &current_indices {
    let current_index = *current_index;
    let Some(&old_index) = old_indices.get(name) else {
      // Added world attachment is a non-deforming leaf anchored to an unchanged root.
      let parent = current_parents.get(current_index)?.as_int()?;
      let root = usize::try_from(parent).ok()?;
      let parent = current_names.get(root)?;
      let known_root_attachment =
        name == "attachWorld" && current_parents.get(root)?.as_int()? == -1;
      let verified_control = evidence.is_some_and(|evidence| {
        let Some(&old_parent) = old_indices.get(parent) else {
          return false;
        };
        let parent_poses_match = old
          .get("m_modelSpaceReferencePose")
          .and_then(Kv3Value::as_array)
          .and_then(|poses| poses.get(old_parent))
          .zip(
            current
              .get("m_modelSpaceReferencePose")
              .and_then(Kv3Value::as_array)
              .and_then(|poses| poses.get(root)),
          )
          .is_some_and(|(a, b)| equivalent_pose(a, b) == Some(true));
        current
          .get("m_parentSpaceReferencePose")
          .and_then(Kv3Value::as_array)
          .and_then(|poses| poses.get(current_index))
          .is_some_and(|pose| parent_poses_match && evidence.permits_added(name, parent, pose))
      });
      if !old_indices.contains_key(parent)
        || !(known_root_attachment || verified_control)
        || current_parents
          .iter()
          .any(|value| value.as_int() == Some(current_index as i64))
      {
        return Some(false);
      }
      continue;
    };
    if parent_name(old_parents, &old_names, old_index)?
      != parent_name(current_parents, &current_names, current_index)?
    {
      return Some(false);
    }
    if animation_poses::compatible(old, current, old_index, current_index) != Some(true) {
      let old_pose = old
        .get("m_parentSpaceReferencePose")?
        .as_array()?
        .get(old_index)?;
      let current_pose = current
        .get("m_parentSpaceReferencePose")?
        .as_array()?
        .get(current_index)?;
      let parent = parent_name(old_parents, &old_names, old_index)?;
      if !evidence
        .is_some_and(|evidence| evidence.permits_pose(name, &parent, old_pose, current_pose))
      {
        return Some(false);
      }
    }
  }
  let Kv3Value::Object(old_fields) = old else {
    return None;
  };
  const INDEXED_FIELDS: [&str; 6] = [
    "m_boneIDs",
    "m_parentIndices",
    "m_parentSpaceReferencePose",
    "m_modelSpaceReferencePose",
    "m_maskDefinitions",
    "m_numBonesToSampleAtLowLOD",
  ];
  // Current compiler/schema additions are inherited. Existing unknown metadata
  // must still match so a custom rig cannot be mistaken for an old vanilla export.
  for (name, value) in old_fields {
    if !INDEXED_FIELDS.contains(&name.as_str()) && !runtime_values_equal(value, current.get(name)?)
    {
      return Some(false);
    }
  }
  Some(true)
}

pub(super) fn equivalent_pose(old: &Kv3Value, current: &Kv3Value) -> Option<bool> {
  let old = old.as_array()?;
  let current = current.as_array()?;
  if old.len() != 8 || current.len() != 8 {
    return Some(false);
  }
  let numbers =
    |values: &[Kv3Value]| -> Option<Vec<f64>> { values.iter().map(Kv3Value::as_f64).collect() };
  let old = numbers(old)?;
  let current = numbers(current)?;
  if old.iter().chain(&current).any(|value| !value.is_finite()) {
    return Some(false);
  }
  let positions_match = old[..4]
    .iter()
    .zip(&current[..4])
    .all(|(a, b)| (a - b).abs() <= 0.001);
  // q and -q describe the same rotation.
  let rotations_match = [1.0, -1.0].iter().any(|sign| {
    old[4..]
      .iter()
      .zip(&current[4..])
      .all(|(a, b)| (a - sign * b).abs() <= 0.00001)
  });
  Some(positions_match && rotations_match)
}

fn canonical_masks(
  value: &Kv3Value,
  bones: &BTreeSet<String>,
) -> Option<BTreeMap<String, Kv3Value>> {
  let mut masks = BTreeMap::new();
  for mask in value.as_array()? {
    let id = mask.get("m_ID")?.as_str()?.to_ascii_lowercase();
    let mut mask = mask.clone();
    let Kv3Value::Object(fields) = &mut mask else {
      return None;
    };
    object_set_case_insensitive(fields, "m_ID", Kv3Value::String(id.clone()));
    let mut weights = mask.get("m_primaryWeightList")?.clone();
    let names = weights.get("m_boneIDs")?.as_array()?;
    let values = weights.get("m_weights")?.as_array()?;
    if names.len() != values.len() {
      return None;
    }
    let mut named = BTreeMap::new();
    for (name, weight) in names.iter().zip(values) {
      let name = name.as_str()?;
      if bones.contains(name) && named.insert(name.to_owned(), weight.clone()).is_some() {
        return None;
      }
    }
    let Kv3Value::Object(fields) = &mut weights else {
      return None;
    };
    object_set_case_insensitive(
      fields,
      "m_boneIDs",
      Kv3Value::Array(named.keys().cloned().map(Kv3Value::String).collect()),
    );
    object_set_case_insensitive(
      fields,
      "m_weights",
      Kv3Value::Array(named.into_values().collect()),
    );
    let Kv3Value::Object(fields) = &mut mask else {
      return None;
    };
    object_set_case_insensitive(fields, "m_primaryWeightList", weights);
    canonicalize_object_order(&mut mask);
    if masks.insert(id, mask).is_some() {
      return None;
    }
  }
  Some(masks)
}

fn canonicalize_object_order(value: &mut Kv3Value) {
  match value {
    Kv3Value::Object(fields) => {
      fields.sort_by(|(a, _), (b, _)| a.cmp(b));
      for (_, child) in fields {
        canonicalize_object_order(child);
      }
    }
    Kv3Value::Array(values) => {
      for child in values {
        canonicalize_object_order(child);
      }
    }
    _ => {}
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use source2_model::vpk_extract::VpkArchive;

  fn strings(names: &[&str]) -> Kv3Value {
    Kv3Value::Array(
      names
        .iter()
        .map(|name| Kv3Value::String((*name).into()))
        .collect(),
    )
  }

  fn fixture(reordered: bool) -> Kv3Value {
    let pose = Kv3Value::Array(
      [
        0.0,
        0.0,
        0.0,
        1.0,
        0.0,
        0.0,
        0.0,
        if reordered { -1.0 } else { 1.0 },
      ]
      .into_iter()
      .map(Kv3Value::Double)
      .collect(),
    );
    let weights = Kv3Value::Object(vec![
      (
        "m_skeletonName".into(),
        Kv3Value::String("rig.vnmskel".into()),
      ),
      (
        "m_boneIDs".into(),
        if reordered {
          strings(&["root", "child"])
        } else {
          strings(&["child", "root", "retired_bone"])
        },
      ),
      (
        "m_weights".into(),
        Kv3Value::Array(if reordered {
          vec![Kv3Value::Double(0.0), Kv3Value::Double(0.5)]
        } else {
          vec![
            Kv3Value::Double(0.5),
            Kv3Value::Double(0.0),
            Kv3Value::Double(1.0),
          ]
        }),
      ),
    ]);
    let mut result = Kv3Value::Object(vec![
      ("m_ID".into(), Kv3Value::String("rig.vnmskel".into())),
      ("m_bIsPropSkeleton".into(), Kv3Value::Bool(false)),
      (
        "m_boneIDs".into(),
        if reordered {
          strings(&["child", "root"])
        } else {
          strings(&["root", "child"])
        },
      ),
      (
        "m_parentIndices".into(),
        Kv3Value::Array(if reordered {
          vec![Kv3Value::Int(1), Kv3Value::Int(-1)]
        } else {
          vec![Kv3Value::Int(-1), Kv3Value::Int(0)]
        }),
      ),
      (
        "m_modelSpaceReferencePose".into(),
        Kv3Value::Array(vec![pose.clone(), pose.clone()]),
      ),
      (
        "m_parentSpaceReferencePose".into(),
        Kv3Value::Array(vec![pose.clone(), pose]),
      ),
      (
        "m_numBonesToSampleAtLowLOD".into(),
        Kv3Value::Int(if reordered { 1 } else { 2 }),
      ),
      ("m_secondarySkeletons".into(), Kv3Value::Array(Vec::new())),
      (
        "m_maskDefinitions".into(),
        Kv3Value::Array(vec![Kv3Value::Object(vec![
          (
            "m_ID".into(),
            Kv3Value::String(if reordered {
              "root".into()
            } else {
              "Root".into()
            }),
          ),
          ("m_primaryWeightList".into(), weights),
          ("m_secondaryWeightLists".into(), Kv3Value::Array(Vec::new())),
        ])]),
      ),
    ]);
    if reordered {
      let Kv3Value::Object(fields) = &mut result else {
        unreachable!()
      };
      object_set_case_insensitive(fields, "m_floatChannelSets", Kv3Value::Array(Vec::new()));
    }
    result
  }

  #[test]
  fn recognizes_equivalent_rigs_with_reordered_bones_and_pruned_masks() {
    assert_eq!(equivalent_rigs(&fixture(false), &fixture(true)), Some(true));
  }

  fn with_terminal_bone(mut rig: Kv3Value, name: &str) -> Kv3Value {
    let Kv3Value::Array(names) = rig.get_mut("m_boneIDs").unwrap() else {
      unreachable!()
    };
    names.push(Kv3Value::String(name.into()));
    let Kv3Value::Array(parents) = rig.get_mut("m_parentIndices").unwrap() else {
      unreachable!()
    };
    parents.push(Kv3Value::Int(1));
    for field in ["m_parentSpaceReferencePose", "m_modelSpaceReferencePose"] {
      let Kv3Value::Array(poses) = rig.get_mut(field).unwrap() else {
        unreachable!()
      };
      poses.push(poses[1].clone());
    }
    rig
  }

  #[test]
  fn recognizes_reordered_rigs_with_retired_terminal_end_bones() {
    for name in ["child_end", "child_end_L", "child_end_R"] {
      let old = with_terminal_bone(fixture(false), name);
      assert_eq!(equivalent_rigs(&old, &fixture(true)), Some(true), "{name}");
    }
  }

  #[test]
  fn recognizes_added_root_attachments_and_retired_twist_leaf_bones() {
    assert_eq!(
      equivalent_rigs(
        &fixture(false),
        &with_terminal_bone(fixture(true), "attachWorld")
      ),
      Some(true)
    );
    assert_eq!(
      equivalent_rigs(
        &with_terminal_bone(fixture(false), "child_TWIST1"),
        &fixture(true)
      ),
      Some(true)
    );
  }

  #[test]
  fn rebases_compiled_layout_without_overwriting_custom_mask_weights() {
    let mut old = with_terminal_bone(fixture(false), "child_TWIST1");
    let Kv3Value::Array(masks) = old.get_mut("m_maskDefinitions").unwrap() else {
      unreachable!()
    };
    let Kv3Value::Array(weights) = masks[0]
      .get_mut("m_primaryWeightList")
      .unwrap()
      .get_mut("m_weights")
      .unwrap()
    else {
      unreachable!()
    };
    weights[0] = Kv3Value::Double(0.8);
    let mut extra = masks[0].clone();
    let Kv3Value::Object(fields) = &mut extra else {
      unreachable!()
    };
    object_set_case_insensitive(fields, "m_ID", Kv3Value::String("custom_mask".into()));
    masks.push(extra);
    let mut current = fixture(true);
    let Kv3Value::Array(masks) = current.get_mut("m_maskDefinitions").unwrap() else {
      unreachable!()
    };
    let mut added = masks[0].clone();
    let Kv3Value::Object(fields) = &mut added else {
      unreachable!()
    };
    object_set_case_insensitive(fields, "m_ID", Kv3Value::String("new_required_mask".into()));
    masks.push(added);
    let compiled = |value: Kv3Value| {
      let Kv3Value::Object(fields) = value else {
        unreachable!()
      };
      super::super::tests::compiled_resource(fields)
    };
    let current_bytes = compiled(current.clone());
    let (bytes, _) = repair_resource(&compiled(old.clone()), &current_bytes).unwrap();
    let (_, result, _) = decode_compiled_data(&bytes, "rebased fixture").unwrap();
    assert_eq!(result.get("m_boneIDs"), current.get("m_boneIDs"));
    let masks = result.get("m_maskDefinitions").unwrap().as_array().unwrap();
    assert_eq!(masks.len(), 3);
    assert_eq!(masks[2].get("m_ID").unwrap().as_str(), Some("custom_mask"));
    assert_eq!(
      masks[2]
        .get("m_primaryWeightList")
        .unwrap()
        .get("m_boneIDs"),
      Some(&strings(&["child", "root"]))
    );
    let weights = masks[0].get("m_primaryWeightList").unwrap();
    assert_eq!(weights.get("m_boneIDs"), Some(&strings(&["child", "root"])));
    assert_eq!(
      weights.get("m_weights").unwrap().as_array().unwrap()[0].as_f64(),
      Some(0.8)
    );
    let Kv3Value::Array(poses) = old.get_mut("m_parentSpaceReferencePose").unwrap() else {
      unreachable!()
    };
    poses[0] = Kv3Value::Array(vec![Kv3Value::Double(10.0); 8]);
    assert!(repair_resource(&compiled(old), &current_bytes).is_none());
  }

  #[test]
  fn rejects_unverified_helper_topology_and_added_deforming_bones() {
    let current = fixture(true);
    let mut old = with_terminal_bone(fixture(false), "root_TWIST1");
    assert_eq!(equivalent_rigs(&old, &current), Some(false));
    let Kv3Value::Array(parents) = old.get_mut("m_parentIndices").unwrap() else {
      unreachable!()
    };
    parents[1] = Kv3Value::Int(2);
    parents[2] = Kv3Value::Int(0);
    assert_eq!(equivalent_rigs(&old, &current), Some(false));
    let mut added = with_terminal_bone(current.clone(), "attachWorld");
    let Kv3Value::Array(parents) = added.get_mut("m_parentIndices").unwrap() else {
      unreachable!()
    };
    parents[2] = Kv3Value::Int(0);
    assert_eq!(equivalent_rigs(&fixture(false), &added), Some(false));
    assert_eq!(
      equivalent_rigs(
        &fixture(false),
        &with_terminal_bone(current, "custom_joint")
      ),
      Some(false)
    );
  }

  #[test]
  fn rebase_rejects_unsupported_secondary_masks_and_weight_metadata() {
    let compiled = |value: Kv3Value| {
      let Kv3Value::Object(fields) = value else {
        unreachable!()
      };
      super::super::tests::compiled_resource(fields)
    };
    let base = compiled(fixture(true));
    for field in ["m_secondaryWeightLists", "m_skeletonName", "m_weights"] {
      let mut old = fixture(false);
      let Kv3Value::Array(masks) = old.get_mut("m_maskDefinitions").unwrap() else {
        unreachable!()
      };
      if field == "m_secondaryWeightLists" {
        *masks[0].get_mut(field).unwrap() = Kv3Value::Array(vec![Kv3Value::Object(Vec::new())]);
      } else {
        let weights = masks[0].get_mut("m_primaryWeightList").unwrap();
        *weights.get_mut(field).unwrap() = if field == "m_skeletonName" {
          Kv3Value::String("custom_secondary_rig".into())
        } else {
          Kv3Value::Array(vec![Kv3Value::Double(0.5)])
        };
      }
      assert!(repair_resource(&compiled(old), &base).is_none(), "{field}");
    }
  }

  #[test]
  fn preserves_custom_leaf_bones_and_nonterminal_end_bones() {
    let current = fixture(true);
    assert_eq!(
      equivalent_rigs(
        &with_terminal_bone(fixture(false), "custom_attachment"),
        &current
      ),
      Some(false)
    );
    let mut old = with_terminal_bone(fixture(false), "root_end");
    let Kv3Value::Array(parents) = old.get_mut("m_parentIndices").unwrap() else {
      unreachable!()
    };
    parents[1] = Kv3Value::Int(2);
    parents[2] = Kv3Value::Int(0);
    assert_eq!(equivalent_rigs(&old, &current), Some(false));
    let Kv3Value::Array(parents) = old.get_mut("m_parentIndices").unwrap() else {
      unreachable!()
    };
    parents[1] = Kv3Value::Int(0);
    parents[2] = Kv3Value::Int(99);
    assert_eq!(equivalent_rigs(&old, &current), Some(false));
  }

  #[test]
  fn preserves_authored_pose_mask_and_metadata_changes() {
    let current = fixture(true);
    for field in [
      "m_parentSpaceReferencePose",
      "m_maskDefinitions",
      "m_bIsPropSkeleton",
      "m_parentIndices",
      "m_boneIDs",
    ] {
      let mut authored = fixture(false);
      let Kv3Value::Object(fields) = &mut authored else {
        unreachable!()
      };
      let replacement = match field {
        "m_parentSpaceReferencePose" => {
          Kv3Value::Array(vec![Kv3Value::Array(vec![Kv3Value::Double(10.0); 8]); 2])
        }
        "m_maskDefinitions" => Kv3Value::Array(Vec::new()),
        "m_parentIndices" => Kv3Value::Array(vec![Kv3Value::Int(-1); 2]),
        "m_boneIDs" => strings(&["root", "authored_bone"]),
        _ => Kv3Value::Bool(true),
      };
      object_set_case_insensitive(fields, field, replacement);
      assert_eq!(
        equivalent_rigs(&authored, &current),
        Some(false),
        "must preserve {field}"
      );
    }
  }

  fn compiled_fixture(value: Kv3Value) -> Vec<u8> {
    let Kv3Value::Object(fields) = value else {
      unreachable!()
    };
    super::super::tests::compiled_resource(fields)
  }

  #[test]
  fn rebases_retired_knee_helpers_without_accepting_custom_hierarchy() {
    for side in ["L", "R"] {
      let parent = format!("leg_upper_{side}");
      let helper = format!("knee_helper_{side}");
      let mut old = fixture(false);
      let mut current = fixture(true);
      rename_fixture(&mut old, "pelvis", &parent, "unrelated.vnmskel");
      rename_fixture(&mut current, "pelvis", &parent, "unrelated.vnmskel");
      let source = with_terminal_bone(old.clone(), &helper);
      assert!(
        repair_resource(
          &compiled_fixture(source),
          &compiled_fixture(current.clone())
        )
        .is_some()
      );
      let wrong_parent = with_terminal_bone(fixture(false), &helper);
      assert!(
        repair_resource(
          &compiled_fixture(wrong_parent),
          &compiled_fixture(fixture(true))
        )
        .is_none()
      );
      let mut joint = with_terminal_bone(old, &helper);
      let Kv3Value::Array(parents) = joint.get_mut("m_parentIndices").unwrap() else {
        unreachable!()
      };
      parents[1] = Kv3Value::Int(2);
      parents[2] = Kv3Value::Int(0);
      assert!(repair_resource(&compiled_fixture(joint), &compiled_fixture(current)).is_none());
    }
  }

  #[test]
  fn rebases_tiny_pose_drift_and_preserves_original_named_reference_poses() {
    let make = |reordered: bool, angle: f64| {
      let mut rig = fixture(reordered);
      let root = if reordered { 1 } else { 0 };
      let child = 1 - root;
      let rotation = [0.0, 0.0, (angle / 2.0).sin(), (angle / 2.0).cos()];
      for field in ["m_parentSpaceReferencePose", "m_modelSpaceReferencePose"] {
        let Kv3Value::Array(poses) = rig.get_mut(field).unwrap() else {
          unreachable!()
        };
        poses[root] = Kv3Value::Array(
          [0.0, 0.0, 0.0, 1.0]
            .into_iter()
            .chain(rotation)
            .map(Kv3Value::Double)
            .collect(),
        );
        poses[child] = Kv3Value::Array(
          if field == "m_parentSpaceReferencePose" {
            [20.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]
          } else {
            [
              20.0 * angle.cos(),
              20.0 * angle.sin(),
              0.0,
              1.0,
              rotation[0],
              rotation[1],
              rotation[2],
              rotation[3],
            ]
          }
          .into_iter()
          .map(Kv3Value::Double)
          .collect(),
        );
      }
      rig
    };
    let current = make(true, 0.0);
    let old = make(false, 0.00012);
    let (bytes, kind) = repair_resource(
      &compiled_fixture(old.clone()),
      &compiled_fixture(current.clone()),
    )
    .unwrap();
    assert!(matches!(kind, RepairKind::AnimationSkeletonRebased));
    let (_, result, _) = decode_compiled_data(&bytes, "preserved poses").unwrap();
    assert_eq!(result.get("m_boneIDs"), current.get("m_boneIDs"));
    for field in ["m_parentSpaceReferencePose", "m_modelSpaceReferencePose"] {
      let source = old.get(field).unwrap().as_array().unwrap();
      assert_eq!(
        result.get(field).unwrap().as_array().unwrap(),
        &[source[1].clone(), source[0].clone()]
      );
    }
    assert!(
      repair_resource(
        &compiled_fixture(make(false, 0.1)),
        &compiled_fixture(current.clone())
      )
      .is_none()
    );
    let mut inconsistent = old;
    let Kv3Value::Array(poses) = inconsistent.get_mut("m_modelSpaceReferencePose").unwrap() else {
      unreachable!()
    };
    let Kv3Value::Array(pose) = &mut poses[1] else {
      unreachable!()
    };
    pose[0] = Kv3Value::Double(30.0);
    assert!(repair_resource(&compiled_fixture(inconsistent), &compiled_fixture(current)).is_none());
  }

  fn rename_fixture(value: &mut Kv3Value, root: &str, child: &str, resource: &str) {
    match value {
      Kv3Value::String(name) => {
        *name = match name.as_str() {
          "root" | "Root" => root.to_owned(),
          "child" => child.to_owned(),
          "rig.vnmskel" => resource.to_owned(),
          _ => return,
        };
      }
      Kv3Value::Array(values) => {
        for value in values {
          rename_fixture(value, root, child, resource);
        }
      }
      Kv3Value::Object(fields) => {
        for (_, value) in fields {
          rename_fixture(value, root, child, resource);
        }
      }
      _ => {}
    }
  }

  fn model_fixture(skeleton: &Kv3Value, resource: &str) -> Kv3Value {
    let poses = skeleton
      .get("m_parentSpaceReferencePose")
      .unwrap()
      .as_array()
      .unwrap();
    let components = |range: std::ops::Range<usize>| {
      Kv3Value::Array(
        poses
          .iter()
          .map(|pose| Kv3Value::Array(pose.as_array().unwrap()[range.clone()].to_vec()))
          .collect(),
      )
    };
    Kv3Value::Object(vec![
      (
        "m_modelSkeleton".into(),
        Kv3Value::Object(vec![
          (
            "m_boneName".into(),
            skeleton.get("m_boneIDs").unwrap().clone(),
          ),
          (
            "m_nParent".into(),
            skeleton.get("m_parentIndices").unwrap().clone(),
          ),
          ("m_bonePosParent".into(), components(0..3)),
          ("m_boneRotParent".into(), components(4..8)),
          (
            "m_boneScaleParent".into(),
            Kv3Value::Array(
              poses
                .iter()
                .map(|pose| pose.as_array().unwrap()[3].clone())
                .collect(),
            ),
          ),
        ]),
      ),
      ("m_vecNmSkeletonRefs".into(), strings(&[resource])),
      (
        "m_animGraph2Refs".into(),
        Kv3Value::Array(vec![Kv3Value::Object(vec![
          (
            "m_hGraph".into(),
            Kv3Value::String("animgraphs/shared.vnmgraph".into()),
          ),
          ("m_sIdentifier".into(), Kv3Value::String("".into())),
        ])]),
      ),
      ("m_refAnimGroups".into(), Kv3Value::Array(Vec::new())),
      ("m_refSequenceGroups".into(), Kv3Value::Array(Vec::new())),
    ])
  }

  #[test]
  fn model_evidence_preserves_large_authored_poses_and_rejects_inconsistent_transforms() {
    let mut old = fixture(false);
    let current = fixture(true);
    let authored = Kv3Value::Array(
      [
        2.0,
        0.0,
        0.0,
        1.0,
        0.0,
        0.0,
        (0.45_f64).sin(),
        (0.45_f64).cos(),
      ]
      .into_iter()
      .map(Kv3Value::Double)
      .collect(),
    );
    for field in ["m_parentSpaceReferencePose", "m_modelSpaceReferencePose"] {
      let Kv3Value::Array(poses) = old.get_mut(field).unwrap() else {
        unreachable!()
      };
      poses[1] = authored.clone();
    }
    let model = model_fixture(&old, "rig.vnmskel");
    let base_model = model_fixture(&current, "rig.vnmskel");
    let evidence =
      animation_model_evidence::ModelEvidence::from_models(&model, &base_model, None).unwrap();
    let base = compiled_fixture(current.clone());
    assert!(repair_resource(&compiled_fixture(old.clone()), &base).is_none());
    let (bytes, _) =
      repair_with_evidence(&compiled_fixture(old.clone()), &base, Some(&evidence)).unwrap();
    let (_, repaired, _) = decode_compiled_data(&bytes, "authored bind poses").unwrap();
    for field in ["m_parentSpaceReferencePose", "m_modelSpaceReferencePose"] {
      assert_eq!(
        repaired.get(field).unwrap().as_array().unwrap()[0],
        authored
      );
    }
    let wrong_model =
      animation_model_evidence::ModelEvidence::from_models(&base_model, &base_model, None).unwrap();
    assert!(
      repair_with_evidence(&compiled_fixture(old.clone()), &base, Some(&wrong_model)).is_none()
    );
    let Kv3Value::Array(poses) = old.get_mut("m_modelSpaceReferencePose").unwrap() else {
      unreachable!()
    };
    let Kv3Value::Array(pose) = &mut poses[1] else {
      unreachable!()
    };
    pose[0] = Kv3Value::Double(30.0);
    assert!(repair_with_evidence(&compiled_fixture(old), &base, Some(&evidence)).is_none());
    let mut changed_graph = model;
    let Kv3Value::Array(graphs) = changed_graph.get_mut("m_animGraph2Refs").unwrap() else {
      unreachable!()
    };
    *graphs[0].get_mut("m_hGraph").unwrap() =
      Kv3Value::String("animgraphs/authored.vnmgraph".into());
    assert!(
      animation_model_evidence::ModelEvidence::from_models(&changed_graph, &base_model, None)
        .is_none()
    );
  }

  #[test]
  fn model_evidence_rejects_changed_retired_bind_bones_and_retained_descendants() {
    let old = with_terminal_bone(fixture(false), "arbitrary_control");
    let current = fixture(true);
    let model = model_fixture(&old, "rig.vnmskel");
    let mut changed_model = model.clone();
    let Kv3Value::Array(positions) = changed_model
      .get_mut("m_modelSkeleton")
      .unwrap()
      .get_mut("m_bonePosParent")
      .unwrap()
    else {
      unreachable!()
    };
    let Kv3Value::Array(position) = &mut positions[2] else {
      unreachable!()
    };
    position[0] = Kv3Value::Double(4.0);
    let evidence =
      animation_model_evidence::ModelEvidence::from_models(&model, &changed_model, None).unwrap();
    assert!(
      repair_with_evidence(
        &compiled_fixture(old.clone()),
        &compiled_fixture(current.clone()),
        Some(&evidence)
      )
      .is_none()
    );
    let evidence =
      animation_model_evidence::ModelEvidence::from_models(&model, &model, None).unwrap();
    let mut old = old;
    let Kv3Value::Array(parents) = old.get_mut("m_parentIndices").unwrap() else {
      unreachable!()
    };
    parents[1] = Kv3Value::Int(2);
    parents[2] = Kv3Value::Int(0);
    assert!(
      repair_with_evidence(
        &compiled_fixture(old),
        &compiled_fixture(current),
        Some(&evidence)
      )
      .is_none()
    );
  }

  #[test]
  fn model_evidence_accepts_only_unused_current_control_bones() {
    let old = fixture(false);
    let current = with_terminal_bone(fixture(true), "arbitrary_new_control");
    let model = model_fixture(&old, "rig.vnmskel");
    let mut base_model = model_fixture(&current, "rig.vnmskel");
    let Kv3Value::Object(fields) = &mut base_model else {
      unreachable!()
    };
    fields.push(("m_refMeshes".into(), Kv3Value::Array(Vec::new())));
    let Kv3Value::Object(fields) = base_model.get_mut("m_modelSkeleton").unwrap() else {
      unreachable!()
    };
    fields.push((
      "m_boneSphere".into(),
      Kv3Value::Array(vec![Kv3Value::Double(0.0); 3]),
    ));
    let mesh = Kv3Value::Object(vec![
      (
        "m_skeleton".into(),
        Kv3Value::Object(vec![("m_bones".into(), strings(&["root", "child"]))]),
      ),
      ("m_constraints".into(), Kv3Value::Array(Vec::new())),
    ]);
    let base = compiled_fixture(current);
    let source = compiled_fixture(old);
    assert!(repair_resource(&source, &base).is_none());
    let evidence = animation_model_evidence::ModelEvidence::from_models(
      &model,
      &base_model,
      Some(std::slice::from_ref(&mesh)),
    )
    .unwrap();
    assert!(repair_with_evidence(&source, &base, Some(&evidence)).is_some());
    let no_mesh =
      animation_model_evidence::ModelEvidence::from_models(&model, &base_model, None).unwrap();
    assert!(repair_with_evidence(&source, &base, Some(&no_mesh)).is_none());
    for field in ["m_skeleton", "m_attachments", "m_constraints"] {
      let mut used = mesh.clone();
      let Kv3Value::Object(fields) = &mut used else {
        unreachable!()
      };
      let value = if field == "m_skeleton" {
        Kv3Value::Object(vec![(
          "m_bones".into(),
          strings(&["arbitrary_new_control"]),
        )])
      } else {
        strings(&["arbitrary_new_control"])
      };
      object_set_case_insensitive(fields, field, value);
      let evidence =
        animation_model_evidence::ModelEvidence::from_models(&model, &base_model, Some(&[used]))
          .unwrap();
      assert!(
        repair_with_evidence(&source, &base, Some(&evidence)).is_none(),
        "{field}"
      );
    }
    let Kv3Value::Array(spheres) = base_model
      .get_mut("m_modelSkeleton")
      .unwrap()
      .get_mut("m_boneSphere")
      .unwrap()
    else {
      unreachable!()
    };
    spheres[2] = Kv3Value::Double(1.0);
    let evidence =
      animation_model_evidence::ModelEvidence::from_models(&model, &base_model, Some(&[mesh]))
        .unwrap();
    assert!(repair_with_evidence(&source, &base, Some(&evidence)).is_none());
  }

  #[test]
  fn model_backed_sampling_branches_rebase_without_mod_identity() {
    use super::super::{LocalizationModInput, LocalizationOverlayPlan, pack_directory};
    use std::fs;
    for (id, stem, virtual_branch) in [
      ("arbitrary-a", "robot", false),
      ("local-b", "creature", true),
    ] {
      let temp = tempfile::tempdir().unwrap();
      let citadel = temp.path().join("citadel");
      fs::create_dir_all(&citadel).unwrap();
      let resource = format!("models/custom/{stem}/sampling.vnmskel");
      let path = format!("{resource}_c");
      let model_path = format!("models/custom/{stem}/body.vmdl_c");
      let mut old = with_terminal_bone(
        with_terminal_bone(fixture(false), "retired_control"),
        "retired_tip",
      );
      let Kv3Value::Array(parents) = old.get_mut("m_parentIndices").unwrap() else {
        unreachable!()
      };
      parents[3] = Kv3Value::Int(2);
      let mut current = fixture(true);
      rename_fixture(&mut old, "main_body", "limb_joint", &resource);
      rename_fixture(&mut current, "main_body", "limb_joint", &resource);
      let full_rig = if virtual_branch { &current } else { &old };
      let full_model = compiled_fixture(model_fixture(full_rig, &resource));
      let original = compiled_fixture(old);
      for (directory, skeleton) in [
        (
          temp.path().join("vanilla"),
          compiled_fixture(current.clone()),
        ),
        (temp.path().join("mod"), original),
      ] {
        for (file, bytes) in [(&path, &skeleton), (&model_path, &full_model)] {
          let entry = directory.join(file);
          fs::create_dir_all(entry.parent().unwrap()).unwrap();
          fs::write(entry, bytes).unwrap();
        }
        let output = if directory.ends_with("vanilla") {
          citadel.join("pak01_dir.vpk")
        } else {
          temp.path().join("custom_dir.vpk")
        };
        pack_directory(&directory, &output).unwrap();
      }
      let mod_vpk = temp.path().join("custom_dir.vpk");
      let source_bytes = fs::read(&mod_vpk).unwrap();
      let plan = LocalizationOverlayPlan::build(
        &citadel,
        &[LocalizationModInput {
          mod_id: id.into(),
          vpks: vec![mod_vpk.clone()],
        }],
      )
      .unwrap();
      assert_eq!(
        plan.analysis.asset_repairs.len(),
        1,
        "{:?}",
        plan.analysis.asset_warnings
      );
      assert!(matches!(
        plan.analysis.asset_repairs[0].kind,
        RepairKind::AnimationSkeletonRebased
      ));
      let output = temp.path().join("overlay/pak01_dir.vpk");
      plan.write(&output, &[]).unwrap();
      let bytes = VpkArchive::open(&output)
        .unwrap()
        .extract_entry(&path)
        .unwrap();
      let (_, rebuilt, _) = decode_compiled_data(&bytes, "model-backed overlay").unwrap();
      assert_eq!(rebuilt.get("m_boneIDs"), current.get("m_boneIDs"));
      assert_eq!(fs::read(&mod_vpk).unwrap(), source_bytes);
      let other_directory = temp.path().join("other_mod");
      let legacy_graph = other_directory.join("models/unrelated/preview.vanmgrph_c");
      fs::create_dir_all(legacy_graph.parent().unwrap()).unwrap();
      fs::write(&legacy_graph, []).unwrap();
      let other_vpk = temp.path().join("other_dir.vpk");
      pack_directory(&other_directory, &other_vpk).unwrap();
      let inputs = vec![
        LocalizationModInput {
          mod_id: id.into(),
          vpks: vec![mod_vpk.clone()],
        },
        LocalizationModInput {
          mod_id: "unrelated-animation-mod".into(),
          vpks: vec![other_vpk.clone()],
        },
      ];
      assert_eq!(
        LocalizationOverlayPlan::build(&citadel, &inputs)
          .unwrap()
          .analysis
          .asset_repairs
          .len(),
        1
      );
      let competing_model = other_directory.join(&model_path);
      fs::create_dir_all(competing_model.parent().unwrap()).unwrap();
      fs::write(&competing_model, &full_model).unwrap();
      pack_directory(&other_directory, &other_vpk).unwrap();
      assert!(
        LocalizationOverlayPlan::build(&citadel, &inputs)
          .unwrap()
          .analysis
          .asset_repairs
          .is_empty()
      );
      fs::remove_file(competing_model).unwrap();
      let active_clip = other_directory.join("animations/shared.vanim_c");
      fs::create_dir_all(active_clip.parent().unwrap()).unwrap();
      fs::write(active_clip, []).unwrap();
      pack_directory(&other_directory, &other_vpk).unwrap();
      assert!(
        LocalizationOverlayPlan::build(&citadel, &inputs)
          .unwrap()
          .analysis
          .asset_repairs
          .is_empty()
      );
      let owned_graph = temp.path().join("mod/models/custom/preview.vanmgrph_c");
      fs::create_dir_all(owned_graph.parent().unwrap()).unwrap();
      fs::write(owned_graph, []).unwrap();
      pack_directory(&temp.path().join("mod"), &mod_vpk).unwrap();
      assert!(
        LocalizationOverlayPlan::build(&citadel, &inputs[..1])
          .unwrap()
          .analysis
          .asset_repairs
          .is_empty()
      );
    }
  }

  #[test]
  fn overlay_repairs_depend_on_structure_not_mod_or_hero_identity() {
    use super::super::{LocalizationModInput, LocalizationOverlayPlan, pack_directory};
    use std::fs;

    for (mod_id, path, root_bone, child_bone, custom_mask) in [
      (
        "unrelated-author-one",
        "models/custom/robot/robot.vnmskel_c",
        "pelvis_main",
        "forearm_left",
        false,
      ),
      (
        "local-arbitrary-two",
        "models/creatures/lizard/rig.vnmskel_c",
        "body_root",
        "tail_joint",
        true,
      ),
    ] {
      let temp = tempfile::tempdir().unwrap();
      let citadel = temp.path().join("citadel");
      let vanilla = temp.path().join("vanilla");
      let mod_directory = temp.path().join("mod");
      fs::create_dir_all(&citadel).unwrap();
      let mut old = fixture(false);
      let mut current = fixture(true);
      let resource = path.trim_end_matches("_c");
      rename_fixture(&mut old, root_bone, child_bone, resource);
      rename_fixture(&mut current, root_bone, child_bone, resource);
      if custom_mask {
        old = with_terminal_bone(old, &format!("{child_bone}_TWIST7"));
        let Kv3Value::Array(masks) = old.get_mut("m_maskDefinitions").unwrap() else {
          unreachable!()
        };
        let Kv3Value::Array(weights) = masks[0]
          .get_mut("m_primaryWeightList")
          .unwrap()
          .get_mut("m_weights")
          .unwrap()
        else {
          unreachable!()
        };
        weights[0] = Kv3Value::Double(0.8);
      }
      let compiled = |value: Kv3Value| {
        let Kv3Value::Object(fields) = value else {
          unreachable!()
        };
        super::super::tests::compiled_resource(fields)
      };
      let current_bytes = compiled(current.clone());
      let original = compiled(old);
      for (directory, bytes) in [(&vanilla, &current_bytes), (&mod_directory, &original)] {
        let entry = directory.join(path);
        fs::create_dir_all(entry.parent().unwrap()).unwrap();
        fs::write(entry, bytes).unwrap();
      }
      pack_directory(&vanilla, &citadel.join("pak01_dir.vpk")).unwrap();
      let mod_vpk = temp.path().join("unrelated_mod_dir.vpk");
      pack_directory(&mod_directory, &mod_vpk).unwrap();
      let original_vpk = fs::read(&mod_vpk).unwrap();
      let plan = LocalizationOverlayPlan::build(
        &citadel,
        &[LocalizationModInput {
          mod_id: mod_id.into(),
          vpks: vec![mod_vpk.clone()],
        }],
      )
      .unwrap();
      assert!(
        plan.analysis.asset_warnings.is_empty(),
        "{:?}",
        plan.analysis.asset_warnings
      );
      let [repair] = plan.analysis.asset_repairs.as_slice() else {
        panic!("expected one structural repair")
      };
      assert_eq!(repair.mod_id, mod_id);
      assert_eq!(repair.file_path, path);
      assert!(matches!(
        (&repair.kind, custom_mask),
        (RepairKind::AnimationSkeleton, false) | (RepairKind::AnimationSkeletonRebased, true)
      ));
      let output = temp.path().join("overlay/pak01_dir.vpk");
      assert!(plan.write(&output, &[]).unwrap().has_overlay);
      let bytes = VpkArchive::open(&output)
        .unwrap()
        .extract_entry(path)
        .unwrap();
      let (_, result, _) = decode_compiled_data(&bytes, "unrelated mod overlay").unwrap();
      assert_eq!(result.get("m_boneIDs"), current.get("m_boneIDs"));
      if custom_mask {
        let masks = result.get("m_maskDefinitions").unwrap().as_array().unwrap();
        let weights = masks[0].get("m_primaryWeightList").unwrap();
        assert_eq!(
          weights.get("m_boneIDs"),
          Some(&strings(&[child_bone, root_bone]))
        );
        assert_eq!(
          weights.get("m_weights").unwrap().as_array().unwrap()[0].as_f64(),
          Some(0.8)
        );
      } else {
        assert_eq!(bytes, current_bytes);
      }
      assert_eq!(fs::read(&mod_vpk).unwrap(), original_vpk);
    }
  }

  #[test]
  fn rejects_malformed_or_unsupported_rigs_and_unsafe_paths() {
    let current = fixture(true);
    assert_eq!(
      equivalent_rigs(&Kv3Value::Object(Vec::new()), &current),
      None
    );
    assert!(!is_path("models/../../outside.vnmskel_c"));
    assert!(is_path("models/heroes_wip/mina/mina.vnmskel_c"));
  }
}
