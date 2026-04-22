use std::collections::HashMap;

use crate::last_wins::ModRebuildInput;
use crate::manifest::{BucketEntry, CompressionLevel};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BucketSpec {
    pub id: u32,
    pub mod_ids: Vec<String>,
}

pub fn plan_full_rebuild(inputs: &[ModRebuildInput], level: CompressionLevel) -> Vec<BucketSpec> {
    if inputs.is_empty() {
        return Vec::new();
    }
    let mut sorted: Vec<ModRebuildInput> = inputs.to_vec();
    sorted.sort_by_key(|i| i.load_order);
    let cap = level.mods_per_bucket().unwrap_or(sorted.len().max(1));
    let mut out: Vec<BucketSpec> = Vec::new();
    let mut id: u32 = 1;
    let mut i = 0usize;
    while i < sorted.len() {
        let end = (i + cap).min(sorted.len());
        let mod_ids: Vec<String> = sorted[i..end].iter().map(|m| m.mod_id.clone()).collect();
        out.push(BucketSpec { id, mod_ids });
        id += 1;
        i = end;
    }
    out
}

pub fn find_bucket_id_for_mod(buckets: &[BucketEntry], mod_id: &str) -> Option<u32> {
    for b in buckets {
        if b.mod_ids.iter().any(|m| m == mod_id) {
            return Some(b.id);
        }
    }
    None
}

pub fn insert_mod_into_next_slot(
    buckets: &mut Vec<BucketEntry>,
    level: CompressionLevel,
    mod_id: &str,
) -> u32 {
    if let Some(id) = find_bucket_id_for_mod(buckets, mod_id) {
        return id;
    }
    let mid = mod_id.to_string();
    if level == CompressionLevel::Extreme {
        if buckets.is_empty() {
            buckets.push(BucketEntry {
                id: 1,
                mod_ids: vec![mid],
                shard_files: Vec::new(),
            });
            return 1;
        }
        let b = &mut buckets[0];
        if !b.mod_ids.contains(&mid) {
            b.mod_ids.push(mid);
        }
        return b.id;
    }
    if let Some(c) = level.mods_per_bucket() {
        for b in buckets.iter_mut() {
            if b.mod_ids.len() < c && !b.mod_ids.iter().any(|m| m == mod_id) {
                b.mod_ids.push(mid.clone());
                return b.id;
            }
        }
    }
    let next_id = next_bucket_id(buckets);
    buckets.push(BucketEntry {
        id: next_id,
        mod_ids: vec![mod_id.to_string()],
        shard_files: Vec::new(),
    });
    next_id
}

pub fn remove_mod_from_buckets(buckets: &mut Vec<BucketEntry>, mod_id: &str) -> Option<u32> {
    let mut contained_bucket: Option<u32> = None;
    for b in buckets.iter_mut() {
        if b.mod_ids.iter().any(|m| m == mod_id) {
            contained_bucket = Some(b.id);
        }
        b.mod_ids.retain(|m| m != mod_id);
    }
    buckets.retain(|b| !b.mod_ids.is_empty());
    contained_bucket
}

pub fn next_bucket_id(buckets: &[BucketEntry]) -> u32 {
    buckets
        .iter()
        .map(|b| b.id)
        .max()
        .map(|m| m + 1)
        .unwrap_or(1)
}

pub fn sort_bucket_mod_ids_by_load_order(
    mod_ids: &mut Vec<String>,
    load_order: &HashMap<String, u32>,
) {
    mod_ids.sort_by_key(|id| load_order.get(id.as_str()).copied().unwrap_or(u32::MAX));
}
