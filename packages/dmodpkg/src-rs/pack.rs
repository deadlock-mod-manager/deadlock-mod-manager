use crate::config::ModConfig;
use crate::error::{DmodpkgError, Result};
use crate::types::BuildInfo;
use crate::validator::{validate_project, ValidationOptions};
use crate::writer::{InputFile, PackageStats, PackageWriter, WriterOptions};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// Options for packing a mod
#[derive(Debug, Clone)]
pub struct PackOptions {
    /// Compression level (1-22)
    pub compression_level: i32,
    /// Chunk size in bytes
    pub chunk_size: usize,
    /// Skip validation checks
    pub skip_validation: bool,
    /// Validation options
    pub validation: ValidationOptions,
}

impl Default for PackOptions {
    fn default() -> Self {
        Self {
            compression_level: 9,
            chunk_size: 1024 * 1024, // 1MB
            skip_validation: false,
            validation: ValidationOptions::default(),
        }
    }
}

/// Result of packing operation
#[derive(Debug)]
pub struct PackResult {
    /// Path to the created package
    pub package_path: PathBuf,
    /// Packaging statistics
    pub stats: PackageStats,
    /// Validation warnings (if any)
    pub warnings: Vec<String>,
}

/// Pack a mod project into a .dmodpkg file
///
/// # Arguments
/// * `project_path` - Path to the mod project directory (contains mod.config.json)
/// * `output_path` - Path where the .dmodpkg file will be created (optional, defaults to build/)
/// * `options` - Packing options
///
/// # Returns
/// `PackResult` containing the output path and statistics
pub fn pack_mod(
    project_path: impl AsRef<Path>,
    output_path: Option<impl AsRef<Path>>,
    options: PackOptions,
) -> Result<PackResult> {
    let project_path = project_path.as_ref();

    // Read and parse mod.config.json
    let config_path = project_path.join("mod.config.json");
    if !config_path.exists() {
        return Err(DmodpkgError::validation(
            "mod.config.json not found in project directory",
        ));
    }

    let config_content = std::fs::read_to_string(&config_path)?;
    let config = ModConfig::from_json(&config_content)?;

    // Validate project
    let validation_result = if !options.skip_validation {
        let result = validate_project(project_path, &config, &options.validation)?;
        if result.has_warnings() {
            eprintln!("Validation warnings:");
            for warning in &result.warnings {
                eprintln!("  - {}", warning.message);
            }
        }
        Some(result)
    } else {
        None
    };

    // Determine output path
    let output_file_path = if let Some(path) = output_path {
        path.as_ref().to_path_buf()
    } else {
        // Default: build/<name>-<version>.dmodpkg
        let build_dir = project_path.join("build");
        std::fs::create_dir_all(&build_dir)?;
        build_dir.join(format!("{}-{}.dmodpkg", config.name, config.version))
    };

    // Collect files from content directory
    let content_dir = project_path.join("content");
    let mut files = Vec::new();

    for layer in &config.layers {
        let layer_dir = content_dir.join(&layer.name);

        // Skip if layer directory doesn't exist (might be optional)
        if !layer_dir.exists() {
            if layer.required {
                return Err(DmodpkgError::validation(format!(
                    "Required layer '{}' directory not found",
                    layer.name
                )));
            }
            continue;
        }

        // Scan for files in layer directory
        for entry in std::fs::read_dir(&layer_dir)? {
            let entry = entry?;
            let path = entry.path();

            if path.is_file() {
                let file_name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .ok_or_else(|| DmodpkgError::validation("Invalid filename"))?
                    .to_string();

                files.push(InputFile {
                    path: file_name,
                    layer: layer.name.clone(),
                    source_path: path,
                });
            }
        }
    }

    // Collect preview images
    let previews_dir = project_path.join("previews");
    if previews_dir.exists() {
        collect_preview_files(&previews_dir, &previews_dir, &mut files)?;
    }

    // Include README if specified and exists
    if let Some(readme_path) = &config.readme {
        let readme_full_path = project_path.join(readme_path);
        if readme_full_path.exists() {
            files.push(InputFile {
                path: readme_path.clone(),
                layer: "_metadata".to_string(),
                source_path: readme_full_path,
            });
        }
    }

    // Generate build info
    let build_info = BuildInfo {
        builder_version: env!("CARGO_PKG_VERSION").to_string(),
        build_timestamp: format_timestamp(SystemTime::now()),
        platform: std::env::consts::OS.to_string(),
        checksum_algorithm: "SHA256".to_string(),
    };

    // Serialize config to JSON value
    let config_json = serde_json::to_value(&config).map_err(DmodpkgError::Json)?;

    // Create writer
    let writer_options = WriterOptions {
        compression_level: options.compression_level,
        chunk_size: options.chunk_size,
        verify: false,
    };

    let mut writer =
        PackageWriter::new(&output_file_path, config_json, build_info, writer_options)?;

    // Add all files
    writer.add_files(files)?;

    // Write package
    let stats = writer.write()?;

    Ok(PackResult {
        package_path: output_file_path,
        stats,
        warnings: validation_result
            .map(|r| r.warnings.iter().map(|w| w.message.clone()).collect())
            .unwrap_or_default(),
    })
}

/// Recursively collect preview files
fn collect_preview_files(
    base_dir: &Path,
    current_dir: &Path,
    files: &mut Vec<InputFile>,
) -> Result<()> {
    for entry in std::fs::read_dir(current_dir)? {
        let entry = entry?;
        let path = entry.path();

        if path.is_file() {
            // Get relative path from base previews directory
            let relative_path = path
                .strip_prefix(base_dir)
                .map_err(|_| DmodpkgError::validation("Invalid preview path"))?;

            let path_str = relative_path
                .to_str()
                .ok_or_else(|| DmodpkgError::validation("Invalid preview filename"))?
                .to_string();

            // Store with previews/ prefix
            files.push(InputFile {
                path: format!("previews/{}", path_str),
                layer: "_metadata".to_string(),
                source_path: path,
            });
        } else if path.is_dir() {
            // Recursively collect from subdirectories
            collect_preview_files(base_dir, &path, files)?;
        }
    }

    Ok(())
}

/// Format system time as ISO 8601 timestamp
fn format_timestamp(time: SystemTime) -> String {
    let duration = time
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();

    let secs = duration.as_secs();
    let datetime = chrono::DateTime::<chrono::Utc>::from_timestamp(secs as i64, 0)
        .unwrap_or_else(chrono::Utc::now);

    datetime.to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pack_options_default() {
        let options = PackOptions::default();
        assert_eq!(options.compression_level, 9);
        assert_eq!(options.chunk_size, 1024 * 1024);
        assert!(!options.skip_validation);
    }

    #[test]
    fn test_format_timestamp() {
        let timestamp = format_timestamp(SystemTime::now());
        assert!(!timestamp.is_empty());
        assert!(timestamp.contains('T'));
        assert!(timestamp.contains('Z') || timestamp.contains('+'));
    }
}
