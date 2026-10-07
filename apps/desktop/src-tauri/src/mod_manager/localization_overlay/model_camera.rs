use super::asset_compatibility::{AssetRepair, RepairKind};
use super::{
  CompiledDataSource, Kv3Encoding, Kv3Value, Resource, decode_compiled_data, kv3, normalize_path,
  object_set_case_insensitive, resources::ResourceSnapshot,
};
use crate::errors::Error;
use std::{
  collections::{BTreeMap, BTreeSet},
  ops::Range,
};

const CAMERA_FIELDS: [&str; 2] = ["CitadelCameraSettings_t", "AttachmentCameraData"];
#[cfg(test)]
const CAMERA_POINTS: [&str; 5] = [
  "standing_pivot",
  "crouching_pivot",
  "near_00",
  "far_00",
  "gunaim_00",
];

pub(super) fn is_path(path: &str) -> bool {
  let path = normalize_path(path);
  path.starts_with("models/")
    && path.ends_with(".vmdl_c")
    && path.split('/').all(|part| !matches!(part, "" | "." | ".."))
}

pub(super) fn prepare(
  resources: &ResourceSnapshot,
  sources: &BTreeMap<String, Vec<CompiledDataSource>>,
  animation_inputs: &super::animation_model_evidence::AnimationInputs,
  animation_models: &BTreeMap<String, Vec<u8>>,
  repairs: &mut Vec<AssetRepair>,
) -> Result<BTreeMap<String, Vec<u8>>, Error> {
  let mut output = animation_models.clone();
  if sources.is_empty() {
    return Ok(output);
  }
  for (path, sources) in sources {
    // Model conflicts retain normal addon precedence; do not silently select a mesh.
    let [source] = sources.as_slice() else {
      continue;
    };
    let Some(base) = resources.game_bytes(path)? else {
      continue;
    };
    let sampled_bones = if animation_models.contains_key(path)
      && repairs.iter().any(|repair| {
        repair.file_path == *path
          && repair.mod_id == source.mod_id
          && matches!(repair.kind, RepairKind::AnimationRigRebase)
      }) {
      rebased_camera_samples(resources, &base)?
    } else {
      None
    };
    if let Some((repaired, kind)) = repair_with_controls(
      animation_models
        .get(path)
        .map(Vec::as_slice)
        .unwrap_or(&source.bytes),
      &base,
      |reference| animation_inputs.permits_camera_controls(resources, reference, &source.mod_id),
      animation_models.contains_key(path),
      sampled_bones.as_ref(),
    ) {
      log::info!(
        "Restored missing camera interface for {}:{path}",
        source.mod_id
      );
      repairs.push(AssetRepair {
        mod_id: source.mod_id.clone(),
        source_vpk: source.source_vpk.clone(),
        file_path: path.clone(),
        kind,
      });
      output.insert(path.clone(), repaired);
    }
  }
  Ok(output)
}

fn model_text(model: &Kv3Value) -> Option<&str> {
  model.get("m_modelInfo")?.get("m_keyValueText")?.as_str()
}

/// Adds the missing camera interface, preserving the skin's complete rig and geometry.
/// Existing fields are preserved. Numeric camera settings do not depend on the rig;
/// restoring attachments still requires proof that both rigs are compatible.
#[cfg(test)]
pub(super) fn repair(source: &[u8], base: &[u8]) -> Option<Vec<u8>> {
  repair_with_controls(source, base, |_| false, false, None).map(|(bytes, _)| bytes)
}

fn rebased_camera_samples(
  resources: &ResourceSnapshot,
  base: &[u8],
) -> Result<Option<BTreeSet<String>>, Error> {
  let Ok((_, model, _)) = decode_compiled_data(base, "rebased camera reference") else {
    return Ok(None);
  };
  let Some([reference]) = model
    .get("m_vecNmSkeletonRefs")
    .and_then(Kv3Value::as_array)
  else {
    return Ok(None);
  };
  let Some(name) = reference.as_str() else {
    return Ok(None);
  };
  let Some((provider, bytes)) = resources.resolve(name)? else {
    return Ok(None);
  };
  if provider.mod_id.is_some() {
    return Ok(None);
  }
  let Ok((_, skeleton, _)) = decode_compiled_data(&bytes, name) else {
    return Ok(None);
  };
  Ok(
    skeleton
      .get("m_boneIDs")
      .and_then(Kv3Value::as_array)
      .and_then(|names| {
        names
          .iter()
          .map(|name| Some(name.as_str()?.to_ascii_lowercase()))
          .collect()
      }),
  )
}

