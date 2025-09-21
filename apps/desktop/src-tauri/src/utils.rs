use crate::errors::Error;
use std::process::Command;

pub fn show_in_folder(path: &str) -> Result<(), Error> {
  #[cfg(target_os = "windows")]
  {
    match Command::new("explorer").arg(path).spawn() {
      Ok(_) => Ok(()),
      Err(e) => Err(Error::FailedToOpenFolder(e.to_string())),
    }
  }
  #[cfg(target_os = "linux")]
  {
    match Command::new("xdg-open").arg(path).spawn() {
      Ok(_) => Ok(()),
      Err(e) => Err(Error::FailedToOpenFolder(e.to_string())),
    }
  }
  #[cfg(target_os = "macos")]
  {
    match Command::new("open").arg(path).spawn() {
      Ok(_) => Ok(()),
      Err(e) => Err(Error::FailedToOpenFolder(e.to_string())),
    }
  }
}

/// Show a specific file selected in the file explorer
pub fn show_file_in_folder(file_path: &str) -> Result<(), Error> {
  #[cfg(target_os = "windows")]
  {
    match Command::new("explorer")
      .args(["/select,", file_path])
      .spawn()
    {
      Ok(_) => Ok(()),
      Err(e) => Err(Error::FailedToOpenFolder(e.to_string())),
    }
  }
  #[cfg(target_os = "linux")]
  {
    // For Linux, we'll open the containing folder since there's no universal way to select a file
    let path = std::path::Path::new(file_path);
    if let Some(parent) = path.parent() {
      match Command::new("xdg-open").arg(parent).spawn() {
        Ok(_) => Ok(()),
        Err(e) => Err(Error::FailedToOpenFolder(e.to_string())),
      }
    } else {
      Err(Error::FailedToOpenFolder("Invalid file path".to_string()))
    }
  }
  #[cfg(target_os = "macos")]
  {
    match Command::new("open").args(["-R", file_path]).spawn() {
      Ok(_) => Ok(()),
      Err(e) => Err(Error::FailedToOpenFolder(e.to_string())),
    }
  }
}

/// Open a file with the system's default editor
pub fn open_file_with_editor(file_path: &str) -> Result<(), Error> {
  #[cfg(target_os = "windows")]
  {
    // Use notepad as a fallback, or let the system choose the default editor
    match Command::new("cmd")
      .args(["/c", "start", "", file_path])
      .spawn()
    {
      Ok(_) => Ok(()),
      Err(e) => Err(Error::FailedToOpenFolder(format!(
        "Failed to open file: {}",
        e.to_string()
      ))),
    }
  }
  #[cfg(target_os = "linux")]
  {
    match Command::new("xdg-open").arg(file_path).spawn() {
      Ok(_) => Ok(()),
      Err(e) => Err(Error::FailedToOpenFolder(format!(
        "Failed to open file: {}",
        e.to_string()
      ))),
    }
  }
  #[cfg(target_os = "macos")]
  {
    match Command::new("open").arg(file_path).spawn() {
      Ok(_) => Ok(()),
      Err(e) => Err(Error::FailedToOpenFolder(format!(
        "Failed to open file: {}",
        e.to_string()
      ))),
    }
  }
}
