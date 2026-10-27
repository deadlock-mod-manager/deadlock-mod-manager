use std::{collections::BTreeMap, path::Path, sync::Arc};

use serde::Serialize;
use source2_model::kv3::KvValue;
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

struct Mesh {
  path: String,
  name: String,
  scale: f32,
}

fn meshes(value: &KvValue, output: &mut Vec<Mesh>, depth: usize) -> Result<(), Error> {
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

fn stage(root: &Path, path: &str, assets: &ModelAssets) -> Result<ModdingSourceModel, Error> {
  let source = contained(root, path)?;
  if std::fs::metadata(&source)?.len() > 16 * 1024 * 1024 {
    return Err(Error::InvalidInput("ModelDoc source exceeds 16 MB".into()));
  }
  let tree = super::modding_source::tree(&std::fs::read_to_string(source)?)?;
  let mut references = Vec::new();
  meshes(tree.get("rootNode").unwrap_or(&tree), &mut references, 0)?;
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
    for mesh in references {
      super::modding_workspace::relative(&mesh.path, false)?;
      if !mesh.path.to_ascii_lowercase().ends_with(".fbx") {
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
      result.meshes.push(ModdingSourceMesh {
        asset: assets.publish_source(&bytes)?,
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
) -> Result<ModdingSourceModel, Error> {
  if !path.to_ascii_lowercase().ends_with(".vmdl") {
    return Err(Error::InvalidInput("Select a source VMDL".into()));
  }
  let root = super::modding_local::resolve_read(&app, &addon_id)?.root(ModdingHierarchy::Content);
  let assets = assets.inner().clone();
  let job = assets.start_job(request_id)?;
  tauri::async_runtime::spawn_blocking(move || {
    job.check()?;
    let result = stage(&root, &path, &assets)?;
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
  fn reads_mesh_references_and_scales_without_compiled_files() {
    let tree = super::super::modding_source::tree(r#"{rootNode={_class="RootNode" children=[{_class="RenderMeshList" children=[{_class="RenderMeshFile" name="body" filename="models/body.fbx" import_scale=0.4}]}]}}"#).unwrap();
    let mut output = Vec::new();
    meshes(tree.get("rootNode").unwrap(), &mut output, 0).unwrap();
    assert_eq!(output.len(), 1);
    assert_eq!(output[0].path, "models/body.fbx");
    assert_eq!(output[0].scale, 0.4);
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
    let model = stage(root.path(), "source.vmdl", &assets).unwrap();
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
        stage(root.path(), "source.vmdl", &assets).is_err(),
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
    let model = stage(root.path(), "source.vmdl", &assets).unwrap();
    assets.release(&model.meshes[0].asset.asset_id).unwrap();
    std::fs::create_dir_all(root.path().join("other/models")).unwrap();
    std::fs::write(root.path().join("other/models/body.fbx"), b"other").unwrap();
    assert!(stage(root.path(), "source.vmdl", &assets).is_err());
  }
}
