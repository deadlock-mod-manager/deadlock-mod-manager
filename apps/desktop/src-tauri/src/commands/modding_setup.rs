use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use futures::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::Manager;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWriteExt, BufReader};
use tokio_util::sync::CancellationToken;
use ts_rs::TS;

use crate::app_runtime::AppHandle;
use crate::errors::Error;

use super::modding_tools::{get_modding_tools_config, save_modding_tools_config};

#[derive(Clone, Copy, Default, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub enum ModdingSetupPhase {
  #[default]
  Idle,
  Starting,
  CliDownload,
  DownloaderDownload,
  SteamAuthorization,
  RuntimeDownload,
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
  pub qr_lines: Vec<String>,
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

fn update(phase: ModdingSetupPhase, qr_lines: Vec<String>) -> Result<(), Error> {
  let mut state = state()
    .lock()
    .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?;
  state.status.phase = phase;
  state.status.qr_lines = qr_lines;
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

fn download_spec(depot: bool) -> Result<Download, Error> {
  if !cfg!(target_arch = "x86_64") || !cfg!(any(target_os = "windows", target_os = "linux")) {
    return Err(Error::InvalidInput(
      "The modding workbench currently supports Windows and Linux x64".into(),
    ));
  }
  let os = if cfg!(windows) { "windows" } else { "linux" };
  let (url, sha256, executable) = if depot {
    (
      format!(
        "https://github.com/SteamRE/DepotDownloader/releases/download/DepotDownloader_3.4.0/DepotDownloader-{os}-x64.zip"
      ),
      if cfg!(windows) {
        "41c9e9f0df54b3ad02e67a11726756e5c73283bd7c2e1b04acfa5ae4c2ed3767"
      } else {
        "a999dec66b4850fc961bd50366696d23c2d0fad7b18790e6a5647b2f19097a53"
      },
      if cfg!(windows) {
        "DepotDownloader.exe"
      } else {
        "DepotDownloader"
      },
    )
  } else {
    (
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
    )
  };
  Ok(Download {
    url,
    sha256,
    executable,
  })
}

async fn install_download(
  root: PathBuf,
  depot: bool,
  cancel: &CancellationToken,
) -> Result<PathBuf, Error> {
  let spec = download_spec(depot)?;
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

struct DownloaderLines<R> {
  reader: BufReader<R>,
  buffer: Vec<u8>,
}

impl<R: AsyncRead + Unpin> DownloaderLines<R> {
  fn new(reader: R) -> Self {
    Self {
      reader: BufReader::new(reader),
      buffer: Vec::new(),
    }
  }

  async fn next_line(&mut self) -> std::io::Result<Option<String>> {
    // read_until keeps partial bytes when select! cancels this read for the other pipe.
    let read = self.reader.read_until(b'\n', &mut self.buffer).await?;
    if read == 0 && self.buffer.is_empty() {
      return Ok(None);
    }
    if self.buffer.last() == Some(&b'\n') {
      self.buffer.pop();
    }
    if self.buffer.last() == Some(&b'\r') {
      self.buffer.pop();
    }
    let line = decode_downloader_line(&self.buffer);
    self.buffer.clear();
    Ok(Some(line))
  }
}

fn decode_downloader_line(bytes: &[u8]) -> String {
  if let Ok(text) = std::str::from_utf8(bytes) {
    return text.to_owned();
  }
  // Windows OEM console pages encode QR block cells as these single-byte glyphs.
  if bytes
    .iter()
    .all(|byte| matches!(byte, b' ' | 0xdb | 0xdc | 0xdf))
  {
    return bytes
      .iter()
      .map(|byte| match byte {
        0xdb => '█',
        0xdc => '▄',
        0xdf => '▀',
        _ => ' ',
      })
      .collect();
  }
  String::from_utf8_lossy(bytes).into_owned()
}

async fn run_depot(
  executable: &Path,
  depot: &source2_tools::RuntimeDepot,
  output: &Path,
  cancel: &CancellationToken,
) -> Result<(), Error> {
  std::fs::create_dir_all(output)?;
  let list = output.join("dmm-required-files.txt");
  std::fs::write(&list, depot.files.join("\n"))?;
  let mut command = source2_tools::depot_command(executable, depot, &list, output);
  command
    .current_dir(output)
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
  let mut command = tokio::process::Command::from(command);
  command.kill_on_drop(true);
  let mut child = command.spawn()?;
  let stdout = child
    .stdout
    .take()
    .ok_or_else(|| Error::BackgroundTaskFailed("Missing downloader output".into()))?;
  let stderr = child
    .stderr
    .take()
    .ok_or_else(|| Error::BackgroundTaskFailed("Missing downloader errors".into()))?;
  let mut stdout = DownloaderLines::new(stdout);
  let mut stderr = DownloaderLines::new(stderr);
  let (mut out_open, mut err_open) = (true, true);
  let mut exit_status = None;
  let mut qr = Vec::new();
  let mut tail = Vec::new();
  let deadline = tokio::time::sleep(Duration::from_secs(1800));
  tokio::pin!(deadline);
  while out_open || err_open || exit_status.is_none() {
    let line = tokio::select! {
      _ = cancel.cancelled() => return Err(Error::InvalidInput("Tool setup cancelled".into())),
      _ = &mut deadline => return Err(Error::InvalidInput("Steam download timed out".into())),
      line = stdout.next_line(), if out_open => { let line = line?; out_open = line.is_some(); line },
      line = stderr.next_line(), if err_open => { let line = line?; err_open = line.is_some(); line },
      result = child.wait(), if exit_status.is_none() => {
        exit_status = Some(result?);
        None
      }
    };
    let Some(line) = line else {
      continue;
    };
    if line.contains("QR code:") || line.contains("QR code has changed") {
      qr.clear();
      update(ModdingSetupPhase::SteamAuthorization, Vec::new())?;
    } else if line.chars().count() > 10 && line.chars().all(|c| matches!(c, ' ' | '█' | '▀' | '▄'))
    {
      if qr.len() < 100 {
        qr.push(line);
        update(ModdingSetupPhase::SteamAuthorization, qr.clone())?;
      }
    } else if !line.trim().is_empty() {
      if line.contains("Downloading depot") || line.contains("licenses for account") {
        update(ModdingSetupPhase::RuntimeDownload, Vec::new())?;
      }
      if tail.len() == 8 {
        tail.remove(0);
      }
      tail.push(line.chars().take(300).collect::<String>());
    }
  }
  if let Some(status) = exit_status
    && !status.success()
  {
    return Err(Error::InvalidInput(format!(
      "Steam download failed ({status}): {}",
      tail.join(" ")
    )));
  }
  Ok(())
}

async fn setup(app: AppHandle, cancel: CancellationToken) -> Result<(), Error> {
  let mut config = get_modding_tools_config(app.clone())?;
  let tools = app.path().app_data_dir()?.join("tools");
  update(ModdingSetupPhase::CliDownload, Vec::new())?;
  install_download(tools.join("source2viewer-cli-20.1"), false, &cancel).await?;
  if Path::new(&config.prepared_sdk).is_dir() {
    let sdk = PathBuf::from(&config.prepared_sdk);
    let check = tauri::async_runtime::spawn_blocking(move || source2_tools::inspect_sdk(&sdk))
      .await
      .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?
      .map_err(|e| Error::InvalidInput(e.to_string()))?;
    if check.compatible {
      return Ok(());
    }
    return Err(Error::InvalidInput("The existing SDK does not match this workbench. Choose a new output folder in advanced settings".into()));
  }
  if !Path::new(&config.csdk)
    .join("game/bin/assettypes_common.txt")
    .is_file()
  {
    return Err(Error::InvalidInput(
      "Select your CSDK12 folder before setting up the workbench".into(),
    ));
  }
  let depots = source2_tools::runtime_depots().map_err(|e| Error::InvalidInput(e.to_string()))?;
  for depot in depots {
    let configured = if depot.depot == 381450 {
      &config.dota_tools
    } else {
      &config.dota_runtime
    };
    let candidate = PathBuf::from(configured);
    let check = depot.depot;
    let available = tauri::async_runtime::spawn_blocking(move || {
      let plan = source2_tools::runtime_depots()?
        .into_iter()
        .find(|item| item.depot == check)
        .ok_or_else(|| {
          source2_tools::ToolError::InvalidInput("Missing runtime download plan".into())
        })?;
      source2_tools::runtime_available(&candidate, &plan)
    })
    .await
    .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?
    .map_err(|e| Error::InvalidInput(e.to_string()))?;
    if available {
      continue;
    }
    update(ModdingSetupPhase::DownloaderDownload, Vec::new())?;
    let downloader = install_download(tools.join("depotdownloader-3.4.0"), true, &cancel).await?;
    update(ModdingSetupPhase::RuntimeDownload, Vec::new())?;
    let output = tools.join(format!("runtime-{}-{}", depot.depot, depot.manifest));
    run_depot(&downloader, &depot, &output, &cancel).await?;
    if depot.depot == 381450 {
      config.dota_tools = output.to_string_lossy().into_owned();
    } else {
      config.dota_runtime = output.to_string_lossy().into_owned();
    }
  }
  save_modding_tools_config(app.clone(), config)?;
  update(ModdingSetupPhase::Preparing, Vec::new())?;
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
  state.status.qr_lines.clear();
  state.status.phase = if result.is_ok() {
    ModdingSetupPhase::Ready
  } else {
    ModdingSetupPhase::Failed
  };
  state.status.error = result.as_ref().err().map(ToString::to_string);
  result
}

#[cfg(test)]
mod setup_output_tests {
  use super::*;

  #[cfg(unix)]
  #[tokio::test]
  async fn failed_downloader_drains_both_pipes_and_reports_final_diagnostics() {
    use std::os::unix::fs::PermissionsExt;

    let root = tempfile::tempdir().unwrap();
    let executable = root.path().join("downloader");
    std::fs::write(
      &executable,
      b"#!/bin/sh\nprintf 'Filelist: Andr\\351\\n'\nprintf 'Final downloader failure: \\377' >&2\nexit 7\n",
    )
    .unwrap();
    std::fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o755)).unwrap();
    let depot = source2_tools::RuntimeDepot {
      depot: 381450,
      manifest: "fixture",
      files: Vec::new(),
    };
    let error = run_depot(
      &executable,
      &depot,
      &root.path().join("output"),
      &CancellationToken::new(),
    )
    .await
    .unwrap_err()
    .to_string();
    assert!(error.contains("Steam download failed"), "{error}");
    assert!(error.contains("Final downloader failure:"), "{error}");
    assert!(!error.contains("stream did not contain valid UTF-8"));
  }

  #[tokio::test]
  async fn non_utf8_downloader_output_does_not_abort_before_a_utf8_qr_row() {
    let input = b"Using filelist: C:\\Users\\Andr\xe9\\required.txt\r\nQR code:\r\n\xe2\x96\x88\xe2\x96\x84\xe2\x96\x80\r\nDownloading depot 381450\n";
    let mut lines = DownloaderLines::new(input.as_slice());
    let first = lines
      .next_line()
      .await
      .expect("Non-UTF-8 downloader output must not abort setup")
      .unwrap();
    assert!(first.starts_with("Using filelist:"));
    assert_eq!(
      lines.next_line().await.unwrap().as_deref(),
      Some("QR code:")
    );
    assert_eq!(lines.next_line().await.unwrap().as_deref(), Some("█▄▀"));
    assert_eq!(
      lines.next_line().await.unwrap().as_deref(),
      Some("Downloading depot 381450")
    );
  }

  #[tokio::test]
  async fn windows_oem_qr_cells_survive_decoding() {
    let input = b"QR code:\r\n \xdb\xdc\xdf \xdb\xdc\xdf \xdb\xdc\xdf \r\n";
    let mut lines = DownloaderLines::new(input.as_slice());
    assert_eq!(
      lines.next_line().await.unwrap().as_deref(),
      Some("QR code:")
    );
    let row = lines.next_line().await.unwrap().unwrap();
    assert_eq!(row, " █▄▀ █▄▀ █▄▀ ");
    assert!(row.chars().count() > 10 && row.chars().all(|c| matches!(c, ' ' | '█' | '▀' | '▄')));
  }

  #[tokio::test]
  async fn pipe_reads_preserve_empty_lines_and_unterminated_final_diagnostics() {
    let input = b"\r\n\nDownload error: \xff\xfe";
    let mut lines = DownloaderLines::new(input.as_slice());
    assert_eq!(lines.next_line().await.unwrap().as_deref(), Some(""));
    assert_eq!(lines.next_line().await.unwrap().as_deref(), Some(""));
    assert!(
      lines
        .next_line()
        .await
        .unwrap()
        .unwrap()
        .starts_with("Download error:")
    );
    assert!(lines.next_line().await.unwrap().is_none());
  }

  #[tokio::test]
  async fn cancelled_pipe_reads_keep_partial_lines_and_split_utf8_qr_cells() {
    let (mut writer, reader) = tokio::io::duplex(128);
    let mut lines = DownloaderLines::new(reader);
    writer.write_all(b"QR co").await.unwrap();
    assert!(
      tokio::time::timeout(Duration::from_millis(10), lines.next_line())
        .await
        .is_err()
    );
    writer.write_all(b"de:\r\n").await.unwrap();
    assert_eq!(
      lines.next_line().await.unwrap().as_deref(),
      Some("QR code:")
    );
    writer.write_all(&[0xe2, 0x96]).await.unwrap();
    assert!(
      tokio::time::timeout(Duration::from_millis(10), lines.next_line())
        .await
        .is_err()
    );
    writer.write_all(&[0x88, b'\r', b'\n']).await.unwrap();
    assert_eq!(lines.next_line().await.unwrap().as_deref(), Some("█"));
  }
}
