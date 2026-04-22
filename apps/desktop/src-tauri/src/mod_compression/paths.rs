use std::path::{Path, PathBuf};

pub fn compression_staged_dir(mods_store: &Path, mod_id: &str) -> PathBuf {
  mods_store.join(mod_id).join("compression").join("staged_vpks")
}

pub fn merged_base_name() -> &'static str {
  "_merged_compressed.vpk"
}

pub fn pak_shard_name(shard_index: u32) -> String {
  format!("pak{:02}_dir.vpk", shard_index + 1)
}
