use std::collections::BTreeMap;

use lz4_flex::block::decompress_into;

use crate::error::{Result, Source2Error};

#[derive(Debug, Clone)]
pub enum KvValue {
    Null,
    Bool(bool),
    Int(i64),
    UInt(u64),
    Float(f64),
    String(String),
    Binary(Vec<u8>),
    Array(Vec<KvValue>),
    Object(BTreeMap<String, KvValue>),
}

impl KvValue {
    pub fn get(&self, key: &str) -> Option<&KvValue> {
        match self {
            KvValue::Object(values) => values.get(key),
            _ => None,
        }
    }

    pub fn as_array(&self) -> Option<&[KvValue]> {
        match self {
            KvValue::Array(values) => Some(values),
            _ => None,
        }
    }

    pub fn as_i64(&self) -> Option<i64> {
        match self {
            KvValue::Int(value) => Some(*value),
            KvValue::UInt(value) => i64::try_from(*value).ok(),
            _ => None,
        }
    }

    pub fn as_u32(&self) -> Option<u32> {
        self.as_i64().and_then(|value| u32::try_from(value).ok())
    }

    pub fn as_string(&self) -> Option<&str> {
        match self {
            KvValue::String(value) => Some(value),
            _ => None,
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            KvValue::Bool(value) => Some(*value),
            KvValue::Int(value) => Some(*value != 0),
            KvValue::UInt(value) => Some(*value != 0),
            _ => None,
        }
    }
}

#[derive(Debug, Clone)]
struct Segment {
    bytes1: Vec<u8>,
    bytes2: Vec<u8>,
    bytes4: Vec<u8>,
    bytes8: Vec<u8>,
    pos1: usize,
    pos2: usize,
    pos4: usize,
    pos8: usize,
}

impl Segment {
    fn empty() -> Self {
        Self {
            bytes1: Vec::new(),
            bytes2: Vec::new(),
            bytes4: Vec::new(),
            bytes8: Vec::new(),
            pos1: 0,
            pos2: 0,
            pos4: 0,
            pos8: 0,
        }
    }

    fn read_u8(&mut self) -> Result<u8> {
        let value = *self
            .bytes1
            .get(self.pos1)
            .ok_or_else(|| Source2Error::Resource("KV3 bytes1 out of bounds".into()))?;
        self.pos1 += 1;
        Ok(value)
    }

    fn read_i16(&mut self) -> Result<i16> {
        let value = read_i16(&self.bytes2, self.pos2)?;
        self.pos2 += 2;
        Ok(value)
    }

    fn read_u16(&mut self) -> Result<u16> {
        let value = read_u16(&self.bytes2, self.pos2)?;
        self.pos2 += 2;
        Ok(value)
    }

    fn read_i32(&mut self) -> Result<i32> {
        let value = read_i32(&self.bytes4, self.pos4)?;
        self.pos4 += 4;
        Ok(value)
    }

    fn read_u32(&mut self) -> Result<u32> {
        let value = read_u32(&self.bytes4, self.pos4)?;
        self.pos4 += 4;
        Ok(value)
    }

    fn read_f32(&mut self) -> Result<f32> {
        let value = read_f32(&self.bytes4, self.pos4)?;
        self.pos4 += 4;
        Ok(value)
    }

    fn read_i64(&mut self) -> Result<i64> {
        let value = read_i64(&self.bytes8, self.pos8)?;
        self.pos8 += 8;
        Ok(value)
    }

    fn read_u64(&mut self) -> Result<u64> {
        let value = read_u64(&self.bytes8, self.pos8)?;
        self.pos8 += 8;
        Ok(value)
    }

    fn read_f64(&mut self) -> Result<f64> {
        let value = read_f64(&self.bytes8, self.pos8)?;
        self.pos8 += 8;
        Ok(value)
    }
}

