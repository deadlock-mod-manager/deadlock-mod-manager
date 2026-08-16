//! Reading and surgically rewriting a VPK directory file.
//!
//! [`pack`](crate::pack) writes a fresh VPK from a directory tree. This module
//! is the other half: it opens a VPK that already exists — one downloaded from
//! GameBanana, packed by an unknown tool, possibly split across `_NNN.vpk`
//! companions — and lets a single inline entry be added or replaced without
//! re-encoding a byte of anyone else's file data.
//!
//! That is what makes stamping a fingerprint into a third-party mod safe. Entry
//! offsets in a VPK are relative to the start of the data section, not to the
//! start of the file, so growing the entry tree leaves every existing offset
//! valid. Entries stored in companion archives are referenced by archive index
//! and are not touched at all.
//!
//! The one thing a rewrite does drop is the archive-MD5 / other-MD5 / signature
//! sections of a v2 VPK. Those are integrity metadata over the exact bytes we
//! are deliberately changing, they are absent from every mod VPK in practice,
//! and the engine does not verify them for addons.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use crate::error::{Result, VpkManagerError};

pub const VPK_SIGNATURE: u32 = 0x55aa1234;
/// Archive index meaning "the data lives in this directory file".
pub const INLINE_ARCHIVE_INDEX: u16 = 0x7fff;
const ENTRY_TERMINATOR: u16 = 0xffff;
const V1_HEADER_LEN: usize = 12;
const V2_HEADER_LEN: usize = 28;

/// One file inside a VPK, as described by the directory tree.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DirEntry {
    pub ext: String,
    pub path: String,
    pub filename: String,
    pub crc32: u32,
    pub archive_index: u16,
    pub offset: u32,
    pub length: u32,
    /// Bytes stored inline in the tree itself, ahead of the entry's data.
    pub preload: Vec<u8>,
}

impl DirEntry {
    pub fn is_inline(&self) -> bool {
        self.archive_index == INLINE_ARCHIVE_INDEX
    }

    /// `path/filename.ext`, with the VPK's `" "` root spelling normalized away.
    pub fn full_path(&self) -> String {
        let name = format!("{}.{}", self.filename, self.ext);
        if self.path.is_empty() || self.path == " " {
            name
        } else {
            format!("{}/{name}", self.path)
        }
    }
}

/// A parsed VPK directory file, held in memory together with its data section.
pub struct VpkDir {
    version: u32,
    header_len: usize,
    /// Offset of the data section within `bytes`.
    data_start: usize,
    /// Length of the data section, which may be shortened by an edit.
    data_len: usize,
    entries: Vec<DirEntry>,
    bytes: Vec<u8>,
    /// Data appended past the original section by [`Self::upsert_inline`].
    appended: Vec<u8>,
    dropped_trailing_sections: bool,
}

impl VpkDir {
    pub fn parse(bytes: Vec<u8>) -> Result<Self> {
        let mut cursor = Cursor::new(&bytes);
        let signature = cursor.u32()?;
        if signature != VPK_SIGNATURE {
            return Err(VpkManagerError::Vpk(format!(
                "not a VPK file: signature {signature:#010x}"
            )));
        }
        let version = cursor.u32()?;
        let tree_len = cursor.u32()? as usize;

        let (header_len, declared_data_len, trailing) = if version >= 2 {
            let data_size = cursor.u32()? as usize;
            let archive_md5 = cursor.u32()? as usize;
            let other_md5 = cursor.u32()? as usize;
            let signature_size = cursor.u32()? as usize;
            (
                V2_HEADER_LEN,
                data_size,
                archive_md5 + other_md5 + signature_size,
            )
        } else if version == 1 {
            (V1_HEADER_LEN, 0, 0)
        } else {
            return Err(VpkManagerError::Vpk(format!(
                "unsupported VPK version {version}"
            )));
        };

        let data_start = header_len
            .checked_add(tree_len)
            .filter(|end| *end <= bytes.len())
            .ok_or_else(|| VpkManagerError::Vpk("VPK tree runs past the end of the file".into()))?;

        // A v2 writer that leaves the data-section size at zero while storing
        // inline data is common enough that the field cannot be trusted on its
        // own; fall back to "everything after the tree" when nothing else
        // claims those bytes.
        let data_len = if declared_data_len > 0 {
            declared_data_len
        } else if trailing == 0 {
            bytes.len() - data_start
        } else {
            0
        };
        if data_start + data_len > bytes.len() {
            return Err(VpkManagerError::Vpk(
                "VPK data section runs past the end of the file".into(),
            ));
        }

        let entries = cursor.tree(header_len, tree_len)?;

        Ok(Self {
            version,
            header_len,
            data_start,
            data_len,
            entries,
            bytes,
            appended: Vec::new(),
            dropped_trailing_sections: trailing > 0,
        })
    }

    pub fn version(&self) -> u32 {
        self.version
    }

    pub fn entries(&self) -> &[DirEntry] {
        &self.entries
    }

    /// Whether serializing this VPK would discard v2 integrity sections.
    pub fn has_trailing_sections(&self) -> bool {
        self.dropped_trailing_sections
    }

