use crate::checksum::{crc32, sha256};
use crate::compressor::decompress;
use crate::error::{DmodpkgError, Result};
use crate::format::{MetadataSection, PackageHeader, HEADER_SIZE};
use crate::types::{ChunkMetadata, FileEntry};
use std::collections::HashSet;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

/// Options for package reading
#[derive(Debug, Clone)]
pub struct ReaderOptions {
    /// Verify checksums during extraction
    pub verify_checksums: bool,
    /// Filter extraction by layer names (empty = extract all)
    pub layer_filter: Vec<String>,
}

impl Default for ReaderOptions {
    fn default() -> Self {
        Self {
            verify_checksums: true,
            layer_filter: Vec::new(),
        }
    }
}

/// Package information (header + metadata only)
#[derive(Debug, Clone)]
pub struct PackageInfo {
    pub header: PackageHeader,
    pub metadata: MetadataSection,
    pub file_entries: Vec<FileEntry>,
}

/// Package reader for reading .dmodpkg files
pub struct PackageReader {
    file: File,
    header: PackageHeader,
    metadata: Option<MetadataSection>,
    file_index: Option<Vec<FileEntry>>,
    chunk_table: Option<Vec<ChunkMetadata>>,
}

impl PackageReader {
    /// Open a package file
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let mut file = File::open(path.as_ref())
            .map_err(DmodpkgError::Io)?;

        // Read and parse header
        let mut header_bytes = [0u8; HEADER_SIZE];
        file.read_exact(&mut header_bytes)?;

        let header = PackageHeader::from_bytes(&header_bytes)
            .ok_or_else(|| DmodpkgError::format("Failed to parse package header"))?;

        // Validate magic bytes
        if !header.is_valid() {
            return Err(DmodpkgError::format("Invalid package magic bytes"));
        }

