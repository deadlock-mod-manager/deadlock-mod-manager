use crate::errors::Error;
use crate::mod_manager::filesystem_helper::FileSystemHelper;
use log;
use regex::Regex;
use std::fs;
use std::path::Path;

/// Manages VPK file operations and installation
pub struct VpkManager {
  filesystem: FileSystemHelper,
}

impl VpkManager {
  pub fn new() -> Self {
    Self {
      filesystem: FileSystemHelper::new(),
    }
  }

  /// Find the highest VPK number in a directory (for sequential numbering)
  pub fn find_highest_vpk_number(&self, addons_path: &Path) -> Result<u32, Error> {
    let mut highest = 0;

    if !addons_path.exists() {
      return Ok(highest);
    }

    let vpk_pattern = Regex::new(r"pak(\d+)_dir\.vpk").unwrap();

    for entry in fs::read_dir(addons_path)? {
      let entry = entry?;
      let path = entry.path();

      if path.is_file() && path.extension().map_or(false, |ext| ext == "vpk") {
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
          if let Some(captures) = vpk_pattern.captures(name) {
            if let Ok(num) = captures[1].parse::<u32>() {
              highest = highest.max(num);
            }
          }
        }
      }
    }

    Ok(highest)
  }

  /// Copy VPK files from source directory to destination with sequential numbering
  pub fn copy_vpks_from_directory(
    &self,
    source_dir: &Path,
    destination_dir: &Path,
  ) -> Result<Vec<String>, Error> {
    let mut installed_vpks = Vec::new();
    let mut vpk_files = Vec::new();

    // Recursively collect all VPK files
    self.collect_vpks_recursive(source_dir, &mut vpk_files)?;

    // Sort VPK files to ensure consistent ordering
    vpk_files.sort();

    // Get the highest existing VPK number in destination
    let mut current_number = self.find_highest_vpk_number(destination_dir)?;

    // Copy and rename VPK files with sequential numbering
    for vpk_path in vpk_files {
      current_number += 1;
      let new_name = format!("pak{:02}_dir.vpk", current_number);
      let new_path = destination_dir.join(&new_name);

      self.filesystem.copy_file(&vpk_path, &new_path)?;
      installed_vpks.push(new_name.clone());

      log::info!("Installed VPK: {} as {}", vpk_path.display(), new_name);
    }

    Ok(installed_vpks)
  }

  /// Recursively collect VPK files from a directory
  fn collect_vpks_recursive(
    &self,
    dir: &Path,
    vpk_files: &mut Vec<std::path::PathBuf>,
  ) -> Result<(), Error> {
    for entry in fs::read_dir(dir)? {
      let entry = entry?;
      let path = entry.path();

      if path.is_dir() {
        self.collect_vpks_recursive(&path, vpk_files)?;
      } else if path.extension().map_or(false, |ext| ext == "vpk") {
        vpk_files.push(path);
      }
    }
    Ok(())
  }


  /// Remove VPK files from the addons directory
  pub fn remove_vpks(&self, vpk_names: &[String], addons_path: &Path) -> Result<(), Error> {
    if !addons_path.exists() {
      log::warn!("Addons path does not exist: {:?}", addons_path);
      return Ok(());
    }

    for vpk_name in vpk_names {
      let vpk_path = addons_path.join(vpk_name);
      if vpk_path.exists() {
        self.filesystem.remove_file(&vpk_path)?;
        log::info!("Removed VPK: {}", vpk_name);
      } else {
        log::warn!("VPK not found for removal: {}", vpk_name);
      }
    }

    Ok(())
  }

  /// Clear all VPK files from the addons directory
  pub fn clear_all_vpks(&self, addons_path: &Path) -> Result<(), Error> {
    if !addons_path.exists() {
      return Ok(());
    }

    let vpk_files = self
      .filesystem
      .get_files_with_extension(addons_path, "vpk")?;

    for vpk_path in vpk_files {
      self.filesystem.remove_file(&vpk_path)?;
      log::info!("Removed VPK: {:?}", vpk_path);
    }

    Ok(())
  }

}

impl Default for VpkManager {
  fn default() -> Self {
    Self::new()
  }
}
