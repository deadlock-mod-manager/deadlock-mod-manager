//! A minimal VPK v2 writer.
//!
//! Everything is written into the directory file's inline data section
//! (archive index `0x7fff`) rather than split across `_NNN.vpk` companions: an
//! edited hero skin is a handful of megabytes, and a single self-contained file
//! is what an addon folder wants.

use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};

use crc::{CRC_32_ISO_HDLC, Crc};

use crate::error::{Result, VpkManagerError};

const VPK_SIGNATURE: u32 = 0x55aa1234;
const VPK_VERSION: u32 = 2;
const INLINE_ARCHIVE_INDEX: u16 = 0x7fff;
const ENTRY_TERMINATOR: u16 = 0xffff;
const CRC32: Crc<u32> = Crc::<u32>::new(&CRC_32_ISO_HDLC);

/// The CRC-32 a VPK directory entry records for its file's bytes.
pub(crate) fn checksum(bytes: &[u8]) -> u32 {
    CRC32.checksum(bytes)
}

struct PackedEntry {
    filename: String,
    crc32: u32,
    offset: u32,
    length: u32,
}

type Tree = BTreeMap<String, BTreeMap<String, Vec<PackedEntry>>>;

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

fn safe_relative_path(path: &Path) -> Option<PathBuf> {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => out.push(part),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return None;
            }
        }
    }
    if out.as_os_str().is_empty() {
        None
    } else {
        Some(out)
    }
}

fn collect_files(root: &Path, dir: &Path, files: &mut Vec<PathBuf>) -> Result<()> {
    let mut entries = fs::read_dir(dir)?.collect::<std::io::Result<Vec<_>>>()?;
    entries.sort_by_key(|entry| entry.path());

    for entry in entries {
        let path = entry.path();
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            collect_files(root, &path, files)?;
        } else if file_type.is_file() {
            let relative = path
                .strip_prefix(root)
                .map_err(|e| VpkManagerError::Vpk(format!("invalid pack path: {e}")))?;
            if let Some(safe) = safe_relative_path(relative) {
                files.push(safe);
            }
        }
    }

    Ok(())
}

fn split_entry_path(relative: &Path) -> Result<(String, String, String)> {
    let extension = relative
        .extension()
        .and_then(|value| value.to_str())
        .ok_or_else(|| {
            VpkManagerError::Vpk(format!(
                "packed file has no extension: {}",
                relative.display()
            ))
        })?
        .to_ascii_lowercase();
    let filename = relative
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| {
            VpkManagerError::Vpk(format!(
                "packed file has no filename: {}",
                relative.display()
            ))
        })?
        .to_ascii_lowercase();
    let parent = relative.parent().unwrap_or_else(|| Path::new(""));
    let path = if parent.as_os_str().is_empty() {
        " ".to_string()
    } else {
        parent
            .components()
            .filter_map(|component| match component {
                Component::Normal(part) => part.to_str().map(str::to_ascii_lowercase),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("/")
    };

    Ok((extension, path, filename))
}

fn build_tree(root: &Path, files: Vec<PathBuf>) -> Result<(Tree, Vec<u8>)> {
    let mut tree = Tree::new();
    let mut data = Vec::new();

    for relative in files {
        let source_path = root.join(&relative);
        let bytes = fs::read(&source_path)?;
        let offset = u32::try_from(data.len())
            .map_err(|_| VpkManagerError::Vpk("VPK data section is too large".to_string()))?;
        let length = u32::try_from(bytes.len()).map_err(|_| {
            VpkManagerError::Vpk(format!(
                "packed file is too large for VPK: {}",
                relative.display()
            ))
        })?;
        let crc32 = CRC32.checksum(&bytes);
        data.extend_from_slice(&bytes);

        let (extension, path, filename) = split_entry_path(&relative)?;
        tree.entry(extension)
            .or_default()
            .entry(path)
            .or_default()
            .push(PackedEntry {
                filename,
                crc32,
                offset,
                length,
            });
    }

    Ok((tree, data))
}

fn build_directory_tree(tree: Tree) -> Vec<u8> {
    let mut out = Vec::new();
    for (extension, paths) in tree {
        write_cstring(&mut out, &extension);
        for (path, mut entries) in paths {
            entries.sort_by(|left, right| left.filename.cmp(&right.filename));
            write_cstring(&mut out, &path);
            for entry in entries {
                write_cstring(&mut out, &entry.filename);
                write_u32(&mut out, entry.crc32);
                write_u16(&mut out, 0);
                write_u16(&mut out, INLINE_ARCHIVE_INDEX);
                write_u32(&mut out, entry.offset);
                write_u32(&mut out, entry.length);
                write_u16(&mut out, ENTRY_TERMINATOR);
            }
            out.push(0);
        }
        out.push(0);
    }
    out.push(0);
    out
}

fn write_header(out: &mut Vec<u8>, tree_len: usize, data_len: usize) -> Result<()> {
    let tree_size = u32::try_from(tree_len)
        .map_err(|_| VpkManagerError::Vpk("VPK tree is too large".to_string()))?;
    let data_size = u32::try_from(data_len)
        .map_err(|_| VpkManagerError::Vpk("VPK data section is too large".to_string()))?;

    write_u32(out, VPK_SIGNATURE);
    write_u32(out, VPK_VERSION);
    write_u32(out, tree_size);
    write_u32(out, data_size);
    write_u32(out, 0);
    write_u32(out, 0);
    write_u32(out, 0);
    Ok(())
}

pub fn pack_directory(source_dir: &Path, output_path: &Path) -> Result<usize> {
    if !source_dir.is_dir() {
        return Err(VpkManagerError::Vpk(format!(
            "source directory does not exist: {}",
            source_dir.display()
        )));
    }

    if output_path.starts_with(source_dir) {
        return Err(VpkManagerError::Vpk(
            "output VPK cannot be written inside the packed files directory".to_string(),
        ));
    }

    let mut files = Vec::new();
    collect_files(source_dir, source_dir, &mut files)?;
    if files.is_empty() {
        return Err(VpkManagerError::Vpk(
            "workspace has no files to pack".to_string(),
        ));
    }

    let file_count = files.len();
    let (tree, data) = build_tree(source_dir, files)?;
    let directory_tree = build_directory_tree(tree);
    let mut out = Vec::with_capacity(28 + directory_tree.len() + data.len());
    write_header(&mut out, directory_tree.len(), data.len())?;
    out.extend_from_slice(&directory_tree);
    out.extend_from_slice(&data);

    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp_path = output_path.with_extension("vpk.tmp");
    if tmp_path.exists() {
        fs::remove_file(&tmp_path)?;
    }
    {
        let mut file = fs::File::create(&tmp_path)?;
        file.write_all(&out)?;
        file.sync_all()?;
    }
    if output_path.exists() {
        fs::remove_file(output_path)?;
    }
    fs::rename(tmp_path, output_path)?;

    Ok(file_count)
}