        Ok(Self {
            file,
            header,
            metadata: None,
            file_index: None,
            chunk_table: None,
        })
    }

    /// Get package header
    pub fn header(&self) -> &PackageHeader {
        &self.header
    }

    /// Read and parse metadata section
    pub fn read_metadata(&mut self) -> Result<&MetadataSection> {
        if self.metadata.is_some() {
            return Ok(self.metadata.as_ref().unwrap());
        }

        // Seek to metadata section
        self.file.seek(SeekFrom::Start(self.header.metadata_offset as u64))?;

        // Read compressed metadata
        let mut compressed_data = vec![0u8; self.header.metadata_compressed_size as usize];
        self.file.read_exact(&mut compressed_data)?;

        // Decompress
        let decompressed = decompress(&compressed_data)?;

        // Verify uncompressed size
        if decompressed.len() != self.header.metadata_uncompressed_size as usize {
            return Err(DmodpkgError::format("Metadata size mismatch"));
        }

        // Parse JSON
        let metadata: MetadataSection = serde_json::from_slice(&decompressed)
            .map_err(DmodpkgError::Json)?;

        self.metadata = Some(metadata);
        Ok(self.metadata.as_ref().unwrap())
    }

    /// Read and parse file index
    pub fn read_file_index(&mut self) -> Result<&Vec<FileEntry>> {
        if self.file_index.is_some() {
            return Ok(self.file_index.as_ref().unwrap());
        }

        // Seek to file index section
        self.file.seek(SeekFrom::Start(self.header.file_index_offset as u64))?;

        // Read compressed file index
        let mut compressed_data = vec![0u8; self.header.file_index_compressed_size as usize];
        self.file.read_exact(&mut compressed_data)?;

        // Decompress
        let decompressed = decompress(&compressed_data)?;

        // Verify uncompressed size
        if decompressed.len() != self.header.file_index_uncompressed_size as usize {
            return Err(DmodpkgError::format("File index size mismatch"));
        }

        // Parse binary file index
        let file_entries = parse_file_index(&decompressed)?;

        self.file_index = Some(file_entries);
        Ok(self.file_index.as_ref().unwrap())
    }

    /// Read and parse chunk table
    pub fn read_chunk_table(&mut self) -> Result<&Vec<ChunkMetadata>> {
        if self.chunk_table.is_some() {
            return Ok(self.chunk_table.as_ref().unwrap());
        }

        // Seek to chunk table
        self.file.seek(SeekFrom::Start(self.header.chunk_table_offset as u64))?;

        // Read chunk table
        let mut chunk_table_data = vec![0u8; self.header.chunk_table_size as usize];
        self.file.read_exact(&mut chunk_table_data)?;

        // Parse chunk table
        let chunks = parse_chunk_table(&chunk_table_data)?;

        self.chunk_table = Some(chunks);
        Ok(self.chunk_table.as_ref().unwrap())
    }

    /// Get package information (header + metadata + file list)
    pub fn get_info(&mut self) -> Result<PackageInfo> {
        let metadata = self.read_metadata()?.clone();
        let file_entries = self.read_file_index()?.clone();

        Ok(PackageInfo {
            header: self.header.clone(),
            metadata,
            file_entries,
        })
    }

    /// Extract a specific file
    pub fn extract_file(
        &mut self,
        file_entry: &FileEntry,
        verify: bool,
    ) -> Result<Vec<u8>> {
        // Ensure chunk table is loaded
        if self.chunk_table.is_none() {
            self.read_chunk_table()?;
        }
        let chunk_table = self.chunk_table.as_ref().unwrap();

        let mut file_data = Vec::with_capacity(file_entry.uncompressed_size as usize);

        // Read and decompress each chunk
        for &chunk_idx in &file_entry.chunk_indices {
            let chunk = &chunk_table[chunk_idx as usize];

            // Seek to chunk data
            let chunk_offset = self.header.data_section_offset as u64 + chunk.offset;
            self.file.seek(SeekFrom::Start(chunk_offset))?;

            // Read compressed chunk
            let mut compressed_chunk = vec![0u8; chunk.compressed_size as usize];
            self.file.read_exact(&mut compressed_chunk)?;

            // Verify chunk CRC32 if requested
            if verify {
                let computed_crc = crc32(&compressed_chunk);
                if computed_crc != chunk.crc32 {
                    return Err(DmodpkgError::checksum_mismatch(format!(
                        "Chunk CRC32 mismatch for file '{}' chunk {}",
                        file_entry.path, chunk_idx
                    )));
                }
            }

            // Decompress chunk
            let decompressed = decompress(&compressed_chunk)?;

            // Verify uncompressed size
            if decompressed.len() != chunk.uncompressed_size as usize {
                return Err(DmodpkgError::format(format!(
                    "Chunk size mismatch for file '{}' chunk {}",
                    file_entry.path, chunk_idx
                )));
            }

            file_data.extend_from_slice(&decompressed);
        }

        // Verify file SHA256 if requested
        if verify {
            let computed_hash = sha256(&file_data);
            if computed_hash != file_entry.sha256 {
                return Err(DmodpkgError::checksum_mismatch(format!(
                    "File SHA256 mismatch for '{}'",
                    file_entry.path
                )));
            }
        }

        Ok(file_data)
    }

    /// Extract files with options
    pub fn extract_files(&mut self, options: &ReaderOptions) -> Result<Vec<(FileEntry, Vec<u8>)>> {
        // Load file index if not already loaded
        if self.file_index.is_none() {
            self.read_file_index()?;
        }

        let file_entries = self.file_index.as_ref().unwrap().clone();
        let mut results = Vec::new();

        // Filter by layers if specified
        let layer_filter: HashSet<String> = options.layer_filter.iter().cloned().collect();
        let should_filter = !layer_filter.is_empty();

        for entry in &file_entries {
            // Always include metadata layer files regardless of filter
            let is_metadata = entry.layer == "_metadata";
            
            // Skip if layer filter is active and this layer is not in the filter (unless it's metadata)
            if !is_metadata && should_filter && !layer_filter.contains(&entry.layer) {
                continue;
            }

            let data = self.extract_file(entry, options.verify_checksums)?;
            results.push((entry.clone(), data));
        }

        Ok(results)
    }

    /// List all files in the package
    pub fn list_files(&mut self) -> Result<Vec<FileEntry>> {
        Ok(self.read_file_index()?.clone())
    }

    /// List files by layer
    pub fn list_files_by_layer(&mut self, layer: &str) -> Result<Vec<FileEntry>> {
        let all_files = self.read_file_index()?;
        Ok(all_files
            .iter()
            .filter(|f| f.layer == layer)
            .cloned()
            .collect())
    }
}

