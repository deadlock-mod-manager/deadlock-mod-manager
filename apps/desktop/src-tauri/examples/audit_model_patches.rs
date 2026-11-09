//! Check attachment exports against every hero model in a read-only game archive.
use std::{collections::BTreeMap, error::Error, fs, path::PathBuf};

use clap::Parser;
use serde::Serialize;
use source2_model::vpk_extract::VpkArchive;
use vpkmanager::{
  model_patch::{AttachedPatch, PatchVertex, attach},
  source2::{
    kv3::{self, Value},
    resource::Resource,
  },
};

type Result<T> = std::result::Result<T, Box<dyn Error>>;

#[derive(Parser)]
#[command(about = "Audit 3D sticker exports without modifying game or addon files")]
struct Args {
  #[arg(long)]
  archive: PathBuf,
  #[arg(long)]
  report: PathBuf,
  /// Restrict model paths to this substring. Omit to check all hero folders.
  #[arg(long)]
  filter: Option<String>,
  /// Also decode one successful export per model using the preview reader.
  #[arg(long)]
  decode: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Report {
  models: Vec<ModelReport>,
  failures: Vec<Failure>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelReport {
  model: String,
  meshes: usize,
  bindings: usize,
  export_patterns: usize,
  exported: usize,
  decoded: bool,
  unsupported: Option<String>,
  lod_gaps: Vec<LodGap>,
}

#[derive(Serialize)]
struct Failure {
  model: String,
  error: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LodGap {
  material: String,
  bone: String,
  missing_lod_mask: u64,
}

struct Mesh {
  lods: u64,
  bones: Vec<String>,
  materials: Vec<String>,
}

fn array<'a>(value: &'a Value, key: &str) -> Result<&'a [Value]> {
  value
    .get(key)
    .and_then(Value::as_array)
    .ok_or_else(|| format!("Missing array {key}").into())
}

fn integer(value: &Value) -> Result<u64> {
  match value {
    Value::Int(v) => Ok(u64::try_from(*v)?),
    Value::UInt(v) => Ok(*v),
    _ => Err("Expected nonnegative integer".into()),
  }
}

fn field(value: &Value, key: &str) -> Result<usize> {
  Ok(usize::try_from(integer(
    value.get(key).ok_or_else(|| format!("Missing {key}"))?,
  )?)?)
}

fn inspect(resource: &Resource<'_>, ctrl: &Value, data: &Value) -> Result<Vec<Mesh>> {
  let masks = data.get("m_refLODGroupMasks").and_then(Value::as_array);
  array(ctrl, "embedded_meshes")?
    .iter()
    .map(|entry| {
      let block = field(entry, "m_nDataBlock")?;
      let mesh = kv3::decode(
        resource
          .get_block_by_index(block)
          .ok_or("Missing mesh block")?,
      )?;
      let bones = match mesh.get("m_skeleton") {
        Some(skeleton) => array(skeleton, "m_bones")?
          .iter()
          .map(|bone| {
            bone
              .get("m_boneName")
              .and_then(Value::as_str)
              .map(str::to_string)
              .ok_or_else(|| "Missing bone name".into())
          })
          .collect::<Result<Vec<_>>>()?,
        None => Vec::new(),
      };
      let mut materials = Vec::new();
      for scene in array(&mesh, "m_sceneObjects")? {
        for call in array(scene, "m_drawCalls")? {
          let material = call
            .get("m_material")
            .and_then(Value::as_str)
            .ok_or("Missing draw material")?;
          materials.push(material.trim_end_matches("_c").to_ascii_lowercase());
        }
      }
      materials.sort();
      materials.dedup();
      let lods = match masks {
        Some(masks) => integer(
          masks
            .get(field(entry, "m_nMeshIndex")?)
            .ok_or("Missing LOD mask")?,
        )?,
        None => 0,
      };
      Ok(Mesh {
        lods,
        bones,
        materials,
      })
    })
    .collect()
}

fn verify_export(
  input: &Resource<'_>,
  output: &[u8],
  meshes: &[Mesh],
  targets: &[(usize, Option<usize>)],
  material: &str,
) -> Result<()> {
  let after = Resource::parse(output)?;
  for (i, block) in input.blocks().iter().enumerate() {
    if !matches!(&block.kind, b"DATA" | b"CTRL" | b"RERL")
      && input.get_block_by_index(i) != after.get_block_by_index(i)
    {
      return Err(format!("Changed protected block {i}").into());
    }
  }
  let ctrl = kv3::decode(after.find_block(*b"CTRL").ok_or("Missing patched CTRL")?)?;
  let entries = array(&ctrl, "embedded_meshes")?;
  if entries.len() != meshes.len() + 1 {
    return Err("Sticker must add exactly one independent mesh".into());
  }
  let added = entries.last().ok_or("Missing patch mesh")?;
  let data = kv3::decode(
    after
      .get_block_by_index(field(added, "m_nDataBlock")?)
      .ok_or("Missing patch MDAT")?,
  )?;
  let scenes = array(&data, "m_sceneObjects")?;
  if scenes.len() != 1 || array(&scenes[0], "m_drawCalls")?.len() != 1 {
    return Err("Sticker mesh must contain exactly one draw".into());
  }
  if array(&scenes[0], "m_drawCalls")?[0]
    .get("m_material")
    .and_then(Value::as_str)
    != Some("materials/dmm_audit_patch.vmat")
  {
    return Err("Wrong sticker material".into());
  }
  let model = kv3::decode(after.data_block()?)?;
  let lods = integer(
    array(&model, "m_refLODGroupMasks")?
      .get(field(added, "m_nMeshIndex")?)
      .ok_or("Missing patch LOD mask")?,
  )?;
  let expected_lods = meshes
    .iter()
    .filter(|mesh| mesh.materials.iter().any(|m| m == material))
    .fold(0, |mask, mesh| mask | mesh.lods);
  if lods != expected_lods {
    return Err("Sticker does not cover the complete material LOD mask".into());
  }
  let buffers = array(added, "m_vertexBuffers")?;
  if buffers.len() != 1 {
    return Err("Sticker contains inherited host geometry buffers".into());
  }
  let vertices = after
    .get_block_by_index(field(&buffers[0], "m_nBlockIndex")?)
    .ok_or("Missing vertices")?;
  let stride = field(&buffers[0], "m_nElementSizeInBytes")?;
  if vertices.len() != stride * 3 {
    return Err("Invalid patch buffer length".into());
  }
  if let Some(bone) = targets[0].1 {
    for vertex in vertices.chunks_exact(stride) {
      let bound = if bone > 255 {
        usize::from(u16::from_le_bytes([vertex[48], vertex[49]]))
      } else {
        usize::from(vertex[48])
      };
      if bound != bone {
        return Err("Wrong palette-local attachment bone".into());
      }
    }
  }
  Ok(())
}

fn audit(archive: &VpkArchive, model: &str, decode: bool) -> Result<ModelReport> {
  let bytes = archive.extract_entry(model)?;
  let resource = Resource::parse(&bytes)?;
  let mut report = ModelReport {
    model: model.into(),
    meshes: 0,
    bindings: 0,
    export_patterns: 0,
    exported: 0,
    decoded: false,
    unsupported: None,
    lod_gaps: Vec::new(),
  };
  let Some(ctrl) = resource.find_block(*b"CTRL") else {
    report.unsupported = Some("No embedded mesh registry".into());
    return Ok(report);
  };
  let ctrl = kv3::decode(ctrl)?;
  let entries = array(&ctrl, "embedded_meshes")?;
  if entries.is_empty()
    || entries
      .iter()
      .any(|entry| entry.get("m_nDataBlock").is_none())
  {
    report.unsupported =
      Some("Legacy VBIB or external meshes; modern MVTX attachment export required".into());
    return Ok(report);
  }
  let end = resource
    .blocks()
    .iter()
    .map(|block| block.offset as usize + block.size as usize)
    .max()
    .unwrap_or(0);
  if bytes[end..].len() > 15 || bytes[end..].iter().any(|b| *b != 0) {
    report.unsupported = Some("External model stream data".into());
    return Ok(report);
  }
  let data = kv3::decode(resource.data_block()?)?;
  let meshes = inspect(&resource, &ctrl, &data)?;
  report.meshes = meshes.len();
  let mut bindings = BTreeMap::<(String, String), Vec<(usize, Option<usize>)>>::new();
  for (i, mesh) in meshes.iter().enumerate() {
    for material in &mesh.materials {
      if mesh.bones.is_empty() {
        bindings
          .entry((material.clone(), String::new()))
          .or_default()
          .push((i, None));
      }
      for (bi, bone) in mesh.bones.iter().enumerate() {
        bindings
          .entry((material.clone(), bone.clone()))
          .or_default()
          .push((i, Some(bi)));
      }
    }
  }
  report.bindings = bindings.len();
  let mut patterns = BTreeMap::new();
  for ((material, bone), targets) in bindings {
    let material_lods = meshes
      .iter()
      .filter(|mesh| mesh.materials.contains(&material))
      .fold(0, |mask, mesh| mask | mesh.lods);
    let attached_lods = targets
      .iter()
      .fold(0, |mask, (i, _)| mask | meshes[*i].lods);
    let missing = material_lods & !attached_lods;
    if missing != 0 {
      report.lod_gaps.push(LodGap {
        material: material.clone(),
        bone: bone.clone(),
        missing_lod_mask: missing,
      });
    }
    let signature = targets
      .iter()
      .map(|(i, bone)| (*i, bone.map(|b| b > 255)))
      .collect::<Vec<_>>();
    patterns
      .entry((material.clone(), signature))
      .or_insert((material, bone, targets, missing));
  }
  report.export_patterns = patterns.len();
  let vertices = [[0., 0., 0.], [1., 0., 0.], [0., 1., 0.]].map(|position| PatchVertex {
    position,
    normal: [0., 0., 1.],
    tangent: [1., 0., 0., 1.],
    uv: [0., 0.],
  });
  for (material, bone, targets, _) in patterns.into_values() {
    let result = attach(
      &bytes,
      &[AttachedPatch {
        host_material: &material,
        material: "materials/dmm_audit_patch.vmat",
        bone: &bone,
        vertices: &vertices,
        indices: &[0, 1, 2],
        skin: None,
      }],
    );
    let output = result?;
    verify_export(&resource, &output, &meshes, &targets, &material)?;
    if decode && !report.decoded {
      let decoded = source2_model::vmesh::decode_embedded_model_glb_from_resource(
        &source2_model::Resource::parse(output)?,
        &[],
        archive,
      )?;
      if decoded.vertex_count == 0 || decoded.index_count == 0 {
        return Err("Patched preview has no geometry".into());
      }
      report.decoded = true;
    }
    report.exported += 1;
  }
  Ok(report)
}

fn main() -> Result<()> {
  let args = Args::parse();
  let archive = VpkArchive::open(&args.archive)?;
  let mut paths = archive
    .list_entries()
    .into_iter()
    .filter(|path| {
      path.ends_with(".vmdl_c")
        && [
          "models/heroes/",
          "models/heroes_wip/",
          "models/heroes_staging/",
        ]
        .iter()
        .any(|prefix| path.starts_with(prefix))
        && args
          .filter
          .as_ref()
          .is_none_or(|filter| path.contains(filter))
    })
    .collect::<Vec<_>>();
  paths.sort();
  if paths.is_empty() {
    return Err("No hero models matched".into());
  }
  let mut report = Report {
    models: Vec::new(),
    failures: Vec::new(),
  };
  for path in paths {
    eprintln!("Checking {path}");
    match audit(&archive, &path, args.decode) {
      Ok(model) => report.models.push(model),
      Err(error) => report.failures.push(Failure {
        model: path,
        error: error.to_string(),
      }),
    }
  }
  fs::write(&args.report, serde_json::to_vec_pretty(&report)?)?;
  let supported = report
    .models
    .iter()
    .filter(|model| model.unsupported.is_none())
    .count();
  let exported = report
    .models
    .iter()
    .map(|model| model.exported)
    .sum::<usize>();
  let gaps = report
    .models
    .iter()
    .map(|model| model.lod_gaps.len())
    .sum::<usize>();
  println!(
    "{supported} modern models; {exported} exported patterns; {gaps} bone/material LOD gaps retained by sticker meshes; {} unsupported models; {} failures. Report {}",
    report.models.len() - supported,
    report.failures.len(),
    args.report.display()
  );
  if !report.failures.is_empty() {
    return Err("Model attachment audit failed; inspect the report".into());
  }
  Ok(())
}
