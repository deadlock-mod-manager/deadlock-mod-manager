use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use futures::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::Manager;
use tokio::io::AsyncWriteExt;
use tokio_util::sync::CancellationToken;
use ts_rs::TS;

use crate::app_runtime::AppHandle;
use crate::errors::Error;

use super::modding_tools::get_modding_tools_config;

#[derive(Clone, Copy, Default, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub enum ModdingSetupPhase {
  #[default]
  Idle,
  Starting,
  CliDownload,
  Preparing,
  Ready,
  Failed,
}

#[derive(Clone, Default, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingSetupStatus {
  pub running: bool,
  pub phase: ModdingSetupPhase,
  pub cli_ready: bool,
  pub error: Option<String>,
}

#[derive(Default)]
struct SetupState {
  status: ModdingSetupStatus,
  cancel: CancellationToken,
}

fn state() -> &'static Mutex<SetupState> {
  static STATE: OnceLock<Mutex<SetupState>> = OnceLock::new();
  STATE.get_or_init(|| Mutex::new(SetupState::default()))
}

fn update(phase: ModdingSetupPhase) -> Result<(), Error> {
  let mut state = state()
    .lock()
    .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?;
  state.status.phase = phase;
  Ok(())
}

#[tauri::command]
pub fn get_modding_setup_status(app: AppHandle) -> Result<ModdingSetupStatus, Error> {
  let mut status = state()
    .lock()
    .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?
    .status
    .clone();
  status.cli_ready = app
    .path()
    .app_data_dir()?
    .join("tools/source2viewer-cli-20.1")
    .join(if cfg!(windows) {
      "Source2Viewer-CLI.exe"
    } else {
      "Source2Viewer-CLI"
    })
    .is_file();
  Ok(status)
}

#[tauri::command]
pub fn cancel_modding_setup() -> Result<(), Error> {
  state()
    .lock()
    .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?
    .cancel
    .cancel();
  Ok(())
}

struct Download {
  url: String,
  sha256: &'static str,
  executable: &'static str,
}

fn download_spec() -> Result<Download, Error> {
  if !cfg!(target_arch = "x86_64") || !cfg!(any(target_os = "windows", target_os = "linux")) {
    return Err(Error::InvalidInput(
      "The modding workbench currently supports Windows and Linux x64".into(),
    ));
  }
  let os = if cfg!(windows) { "windows" } else { "linux" };
  let (url, sha256, executable) = (
    format!(
      "https://github.com/ValveResourceFormat/ValveResourceFormat/releases/download/20.1/cli-{os}-x64.zip"
    ),
    if cfg!(windows) {
      "67aaf8a67a85ca60fd09ff343e62103a4cdf3a2d177fc656231d7d734c5b3aa3"
    } else {
      "29d25a6d6b62377fc5386c3e5145b0a2180a401a50041afe9494b3f503deaef5"
    },
    if cfg!(windows) {
      "Source2Viewer-CLI.exe"
    } else {
      "Source2Viewer-CLI"
    },
  );
  Ok(Download {
    url,
    sha256,
    executable,
  })
}

