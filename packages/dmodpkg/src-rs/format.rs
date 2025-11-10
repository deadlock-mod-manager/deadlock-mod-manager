use serde::{Deserialize, Serialize};

/// Magic bytes for .dmodpkg files
pub const DMODPKG_MAGIC: &[u8; 8] = b"DMODPKG\0";

/// Magic bytes for .dmodbundle files
pub const DMODBUNDLE_MAGIC: &[u8; 8] = b"DMODBNDL";

/// Current format version
pub const FORMAT_VERSION: u16 = 1;

/// Header size in bytes
pub const HEADER_SIZE: usize = 64;

/// Default chunk size (1MB)
pub const DEFAULT_CHUNK_SIZE: usize = 1024 * 1024;

/// Minimum chunk size (256KB)
pub const MIN_CHUNK_SIZE: usize = 256 * 1024;

/// Maximum chunk size (16MB)
pub const MAX_CHUNK_SIZE: usize = 16 * 1024 * 1024;

/// Header offsets
pub mod offsets {
    pub const MAGIC: usize = 0x00;
    pub const VERSION: usize = 0x08;
    pub const FLAGS: usize = 0x0A;
    pub const METADATA_OFFSET: usize = 0x0C;
    pub const METADATA_COMPRESSED_SIZE: usize = 0x10;
    pub const METADATA_UNCOMPRESSED_SIZE: usize = 0x14;
    pub const FILE_INDEX_OFFSET: usize = 0x18;
    pub const FILE_INDEX_COMPRESSED_SIZE: usize = 0x1C;
    pub const FILE_INDEX_UNCOMPRESSED_SIZE: usize = 0x20;
    pub const CHUNK_TABLE_OFFSET: usize = 0x24;
    pub const CHUNK_TABLE_SIZE: usize = 0x28;
    pub const DATA_SECTION_OFFSET: usize = 0x2C;
    pub const TOTAL_UNCOMPRESSED_SIZE: usize = 0x30;
    pub const PACKAGE_CRC64: usize = 0x38;
}

/// Bundle header offsets
pub mod bundle_offsets {
    pub const MAGIC: usize = 0x00;
    pub const VERSION: usize = 0x08;
    pub const FLAGS: usize = 0x0A;
    pub const BUNDLE_METADATA_OFFSET: usize = 0x0C;
    pub const BUNDLE_METADATA_COMPRESSED_SIZE: usize = 0x10;
    pub const BUNDLE_METADATA_UNCOMPRESSED_SIZE: usize = 0x14;
    pub const PACKAGE_INDEX_OFFSET: usize = 0x18;
    pub const PACKAGE_INDEX_SIZE: usize = 0x1C;
    pub const RESOURCES_OFFSET: usize = 0x20;
    pub const RESOURCES_COMPRESSED_SIZE: usize = 0x24;
    pub const RESOURCES_UNCOMPRESSED_SIZE: usize = 0x28;
    pub const PACKAGES_SECTION_OFFSET: usize = 0x2C;
    pub const TOTAL_BUNDLE_SIZE: usize = 0x30;
    pub const BUNDLE_CRC64: usize = 0x38;
}

/// Package header structure
#[derive(Debug, Clone)]
pub struct PackageHeader {
    /// Magic bytes
    pub magic: [u8; 8],
    /// Format version
    pub version: u16,
    /// Flags (reserved)
    pub flags: u16,
    /// Metadata section offset
    pub metadata_offset: u32,
    /// Metadata section compressed size
    pub metadata_compressed_size: u32,
    /// Metadata section uncompressed size
    pub metadata_uncompressed_size: u32,
    /// File index section offset
    pub file_index_offset: u32,
    /// File index section compressed size
    pub file_index_compressed_size: u32,
    /// File index section uncompressed size
    pub file_index_uncompressed_size: u32,
    /// Chunk table offset
    pub chunk_table_offset: u32,
    /// Chunk table size
    pub chunk_table_size: u32,
    /// Data section offset
    pub data_section_offset: u32,
    /// Total uncompressed size
    pub total_uncompressed_size: u64,
    /// Package CRC64
    pub package_crc64: u64,
}

impl PackageHeader {
    /// Create a new header with default values
    pub fn new() -> Self {
        Self {
            magic: *DMODPKG_MAGIC,
            version: FORMAT_VERSION,
            flags: 0,
            metadata_offset: 0,
            metadata_compressed_size: 0,
            metadata_uncompressed_size: 0,
            file_index_offset: 0,
            file_index_compressed_size: 0,
            file_index_uncompressed_size: 0,
            chunk_table_offset: 0,
            chunk_table_size: 0,
            data_section_offset: 0,
            total_uncompressed_size: 0,
            package_crc64: 0,
        }
    }

