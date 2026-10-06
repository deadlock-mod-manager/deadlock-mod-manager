//! Restore absent NM bindings after proving the sampled hierarchy and pose layout.
//! Extra authored deformation bones and original geometry remain intact.
use super::{
  CompiledDataSource, Kv3Value, Resource,
  animation_model_evidence::{self, AnimationInputs, ModelRig},
  animation_skeleton::equivalent_pose,
  asset_compatibility::{AssetRepair, AssetWarning, RepairKind, WarningKind},
  decode_compiled_data, kv3,
  resources::ResourceSnapshot,
  runtime_values_equal,
};
use crate::errors::Error;
use std::collections::{BTreeMap, BTreeSet};
use vpkmanager::{material_repair, resource_id::resource_id};

const FIELDS: [&str; 2] = ["m_animGraph2Refs", "m_vecNmSkeletonRefs"];
mod metadata;
mod rig_rebase;
mod sampled_controls;
mod scaled_rig;

pub(super) fn scaled_poses_compatible(poses: &[(String, Kv3Value, Kv3Value)]) -> bool {
  scaled_rig::compatible(poses)
}

pub(super) fn prepare(
  resources: &ResourceSnapshot,
  sources: &BTreeMap<String, Vec<CompiledDataSource>>,
  inputs: &AnimationInputs,
  repairs: &mut Vec<AssetRepair>,
  warnings: &mut Vec<AssetWarning>,
) -> Result<BTreeMap<String, Vec<u8>>, Error> {
  let mut output = BTreeMap::new();
  for (path, sources) in sources {
    let [source] = sources.as_slice() else {
      continue;
    };
    let Some(base) = resources.game_bytes(path)? else {
      continue;
    };
    let Ok((_, old, old_encoding)) = decode_compiled_data(&source.bytes, path) else {
      continue;
    };
    let Ok((_, current, current_encoding)) = decode_compiled_data(&base, path) else {
      continue;
    };
    if !eligible(&old, &current) {
      continue;
    }
    let result = (|| {
      if inputs.needs_dependency_proof(&source.mod_id) {
        return Err(
          "Enabled animation overrides require dependency proof before restoring bindings"
            .to_owned(),
        );
      }
      let refs = current
        .get(FIELDS[1])
        .and_then(Kv3Value::as_array)
        .ok_or("Invalid current skeleton bindings")?;
      let [reference] = refs else {
        return Err("Multiple current animation skeletons require additional proof".into());
      };
      let name = reference.as_str().ok_or("Invalid skeleton path")?;
      let (_, bytes) = resources
        .resolve(name)
        .map_err(|error| error.to_string())?
        .filter(|(provider, _)| provider.mod_id.is_none())
        .ok_or("Current animation skeleton is unavailable or overridden")?;
      let (_, skeleton, _) =
        decode_compiled_data(&bytes, name).map_err(|error| error.to_string())?;
      for graph in animation_model_evidence::graphs(&current)
        .ok_or("Invalid current animation graphs")?
        .values()
      {
        if resources
          .provider(graph)
          .is_none_or(|provider| provider.mod_id.is_some())
        {
          return Err(format!(
            "Current animation graph is unavailable or overridden: {graph}"
          ));
        }
      }
      let preserving =
        sampled_controls::prepare(&old, &old_encoding, &current, &current_encoding, &skeleton)
          .and_then(|(prepared, encoding)| {
            prove_sampled_rig(&prepared, &current, &skeleton).ok()?;
            restore_bindings_from(&source.bytes, &base, prepared, encoding, |name| {
              resources.provider(name).is_some()
            })
          });
      if let Some(bytes) = preserving {
        return Ok((bytes, RepairKind::AnimationInterface));
      }
      let rebase = rig_rebase::prepare(&source.bytes, &base, &skeleton);
      if let Ok(ref rebased) = rebase {
        let (_, prepared, encoding) =
          decode_compiled_data(rebased, path).map_err(|error| error.to_string())?;
        if let Some(bytes) = restore_bindings_from(rebased, &base, prepared, encoding, |name| {
          resources.provider(name).is_some()
        }) {
          return Ok((bytes, RepairKind::AnimationRigRebase));
        }
      }
      let detail = match sampled_controls::missing_samples(&old, &skeleton) {
        Some(missing) if !missing.is_empty() => format!(
          "{} required sampled bones are absent; coordinated deformation-rig repair could not be proven: {}",
          missing.len(),
          missing.join(", ")
        ),
        _ => prove_sampled_rig(&old, &current, &skeleton)
          .err()
          .unwrap_or_else(|| "Animation binding rebuild failed preservation checks".into()),
      };
      Err(format!(
        "{detail}. {}",
        rebase
          .err()
          .unwrap_or_else(|| "Animation binding metadata could not be restored".into())
      ))
    })();
    match result {
      Ok((bytes, kind)) => {
        output.insert(path.clone(), bytes);
        repairs.push(AssetRepair {
          mod_id: source.mod_id.clone(),
          source_vpk: source.source_vpk.clone(),
          file_path: path.clone(),
          kind,
        });
      }
      Err(detail) => warnings.push(AssetWarning {
        mod_id: source.mod_id.clone(),
        source_vpk: source.source_vpk.clone(),
        file_path: path.clone(),
        kind: WarningKind::AnimationMapping,
        detail,
      }),
    }
  }
  Ok(output)
}

