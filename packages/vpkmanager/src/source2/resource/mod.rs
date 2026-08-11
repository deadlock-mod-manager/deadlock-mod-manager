//! Source 2 resource container: header + block table.
//!
//! See [`header`] for the binary layout. We only need DATA for texture
//! inspect; RERL/REDI/NTRO are skipped over by ignoring those block entries.

mod header;

pub use header::{Block, Resource};

use crate::source2::error::DecodeError;

pub const BLOCK_TYPE_DATA: [u8; 4] = *b"DATA";

/// Resource header length in bytes: a u32 file size, two u16 versions, then a
/// u32 block-table offset and a u32 block count.
const HEADER_LEN: usize = 16;

impl<'a> Resource<'a> {
    pub fn data_block(&self) -> Result<&'a [u8], DecodeError> {
        self.find_block(BLOCK_TYPE_DATA)
            .ok_or(DecodeError::MissingDataBlock)
    }

    pub fn data_block_meta(&self) -> Result<Block, DecodeError> {
        self.find_block_meta(BLOCK_TYPE_DATA)
            .ok_or(DecodeError::MissingDataBlock)
    }

    /// Rebuild the resource container with the `DATA` block replaced by
    /// `new_data`, keeping every other block (e.g. `RED2` edit/dependency info)
    /// byte-for-byte. The block table is recomputed because the new `DATA` may
    /// differ in size from the original.
    pub fn rebuild_with_data(&self, new_data: &[u8]) -> Result<Vec<u8>, DecodeError> {
        let idx = self
            .blocks()
            .iter()
            .position(|b| b.kind == BLOCK_TYPE_DATA)
            .ok_or(DecodeError::MissingDataBlock)?;
        self.rebuild_with_block(idx, new_data)
    }

    /// Rebuild the resource container with the block at declaration index
    /// `block_index` replaced by `new_payload`, every other block copied
    /// byte-for-byte. Unlike [`Resource::rebuild_with_data`] this targets a block
    /// positionally, which is what model geometry edits need: a model has several
    /// `MVTX` blocks (one per mesh part) sharing a FOURCC, addressed by the index
    /// the `CTRL` buffer registry stores (`m_nBlockIndex`).
    ///
    /// Block order and count are preserved, so block indices (and the `CTRL`
    /// references to them) stay valid across the rebuild; only sizes/offsets
    /// change. Blocks are laid out in their original order, each 16-byte aligned
    /// (the alignment Valve's own files use). Block offsets in the table are what
    /// the engine reads, so the alignment choice itself is not load-bearing.
    pub fn rebuild_with_block(
        &self,
        block_index: usize,
        new_payload: &[u8],
    ) -> Result<Vec<u8>, DecodeError> {
        let raw = self.raw();
        let blocks = self.blocks();
        let block_count = blocks.len();
        if block_index >= block_count {
            return Err(DecodeError::BadResource("block index out of range"));
        }
        let resource_version = u16::from_le_bytes([raw[6], raw[7]]);

        // Resolve each block's payload bytes (the target swapped, others copied).
        let mut payloads: Vec<&[u8]> = Vec::with_capacity(block_count);
        for (i, b) in blocks.iter().enumerate() {
            if i == block_index {
                payloads.push(new_payload);
            } else {
                let start = b.offset as usize;
                let end = start
                    .checked_add(b.size as usize)
                    .ok_or(DecodeError::BadResource("block extent overflow"))?;
                let bytes = raw
                    .get(start..end)
                    .ok_or(DecodeError::BadResource("block out of range"))?;
                payloads.push(bytes);
            }
        }

        // Table sits immediately after the 16-byte header, so block_offset
        // (measured from the field at byte 8) is 8.
        let table_len = block_count * 12;
        let mut cursor = align16(HEADER_LEN + table_len);

        // First pass: absolute payload offsets.
        let mut abs_offsets = Vec::with_capacity(block_count);
        for p in &payloads {
            abs_offsets.push(cursor);
            cursor = align16(cursor + p.len());
        }
        let total_len = cursor;

        let mut out = vec![0u8; total_len];
        out[0..4].copy_from_slice(&u32::try_from(total_len).unwrap_or(0).to_le_bytes());
        out[4..6].copy_from_slice(&12u16.to_le_bytes()); // header_version
        out[6..8].copy_from_slice(&resource_version.to_le_bytes());
        out[8..12].copy_from_slice(&8u32.to_le_bytes()); // block_offset
        out[12..16].copy_from_slice(&u32::try_from(block_count).unwrap_or(0).to_le_bytes());

        for (i, b) in blocks.iter().enumerate() {
            let entry = HEADER_LEN + i * 12;
            out[entry..entry + 4].copy_from_slice(&b.kind);
            let off_field_pos = entry + 4;
            let rel = u32::try_from(abs_offsets[i] - off_field_pos)
                .map_err(|_| DecodeError::BadResource("block rel offset overflow"))?;
            out[off_field_pos..off_field_pos + 4].copy_from_slice(&rel.to_le_bytes());
            let size = u32::try_from(payloads[i].len())
                .map_err(|_| DecodeError::BadResource("block too large"))?;
            out[off_field_pos + 4..off_field_pos + 8].copy_from_slice(&size.to_le_bytes());
        }

        for (off, p) in abs_offsets.iter().zip(&payloads) {
            out[*off..*off + p.len()].copy_from_slice(p);
        }

        Ok(out)
    }
}

