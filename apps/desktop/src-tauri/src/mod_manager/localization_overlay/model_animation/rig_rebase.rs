//! Reconcile a current animation hierarchy without changing authored skin binding.
//! This fallback is atomic: every mesh, attachment and hitbox must be proven.
use super::*;
use transforms::{Transform, numbers, replace_numbers, source_float, worlds};
#[cfg(test)]
pub(super) mod animated_fixture;
mod bind_frames;
pub(super) mod preservation;
mod transforms;

const FIELDS: &[&str] = &[
  "m_boneName",
  "m_nParent",
  "m_bonePosParent",
  "m_boneRotParent",
  "m_boneScaleParent",
  "m_boneSphere",
  "m_nFlag",
];

fn indices(model: &Kv3Value) -> Option<BTreeMap<String, usize>> {
  let names = model
    .get("m_modelSkeleton")?
    .get("m_boneName")?
    .as_array()?;
  let indices: BTreeMap<_, _> = names
    .iter()
    .enumerate()
    .map(|(i, n)| Some((n.as_str()?.to_ascii_lowercase(), i)))
    .collect::<Option<_>>()?;
  (indices.len() == names.len()).then_some(indices)
}

fn array_item_mut<'a>(
  value: &'a mut Kv3Value,
  field: &str,
  index: usize,
) -> Option<&'a mut Kv3Value> {
  let Kv3Value::Array(values) = value.get_mut(field)? else {
    return None;
  };
  values.get_mut(index)
}

pub(super) fn prepare(source: &[u8], base: &[u8], skeleton: &Kv3Value) -> Result<Vec<u8>, String> {
  let mut stage = "resource and external dependency validation".to_owned();
  try_prepare(source, base, skeleton, &mut stage)
    .ok_or_else(|| format!("Coordinated deformation-rig repair declined during {stage}"))
}

