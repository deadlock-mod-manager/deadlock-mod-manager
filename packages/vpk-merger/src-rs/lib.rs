mod discover;
mod error;
mod filter;
mod merge;
mod preflight;
mod read;
mod write;

pub use discover::collect_dir_vpks;
pub use error::{VpkMergerError, Result as VpkMergerResult};
pub use merge::{
    default_output_path, merge_vpks, MergeOptions, MergeReport, DEFAULT_MAX_OUTPUT_VPK_BYTES,
};
pub use preflight::{ExcludedVpk, PreflightResult, run_preflight};
pub use read::{load_dir_vpk, manifest_key, LoadedEntry};
pub use write::{
    encode_merged_vpk, encode_presorted_vpk, sort_output_rows, write_merged_vpk,
    write_sharded_presorted_vpk_files, OutputRow, MAX_MERGED_VPK_BYTES,
};
