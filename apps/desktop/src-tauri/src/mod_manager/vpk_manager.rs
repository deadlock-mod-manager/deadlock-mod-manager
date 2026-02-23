use crate::errors::Error;
use crate::mod_manager::filesystem_helper::FileSystemHelper;
use log;
use regex::Regex;
use std::collections::{HashMap, HashSet};
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

    let vpk_pattern = Regex::new(r"^pak(\d+)_[^.]+\.vpk$").unwrap();
    let mut used_numbers = HashSet::new();

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

  fn parse_enabled_vpk_parts(filename: &str) -> Option<(String, String)> {
    let file_stem = filename.strip_suffix(".vpk")?;
    let remainder = file_stem.strip_prefix("pak")?;
    let (number, suffix) = remainder.split_once('_')?;

    if number.is_empty() || suffix.is_empty() || !number.chars().all(|c| c.is_ascii_digit()) {
      return None;
    }

    Some((format!("pak{number}"), suffix.to_string()))
  }

  fn build_reordered_vpk_name(
    filename: &str,
    set_number_mapping: &mut HashMap<String, u32>,
    current_number: &mut u32,
  ) -> String {
    if let Some((set_key, suffix)) = Self::parse_enabled_vpk_parts(filename) {
      let assigned_number = if let Some(existing_number) = set_number_mapping.get(&set_key) {
        *existing_number
      } else {
        let next_number = *current_number;
        set_number_mapping.insert(set_key, next_number);
        *current_number += 1;
        next_number
      };

      return format!("pak{assigned_number:02}_{suffix}.vpk");
    }

    let assigned_number = *current_number;
    *current_number += 1;
    format!("pak{assigned_number:02}_dir.vpk")
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

    // Step 1: Move enabled VPK files to temporary directory, skip disabled (prefixed) VPKs
    // Disabled VPKs use the format `{mod_id}_{original_name}.vpk` and should not be touched
    if addons_path.exists() {
      for entry in std::fs::read_dir(addons_path)? {
        let entry = entry?;
        let path = entry.path();

        if path.is_file()
          && path.extension().is_some_and(|ext| ext == "vpk")
          && let Some(filename) = path.file_name().and_then(|n| n.to_str())
        {
          if Self::extract_mod_id_from_prefix(filename).is_some() {
            log::debug!("Skipping disabled (prefixed) VPK during reorder: {filename}");
            continue;
          }

          let temp_path = temp_dir.join(filename);
          std::fs::rename(&path, &temp_path)?;
          log::debug!("Moved {filename} to temporary directory");
        }
      }
    }

    // Step 2: Place VPKs back with sequential numbering starting from pak01 based on order
    let mut current_number = 1u32;
    let mut set_number_mapping: HashMap<String, u32> = HashMap::new();

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
          let new_name = Self::build_reordered_vpk_name(
            &filename,
            &mut set_number_mapping,
            &mut current_number,
          );
          let new_path = addons_path.join(&new_name);

          std::fs::rename(&temp_vpk_path, &new_path)?;
          new_vpk_names.push(new_name.clone());

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
      let mut orphaned_filenames = Vec::new();
      for entry in std::fs::read_dir(&temp_dir)? {
        let entry = entry?;
        let path = entry.path();

        if path.is_file()
          && path.extension().is_some_and(|ext| ext == "vpk")
          && let Some(filename) = path.file_name().and_then(|n| n.to_str())
        {
          orphaned_filenames.push(filename.to_string());
        }
      }

      orphaned_filenames.sort();

      for filename in orphaned_filenames {
        let source_path = temp_dir.join(&filename);
        if !source_path.exists() {
          continue;
        }

        let orphaned_name = Self::build_reordered_vpk_name(
          &filename,
          &mut set_number_mapping,
          &mut current_number,
        );
        let orphaned_path = addons_path.join(&orphaned_name);

        std::fs::rename(&source_path, &orphaned_path)?;
        log::info!("Restored orphaned VPK file: {filename} -> {orphaned_name}");
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

    log::info!(
      "Found {} VPK files in source directory for mod {}",
      all_vpk_files.len(),
      mod_id
    );

    // Create a map of relative paths to full paths
    let mut vpk_map: std::collections::HashMap<String, std::path::PathBuf> =
      std::collections::HashMap::new();
    for vpk_path in all_vpk_files {
      if let Ok(relative_path) = vpk_path.strip_prefix(source_dir) {
        let relative_str = relative_path.to_string_lossy().replace('\\', "/");
        log::debug!(
          "Mapping VPK path: {} -> {}",
          relative_str,
          vpk_path.display()
        );
        vpk_map.insert(relative_str, vpk_path);
      }
    }

    log::info!(
      "File tree has {} files, {} are selected",
      file_tree.files.len(),
      file_tree.files.iter().filter(|f| f.is_selected).count()
    );

    // Copy only selected files
    for file in &file_tree.files {
      log::debug!(
        "Processing file: {} (selected: {}, path: {})",
        file.name,
        file.is_selected,
        file.path
      );

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
    let mut set_number_mapping: HashMap<String, u32> = HashMap::new();
    let mod_prefix = format!("{mod_id}_");

    for prefixed_name in prefixed_vpks {
      let old_path = addons_path.join(prefixed_name);
      if !old_path.exists() {
        log::warn!("Prefixed VPK not found: {prefixed_name}");
        continue;
      }

      let original_name = prefixed_name.strip_prefix(&mod_prefix).unwrap_or(prefixed_name);
      let new_name = if let Some((set_key, suffix)) = Self::parse_enabled_vpk_parts(original_name) {
        let next_number = if let Some(existing_number) = set_number_mapping.get(&set_key) {
          *existing_number
        } else {
          let available_number = self.find_next_available_vpk_number(addons_path)?;
          set_number_mapping.insert(set_key, available_number);
          available_number
        };

        format!("pak{next_number:02}_{suffix}.vpk")
      } else {
        let next_number = self.find_next_available_vpk_number(addons_path)?;
        format!("pak{next_number:02}_dir.vpk")
      };
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
        .unwrap_or(vpk_name);

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

#[cfg(test)]
mod tests {
  use super::VpkManager;
  use std::fs;
  use std::path::Path;
  use tempfile::TempDir;

  fn create_vpk_file(addons_path: &Path, filename: &str) {
    let file_path = addons_path.join(filename);
    fs::write(&file_path, b"test").expect("Failed to create test VPK file");
  }

  fn assert_vpk_exists(addons_path: &Path, filename: &str) {
    assert!(
      addons_path.join(filename).exists(),
      "Expected VPK file to exist: {filename}"
    );
  }

  #[test]
  fn enable_vpks_keeps_multipart_files_aligned() {
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let addons_path = temp_dir.path();
    let manager = VpkManager::new();

    create_vpk_file(addons_path, "123_pak01_000.vpk");
    create_vpk_file(addons_path, "123_pak01_dir.vpk");
    create_vpk_file(addons_path, "123_pak02_000.vpk");
    create_vpk_file(addons_path, "123_pak02_dir.vpk");

    let prefixed_vpks = vec![
      "123_pak01_000.vpk".to_string(),
      "123_pak01_dir.vpk".to_string(),
      "123_pak02_000.vpk".to_string(),
      "123_pak02_dir.vpk".to_string(),
    ];

    let enabled_vpks = manager
      .enable_vpks(addons_path, "123", &prefixed_vpks)
      .expect("Failed to enable VPKs");

    assert_eq!(enabled_vpks.len(), 4);
    assert_vpk_exists(addons_path, "pak01_000.vpk");
    assert_vpk_exists(addons_path, "pak01_dir.vpk");
    assert_vpk_exists(addons_path, "pak02_000.vpk");
    assert_vpk_exists(addons_path, "pak02_dir.vpk");
  }

  #[test]
  fn disable_vpks_restores_multipart_original_names() {
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let addons_path = temp_dir.path();
    let manager = VpkManager::new();

    create_vpk_file(addons_path, "pak01_dir.vpk");
    create_vpk_file(addons_path, "pak01_000.vpk");

    let installed_vpks = vec!["pak01_dir.vpk".to_string(), "pak01_000.vpk".to_string()];
    let original_names = vec!["pak77_dir.vpk".to_string(), "pak77_000.vpk".to_string()];

    let prefixed_vpks = manager
      .disable_vpks(addons_path, "123", &installed_vpks, &original_names)
      .expect("Failed to disable VPKs");

    assert_eq!(
      prefixed_vpks,
      vec!["123_pak77_dir.vpk".to_string(), "123_pak77_000.vpk".to_string()]
    );
    assert_vpk_exists(addons_path, "123_pak77_dir.vpk");
    assert_vpk_exists(addons_path, "123_pak77_000.vpk");
  }

  #[test]
  fn reorder_vpks_keeps_multipart_sets_together() {
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let addons_path = temp_dir.path();
    let manager = VpkManager::new();

    create_vpk_file(addons_path, "pak05_dir.vpk");
    create_vpk_file(addons_path, "pak05_000.vpk");
    create_vpk_file(addons_path, "pak09_dir.vpk");
    create_vpk_file(addons_path, "pak09_000.vpk");

    let mod_vpk_mapping = vec![
      (
        "mod-a".to_string(),
        vec!["pak09_dir.vpk".to_string(), "pak09_000.vpk".to_string()],
      ),
      (
        "mod-b".to_string(),
        vec!["pak05_dir.vpk".to_string(), "pak05_000.vpk".to_string()],
      ),
    ];

    let updated_mappings = manager
      .reorder_vpks(&mod_vpk_mapping, addons_path)
      .expect("Failed to reorder VPKs");

    assert_eq!(
      updated_mappings[0].1,
      vec!["pak01_dir.vpk".to_string(), "pak01_000.vpk".to_string()]
    );
    assert_eq!(
      updated_mappings[1].1,
      vec!["pak02_dir.vpk".to_string(), "pak02_000.vpk".to_string()]
    );

    assert_vpk_exists(addons_path, "pak01_dir.vpk");
    assert_vpk_exists(addons_path, "pak01_000.vpk");
    assert_vpk_exists(addons_path, "pak02_dir.vpk");
    assert_vpk_exists(addons_path, "pak02_000.vpk");
  }

  #[test]
  fn reorder_vpks_restores_orphaned_chunks_with_same_set_number() {
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let addons_path = temp_dir.path();
    let manager = VpkManager::new();

    create_vpk_file(addons_path, "pak05_dir.vpk");
    create_vpk_file(addons_path, "pak05_000.vpk");

    let mod_vpk_mapping = vec![("mod-a".to_string(), vec!["pak05_dir.vpk".to_string()])];

    manager
      .reorder_vpks(&mod_vpk_mapping, addons_path)
      .expect("Failed to reorder VPKs");

    assert_vpk_exists(addons_path, "pak01_dir.vpk");
    assert_vpk_exists(addons_path, "pak01_000.vpk");
    assert!(!addons_path.join("pak02_dir.vpk").exists());
  }
}
