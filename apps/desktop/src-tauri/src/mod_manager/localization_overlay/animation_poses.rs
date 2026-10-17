use super::{Kv3Encoding, Kv3Value, kv3};
use std::collections::BTreeMap;

const POSE_FIELDS: [&str; 2] = ["m_parentSpaceReferencePose", "m_modelSpaceReferencePose"];
const POSITION_EPSILON: f64 = 0.001;
const SCALE_EPSILON: f64 = 0.001;
const ROTATION_EPSILON_RADIANS: f64 = 0.0002;

struct PoseDelta {
  position: f64,
  scale: f64,
  rotation: f64,
}

fn numbers(pose: &Kv3Value) -> Option<[f64; 8]> {
  let values = pose
    .as_array()?
    .iter()
    .map(Kv3Value::as_f64)
    .collect::<Option<Vec<_>>>()?;
  let values: [f64; 8] = values.try_into().ok()?;
  values
    .iter()
    .all(|value| value.is_finite())
    .then_some(values)
}

fn length(values: &[f64]) -> f64 {
  values
    .iter()
    .fold(0.0, |length, value| length.hypot(*value))
}

fn delta(old: &[f64; 8], current: &[f64; 8]) -> Option<PoseDelta> {
  let a = length(&old[4..]);
  let b = length(&current[4..]);
  if (a - 1.0).abs() > 0.001 || (b - 1.0).abs() > 0.001 {
    return None;
  }
  let dot: f64 = old[4..].iter().zip(&current[4..]).map(|(a, b)| a * b).sum();
  let sign = if dot < 0.0 { -1.0 } else { 1.0 };
  let quaternion_distance = old[4..]
    .iter()
    .zip(&current[4..])
    .map(|(x, y)| x / a - sign * y / b)
    .collect::<Vec<_>>();
  Some(PoseDelta {
    position: length(
      &old[..3]
        .iter()
        .zip(&current[..3])
        .map(|(a, b)| a - b)
        .collect::<Vec<_>>(),
    ),
    scale: (old[3] - current[3]).abs(),
    rotation: 4.0 * (length(&quaternion_distance) / 2.0).min(1.0).asin(),
  })
}

/// Bound local changes and the displacement they can propagate along a parent transform.
/// Accepted poses are copied from the mod, rather than replaced with current game values.
pub(super) fn compatible(
  old: &Kv3Value,
  current: &Kv3Value,
  old_index: usize,
  current_index: usize,
) -> Option<bool> {
  let mut arrays = Vec::new();
  for field in POSE_FIELDS {
    let a = old.get(field)?.as_array()?;
    let b = current.get(field)?.as_array()?;
    if a.len() != old.get("m_boneIDs")?.as_array()?.len()
      || b.len() != current.get("m_boneIDs")?.as_array()?.len()
    {
      return Some(false);
    }
    arrays.push((a, b));
  }
  let old_local = numbers(arrays[0].0.get(old_index)?)?;
  let current_local = numbers(arrays[0].1.get(current_index)?)?;
  let local = delta(&old_local, &current_local)?;
  if local.position > POSITION_EPSILON
    || local.scale > SCALE_EPSILON
    || local.rotation > ROTATION_EPSILON_RADIANS
  {
    return Some(false);
  }
  let model = delta(
    &numbers(arrays[1].0.get(old_index)?)?,
    &numbers(arrays[1].1.get(current_index)?)?,
  )?;
  let old_parent = old
    .get("m_parentIndices")?
    .as_array()?
    .get(old_index)?
    .as_int()?;
  let current_parent = current
    .get("m_parentIndices")?
    .as_array()?
    .get(current_index)?
    .as_int()?;
  let mut position_bound = POSITION_EPSILON;
  if old_parent != -1 || current_parent != -1 {
    let a = numbers(arrays[1].0.get(usize::try_from(old_parent).ok()?)?)?;
    let b = numbers(arrays[1].1.get(usize::try_from(current_parent).ok()?)?)?;
    let parent = delta(&a, &b)?;
    let radius = length(&old_local[..3]).max(length(&current_local[..3]));
    let scale = a[3].abs().max(b[3].abs());
    position_bound +=
      parent.position + radius * (parent.rotation * scale + parent.scale) + local.position * scale;
  }
  Some(
    model.position <= position_bound
      && model.scale <= SCALE_EPSILON
      && model.rotation <= ROTATION_EPSILON_RADIANS,
  )
}

