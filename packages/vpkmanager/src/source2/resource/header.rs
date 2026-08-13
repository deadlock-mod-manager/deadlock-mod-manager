//! Source 2 resource container parser. Layout reproduced verbatim from VRF's
//! `Resource.Read(Stream)`:
//!
//! ```text
//! u32  file_size                 // 0 means "use stream length"
//! u16  header_version            // must be 12
//! u16  resource_version
//! u32  block_offset              // bytes from this field to start of block table
//! u32  block_count
//! [block_offset - 8 bytes of padding]
//! [block_count] {
//!   u32 block_type               // 4 ASCII chars, little-endian (DATA, RERL, REDI, NTRO)
//!   u32 data_offset              // bytes from this field to the block's data
//!   u32 data_size
//! }
//! ```

use byteorder::{ByteOrder, LittleEndian};

use crate::source2::error::DecodeError;

const KNOWN_HEADER_VERSION: u16 = 12;

#[derive(Debug, Clone, Copy)]
pub struct Block {
    pub kind: [u8; 4],
    /// Absolute byte offset within the resource file.
    pub offset: u32,
    pub size: u32,
}

pub struct Resource<'a> {
    bytes: &'a [u8],
    blocks: Vec<Block>,
}

impl<'a> Resource<'a> {
    pub fn parse(bytes: &'a [u8]) -> Result<Self, DecodeError> {
        let mut pos: usize = 0;
        let _file_size = read_u32(bytes, &mut pos)?;
        let header_version = read_u16(bytes, &mut pos)?;
        if header_version != KNOWN_HEADER_VERSION {
            return Err(DecodeError::BadResource("unexpected header version"));
        }
        let _version = read_u16(bytes, &mut pos)?;

        let block_offset_field_pos = pos;
        let block_offset = read_u32(bytes, &mut pos)?;
        let block_count = read_u32(bytes, &mut pos)?;

        let block_table_start = block_offset_field_pos
            .checked_add(block_offset as usize)
            .ok_or(DecodeError::BadResource("block_offset overflow"))?;

        let mut cursor = block_table_start;
        let mut blocks = Vec::with_capacity(block_count as usize);
        for _ in 0..block_count {
            let kind = read_bytes::<4>(bytes, &mut cursor)?;
            let offset_field_pos = cursor;
            let rel_offset = read_u32(bytes, &mut cursor)?;
            let size = read_u32(bytes, &mut cursor)?;
            let abs_offset = u32::try_from(offset_field_pos)
                .map_err(|_| DecodeError::BadResource("offset_field_pos > u32"))?
                .checked_add(rel_offset)
                .ok_or(DecodeError::BadResource("block offset overflow"))?;
            blocks.push(Block {
                kind,
                offset: abs_offset,
                size,
            });
        }
        Ok(Self { bytes, blocks })
    }

    #[must_use]
    pub fn raw(&self) -> &'a [u8] {
        self.bytes
    }

    #[allow(dead_code)] // surfaced when a caller needs RERL/REDI inspection
    #[must_use]
    pub fn blocks(&self) -> &[Block] {
        &self.blocks
    }

    #[must_use]
    pub fn find_block(&self, kind: [u8; 4]) -> Option<&'a [u8]> {
        let b = self.blocks.iter().find(|b| b.kind == kind)?;
        let start = b.offset as usize;
        let end = start.checked_add(b.size as usize)?;
        if end > self.bytes.len() {
            return None;
        }
        Some(&self.bytes[start..end])
    }

    #[must_use]
    pub fn find_block_meta(&self, kind: [u8; 4]) -> Option<Block> {
        self.blocks.iter().find(|b| b.kind == kind).copied()
    }

    /// Returns the bytes of the block at global declaration index `n`. Source 2
    /// model control data references mesh/buffer blocks by this index
    /// (`m_nDataBlock`, `m_nBlockIndex`), not by FOURCC, so the model decoder
    /// resolves them positionally.
    #[must_use]
    pub fn get_block_by_index(&self, n: usize) -> Option<&'a [u8]> {
        let b = self.blocks.get(n)?;
        let start = b.offset as usize;
        let end = start.checked_add(b.size as usize)?;
        if end > self.bytes.len() {
            return None;
        }
        Some(&self.bytes[start..end])
    }
}

fn read_u16(bytes: &[u8], pos: &mut usize) -> Result<u16, DecodeError> {
    let needed = 2;
    let end = pos.checked_add(needed).ok_or(DecodeError::Truncated {
        offset: *pos as u64,
        needed,
        had: bytes.len().saturating_sub(*pos),
    })?;
    if end > bytes.len() {
        return Err(DecodeError::Truncated {
            offset: *pos as u64,
            needed,
            had: bytes.len().saturating_sub(*pos),
        });
    }
    let v = LittleEndian::read_u16(&bytes[*pos..end]);
    *pos = end;
    Ok(v)
}

fn read_u32(bytes: &[u8], pos: &mut usize) -> Result<u32, DecodeError> {
    let needed = 4;
    let end = pos.checked_add(needed).ok_or(DecodeError::Truncated {
        offset: *pos as u64,
        needed,
        had: bytes.len().saturating_sub(*pos),
    })?;
    if end > bytes.len() {
        return Err(DecodeError::Truncated {
            offset: *pos as u64,
            needed,
            had: bytes.len().saturating_sub(*pos),
        });
    }
    let v = LittleEndian::read_u32(&bytes[*pos..end]);
    *pos = end;
    Ok(v)
}

fn read_bytes<const N: usize>(bytes: &[u8], pos: &mut usize) -> Result<[u8; N], DecodeError> {
    let end = pos.checked_add(N).ok_or(DecodeError::Truncated {
        offset: *pos as u64,
        needed: N,
        had: bytes.len().saturating_sub(*pos),
    })?;
    if end > bytes.len() {
        return Err(DecodeError::Truncated {
            offset: *pos as u64,
            needed: N,
            had: bytes.len().saturating_sub(*pos),
        });
    }
    let mut out = [0u8; N];
    out.copy_from_slice(&bytes[*pos..end]);
    *pos = end;
    Ok(out)
}
