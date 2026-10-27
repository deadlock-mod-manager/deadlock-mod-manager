use crate::{
  app_runtime::{AppHandle, AppRuntime},
  errors::Error,
};
use serde::Serialize;
use std::sync::Mutex;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder, Window, WindowEvent};
use ts_rs::TS;

pub const COMPARISON_WINDOW: &str = "workbench-compare";
#[derive(Clone, Default, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ModdingComparisonWindow {
  pub snapshot: String,
  pub detached: bool,
  pub dirty: bool,
}
static COMPARISON: Mutex<ModdingComparisonWindow> = Mutex::new(ModdingComparisonWindow {
  snapshot: String::new(),
  detached: false,
  dirty: false,
});

#[tauri::command]
pub fn get_modding_comparison_window() -> Result<ModdingComparisonWindow, Error> {
  COMPARISON
    .lock()
    .map(|state| state.clone())
    .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))
}

fn validate_snapshot(snapshot: &str) -> Result<(), Error> {
  if snapshot.len() > 128 * 1024 {
    return Err(Error::InvalidInput(
      "Comparison state exceeds 128 KB".into(),
    ));
  }
  serde_json::from_str::<serde_json::Value>(snapshot)
    .map_err(|error| Error::InvalidInput(error.to_string()))?;
  Ok(())
}

#[tauri::command]
pub async fn open_modding_comparison_window(app: AppHandle, snapshot: String) -> Result<(), Error> {
  if let Some(window) = app.get_webview_window(COMPARISON_WINDOW) {
    window.unminimize()?;
    window.show()?;
    window.set_focus()?;
    return Ok(());
  }
  validate_snapshot(&snapshot)?;
  *COMPARISON
    .lock()
    .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))? = ModdingComparisonWindow {
    snapshot,
    detached: true,
    dirty: false,
  };
  if let Err(error) = WebviewWindowBuilder::new(
    &app,
    COMPARISON_WINDOW,
    WebviewUrl::App("index.html".into()),
  )
  .title("DMM Workbench — Comparison")
  .inner_size(1280.0, 850.0)
  .min_inner_size(760.0, 520.0)
  .decorations(true)
  .disable_drag_drop_handler()
  .build()
  {
    COMPARISON
      .lock()
      .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
      .detached = false;
    return Err(Error::InvalidInput(format!(
      "Failed to create comparison window: {error}"
    )));
  }
  app.emit(
    "workbench-comparison-changed",
    get_modding_comparison_window()?,
  )?;
  Ok(())
}

#[tauri::command]
pub fn update_modding_comparison_window(
  app: AppHandle,
  window: tauri::WebviewWindow<AppRuntime>,
  snapshot: String,
  dirty: bool,
) -> Result<(), Error> {
  if window.label() != COMPARISON_WINDOW {
    return Err(Error::InvalidInput(
      "Only the comparison window can update its state".into(),
    ));
  }
  validate_snapshot(&snapshot)?;
  {
    let mut state = COMPARISON
      .lock()
      .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?;
    state.snapshot = snapshot;
    state.dirty = dirty;
  }
  app.emit(
    "workbench-comparison-changed",
    get_modding_comparison_window()?,
  )?;
  Ok(())
}

#[tauri::command]
pub fn keep_main_for_comparison(app: AppHandle) -> Result<bool, Error> {
  if app.get_webview_window(COMPARISON_WINDOW).is_some() {
    if let Some(main) = app.get_webview_window("main") {
      main.hide()?;
    }
    return Ok(true);
  }
  Ok(false)
}

pub fn handle_window_event(window: &Window<AppRuntime>, event: &WindowEvent) {
  if window.label() == "main"
    && let WindowEvent::CloseRequested { api, .. } = event
    && window
      .app_handle()
      .get_webview_window(COMPARISON_WINDOW)
      .is_some()
  {
    api.prevent_close();
    let _ = window.hide();
  }
  if window.label() == COMPARISON_WINDOW && matches!(event, WindowEvent::Destroyed) {
    if let Ok(mut state) = COMPARISON.lock() {
      state.detached = false;
      state.dirty = false;
    }
    if let Ok(state) = get_modding_comparison_window() {
      let _ = window
        .app_handle()
        .emit("workbench-comparison-changed", state);
    }
    if let Some(main) = window.app_handle().get_webview_window("main")
      && !main.is_visible().unwrap_or(true)
    {
      let _ = main.show();
    }
  }
}
