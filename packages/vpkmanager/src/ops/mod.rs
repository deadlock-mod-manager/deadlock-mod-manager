//! Every filesystem operation the mod manager performs on a profile's VPKs.
//!
//! This is the only code that renames, copies or deletes a file inside a
//! `citadel/addonsN` directory. Callers describe what they want — enable this
//! mod, disable that one, reorder all of them — and get back the filenames that
//! resulted; they never build a path into an addons folder themselves.
//!
//! Two rules hold throughout. Every operation is transactional: it either
//! finishes or leaves the profile as it found it, using the guards in
//! [`crate::staging`]. And every VPK that enters a profile through
//! [`import::copy_vpks_with_prefix`] is fingerprinted on the way in, so from
//! that moment the file can be recognized wherever it later ends up.

mod import;
mod reorder;
mod toggle;

pub use import::{
    PrefixedVpkCopy, PrefixedVpkCopyStatus, copy_named_vpks_with_prefix, copy_vpks_with_prefix,
    delete_unmanaged_vpk, find_prefixed_vpks, stage_copy_vpks_with_prefix,
};
pub use reorder::{
    ShardReorderOutcome, prune_empty_shard_dirs, reorder_vpks_sharded, stage_reorder_vpks_sharded,
};
pub use toggle::{
    disable_vpks_in, enable_vpks_in, stage_clear_all_vpks, stage_enabled_vpk_swap,
    stage_replace_vpks,
};

use crate::profile::ShardIndex;

/// Final placement of a mod's enabled VPKs after a sharded reorder.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShardPlacement {
    pub mod_id: String,
    /// 1-based shard index the VPKs now live in.
    pub shard: ShardIndex,
    /// New `pak##_dir.vpk` filenames within that shard, in order.
    pub vpks: Vec<String>,
}

/// One mod's enabled VPKs, as the caller currently believes them to be placed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShardAssignment {
    pub mod_id: String,
    pub shard: ShardIndex,
    pub vpks: Vec<String>,
}

/// Which of a mod's variants to enable, and which one is enabled now.
pub struct SwapRequest<'a> {
    pub base: &'a crate::profile::ProfileBase,
    pub current_shard: ShardIndex,
    pub target_shard: ShardIndex,
    pub mod_id: &'a str,
    pub current_installed_vpks: &'a [String],
    pub current_original_names: &'a [String],
    pub selected_original_names: &'a [String],
}

/// How to handle enabled VPK files that are recorded but missing on disk.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MissingVpkPolicy {
    /// Fail if any recorded enabled VPK file is missing (variant switch, swap).
    Strict,
    /// Filter missing files, warn, and proceed with those that exist (uninstall/disable).
    Reconcile,
}

#[cfg(test)]
mod test_support {
    use crate::profile::ProfileBase;
    use std::fs;
    use std::path::{Path, PathBuf};

    pub fn write_vpk(dir: &Path, name: &str) {
        fs::write(dir.join(name), b"test vpk").unwrap();
    }

    /// `ProfileBase` only accepts `citadel/addons`-rooted paths, so tests that
    /// reach the shard layout need a real addons tree rather than a bare tempdir.
    pub fn addons_base(temp: &tempfile::TempDir) -> PathBuf {
        let addons_path = temp.path().join("citadel").join("addons");
        fs::create_dir_all(&addons_path).unwrap();
        addons_path
    }

    pub fn profile(temp: &tempfile::TempDir) -> ProfileBase {
        ProfileBase::new(addons_base(temp)).unwrap()
    }

    /// A real, packable VPK — needed wherever an operation reads the file
    /// rather than just moving it.
    pub fn real_vpk(path: &Path) {
        let source = path.with_extension("src");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("asset.txt"), path.to_string_lossy().as_bytes()).unwrap();
        crate::pack::pack_directory(&source, path).unwrap();
        fs::remove_dir_all(&source).unwrap();
    }
}