/// Build a new Source 2 resource container from block payloads, optionally
/// appending bytes after the aligned block payload region.
///
/// VTEX resources store their texture pixel payload outside the `DATA` block,
/// so callers can put the texture header in a `DATA` block and pass the encoded
/// pixel payload as `tail`. Blocks themselves are 16-byte aligned; `tail` begins
/// after the aligned final block payload and is not represented in the block
/// table.
pub(crate) fn build_resource_with_tail(
    blocks: &[([u8; 4], &[u8])],
    tail: &[u8],
    resource_version: u16,
) -> Result<Vec<u8>, DecodeError> {
    let block_count = blocks.len();
    let table_len = block_count
        .checked_mul(12)
        .ok_or(DecodeError::BadResource("block table length overflow"))?;
    let mut cursor = align16(
        HEADER_LEN
            .checked_add(table_len)
            .ok_or(DecodeError::BadResource("resource header length overflow"))?,
    );

    let mut offsets = Vec::with_capacity(block_count);
    for (_, payload) in blocks {
        offsets.push(cursor);
        cursor = align16(
            cursor
                .checked_add(payload.len())
                .ok_or(DecodeError::BadResource("block payload offset overflow"))?,
        );
    }
    let tail_start = cursor;
    let total_len = tail_start
        .checked_add(tail.len())
        .ok_or(DecodeError::BadResource("resource size overflow"))?;

    let total_len_u32 =
        u32::try_from(total_len).map_err(|_| DecodeError::BadResource("resource too large"))?;
    let block_count_u32 =
        u32::try_from(block_count).map_err(|_| DecodeError::BadResource("too many blocks"))?;

    let mut out = vec![0u8; total_len];
    out[0..4].copy_from_slice(&total_len_u32.to_le_bytes());
    out[4..6].copy_from_slice(&12u16.to_le_bytes());
    out[6..8].copy_from_slice(&resource_version.to_le_bytes());
    out[8..12].copy_from_slice(&8u32.to_le_bytes());
    out[12..16].copy_from_slice(&block_count_u32.to_le_bytes());

    for (i, ((kind, payload), offset)) in blocks.iter().zip(&offsets).enumerate() {
        let entry = HEADER_LEN + i * 12;
        out[entry..entry + 4].copy_from_slice(kind);
        let off_field_pos = entry + 4;
        let rel = offset
            .checked_sub(off_field_pos)
            .ok_or(DecodeError::BadResource("block relative offset underflow"))?;
        let rel = u32::try_from(rel)
            .map_err(|_| DecodeError::BadResource("block relative offset overflow"))?;
        let size = u32::try_from(payload.len())
            .map_err(|_| DecodeError::BadResource("block too large"))?;
        out[off_field_pos..off_field_pos + 4].copy_from_slice(&rel.to_le_bytes());
        out[off_field_pos + 4..off_field_pos + 8].copy_from_slice(&size.to_le_bytes());
        out[*offset..*offset + payload.len()].copy_from_slice(payload);
    }
    out[tail_start..tail_start + tail.len()].copy_from_slice(tail);

    Ok(out)
}