fn repair_with_controls(
  source: &[u8],
  base: &[u8],
  allow_controls: impl FnOnce(&Kv3Value) -> bool,
  allow_scaled: bool,
  sampled_bones: Option<&BTreeSet<String>>,
) -> Option<(Vec<u8>, RepairKind)> {
  let (format, mut model, mut encoding) = decode_compiled_data(source, "mod model camera").ok()?;
  let (_, vanilla, vanilla_encoding) = decode_compiled_data(base, "current model camera").ok()?;
  let old_text = model_text(&model)?;
  let current_text = model_text(&vanilla)?;
  let (closing, old_fields) = root_fields(old_text)?;
  let (_, current_fields) = root_fields(current_text)?;
  let missing: Vec<_> = CAMERA_FIELDS
    .iter()
    .copied()
    .filter(|name| !old_fields.contains_key(*name))
    .collect();
  let settings_only = missing.as_slice() == ["CitadelCameraSettings_t"];
  let compatible = (allow_scaled
    && compatible_camera_dependencies(&model, &vanilla, base, sampled_bones) == Some(true))
    || settings_only
    || model
      .get("m_modelSkeleton")
      .zip(vanilla.get("m_modelSkeleton"))
      .and_then(|(old, current)| compatible_rigs(old, current, allow_scaled))
      == Some(true);
  if missing.is_empty()
    || CAMERA_FIELDS
      .iter()
      .any(|name| !current_fields.contains_key(*name))
    || (missing.contains(&"CitadelCameraSettings_t")
      && !numeric_settings(&current_text[current_fields["CitadelCameraSettings_t"].clone()]))
  {
    return None;
  }
  // Walk animation dependencies only when this model actually needs new controls.
  if !compatible && !allow_controls(&vanilla) {
    return None;
  }
  let mut text = old_text[..closing].to_owned();
  text.push('\n');
  for name in missing {
    text.push_str(&current_text[current_fields[name].clone()]);
    text.push('\n');
  }
  text.push_str(&old_text[closing..]);
  let source_resource = Resource::parse(source).ok()?;
  let Kv3Value::Object(info) = model.get_mut("m_modelInfo")? else {
    return None;
  };
  object_set_case_insensitive(info, "m_keyValueText", Kv3Value::String(text));
  if settings_only {
    let data = kv3::encode_preserving(&model, &encoding, &format).ok()?;
    let intermediate = source_resource.rebuild_with_data_preserving(&data).ok()?;
    let (decoded_format, decoded_model, decoded_encoding) =
      decode_compiled_data(&intermediate, "rebuilt camera settings").ok()?;
    return (decoded_format == format
      && super::runtime_values_equal(&model, &decoded_model)
      && kv3::encoding_preserved(&model, &encoding, &decoded_encoding))
    .then_some((intermediate, RepairKind::CameraInterface));
  }
  let base_resource = Resource::parse(base).ok()?;
  let (mut mesh, mut mesh_encoding) =
    kv3::decode_preserving(source_resource.find_block(*b"MDAT")?).ok()?;
  let (base_mesh, base_encoding) =
    kv3::decode_preserving(base_resource.find_block(*b"MDAT")?).ok()?;
  let names = camera_point_names(current_text, &base_mesh)?;
  let points: Vec<_> = names.iter().map(String::as_str).collect();
  let mut kind = RepairKind::CameraInterface;
  if !compatible {
    if source_resource
      .blocks()
      .iter()
      .filter(|block| block.kind == *b"MDAT")
      .count()
      != 1
      || base_resource
        .blocks()
        .iter()
        .filter(|block| block.kind == *b"MDAT")
        .count()
        != 1
    {
      return None;
    }
    super::camera_controls::extend(
      super::camera_controls::Encoded {
        value: &mut model,
        encoding: &mut encoding,
      },
      super::camera_controls::Encoded {
        value: &mut mesh,
        encoding: &mut mesh_encoding,
      },
      super::camera_controls::Reference {
        value: &vanilla,
        encoding: &vanilla_encoding,
      },
      super::camera_controls::Reference {
        value: &base_mesh,
        encoding: &base_encoding,
      },
      &points,
    )?;
    kind = RepairKind::CameraControls;
  }
  let model_bones: BTreeSet<_> = model
    .get("m_modelSkeleton")?
    .get("m_boneName")?
    .as_array()?
    .iter()
    .filter_map(Kv3Value::as_str)
    .collect();
  if super::asset_compatibility::mesh_warnings(&mesh, &model_bones)
    .iter()
    .any(|(kind, label)| {
      matches!(
        kind,
        super::asset_compatibility::WarningKind::InvalidAttachment
      ) && names.contains(label)
    })
  {
    return None;
  }
  add_camera_points(
    &mut mesh,
    &mut mesh_encoding,
    &base_mesh,
    &base_encoding,
    &points,
  )?;
  let data = kv3::encode_preserving(&model, &encoding, &format).ok()?;
  let intermediate = source_resource.rebuild_with_data_preserving(&data).ok()?;
  let resource = Resource::parse(&intermediate).ok()?;
  let mesh_block = resource
    .blocks()
    .iter()
    .position(|block| block.kind == *b"MDAT")?;
  let mesh_format = kv3::Format::from_payload(resource.find_block(*b"MDAT")?).ok()?;
  let data = kv3::encode_preserving(&mesh, &mesh_encoding, &mesh_format).ok()?;
  let rebuilt = resource.rebuild_with_block(mesh_block, &data).ok()?;
  let (decoded_format, decoded_model, decoded_encoding) =
    decode_compiled_data(&rebuilt, "rebuilt model camera").ok()?;
  let rebuilt_resource = Resource::parse(&rebuilt).ok()?;
  let (decoded_mesh, decoded_mesh_encoding) =
    kv3::decode_preserving(rebuilt_resource.get_block_by_index(mesh_block)?).ok()?;
  if decoded_format != format
    || !super::runtime_values_equal(&model, &decoded_model)
    || !super::runtime_values_equal(&mesh, &decoded_mesh)
    || !kv3::encoding_preserved(&model, &encoding, &decoded_encoding)
    || !kv3::encoding_preserved(&mesh, &mesh_encoding, &decoded_mesh_encoding)
  {
    return None;
  }
  Some((rebuilt, kind))
}

