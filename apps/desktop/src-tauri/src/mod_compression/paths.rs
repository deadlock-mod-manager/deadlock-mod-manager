use std::path::{Path, PathBuf};

/// Base directory name for merged compression manifests. See SECURITY.md.
pub const MANIFEST_MERGE_BASE_NAME: &str = "deadlock-compression";

pub fn compression_staged_dir(mods_store: &Path, mod_id: &str) -> PathBuf {
  mods_store
    .join(mod_id)
    .join("compression")
    .join("staged_vpks")
}

pub fn manifest_merge_base_name() -> &'static str {
  MANIFEST_MERGE_BASE_NAME
}
