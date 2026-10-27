use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;

use crate::{ToolError, hash, read};

pub const EDITOR_SHA256: &str = "c4441216bebf56f53af29065f371cf3b088a3a138a5394262dcbdb11a003b7fc";
pub const ANIMATION_SYSTEM_SHA256: &str =
    "01efc8fcdc1fe9691164f73db5e93dee806999d498a7be9a6366d1a582441d21";
pub const PATCHED_EDITOR_SHA256: &str =
    "b6ab77ae4dc5dd7ebc5fd20fb5072de3526e6948cedae9c217be2ea3bea7e33e";

const PATCH_RVA: usize = 0x1f18e1;
const STUB_RVA: usize = 0x1eba000;
const PRIMARY_FUNCTION: [u32; 3] = [0x1f1800, 0x1f199c, 0x15dff7c];
const PRIMARY_UNWIND: &[u8] = &[1, 15, 6, 0, 15, 100, 10, 0, 15, 52, 8, 0, 15, 82, 11, 112];
const DETOUR: &[u8] = &[0xe9, 0x1a, 0x87, 0xcc, 0x01, 0x90, 0x90];

// Entered after the original prologue. Direct AG2 clips use their own duration;
// ordinary sequences resume the original getter. See ag2-clock.asm.
const STUB: &[u8] = &[
    0x48, 0x8b, 0x8b, 0x78, 0x01, 0x00, 0x00, 0x48, 0x8b, 0x01, 0xff, 0x90, 0x30, 0x01, 0x00, 0x00,
    0x84, 0xc0, 0x74, 0x55, 0x48, 0x8b, 0x8b, 0x78, 0x01, 0x00, 0x00, 0x48, 0x8b, 0x91, 0xd8, 0x01,
    0x00, 0x00, 0x48, 0x85, 0xd2, 0x74, 0x3a, 0x48, 0x83, 0x3a, 0x00, 0x74, 0x34, 0x48, 0x89, 0x54,
    0x24, 0x20, 0x48, 0x8b, 0x0d, 0xcf, 0x34, 0xbf, 0xff, 0x48, 0x8b, 0x01, 0xff, 0x50, 0x30, 0x83,
    0xf8, 0x03, 0x75, 0x1d, 0x48, 0x8b, 0x54, 0x24, 0x20, 0xf6, 0x42, 0x18, 0x02, 0x75, 0x12, 0x48,
    0x8b, 0x02, 0x48, 0x85, 0xc0, 0x74, 0x0a, 0xf3, 0x0f, 0x10, 0x40, 0x0c, 0xe9, 0x70, 0x78, 0x33,
    0xfe, 0x0f, 0x57, 0xc0, 0xe9, 0x68, 0x78, 0x33, 0xfe, 0xe9, 0x87, 0x78, 0x33, 0xfe,
];

fn require(condition: bool, detail: &'static str) -> Result<(), ToolError> {
    if condition {
        Ok(())
    } else {
        Err(ToolError::InvalidPe(detail))
    }
}

fn u16_at(bytes: &[u8], offset: usize) -> Result<u16, ToolError> {
    let value = bytes
        .get(offset..offset + 2)
        .ok_or(ToolError::InvalidPe("truncated u16"))?;
    Ok(u16::from_le_bytes([value[0], value[1]]))
}

fn u32_at(bytes: &[u8], offset: usize) -> Result<u32, ToolError> {
    let value = bytes
        .get(offset..offset + 4)
        .ok_or(ToolError::InvalidPe("truncated u32"))?;
    Ok(u32::from_le_bytes([value[0], value[1], value[2], value[3]]))
}

fn put_u32(bytes: &mut [u8], offset: usize, value: usize) -> Result<(), ToolError> {
    let value = u32::try_from(value).map_err(|_| ToolError::InvalidPe("u32 overflow"))?;
    let target = bytes
        .get_mut(offset..offset + 4)
        .ok_or(ToolError::InvalidPe("write outside image"))?;
    target.copy_from_slice(&value.to_le_bytes());
    Ok(())
}

fn align(value: usize, alignment: usize) -> Result<usize, ToolError> {
    require(alignment.is_power_of_two(), "invalid PE alignment")?;
    Ok(value.div_ceil(alignment) * alignment)
}

struct Pe<'a> {
    bytes: &'a [u8],
    file: usize,
    optional: usize,
    sections: usize,
    section_count: usize,
}

