use crate::app_runtime::AppHandle;
use crate::errors::Error;
use crate::install_sources::{self, InstallLink, SourceInstall};
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};

/// Bytes between progress messages, so a fast connection does not flood the
/// webview.
const PROGRESS_STEP: u64 = 512 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedSourceInstall {
  path: String,
  /// From the manifest this download used, which may be newer than the one
  /// the user confirmed.
  file_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceInstallProgress {
  downloaded: u64,
  total: Option<u64>,
}

fn link(source: &str, mod_id: &str, release_id: &str) -> Result<InstallLink, Error> {
  install_sources::install_link(source, mod_id, release_id)
    .ok_or_else(|| Error::InvalidInput("Invalid install link".to_string()))
}

/// Hands the window every link that arrived since it last asked.
#[tauri::command]
pub fn take_pending_source_installs() -> Vec<InstallLink> {
  install_sources::take_pending()
}

/// Fetches and checks the manifest so the user can see what the link installs.
#[tauri::command]
pub async fn resolve_source_install(
  source: String,
  mod_id: String,
  release_id: String,
) -> Result<SourceInstall, Error> {
  install_sources::resolve(&link(&source, &mod_id, &release_id)?).await
}

/// Resolves the manifest again rather than trusting anything the renderer
/// holds, then downloads and verifies the file.
#[tauri::command]
pub async fn download_source_install(
  source: String,
  mod_id: String,
  release_id: String,
  on_progress: tauri::ipc::Channel<SourceInstallProgress>,
) -> Result<StagedSourceInstall, Error> {
  let install = install_sources::resolve(&link(&source, &mod_id, &release_id)?).await?;
  let last_reported = AtomicU64::new(0);

  let path = install_sources::download(&install, move |downloaded, total| {
    let last = last_reported.load(Ordering::Relaxed);
    if downloaded >= last + PROGRESS_STEP || total == Some(downloaded) {
      last_reported.store(downloaded, Ordering::Relaxed);
      let _ = on_progress.send(SourceInstallProgress { downloaded, total });
    }
  })
  .await?;

  log::info!(
    "Staged {} from {} for installation",
    install.file_name,
    install.source_name
  );
  Ok(StagedSourceInstall {
    path: path.to_string_lossy().into_owned(),
    file_name: install.file_name,
  })
}

/// Moves a staged download into the mod's folder. Unguarded like the forge
/// payload: it only touches app data, and the later install into the game is
/// guarded.
#[tauri::command]
pub async fn place_source_install(
  app_handle: AppHandle,
  path: String,
  destination: String,
) -> Result<(), Error> {
  let staged = install_sources::peek_staged(&path)?;
  let mods_root = crate::mod_manager::mods_store::dir(&app_handle)?;
  let destination = super::forge::contained_destination(&mods_root, &destination)?;

  if let Some(parent) = destination.parent() {
    tokio::fs::create_dir_all(parent).await?;
  }

  if tokio::fs::rename(&staged, &destination).await.is_err() {
    tokio::fs::copy(&staged, &destination).await?;
  }

  Ok(())
}

/// Deletes the staged download's temporary folder, placed or not.
#[tauri::command]
pub async fn finish_source_install(path: String) -> Result<(), Error> {
  let staged = install_sources::take_staged(&path)?;

  if let Some(dir) = staged.parent()
    && let Err(error) = tokio::fs::remove_dir_all(dir).await
    && error.kind() != std::io::ErrorKind::NotFound
  {
    log::warn!(
      "Could not remove staged download {}: {error}",
      dir.display()
    );
  }

  Ok(())
}