fn eligible(source: &Kv3Value, current: &Kv3Value) -> bool {
  FIELDS.iter().all(|field| {
    source
      .get(field)
      .is_none_or(|value| value.as_array().is_some_and(|values| values.is_empty()))
      && current
        .get(field)
        .and_then(Kv3Value::as_array)
        .is_some_and(|values| !values.is_empty())
  })
}

pub(super) fn prove_current_bindings(
  resources: &ResourceSnapshot,
  source: &Kv3Value,
  current: &Kv3Value,
  inputs: &AnimationInputs,
  mod_id: &str,
) -> Result<(), String> {
  if inputs.needs_dependency_proof(mod_id)
    || animation_model_evidence::graphs(source)
      .zip(animation_model_evidence::graphs(current))
      .is_none_or(|(old, new)| old != new)
    || source.get(FIELDS[1]) != current.get(FIELDS[1])
    || super::model_camera::legacy_animation_graph(source).is_some()
    || ["m_refAnimGroups", "m_refSequenceGroups"]
      .iter()
      .any(|field| {
        source
          .get(field)
          .is_some_and(|value| value.as_array().is_none_or(|values| !values.is_empty()))
      })
  {
    return Err("Existing animation bindings do not match the current game".into());
  }
  let refs = current
    .get(FIELDS[1])
    .and_then(Kv3Value::as_array)
    .ok_or("Current sampling skeleton is unavailable")?;
  let [reference] = refs else {
    return Err("Multiple sampling skeletons require additional proof".into());
  };
  let name = reference.as_str().ok_or("Invalid skeleton path")?;
  let (_, bytes) = resources
    .resolve(name)
    .map_err(|error| error.to_string())?
    .filter(|(provider, _)| provider.mod_id.is_none())
    .ok_or("Current sampling skeleton is unavailable or overridden")?;
  for graph in animation_model_evidence::graphs(current)
    .ok_or("Invalid current animation graphs")?
    .values()
  {
    if resources
      .provider(graph)
      .is_none_or(|provider| provider.mod_id.is_some())
    {
      return Err(format!(
        "Current animation graph is unavailable or overridden: {graph}"
      ));
    }
  }
  let (_, skeleton, _) = decode_compiled_data(&bytes, name).map_err(|error| error.to_string())?;
  prove_sampled_rig(source, current, &skeleton)
}