struct KvContext {
    version: u8,
    strings: Vec<String>,
    types: Vec<u8>,
    type_pos: usize,
    object_lengths: Vec<u8>,
    object_pos: usize,
    binary_blob_lengths: Vec<u8>,
    binary_blob_pos: usize,
    binary_blobs: Vec<u8>,
    binary_pos: usize,
    buffer: Segment,
    auxiliary: Segment,
}

#[derive(Copy, Clone)]
enum NodeType {
    Null = 1,
    Boolean = 2,
    Int64 = 3,
    UInt64 = 4,
    Double = 5,
    String = 6,
    BinaryBlob = 7,
    Array = 8,
    Object = 9,
    ArrayTyped = 10,
    Int32 = 11,
    UInt32 = 12,
    BooleanTrue = 13,
    BooleanFalse = 14,
    Int64Zero = 15,
    Int64One = 16,
    DoubleZero = 17,
    DoubleOne = 18,
    Float = 19,
    Int16 = 20,
    UInt16 = 21,
    Int32AsByte = 23,
    ArrayTypeByteLength = 24,
    ArrayTypeAuxiliaryBuffer = 25,
}

fn read_u16(data: &[u8], pos: usize) -> Result<u16> {
    data.get(pos..pos + 2)
        .map(|b| u16::from_le_bytes(b.try_into().unwrap()))
        .ok_or_else(|| Source2Error::Resource(format!("KV3 u16 read out of bounds at {pos}")))
}

fn read_i16(data: &[u8], pos: usize) -> Result<i16> {
    data.get(pos..pos + 2)
        .map(|b| i16::from_le_bytes(b.try_into().unwrap()))
        .ok_or_else(|| Source2Error::Resource(format!("KV3 i16 read out of bounds at {pos}")))
}

fn read_u32(data: &[u8], pos: usize) -> Result<u32> {
    data.get(pos..pos + 4)
        .map(|b| u32::from_le_bytes(b.try_into().unwrap()))
        .ok_or_else(|| Source2Error::Resource(format!("KV3 u32 read out of bounds at {pos}")))
}

fn read_i32(data: &[u8], pos: usize) -> Result<i32> {
    data.get(pos..pos + 4)
        .map(|b| i32::from_le_bytes(b.try_into().unwrap()))
        .ok_or_else(|| Source2Error::Resource(format!("KV3 i32 read out of bounds at {pos}")))
}

fn read_u64(data: &[u8], pos: usize) -> Result<u64> {
    data.get(pos..pos + 8)
        .map(|b| u64::from_le_bytes(b.try_into().unwrap()))
        .ok_or_else(|| Source2Error::Resource(format!("KV3 u64 read out of bounds at {pos}")))
}

fn read_i64(data: &[u8], pos: usize) -> Result<i64> {
    data.get(pos..pos + 8)
        .map(|b| i64::from_le_bytes(b.try_into().unwrap()))
        .ok_or_else(|| Source2Error::Resource(format!("KV3 i64 read out of bounds at {pos}")))
}

fn read_f32(data: &[u8], pos: usize) -> Result<f32> {
    data.get(pos..pos + 4)
        .map(|b| f32::from_le_bytes(b.try_into().unwrap()))
        .ok_or_else(|| Source2Error::Resource(format!("KV3 f32 read out of bounds at {pos}")))
}

fn read_f64(data: &[u8], pos: usize) -> Result<f64> {
    data.get(pos..pos + 8)
        .map(|b| f64::from_le_bytes(b.try_into().unwrap()))
        .ok_or_else(|| Source2Error::Resource(format!("KV3 f64 read out of bounds at {pos}")))
}

fn align(pos: &mut usize, alignment: usize) {
    let rem = *pos % alignment;
    if rem != 0 {
        *pos += alignment - rem;
    }
}