// Only scalar/vector offsets can be copied without evidence about the skin's rig.
// Decline a future camera schema that introduces resource or attachment references.
fn numeric_settings(field: &str) -> bool {
  let Some((_, object)) = field.split_once('=') else {
    return false;
  };
  let Some((_, fields)) = root_fields(object) else {
    return false;
  };
  !fields.is_empty()
    && fields.values().all(|range| {
      let Some((_, value)) = object[range.clone()].split_once('=') else {
        return false;
      };
      let value = value.trim();
      let value = value
        .strip_prefix('[')
        .and_then(|value| value.strip_suffix(']'))
        .unwrap_or(value);
      let numbers: Vec<_> = value
        .split(|character: char| character.is_ascii_whitespace() || character == ',')
        .filter(|value| !value.is_empty())
        .collect();
      !numbers.is_empty()
        && numbers
          .iter()
          .all(|value| value.parse::<f64>().is_ok_and(f64::is_finite))
    })
}

pub(super) fn missing_camera_fields(model: &Kv3Value, vanilla: &Kv3Value) -> Vec<String> {
  let Some(current) = model_text(vanilla).and_then(root_fields) else {
    return Vec::new();
  };
  // Accessory models may carry a camera offset without a playable camera interface.
  // Match the complete interface required by the repair rule before diagnosing it.
  if CAMERA_FIELDS
    .iter()
    .any(|name| !current.1.contains_key(*name))
  {
    return Vec::new();
  }
  let Some(text) = model_text(model) else {
    return Vec::new();
  };
  let old = if text.trim().is_empty() {
    BTreeMap::new()
  } else {
    let Some((_, fields)) = root_fields(text) else {
      return Vec::new();
    };
    fields
  };
  CAMERA_FIELDS
    .iter()
    .filter(|name| current.1.contains_key(**name) && !old.contains_key(**name))
    .map(|name| (*name).to_owned())
    .collect()
}

pub(super) fn legacy_animation_graph(model: &Kv3Value) -> Option<&str> {
  let text = model_text(model)?;
  let (_, fields) = root_fields(text)?;
  let field = &text[fields.get("anim_graph_resource")?.clone()];
  let (_, value) = field.split_once('=')?;
  let name = value
    .trim()
    .strip_prefix("resource:")?
    .trim()
    .strip_prefix('"')?
    .strip_suffix('"')?;
  (!name.contains('"') && !name.contains('\\')).then_some(name)
}

