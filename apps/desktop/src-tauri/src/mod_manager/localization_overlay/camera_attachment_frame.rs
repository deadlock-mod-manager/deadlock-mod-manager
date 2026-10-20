use super::asset_compatibility::{AssetRepair, AssetWarning, RepairKind, WarningKind};
use super::{
  CompiledDataSource, Kv3Value, Resource, decode_compiled_data, kv3, resources::ResourceSnapshot,
};
use crate::errors::Error;
use std::collections::{BTreeMap, BTreeSet};

const PIVOTS: [&str; 2] = ["standing_pivot", "crouching_pivot"];
const OLD_FRAME: [f64; 4] = [-0.5, -0.5, -0.5, 0.5];
const IDENTITY: [f64; 4] = [0.0, 0.0, 0.0, 1.0];
// Exported root binds can differ slightly without changing the attachment basis.
const ROOT_ANGLE_TOLERANCE: f64 = 0.001;
// The update turned root attachments by 120 degrees; authored tweaks stay well
// inside this distance from the frame they were made in.
const FRAME_TOLERANCE: f64 = std::f64::consts::FRAC_PI_6;

pub(super) fn prepare(
  resources: &ResourceSnapshot,
  sources: &BTreeMap<String, Vec<CompiledDataSource>>,
  models: &mut BTreeMap<String, Vec<u8>>,
  repairs: &mut Vec<AssetRepair>,
  warnings: &mut Vec<AssetWarning>,
) -> Result<(), Error> {
  for (path, sources) in sources {
    let [source] = sources.as_slice() else {
      continue;
    };
    let Some(base) = resources.game_bytes(path)? else {
      continue;
    };
    let input = models.get(path).map(Vec::as_slice).unwrap_or(&source.bytes);
    match repair(input, &base) {
      Ok(Some(bytes)) => {
        models.insert(path.clone(), bytes);
        repairs.push(AssetRepair {
          mod_id: source.mod_id.clone(),
          source_vpk: source.source_vpk.clone(),
          file_path: path.clone(),
          kind: RepairKind::CameraAttachmentFrame,
        });
      }
      Err(detail) => warnings.push(AssetWarning {
        mod_id: source.mod_id.clone(),
        source_vpk: source.source_vpk.clone(),
        file_path: path.clone(),
        kind: WarningKind::OutdatedCameraAttachments,
        detail: detail.into(),
      }),
      Ok(None) => {}
    }
  }
  Ok(())
}

/// The old root attachment basis maps (x,y,z) to (y,z,x). Apply its inverse
/// to the authored transforms, rather than replacing intentional camera offsets.
pub(super) fn repair(source: &[u8], base: &[u8]) -> Result<Option<Vec<u8>>, &'static str> {
  let Ok(resource) = Resource::parse(source) else {
    return Ok(None);
  };
  let Ok(current) = Resource::parse(base) else {
    return Ok(None);
  };
  let Some(current_mesh) = current
    .blocks()
    .iter()
    .enumerate()
    .filter(|(_, block)| block.kind == *b"MDAT")
    .filter_map(|(i, _)| current.get_block_by_index(i))
    .filter_map(|raw| kv3::decode(raw).ok())
    .find(|mesh| pivots(mesh, IDENTITY))
  else {
    return Ok(None);
  };
  let indices: Vec<_> = resource
    .blocks()
    .iter()
    .enumerate()
    .filter(|(_, block)| block.kind == *b"MDAT")
    .map(|(i, _)| i)
    .collect();
  let mut migrations = Vec::new();
  let mut camera_names = None;
  for index in indices {
    let Some(raw) = resource.get_block_by_index(index) else {
      return Ok(None);
    };
    let Ok(mesh) = kv3::decode(raw) else {
      return Ok(None);
    };
    let frames: Vec<_> = PIVOTS
      .iter()
      .filter_map(|name| pivot_frame(&mesh, name))
      .collect();
    let old = frames
      .iter()
      .filter(|frame| matches!(frame, Frame::Old))
      .count();
    if old > 0 && old == frames.len() {
      migrations.push((index, None));
    } else if old > 0 {
      return Err("Camera pivots use mixed or authored frames; migration skipped");
    } else if !frames.is_empty() && frames.iter().all(|frame| matches!(frame, Frame::Current)) {
      let names = camera_names.get_or_insert_with(|| authored_camera_names(source));
      let stale = stale_attachments(&mesh, &current_mesh, names);
      if !stale.is_empty() {
        migrations.push((index, Some(stale)));
      }
    }
  }
  if migrations.is_empty() {
    return Ok(None);
  }
  let (_, model, _) = decode_compiled_data(source, "old camera frame")
    .map_err(|_| "Old camera model could not be decoded")?;
  let (_, current_model, _) = decode_compiled_data(base, "current camera frame")
    .map_err(|_| "Current camera model could not be decoded")?;
  if compatible_root_axes(&model, &current_model) != Some(true) {
    return Err("root_motion hierarchy, rotation or scale differs; camera migration skipped");
  }
  let mut output = source.to_vec();
  for (index, only) in migrations {
    let resource = Resource::parse(&output).map_err(|_| "Invalid camera model container")?;
    let raw = resource
      .get_block_by_index(index)
      .ok_or("Missing camera mesh block")?;
    let (mut mesh, mut encoding) =
      kv3::decode_preserving(raw).map_err(|_| "Camera mesh block could not be decoded")?;
    migrate_mesh(&mut mesh, only.as_ref())?;
    kv3::normalize_numeric_array_encoding(&mesh, &mut encoding)
      .map_err(|_| "Camera transform encoding is unsupported")?;
    round_float_values(&mut mesh, &encoding);
    let format = kv3::Format::from_payload(raw).map_err(|_| "Invalid camera mesh format")?;
    let rebuilt = kv3::encode_preserving(&mesh, &encoding, &format)
      .map_err(|_| "Camera mesh could not preserve its encoding")?;
    let (decoded, decoded_encoding) =
      kv3::decode_preserving(&rebuilt).map_err(|_| "Rebuilt camera mesh could not be decoded")?;
    if !super::runtime_values_equal(&mesh, &decoded)
      || !kv3::encoding_preserved(&mesh, &encoding, &decoded_encoding)
    {
      return Err("Camera migration failed its preservation check");
    }
    output = resource
      .rebuild_with_block_preserving(index, &rebuilt)
      .map_err(|_| "Camera model could not be rebuilt")?;
  }
  Ok(Some(output))
}

