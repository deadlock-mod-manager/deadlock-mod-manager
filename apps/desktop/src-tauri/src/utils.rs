use crate::errors::Error;

#[cfg(target_os = "linux")]
mod linux_impl {
  include!("utils_linux.rs");
}

pub fn show_in_folder(path: &str) -> Result<(), Error> {
  #[cfg(target_os = "linux")]
  {
    linux_impl::open_path_linux(path)
  }

  #[cfg(not(target_os = "linux"))]
  {
    tauri_plugin_opener::open_path(path, None::<&str>)
      .map_err(|e| Error::InvalidInput(format!("Failed to open folder: {e}")))
  }
}

pub fn show_file_in_folder(file_path: &str) -> Result<(), Error> {
  #[cfg(target_os = "linux")]
  {
    linux_impl::reveal_item_in_dir_linux(file_path)
  }

  #[cfg(not(target_os = "linux"))]
  {
    tauri_plugin_opener::reveal_item_in_dir(file_path)
      .map_err(|e| Error::InvalidInput(format!("Failed to reveal file in folder: {e}")))
  }
}

pub fn open_file_with_editor(file_path: &str) -> Result<(), Error> {
  #[cfg(target_os = "linux")]
  {
    linux_impl::open_path_linux(file_path)
  }

  #[cfg(not(target_os = "linux"))]
  {
    tauri_plugin_opener::open_path(file_path, None::<&str>)
      .map_err(|e| Error::InvalidInput(format!("Failed to open file: {e}")))
  }
}
