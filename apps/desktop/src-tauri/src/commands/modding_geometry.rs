//! Source-only edits preserve original skinning and use the workspace undo journal.
use super::{
  modding_edits,
  modding_workspace::{self, ModdingHierarchy, contained},
};
use crate::{app_runtime::AppHandle, errors::Error};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingGeometryMesh {
  pub state: u32,
  pub positions: Vec<[f32; 3]>,
  pub matrix: [f32; 16],
}
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingGeometry {
  pub fingerprint: String,
  pub meshes: Vec<ModdingGeometryMesh>,
}
#[derive(Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingVertexEdit {
  pub state: u32,
  pub vertex: u32,
  pub position: [f32; 3],
}
fn read(root: &std::path::Path, path: &str) -> Result<Vec<u8>, Error> {
  if !path.to_ascii_lowercase().ends_with(".dmx") {
    return Err(Error::InvalidInput("Select a source mesh DMX file".into()));
  }
  let source = contained(root, path)?;
  if std::fs::metadata(&source)?.len() > 256 * 1024 * 1024 {
    return Err(Error::InvalidInput("Source geometry exceeds 256 MB".into()));
  }
  Ok(std::fs::read(source)?)
}
#[tauri::command]
pub async fn read_modding_geometry(
  app: AppHandle,
  addon_id: String,
  path: String,
) -> Result<ModdingGeometry, Error> {
  let addon = modding_workspace::resolve(&app, &addon_id)?;
  tauri::async_runtime::spawn_blocking(move || {
    let bytes = read(&addon.root(ModdingHierarchy::Content), &path)?;
    let geometry = source2_model::dmx::geometry::inspect(&bytes)
      .map_err(|error| Error::InvalidInput(error.to_string()))?;
    Ok(ModdingGeometry {
      fingerprint: modding_edits::fingerprint(&bytes),
      meshes: geometry
        .meshes
        .into_iter()
        .map(|mesh| ModdingGeometryMesh {
          state: mesh.state as u32,
          positions: mesh.positions,
          matrix: mesh.matrix,
        })
        .collect(),
    })
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}
#[tauri::command]
pub async fn save_modding_geometry(
  app: AppHandle,
  addon_id: String,
  path: String,
  expected_fingerprint: String,
  edits: Vec<ModdingVertexEdit>,
) -> Result<String, Error> {
  let addon = modding_workspace::resolve(&app, &addon_id)?;
  tauri::async_runtime::spawn_blocking(move || {
    let _lock = modding_edits::EDIT_LOCK
      .lock()
      .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?;
    let root = addon.root(ModdingHierarchy::Content);
    let bytes = read(&root, &path)?;
    if modding_edits::fingerprint(&bytes) != expected_fingerprint {
      return Err(Error::InvalidInput(
        "Source geometry changed. Reload before saving.".into(),
      ));
    }
    if edits.is_empty() || edits.len() > 4_000_000 {
      return Err(Error::InvalidInput(
        "Select between 1 and 4000000 vertices".into(),
      ));
    }
    let edits = edits
      .into_iter()
      .map(|edit| source2_model::dmx::geometry::VertexEdit {
        state: edit.state as usize,
        vertex: edit.vertex as usize,
        position: edit.position,
      })
      .collect::<Vec<_>>();
    let edited = source2_model::dmx::geometry::apply(&bytes, &edits)
      .map_err(|error| Error::InvalidInput(error.to_string()))?;
    modding_edits::commit(
      &root,
      vec![modding_edits::Edit {
        from: path.clone(),
        to: path,
        bytes: edited,
      }],
    )
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingGeometrySource {
  pub path: String,
  pub name: String,
}

#[tauri::command]
pub async fn list_modding_geometry_sources(
  app: AppHandle,
  addon_id: String,
  path: String,
) -> Result<Vec<ModdingGeometrySource>, Error> {
  let addon = modding_workspace::resolve(&app, &addon_id)?;
  tauri::async_runtime::spawn_blocking(move || {
    let root = addon.root(ModdingHierarchy::Content);
    if path.to_ascii_lowercase().ends_with(".dmx") {
      contained(&root, &path)?;
      return Ok(vec![ModdingGeometrySource {
        name: path.clone(),
        path,
      }]);
    }
    if !path.to_ascii_lowercase().ends_with(".vmdl") {
      return Err(Error::InvalidInput(
        "Open a source ModelDoc or mesh DMX".into(),
      ));
    }
    let file = contained(&root, &path)?;
    if std::fs::metadata(&file)?.len() > 16 * 1024 * 1024 {
      return Err(Error::InvalidInput("ModelDoc source exceeds 16 MB".into()));
    }
    let tree = super::modding_source::tree(&std::fs::read_to_string(file)?)?;
    let mut references = Vec::new();
    super::modding_model_source::meshes(tree.get("rootNode").unwrap_or(&tree), &mut references, 0)?;
    let files = super::modding_batch::files(&root)?;
    let mut result = Vec::new();
    for mesh in references {
      if !mesh.path.to_ascii_lowercase().ends_with(".dmx") {
        continue;
      }
      super::modding_workspace::relative(&mesh.path, false)?;
      let key = mesh.path.to_ascii_lowercase();
      let exact = files
        .iter()
        .filter(|file| file.eq_ignore_ascii_case(&key))
        .collect::<Vec<_>>();
      let candidates = if exact.is_empty() {
        files
          .iter()
          .filter(|file| file.to_ascii_lowercase().ends_with(&format!("/{key}")))
          .collect::<Vec<_>>()
      } else {
        exact
      };
      if candidates.len() == 1
        && !result
          .iter()
          .any(|source: &ModdingGeometrySource| source.path == *candidates[0])
      {
        result.push(ModdingGeometrySource {
          path: candidates[0].clone(),
          name: mesh.name,
        });
      }
    }
    Ok(result)
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}