enum Frame {
  Old,
  Current,
  Other,
}

/// `None` when the pivot is absent; the camera interface repair adds it later.
fn pivot_frame(mesh: &Kv3Value, name: &str) -> Option<Frame> {
  let present = mesh
    .get("m_attachments")
    .and_then(Kv3Value::as_array)?
    .iter()
    .any(|item| item.get("key").and_then(Kv3Value::as_str) == Some(name));
  if !present {
    return None;
  }
  let rotation = attachment(mesh, name).and_then(rotation);
  let near = |frame| {
    rotation
      .and_then(|q| angle(q, frame))
      .is_some_and(|angle| angle <= FRAME_TOLERANCE)
  };
  Some(if near(OLD_FRAME) {
    Frame::Old
  } else if near(IDENTITY) {
    Frame::Current
  } else {
    Frame::Other
  })
}

fn authored_camera_names(source: &[u8]) -> BTreeSet<String> {
  decode_compiled_data(source, "authored camera names")
    .ok()
    .and_then(|(_, model, _)| {
      super::model_camera::camera_data_names(
        model.get("m_modelInfo")?.get("m_keyValueText")?.as_str()?,
      )
    })
    .unwrap_or_default()
}

/// Root attachments still in the old frame after the pivots were updated, as
/// a partial migration leaves them. A same-name game attachment must match
/// only after conversion. Extra camera poses without one pitch around the
/// pivot's right axis, so that axis must line up only after conversion.
fn stale_attachments(
  mesh: &Kv3Value,
  current: &Kv3Value,
  camera_names: &BTreeSet<String>,
) -> BTreeSet<String> {
  let Some(pivot) = attachment(current, "standing_pivot").and_then(rotation) else {
    return BTreeSet::new();
  };
  let has_point = |mesh: &Kv3Value, name: &str| {
    mesh
      .get("m_attachments")
      .and_then(Kv3Value::as_array)
      .is_some_and(|points| {
        points
          .iter()
          .any(|item| item.get("key").and_then(Kv3Value::as_str) == Some(name))
      })
  };
  let dot = |a: [f64; 3], b: [f64; 3]| a.iter().zip(b).map(|(a, b)| a * b).sum::<f64>();
  mesh
    .get("m_attachments")
    .and_then(Kv3Value::as_array)
    .into_iter()
    .flatten()
    .filter_map(|item| item.get("key").and_then(Kv3Value::as_str))
    .filter(|name| !PIVOTS.contains(name))
    .filter(|name| {
      let Some(q) = attachment(mesh, name).and_then(rotation) else {
        return false;
      };
      let converted = convert(q);
      if has_point(current, name) {
        return attachment(current, name)
          .and_then(rotation)
          .is_some_and(|game| {
            angle(converted, game).is_some_and(|angle| angle <= FRAME_TOLERANCE)
              && angle(q, game).is_some_and(|angle| angle > 2.0 * FRAME_TOLERANCE)
          });
      }
      camera_pose(name)
        && camera_names.contains(*name)
        && dot(right(q), right(pivot)) < 0.5
        && dot(right(converted), right(pivot)) >= FRAME_TOLERANCE.cos()
        && angle(converted, pivot)
          .is_some_and(|angle| angle <= std::f64::consts::FRAC_PI_2 + FRAME_TOLERANCE)
    })
    .map(str::to_owned)
    .collect()
}