/// Split a KV3 data buffer into its 1/2/4/8-byte value segments. `start` is the
/// absolute byte offset the segments begin at: the 2/4/8-byte alignment padding
/// is computed against this absolute position (in v5 the object-length table
/// precedes the segments, and its size is not 8-aligned), so callers must pass
/// the real offset rather than pre-slicing.
fn split_segment(
    raw: &[u8],
    start: usize,
    count_bytes1: usize,
    count_bytes2: usize,
    count_bytes4: usize,
    count_bytes8: usize,
    align_empty_8: bool,
) -> Result<(Segment, usize)> {
    let mut pos = start;
    let bytes1 = raw
        .get(pos..pos + count_bytes1)
        .ok_or_else(|| Source2Error::Resource("KV3 bytes1 segment out of bounds".into()))?
        .to_vec();
    pos += count_bytes1;

    align(&mut pos, 2);
    let bytes2_len = count_bytes2 * 2;
    let bytes2 = raw
        .get(pos..pos + bytes2_len)
        .ok_or_else(|| Source2Error::Resource("KV3 bytes2 segment out of bounds".into()))?
        .to_vec();
    pos += bytes2_len;

    align(&mut pos, 4);
    let bytes4_len = count_bytes4 * 4;
    let bytes4 = raw
        .get(pos..pos + bytes4_len)
        .ok_or_else(|| Source2Error::Resource("KV3 bytes4 segment out of bounds".into()))?
        .to_vec();
    pos += bytes4_len;

    if count_bytes8 > 0 || align_empty_8 {
        align(&mut pos, 8);
    }
    let bytes8_len = count_bytes8 * 8;
    let bytes8 = raw
        .get(pos..pos + bytes8_len)
        .ok_or_else(|| Source2Error::Resource("KV3 bytes8 segment out of bounds".into()))?
        .to_vec();
    pos += bytes8_len;

    Ok((
        Segment {
            bytes1,
            bytes2,
            bytes4,
            bytes8,
            pos1: 0,
            pos2: 0,
            pos4: 0,
            pos8: 0,
        },
        pos,
    ))
}

fn read_null_string(bytes: &[u8], pos: &mut usize) -> Result<String> {
    let start = *pos;
    while *pos < bytes.len() && bytes[*pos] != 0 {
        *pos += 1;
    }
    let end = *pos;
    if *pos < bytes.len() {
        *pos += 1;
    }
    Ok(String::from_utf8_lossy(&bytes[start..end]).to_string())
}

fn decompress_lz4(input: &[u8], output_len: usize) -> Result<Vec<u8>> {
    let mut output = vec![0u8; output_len];
    decompress_into(input, &mut output)
        .map_err(|e| Source2Error::Decode(format!("KV3 LZ4 decode failed: {e}")))?;
    Ok(output)
}

fn decompress_zstd(input: &[u8], output_len: usize) -> Result<Vec<u8>> {
    zstd::bulk::decompress(input, output_len)
        .map_err(|e| Source2Error::Decode(format!("KV3 ZSTD decode failed: {e}")))
}

fn read_type(context: &mut KvContext) -> Result<NodeType> {
    let mut data_byte = *context
        .types
        .get(context.type_pos)
        .ok_or_else(|| Source2Error::Resource("KV3 type out of bounds".into()))?;
    context.type_pos += 1;

    if context.version >= 3 {
        if data_byte & 0x80 != 0 {
            data_byte &= 0x3f;
            context.type_pos += 1;
        }
    } else if data_byte & 0x80 != 0 {
        data_byte &= 0x7f;
        context.type_pos += 1;
    }

    match data_byte {
        1 => Ok(NodeType::Null),
        2 => Ok(NodeType::Boolean),
        3 => Ok(NodeType::Int64),
        4 => Ok(NodeType::UInt64),
        5 => Ok(NodeType::Double),
        6 => Ok(NodeType::String),
        7 => Ok(NodeType::BinaryBlob),
        8 => Ok(NodeType::Array),
        9 => Ok(NodeType::Object),
        10 => Ok(NodeType::ArrayTyped),
        11 => Ok(NodeType::Int32),
        12 => Ok(NodeType::UInt32),
        13 => Ok(NodeType::BooleanTrue),
        14 => Ok(NodeType::BooleanFalse),
        15 => Ok(NodeType::Int64Zero),
        16 => Ok(NodeType::Int64One),
        17 => Ok(NodeType::DoubleZero),
        18 => Ok(NodeType::DoubleOne),
        19 => Ok(NodeType::Float),
        20 => Ok(NodeType::Int16),
        21 => Ok(NodeType::UInt16),
        23 => Ok(NodeType::Int32AsByte),
        24 => Ok(NodeType::ArrayTypeByteLength),
        25 => Ok(NodeType::ArrayTypeAuxiliaryBuffer),
        other => Err(Source2Error::UnsupportedFormat(format!(
            "unsupported KV3 node type {other}"
        ))),
    }
}