fn add_camera_points(
  mesh: &mut Kv3Value,
  encoding: &mut Kv3Encoding,
  base: &Kv3Value,
  base_encoding: &Kv3Encoding,
  names: &[&str],
) -> Option<()> {
  let Kv3Value::Array(points) = mesh.get_mut("m_attachments")? else {
    return None;
  };
  let existing: BTreeSet<_> = points
    .iter()
    .filter_map(|point| {
      point
        .get("key")
        .and_then(Kv3Value::as_str)
        .map(str::to_owned)
    })
    .collect();
  if existing.len() != points.len() {
    return None;
  }
  let kv3::EncodingChildren::Array(encodings) = &mut encoding.get_mut("m_attachments")?.children
  else {
    return None;
  };
  let base_points = base.get("m_attachments")?.as_array()?;
  let base_encodings = base_encoding.get("m_attachments")?.as_array()?;
  for name in names {
    if existing.contains(*name) {
      continue;
    }
    let (index, point) = base_points
      .iter()
      .enumerate()
      .find(|(_, point)| point.get("key").and_then(Kv3Value::as_str) == Some(*name))?;
    points.push(point.clone());
    encodings.push(base_encodings.get(index)?.clone());
  }
  Some(())
}

fn camera_point_names(text: &str, mesh: &Kv3Value) -> Option<Vec<String>> {
  let (_, fields) = root_fields(text)?;
  let field = &text[fields.get("AttachmentCameraData")?.clone()];
  let (_, value) = field.split_once('=')?;
  let mut cursor = TextCursor {
    text: value.as_bytes(),
    position: 0,
  };
  cursor.space()?;
  cursor.expect(b'[')?;
  let mut names = BTreeSet::new();
  loop {
    cursor.space()?;
    if cursor.peek()? == b']' {
      cursor.position += 1;
      break;
    }
    let start = cursor.position;
    cursor.value(0)?;
    let entry = &value[start..cursor.position];
    let (_, fields) = root_fields(entry)?;
    let (_, name) = entry[fields.get("attachment_name")?.clone()].split_once('=')?;
    let name = name.trim().strip_prefix('"')?.strip_suffix('"')?;
    if name.is_empty() || name.contains(['"', '\\']) {
      return None;
    }
    names.insert(name.to_owned());
  }
  cursor.space()?;
  if cursor.peek().is_some() || names.is_empty() {
    return None;
  }
  let points = mesh.get("m_attachments")?.as_array()?;
  for pivot in ["standing_pivot", "crouching_pivot"] {
    if points
      .iter()
      .any(|point| point.get("key").and_then(Kv3Value::as_str) == Some(pivot))
    {
      names.insert(pivot.into());
    }
  }
  for name in &names {
    if points
      .iter()
      .filter(|point| point.get("key").and_then(Kv3Value::as_str) == Some(name))
      .count()
      != 1
    {
      return None;
    }
  }
  Some(names.into_iter().collect())
}

pub(super) fn required_bones(model: &Kv3Value, mesh: &Kv3Value) -> Option<BTreeSet<String>> {
  let names = camera_point_names(model_text(model)?, mesh)?;
  let mut bones = BTreeSet::new();
  for attachment in mesh.get("m_attachments")?.as_array()? {
    let point = attachment.get("value")?;
    if !names
      .iter()
      .any(|name| point.get("m_name").and_then(Kv3Value::as_str) == Some(name.as_str()))
    {
      continue;
    }
    let count = usize::try_from(point.get("m_nInfluences")?.as_int()?).ok()?;
    for i in 0..count {
      if point
        .get("m_bInfluenceRootTransform")?
        .as_array()?
        .get(i)?
        .as_bool()?
      {
        continue;
      }
      bones.insert(
        point
          .get("m_influenceNames")?
          .as_array()?
          .get(i)?
          .as_str()?
          .to_ascii_lowercase(),
      );
    }
  }
  Some(bones)
}

fn compatible_camera_dependencies(
  source: &Kv3Value,
  current: &Kv3Value,
  base: &[u8],
  sampled_bones: Option<&BTreeSet<String>>,
) -> Option<bool> {
  let mesh = kv3::decode(Resource::parse(base).ok()?.find_block(*b"MDAT")?).ok()?;
  let required = required_bones(current, &mesh)?;
  compatible_named_camera_bones(source, current, &required, sampled_bones)
}

