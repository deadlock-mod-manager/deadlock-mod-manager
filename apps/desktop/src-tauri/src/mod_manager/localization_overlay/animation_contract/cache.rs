//! Cache intrinsic animation metadata, never dependency resolution or verdicts.
use super::{Node, NodeResult, decode_node};
use sha2::{Digest, Sha256};
use std::{
  collections::VecDeque,
  sync::{Mutex, OnceLock},
};

const MAX_BYTES: usize = 2 * 1024 * 1024;
const MAX_ENTRIES: usize = 2048;

type Key = (String, [u8; 32]);

#[derive(Default)]
struct NodeCache {
  entries: VecDeque<(Key, NodeResult, usize)>,
  bytes: usize,
}

impl NodeCache {
  fn get(&mut self, key: &Key) -> Option<NodeResult> {
    let index = self
      .entries
      .iter()
      .position(|(candidate, _, _)| candidate == key)?;
    let entry = self.entries.remove(index)?;
    let result = entry.1.clone();
    self.entries.push_back(entry);
    Some(result)
  }

  fn insert(&mut self, key: Key, result: NodeResult) {
    let size = std::mem::size_of::<(Key, NodeResult, usize)>()
      + key.0.capacity()
      + match &result {
        Ok(Node::Graph { skeleton, children }) => {
          skeleton.as_ref().map_or(0, String::capacity)
            + children.capacity() * std::mem::size_of::<String>()
            + children.iter().map(String::capacity).sum::<usize>()
        }
        Ok(Node::Clip { skeleton, .. }) => skeleton.capacity(),
        _ => 0,
      };
    if size > MAX_BYTES || self.get(&key).is_some() {
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
    self.entries.push_back((key, result, size));
  }
}

pub(super) fn decode(bytes: &[u8], path: &str) -> NodeResult {
  static CACHE: OnceLock<Mutex<NodeCache>> = OnceLock::new();
  // Parsing depends on the resource type and exact bytes, not its provider.
  // The caller resolves the effective resource again on every analysis.
  let key = (
    path.rsplit('.').next().unwrap_or_default().to_owned(),
    Sha256::digest(bytes).into(),
  );
  let cache = CACHE.get_or_init(|| Mutex::new(NodeCache::default()));
  if let Some(result) = cache.lock().ok().and_then(|mut cache| cache.get(&key)) {
    return result;
  }
  let result = decode_node(bytes, path);
  if let Ok(mut cache) = cache.lock() {
    cache.insert(key, result.clone());
  }
  result
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::mod_manager::localization_overlay::{Kv3Value, tests::compiled_resource};

  #[test]
  fn identical_bytes_are_interpreted_using_the_requested_resource_type() {
    let bytes = compiled_resource(vec![
      (
        "m_skeleton".into(),
        Kv3Value::String("models/test.vnmskel".into()),
      ),
      ("m_resources".into(), Kv3Value::Array(vec![])),
      ("m_trackCompressionSettings".into(), Kv3Value::Array(vec![])),
    ]);
    assert!(matches!(
      decode(&bytes, "test.vnmclip_c"),
      Ok(Node::Clip { tracks: 0, .. })
    ));
    assert!(matches!(
      decode(&bytes, "test.vnmgraph_c"),
      Ok(Node::Graph { .. })
    ));
    assert!(matches!(
      decode(&bytes, "renamed.vnmclip_c"),
      Ok(Node::Clip { tracks: 0, .. })
    ));
  }

  #[test]
  fn cache_evicts_old_metadata_and_does_not_retain_large_graphs() {
    let key = |index: usize| {
      (
        "vnmclip_c".into(),
        Sha256::digest(index.to_le_bytes()).into(),
      )
    };
    let mut cache = NodeCache::default();
    for index in 0..MAX_ENTRIES {
      cache.insert(key(index), Ok(Node::Skeleton(index)));
    }
    assert!(matches!(cache.get(&key(0)), Some(Ok(Node::Skeleton(0)))));
    cache.insert(key(MAX_ENTRIES), Ok(Node::Skeleton(MAX_ENTRIES)));
    assert!(cache.get(&key(1)).is_none());
    assert!(cache.get(&key(0)).is_some());
    cache.insert(
      key(MAX_ENTRIES + 1),
      Ok(Node::Graph {
        skeleton: None,
        children: vec!["x".repeat(MAX_BYTES)],
      }),
    );
    assert!(cache.get(&key(MAX_ENTRIES + 1)).is_none());
    assert!(cache.bytes <= MAX_BYTES);
  }
}
