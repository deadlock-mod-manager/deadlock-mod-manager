use deadlock_server_picker::{
  PickerError, ServerPicker, ServerPickerLatency, ServerPickerPreset, ServerPickerState,
};
use tauri::Manager;
use tokio::sync::OnceCell;

use crate::app_runtime::AppHandle;
use crate::errors::Error;

static PICKER: OnceCell<ServerPicker> = OnceCell::const_new();

impl From<PickerError> for Error {
  fn from(error: PickerError) -> Self {
    Self::ServerPicker {
      subcode: error.code(),
      message: error.to_string(),
    }
  }
}

async fn picker(app: &AppHandle) -> Result<&'static ServerPicker, Error> {
  // An isolated E2E world must never inspect or change the host firewall.
  if crate::runtime_environment::is_e2e_active() {
    return Err(Error::InvalidInput(
      "Server picker is unavailable in isolated E2E runs".into(),
    ));
  }
  PICKER
    .get_or_try_init(|| async {
      let directory = app.path().app_data_dir()?.join("server-picker");
      tokio::task::spawn_blocking(move || ServerPicker::new(directory))
        .await
        .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
        .map_err(Error::from)
    })
    .await
}

#[tauri::command]
pub async fn get_server_picker_state(app: AppHandle) -> Result<ServerPickerState, Error> {
  Ok(picker(&app).await?.state().await?)
}

#[tauri::command]
pub async fn refresh_server_picker_catalog(app: AppHandle) -> Result<ServerPickerState, Error> {
  Ok(picker(&app).await?.refresh().await?)
}

#[tauri::command]
pub async fn probe_server_picker(app: AppHandle) -> Result<Vec<ServerPickerLatency>, Error> {
  Ok(picker(&app).await?.probe().await?)
}

#[tauri::command]
pub async fn cancel_server_picker_probe() {
  if let Some(picker) = PICKER.get() {
    picker.cancel_probe();
  }
}

#[tauri::command]
pub async fn apply_server_picker(
  app: AppHandle,
  blocked_locations: Vec<String>,
) -> Result<ServerPickerState, Error> {
  let picker = picker(&app).await?;
  if blocked_locations.is_empty() {
    return Ok(picker.reset().await?);
  }
  if super::game::is_game_running().await? {
    return Err(Error::GameRunning);
  }
  let executable = super::state::game_path()?
    .join("game")
    .join("bin")
    .join("win64")
    .join("deadlock.exe");
  Ok(picker.apply(blocked_locations, executable).await?)
}

#[tauri::command]
pub async fn reset_server_picker(app: AppHandle) -> Result<ServerPickerState, Error> {
  Ok(picker(&app).await?.reset().await?)
}

#[tauri::command]
pub async fn save_server_picker_preset(
  app: AppHandle,
  name: String,
  blocked_locations: Vec<String>,
) -> Result<Vec<ServerPickerPreset>, Error> {
  Ok(
    picker(&app)
      .await?
      .save_preset(name, blocked_locations)
      .await?,
  )
}

#[tauri::command]
pub async fn delete_server_picker_preset(
  app: AppHandle,
  id: String,
) -> Result<Vec<ServerPickerPreset>, Error> {
  Ok(picker(&app).await?.delete_preset(id).await?)
}

#[cfg(test)]
mod bindings {
  use ts_rs::TS;

  #[test]
  fn export_bindings_server_picker() {
    deadlock_server_picker::ServerPickerState::export_all().unwrap();
    deadlock_server_picker::ServerPickerLatency::export_all().unwrap();
  }
}
