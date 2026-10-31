use crate::lock;
use dmm_plugin_sdk::events::{EventBatch, EventSnapshot, HostEvent, HostEventData, HostEventType};
use std::collections::{BTreeMap, HashMap, VecDeque};
use std::sync::atomic::{AtomicU64, Ordering};

const MAX_EVENTS: usize = 512;
const MAX_EVENT_BYTES: usize = 32 * 1024;
const MAX_BATCH_BYTES: usize = 256 * 1024;
pub const MAX_READ_EVENTS: usize = 100;
static NEXT_JOURNAL: AtomicU64 = AtomicU64::new(0);

struct Entry {
  sequence: u64,
  bytes: usize,
  event: HostEvent,
}

struct EventSession {
  generation: u64,
  floor: u64,
}

pub(crate) struct EventJournal {
  epoch: String,
  sequence: u64,
  discarded_through: u64,
  entries: VecDeque<Entry>,
  latest: BTreeMap<HostEventType, HostEvent>,
  sessions: HashMap<String, EventSession>,
}

impl Default for EventJournal {
  fn default() -> Self {
    Self {
      epoch: format!(
        "{}-{}",
        chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default(),
        NEXT_JOURNAL.fetch_add(1, Ordering::Relaxed)
      ),
      sequence: 0,
      discarded_through: 0,
      entries: VecDeque::new(),
      latest: BTreeMap::new(),
      sessions: HashMap::new(),
    }
  }
}

impl EventJournal {
  pub fn publish(&mut self, event: HostEventData, operation_id: Option<String>) {
    self.observe(event, operation_id, true);
  }

  pub fn observe(&mut self, event: HostEventData, operation_id: Option<String>, replay: bool) {
    let event_type = event.event_type();
    let next = self.sequence + 1;
    let observation = HostEvent {
      id: format!("{}:{next}", self.epoch),
      schema_version: 1,
      observed_at: chrono::Utc::now().to_rfc3339(),
      operation_id,
      event,
    };
    let Ok(bytes) = serde_json::to_vec(&observation).map(|bytes| bytes.len()) else {
      return;
    };
    if bytes > MAX_EVENT_BYTES {
      return;
    }
    self.sequence = next;
    self.latest.insert(event_type, observation.clone());
    if !replay {
      return;
    }
    // Progress is replaceable state. Removing superseded samples must not
    // expire cursors or allow a download to evict every operation outcome.
    if matches!(
      event_type,
      HostEventType::DownloadProgress | HostEventType::MatchScoreboardUpdated
    ) {
      self.entries.retain(|entry| {
        entry.event.event.event_type() != event_type
          || entry.event.operation_id != observation.operation_id
      });
    }
    self.entries.push_back(Entry {
      sequence: next,
      bytes,
      event: observation,
    });
    while self.entries.len() > MAX_EVENTS {
      if let Some(entry) = self.entries.pop_front() {
        self.discarded_through = self.discarded_through.max(entry.sequence);
      }
    }
  }

  pub fn retire(&mut self, id: &str) {
    self.sessions.remove(id);
  }

  fn prefix(&self, id: &str, generation: u64) -> String {
    format!("{}:{id}:{generation}:", self.epoch)
  }

  fn cursor(&self, id: &str, generation: u64, sequence: u64) -> String {
    format!("{}{sequence}", self.prefix(id, generation))
  }

  pub fn snapshot(&mut self, id: &str, generation: u64, types: &[HostEventType]) -> EventSnapshot {
    let session = self.sessions.entry(id.to_owned()).or_insert(EventSession {
      generation,
      floor: self.sequence,
    });
    if session.generation != generation {
      *session = EventSession {
        generation,
        floor: self.sequence,
      };
    }
    EventSnapshot {
      latest: self
        .latest
        .iter()
        .filter(|(kind, _)| types.contains(kind))
        .map(|(_, event)| event.clone())
        .collect(),
      cursor: self.cursor(id, generation, self.sequence),
    }
  }

