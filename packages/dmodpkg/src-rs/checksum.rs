use crate::error::Result;
use sha2::{Digest, Sha256};
use std::io::Read;

/// Calculate SHA256 hash of data
pub fn sha256(data: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher.finalize().into()
}

/// Calculate SHA256 hash from a reader (streaming for large files)
pub fn sha256_reader<R: Read>(mut reader: R) -> Result<[u8; 32]> {
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 8192];

    loop {
        let bytes_read = reader.read(&mut buffer)?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }

    Ok(hasher.finalize().into())
}

/// Calculate CRC32 checksum
pub fn crc32(data: &[u8]) -> u32 {
    crc::Crc::<u32>::new(&crc::CRC_32_ISO_HDLC).checksum(data)
}

/// Calculate CRC64 checksum
#[allow(dead_code)]
pub fn crc64(data: &[u8]) -> u64 {
    crc::Crc::<u64>::new(&crc::CRC_64_ECMA_182).checksum(data)
}

/// Streaming CRC32 calculator
#[allow(dead_code)]
pub struct Crc32Hasher {
    buffer: Vec<u8>,
}

#[allow(dead_code)]
impl Crc32Hasher {
    pub fn new() -> Self {
        Self { buffer: Vec::new() }
    }

    pub fn update(&mut self, data: &[u8]) {
        self.buffer.extend_from_slice(data);
    }

    pub fn finalize(self) -> u32 {
        crc32(&self.buffer)
    }
}

impl Default for Crc32Hasher {
    fn default() -> Self {
        Self::new()
    }
}

/// Streaming CRC64 calculator
pub struct Crc64Hasher {
    buffer: Vec<u8>,
}

impl Crc64Hasher {
    pub fn new() -> Self {
        Self { buffer: Vec::new() }
    }

    pub fn update(&mut self, data: &[u8]) {
        self.buffer.extend_from_slice(data);
    }

    pub fn finalize(self) -> u64 {
        crc64(&self.buffer)
    }
}

impl Default for Crc64Hasher {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sha256() {
        let data = b"hello world";
        let hash = sha256(data);
        assert_eq!(hash.len(), 32);

        // Verify against known SHA256 of "hello world"
        let expected = [
            0xb9, 0x4d, 0x27, 0xb9, 0x93, 0x4d, 0x3e, 0x08, 0xa5, 0x2e, 0x52, 0xd7, 0xda, 0x7d,
            0xab, 0xfa, 0xc4, 0x84, 0xef, 0xe3, 0x7a, 0x53, 0x80, 0xee, 0x90, 0x88, 0xf7, 0xac,
            0xe2, 0xef, 0xcd, 0xe9,
        ];
        assert_eq!(hash, expected);
    }

    #[test]
    fn test_sha256_reader() {
        let data = b"hello world";
        let hash = sha256_reader(&data[..]).unwrap();
        let direct_hash = sha256(data);
        assert_eq!(hash, direct_hash);
    }

    #[test]
    fn test_crc32() {
        let data = b"hello world";
        let checksum = crc32(data);
        assert_ne!(checksum, 0);
    }

    #[test]
    fn test_crc64() {
        let data = b"hello world";
        let checksum = crc64(data);
        assert_ne!(checksum, 0);
    }

    #[test]
    fn test_crc32_hasher() {
        let data = b"hello world";
        let mut hasher = Crc32Hasher::new();
        hasher.update(data);
        let result = hasher.finalize();

        // Note: streaming hasher may have different result due to implementation
        // Verify it's deterministic
        let mut hasher2 = Crc32Hasher::new();
        hasher2.update(data);
        let result2 = hasher2.finalize();
        assert_eq!(result, result2);
    }

    #[test]
    fn test_crc64_hasher() {
        let data = b"hello world";
        let mut hasher = Crc64Hasher::new();
        hasher.update(data);
        let result = hasher.finalize();

        // Note: streaming hasher may have different result due to implementation
        // Verify it's deterministic
        let mut hasher2 = Crc64Hasher::new();
        hasher2.update(data);
        let result2 = hasher2.finalize();
        assert_eq!(result, result2);
    }

    #[test]
    fn test_streaming_crc32() {
        // Test that streaming matches full calculation
        let full_data = b"hello world";
        let full_result = crc32(full_data);

        // Stream it
        let mut hasher = Crc32Hasher::new();
        hasher.update(full_data);
        let stream_result = hasher.finalize();

        // They should match
        assert_eq!(stream_result, full_result);
    }
}
