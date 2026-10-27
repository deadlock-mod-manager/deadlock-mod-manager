//! A minimal VPK v2 writer.
//!
//! Everything is written into the directory file's inline data section
//! (archive index `0x7fff`) rather than split across `_NNN.vpk` companions: an
//! edited hero skin is a handful of megabytes, and a single self-contained file
//! is what an addon folder wants.

use std::collections::BTreeMap;
use std::fs;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Component, Path, PathBuf};

use crc::{CRC_32_ISO_HDLC, Crc};

use crate::error::{Result, VpkManagerError};

const VPK_SIGNATURE: u32 = 0x55aa1234;
const VPK_VERSION: u32 = 2;
const INLINE_ARCHIVE_INDEX: u16 = 0x7fff;
const ENTRY_TERMINATOR: u16 = 0xffff;
const CRC32: Crc<u32> = Crc::<u32>::new(&CRC_32_ISO_HDLC);

struct PackedEntry {
    source: PathBuf,
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

fn collect_files(
    root: &Path,
    dir: &Path,
    files: &mut Vec<PathBuf>,
    include: &impl Fn(&Path) -> bool,
) -> Result<()> {
    let mut entries = fs::read_dir(dir)?.collect::<std::io::Result<Vec<_>>>()?;
    entries.sort_by_key(|entry| entry.path());

    for entry in entries {
        let path = entry.path();
        let relative = path
            .strip_prefix(root)
            .map_err(|e| VpkManagerError::Vpk(e.to_string()))?;
        if !include(relative) {
            continue;
        }
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            collect_files(root, &path, files, include)?;
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

fn build_tree(root: &Path, files: Vec<PathBuf>) -> Result<(Tree, usize)> {
    let mut tree = Tree::new();

    for relative in files {
        let source_path = root.join(&relative);
        let length = u32::try_from(fs::metadata(&source_path)?.len()).map_err(|_| {
            VpkManagerError::Vpk(format!(
                "packed file is too large for VPK: {}",
                relative.display()
            ))
        })?;

        let (extension, path, filename) = split_entry_path(&relative)?;
        tree.entry(extension)
            .or_default()
            .entry(path)
            .or_default()
            .push(PackedEntry {
                source: source_path,
                filename,
                crc32: 0,
                offset: 0,
                length,
            });
    }
    let mut data_len = 0_u64;
    for entries in tree.values_mut().flat_map(BTreeMap::values_mut) {
        entries.sort_by(|left, right| left.filename.cmp(&right.filename));
        for entry in entries {
            entry.offset = u32::try_from(data_len)
                .map_err(|_| VpkManagerError::Vpk("VPK data section is too large".into()))?;
            data_len += u64::from(entry.length);
        }
    }
    let data_len = u32::try_from(data_len)
        .map_err(|_| VpkManagerError::Vpk("VPK data section is too large".into()))?;
    Ok((tree, data_len as usize))
}

fn build_directory_tree(tree: &Tree) -> Vec<u8> {
    let mut out = Vec::new();
    for (extension, paths) in tree {
        write_cstring(&mut out, extension);
        for (path, entries) in paths {
            write_cstring(&mut out, path);
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
    if output_path.starts_with(source_dir) {
        return Err(VpkManagerError::Vpk(
            "output VPK cannot be written inside the packed files directory".to_string(),
        ));
    }
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp_path = output_path.with_extension("vpk.tmp");
    let result = (|| {
        let mut file = fs::File::create(&tmp_path)?;
        let count = pack_directory_to_writer(source_dir, &mut file, |_| true)?;
        file.sync_all()?;
        drop(file);
        if output_path.exists() {
            fs::remove_file(output_path)?;
        }
        fs::rename(&tmp_path, output_path)?;
        Ok(count)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp_path);
    }
    result
}

/// Streams payloads once, then fills in the directory CRCs without buffering asset bytes.
pub fn pack_directory_to_writer(
    source_dir: &Path,
    output: &mut (impl Write + Seek),
    include: impl Fn(&Path) -> bool,
) -> Result<usize> {
    if !source_dir.is_dir() {
        return Err(VpkManagerError::Vpk(format!(
            "source directory does not exist: {}",
            source_dir.display()
        )));
    }

    let mut files = Vec::new();
    collect_files(source_dir, source_dir, &mut files, &include)?;
    if files.is_empty() {
        return Err(VpkManagerError::Vpk(
            "workspace has no files to pack".to_string(),
        ));
    }

    let file_count = files.len();
    let (mut tree, data_len) = build_tree(source_dir, files)?;
    let directory_tree = build_directory_tree(&tree);
    let mut header = Vec::with_capacity(28);
    write_header(&mut header, directory_tree.len(), data_len)?;
    let start = output.stream_position()?;
    output.write_all(&header)?;
    output.write_all(&directory_tree)?;
    let mut buffer = [0; 64 * 1024];
    for entry in tree.values_mut().flat_map(BTreeMap::values_mut).flatten() {
        let mut file = fs::File::open(&entry.source)?.take(u64::from(entry.length) + 1);
        let mut digest = CRC32.digest();
        let mut length = 0_u64;
        loop {
            let count = file.read(&mut buffer)?;
            if count == 0 {
                break;
            }
            length += count as u64;
            if length > u64::from(entry.length) {
                break;
            }
            digest.update(&buffer[..count]);
            output.write_all(&buffer[..count])?;
        }
        if length != u64::from(entry.length) {
            return Err(VpkManagerError::Vpk(format!(
                "File changed while packing: {}",
                entry.source.display()
            )));
        }
        entry.crc32 = digest.finalize();
    }
    let end = output.stream_position()?;
    output.seek(SeekFrom::Start(start + 28))?;
    output.write_all(&build_directory_tree(&tree))?;
    output.seek(SeekFrom::Start(end))?;
    output.flush()?;
    Ok(file_count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    struct TestDirectory(PathBuf);
    impl TestDirectory {
        fn new() -> Self {
            let id = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let root = std::env::temp_dir().join(format!("dmm-pack-{}-{id}", std::process::id()));
            fs::create_dir(&root).unwrap();
            Self(root)
        }
    }
    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn streamed_payloads_have_backfilled_crcs_and_correct_offsets() {
        let root = TestDirectory::new();
        fs::create_dir(root.0.join("files")).unwrap();
        let payload = vec![29; 1024 * 1024 + 13];
        fs::write(root.0.join("files/large.bin"), &payload).unwrap();
        fs::write(root.0.join("files/empty.txt"), []).unwrap();
        let mut output = Cursor::new(Vec::new());
        assert_eq!(
            pack_directory_to_writer(&root.0.join("files"), &mut output, |_| true).unwrap(),
            2
        );
        let bytes = output.into_inner();
        let tree_size = u32::from_le_bytes(bytes[8..12].try_into().unwrap()) as usize;
        let data_start = 28 + tree_size;
        assert_eq!(&bytes[data_start..], payload);
        let name = bytes
            .windows(6)
            .position(|part| part == b"large\0")
            .unwrap()
            + 6;
        let crc = u32::from_le_bytes(bytes[name..name + 4].try_into().unwrap());
        assert_eq!(crc, CRC32.checksum(&payload));
        assert_eq!(
            u32::from_le_bytes(bytes[name + 8..name + 12].try_into().unwrap()),
            0
        );
        assert_eq!(
            u32::from_le_bytes(bytes[name + 12..name + 16].try_into().unwrap()),
            payload.len() as u32
        );
        assert_eq!(bytes.len(), data_start + payload.len());
    }

    #[test]
    fn failed_pack_preserves_existing_output_and_removes_its_temporary_file() {
        let root = TestDirectory::new();
        let source = root.0.join("files");
        fs::create_dir(&source).unwrap();
        fs::write(source.join("no-extension"), b"invalid").unwrap();
        let output = root.0.join("addon.vpk");
        fs::write(&output, b"previous working build").unwrap();
        assert!(pack_directory(&source, &output).is_err());
        assert_eq!(fs::read(&output).unwrap(), b"previous working build");
        assert!(!output.with_extension("vpk.tmp").exists());
    }

    #[test]
    fn source_growth_during_pack_is_rejected() {
        struct ChangingWriter {
            bytes: Cursor<Vec<u8>>,
            source: PathBuf,
            changed: bool,
        }
        impl Write for ChangingWriter {
            fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
                if !self.changed {
                    self.changed = true;
                    fs::write(&self.source, b"larger replacement")?;
                }
                self.bytes.write(bytes)
            }
            fn flush(&mut self) -> std::io::Result<()> {
                Ok(())
            }
        }
        impl Seek for ChangingWriter {
            fn seek(&mut self, position: SeekFrom) -> std::io::Result<u64> {
                self.bytes.seek(position)
            }
        }
        let root = TestDirectory::new();
        let source = root.0.join("asset.txt");
        fs::write(&source, b"old").unwrap();
        let mut output = ChangingWriter {
            bytes: Cursor::new(Vec::new()),
            source,
            changed: false,
        };
        assert!(
            pack_directory_to_writer(&root.0, &mut output, |_| true)
                .unwrap_err()
                .to_string()
                .contains("changed while packing")
        );
    }
}
