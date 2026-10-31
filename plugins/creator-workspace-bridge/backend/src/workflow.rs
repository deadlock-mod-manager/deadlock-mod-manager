use crate::state::{Session, Settings, UiState, Watch, WorkflowState, is_sha256};
use dmm_plugin_sdk::api::{self, Grants, Snapshot, SnapshotState};
use dmm_plugin_sdk::{Host, PluginError, Value, codes, json};
use serde::{Deserialize, Serialize};

pub const ARTIFACT_INVALID: &str = "artifact_invalid";
pub const ARTIFACT_UNAVAILABLE: &str = "artifact_unavailable";
pub const DEPLOY_INTERRUPTED: &str = "deploy_interrupted";
pub const PROFILE_NOT_GRANTED: &str = "profile_not_granted";
pub const UNKNOWN_BUILD: &str = "unknown_build";

fn to_value(value: impl Serialize) -> Result<Value, PluginError> {
  serde_json::to_value(value)
    .map_err(|error| PluginError::new(codes::INVALID_REQUEST, error.to_string()))
}

fn parse_payload<T: for<'de> Deserialize<'de>>(payload: Value) -> Result<T, PluginError> {
  serde_json::from_value(payload)
    .map_err(|error| PluginError::new(codes::INVALID_REQUEST, error.to_string()))
}

/// Runs on the host supervisor's schedule. Asks the host to snapshot the
/// granted file; the host owns stability checks, validation, hashing, and
/// staging.
pub fn tick(host: &mut impl Host) -> Result<Value, PluginError> {
  let mut session = Session::load(host)?;
  let outcome = match api::grants(host) {
    Err(error) => {
      session.state.watch_error = Some(error);
      "error"
    }
    Ok(Grants { file: None, .. }) => {
      session.state.watch = None;
      session.state.watch_error = None;
      "notConfigured"
    }
    Ok(_) => {
      let snapshot = api::files_snapshot(host, None, session.state.settings.require_ready_marker);
      observe(&mut session.state, snapshot)
    }
  };
  session.save(host)?;
  Ok(json!({
    "outcome": outcome,
    "latestHash": session.state.builds.first().map(|build| &build.hash),
  }))
}

fn observe(
  state: &mut WorkflowState,
  snapshot: Result<SnapshotState, PluginError>,
) -> &'static str {
  let (watch, error, outcome) = match snapshot {
    Ok(SnapshotState::Missing) => (Watch::Missing, None, "missing"),
    Ok(SnapshotState::Changing) => (Watch::Changing, None, "changing"),
    Ok(SnapshotState::WaitingForMarker) => (Watch::WaitingForMarker, None, "waitingForMarker"),
    Ok(SnapshotState::Invalid { message }) => (
      Watch::Invalid,
      Some(PluginError::new(ARTIFACT_INVALID, message)),
      "invalid",
    ),
    Ok(SnapshotState::Ready { snapshot }) if is_sha256(&snapshot.hash) => {
      state.stage(snapshot);
      (Watch::Ready, None, "ready")
    }
    Ok(SnapshotState::Ready { .. }) => {
      state.watch_error = Some(PluginError::new(
        codes::INVALID_HOST_RESPONSE,
        "Host staged a snapshot without a SHA-256 hash",
      ));
      return "error";
    }
    Err(error) => {
      state.watch_error = Some(error);
      return "error";
    }
  };
  state.watch = Some(watch);
  state.watch_error = error;
  outcome
}

/// What the host reports for this plugin: its staged snapshots and the
/// snapshot installed in the granted profile.
struct Listing {
  snapshots: Vec<Snapshot>,
  installed: Option<String>,
}

impl Listing {
  fn read(host: &mut impl Host) -> Result<Self, PluginError> {
    let snapshots = api::files_snapshots(host)?;
    let installed = api::mods_installed(host)?;
    Ok(Self {
      snapshots,
      installed,
    })
  }

  fn holds(&self, hash: &str) -> bool {
    self.snapshots.iter().any(|snapshot| snapshot.hash == hash)
  }
}