fn compatible_named_camera_bones(
  source: &Kv3Value,
  current: &Kv3Value,
  required: &BTreeSet<String>,
  sampled_bones: Option<&BTreeSet<String>>,
) -> Option<bool> {
  let old = super::animation_model_evidence::ModelRig::parse(source)?;
  let current = super::animation_model_evidence::ModelRig::parse(current)?;
  let old_names: BTreeMap<_, _> = old.names().map(|n| (n.to_ascii_lowercase(), n)).collect();
  let current_names: BTreeMap<_, _> = current
    .names()
    .map(|n| (n.to_ascii_lowercase(), n))
    .collect();
  let mut checked = BTreeSet::new();
  for name in required {
    let mut a = *old_names.get(name)?;
    let mut b = *current_names.get(name)?;
    // A proven rig rebase retains authored bind frames, while NM supplies the
    // canonical world pose by name. Unsampled camera controls still need pose proof.
    let sampled = sampled_bones.is_some_and(|bones| bones.contains(name));
    while !a.is_empty() && checked.insert((a, sampled)) {
      if !a.eq_ignore_ascii_case(b)
        || (!sampled
          && super::animation_skeleton::equivalent_pose(&old.pose(a)?, &current.pose(b)?)
            != Some(true))
      {
        return Some(false);
      }
      a = old.parent(a)?;
      b = current.parent(b)?;
      if a.is_empty() != b.is_empty() {
        return Some(false);
      }
    }
  }
  Some(true)
}

fn compatible_rigs(old: &Kv3Value, current: &Kv3Value, allow_scaled: bool) -> Option<bool> {
  for rig in [old, current] {
    if !super::asset_compatibility::valid_skeleton(
      rig,
      "m_boneName",
      "m_nParent",
      &[
        ("m_bonePosParent", 3),
        ("m_boneRotParent", 4),
        ("m_boneScaleParent", 0),
      ],
    ) {
      return Some(false);
    }
  }
  let names = |rig: &Kv3Value| -> Option<Vec<String>> {
    rig
      .get("m_boneName")?
      .as_array()?
      .iter()
      .map(|name| name.as_str().map(str::to_owned))
      .collect()
  };
  let a = names(old)?;
  let b = names(current)?;
  let unique = |names: &[String]| names.iter().cloned().collect::<BTreeSet<_>>();
  if a.is_empty()
    || unique(&a).len() != a.len()
    || unique(&b).len() != b.len()
    || !unique(&b).is_subset(&unique(&a))
  {
    return Some(false);
  }
  let indices: BTreeMap<_, _> = a.iter().enumerate().map(|(i, n)| (n, i)).collect();
  let parent = |rig: &Kv3Value, names: &[String], index: usize| -> Option<String> {
    let parent = rig.get("m_nParent")?.as_array()?.get(index)?.as_int()?;
    if parent == -1 {
      Some(String::new())
    } else {
      names.get(usize::try_from(parent).ok()?).cloned()
    }
  };
  let pose = |rig: &Kv3Value, index: usize| -> Option<Kv3Value> {
    let position = rig
      .get("m_bonePosParent")?
      .as_array()?
      .get(index)?
      .as_array()?;
    let rotation = rig
      .get("m_boneRotParent")?
      .as_array()?
      .get(index)?
      .as_array()?;
    if position.len() != 3 || rotation.len() != 4 {
      return None;
    }
    let mut values = position.to_vec();
    values.push(
      rig
        .get("m_boneScaleParent")?
        .as_array()?
        .get(index)?
        .clone(),
    );
    values.extend_from_slice(rotation);
    Some(Kv3Value::Array(values))
  };
  // Extra authored branches do not change the current camera's bone dependencies.
  // Every current bone and its complete parent/pose contract must still match.
  let mut poses = Vec::new();
  for (j, name) in b.iter().enumerate() {
    let i = *indices.get(name)?;
    if parent(old, &a, i)? != parent(current, &b, j)? {
      return Some(false);
    }
    poses.push((name.clone(), pose(old, i)?, pose(current, j)?));
  }
  Some(
    poses
      .iter()
      .all(|(_, a, b)| super::animation_skeleton::equivalent_pose(a, b) == Some(true))
      || allow_scaled && super::model_animation::scaled_poses_compatible(&poses),
  )
}

