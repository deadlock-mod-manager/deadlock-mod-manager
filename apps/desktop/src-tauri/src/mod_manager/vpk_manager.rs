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

  pub fn reorder_vpks(
    &self,
    mod_vpk_mapping: &[(String, Vec<String>)], // (mod_id, vpk_filenames)
    addons_path: &Path,
  ) -> Result<Vec<(String, Vec<String>)>, Error> {
    if !addons_path.exists() {
      return Err(Error::Io(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        format!("Addons path not found: {:?}", addons_path),
      )));
    }

    log::info!("Starting VPK reordering for {} mods", mod_vpk_mapping.len());

    // Create a temporary directory for safe reordering
    let temp_dir = addons_path.join("temp_reorder");
    if temp_dir.exists() {
      std::fs::remove_dir_all(&temp_dir)?;
    }
    std::fs::create_dir_all(&temp_dir)?;

    log::info!("Created temporary directory: {:?}", temp_dir);

    let mut updated_mappings = Vec::new();

    // Step 1: Move ALL VPK files to temporary directory, then only restore the ones we're managing
    // This ensures we start with a clean slate and numbering always starts from pak01
    if addons_path.exists() {
      for entry in std::fs::read_dir(addons_path)? {
        let entry = entry?;
        let path = entry.path();

        if path.is_file() && path.extension().map_or(false, |ext| ext == "vpk") {
          if let Some(filename) = path.file_name().and_then(|n| n.to_str()) {
            let temp_path = temp_dir.join(filename);
            std::fs::rename(&path, &temp_path)?;
            log::debug!("Moved {} to temporary directory", filename);
          }
        }
      }
    }

    // Step 2: Place VPKs back with sequential numbering starting from pak01 based on order
    let mut current_number = 1u32;

    for (mod_id, old_vpk_names) in mod_vpk_mapping {
      let mut new_vpk_names = Vec::new();

      // For each VPK this mod should have, find the specific VPK file in temp
      for old_vpk_name in old_vpk_names {
        // Extract just the filename from the full path
        let filename = if let Some(filename) = std::path::Path::new(&old_vpk_name).file_name() {
          filename.to_string_lossy().to_string()
        } else {
          old_vpk_name.clone()
        };

        let temp_vpk_path = temp_dir.join(&filename);

        if temp_vpk_path.exists() {
          let new_name = format!("pak{:02}_dir.vpk", current_number);
          let new_path = addons_path.join(&new_name);

          std::fs::rename(&temp_vpk_path, &new_path)?;
          new_vpk_names.push(new_name.clone());
          current_number += 1;

          log::info!("Reordered {} -> {} for mod {}", filename, new_name, mod_id);
        } else {
          log::warn!(
            "VPK file {} not found in temp directory for mod {}",
            filename,
            mod_id
          );
        }
      }

      updated_mappings.push((mod_id.clone(), new_vpk_names));
    }

    // Step 3: Restore any orphaned VPKs (VPKs not managed by our mod system)
    if temp_dir.exists() {
      // Move any remaining VPKs back to addons directory with sequential numbering
      for entry in std::fs::read_dir(&temp_dir)? {
        let entry = entry?;
        let path = entry.path();

        if path.is_file() && path.extension().map_or(false, |ext| ext == "vpk") {
          // Find next available number for orphaned VPK
          let orphaned_name = format!("pak{:02}_dir.vpk", current_number);
          let orphaned_path = addons_path.join(&orphaned_name);

          std::fs::rename(&path, &orphaned_path)?;
          current_number += 1;

          if let Some(filename) = path.file_name().and_then(|n| n.to_str()) {
            log::info!(
              "Restored orphaned VPK file: {} -> {}",
              filename,
              orphaned_name
            );
          }
        }
      }

      std::fs::remove_dir_all(&temp_dir)?;
    }

    log::info!("VPK reordering completed successfully");
    Ok(updated_mappings)
  }

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

  /// Copy VPK files from source directory to addons with mod ID prefix
  pub fn copy_vpks_with_prefix(
    &self,
    source_dir: &Path,
    destination_dir: &Path,
    mod_id: &str,
  ) -> Result<Vec<String>, Error> {
    let mut prefixed_vpks = Vec::new();
    let mut vpk_files = Vec::new();

    // Recursively collect all VPK files
    self.collect_vpks_from_dir(source_dir, &mut vpk_files)?;
    vpk_files.sort();

    for vpk_path in vpk_files {
      if let Some(file_name) = vpk_path.file_name().and_then(|n| n.to_str()) {
        let prefixed_name = format!("{}_{}", mod_id, file_name);
        let dest_path = destination_dir.join(&prefixed_name);

        self.filesystem.copy_file(&vpk_path, &dest_path)?;
        prefixed_vpks.push(prefixed_name.clone());

        log::info!(
          "Copied VPK with prefix: {} -> {}",
          vpk_path.display(),
          prefixed_name
        );
      }
    }

    Ok(prefixed_vpks)
  }

  /// Helper method to recursively collect VPK files
  fn collect_vpks_from_dir(
    &self,
    dir: &Path,
    vpk_files: &mut Vec<std::path::PathBuf>,
  ) -> Result<(), Error> {
    for entry in fs::read_dir(dir)? {
      let entry = entry?;
      let path = entry.path();

      if path.is_dir() {
        self.collect_vpks_from_dir(&path, vpk_files)?;
      } else if path.extension().map_or(false, |ext| ext == "vpk") {
        vpk_files.push(path);
      }
    }
    Ok(())
  }

  /// Find all VPK files with a specific mod ID prefix
  pub fn find_prefixed_vpks(&self, addons_path: &Path, mod_id: &str) -> Result<Vec<String>, Error> {
    let mut prefixed_vpks = Vec::new();

    if !addons_path.exists() {
      return Ok(prefixed_vpks);
    }

    let prefix = format!("{}_", mod_id);

    for entry in fs::read_dir(addons_path)? {
      let entry = entry?;
      let path = entry.path();

      if path.is_file() && path.extension().map_or(false, |ext| ext == "vpk") {
        if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
          if file_name.starts_with(&prefix) {
            prefixed_vpks.push(file_name.to_string());
          }
        }
      }
    }

    prefixed_vpks.sort();
    Ok(prefixed_vpks)
  }

  /// Enable VPKs by renaming them from prefixed to sequential numbering
  pub fn enable_vpks(
    &self,
    addons_path: &Path,
    mod_id: &str,
    prefixed_vpks: &[String],
  ) -> Result<Vec<String>, Error> {
    if prefixed_vpks.is_empty() {
      return Ok(Vec::new());
    }

    let mut current_number = self.find_highest_vpk_number(addons_path)?;
    let mut new_vpk_names = Vec::new();

    for prefixed_name in prefixed_vpks {
      let old_path = addons_path.join(prefixed_name);
      if !old_path.exists() {
        log::warn!("Prefixed VPK not found: {}", prefixed_name);
        continue;
      }

      current_number += 1;
      let new_name = format!("pak{:02}_dir.vpk", current_number);
      let new_path = addons_path.join(&new_name);

      fs::rename(&old_path, &new_path)?;
      new_vpk_names.push(new_name.clone());

      log::info!(
        "Enabled VPK for mod {}: {} -> {}",
        mod_id,
        prefixed_name,
        new_name
      );
    }

    Ok(new_vpk_names)
  }

  /// Disable VPKs by renaming them from sequential numbering to prefixed
  pub fn disable_vpks(
    &self,
    addons_path: &Path,
    mod_id: &str,
    installed_vpks: &[String],
    original_names: &[String],
  ) -> Result<Vec<String>, Error> {
    if installed_vpks.is_empty() {
      return Ok(Vec::new());
    }

    let mut prefixed_vpks = Vec::new();

    for (index, vpk_name) in installed_vpks.iter().enumerate() {
      let old_path = addons_path.join(vpk_name);
      if !old_path.exists() {
        log::warn!("Installed VPK not found: {}", vpk_name);
        continue;
      }

      let original_name = original_names
        .get(index)
        .map(|s| s.as_str())
        .unwrap_or("addon.vpk");

      let prefixed_name = format!("{}_{}", mod_id, original_name);
      let new_path = addons_path.join(&prefixed_name);

      fs::rename(&old_path, &new_path)?;
      prefixed_vpks.push(prefixed_name.clone());

      log::info!(
        "Disabled VPK for mod {}: {} -> {}",
        mod_id,
        vpk_name,
        prefixed_name
      );
    }

    Ok(prefixed_vpks)
  }

  /// Remove all VPK files matching a mod ID prefix
  pub fn remove_vpks_by_mod_id(&self, addons_path: &Path, mod_id: &str) -> Result<(), Error> {
    let prefixed_vpks = self.find_prefixed_vpks(addons_path, mod_id)?;

    for vpk_name in prefixed_vpks {
      let vpk_path = addons_path.join(&vpk_name);
      if vpk_path.exists() {
        self.filesystem.remove_file(&vpk_path)?;
        log::info!("Removed prefixed VPK: {}", vpk_name);
      }
    }

    Ok(())
  }

  /// Extract mod ID from a prefixed VPK filename
  pub fn extract_mod_id_from_prefix(filename: &str) -> Option<String> {
    if let Some(underscore_pos) = filename.find('_') {
      let potential_id = &filename[..underscore_pos];
      if potential_id.chars().all(|c| c.is_ascii_digit()) {
        return Some(potential_id.to_string());
      }
    }
    None
  }
}

impl Default for VpkManager {
  fn default() -> Self {
    Self::new()
  }
}