  pub fn read(
    &self,
    id: &str,
    generation: u64,
    types: &[HostEventType],
    after: &str,
    limit: usize,
  ) -> Result<EventBatch, crate::Error> {
    let sequence = after
      .strip_prefix(&self.prefix(id, generation))
      .and_then(|value| value.parse::<u64>().ok())
      .filter(|sequence| {
        *sequence <= self.sequence
          && *sequence >= self.discarded_through
          && self
            .sessions
            .get(id)
            .is_some_and(|session| session.generation == generation && *sequence >= session.floor)
      })
      .ok_or_else(|| crate::Error::Host {
        code: "cursor_expired",
        message: "Take a fresh event snapshot before reading".into(),
      })?;
    let mut events = Vec::new();
    let mut cursor = sequence;
    let mut bytes = 0;
    let mut has_more = false;
    for entry in self
      .entries
      .iter()
      .filter(|entry| entry.sequence > sequence)
    {
      if types.contains(&entry.event.event.event_type()) {
        if events.len() == limit || bytes + entry.bytes > MAX_BATCH_BYTES {
          has_more = true;
          break;
        }
        bytes += entry.bytes;
        events.push(entry.event.clone());
      }
      cursor = entry.sequence;
    }
    if !has_more {
      cursor = self.sequence;
    }
    Ok(EventBatch {
      events,
      cursor: self.cursor(id, generation, cursor),
      has_more,
    })
  }
}

impl crate::PluginHost {
  /// Accepts trusted, typed observations from the application's services.
  /// Plugin callers cannot publish host events.
  pub fn publish_event(&self, event: HostEventData, operation_id: Option<String>) {
    let registry = lock(&self.registry);
    if registry.runtime_enabled() {
      lock(&self.events).publish(event, operation_id);
    }
  }

  /// Initializes observed state without replaying old log entries as new events.
  pub fn seed_event(&self, event: HostEventData) {
    let registry = lock(&self.registry);
    if registry.runtime_enabled() {
      lock(&self.events).observe(event, None, false);
    }
  }

  pub fn wants_events(&self, types: &[HostEventType]) -> bool {
    let registry = lock(&self.registry);
    registry
      .list()
      .filter_map(|plugin| registry.active(plugin).ok())
      .any(|plugin| {
        matches!(plugin.permission(crate::ExternalPluginPermissionId::Events),
        Some(crate::ExternalPluginPermission::Events { types: granted })
        if granted.iter().any(|kind| types.contains(kind)))
      })
  }

