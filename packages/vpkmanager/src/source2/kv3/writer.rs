//! Binary KV3 writer, ported from `ValveResourceFormat`'s `BinaryKV3.Serialize`
//! (MIT). Emits **version 4, uncompressed** (`compressionMethod = 0`) exactly as
//! the reference does: the spec permits uncompressed buffers, so this avoids
//! needing an LZ4 *encoder*. The file is larger than Valve's LZ4-packed original
//! but is a valid compiled resource the engine reads.
//!
//! Values are emitted with widened tags (`Int` -> `INT64`, `Double` -> `DOUBLE`,
//! `Array` -> generic `ARRAY`), which KV3 consumers coerce transparently. Value
//! flags are not modelled, so none are written.

use super::Format;
use super::node;
use super::types::Value;
use std::collections::HashMap;

const MAGIC_V4: u32 = 0x4B56_3304;
const TRAILER: u32 = 0xFFEE_DD00;

/// Interned string table plus the typed output lanes, mirroring VRF's
/// `SerializationContext`.
#[derive(Default)]
struct Ser {
    string_map: HashMap<String, i32>,
    strings: Vec<String>,
    b1: Vec<u8>,
    b2: Vec<u8>,
    b4: Vec<u8>,
    b8: Vec<u8>,
    types: Vec<u8>,
    blobs: Vec<u8>,
    blob_lengths: Vec<i32>,
}

impl Ser {
    fn string_id(&mut self, s: &str) -> i32 {
        if s.is_empty() {
            return -1;
        }
        if let Some(&id) = self.string_map.get(s) {
            return id;
        }
        let id = i32::try_from(self.strings.len()).expect("string table overflow");
        self.strings.push(s.to_owned());
        self.string_map.insert(s.to_owned(), id);
        id
    }

    fn write_type(&mut self, t: u8) {
        // No flags are modelled, so the high bit is never set.
        self.types.push(t);
    }
}

/// Encode a [`Value`] tree to a binary KV3 v4 (uncompressed) DATA payload.
#[must_use]
pub(super) fn encode(value: &Value, format: &Format) -> Vec<u8> {
    let mut ctx = Ser::default();

    // First 4-byte slot is the string count (back-patched once interning is
    // done). VRF writes a placeholder here.
    ctx.b4.extend_from_slice(&0u32.to_le_bytes());

    write_value(value, &mut ctx);

    let string_count = u32::try_from(ctx.strings.len()).expect("string table overflow");
    ctx.b4[0..4].copy_from_slice(&string_count.to_le_bytes());

    // Build the data-block body (everything after the fixed header).
    let (body, count_types) = write_data(&mut ctx);

    let mut out = Vec::with_capacity(120 + body.len() + ctx.blobs.len() + 8);
    out.extend_from_slice(&MAGIC_V4.to_le_bytes());
    out.extend_from_slice(&format.0);
    out.extend_from_slice(&0u32.to_le_bytes()); // compressionMethod = none
    out.extend_from_slice(&0u16.to_le_bytes()); // compressionDictionaryId
    out.extend_from_slice(&0u16.to_le_bytes()); // compressionFrameSize
    out.extend_from_slice(&u32::try_from(ctx.b1.len()).unwrap().to_le_bytes()); // countBytes1
    out.extend_from_slice(&u32::try_from(ctx.b4.len() / 4).unwrap().to_le_bytes()); // countBytes4
    out.extend_from_slice(&u32::try_from(ctx.b8.len() / 8).unwrap().to_le_bytes()); // countBytes8
    out.extend_from_slice(&count_types.to_le_bytes()); // countTypes
    out.extend_from_slice(&0u16.to_le_bytes()); // countObjects (unused by reader for v<5)
    out.extend_from_slice(&0u16.to_le_bytes()); // countArrays
    out.extend_from_slice(&0u32.to_le_bytes()); // sizeUncompressedTotal (patched below)
    out.extend_from_slice(&0u32.to_le_bytes()); // sizeCompressedTotal (patched below)
    out.extend_from_slice(&u32::try_from(ctx.blob_lengths.len()).unwrap().to_le_bytes()); // countBlocks
    out.extend_from_slice(&u32::try_from(ctx.blobs.len()).unwrap().to_le_bytes()); // sizeBinaryBlobsBytes
    out.extend_from_slice(&u32::try_from(ctx.b2.len() / 2).unwrap().to_le_bytes()); // countBytes2 (v>=4)
    out.extend_from_slice(&0u32.to_le_bytes()); // sizeBlockCompressedSizesBytes (v>=4)

    let unc_total_off = 48; // offset of sizeUncompressedTotal field
    let data_size = u32::try_from(body.len()).expect("data block too large");
    out[unc_total_off..unc_total_off + 4].copy_from_slice(&data_size.to_le_bytes());
    out[unc_total_off + 4..unc_total_off + 8].copy_from_slice(&data_size.to_le_bytes());

    out.extend_from_slice(&body);

    // Binary blobs (if any) live after the measured main body, capped by a
    // trailing marker. Soundevents never reach this branch.
    if !ctx.blob_lengths.is_empty() {
        out.extend_from_slice(&ctx.blobs);
        out.extend_from_slice(&TRAILER.to_le_bytes());
    }

    out
}

