use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crc32fast::hash as crc32_hash;
use rayon::prelude::*;

use crate::discover::collect_dir_vpks;
use crate::error::{Result, VpkMergerError};
use crate::filter::is_ignored_readme;
use crate::preflight::{run_preflight, ExcludedVpk};
use crate::read::{load_dir_vpk, manifest_key};
use crate::write::{
    sort_output_rows, write_sharded_presorted_vpk_files, OutputRow, MAX_MERGED_VPK_BYTES,
};

pub struct MergeOptions {
    pub root: PathBuf,
    pub output: PathBuf,
    pub recursive: bool,
    pub dry_run: bool,
    pub max_output_vpk_bytes: u64,
}

pub struct MergeReport {
    pub source_vpks: Vec<PathBuf>,
    pub included_vpks: Vec<PathBuf>,
    pub excluded_vpks: Vec<ExcludedVpk>,
    pub entry_count: usize,
    pub output_files: Vec<(PathBuf, u64)>,
    pub dry_run: bool,
}

pub fn merge_vpks(options: MergeOptions) -> Result<MergeReport> {
    let sources = collect_dir_vpks(&options.root, options.recursive)?;
    if sources.is_empty() {
        return Err(VpkMergerError::Invalid {
            message: format!(
                "no *_dir.vpk files under {}",
                options.root.display()
            ),
        });
    }

    let preflight = run_preflight(&sources)?;

    for ex in &preflight.excluded {
        eprintln!(
            "skipping VPK {}: path \"{}\" already merged from {} (earlier *_dir.vpk wins by sort order)",
            ex.path.display(),
            ex.overlapping_key,
            ex.kept_in_vpk.display()
        );
    }

    if options.dry_run {
        return Ok(MergeReport {
            source_vpks: sources.clone(),
            included_vpks: preflight.included.clone(),
            excluded_vpks: preflight.excluded,
            entry_count: preflight.accepted_key_count,
            output_files: Vec::new(),
            dry_run: true,
        });
    }

    if preflight.included.is_empty() {
        return Err(VpkMergerError::Invalid {
            message: "all VPKs were excluded by path overlap; nothing to merge".to_string(),
        });
    }

    let indexed: Vec<
        std::result::Result<(PathBuf, Vec<crate::read::LoadedEntry>), VpkMergerError>,
    > = preflight
            .included
            .par_iter()
            .map(|p| load_dir_vpk(p).map(|entries| (p.clone(), entries)))
            .collect();

    let mut pairs: Vec<(PathBuf, Vec<crate::read::LoadedEntry>)> =
        Vec::with_capacity(indexed.len());
    for item in indexed {
        pairs.push(item?);
    }
    pairs.sort_by(|a, b| a.0.cmp(&b.0));

    type Key = String;
    let mut merged: HashMap<Key, (Vec<u8>, String, String, String)> = HashMap::new();

    for (_vpk_path, items) in pairs {
        for item in items {
            if is_ignored_readme(&item.meta) {
                continue;
            }
            let key = manifest_key(&item.meta.full_path);
            merged.insert(
                key,
                (
                    item.payload,
                    item.meta.path.clone(),
                    item.meta.filename.clone(),
                    item.meta.ext.clone(),
                ),
            );
        }
    }

    let mut rows: Vec<OutputRow> = Vec::with_capacity(merged.len());
    for (_key, (payload, path, filename, ext)) in merged {
        let crc32 = crc32_hash(&payload);
        rows.push(OutputRow {
            ext,
            path,
            filename,
            crc32,
            payload,
        });
    }

    sort_output_rows(&mut rows);
    let entry_count = rows.len();

    let output_files = write_sharded_presorted_vpk_files(
        &options.output,
        &rows,
        options.max_output_vpk_bytes,
    )?;

    Ok(MergeReport {
        source_vpks: sources,
        included_vpks: preflight.included,
        excluded_vpks: preflight.excluded,
        entry_count,
        output_files,
        dry_run: false,
    })
}

pub fn default_output_path(root: &Path, file_name: &str) -> PathBuf {
    root.join(file_name)
}

pub const DEFAULT_MAX_OUTPUT_VPK_BYTES: u64 = MAX_MERGED_VPK_BYTES;

#[cfg(test)]
mod tests {
    use super::is_ignored_readme;
    use vpk_parser::VpkEntry;

    fn entry(filename: &str, ext: &str) -> VpkEntry {
        let filename_with_ext = format!("{filename}.{ext}");
        let full_path = filename_with_ext.clone();
        VpkEntry {
            full_path,
            path: String::new(),
            filename: filename.to_string(),
            ext: ext.to_string(),
            crc32_hex: "00000000".to_string(),
            preload_bytes: 0,
            archive_index: 0x7fff,
            entry_offset: 0,
            entry_length: 0,
            terminator: 0xffff,
        }
    }

    #[test]
    fn readme_txt_skipped() {
        assert!(is_ignored_readme(&entry("README", "txt")));
    }

    #[test]
    fn readme_md_skipped() {
        assert!(is_ignored_readme(&entry("readme", "md")));
    }

    #[test]
    fn not_readme_kept() {
        assert!(!is_ignored_readme(&entry("readme_notes", "txt")));
        assert!(!is_ignored_readme(&entry("changelog", "md")));
    }
}
