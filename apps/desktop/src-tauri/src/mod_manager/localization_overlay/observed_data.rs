//! Reuse table fingerprints across rebuilds without retaining decoded game data.
use super::compiled_resource;
use crate::errors::Error;
use crate::mod_manager::vdata_history::{VdataHistoryIndex, VdataSnapshot};
use sha2::{Digest, Sha256};
use std::{
  collections::VecDeque,
  sync::{Arc, Mutex, OnceLock},
};

const MAX_BYTES: usize = 64 * 1024 * 1024;
const MAX_ENTRIES: usize = 8;

struct Entry {
  path: String,
  digest: [u8; 32],
  snapshot: Arc<VdataSnapshot>,
  size: usize,
}

#[derive(Default)]
struct ObservationCache {
  entries: VecDeque<Entry>,
  bytes: usize,
}

impl ObservationCache {
  fn get(&mut self, path: &str, digest: &[u8; 32]) -> Option<Arc<VdataSnapshot>> {
    let index = self
      .entries
      .iter()
      .position(|entry| entry.path == path && entry.digest == *digest)?;
    let entry = self.entries.remove(index)?;
    let snapshot = Arc::clone(&entry.snapshot);
    self.entries.push_back(entry);
    Some(snapshot)
  }

  fn insert(&mut self, path: &str, digest: [u8; 32], snapshot: Arc<VdataSnapshot>) {
    let size = snapshot
      .cache_size()
      .saturating_add(path.len())
      .saturating_add(std::mem::size_of::<Entry>());
    if size > MAX_BYTES || self.get(path, &digest).is_some() {
      return;
    }
    while self.bytes + size > MAX_BYTES || self.entries.len() >= MAX_ENTRIES {
      let entry = self
        .entries
        .pop_front()
        .expect("cache has an eviction candidate");
      self.bytes -= entry.size;
    }
    self.bytes += size;
    self.entries.push_back(Entry {
      path: path.into(),
      digest,
      snapshot,
      size,
    });
  }
}

pub(super) fn record(
  observed: &mut VdataHistoryIndex,
  path: &str,
  version: u32,
  bytes: &[u8],
) -> Result<bool, Error> {
  static CACHE: OnceLock<Mutex<ObservationCache>> = OnceLock::new();
  // Include the whole resource: even a malformed header must miss. The path
  // scopes learned string bindings; neither build number nor file metadata is
  // sufficient to identify content. Parser changes invalidate on process restart.
  let digest = Sha256::digest(bytes).into();
  let cache = CACHE.get_or_init(|| Mutex::new(ObservationCache::default()));
  let cached = cache
    .lock()
    .ok()
    .and_then(|mut cache| cache.get(path, &digest));
  let snapshot = match cached {
    Some(snapshot) => snapshot,
    None => {
      let decoded = compiled_resource::decode(bytes, path)?;
      let snapshot = Arc::new(VdataSnapshot::new(path, &decoded.root).map_err(Error::ModInvalid)?);
      if let Ok(mut cache) = cache.lock() {
        cache.insert(path, digest, Arc::clone(&snapshot));
      }
      snapshot
    }
  };
  observed
    .record_snapshot(path, version, &snapshot)
    .map_err(Error::ModInvalid)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::mod_manager::localization_overlay::{Kv3Value, tests::compiled_resource};

  #[test]
  fn repeated_observations_preserve_history_and_changed_bytes_are_learned() {
    let path = "scripts/heroes.vdata_c";
    let rows = |sound: &str| {
      vec![(
        "hero".into(),
        Kv3Value::Object(vec![
          ("sound".into(), Kv3Value::String(sound.into())),
          ("scale".into(), Kv3Value::Double(0.123456789)),
        ]),
      )]
    };
    let mut cached = VdataHistoryIndex::default();
    let mut direct = VdataHistoryIndex::default();
    for (version, sound) in [
      (1, "old"),
      (1, "old"),
      (1, "changed without a build bump"),
      (2, "new"),
      (3, "old"),
    ] {
      let bytes = compiled_resource(rows(sound));
      assert_eq!(
        record(&mut cached, path, version, &bytes).unwrap(),
        direct
          .record(path, version, &Kv3Value::Object(rows(sound)))
          .unwrap(),
      );
      assert_eq!(cached.to_bytes().unwrap(), direct.to_bytes().unwrap());
    }
    // A fresh history still learns cached data. Reuse never means skipping the
    // observation, and corrupt resources cannot inherit a previous successful parse.
    let mut fresh = VdataHistoryIndex::default();
    let bytes = compiled_resource(rows("old"));
    assert!(record(&mut fresh, path, 1, &bytes).unwrap());
    assert!(fresh.observed_string_field(path, "hero", "sound", "old"));
    assert!(record(&mut fresh, path, 1, &bytes[..bytes.len() - 1]).is_err());
  }

  #[test]
  fn observations_are_scoped_to_table_and_evicted_when_full() {
    let root = Kv3Value::Object(vec![(
      "hero".into(),
      Kv3Value::Object(vec![("sound".into(), Kv3Value::String("voice".into()))]),
    )]);
    let bytes = compiled_resource(root.as_object().unwrap().to_vec());
    let mut observed = VdataHistoryIndex::default();
    for path in ["scripts/heroes.vdata_c", "scripts/abilities.vdata_c"] {
      record(&mut observed, path, 1, &bytes).unwrap();
      assert!(observed.observed_string_field(path, "hero", "sound", "voice"));
    }
    let snapshot = Arc::new(VdataSnapshot::new("scripts/heroes.vdata_c", &root).unwrap());
    let mut cache = ObservationCache::default();
    for index in 0..MAX_ENTRIES {
      cache.insert("table", [index as u8; 32], Arc::clone(&snapshot));
    }
    assert!(Arc::ptr_eq(
      &snapshot,
      &cache.get("table", &[0; 32]).unwrap()
    ));
    assert!(cache.get("different table", &[0; 32]).is_none());
    cache.insert("table", [MAX_ENTRIES as u8; 32], snapshot);
    assert!(cache.get("table", &[1; 32]).is_none());
    assert!(cache.get("table", &[0; 32]).is_some());
    assert!(cache.bytes <= MAX_BYTES);
  }
}
