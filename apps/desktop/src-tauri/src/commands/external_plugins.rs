//! External plugin administration and the relay for embedded plugin frames.
//! Plugin frames cannot reach these: they have no IPC (see
//! `external_plugins::frames`) and talk to the app page through `postMessage`.

use crate::errors::Error;
use crate::external_plugins::download;
use dmm_plugin_runtime::{ExternalPluginActivity, ExternalPluginSummary, PluginHost};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;

fn ensure_supported() -> Result<(), Error> {
  if cfg!(feature = "cef") {
    return Err(Error::InvalidInput(
      "External plugins are not supported on the CEF runtime yet".into(),
    ));
  }
  if !cfg!(windows) {
    return Err(Error::InvalidInput(
      "External plugin isolation is currently verified only on Windows".into(),
    ));
  }
  Ok(())
}

fn ensure_enabled(host: &PluginHost) -> Result<(), Error> {
  ensure_supported()?;
  if !host.runtime_enabled() {
    return Err(Error::InvalidInput("Plugins are disabled".into()));
  }
  Ok(())
}

#[tauri::command]
pub async fn external_plugins_set_enabled(
  host: State<'_, Arc<PluginHost>>,
  enabled: bool,
) -> Result<(), Error> {
  if enabled {
    ensure_supported()?;
  }
  let host = Arc::clone(&host);
  blocking(move || {
    host.set_runtime_enabled(enabled);
    Ok(())
  })
  .await
}

async fn blocking<T: Send + 'static>(
  task: impl FnOnce() -> Result<T, Error> + Send + 'static,
) -> Result<T, Error> {
  tauri::async_runtime::spawn_blocking(task)
    .await
    .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}

#[tauri::command]
pub async fn external_plugins_list(
  host: State<'_, Arc<PluginHost>>,
) -> Result<Vec<ExternalPluginSummary>, Error> {
  ensure_enabled(&host)?;

  Ok(host.list())
}

#[tauri::command]
pub async fn external_plugins_install(
  host: State<'_, Arc<PluginHost>>,
  archive_path: String,
) -> Result<ExternalPluginSummary, Error> {
  ensure_enabled(&host)?;

  let host = Arc::clone(&host);
  blocking(move || {
    host
      .install(&PathBuf::from(archive_path))
      .map_err(Error::from)
  })
  .await
}

/// Downloads a catalog archive over https and installs it once its SHA-256
/// matches `sha256` (64 lowercase hex characters).
#[tauri::command]
pub async fn external_plugins_install_url(
  host: State<'_, Arc<PluginHost>>,
  url: String,
  sha256: String,
) -> Result<ExternalPluginSummary, Error> {
  ensure_enabled(&host)?;

  let url = download::https_url(&url)?;
  if !download::is_sha256(&sha256) {
    return Err(Error::InvalidInput(
      "Expected a lowercase hex SHA-256".into(),
    ));
  }
  let archive = download::fetch_archive(url).await?;
  let host = Arc::clone(&host);
  blocking(move || host.install_catalog(&archive, &sha256).map_err(Error::from)).await
}

/// Installs the update waiting for permission approval; its requests become
/// the grant.
#[tauri::command]
pub async fn external_plugins_apply_update(
  host: State<'_, Arc<PluginHost>>,
  plugin_id: String,
) -> Result<ExternalPluginSummary, Error> {
  ensure_enabled(&host)?;

  let host = Arc::clone(&host);
  blocking(move || host.apply_update(&plugin_id).map_err(Error::from)).await
}

#[tauri::command]
pub async fn external_plugins_discard_update(
  host: State<'_, Arc<PluginHost>>,
  plugin_id: String,
) -> Result<(), Error> {
  ensure_enabled(&host)?;
  let host = Arc::clone(&host);
  blocking(move || host.discard_update(&plugin_id).map_err(Error::from)).await
}

/// Newest first. `limit` is clamped to 1-100 and defaults to 100.
#[tauri::command]
pub async fn external_plugins_activity(
  host: State<'_, Arc<PluginHost>>,
  plugin_id: String,
  limit: Option<usize>,
) -> Result<Vec<ExternalPluginActivity>, Error> {
  ensure_enabled(&host)?;
  let host = Arc::clone(&host);
  blocking(move || {
    host
      .activity(&plugin_id, limit.unwrap_or(usize::MAX))
      .map_err(Error::from)
  })
  .await
}

#[tauri::command]
pub async fn external_plugins_clear_data(
  host: State<'_, Arc<PluginHost>>,
  plugin_id: String,
) -> Result<(), Error> {
  ensure_enabled(&host)?;
  let host = Arc::clone(&host);
  blocking(move || host.clear_data(&plugin_id).map_err(Error::from)).await
}

/// Grants every required permission. `file_path` is the file or folder the
/// user picked for `files`, `profile_folder` the profile picked for `mods`
/// (`"default"` for the default profile); each is required exactly when the
/// manifest asks for it.
#[tauri::command]
pub async fn external_plugins_grant(
  host: State<'_, Arc<PluginHost>>,
  plugin_id: String,
  file_path: Option<String>,
  profile_folder: Option<String>,
) -> Result<(), Error> {
  ensure_enabled(&host)?;

  let host = Arc::clone(&host);
  blocking(move || {
    host
      .grant(&plugin_id, file_path.as_deref(), profile_folder.as_deref())
      .map(drop)
      .map_err(Error::from)
  })
  .await
}

#[tauri::command]
pub async fn external_plugins_revoke(
  host: State<'_, Arc<PluginHost>>,
  plugin_id: String,
) -> Result<(), Error> {
  ensure_enabled(&host)?;
  let host = Arc::clone(&host);
  blocking(move || host.revoke(&plugin_id).map(drop).map_err(Error::from)).await
}

#[tauri::command]
pub async fn external_plugins_enable(
  host: State<'_, Arc<PluginHost>>,
  plugin_id: String,
  enabled: bool,
) -> Result<(), Error> {
  ensure_enabled(&host)?;
  let host = Arc::clone(&host);
  blocking(move || {
    host
      .set_enabled(&plugin_id, enabled)
      .map(drop)
      .map_err(Error::from)
  })
  .await
}

#[tauri::command]
pub async fn external_plugins_remove(
  host: State<'_, Arc<PluginHost>>,
  plugin_id: String,
) -> Result<(), Error> {
  ensure_enabled(&host)?;
  let host = Arc::clone(&host);
  blocking(move || host.remove(&plugin_id).map_err(Error::from)).await
}

/// Relays a call from an embedded plugin frame. The embedding page names the
/// plugin from the frame element it created, never from the frame's message.
#[tauri::command]
pub async fn external_plugins_frame_call(
  host: State<'_, Arc<PluginHost>>,
  plugin_id: String,
  command: String,
  payload_json: String,
) -> Result<String, Error> {
  ensure_enabled(&host)?;

  let host = Arc::clone(&host);
  blocking(move || {
    let view = host.view(&plugin_id)?;
    host
      .ui_call(&view.plugin_id, view.generation, &command, &payload_json)
      .map_err(|denied| {
        Error::ExternalPluginSession(format!("{}: {}", denied.code(), denied.message()))
      })
  })
  .await
}
