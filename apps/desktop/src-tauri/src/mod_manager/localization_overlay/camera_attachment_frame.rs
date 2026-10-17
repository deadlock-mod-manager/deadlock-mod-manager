use super::asset_compatibility::{AssetRepair, AssetWarning, RepairKind, WarningKind};
use super::{
  CompiledDataSource, Kv3Value, Resource, decode_compiled_data, kv3, resources::ResourceSnapshot,
};
use crate::errors::Error;
use std::collections::{BTreeMap, BTreeSet};

const PIVOTS: [&str; 2] = ["standing_pivot", "crouching_pivot"];
const OLD_FRAME: [f64; 4] = [-0.5, -0.5, -0.5, 0.5];
const IDENTITY: [f64; 4] = [0.0, 0.0, 0.0, 1.0];

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
  let Some(_) = current
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
  let mut legacy = Vec::new();
  for index in indices {
    let Some(raw) = resource.get_block_by_index(index) else {
      return Ok(None);
    };
    let Ok(mesh) = kv3::decode(raw) else {
      return Ok(None);
    };
    if pivots(&mesh, OLD_FRAME) {
      legacy.push(index);
    } else if has_old_pivot(&mesh) {
      return Err("Camera pivots use mixed or authored frames; migration skipped");
    }
  }
  if legacy.is_empty() {
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
  for index in legacy {
    let resource = Resource::parse(&output).map_err(|_| "Invalid camera model container")?;
    let raw = resource
      .get_block_by_index(index)
      .ok_or("Missing camera mesh block")?;
    let (mut mesh, mut encoding) =
      kv3::decode_preserving(raw).map_err(|_| "Camera mesh block could not be decoded")?;
    migrate_mesh(&mut mesh)?;
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
      .rebuild_with_block(index, &rebuilt)
      .map_err(|_| "Camera model could not be rebuilt")?;
  }
  Ok(Some(output))
}

fn compatible_root_axes(source: &Kv3Value, current: &Kv3Value) -> Option<bool> {
  let source = super::animation_model_evidence::ModelRig::parse(source)?;
  let current = super::animation_model_evidence::ModelRig::parse(current)?;
  if !source.parent("root_motion")?.is_empty() || !current.parent("root_motion")?.is_empty() {
    return Some(false);
  }
  let mut authored = vector::<8>(&source.pose("root_motion")?)?;
  let canonical = vector::<8>(&current.pose("root_motion")?)?;
  // The conversion acts in root-local coordinates. Translation does not change
  // those axes, and DATA/mesh bind frames retain the authored root position.
  authored[..3].copy_from_slice(&canonical[..3]);
  let pose = |values: [f64; 8]| Kv3Value::Array(values.into_iter().map(Kv3Value::Double).collect());
  super::animation_skeleton::equivalent_pose(&pose(authored), &pose(canonical))
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
  let norm = a.iter().map(|v| v * v).sum::<f64>().sqrt();
  if !norm.is_finite() || norm < 1e-9 {
    return false;
  }
  let dot = a.iter().zip(b).map(|(a, b)| a * b).sum::<f64>() / norm;
  2.0 * dot.abs().min(1.0).acos() <= 0.0002
}

fn pivots(mesh: &Kv3Value, frame: [f64; 4]) -> bool {
  PIVOTS.iter().all(|name| {
    attachment(mesh, name)
      .and_then(rotation)
      .is_some_and(|q| same_rotation(q, frame))
  })
}

fn has_old_pivot(mesh: &Kv3Value) -> bool {
  PIVOTS.iter().any(|name| {
    attachment(mesh, name)
      .and_then(rotation)
      .is_some_and(|q| same_rotation(q, OLD_FRAME))
  })
}

fn migrate_mesh(mesh: &mut Kv3Value) -> Result<(), &'static str> {
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
    let [x, y, z, w] = q;
    let migrated = [
      (x + w + z - y) * 0.5,
      (y + w + x - z) * 0.5,
      (z + w + y - x) * 0.5,
      (w - x - y - z) * 0.5,
    ];
    let Some(Kv3Value::Array(rotations)) = value.get_mut("m_vInfluenceRotations") else {
      return Err("Missing attachment rotations");
    };
    rotations[0] = Kv3Value::Array(migrated.map(Kv3Value::Double).to_vec());
  }
  Ok(())
}

#[cfg(test)]
mod tests;
