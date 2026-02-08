use crate::errors::Error;

pub fn show_in_folder(path: &str) -> Result<(), Error> {
  tauri_plugin_opener::open_path(path, None::<&str>)
    .map_err(|e| Error::InvalidInput(format!("Failed to open folder: {e}")))
}

pub fn show_file_in_folder(file_path: &str) -> Result<(), Error> {
  tauri_plugin_opener::reveal_item_in_dir(file_path)
    .map_err(|e| Error::InvalidInput(format!("Failed to reveal file in folder: {e}")))
}

pub fn open_file_with_editor(file_path: &str) -> Result<(), Error> {
  tauri_plugin_opener::open_path(file_path, None::<&str>)
    .map_err(|e| Error::InvalidInput(format!("Failed to open file: {e}")))
}
