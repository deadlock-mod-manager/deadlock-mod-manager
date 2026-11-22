use std::sync::atomic::{AtomicBool, Ordering};

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, WebviewWindow, Window, WindowEvent};

use crate::app_runtime::{AppHandle, AppRuntime};
use crate::errors::Error;

const TRAY_ID: &str = "main";
const MAIN_WINDOW: &str = "main";
const MENU_SHOW: &str = "tray-show";
const MENU_QUIT: &str = "tray-quit";

static MINIMIZE_TO_TRAY: AtomicBool = AtomicBool::new(false);
static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(false);
/// Set by the tray's Quit item so the close that follows really exits.
static QUITTING: AtomicBool = AtomicBool::new(false);

pub fn show_main_window(app: &AppHandle) {
  if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
  }
}

fn quit(app: &AppHandle) {
  QUITTING.store(true, Ordering::Relaxed);
  // Closing goes through the frontend's close handler, which flushes the
  // store before the window is destroyed.
  match app.get_webview_window(MAIN_WINDOW) {
    Some(window) => {
      if window.close().is_err() {
        app.exit(0);
      }
    }
    None => app.exit(0),
  }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
  let show = MenuItem::with_id(
    app,
    MENU_SHOW,
    "Show Deadlock Mod Manager",
    true,
    None::<&str>,
  )?;
  let quit_item = MenuItem::with_id(app, MENU_QUIT, "Quit", true, None::<&str>)?;
  let menu = Menu::with_items(app, &[&show, &quit_item])?;

  let mut builder = TrayIconBuilder::with_id(TRAY_ID)
    .tooltip("Deadlock Mod Manager")
    .menu(&menu)
    .show_menu_on_left_click(false)
    .on_menu_event(|app, event| match event.id().as_ref() {
      MENU_SHOW => show_main_window(app),
      MENU_QUIT => quit(app),
      _ => {}
    })
    .on_tray_icon_event(|tray, event| {
      if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
      } = event
      {
        show_main_window(tray.app_handle());
      }
    });
  if let Some(icon) = app.default_window_icon() {
    builder = builder.icon(icon.clone());
  }
  builder.build(app)?;
  Ok(())
}

/// Mirrors the tray settings into the backend. The tray icon only exists while
/// one of them is on.
#[tauri::command]
pub fn set_tray_behavior(
  app: AppHandle,
  minimize_to_tray: bool,
  close_to_tray: bool,
) -> Result<(), Error> {
  let wanted = minimize_to_tray || close_to_tray;
  match (wanted, app.tray_by_id(TRAY_ID).is_some()) {
    (true, false) => build_tray(&app)?,
    (false, true) => {
      app.remove_tray_by_id(TRAY_ID);
    }
    _ => {}
  }

  // Stored only once the tray exists, so a failed build can't hide the window
  // with nothing to bring it back
  MINIMIZE_TO_TRAY.store(minimize_to_tray, Ordering::Relaxed);
  CLOSE_TO_TRAY.store(close_to_tray, Ordering::Relaxed);
  Ok(())
}

/// Asked by the frontend's close handler. Hides the window and returns true
/// when closing should send the app to the tray instead of exiting.
#[tauri::command]
pub fn hide_to_tray_on_close(window: WebviewWindow<AppRuntime>) -> bool {
  if QUITTING.load(Ordering::Relaxed) || !CLOSE_TO_TRAY.load(Ordering::Relaxed) {
    return false;
  }
  window.hide().is_ok()
}

pub fn handle_window_event(window: &Window<AppRuntime>, event: &WindowEvent) {
  if window.label() != MAIN_WINDOW || !MINIMIZE_TO_TRAY.load(Ordering::Relaxed) {
    return;
  }
  if let WindowEvent::Resized(_) = event
    && window.is_minimized().unwrap_or(false)
  {
    let _ = window.hide();
  }
}
