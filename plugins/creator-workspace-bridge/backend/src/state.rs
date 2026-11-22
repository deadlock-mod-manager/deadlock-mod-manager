use dmm_plugin_sdk::api::{self, Snapshot};
use dmm_plugin_sdk::{Host, PluginError};
use serde::{Deserialize, Serialize};

pub const HISTORY_LIMIT: usize = 8;
const STATE_KEY: &str = "workflow";
const SCHEMA: u32 = 1;
pub const STATE_RESET: &str = "state_reset";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Watch {
  Missing,
  Changing,
  WaitingForMarker,
  Invalid,
  Ready,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UiState {
  pub history_expanded: bool,
}

/// Plugin-owned workflow options. Paths and profiles are host grants and are
/// never stored here.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
  /// Only stage the output once `<output>.ready` is newer than it.
  pub require_ready_marker: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowState {
  pub schema: u32,
  /// Newest first. Never longer than [`HISTORY_LIMIT`].
  pub builds: Vec<Snapshot>,
  pub deployed_hash: Option<String>,
  /// Set while `mods.install` runs. Seeing it at the start of a later call
  /// means the deploying instance died before recording the outcome.
  pub pending_hash: Option<String>,
  pub watch: Option<Watch>,
  pub watch_error: Option<PluginError>,
  pub deploy_error: Option<PluginError>,
  pub settings: Settings,
  pub ui: UiState,
}

impl Default for WorkflowState {
  fn default() -> Self {
    Self {
      schema: SCHEMA,
      builds: Vec::new(),
      deployed_hash: None,
      pending_hash: None,
      watch: None,
      watch_error: None,
      deploy_error: None,
      settings: Settings::default(),
      ui: UiState::default(),
    }
  }
}

pub fn is_sha256(hash: &str) -> bool {
  hash.len() == 64
    && hash
      .bytes()
      .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
}

impl WorkflowState {
  fn is_consistent(&self) -> bool {
    self.schema == SCHEMA
      && self.builds.len() <= HISTORY_LIMIT
      && self.builds.iter().enumerate().all(|(index, build)| {
        is_sha256(&build.hash)
          && !self.builds[..index]
            .iter()
            .any(|other| other.hash == build.hash)
      })
      && [&self.deployed_hash, &self.pending_hash]
        .into_iter()
        .flatten()
        .all(|hash| is_sha256(hash))
  }

  pub fn has_build(&self, hash: &str) -> bool {
    self.builds.iter().any(|build| build.hash == hash)
  }

  fn is_pinned(&self, hash: &str) -> bool {
    self.deployed_hash.as_deref() == Some(hash) || self.pending_hash.as_deref() == Some(hash)
  }

  /// Moves a re-detected build to the front, or records a new one and drops
  /// the oldest builds that are neither deployed nor being deployed.
  pub fn stage(&mut self, snapshot: Snapshot) {
    if let Some(index) = self
      .builds
      .iter()
      .position(|build| build.hash == snapshot.hash)
    {
      let build = self.builds.remove(index);
      self.builds.insert(0, build);
      return;
    }
    self.builds.insert(0, snapshot);
    self.trim();
  }

  pub fn trim(&mut self) {
    while self.builds.len() > HISTORY_LIMIT {
      let Some(index) = self
        .builds
        .iter()
        .rposition(|build| !self.is_pinned(&build.hash))
      else {
        break;
      };
      self.builds.remove(index);
    }
  }
}

/// Workflow state loaded from plugin storage. Only writes back when the state
/// changed, so steady ticks cost one storage read.
pub struct Session {
  pub state: WorkflowState,
  persisted: Option<WorkflowState>,
}

impl Session {
  pub fn load(host: &mut impl Host) -> Result<Self, PluginError> {
    let Some(value) = api::storage_get(host, STATE_KEY)? else {
      let state = WorkflowState::default();
      return Ok(Self {
        persisted: Some(state.clone()),
        state,
      });
    };
    match serde_json::from_value::<WorkflowState>(value) {
      Ok(state) if state.is_consistent() => Ok(Self {
        persisted: Some(state.clone()),
        state,
      }),
      _ => Ok(Self {
        state: WorkflowState {
          watch_error: Some(PluginError::new(
            STATE_RESET,
            "Stored build history was unreadable and has been reset",
          )),
          ..WorkflowState::default()
        },
        persisted: None,
      }),
    }
  }

  pub fn save(&mut self, host: &mut impl Host) -> Result<(), PluginError> {
    if self.persisted.as_ref() == Some(&self.state) {
      return Ok(());
    }
    let value = serde_json::to_value(&self.state).map_err(|error| {
      PluginError::new(dmm_plugin_sdk::codes::INVALID_REQUEST, error.to_string())
    })?;
    api::storage_set(host, STATE_KEY, value)?;
    self.persisted = Some(self.state.clone());
    Ok(())
  }
}
