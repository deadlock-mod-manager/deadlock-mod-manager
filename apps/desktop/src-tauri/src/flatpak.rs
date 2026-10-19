use std::path::{Path, PathBuf};
use std::process::Stdio;

use crate::app_runtime::AppHandle;
use tauri::Emitter;
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

  if ![
    "/deadlock-mod-manager.flatpak",
    "/deadlock-mod-manager-cef.flatpak",
  ]
  .iter()
  .any(|asset| parsed_url.path().ends_with(asset))
  {
    return Err(Error::InvalidInput(
      "Flatpak update URL must target a Deadlock Mod Manager Flatpak asset".to_string(),
    ));
  }

  Ok(parsed_url)
}

fn bundle_directory(cache: &Path) -> Result<tempfile::TempDir, Error> {
  std::fs::create_dir_all(cache)?;
  // Flatpak's /tmp is private; the app cache has the same path on the host.
  Ok(
    tempfile::Builder::new()
      .prefix("dmm-update-")
      .tempdir_in(cache)?,
  )
}

fn installed_in_user_directory(info: &str, user_location: &str) -> bool {
  let app_path = info.lines().find_map(|line| line.strip_prefix("app-path="));
  app_path.is_some_and(|path| Path::new(path) == Path::new(user_location.trim()).join("files"))
}

async fn installation_scope(app_id: &str) -> Result<&'static str, Error> {
  let info = tokio::fs::read_to_string("/.flatpak-info").await?;
  let user_installation = Command::new("flatpak-spawn")
    .args([
      "--host",
      "flatpak",
      "info",
      "--user",
      "--show-location",
      app_id,
    ])
    .output()
    .await?;
  Ok(
    if user_installation.status.success()
      && installed_in_user_directory(&info, std::str::from_utf8(&user_installation.stdout)?)
    {
      "--user"
    } else {
      "--system"
    },
  )
}

#[tauri::command]
pub async fn is_flatpak() -> Result<bool, Error> {
  Ok(running_in_flatpak())
}

pub(crate) fn running_in_flatpak() -> bool {
  std::env::var_os("FLATPAK_ID").is_some()
}

#[tauri::command]
pub async fn update_flatpak(app_handle: AppHandle, url: String) -> Result<(), Error> {
  if !running_in_flatpak() {
    return Err(Error::InvalidInput("Not running as a Flatpak".to_string()));
  }

  let validated_url = validate_update_url(&url)?;
  let app_id = std::env::var("FLATPAK_ID")
    .map_err(|e| Error::InvalidInput(format!("Missing Flatpak application ID: {e}")))?;
  let scope = installation_scope(&app_id).await?;
  let cache = std::env::var_os("XDG_CACHE_HOME")
    .map(PathBuf::from)
    .ok_or_else(|| Error::InvalidInput("Missing Flatpak cache directory".to_string()))?;
  download_and_install(
    validated_url,
    &cache,
    scope,
    Command::new("flatpak-spawn"),
    move |message| {
      let _ = app_handle.emit("flatpak-update-progress", message);
    },
  )
  .await
}

async fn download_and_install(
  url: reqwest::Url,
  cache: &Path,
  scope: &str,
  mut installer: Command,
  progress: impl Fn(&str) + Clone + Send + 'static,
) -> Result<(), Error> {
  let directory = bundle_directory(cache)?;
  let path = directory.path().join("update.flatpak");

  log::info!("Downloading Flatpak bundle from {url}");
  progress("Downloading update...");

  let mut response = reqwest::get(url)
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
  progress("Installing update...");

  let mut child = installer
    .args([
      "--host",
      "flatpak",
      "install",
      scope,
      "--reinstall",
      "--noninteractive",
      &bundle_path_str,
    ])
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
    .map_err(|e| Error::InvalidInput(format!("Failed to spawn flatpak-spawn: {e}")))?;

  let stdout = child
    .stdout
    .take()
    .ok_or_else(|| Error::InvalidInput("Failed to capture flatpak install stdout".to_string()))?;
  let stderr = child
    .stderr
    .take()
    .ok_or_else(|| Error::InvalidInput("Failed to capture flatpak install stderr".to_string()))?;

  let stdout_progress = progress.clone();
  let stdout_task = tokio::spawn(async move {
    let mut lines = BufReader::new(stdout).lines();
    while let Ok(Some(line)) = lines.next_line().await {
      log::info!("[flatpak update] {line}");
      stdout_progress(&line);
    }
  });

  let stderr_task = tokio::spawn(async move {
    let mut lines = BufReader::new(stderr).lines();
    while let Ok(Some(line)) = lines.next_line().await {
      log::warn!("[flatpak update stderr] {line}");
      progress(&line);
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

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn accepts_both_flatpak_variants_on_stable_and_nightly_tags() {
    for tag in ["nightly", "v2.0.0"] {
      for asset in [
        "deadlock-mod-manager.flatpak",
        "deadlock-mod-manager-cef.flatpak",
      ] {
        let url = format!("https://github.com{ALLOWED_UPDATE_PATH_PREFIX}{tag}/{asset}");
        assert!(validate_update_url(&url).is_ok());
      }
    }
  }

  #[test]
  fn rejects_untrusted_urls_and_other_assets() {
    for url in [
      "http://github.com/deadlock-mod-manager/deadlock-mod-manager/releases/download/nightly/deadlock-mod-manager.flatpak",
      "https://example.com/deadlock-mod-manager/deadlock-mod-manager/releases/download/nightly/deadlock-mod-manager.flatpak",
      "https://github.com/other/repository/releases/download/nightly/deadlock-mod-manager.flatpak",
      "https://github.com/deadlock-mod-manager/deadlock-mod-manager/releases/download/nightly/other.flatpak",
      "https://github.com/deadlock-mod-manager/deadlock-mod-manager/releases/download/nightly/app.deb",
    ] {
      assert!(validate_update_url(url).is_err(), "accepted {url}");
    }
  }

  #[test]
  fn stages_and_cleans_bundles_in_the_host_visible_cache() {
    let root = tempfile::tempdir().unwrap();
    let cache = root.path().join("app-cache");
    let directory = bundle_directory(&cache).unwrap();
    let path = directory.path().join("update.flatpak");
    std::fs::write(&path, b"bundle").unwrap();
    assert!(path.starts_with(&cache));
    assert_eq!(std::fs::read(&path).unwrap(), b"bundle");
    drop(directory);
    assert!(!path.exists());
  }

  #[test]
  fn preserves_the_running_installation_when_user_and_system_copies_exist() {
    let user_location =
      "/home/player/.local/share/flatpak/app/dev.stormix.deadlock-mod-manager/x86_64/master/commit";
    assert!(installed_in_user_directory(
      &format!("[Instance]\napp-path={user_location}/files\n"),
      &format!("{user_location}\n"),
    ));
    assert!(!installed_in_user_directory(
      "[Instance]\napp-path=/var/lib/flatpak/app/dev.stormix.deadlock-mod-manager/x86_64/master/commit/files\n",
      user_location,
    ));
  }
}

#[cfg(all(test, target_os = "linux"))]
mod e2e_tests;