fn string_by_id(context: &KvContext, id: i32) -> Result<String> {
    if id == -1 {
        return Ok(String::new());
    }
    let index = usize::try_from(id)
        .map_err(|_| Source2Error::Resource(format!("negative KV3 string id {id}")))?;
    context
        .strings
        .get(index)
        .cloned()
        .ok_or_else(|| Source2Error::Resource(format!("KV3 string id {id} out of bounds")))
}

fn read_object_len(context: &mut KvContext) -> Result<usize> {
    if context.version >= 5 {
        let len = read_i32(&context.object_lengths, context.object_pos)?;
        context.object_pos += 4;
        usize::try_from(len)
            .map_err(|_| Source2Error::Resource(format!("negative KV3 object length {len}")))
    } else {
        let len = context.buffer.read_i32()?;
        usize::try_from(len)
            .map_err(|_| Source2Error::Resource(format!("negative KV3 object length {len}")))
    }
}

fn read_value(context: &mut KvContext, node_type: NodeType) -> Result<KvValue> {
    match node_type {
        NodeType::Null => Ok(KvValue::Null),
        NodeType::BooleanTrue => Ok(KvValue::Bool(true)),
        NodeType::BooleanFalse => Ok(KvValue::Bool(false)),
        NodeType::Int64Zero => Ok(KvValue::Int(0)),
        NodeType::Int64One => Ok(KvValue::Int(1)),
        NodeType::DoubleZero => Ok(KvValue::Float(0.0)),
        NodeType::DoubleOne => Ok(KvValue::Float(1.0)),
        NodeType::Boolean => Ok(KvValue::Bool(context.buffer.read_u8()? == 1)),
        NodeType::Int32AsByte => Ok(KvValue::Int(i64::from(context.buffer.read_u8()?))),
        NodeType::Int16 => Ok(KvValue::Int(i64::from(context.buffer.read_i16()?))),
        NodeType::UInt16 => Ok(KvValue::UInt(u64::from(context.buffer.read_u16()?))),
        NodeType::Int32 => Ok(KvValue::Int(i64::from(context.buffer.read_i32()?))),
        NodeType::UInt32 => Ok(KvValue::UInt(u64::from(context.buffer.read_u32()?))),
        NodeType::Float => Ok(KvValue::Float(f64::from(context.buffer.read_f32()?))),
        NodeType::Int64 => Ok(KvValue::Int(context.buffer.read_i64()?)),
        NodeType::UInt64 => Ok(KvValue::UInt(context.buffer.read_u64()?)),
        NodeType::Double => Ok(KvValue::Float(context.buffer.read_f64()?)),
        NodeType::String => {
            let id = context.buffer.read_i32()?;
            Ok(KvValue::String(string_by_id(context, id)?))
        }
        NodeType::BinaryBlob => {
            let len = if context.version < 2 {
                usize::try_from(context.buffer.read_i32()?)
                    .map_err(|_| Source2Error::Resource("negative KV3 binary blob length".into()))?
            } else {
                let len = read_i32(&context.binary_blob_lengths, context.binary_blob_pos)?;
                context.binary_blob_pos += 4;
                usize::try_from(len)
                    .map_err(|_| Source2Error::Resource("negative KV3 binary blob length".into()))?
            };
            let start = context.binary_pos;
            let end = start + len;
            let bytes = context
                .binary_blobs
                .get(start..end)
                .ok_or_else(|| Source2Error::Resource("KV3 binary blob out of bounds".into()))?
                .to_vec();
            context.binary_pos = end;
            Ok(KvValue::Binary(bytes))
        }
        NodeType::Array => {
            let len = usize::try_from(context.buffer.read_i32()?)
                .map_err(|_| Source2Error::Resource("negative KV3 array length".into()))?;
            read_array_items(context, len)
        }
        NodeType::ArrayTyped | NodeType::ArrayTypeByteLength => {
            let len = if matches!(node_type, NodeType::ArrayTypeByteLength) {
                usize::from(context.buffer.read_u8()?)
            } else {
                usize::try_from(context.buffer.read_i32()?)
                    .map_err(|_| Source2Error::Resource("negative KV3 array length".into()))?
            };
            let item_type = read_type(context)?;
            let mut values = Vec::with_capacity(len);
            for _ in 0..len {
                values.push(read_value(context, item_type)?);
            }
            Ok(KvValue::Array(values))
        }
        NodeType::ArrayTypeAuxiliaryBuffer => {
            let len = usize::from(context.buffer.read_u8()?);
            let item_type = read_type(context)?;
            std::mem::swap(&mut context.buffer, &mut context.auxiliary);
            let mut values = Vec::with_capacity(len);
            for _ in 0..len {
                values.push(read_value(context, item_type)?);
            }
            std::mem::swap(&mut context.buffer, &mut context.auxiliary);
            Ok(KvValue::Array(values))
        }
        NodeType::Object => read_object(context),
    }
}

