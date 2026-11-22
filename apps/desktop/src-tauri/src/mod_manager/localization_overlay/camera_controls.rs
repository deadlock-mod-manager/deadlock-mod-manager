use super::{Kv3Encoding, Kv3Value, animation_skeleton, asset_compatibility, kv3};
use std::collections::{BTreeMap, BTreeSet};

#[cfg(test)]
mod tests;

pub(super) struct Encoded<'a> {
  pub value: &'a mut Kv3Value,
  pub encoding: &'a mut Kv3Encoding,
}

pub(super) struct Reference<'a> {
  pub value: &'a Kv3Value,
  pub encoding: &'a Kv3Encoding,
}

const BONE_FIELDS: [&str; 7] = [
  "m_boneName",
  "m_nParent",
  "m_bonePosParent",
  "m_boneRotParent",
  "m_boneScaleParent",
  "m_boneSphere",
  "m_nFlag",
];

fn names(rig: &Kv3Value) -> Option<BTreeMap<String, usize>> {
  if !asset_compatibility::valid_skeleton(
    rig,
    "m_boneName",
    "m_nParent",
    &[
      ("m_bonePosParent", 3),
      ("m_boneRotParent", 4),
      ("m_boneScaleParent", 0),
    ],
  ) {
    return None;
  }
  let values = rig.get("m_boneName")?.as_array()?;
  let fields = rig.as_object()?;
  if fields.len() != BONE_FIELDS.len()
    || BONE_FIELDS.iter().any(|field| {
      rig
        .get(field)
        .and_then(Kv3Value::as_array)
        .is_none_or(|array| array.len() != values.len())
    })
  {
    return None;
  }
  values
    .iter()
    .enumerate()
    .map(|(index, name)| Some((name.as_str()?.to_owned(), index)))
    .collect()
}

fn root_leaf(rig: &Kv3Value, index: usize) -> Option<bool> {
  let parents = rig.get("m_nParent")?.as_array()?;
  Some(
    parents.get(index)?.as_int()? == -1
      && rig.get("m_boneSphere")?.as_array()?.get(index)?.as_f64()? == 0.0
      && !parents
        .iter()
        .any(|parent| parent.as_int() == i64::try_from(index).ok()),
  )
}

fn pose(rig: &Kv3Value, index: usize) -> Option<Kv3Value> {
  let mut pose = rig
    .get("m_bonePosParent")?
    .as_array()?
    .get(index)?
    .as_array()?
    .to_vec();
  pose.push(
    rig
      .get("m_boneScaleParent")?
      .as_array()?
      .get(index)?
      .clone(),
  );
  pose.extend_from_slice(
    rig
      .get("m_boneRotParent")?
      .as_array()?
      .get(index)?
      .as_array()?,
  );
  Some(Kv3Value::Array(pose))
}

fn append(
  value: &mut Kv3Value,
  encoding: &mut Kv3Encoding,
  item: &Kv3Value,
  item_encoding: &Kv3Encoding,
) -> Option<()> {
  let Kv3Value::Array(values) = value else {
    return None;
  };
  let kv3::EncodingChildren::Array(encodings) = &mut encoding.children else {
    return None;
  };
  if values.len() != encodings.len() {
    return None;
  }
  values.push(item.clone());
  encodings.push(item_encoding.clone());
  Some(())
}

