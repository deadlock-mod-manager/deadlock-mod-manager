use crate::checksum::{crc32, sha256_reader, Crc64Hasher};
use crate::compressor::{compress, DEFAULT_COMPRESSION_LEVEL};
use crate::error::{DmodpkgError, Result};
use crate::format::{
    MetadataSection, PackageHeader, DMODPKG_MAGIC, DEFAULT_CHUNK_SIZE, FORMAT_VERSION,
    MAX_CHUNK_SIZE, MIN_CHUNK_SIZE,
};
use crate::types::{BuildInfo, ChunkMetadata, FileEntry};
use std::fs::File;
use std::io::{BufReader, Read, Seek, SeekFrom, Write};
use std::path::Path;

/// Options for package writing
#[derive(Debug, Clone)]
pub struct WriterOptions {
    /// Compression level (1-22)
    pub compression_level: i32,
    /// Chunk size in bytes
    pub chunk_size: usize,
    /// Whether to verify checksums after writing
    pub verify: bool,
}

impl Default for WriterOptions {
    fn default() -> Self {
        Self {
            compression_level: DEFAULT_COMPRESSION_LEVEL,
            chunk_size: DEFAULT_CHUNK_SIZE,
            verify: false,
        }
    }
}

/// File to be added to the package
#[derive(Debug, Clone)]
pub struct InputFile {
    /// Path within the package (e.g., "characters.vpk")
    pub path: String,
    /// Layer this file belongs to
    pub layer: String,
    /// Full filesystem path to the file
    pub source_path: std::path::PathBuf,
}

/// Package writer for creating .dmodpkg files
pub struct PackageWriter {
    output_path: std::path::PathBuf,
    options: WriterOptions,
    files: Vec<InputFile>,
    metadata: serde_json::Value,
    build_info: BuildInfo,
}

impl PackageWriter {
    /// Create a new package writer
    pub fn new(
        output_path: impl AsRef<Path>,
        metadata: serde_json::Value,
        build_info: BuildInfo,
        options: WriterOptions,
    ) -> Result<Self> {
        // Validate chunk size
        if options.chunk_size < MIN_CHUNK_SIZE || options.chunk_size > MAX_CHUNK_SIZE {
            return Err(DmodpkgError::validation(format!(
                "Chunk size must be between {} and {} bytes",
                MIN_CHUNK_SIZE, MAX_CHUNK_SIZE
            )));
        }

        Ok(Self {
            output_path: output_path.as_ref().to_path_buf(),
            options,
            files: Vec::new(),
            metadata,
            build_info,
        })
    }

    /// Add a file to the package
    pub fn add_file(&mut self, file: InputFile) -> Result<()> {
        // Verify file exists
        if !file.source_path.exists() {
            return Err(DmodpkgError::validation(format!(
                "Source file not found: {}",
                file.source_path.display()
            )));
        }

        self.files.push(file);
        Ok(())
    }

    /// Add multiple files to the package
    pub fn add_files(&mut self, files: Vec<InputFile>) -> Result<()> {
        for file in files {
            self.add_file(file)?;
        }
        Ok(())
    }