/// Aligns stored history with what the host reports for the granted profile.
/// The host's installed hash is authoritative, and a deployed build missing
/// from history is restored from the host's snapshot metadata.
fn reconcile(state: &mut WorkflowState, listing: &Listing) {
  let deployed = listing.installed.clone().filter(|hash| is_sha256(hash));
  if let Some(hash) = &deployed
    && !state.has_build(hash)
    && let Some(snapshot) = listing
      .snapshots
      .iter()
      .find(|snapshot| &snapshot.hash == hash)
  {
    state.builds.push(snapshot.clone());
  }
  if let Some(pending) = state.pending_hash.take() {
    state.deploy_error = if deployed.as_ref() == Some(&pending) {
      None
    } else {
      Some(PluginError::new(
        DEPLOY_INTERRUPTED,
        "The previous deployment stopped before it finished. Deploy the build again.",
      ))
    };
  }
  state.deployed_hash = deployed;
  state.trim();
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildView<'a> {
  #[serde(flatten)]
  snapshot: &'a Snapshot,
  deployed: bool,
  /// Whether the host still holds the staged copy. `None` when the host
  /// listing could not be read.
  available: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StatusView<'a> {
  grants: Option<Grants>,
  grants_error: Option<PluginError>,
  list_error: Option<PluginError>,
  builds: Vec<BuildView<'a>>,
  deployed_hash: &'a Option<String>,
  pending_hash: &'a Option<String>,
  watch: Option<Watch>,
  watch_error: &'a Option<PluginError>,
  deploy_error: &'a Option<PluginError>,
  settings: &'a Settings,
  ui: &'a UiState,
}

pub fn status(host: &mut impl Host) -> Result<Value, PluginError> {
  let mut session = Session::load(host)?;
  let grants = api::grants(host);
  let listing = Listing::read(host);
  if let Ok(listing) = &listing {
    reconcile(&mut session.state, listing);
  }
  session.save(host)?;
  let state = &session.state;
  let builds = state
    .builds
    .iter()
    .map(|snapshot| BuildView {
      snapshot,
      deployed: state.deployed_hash.as_ref() == Some(&snapshot.hash),
      available: listing
        .as_ref()
        .ok()
        .map(|listing| listing.holds(&snapshot.hash)),
    })
    .collect();
  let (grants, grants_error) = match grants {
    Ok(grants) => (Some(grants), None),
    Err(error) => (None, Some(error)),
  };
  to_value(StatusView {
    grants,
    grants_error,
    list_error: listing.err(),
    builds,
    deployed_hash: &state.deployed_hash,
    pending_hash: &state.pending_hash,
    watch: state.watch,
    watch_error: &state.watch_error,
    deploy_error: &state.deploy_error,
    settings: &state.settings,
    ui: &state.ui,
  })
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DeployPayload {
  hash: String,
}

/// Deploys a build from history to the host-granted profile. The target is
/// never taken from the payload; the host resolves it from the user's grant.
pub fn deploy(host: &mut impl Host, payload: Value) -> Result<Value, PluginError> {
  let DeployPayload { hash } = parse_payload(payload)?;
  if !is_sha256(&hash) {
    return Err(PluginError::new(
      codes::INVALID_REQUEST,
      "Build hash must be a lowercase SHA-256 digest",
    ));
  }
  let mut session = Session::load(host)?;
  let listing = Listing::read(host).ok();
  if let Some(listing) = &listing {
    reconcile(&mut session.state, listing);
  }
  session.save(host)?;
  if !session.state.has_build(&hash) {
    return Err(PluginError::new(
      UNKNOWN_BUILD,
      "Build is no longer in history",
    ));
  }
  if listing.is_some_and(|listing| !listing.holds(&hash)) {
    return Err(PluginError::new(
      ARTIFACT_UNAVAILABLE,
      "DMM no longer holds this staged build",
    ));
  }
  if api::grants(host)?.profile.is_none() {
    return Err(PluginError::new(
      PROFILE_NOT_GRANTED,
      "Choose a target profile for this plugin in DMM first",
    ));
  }
  session.state.pending_hash = Some(hash.clone());
  session.save(host)?;
  let result = api::mods_install(host, &hash);
  session.state.pending_hash = None;
  match result {
    Ok(()) => {
      session.state.deployed_hash = Some(hash);
      session.state.deploy_error = None;
      session.save(host)?;
      status(host)
    }
    Err(error) => {
      session.state.deploy_error = Some(error.clone());
      // The deploy failure matters more than a failed bookkeeping write, which
      // the next call recovers from through the pending hash.
      let _ = session.save(host);
      Err(error)
    }
  }
}

pub fn set_ui_state(host: &mut impl Host, payload: Value) -> Result<Value, PluginError> {
  let ui: UiState = parse_payload(payload)?;
  let mut session = Session::load(host)?;
  session.state.ui = ui;
  session.save(host)?;
  to_value(&session.state.ui)
}

/// Changing settings resets the watch status so the UI does not show an
/// observation made under the previous settings.
pub fn configure(host: &mut impl Host, payload: Value) -> Result<Value, PluginError> {
  let settings: Settings = parse_payload(payload)?;
  let mut session = Session::load(host)?;
  if session.state.settings != settings {
    session.state.settings = settings;
    session.state.watch = None;
    session.state.watch_error = None;
  }
  session.save(host)?;
  to_value(&session.state.settings)
}
