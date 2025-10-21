use crate::errors::Error;
use std::process::Command;

pub fn show_in_folder(path: &str) -> Result<(), Error> {
  #[cfg(target_os = "windows")]
  {
    match Command::new("explorer").arg(path).spawn() {
      Ok(_) => Ok(()),
      Err(e) => Err(Error::InvalidInput(format!("Failed to open folder: {}", e))),
    }
  }
  #[cfg(target_os = "linux")]
  {
    match Command::new("xdg-open").arg(path).spawn() {
      Ok(_) => Ok(()),
      Err(e) => Err(Error::InvalidInput(format!("Failed to open folder: {}", e))),
    }
  }
  #[cfg(target_os = "macos")]
  {
    match Command::new("open").arg(path).spawn() {
      Ok(_) => Ok(()),
      Err(e) => Err(Error::InvalidInput(format!("Failed to open folder: {}", e))),
    }
  }
}

pub fn show_file_in_folder(file_path: &str) -> Result<(), Error> {
  #[cfg(target_os = "windows")]
  {
    match Command::new("explorer")
      .args(["/select,", file_path])
      .spawn()
    {
      Ok(_) => Ok(()),
      Err(e) => Err(Error::InvalidInput(format!("Failed to open folder: {}", e))),
    }
  }
  #[cfg(target_os = "linux")]
  {
    let path = std::path::Path::new(file_path);
    if let Some(parent) = path.parent() {
      match Command::new("xdg-open").arg(parent).spawn() {
        Ok(_) => Ok(()),
        Err(e) => Err(Error::InvalidInput(format!("Failed to open folder: {}", e))),
      }
    } else {
      Err(Error::InvalidInput("Invalid file path".to_string()))
    }
  }
  #[cfg(target_os = "macos")]
  {
    match Command::new("open").args(["-R", file_path]).spawn() {
      Ok(_) => Ok(()),
      Err(e) => Err(Error::InvalidInput(format!("Failed to open folder: {}", e))),
    }
  }
}

pub fn open_file_with_editor(file_path: &str) -> Result<(), Error> {
  #[cfg(target_os = "windows")]
  {
    match Command::new("cmd")
      .args(["/c", "start", "", file_path])
      .spawn()
    {
      Ok(_) => Ok(()),
      Err(e) => Err(Error::InvalidInput(format!(
        "Failed to open file: {}",
        e.to_string()
      ))),
    }
  }
  #[cfg(target_os = "linux")]
  {
    match Command::new("xdg-open").arg(file_path).spawn() {
      Ok(_) => Ok(()),
      Err(e) => Err(Error::InvalidInput(format!(
        "Failed to open file: {}",
        e.to_string()
      ))),
    }
  }
  #[cfg(target_os = "macos")]
  {
    match Command::new("open").arg(file_path).spawn() {
      Ok(_) => Ok(()),
      Err(e) => Err(Error::InvalidInput(format!(
        "Failed to open file: {}",
        e.to_string()
      ))),
    }
  }
}
