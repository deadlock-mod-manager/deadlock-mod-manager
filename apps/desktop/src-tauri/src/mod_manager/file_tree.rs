use crate::errors::Error;
use crate::mod_manager::{
  archive_extractor::ArchiveExtractor, filesystem_helper::FileSystemHelper,
};
use log;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tempfile;

/// Represents a single file in a mod archive
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ModFile {
  pub name: String,
  pub path: String,
  pub size: u64,
  pub is_selected: bool,
  pub archive_name: String,
}

/// Simple file tree structure for mod archives
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ModFileTree {
  pub files: Vec<ModFile>,
  pub total_files: usize,
  pub has_multiple_files: bool,
}

/// Simple file tree analyzer that just lists files without grouping
pub struct FileTreeAnalyzer {
  archive_extractor: ArchiveExtractor,
  filesystem: FileSystemHelper,
}

impl FileTreeAnalyzer {
  pub fn new() -> Self {
    Self {
      archive_extractor: ArchiveExtractor::new(),
      filesystem: FileSystemHelper::new(),
    }
  }

  /// Gets the simple file structure from archive(s) in a directory
  pub fn get_mod_file_tree(&self, mod_path: &PathBuf) -> Result<ModFileTree, Error> {
    log::info!("Getting file tree for mod path: {mod_path:?}");

    let mut all_files = Vec::new();

    // Process all archives found in the mod directory
    for entry in std::fs::read_dir(mod_path)? {
      let entry = entry?;
      let archive_path = entry.path();

      if !self.archive_extractor.is_supported_archive(&archive_path) {
        continue;
      }

      let archive_name = archive_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

      let temp_dir = tempfile::tempdir()?;
      log::info!("Extracting archive for analysis: {archive_path:?}");

      // Extract archive to temporary location
      self
        .archive_extractor
        .extract_archive(&archive_path, temp_dir.path())?;

      // Find all VPK files recursively
      let vpk_files = self
        .filesystem
        .find_files_recursive(temp_dir.path(), "vpk")?;

      log::info!(
        "Found {} VPK files in archive: {archive_name:?}",
        vpk_files.len()
      );

      // Convert to ModFile objects
      for (path, size) in vpk_files {
        let file_name = path
          .file_name()
          .and_then(|n| n.to_str())
          .unwrap_or("unknown.vpk")
          .to_string();

        let relative_path = path
          .strip_prefix(temp_dir.path())
          .unwrap_or(&path)
          .to_string_lossy()
          .to_string();

        all_files.push(ModFile {
          name: file_name,
          path: relative_path,
          size,
          is_selected: true, // Default to selected
          archive_name: archive_name.clone(),
        });
      }
    }

    let total_files = all_files.len();
    let has_multiple_files = total_files > 1;

    log::info!(
      "File tree analysis complete: {total_files} files, has_multiple: {has_multiple_files}"
    );

    Ok(ModFileTree {
      files: all_files,
      total_files,
      has_multiple_files,
    })
  }
}

impl Default for FileTreeAnalyzer {
  fn default() -> Self {
    Self::new()
  }
}
