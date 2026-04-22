use std::fs;
use std::path::{Path, PathBuf};

use crate::error::{Result, VpkMergerError};

const VPK_SIGNATURE: u32 = 0x55aa1234;
const VPK_VERSION: u32 = 2;
const ARCHIVE_INDEX_INLINE: u16 = 0x7fff;
const ENTRY_TERMINATOR: u16 = 0xffff;

pub const MAX_MERGED_VPK_BYTES: u64 = 1_610_612_736;

#[derive(Clone)]
pub struct OutputRow {
    pub ext: String,
    pub path: String,
    pub filename: String,
    pub crc32: u32,
    pub payload: Vec<u8>,
}

pub fn sort_output_rows(rows: &mut [OutputRow]) {
    rows.sort_by(|a, b| {
        a.ext
            .to_ascii_lowercase()
            .cmp(&b.ext.to_ascii_lowercase())
            .then_with(|| path_sort_key(&a.path).cmp(&path_sort_key(&b.path)))
            .then_with(|| {
                a.filename
                    .to_ascii_lowercase()
                    .cmp(&b.filename.to_ascii_lowercase())
            })
    });
}

pub fn output_path_for_shard(base_output: &Path, shard_index: u32) -> PathBuf {
    if shard_index == 0 {
        return base_output.to_path_buf();
    }
    let parent = base_output.parent().unwrap_or(Path::new("."));
    let stem = base_output
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("merged");
    parent.join(format!("{stem}_{}.vpk", shard_index + 1))
}

fn path_sort_key(path: &str) -> String {
    path.to_ascii_lowercase()
}

fn path_token_for_tree(path: &str) -> String {
    if path.is_empty() {
        " ".to_string()
    } else {
        path.to_string()
    }
}

