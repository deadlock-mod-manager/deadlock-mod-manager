//! Linux builds have no tray (see Cargo.toml). The commands stay so the
//! frontend can call them, but the window is never hidden, since nothing
//! could bring it back.

use tauri::{Window, WindowEvent};

use crate::app_runtime::AppRuntime;
use crate::errors::Error;

#[tauri::command]
pub fn set_tray_behavior() -> Result<(), Error> {
  Ok(())
}

#[tauri::command]
pub fn hide_to_tray_on_close() -> bool {
  false
}

pub fn handle_window_event(_window: &Window<AppRuntime>, _event: &WindowEvent) {}
