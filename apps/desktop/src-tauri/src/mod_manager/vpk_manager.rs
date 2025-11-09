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

  pub fn find_next_available_vpk_number(&self, addons_path: &Path) -> Result<u32, Error> {
    if !addons_path.exists() {
      return Ok(1);
    }

    let vpk_pattern = Regex::new(r"pak(\d+)_dir\.vpk").unwrap();
    let mut used_numbers = std::collections::HashSet::new();

    for entry in fs::read_dir(addons_path)? {
      let entry = entry?;
      let path = entry.path();

      if path.is_file()
        && path.extension().is_some_and(|ext| ext == "vpk")
        && let Some(name) = path.file_name().and_then(|n| n.to_str())
        && let Some(captures) = vpk_pattern.captures(name)
        && let Ok(num) = captures[1].parse::<u32>()
      {
        used_numbers.insert(num);
      }
    }

    // Find first available number starting from 1
    let mut next_number = 1u32;
    while used_numbers.contains(&next_number) {
      next_number += 1;
    }

    Ok(next_number)
  }

  pub fn reorder_vpks(
    &self,
    mod_vpk_mapping: &[(String, Vec<String>)], // (mod_id, vpk_filenames)
    addons_path: &Path,
  ) -> Result<Vec<(String, Vec<String>)>, Error> {
    if !addons_path.exists() {
      return Err(Error::Io(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        format!("Addons path not found: {addons_path:?}"),
      )));
    }

    log::info!("Starting VPK reordering for {} mods", mod_vpk_mapping.len());

    // Create a temporary directory for safe reordering
    let temp_dir = addons_path.join("temp_reorder");
    if temp_dir.exists() {
      std::fs::remove_dir_all(&temp_dir)?;
    }
    std::fs::create_dir_all(&temp_dir)?;

    log::info!("Created temporary directory: {temp_dir:?}");

    let mut updated_mappings = Vec::new();

    // Step 1: Move ALL VPK files to temporary directory, then only restore the ones we're managing
    // This ensures we start with a clean slate and numbering always starts from pak01
    if addons_path.exists() {
      for entry in std::fs::read_dir(addons_path)? {
        let entry = entry?;
        let path = entry.path();

        if path.is_file()
          && path.extension().is_some_and(|ext| ext == "vpk")
          && let Some(filename) = path.file_name().and_then(|n| n.to_str())
        {
          let temp_path = temp_dir.join(filename);
          std::fs::rename(&path, &temp_path)?;
          log::debug!("Moved {filename} to temporary directory");
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

          log::info!("Reordered {filename} -> {new_name} for mod {mod_id}");
        } else {
          log::warn!("VPK file {filename} not found in temp directory for mod {mod_id}");
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

        if path.is_file() && path.extension().is_some_and(|ext| ext == "vpk") {
          // Find next available number for orphaned VPK
          let orphaned_name = format!("pak{:02}_dir.vpk", current_number);
          let orphaned_path = addons_path.join(&orphaned_name);

          std::fs::rename(&path, &orphaned_path)?;
          current_number += 1;

          if let Some(filename) = path.file_name().and_then(|n| n.to_str()) {
            log::info!("Restored orphaned VPK file: {filename} -> {orphaned_name}");
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
      log::warn!("Addons path does not exist: {addons_path:?}");
      return Ok(());
    }

    for vpk_name in vpk_names {
      let vpk_path = addons_path.join(vpk_name);
      if vpk_path.exists() {
        self.filesystem.remove_file(&vpk_path)?;
        log::info!("Removed VPK: {vpk_name}");
      } else {
        log::warn!("VPK not found for removal: {vpk_name}");
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
      log::info!("Removed VPK: {vpk_path:?}");
    }

    Ok(())
  }

  /// Copy selected VPK files from extracted directory based on file tree selection
  pub fn copy_selected_vpks_with_prefix(
    &self,
    source_dir: &Path,
    destination_dir: &Path,
    mod_id: &str,
    file_tree: &crate::mod_manager::file_tree::ModFileTree,
  ) -> Result<Vec<String>, Error> {
    let mut prefixed_vpks = Vec::new();

    // Get all VPK files from source directory with their relative paths
    let mut all_vpk_files = Vec::new();
    self.collect_vpks_from_dir(source_dir, &mut all_vpk_files)?;

    // Create a map of relative paths to full paths
    let mut vpk_map: std::collections::HashMap<String, std::path::PathBuf> =
      std::collections::HashMap::new();
    for vpk_path in all_vpk_files {
      if let Ok(relative_path) = vpk_path.strip_prefix(source_dir) {
        let relative_str = relative_path.to_string_lossy().replace('\\', "/");
        vpk_map.insert(relative_str, vpk_path);
      }
    }

    // Copy only selected files
    for file in &file_tree.files {
      if !file.is_selected {
        continue;
      }

      // Match file path (normalize separators)
      let normalized_path = file.path.replace('\\', "/");
      if let Some(vpk_path) = vpk_map.get(&normalized_path) {
        if let Some(file_name) = vpk_path.file_name().and_then(|n| n.to_str()) {
          let prefixed_name = format!("{mod_id}_{file_name}");
          let dest_path = destination_dir.join(&prefixed_name);

          self.filesystem.copy_file(vpk_path, &dest_path)?;
          prefixed_vpks.push(prefixed_name.clone());

          log::info!(
            "Copied selected VPK with prefix: {} -> {prefixed_name}",
            vpk_path.display()
          );
        }
      } else {
        log::warn!(
          "Selected VPK file not found in extracted directory: {}",
          file.path
        );
      }
    }

    Ok(prefixed_vpks)
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
        let prefixed_name = format!("{mod_id}_{file_name}");
        let dest_path = destination_dir.join(&prefixed_name);

        self.filesystem.copy_file(&vpk_path, &dest_path)?;
        prefixed_vpks.push(prefixed_name.clone());

        log::info!(
          "Copied VPK with prefix: {} -> {prefixed_name}",
          vpk_path.display()
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
      } else if path.extension().is_some_and(|ext| ext == "vpk") {
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

    let prefix = format!("{mod_id}_");

    for entry in fs::read_dir(addons_path)? {
      let entry = entry?;
      let path = entry.path();

      if path.is_file()
        && path.extension().is_some_and(|ext| ext == "vpk")
        && let Some(file_name) = path.file_name().and_then(|n| n.to_str())
        && file_name.starts_with(&prefix)
      {
        prefixed_vpks.push(file_name.to_string());
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

    let mut new_vpk_names = Vec::new();

    for prefixed_name in prefixed_vpks {
      let old_path = addons_path.join(prefixed_name);
      if !old_path.exists() {
        log::warn!("Prefixed VPK not found: {prefixed_name}");
        continue;
      }

      // Find next available number (fills gaps)
      let next_number = self.find_next_available_vpk_number(addons_path)?;
      let new_name = format!("pak{next_number:02}_dir.vpk");
      let new_path = addons_path.join(&new_name);

      fs::rename(&old_path, &new_path)?;
      new_vpk_names.push(new_name.clone());

      log::info!("Enabled VPK for mod {mod_id}: {prefixed_name} -> {new_name}");
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
        log::warn!("Installed VPK not found: {vpk_name}");
        continue;
      }

      let original_name = original_names
        .get(index)
        .map(|s| s.as_str())
        .unwrap_or("addon.vpk");

      let prefixed_name = format!("{mod_id}_{original_name}");
      let new_path = addons_path.join(&prefixed_name);

      fs::rename(&old_path, &new_path)?;
      prefixed_vpks.push(prefixed_name.clone());

      log::info!("Disabled VPK for mod {mod_id}: {vpk_name} -> {prefixed_name}");
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
        log::info!("Removed prefixed VPK: {vpk_name}");
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

  /// Replace VPK files for a mod with new ones
  /// Handles both enabled (pak##_dir.vpk) and disabled (modid_*.vpk) mods
  pub fn replace_vpks(
    &self,
    addons_path: &Path,
    mod_id: &str,
    source_vpk_paths: &[std::path::PathBuf],
    installed_vpks: &[String],
    _original_names: &[String],
  ) -> Result<(), Error> {
    if source_vpk_paths.is_empty() {
      return Err(Error::InvalidInput(
        "No VPK files provided for replacement".into(),
      ));
    }

    if !addons_path.exists() {
      return Err(Error::Io(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        format!("Addons path not found: {addons_path:?}"),
      )));
    }

    log::info!(
      "Replacing {} VPK file(s) for mod {mod_id}",
      source_vpk_paths.len()
    );

    // Determine if mod is enabled (has installed_vpks) or disabled (has prefixed VPKs)
    let is_enabled = !installed_vpks.is_empty();

    if is_enabled {
      // Mod is enabled - replace pak##_dir.vpk files
      if source_vpk_paths.len() != installed_vpks.len() {
        return Err(Error::InvalidInput(format!(
          "Replacement VPK count ({}) does not match installed VPK count ({})",
          source_vpk_paths.len(),
          installed_vpks.len()
        )));
      }

      for (source_path, installed_vpk) in source_vpk_paths.iter().zip(installed_vpks.iter()) {
        let dest_path = addons_path.join(installed_vpk);

        if !dest_path.exists() {
          log::warn!("Installed VPK not found: {installed_vpk}");
          continue;
        }

        self.filesystem.copy_file(source_path, &dest_path)?;
        log::info!(
          "Replaced enabled VPK: {installed_vpk} with {:?}",
          source_path.file_name().unwrap_or_default()
        );
      }
    } else {
      // Mod is disabled - replace prefixed VPKs
      log::info!("Looking for prefixed VPKs with pattern: {mod_id}_*.vpk");
      let prefixed_vpks = self.find_prefixed_vpks(addons_path, mod_id)?;
      log::info!(
        "Found {} prefixed VPK(s): {prefixed_vpks:?}",
        prefixed_vpks.len()
      );

      if prefixed_vpks.is_empty() {
        // List all VPK files in addons to help debug
        let all_vpks: Vec<String> = fs::read_dir(addons_path)
          .ok()
          .map(|entries| {
            entries
              .filter_map(|e| e.ok())
              .filter(|e| e.path().extension().is_some_and(|ext| ext == "vpk"))
              .filter_map(|e| e.file_name().to_str().map(String::from))
              .collect()
          })
          .unwrap_or_default();
        log::warn!("No prefixed VPKs found. All VPKs in addons: {all_vpks:?}");
        return Err(Error::ModFileNotFound);
      }

      if source_vpk_paths.len() != prefixed_vpks.len() {
        return Err(Error::InvalidInput(format!(
          "Replacement VPK count ({}) does not match mod VPK count ({})",
          source_vpk_paths.len(),
          prefixed_vpks.len()
        )));
      }

      for (source_path, prefixed_vpk) in source_vpk_paths.iter().zip(prefixed_vpks.iter()) {
        let dest_path = addons_path.join(prefixed_vpk);

        if !dest_path.exists() {
          log::warn!("Prefixed VPK not found: {prefixed_vpk}");
          continue;
        }

        self.filesystem.copy_file(source_path, &dest_path)?;
        log::info!(
          "Replaced disabled VPK: {prefixed_vpk} with {:?}",
          source_path.file_name().unwrap_or_default()
        );
      }
    }

    log::info!("VPK replacement completed successfully for mod {mod_id}");
    Ok(())
  }
}

impl Default for VpkManager {
  fn default() -> Self {
    Self::new()
  }
}