    pub fn find(&self, ext: &str, path: &str, filename: &str) -> Option<&DirEntry> {
        self.entries
            .iter()
            .find(|entry| entry.ext == ext && entry.path == path && entry.filename == filename)
    }

    /// The bytes of an entry stored in this directory file. `None` for entries
    /// that live in a `_NNN.vpk` companion.
    pub fn entry_data(&self, entry: &DirEntry) -> Option<&[u8]> {
        if !entry.is_inline() {
            return None;
        }
        let start = entry.offset as usize;
        let end = start.checked_add(entry.length as usize)?;
        if end <= self.data_len {
            self.bytes
                .get(self.data_start + start..self.data_start + end)
        } else if start >= self.data_len {
            self.appended
                .get(start - self.data_len..end - self.data_len)
        } else {
            None
        }
    }

    /// Drop an entry from the tree, reclaiming its bytes when they are the tail
    /// of the data section. Returns the entry if it was there.
    pub fn remove(&mut self, ext: &str, path: &str, filename: &str) -> Option<DirEntry> {
        let index = self.entries.iter().position(|entry| {
            entry.ext == ext && entry.path == path && entry.filename == filename
        })?;
        let removed = self.entries.remove(index);

        let end = removed.offset as usize + removed.length as usize;
        if removed.is_inline() && end == self.data_len + self.appended.len() {
            let reclaimed = (removed.length as usize).min(self.appended.len());
            self.appended.truncate(self.appended.len() - reclaimed);
            self.data_len -= removed.length as usize - reclaimed;
        }
        Some(removed)
    }

    /// Add an entry whose data already lives wherever its offset and archive
    /// index say it does.
    pub fn push(&mut self, entry: DirEntry) {
        self.entries.push(entry);
    }

    /// Add `payload` as an inline entry, replacing any entry already at that
    /// key. Existing entries keep their data bytes and their offsets.
    pub fn upsert_inline(&mut self, ext: &str, path: &str, filename: &str, payload: &[u8]) {
        // Entries added here always go last, so replacing one usually reclaims
        // its bytes rather than orphaning them.
        self.remove(ext, path, filename);

        let offset = self.data_len + self.appended.len();
        self.entries.push(DirEntry {
            ext: ext.to_string(),
            path: path.to_string(),
            filename: filename.to_string(),
            crc32: crate::pack::checksum(payload),
            archive_index: INLINE_ARCHIVE_INDEX,
            offset: offset as u32,
            length: payload.len() as u32,
            preload: Vec::new(),
        });
        self.appended.extend_from_slice(payload);
    }

    /// Serialize back to a complete VPK directory file.
    pub fn to_bytes(&self) -> Result<Vec<u8>> {
        let tree = self.build_tree();
        let data = &self.bytes[self.data_start..self.data_start + self.data_len];
        let data_len = data.len() + self.appended.len();

        let mut out = Vec::with_capacity(self.header_len + tree.len() + data_len);
        write_u32(&mut out, VPK_SIGNATURE);
        write_u32(&mut out, self.version);
        write_u32(
            &mut out,
            u32::try_from(tree.len())
                .map_err(|_| VpkManagerError::Vpk("VPK tree is too large".into()))?,
        );
        if self.version >= 2 {
            write_u32(
                &mut out,
                u32::try_from(data_len)
                    .map_err(|_| VpkManagerError::Vpk("VPK data section is too large".into()))?,
            );
            // Integrity sections cannot survive a rewrite of the bytes they
            // cover; see the module docs.
            write_u32(&mut out, 0);
            write_u32(&mut out, 0);
            write_u32(&mut out, 0);
        }
        out.extend_from_slice(&tree);
        out.extend_from_slice(data);
        out.extend_from_slice(&self.appended);
        Ok(out)
    }

    fn build_tree(&self) -> Vec<u8> {
        let mut grouped: BTreeMap<&str, BTreeMap<&str, Vec<&DirEntry>>> = BTreeMap::new();
        for entry in &self.entries {
            grouped
                .entry(entry.ext.as_str())
                .or_default()
                .entry(entry.path.as_str())
                .or_default()
                .push(entry);
        }

        let mut out = Vec::new();
        for (ext, paths) in grouped {
            write_cstring(&mut out, ext);
            for (path, entries) in paths {
                write_cstring(&mut out, path);
                for entry in entries {
                    write_cstring(&mut out, &entry.filename);
                    write_u32(&mut out, entry.crc32);
                    write_u16(&mut out, entry.preload.len() as u16);
                    write_u16(&mut out, entry.archive_index);
                    write_u32(&mut out, entry.offset);
                    write_u32(&mut out, entry.length);
                    write_u16(&mut out, ENTRY_TERMINATOR);
                    out.extend_from_slice(&entry.preload);
                }
                out.push(0);
            }
            out.push(0);
        }
        out.push(0);
        out
    }
}

