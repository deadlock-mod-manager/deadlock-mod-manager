use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

pub const MANIFEST_VERSION: u32 = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CompressionLevel {
    Low,
    Medium,
    High,
    Extreme,
}

impl CompressionLevel {
    pub const fn mods_per_bucket(self) -> Option<usize> {
        match self {
            Self::Low => Some(2),
            Self::Medium => Some(4),
            Self::High => Some(6),
            Self::Extreme => None,
        }
    }
}

impl Default for CompressionLevel {
    fn default() -> Self {
        Self::Low
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BucketEntry {
    pub id: u32,
    pub mod_ids: Vec<String>,
    pub shard_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompressionManifest {
    pub version: u32,
    pub base_name: String,
    pub max_shard_bytes: u64,
    pub compression_level: CompressionLevel,
    pub buckets: Vec<BucketEntry>,
    pub mods: HashMap<String, ModManifestEntry>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub shard_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModManifestEntry {
    pub load_order: u32,
    pub original_vpk_names: Vec<String>,
    pub asset_keys: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blake3_fingerprint: Option<String>,
    #[serde(default)]
    pub bucket_id: u32,
}

impl CompressionManifest {
    pub fn new(
        base_name: String,
        max_shard_bytes: u64,
        compression_level: CompressionLevel,
    ) -> Self {
        Self {
            version: MANIFEST_VERSION,
            base_name,
            max_shard_bytes,
            compression_level,
            buckets: Vec::new(),
            mods: HashMap::new(),
            shard_files: Vec::new(),
        }
    }

    pub fn all_shard_file_names(&self) -> Vec<String> {
        let mut out: Vec<String> = self
            .buckets
            .iter()
            .flat_map(|b| b.shard_files.iter().cloned())
            .collect();
        if !self.shard_files.is_empty() {
            for s in &self.shard_files {
                if !out.contains(s) {
                    out.push(s.clone());
                }
            }
        }
        out
    }
}

#[derive(Debug, Deserialize)]
struct CompressionManifestV1 {
    #[allow(dead_code)]
    version: u32,
    base_name: String,
    max_shard_bytes: u64,
    shard_files: Vec<String>,
    mods: HashMap<String, ModManifestEntryV1>,
}

#[derive(Debug, Deserialize)]
struct ModManifestEntryV1 {
    load_order: u32,
    original_vpk_names: Vec<String>,
    asset_keys: Vec<String>,
    blake3_fingerprint: Option<String>,
}

fn migrate_v1_to_v2(v1: CompressionManifestV1) -> CompressionManifest {
    let mut mod_entries: HashMap<String, ModManifestEntry> = HashMap::new();
    let mut pairs: Vec<(String, u32)> = v1
        .mods
        .iter()
        .map(|(id, e)| (id.clone(), e.load_order))
        .collect();
    pairs.sort_by_key(|(_, lo)| *lo);
    let mod_ids: Vec<String> = pairs.into_iter().map(|(id, _)| id).collect();

    for (id, e) in v1.mods {
        mod_entries.insert(
            id,
            ModManifestEntry {
                load_order: e.load_order,
                original_vpk_names: e.original_vpk_names,
                asset_keys: e.asset_keys,
                blake3_fingerprint: e.blake3_fingerprint,
                bucket_id: 1,
            },
        );
    }

    CompressionManifest {
        version: MANIFEST_VERSION,
        base_name: v1.base_name,
        max_shard_bytes: v1.max_shard_bytes,
        compression_level: CompressionLevel::Extreme,
        buckets: vec![BucketEntry {
            id: 1,
            mod_ids,
            shard_files: v1.shard_files,
        }],
        mods: mod_entries,
        shard_files: Vec::new(),
    }
}

pub fn parse_manifest_json(data: &str) -> crate::error::Result<CompressionManifest> {
    let value: serde_json::Value = serde_json::from_str(data).map_err(|e| {
        crate::error::VpkMergerError::Invalid {
            message: format!("manifest parse: {e}"),
        }
    })?;
    let version = value
        .get("version")
        .and_then(|v| v.as_u64())
        .map(|n| n as u32)
        .unwrap_or(1);
    if version == 1 {
        let v1: CompressionManifestV1 = serde_json::from_value(value).map_err(|e| {
            crate::error::VpkMergerError::Invalid {
                message: format!("manifest v1 parse: {e}"),
            }
        })?;
        return Ok(migrate_v1_to_v2(v1));
    }
    let mut m: CompressionManifest = serde_json::from_value(value).map_err(|e| {
        crate::error::VpkMergerError::Invalid {
            message: format!("manifest parse: {e}"),
        }
    })?;
    if m.version < MANIFEST_VERSION {
        m.version = MANIFEST_VERSION;
    }
    if m.buckets.is_empty() && !m.shard_files.is_empty() {
        let mod_ids: Vec<String> = {
            let mut p: Vec<(String, u32)> = m
                .mods
                .iter()
                .map(|(id, e)| (id.clone(), e.load_order))
                .collect();
            p.sort_by_key(|(_, lo)| *lo);
            p.into_iter().map(|(id, _)| id).collect()
        };
        m.buckets.push(BucketEntry {
            id: 1,
            mod_ids,
            shard_files: std::mem::take(&mut m.shard_files),
        });
        for e in m.mods.values_mut() {
            if e.bucket_id == 0 {
                e.bucket_id = 1;
            }
        }
    }
    Ok(m)
}

pub fn manifest_dir_under_addons(addons_path: &std::path::Path) -> PathBuf {
    addons_path.join(".deadlock-compression")
}

pub fn manifest_path(addons_path: &std::path::Path) -> PathBuf {
    manifest_dir_under_addons(addons_path).join("manifest.json")
}