fn camera_pose(name: &str) -> bool {
  ["near_", "far_", "gunaim_"].iter().any(|family| {
    name
      .strip_prefix(family)
      .is_some_and(|index| index.len() == 2 && index.bytes().all(|byte| byte.is_ascii_digit()))
  })
}

fn convert([x, y, z, w]: [f64; 4]) -> [f64; 4] {
  [
    (x + w + z - y) * 0.5,
    (y + w + x - z) * 0.5,
    (z + w + y - x) * 0.5,
    (w - x - y - z) * 0.5,
  ]
}

fn right(q: [f64; 4]) -> [f64; 3] {
  let norm = q.iter().map(|v| v * v).sum::<f64>().sqrt();
  let [x, y, z, w] = q.map(|v| v / norm);
  [
    2.0 * (x * y - w * z),
    1.0 - 2.0 * (x * x + z * z),
    2.0 * (y * z + w * x),
  ]
}

fn angle(a: [f64; 4], b: [f64; 4]) -> Option<f64> {
  let norm = |q: [f64; 4]| q.iter().map(|v| v * v).sum::<f64>().sqrt();
  let (a_norm, b_norm) = (norm(a), norm(b));
  if !a_norm.is_finite()
    || !b_norm.is_finite()
    || (a_norm - 1.0).abs() > 0.001
    || (b_norm - 1.0).abs() > 0.001
  {
    return None;
  }
  let dot = a.iter().zip(b).map(|(a, b)| a * b).sum::<f64>() / (a_norm * b_norm);
  Some(2.0 * dot.abs().min(1.0).acos())
}

fn compatible_root_axes(source: &Kv3Value, current: &Kv3Value) -> Option<bool> {
  let source = super::animation_model_evidence::ModelRig::parse(source)?;
  let current = super::animation_model_evidence::ModelRig::parse(current)?;
  if !source.parent("root_motion")?.is_empty() || !current.parent("root_motion")?.is_empty() {
    return Some(false);
  }
  let authored = vector::<8>(&source.pose("root_motion")?)?;
  let canonical = vector::<8>(&current.pose("root_motion")?)?;
  // The conversion acts in root-local coordinates. Translation does not change
  // those axes, and DATA/mesh bind frames retain the authored root position.
  if authored[3] <= 0.0 || canonical[3] <= 0.0 || (authored[3] - canonical[3]).abs() > 0.001 {
    return Some(false);
  }
  let normalized = |pose: [f64; 8]| {
    let q = [pose[4], pose[5], pose[6], pose[7]];
    let norm = q.iter().map(|value| value * value).sum::<f64>().sqrt();
    ((norm - 1.0).abs() <= 0.001).then(|| q.map(|value| value / norm))
  };
  let authored = normalized(authored)?;
  let canonical = normalized(canonical)?;
  let dot = authored
    .iter()
    .zip(canonical)
    .map(|(a, b)| a * b)
    .sum::<f64>();
  Some(2.0 * dot.abs().min(1.0).acos() <= ROOT_ANGLE_TOLERANCE)
}

// Quaternion multiplication can produce a value between two f32 numbers. Keep
// the authored wire width and verify against the value that width can represent.
fn round_float_values(value: &mut Kv3Value, encoding: &kv3::Encoding) {
  match value {
    Kv3Value::Double(number) if encoding.is_float() => {
      *number = f64::from(*number as f32);
    }
    Kv3Value::Array(values) => {
      if let Some(encodings) = encoding.as_array() {
        for (value, encoding) in values.iter_mut().zip(encodings) {
          round_float_values(value, encoding);
        }
      }
    }
    Kv3Value::Object(fields) => {
      for (name, value) in fields {
        if let Some(encoding) = encoding.get(name) {
          round_float_values(value, encoding);
        }
      }
    }
    _ => {}
  }
}

