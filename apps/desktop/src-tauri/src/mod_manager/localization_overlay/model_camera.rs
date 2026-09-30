use super::asset_compatibility::{AssetRepair, RepairKind};
use super::{
  CompiledDataSource, Kv3Encoding, Kv3Value, Resource, decode_compiled_data, kv3, normalize_path,
  object_set_case_insensitive,
};
use crate::errors::Error;
use source2_model::vpk_extract::VpkArchive;
use std::{
  collections::{BTreeMap, BTreeSet},
  ops::Range,
  path::Path,
};

const CAMERA_FIELDS: [&str; 2] = ["CitadelCameraSettings_t", "AttachmentCameraData"];
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
  citadel: &Path,
  sources: &BTreeMap<String, Vec<CompiledDataSource>>,
  repairs: &mut Vec<AssetRepair>,
) -> Result<BTreeMap<String, Vec<u8>>, Error> {
  let mut output = BTreeMap::new();
  if sources.is_empty() {
    return Ok(output);
  }
  let archive = VpkArchive::open(&citadel.join("pak01_dir.vpk"))
    .map_err(|error| Error::ModInvalid(format!("Failed to read model camera data: {error}")))?;
  let paths: BTreeMap<_, _> = archive
    .list_entries()
    .into_iter()
    .filter(|path| is_path(path))
    .map(|path| (normalize_path(&path), path))
    .collect();
  for (path, sources) in sources {
    // Model conflicts retain normal addon precedence; do not silently select a mesh.
    let [source] = sources.as_slice() else {
      continue;
    };
    let Some(base_path) = paths.get(path) else {
      continue;
    };
    let base = archive
      .extract_entry(base_path)
      .map_err(|error| Error::ModInvalid(format!("Failed to read {base_path}: {error}")))?;
    if let Some(repaired) = repair(&source.bytes, &base) {
      log::info!(
        "Restored missing camera interface for {}:{path}",
        source.mod_id
      );
      repairs.push(AssetRepair {
        mod_id: source.mod_id.clone(),
        source_vpk: source.source_vpk.clone(),
        file_path: path.clone(),
        kind: RepairKind::CameraInterface,
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
/// A partial/authored interface or incompatible rig is left untouched.
fn repair(source: &[u8], base: &[u8]) -> Option<Vec<u8>> {
  let (format, mut model, encoding) = decode_compiled_data(source, "mod model camera").ok()?;
  let (_, vanilla, _) = decode_compiled_data(base, "current model camera").ok()?;
  let old_text = model_text(&model)?;
  let current_text = model_text(&vanilla)?;
  let (closing, old_fields) = root_fields(old_text)?;
  let (_, current_fields) = root_fields(current_text)?;
  if CAMERA_FIELDS
    .iter()
    .any(|name| old_fields.contains_key(*name))
    || CAMERA_FIELDS
      .iter()
      .any(|name| !current_fields.contains_key(*name))
    || compatible_rigs(
      model.get("m_modelSkeleton")?,
      vanilla.get("m_modelSkeleton")?,
    ) != Some(true)
  {
    return None;
  }
  let mut text = old_text[..closing].to_owned();
  text.push('\n');
  for name in CAMERA_FIELDS {
    text.push_str(&current_text[current_fields[name].clone()]);
    text.push('\n');
  }
  text.push_str(&old_text[closing..]);
  let source_resource = Resource::parse(source).ok()?;
  let base_resource = Resource::parse(base).ok()?;
  let (mut mesh, mut mesh_encoding) =
    kv3::decode_preserving(source_resource.find_block(*b"MDAT")?).ok()?;
  let (base_mesh, base_encoding) =
    kv3::decode_preserving(base_resource.find_block(*b"MDAT")?).ok()?;
  add_camera_points(&mut mesh, &mut mesh_encoding, &base_mesh, &base_encoding)?;
  let Kv3Value::Object(info) = model.get_mut("m_modelInfo")? else {
    return None;
  };
  object_set_case_insensitive(info, "m_keyValueText", Kv3Value::String(text));
  let data = kv3::encode_preserving(&model, &encoding, &format).ok()?;
  let intermediate = source_resource.rebuild_with_data(&data).ok()?;
  let resource = Resource::parse(&intermediate).ok()?;
  let mesh_block = resource
    .blocks()
    .iter()
    .position(|block| block.kind == *b"MDAT")?;
  let mesh_format = kv3::Format::from_payload(resource.find_block(*b"MDAT")?).ok()?;
  let data = kv3::encode_preserving(&mesh, &mesh_encoding, &mesh_format).ok()?;
  resource.rebuild_with_block(mesh_block, &data).ok()
}

fn add_camera_points(
  mesh: &mut Kv3Value,
  encoding: &mut Kv3Encoding,
  base: &Kv3Value,
  base_encoding: &Kv3Encoding,
) -> Option<()> {
  let Kv3Value::Array(points) = mesh.get_mut("m_attachments")? else {
    return None;
  };
  if points.iter().any(|point| {
    point
      .get("key")
      .and_then(Kv3Value::as_str)
      .is_some_and(|name| CAMERA_POINTS.contains(&name))
  }) {
    return None;
  }
  let kv3::EncodingChildren::Array(encodings) = &mut encoding.get_mut("m_attachments")?.children
  else {
    return None;
  };
  let base_points = base.get("m_attachments")?.as_array()?;
  let base_encodings = base_encoding.get("m_attachments")?.as_array()?;
  for name in CAMERA_POINTS {
    let (index, point) = base_points
      .iter()
      .enumerate()
      .find(|(_, point)| point.get("key").and_then(Kv3Value::as_str) == Some(name))?;
    points.push(point.clone());
    encodings.push(base_encodings.get(index)?.clone());
  }
  Some(())
}

fn compatible_rigs(old: &Kv3Value, current: &Kv3Value) -> Option<bool> {
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
    || unique(&a) != unique(&b)
  {
    return Some(false);
  }
  let indices: BTreeMap<_, _> = b.iter().enumerate().map(|(i, n)| (n, i)).collect();
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
  for (i, name) in a.iter().enumerate() {
    let j = *indices.get(name)?;
    if parent(old, &a, i)? != parent(current, &b, j)?
      || !super::animation_skeleton::equivalent_pose(&pose(old, i)?, &pose(current, j)?)?
    {
      return Some(false);
    }
  }
  Some(true)
}

// This is a bounded scanner for root metadata fields, not a KV3 serializer.
// It preserves authored text verbatim and declines unsupported syntax.
fn root_fields(text: &str) -> Option<(usize, BTreeMap<String, Range<usize>>)> {
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
    add_camera_points(&mut mesh, &mut enc, &base, &encoding(&base)).unwrap();
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
    let original = mesh.clone();
    let mut enc = encoding(&mesh);
    let base = attachments(&CAMERA_POINTS);
    assert!(add_camera_points(&mut mesh, &mut enc, &base, &encoding(&base)).is_none());
    assert_eq!(mesh, original);
    assert!(!is_path("models/../../outside.vmdl_c"));
  }
}
