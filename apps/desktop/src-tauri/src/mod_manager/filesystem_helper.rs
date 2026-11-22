use crate::errors::Error;
use crate::utils;
use log;
use std::fs;
use std::path::Path;

pub struct FileSystemHelper;

impl FileSystemHelper {
  pub fn new() -> Self {
    Self
  }

  pub fn open_folder(&self, path: &str) -> Result<(), Error> {
    utils::show_in_folder(path)
  }

  pub fn create_directories(&self, path: &Path) -> Result<(), Error> {
    if !path.exists() {
      log::info!("Creating directories: {:?}", path);
      fs::create_dir_all(path)?;
    }
    Ok(())
  }

  pub fn remove_directory_recursive(&self, path: &Path) -> Result<(), Error> {
    if path.exists() {
      log::info!("Removing directory recursively: {:?}", path);
      fs::remove_dir_all(path)?;
    }
    Ok(())
  }

  pub fn copy_file(&self, src: &Path, dest: &Path) -> Result<(), Error> {
    if let Some(parent) = dest.parent() {
      self.create_directories(parent)?;
    }

    log::debug!("Copying file from {:?} to {:?}", src, dest);
    crate::mod_manager::file_permissions::ensure_file_writable(dest)?;
    fs::copy(src, dest)?;
    Ok(())
  }

  pub fn move_file(&self, src: &Path, dest: &Path) -> Result<(), Error> {
    if let Some(parent) = dest.parent() {
      self.create_directories(parent)?;
    }
    crate::mod_manager::file_permissions::ensure_file_writable(dest)?;
    let renamed = crate::mod_manager::fs_retry::retry_file_operation(
      "move",
      &src.display().to_string(),
      || fs::rename(src, dest),
    );
    if renamed.is_ok() {
      return Ok(());
    }
    fs::copy(src, dest)?;
    if let Err(error) = fs::remove_file(src) {
      log::warn!("Moved {src:?} by copying but could not remove it: {error}");
    }
    Ok(())
  }

  pub fn files_have_same_contents(&self, a: &Path, b: &Path) -> Result<bool, Error> {
    use std::io::BufRead;

    if fs::metadata(a)?.len() != fs::metadata(b)?.len() {
      return Ok(false);
    }
    let mut a = std::io::BufReader::with_capacity(1 << 20, fs::File::open(a)?);
    let mut b = std::io::BufReader::with_capacity(1 << 20, fs::File::open(b)?);
    loop {
      let (left, right) = (a.fill_buf()?, b.fill_buf()?);
      if left.is_empty() || right.is_empty() {
        return Ok(left.is_empty() && right.is_empty());
      }
      let len = left.len().min(right.len());
      if left[..len] != right[..len] {
        return Ok(false);
      }
      a.consume(len);
      b.consume(len);
    }
  }

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

  #[cfg(windows)]
  pub fn create_directory_symlink(&self, target: &Path, link: &Path) -> Result<(), Error> {
    use std::os::windows::fs::symlink_dir;

    log::info!("Creating directory symlink: {:?} -> {:?}", link, target);

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

    junction::create(target, link).map_err(|e| {
      Error::Io(std::io::Error::other(format!(
        "Failed to create junction: {}",
        e
      )))
    })?;

    log::info!("Created junction successfully");
    Ok(())
  }

  #[cfg(unix)]
  pub fn create_directory_symlink(&self, target: &Path, link: &Path) -> Result<(), Error> {
    use std::os::unix::fs::symlink;

    log::info!("Creating directory symlink: {:?} -> {:?}", link, target);
    symlink(target, link)?;
    log::info!("Created symlink successfully");
    Ok(())
  }

  pub fn is_symlink(&self, path: &Path) -> bool {
    path
      .symlink_metadata()
      .map(|m| m.file_type().is_symlink())
      .unwrap_or(false)
  }

  pub fn paths_point_to_same_location(&self, path1: &Path, path2: &Path) -> bool {
    match (fs::canonicalize(path1), fs::canonicalize(path2)) {
      (Ok(canonical1), Ok(canonical2)) => canonical1 == canonical2,
      _ => false,
    }
  }

  pub fn remove_symlink(&self, path: &Path) -> Result<(), Error> {
    if !path.exists() && !self.is_symlink(path) {
      return Ok(());
    }

    log::info!("Removing symlink/junction: {:?}", path);

    match fs::remove_file(path) {
      Ok(()) => return Ok(()),
      Err(e) => {
        log::debug!("remove_file failed: {}, trying remove_dir", e);
      }
    }

    fs::remove_dir(path)?;
    Ok(())
  }

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
        self.move_directory_contents(&src_path, &dest_path)?;
        fs::remove_dir(&src_path)?;
      } else {
        if dest_path.exists() {
          let src_size = fs::metadata(&src_path).map(|m| m.len()).unwrap_or(0);
          let dest_size = fs::metadata(&dest_path).map(|m| m.len()).unwrap_or(1);

          if src_size == dest_size {
            log::debug!(
              "Destination file already exists with same size, removing source: {:?}",
              dest_path
            );
            fs::remove_file(&src_path)?;
          } else {
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

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn compares_contents_not_just_sizes() {
    let temp = tempfile::tempdir().unwrap();
    let write = |name: &str, contents: &[u8]| {
      let path = temp.path().join(name);
      fs::write(&path, contents).unwrap();
      path
    };
    let helper = FileSystemHelper::new();
    let original = write("a.vpk", b"blue");

    assert!(
      helper
        .files_have_same_contents(&original, &write("b.vpk", b"blue"))
        .unwrap()
    );
    assert!(
      !helper
        .files_have_same_contents(&original, &write("c.vpk", b"red!"))
        .unwrap()
    );
    assert!(
      !helper
        .files_have_same_contents(&original, &write("d.vpk", b"blue!"))
        .unwrap()
    );
  }

  #[test]
  fn move_reports_a_read_only_destination() {
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("source.vpk");
    let destination = temp.path().join("pak01_dir.vpk");
    fs::write(&source, b"new").unwrap();
    fs::write(&destination, b"old").unwrap();
    let mut permissions = fs::metadata(&destination).unwrap().permissions();
    #[cfg(unix)]
    {
      use std::os::unix::fs::PermissionsExt;
      permissions.set_mode(permissions.mode() & !0o222);
    }
    #[cfg(windows)]
    permissions.set_readonly(true);
    fs::set_permissions(&destination, permissions).unwrap();

    let error = FileSystemHelper::new()
      .move_file(&source, &destination)
      .unwrap_err();

    assert!(matches!(&error, Error::ReadOnlyFile(file) if file == &destination));
    assert!(source.exists());
    #[cfg(windows)]
    {
      let mut permissions = fs::metadata(&destination).unwrap().permissions();
      permissions.set_readonly(false);
      fs::set_permissions(&destination, permissions).unwrap();
    }
  }
}
