use crate::info::{FileInfo, LayerInfo, PackageStats};
use crate::types::BuildInfo;
use crate::validator::ValidationWarning;
use crate::ModConfig;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// FFI-compatible pack result
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct PackResultFFI {
    /// Path to the created package
    pub package_path: String,
    /// Total files packed
    pub file_count: usize,
    /// Total uncompressed size
    pub uncompressed_size: u64,
    /// Total compressed size
    pub compressed_size: u64,
    /// Compression ratio (0.0 to 1.0)
    pub compression_ratio: f64,
    /// Validation warnings
    pub warnings: Vec<String>,
}

/// FFI-compatible extract result
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct ExtractResultFFI {
    /// Path to the extracted project directory
    pub project_path: String,
    /// Number of files extracted
    pub files_extracted: usize,
    /// Total bytes extracted (uncompressed)
    pub bytes_extracted: u64,
    /// Layers that were extracted
    pub layers_extracted: Vec<String>,
}

/// FFI-compatible package info
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct PackageInfoFFI {
    /// Mod configuration
    pub config: ModConfig,
    /// Build information
    pub build_info: BuildInfo,
    /// Package statistics
    pub stats: PackageStatsFFI,
    /// Layer information
    pub layers: Vec<LayerInfoFFI>,
    /// File list
    pub files: Vec<FileInfoFFI>,
}

/// FFI-compatible package statistics
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct PackageStatsFFI {
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

/// FFI-compatible layer information
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct LayerInfoFFI {
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

/// FFI-compatible file information
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct FileInfoFFI {
    /// File path
    pub path: String,
    /// Layer name
    pub layer: String,
    /// Uncompressed size
    pub size: u64,
    /// Number of chunks
    pub chunk_count: usize,
}

/// FFI-compatible validation result
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct ValidationResultFFI {
    /// Whether validation passed
    pub valid: bool,
    /// Validation warnings
    pub warnings: Vec<ValidationWarningFFI>,
    /// Validation errors
    pub errors: Vec<String>,
}

/// FFI-compatible validation warning
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct ValidationWarningFFI {
    /// Warning message
    pub message: String,
}

/// FFI-compatible file list result
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct FileListFFI {
    /// List of files
    pub files: Vec<FileInfoFFI>,
}

// Conversion implementations
impl From<PackageStats> for PackageStatsFFI {
    fn from(stats: PackageStats) -> Self {
        Self {
            total_size: stats.total_size,
            uncompressed_size: stats.uncompressed_size,
            compressed_size: stats.compressed_size,
            file_count: stats.file_count,
            chunk_count: stats.chunk_count,
            compression_ratio: stats.compression_ratio,
        }
    }
}

impl From<LayerInfo> for LayerInfoFFI {
    fn from(info: LayerInfo) -> Self {
        Self {
            name: info.name,
            file_count: info.file_count,
            total_size: info.total_size,
            priority: info.priority,
            required: info.required,
        }
    }
}

impl From<FileInfo> for FileInfoFFI {
    fn from(info: FileInfo) -> Self {
        Self {
            path: info.path,
            layer: info.layer,
            size: info.size,
            chunk_count: info.chunk_count,
        }
    }
}

impl From<ValidationWarning> for ValidationWarningFFI {
    fn from(warning: ValidationWarning) -> Self {
        Self {
            message: warning.message,
        }
    }
}