fn try_prepare(
  source: &[u8],
  base: &[u8],
  skeleton: &Kv3Value,
  stage: &mut String,
) -> Option<Vec<u8>> {
  let (format, old, mut encoding) =
    decode_compiled_data(source, "authored deformation rig").ok()?;
  let (_, current, _) = decode_compiled_data(base, "current deformation rig").ok()?;
  // External meshes/physics and bone-indexed procedural drivers require their own adapter.
  for key in ["m_refMeshes", "m_refPhysicsData", "m_refPhysicsHitboxData"] {
    if old
      .get(key)?
      .as_array()?
      .iter()
      .any(|v| v.as_str() != Some(""))
    {
      return None;
    }
  }
  for key in ["m_boneFlexDrivers", "m_ExtParts"] {
    if !old.get(key)?.as_array()?.is_empty() {
      return None;
    }
  }
  *stage = "source and current bind-frame validation".into();
  let old_worlds = worlds(&old)?;
  worlds(&current)?;
  let old_indices = indices(&old)?;
  let current_indices = indices(&current)?;
  let mut merged_indices = old_indices.clone();
  let original_count = old_indices.len();
  let rig = old.get("m_modelSkeleton")?;
  let base_rig = current.get("m_modelSkeleton")?;
  if rig.as_object()?.len() != FIELDS.len()
    || base_rig.as_object()?.len() != FIELDS.len()
    || FIELDS.iter().any(|field| {
      rig
        .get(field)
        .and_then(Kv3Value::as_array)
        .is_none_or(|v| v.len() != original_count)
    })
  {
    return None;
  }
  *stage = "bone-index preservation and canonical hierarchy mapping".into();
  // Include only canonical bones shared with the mod, animation samples and camera dependencies.
  // Copying unrelated current cloth branches would invent geometry dependencies.
  let mut required: BTreeSet<String> = current_indices
    .keys()
    .filter(|name| old_indices.contains_key(*name))
    .cloned()
    .collect();
  for name in skeleton.get("m_boneIDs")?.as_array()? {
    let name = name.as_str()?.to_ascii_lowercase();
    if current_indices.contains_key(&name) {
      required.insert(name);
    }
  }
  let base_resource = Resource::parse(base).ok()?;
  let mesh = kv3::decode(base_resource.find_block(*b"MDAT")?).ok()?;
  required.extend(super::super::model_camera::required_bones(&current, &mesh)?);
  let pending: Vec<_> = required.iter().cloned().collect();
  for name in pending {
    let mut index = *current_indices.get(&name)?;
    loop {
      required.insert(
        base_rig
          .get("m_boneName")?
          .as_array()?
          .get(index)?
          .as_str()?
          .to_ascii_lowercase(),
      );
      let parent = base_rig
        .get("m_nParent")?
        .as_array()?
        .get(index)?
        .as_int()?;
      if parent == -1 {
        break;
      }
      index = usize::try_from(parent).ok()?;
    }
  }
  let mut value = old.clone();
  // Append in current declaration order; existing mesh, animation and remap indices stay valid.
  for (index, name) in base_rig.get("m_boneName")?.as_array()?.iter().enumerate() {
    let key = name.as_str()?.to_ascii_lowercase();
    if !required.contains(&key) || merged_indices.contains_key(&key) {
      continue;
    }
    let target = merged_indices.len();
    merged_indices.insert(key, target);
    for field in FIELDS {
      let mut item = base_rig.get(field)?.as_array()?.get(index)?.clone();
      if *field == "m_nFlag" {
        item = match rig.get(field)?.as_array()?.first()? {
          Kv3Value::Int(_) => Kv3Value::Int(item.as_int()?),
          Kv3Value::UInt(_) => Kv3Value::UInt(item.as_uint()?),
          _ => return None,
        };
      }
      let Kv3Value::Array(values) = value.get_mut("m_modelSkeleton")?.get_mut(field)? else {
        return None;
      };
      values.push(item);
      let kv3::EncodingChildren::Array(encodings) = &mut encoding
        .get_mut("m_modelSkeleton")?
        .get_mut(field)?
        .children
      else {
        return None;
      };
      // Keep the authored typed array's item schema; the current compiler may
      // use different numeric widths for the same runtime field.
      encodings.push(encodings.first()?.clone());
    }
  }
  let target_rig = value.get_mut("m_modelSkeleton")?;
  for (name, &index) in &current_indices {
    if !required.contains(name) {
      continue;
    }
    let target = *merged_indices.get(name)?;
    for field in ["m_bonePosParent", "m_boneRotParent", "m_boneScaleParent"] {
      *array_item_mut(target_rig, field, target)? =
        base_rig.get(field)?.as_array()?.get(index)?.clone();
    }
    let parent = base_rig
      .get("m_nParent")?
      .as_array()?
      .get(index)?
      .as_int()?;
    let parent = if parent < 0 {
      -1
    } else {
      let name = base_rig
        .get("m_boneName")?
        .as_array()?
        .get(usize::try_from(parent).ok()?)?
        .as_str()?
        .to_ascii_lowercase();
      i64::try_from(*merged_indices.get(&name)?).ok()?
    };
    *array_item_mut(target_rig, "m_nParent", target)? = Kv3Value::Int(parent);
  }
  // NM maps sampled world poses by name. Bind frames describe the authored mesh,
  // not the animation skeleton: replacing them changes every animated skin matrix.
  *stage = "sampled hierarchy validation".into();
  sampled_contract(&value, &current, skeleton)
    .map_err(|error| *stage = format!("sampled hierarchy validation: {error}"))
    .ok()?;
  *stage = "authored bind-frame preservation".into();
  bind_frames::preserve(&mut value, &old_worlds)?;
  *stage = "preserved sampled hierarchy validation".into();
  sampled_contract(&value, &current, skeleton)
    .map_err(|error| *stage = format!("preserved sampled hierarchy validation: {error}"))
    .ok()?;
  *stage = "model DATA encoding preservation".into();
  kv3::normalize_numeric_array_encoding(&value, &mut encoding)
    .map_err(|error| {
      *stage = format!("model numeric array encoding: {error}");
    })
    .ok()?;
  let data = kv3::encode_preserving(&value, &encoding, &format)
    .map_err(|error| {
      *stage = format!("model DATA encoding: {error}");
    })
    .ok()?;
  let resource = Resource::parse(source).ok()?;
  let rebuilt = resource
    .rebuild_with_data_preserving(&data)
    .map_err(|error| {
      *stage = format!("model container preservation: {error}");
    })
    .ok()?;
  let mesh_indices: Vec<_> = resource
    .blocks()
    .iter()
    .enumerate()
    .filter_map(|(i, b)| (b.kind == *b"MDAT").then_some(i))
    .collect();
  if mesh_indices.is_empty() {
    return None;
  }
  // Geometry, inverse binds, attachments, hitboxes and embedded physics remain
  // byte-identical. They were authored against the retained model-space frames.
  *stage = "authored mesh skin binding and procedural dependency validation".into();
  for index in mesh_indices {
    let mesh = kv3::decode(resource.get_block_by_index(index)?).ok()?;
    bind_frames::validate_mesh(&mesh, &old_indices, &old_worlds)?;
  }
  *stage = "final model roundtrip preservation".into();
  let (_, actual, actual_encoding) =
    decode_compiled_data(&rebuilt, "rebased deformation rig").ok()?;
  if !runtime_values_equal(&value, &actual)
    || !kv3::encoding_preserved(&value, &encoding, &actual_encoding)
  {
    return None;
  }
  *stage = "serialized mesh, attachment and hitbox bind preservation".into();
  preservation::verify(source, &rebuilt)?;
  Some(rebuilt)
}
