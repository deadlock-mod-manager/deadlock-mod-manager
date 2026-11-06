use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

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
  Verifying,
  Extracting,
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
  pub downloaded_bytes: u64,
  pub total_bytes: Option<u64>,
  pub current_file: Option<String>,
  pub processed_files: u64,
  pub copied_bytes: u64,
  pub elapsed_seconds: u64,
}

#[derive(Default)]
struct SetupState {
  status: ModdingSetupStatus,
  cancel: CancellationToken,
  started: Option<Instant>,
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
  let state = state()
    .lock()
    .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?;
  let mut status = state.status.clone();
  if status.running {
    status.elapsed_seconds = state
      .started
      .map_or(0, |started| started.elapsed().as_secs());
  }
  drop(state);
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
  {
    let mut state = state()
      .lock()
      .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?;
    state.status.total_bytes = response.content_length();
  }
  let mut stream = response.bytes_stream();
  let mut digest = Sha256::new();
  while let Some(bytes) = tokio::select! {
    _ = cancel.cancelled() => return Err(Error::InvalidInput("Tool setup cancelled".into())),
    bytes = stream.next() => bytes,
  } {
    let bytes = bytes.map_err(|e| Error::Network(e.to_string()))?;
    digest.update(&bytes);
    output.write_all(&bytes).await?;
    let mut state = state()
      .lock()
      .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?;
    state.status.downloaded_bytes += bytes.len() as u64;
  }
  output.sync_all().await?;
  drop(output);
  update(ModdingSetupPhase::Verifying)?;
  if format!("{:x}", digest.finalize()) != spec.sha256 {
    return Err(Error::InvalidInput(
      "Downloaded tool archive failed its SHA-256 check".into(),
    ));
  }
  update(ModdingSetupPhase::Extracting)?;
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

pub(super) fn preparation_progress(event: source2_tools::PreparationEvent) {
  if let Ok(mut state) = state().lock() {
    if !state.status.running {
      return;
    }
    match event {
      source2_tools::PreparationEvent::Checking(path) => {
        state.status.current_file = Some(
          path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        )
      }
      source2_tools::PreparationEvent::Completed { bytes } => {
        state.status.processed_files += 1;
        state.status.copied_bytes += bytes;
      }
    }
  }
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
    state.started = Some(Instant::now());
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
  state.status.elapsed_seconds = state
    .started
    .map_or(0, |started| started.elapsed().as_secs());
  state.status.running = false;
  state.status.phase = if result.is_ok() {
    ModdingSetupPhase::Ready
  } else {
    ModdingSetupPhase::Failed
  };
  state.status.error = result.as_ref().err().map(ToString::to_string);
  result
}

#[cfg(test)]
mod tests {
  use super::*;

  #[tokio::test]
  #[ignore = "Downloads the pinned public CLI release into a temporary directory"]
  async fn real_tool_download_reports_bytes_and_extracts_a_verified_cli() {
    let root = tempfile::tempdir().unwrap();
    {
      let mut state = state().lock().unwrap();
      state.status = ModdingSetupStatus {
        running: true,
        phase: ModdingSetupPhase::CliDownload,
        ..Default::default()
      };
      state.started = Some(Instant::now());
    }
    let executable = install_download(root.path().join("cli"), &CancellationToken::new())
      .await
      .unwrap();
    assert!(executable.is_file());
    let state = state().lock().unwrap();
    assert!(state.status.downloaded_bytes > 0);
    if let Some(total) = state.status.total_bytes {
      assert_eq!(state.status.downloaded_bytes, total);
    }
    assert!(matches!(state.status.phase, ModdingSetupPhase::Extracting));
    assert_eq!(
      std::fs::read_to_string(root.path().join("cli/.archive-sha256")).unwrap(),
      download_spec().unwrap().sha256
    );
    println!(
      "Downloaded and verified {} bytes",
      state.status.downloaded_bytes
    );
  }
}
