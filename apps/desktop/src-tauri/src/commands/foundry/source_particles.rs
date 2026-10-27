//! Compiled particle graphs and their dependencies, read from the skin before the game.
use std::collections::{BTreeMap, BTreeSet};

use base64::{Engine, engine::general_purpose::STANDARD};
use image::ImageEncoder;
use serde::{Deserialize, Serialize};
use source2_model::{kv3::KvValue, resource::Resource, vpk_extract::VpkArchive, vtex::VtexHeader};
use ts_rs::TS;

use super::ability_vfx::PreviewAbilityEffect;
use super::animation::{archives_with_overlay, invalid as msg};
use super::particles::effect_slot;
use crate::errors::Error;

#[derive(Deserialize, TS)]
#[ts(export)]
pub struct ParticleSourceDraft {
  pub path: String,
  pub text: String,
}

#[derive(Default, Deserialize, TS)]
#[serde(default, rename_all = "camelCase")]
#[ts(export)]
pub struct ParticleGraphOptions {
  pub additional_roots: Vec<String>,
  pub source_addon_id: Option<String>,
  pub source_files: Vec<ParticleSourceDraft>,
}

fn particle_source(
  path: &str,
  drafts: &BTreeMap<String, KvValue>,
  content: Option<&std::path::Path>,
) -> Result<Option<KvValue>, Error> {
  let path = path.trim_end_matches("_c");
  super::super::modding_workspace::relative(path, false)?;
  if !path.ends_with(".vpcf") {
    return Err(msg("Select a particle source file"));
  }
  if let Some(value) = drafts.get(path) {
    return Ok(Some(value.clone()));
  }
  if let Some(content) = content {
    let file = super::super::modding_workspace::contained(content, path)?;
    if file.is_file() {
      if std::fs::metadata(&file)?.len() > 4 * 1024 * 1024 {
        return Err(msg("Particle source exceeds 4 MB"));
      }
      return super::super::modding_source::tree(&std::fs::read_to_string(file)?).map(Some);
    }
  }
  Ok(None)
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(untagged)]
#[ts(export)]
pub enum ParticleValue {
  Null,
  Bool(bool),
  Number(f64),
  String(String),
  Array(Vec<ParticleValue>),
  Object(BTreeMap<String, ParticleValue>),
}
impl From<&KvValue> for ParticleValue {
  fn from(value: &KvValue) -> Self {
    match value {
      KvValue::Null | KvValue::Binary(_) => Self::Null,
      KvValue::Bool(v) => Self::Bool(*v),
      KvValue::Int(v) => Self::Number(*v as f64),
      KvValue::UInt(v) => Self::Number(*v as f64),
      KvValue::Float(v) => Self::Number(*v),
      KvValue::String(v) => Self::String(v.clone()),
      KvValue::Array(v) => Self::Array(v.iter().map(Self::from).collect()),
      KvValue::Object(v) => {
        Self::Object(v.iter().map(|(k, v)| (k.clone(), Self::from(v))).collect())
      }
    }
  }
}
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct ParticleSheetFrame {
  pub duration: f32,
  pub min: [f32; 2],
  pub max: [f32; 2],
}
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct ParticleTexture {
  pub path: String,
  pub data_url: String,
  pub sequences: Vec<Vec<ParticleSheetFrame>>,
}
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct FoundryParticleGraph {
  pub roots: Vec<String>,
  pub ambient_roots: Vec<String>,
  pub cast_roots: Vec<String>,
  pub release_roots: Vec<String>,
  pub ability: ParticleValue,
  pub ability_effects: Vec<PreviewAbilityEffect>,
  pub systems: BTreeMap<String, ParticleValue>,
  pub attachments: BTreeMap<String, ParticleValue>,
  pub textures: Vec<ParticleTexture>,
  pub models: Vec<String>,
  pub materials: BTreeMap<String, ParticleValue>,
  pub warnings: Vec<String>,
}
fn compiled(path: &str) -> String {
  if path.ends_with("_c") {
    path.to_owned()
  } else {
    format!("{path}_c")
  }
}
fn read(
  skin: &VpkArchive,
  base: &VpkArchive,
  core: Option<&VpkArchive>,
  path: &str,
) -> Result<Resource, Error> {
  let path = compiled(path);
  let bytes = skin
    .extract_entry_limited(&path, 64 * 1024 * 1024)
    .or_else(|_| base.extract_entry_limited(&path, 64 * 1024 * 1024))
    .or_else(|error| {
      core.map_or(Err(error), |core| {
        core.extract_entry_limited(&path, 64 * 1024 * 1024)
      })
    })
    .map_err(|e| msg(format!("{path}: {e}")))?;
  Resource::parse(bytes).map_err(|e| msg(e.to_string()))
}
pub(super) fn kv(
  skin: &VpkArchive,
  base: &VpkArchive,
  core: Option<&VpkArchive>,
  path: &str,
) -> Result<KvValue, Error> {
  let res = read(skin, base, core, path)?;
  let data = res
    .block_bytes("DATA")
    .ok_or_else(|| msg(format!("{path}: no DATA block")))?;
  source2_model::kv3::parse(data).map_err(|e| msg(e.to_string()))
}
fn references(value: &KvValue, out: &mut BTreeSet<String>) {
  match value {
    KvValue::String(path)
      if [".vtex", ".vmdl", ".vmat"]
        .iter()
        .any(|ext| path.trim_end_matches("_c").ends_with(ext)) =>
    {
      out.insert(path.trim_end_matches("_c").to_owned());
    }
    KvValue::Array(values) => {
      for value in values {
        references(value, out);
      }
    }
    KvValue::Object(values) => {
      if let Some(class) = values.get("_class").and_then(KvValue::as_string)
        && [
          "C_OP_RenderSprites",
          "C_OP_RenderTrails",
          "C_OP_RenderRopes",
        ]
        .contains(&class)
      {
        let direct = values
          .get("m_hTexture")
          .and_then(KvValue::as_string)
          .is_some_and(|path| !path.is_empty());
        let layered = values
          .get("m_vecTexturesInput")
          .and_then(KvValue::as_array)
          .is_some_and(|layers| {
            layers.iter().any(|layer| {
              layer.get("m_bEnabled").and_then(KvValue::as_bool) != Some(false)
                && !matches!(
                  layer.get("m_nTextureType").and_then(KvValue::as_string),
                  Some("SPRITECARD_TEXTURE_NORMALMAP" | "SPRITECARD_TEXTURE_ANIMMOTIONVEC")
                )
                && (layer
                  .get("m_hTexture")
                  .and_then(KvValue::as_string)
                  .is_some_and(|path| !path.is_empty())
                  || layer
                    .get("m_bReplaceTextureWithGradient")
                    .and_then(KvValue::as_bool)
                    == Some(true))
            })
          });
        if !direct && !layered {
          out.insert(
            if class == "C_OP_RenderSprites" {
              "materials/particle/base_sprite.vtex"
            } else {
              "materials/particle/base_trail.vtex"
            }
            .into(),
          );
        }
      }
      for (key, value) in values {
        if key != "m_controlPointConfigurations" && key != "m_previewState" {
          references(value, out);
        }
      }
    }
    _ => {}
  }
}
fn texture(
  skin: &VpkArchive,
  base: &VpkArchive,
  core: Option<&VpkArchive>,
  path: &str,
) -> Result<ParticleTexture, Error> {
  let res = read(skin, base, core, path)?;
  let header = VtexHeader::parse(&res).map_err(|e| msg(e.to_string()))?;
  let sequences = header
    .sprite_sheet_sequences(&res.data)
    .map_err(|e| msg(e.to_string()))?
    .into_iter()
    .map(|seq| {
      seq
        .frames
        .into_iter()
        .map(|frame| ParticleSheetFrame {
          duration: frame.display_time,
          min: frame.cropped_min,
          max: frame.cropped_max,
        })
        .collect()
    })
    .collect();
  let decoded = header
    .decode_preview(&res.data, 1024)
    .map_err(|e| msg(e.to_string()))?;
  let mut png = Vec::new();
  image::codecs::png::PngEncoder::new(&mut png)
    .write_image(
      &decoded.rgba,
      decoded.width,
      decoded.height,
      image::ExtendedColorType::Rgba8,
    )
    .map_err(|e| msg(e.to_string()))?;
  Ok(ParticleTexture {
    path: path.to_owned(),
    data_url: format!("data:image/png;base64,{}", STANDARD.encode(png)),
    sequences,
  })
}
fn attachments(
  skin: &VpkArchive,
  base: &VpkArchive,
  model: &str,
) -> BTreeMap<String, ParticleValue> {
  let mut out = BTreeMap::new();
  // Base first; a replacement mesh can override an attachment's bone and local transform.
  for archive in [base, skin] {
    let Ok(res) = read(archive, base, None, model) else {
      continue;
    };
    for block in &res.blocks {
      if block.name != "MDAT" && block.name != "DATA" {
        continue;
      }
      let Some(bytes) = res.data.get(block.offset..block.offset + block.size) else {
        continue;
      };
      let Ok(data) = source2_model::kv3::parse(bytes) else {
        continue;
      };
      let Some(list) = data.get("m_attachments").and_then(KvValue::as_array) else {
        continue;
      };
      for item in list {
        let value = item.get("value").unwrap_or(item);
        if let Some(name) = value.get("m_name").and_then(KvValue::as_string) {
          out.insert(name.to_owned(), ParticleValue::from(value));
        }
      }
    }
  }
  out
}

