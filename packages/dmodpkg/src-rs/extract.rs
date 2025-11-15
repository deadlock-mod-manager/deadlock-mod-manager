use crate::config::ModConfig;
use crate::error::{DmodpkgError, Result};
use crate::reader::{PackageReader, ReaderOptions};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

/// Options for extracting a mod
#[derive(Debug, Clone)]
pub struct ExtractOptions {
    /// Verify checksums during extraction
    pub verify_checksums: bool,
    /// Filter extraction by layer names (empty = extract all)
    pub layers: Vec<String>,
    /// Overwrite existing files
    pub overwrite: bool,
}

impl Default for ExtractOptions {
    fn default() -> Self {
        Self {
            verify_checksums: true,
            layers: Vec::new(),
            overwrite: false,
        }
    }
}

/// Result of extraction operation
#[derive(Debug)]
pub struct ExtractResult {
    /// Path to the extracted project directory
    pub project_path: PathBuf,
    /// Number of files extracted
    pub files_extracted: usize,
    /// Total bytes extracted (uncompressed)
    pub bytes_extracted: u64,
    /// Layers that were extracted
    pub layers_extracted: Vec<String>,
}

/// Extract a .dmodpkg file to a project directory
///
/// # Arguments
/// * `package_path` - Path to the .dmodpkg file
/// * `output_path` - Path where the project will be extracted (optional, uses package name)
/// * `options` - Extraction options
///
/// # Returns
/// `ExtractResult` containing extraction statistics
pub fn extract_mod(
    package_path: impl AsRef<Path>,
    output_path: Option<impl AsRef<Path>>,
    options: ExtractOptions,
) -> Result<ExtractResult> {
    let package_path = package_path.as_ref();

    if !package_path.exists() {
        return Err(DmodpkgError::validation(format!(
            "Package file not found: {}",
            package_path.display()
        )));
    }

    // Open package
    let mut reader = PackageReader::open(package_path)?;

    // Read metadata
    let metadata = reader.read_metadata()?;
    let config: ModConfig = serde_json::from_value(metadata.config.clone())
        .map_err(DmodpkgError::Json)?;

    // Determine output directory
    let output_dir = if let Some(path) = output_path {
        path.as_ref().to_path_buf()
    } else {
        // Default: ./<mod-name>/
        PathBuf::from(&config.name)
    };

    // Check if output directory exists
    if output_dir.exists() && !options.overwrite {
        return Err(DmodpkgError::validation(format!(
            "Output directory already exists: {} (use overwrite option to replace)",
            output_dir.display()
        )));
    }

    // Create output directory structure
    fs::create_dir_all(&output_dir)?;
    let content_dir = output_dir.join("content");
    fs::create_dir_all(&content_dir)?;

    // Write mod.config.json
    let config_json = serde_json::to_string_pretty(&config)
        .map_err(DmodpkgError::Json)?;
    fs::write(output_dir.join("mod.config.json"), config_json)?;

    // Extract files with options
    let reader_options = ReaderOptions {
        verify_checksums: options.verify_checksums,
        layer_filter: options.layers.clone(),
    };

    let extracted_files = reader.extract_files(&reader_options)?;

    let mut files_extracted = 0;
    let mut bytes_extracted: u64 = 0;
    let mut layers_seen = std::collections::HashSet::new();
    let mut layer_files: HashMap<String, Vec<(String, Vec<u8>)>> = HashMap::new();

    // Group files by layer
    for (entry, data) in extracted_files {
        bytes_extracted += data.len() as u64;
        files_extracted += 1;
        layers_seen.insert(entry.layer.clone());

        // Special handling for metadata layer (previews, readme, etc.)
        // Metadata files are always extracted regardless of layer filter
        if entry.layer == "_metadata" {
            let file_path = output_dir.join(&entry.path);
            
            // Create parent directory if needed
            if let Some(parent) = file_path.parent() {
                fs::create_dir_all(parent)?;
            }
            
            fs::write(file_path, data)?;
        } else {
            // Regular layer files
            layer_files
                .entry(entry.layer)
                .or_default()
                .push((entry.path, data));
        }
    }

    // Write layer files
    for (layer_name, files) in layer_files {
        let layer_dir = content_dir.join(&layer_name);
        fs::create_dir_all(&layer_dir)?;

        for (file_path, data) in files {
            let full_path = layer_dir.join(file_path);
            fs::write(full_path, data)?;
        }
    }

    let mut layers_extracted: Vec<String> = layers_seen.into_iter().collect();
    layers_extracted.sort();

    Ok(ExtractResult {
        project_path: output_dir,
        files_extracted,
        bytes_extracted,
        layers_extracted,
    })
}

/// Extract only specific files from a package
pub fn extract_files(
    package_path: impl AsRef<Path>,
    file_paths: Vec<String>,
    output_dir: impl AsRef<Path>,
    verify_checksums: bool,
) -> Result<usize> {
    let mut reader = PackageReader::open(package_path)?;
    let all_files = reader.list_files()?;

    let output_dir = output_dir.as_ref();
    fs::create_dir_all(output_dir)?;

    let mut extracted_count = 0;

    for file_path in file_paths {
        // Find the file entry
        let entry = all_files
            .iter()
            .find(|e| e.path == file_path)
            .ok_or_else(|| {
                DmodpkgError::validation(format!("File not found in package: {}", file_path))
            })?;

        // Extract the file
        let data = reader.extract_file(entry, verify_checksums)?;

        // Write to output directory
        let output_path = output_dir.join(&file_path);
        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(output_path, data)?;

        extracted_count += 1;
    }

    Ok(extracted_count)
}

/// Extract files from a specific layer
pub fn extract_layer(
    package_path: impl AsRef<Path>,
    layer_name: &str,
    output_dir: impl AsRef<Path>,
    verify_checksums: bool,
) -> Result<usize> {
    let mut reader = PackageReader::open(package_path)?;
    let layer_files = reader.list_files_by_layer(layer_name)?;

    if layer_files.is_empty() {
        return Err(DmodpkgError::validation(format!(
            "No files found for layer: {}",
            layer_name
        )));
    }

    let output_dir = output_dir.as_ref();
    fs::create_dir_all(output_dir)?;

    let mut extracted_count = 0;

    for entry in layer_files {
        let data = reader.extract_file(&entry, verify_checksums)?;

        let output_path = output_dir.join(&entry.path);
        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(output_path, data)?;

        extracted_count += 1;
    }

    Ok(extracted_count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_options_default() {
        let options = ExtractOptions::default();
        assert!(options.verify_checksums);
        assert!(options.layers.is_empty());
        assert!(!options.overwrite);
    }
}