async fn install_download(root: PathBuf, cancel: &CancellationToken) -> Result<PathBuf, Error> {
  let spec = download_spec()?;
  let executable = root.join(spec.executable);
  let receipt = root.join(".archive-sha256");
  if executable.is_file() && std::fs::read_to_string(&receipt).ok().as_deref() == Some(spec.sha256)
  {
    return Ok(executable);
  }
  let parent = root
    .parent()
    .ok_or_else(|| Error::InvalidInput("Missing tools directory".into()))?;
  std::fs::create_dir_all(parent)?;
  let archive = tempfile::NamedTempFile::new_in(parent)?;
  let mut output = tokio::fs::File::from_std(archive.reopen()?);
  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(600))
    .user_agent("Deadlock-Mod-Manager")
    .build()
    .map_err(|e| Error::Network(e.to_string()))?;
  let response = tokio::select! {
    _ = cancel.cancelled() => return Err(Error::InvalidInput("Tool setup cancelled".into())),
    response = client.get(&spec.url).send() => response.map_err(|e| Error::Network(e.to_string()))?.error_for_status().map_err(|e| Error::Network(e.to_string()))?,
  };
  let mut stream = response.bytes_stream();
  let mut digest = Sha256::new();
  while let Some(bytes) = tokio::select! {
    _ = cancel.cancelled() => return Err(Error::InvalidInput("Tool setup cancelled".into())),
    bytes = stream.next() => bytes,
  } {
    let bytes = bytes.map_err(|e| Error::Network(e.to_string()))?;
    digest.update(&bytes);
    output.write_all(&bytes).await?;
  }
  output.sync_all().await?;
  drop(output);
  if format!("{:x}", digest.finalize()) != spec.sha256 {
    return Err(Error::InvalidInput(
      "Downloaded tool archive failed its SHA-256 check".into(),
    ));
  }
  let sha256 = spec.sha256;
  tauri::async_runtime::spawn_blocking(move || -> Result<(), Error> {
    let staging = tempfile::tempdir_in(
      root
        .parent()
        .ok_or_else(|| Error::InvalidInput("Missing tools directory".into()))?,
    )?;
    let mut zip = zip::ZipArchive::new(archive.reopen()?)?;
    zip.extract(staging.path())?;
    if !staging.path().join(spec.executable).is_file() {
      return Err(Error::InvalidInput(
        "Tool archive has no expected executable".into(),
      ));
    }
    #[cfg(unix)]
    {
      use std::os::unix::fs::PermissionsExt;
      std::fs::set_permissions(
        staging.path().join(spec.executable),
        std::fs::Permissions::from_mode(0o755),
      )?;
    }
    std::fs::write(staging.path().join(".archive-sha256"), sha256)?;
    if root.exists() {
      return Err(Error::InvalidInput(
        "An incomplete managed tool installation exists; select a new tools directory".into(),
      ));
    }
    std::fs::rename(staging.path(), &root)?;
    Ok(())
  })
  .await
  .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))??;
  Ok(executable)
}

async fn setup(app: AppHandle, cancel: CancellationToken) -> Result<(), Error> {
  let config = get_modding_tools_config(app.clone())?;
  let check = source2_tools::inspect_installation(&PathBuf::from(&config.sdk));
  if !check.compatible {
    return Err(Error::InvalidInput(format!(
      "Select an extracted CSDK installation. Required paths are missing: {}",
      check.missing_files.join(", ")
    )));
  }
  update(ModdingSetupPhase::CliDownload)?;
  let tools = app.path().app_data_dir()?.join("tools");
  install_download(tools.join("source2viewer-cli-20.1"), &cancel).await?;
  if cancel.is_cancelled() {
    return Err(Error::InvalidInput("Tool setup cancelled".into()));
  }
  update(ModdingSetupPhase::Preparing)?;
  super::modding_tools::prepare_modding_sdk(app).await?;
  Ok(())
}

#[tauri::command]
pub async fn setup_modding_workbench(app: AppHandle) -> Result<(), Error> {
  let cancel = {
    let mut state = state()
      .lock()
      .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?;
    if state.status.running {
      return Err(Error::InvalidInput(
        "Workbench setup is already running".into(),
      ));
    }
    state.cancel = CancellationToken::new();
    state.status = ModdingSetupStatus {
      running: true,
      phase: ModdingSetupPhase::Starting,
      ..Default::default()
    };
    state.cancel.clone()
  };
  let result = setup(app, cancel).await;
  let mut state = state()
    .lock()
    .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?;
  state.status.running = false;
  state.status.phase = if result.is_ok() {
    ModdingSetupPhase::Ready
  } else {
    ModdingSetupPhase::Failed
  };
  state.status.error = result.as_ref().err().map(ToString::to_string);
  result
}
