use super::{Kv3Encoding, Kv3Value, Resource, kv3};
use crate::errors::Error;
use sha2::{Digest, Sha256};
use std::{
  collections::VecDeque,
  sync::{Arc, Mutex, OnceLock},
};

pub(super) struct Decoded {
  pub format: kv3::Format,
  pub root: Kv3Value,
  pub encoding: Kv3Encoding,
}

// Cache only successful authoritative parses, by exact DATA bytes. A process
// restart after parser/rule changes naturally invalidates every entry.
const MAX_BYTES: usize = 32 * 1024 * 1024;
const MAX_ENTRIES: usize = 16;

#[derive(Default)]
struct ParseCache {
  entries: VecDeque<([u8; 32], Arc<Decoded>, usize)>,
  bytes: usize,
}

impl ParseCache {
  fn get(&mut self, key: &[u8; 32]) -> Option<Arc<Decoded>> {
    let index = self
      .entries
      .iter()
      .position(|(candidate, _, _)| candidate == key)?;
    let entry = self.entries.remove(index)?;
    let decoded = Arc::clone(&entry.1);
    self.entries.push_back(entry);
    Some(decoded)
  }

  fn insert(&mut self, key: [u8; 32], decoded: Arc<Decoded>) {
    if self.get(&key).is_some() {
      return;
    }
    let size = charge(&decoded.root);
    if size > MAX_BYTES {
      return;
    }
    while self.bytes + size > MAX_BYTES || self.entries.len() >= MAX_ENTRIES {
      let (_, _, removed) = self
        .entries
        .pop_front()
        .expect("cache has an eviction candidate");
      self.bytes -= removed;
    }
    self.bytes += size;
    self.entries.push_back((key, decoded, size));
  }
}

/// Conservatively charge both the value and parallel encoding allocations.
fn charge(value: &Kv3Value) -> usize {
  256usize.saturating_add(match value {
    Kv3Value::String(value) => value.capacity(),
    Kv3Value::Binary(bytes) => bytes.capacity(),
    Kv3Value::Array(values) => values.capacity().saturating_mul(256).saturating_add(
      values
        .iter()
        .map(charge)
        .fold(0usize, usize::saturating_add),
    ),
    Kv3Value::Object(fields) => fields.capacity().saturating_mul(256).saturating_add(
      fields
        .iter()
        .map(|(key, value)| {
          key
            .capacity()
            .saturating_mul(2)
            .saturating_add(charge(value))
        })
        .fold(0usize, usize::saturating_add),
    ),
    _ => 0,
  })
}

pub(super) fn decode(bytes: &[u8], source: &str) -> Result<Arc<Decoded>, Error> {
  static CACHE: OnceLock<Mutex<ParseCache>> = OnceLock::new();
  let resource = Resource::parse(bytes)
    .map_err(|error| Error::ModInvalid(format!("Failed to parse {source}: {error}")))?;
  let data = resource
    .data_block()
    .map_err(|error| Error::ModInvalid(format!("Failed to read {source} DATA block: {error}")))?;
  let key: [u8; 32] = Sha256::digest(data).into();
  let cache = CACHE.get_or_init(|| Mutex::new(ParseCache::default()));
  if let Some(decoded) = cache.lock().ok().and_then(|mut cache| cache.get(&key)) {
    return Ok(decoded);
  }
  let format = kv3::Format::from_payload(data)
    .map_err(|error| Error::ModInvalid(format!("Failed to read {source} KV3 format: {error}")))?;
  let (root, encoding) = kv3::decode_preserving(data)
    .map_err(|error| Error::ModInvalid(format!("Failed to decode {source}: {error}")))?;
  let decoded = Arc::new(Decoded {
    format,
    root,
    encoding,
  });
  if let Ok(mut cache) = cache.lock() {
    cache.insert(key, Arc::clone(&decoded));
  }
  Ok(decoded)
}

#[cfg(test)]
mod tests {
  use super::super::tests::compiled_resource;
  use super::*;

  #[test]
  fn exact_payloads_reuse_parses_and_edits_invalidate_them() {
    let first = compiled_resource(vec![("value".into(), Kv3Value::Int(1))]);
    let second = compiled_resource(vec![("value".into(), Kv3Value::Int(2))]);
    let decoded = decode(&first, "first").unwrap();
    let key = |bytes: &[u8]| -> [u8; 32] {
      Sha256::digest(Resource::parse(bytes).unwrap().data_block().unwrap()).into()
    };
    // Other decoder tests may legitimately evict a process-cache entry between
    // calls. Test reuse in an isolated cache and decoded values through the API.
    let mut cache = ParseCache::default();
    cache.insert(key(&first), Arc::clone(&decoded));
    assert!(Arc::ptr_eq(&decoded, &cache.get(&key(&first)).unwrap()));
    assert!(cache.get(&key(&second)).is_none());
    let repeated = decode(&first, "another provider").unwrap();
    assert_eq!(decoded.root, repeated.root);
    let changed = decode(&second, "changed").unwrap();
    assert_eq!(decoded.root.get("value"), Some(&Kv3Value::Int(1)));
    assert_eq!(changed.root.get("value"), Some(&Kv3Value::Int(2)));
    cache.insert(key(&second), Arc::clone(&changed));
    assert!(Arc::ptr_eq(&changed, &cache.get(&key(&second)).unwrap()));
    assert!(decode(&first[..first.len() - 1], "truncated").is_err());
  }

  #[test]
  fn least_recently_used_entries_are_evicted_and_large_trees_are_not_retained() {
    let bytes = compiled_resource(vec![("value".into(), Kv3Value::Int(1))]);
    let decoded = decode(&bytes, "cache test").unwrap();
    let mut cache = ParseCache::default();
    for index in 0..MAX_ENTRIES {
      cache.insert([index as u8; 32], Arc::clone(&decoded));
    }
    cache.get(&[0; 32]).unwrap();
    cache.insert([MAX_ENTRIES as u8; 32], Arc::clone(&decoded));
    assert!(cache.get(&[1; 32]).is_none());
    assert!(cache.get(&[0; 32]).is_some());
    let oversized = Arc::new(Decoded {
      format: decoded.format,
      root: Kv3Value::Binary(vec![0; MAX_BYTES]),
      encoding: decoded.encoding.clone(),
    });
    cache.insert([255; 32], oversized);
    assert!(cache.get(&[255; 32]).is_none());
    assert!(cache.bytes <= MAX_BYTES);
  }
}