fn read_array_items(context: &mut KvContext, len: usize) -> Result<KvValue> {
    let mut values = Vec::with_capacity(len);
    for _ in 0..len {
        let node_type = read_type(context)?;
        values.push(read_value(context, node_type)?);
    }
    Ok(KvValue::Array(values))
}

fn read_object(context: &mut KvContext) -> Result<KvValue> {
    let len = read_object_len(context)?;
    let mut values = BTreeMap::new();
    for _ in 0..len {
        let node_type = read_type(context)?;
        let string_id = context.buffer.read_i32()?;
        let key = string_by_id(context, string_id)?;
        values.insert(key, read_value(context, node_type)?);
    }
    Ok(KvValue::Object(values))
}

pub fn parse(data: &[u8]) -> Result<KvValue> {
    let magic = read_u32(data, 0)?;
    if magic & 0xffff_ff00 != 0x4b56_3300 {
        return Err(Source2Error::UnsupportedFormat(format!(
            "unsupported KV3 magic 0x{magic:08x}"
        )));
    }
    let version = (magic & 0xff) as u8;
    if !(1..=5).contains(&version) {
        return Err(Source2Error::UnsupportedFormat(format!(
            "unsupported KV3 version {version}"
        )));
    }

    let mut pos = 4 + 16;
    let compression_method = read_u32(data, pos)?;
    pos += 4;
    if compression_method > 2 {
        return Err(Source2Error::UnsupportedFormat(format!(
            "unsupported KV3 compression method {compression_method}"
        )));
    }

    let mut count_bytes2 = 0usize;
    let mut compression_frame_size = 0usize;
    let (
        count_bytes1,
        count_bytes4,
        count_bytes8,
        count_types,
        _count_objects,
        count_blocks,
        size_binary_blobs,
        size_compressed_total,
        size_uncompressed_buffer1,
        size_compressed_buffer1,
        size_uncompressed_buffer2,
        size_compressed_buffer2,
        count_bytes1_buffer2,
        count_bytes2_buffer2,
        count_bytes4_buffer2,
        count_bytes8_buffer2,
        count_objects_buffer2,
    ) = if version == 1 {
        let count_bytes1 = read_i32(data, pos)? as usize;
        let count_bytes4 = read_i32(data, pos + 4)? as usize;
        let count_bytes8 = read_i32(data, pos + 8)? as usize;
        let size_uncompressed = read_i32(data, pos + 12)? as usize;
        pos += 16;
        (
            count_bytes1,
            count_bytes4,
            count_bytes8,
            0usize,
            0usize,
            0usize,
            0usize,
            data.len().saturating_sub(pos),
            size_uncompressed,
            data.len().saturating_sub(pos),
            0usize,
            0usize,
            0usize,
            0usize,
            0usize,
            0usize,
            0usize,
        )
    } else {
        let _compression_dictionary_id = read_u16(data, pos)?;
        compression_frame_size = usize::from(read_u16(data, pos + 2)?);
        pos += 4;
        let count_bytes1 = read_i32(data, pos)? as usize;
        let count_bytes4 = read_i32(data, pos + 4)? as usize;
        let count_bytes8 = read_i32(data, pos + 8)? as usize;
        let count_types = read_i32(data, pos + 12)? as usize;
        let count_objects = usize::from(read_u16(data, pos + 16)?);
        let _count_arrays = read_u16(data, pos + 18)?;
        let size_uncompressed_total = read_i32(data, pos + 20)? as usize;
        let size_compressed_total = read_i32(data, pos + 24)? as usize;
        let count_blocks = read_i32(data, pos + 28)? as usize;
        let size_binary_blobs = read_i32(data, pos + 32)? as usize;
        pos += 36;

        if version >= 4 {
            count_bytes2 = read_i32(data, pos)? as usize;
            pos += 8; // count bytes2 + block compressed sizes bytes
        }

        if version >= 5 {
            let size_uncompressed_buffer1 = read_i32(data, pos)? as usize;
            let size_compressed_buffer1 = read_i32(data, pos + 4)? as usize;
            let size_uncompressed_buffer2 = read_i32(data, pos + 8)? as usize;
            let size_compressed_buffer2 = read_i32(data, pos + 12)? as usize;
            let count_bytes1_buffer2 = read_i32(data, pos + 16)? as usize;
            let count_bytes2_buffer2 = read_i32(data, pos + 20)? as usize;
            let count_bytes4_buffer2 = read_i32(data, pos + 24)? as usize;
            let count_bytes8_buffer2 = read_i32(data, pos + 28)? as usize;
            let count_objects_buffer2 = read_i32(data, pos + 36)? as usize;
            pos += 48;
            (
                count_bytes1,
                count_bytes4,
                count_bytes8,
                count_types,
                count_objects,
                count_blocks,
                size_binary_blobs,
                size_compressed_total,
                size_uncompressed_buffer1,
                size_compressed_buffer1,
                size_uncompressed_buffer2,
                size_compressed_buffer2,
                count_bytes1_buffer2,
                count_bytes2_buffer2,
                count_bytes4_buffer2,
                count_bytes8_buffer2,
                count_objects_buffer2,
            )
        } else {
            (
                count_bytes1,
                count_bytes4,
                count_bytes8,
                count_types,
                count_objects,
                count_blocks,
                size_binary_blobs,
                size_compressed_total,
                size_uncompressed_total,
                size_compressed_total,
                0usize,
                0usize,
                0usize,
                0usize,
                0usize,
                0usize,
                0usize,
            )
        }
    };

    let zstd_buffer1_output_len = if version < 5 && compression_method == 2 {
        size_uncompressed_buffer1 + size_binary_blobs
    } else {
        size_uncompressed_buffer1
    };
    let decompressed_buffer1 = match compression_method {
        0 => data
            .get(pos..pos + size_uncompressed_buffer1)
            .ok_or_else(|| Source2Error::Resource("KV3 buffer1 out of bounds".into()))?
            .to_vec(),
        1 => {
            let compressed = data
                .get(pos..pos + size_compressed_buffer1)
                .ok_or_else(|| {
                    Source2Error::Resource("KV3 compressed buffer1 out of bounds".into())
                })?;
            decompress_lz4(compressed, size_uncompressed_buffer1)?
        }
        2 => {
            let compressed = data
                .get(pos..pos + size_compressed_buffer1)
                .ok_or_else(|| {
                    Source2Error::Resource("KV3 compressed buffer1 out of bounds".into())
                })?;
            decompress_zstd(compressed, zstd_buffer1_output_len)?
        }
        _ => unreachable!(),
    };
    let buffer1 = decompressed_buffer1
        .get(..size_uncompressed_buffer1)
        .ok_or_else(|| Source2Error::Resource("KV3 buffer1 slice out of bounds".into()))?
        .to_vec();
    pos += if compression_method == 0 && version >= 5 {
        size_uncompressed_buffer1
    } else {
        size_compressed_buffer1
    };

    let (mut segment1, segment1_offset) = split_segment(
        &buffer1,
        0,
        count_bytes1,
        count_bytes2,
        count_bytes4,
        count_bytes8,
        version < 5,
    )?;
    let string_count = segment1.read_i32()? as usize;
    let mut strings = Vec::with_capacity(string_count);

    let types: Vec<u8>;
    let mut object_lengths = Vec::new();
    let buffer: Segment;
    let mut auxiliary = Segment::empty();
    let mut binary_blob_lengths = Vec::new();
    let mut blob_block_sizes = Vec::<usize>::new();

    if version >= 5 {
        for _ in 0..string_count {
            strings.push(read_null_string(&segment1.bytes1, &mut segment1.pos1)?);
        }
        auxiliary = segment1;

        let buffer2 = match compression_method {
            0 => data
                .get(pos..pos + size_uncompressed_buffer2)
                .ok_or_else(|| Source2Error::Resource("KV3 buffer2 out of bounds".into()))?
                .to_vec(),
            1 => {
                let compressed = data
                    .get(pos..pos + size_compressed_buffer2)
                    .ok_or_else(|| {
                        Source2Error::Resource("KV3 compressed buffer2 out of bounds".into())
                    })?;
                decompress_lz4(compressed, size_uncompressed_buffer2)?
            }
            2 => {
                let compressed = data
                    .get(pos..pos + size_compressed_buffer2)
                    .ok_or_else(|| {
                        Source2Error::Resource("KV3 compressed buffer2 out of bounds".into())
                    })?;
                decompress_zstd(compressed, size_uncompressed_buffer2)?
            }
            _ => unreachable!(),
        };
        pos += if compression_method == 0 {
            size_uncompressed_buffer2
        } else {
            size_compressed_buffer2
        };

        let object_len_bytes = count_objects_buffer2 * 4;
        object_lengths = buffer2
            .get(..object_len_bytes)
            .ok_or_else(|| Source2Error::Resource("KV3 object lengths out of bounds".into()))?
            .to_vec();
        let (segment2, segment2_offset) = split_segment(
            &buffer2,
            object_len_bytes,
            count_bytes1_buffer2,
            count_bytes2_buffer2,
            count_bytes4_buffer2,
            count_bytes8_buffer2,
            false,
        )?;
        let type_start = segment2_offset;
        types = buffer2
            .get(type_start..type_start + count_types)
            .ok_or_else(|| Source2Error::Resource("KV3 types out of bounds".into()))?
            .to_vec();
        let after_types = type_start + count_types;
        if count_blocks > 0 {
            let lengths_size = count_blocks * 4;
            binary_blob_lengths = buffer2
                .get(after_types..after_types + lengths_size)
                .ok_or_else(|| {
                    Source2Error::Resource("KV3 binary blob lengths out of bounds".into())
                })?
                .to_vec();
            let trailer_pos = after_types + lengths_size;
            if let Ok(trailer) = read_u32(&buffer2, trailer_pos)
                && trailer != 0xffee_dd00
            {
                return Err(Source2Error::Resource(format!(
                    "bad KV3 trailer 0x{trailer:08x}"
                )));
            }
            let mut size_pos = trailer_pos + 4;
            while size_pos + 2 <= buffer2.len() {
                blob_block_sizes.push(usize::from(read_u16(&buffer2, size_pos)?));
                size_pos += 2;
            }
        }
        buffer = segment2;
    } else {
        let mut string_pos = segment1_offset;
        for _ in 0..string_count {
            strings.push(read_null_string(&buffer1, &mut string_pos)?);
        }
        let types_len = if version == 1 {
            buffer1.len().saturating_sub(string_pos + 4)
        } else {
            count_types.saturating_sub(string_pos - segment1_offset)
        };
        types = buffer1
            .get(string_pos..string_pos + types_len)
            .ok_or_else(|| Source2Error::Resource("KV3 types out of bounds".into()))?
            .to_vec();
        let after_types = string_pos + types_len;
        if count_blocks > 0 {
            let lengths_size = count_blocks * 4;
            binary_blob_lengths = buffer1
                .get(after_types..after_types + lengths_size)
                .ok_or_else(|| {
                    Source2Error::Resource("KV3 binary blob lengths out of bounds".into())
                })?
                .to_vec();
            let trailer_pos = after_types + lengths_size;
            if let Ok(trailer) = read_u32(&buffer1, trailer_pos)
                && trailer != 0xffee_dd00
            {
                return Err(Source2Error::Resource(format!(
                    "bad KV3 trailer 0x{trailer:08x}"
                )));
            }
            let mut size_pos = trailer_pos + 4;
            while size_pos + 2 <= buffer1.len() {
                blob_block_sizes.push(usize::from(read_u16(&buffer1, size_pos)?));
                size_pos += 2;
            }
        }
        buffer = segment1;
    }

    let mut binary_blobs = Vec::new();
    if count_blocks > 0 {
        if size_binary_blobs > 0 {
            binary_blobs = match compression_method {
                0 => data
                    .get(pos..pos + size_binary_blobs)
                    .ok_or_else(|| Source2Error::Resource("KV3 binary blobs out of bounds".into()))?
                    .to_vec(),
                1 => {
                    let mut out = Vec::with_capacity(size_binary_blobs);
                    let mut source_pos = pos;
                    for block_size in blob_block_sizes {
                        let remaining = size_binary_blobs.saturating_sub(out.len());
                        if remaining == 0 {
                            break;
                        }
                        let frame_size = if compression_frame_size == 0 {
                            remaining
                        } else {
                            compression_frame_size.min(remaining)
                        };
                        let source =
                            data.get(source_pos..source_pos + block_size)
                                .ok_or_else(|| {
                                    Source2Error::Resource(
                                        "KV3 compressed binary blob out of bounds".into(),
                                    )
                                })?;
                        out.extend(decompress_lz4(source, frame_size)?);
                        source_pos += block_size;
                    }
                    out
                }
                2 if version < 5 => decompressed_buffer1
                    .get(size_uncompressed_buffer1..size_uncompressed_buffer1 + size_binary_blobs)
                    .ok_or_else(|| {
                        Source2Error::Resource("KV3 ZSTD binary blob slice out of bounds".into())
                    })?
                    .to_vec(),
                2 => {
                    let compressed_size =
                        size_compressed_total - size_compressed_buffer1 - size_compressed_buffer2;
                    let compressed = data.get(pos..pos + compressed_size).ok_or_else(|| {
                        Source2Error::Resource("KV3 compressed binary blobs out of bounds".into())
                    })?;
                    decompress_zstd(compressed, size_binary_blobs)?
                }
                _ => unreachable!(),
            };
        }
    }

    let mut context = KvContext {
        version,
        strings,
        types,
        type_pos: 0,
        object_lengths,
        object_pos: 0,
        binary_blob_lengths,
        binary_blob_pos: 0,
        binary_blobs,
        binary_pos: 0,
        buffer,
        auxiliary,
    };

    let root_type = read_type(&mut context)?;
    read_value(&mut context, root_type)
}