impl<'a> Pe<'a> {
    fn parse(bytes: &'a [u8]) -> Result<Self, ToolError> {
        require(bytes.starts_with(b"MZ"), "missing DOS signature")?;
        let header = u32_at(bytes, 0x3c)? as usize;
        require(
            bytes.get(header..header + 4) == Some(b"PE\0\0"),
            "missing PE signature",
        )?;
        let file = header + 4;
        let optional = file + 20;
        require(u16_at(bytes, file)? == 0x8664, "expected AMD64")?;
        require(u16_at(bytes, optional)? == 0x20b, "expected PE32+")?;
        let sections = optional + usize::from(u16_at(bytes, file + 16)?);
        let section_count = usize::from(u16_at(bytes, file + 2)?);
        require(
            section_count > 0 && sections + section_count * 40 <= bytes.len(),
            "invalid sections",
        )?;
        Ok(Self {
            bytes,
            file,
            optional,
            sections,
            section_count,
        })
    }

    fn offset(&self, rva: usize, size: usize) -> Result<usize, ToolError> {
        for index in 0..self.section_count {
            let section = self.sections + index * 40;
            let start = u32_at(self.bytes, section + 12)? as usize;
            let length = u32_at(self.bytes, section + 16)? as usize;
            if rva >= start
                && rva
                    .checked_add(size)
                    .is_some_and(|end| end <= start + length)
            {
                let raw = u32_at(self.bytes, section + 20)? as usize + rva - start;
                require(raw + size <= self.bytes.len(), "section outside image")?;
                return Ok(raw);
            }
        }
        Err(ToolError::InvalidPe("RVA outside file-backed sections"))
    }

    fn data(&self, rva: usize, size: usize) -> Result<&'a [u8], ToolError> {
        let offset = self.offset(rva, size)?;
        Ok(&self.bytes[offset..offset + size])
    }
}

fn checksum(bytes: &[u8], field: usize) -> u32 {
    let mut sum = 0u64;
    for (index, chunk) in bytes.chunks(4).enumerate() {
        if index * 4 == field {
            continue;
        }
        let mut word = [0; 4];
        word[..chunk.len()].copy_from_slice(chunk);
        sum += u64::from(u32::from_le_bytes(word));
        sum = (sum & 0xffff_ffff) + (sum >> 32);
    }
    sum = (sum & 0xffff) + (sum >> 16);
    sum += sum >> 16;
    (sum & 0xffff) as u32 + bytes.len() as u32
}

