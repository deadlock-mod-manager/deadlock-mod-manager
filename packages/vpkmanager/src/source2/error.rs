// SPDX-FileCopyrightText: 2026 esoc
// SPDX-FileCopyrightText: 2015 ValveResourceFormat Contributors
// SPDX-License-Identifier: MIT

use crate::source2::texture::format::TextureFormat;

#[derive(thiserror::Error, Debug)]
pub enum DecodeError {
    #[error("not yet implemented: {0:?}")]
    Unimplemented(TextureFormat),

    #[error("input too short at offset {offset}: needed {needed} bytes, had {had}")]
    Truncated {
        offset: u64,
        needed: usize,
        had: usize,
    },

    #[error("malformed resource header: {0}")]
    BadResource(&'static str),

    #[error("resource has no DATA block")]
    MissingDataBlock,

    #[error("unsupported KV3 version: 0x{0:08x}")]
    UnsupportedKv3(u32),

    #[error("KV3 parse error: {0}")]
    Kv3(&'static str),

    #[error("unsupported KV3 compression method: {0} (only 0=none, 1=LZ4, 2=ZSTD are handled)")]
    Kv3Compression(u32),

    #[error("KV3 LZ4 decompress failed: {0}")]
    Kv3Lz4(String),

    #[error("unknown KV3 node type: {0}")]
    Kv3NodeType(u8),

    #[error("meshopt decode error: {0}")]
    Meshopt(&'static str),

    #[error("model decode error: {0}")]
    Model(&'static str),

    #[error("texture header missing field: {0}")]
    MissingField(&'static str),

    #[error("unknown texture format id: {0}")]
    UnknownFormat(i32),

    #[error("unknown texture format name")]
    UnknownFormatName,

    #[error("invalid decode target: mip {mip}, slice {slice}, face {face}")]
    InvalidTarget { mip: u8, slice: u16, face: u8 },

    #[error("inline image decode failed: {0}")]
    InlineImage(String),

    #[error("material compile error: {0}")]
    Material(String),
}

#[derive(thiserror::Error, Debug)]
pub enum EncodeError {
    #[error("encoder not yet implemented for {0:?}")]
    Unimplemented(TextureFormat),

    /// The supplied [`crate::source2::Image`] held the wrong pixel kind for the target
    /// format (e.g. `Rgba16F` pixels for an LDR format, or `Rgba8` pixels
    /// for an HDR format).
    #[error("wrong pixel kind for {format:?}: {reason}")]
    WrongPixelKind {
        format: TextureFormat,
        reason: &'static str,
    },

    /// The image dimensions don't match the buffer length, or the buffer
    /// doesn't match what the format requires for those dims.
    #[error(
        "size mismatch for {format:?} at {width}x{height}: expected {expected} bytes, got {got}"
    )]
    SizeMismatch {
        format: TextureFormat,
        width: u32,
        height: u32,
        expected: usize,
        got: usize,
    },

    /// The splice target's pixel-data region didn't match the new payload.
    /// Editing an existing `.vtex_c` requires the re-encoded bytes to slot
    /// into the exact byte range the original face/mip occupied.
    #[error("splice length mismatch: target region is {expected} bytes, replacement is {got}")]
    SpliceLengthMismatch { expected: usize, got: usize },

    /// Resource parsing failed during a splice. Wraps the underlying decode
    /// error so callers don't have to convert between error families.
    #[error("resource decode while preparing splice: {0}")]
    Decode(#[from] DecodeError),

    /// Inline PNG encoding failed.
    #[error("inline image encode failed: {0}")]
    InlineImage(String),
}
