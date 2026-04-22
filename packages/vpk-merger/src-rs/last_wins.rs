use std::collections::HashMap;

use crc32fast::hash as crc32_hash;
use rayon::prelude::*;

use crate::error::{Result, VpkMergerError};
use crate::filter::is_ignored_readme;
use crate::manifest::ModManifestEntry;
use crate::read::{load_dir_vpk, manifest_key, LoadedEntry};
use crate::write::{sort_output_rows, OutputRow};

#[derive(Debug, Clone)]
pub struct ModRebuildInput {
    pub mod_id: String,
    pub load_order: u32,
    pub dir_vpk_paths: Vec<std::path::PathBuf>,
    pub original_vpk_names: Vec<String>,
}

#[derive(Clone)]
struct TaggedEntry {
    load_order: u32,
    mod_id: String,
    key: String,
    path: String,
    filename: String,
    ext: String,
    payload: Vec<u8>,
}

pub struct LastWinsMergeResult {
    pub rows: Vec<OutputRow>,
    pub per_mod: HashMap<String, ModManifestEntry>,
}

fn full_path_for_entry(path: &str, filename: &str, ext: &str) -> String {
    let normalized_path = if path == " " { "" } else { path };
    let filename_with_ext = format!("{filename}.{ext}");
    let path_parts: Vec<&str> = [normalized_path, &filename_with_ext]
        .iter()
        .filter(|s| !s.is_empty())
        .copied()
        .collect();
    path_parts.join("/")
}

pub fn merge_mod_inputs_last_wins(inputs: &[ModRebuildInput]) -> Result<LastWinsMergeResult> {
    if inputs.is_empty() {
        return Err(VpkMergerError::Invalid {
            message: "no mods to merge".to_string(),
        });
    }

    let load_results: Vec<Result<Vec<TaggedEntry>>> = inputs
        .par_iter()
        .map(|inp| load_one_mod(inp))
        .collect();

    let mut tagged: Vec<TaggedEntry> = Vec::new();
    for r in load_results {
        tagged.extend(r?);
    }

    tagged.sort_by(|a, b| {
        a.key
            .cmp(&b.key)
            .then_with(|| b.load_order.cmp(&a.load_order))
            .then_with(|| b.mod_id.cmp(&a.mod_id))
    });

    let mut winners: Vec<TaggedEntry> = Vec::new();
    let mut i = 0usize;
    while i < tagged.len() {
        winners.push(tagged[i].clone());
        let current_key = tagged[i].key.clone();
        i += 1;
        while i < tagged.len() && tagged[i].key == current_key {
            i += 1;
        }
    }

    let mut key_to_mod: HashMap<String, String> = HashMap::new();
    for w in &winners {
        key_to_mod.insert(w.key.clone(), w.mod_id.clone());
    }

    let mut rows: Vec<OutputRow> = Vec::with_capacity(winners.len());
    for w in winners {
        let crc32 = crc32_hash(&w.payload);
        rows.push(OutputRow {
            ext: w.ext,
            path: w.path,
            filename: w.filename,
            crc32,
            payload: w.payload,
        });
    }

    sort_output_rows(&mut rows);

    let mut per_mod: HashMap<String, ModManifestEntry> = HashMap::new();
    for inp in inputs {
        let keys: Vec<String> = key_to_mod
            .iter()
            .filter(|(_, mid)| mid.as_str() == inp.mod_id.as_str())
            .map(|(k, _)| k.clone())
            .collect();

        let fingerprint = blake3_mod_fingerprint(&rows, inp.mod_id.as_str(), &key_to_mod);
        per_mod.insert(
            inp.mod_id.clone(),
            ModManifestEntry {
                load_order: inp.load_order,
                original_vpk_names: inp.original_vpk_names.clone(),
                asset_keys: keys,
                blake3_fingerprint: Some(fingerprint),
                bucket_id: 0,
            },
        );
    }

    Ok(LastWinsMergeResult { rows, per_mod })
}

fn blake3_mod_fingerprint(
    rows: &[OutputRow],
    mod_id: &str,
    key_to_mod: &HashMap<String, String>,
) -> String {
    let mut keys: Vec<String> = rows
        .iter()
        .filter_map(|r| {
            let fp = full_path_for_entry(&r.path, &r.filename, &r.ext);
            let mk = manifest_key(&fp);
            if key_to_mod.get(&mk).map(|m| m.as_str()) == Some(mod_id) {
                Some(mk)
            } else {
                None
            }
        })
        .collect();
    keys.sort();
    keys.dedup();

    let mut buf: Vec<u8> = Vec::new();
    for k in keys {
        buf.extend_from_slice(k.as_bytes());
        if let Some(row) = rows.iter().find(|r| {
            let fp = full_path_for_entry(&r.path, &r.filename, &r.ext);
            manifest_key(&fp) == k
        }) {
            buf.extend_from_slice(&row.payload);
        }
    }
    let hash = blake3::hash(&buf);
    hash.to_hex().to_string()
}

fn load_one_mod(inp: &ModRebuildInput) -> Result<Vec<TaggedEntry>> {
    let mut out = Vec::new();
    for path in &inp.dir_vpk_paths {
        let entries: Vec<LoadedEntry> = load_dir_vpk(path)?;
        for item in entries {
            if is_ignored_readme(&item.meta) {
                continue;
            }
            let key = manifest_key(&item.meta.full_path);
            out.push(TaggedEntry {
                load_order: inp.load_order,
                mod_id: inp.mod_id.clone(),
                key,
                path: item.meta.path.clone(),
                filename: item.meta.filename.clone(),
                ext: item.meta.ext.clone(),
                payload: item.payload,
            });
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merge_empty_inputs_errors() {
        let r = merge_mod_inputs_last_wins(&[]);
        assert!(r.is_err());
    }
}
