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
    BucketSpec, find_bucket_id_for_mod, insert_mod_into_next_slot, next_bucket_id,
    plan_full_rebuild, remove_mod_from_buckets, sort_bucket_mod_ids_by_load_order,
};
pub use discover::collect_dir_vpks;
pub use error::{Result as VpkMergerResult, VpkMergerError};
pub use incremental::{
    BucketRebuildReport, RebuildReport, apply_bucket_id_to_mod_entries, apply_bucket_rebuild,
    default_max_shard_bytes, drop_bucket_from_manifest, read_manifest, rebuild_addon_compressed,
    rebuild_addon_compressed_bucketing, rebuild_bucket, remove_mod_from_manifest,
    replace_mod_in_manifest, write_manifest_atomic,
};
pub use last_wins::{LastWinsMergeResult, ModRebuildInput, merge_mod_inputs_last_wins};
pub use manifest::{
    BucketEntry, CompressionLevel, CompressionManifest, MANIFEST_VERSION, ModManifestEntry,
    manifest_dir_under_addons, manifest_path, parse_manifest_json,
};
pub use merge::{
    DEFAULT_MAX_OUTPUT_VPK_BYTES, MergeOptions, MergeReport, default_output_path, merge_vpks,
};
pub use preflight::{ExcludedVpk, PreflightResult, run_preflight};
pub use progress::{CancelToken, NoProgress, ProgressSink};
pub use read::{LoadedEntry, load_dir_vpk, manifest_key};
pub use write::{
    MAX_MERGED_VPK_BYTES, OutputRow, encode_merged_vpk, encode_presorted_vpk, sort_output_rows,
    write_merged_vpk, write_sharded_presorted_vpk_files,
};

#[cfg(test)]
mod tests;