    /// Serialize header to bytes
    pub fn to_bytes(&self) -> [u8; HEADER_SIZE] {
        let mut bytes = [0u8; HEADER_SIZE];

        bytes[0..8].copy_from_slice(&self.magic);
        bytes[8..10].copy_from_slice(&self.version.to_le_bytes());
        bytes[10..12].copy_from_slice(&self.flags.to_le_bytes());
        bytes[12..16].copy_from_slice(&self.metadata_offset.to_le_bytes());
        bytes[16..20].copy_from_slice(&self.metadata_compressed_size.to_le_bytes());
        bytes[20..24].copy_from_slice(&self.metadata_uncompressed_size.to_le_bytes());
        bytes[24..28].copy_from_slice(&self.file_index_offset.to_le_bytes());
        bytes[28..32].copy_from_slice(&self.file_index_compressed_size.to_le_bytes());
        bytes[32..36].copy_from_slice(&self.file_index_uncompressed_size.to_le_bytes());
        bytes[36..40].copy_from_slice(&self.chunk_table_offset.to_le_bytes());
        bytes[40..44].copy_from_slice(&self.chunk_table_size.to_le_bytes());
        bytes[44..48].copy_from_slice(&self.data_section_offset.to_le_bytes());
        bytes[48..56].copy_from_slice(&self.total_uncompressed_size.to_le_bytes());
        bytes[56..64].copy_from_slice(&self.package_crc64.to_le_bytes());

        bytes
    }

    /// Parse header from bytes
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < HEADER_SIZE {
            return None;
        }

        let mut magic = [0u8; 8];
        magic.copy_from_slice(&bytes[0..8]);

        Some(Self {
            magic,
            version: u16::from_le_bytes(bytes[8..10].try_into().ok()?),
            flags: u16::from_le_bytes(bytes[10..12].try_into().ok()?),
            metadata_offset: u32::from_le_bytes(bytes[12..16].try_into().ok()?),
            metadata_compressed_size: u32::from_le_bytes(bytes[16..20].try_into().ok()?),
            metadata_uncompressed_size: u32::from_le_bytes(bytes[20..24].try_into().ok()?),
            file_index_offset: u32::from_le_bytes(bytes[24..28].try_into().ok()?),
            file_index_compressed_size: u32::from_le_bytes(bytes[28..32].try_into().ok()?),
            file_index_uncompressed_size: u32::from_le_bytes(bytes[32..36].try_into().ok()?),
            chunk_table_offset: u32::from_le_bytes(bytes[36..40].try_into().ok()?),
            chunk_table_size: u32::from_le_bytes(bytes[40..44].try_into().ok()?),
            data_section_offset: u32::from_le_bytes(bytes[44..48].try_into().ok()?),
            total_uncompressed_size: u64::from_le_bytes(bytes[48..56].try_into().ok()?),
            package_crc64: u64::from_le_bytes(bytes[56..64].try_into().ok()?),
        })
    }

    /// Validate header magic bytes
    pub fn is_valid(&self) -> bool {
        self.magic == *DMODPKG_MAGIC
    }
}

impl Default for PackageHeader {
    fn default() -> Self {
        Self::new()
    }
}

/// Bundle header structure
#[derive(Debug, Clone)]
pub struct BundleHeader {
    /// Magic bytes
    pub magic: [u8; 8],
    /// Format version
    pub version: u16,
    /// Flags (reserved)
    pub flags: u16,
    /// Bundle metadata offset
    pub bundle_metadata_offset: u32,
    /// Bundle metadata compressed size
    pub bundle_metadata_compressed_size: u32,
    /// Bundle metadata uncompressed size
    pub bundle_metadata_uncompressed_size: u32,
    /// Package index offset
    pub package_index_offset: u32,
    /// Package index size
    pub package_index_size: u32,
    /// Resources offset
    pub resources_offset: u32,
    /// Resources compressed size
    pub resources_compressed_size: u32,
    /// Resources uncompressed size
    pub resources_uncompressed_size: u32,
    /// Packages section offset
    pub packages_section_offset: u32,
    /// Total bundle size
    pub total_bundle_size: u64,
    /// Bundle CRC64
    pub bundle_crc64: u64,
}

impl BundleHeader {
    /// Create a new bundle header with default values
    pub fn new() -> Self {
        Self {
            magic: *DMODBUNDLE_MAGIC,
            version: FORMAT_VERSION,
            flags: 0,
            bundle_metadata_offset: 0,
            bundle_metadata_compressed_size: 0,
            bundle_metadata_uncompressed_size: 0,
            package_index_offset: 0,
            package_index_size: 0,
            resources_offset: 0,
            resources_compressed_size: 0,
            resources_uncompressed_size: 0,
            packages_section_offset: 0,
            total_bundle_size: 0,
            bundle_crc64: 0,
        }
    }

    /// Validate header magic bytes
    pub fn is_valid(&self) -> bool {
        self.magic == *DMODBUNDLE_MAGIC
    }
}

impl Default for BundleHeader {
    fn default() -> Self {
        Self::new()
    }
}

/// Metadata section (stored as compressed JSON)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetadataSection {
    /// Original mod configuration
    pub config: serde_json::Value,
    /// Build information
    pub build_info: crate::types::BuildInfo,
    /// Optional signature
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<crate::types::Signature>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_header_serialization() {
        let header = PackageHeader::new();
        let bytes = header.to_bytes();
        let parsed = PackageHeader::from_bytes(&bytes).unwrap();

        assert_eq!(header.magic, parsed.magic);
        assert_eq!(header.version, parsed.version);
        assert!(parsed.is_valid());
    }

    #[test]
    fn test_magic_bytes() {
        assert_eq!(DMODPKG_MAGIC, b"DMODPKG\0");
        assert_eq!(DMODBUNDLE_MAGIC, b"DMODBNDL");
    }
}
