use std::sync::Arc;

use serde::Serialize;
use tauri::State;
use ts_rs::TS;

use super::foundry::{FoundryModel, ModelAssets};
use super::modding_workspace::{ModdingHierarchy, contained};
use crate::app_runtime::AppHandle;
use crate::errors::Error;

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingDmxModel {
  #[serde(flatten)]
  pub model: FoundryModel,
  pub skeleton_only: bool,
  pub associated_model: Option<String>,
  pub layers: Vec<super::modding_dmx_layers::ModdingDmxLayer>,
}

#[tauri::command]
pub async fn preview_modding_dmx(
  app: AppHandle,
  assets: State<'_, Arc<ModelAssets>>,
  request_id: String,
  addon_id: String,
  hierarchy: ModdingHierarchy,
  path: String,
  discover_layers: Option<bool>,
) -> Result<ModdingDmxModel, Error> {
  if !path.to_ascii_lowercase().ends_with(".dmx") {
    return Err(Error::InvalidInput("Select a source DMX file".into()));
  }
  let addon = super::modding_local::resolve_read(&app, &addon_id)?;
  let source = contained(&addon.root(hierarchy), &path)?;
  let assets = assets.inner().clone();
  let job = assets.start_job(request_id)?;
  tauri::async_runtime::spawn_blocking(move || {
    job.check()?;
    if std::fs::metadata(&source)?.len() > 256 * 1024 * 1024 {
      return Err(Error::InvalidInput(
        "This DMX exceeds the 256 MB preview limit".into(),
      ));
    }
    let decoded = source2_model::dmx::DmxModel::decode(&std::fs::read(source)?)
      .map_err(|error| Error::InvalidInput(error.to_string()))?;
    let skeleton_only = decoded.is_skeleton_only();
    let (associated_model, layers) = if discover_layers.unwrap_or(true) {
      super::modding_dmx_layers::discover(&addon.root(hierarchy), &path, skeleton_only)?
    } else {
      (None, Vec::new())
    };
    let decoded = decoded
      .into_glb(&[], &[])
      .map_err(|error| Error::InvalidInput(error.to_string()))?;
    job.check()?;
    let model = assets.publish(&decoded.glb, decoded.vertex_count, decoded.index_count)?;
    if let Err(error) = job.check() {
      assets.release(&model.asset_id)?;
      return Err(error);
    }
    Ok(ModdingDmxModel {
      model,
      skeleton_only,
      associated_model,
      layers,
    })
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}
