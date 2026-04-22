use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

pub const MANIFEST_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompressionManifest {
    pub version: u32,
    pub base_name: String,
    pub max_shard_bytes: u64,
    pub shard_files: Vec<String>,
    pub mods: HashMap<String, ModManifestEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModManifestEntry {
    pub load_order: u32,
    pub original_vpk_names: Vec<String>,
    pub asset_keys: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blake3_fingerprint: Option<String>,
}

impl CompressionManifest {
    pub fn new(base_name: String, max_shard_bytes: u64) -> Self {
        Self {
            version: MANIFEST_VERSION,
            base_name,
            max_shard_bytes,
            shard_files: Vec::new(),
            mods: HashMap::new(),
        }
    }
}

pub fn manifest_dir_under_addons(addons_path: &std::path::Path) -> PathBuf {
    addons_path.join(".deadlock-compression")
}

pub fn manifest_path(addons_path: &std::path::Path) -> PathBuf {
    manifest_dir_under_addons(addons_path).join("manifest.json")
}
