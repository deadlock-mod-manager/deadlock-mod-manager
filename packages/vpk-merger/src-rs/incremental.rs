use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use rayon::prelude::*;

use crate::bucket_plan::{BucketSpec, plan_full_rebuild};
use crate::error::{Result, VpkMergerError};
use crate::last_wins::{ModRebuildInput, merge_mod_inputs_last_wins};
use crate::manifest::{
    BucketEntry, CompressionLevel, CompressionManifest, ModManifestEntry, parse_manifest_json,
};
use crate::progress::{CancelToken, ProgressSink};
use crate::write::{
    MAX_MERGED_VPK_BYTES, OutputRow, encode_presorted_vpk, output_path_for_shard, sort_output_rows,
};

pub struct RebuildReport {
    pub entry_count: usize,
    pub output_files: Vec<(PathBuf, u64)>,
    pub manifest: CompressionManifest,
    pub bucket_reports: Vec<BucketRebuildReport>,
}

pub struct BucketRebuildReport {
    pub bucket_id: u32,
    pub entry_count: usize,
    pub output_files: Vec<(PathBuf, u64)>,
    pub shard_file_names: Vec<String>,
    pub mod_manifest_entries: HashMap<String, ModManifestEntry>,
}

pub fn apply_bucket_id_to_mod_entries(
    entries: &mut HashMap<String, ModManifestEntry>,
    bucket_id: u32,
) {
    for e in entries.values_mut() {
        e.bucket_id = bucket_id;
    }
}

pub fn rebuild_bucket(
    bucket_id: u32,
    inputs: &[ModRebuildInput],
    output_base: &Path,
    max_bytes: u64,
    cancel: &CancelToken,
) -> Result<BucketRebuildReport> {
    if inputs.is_empty() {
        return Err(VpkMergerError::Invalid {
            message: "bucket has no inputs".to_string(),
        });
    }
    cancel.check()?;
    let merged = merge_mod_inputs_last_wins(inputs)?;
    cancel.check()?;
    let entry_count = merged.rows.len();
    let mut mod_manifest_entries = merged.per_mod;
    apply_bucket_id_to_mod_entries(&mut mod_manifest_entries, bucket_id);
    let parent = output_base
        .parent()
        .ok_or_else(|| VpkMergerError::Invalid {
            message: "output base has no parent".to_string(),
        })?;
    fs::create_dir_all(parent)?;
    let rows = merged.rows;
    let output_files =
        write_sharded_presorted_vpk_files_atomic(output_base, &rows, max_bytes, cancel)?;
    let shard_file_names: Vec<String> = output_files
        .iter()
        .map(|(p, _)| {
            p.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default()
        })
        .collect();
    Ok(BucketRebuildReport {
        bucket_id,
        entry_count,
        output_files,
        shard_file_names,
        mod_manifest_entries,
    })
}

fn collect_inputs_for_bucket(
    all_by_id: &HashMap<String, ModRebuildInput>,
    spec: &BucketSpec,
) -> Result<Vec<ModRebuildInput>> {
    let mut v: Vec<ModRebuildInput> = Vec::new();
    for id in &spec.mod_ids {
        let inp = all_by_id.get(id).ok_or_else(|| VpkMergerError::Invalid {
            message: format!("unknown mod in bucket: {id}"),
        })?;
        v.push(inp.clone());
    }
    v.sort_by_key(|i| i.load_order);
    Ok(v)
}

fn build_manifest_from_bucket_reports(
    level: CompressionLevel,
    max_bytes: u64,
    base_name: &str,
    reports: &[BucketRebuildReport],
) -> Result<CompressionManifest> {
    let mut reports: Vec<&BucketRebuildReport> = reports.iter().collect();
    reports.sort_by_key(|r| r.bucket_id);
    let mut all_mods: HashMap<String, ModManifestEntry> = HashMap::new();
    for br in &reports {
        for (mid, e) in &br.mod_manifest_entries {
            let mut e = e.clone();
            e.bucket_id = br.bucket_id;
            all_mods.insert(mid.clone(), e);
        }
    }
    let mut buckets: Vec<BucketEntry> = Vec::new();
    for br in reports {
        let mut mod_ids: Vec<String> = br.mod_manifest_entries.keys().cloned().collect();
        mod_ids.sort_by_key(|id| all_mods.get(id).map(|e| e.load_order).unwrap_or(0));
        buckets.push(BucketEntry {
            id: br.bucket_id,
            mod_ids,
            shard_files: br.shard_file_names.clone(),
        });
    }
    let mut manifest = CompressionManifest::new(base_name.to_string(), max_bytes, level);
    manifest.buckets = buckets;
    manifest.mods = all_mods;
    Ok(manifest)
}