/// Validate each sampled world pose against its own parent and local transform.
/// This is required before using model bind poses as evidence for larger changes.
pub(super) fn self_consistent(rig: &Kv3Value) -> Option<bool> {
  let local = rig.get(POSE_FIELDS[0])?.as_array()?;
  let world = rig.get(POSE_FIELDS[1])?.as_array()?;
  let parents = rig.get("m_parentIndices")?.as_array()?;
  if local.len() != parents.len() || world.len() != parents.len() {
    return Some(false);
  }
  for (index, parent) in parents.iter().enumerate() {
    let local = numbers(local.get(index)?)?;
    if local[3] <= 0.0 {
      return Some(false);
    }
    let parent = parent.as_int()?;
    let expected = if parent == -1 {
      local
    } else {
      let parent = numbers(world.get(usize::try_from(parent).ok()?)?)?;
      let [x, y, z, w] = <[f64; 4]>::try_from(&parent[4..]).ok()?;
      let cross = [
        y * local[2] - z * local[1],
        z * local[0] - x * local[2],
        x * local[1] - y * local[0],
      ];
      let cross2 = [
        y * cross[2] - z * cross[1],
        z * cross[0] - x * cross[2],
        x * cross[1] - y * cross[0],
      ];
      let [a, b, c, d] = <[f64; 4]>::try_from(&local[4..]).ok()?;
      [
        parent[0] + parent[3] * (local[0] + 2.0 * (w * cross[0] + cross2[0])),
        parent[1] + parent[3] * (local[1] + 2.0 * (w * cross[1] + cross2[1])),
        parent[2] + parent[3] * (local[2] + 2.0 * (w * cross[2] + cross2[2])),
        parent[3] * local[3],
        w * a + x * d + y * c - z * b,
        w * b - x * c + y * d + z * a,
        w * c + x * b - y * a + z * d,
        w * d - x * a - y * b - z * c,
      ]
    };
    let difference = delta(&expected, &numbers(world.get(index)?)?)?;
    if difference.position > 0.003
      || difference.scale > SCALE_EPSILON
      || difference.rotation > ROTATION_EPSILON_RADIANS
    {
      return Some(false);
    }
  }
  Some(true)
}

pub(super) fn preserve(
  old: &Kv3Value,
  old_encoding: &Kv3Encoding,
  current: &mut Kv3Value,
  current_encoding: &mut Kv3Encoding,
) -> Option<()> {
  let indices = old
    .get("m_boneIDs")?
    .as_array()?
    .iter()
    .enumerate()
    .map(|(index, name)| Some((name.as_str()?, index)))
    .collect::<Option<BTreeMap<_, _>>>()?;
  let names = current.get("m_boneIDs")?.as_array()?.to_vec();
  for field in POSE_FIELDS {
    let old_poses = old.get(field)?.as_array()?;
    let old_encodings = old_encoding.get(field)?.as_array()?;
    let Kv3Value::Array(poses) = current.get_mut(field)? else {
      return None;
    };
    let kv3::EncodingChildren::Array(encodings) = &mut current_encoding.get_mut(field)?.children
    else {
      return None;
    };
    if old_poses.len() != indices.len()
      || old_encodings.len() != indices.len()
      || poses.len() != names.len()
      || encodings.len() != names.len()
    {
      return None;
    }
    for (index, name) in names.iter().enumerate() {
      if let Some(&old_index) = indices.get(name.as_str()?) {
        poses[index] = old_poses[old_index].clone();
        encodings[index] = old_encodings[old_index].clone();
      }
    }
  }
  Some(())
}