// This is a bounded scanner for root metadata fields, not a KV3 serializer.
// It preserves authored text verbatim and declines unsupported syntax.
pub(super) fn root_fields(text: &str) -> Option<(usize, BTreeMap<String, Range<usize>>)> {
  let start = text.find("-->").map_or(0, |index| index + 3);
  let mut cursor = TextCursor {
    text: text.as_bytes(),
    position: start,
  };
  cursor.space()?;
  cursor.expect(b'{')?;
  let mut fields = BTreeMap::new();
  loop {
    cursor.space()?;
    if cursor.peek()? == b'}' {
      return Some((cursor.position, fields));
    }
    let start = cursor.position;
    while cursor
      .peek()
      .is_some_and(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'.'))
    {
      cursor.position += 1;
    }
    if start == cursor.position {
      return None;
    }
    let name = std::str::from_utf8(&cursor.text[start..cursor.position])
      .ok()?
      .to_owned();
    cursor.space()?;
    cursor.expect(b'=')?;
    cursor.space()?;
    cursor.value(0)?;
    if fields.insert(name, start..cursor.position).is_some() {
      return None;
    }
  }
}

struct TextCursor<'a> {
  text: &'a [u8],
  position: usize,
}

impl TextCursor<'_> {
  fn peek(&self) -> Option<u8> {
    self.text.get(self.position).copied()
  }
  fn expect(&mut self, byte: u8) -> Option<()> {
    if self.peek()? != byte {
      return None;
    }
    self.position += 1;
    Some(())
  }
  fn space(&mut self) -> Option<()> {
    loop {
      while self
        .peek()
        .is_some_and(|byte| byte.is_ascii_whitespace() || byte == b',')
      {
        self.position += 1;
      }
      if self.text.get(self.position..self.position + 2) == Some(b"//") {
        while self.peek().is_some_and(|byte| byte != b'\n') {
          self.position += 1;
        }
      } else if self.text.get(self.position..self.position + 2) == Some(b"/*") {
        self.position += 2;
        while self.text.get(self.position..self.position + 2) != Some(b"*/") {
          self.peek()?;
          self.position += 1;
        }
        self.position += 2;
      } else {
        return Some(());
      }
    }
  }
  fn quoted(&mut self) -> Option<()> {
    self.expect(b'"')?;
    loop {
      match self.peek()? {
        b'"' => {
          self.position += 1;
          return Some(());
        }
        b'\\' => {
          self.position += 1;
          self.peek()?;
          self.position += 1;
        }
        _ => self.position += 1,
      }
    }
  }
  fn value(&mut self, depth: usize) -> Option<()> {
    if depth > 64 {
      return None;
    }
    match self.peek()? {
      b'{' | b'[' => {
        let closing = if self.peek()? == b'{' { b'}' } else { b']' };
        self.position += 1;
        loop {
          self.space()?;
          if self.peek()? == closing {
            self.position += 1;
            return Some(());
          }
          if matches!(self.peek()?, b'}' | b']') {
            return None;
          }
          self.value(depth + 1)?;
        }
      }
      b'"' => self.quoted(),
      _ => {
        let start = self.position;
        while self.peek().is_some_and(|byte| {
          !byte.is_ascii_whitespace() && !matches!(byte, b',' | b'}' | b']' | b'{' | b'[' | b'"')
        }) {
          self.position += 1;
        }
        if self.position == start {
          return None;
        }
        if self.peek() == Some(b'"') {
          self.quoted()?;
        }
        Some(())
      }
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn sampled_camera_bones_accept_preserved_binds_but_unsampled_dependencies_do_not() {
    let current = super::super::model_animation::tests::model(&["root", "head"], &[-1, 0]);
    let mut authored = current.clone();
    let Kv3Value::Array(positions) = authored
      .get_mut("m_modelSkeleton")
      .unwrap()
      .get_mut("m_bonePosParent")
      .unwrap()
    else {
      unreachable!()
    };
    positions[0] = Kv3Value::Array([1., 0., 0.].map(Kv3Value::Double).to_vec());
    let head = BTreeSet::from(["head".to_owned()]);
    assert_eq!(
      compatible_named_camera_bones(&authored, &current, &head, None),
      Some(false)
    );
    assert_eq!(
      compatible_named_camera_bones(&authored, &current, &head, Some(&head)),
      Some(true)
    );
    // The sampled head checks first, but must not exempt an unsampled shared root.
    let both = BTreeSet::from(["head".to_owned(), "root".to_owned()]);
    assert_eq!(
      compatible_named_camera_bones(&authored, &current, &both, Some(&head)),
      Some(false)
    );
    assert_eq!(
      compatible_named_camera_bones(&authored, &current, &both, Some(&both)),
      Some(true)
    );
    let changed = super::super::model_animation::tests::model(&["root", "head"], &[-1, -1]);
    assert_eq!(
      compatible_named_camera_bones(&authored, &changed, &head, Some(&head)),
      Some(false)
    );
  }

  #[test]
  fn partial_camera_interface_restores_settings_without_changing_authored_data() {
    let model = |text: &str| {
      super::super::tests::compiled_resource(vec![
        (
          "m_modelInfo".into(),
          Kv3Value::Object(vec![(
            "m_keyValueText".into(),
            Kv3Value::String(text.into()),
          )]),
        ),
        (
          "m_modelSkeleton".into(),
          Kv3Value::String("custom rig must remain unchanged".into()),
        ),
      ])
    };
    let old_text = "{ AttachmentCameraData = [ { attachment_name = \"near_00\" fov = 42 } ] Custom = { value = 7 } }";
    let base_text = "{ CitadelCameraSettings_t = { m_flCameraHeightStanding = 80.0 m_vCameraParrotOffset = [ -10.0, -10.0, 10.0 ] } AttachmentCameraData = [] }";
    let source = model(old_text);
    let repaired =
      repair(&source, &model(base_text)).expect("partial camera settings should be repaired");
    let (_, original, _) = decode_compiled_data(&source, "original").unwrap();
    let (_, updated, _) = decode_compiled_data(&repaired, "updated").unwrap();
    assert_eq!(
      original.get("m_modelSkeleton"),
      updated.get("m_modelSkeleton")
    );
    let text = model_text(&updated).unwrap();
    let (_, fields) = root_fields(text).unwrap();
    let (_, old_fields) = root_fields(old_text).unwrap();
    for field in ["AttachmentCameraData", "Custom"] {
      assert_eq!(
        &text[fields[field].clone()],
        &old_text[old_fields[field].clone()]
      );
    }
    assert!(fields.contains_key("CitadelCameraSettings_t"));
    assert!(
      repair(&repaired, &model(base_text)).is_none(),
      "repair must be idempotent"
    );
  }

  #[test]
  fn metadata_scan_handles_nested_values_quotes_comments_and_resource_names() {
    let text = r#"<!-- kv3 format:version{ignored-header-braces} -->
{
  Existing = { name = "escaped \" }" resource = resource:"path/{not_a_block}" /* } */ }
  // CitadelCameraSettings_t = { bogus = true }
  CitadelCameraSettings_t = { offset = [ -10.0, 0.0, 1.0 ] }
  AttachmentCameraData = [ { attachment_name = "near_00" } ]
}"#;
    let (closing, fields) = root_fields(text).unwrap();
    assert_eq!(&text[closing..], "}");
    assert_eq!(
      &text[fields["AttachmentCameraData"].clone()],
      "AttachmentCameraData = [ { attachment_name = \"near_00\" } ]"
    );
    assert_eq!(fields.len(), 3);
  }

  #[test]
  fn camera_attachment_names_come_from_the_current_model_interface() {
    let text = "{ AttachmentCameraData = [ { attachment_name = \"alternate_form_camera\" fov = 90 } { attachment_name = \"near_02\" fov = 75 } ] }";
    let mesh = attachments(&["alternate_form_camera", "near_02", "standing_pivot"]);
    assert_eq!(
      camera_point_names(text, &mesh).unwrap(),
      vec!["alternate_form_camera", "near_02", "standing_pivot"]
    );
    assert!(camera_point_names(text, &attachments(&["near_02"])).is_none());
    assert!(
      camera_point_names(
        "{ AttachmentCameraData = [ { attachment_name = \"missing\" } ] }",
        &mesh
      )
      .is_none()
    );
  }

  #[test]
  fn metadata_scan_declines_malformed_duplicate_and_overly_nested_fields() {
    for text in [
      "{ a = {",
      "{ a = [ } }",
      "{ a = \"unterminated }",
      "{ a = {} a = {} }",
    ] {
      assert!(root_fields(text).is_none(), "{text}");
    }
    let nested = format!("{{ a = {}{} }}", "[".repeat(100), "]".repeat(100));
    assert!(root_fields(&nested).is_none());
  }

  #[test]
  fn numeric_camera_settings_decline_resource_and_bone_dependent_schemas() {
    assert!(numeric_settings(
      "Camera = { offset = -32.0 vector = [ 1, 2, 3 ] }"
    ));
    for value in [
      "resource:\"models/camera.vmdl\"",
      "\"head\"",
      "NaN",
      "[ inf, 0 ]",
      "{}",
      "[]",
    ] {
      assert!(
        !numeric_settings(&format!("Camera = {{ value = {value} }}")),
        "{value}"
      );
    }
  }

  #[test]
  fn incomplete_camera_interfaces_are_reported_when_repair_cannot_be_proven() {
    let model = |text: &str| {
      Kv3Value::Object(vec![(
        "m_modelInfo".into(),
        Kv3Value::Object(vec![(
          "m_keyValueText".into(),
          Kv3Value::String(text.into()),
        )]),
      )])
    };
    let current = model("{ CitadelCameraSettings_t = { offset = 80 } AttachmentCameraData = [] }");
    assert_eq!(
      missing_camera_fields(&model("{ AttachmentCameraData = [] }"), &current),
      vec!["CitadelCameraSettings_t"]
    );
    assert_eq!(missing_camera_fields(&model(""), &current), CAMERA_FIELDS);
    assert!(missing_camera_fields(&current, &current).is_empty());
  }

  fn attachments(names: &[&str]) -> Kv3Value {
    Kv3Value::Object(vec![(
      "m_attachments".into(),
      Kv3Value::Array(
        names
          .iter()
          .map(|name| {
            Kv3Value::Object(vec![
              ("key".into(), Kv3Value::String((*name).into())),
              (
                "value".into(),
                Kv3Value::Object(vec![("authored_offset".into(), Kv3Value::Int(42))]),
              ),
            ])
          })
          .collect(),
      ),
    )])
  }

  fn encoding(value: &Kv3Value) -> Kv3Encoding {
    kv3::decode_preserving(&kv3::encode(value, &kv3::Format([0; 16])))
      .unwrap()
      .1
  }

  #[test]
  fn camera_points_preserve_original_attachments_and_encoding() {
    let mut mesh = attachments(&["custom_mount"]);
    let original = mesh.clone();
    let mut enc = encoding(&mesh);
    let base = attachments(&CAMERA_POINTS);
    add_camera_points(&mut mesh, &mut enc, &base, &encoding(&base), &CAMERA_POINTS).unwrap();
    let points = mesh.get("m_attachments").unwrap().as_array().unwrap();
    assert_eq!(
      &points[..1],
      original.get("m_attachments").unwrap().as_array().unwrap()
    );
    assert_eq!(
      &points[1..],
      base.get("m_attachments").unwrap().as_array().unwrap()
    );
    let bytes = kv3::encode_preserving(&mesh, &enc, &kv3::Format([0; 16])).unwrap();
    assert_eq!(kv3::decode(&bytes).unwrap(), mesh);
  }

  #[test]
  fn authored_camera_points_are_not_overwritten() {
    let mut mesh = attachments(&["near_00"]);
    let Kv3Value::Array(points) = mesh.get_mut("m_attachments").unwrap() else {
      unreachable!()
    };
    *points[0]
      .get_mut("value")
      .unwrap()
      .get_mut("authored_offset")
      .unwrap() = Kv3Value::Int(7);
    let original = mesh.clone();
    let mut enc = encoding(&mesh);
    let base = attachments(&CAMERA_POINTS);
    add_camera_points(&mut mesh, &mut enc, &base, &encoding(&base), &CAMERA_POINTS).unwrap();
    let points = mesh.get("m_attachments").unwrap().as_array().unwrap();
    assert_eq!(points.len(), CAMERA_POINTS.len());
    assert_eq!(
      &points[..1],
      original.get("m_attachments").unwrap().as_array().unwrap()
    );
    let bytes = kv3::encode_preserving(&mesh, &enc, &kv3::Format([0; 16])).unwrap();
    assert_eq!(kv3::decode(&bytes).unwrap(), mesh);
    assert!(!is_path("models/../../outside.vmdl_c"));
  }

  #[test]
  fn duplicate_authored_camera_points_prevent_repair() {
    let mut mesh = attachments(&["near_00", "near_00"]);
    let original = mesh.clone();
    let mut enc = encoding(&mesh);
    let original_encoding = enc.clone();
    let base = attachments(&CAMERA_POINTS);
    assert!(
      add_camera_points(&mut mesh, &mut enc, &base, &encoding(&base), &CAMERA_POINTS).is_none()
    );
    assert_eq!(mesh, original);
    assert_eq!(enc, original_encoding);
  }
}
