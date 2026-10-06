// SPDX-FileCopyrightText: 2026 esoc
// SPDX-FileCopyrightText: 2015 ValveResourceFormat Contributors
// SPDX-License-Identifier: MIT

//! Binary KV3 writer, ported from `ValveResourceFormat`'s `BinaryKV3.Serialize`
//! (MIT). Emits **version 4, uncompressed** (`compressionMethod = 0`) exactly as
//! the reference does: the spec permits uncompressed buffers, so this avoids
//! needing an LZ4 *encoder*. The file is larger than Valve's LZ4-packed original
//! but is a valid compiled resource the engine reads.
//!
//! The basic encoder emits widened tags (`Int` -> `INT64`, `Double` ->
//! `DOUBLE`, `Array` -> generic `ARRAY`). The preserving encoder carries flags,
//! numeric widths, and typed-array structure through an edit. Version 5
//! auxiliary arrays become equivalent version 4 typed arrays because this
//! writer intentionally emits a single uncompressed buffer.

use super::node;
use super::types::{Encoding, EncodingChildren, Value};
use super::Format;
use crate::source2::error::DecodeError;
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
        // Used by the basic encoder, which has no parallel encoding metadata.
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

    finish(ctx, format)
}

pub(super) fn encode_preserving(
    value: &Value,
    encoding: &Encoding,
    format: &Format,
) -> Result<Vec<u8>, DecodeError> {
    let mut ctx = Ser::default();
    ctx.b4.extend_from_slice(&0u32.to_le_bytes());
    write_value_preserving(value, encoding, &mut ctx)?;
    Ok(finish(ctx, format))
}