#[tauri::command]
pub async fn foundry_particle_graph(
  app: crate::app_runtime::AppHandle,
  file_path: String,
  entry_path: String,
  overlay_root: Option<String>,
  roots: Vec<String>,
  ability_name: Option<String>,
  options: Option<ParticleGraphOptions>,
) -> Result<FoundryParticleGraph, Error> {
  let ParticleGraphOptions {
    additional_roots,
    source_addon_id,
    source_files,
  } = options.unwrap_or_default();
  let content = source_addon_id
    .map(|id| {
      super::super::modding_workspace::resolve(&app, &id)
        .map(|addon| std::path::PathBuf::from(addon.content_path))
    })
    .transpose()?;
  if source_files.len() > 8192
    || source_files
      .iter()
      .map(|file| file.text.len())
      .sum::<usize>()
      > 64 * 1024 * 1024
  {
    return Err(msg("Particle preview sources exceed 64 MB"));
  }
  let permit = effect_slot().clone().acquire_owned().await.map_err(msg)?;
  tauri::async_runtime::spawn_blocking(move || {
    let _permit = permit;
    let standalone = entry_path.ends_with(".vpcf_c");
    if !source_files.is_empty() && (content.is_none() || !standalone) {
      return Err(msg("Draft previews require an addon particle source"));
    }
    let mut drafts = BTreeMap::new();
    for file in source_files {
      super::super::modding_workspace::relative(&file.path, false)?;
      if !file.path.ends_with(".vpcf") || file.text.len() > 4 * 1024 * 1024 {
        return Err(msg("Invalid particle preview source"));
      }
      drafts.insert(file.path, super::super::modding_source::tree(&file.text)?);
    }
    if (!entry_path.ends_with(".vmdl_c") && !standalone) || entry_path.contains("..") {
      return Err(msg("Select a compiled model or particle system"));
    }
    if roots.len() > 8
      || additional_roots.len() > 8
      || roots
        .iter()
        .chain(&additional_roots)
        .any(|p| !p.starts_with("particles/") || !p.ends_with(".vpcf") || p.contains(".."))
    {
      return Err(msg("invalid particle roots"));
    }
    let (skin, base) = archives_with_overlay(&file_path, overlay_root.as_deref())?;
    let base = base.as_deref().unwrap_or(&skin);
    let core: Option<&VpkArchive> = None;
    let ability = ability_name.and_then(|name| {
      kv(&skin, base, core, "scripts/abilities.vdata_c")
        .ok()
        .and_then(|data| {
          data
            .get(&name)
            .or_else(|| data.get(&format!("citadel_ability_{name}")))
            .cloned()
        })
    });
    let caster = ability
      .as_ref()
      .map(super::ability_vfx::ability_caster_particles)
      .unwrap_or_default();
    let mut ambient_roots = if standalone {
      vec![entry_path.trim_end_matches("_c").to_owned()]
    } else if roots.is_empty() {
      let resource = read(&skin, base, core, &entry_path)?;
      source2_model::particles::discover_model_preview_particles(&skin, &resource, &entry_path)
        .map_err(msg)?
        .paths
    } else {
      roots
    };
    ambient_roots.extend(additional_roots);
    ambient_roots.sort();
    ambient_roots.dedup();
    let roots: Vec<_> = ambient_roots
      .iter()
      .chain(&caster.cast)
      .chain(&caster.release)
      .cloned()
      .collect::<BTreeSet<_>>()
      .into_iter()
      .collect();
    let mut graph = FoundryParticleGraph {
      ability: ability
        .as_ref()
        .map(ParticleValue::from)
        .unwrap_or(ParticleValue::Null),
      ability_effects: ability
        .as_ref()
        .map(super::ability_vfx::discover_ability_effects)
        .unwrap_or_default(),
      ambient_roots,
      cast_roots: caster.cast,
      release_roots: caster.release,
      attachments: if standalone {
        BTreeMap::new()
      } else {
        attachments(&skin, base, &entry_path)
      },
      roots: roots.clone(),
      systems: BTreeMap::new(),
      textures: Vec::new(),
      models: Vec::new(),
      materials: BTreeMap::new(),
      warnings: Vec::new(),
    };
    let mut assets = BTreeSet::new();
    if !standalone {
      let model_resource = read(&skin, base, core, &entry_path)?;
      let mut model_materials: BTreeSet<_> =
        source2_model::vmesh::referenced_materials(&model_resource)
          .into_iter()
          .collect();
      let meshes = source2_model::vmesh::referenced_meshes(&model_resource).map_err(msg)?;
      let shown = source2_model::vmesh::preview_mesh_selection(&model_resource, meshes.len());
      for (index, mesh) in meshes.into_iter().enumerate() {
        if !shown[index] {
          continue;
        }
        match read(&skin, base, core, &mesh) {
          Ok(resource) => {
            model_materials.extend(source2_model::vmesh::referenced_materials(&resource))
          }
          Err(error) => graph.warnings.push(format!("{mesh}: {error}")),
        }
      }
      for path in model_materials {
        if let Ok(data) = kv(&skin, base, core, &path) {
          let animated = data
            .get("m_intParams")
            .and_then(KvValue::as_array)
            .is_some_and(|params| {
              params.iter().any(|p| {
                p.get("m_name").and_then(KvValue::as_string) == Some("F_JITTER_VERTICES")
                  && p.get("m_nValue").and_then(KvValue::as_f32).unwrap_or(0.0) > 0.0
              })
            })
            || data
              .get("m_vectorParams")
              .and_then(KvValue::as_array)
              .is_some_and(|params| {
                params.iter().any(|p| {
                  p.get("m_name")
                    .and_then(KvValue::as_string)
                    .is_some_and(|name| name.contains("ScrollSpeed"))
                    && p
                      .get("m_value")
                      .and_then(KvValue::as_array)
                      .is_some_and(|values| {
                        values
                          .iter()
                          .take(2)
                          .any(|v| v.as_f32().unwrap_or(0.0) != 0.0)
                      })
                })
              });
          if animated {
            references(&data, &mut assets);
          }
          graph.materials.insert(
            path.trim_end_matches("_c").to_owned(),
            ParticleValue::from(&data),
          );
        } else {
          graph
            .warnings
            .push(format!("Model material unavailable: {path}"));
        }
      }
    }
    let mut pending = roots;
    let mut seen = BTreeSet::new();
    while let Some(path) = pending.pop() {
      if !seen.insert(path.clone()) {
        continue;
      }
      if seen.len() > 128 {
        return Err(msg("particle graph exceeds 128 systems"));
      }
      let data = match particle_source(&path, &drafts, content.as_deref())
        .and_then(|source| source.map_or_else(|| kv(&skin, base, core, &path), Ok))
      {
        Ok(v) => v,
        Err(e) => {
          graph.warnings.push(format!("{path}: {e}"));
          continue;
        }
      };
      references(&data, &mut assets);
      if let Some(children) = data.get("m_Children").and_then(KvValue::as_array) {
        for child in children {
          if let Some(path) = child.get("m_ChildRef").and_then(KvValue::as_string) {
            pending.push(path.to_owned());
          }
        }
      }
      graph.systems.insert(path, ParticleValue::from(&data));
    }
    let mut material_queue: Vec<_> = assets
      .iter()
      .filter(|p| p.ends_with(".vmat"))
      .cloned()
      .collect();
    let mut material_seen = BTreeSet::new();
    while let Some(path) = material_queue.pop() {
      if !material_seen.insert(path.clone()) {
        continue;
      }
      if material_seen.len() > 128 {
        return Err(msg("particle materials exceed 128 dependencies"));
      }
      match kv(&skin, base, core, &path) {
        Ok(data) => {
          references(&data, &mut assets);
          material_queue.extend(
            assets
              .iter()
              .filter(|p| p.ends_with(".vmat") && !material_seen.contains(*p))
              .cloned(),
          );
          graph.materials.insert(path, ParticleValue::from(&data));
        }
        Err(e) => graph.warnings.push(format!("{path}: {e}")),
      }
    }
    if assets.len() > 128 {
      return Err(msg("particle graph exceeds 128 dependencies"));
    }
    for path in assets {
      if path.ends_with(".vmdl") {
        graph.models.push(path);
      } else if path.ends_with(".vtex") {
        match texture(&skin, base, core, &path) {
          Ok(texture) => {
            let total: usize = graph.textures.iter().map(|t| t.data_url.len()).sum();
            if total + texture.data_url.len() > 64 * 1024 * 1024 {
              return Err(msg("particle textures exceed the 64 MB preview limit"));
            }
            graph.textures.push(texture);
          }
          Err(e) => graph.warnings.push(format!("{path}: {e}")),
        }
      }
    }
    Ok(graph)
  })
  .await
  .map_err(msg)?
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn draft_sources_override_disk_and_new_children_preview_without_compiled_files() {
    let root = tempfile::tempdir().unwrap();
    std::fs::create_dir(root.path().join("particles")).unwrap();
    std::fs::write(
      root.path().join("particles/root.vpcf"),
      "{m_ConstantColor=[255,0,0]}",
    )
    .unwrap();
    std::fs::write(
      root.path().join("particles/child.vpcf"),
      "{m_ConstantColor=[0,255,0]}",
    )
    .unwrap();
    let original = std::fs::read(root.path().join("particles/root.vpcf")).unwrap();
    let drafts = BTreeMap::from([(
      "particles/root.vpcf".into(),
      super::super::super::modding_source::tree("{m_ConstantColor=[0,0,255]}").unwrap(),
    )]);
    let draft = particle_source("particles/root.vpcf_c", &drafts, Some(root.path()))
      .unwrap()
      .unwrap()
      .to_json();
    assert_eq!(
      draft["m_ConstantColor"],
      serde_json::json!([0.0, 0.0, 255.0])
    );
    assert!(
      particle_source("particles/child.vpcf", &drafts, Some(root.path()))
        .unwrap()
        .is_some()
    );
    assert!(
      particle_source("particles/game_only.vpcf", &drafts, Some(root.path()))
        .unwrap()
        .is_none()
    );
    assert!(particle_source("../outside.vpcf", &drafts, Some(root.path())).is_err());
    assert_eq!(
      std::fs::read(root.path().join("particles/root.vpcf")).unwrap(),
      original
    );
    assert!(!root.path().join("particles/root.vpcf_c").exists());
  }

  #[test]
  fn resource_names_compile_once() {
    assert_eq!(compiled("particles/a.vpcf"), "particles/a.vpcf_c");
    assert_eq!(compiled("particles/a.vpcf_c"), "particles/a.vpcf_c");
  }

  #[test]
  fn includes_engine_texture_defaults_and_normalizes_compiled_dependencies() {
    let data = KvValue::Object(BTreeMap::from([
      (
        "_class".into(),
        KvValue::String("C_OP_RenderSprites".into()),
      ),
      (
        "material".into(),
        KvValue::String("materials/new.vmat_c".into()),
      ),
    ]));
    let mut dependencies = BTreeSet::new();
    references(&data, &mut dependencies);
    assert!(dependencies.contains("materials/particle/base_sprite.vtex"));
    assert!(dependencies.contains("materials/new.vmat"));
  }

  #[test]
  fn gradient_renderers_do_not_require_a_fallback_texture() {
    let data = KvValue::Object(BTreeMap::from([
      (
        "_class".into(),
        KvValue::String("C_OP_RenderSprites".into()),
      ),
      (
        "m_vecTexturesInput".into(),
        KvValue::Array(vec![KvValue::Object(BTreeMap::from([(
          "m_bReplaceTextureWithGradient".into(),
          KvValue::Bool(true),
        )]))]),
      ),
    ]));
    let mut dependencies = BTreeSet::new();
    references(&data, &mut dependencies);
    assert!(dependencies.is_empty());
  }

  #[test]
  fn dependencies_exclude_editor_preview_models() {
    let value = KvValue::Object(BTreeMap::from([
      (
        "m_controlPointConfigurations".into(),
        KvValue::Array(vec![KvValue::String("models/editor.vmdl".into())]),
      ),
      (
        "m_Renderers".into(),
        KvValue::Array(vec![
          KvValue::String("models/real.vmdl".into()),
          KvValue::String("materials/real.vtex".into()),
          KvValue::String("materials/real.vtex".into()),
        ]),
      ),
    ]));
    let mut dependencies = BTreeSet::new();
    references(&value, &mut dependencies);
    assert_eq!(
      dependencies,
      BTreeSet::from([
        "models/real.vmdl".to_owned(),
        "materials/real.vtex".to_owned()
      ])
    );
  }

  #[test]
  fn typed_values_keep_particle_input_structure() {
    let value = KvValue::Object(BTreeMap::from([(
      "m_InputValue".into(),
      KvValue::Object(BTreeMap::from([
        ("m_flLiteralValue".into(), KvValue::Float(2.5)),
        ("m_nType".into(), KvValue::String("PF_TYPE_LITERAL".into())),
      ])),
    )]));
    let encoded = serde_json::to_value(ParticleValue::from(&value)).unwrap();
    assert_eq!(encoded["m_InputValue"]["m_flLiteralValue"], 2.5);
    assert_eq!(encoded["m_InputValue"]["m_nType"], "PF_TYPE_LITERAL");
    assert!(serde_json::to_value(ParticleValue::Null).unwrap().is_null());
  }
  #[test]
  fn game_mount_priority_is_skin_then_citadel_then_core() {
    let root = tempfile::tempdir().unwrap();
    let archive = |name: &str, marker: u8, shared: bool| {
      let source = root.path().join(name);
      std::fs::create_dir_all(&source).unwrap();
      let mut resource = vec![0u8; 17];
      resource[..4].copy_from_slice(&17u32.to_le_bytes());
      resource[4..6].copy_from_slice(&12u16.to_le_bytes());
      resource[8..12].copy_from_slice(&8u32.to_le_bytes());
      resource[16] = marker;
      std::fs::write(
        source.join(if shared {
          "shared.vpcf_c"
        } else {
          "other.vpcf_c"
        }),
        resource,
      )
      .unwrap();
      let path = root.path().join(format!("{name}.vpk"));
      vpkmanager::pack_directory(&source, &path).unwrap();
      VpkArchive::open(&path).unwrap()
    };
    let skin = archive("skin", 1, true);
    let base = archive("citadel", 2, true);
    let core = archive("core", 3, true);
    let absent = archive("absent", 0, false);
    assert_eq!(
      read(&skin, &base, Some(&core), "shared.vpcf").unwrap().data[16],
      1
    );
    assert_eq!(
      read(&absent, &base, Some(&core), "shared.vpcf")
        .unwrap()
        .data[16],
      2
    );
    assert_eq!(
      read(&absent, &absent, Some(&core), "shared.vpcf")
        .unwrap()
        .data[16],
      3
    );
    assert!(read(&absent, &absent, None, "shared.vpcf").is_err());
  }
}
