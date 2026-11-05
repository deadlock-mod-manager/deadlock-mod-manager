use std::{collections::BTreeMap, path::Path, sync::Arc};

use serde::Serialize;
use source2_model::kv3::KvValue;
use source2_model::{dmx::DmxModel, vpk_extract::VpkArchive};
use tauri::State;
use ts_rs::TS;

use super::{
  foundry::{FoundryModel, ModelAssets},
  modding_workspace::{ModdingHierarchy, contained},
};
use crate::{app_runtime::AppHandle, errors::Error};

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingSourceMesh {
  pub asset: FoundryModel,
  pub name: String,
  pub scale: f32,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingSourceModel {
  pub meshes: Vec<ModdingSourceMesh>,
  pub diagnostics: Vec<String>,
}

pub(super) struct Mesh {
  pub path: String,
  pub name: String,
  pub scale: f32,
}

enum Geometry {
  Dmx(DmxModel),
  Fbx(Vec<u8>),
}

fn material_remaps(
  value: &KvValue,
  output: &mut Vec<(String, String)>,
  depth: usize,
) -> Result<(), Error> {
  if depth > 64 {
    return Err(Error::InvalidInput(
      "ModelDoc nesting exceeds 64 levels".into(),
    ));
  }
  if value.get("_class").and_then(KvValue::as_string) == Some("DefaultMaterialGroup") {
    for remap in value
      .get("remaps")
      .and_then(KvValue::as_array)
      .into_iter()
      .flatten()
    {
      let from = remap.get("from").and_then(KvValue::as_string);
      let to = remap.get("to").and_then(KvValue::as_string);
      if let (Some(from), Some(to)) = (from, to) {
        let from = from.replace('\\', "/").to_ascii_lowercase();
        let to = to.replace('\\', "/").to_ascii_lowercase();
        super::modding_workspace::relative(&from, true)?;
        super::modding_workspace::relative(&to, false)?;
        output.push((from, to));
      }
    }
  }
  if let Some(children) = value.get("children").and_then(KvValue::as_array) {
    for child in children {
      material_remaps(child, output, depth + 1)?;
    }
  }
  Ok(())
}

pub(super) fn meshes(value: &KvValue, output: &mut Vec<Mesh>, depth: usize) -> Result<(), Error> {
  if depth > 64 {
    return Err(Error::InvalidInput(
      "ModelDoc nesting exceeds 64 levels".into(),
    ));
  }
  if value.get("_class").and_then(KvValue::as_string) == Some("RenderMeshFile") {
    let path = value
      .get("filename")
      .and_then(KvValue::as_string)
      .ok_or_else(|| Error::InvalidInput("RenderMeshFile has no filename".into()))?;
    let scale = value
      .get("import_scale")
      .and_then(KvValue::as_f32)
      .unwrap_or(1.0);
    if !scale.is_finite() || scale <= 0.0 || scale > 10000.0 {
      return Err(Error::InvalidInput("Invalid model import scale".into()));
    }
    output.push(Mesh {
      path: path.replace('\\', "/"),
      name: value
        .get("name")
        .and_then(KvValue::as_string)
        .unwrap_or(path)
        .into(),
      scale,
    });
  }
  if let Some(children) = value.get("children").and_then(KvValue::as_array) {
    for child in children {
      meshes(child, output, depth + 1)?;
    }
  }
  Ok(())
}

fn stage(
  root: &Path,
  path: &str,
  assets: &ModelAssets,
  archive: Option<&VpkArchive>,
  texture_side: u32,
  hidden: &[String],
) -> Result<ModdingSourceModel, Error> {
  let source = contained(root, path)?;
  if std::fs::metadata(&source)?.len() > 16 * 1024 * 1024 {
    return Err(Error::InvalidInput("ModelDoc source exceeds 16 MB".into()));
  }
  let tree = super::modding_source::tree(&std::fs::read_to_string(source)?)?;
  let mut references = Vec::new();
  meshes(tree.get("rootNode").unwrap_or(&tree), &mut references, 0)?;
  let mut remaps = Vec::new();
  material_remaps(tree.get("rootNode").unwrap_or(&tree), &mut remaps, 0)?;
  if references.is_empty() || references.len() > 64 {
    return Err(Error::InvalidInput(
      "Source preview needs 1–64 RenderMeshFile entries".into(),
    ));
  }
  let mut index: BTreeMap<String, Vec<String>> = BTreeMap::new();
  for file in super::modding_batch::files(root)? {
    index
      .entry(file.to_ascii_lowercase())
      .or_default()
      .push(file);
  }
  let mut result = ModdingSourceModel {
    meshes: Vec::new(),
    diagnostics: Vec::new(),
  };
  let staged = (|| {
    let mut size = 0u64;
    let mut sources = Vec::new();
    for mesh in references {
      super::modding_workspace::relative(&mesh.path, false)?;
      let dmx = mesh.path.to_ascii_lowercase().ends_with(".dmx");
      if !dmx && !mesh.path.to_ascii_lowercase().ends_with(".fbx") {
        result.diagnostics.push(format!(
          "Source mesh format is not supported: {}",
          mesh.path
        ));
        continue;
      }
      let key = mesh.path.to_ascii_lowercase();
      let candidates = index.get(&key).cloned().unwrap_or_else(|| {
        index
          .iter()
          .filter(|(path, _)| path.ends_with(&format!("/{key}")))
          .flat_map(|(_, paths)| paths.clone())
          .collect()
      });
      if candidates.is_empty() {
        result
          .diagnostics
          .push(format!("Missing source mesh: {}", mesh.path));
        continue;
      }
      if candidates.len() != 1 {
        result
          .diagnostics
          .push(format!("Ambiguous source mesh: {}", mesh.path));
        continue;
      }
      let file = contained(root, &candidates[0])?;
      size += std::fs::metadata(&file)?.len();
      if size > 256 * 1024 * 1024 {
        return Err(Error::InvalidInput(
          "Source model preview exceeds 256 MB".into(),
        ));
      }
      let bytes = std::fs::read(file)?;
      let geometry = if dmx {
        Geometry::Dmx(
          DmxModel::decode(&bytes)
            .map_err(|error| Error::InvalidInput(format!("{}: {error}", mesh.path)))?,
        )
      } else {
        Geometry::Fbx(bytes)
      };
      sources.push((mesh, geometry));
    }
    let mut materials = sources
      .iter()
      .flat_map(|(_, geometry)| match geometry {
        Geometry::Dmx(model) => model.materials(),
        Geometry::Fbx(_) => &[],
      })
      .map(|path| {
        remaps
          .iter()
          .find(|(from, _)| from == path)
          .map_or(path.clone(), |(_, to)| to.clone())
      })
      .collect::<Vec<_>>();
    materials.sort();
    materials.dedup();
    if materials.len() > 128 {
      return Err(Error::InvalidInput(
        "Source preview exceeds 128 materials".into(),
      ));
    }
    materials.retain(|path| {
      if super::modding_workspace::relative(path, false).is_ok() {
        return true;
      }
      result
        .diagnostics
        .push(format!("Unsupported material path: {path}"));
      false
    });
    if materials
      .iter()
      .any(|path| index.contains_key(path.strip_suffix("_c").unwrap_or(path)))
    {
      result.diagnostics.push("Source material edits use the last compiled resources. Compile the addon to update those materials.".into());
    }
    let textures = archive
      .map(|archive| source2_model::decode_referenced_materials(archive, &materials, texture_side))
      .unwrap_or_default();
    for path in &materials {
      let compiled = if path.ends_with(".vmat") {
        format!("{path}_c")
      } else {
        path.clone()
      };
      if !textures
        .iter()
        .any(|texture| texture.material.as_deref() == Some(&compiled))
      {
        result.diagnostics.push(format!(
          "Material unavailable; showing untextured geometry: {path}"
        ));
      }
    }
    let mut output_bytes = 0;
    for (mesh, geometry) in sources {
      let asset = match geometry {
        Geometry::Dmx(mut model) => {
          if !model.hide_materials(hidden, &remaps) {
            continue;
          }
          let model = model
            .into_glb(&textures, &remaps)
            .map_err(|error| Error::InvalidInput(error.to_string()))?;
          output_bytes += model.glb.len();
          if output_bytes > 256 * 1024 * 1024 {
            return Err(Error::InvalidInput(
              "Source preview artifacts exceed 256 MB".into(),
            ));
          }
          assets.publish(&model.glb, model.vertex_count, model.index_count)?
        }
        Geometry::Fbx(bytes) => assets.publish_source(&bytes)?,
      };
      result.meshes.push(ModdingSourceMesh {
        asset,
        name: mesh.name,
        scale: mesh.scale,
      });
    }
    if result.meshes.is_empty() {
      return Err(Error::InvalidInput(format!(
        "No supported source geometry: {}",
        result.diagnostics.join("; ")
      )));
    }
    Ok(())
  })();
  if let Err(error) = staged {
    for mesh in &result.meshes {
      let _ = assets.release(&mesh.asset.asset_id);
    }
    return Err(error);
  }
  Ok(result)
}

#[tauri::command]
pub async fn preview_modding_source_model(
  app: AppHandle,
  assets: State<'_, Arc<ModelAssets>>,
  request_id: String,
  addon_id: String,
  path: String,
  texture_side: Option<u32>,
) -> Result<ModdingSourceModel, Error> {
  if !path.to_ascii_lowercase().ends_with(".vmdl") {
    return Err(Error::InvalidInput("Select a source VMDL".into()));
  }
  let addon = super::modding_local::resolve_read(&app, &addon_id)?;
  let root = addon.root(ModdingHierarchy::Content);
  let assets = assets.inner().clone();
  let job = assets.start_job(request_id)?;
  tauri::async_runtime::spawn_blocking(move || {
    job.check()?;
    let archive = if Path::new(&addon.archive_path).is_file() {
      Some(super::foundry::open_archive(
        Path::new(&addon.archive_path),
        Some(Path::new(&addon.game_path)),
      )?)
    } else {
      None
    };
    let result = stage(
      &root,
      &path,
      &assets,
      archive.as_deref(),
      texture_side.unwrap_or(1024),
      &super::modding_model_edit::hidden_materials(&addon, &path)?,
    )?;
    if let Err(error) = job.check() {
      for mesh in &result.meshes {
        let _ = assets.release(&mesh.asset.asset_id);
      }
      return Err(error);
    }
    Ok(result)
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn only_default_material_remaps_apply_and_escaping_targets_are_rejected() {
    let tree = super::super::modding_source::tree(r#"{children=[{_class="MaterialGroup" remaps=[{from="materials/red.vmat" to="materials/invisible.vmat"}]} {_class="DefaultMaterialGroup" remaps=[{from="Materials/RED.vmat" to="materials/green.vmat"}]}]}"#).unwrap();
    let mut remaps = Vec::new();
    material_remaps(&tree, &mut remaps, 0).unwrap();
    assert_eq!(
      remaps,
      vec![("materials/red.vmat".into(), "materials/green.vmat".into())]
    );
    let tree = super::super::modding_source::tree(
      r#"{_class="DefaultMaterialGroup" remaps=[{from="red.vmat" to="../outside.vmat"}]}"#,
    )
    .unwrap();
    assert!(material_remaps(&tree, &mut Vec::new(), 0).is_err());
  }
  #[test]
  fn unavailable_materials_are_reported_while_source_geometry_still_opens() {
    let root = tempfile::tempdir().unwrap();
    std::fs::write(
      root.path().join("body.dmx"),
      include_bytes!(
        "../../../../../packages/source2-model/tests/fixtures/source-materials-binary9.dmx"
      ),
    )
    .unwrap();
    std::fs::write(root.path().join("source.vmdl"), document("body.dmx")).unwrap();
    let assets = ModelAssets::open().unwrap();
    let model = stage(root.path(), "source.vmdl", &assets, None, 256, &[]).unwrap();
    assert_eq!(model.meshes.len(), 1);
    assert_eq!(model.diagnostics.len(), 2);
    assert!(
      model
        .diagnostics
        .iter()
        .all(|message| message.contains("Material unavailable"))
    );
    assets.release(&model.meshes[0].asset.asset_id).unwrap();
  }
  #[test]
  fn reads_mesh_references_and_scales_without_compiled_files() {
    let tree = super::super::modding_source::tree(r#"{rootNode={_class="RootNode" children=[{_class="RenderMeshList" children=[{_class="RenderMeshFile" name="body" filename="models/body.fbx" import_scale=0.4}]}]}}"#).unwrap();
    let mut output = Vec::new();
    meshes(tree.get("rootNode").unwrap(), &mut output, 0).unwrap();
    assert_eq!(output.len(), 1);
    assert_eq!(output[0].path, "models/body.fbx");
    assert_eq!(output[0].scale, 0.4);
  }
  #[test]
  fn source_vmdl_decodes_dmx_without_a_compiled_model_or_external_tools() {
    let root = tempfile::tempdir().unwrap();
    std::fs::create_dir(root.path().join("models")).unwrap();
    let bytes = include_bytes!(
      "../../../../../packages/source2-model/tests/fixtures/source-quad-binary9.dmx"
    );
    std::fs::write(root.path().join("models/Body.DMX"), bytes).unwrap();
    std::fs::write(root.path().join("source.vmdl"), document("models/body.dmx")).unwrap();
    let assets = ModelAssets::open().unwrap();
    let result = stage(root.path(), "source.vmdl", &assets, None, 1024, &[]).unwrap();
    assert_eq!(result.meshes.len(), 1);
    let mesh = &result.meshes[0];
    assert_eq!(mesh.scale, 0.4);
    assert_eq!((mesh.asset.vertex_count, mesh.asset.index_count), (4, 6));
    assert!(mesh.asset.file_path.ends_with(".glb"));
    assert_eq!(&std::fs::read(&mesh.asset.file_path).unwrap()[..4], b"glTF");
    assert_eq!(
      std::fs::read(root.path().join("models/Body.DMX")).unwrap(),
      bytes
    );
    assert!(!root.path().join("game").exists());
    assets.release(&mesh.asset.asset_id).unwrap();
  }
  fn document(mesh: &str) -> String {
    format!(
      r#"{{rootNode={{_class="RootNode" children=[{{_class="RenderMeshFile" name="body" filename="{mesh}" import_scale=0.4}}]}}}}"#
    )
  }
  #[test]
  fn stages_case_insensitive_source_meshes_without_mutating_sources_or_creating_game_assets() {
    let root = tempfile::tempdir().unwrap();
    std::fs::create_dir(root.path().join("models")).unwrap();
    std::fs::write(root.path().join("models/Body.FBX"), b"source geometry").unwrap();
    let source = document("models/body.fbx");
    std::fs::write(root.path().join("source.vmdl"), &source).unwrap();
    let assets = ModelAssets::open().unwrap();
    let model = stage(root.path(), "source.vmdl", &assets, None, 1024, &[]).unwrap();
    assert_eq!(model.meshes.len(), 1);
    assert_eq!(
      std::fs::read(&model.meshes[0].asset.file_path).unwrap(),
      b"source geometry"
    );
    assert_eq!(
      std::fs::read_to_string(root.path().join("source.vmdl")).unwrap(),
      source
    );
    assert_eq!(
      std::fs::read(root.path().join("models/Body.FBX")).unwrap(),
      b"source geometry"
    );
    assert!(!root.path().join("game").exists());
    assets.release(&model.meshes[0].asset.asset_id).unwrap();
    assert!(!Path::new(&model.meshes[0].asset.file_path).exists());
  }
  #[test]
  fn rejects_escaping_references_and_reports_missing_or_unsupported_source_geometry() {
    let root = tempfile::tempdir().unwrap();
    let assets = ModelAssets::open().unwrap();
    for path in [
      "../outside.fbx",
      "C:/artist/body.fbx",
      "models/absent.fbx",
      "models/body.dmx",
    ] {
      std::fs::write(root.path().join("source.vmdl"), document(path)).unwrap();
      assert!(
        stage(root.path(), "source.vmdl", &assets, None, 1024, &[]).is_err(),
        "{path}"
      );
    }
    assert_eq!(std::fs::read_dir(assets.directory()).unwrap().count(), 1);
  }
  #[test]
  fn imported_wrapper_folders_resolve_only_when_the_virtual_mesh_path_is_unique() {
    let root = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(root.path().join("imported/models")).unwrap();
    std::fs::write(root.path().join("imported/models/body.fbx"), b"fbx").unwrap();
    std::fs::write(root.path().join("source.vmdl"), document("models/body.fbx")).unwrap();
    let assets = ModelAssets::open().unwrap();
    let model = stage(root.path(), "source.vmdl", &assets, None, 1024, &[]).unwrap();
    assets.release(&model.meshes[0].asset.asset_id).unwrap();
    std::fs::create_dir_all(root.path().join("other/models")).unwrap();
    std::fs::write(root.path().join("other/models/body.fbx"), b"other").unwrap();
    assert!(stage(root.path(), "source.vmdl", &assets, None, 1024, &[]).is_err());
  }
}

#[cfg(test)]
mod default_material_tests {
  use super::*;
  #[test]
  fn empty_source_material_is_a_valid_modeldoc_default_remap() {
    let tree = super::super::modding_source::tree(
      r#"{_class="DefaultMaterialGroup" remaps=[{from="" to="materials/green.vmat"}]}"#,
    )
    .unwrap();
    let mut remaps = Vec::new();
    material_remaps(&tree, &mut remaps, 0).unwrap();
    assert_eq!(remaps, vec![(String::new(), "materials/green.vmat".into())]);
  }
}
