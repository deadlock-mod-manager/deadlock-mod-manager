use std::io::Write;
use std::path::PathBuf;
use std::process::Stdio;

use serde::{Deserialize, Serialize};
use tauri::Manager;
use ts_rs::TS;

use crate::app_runtime::AppHandle;
use crate::errors::Error;

#[derive(Clone, Debug, Default, Serialize, Deserialize, TS)]
#[serde(default, rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingToolsConfig {
  pub csdk: String,
  pub dota_tools: String,
  pub dota_runtime: String,
  pub prepared_sdk: String,
  pub source2_viewer: String,
  pub proton: String,
  pub blender: String,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingSdkStatus {
  pub profile: String,
  pub compatible: bool,
  pub checked_modules: usize,
  pub different_modules: Vec<String>,
}

impl From<source2_tools::SdkInspection> for ModdingSdkStatus {
  fn from(report: source2_tools::SdkInspection) -> Self {
    Self {
      profile: report.profile,
      compatible: report.compatible,
      checked_modules: report.checked_modules,
      different_modules: report
        .differences
        .into_iter()
        .map(|item| item.path)
        .collect(),
    }
  }
}

#[derive(Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub enum ModdingTool {
  ModelDoc,
  AssetBrowser,
  Source2Viewer,
  Source2ViewerAssets,
}

fn config_path(app: &AppHandle) -> Result<PathBuf, Error> {
  Ok(app.path().app_config_dir()?.join("modding-tools.json"))
}

#[tauri::command]
pub fn get_modding_tools_config(app: AppHandle) -> Result<ModdingToolsConfig, Error> {
  let path = config_path(&app)?;
  match std::fs::read(&path) {
    Ok(bytes) => {
      serde_json::from_slice(&bytes).map_err(|error| Error::InvalidInput(error.to_string()))
    }
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
      let config = ModdingToolsConfig {
        prepared_sdk: app
          .path()
          .app_data_dir()?
          .join("tools/csdk12-ag2")
          .to_string_lossy()
          .into_owned(),
        ..Default::default()
      };
      Ok(config)
    }
    Err(error) => Err(error.into()),
  }
}

#[tauri::command]
pub fn save_modding_tools_config(app: AppHandle, config: ModdingToolsConfig) -> Result<(), Error> {
  let path = config_path(&app)?;
  let parent = path
    .parent()
    .ok_or_else(|| Error::InvalidInput("Missing app configuration directory".into()))?;
  std::fs::create_dir_all(parent)?;
  let bytes =
    serde_json::to_vec_pretty(&config).map_err(|error| Error::InvalidInput(error.to_string()))?;
  let mut file = tempfile::NamedTempFile::new_in(parent)?;
  file.write_all(&bytes)?;
  file.as_file().sync_all()?;
  file.persist(path).map_err(|error| error.error)?;
  Ok(())
}

fn tool_error(error: source2_tools::ToolError) -> Error {
  Error::InvalidInput(error.to_string())
}

#[tauri::command]
pub async fn inspect_modding_sdk(app: AppHandle) -> Result<ModdingSdkStatus, Error> {
  let config = get_modding_tools_config(app)?;
  tauri::async_runtime::spawn_blocking(move || {
    source2_tools::inspect_sdk(&PathBuf::from(config.prepared_sdk))
      .map(Into::into)
      .map_err(tool_error)
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}

#[tauri::command]
pub async fn prepare_modding_sdk(app: AppHandle) -> Result<ModdingSdkStatus, Error> {
  let config = get_modding_tools_config(app)?;
  let options = source2_tools::PrepareOptions {
    csdk: config.csdk.into(),
    deadlock: super::state::game_path()?,
    dota_tools: config.dota_tools.into(),
    dota_runtime: config.dota_runtime.into(),
    output: config.prepared_sdk.into(),
  };
  tauri::async_runtime::spawn_blocking(move || {
    if let Some(parent) = options.output.parent() {
      std::fs::create_dir_all(parent)?;
    }
    source2_tools::prepare_sdk(&options)
      .map(Into::into)
      .map_err(tool_error)
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}

#[tauri::command]
pub async fn launch_modding_tool(app: AppHandle, tool: ModdingTool) -> Result<(), Error> {
  launch_tool(app, tool, None).await
}

static SDK_LAUNCH_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

pub(super) async fn launch_tool(
  app: AppHandle,
  tool: ModdingTool,
  addon: Option<super::modding_workspace::ModdingAddon>,
) -> Result<(), Error> {
  let config = get_modding_tools_config(app.clone())?;
  let data = app.path().app_data_dir()?.join("tools");
  let steam_root = super::state::MANAGER
    .lock()
    .map_err(|_| Error::BackgroundTaskFailed("Mod manager lock poisoned".into()))?
    .get_steam_manager()
    .get_steam_path();
  tauri::async_runtime::spawn_blocking(move || {
    std::fs::create_dir_all(&data)?;
    let runtime = steam_root.map(|steam_root| source2_tools::ProtonRuntime {
      launcher: if config.proton.is_empty() {
        steam_root.join("steamapps/common/Proton - Experimental/proton")
      } else {
        PathBuf::from(&config.proton)
      },
      steam_root,
      prefix: data.join("csdk12-prefix"),
    });
    if let Some(runtime) = &runtime {
      std::fs::create_dir_all(&runtime.prefix)?;
    }
    let _launch_guard = SDK_LAUNCH_LOCK
      .lock()
      .map_err(|_| Error::BackgroundTaskFailed("SDK launch lock poisoned".into()))?;
    let sdk = PathBuf::from(&config.prepared_sdk);
    let project = if matches!(tool, ModdingTool::ModelDoc | ModdingTool::AssetBrowser) {
      super::modding_sdk_addon::select(&sdk, addon.as_ref())?
    } else {
      source2_tools::WORKBENCH_ADDON.to_owned()
    };
    let mut command = match tool {
      ModdingTool::Source2Viewer => source2_tools::viewer_command(
        &PathBuf::from(config.source2_viewer),
        None,
        runtime.as_ref(),
      ),
      ModdingTool::Source2ViewerAssets => source2_tools::viewer_command(
        &PathBuf::from(config.source2_viewer),
        Some(&PathBuf::from(config.prepared_sdk).join("game/citadel/pak01_dir.vpk")),
        runtime.as_ref(),
      ),
      ModdingTool::ModelDoc => source2_tools::sdk_project_command(
        &PathBuf::from(config.prepared_sdk),
        source2_tools::SdkTool::ModelDoc,
        &project,
        runtime.as_ref(),
      ),
      ModdingTool::AssetBrowser => source2_tools::sdk_project_command(
        &PathBuf::from(config.prepared_sdk),
        source2_tools::SdkTool::AssetBrowser,
        &project,
        runtime.as_ref(),
      ),
    }
    .map_err(tool_error)?;
    let log = std::fs::OpenOptions::new()
      .create(true)
      .append(true)
      .open(data.join("modding-tools.log"))?;
    command
      .stdin(Stdio::null())
      .stdout(log.try_clone()?)
      .stderr(log);
    let mut child = command.spawn()?;
    std::thread::spawn(move || match child.wait() {
      Ok(status) if !status.success() => log::warn!("[ModdingTools] Tool exited with {status}"),
      Err(error) => log::warn!("[ModdingTools] Failed to wait for tool: {error}"),
      _ => {}
    });
    Ok(())
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}
