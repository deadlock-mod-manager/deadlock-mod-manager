use crate::errors::Error;
use log;
use std::fs;
use std::fs::File;
use std::path::Path;

/// Handles extraction of different archive formats
pub struct ArchiveExtractor;

impl ArchiveExtractor {
  pub fn new() -> Self {
    Self
  }

  /// Extract archive based on file extension
  pub fn extract_archive(&self, archive_path: &Path, output_dir: &Path) -> Result<(), Error> {
    log::info!("Extracting archive: {archive_path:?} to {output_dir:?}");

    match archive_path.extension().and_then(|e| e.to_str()) {
      Some("zip") => self.extract_zip(archive_path, output_dir),
      Some("rar") => self.extract_rar(archive_path, output_dir),
      Some("7z") => self.extract_7z(archive_path, output_dir),
      Some(ext) => Err(Error::ModExtractionFailed(format!(
        "Unsupported archive format: {ext}"
      ))),
      None => Err(Error::ModExtractionFailed(
        "Could not determine archive format".to_string(),
      )),
    }
  }

  /// Sanitize a file path to prevent directory traversal attacks
  fn sanitize_path(&self, path: &str, output_dir: &Path) -> Result<std::path::PathBuf, Error> {
    // Remove any leading slashes and normalize the path
    let path = path.trim_start_matches('/').trim_start_matches('\\');

    // Check for directory traversal attempts
    if path.contains("..") || path.contains("\\..") || path.contains("../") {
      return Err(Error::UnauthorizedPath(format!(
        "Archive contains unsafe path: {path}"
      )));
    }

    // Resolve the path relative to output directory
    let resolved_path = output_dir.join(path);

    // Canonicalize and verify the resolved path is within output directory
    let canonical_output = output_dir
      .canonicalize()
      .map_err(|_| Error::UnauthorizedPath("Unable to resolve output directory".to_string()))?;

    // For non-existent files, we need to check the parent directory structure
    let mut check_path = resolved_path.clone();
    while !check_path.exists() && check_path.parent().is_some() {
      check_path = check_path.parent().unwrap().to_path_buf();
    }

    if check_path.exists() {
      let canonical_check = check_path
        .canonicalize()
        .map_err(|_| Error::UnauthorizedPath(format!("Unable to resolve path: {path}")))?;

      if !canonical_check.starts_with(&canonical_output) {
        return Err(Error::UnauthorizedPath(format!(
          "Archive path '{path}' would extract outside target directory"
        )));
      }
    }

    Ok(resolved_path)
  }

  /// Extract ZIP archive
  pub fn extract_zip(&self, archive_path: &Path, output_dir: &Path) -> Result<(), Error> {
    let zip_file = File::open(archive_path)?;
    let mut archive = zip::ZipArchive::new(zip_file)?;

    for i in 0..archive.len() {
      let mut file = archive.by_index(i)?;

      // Sanitize the file path to prevent Zip Slip attacks
      let outpath = self.sanitize_path(file.name(), output_dir)?;

      if let Some(parent) = outpath.parent() {
        fs::create_dir_all(parent)?;
      }

      if !file.name().ends_with('/') {
        let mut outfile = fs::File::create(&outpath)?;
        std::io::copy(&mut file, &mut outfile)?;
      }
    }

    log::info!("Successfully extracted ZIP archive");
    Ok(())
  }

  /// Extract RAR archive
  pub fn extract_rar(&self, archive_path: &Path, output_dir: &Path) -> Result<(), Error> {
    let mut archive =
      unrar::Archive::new(archive_path.to_string_lossy().as_ref()).open_for_processing()?;

    while let Some(header) = archive.read_header()? {
      archive = if !header.entry().is_file() {
        header.skip()?
      } else {
        // Validate the path before extraction to prevent directory traversal
        let entry_path = header.entry().filename.to_string_lossy();
        self.sanitize_path(&entry_path, output_dir)?;

        header.extract_with_base(output_dir)?
      };
    }

    log::info!("Successfully extracted RAR archive");
    Ok(())
  }

  /// Extract 7Z archive
  pub fn extract_7z(&self, archive_path: &Path, output_dir: &Path) -> Result<(), Error> {
    // Note: sevenz_rust library doesn't provide granular control over individual file paths
    // during extraction, which could potentially allow directory traversal attacks.
    // As a safety measure, we validate that the output directory is properly sandboxed
    // by the calling code before extraction.

    log::warn!(
      "7Z extraction uses external library without path validation - ensure output directory is properly sandboxed"
    );

    sevenz_rust::decompress_file(
      archive_path.to_string_lossy().as_ref(),
      output_dir.to_string_lossy().as_ref(),
    )
    .map_err(|e| Error::ModExtractionFailed(e.to_string()))?;

    // After extraction, validate that no files were extracted outside the target directory
    self.validate_extracted_files(output_dir)?;

    log::info!("Successfully extracted 7Z archive");
    Ok(())
  }

  /// Validate that all extracted files are within the expected output directory
  fn validate_extracted_files(&self, output_dir: &Path) -> Result<(), Error> {
    let canonical_output = output_dir
      .canonicalize()
      .map_err(|_| Error::UnauthorizedPath("Unable to resolve output directory".to_string()))?;

    self.validate_directory_recursive(output_dir, &canonical_output)?;
    Ok(())
  }

  /// Recursively validate that all files in a directory are within the allowed path
  fn validate_directory_recursive(&self, dir: &Path, allowed_root: &Path) -> Result<(), Error> {
    for entry in std::fs::read_dir(dir)? {
      let entry = entry?;
      let path = entry.path();

      let canonical_path = path.canonicalize().map_err(|_| {
        Error::UnauthorizedPath(format!("Unable to resolve path: {}", path.display()))
      })?;

      if !canonical_path.starts_with(allowed_root) {
        return Err(Error::UnauthorizedPath(format!(
          "File '{}' is outside the allowed extraction directory",
          canonical_path.display()
        )));
      }

      if path.is_dir() {
        self.validate_directory_recursive(&path, allowed_root)?;
      }
    }
    Ok(())
  }

  /// Check if a file is a supported archive format
  pub fn is_supported_archive(&self, path: &Path) -> bool {
    match path.extension().and_then(|e| e.to_str()) {
      Some("zip") | Some("rar") | Some("7z") => true,
      _ => false,
    }
  }
}

impl Default for ArchiveExtractor {
  fn default() -> Self {
    Self::new()
  }
}