/// Extend a single embedded mesh with isolated camera controls. Existing indices,
/// bind poses, skin buffers and remapping entries remain unchanged.
pub(super) fn extend(
  model: Encoded<'_>,
  mesh: Encoded<'_>,
  current: Reference<'_>,
  base_mesh: Reference<'_>,
  points: &[&str],
) -> Option<()> {
  if super::animation_model_evidence::graphs(model.value)?
    != super::animation_model_evidence::graphs(current.value)?
    || model.value.get("m_vecNmSkeletonRefs")? != current.value.get("m_vecNmSkeletonRefs")?
    || model
      .value
      .get("m_vecNmSkeletonRefs")?
      .as_array()?
      .is_empty()
  {
    return None;
  }
  for field in [
    "m_refMeshes",
    "m_refAnimGroups",
    "m_refAnimIncludeModels",
    "m_refSequenceGroups",
    "m_ExtParts",
    "m_boneFlexDrivers",
  ] {
    if !model.value.get(field)?.as_array()?.is_empty() {
      return None;
    }
  }
  for value in [&*mesh.value, base_mesh.value] {
    if !value.get("m_constraints")?.as_array()?.is_empty() {
      return None;
    }
  }
  let old_rig = model.value.get("m_modelSkeleton")?;
  let old_names = names(old_rig)?;
  let new_rig = current.value.get("m_modelSkeleton")?;
  let new_names = names(new_rig)?;
  let bones = mesh.value.get("m_skeleton")?.get("m_bones")?.as_array()?;
  let table = model.value.get("m_remappingTable")?.as_array()?;
  let starts = model.value.get("m_remappingTableStarts")?.as_array()?;
  if starts.len() != 1 || starts[0].as_int()? != 0 || table.len() != bones.len() {
    return None;
  }
  let mut seen = BTreeSet::new();
  for (bone, index) in bones.iter().zip(table) {
    let name = bone.get("m_boneName")?.as_str()?;
    if !seen.insert(name)
      || old_names.get(name).copied()? != usize::try_from(index.as_int()?).ok()?
    {
      return None;
    }
  }
  let base_bones = base_mesh
    .value
    .get("m_skeleton")?
    .get("m_bones")?
    .as_array()?;
  let mut required = BTreeSet::new();
  for point in points {
    let point = base_mesh
      .value
      .get("m_attachments")?
      .as_array()?
      .iter()
      .find(|value| value.get("key").and_then(Kv3Value::as_str) == Some(*point))?
      .get("value")?;
    let count = usize::try_from(point.get("m_nInfluences")?.as_int()?).ok()?;
    if count == 0 {
      return None;
    }
    for index in 0..count {
      if point
        .get("m_bInfluenceRootTransform")?
        .as_array()?
        .get(index)?
        .as_bool()?
      {
        continue;
      }
      required.insert(
        point
          .get("m_influenceNames")?
          .as_array()?
          .get(index)?
          .as_str()?
          .to_owned(),
      );
    }
  }
  let mut controls = Vec::new();
  for name in required {
    let index = *new_names.get(&name)?;
    if !root_leaf(new_rig, index)? {
      return None;
    }
    let (mesh_index, bone) = base_bones
      .iter()
      .enumerate()
      .find(|(_, bone)| bone.get("m_boneName").and_then(Kv3Value::as_str) == Some(&name))?;
    if !bone.get("m_parentName")?.as_str()?.is_empty()
      || bone.get("m_flSphereRadius")?.as_f64()? != 0.0
      || bone
        .get("m_bbox")?
        .get("m_vecSize")?
        .as_array()?
        .iter()
        .any(|size| size.as_f64() != Some(0.0))
    {
      return None;
    }
    if let Some(old_index) = old_names.get(&name)
      && (!root_leaf(old_rig, *old_index)?
        || animation_skeleton::equivalent_pose(&pose(old_rig, *old_index)?, &pose(new_rig, index)?)
          != Some(true))
    {
      return None;
    }
    if !seen.contains(name.as_str()) {
      controls.push((name, index, mesh_index));
    }
  }
  if controls.is_empty() {
    return None;
  }
  let mut next_index = old_names.len();
  for (name, index, mesh_index) in controls {
    let model_index = if let Some(index) = old_names.get(&name) {
      *index
    } else {
      for field in BONE_FIELDS {
        append(
          model.value.get_mut("m_modelSkeleton")?.get_mut(field)?,
          model.encoding.get_mut("m_modelSkeleton")?.get_mut(field)?,
          new_rig.get(field)?.as_array()?.get(index)?,
          current
            .encoding
            .get("m_modelSkeleton")?
            .get(field)?
            .as_array()?
            .get(index)?,
        )?;
      }
      let index = next_index;
      next_index += 1;
      index
    };
    append(
      mesh.value.get_mut("m_skeleton")?.get_mut("m_bones")?,
      mesh.encoding.get_mut("m_skeleton")?.get_mut("m_bones")?,
      &base_bones[mesh_index],
      base_mesh
        .encoding
        .get("m_skeleton")?
        .get("m_bones")?
        .as_array()?
        .get(mesh_index)?,
    )?;
    let old_index = model.value.get("m_remappingTable")?.as_array()?.first()?;
    let index = match old_index {
      Kv3Value::Int(_) => Kv3Value::Int(i64::try_from(model_index).ok()?),
      Kv3Value::UInt(_) => Kv3Value::UInt(u64::try_from(model_index).ok()?),
      _ => return None,
    };
    let index_encoding = model
      .encoding
      .get("m_remappingTable")?
      .as_array()?
      .first()?
      .clone();
    append(
      model.value.get_mut("m_remappingTable")?,
      model.encoding.get_mut("m_remappingTable")?,
      &index,
      &index_encoding,
    )?;
  }
  Some(())
}
