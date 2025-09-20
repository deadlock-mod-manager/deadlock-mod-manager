use crate::{
    error::{Result, VpkError},
    types::*,
};
use chrono::{DateTime, Utc};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::hash::Hasher;
use twox_hash::XxHash64;

const VPK_SIGNATURE: u32 = 0x55aa1234;

pub struct VpkParser {
    buffer: Vec<u8>,
    cursor: usize,
}

impl VpkParser {
    pub fn new(buffer: Vec<u8>) -> Self {
        Self { buffer, cursor: 0 }
    }

    pub fn parse(buffer: Vec<u8>, options: VpkParseOptions) -> Result<VpkParsed> {
        let mut parser = Self::new(buffer);
        parser.parse_internal(options)
    }

    fn parse_internal(&mut self, options: VpkParseOptions) -> Result<VpkParsed> {
        let header = self.parse_header()?;
        let tree_start = self.cursor;
        let entries = self.parse_directory_tree(tree_start, header.tree_length as usize)?;
        let manifest_sha256 = self.generate_manifest_hash(&entries);

        let fingerprint = self.generate_fingerprint(
            &entries,
            &options.file_path,
            options.last_modified,
            options.include_merkle,
        )?;

        let dir_sha256 = if options.include_full_file_hash {
            Some(self.generate_sha256_hash()?)
        } else {
            None
        };

        Ok(VpkParsed {
            version: header.version,
            tree_length: header.tree_length,
            file_data_section_size: header.file_data_section_size,
            archive_md5_section_size: header.archive_md5_section_size,
            other_md5_section_size: header.other_md5_section_size,
            signature_section_size: header.signature_section_size,
            entries,
            manifest_sha256,
            dir_sha256,
            fingerprint,
        })
    }

    fn parse_header(&mut self) -> Result<VpkHeader> {
        if self.buffer.len() < 12 {
            return Err(VpkError::BufferTooSmall {
                expected: 12,
                actual: self.buffer.len(),
            });
        }

        let signature = self.read_u32()?;
        if signature != VPK_SIGNATURE {
            return Err(VpkError::InvalidSignature {
                expected: VPK_SIGNATURE,
                actual: signature,
            });
        }

        let version = self.read_u32()?;
        let tree_length = self.read_u32()?;

        let mut file_data_section_size = None;
        let mut archive_md5_section_size = None;
        let mut other_md5_section_size = None;
        let mut signature_section_size = None;

        if version >= 2 {
            if self.buffer.len() < 28 {
                return Err(VpkError::BufferTooSmall {
                    expected: 28,
                    actual: self.buffer.len(),
                });
            }

            file_data_section_size = Some(self.read_u32()?);
            archive_md5_section_size = Some(self.read_u32()?);
            other_md5_section_size = Some(self.read_u32()?);
            signature_section_size = Some(self.read_u32()?);
        }

        Ok(VpkHeader {
            signature,
            version,
            tree_length,
            file_data_section_size,
            archive_md5_section_size,
            other_md5_section_size,
            signature_section_size,
        })
    }

    fn parse_directory_tree(
        &mut self,
        tree_start: usize,
        tree_length: usize,
    ) -> Result<Vec<VpkEntry>> {
        let mut entries = Vec::new();
        let tree_end = tree_start + tree_length;

        while self.cursor < tree_end {
            let ext = self.read_null_terminated_string()?;
            if ext.is_empty() {
                break;
            }

            while self.cursor < tree_end {
                let path = self.read_null_terminated_string()?;
                if path.is_empty() {
                    break;
                }

                while self.cursor < tree_end {
                    let filename = self.read_null_terminated_string()?;
                    if filename.is_empty() {
                        break;
                    }

                    let entry = self.parse_entry(&ext, &path, &filename)?;
                    entries.push(entry.clone());

                    if entry.preload_bytes > 0 {
                        self.cursor += entry.preload_bytes as usize;
                        if self.cursor > self.buffer.len() {
                            return Err(VpkError::CursorOverrun {
                                cursor: self.cursor,
                                requested: entry.preload_bytes as usize,
                                buffer_size: self.buffer.len(),
                            });
                        }
                    }
                }
            }
        }

        Ok(entries)
    }