fn finish(mut ctx: Ser, format: &Format) -> Vec<u8> {
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

fn write_value_preserving(
    value: &Value,
    encoding: &Encoding,
    ctx: &mut Ser,
) -> Result<(), DecodeError> {
    let datatype = preserved_datatype(value, encoding.datatype);
    write_encoded_type(ctx, datatype, encoding.flag);
    write_value_data(value, encoding, datatype, ctx)
}

fn preserved_datatype(value: &Value, preferred: u8) -> u8 {
    use node::*;
    match (value, preferred) {
        (Value::Array(items), ARRAY_TYPE_AUXILIARY_BUFFER) if !items.is_empty() => ARRAY_TYPED,
        (Value::Array(items), ARRAY_TYPE_BYTE_LENGTH) if items.len() > usize::from(u8::MAX) => {
            ARRAY_TYPED
        }
        (
            Value::Array(items),
            ARRAY_TYPED | ARRAY_TYPE_BYTE_LENGTH | ARRAY_TYPE_AUXILIARY_BUFFER,
        ) if items.is_empty() => ARRAY,
        _ => compatible_datatype(value, preferred),
    }
}

pub(super) fn encoding_preserved(value: &Value, expected: &Encoding, actual: &Encoding) -> bool {
    if actual.datatype != preserved_datatype(value, expected.datatype)
        || actual.flag != expected.flag
    {
        return false;
    }
    match (value, &expected.children, &actual.children) {
        (
            Value::Array(values),
            EncodingChildren::Array(expected),
            EncodingChildren::Array(actual),
        ) => {
            values.len() == expected.len()
                && values.len() == actual.len()
                && values
                    .iter()
                    .zip(expected)
                    .zip(actual)
                    .all(|((value, expected), actual)| encoding_preserved(value, expected, actual))
        }
        (
            Value::Object(values),
            EncodingChildren::Object(expected),
            EncodingChildren::Object(actual),
        ) => {
            values.len() == actual.len()
                && values
                    .iter()
                    .zip(actual)
                    .all(|((name, value), (actual_name, actual))| {
                        name == actual_name
                            && expected.iter().find(|(key, _)| key == name).is_some_and(
                                |(_, expected)| encoding_preserved(value, expected, actual),
                            )
                    })
        }
        (Value::Array(_) | Value::Object(_), _, _) => false,
        (_, EncodingChildren::None, EncodingChildren::None) => true,
        _ => false,
    }
}

pub(super) fn normalize_numeric_array_encoding(
    value: &Value,
    encoding: &mut Encoding,
) -> Result<(), DecodeError> {
    use node::*;
    match (value, &mut encoding.children) {
        (Value::Array(values), EncodingChildren::Array(items)) => {
            if values.len() != items.len() {
                return Err(DecodeError::Kv3("array encoding length mismatch"));
            }
            for (value, item) in values.iter().zip(items.iter_mut()) {
                normalize_numeric_array_encoding(value, item)?;
            }
            if !matches!(
                encoding.datatype,
                ARRAY_TYPED | ARRAY_TYPE_BYTE_LENGTH | ARRAY_TYPE_AUXILIARY_BUFFER
            ) || values.is_empty()
            {
                return Ok(());
            }
            let first = preserved_datatype(&values[0], items[0].datatype);
            if values
                .iter()
                .zip(items.iter())
                .all(|(v, e)| preserved_datatype(v, e.datatype) == first)
            {
                return Ok(());
            }
            let flag = items[0].flag;
            if items.iter().any(|e| e.flag != flag) {
                return Err(DecodeError::Kv3(
                    "typed numeric array has inconsistent flags",
                ));
            }
            let datatype = if values.iter().all(|v| matches!(v, Value::Double(_))) {
                // Compact DOUBLE_ZERO/ONE carry double semantics. FLOAT arrays
                // keep their width unless they actually mixed compiler schemas.
                if items
                    .iter()
                    .all(|e| matches!(e.datatype, FLOAT | DOUBLE_ZERO | DOUBLE_ONE))
                    && items.iter().any(|e| e.datatype == FLOAT)
                {
                    FLOAT
                } else {
                    DOUBLE
                }
            } else if values.iter().all(|v| matches!(v, Value::Int(_))) {
                INT64
            } else if values.iter().all(|v| matches!(v, Value::UInt(_))) {
                UINT64
            } else {
                return Err(DecodeError::Kv3("incompatible typed array is not numeric"));
            };
            for item in items {
                item.datatype = datatype;
            }
        }
        (Value::Object(fields), EncodingChildren::Object(items)) => {
            for (key, value) in fields {
                let (_, item) = items
                    .iter_mut()
                    .find(|(name, _)| name == key)
                    .ok_or(DecodeError::Kv3("field encoding missing"))?;
                normalize_numeric_array_encoding(value, item)?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn write_value_data(
    value: &Value,
    encoding: &Encoding,
    datatype: u8,
    ctx: &mut Ser,
) -> Result<(), DecodeError> {
    use node::*;
    match (value, datatype) {
        (Value::Null, NULL) => {}
        (Value::Bool(_), BOOLEAN_TRUE | BOOLEAN_FALSE) => {}
        (Value::Bool(value), BOOLEAN) => ctx.b1.push(u8::from(*value)),
        (Value::Int(_), INT64_ZERO | INT64_ONE) => {}
        (Value::Int(value), INT32_AS_BYTE) => ctx.b1.push(
            u8::try_from(*value)
                .map_err(|_| DecodeError::Kv3("preserved INT32_AS_BYTE value is out of range"))?,
        ),
        (Value::Int(value), INT16) => ctx.b2.extend_from_slice(
            &i16::try_from(*value)
                .map_err(|_| DecodeError::Kv3("preserved INT16 value is out of range"))?
                .to_le_bytes(),
        ),
        (Value::UInt(value), UINT16) => ctx.b2.extend_from_slice(
            &u16::try_from(*value)
                .map_err(|_| DecodeError::Kv3("preserved UINT16 value is out of range"))?
                .to_le_bytes(),
        ),
        (Value::Int(value), INT32) => ctx.b4.extend_from_slice(
            &i32::try_from(*value)
                .map_err(|_| DecodeError::Kv3("preserved INT32 value is out of range"))?
                .to_le_bytes(),
        ),
        (Value::UInt(value), UINT32) => ctx.b4.extend_from_slice(
            &u32::try_from(*value)
                .map_err(|_| DecodeError::Kv3("preserved UINT32 value is out of range"))?
                .to_le_bytes(),
        ),
        (Value::Double(value), FLOAT) => {
            ctx.b4
                .extend_from_slice(&(*value as f32).to_bits().to_le_bytes());
        }
        (Value::Int(value), INT64) => ctx.b8.extend_from_slice(&value.to_le_bytes()),
        (Value::UInt(value), UINT64) => ctx.b8.extend_from_slice(&value.to_le_bytes()),
        (Value::Double(_), DOUBLE_ZERO | DOUBLE_ONE) => {}
        (Value::Double(value), DOUBLE) => {
            ctx.b8.extend_from_slice(&value.to_bits().to_le_bytes());
        }
        (Value::String(value), STRING) => {
            let id = ctx.string_id(value);
            ctx.b4.extend_from_slice(&id.to_le_bytes());
        }
        (Value::Binary(bytes), BINARY_BLOB) => {
            ctx.blob_lengths
                .push(i32::try_from(bytes.len()).expect("blob too large"));
            ctx.blobs.extend_from_slice(bytes);
        }
        (Value::Array(items), ARRAY) => {
            ctx.b4.extend_from_slice(
                &u32::try_from(items.len())
                    .map_err(|_| DecodeError::Kv3("array is too large"))?
                    .to_le_bytes(),
            );
            let encodings = array_encodings(encoding, items.len())?;
            for (item, item_encoding) in items.iter().zip(encodings) {
                write_value_preserving(item, item_encoding, ctx)?;
            }
        }
        (Value::Array(items), ARRAY_TYPED | ARRAY_TYPE_BYTE_LENGTH) => {
            if datatype == ARRAY_TYPE_BYTE_LENGTH {
                ctx.b1.push(
                    u8::try_from(items.len())
                        .map_err(|_| DecodeError::Kv3("byte-length array is too large"))?,
                );
            } else {
                ctx.b4.extend_from_slice(
                    &u32::try_from(items.len())
                        .map_err(|_| DecodeError::Kv3("array is too large"))?
                        .to_le_bytes(),
                );
            }
            let encodings = array_encodings(encoding, items.len())?;
            let first = encodings
                .first()
                .ok_or(DecodeError::Kv3("typed array has no item encoding"))?;
            let item_datatype = preserved_datatype(&items[0], first.datatype);
            write_encoded_type(ctx, item_datatype, first.flag);
            for (item, item_encoding) in items.iter().zip(encodings) {
                let actual = preserved_datatype(item, item_encoding.datatype);
                if actual != item_datatype || item_encoding.flag != first.flag {
                    return Err(DecodeError::Kv3(
                        "typed array contains incompatible item encodings",
                    ));
                }
                write_value_data(item, item_encoding, actual, ctx)?;
            }
        }
        (Value::Object(fields), OBJECT) => {
            ctx.b4.extend_from_slice(
                &u32::try_from(fields.len())
                    .map_err(|_| DecodeError::Kv3("object is too large"))?
                    .to_le_bytes(),
            );
            let EncodingChildren::Object(encodings) = &encoding.children else {
                return Err(DecodeError::Kv3("object encoding metadata is missing"));
            };
            for (key, value) in fields {
                let id = ctx.string_id(key);
                ctx.b4.extend_from_slice(&id.to_le_bytes());
                let child = encodings
                    .iter()
                    .find(|(candidate, _)| candidate == key)
                    .map(|(_, child)| child)
                    .ok_or(DecodeError::Kv3(
                        "object field encoding metadata is missing",
                    ))?;
                write_value_preserving(value, child, ctx)?;
            }
        }
        _ => {
            return Err(DecodeError::Kv3(
                "value does not match preserved KV3 encoding",
            ));
        }
    }
    Ok(())
}

fn array_encodings(encoding: &Encoding, expected: usize) -> Result<&[Encoding], DecodeError> {
    let EncodingChildren::Array(encodings) = &encoding.children else {
        return Err(DecodeError::Kv3("array encoding metadata is missing"));
    };
    if encodings.len() != expected {
        return Err(DecodeError::Kv3("array encoding metadata length mismatch"));
    }
    Ok(encodings)
}

fn compatible_datatype(value: &Value, preferred: u8) -> u8 {
    use node::*;
    match value {
        Value::Null => NULL,
        Value::Bool(value) => match preferred {
            BOOLEAN => BOOLEAN,
            BOOLEAN_TRUE if *value => BOOLEAN_TRUE,
            BOOLEAN_FALSE if !*value => BOOLEAN_FALSE,
            _ if *value => BOOLEAN_TRUE,
            _ => BOOLEAN_FALSE,
        },
        Value::Int(value) => match preferred {
            INT64_ZERO if *value == 0 => INT64_ZERO,
            INT64_ONE if *value == 1 => INT64_ONE,
            INT32_AS_BYTE if u8::try_from(*value).is_ok() => INT32_AS_BYTE,
            INT16 if i16::try_from(*value).is_ok() => INT16,
            INT32 if i32::try_from(*value).is_ok() => INT32,
            INT64 => INT64,
            _ => INT64,
        },
        Value::UInt(value) => match preferred {
            UINT16 if u16::try_from(*value).is_ok() => UINT16,
            UINT32 if u32::try_from(*value).is_ok() => UINT32,
            UINT64 => UINT64,
            _ => UINT64,
        },
        Value::Double(value) => match preferred {
            DOUBLE_ZERO if *value == 0.0 => DOUBLE_ZERO,
            DOUBLE_ONE if *value == 1.0 => DOUBLE_ONE,
            FLOAT => FLOAT,
            DOUBLE => DOUBLE,
            _ => DOUBLE,
        },
        Value::String(_) => STRING,
        Value::Binary(_) => BINARY_BLOB,
        Value::Array(_) => match preferred {
            ARRAY | ARRAY_TYPED | ARRAY_TYPE_BYTE_LENGTH | ARRAY_TYPE_AUXILIARY_BUFFER => preferred,
            _ => ARRAY,
        },
        Value::Object(_) => OBJECT,
    }
}

fn write_encoded_type(ctx: &mut Ser, datatype: u8, flag: u8) {
    if flag == 0 {
        ctx.types.push(datatype);
    } else {
        ctx.types.push(datatype | 0x80);
        ctx.types.push(flag);
    }
}

fn align_pad(body: &mut Vec<u8>, offset: &mut usize, alignment: usize) {
    let a = alignment - 1;
    let aligned = (*offset + a) & !a;
    body.resize(body.len() + (aligned - *offset), 0);
    *offset = aligned;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn leaf(datatype: u8, flag: u8) -> Encoding {
        Encoding {
            datatype,
            flag,
            children: EncodingChildren::None,
        }
    }

    #[test]
    fn edited_compact_typed_numbers_promote_without_changing_flags_or_other_fields() {
        let value = Value::Array(vec![Value::Double(0.0), Value::Double(2.5)]);
        let mut encoding = Encoding {
            datatype: node::ARRAY_TYPED,
            flag: 0,
            children: EncodingChildren::Array(vec![
                Encoding {
                    datatype: node::DOUBLE_ZERO,
                    flag: 4,
                    children: EncodingChildren::None
                };
                2
            ]),
        };
        assert!(encode_preserving(&value, &encoding, &Format([0; 16])).is_err());
        normalize_numeric_array_encoding(&value, &mut encoding).unwrap();
        let bytes = encode_preserving(&value, &encoding, &Format([0; 16])).unwrap();
        let (actual, metadata) = super::super::decode_preserving(&bytes).unwrap();
        assert_eq!(actual, value);
        assert!(encoding_preserved(&value, &encoding, &metadata));
        assert!(metadata
            .as_array()
            .unwrap()
            .iter()
            .all(|e| e.flag == 4 && e.datatype == node::DOUBLE));
        let mut bad = encoding.clone();
        if let EncodingChildren::Array(items) = &mut bad.children {
            items[0].datatype = node::DOUBLE_ZERO;
            items[1].flag = 0;
        }
        assert!(normalize_numeric_array_encoding(&value, &mut bad).is_err());
    }

    #[test]
    fn preserving_encoder_handles_empty_auxiliary_arrays() {
        for datatype in [
            node::ARRAY_TYPED,
            node::ARRAY_TYPE_BYTE_LENGTH,
            node::ARRAY_TYPE_AUXILIARY_BUFFER,
        ] {
            let value = Value::Object(vec![("weights".into(), Value::Array(Vec::new()))]);
            let encoding = Encoding {
                datatype: node::OBJECT,
                flag: 0,
                children: EncodingChildren::Object(vec![(
                    "weights".into(),
                    Encoding {
                        datatype,
                        flag: 0,
                        children: EncodingChildren::Array(Vec::new()),
                    },
                )]),
            };
            let bytes = encode_preserving(&value, &encoding, &Format([0; 16])).unwrap();
            assert_eq!(super::super::decode(&bytes).unwrap(), value);
            assert_eq!(
                super::super::encoding_stats(&bytes).unwrap().typed_arrays,
                0
            );
        }
    }

    #[test]
    fn preserving_encoder_keeps_flags_typed_arrays_and_numeric_widths() {
        let value = Value::Object(vec![
            ("resource".to_string(), Value::String("hero".to_string())),
            (
                "values".to_string(),
                Value::Array(vec![Value::Int(2), Value::Int(3), Value::Int(4)]),
            ),
        ]);
        let encoding = Encoding {
            datatype: node::OBJECT,
            flag: 0,
            children: EncodingChildren::Object(vec![
                ("resource".to_string(), leaf(node::STRING, 1)),
                (
                    "values".to_string(),
                    Encoding {
                        datatype: node::ARRAY_TYPE_AUXILIARY_BUFFER,
                        flag: 0,
                        children: EncodingChildren::Array(vec![
                            leaf(node::INT16, 0),
                            leaf(node::INT16, 0),
                            leaf(node::INT16, 0),
                        ]),
                    },
                ),
            ]),
        };

        let bytes = encode_preserving(&value, &encoding, &Format([0; 16])).unwrap();
        let decoded = super::super::decode(&bytes).unwrap();
        let stats = super::super::encoding_stats(&bytes).unwrap();

        assert_eq!(decoded, value);
        assert_eq!(stats.version, 4);
        assert_eq!(stats.flagged_nodes, 1);
        assert_eq!(stats.typed_arrays, 1);
        assert_eq!(stats.narrow_numbers, 1);
        let (_, actual) = super::super::decode_preserving(&bytes).unwrap();
        assert!(encoding_preserved(&value, &encoding, &actual));
        let (_, widened) =
            super::super::decode_preserving(&encode(&value, &Format([0; 16]))).unwrap();
        assert!(!encoding_preserved(&value, &encoding, &widened));
        let mut changed_flag = actual.clone();
        changed_flag.get_mut("resource").unwrap().flag = 0;
        assert!(!encoding_preserved(&value, &encoding, &changed_flag));
    }
}
