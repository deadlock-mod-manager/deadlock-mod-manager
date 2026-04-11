use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use vpk_parser::{VpkEntry, VpkParser};

type CacheKey = (PathBuf, u64);

pub struct VpkEntryCache {
    entries: Mutex<HashMap<CacheKey, Vec<VpkEntry>>>,
}

impl VpkEntryCache {
    pub fn new() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
        }
    }

    pub fn get_or_parse(&self, vpk_path: &Path) -> Option<Vec<VpkEntry>> {
        let modified = get_file_modified_secs(vpk_path);
        let cache_key = (vpk_path.to_path_buf(), modified);

        {
            let cache = self.entries.lock().unwrap();
            if let Some(entries) = cache.get(&cache_key) {
                return Some(entries.clone());
            }
        }

        match VpkParser::parse_directory_from_file(vpk_path) {
            Ok(entries) => {
                let mut cache = self.entries.lock().unwrap();
                cache.insert(cache_key, entries.clone());
                Some(entries)
            }
            Err(_) => None,
        }
    }

    pub fn clear(&self) -> usize {
        let mut cache = self.entries.lock().unwrap();
        let count = cache.len();
        cache.clear();
        count
    }
}

fn get_file_modified_secs(path: &Path) -> u64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .map(|t| {
            t.duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs()
        })
        .unwrap_or(0)
}
