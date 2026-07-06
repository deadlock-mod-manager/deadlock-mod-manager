use std::fs;
use std::path::Path;

use vpk_parser::{VpkParseOptions, VpkParser};

use crate::error::{Result, Source2Error};

const VPK_SIGNATURE: u32 = 0x55aa1234;

/// Read the raw bytes of a single entry inside a VPK, resolving inline data and
/// companion `_NNN.vpk` archives. Mirrors the game's VPK v2 layout.
pub fn extract_entry(vpk_path: &Path, entry_path: &str) -> Result<Vec<u8>> {
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

    let entry = parsed
        .entries
        .iter()
        .find(|e| e.full_path.eq_ignore_ascii_case(entry_path))
        .ok_or_else(|| Source2Error::EntryNotFound(entry_path.to_string()))?;

    let mut bytes: Vec<u8> = Vec::with_capacity(entry.entry_length as usize);

    if entry.entry_length > 0 {
        if entry.archive_index == 0x7fff {
            // Inline: data lives in the dir VPK after the tree.
            let start = data_section_start + entry.entry_offset as usize;
            let end = start + entry.entry_length as usize;
            if end > buffer.len() {
                return Err(Source2Error::Vpk("inline entry out of bounds".into()));
            }
            bytes.extend_from_slice(&buffer[start..end]);
        } else {
            // Companion archive file `<base>_<NNN>.vpk`.
            let stem = vpk_path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
            let base = stem.strip_suffix("_dir").unwrap_or(stem);
            let archive_name = format!("{base}_{:03}.vpk", entry.archive_index);
            let archive_path = vpk_path
                .parent()
                .unwrap_or_else(|| Path::new("."))
                .join(&archive_name);
            let archive_buf = fs::read(&archive_path)?;
            let start = entry.entry_offset as usize;
            let end = start + entry.entry_length as usize;
            if end > archive_buf.len() {
                return Err(Source2Error::Vpk("archive entry out of bounds".into()));
            }
            bytes.extend_from_slice(&archive_buf[start..end]);
        }
    }

    Ok(bytes)
}

/// List every entry path in a VPK (used to resolve the actual texture path when
/// the caller only knows a filename).
pub fn list_entries(vpk_path: &Path) -> Result<Vec<String>> {
    let buffer = fs::read(vpk_path)?;
    let options = VpkParseOptions {
        include_entries: true,
        file_path: vpk_path.to_string_lossy().to_string(),
        ..Default::default()
    };
    let parsed = VpkParser::parse(buffer, options)
        .map_err(|e| Source2Error::Vpk(format!("failed to parse VPK: {e}")))?;
    Ok(parsed.entries.into_iter().map(|e| e.full_path).collect())
}
