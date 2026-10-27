use std::sync::{Arc, OnceLock};

use serde::Deserialize;
use tauri::{Manager, State};
use tokio::sync::Semaphore;

use super::foundry::{FoundryModel, ModelAssets};
use super::modding_workspace::{ModdingHierarchy, contained};
use crate::app_runtime::AppHandle;
use crate::errors::Error;

#[derive(Deserialize)]
struct ModelStats {
  vertices: u32,
  indices: u32,
}

#[tauri::command]
pub async fn preview_modding_dmx(
  app: AppHandle,
  assets: State<'_, Arc<ModelAssets>>,
  request_id: String,
  addon_id: String,
  hierarchy: ModdingHierarchy,
  path: String,
) -> Result<FoundryModel, Error> {
  if !path.to_ascii_lowercase().ends_with(".dmx") {
    return Err(Error::InvalidInput("Select a source DMX model".into()));
  }
  let addon = super::modding_local::resolve_read(&app, &addon_id)?;
  let source = contained(&addon.root(hierarchy), &path)?;
  if std::fs::metadata(&source)?.len() > 256 * 1024 * 1024 {
    return Err(Error::InvalidInput(
      "This DMX exceeds the 256 MB preview limit".into(),
    ));
  }
  let assets = assets.inner().clone();
  let job = assets.start_job(request_id)?;
  static SLOTS: OnceLock<Arc<Semaphore>> = OnceLock::new();
  let _permit = job
    .acquire(SLOTS.get_or_init(|| Arc::new(Semaphore::new(1))).clone())
    .await?;
  job.check()?;
  let tools = app.path().app_data_dir()?.join("tools");
  std::fs::create_dir_all(&tools)?;
  let temporary = tempfile::tempdir_in(tools)?;
  let output = temporary.path().join("preview.glb");
  let stdout = super::modding_blender::run_blender_script(
    &app,
    vec![
      "preview".into(),
      source.into_os_string(),
      output.clone().into_os_string(),
    ],
    job.cancellation_token(),
  )
  .await?;
  job.check()?;
  let stats: ModelStats = serde_json::from_str(
    stdout
      .lines()
      .find_map(|line| line.strip_prefix("DMM_MODEL_STATS="))
      .ok_or_else(|| Error::InvalidInput("Blender returned no DMX geometry".into()))?,
  )
  .map_err(|error| Error::InvalidInput(error.to_string()))?;
  if std::fs::metadata(&output)?.len() > 256 * 1024 * 1024 {
    return Err(Error::InvalidInput(
      "The DMX preview exceeds the 256 MB limit".into(),
    ));
  }
  let bytes = tokio::fs::read(output).await?;
  let model = assets.publish(&bytes, stats.vertices, stats.indices)?;
  if let Err(error) = job.check() {
    assets.release(&model.asset_id)?;
    return Err(error);
  }
  Ok(model)
}