    /// Write the package to disk
    pub fn write(self) -> Result<PackageStats> {
        let mut output = File::create(&self.output_path)
            .map_err(|e| DmodpkgError::Io(e))?;

        // Write placeholder header (we'll update it later)
        let header = PackageHeader::new();
        output.write_all(&header.to_bytes())?;

        let mut stats = PackageStats::default();
        let mut package_hasher = Crc64Hasher::new();

        // Track header for CRC64 calculation
        let header_bytes = header.to_bytes();
        package_hasher.update(&header_bytes);

        // Prepare metadata section
        let metadata_section = MetadataSection {
            config: self.metadata.clone(),
            build_info: self.build_info.clone(),
            signature: None,
        };

        let metadata_json = serde_json::to_vec(&metadata_section)
            .map_err(|e| DmodpkgError::Json(e))?;
        let metadata_compressed = compress(&metadata_json, self.options.compression_level)?;

        let metadata_offset = output.stream_position()? as u32;
        output.write_all(&metadata_compressed)?;
        package_hasher.update(&metadata_compressed);

        stats.metadata_uncompressed_size = metadata_json.len();
        stats.metadata_compressed_size = metadata_compressed.len();

        // Process files and create chunks
        let (file_entries, chunk_table, chunk_data, total_uncompressed) =
            self.process_files(&mut stats)?;

        // Write file index
        let file_index_bytes = serialize_file_index(&file_entries)?;
        let file_index_compressed = compress(&file_index_bytes, self.options.compression_level)?;

        let file_index_offset = output.stream_position()? as u32;
        output.write_all(&file_index_compressed)?;
        package_hasher.update(&file_index_compressed);

        stats.file_index_uncompressed_size = file_index_bytes.len();
        stats.file_index_compressed_size = file_index_compressed.len();

        // Write chunk table
        let chunk_table_bytes = serialize_chunk_table(&chunk_table)?;
        let chunk_table_offset = output.stream_position()? as u32;
        output.write_all(&chunk_table_bytes)?;
        package_hasher.update(&chunk_table_bytes);

        stats.chunk_table_size = chunk_table_bytes.len();

        // Write data chunks
        let data_section_offset = output.stream_position()? as u32;
        output.write_all(&chunk_data)?;
        package_hasher.update(&chunk_data);

        stats.data_section_size = chunk_data.len();

        // Calculate final package CRC64
        let package_crc64 = package_hasher.finalize();

        // Update header with actual offsets and sizes
        let final_header = PackageHeader {
            magic: *DMODPKG_MAGIC,
            version: FORMAT_VERSION,
            flags: 0,
            metadata_offset,
            metadata_compressed_size: metadata_compressed.len() as u32,
            metadata_uncompressed_size: metadata_json.len() as u32,
            file_index_offset,
            file_index_compressed_size: file_index_compressed.len() as u32,
            file_index_uncompressed_size: file_index_bytes.len() as u32,
            chunk_table_offset,
            chunk_table_size: chunk_table_bytes.len() as u32,
            data_section_offset,
            total_uncompressed_size: total_uncompressed,
            package_crc64,
        };

        // Seek back to start and write actual header
        output.seek(SeekFrom::Start(0))?;
        output.write_all(&final_header.to_bytes())?;

        stats.total_size = output.stream_position()? as usize;
        stats.file_count = file_entries.len();
        stats.chunk_count = chunk_table.len();

        Ok(stats)
    }

    /// Process all files into chunks
    fn process_files(
        &self,
        stats: &mut PackageStats,
    ) -> Result<(Vec<FileEntry>, Vec<ChunkMetadata>, Vec<u8>, u64)> {
        let mut file_entries = Vec::new();
        let mut all_chunks = Vec::new();
        let mut chunk_data = Vec::new();
        let mut total_uncompressed: u64 = 0;
        let mut current_chunk_offset: u64 = 0;

        for input_file in &self.files {
            let file = File::open(&input_file.source_path)?;
            let file_size = file.metadata()?.len();
            total_uncompressed += file_size;

            // Calculate file hash
            let file_hash = sha256_reader(BufReader::new(File::open(&input_file.source_path)?))?;

            // Split file into chunks
            let mut reader = BufReader::new(File::open(&input_file.source_path)?);
            let mut chunk_indices = Vec::new();
            let mut buffer = vec![0u8; self.options.chunk_size];

            loop {
                let bytes_read = reader.read(&mut buffer)?;
                if bytes_read == 0 {
                    break;
                }

                let chunk_data_slice = &buffer[..bytes_read];
                let compressed_chunk = compress(chunk_data_slice, self.options.compression_level)?;

                let chunk_metadata = ChunkMetadata {
                    offset: current_chunk_offset,
                    compressed_size: compressed_chunk.len() as u32,
                    uncompressed_size: bytes_read as u32,
                    crc32: crc32(&compressed_chunk),
                };

                chunk_indices.push(all_chunks.len() as u32);
                all_chunks.push(chunk_metadata);
                chunk_data.extend_from_slice(&compressed_chunk);
                current_chunk_offset += compressed_chunk.len() as u64;

                stats.total_uncompressed_size += bytes_read;
                stats.total_compressed_size += compressed_chunk.len();
            }

            let file_entry = FileEntry {
                path: input_file.path.clone(),
                layer: input_file.layer.clone(),
                uncompressed_size: file_size,
                chunk_indices,
                sha256: file_hash,
            };

            file_entries.push(file_entry);
        }

        Ok((file_entries, all_chunks, chunk_data, total_uncompressed))
    }
}

