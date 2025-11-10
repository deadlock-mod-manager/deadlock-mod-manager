use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Author information (can be a string or a detailed object)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Author {
    /// Simple string author name
    Name(String),
    /// Detailed author information
    Detailed {
        name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        role: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        url: Option<String>,
    },
}

/// Layer configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Layer {
    /// Unique layer name (e.g., "base", "hd_textures")
    pub name: String,
    /// Override priority (higher values win conflicts)
    pub priority: i32,
    /// Layer description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Whether this layer must be installed
    #[serde(default)]
    pub required: bool,
}

/// Variant within a variant group
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Variant {
    /// Unique variant identifier
    pub id: String,
    /// Display name
    pub name: String,
    /// Variant description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Layers to enable for this variant
    pub layers: Vec<String>,
    /// Main preview image (path or URL)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_image: Option<String>,
    /// Additional screenshots (paths or URLs)
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub screenshots: Vec<String>,
}

/// Variant group (mutually exclusive options)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VariantGroup {
    /// Unique group identifier
    pub id: String,
    /// Display name
    pub name: String,
    /// Group description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Default variant ID
    pub default: String,
    /// Available variants
    pub variants: Vec<Variant>,
}

/// Transformer configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transformer {
    /// Transformer plugin name
    pub name: String,
    /// Glob patterns for matching files
    pub patterns: Vec<String>,
    /// Transformer-specific configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config: Option<HashMap<String, serde_json::Value>>,
}

/// Additional metadata
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Metadata {
    /// Mod tags for categorization
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    /// Primary mod category
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    /// Whether mod contains NSFW content
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub nsfw: Option<bool>,
}

/// Build information (added during packaging)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildInfo {
    /// Version of the builder tool
    pub builder_version: String,
    /// Build timestamp (ISO 8601)
    pub build_timestamp: String,
    /// Build platform
    pub platform: String,
    /// Checksum algorithm used
    pub checksum_algorithm: String,
}

/// Package signature (optional)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Signature {
    /// Signature algorithm (e.g., "ed25519")
    pub algorithm: String,
    /// Base64-encoded public key
    pub public_key: String,
    /// Base64-encoded signature
    pub signature: String,
}

/// File entry in the package index
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    /// File path within the layer
    pub path: String,
    /// Layer name this file belongs to
    pub layer: String,
    /// Uncompressed file size
    pub uncompressed_size: u64,
    /// Chunk indices containing this file's data
    pub chunk_indices: Vec<u32>,
    /// SHA256 checksum of the file
    pub sha256: [u8; 32],
}

/// Chunk metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkMetadata {
    /// Offset in the data section
    pub offset: u64,
    /// Compressed size
    pub compressed_size: u32,
    /// Uncompressed size
    pub uncompressed_size: u32,
    /// CRC32 checksum
    pub crc32: u32,
}

/// Mod entry in a bundle
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BundleModEntry {
    /// Filename of the .dmodpkg file
    pub package: String,
    /// Whether mod is required
    #[serde(default = "default_true")]
    pub required: bool,
    /// Brief description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

fn default_true() -> bool {
    true
}

/// Preset mod configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PresetModConfig {
    /// Which mod package this applies to
    pub package: String,
    /// Variant selections (variant_group_id -> variant_id)
    pub variants: HashMap<String, String>,
}

/// Bundle preset
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BundlePreset {
    /// Unique preset identifier
    pub id: String,
    /// Display name
    pub name: String,
    /// Preset description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Whether this is the default preset
    #[serde(default)]
    pub default: bool,
    /// Mod configurations
    pub mods: Vec<PresetModConfig>,
}

/// Bundle metadata (additional metadata for bundles)
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BundleMetadata {
    /// Bundle tags for categorization
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    /// Primary bundle category
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
}
