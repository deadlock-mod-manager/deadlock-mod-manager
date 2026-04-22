use std::fs;
use std::path::{Path, PathBuf};

use crate::error::{Result, VpkMergerError};
use crate::last_wins::{merge_mod_inputs_last_wins, ModRebuildInput};
use crate::manifest::{CompressionManifest, ModManifestEntry};
use crate::progress::{CancelToken, ProgressSink};
use crate::write::{
    encode_presorted_vpk, output_path_for_shard, sort_output_rows, OutputRow, MAX_MERGED_VPK_BYTES,
};

pub struct RebuildReport {
    pub entry_count: usize,
    pub output_files: Vec<(PathBuf, u64)>,
    pub manifest: CompressionManifest,
}

pub fn rebuild_addon_compressed(
    inputs: &[ModRebuildInput],
    output_base: &Path,
    max_bytes: u64,
    base_name: &str,
    cancel: &CancelToken,
    progress: &dyn ProgressSink,
) -> Result<RebuildReport> {
    cancel.check()?;
    let total_steps = inputs.len().max(1) as u64;
    progress.report(0, total_steps);

    let merged = merge_mod_inputs_last_wins(inputs)?;
    progress.report(total_steps / 2, total_steps);
    cancel.check()?;

    let entry_count = merged.rows.len();
    let mut manifest = CompressionManifest::new(base_name.to_string(), max_bytes);
    manifest.mods = merged.per_mod;

    let parent = output_base
        .parent()
        .ok_or_else(|| VpkMergerError::Invalid {
            message: "output base has no parent".to_string(),
        })?;
    fs::create_dir_all(parent)?;

    let rows = merged.rows;
    let output_files = write_sharded_presorted_vpk_files_atomic(output_base, &rows, max_bytes, cancel)?;

    manifest.shard_files = output_files
        .iter()
        .map(|(p, _)| {
            p.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default()
        })
        .collect();

    progress.report(total_steps, total_steps);

    Ok(RebuildReport {
        entry_count,
        output_files,
        manifest,
    })
}

fn write_sharded_presorted_vpk_files_atomic(
    base_output: &Path,
    rows: &[OutputRow],
    max_bytes: u64,
    cancel: &CancelToken,
) -> Result<Vec<(PathBuf, u64)>> {
    if rows.is_empty() {
        return Err(VpkMergerError::Invalid {
            message: "no entries to write".to_string(),
        });
    }

    let mut sorted: Vec<OutputRow> = rows.to_vec();
    sort_output_rows(&mut sorted);

    let n = sorted.len();
    let mut start = 0usize;
    let mut shard_idx = 0u32;
    let mut written: Vec<(PathBuf, u64)> = Vec::new();

    while start < n {
        cancel.check()?;
        let end = max_presorted_end(&sorted, start, max_bytes)?;
        let path = output_path_for_shard(base_output, shard_idx);
        let enc = encode_presorted_vpk(&sorted[start..end])?;
        let tmp = path.with_extension("vpk.tmp");
        if let Some(dir) = tmp.parent() {
            fs::create_dir_all(dir)?;
        }
        fs::write(&tmp, &enc)?;
        fs::rename(&tmp, &path).map_err(|e| {
            let _ = fs::remove_file(&tmp);
            VpkMergerError::Io(e)
        })?;
        written.push((path, enc.len() as u64));
        start = end;
        shard_idx += 1;
    }

    Ok(written)
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

pub fn write_manifest_atomic(path: &Path, manifest: &CompressionManifest) -> Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let json = serde_json::to_string_pretty(manifest).map_err(|e| VpkMergerError::Invalid {
        message: format!("manifest json: {e}"),
    })?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json.as_bytes())?;
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        VpkMergerError::Io(e)
    })?;
    Ok(())
}

pub fn read_manifest(path: &Path) -> Result<CompressionManifest> {
    let data = fs::read_to_string(path)?;
    let m: CompressionManifest = serde_json::from_str(&data).map_err(|e| {
        VpkMergerError::Invalid {
            message: format!("manifest parse: {e}"),
        }
    })?;
    Ok(m)
}

pub fn default_max_shard_bytes() -> u64 {
    MAX_MERGED_VPK_BYTES
}

pub fn replace_mod_in_manifest(
    manifest: &mut CompressionManifest,
    mod_id: &str,
    entry: ModManifestEntry,
) {
    manifest.mods.insert(mod_id.to_string(), entry);
}

pub fn remove_mod_from_manifest(manifest: &mut CompressionManifest, mod_id: &str) {
    manifest.mods.remove(mod_id);
}
