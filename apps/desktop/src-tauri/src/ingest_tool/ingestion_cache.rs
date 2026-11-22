use crate::ingest_tool::utils::Salts;
use std::collections::HashMap;
use std::sync::{OnceLock, RwLock};

static INGESTION_CACHE: OnceLock<RwLock<HashMap<u64, (bool, bool)>>> = OnceLock::new();

pub(crate) fn mark_ingested(salt: &Salts) {
  let cache = INGESTION_CACHE.get_or_init(Default::default);
  let mut cache = cache.write().unwrap_or_else(|poisoned| {
    eprintln!("Failed to lock ingestion cache for writing");
    poisoned.into_inner()
  });

  cache
    .entry(salt.match_id)
    .and_modify(|entry| {
      if salt.metadata_salt.is_some() {
        entry.0 = true;
      }
      if salt.replay_salt.is_some() {
        entry.1 = true;
      }
    })
    .or_insert((salt.metadata_salt.is_some(), salt.replay_salt.is_some()));

  if cache.len() > 10_000 {
    cache.clear();
  }
}

pub(crate) fn is_ingested(match_id: u64, is_metadata: bool) -> bool {
  let cache = INGESTION_CACHE.get_or_init(Default::default);
  let cache = cache.read().unwrap_or_else(|poisoned| {
    eprintln!("Failed to lock ingestion cache for reading");
    poisoned.into_inner()
  });

  if let Some(entry) = cache.get(&match_id) {
    let (has_metadata, has_replay) = *entry;
    if is_metadata {
      has_metadata
    } else {
      has_replay
    }
  } else {
    false
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_cache_operations() {
    let match_id = 12345678;

    assert!(!is_ingested(match_id, true));
    assert!(!is_ingested(match_id, false));

    mark_ingested(&Salts {
      match_id,
      cluster_id: 0,
      metadata_salt: Some(0),
      replay_salt: None,
      username: "test".to_string(),
    });
    assert!(is_ingested(match_id, true));
    assert!(!is_ingested(match_id, false));

    mark_ingested(&Salts {
      match_id,
      cluster_id: 0,
      metadata_salt: None,
      replay_salt: Some(0),
      username: "test".to_string(),
    });
    assert!(is_ingested(match_id, true));
    assert!(is_ingested(match_id, false));
  }
}
