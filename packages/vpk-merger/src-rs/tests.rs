use std::collections::HashMap;

use crate::bucket_plan::{
    BucketSpec, insert_mod_into_next_slot, plan_full_rebuild, remove_mod_from_buckets,
};
use crate::incremental::apply_bucket_rebuild;
use crate::last_wins::ModRebuildInput;
use crate::manifest::{
    BucketEntry, CompressionLevel, CompressionManifest, MANIFEST_VERSION, ModManifestEntry,
    parse_manifest_json,
};

#[test]
fn parse_manifest_v1_migrates_to_v2_single_bucket_extreme() {
    let json = r#"{
        "version": 1,
        "base_name": "deadlock-compression",
        "max_shard_bytes": 100,
        "shard_files": ["pak01_dir.vpk"],
        "mods": {
            "b": { "load_order": 2, "original_vpk_names": [], "asset_keys": [], "blake3_fingerprint": null },
            "a": { "load_order": 1, "original_vpk_names": [], "asset_keys": [], "blake3_fingerprint": null }
        }
    }"#;
    let m = parse_manifest_json(json).expect("parse");
    assert_eq!(m.version, MANIFEST_VERSION);
    assert_eq!(m.compression_level, CompressionLevel::Extreme);
    assert_eq!(m.buckets.len(), 1);
    assert_eq!(m.buckets[0].id, 1);
    assert_eq!(m.buckets[0].shard_files, vec!["pak01_dir.vpk"]);
    assert_eq!(m.buckets[0].mod_ids, vec!["a", "b"]);
    assert_eq!(m.mods.get("a").expect("a").bucket_id, 1);
    assert_eq!(m.mods.get("b").expect("b").bucket_id, 1);
}

#[test]
fn plan_full_rebuild_low_chunks_by_two_in_load_order() {
    let inputs = vec![
        ModRebuildInput {
            mod_id: "c".into(),
            load_order: 3,
            dir_vpk_paths: vec![],
            original_vpk_names: vec![],
        },
        ModRebuildInput {
            mod_id: "a".into(),
            load_order: 1,
            dir_vpk_paths: vec![],
            original_vpk_names: vec![],
        },
        ModRebuildInput {
            mod_id: "b".into(),
            load_order: 2,
            dir_vpk_paths: vec![],
            original_vpk_names: vec![],
        },
    ];
    let specs = plan_full_rebuild(&inputs, CompressionLevel::Low);
    assert_eq!(
        specs,
        vec![
            BucketSpec {
                id: 1,
                mod_ids: vec!["a".into(), "b".into()],
            },
            BucketSpec {
                id: 2,
                mod_ids: vec!["c".into()],
            },
        ]
    );
}

#[test]
fn remove_mod_from_buckets_returns_containing_bucket_id() {
    let mut buckets = vec![
        BucketEntry {
            id: 1,
            mod_ids: vec!["a".into(), "b".into()],
            shard_files: vec![],
        },
        BucketEntry {
            id: 2,
            mod_ids: vec!["c".into()],
            shard_files: vec![],
        },
    ];
    assert_eq!(remove_mod_from_buckets(&mut buckets, "a"), Some(1u32));
    assert_eq!(buckets.len(), 2);
    assert_eq!(buckets[0].mod_ids, vec!["b"]);
}

#[test]
fn apply_bucket_rebuild_drops_stale_mods_for_that_bucket() {
    let mut manifest = CompressionManifest::new("x".into(), 100, CompressionLevel::Low);
    manifest.buckets.push(BucketEntry {
        id: 1,
        mod_ids: vec!["a".into(), "ghost".into()],
        shard_files: vec!["old.vpk".into()],
    });
    manifest.mods.insert(
        "a".into(),
        ModManifestEntry {
            load_order: 1,
            original_vpk_names: vec![],
            asset_keys: vec![],
            blake3_fingerprint: None,
            bucket_id: 1,
        },
    );
    manifest.mods.insert(
        "ghost".into(),
        ModManifestEntry {
            load_order: 2,
            original_vpk_names: vec![],
            asset_keys: vec![],
            blake3_fingerprint: None,
            bucket_id: 1,
        },
    );
    let mut per_mod = HashMap::new();
    per_mod.insert(
        "a".into(),
        ModManifestEntry {
            load_order: 1,
            original_vpk_names: vec![],
            asset_keys: vec![],
            blake3_fingerprint: None,
            bucket_id: 1,
        },
    );
    let br = crate::incremental::BucketRebuildReport {
        bucket_id: 1,
        entry_count: 1,
        output_files: vec![],
        shard_file_names: vec!["new.vpk".into()],
        mod_manifest_entries: per_mod,
    };
    apply_bucket_rebuild(&mut manifest, CompressionLevel::Low, &br);
    assert!(!manifest.mods.contains_key("ghost"));
    assert_eq!(manifest.buckets[0].mod_ids, vec!["a"]);
    assert_eq!(manifest.buckets[0].shard_files, vec!["new.vpk"]);
}

#[test]
fn insert_mod_into_next_slot_respects_capacity_without_duplicate() {
    let mut buckets = vec![BucketEntry {
        id: 1,
        mod_ids: vec!["a".into()],
        shard_files: vec![],
    }];
    let id = insert_mod_into_next_slot(&mut buckets, CompressionLevel::Low, "b");
    assert_eq!(id, 1);
    assert_eq!(buckets[0].mod_ids.len(), 2);
    let id2 = insert_mod_into_next_slot(&mut buckets, CompressionLevel::Low, "b");
    assert_eq!(id2, 1);
    assert_eq!(buckets[0].mod_ids.len(), 2);
}
