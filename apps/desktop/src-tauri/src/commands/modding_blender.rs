use std::ffi::OsString;
use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::Manager;
use tokio::io::AsyncWriteExt;
use tokio_util::sync::CancellationToken;
use ts_rs::TS;

use crate::app_runtime::AppHandle;
use crate::errors::Error;

const ADDON_URL: &str = "https://github.com/FellOffFuji/BlenderSource2Tools/releases/download/3.3.1_2f/io_scene_valvesource2-331-2f.zip";
const ADDON_SHA256: &str = "55e5b3a5b00c6c65669fa716253cdc0a00e08292a0598d22fbb23b2eb708faa1";
const MAX_ARCHIVE_BYTES: usize = 2 * 1024 * 1024;

#[derive(Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct BlenderAddonStatus {
  pub ready: bool,
  pub installed: bool,
  pub install_supported: bool,
  pub blender_version: String,
}

pub(super) async fn run_blender_script(
  app: &AppHandle,
  arguments: Vec<OsString>,
  cancel: CancellationToken,
) -> Result<String, Error> {
  let config = super::modding_tools::get_modding_tools_config(app.clone())?;
  let tools = app.path().app_data_dir()?.join("tools");
  std::fs::create_dir_all(&tools)?;
  let temporary = tempfile::tempdir_in(tools)?;
  let script = temporary.path().join("blender_setup.py");
  std::fs::write(&script, include_str!("modding_blender.py"))?;
  let mut command = tokio::process::Command::new(if config.blender.is_empty() {
    "blender"
  } else {
    &config.blender
  });
  command
    .args(["--background", "--python-exit-code", "1", "--python"])
    .arg(script)
    .arg("--")
    .args(arguments)
    .stdin(Stdio::null())
    .kill_on_drop(true);
  #[cfg(windows)]
  command.creation_flags(0x08000000);
  let output = tokio::select! {
    _ = cancel.cancelled() => return Err(Error::InvalidInput("Blender preview cancelled".into())),
    output = tokio::time::timeout(Duration::from_secs(90), command.output()) => output,
  }
  .map_err(|_| Error::InvalidInput("Blender addon setup timed out".into()))?
  .map_err(|error| Error::InvalidInput(format!("Could not start Blender: {error}")))?;
  let stdout = String::from_utf8_lossy(&output.stdout);
  if output.status.success() {
    return Ok(stdout.into_owned());
  }
  let details = format!("{stdout}\n{}", String::from_utf8_lossy(&output.stderr));
  let tail = details
    .lines()
    .rev()
    .take(12)
    .collect::<Vec<_>>()
    .into_iter()
    .rev()
    .collect::<Vec<_>>()
    .join("\n");
  Err(Error::InvalidInput(format!(
    "Blender addon setup failed: {tail}"
  )))
}

async fn run_blender_setup(
  app: &AppHandle,
  archive: Option<PathBuf>,
) -> Result<BlenderAddonStatus, Error> {
  let arguments = match archive {
    Some(archive) => vec!["install".into(), archive.into_os_string()],
    None => vec!["probe".into()],
  };
  let output = run_blender_script(app, arguments, CancellationToken::new()).await?;
  let status = output
    .lines()
    .find_map(|line| line.strip_prefix("DMM_BLENDER_STATUS="))
    .ok_or_else(|| Error::InvalidInput("Blender returned no addon status".into()))?;
  serde_json::from_str(status).map_err(|error| Error::InvalidInput(error.to_string()))
}

#[tauri::command]
pub async fn inspect_modding_blender(app: AppHandle) -> Result<BlenderAddonStatus, Error> {
  run_blender_setup(&app, None).await
}

#[tauri::command]
pub async fn install_modding_blender_addon(app: AppHandle) -> Result<BlenderAddonStatus, Error> {
  let current = run_blender_setup(&app, None).await?;
  if current.ready {
    return Ok(current);
  }
  if !current.install_supported {
    return Err(Error::InvalidInput(
      "Blender Source2Tools requires Blender 4.4 or newer".into(),
    ));
  }
  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(60))
    .user_agent("Deadlock-Mod-Manager")
    .build()
    .map_err(|error| Error::Network(error.to_string()))?;
  let mut response = client
    .get(ADDON_URL)
    .send()
    .await
    .map_err(|error| Error::Network(error.to_string()))?
    .error_for_status()
    .map_err(|error| Error::Network(error.to_string()))?;
  let mut bytes = Vec::new();
  while let Some(chunk) = response
    .chunk()
    .await
    .map_err(|error| Error::Network(error.to_string()))?
  {
    if bytes.len() + chunk.len() > MAX_ARCHIVE_BYTES {
      return Err(Error::InvalidInput(
        "Blender addon archive is too large".into(),
      ));
    }
    bytes.extend_from_slice(&chunk);
  }
  if format!("{:x}", Sha256::digest(&bytes)) != ADDON_SHA256 {
    return Err(Error::InvalidInput(
      "Blender addon archive failed its SHA-256 check".into(),
    ));
  }
  let temporary = tempfile::tempdir_in(app.path().app_data_dir()?.join("tools"))?;
  let archive = temporary.path().join("source2tools.zip");
  let mut file = tokio::fs::File::create(&archive).await?;
  file.write_all(&bytes).await?;
  file.sync_all().await?;
  drop(file);
  run_blender_setup(&app, Some(archive)).await
}
