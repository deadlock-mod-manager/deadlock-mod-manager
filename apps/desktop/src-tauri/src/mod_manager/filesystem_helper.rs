use crate::errors::Error;
use crate::utils;
use log;
use std::fs;
use std::path::Path;

/// Handles file system utility operations
pub struct FileSystemHelper;

impl FileSystemHelper {
  pub fn new() -> Self {
    Self
  }

  /// Open a folder in the system file explorer
  pub fn open_folder(&self, path: &str) -> Result<(), Error> {
    utils::show_in_folder(path)
  }

  /// Create directory recursively if it doesn't exist
  pub fn create_directories(&self, path: &Path) -> Result<(), Error> {
    if !path.exists() {
      log::info!("Creating directories: {:?}", path);
      fs::create_dir_all(path)?;
    }
    Ok(())
  }

  /// Remove directory and all its contents
  pub fn remove_directory_recursive(&self, path: &Path) -> Result<(), Error> {
    if path.exists() {
      log::info!("Removing directory recursively: {:?}", path);
      fs::remove_dir_all(path)?;
    }
    Ok(())
  }

  /// Remove a single file
  pub fn remove_file(&self, path: &Path) -> Result<(), Error> {
    if path.exists() {
      log::info!("Removing file: {:?}", path);
      fs::remove_file(path)?;
    }
    Ok(())
  }

  /// Copy a file from source to destination
  pub fn copy_file(&self, src: &Path, dest: &Path) -> Result<(), Error> {
    if let Some(parent) = dest.parent() {
      self.create_directories(parent)?;
    }

    log::debug!("Copying file from {:?} to {:?}", src, dest);
    fs::copy(src, dest)?;
    Ok(())
  }

  /// Move a file from source to destination
  pub fn move_file(&self, src: &Path, dest: &Path) -> Result<(), Error> {
    if let Some(parent) = dest.parent() {
      self.create_directories(parent)?;
    }

    log::debug!("Moving file from {:?} to {:?}", src, dest);
    fs::rename(src, dest)?;
    Ok(())
  }

  /// Remove a single directory (must be empty)
  pub fn remove_directory(&self, path: &Path) -> Result<(), Error> {
    if path.exists() {
      log::info!("Removing directory: {:?}", path);
      fs::remove_dir(path)?;
    }
    Ok(())
  }

  /// Check if path exists
  pub fn path_exists(&self, path: &Path) -> bool {
    path.exists()
  }

  /// Get the mods storage directory
  pub fn get_mods_store_path(&self) -> Result<std::path::PathBuf, Error> {
    let local_appdata = std::env::var("LOCALAPPDATA").map_err(|_| Error::GamePathNotSet)?;
    Ok(
      std::path::PathBuf::from(local_appdata)
        .join("dev.stormix.deadlock-mod-manager")
        .join("mods"),
    )
  }

  /// Open the mods store directory in file explorer
  pub fn open_mods_store(&self) -> Result<(), Error> {
    let mods_path = self.get_mods_store_path()?;
    if !mods_path.exists() {
      return Err(Error::GamePathNotSet);
    }
    self.open_folder(&mods_path.to_string_lossy().to_string())
  }

  /// Get all files in a directory with a specific extension
  pub fn get_files_with_extension(
    &self,
    dir: &Path,
    extension: &str,
  ) -> Result<Vec<std::path::PathBuf>, Error> {
    let mut files = Vec::new();

    if !dir.exists() {
      return Ok(files);
    }

    for entry in fs::read_dir(dir)? {
      let entry = entry?;
      let path = entry.path();

      if path.is_file() && path.extension().map_or(false, |ext| ext == extension) {
        files.push(path);
      }
    }

    files.sort();
    Ok(files)
  }

  /// Recursively find all files with a specific extension
  pub fn find_files_recursive(
    &self,
    dir: &Path,
    extension: &str,
  ) -> Result<Vec<(std::path::PathBuf, u64)>, Error> {
    let mut files = Vec::new();
    self.find_files_recursive_internal(dir, extension, &mut files)?;
    files.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(files)
  }

  fn find_files_recursive_internal(
    &self,
    dir: &Path,
    extension: &str,
    files: &mut Vec<(std::path::PathBuf, u64)>,
  ) -> Result<(), Error> {
    for entry in fs::read_dir(dir)? {
      let entry = entry?;
      let path = entry.path();

      if path.is_dir() {
        self.find_files_recursive_internal(&path, extension, files)?;
      } else if path.extension().map_or(false, |ext| ext == extension) {
        let metadata = fs::metadata(&path)?;
        files.push((path, metadata.len()));
      }
    }
    Ok(())
  }
}

impl Default for FileSystemHelper {
  fn default() -> Self {
    Self::new()
  }
}