/// Read one inline entry out of a VPK on disk without loading the whole file.
///
/// Reconciliation asks every VPK in a profile for its fingerprint, and a profile
/// can hold gigabytes; only the header, the entry tree and the entry's own bytes
/// are read. Returns `None` if the entry is absent or lives in a companion
/// archive.
pub fn read_entry_from_file(
    path: &Path,
    ext: &str,
    dir_path: &str,
    filename: &str,
) -> Result<Option<Vec<u8>>> {
    use std::io::{Read, Seek, SeekFrom};

    let mut file = fs::File::open(path)?;
    let mut header = [0u8; V2_HEADER_LEN];
    file.read_exact(&mut header[..V1_HEADER_LEN])?;

    let signature = u32::from_le_bytes(header[0..4].try_into().unwrap());
    if signature != VPK_SIGNATURE {
        return Err(VpkManagerError::Vpk(format!(
            "not a VPK file: signature {signature:#010x}"
        )));
    }
    let version = u32::from_le_bytes(header[4..8].try_into().unwrap());
    let tree_len = u32::from_le_bytes(header[8..12].try_into().unwrap()) as usize;
    let header_len = match version {
        1 => V1_HEADER_LEN,
        2.. => V2_HEADER_LEN,
        0 => {
            return Err(VpkManagerError::Vpk("unsupported VPK version 0".into()));
        }
    };

    // The tree is parsed from a buffer that starts at the file's start, because
    // that is what `Cursor::tree` addresses against.
    let mut prefix = vec![0u8; header_len + tree_len];
    file.seek(SeekFrom::Start(0))?;
    file.read_exact(&mut prefix)?;
    let entries = Cursor::new(&prefix).tree(header_len, tree_len)?;

    let Some(entry) = entries
        .iter()
        .find(|entry| entry.ext == ext && entry.path == dir_path && entry.filename == filename)
    else {
        return Ok(None);
    };
    if !entry.is_inline() {
        return Ok(None);
    }

    let data_start = (header_len + tree_len) as u64;
    file.seek(SeekFrom::Start(data_start + u64::from(entry.offset)))?;
    let mut payload = vec![0u8; entry.length as usize];
    file.read_exact(&mut payload)?;
    Ok(Some(payload))
}

struct Cursor<'a> {
    bytes: &'a [u8],
    position: usize,
}

impl<'a> Cursor<'a> {
    fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, position: 0 }
    }

    fn take(&mut self, count: usize) -> Result<&'a [u8]> {
        let end = self
            .position
            .checked_add(count)
            .filter(|end| *end <= self.bytes.len())
            .ok_or_else(|| VpkManagerError::Vpk("VPK ended mid-structure".into()))?;
        let slice = &self.bytes[self.position..end];
        self.position = end;
        Ok(slice)
    }

    fn u16(&mut self) -> Result<u16> {
        let bytes = self.take(2)?;
        Ok(u16::from_le_bytes([bytes[0], bytes[1]]))
    }

    fn u32(&mut self) -> Result<u32> {
        let bytes = self.take(4)?;
        Ok(u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
    }

    fn cstring(&mut self) -> Result<String> {
        let start = self.position;
        while self.position < self.bytes.len() && self.bytes[self.position] != 0 {
            self.position += 1;
        }
        if self.position >= self.bytes.len() {
            return Err(VpkManagerError::Vpk(
                "unterminated string in VPK tree".into(),
            ));
        }
        let raw = &self.bytes[start..self.position];
        self.position += 1;
        // VPK paths are ASCII in practice; a stray byte must not abort a parse
        // whose only job is to locate entries.
        Ok(String::from_utf8_lossy(raw).into_owned())
    }

    fn tree(&mut self, tree_start: usize, tree_len: usize) -> Result<Vec<DirEntry>> {
        self.position = tree_start;
        let tree_end = tree_start + tree_len;
        let mut entries = Vec::new();

        while self.position < tree_end {
            let ext = self.cstring()?;
            if ext.is_empty() {
                break;
            }
            loop {
                if self.position >= tree_end {
                    return Err(VpkManagerError::Vpk("VPK tree ended inside a path".into()));
                }
                let path = self.cstring()?;
                if path.is_empty() {
                    break;
                }
                loop {
                    if self.position >= tree_end {
                        return Err(VpkManagerError::Vpk(
                            "VPK tree ended inside a directory".into(),
                        ));
                    }
                    let filename = self.cstring()?;
                    if filename.is_empty() {
                        break;
                    }
                    let crc32 = self.u32()?;
                    let preload_len = self.u16()? as usize;
                    let archive_index = self.u16()?;
                    let offset = self.u32()?;
                    let length = self.u32()?;
                    let _terminator = self.u16()?;
                    let preload = self.take(preload_len)?.to_vec();

                    entries.push(DirEntry {
                        ext: ext.clone(),
                        path: path.clone(),
                        filename,
                        crc32,
                        archive_index,
                        offset,
                        length,
                        preload,
                    });
                }
            }
        }

        Ok(entries)
    }
}

fn write_cstring(out: &mut Vec<u8>, value: &str) {
    out.extend_from_slice(value.as_bytes());
    out.push(0);
}

fn write_u16(out: &mut Vec<u8>, value: u16) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn write_u32(out: &mut Vec<u8>, value: u32) {
    out.extend_from_slice(&value.to_le_bytes());
}
