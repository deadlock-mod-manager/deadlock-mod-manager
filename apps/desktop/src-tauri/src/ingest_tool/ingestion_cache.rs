use crate::ingest_tool::utils::Salts;
use std::collections::HashMap;
use std::io::Write;
use std::sync::{OnceLock, RwLock};

/// Global cache to track successfully ingested salts.
/// Key is the `match_id`, value is a tuple of `(has_metadata, has_replay)`.
static INGESTION_CACHE: OnceLock<RwLock<HashMap<u64, (bool, bool)>>> = OnceLock::new();

/// Mark a salt as successfully ingested.
/// This should only be called after successful ingestion.
pub(crate) fn mark_ingested(salt: &Salts) {
  let cache = INGESTION_CACHE.get_or_init(Default::default);
  let Ok(mut cache) = cache.write() else {
    eprintln!("Failed to lock ingestion cache for writing");
    return;
  };

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

  // Prevent unbounded growth - clear cache if it gets too large
  if cache.len() > 10_000 {
    cache.clear();
  }
}

/// Check if a salt has already been ingested.
/// Returns true if the specific salt type (metadata or replay) has been ingested for this `match_id`.
pub(crate) fn is_ingested(match_id: u64, is_metadata: bool) -> bool {
  let cache = INGESTION_CACHE.get_or_init(Default::default);
  let Ok(cache) = cache.read() else {
    eprintln!("Failed to lock ingestion cache for reading");
    return false;
  };

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

    // Initially not ingested
    assert!(!is_ingested(match_id, true));
    assert!(!is_ingested(match_id, false));

    // Mark metadata as ingested
    mark_ingested(&Salts {
      match_id,
      cluster_id: 0,
      metadata_salt: Some(0),
      replay_salt: None,
      username: "test".to_string(),
    });
    assert!(is_ingested(match_id, true));
    assert!(!is_ingested(match_id, false));

    // Mark replay as ingested
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
