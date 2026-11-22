use super::format::sha256_file;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};

const CACHE_FILE: &str = "interchange-hash-cache.json";
const MAX_ENTRIES: usize = 20_000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct Entry {
  size: u64,
  modified_ns: u128,
  sha256: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct CacheFile {
  #[serde(default)]
  entries: BTreeMap<String, Entry>,
}

fn stamp(path: &Path) -> Option<(u64, u128)> {
  let metadata = fs::metadata(path).ok()?;
  let modified = metadata
    .modified()
    .ok()?
    .duration_since(std::time::UNIX_EPOCH)
    .ok()?
    .as_nanos();
  Some((metadata.len(), modified))
}

pub struct HashCache {
  path: Option<PathBuf>,
  entries: Mutex<BTreeMap<String, Entry>>,
  dirty: Mutex<bool>,
}

impl HashCache {
  pub fn open(dir: Option<&Path>) -> Self {
    let path = dir.map(|dir| dir.join(CACHE_FILE));
    let entries = path
      .as_ref()
      .and_then(|path| fs::read_to_string(path).ok())
      .and_then(|text| serde_json::from_str::<CacheFile>(&text).ok())
      .map(|file| file.entries)
      .unwrap_or_default();
    Self {
      path,
      entries: Mutex::new(entries),
      dirty: Mutex::new(false),
    }
  }

  fn key(path: &Path) -> String {
    path.to_string_lossy().to_lowercase()
  }

  fn lookup(&self, path: &Path, size: u64, modified_ns: u128) -> Option<String> {
    let entries = self.entries.lock().ok()?;
    entries
      .get(&Self::key(path))
      .filter(|entry| entry.size == size && entry.modified_ns == modified_ns)
      .map(|entry| entry.sha256.clone())
  }

  fn store(&self, path: &Path, size: u64, modified_ns: u128, sha256: &str) {
    if let Ok(mut entries) = self.entries.lock() {
      entries.insert(
        Self::key(path),
        Entry {
          size,
          modified_ns,
          sha256: sha256.to_string(),
        },
      );
    }
    if let Ok(mut dirty) = self.dirty.lock() {
      *dirty = true;
    }
  }

  pub fn remember(&self, path: &Path, sha256: &str) {
    if let Some((size, modified)) = stamp(path) {
      self.store(path, size, modified, sha256);
    }
  }

  pub fn hash(&self, path: &Path) -> Result<String, String> {
    self
      .hash_all(&[path.to_path_buf()], &|_, _, _| {})
      .pop()
      .unwrap_or_else(|| Err("not hashed".to_string()))
  }

  pub fn hash_all(
    &self,
    paths: &[PathBuf],
    progress: &(dyn Fn(usize, usize, &str) + Sync),
  ) -> Vec<Result<String, String>> {
    let total = paths.len();
    let done = AtomicUsize::new(0);
    let results: Vec<Mutex<Option<Result<String, String>>>> =
      paths.iter().map(|_| Mutex::new(None)).collect();
    let mut pending = Vec::new();

    for (index, path) in paths.iter().enumerate() {
      let cached = stamp(path).and_then(|(size, modified)| self.lookup(path, size, modified));
      match cached {
        Some(hash) => {
          *results[index].lock().expect("fresh mutex") = Some(Ok(hash));
          let finished = done.fetch_add(1, Ordering::SeqCst) + 1;
          progress(finished, total, &file_name(path));
        }
        None => pending.push(index),
      }
    }

    pending.sort_by_key(|&index| std::cmp::Reverse(stamp(&paths[index]).map_or(0, |s| s.0)));
    let next = AtomicUsize::new(0);
    let workers = std::thread::available_parallelism()
      .map(|n| n.get())
      .unwrap_or(4)
      .clamp(1, 8)
      .min(pending.len().max(1));
    std::thread::scope(|scope| {
      for _ in 0..workers {
        scope.spawn(|| {
          loop {
            let slot = next.fetch_add(1, Ordering::SeqCst);
            let Some(&index) = pending.get(slot) else {
              break;
            };
            let path = &paths[index];
            let before = stamp(path);
            let outcome = sha256_file(path).map_err(|error| error.to_string());
            if let (Ok(hash), Some((size, modified))) = (&outcome, before)
              && stamp(path) == Some((size, modified))
            {
              self.store(path, size, modified, hash);
            }
            *results[index].lock().expect("result mutex") = Some(outcome);
            let finished = done.fetch_add(1, Ordering::SeqCst) + 1;
            progress(finished, total, &file_name(path));
          }
        });
      }
    });

    results
      .into_iter()
      .map(|slot| {
        slot
          .into_inner()
          .ok()
          .flatten()
          .unwrap_or_else(|| Err("not hashed".to_string()))
      })
      .collect()
  }

  pub fn save(&self) {
    let (Some(path), Ok(dirty)) = (&self.path, self.dirty.lock()) else {
      return;
    };
    if !*dirty {
      return;
    }
    let Ok(mut entries) = self.entries.lock() else {
      return;
    };
    if entries.len() > MAX_ENTRIES {
      entries.retain(|key, _| Path::new(key).exists());
    }
    let file = CacheFile {
      entries: entries.clone(),
    };
    if let Ok(bytes) = serde_json::to_vec(&file) {
      let temp = path.with_extension("json.tmp");
      if fs::write(&temp, bytes).is_ok() {
        let _ = fs::remove_file(path);
        if let Err(error) = fs::rename(&temp, path) {
          log::warn!("Could not save the interchange hash cache: {error}");
        }
      }
    }
  }
}

fn file_name(path: &Path) -> String {
  path
    .file_name()
    .map(|name| name.to_string_lossy().to_string())
    .unwrap_or_default()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn hashes_in_parallel_caches_and_notices_changes() {
    let dir = tempfile::tempdir().unwrap();
    let files: Vec<PathBuf> = (0..6)
      .map(|i| {
        let path = dir.path().join(format!("f{i}.vpk"));
        fs::write(&path, format!("content {i}")).unwrap();
        path
      })
      .collect();
    let missing = dir.path().join("missing.vpk");
    let mut all = files.clone();
    all.push(missing);

    let calls = AtomicUsize::new(0);
    let cache = HashCache::open(Some(dir.path()));
    let first = cache.hash_all(&all, &|_, _, _| {
      calls.fetch_add(1, Ordering::SeqCst);
    });
    assert_eq!(calls.load(Ordering::SeqCst), 7);
    assert!(first[..6].iter().all(Result::is_ok));
    assert!(first[6].is_err());
    assert_eq!(first[0].as_ref().unwrap(), &sha256_file(&files[0]).unwrap());
    cache.save();

    let reopened = HashCache::open(Some(dir.path()));
    assert_eq!(reopened.entries.lock().unwrap().len(), 6);
    let second = reopened.hash_all(&files, &|_, _, _| {});
    assert_eq!(second, first[..6].to_vec());

    std::thread::sleep(std::time::Duration::from_millis(20));
    fs::write(&files[1], "changed and longer content").unwrap();
    let third = reopened.hash_all(&files[1..2], &|_, _, _| {});
    assert_eq!(third[0].as_ref().unwrap(), &sha256_file(&files[1]).unwrap());
    assert_ne!(third[0], first[1]);
  }
}