fn build(editor: &[u8], runtime: &[u8]) -> Result<Vec<u8>, ToolError> {
    for (component, bytes, expected) in [
        ("ModelDoc", editor, EDITOR_SHA256),
        ("animationsystem", runtime, ANIMATION_SYSTEM_SHA256),
    ] {
        let actual = hash(bytes);
        if actual != expected {
            return Err(ToolError::UnsupportedBinary { component, actual });
        }
    }
    let pe = Pe::parse(editor)?;
    let runtime = Pe::parse(runtime)?;
    require(
        pe.data(PATCH_RVA, 7)? == [0x48, 0x8b, 0x89, 0x78, 1, 0, 0],
        "patch site mismatch",
    )?;
    require(
        pe.data(PRIMARY_FUNCTION[2] as usize, 16)? == PRIMARY_UNWIND,
        "primary unwind mismatch",
    )?;
    require(
        runtime.data(0x6c7a0, 8)? == [0x0f, 0xb6, 0x81, 0x49, 2, 0, 0, 0xc3],
        "helper flag mismatch",
    )?;
    require(
        runtime.data(0x6dac8, 7)? == [0x48, 0x8b, 0x91, 0xd8, 1, 0, 0],
        "clip handle mismatch",
    )?;
    require(
        runtime.data(0x6db1f, 5)? == [0xf3, 0x0f, 0x5e, 0x40, 0x0c],
        "clip duration mismatch",
    )?;

    let exception_directory = pe.optional + 112 + 3 * 8;
    let old_table_rva = u32_at(editor, exception_directory)? as usize;
    let old_table_size = u32_at(editor, exception_directory + 4)? as usize;
    require(
        old_table_size.is_multiple_of(12),
        "invalid runtime-function table",
    )?;
    let old_table = pe.data(old_table_rva, old_table_size)?;
    let primary = PRIMARY_FUNCTION
        .into_iter()
        .flat_map(u32::to_le_bytes)
        .collect::<Vec<_>>();
    require(
        old_table
            .as_chunks::<12>()
            .0
            .iter()
            .any(|entry| entry.as_slice() == primary),
        "primary function missing",
    )?;

    let section_alignment = u32_at(editor, pe.optional + 32)? as usize;
    let file_alignment = u32_at(editor, pe.optional + 36)? as usize;
    require(
        u32_at(editor, pe.optional + 56)? as usize == STUB_RVA,
        "unexpected image tail",
    )?;
    let section_header = pe.sections + pe.section_count * 40;
    require(
        section_header + 40 <= u32_at(editor, pe.optional + 60)? as usize,
        "no section-header space",
    )?;
    require(
        editor
            .get(section_header..section_header + 40)
            .is_some_and(|bytes| bytes.iter().all(|b| *b == 0)),
        "section-header space occupied",
    )?;

    let unwind_offset = align(STUB.len(), 4)?;
    let table_offset = unwind_offset + 16;
    let section_size = table_offset + old_table_size + 12;
    let raw_size = align(section_size, file_alignment)?;
    let raw_offset = align(editor.len(), file_alignment)?;
    let mut output = editor.to_vec();
    output.resize(raw_offset + raw_size, 0);
    output[pe.offset(PATCH_RVA, 7)?..pe.offset(PATCH_RVA, 7)? + 7].copy_from_slice(DETOUR);
    output[raw_offset..raw_offset + STUB.len()].copy_from_slice(STUB);

    // This noncontiguous body shares the original prologue's stack/register state.
    // CHAININFO retains the original Win64 unwinding behavior inside the detour.
    output[raw_offset + unwind_offset..raw_offset + unwind_offset + 4]
        .copy_from_slice(&[0x21, 0, 0, 0]);
    output[raw_offset + unwind_offset + 4..raw_offset + unwind_offset + 16]
        .copy_from_slice(&primary);
    output[raw_offset + table_offset..raw_offset + table_offset + old_table_size]
        .copy_from_slice(old_table);
    for (index, value) in [STUB_RVA, STUB_RVA + STUB.len(), STUB_RVA + unwind_offset]
        .into_iter()
        .enumerate()
    {
        put_u32(
            &mut output,
            raw_offset + table_offset + old_table_size + index * 4,
            value,
        )?;
    }
    output[section_header..section_header + 8].copy_from_slice(b".ag2clk\0");
    for (offset, value) in [
        (8, section_size),
        (12, STUB_RVA),
        (16, raw_size),
        (20, raw_offset),
        (36, 0x60000020),
    ] {
        put_u32(&mut output, section_header + offset, value)?;
    }
    output[pe.file + 2..pe.file + 4]
        .copy_from_slice(&((pe.section_count + 1) as u16).to_le_bytes());
    put_u32(
        &mut output,
        pe.optional + 56,
        align(STUB_RVA + section_size, section_alignment)?,
    )?;
    put_u32(
        &mut output,
        pe.optional + 4,
        u32_at(editor, pe.optional + 4)? as usize + raw_size,
    )?;
    put_u32(&mut output, exception_directory, STUB_RVA + table_offset)?;
    put_u32(&mut output, exception_directory + 4, old_table_size + 12)?;
    output[pe.optional + 112 + 4 * 8..pe.optional + 112 + 5 * 8].fill(0);
    let checksum_field = pe.optional + 64;
    let sum = checksum(&output, checksum_field);
    put_u32(&mut output, checksum_field, sum as usize)?;
    if hash(&output) != PATCHED_EDITOR_SHA256 {
        return Err(ToolError::UnexpectedPatch);
    }
    Ok(output)
}

pub fn patch_modeldoc(editor: &Path, runtime: &Path, output: &Path) -> Result<(), ToolError> {
    let patched = build(&read(editor)?, &read(runtime)?)?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(output)
        .map_err(|source| ToolError::Io {
            path: output.to_owned(),
            source,
        })?;
    file.write_all(&patched).map_err(|source| ToolError::Io {
        path: output.to_owned(),
        source,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_an_unsupported_pair_without_creating_output() {
        let root = tempfile::tempdir().unwrap();
        let editor = root.path().join("editor.dll");
        let runtime = root.path().join("runtime.dll");
        let output = root.path().join("patched.dll");
        std::fs::write(&editor, b"unsupported").unwrap();
        std::fs::write(&runtime, b"unsupported").unwrap();
        assert!(matches!(
            patch_modeldoc(&editor, &runtime, &output),
            Err(ToolError::UnsupportedBinary { .. })
        ));
        assert!(!output.exists());
        assert_eq!(std::fs::read(editor).unwrap(), b"unsupported");
    }

    #[test]
    fn rejects_truncated_pe_headers() {
        assert!(Pe::parse(b"MZ").is_err());
        assert!(u32_at(&[0; 3], 0).is_err());
        assert!(align(100, 0).is_err());
    }

    #[test]
    fn checksum_ignores_its_own_field() {
        let mut bytes = vec![0; 24];
        let sum = checksum(&bytes, 8);
        bytes[8..12].copy_from_slice(&sum.to_le_bytes());
        assert_eq!(checksum(&bytes, 8), sum);
        bytes[20] = 1;
        assert_ne!(checksum(&bytes, 8), sum);
    }
}
