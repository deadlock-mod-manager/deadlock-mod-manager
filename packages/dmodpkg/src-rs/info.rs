use crate::config::ModConfig;
use crate::error::{DmodpkgError, Result};
use crate::reader::PackageReader;
use crate::types::{BuildInfo, FileEntry};
use std::collections::HashMap;
use std::path::Path;

/// Package information structure
#[derive(Debug, Clone)]
pub struct PackageInfo {
    /// Mod configuration
    pub config: ModConfig,
    /// Build information
    pub build_info: BuildInfo,
    /// Package statistics
    pub stats: PackageStats,
    /// Layer information
    pub layers: Vec<LayerInfo>,
    /// File list
    pub files: Vec<FileInfo>,
}

/// Package statistics
#[derive(Debug, Clone)]
pub struct PackageStats {
    /// Total package size in bytes
    pub total_size: u64,
    /// Total uncompressed size in bytes
    pub uncompressed_size: u64,
    /// Total compressed data size in bytes
    pub compressed_size: u64,
    /// Number of files
    pub file_count: usize,
    /// Number of chunks
    pub chunk_count: usize,
    /// Compression ratio (0.0 to 1.0, lower is better)
    pub compression_ratio: f64,
}

/// Layer information
#[derive(Debug, Clone)]
pub struct LayerInfo {
    /// Layer name
    pub name: String,
    /// Number of files in this layer
    pub file_count: usize,
    /// Total uncompressed size of files in this layer
    pub total_size: u64,
    /// Layer priority
    pub priority: i32,
    /// Whether layer is required
    pub required: bool,
}

/// File information
#[derive(Debug, Clone)]
pub struct FileInfo {
    /// File path
    pub path: String,
    /// Layer name
    pub layer: String,
    /// Uncompressed size
    pub size: u64,
    /// Number of chunks
    pub chunk_count: usize,
}

/// Read package information without extracting
///
/// This is a lightweight operation that only reads the header and metadata,
/// not the actual file data.
pub fn read_package_info(package_path: impl AsRef<Path>) -> Result<PackageInfo> {
    let package_path = package_path.as_ref();

    if !package_path.exists() {
        return Err(DmodpkgError::validation(format!(
            "Package file not found: {}",
            package_path.display()
        )));
    }

    let mut reader = PackageReader::open(package_path)?;
    
    // Get package info from reader
    let info = reader.get_info()?;
    
    // Parse config from metadata
    let config: ModConfig = serde_json::from_value(info.metadata.config.clone())
        .map_err(|e| DmodpkgError::Json(e))?;

    // Calculate statistics
    let file_metadata = std::fs::metadata(package_path)?;
    let total_size = file_metadata.len();
    
    let uncompressed_size = info.header.total_uncompressed_size;
    let compressed_size = info.header.data_section_offset as u64 
        + info.file_entries.iter()
            .flat_map(|f| f.chunk_indices.iter())
            .count() as u64; // Approximate compressed size
    
    let compression_ratio = if uncompressed_size > 0 {
        compressed_size as f64 / uncompressed_size as f64
    } else {
        0.0
    };

    let stats = PackageStats {
        total_size,
        uncompressed_size,
        compressed_size,
        file_count: info.file_entries.len(),
        chunk_count: info.file_entries.iter()
            .map(|f| f.chunk_indices.len())
            .sum(),
        compression_ratio,
    };

    // Group files by layer
    let mut layer_map: HashMap<String, Vec<&FileEntry>> = HashMap::new();
    for entry in &info.file_entries {
        layer_map.entry(entry.layer.clone()).or_default().push(entry);
    }

    // Build layer info
    let mut layers = Vec::new();
    for layer_config in &config.layers {
        let empty_vec = Vec::new();
        let files = layer_map.get(&layer_config.name).unwrap_or(&empty_vec);
        let layer_info = LayerInfo {
            name: layer_config.name.clone(),
            file_count: files.len(),
            total_size: files.iter().map(|f| f.uncompressed_size).sum(),
            priority: layer_config.priority,
            required: layer_config.required,
        };
        layers.push(layer_info);
    }

    // Build file list
    let files = info
        .file_entries
        .iter()
        .map(|entry| FileInfo {
            path: entry.path.clone(),
            layer: entry.layer.clone(),
            size: entry.uncompressed_size,
            chunk_count: entry.chunk_indices.len(),
        })
        .collect();

    Ok(PackageInfo {
        config,
        build_info: info.metadata.build_info,
        stats,
        layers,
        files,
    })
}

/// List all files in a package
pub fn list_files(package_path: impl AsRef<Path>) -> Result<Vec<FileInfo>> {
    let mut reader = PackageReader::open(package_path)?;
    let entries = reader.list_files()?;

    Ok(entries
        .iter()
        .map(|entry| FileInfo {
            path: entry.path.clone(),
            layer: entry.layer.clone(),
            size: entry.uncompressed_size,
            chunk_count: entry.chunk_indices.len(),
        })
        .collect())
}