fn attachment<'a>(mesh: &'a Kv3Value, name: &str) -> Option<&'a Kv3Value> {
  let mut matches = mesh
    .get("m_attachments")?
    .as_array()?
    .iter()
    .filter(|item| item.get("key").and_then(Kv3Value::as_str) == Some(name));
  let value = matches.next()?.get("value")?;
  if matches.next().is_some() || !single_root(value) {
    return None;
  }
  Some(value)
}

fn single_root(value: &Kv3Value) -> bool {
  value.get("m_nInfluences").and_then(Kv3Value::as_int) == Some(1)
    && value
      .get("m_influenceNames")
      .and_then(Kv3Value::as_array)
      .is_some_and(|names| {
        !names.is_empty()
          && names[0].as_str() == Some("root_motion")
          && names[1..].iter().all(|name| name.as_str() == Some(""))
      })
    && value
      .get("m_bInfluenceRootTransform")
      .and_then(Kv3Value::as_array)
      .is_some_and(|flags| !flags.is_empty() && flags[0].as_bool() == Some(false))
}

fn vector<const N: usize>(value: &Kv3Value) -> Option<[f64; N]> {
  let array = value.as_array()?;
  if array.len() != N {
    return None;
  }
  let mut result = [0.0; N];
  for (out, value) in result.iter_mut().zip(array) {
    *out = value.as_f64()?;
    if !out.is_finite() {
      return None;
    }
  }
  Some(result)
}

fn rotation(value: &Kv3Value) -> Option<[f64; 4]> {
  let rotations = value.get("m_vInfluenceRotations")?.as_array()?;
  if rotations.is_empty() {
    return None;
  }
  vector(&rotations[0])
}

fn same_rotation(a: [f64; 4], b: [f64; 4]) -> bool {
  angle(a, b).is_some_and(|a| a <= 0.0002)
}

fn pivots(mesh: &Kv3Value, frame: [f64; 4]) -> bool {
  PIVOTS.iter().all(|name| {
    attachment(mesh, name)
      .and_then(rotation)
      .is_some_and(|q| same_rotation(q, frame))
  })
}

/// Converts every root attachment, or only the `only` names.
fn migrate_mesh(mesh: &mut Kv3Value, only: Option<&BTreeSet<String>>) -> Result<(), &'static str> {
  let Some(Kv3Value::Array(attachments)) = mesh.get_mut("m_attachments") else {
    return Err("Missing camera attachments");
  };
  let mut names = BTreeSet::new();
  for item in attachments {
    let name = item
      .get("key")
      .and_then(Kv3Value::as_str)
      .ok_or("Unnamed attachment")?
      .to_owned();
    if only.is_some_and(|only| !only.contains(&name)) {
      continue;
    }
    if !names.insert(name) {
      return Err("Duplicate attachment names");
    }
    let value = item.get_mut("value").ok_or("Missing attachment value")?;
    let has_root = value
      .get("m_influenceNames")
      .and_then(Kv3Value::as_array)
      .is_some_and(|names| {
        names
          .iter()
          .any(|name| name.as_str() == Some("root_motion"))
      });
    if !has_root {
      continue;
    }
    if !single_root(value) {
      return Err("Blended or root-space attachment requires author review");
    }
    let q = rotation(value).ok_or("Invalid attachment rotation")?;
    let norm = q.iter().map(|v| v * v).sum::<f64>().sqrt();
    if (norm - 1.0).abs() > 0.001 {
      return Err("Invalid attachment quaternion");
    }
    let Some(Kv3Value::Array(offsets)) = value.get_mut("m_vInfluenceOffsets") else {
      return Err("Missing attachment offsets");
    };
    if offsets.is_empty() {
      return Err("Unsupported attachment influences");
    }
    let [x, y, z] = vector::<3>(&offsets[0]).ok_or("Invalid attachment offset")?;
    offsets[0] = Kv3Value::Array([z, x, y].map(Kv3Value::Double).to_vec());
    let Some(Kv3Value::Array(rotations)) = value.get_mut("m_vInfluenceRotations") else {
      return Err("Missing attachment rotations");
    };
    rotations[0] = Kv3Value::Array(convert(q).map(Kv3Value::Double).to_vec());
  }
  Ok(())
}

#[cfg(test)]
mod tests;
