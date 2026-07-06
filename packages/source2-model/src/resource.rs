use crate::error::{Result, Source2Error};

/// One block entry in a compiled Source 2 resource (DATA, RERL, NTRO, ...).
#[derive(Debug, Clone)]
pub struct ResourceBlock {
    pub name: String,
    pub offset: usize,
    pub size: usize,
}

/// The block table of a compiled Source 2 resource file (`*_c`). Owns the raw
/// bytes so callers can slice individual blocks.
#[derive(Debug)]
pub struct Resource {
    pub data: Vec<u8>,
    pub blocks: Vec<ResourceBlock>,
}

fn read_u16(data: &[u8], pos: usize) -> Result<u16> {
    data.get(pos..pos + 2)
        .map(|b| u16::from_le_bytes(b.try_into().unwrap()))
        .ok_or_else(|| Source2Error::Resource(format!("u16 read out of bounds at {pos}")))
}

fn read_u32(data: &[u8], pos: usize) -> Result<u32> {
    data.get(pos..pos + 4)
        .map(|b| u32::from_le_bytes(b.try_into().unwrap()))
        .ok_or_else(|| Source2Error::Resource(format!("u32 read out of bounds at {pos}")))
}

impl Resource {
    /// Parse the resource header + block table.
    ///
    /// Header: `fileSize u32`, `headerVersion u16` (12), `version u16`,
    /// `blockOffset u32`, `blockCount u32`. Block table starts at
    /// `8 + blockOffset`. Each 12-byte block entry is `type [u8;4]`,
    /// `offset u32` (relative to the offset field), `size u32`.
    pub fn parse(data: Vec<u8>) -> Result<Self> {
        if data.len() < 16 {
            return Err(Source2Error::Resource("file too small".into()));
        }

        let header_version = read_u16(&data, 4)?;
        if header_version != 12 {
            return Err(Source2Error::Resource(format!(
                "unexpected header version {header_version}"
            )));
        }

        let block_offset = read_u32(&data, 8)? as usize;
        let block_count = read_u32(&data, 12)? as usize;

        let blocks_start = 8 + block_offset;
        let mut blocks = Vec::with_capacity(block_count);
        let mut pos = blocks_start;
        for _ in 0..block_count {
            let name_bytes = data
                .get(pos..pos + 4)
                .ok_or_else(|| Source2Error::Resource("block name out of bounds".into()))?;
            let name = String::from_utf8_lossy(name_bytes).trim().to_string();
            let offset_field = pos + 4;
            let rel = read_u32(&data, offset_field)? as usize;
            let size = read_u32(&data, pos + 8)? as usize;
            blocks.push(ResourceBlock {
                name,
                offset: offset_field + rel,
                size,
            });
            pos += 12;
        }

        Ok(Self { data, blocks })
    }

    pub fn block(&self, name: &str) -> Option<&ResourceBlock> {
        self.blocks.iter().find(|b| b.name == name)
    }

    pub fn block_bytes(&self, name: &str) -> Option<&[u8]> {
        self.block(name)
            .and_then(|b| self.data.get(b.offset..b.offset + b.size))
    }
}