    fn parse_entry(&mut self, ext: &str, path: &str, filename: &str) -> Result<VpkEntry> {
        if self.cursor + 18 > self.buffer.len() {
            return Err(VpkError::CursorOverrun {
                cursor: self.cursor,
                requested: 18,
                buffer_size: self.buffer.len(),
            });
        }

        let crc32 = self.read_u32()?;
        let preload_bytes = self.read_u16()?;
        let archive_index = self.read_u16()?;
        let entry_offset = self.read_u32()?;
        let entry_length = self.read_u32()?;
        let terminator = self.read_u16()?;

        let normalized_path = if path == " " { "" } else { path };
        let filename_with_ext = format!("{}.{}", filename, ext);
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
            crc32_hex: format!("{:08x}", crc32),
            preload_bytes,
            archive_index,
            entry_offset,
            entry_length,
            terminator,
        })
    }

    fn generate_manifest_hash(&self, entries: &[VpkEntry]) -> String {
        let mut lines: Vec<String> = entries
            .iter()
            .map(|entry| {
                format!(
                    "{}\x00{}\n",
                    entry.full_path.to_lowercase(),
                    entry.crc32_hex
                )
            })
            .collect();
        lines.sort();
        let manifest_content = lines.join("");

        let mut hasher = Sha256::new();
        hasher.update(manifest_content.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    fn generate_fingerprint(
        &self,
        entries: &[VpkEntry],
        file_path: &str,
        last_modified: Option<DateTime<Utc>>,
        include_merkle: bool,
    ) -> Result<VpkFingerprint> {
        let has_multiparts = self.detect_multiparts(entries);
        let has_inline_data = self.detect_inline_data(entries);

        let fast_hash = self.generate_fast_hash()?;
        let sha256 = self.generate_sha256_hash()?;
        let content_signature = self.generate_content_signature(entries);

        let (merkle_root, merkle_leaves) = if include_merkle {
            let merkle_data = self.generate_merkle_hash(entries);
            (Some(merkle_data.root), Some(merkle_data.leaves))
        } else {
            (None, None)
        };

        Ok(VpkFingerprint {
            file_path: file_path.to_string(),
            file_size: self.buffer.len(),
            last_modified: last_modified.map(|dt| dt.to_rfc3339()),
            fast_hash,
            sha256,
            content_signature,
            vpk_version: self.get_vpk_version(),
            file_count: entries.len(),
            has_multiparts,
            has_inline_data,
            merkle_root,
            merkle_leaves,
        })
    }

    fn generate_fast_hash(&self) -> Result<String> {
        let mut hasher = XxHash64::with_seed(0);
        hasher.write(&self.buffer);
        let hash = hasher.finish();
        Ok(format!("{:016x}", hash))
    }

    fn generate_sha256_hash(&self) -> Result<String> {
        let mut hasher = Sha256::new();
        hasher.update(&self.buffer);
        Ok(format!("{:x}", hasher.finalize()))
    }

    fn generate_content_signature(&self, entries: &[VpkEntry]) -> String {
        let junk_files: HashSet<&str> = ["thumbs.db", ".ds_store", "desktop.ini", ".tmp", ".temp"]
            .iter()
            .copied()
            .collect();

        let filtered_entries: Vec<&VpkEntry> = entries
            .iter()
            .filter(|entry| {
                let filename = entry.filename.to_lowercase();
                let full_path = entry.full_path.to_lowercase();
                if junk_files.contains(filename.as_str()) {
                    return false;
                }
                !junk_files.iter().any(|junk| full_path.contains(junk))
            })
            .collect();

        let mut tuples: Vec<String> = filtered_entries
            .iter()
            .map(|entry| {
                let normalized_path = entry.full_path.to_lowercase().replace('\\', "/");
                format!(
                    "{}\x00{}\x00{}",
                    normalized_path, entry.entry_length, entry.crc32_hex
                )
            })
            .collect();

        tuples.sort();
        let content = tuples.join("\n");

        let mut hasher = Sha256::new();
        hasher.update(content.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    fn generate_merkle_hash(&self, entries: &[VpkEntry]) -> MerkleData {
        let leaves: Vec<String> = entries
            .iter()
            .map(|entry| {
                let entry_data = format!(
                    "{}|{}|{}",
                    entry.full_path, entry.entry_length, entry.crc32_hex
                );
                let mut hasher = Sha256::new();
                hasher.update(entry_data.as_bytes());
                format!("{:x}", hasher.finalize())
            })
            .collect();

        let mut sorted_leaves = leaves.clone();
        sorted_leaves.sort();

        let merkle_content = sorted_leaves.join("");
        let mut hasher = Sha256::new();
        hasher.update(merkle_content.as_bytes());
        let root = format!("{:x}", hasher.finalize());

        MerkleData { root, leaves }
    }

    fn get_vpk_version(&self) -> u32 {
        if self.buffer.len() < 8 {
            return 1;
        }
        u32::from_le_bytes([
            self.buffer[4],
            self.buffer[5],
            self.buffer[6],
            self.buffer[7],
        ])
    }

    fn detect_multiparts(&self, entries: &[VpkEntry]) -> bool {
        entries
            .iter()
            .any(|entry| entry.archive_index != 0x7fff && entry.archive_index > 0)
    }

    fn detect_inline_data(&self, entries: &[VpkEntry]) -> bool {
        entries.iter().any(|entry| entry.preload_bytes > 0)
    }

    fn read_u32(&mut self) -> Result<u32> {
        if self.cursor + 4 > self.buffer.len() {
            return Err(VpkError::CursorOverrun {
                cursor: self.cursor,
                requested: 4,
                buffer_size: self.buffer.len(),
            });
        }

        let value = u32::from_le_bytes([
            self.buffer[self.cursor],
            self.buffer[self.cursor + 1],
            self.buffer[self.cursor + 2],
            self.buffer[self.cursor + 3],
        ]);
        self.cursor += 4;
        Ok(value)
    }

    fn read_u16(&mut self) -> Result<u16> {
        if self.cursor + 2 > self.buffer.len() {
            return Err(VpkError::CursorOverrun {
                cursor: self.cursor,
                requested: 2,
                buffer_size: self.buffer.len(),
            });
        }

        let value = u16::from_le_bytes([self.buffer[self.cursor], self.buffer[self.cursor + 1]]);
        self.cursor += 2;
        Ok(value)
    }

    fn read_null_terminated_string(&mut self) -> Result<String> {
        let start = self.cursor;

        while self.cursor < self.buffer.len() && self.buffer[self.cursor] != 0 {
            self.cursor += 1;
        }

        if self.cursor >= self.buffer.len() {
            return Err(VpkError::InvalidString);
        }

        let string_bytes = &self.buffer[start..self.cursor];
        self.cursor += 1; // Skip null terminator

        match String::from_utf8(string_bytes.to_vec()) {
            Ok(s) => Ok(s),
            Err(_) => Ok(string_bytes.iter().map(|&b| b as char).collect()),
        }
    }
}
