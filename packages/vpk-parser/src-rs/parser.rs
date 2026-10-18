use crate::{
    error::{Result, VpkError},
    types::*,
};
use chrono::{DateTime, Utc};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs::File;
use std::hash::Hasher;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use twox_hash::XxHash64;

const VPK_SIGNATURE: u32 = 0x55aa1234;
const HASH_CHUNK_SIZE: usize = 1024 * 1024;

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

    /// Reads only the VPK header + directory tree from a file on disk,
    /// returning just the entry list without generating any hashes or fingerprints.
    pub fn parse_directory_from_file(path: &Path) -> Result<Vec<VpkEntry>> {
        Ok(Self::parse_directory_with_preload_from_file(path)?
            .into_iter()
            .map(|(entry, _)| entry)
            .collect())
    }

    /// Reads directory metadata and the inline prefix of each entry without loading archive payloads.
    pub fn parse_directory_with_preload_from_file(path: &Path) -> Result<Vec<(VpkEntry, Vec<u8>)>> {
        let mut file = File::open(path)?;
        let mut parser = Self::new(Self::read_directory_bytes(&mut file)?);
        let header = parser.parse_header()?;
        let tree_start = parser.cursor;
        parser.parse_directory_tree_with_preload(tree_start, header.tree_length as usize)
    }

    /// Parses a VPK on disk, hashing its contents in chunks so memory use
    /// stays at the size of the directory tree instead of the whole file.
    pub fn parse_file(path: &Path, options: VpkParseOptions) -> Result<VpkParsed> {
        let mut file = File::open(path)?;
        let mut parser = Self::new(Self::read_directory_bytes(&mut file)?);
        let header = parser.parse_header()?;
        let tree_start = parser.cursor;
        let entries = parser.parse_directory_tree(tree_start, header.tree_length as usize)?;

        file.seek(SeekFrom::Start(0))?;
        let hashes = ContentHashes::of_reader(&mut file)?;
        parser.build_parsed(header, entries, hashes, options)
    }

    /// Reads the header and directory tree, the only part of a VPK the parser walks.
    fn read_directory_bytes(file: &mut File) -> Result<Vec<u8>> {
        let mut header_buf = [0u8; 28];
        file.read_exact(&mut header_buf[..12])?;

        let signature =
            u32::from_le_bytes([header_buf[0], header_buf[1], header_buf[2], header_buf[3]]);
        if signature != VPK_SIGNATURE {
            return Err(VpkError::InvalidSignature {
                expected: VPK_SIGNATURE,
                actual: signature,
            });
        }

        let version =
            u32::from_le_bytes([header_buf[4], header_buf[5], header_buf[6], header_buf[7]]);
        if version != 1 && version != 2 {
            return Err(VpkError::Validation {
                message: format!("Unsupported VPK version {version}"),
            });
        }
        let tree_length =
            u32::from_le_bytes([header_buf[8], header_buf[9], header_buf[10], header_buf[11]]);

        let header_size: usize = if version >= 2 {
            file.seek(SeekFrom::Start(0))?;
            file.read_exact(&mut header_buf)?;
            28
        } else {
            12
        };

        let bytes_to_read = tree_length as usize;
        let total = header_size
            .checked_add(bytes_to_read)
            .ok_or_else(|| VpkError::Validation {
                message: "VPK directory extent overflow".into(),
            })?;
        if total as u64 > file.metadata()?.len() {
            return Err(VpkError::Validation {
                message: "VPK directory exceeds the file length".into(),
            });
        }
        let mut tree_buf = vec![0u8; total];
        file.seek(SeekFrom::Start(0))?;
        file.read_exact(&mut tree_buf)?;
        Ok(tree_buf)
    }

    fn parse_internal(&mut self, options: VpkParseOptions) -> Result<VpkParsed> {
        let header = self.parse_header()?;
        let tree_start = self.cursor;
        let entries = self.parse_directory_tree(tree_start, header.tree_length as usize)?;
        let hashes = ContentHashes::of_bytes(&self.buffer);
        self.build_parsed(header, entries, hashes, options)
    }

    fn build_parsed(
        &self,
        header: VpkHeader,
        entries: Vec<VpkEntry>,
        hashes: ContentHashes,
        options: VpkParseOptions,
    ) -> Result<VpkParsed> {
        let manifest_sha256 = self.generate_manifest_hash(&entries);
        let dir_sha256 = options
            .include_full_file_hash
            .then(|| hashes.sha256.clone());

        let fingerprint = self.generate_fingerprint(
            &entries,
            &header,
            hashes,
            &options.file_path,
            options.last_modified,
            options.include_merkle,
        );

        // Only include entries if requested
        let final_entries = if options.include_entries {
            entries
        } else {
            Vec::new()
        };

        Ok(VpkParsed {
            version: header.version,
            tree_length: header.tree_length,
            file_data_section_size: header.file_data_section_size,
            archive_md5_section_size: header.archive_md5_section_size,
            other_md5_section_size: header.other_md5_section_size,
            signature_section_size: header.signature_section_size,
            entries: final_entries,
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
        if version != 1 && version != 2 {
            return Err(VpkError::Validation {
                message: format!("Unsupported VPK version {version}"),
            });
        }
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
        Ok(self
            .parse_directory_tree_with_preload(tree_start, tree_length)?
            .into_iter()
            .map(|(entry, _)| entry)
            .collect())
    }

    fn parse_directory_tree_with_preload(
        &mut self,
        tree_start: usize,
        tree_length: usize,
    ) -> Result<Vec<(VpkEntry, Vec<u8>)>> {
        let mut entries = Vec::new();
        let tree_end = tree_start
            .checked_add(tree_length)
            .filter(|end| *end <= self.buffer.len())
            .ok_or_else(|| VpkError::Validation {
                message: "VPK directory exceeds its buffer".into(),
            })?;
        let mut closed = false;

        while self.cursor < tree_end {
            let ext = self.read_tree_string(tree_end)?;
            if ext.is_empty() {
                closed = true;
                break;
            }

            while self.cursor < tree_end {
                let path = self.read_tree_string(tree_end)?;
                if path.is_empty() {
                    break;
                }

                while self.cursor < tree_end {
                    let filename = self.read_tree_string(tree_end)?;
                    if filename.is_empty() {
                        break;
                    }

                    if tree_end.saturating_sub(self.cursor) < 18 {
                        return Err(VpkError::CursorOverrun {
                            cursor: self.cursor,
                            requested: 18,
                            buffer_size: tree_end,
                        });
                    }
                    let entry = self.parse_entry(&ext, &path, &filename)?;
                    let end = self.cursor + usize::from(entry.preload_bytes);
                    let preload = self
                        .buffer
                        .get(self.cursor..end)
                        .filter(|_| end <= tree_end)
                        .ok_or(VpkError::CursorOverrun {
                            cursor: self.cursor,
                            requested: usize::from(entry.preload_bytes),
                            buffer_size: tree_end,
                        })?
                        .to_vec();
                    self.cursor = end;
                    entries.push((entry, preload));
                }
            }
        }

        if !closed {
            return Err(VpkError::Validation {
                message: "VPK directory is missing its final terminator".into(),
            });
        }
        Ok(entries)
    }

    fn read_tree_string(&mut self, tree_end: usize) -> Result<String> {
        if !self.buffer[self.cursor..tree_end].contains(&0) {
            return Err(VpkError::InvalidString);
        }
        self.read_null_terminated_string()
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
        header: &VpkHeader,
        hashes: ContentHashes,
        file_path: &str,
        last_modified: Option<DateTime<Utc>>,
        include_merkle: bool,
    ) -> VpkFingerprint {
        let has_multiparts = self.detect_multiparts(entries);
        let has_inline_data = self.detect_inline_data(entries);
        let content_signature = self.generate_content_signature(entries);

        let (merkle_root, merkle_leaves) = if include_merkle {
            let merkle_data = self.generate_merkle_hash(entries);
            (Some(merkle_data.root), Some(merkle_data.leaves))
        } else {
            (None, None)
        };

        VpkFingerprint {
            file_path: file_path.to_string(),
            file_size: hashes.size,
            last_modified: last_modified.map(|dt| dt.to_rfc3339()),
            fast_hash: hashes.fast_hash,
            sha256: hashes.sha256,
            content_signature,
            vpk_version: header.version,
            file_count: entries.len(),
            has_multiparts,
            has_inline_data,
            merkle_root,
            merkle_leaves,
        }
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
                    "{normalized_path}\x00{}\x00{}",
                    entry.entry_length, entry.crc32_hex
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

/// Whole-file hashes, computed in one pass over either a buffer or a reader.
struct ContentHashes {
    size: usize,
    fast_hash: String,
    sha256: String,
}

impl ContentHashes {
    fn of_bytes(bytes: &[u8]) -> Self {
        let mut hasher = ContentHasher::new();
        hasher.update(bytes);
        hasher.finish()
    }

    fn of_reader(reader: &mut impl Read) -> Result<Self> {
        let mut hasher = ContentHasher::new();
        let mut chunk = vec![0u8; HASH_CHUNK_SIZE];
        loop {
            let read = reader.read(&mut chunk)?;
            if read == 0 {
                return Ok(hasher.finish());
            }
            hasher.update(&chunk[..read]);
        }
    }
}

struct ContentHasher {
    size: usize,
    xxhash: XxHash64,
    sha256: Sha256,
}

impl ContentHasher {
    fn new() -> Self {
        Self {
            size: 0,
            xxhash: XxHash64::with_seed(0),
            sha256: Sha256::new(),
        }
    }

    fn update(&mut self, bytes: &[u8]) {
        self.size += bytes.len();
        self.xxhash.write(bytes);
        self.sha256.update(bytes);
    }

    fn finish(self) -> ContentHashes {
        ContentHashes {
            size: self.size,
            fast_hash: format!("{:016x}", self.xxhash.finish()),
            sha256: format!("{:x}", self.sha256.finalize()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/data/pak95_dir.vpk");

    fn options() -> VpkParseOptions {
        VpkParseOptions {
            include_full_file_hash: true,
            include_merkle: true,
            include_entries: true,
            ..VpkParseOptions::default()
        }
    }

    #[test]
    fn parse_file_matches_buffer_parse() {
        let from_buffer = VpkParser::parse(std::fs::read(FIXTURE).unwrap(), options()).unwrap();
        let from_file = VpkParser::parse_file(Path::new(FIXTURE), options()).unwrap();

        assert_eq!(
            serde_json::to_value(&from_file).unwrap(),
            serde_json::to_value(&from_buffer).unwrap()
        );
        assert_eq!(
            from_file.dir_sha256.as_deref(),
            Some(from_file.fingerprint.sha256.as_str())
        );
    }

    #[test]
    fn chunked_hashes_match_single_pass() {
        let bytes: Vec<u8> = (0..HASH_CHUNK_SIZE * 2 + 17)
            .map(|i| (i % 251) as u8)
            .collect();
        let streamed = ContentHashes::of_reader(&mut bytes.as_slice()).unwrap();
        let whole = ContentHashes::of_bytes(&bytes);

        assert_eq!(streamed.size, bytes.len());
        assert_eq!(streamed.fast_hash, whole.fast_hash);
        assert_eq!(streamed.sha256, whole.sha256);
    }
}