/// Serialize file index to binary format
fn serialize_file_index(entries: &[FileEntry]) -> Result<Vec<u8>> {
    let mut buffer = Vec::new();

    // Write file count
    buffer.extend_from_slice(&(entries.len() as u32).to_le_bytes());

    for entry in entries {
        // Path length and path
        let path_bytes = entry.path.as_bytes();
        buffer.extend_from_slice(&(path_bytes.len() as u16).to_le_bytes());
        buffer.extend_from_slice(path_bytes);

        // Layer name length and name
        let layer_bytes = entry.layer.as_bytes();
        buffer.push(layer_bytes.len() as u8);
        buffer.extend_from_slice(layer_bytes);

        // Uncompressed size
        buffer.extend_from_slice(&entry.uncompressed_size.to_le_bytes());

        // Chunk count and indices
        buffer.extend_from_slice(&(entry.chunk_indices.len() as u16).to_le_bytes());
        for &chunk_idx in &entry.chunk_indices {
            buffer.extend_from_slice(&chunk_idx.to_le_bytes());
        }

        // SHA256 checksum
        buffer.extend_from_slice(&entry.sha256);
    }

    Ok(buffer)
}

/// Serialize chunk table to binary format
fn serialize_chunk_table(chunks: &[ChunkMetadata]) -> Result<Vec<u8>> {
    let mut buffer = Vec::new();

    // Write chunk count
    buffer.extend_from_slice(&(chunks.len() as u32).to_le_bytes());

    for chunk in chunks {
        buffer.extend_from_slice(&chunk.offset.to_le_bytes());
        buffer.extend_from_slice(&chunk.compressed_size.to_le_bytes());
        buffer.extend_from_slice(&chunk.uncompressed_size.to_le_bytes());
        buffer.extend_from_slice(&chunk.crc32.to_le_bytes());
    }

    Ok(buffer)
}

/// Statistics about the created package
#[derive(Debug, Default)]
pub struct PackageStats {
    pub total_size: usize,
    pub file_count: usize,
    pub chunk_count: usize,
    pub metadata_uncompressed_size: usize,
    pub metadata_compressed_size: usize,
    pub file_index_uncompressed_size: usize,
    pub file_index_compressed_size: usize,
    pub chunk_table_size: usize,
    pub data_section_size: usize,
    pub total_uncompressed_size: usize,
    pub total_compressed_size: usize,
}

impl PackageStats {
    /// Calculate overall compression ratio
    pub fn compression_ratio(&self) -> f64 {
        if self.total_uncompressed_size == 0 {
            return 0.0;
        }
        self.total_compressed_size as f64 / self.total_uncompressed_size as f64
    }

    /// Calculate compression savings percentage
    pub fn savings_percent(&self) -> f64 {
        (1.0 - self.compression_ratio()) * 100.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    fn create_temp_file(dir: &TempDir, name: &str, content: &[u8]) -> std::path::PathBuf {
        let path = dir.path().join(name);
        let mut file = File::create(&path).unwrap();
        file.write_all(content).unwrap();
        path
    }

    #[test]
    fn test_writer_options_default() {
        let options = WriterOptions::default();
        assert_eq!(options.compression_level, DEFAULT_COMPRESSION_LEVEL);
        assert_eq!(options.chunk_size, DEFAULT_CHUNK_SIZE);
        assert!(!options.verify);
    }

    #[test]
    fn test_serialize_file_index() {
        let entries = vec![FileEntry {
            path: "test.vpk".to_string(),
            layer: "base".to_string(),
            uncompressed_size: 1024,
            chunk_indices: vec![0, 1],
            sha256: [0u8; 32],
        }];

        let serialized = serialize_file_index(&entries).unwrap();
        assert!(!serialized.is_empty());
    }

    #[test]
    fn test_serialize_chunk_table() {
        let chunks = vec![
            ChunkMetadata {
                offset: 0,
                compressed_size: 100,
                uncompressed_size: 200,
                crc32: 12345,
            },
            ChunkMetadata {
                offset: 100,
                compressed_size: 150,
                uncompressed_size: 250,
                crc32: 67890,
            },
        ];

        let serialized = serialize_chunk_table(&chunks).unwrap();
        assert!(!serialized.is_empty());
    }
}

