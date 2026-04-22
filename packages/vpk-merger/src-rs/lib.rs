mod bin_pack;
mod bucket_plan;
mod discover;
mod error;
mod filter;
mod incremental;
mod last_wins;
mod manifest;
mod merge;
mod preflight;
mod progress;
mod read;
mod write;

pub use bin_pack::{encoded_size_for_rows, pick_shard_for_new_mod};
pub use bucket_plan::{
    find_bucket_id_for_mod, insert_mod_into_next_slot, next_bucket_id, plan_full_rebuild,
    remove_mod_from_buckets, sort_bucket_mod_ids_by_load_order, BucketSpec,
};
pub use discover::collect_dir_vpks;
pub use error::{VpkMergerError, Result as VpkMergerResult};
pub use incremental::{
    apply_bucket_rebuild, apply_bucket_id_to_mod_entries, default_max_shard_bytes,
    drop_bucket_from_manifest, read_manifest, rebuild_addon_compressed, rebuild_addon_compressed_bucketing,
    rebuild_bucket, remove_mod_from_manifest, replace_mod_in_manifest, write_manifest_atomic,
    BucketRebuildReport, RebuildReport,
};
pub use last_wins::{merge_mod_inputs_last_wins, LastWinsMergeResult, ModRebuildInput};
pub use manifest::{
    manifest_dir_under_addons, manifest_path, parse_manifest_json, BucketEntry,
    CompressionLevel, CompressionManifest, ModManifestEntry, MANIFEST_VERSION,
};
pub use merge::{
    default_output_path, merge_vpks, MergeOptions, MergeReport, DEFAULT_MAX_OUTPUT_VPK_BYTES,
};
pub use preflight::{ExcludedVpk, PreflightResult, run_preflight};
pub use progress::{CancelToken, NoProgress, ProgressSink};
pub use read::{load_dir_vpk, manifest_key, LoadedEntry};
pub use write::{
    encode_merged_vpk, encode_presorted_vpk, sort_output_rows, write_merged_vpk,
    write_sharded_presorted_vpk_files, OutputRow, MAX_MERGED_VPK_BYTES,
};

#[cfg(test)]
mod tests;
