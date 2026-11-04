//! Versioned host observations. Permissions name individual event types;
//! receiving an observation never authorizes an operation.
use serde::{Deserialize, Serialize};

macro_rules! event_catalog {
  ($( $variant:ident => $name:literal : $data:ty ),+ $(,)?) => {
    #[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
    #[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
    pub enum HostEventType {
      $( #[serde(rename = $name)] $variant, )+
    }

    impl HostEventType {
      pub const ALL: &[Self] = &[$(Self::$variant,)+];
    }

    #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
    #[serde(tag = "type", content = "data")]
    #[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
    pub enum HostEventData {
      $( #[serde(rename = $name)] $variant($data), )+
    }

    impl HostEventData {
      pub fn event_type(&self) -> HostEventType {
        match self { $( Self::$variant(_) => HostEventType::$variant, )+ }
      }
    }
  };
}

event_catalog! {
  GameStarted => "game.started": GameLifecycle,
  GameExited => "game.exited": GameLifecycle,
  GameActivityChanged => "game.activity.changed": GameActivity,
  GameHeroChanged => "game.hero.changed": GameHero,
  GamePartyChanged => "game.party.changed": GameParty,
  MatchmakingStarted => "matchmaking.started": Matchmaking,
  MatchmakingStopped => "matchmaking.stopped": Matchmaking,
  MatchJoined => "match.joined": MatchIdentity,
  MatchPhaseChanged => "match.phase.changed": MatchPhaseChange,
  MatchLeft => "match.left": MatchIdentity,
  MatchScoreboardUpdated => "match.scoreboard.updated": Scoreboard,
  SessionClassified => "session.classified": SessionOutcome,
  ModInstallStarted => "mods.install.started": ModOperation,
  ModInstallCompleted => "mods.install.completed": ModOperation,
  ModInstallFailed => "mods.install.failed": ModOperation,
  ModDisabled => "mods.disabled": ModOperation,
  ModUpdated => "mods.updated": ModOperation,
  ModRemoved => "mods.removed": ModOperation,
  DownloadStarted => "downloads.started": Download,
  DownloadProgress => "downloads.progress": DownloadProgress,
  DownloadCompleted => "downloads.completed": Download,
  DownloadFailed => "downloads.failed": Download,
  DownloadCancelled => "downloads.cancelled": Download,
  DownloadPaused => "downloads.paused": Download,
  DownloadResumed => "downloads.resumed": Download,
  ProfileCreated => "profiles.created": Profile,
  ProfileActivated => "profiles.activated": Profile,
  ProfileRemoved => "profiles.removed": Profile,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
pub struct HostEvent {
  pub id: String,
  pub schema_version: u32,
  pub observed_at: String,
  pub operation_id: Option<String>,
  #[serde(flatten)]
  pub event: HostEventData,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
pub struct EventBatch {
  pub events: Vec<HostEvent>,
  pub cursor: String,
  pub has_more: bool,
}

/// Latest retained observations, not an inventory or historical replay.
/// An empty list means the host has not observed a permitted type yet.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
pub struct EventSnapshot {
  pub latest: Vec<HostEvent>,
  pub cursor: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EventRead {
  pub types: Vec<HostEventType>,
  pub after: String,
  #[serde(default = "default_limit")]
  pub limit: usize,
}

fn default_limit() -> usize {
  100
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
pub struct GameLifecycle {
  pub session_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
pub struct GameActivity {
  pub phase: String,
  pub match_mode: String,
  pub map_name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
pub struct GameHero {
  pub hero_key: Option<String>,
  pub transformed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
pub struct GameParty {
  pub size: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
pub struct Matchmaking {
  #[cfg_attr(feature = "bindings", ts(type = "number | null"))]
  pub queued_since: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
pub struct MatchIdentity {
  pub match_id: String,
  pub lobby_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
pub struct MatchPhaseChange {
  pub match_id: String,
  pub phase: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
pub struct Scoreboard {
  pub match_id: Option<String>,
  pub clock_seconds: Option<u32>,
  #[cfg_attr(feature = "bindings", ts(type = "number | null"))]
  pub reported_at: Option<i64>,
  pub friendly: Vec<ScoreboardPlayer>,
  pub enemy: Vec<ScoreboardPlayer>,
}

/// Match-local HUD slots. Names and account IDs are deliberately not exported.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
pub struct ScoreboardPlayer {
  pub slot: String,
  pub hero_id: Option<u32>,
  pub souls: Option<u32>,
  pub level: Option<i32>,
  pub kills: Option<i32>,
  pub deaths: Option<i32>,
  pub assists: Option<i32>,
  pub objective_damage: Option<i32>,
  pub is_local: bool,
  pub is_dead: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
pub struct SessionOutcome {
  pub session_id: String,
  pub classification: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
pub struct ModOperation {
  pub mod_id: String,
  pub profile: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
pub struct Download {
  pub mod_id: String,
  pub profile: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
pub struct DownloadProgress {
  pub mod_id: String,
  pub profile: String,
  #[cfg_attr(feature = "bindings", ts(type = "number"))]
  pub downloaded_bytes: u64,
  #[cfg_attr(feature = "bindings", ts(type = "number"))]
  pub total_bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "bindings", derive(ts_rs::TS))]
pub struct Profile {
  pub folder: String,
}

#[cfg(all(test, feature = "bindings"))]
mod bindings {
  use super::*;
  use ts_rs::TS;

  #[test]
  fn export_event_bindings() {
    let directory =
      std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../plugin-sdk/src/generated");
    HostEventType::export_all_to(&directory).unwrap();
    EventBatch::export_all_to(&directory).unwrap();
    EventSnapshot::export_all_to(&directory).unwrap();
    std::fs::write(directory.join("event-types.ts"), format!(
      "// Generated from dmm-plugin-sdk's event catalog. Do not edit.\nimport type {{ HostEventType }} from './HostEventType';\nexport const HOST_EVENT_TYPES = {} satisfies HostEventType[];\n",
      serde_json::to_string(HostEventType::ALL).unwrap(),
    )).unwrap();
  }
}
