//! Binary `KeyValues3` codec for Source 2 resources.
//!
//! [`decode`] reads a binary KV3 DATA payload (the `DATA` block of a `.vsndevts_c`,
//! `.vmat_c`, etc.) into a [`Value`] tree. [`encode`] writes a tree back out as a
//! valid **uncompressed v4** payload. The pair round-trips: decoding Valve's
//! LZ4-packed v5 file and re-encoding yields an uncompressed file the engine
//! still loads.
//!
//! This is format-generic. Soundevents-specific helpers (path swaps, VPK I/O,
//! JSON projection) live in `vpkmerge-core`, not here.
//!
//! Layout and algorithms are ported from `ValveResourceFormat` (MIT); see the
//! `reader` and `writer` submodules.

mod patch;
mod reader;
mod rewrap;
mod types;
mod writer;

pub use patch::{
    Seg, insert_array_element_adding, neutralize_draw_calls, set_blob, set_bools, set_doubles,
    set_floats, set_scalars, set_sole_blob, set_strings, set_strings_adding,
};
pub use rewrap::rewrap_uncompressed;
pub use types::Value;

use crate::source2::error::DecodeError;

/// Numeric tags for KV3 binary node types (VRF `KV3BinaryNodeType`). Shared by
/// the reader and writer so the two never drift.
pub(crate) mod node {
    pub const NULL: u8 = 1;
    pub const BOOLEAN: u8 = 2;
    pub const INT64: u8 = 3;
    pub const UINT64: u8 = 4;
    pub const DOUBLE: u8 = 5;
    pub const STRING: u8 = 6;
    pub const BINARY_BLOB: u8 = 7;
    pub const ARRAY: u8 = 8;
    pub const OBJECT: u8 = 9;
    pub const ARRAY_TYPED: u8 = 10;
    pub const INT32: u8 = 11;
    pub const UINT32: u8 = 12;
    pub const BOOLEAN_TRUE: u8 = 13;
    pub const BOOLEAN_FALSE: u8 = 14;
    pub const INT64_ZERO: u8 = 15;
    pub const INT64_ONE: u8 = 16;
    pub const DOUBLE_ZERO: u8 = 17;
    pub const DOUBLE_ONE: u8 = 18;
    pub const FLOAT: u8 = 19;
    pub const INT16: u8 = 20;
    pub const UINT16: u8 = 21;
    pub const INT32_AS_BYTE: u8 = 23;
    pub const ARRAY_TYPE_BYTE_LENGTH: u8 = 24;
    pub const ARRAY_TYPE_AUXILIARY_BUFFER: u8 = 25;
}

/// The 16-byte KV3 format GUID from the payload header. It names the schema
/// (soundevents, material, generic, ...); the engine keys on it, so a faithful
/// re-encode must carry the original through rather than substitute a generic.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Format(pub [u8; 16]);

impl Format {
    /// Read the format GUID from a binary KV3 payload (bytes 4..20, right after
    /// the 4-byte magic). Errors if the slice is too short or not binary KV3.
    pub fn from_payload(data: &[u8]) -> Result<Self, DecodeError> {
        if data.len() < 20 {
            return Err(DecodeError::Truncated {
                offset: 0,
                needed: 20,
                had: data.len(),
            });
        }
        let mut guid = [0u8; 16];
        guid.copy_from_slice(&data[4..20]);
        Ok(Self(guid))
    }
}

/// Decode a binary KV3 DATA payload into a [`Value`] tree.
pub fn decode(data: &[u8]) -> Result<Value, DecodeError> {
    reader::decode(data)
}

/// Encode a [`Value`] tree into an uncompressed binary KV3 v4 DATA payload,
/// stamped with `format`.
#[must_use]
pub fn encode(value: &Value, format: &Format) -> Vec<u8> {
    writer::encode(value, format)
}