pub fn rebuild_addon_compressed_bucketing(
    inputs: &[ModRebuildInput],
    addons_path: &Path,
    level: CompressionLevel,
    max_bytes: u64,
    base_name: &str,
    cancel: &CancelToken,
) -> Result<RebuildReport> {
    cancel.check()?;
    if inputs.is_empty() {
        return Err(VpkMergerError::Invalid {
            message: "no mods to merge".to_string(),
        });
    }
    let specs: Vec<BucketSpec> = plan_full_rebuild(inputs, level);
    if specs.is_empty() {
        return Err(VpkMergerError::Invalid {
            message: "no buckets in plan".to_string(),
        });
    }
    let all_by_id: HashMap<String, ModRebuildInput> = inputs
        .iter()
        .map(|i| (i.mod_id.clone(), i.clone()))
        .collect();
    let _total_buckets = (specs.len() as u64).max(1u64);
    let bucket_reports: Result<Vec<BucketRebuildReport>> = specs
        .par_iter()
        .map(|spec| {
            cancel.check()?;
            let bucket_inputs = collect_inputs_for_bucket(&all_by_id, spec)?;
            let out_base = addons_path.join(format!("pak{:02}_dir.vpk", spec.id));
            rebuild_bucket(spec.id, &bucket_inputs, &out_base, max_bytes, cancel)
        })
        .collect();
    let bucket_reports = bucket_reports?;
    let entry_count: usize = bucket_reports.iter().map(|b| b.entry_count).sum();
    let mut all_output_files: Vec<(PathBuf, u64)> = Vec::new();
    for b in &bucket_reports {
        all_output_files.extend(b.output_files.iter().cloned());
    }
    let manifest =
        build_manifest_from_bucket_reports(level, max_bytes, base_name, &bucket_reports)?;
    Ok(RebuildReport {
        entry_count,
        output_files: all_output_files,
        manifest,
        bucket_reports,
    })
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
    let total_steps = (inputs.len().max(1)) as u64;
    progress.report(0, total_steps);
    let parent = output_base
        .parent()
        .ok_or_else(|| VpkMergerError::Invalid {
            message: "output base has no parent".to_string(),
        })?;
    let report = rebuild_addon_compressed_bucketing(
        inputs,
        parent,
        CompressionLevel::Extreme,
        max_bytes,
        base_name,
        cancel,
    )?;
    progress.report(total_steps, total_steps);
    Ok(report)
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
    parse_manifest_json(&data)
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

pub fn apply_bucket_rebuild(
    manifest: &mut CompressionManifest,
    level: CompressionLevel,
    br: &BucketRebuildReport,
) {
    let mut mod_ids: Vec<String> = br.mod_manifest_entries.keys().cloned().collect();
    mod_ids.sort_by_key(|id| {
        br.mod_manifest_entries
            .get(id)
            .map(|e| e.load_order)
            .unwrap_or(0)
    });
    if let Some(b) = manifest.buckets.iter_mut().find(|b| b.id == br.bucket_id) {
        b.shard_files = br.shard_file_names.clone();
        b.mod_ids = mod_ids;
    } else {
        manifest.buckets.push(BucketEntry {
            id: br.bucket_id,
            mod_ids,
            shard_files: br.shard_file_names.clone(),
        });
    }
    let new_ids: HashSet<&String> = br.mod_manifest_entries.keys().collect();
    manifest.mods.retain(|id, e| {
        if e.bucket_id != br.bucket_id {
            return true;
        }
        new_ids.contains(id)
    });
    for (id, e) in &br.mod_manifest_entries {
        let mut e = e.clone();
        e.bucket_id = br.bucket_id;
        manifest.mods.insert(id.clone(), e);
    }
    manifest.compression_level = level;
    manifest.version = crate::manifest::MANIFEST_VERSION;
}

pub fn drop_bucket_from_manifest(manifest: &mut CompressionManifest, bucket_id: u32) {
    manifest.buckets.retain(|b| b.id != bucket_id);
    manifest.mods.retain(|_, e| e.bucket_id != bucket_id);
}
