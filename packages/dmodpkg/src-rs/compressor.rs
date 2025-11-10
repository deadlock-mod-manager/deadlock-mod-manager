use crate::error::{DmodpkgError, Result};
use std::io::{Read, Write};

/// Compression level (1-22, default 9)
pub const DEFAULT_COMPRESSION_LEVEL: i32 = 9;
pub const MIN_COMPRESSION_LEVEL: i32 = 1;
pub const MAX_COMPRESSION_LEVEL: i32 = 22;

/// Compression statistics
#[derive(Debug, Clone, Default)]
#[allow(dead_code)]
pub struct CompressionStats {
    pub uncompressed_size: usize,
    pub compressed_size: usize,
}

impl CompressionStats {
    /// Calculate compression ratio (0.0 to 1.0, lower is better)
    #[allow(dead_code)]
    pub fn ratio(&self) -> f64 {
        if self.uncompressed_size == 0 {
            return 0.0;
        }
        self.compressed_size as f64 / self.uncompressed_size as f64
    }

    /// Calculate compression savings percentage
    #[allow(dead_code)]
    pub fn savings_percent(&self) -> f64 {
        (1.0 - self.ratio()) * 100.0
    }
}

/// Compress data using Zstd
pub fn compress(data: &[u8], level: i32) -> Result<Vec<u8>> {
    let level = level.clamp(MIN_COMPRESSION_LEVEL, MAX_COMPRESSION_LEVEL);

    zstd::encode_all(data, level)
        .map_err(|e| DmodpkgError::compression(format!("Zstd compression failed: {}", e)))
}

/// Decompress data using Zstd
pub fn decompress(data: &[u8]) -> Result<Vec<u8>> {
    zstd::decode_all(data)
        .map_err(|e| DmodpkgError::compression(format!("Zstd decompression failed: {}", e)))
}

/// Compress data with statistics
#[allow(dead_code)]
pub fn compress_with_stats(data: &[u8], level: i32) -> Result<(Vec<u8>, CompressionStats)> {
    let compressed = compress(data, level)?;
    let stats = CompressionStats {
        uncompressed_size: data.len(),
        compressed_size: compressed.len(),
    };
    Ok((compressed, stats))
}

/// Streaming compressor
#[allow(dead_code)]
pub struct StreamingCompressor<W: Write> {
    encoder: zstd::Encoder<'static, W>,
}

#[allow(dead_code)]
impl<W: Write> StreamingCompressor<W> {
    pub fn new(writer: W, level: i32) -> Result<Self> {
        let level = level.clamp(MIN_COMPRESSION_LEVEL, MAX_COMPRESSION_LEVEL);
        let encoder = zstd::Encoder::new(writer, level).map_err(|e| {
            DmodpkgError::compression(format!("Failed to create compressor: {}", e))
        })?;
        Ok(Self { encoder })
    }

    pub fn write(&mut self, data: &[u8]) -> Result<usize> {
        self.encoder
            .write(data)
            .map_err(|e| DmodpkgError::compression(format!("Compression write failed: {}", e)))
    }

    pub fn finish(self) -> Result<W> {
        self.encoder
            .finish()
            .map_err(|e| DmodpkgError::compression(format!("Failed to finish compression: {}", e)))
    }
}

/// Streaming decompressor
#[allow(dead_code)]
pub struct StreamingDecompressor<R: Read> {
    decoder: zstd::Decoder<'static, std::io::BufReader<R>>,
}

#[allow(dead_code)]
impl<R: Read> StreamingDecompressor<R> {
    pub fn new(reader: R) -> Result<Self> {
        let decoder = zstd::Decoder::new(reader).map_err(|e| {
            DmodpkgError::compression(format!("Failed to create decompressor: {}", e))
        })?;
        Ok(Self { decoder })
    }

    pub fn read(&mut self, buf: &mut [u8]) -> Result<usize> {
        self.decoder
            .read(buf)
            .map_err(|e| DmodpkgError::compression(format!("Decompression read failed: {}", e)))
    }

    pub fn read_to_end(&mut self, buf: &mut Vec<u8>) -> Result<usize> {
        self.decoder
            .read_to_end(buf)
            .map_err(|e| DmodpkgError::compression(format!("Decompression read failed: {}", e)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compress_decompress() {
        let data = b"Hello, World! This is test data for compression. ".repeat(10);
        let compressed = compress(&data, DEFAULT_COMPRESSION_LEVEL).unwrap();
        let decompressed = decompress(&compressed).unwrap();

        assert_eq!(data.as_slice(), decompressed.as_slice());
        // With repeated data, compression should work well
        assert!(compressed.len() < data.len());
    }

    #[test]
    fn test_compression_stats() {
        let data = b"Hello, World! This is test data for compression. ".repeat(100);
        let (compressed, stats) = compress_with_stats(&data, DEFAULT_COMPRESSION_LEVEL).unwrap();

        assert_eq!(stats.uncompressed_size, data.len());
        assert_eq!(stats.compressed_size, compressed.len());
        assert!(stats.ratio() < 1.0);
        assert!(stats.savings_percent() > 0.0);
    }

    #[test]
    fn test_compression_levels() {
        let data = b"Hello, World! This is test data for compression. ".repeat(100);

        let low_level = compress(&data, 1).unwrap();
        let high_level = compress(&data, 22).unwrap();

        // Higher compression should generally produce smaller output
        assert!(high_level.len() <= low_level.len());

        // Both should decompress to original
        assert_eq!(decompress(&low_level).unwrap(), data);
        assert_eq!(decompress(&high_level).unwrap(), data);
    }

    #[test]
    fn test_level_clamping() {
        let data = b"test data";

        // Should not panic with invalid levels
        let _ = compress(data, -10).unwrap();
        let _ = compress(data, 100).unwrap();
    }

    #[test]
    fn test_streaming_compressor() {
        let data = b"Hello, World! This is streaming test data.";
        let mut output = Vec::new();

        {
            let mut compressor =
                StreamingCompressor::new(&mut output, DEFAULT_COMPRESSION_LEVEL).unwrap();
            compressor.write(data).unwrap();
            compressor.finish().unwrap();
        }

        let decompressed = decompress(&output).unwrap();
        assert_eq!(data, decompressed.as_slice());
    }

    #[test]
    fn test_streaming_decompressor() {
        let data = b"Hello, World! This is streaming test data.";
        let compressed = compress(data, DEFAULT_COMPRESSION_LEVEL).unwrap();

        let mut decompressor = StreamingDecompressor::new(&compressed[..]).unwrap();
        let mut output = Vec::new();
        decompressor.read_to_end(&mut output).unwrap();

        assert_eq!(data, output.as_slice());
    }

    #[test]
    fn test_empty_data() {
        let data = b"";
        let compressed = compress(data, DEFAULT_COMPRESSION_LEVEL).unwrap();
        let decompressed = decompress(&compressed).unwrap();
        assert_eq!(data, decompressed.as_slice());
    }

    #[test]
    fn test_large_data() {
        let data = vec![0u8; 1024 * 1024]; // 1MB of zeros
        let compressed = compress(&data, DEFAULT_COMPRESSION_LEVEL).unwrap();
        let decompressed = decompress(&compressed).unwrap();

        assert_eq!(data, decompressed);
        // Zeros should compress extremely well
        assert!(compressed.len() < data.len() / 100);
    }
}
