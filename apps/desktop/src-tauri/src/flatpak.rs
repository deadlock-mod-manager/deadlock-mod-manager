use std::path::PathBuf;
use std::process::Stdio;

use tauri::{AppHandle, Emitter};
use tokio::fs::File;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

use crate::errors::Error;

const ALLOWED_UPDATE_HOST: &str = "github.com";
const ALLOWED_UPDATE_PATH_PREFIX: &str =
  "/deadlock-mod-manager/deadlock-mod-manager/releases/download/";

fn validate_update_url(url: &str) -> Result<reqwest::Url, Error> {
  let parsed_url = reqwest::Url::parse(url)
    .map_err(|e| Error::InvalidInput(format!("Invalid Flatpak update URL: {e}")))?;

  if parsed_url.scheme() != "https" {
    return Err(Error::InvalidInput(
      "Flatpak update URL must use https".to_string(),
    ));
  }

  if parsed_url.host_str() != Some(ALLOWED_UPDATE_HOST)
    || !parsed_url.path().starts_with(ALLOWED_UPDATE_PATH_PREFIX)
  {
    return Err(Error::InvalidInput(
      "Flatpak update URL must point to this repository's GitHub releases".to_string(),
    ));
  }

  if !parsed_url.path().ends_with("/deadlock-mod-manager.flatpak") {
    return Err(Error::InvalidInput(
      "Flatpak update URL must target the deadlock-mod-manager.flatpak asset".to_string(),
    ));
  }

  Ok(parsed_url)
}

fn bundle_path() -> PathBuf {
  let timestamp = chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default();
  std::env::temp_dir().join(format!(
    "deadlock-mod-manager-{}-{timestamp}.flatpak",
    std::process::id(),
  ))
}

async fn cleanup_bundle(path: &PathBuf) {
  if let Err(error) = tokio::fs::remove_file(path).await {
    log::warn!(
      "Failed to remove temporary Flatpak bundle {}: {error}",
      path.display()
    );
  }
}

#[tauri::command]
pub async fn is_flatpak() -> Result<bool, Error> {
  Ok(std::env::var("FLATPAK_ID").is_ok())
}

#[tauri::command]
pub async fn update_flatpak(app_handle: AppHandle, url: String) -> Result<(), Error> {
  std::env::var("FLATPAK_ID")
    .map_err(|_| Error::InvalidInput("Not running as a Flatpak".to_string()))?;

  let validated_url = validate_update_url(&url)?;
  let path = bundle_path();

  let result: Result<(), Error> =
    async {
      log::info!("Downloading Flatpak bundle from {url}");
      let _ = app_handle.emit("flatpak-update-progress", "Downloading update...");

      let mut response = reqwest::get(validated_url)
        .await
        .map_err(|e| Error::InvalidInput(format!("Failed to download Flatpak bundle: {e}")))?;

      if !response.status().is_success() {
        return Err(Error::InvalidInput(format!(
          "Download failed with status: {}",
          response.status()
        )));
      }

      let mut bundle_file = File::create(&path)
        .await
        .map_err(|e| Error::InvalidInput(format!("Failed to create bundle file: {e}")))?;

      while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| Error::InvalidInput(format!("Failed to read download: {e}")))?
      {
        bundle_file
          .write_all(&chunk)
          .await
          .map_err(|e| Error::InvalidInput(format!("Failed to write bundle: {e}")))?;
      }

      bundle_file
        .flush()
        .await
        .map_err(|e| Error::InvalidInput(format!("Failed to flush bundle: {e}")))?;

      let bundle_path_str = path.to_string_lossy().to_string();
      log::info!("Downloaded Flatpak bundle to {bundle_path_str}");
      let _ = app_handle.emit("flatpak-update-progress", "Installing update...");

      let mut child = Command::new("flatpak-spawn")
        .args([
          "--host",
          "flatpak",
          "install",
          "--reinstall",
          "--noninteractive",
          &bundle_path_str,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| Error::InvalidInput(format!("Failed to spawn flatpak-spawn: {e}")))?;

      let stdout = child.stdout.take().ok_or_else(|| {
        Error::InvalidInput("Failed to capture flatpak install stdout".to_string())
      })?;
      let stderr = child.stderr.take().ok_or_else(|| {
        Error::InvalidInput("Failed to capture flatpak install stderr".to_string())
      })?;

      let app_stdout = app_handle.clone();
      let stdout_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
          log::info!("[flatpak update] {line}");
          let _ = app_stdout.emit("flatpak-update-progress", &line);
        }
      });

      let app_stderr = app_handle.clone();
      let stderr_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
          log::warn!("[flatpak update stderr] {line}");
          let _ = app_stderr.emit("flatpak-update-progress", &line);
        }
      });

      let status = child
        .wait()
        .await
        .map_err(|e| Error::InvalidInput(format!("Failed to wait on flatpak-spawn: {e}")))?;

      let _ = stdout_task.await;
      let _ = stderr_task.await;

      if status.success() {
        log::info!("Flatpak update completed successfully");
        Ok(())
      } else {
        let code = status.code().unwrap_or(-1);
        log::error!("Flatpak update failed with exit code {code}");
        Err(Error::InvalidInput(format!(
          "flatpak update exited with code {code}"
        )))
      }
    }
    .await;

  cleanup_bundle(&path).await;
  result
}
