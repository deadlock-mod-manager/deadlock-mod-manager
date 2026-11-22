use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct VpkEntry {
    pub full_path: String,
    pub path: String,
    pub filename: String,
    pub ext: String,
    pub crc32_hex: String,
    pub preload_bytes: u16,
    pub archive_index: u16,
    pub entry_offset: u32,
    pub entry_length: u32,
    pub terminator: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct VpkFingerprint {
    pub file_path: String,
    pub file_size: usize,
    pub last_modified: Option<String>, // ISO string for JSON compatibility
    pub fast_hash: String,             // xxHash64
    pub sha256: String,
    pub content_signature: String, // SHA-256 of sorted (path, size, crc32) tuples
    pub vpk_version: u32,
    pub file_count: usize,
    pub has_multiparts: bool,
    pub has_inline_data: bool,
    pub merkle_root: Option<String>,
    pub merkle_leaves: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct VpkParsed {
    pub version: u32,
    pub tree_length: u32,
    pub file_data_section_size: Option<u32>,
    pub archive_md5_section_size: Option<u32>,
    pub other_md5_section_size: Option<u32>,
    pub signature_section_size: Option<u32>,
    pub entries: Vec<VpkEntry>,
    pub manifest_sha256: String,
    pub dir_sha256: Option<String>,
    pub fingerprint: VpkFingerprint,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct VpkParseOptions {
    pub include_full_file_hash: bool,
    pub file_path: String,
    pub last_modified: Option<DateTime<Utc>>,
    pub include_merkle: bool,
    pub include_entries: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct VpkHeader {
    pub signature: u32,
    pub version: u32,
    pub tree_length: u32,
    pub file_data_section_size: Option<u32>,
    pub archive_md5_section_size: Option<u32>,
    pub other_md5_section_size: Option<u32>,
    pub signature_section_size: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../src/generated/", rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct VpkInfo {
    pub version: u32,
    pub file_count: usize,
    pub fast_hash: String,
    pub manifest_sha256: String,
}

#[derive(Debug, Clone)]
pub struct MerkleData {
    pub root: String,
    pub leaves: Vec<String>,
}