fn align16(n: usize) -> usize {
    (n + 15) & !15
}

#[cfg(test)]
mod tests {
    // Test scaffolding builds a small container by hand; the small known sizes
    // make the usize -> u32 field casts safe.
    #![allow(clippy::cast_possible_truncation)]

    use super::*;

    /// Builds a minimal but valid resource container (header + block table +
    /// 16-byte-aligned payloads) that [`Resource::parse`] accepts.
    fn build_resource(blocks: &[([u8; 4], &[u8])]) -> Vec<u8> {
        let table_len = blocks.len() * 12;
        let mut cursor = align16(HEADER_LEN + table_len);
        let mut offsets = Vec::with_capacity(blocks.len());
        for (_, p) in blocks {
            offsets.push(cursor);
            cursor = align16(cursor + p.len());
        }
        let total = cursor;

        let mut out = vec![0u8; total];
        out[0..4].copy_from_slice(&(total as u32).to_le_bytes());
        out[4..6].copy_from_slice(&12u16.to_le_bytes());
        out[6..8].copy_from_slice(&0u16.to_le_bytes());
        out[8..12].copy_from_slice(&8u32.to_le_bytes());
        out[12..16].copy_from_slice(&(blocks.len() as u32).to_le_bytes());
        for (i, (kind, p)) in blocks.iter().enumerate() {
            let entry = HEADER_LEN + i * 12;
            out[entry..entry + 4].copy_from_slice(kind);
            let off_field = entry + 4;
            out[off_field..off_field + 4]
                .copy_from_slice(&((offsets[i] - off_field) as u32).to_le_bytes());
            out[off_field + 4..off_field + 8].copy_from_slice(&(p.len() as u32).to_le_bytes());
            out[offsets[i]..offsets[i] + p.len()].copy_from_slice(p);
        }
        out
    }

    #[test]
    fn rebuild_with_block_swaps_one_and_preserves_others() {
        // Three blocks; swap the middle one for differently-sized bytes.
        let bytes = build_resource(&[
            (*b"AAAA", &[1u8, 2, 3, 4]),
            (*b"MVTX", &[9u8; 8]),
            (*b"CCCC", &[7u8, 7, 7]),
        ]);
        let res = Resource::parse(&bytes).expect("parse synthetic");

        let new_mid = vec![0xABu8; 40]; // larger than the original 8 bytes
        let rebuilt = res.rebuild_with_block(1, &new_mid).expect("rebuild");

        let res2 = Resource::parse(&rebuilt).expect("reparse rebuilt");
        assert_eq!(res2.blocks().len(), 3, "block count preserved");
        // Kinds and order preserved.
        assert_eq!(&res2.blocks()[0].kind, b"AAAA");
        assert_eq!(&res2.blocks()[1].kind, b"MVTX");
        assert_eq!(&res2.blocks()[2].kind, b"CCCC");
        // The swapped block reads back as the new payload; neighbours untouched.
        assert_eq!(res2.get_block_by_index(0).unwrap(), &[1u8, 2, 3, 4]);
        assert_eq!(res2.get_block_by_index(1).unwrap(), new_mid.as_slice());
        assert_eq!(res2.get_block_by_index(2).unwrap(), &[7u8, 7, 7]);
    }

    #[test]
    fn rebuild_with_block_rejects_out_of_range() {
        let bytes = build_resource(&[(*b"DATA", &[0u8; 4])]);
        let res = Resource::parse(&bytes).expect("parse");
        assert!(res.rebuild_with_block(5, &[0u8; 4]).is_err());
    }
}
