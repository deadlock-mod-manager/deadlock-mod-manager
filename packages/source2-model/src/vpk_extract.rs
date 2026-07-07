use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use vpk_parser::{VpkParseOptions, VpkParser};

use crate::error::{Result, Source2Error};

const VPK_SIGNATURE: u32 = 0x55aa1234;

struct EntryInfo {
    full_path: String,
    archive_index: u16,
    entry_offset: u32,
    entry_length: u32,
}

pub struct VpkArchive {
    path: PathBuf,
    buffer: Vec<u8>,
    data_section_start: usize,
    entries: Vec<EntryInfo>,
}

impl VpkArchive {
    pub fn open(vpk_path: &Path) -> Result<Self> {
        let buffer = fs::read(vpk_path)?;
        if buffer.len() < 12 {
            return Err(Source2Error::Vpk("VPK file too small".into()));
        }

        let sig = u32::from_le_bytes(buffer[0..4].try_into().unwrap());
        if sig != VPK_SIGNATURE {
            return Err(Source2Error::Vpk("bad VPK signature".into()));
        }

        let version = u32::from_le_bytes(buffer[4..8].try_into().unwrap());
        let tree_length = u32::from_le_bytes(buffer[8..12].try_into().unwrap()) as usize;
        let tree_start: usize = if version >= 2 { 28 } else { 12 };
        let data_section_start = tree_start + tree_length;

        let options = VpkParseOptions {
            include_entries: true,
            file_path: vpk_path.to_string_lossy().to_string(),
            ..Default::default()
        };
        let parsed = VpkParser::parse(buffer.clone(), options)
            .map_err(|e| Source2Error::Vpk(format!("failed to parse VPK: {e}")))?;

        let entries = parsed
            .entries
            .into_iter()
            .map(|entry| EntryInfo {
                full_path: entry.full_path,
                archive_index: entry.archive_index,
                entry_offset: entry.entry_offset,
                entry_length: entry.entry_length,
            })
            .collect();

        Ok(Self {
            path: vpk_path.to_path_buf(),
            buffer,
            data_section_start,
            entries,
        })
    }

    pub fn list_entries(&self) -> Vec<String> {
        self.entries
            .iter()
            .map(|entry| entry.full_path.clone())
            .collect()
    }

    pub fn contains_entry(&self, entry_path: &str) -> bool {
        self.entries
            .iter()
            .any(|entry| entry.full_path.eq_ignore_ascii_case(entry_path))
    }

    pub fn extract_entry(&self, entry_path: &str) -> Result<Vec<u8>> {
        let entry = self
            .entries
            .iter()
            .find(|entry| entry.full_path.eq_ignore_ascii_case(entry_path))
            .ok_or_else(|| Source2Error::EntryNotFound(entry_path.to_string()))?;

        let mut bytes: Vec<u8> = Vec::with_capacity(entry.entry_length as usize);
        if entry.entry_length == 0 {
            return Ok(bytes);
        }

        if entry.archive_index == 0x7fff {
            let start = self.data_section_start + entry.entry_offset as usize;
            let end = start + entry.entry_length as usize;
            if end > self.buffer.len() {
                return Err(Source2Error::Vpk("inline entry out of bounds".into()));
            }
            bytes.extend_from_slice(&self.buffer[start..end]);
            return Ok(bytes);
        }

        let stem = self.path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
        let base = stem.strip_suffix("_dir").unwrap_or(stem);
        let archive_name = format!("{base}_{:03}.vpk", entry.archive_index);
        let archive_path = self
            .path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join(&archive_name);
        let mut archive_file = fs::File::open(&archive_path)?;
        archive_file.seek(SeekFrom::Start(u64::from(entry.entry_offset)))?;
        bytes.resize(entry.entry_length as usize, 0);
        archive_file.read_exact(&mut bytes)?;
        Ok(bytes)
    }
}

/// Read the raw bytes of a single entry inside a VPK, resolving inline data and
/// companion `_NNN.vpk` archives. Mirrors the game's VPK v2 layout.
pub fn extract_entry(vpk_path: &Path, entry_path: &str) -> Result<Vec<u8>> {
    VpkArchive::open(vpk_path)?.extract_entry(entry_path)
}

/// List every entry path in a VPK (used to resolve the actual texture path when
/// the caller only knows a filename).
pub fn list_entries(vpk_path: &Path) -> Result<Vec<String>> {
    Ok(VpkArchive::open(vpk_path)?.list_entries())
}
