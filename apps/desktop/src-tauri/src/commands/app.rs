use crate::app_runtime::AppHandle;
use crate::errors::Error;
use serde::Serialize;
use tauri::{Emitter, Manager};

use super::state::{API_URL, MANAGER};

#[derive(Serialize)]
pub struct FilesystemWritableStatus {
  pub addons_writable: bool,
  pub gameinfo_writable: bool,
}

#[tauri::command]
pub async fn set_api_url(api_url: String) -> Result<(), Error> {
  log::info!("Setting API URL to: {api_url}");

  if !api_url.starts_with("http://") && !api_url.starts_with("https://") {
    return Err(Error::InvalidInput(
      "API URL must start with http:// or https://".to_string(),
    ));
  }

  if let Ok(mut url) = API_URL.lock() {
    *url = api_url;
  } else {
    return Err(Error::InvalidInput(
      "Failed to acquire API URL lock".to_string(),
    ));
  }

  Ok(())
}

#[tauri::command]
pub async fn set_language(app_handle: AppHandle, language: String) -> Result<(), Error> {
  log::info!("Setting language to: {language}");

  let supported_languages = [
    "en", "de-DE", "fr-FR", "ar-SA", "pl-PL", "de-CH", "th-TH", "tr-TR", "ru-RU", "zh-CN", "zh-TW",
    "es-ES", "pt-BR", "it-IT", "ja-JP", "ko-KR", "bg-BG", "be-BY",
  ];
  if !supported_languages.contains(&language.as_str()) {
    return Err(Error::InvalidInput(format!(
      "Unsupported language: {language}"
    )));
  }

  if let Some(window) = app_handle.get_webview_window("main") {
    window.emit("set-language", &language)?;
  }

  Ok(())
}

#[tauri::command]
pub async fn is_auto_update_disabled() -> Result<bool, Error> {
  let cli_args = crate::cli::get_cli_args();
  let disabled = cli_args.disable_auto_update;

  log::info!("Auto-update disabled via CLI flag: {disabled}");
  Ok(disabled)
}

#[tauri::command]
pub async fn is_linux_gpu_optimization_active() -> Result<bool, Error> {
  #[cfg(target_os = "linux")]
  {
    let active = std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").is_ok();
    log::info!("Linux GPU compat workaround active: {active}");
    Ok(active)
  }

  #[cfg(not(target_os = "linux"))]
  {
    Ok(false)
  }
}

#[tauri::command]
pub fn get_runtime_kind() -> &'static str {
  if cfg!(feature = "cef") { "cef" } else { "wry" }
}

#[tauri::command]
pub async fn check_filesystem_writable() -> Result<FilesystemWritableStatus, Error> {
  let mod_manager = MANAGER.lock().unwrap();
  let game_path = match mod_manager.get_steam_manager().get_game_path() {
    Some(path) => path.clone(),
    None => {
      return Ok(FilesystemWritableStatus {
        addons_writable: false,
        gameinfo_writable: false,
      });
    }
  };
  drop(mod_manager);

  let addons_path = game_path.join("game").join("citadel").join("addons");
  let gameinfo_path = game_path.join("game").join("citadel").join("gameinfo.gi");

  let addons_writable = {
    let test_file = addons_path.join(".write_test");
    match std::fs::OpenOptions::new()
      .write(true)
      .create(true)
      .truncate(true)
      .open(&test_file)
    {
      Ok(_) => {
        let _ = std::fs::remove_file(&test_file);
        true
      }
      Err(_) => false,
    }
  };

  let gameinfo_writable = {
    std::fs::OpenOptions::new()
      .append(true)
      .open(&gameinfo_path)
      .is_ok()
  };

  Ok(FilesystemWritableStatus {
    addons_writable,
    gameinfo_writable,
  })
}