fn sampled_contract(
  old: &Kv3Value,
  current: &Kv3Value,
  skeleton: &Kv3Value,
) -> Result<Vec<(String, Kv3Value, Kv3Value)>, String> {
  let old = ModelRig::parse(old).ok_or("Invalid source model rig")?;
  let current = ModelRig::parse(current).ok_or("Invalid current model rig")?;
  if !super::asset_compatibility::valid_skeleton(
    skeleton,
    "m_boneIDs",
    "m_parentIndices",
    &[
      ("m_parentSpaceReferencePose", 8),
      ("m_modelSpaceReferencePose", 8),
    ],
  ) {
    return Err("Invalid current animation rig".into());
  }
  let samples = skeleton
    .get("m_boneIDs")
    .and_then(Kv3Value::as_array)
    .ok_or("Missing sampled bones")?;
  if samples.is_empty() {
    return Err("Empty sampled rig".into());
  }
  // The current animation compiler can use different case for a model's bone.
  // Require an unambiguous match, preserving the model's actual name in DATA.
  let names = |rig: &ModelRig| -> Option<BTreeMap<String, String>> {
    let names: Vec<_> = rig.names().map(str::to_owned).collect();
    let mapped: BTreeMap<_, _> = names
      .iter()
      .map(|name| (name.to_ascii_lowercase(), name.clone()))
      .collect();
    (mapped.len() == names.len()).then_some(mapped)
  };
  let old_names = names(&old).ok_or("Ambiguous source bone names")?;
  let current_names = names(&current).ok_or("Ambiguous current bone names")?;
  let unused =
    unmapped_reference_controls(skeleton, &old_names, &current_names).unwrap_or_default();
  let mut checked = BTreeSet::new();
  let mut poses = Vec::new();
  for sample in samples {
    let name = sample
      .as_str()
      .ok_or("Invalid sampled bone name")?
      .to_ascii_lowercase();
    let Some(current_name) = current_names.get(&name) else {
      // The current NM rig may also serve model variants with unused branches.
      if unused.contains(&name) {
        continue;
      }
      return Err(format!("Current model lacks sampled bone: {name}"));
    };
    let source_name = old_names
      .get(&name)
      .ok_or_else(|| format!("Missing sampled bone: {name}"))?;
    // Verify the complete ancestor chain, including ancestors not sampled by NM.
    let mut source_name = source_name.as_str();
    let mut current_name = current_name.as_str();
    while !source_name.is_empty() && checked.insert(source_name.to_owned()) {
      if !source_name.eq_ignore_ascii_case(current_name) {
        return Err(format!("Changed sampled bone hierarchy: {source_name}"));
      }
      let a = old.pose(source_name).ok_or("Invalid source pose")?;
      let b = current.pose(current_name).ok_or("Invalid current pose")?;
      poses.push((source_name.to_owned(), a, b));
      source_name = old
        .parent(source_name)
        .ok_or("Invalid source bone parent")?;
      current_name = current
        .parent(current_name)
        .ok_or("Invalid current bone parent")?;
      if source_name.is_empty() != current_name.is_empty() {
        return Err("Changed sampled bone root".into());
      }
    }
  }
  Ok(poses)
}

fn prove_sampled_rig(
  old: &Kv3Value,
  current: &Kv3Value,
  skeleton: &Kv3Value,
) -> Result<(), String> {
  let poses = sampled_contract(old, current, skeleton)?;
  if poses
    .iter()
    .any(|(_, a, b)| equivalent_pose(a, b) != Some(true))
    && !scaled_rig::compatible(&poses)
  {
    let (name, _, _) = poses
      .iter()
      .find(|(_, a, b)| equivalent_pose(a, b) != Some(true))
      .expect("different pose exists");
    return Err(format!("Changed sampled bone reference pose: {name}"));
  }
  Ok(())
}

fn unmapped_reference_controls(
  skeleton: &Kv3Value,
  source_names: &BTreeMap<String, String>,
  current_names: &BTreeMap<String, String>,
) -> Option<BTreeSet<String>> {
  if super::animation_poses::self_consistent(skeleton) != Some(true) {
    return None;
  }
  let names = skeleton
    .get("m_boneIDs")?
    .as_array()?
    .iter()
    .map(|name| Some(name.as_str()?.to_ascii_lowercase()))
    .collect::<Option<Vec<_>>>()?;
  if names.iter().collect::<BTreeSet<_>>().len() != names.len() {
    return None;
  }
  let parents = skeleton.get("m_parentIndices")?.as_array()?;
  let mut required = BTreeSet::new();
  // A branch is unused only when neither render rig maps any of its descendants.
  // Retain ancestors of every mapped sample, including custom authored targets.
  for (index, name) in names.iter().enumerate() {
    if !source_names.contains_key(name) && !current_names.contains_key(name) {
      continue;
    }
    let mut index = index;
    while required.insert(index) {
      let parent = parents.get(index)?.as_int()?;
      if parent < 0 {
        break;
      }
      index = usize::try_from(parent).ok()?;
    }
  }
  let mut unused = BTreeSet::new();
  for (index, name) in names.iter().enumerate() {
    if required.contains(&index) {
      continue;
    }
    let mut parent = parents.get(index)?.as_int()?;
    while parent >= 0 {
      let index = usize::try_from(parent).ok()?;
      if current_names.contains_key(names.get(index)?) {
        unused.insert(name.clone());
        break;
      }
      parent = parents.get(index)?.as_int()?;
    }
  }
  Some(unused)
}

