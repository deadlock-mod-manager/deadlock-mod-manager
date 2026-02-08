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

  /// Get the mods storage directory
  pub fn get_mods_store_path(&self) -> Result<std::path::PathBuf, Error> {
    let local_appdata = std::env::var("LOCALAPPDATA").map_err(|_| Error::GamePathNotSet)?;
    Ok(
      std::path::PathBuf::from(local_appdata)
        .join("dev.stormix.deadlock-mod-manager")
        .join("mods"),
    )
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

      if path.is_file() && path.extension().is_some_and(|ext| ext == extension) {
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
      } else if path.extension().is_some_and(|ext| ext == extension) {
        let metadata = fs::metadata(&path)?;
        files.push((path, metadata.len()));
      }
    }
    Ok(())
  }

  /// Create a directory symlink (cross-platform)
  /// On Windows, this creates a directory junction which doesn't require admin privileges
  #[cfg(windows)]
  pub fn create_directory_symlink(&self, target: &Path, link: &Path) -> Result<(), Error> {
    use std::os::windows::fs::symlink_dir;

    log::info!("Creating directory symlink: {:?} -> {:?}", link, target);

    // First try symlink_dir (requires admin or developer mode)
    match symlink_dir(target, link) {
      Ok(()) => {
        log::info!("Created symlink successfully");
        return Ok(());
      }
      Err(e) => {
        log::warn!(
          "symlink_dir failed (may need admin privileges): {}, trying junction",
          e
        );
      }
    }

    // Fall back to junction (doesn't require admin privileges)
    // Uses the junction crate which calls Windows APIs directly (no shell invocation)
    junction::create(target, link).map_err(|e| {
      Error::Io(std::io::Error::other(format!(
        "Failed to create junction: {}",
        e
      )))
    })?;

    log::info!("Created junction successfully");
    Ok(())
  }

  /// Create a directory symlink (Unix)
  #[cfg(unix)]
  pub fn create_directory_symlink(&self, target: &Path, link: &Path) -> Result<(), Error> {
    use std::os::unix::fs::symlink;

    log::info!("Creating directory symlink: {:?} -> {:?}", link, target);
    symlink(target, link)?;
    log::info!("Created symlink successfully");
    Ok(())
  }

  /// Check if a path is a symlink
  pub fn is_symlink(&self, path: &Path) -> bool {
    path
      .symlink_metadata()
      .map(|m| m.file_type().is_symlink())
      .unwrap_or(false)
  }

  /// Check if two paths point to the same location (handles symlinks and Windows junctions)
  pub fn paths_point_to_same_location(&self, path1: &Path, path2: &Path) -> bool {
    match (fs::canonicalize(path1), fs::canonicalize(path2)) {
      (Ok(canonical1), Ok(canonical2)) => canonical1 == canonical2,
      _ => false,
    }
  }

  /// Remove a symlink or junction (cross-platform)
  /// On Windows, directory symlinks/junctions require remove_dir() instead of remove_file()
  pub fn remove_symlink(&self, path: &Path) -> Result<(), Error> {
    if !path.exists() && !self.is_symlink(path) {
      return Ok(());
    }

    log::info!("Removing symlink/junction: {:?}", path);

    // Try remove_file first (works for file symlinks on all platforms)
    match fs::remove_file(path) {
      Ok(()) => return Ok(()),
      Err(e) => {
        log::debug!("remove_file failed: {}, trying remove_dir", e);
      }
    }

    // Fall back to remove_dir (needed for directory symlinks/junctions on Windows)
    fs::remove_dir(path)?;
    Ok(())
  }

  /// Move all contents from source directory to destination directory
  pub fn move_directory_contents(&self, src: &Path, dest: &Path) -> Result<(), Error> {
    if !src.exists() {
      return Ok(());
    }

    self.create_directories(dest)?;

    for entry in fs::read_dir(src)? {
      let entry = entry?;
      let src_path = entry.path();
      let file_name = entry.file_name();
      let dest_path = dest.join(&file_name);

      if src_path.is_dir() {
        // Recursively move subdirectories
        self.move_directory_contents(&src_path, &dest_path)?;
        fs::remove_dir(&src_path)?;
      } else {
        // Move file (copy + delete for cross-device moves)
        if dest_path.exists() {
          // Only delete source if files are identical (same size)
          // to avoid silent data loss
          let src_size = fs::metadata(&src_path).map(|m| m.len()).unwrap_or(0);
          let dest_size = fs::metadata(&dest_path).map(|m| m.len()).unwrap_or(1);

          if src_size == dest_size {
            log::debug!(
              "Destination file already exists with same size, removing source: {:?}",
              dest_path
            );
            fs::remove_file(&src_path)?;
          } else {
            // Files differ - find a unique conflict filename to avoid data loss
            let base_name = src_path.file_name().unwrap_or_default().to_string_lossy();
            let mut conflict_path = dest.join(format!("{}.conflict", base_name));
            let mut counter = 1;

            while conflict_path.exists() {
              conflict_path = dest.join(format!("{}.conflict.{}", base_name, counter));
              counter += 1;
            }

            log::warn!(
              "Destination file exists with different size, saving as: {:?}",
              conflict_path
            );
            fs::copy(&src_path, &conflict_path)?;
            fs::remove_file(&src_path)?;
          }
        } else {
          fs::copy(&src_path, &dest_path)?;
          fs::remove_file(&src_path)?;
        }
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
