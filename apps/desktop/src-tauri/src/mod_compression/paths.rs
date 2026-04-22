use std::path::{Path, PathBuf};

pub fn compression_staged_dir(mods_store: &Path, mod_id: &str) -> PathBuf {
  mods_store.join(mod_id).join("compression").join("staged_vpks")
}

pub fn manifest_merge_base_name() -> &'static str {
  "deadlock-compression"
}