#[cfg(test)]
fn restore_bindings(source: &[u8], base: &[u8]) -> Option<Vec<u8>> {
  let (_, value, encoding) = decode_compiled_data(source, "legacy animation model").ok()?;
  restore_bindings_from(source, base, value, encoding, |_| false)
}

fn restore_bindings_from(
  source: &[u8],
  base: &[u8],
  mut value: Kv3Value,
  mut encoding: kv3::Encoding,
  available: impl Fn(&str) -> bool,
) -> Option<Vec<u8>> {
  let (format, _, _) = decode_compiled_data(source, "legacy animation model").ok()?;
  let (_, current, current_encoding) =
    decode_compiled_data(base, "current animation model").ok()?;
  if !eligible(&value, &current) {
    return None;
  }
  if let Some(old_text) = value
    .get("m_modelInfo")
    .and_then(|info| info.get("m_keyValueText"))
    .and_then(Kv3Value::as_str)
  {
    let current_text = current
      .get("m_modelInfo")?
      .get("m_keyValueText")?
      .as_str()?;
    let text = metadata::restore(
      old_text,
      current_text,
      &animation_model_evidence::graphs(&current)?,
      available,
    )?;
    *value.get_mut("m_modelInfo")?.get_mut("m_keyValueText")? = Kv3Value::String(text);
  }
  for key in FIELDS {
    let replacement = current.get(key)?.clone();
    let replacement_encoding = current_encoding.get(key)?.clone();
    let Kv3Value::Object(fields) = &mut value else {
      return None;
    };
    super::object_set_case_insensitive(fields, key, replacement);
    let kv3::EncodingChildren::Object(fields) = &mut encoding.children else {
      return None;
    };
    if let Some((_, existing)) = fields.iter_mut().find(|(name, _)| name == key) {
      *existing = replacement_encoding;
    } else {
      fields.push((key.into(), replacement_encoding));
    }
  }
  let graphs = animation_model_evidence::graphs(&current)?;
  let names = graphs.values().map(String::as_str).chain(
    current
      .get(FIELDS[1])?
      .as_array()?
      .iter()
      .filter_map(Kv3Value::as_str),
  );
  let additions = names
    .map(|name| Some((resource_id(name).ok()?, name.to_owned())))
    .collect::<Option<Vec<_>>>()?;
  let data = kv3::encode_preserving(&value, &encoding, &format).ok()?;
  let rebuilt = Resource::parse(source)
    .ok()?
    .rebuild_with_data_preserving(&data)
    .ok()?;
  let rebuilt = material_repair::add_references(&rebuilt, &additions).ok()?;
  let (actual_format, actual, actual_encoding) =
    decode_compiled_data(&rebuilt, "restored animation bindings").ok()?;
  (actual_format == format
    && runtime_values_equal(&value, &actual)
    && kv3::encoding_preserved(&value, &encoding, &actual_encoding))
  .then_some(rebuilt)
}

#[cfg(test)]
pub(super) mod tests;

#[cfg(test)]
pub(super) fn deformation_preserved(source: &[u8], rebuilt: &[u8]) -> bool {
  rig_rebase::preservation::verify(source, rebuilt).is_some()
}

#[cfg(test)]
pub(super) fn verify_animated_fixture(
  source: &[u8],
  current: &[u8],
  rebuilt: &[u8],
  animation: &source2_model::nm_anim::NmAnimation,
) {
  rig_rebase::animated_fixture::verify(source, current, rebuilt, animation);
}