/// Parse binary file index
fn parse_file_index(data: &[u8]) -> Result<Vec<FileEntry>> {
    let mut cursor = 0;

    // Read file count
    if data.len() < 4 {
        return Err(DmodpkgError::format("File index too short"));
    }
    let file_count = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
    cursor += 4;

    let mut entries = Vec::with_capacity(file_count as usize);

    for _ in 0..file_count {
        // Path length
        if cursor + 2 > data.len() {
            return Err(DmodpkgError::format("Unexpected end of file index"));
        }
        let path_len = u16::from_le_bytes([data[cursor], data[cursor + 1]]) as usize;
        cursor += 2;

        // Path
        if cursor + path_len > data.len() {
            return Err(DmodpkgError::format("Invalid path length in file index"));
        }
        let path = String::from_utf8(data[cursor..cursor + path_len].to_vec())
            .map_err(|_| DmodpkgError::format("Invalid UTF-8 in file path"))?;
        cursor += path_len;

        // Layer name length
        if cursor + 1 > data.len() {
            return Err(DmodpkgError::format("Unexpected end of file index"));
        }
        let layer_len = data[cursor] as usize;
        cursor += 1;

        // Layer name
        if cursor + layer_len > data.len() {
            return Err(DmodpkgError::format("Invalid layer length in file index"));
        }
        let layer = String::from_utf8(data[cursor..cursor + layer_len].to_vec())
            .map_err(|_| DmodpkgError::format("Invalid UTF-8 in layer name"))?;
        cursor += layer_len;

        // Uncompressed size
        if cursor + 8 > data.len() {
            return Err(DmodpkgError::format("Unexpected end of file index"));
        }
        let uncompressed_size = u64::from_le_bytes([
            data[cursor],
            data[cursor + 1],
            data[cursor + 2],
            data[cursor + 3],
            data[cursor + 4],
            data[cursor + 5],
            data[cursor + 6],
            data[cursor + 7],
        ]);
        cursor += 8;

        // Chunk count
        if cursor + 2 > data.len() {
            return Err(DmodpkgError::format("Unexpected end of file index"));
        }
        let chunk_count = u16::from_le_bytes([data[cursor], data[cursor + 1]]) as usize;
        cursor += 2;

        // Chunk indices
        if cursor + chunk_count * 4 > data.len() {
            return Err(DmodpkgError::format("Invalid chunk indices in file index"));
        }
        let mut chunk_indices = Vec::with_capacity(chunk_count);
        for _ in 0..chunk_count {
            let idx = u32::from_le_bytes([
                data[cursor],
                data[cursor + 1],
                data[cursor + 2],
                data[cursor + 3],
            ]);
            chunk_indices.push(idx);
            cursor += 4;
        }

        // SHA256 checksum
        if cursor + 32 > data.len() {
            return Err(DmodpkgError::format("Invalid SHA256 in file index"));
        }
        let mut sha256 = [0u8; 32];
        sha256.copy_from_slice(&data[cursor..cursor + 32]);
        cursor += 32;

        entries.push(FileEntry {
            path,
            layer,
            uncompressed_size,
            chunk_indices,
            sha256,
        });
    }

    Ok(entries)
}

/// Parse binary chunk table
fn parse_chunk_table(data: &[u8]) -> Result<Vec<ChunkMetadata>> {
    let mut cursor = 0;

    // Read chunk count
    if data.len() < 4 {
        return Err(DmodpkgError::format("Chunk table too short"));
    }
    let chunk_count = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
    cursor += 4;

    let mut chunks = Vec::with_capacity(chunk_count as usize);

    for _ in 0..chunk_count {
        if cursor + 20 > data.len() {
            return Err(DmodpkgError::format("Unexpected end of chunk table"));
        }

        let offset = u64::from_le_bytes([
            data[cursor],
            data[cursor + 1],
            data[cursor + 2],
            data[cursor + 3],
            data[cursor + 4],
            data[cursor + 5],
            data[cursor + 6],
            data[cursor + 7],
        ]);
        cursor += 8;

        let compressed_size = u32::from_le_bytes([
            data[cursor],
            data[cursor + 1],
            data[cursor + 2],
            data[cursor + 3],
        ]);
        cursor += 4;

        let uncompressed_size = u32::from_le_bytes([
            data[cursor],
            data[cursor + 1],
            data[cursor + 2],
            data[cursor + 3],
        ]);
        cursor += 4;

        let crc32 = u32::from_le_bytes([
            data[cursor],
            data[cursor + 1],
            data[cursor + 2],
            data[cursor + 3],
        ]);
        cursor += 4;

        chunks.push(ChunkMetadata {
            offset,
            compressed_size,
            uncompressed_size,
            crc32,
        });
    }

    Ok(chunks)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_reader_options_default() {
        let options = ReaderOptions::default();
        assert!(options.verify_checksums);
        assert!(options.layer_filter.is_empty());
    }

    #[test]
    fn test_parse_empty_chunk_table() {
        let data = vec![0, 0, 0, 0]; // 0 chunks
        let chunks = parse_chunk_table(&data).unwrap();
        assert_eq!(chunks.len(), 0);
    }
}

