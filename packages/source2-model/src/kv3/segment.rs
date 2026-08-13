use super::*;
use crate::error::{Result, Source2Error};

#[derive(Debug, Clone)]
pub(crate) struct Segment {
    pub(crate) bytes1: Vec<u8>,
    pub(crate) bytes2: Vec<u8>,
    pub(crate) bytes4: Vec<u8>,
    pub(crate) bytes8: Vec<u8>,
    pub(crate) pos1: usize,
    pub(crate) pos2: usize,
    pub(crate) pos4: usize,
    pub(crate) pos8: usize,
}

impl Segment {
    pub(crate) fn empty() -> Self {
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

    pub(crate) fn read_u8(&mut self) -> Result<u8> {
        let value = *self
            .bytes1
            .get(self.pos1)
            .ok_or_else(|| Source2Error::Resource("KV3 bytes1 out of bounds".into()))?;
        self.pos1 += 1;
        Ok(value)
    }

    pub(crate) fn read_i16(&mut self) -> Result<i16> {
        let value = read_i16(&self.bytes2, self.pos2)?;
        self.pos2 += 2;
        Ok(value)
    }

    pub(crate) fn read_u16(&mut self) -> Result<u16> {
        let value = read_u16(&self.bytes2, self.pos2)?;
        self.pos2 += 2;
        Ok(value)
    }

    pub(crate) fn read_i32(&mut self) -> Result<i32> {
        let value = read_i32(&self.bytes4, self.pos4)?;
        self.pos4 += 4;
        Ok(value)
    }

    pub(crate) fn read_u32(&mut self) -> Result<u32> {
        let value = read_u32(&self.bytes4, self.pos4)?;
        self.pos4 += 4;
        Ok(value)
    }

    pub(crate) fn read_f32(&mut self) -> Result<f32> {
        let value = read_f32(&self.bytes4, self.pos4)?;
        self.pos4 += 4;
        Ok(value)
    }

    pub(crate) fn read_i64(&mut self) -> Result<i64> {
        let value = read_i64(&self.bytes8, self.pos8)?;
        self.pos8 += 8;
        Ok(value)
    }

    pub(crate) fn read_u64(&mut self) -> Result<u64> {
        let value = read_u64(&self.bytes8, self.pos8)?;
        self.pos8 += 8;
        Ok(value)
    }

    pub(crate) fn read_f64(&mut self) -> Result<f64> {
        let value = read_f64(&self.bytes8, self.pos8)?;
        self.pos8 += 8;
        Ok(value)
    }
}

pub(crate) struct KvContext {
    pub(crate) version: u8,
    pub(crate) strings: Vec<String>,
    pub(crate) types: Vec<u8>,
    pub(crate) type_pos: usize,
    pub(crate) object_lengths: Vec<u8>,
    pub(crate) object_pos: usize,
    pub(crate) binary_blob_lengths: Vec<u8>,
    pub(crate) binary_blob_pos: usize,
    pub(crate) binary_blobs: Vec<u8>,
    pub(crate) binary_pos: usize,
    pub(crate) buffer: Segment,
    pub(crate) auxiliary: Segment,
}

#[derive(Copy, Clone)]
pub(crate) enum NodeType {
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
