use crate::errors::Error;
use std::path::PathBuf;
use std::process::{Command, Stdio};

fn is_appimage() -> bool {
  std::env::var_os("APPIMAGE").is_some_and(|v| !v.is_empty())
}

fn safe_current_dir_for_open() -> PathBuf {
  std::env::var_os("HOME")
    .map(PathBuf::from)
    .or_else(|| std::env::var_os("OWD").map(PathBuf::from))
    .unwrap_or_else(|| PathBuf::from("/"))
}

fn try_gio_open(target: &str, current_dir: &PathBuf) -> Result<(), Error> {
  log::debug!("Trying gio open for: {target}");
  Command::new("gio")
    .arg("open")
    .arg(target)
    .current_dir(current_dir)
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .spawn()
    .map_err(|e| Error::InvalidInput(format!("Failed to spawn gio: {e}")))?;
  Ok(())
}

fn try_xdg_open(target: &str, current_dir: &PathBuf) -> Result<(), Error> {
  log::debug!("Trying xdg-open for: {target}");
  Command::new("xdg-open")
    .arg(target)
    .current_dir(current_dir)
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .spawn()
    .map_err(|e| Error::InvalidInput(format!("Failed to spawn xdg-open: {e}")))?;
  Ok(())
}

pub fn open_path_linux(path: &str) -> Result<(), Error> {
  if is_appimage() {
    let current_dir = safe_current_dir_for_open();
    log::info!(
      "AppImage detected, opening path with current_dir: {}",
      current_dir.display()
    );

    try_gio_open(path, &current_dir).or_else(|gio_err| {
      log::debug!("gio open failed: {gio_err}, trying xdg-open");
      try_xdg_open(path, &current_dir)
    })
  } else {
    tauri_plugin_opener::open_path(path, None::<&str>)
      .map_err(|e| Error::InvalidInput(format!("Failed to open path: {e}")))
  }
}

pub fn open_url_linux(url: &str) -> Result<(), Error> {
  if is_appimage() {
    let current_dir = safe_current_dir_for_open();
    log::info!(
      "AppImage detected, opening URL with current_dir: {}",
      current_dir.display()
    );

    try_gio_open(url, &current_dir).or_else(|gio_err| {
      log::debug!("gio open failed: {gio_err}, trying xdg-open");
      try_xdg_open(url, &current_dir)
    })
  } else {
    tauri_plugin_opener::open_url(url, None::<&str>)
      .map_err(|e| Error::InvalidInput(format!("Failed to open URL: {e}")))
  }
}

pub fn reveal_item_in_dir_linux(file_path: &str) -> Result<(), Error> {
  if is_appimage() {
    let current_dir = safe_current_dir_for_open();
    log::info!(
      "AppImage detected, revealing file with current_dir: {}",
      current_dir.display()
    );

    let path = std::path::Path::new(file_path);
    let parent = path
      .parent()
      .ok_or_else(|| Error::InvalidInput("File path has no parent directory".to_string()))?;

    try_gio_open(parent.to_str().unwrap_or(""), &current_dir).or_else(|gio_err| {
      log::debug!("gio open failed: {gio_err}, trying xdg-open");
      try_xdg_open(parent.to_str().unwrap_or(""), &current_dir)
    })
  } else {
    tauri_plugin_opener::reveal_item_in_dir(file_path)
      .map_err(|e| Error::InvalidInput(format!("Failed to reveal file in folder: {e}")))
  }
}

pub fn launch_steam_uri_linux(steam_uri: &str) -> Result<(), Error> {
  let current_dir = if is_appimage() {
    let dir = safe_current_dir_for_open();
    log::info!(
      "AppImage detected, launching Steam URI with current_dir: {}",
      dir.display()
    );
    dir
  } else {
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/"))
  };

  Command::new("xdg-open")
    .arg(steam_uri)
    .current_dir(current_dir)
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .spawn()
    .map_err(|e| Error::GameLaunchFailed(e.to_string()))?;

  Ok(())
}
