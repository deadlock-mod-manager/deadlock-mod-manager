use super::*;

/// Metadata can use authored attachments when every embedded mesh already
/// supplies valid transforms for the entire current camera interface.
pub(super) fn satisfied(
  resource: &Resource<'_>,
  model: &Kv3Value,
  base: &[u8],
  current_text: &str,
) -> Option<bool> {
  if model
    .get("m_refMeshes")
    .is_some_and(|value| value.as_array().is_none_or(|values| !values.is_empty()))
  {
    return Some(false);
  }
  let rig = super::super::animation_model_evidence::ModelRig::parse(model)?;
  let bones: BTreeSet<_> = rig.names().collect();
  let current = Resource::parse(base).ok()?;
  let mesh = kv3::decode(current.find_block(*b"MDAT")?).ok()?;
  let names = camera_point_names(current_text, &mesh)?;
  let mut count = 0;
  for (index, block) in resource.blocks().iter().enumerate() {
    if block.kind != *b"MDAT" {
      continue;
    }
    count += 1;
    let mesh = kv3::decode(resource.get_block_by_index(index)?).ok()?;
    let points = mesh.get("m_attachments")?.as_array()?;
    for name in &names {
      let mut matching = points
        .iter()
        .filter(|point| point.get("key").and_then(Kv3Value::as_str) == Some(name));
      let point = matching.next()?.get("value")?;
      if matching.next().is_some() || !valid_point(point, name, &bones)? {
        return Some(false);
      }
    }
  }
  Some(count > 0)
}

fn valid_point(point: &Kv3Value, name: &str, bones: &BTreeSet<&str>) -> Option<bool> {
  if point.get("m_name")?.as_str()? != name {
    return Some(false);
  }
  let count = usize::try_from(point.get("m_nInfluences")?.as_int()?).ok()?;
  let names = point.get("m_influenceNames")?.as_array()?;
  let roots = point.get("m_bInfluenceRootTransform")?.as_array()?;
  let weights = point.get("m_influenceWeights")?.as_array()?;
  let offsets = point.get("m_vInfluenceOffsets")?.as_array()?;
  let rotations = point.get("m_vInfluenceRotations")?.as_array()?;
  if count == 0
    || [
      names.len(),
      roots.len(),
      weights.len(),
      offsets.len(),
      rotations.len(),
    ]
    .iter()
    .any(|length| count > *length)
  {
    return Some(false);
  }
  let mut total_weight = 0.0;
  for index in 0..count {
    let weight = weights[index].as_f64()?;
    if !weight.is_finite()
      || weight < 0.0
      || (!roots[index].as_bool()? && !bones.contains(names[index].as_str()?))
      || numbers::<3>(&offsets[index]).is_none()
    {
      return Some(false);
    }
    let rotation = numbers::<4>(&rotations[index])?;
    let norm = rotation
      .iter()
      .map(|value| value * value)
      .sum::<f64>()
      .sqrt();
    if (norm - 1.0).abs() > 0.001 {
      return Some(false);
    }
    total_weight += weight;
  }
  Some((total_weight - 1.0).abs() <= 0.001)
}

fn numbers<const N: usize>(value: &Kv3Value) -> Option<[f64; N]> {
  let values = value.as_array()?;
  if values.len() != N {
    return None;
  }
  let mut result = [0.0; N];
  for (output, value) in result.iter_mut().zip(values) {
    *output = value.as_f64().filter(|n| n.is_finite())?;
  }
  Some(result)
}
