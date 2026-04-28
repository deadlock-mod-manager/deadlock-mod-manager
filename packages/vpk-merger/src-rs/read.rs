use std::fs;
use std::path::Path;

use vpk_parser::VpkEntry;

use crate::error::{Result, VpkMergerError};

const VPK_SIGNATURE: u32 = 0x55aa1234;
const ARCHIVE_INDEX_INLINE: u16 = 0x7fff;

pub struct LoadedEntry {
    pub meta: VpkEntry,
    pub payload: Vec<u8>,
}

pub fn load_dir_vpk(dir_vpk_path: &Path) -> Result<Vec<LoadedEntry>> {
    let buffer = fs::read(dir_vpk_path)?;
    if buffer.len() < 12 {
        return Err(VpkMergerError::Invalid {
            message: "file too small for VPK header".to_string(),
        });
    }

    let signature = read_u32_at(&buffer, 0);
    if signature != VPK_SIGNATURE {
        return Err(VpkMergerError::Invalid {
            message: format!("invalid VPK signature: 0x{signature:08x}"),
        });
    }

    let version = read_u32_at(&buffer, 4);
    let tree_start: usize = match version {
        1 => 12,
        2 => 28,
        v => {
            return Err(VpkMergerError::UnsupportedVersion { version: v });
        }
    };

    if buffer.len() < tree_start {
        return Err(VpkMergerError::Invalid {
            message: format!("buffer too small for VPK v{version} header"),
        });
    }

    let tree_length = read_u32_at(&buffer, 8) as usize;
    let tree_end = tree_start.saturating_add(tree_length);
    if tree_end > buffer.len() {
        return Err(VpkMergerError::Invalid {
            message: "tree extends past file".to_string(),
        });
    }

    let data_section_start = tree_end;
    let parent = dir_vpk_path.parent().unwrap_or(Path::new("."));
    let stem = dir_vpk_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    let archive_base = stem.strip_suffix("_dir").unwrap_or(stem);

    let mut cursor = tree_start;
    let mut loaded: Vec<LoadedEntry> = Vec::new();

    while cursor < tree_end {
        let ext = read_cstring(&buffer, &mut cursor, tree_end)?;
        if ext.is_empty() {
            break;
        }

        while cursor < tree_end {
            let path = read_cstring(&buffer, &mut cursor, tree_end)?;
            if path.is_empty() {
                break;
            }

            while cursor < tree_end {
                let filename = read_cstring(&buffer, &mut cursor, tree_end)?;
                if filename.is_empty() {
                    break;
                }

                let entry =
                    parse_entry_metadata(&ext, &path, &filename, &buffer, tree_end, &mut cursor)?;
                let preload_len = entry.preload_bytes as usize;
                if cursor + preload_len > tree_end {
                    return Err(VpkMergerError::Invalid {
                        message: "preload extends past VPK tree".to_string(),
                    });
                }
                if crate::filter::is_ignored_readme(&entry) {
                    cursor += preload_len;
                    continue;
                }
                let mut payload = buffer[cursor..cursor + preload_len].to_vec();
                cursor += preload_len;

                if entry.entry_length > 0 {
                    let body =
                        read_entry_body(parent, archive_base, &entry, &buffer, data_section_start)?;
                    payload.extend_from_slice(&body);
                }

                loaded.push(LoadedEntry {
                    meta: entry,
                    payload,
                });
            }
        }
    }

    Ok(loaded)
}

fn read_entry_body(
    parent: &Path,
    archive_base: &str,
    entry: &VpkEntry,
    dir_buffer: &[u8],
    data_section_start: usize,
) -> Result<Vec<u8>> {
    let len = entry.entry_length as usize;
    if entry.archive_index == ARCHIVE_INDEX_INLINE {
        let start = data_section_start.saturating_add(entry.entry_offset as usize);
        let end = start.saturating_add(len);
        if end > dir_buffer.len() {
            return Err(VpkMergerError::Invalid {
                message: format!(
                    "inline entry out of bounds: {} + {}",
                    entry.full_path, entry.entry_length
                ),
            });
        }
        return Ok(dir_buffer[start..end].to_vec());
    }

    let archive_name = format!("{archive_base}_{:03}.vpk", entry.archive_index);
    let archive_path = parent.join(&archive_name);
    let chunk = fs::read(&archive_path).map_err(|_| VpkMergerError::MissingChunk {
        entry_path: entry.full_path.clone(),
        expected_archive: archive_path.clone(),
    })?;

    let start = entry.entry_offset as usize;
    let end = start.saturating_add(len);
    if end > chunk.len() {
        return Err(VpkMergerError::Invalid {
            message: format!(
                "chunk entry out of bounds for {} in {}",
                entry.full_path,
                archive_path.display()
            ),
        });
    }
    Ok(chunk[start..end].to_vec())
}

fn read_u32_at(buf: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes(buf[offset..offset + 4].try_into().unwrap())
}

fn read_cstring(buf: &[u8], cursor: &mut usize, limit: usize) -> Result<String> {
    let start = *cursor;
    let mut pos = start;
    while pos < limit && pos < buf.len() && buf[pos] != 0 {
        pos += 1;
    }
    if pos >= limit {
        return Err(VpkMergerError::Invalid {
            message: "unterminated string in VPK tree".to_string(),
        });
    }
    if pos >= buf.len() || buf[pos] != 0 {
        return Err(VpkMergerError::Invalid {
            message: "unterminated string in VPK tree".to_string(),
        });
    }
    let s = String::from_utf8_lossy(&buf[start..pos]).into_owned();
    *cursor = pos + 1;
    Ok(s)
}

fn parse_entry_metadata(
    ext: &str,
    path: &str,
    filename: &str,
    buf: &[u8],
    tree_end: usize,
    cursor: &mut usize,
) -> Result<VpkEntry> {
    if *cursor + 18 > tree_end {
        return Err(VpkMergerError::Invalid {
            message: "truncated VPK entry metadata".to_string(),
        });
    }

    let crc32 = read_u32_at(buf, *cursor);
    *cursor += 4;
    let preload_bytes = u16::from_le_bytes([buf[*cursor], buf[*cursor + 1]]);
    *cursor += 2;
    let archive_index = u16::from_le_bytes([buf[*cursor], buf[*cursor + 1]]);
    *cursor += 2;
    let entry_offset = read_u32_at(buf, *cursor);
    *cursor += 4;
    let entry_length = read_u32_at(buf, *cursor);
    *cursor += 4;
    let terminator = u16::from_le_bytes([buf[*cursor], buf[*cursor + 1]]);
    *cursor += 2;

    let _ = terminator;

    let normalized_path = if path == " " { "" } else { path };
    let filename_with_ext = format!("{filename}.{ext}");
    let path_parts: Vec<&str> = [normalized_path, &filename_with_ext]
        .iter()
        .filter(|s| !s.is_empty())
        .copied()
        .collect();
    let full_path = path_parts.join("/");

    Ok(VpkEntry {
        full_path,
        path: normalized_path.to_string(),
        filename: filename.to_string(),
        ext: ext.to_string(),
        crc32_hex: format!("{crc32:08x}"),
        preload_bytes,
        archive_index,
        entry_offset,
        entry_length,
        terminator,
    })
}

pub fn manifest_key(full_path: &str) -> String {
    full_path.to_lowercase().replace('\\', "/")
}