  pub(crate) fn with_events<T>(
    &self,
    plugin: &crate::registry::ActivePlugin,
    read: impl FnOnce(&mut EventJournal) -> Result<T, crate::Error>,
  ) -> Result<T, crate::Error> {
    let registry = lock(&self.registry);
    registry
      .authorize(&plugin.id, plugin.generation)
      .map_err(|denied| crate::Error::Host {
        code: denied.code(),
        message: denied.message().into(),
      })?;
    read(&mut lock(&self.events))
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use dmm_plugin_sdk::events::{DownloadProgress, GameLifecycle, ModOperation};

  fn started() -> HostEventData {
    HostEventData::GameStarted(GameLifecycle { session_id: None })
  }

  #[test]
  fn snapshots_and_paged_reads_share_a_boundary_and_retries_repeat_ids() {
    let mut journal = EventJournal::default();
    let types = [HostEventType::GameStarted];
    journal.publish(started(), None);
    let snapshot = journal.snapshot("a", 1, &types);
    assert_eq!(snapshot.latest.len(), 1);
    journal.publish(started(), None);
    journal.publish(started(), None);
    let first = journal.read("a", 1, &types, &snapshot.cursor, 1).unwrap();
    assert_eq!(first.events.len(), 1);
    assert!(first.has_more);
    assert_eq!(
      first,
      journal.read("a", 1, &types, &snapshot.cursor, 1).unwrap()
    );
    let second = journal.read("a", 1, &types, &first.cursor, 1).unwrap();
    assert_eq!(second.events.len(), 1);
    assert!(!second.has_more);
    assert_ne!(first.events[0].id, second.events[0].id);
  }

  #[test]
  fn seeds_refresh_observations_without_replaying_history_and_cursors_cannot_rewind() {
    let mut journal = EventJournal::default();
    let types = [HostEventType::GameStarted];
    journal.publish(started(), None);
    let snapshot = journal.snapshot("a", 1, &types);
    let prefix = snapshot.cursor.rsplit_once(':').unwrap().0;
    assert!(
      journal
        .read("a", 1, &types, &format!("{prefix}:0"), 10)
        .is_err()
    );
    journal.observe(started(), None, false);
    let read = journal.read("a", 1, &types, &snapshot.cursor, 10).unwrap();
    assert!(read.events.is_empty());
    assert_ne!(read.cursor, snapshot.cursor);
    assert_ne!(
      journal.snapshot("a", 1, &types).latest[0].id,
      snapshot.latest[0].id
    );
  }

  #[test]
  fn rejects_cursors_from_other_plugins_generations_hosts_and_before_retirement() {
    let mut journal = EventJournal::default();
    let types = [HostEventType::GameStarted];
    let cursor = journal.snapshot("a", 1, &types).cursor;
    journal.publish(started(), None);
    assert!(journal.read("b", 1, &types, &cursor, 10).is_err());
    assert!(journal.read("a", 2, &types, &cursor, 10).is_err());
    assert!(
      EventJournal::default()
        .read("a", 1, &types, &cursor, 10)
        .is_err()
    );
    journal.retire("a");
    assert!(journal.read("a", 1, &types, &cursor, 10).is_err());
  }

  #[test]
  fn coalesces_progress_without_losing_outcomes_or_expiring_the_cursor() {
    let mut journal = EventJournal::default();
    let types = [
      HostEventType::ModInstallCompleted,
      HostEventType::DownloadProgress,
    ];
    let cursor = journal.snapshot("a", 1, &types).cursor;
    journal.publish(
      HostEventData::ModInstallCompleted(ModOperation {
        mod_id: "skin".into(),
        profile: "default".into(),
      }),
      Some("install:1".into()),
    );
    for value in 0..1000 {
      journal.publish(
        HostEventData::DownloadProgress(DownloadProgress {
          mod_id: "skin".into(),
          profile: "default".into(),
          downloaded_bytes: value,
          total_bytes: 1000,
        }),
        Some("download:1".into()),
      );
    }
    let batch = journal.read("a", 1, &types, &cursor, 100).unwrap();
    assert_eq!(batch.events.len(), 2);
    assert!(matches!(
      batch.events[0].event,
      HostEventData::ModInstallCompleted(_)
    ));
    assert!(matches!(&batch.events[1].event,
      HostEventData::DownloadProgress(data) if data.downloaded_bytes == 999));
  }

  #[test]
  fn filters_snapshots_and_replay_and_expires_evicted_history() {
    let mut journal = EventJournal::default();
    let types = [HostEventType::GameStarted];
    let cursor = journal.snapshot("a", 1, &types).cursor;
    journal.publish(
      HostEventData::GameExited(GameLifecycle { session_id: None }),
      None,
    );
    assert!(journal.snapshot("a", 1, &types).latest.is_empty());
    let skipped = journal.read("a", 1, &types, &cursor, 100).unwrap();
    assert!(skipped.events.is_empty());
    assert_ne!(skipped.cursor, cursor);
    for _ in 0..=MAX_EVENTS {
      journal.publish(started(), None);
    }
    assert!(journal.read("a", 1, &types, &cursor, 100).is_err());
    let fresh = journal.snapshot("a", 1, &types).cursor;
    assert!(journal.read("a", 1, &types, &fresh, 100).is_ok());
  }
}