pub fn encode_presorted_vpk(sorted_rows: &[OutputRow]) -> Result<Vec<u8>> {
    if sorted_rows.is_empty() {
        return Err(VpkMergerError::Invalid {
            message: "no entries to encode".to_string(),
        });
    }

    let sorted: Vec<&OutputRow> = sorted_rows.iter().collect();
    let mut tree: Vec<u8> = Vec::new();
    let mut data: Vec<u8> = Vec::new();

    let mut i = 0usize;
    let n = sorted.len();

    while i < n {
        let ext = sorted[i].ext.as_str();
        tree.extend_from_slice(ext.as_bytes());
        tree.push(0);

        while i < n && sorted[i].ext.as_str() == ext {
            let path = sorted[i].path.as_str();
            let path_token = path_token_for_tree(path);
            tree.extend_from_slice(path_token.as_bytes());
            tree.push(0);

            while i < n && sorted[i].ext.as_str() == ext && sorted[i].path.as_str() == path {
                let row = sorted[i];
                tree.extend_from_slice(row.filename.as_bytes());
                tree.push(0);

                let offset = data.len() as u32;
                let length = row.payload.len() as u32;
                data.extend_from_slice(&row.payload);

                tree.extend_from_slice(&row.crc32.to_le_bytes());
                tree.extend_from_slice(&0u16.to_le_bytes());
                tree.extend_from_slice(&ARCHIVE_INDEX_INLINE.to_le_bytes());
                tree.extend_from_slice(&offset.to_le_bytes());
                tree.extend_from_slice(&length.to_le_bytes());
                tree.extend_from_slice(&ENTRY_TERMINATOR.to_le_bytes());

                i += 1;
            }

            tree.push(0);
        }

        tree.push(0);
    }

    tree.push(0);

    let tree_len = tree.len();
    if tree_len > u32::MAX as usize {
        return Err(VpkMergerError::Invalid {
            message: "merged directory tree too large".to_string(),
        });
    }
    let data_len = data.len();
    if data_len > u32::MAX as usize {
        return Err(VpkMergerError::Invalid {
            message: "merged file data section too large".to_string(),
        });
    }

    let mut out: Vec<u8> = Vec::with_capacity(28 + tree_len + data_len);
    out.extend_from_slice(&VPK_SIGNATURE.to_le_bytes());
    out.extend_from_slice(&VPK_VERSION.to_le_bytes());
    out.extend_from_slice(&(tree_len as u32).to_le_bytes());
    out.extend_from_slice(&(data_len as u32).to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(&tree);
    out.extend_from_slice(&data);

    Ok(out)
}

pub fn encode_merged_vpk(rows: &[OutputRow]) -> Result<Vec<u8>> {
    let mut owned = rows.to_vec();
    sort_output_rows(&mut owned);
    encode_presorted_vpk(&owned)
}

pub fn write_merged_vpk(output_path: &Path, rows: &[OutputRow]) -> Result<u64> {
    let bytes = encode_merged_vpk(rows)?;
    let len = bytes.len() as u64;
    fs::write(output_path, &bytes)?;
    Ok(len)
}

fn max_presorted_end(rows: &[OutputRow], start: usize, max_bytes: u64) -> Result<usize> {
    let n = rows.len();
    if start >= n {
        return Err(VpkMergerError::Invalid {
            message: "empty shard range".to_string(),
        });
    }
    let one = encode_presorted_vpk(&rows[start..start + 1])?;
    if one.len() as u64 > max_bytes {
        return Err(VpkMergerError::Invalid {
            message: format!(
                "single merged entry needs {} bytes, exceeds per-file limit {}",
                one.len(),
                max_bytes
            ),
        });
    }
    let mut lo = start + 1;
    let mut hi = n;
    while lo < hi {
        let mid = lo + (hi - lo).div_ceil(2);
        let enc = encode_presorted_vpk(&rows[start..mid])?;
        if enc.len() as u64 <= max_bytes {
            lo = mid;
        } else {
            hi = mid - 1;
        }
    }
    Ok(lo)
}

pub fn write_sharded_presorted_vpk_files(
    base_output: &Path,
    rows: &[OutputRow],
    max_bytes: u64,
) -> Result<Vec<(PathBuf, u64)>> {
    if rows.is_empty() {
        return Err(VpkMergerError::Invalid {
            message: "no entries to write".to_string(),
        });
    }
    let mut written: Vec<(PathBuf, u64)> = Vec::new();
    let mut start = 0usize;
    let mut shard_idx = 0u32;
    while start < rows.len() {
        let end = max_presorted_end(rows, start, max_bytes)?;
        let path = output_path_for_shard(base_output, shard_idx);
        let enc = encode_presorted_vpk(&rows[start..end])?;
        fs::write(&path, &enc)?;
        written.push((path, enc.len() as u64));
        start = end;
        shard_idx += 1;
    }
    Ok(written)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    use vpk_parser::{VpkParseOptions, VpkParser};

    fn row(payload: &[u8], name: &str, ext: &str) -> OutputRow {
        OutputRow {
            ext: ext.to_string(),
            path: String::new(),
            filename: name.to_string(),
            crc32: crc32fast::hash(payload),
            payload: payload.to_vec(),
        }
    }

    #[test]
    fn merged_roundtrips_through_vpk_parser() {
        let dir = tempdir().unwrap();
        let out = dir.path().join("merged.vpk");
        let payload = b"hello-valve".to_vec();
        let crc = crc32fast::hash(&payload);
        let rows = vec![OutputRow {
            ext: "txt".into(),
            path: String::new(),
            filename: "sample".into(),
            crc32: crc,
            payload,
        }];
        write_merged_vpk(&out, &rows).unwrap();
        let buf = std::fs::read(&out).unwrap();
        let opts = VpkParseOptions {
            include_full_file_hash: false,
            include_merkle: false,
            file_path: out.display().to_string(),
            last_modified: None,
            include_entries: true,
        };
        let parsed = VpkParser::parse(buf, opts).unwrap();
        assert_eq!(parsed.version, 2);
        assert_eq!(parsed.entries.len(), 1);
        assert_eq!(parsed.entries[0].full_path, "sample.txt");
        assert_eq!(parsed.entries[0].crc32_hex, format!("{crc:08x}"));
    }

    #[test]
    fn sharding_splits_at_limit() {
        let dir = tempdir().unwrap();
        let base = dir.path().join("out.vpk");
        let small = vec![0u8; 400];
        let mut rows: Vec<OutputRow> = (0u8..8)
            .map(|i| row(&small, &format!("f{i}"), "txt"))
            .collect();
        sort_output_rows(&mut rows);
        let max_bytes: u64 = 2500;
        let files = write_sharded_presorted_vpk_files(&base, &rows, max_bytes).unwrap();
        assert!(
            files.len() >= 2,
            "expected multiple shards, got {}",
            files.len()
        );
        for (_, sz) in &files {
            assert!(*sz <= max_bytes);
        }
    }

    #[test]
    fn output_path_for_shard_naming() {
        let p = PathBuf::from("merged.vpk");
        assert_eq!(output_path_for_shard(&p, 0), PathBuf::from("merged.vpk"));
        assert_eq!(output_path_for_shard(&p, 1), PathBuf::from("merged_2.vpk"));
        assert_eq!(output_path_for_shard(&p, 2), PathBuf::from("merged_3.vpk"));
    }
}