/// Lay out the typed lanes + strings + types into the data block body, with the
/// same alignment discipline VRF uses. Returns `(body, count_types)` where
/// `count_types` is the value the header's `countTypes` field must hold for the
/// v<5 reader (string bytes + type bytes).
fn write_data(ctx: &mut Ser) -> (Vec<u8>, u32) {
    let mut body = Vec::new();
    body.extend_from_slice(&ctx.b1);
    let mut offset = ctx.b1.len();

    if !ctx.b2.is_empty() {
        align_pad(&mut body, &mut offset, 2);
        body.extend_from_slice(&ctx.b2);
        offset += ctx.b2.len();
    }
    if !ctx.b4.is_empty() {
        align_pad(&mut body, &mut offset, 4);
        body.extend_from_slice(&ctx.b4);
        offset += ctx.b4.len();
    }
    if ctx.b8.is_empty() {
        align_pad(&mut body, &mut offset, 8);
    } else {
        align_pad(&mut body, &mut offset, 8);
        body.extend_from_slice(&ctx.b8);
        offset += ctx.b8.len();
    }

    let strings_start = offset;
    for s in &ctx.strings {
        body.extend_from_slice(s.as_bytes());
        body.push(0);
        offset += s.len() + 1;
    }

    body.extend_from_slice(&ctx.types);
    offset += ctx.types.len();
    let count_types = u32::try_from(offset - strings_start).expect("types region too large");

    if ctx.blob_lengths.is_empty() {
        body.extend_from_slice(&TRAILER.to_le_bytes());
    } else {
        for &len in &ctx.blob_lengths {
            body.extend_from_slice(&len.to_le_bytes());
        }
        body.extend_from_slice(&TRAILER.to_le_bytes());
    }

    (body, count_types)
}

// `*d == 0.0` / `*d == 1.0` are deliberate exact comparisons: they pick the
// compact DOUBLE_ZERO/DOUBLE_ONE tags, matching the reference encoder.
#[allow(clippy::wildcard_imports, clippy::float_cmp)]
fn write_value(value: &Value, ctx: &mut Ser) {
    use node::*;
    match value {
        Value::Bool(b) => ctx.write_type(if *b { BOOLEAN_TRUE } else { BOOLEAN_FALSE }),
        Value::Int(i) => match i {
            0 => ctx.write_type(INT64_ZERO),
            1 => ctx.write_type(INT64_ONE),
            _ => {
                ctx.write_type(INT64);
                ctx.b8.extend_from_slice(&i.to_le_bytes());
            }
        },
        Value::UInt(u) => {
            ctx.write_type(UINT64);
            ctx.b8.extend_from_slice(&u.to_le_bytes());
        }
        Value::Double(d) => {
            if *d == 0.0 {
                ctx.write_type(DOUBLE_ZERO);
            } else if *d == 1.0 {
                ctx.write_type(DOUBLE_ONE);
            } else {
                ctx.write_type(DOUBLE);
                ctx.b8.extend_from_slice(&d.to_bits().to_le_bytes());
            }
        }
        Value::Null => ctx.write_type(NULL),
        Value::String(s) => {
            ctx.write_type(STRING);
            let id = ctx.string_id(s);
            ctx.b4.extend_from_slice(&id.to_le_bytes());
        }
        Value::Binary(bytes) => {
            ctx.write_type(BINARY_BLOB);
            ctx.blob_lengths
                .push(i32::try_from(bytes.len()).expect("blob too large"));
            ctx.blobs.extend_from_slice(bytes);
        }
        Value::Array(items) => {
            ctx.write_type(ARRAY);
            let n = u32::try_from(items.len()).expect("array too large");
            ctx.b4.extend_from_slice(&n.to_le_bytes());
            for item in items {
                write_value(item, ctx);
            }
        }
        Value::Object(pairs) => {
            ctx.write_type(OBJECT);
            let n = u32::try_from(pairs.len()).expect("object too large");
            ctx.b4.extend_from_slice(&n.to_le_bytes());
            for (key, v) in pairs {
                let id = ctx.string_id(key);
                ctx.b4.extend_from_slice(&id.to_le_bytes());
                write_value(v, ctx);
            }
        }
    }
}

fn align_pad(body: &mut Vec<u8>, offset: &mut usize, alignment: usize) {
    let a = alignment - 1;
    let aligned = (*offset + a) & !a;
    body.resize(body.len() + (aligned - *offset), 0);
    *offset = aligned;
}