/// List files in a specific layer
pub fn list_layer_files(package_path: impl AsRef<Path>, layer: &str) -> Result<Vec<FileInfo>> {
    let mut reader = PackageReader::open(package_path)?;
    let entries = reader.list_files_by_layer(layer)?;

    Ok(entries
        .iter()
        .map(|entry| FileInfo {
            path: entry.path.clone(),
            layer: entry.layer.clone(),
            size: entry.uncompressed_size,
            chunk_count: entry.chunk_indices.len(),
        })
        .collect())
}

/// Get mod configuration from package
pub fn read_mod_config(package_path: impl AsRef<Path>) -> Result<ModConfig> {
    let mut reader = PackageReader::open(package_path)?;
    let metadata = reader.read_metadata()?;

    let config: ModConfig = serde_json::from_value(metadata.config.clone())
        .map_err(|e| DmodpkgError::Json(e))?;

    Ok(config)
}

/// Format package info as human-readable string
pub fn format_package_info(info: &PackageInfo) -> String {
    let mut output = String::new();

    // Header
    output.push_str(&format!(
        "{} v{}\n",
        info.config.display_name, info.config.version
    ));
    output.push_str(&"=".repeat(60));
    output.push('\n');
    output.push('\n');

    // Basic info
    output.push_str(&format!("Description: {}\n", info.config.description));
    output.push_str(&format!(
        "Authors: {}\n",
        info.config
            .authors
            .iter()
            .map(|a| match a {
                crate::types::Author::Name(n) => n.clone(),
                crate::types::Author::Detailed { name, .. } => name.clone(),
            })
            .collect::<Vec<_>>()
            .join(", ")
    ));

    if let Some(license) = &info.config.license {
        output.push_str(&format!("License: {}\n", license));
    }

    if let Some(game_version) = &info.config.game_version {
        output.push_str(&format!("Game Version: {}\n", game_version));
    }

    output.push('\n');

    // Layers
    output.push_str("Layers:\n");
    for layer in &info.layers {
        let required = if layer.required { "[required]" } else { "" };
        output.push_str(&format!(
            "  • {} (priority {}) - {} files, {:.2} MB {}\n",
            layer.name,
            layer.priority,
            layer.file_count,
            layer.total_size as f64 / (1024.0 * 1024.0),
            required
        ));
    }
    output.push('\n');

    // Variant groups
    if !info.config.variant_groups.is_empty() {
        output.push_str("Variant Groups:\n");
        for group in &info.config.variant_groups {
            output.push_str(&format!(
                "  {} (default: {})\n",
                group.name, group.default
            ));
            for variant in &group.variants {
                output.push_str(&format!("    • {} - {}\n", variant.id, variant.name));
            }
        }
        output.push('\n');
    }

    // Statistics
    output.push_str("Package Info:\n");
    output.push_str(&format!("  Files: {}\n", info.stats.file_count));
    output.push_str(&format!("  Chunks: {}\n", info.stats.chunk_count));
    output.push_str(&format!(
        "  Package Size: {:.2} MB\n",
        info.stats.total_size as f64 / (1024.0 * 1024.0)
    ));
    output.push_str(&format!(
        "  Uncompressed Size: {:.2} MB\n",
        info.stats.uncompressed_size as f64 / (1024.0 * 1024.0)
    ));
    output.push_str(&format!(
        "  Compression Ratio: {:.1}%\n",
        (1.0 - info.stats.compression_ratio) * 100.0
    ));

    output.push('\n');

    // Build info
    output.push_str("Build Info:\n");
    output.push_str(&format!(
        "  Builder Version: {}\n",
        info.build_info.builder_version
    ));
    output.push_str(&format!(
        "  Build Time: {}\n",
        info.build_info.build_timestamp
    ));
    output.push_str(&format!("  Platform: {}\n", info.build_info.platform));

    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_package_stats() {
        let stats = PackageStats {
            total_size: 1000,
            uncompressed_size: 2000,
            compressed_size: 800,
            file_count: 5,
            chunk_count: 10,
            compression_ratio: 0.4,
        };

        assert_eq!(stats.file_count, 5);
        assert_eq!(stats.chunk_count, 10);
        assert_eq!(stats.compression_ratio, 0.4);
    }

    #[test]
    fn test_layer_info() {
        let layer = LayerInfo {
            name: "base".to_string(),
            file_count: 3,
            total_size: 1024,
            priority: 0,
            required: true,
        };

        assert_eq!(layer.name, "base");
        assert_eq!(layer.file_count, 3);
        assert!(layer.required);
    }
}

