use crate::errors::Error;
use crate::install_sources::{self, InstallLink, SourceInstall};
use crate::staged_files::{self, Stager};
use serde::Serialize;
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct SourceInstallProgress {
  #[ts(type = "number")]
  downloaded: u64,
  #[ts(type = "number | null")]
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

/// Downloads and verifies the file from the manifest the user confirmed,
/// returning the staged path. Nothing the renderer holds is trusted.
#[tauri::command]
pub async fn download_source_install(
  source: String,
  mod_id: String,
  release_id: String,
  on_progress: tauri::ipc::Channel<SourceInstallProgress>,
) -> Result<String, Error> {
  let install = install_sources::take_resolved(&link(&source, &mod_id, &release_id)?)?;

  let path = install_sources::download(&install, move |downloaded, total| {
    let _ = on_progress.send(SourceInstallProgress { downloaded, total });
  })
  .await?;

  log::info!(
    "Staged {} from {} for installation",
    install.file_name,
    install.source_name
  );
  Ok(path.to_string_lossy().into_owned())
}

/// Deletes the staged download's temporary folder, placed or not.
#[tauri::command]
pub async fn finish_source_install(path: String) -> Result<(), Error> {
  let staged = staged_files::take(Stager::Source, &path)?;

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
