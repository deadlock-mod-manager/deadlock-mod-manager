use crate::handle;
use crate::state::HISTORY_LIMIT;
use dmm_plugin_sdk::{Host, PluginError, Value, dispatch, json};
use std::collections::{BTreeMap, BTreeSet};
use std::panic::{AssertUnwindSafe, catch_unwind};

#[derive(Clone, Copy, PartialEq)]
enum Trap {
  None,
  BeforeDeploy,
  AfterDeploy,
}

/// In-memory stand-in for the host broker, answering with the runtime's
/// hostcall shapes: grants, a snapshot store fed by `files.snapshot`, installs
/// to the picked profile, and plugin storage.
struct FakeHost {
  file_granted: bool,
  profile_granted: bool,
  snapshot: Value,
  marker_written: bool,
  staged: Vec<Value>,
  deployed: Option<String>,
  storage: BTreeMap<String, Value>,
  denied: BTreeSet<&'static str>,
  trap: Trap,
  calls: Vec<String>,
}

impl FakeHost {
  fn new() -> Self {
    Self {
      file_granted: true,
      profile_granted: true,
      snapshot: json!({ "state": "missing" }),
      marker_written: false,
      staged: Vec::new(),
      deployed: None,
      storage: BTreeMap::new(),
      denied: BTreeSet::new(),
      trap: Trap::None,
      calls: Vec::new(),
    }
  }

  fn file_ready(&mut self, build: u64) {
    self.snapshot = json!({ "state": "ready", "snapshot": snapshot(build) });
  }

  fn count(&self, method: &str) -> usize {
    self.calls.iter().filter(|call| *call == method).count()
  }
}

impl Host for FakeHost {
  fn call(&mut self, method: &str, params: Value) -> Result<Value, PluginError> {
    self.calls.push(method.to_owned());
    if self.denied.contains(method) {
      return Err(PluginError::new(
        "permission_denied",
        format!("{method} is not granted"),
      ));
    }
    let denied = |what: &str| {
      Err(PluginError::new(
        "permission_denied",
        format!("No {what} was picked for this plugin"),
      ))
    };
    match method {
      "grants.get" => Ok(json!({
        "permissions": [
          { "id": "files", "kind": "file", "extensions": ["vpk"], "access": "read" },
          { "id": "mods", "access": ["install"], "profiles": "picked" },
          { "id": "storage" },
        ],
        "file": self.file_granted.then(|| json!({ "name": "build_dir.vpk", "kind": "file" })),
        "profile": self.profile_granted.then(|| json!({ "folder": "skin-testing" })),
      })),
      "files.snapshot" | "files.snapshots" if !self.file_granted => denied("file or folder"),
      "mods.install" | "mods.installed" if !self.profile_granted => denied("profile"),
      "files.snapshot" => {
        assert!(params["path"].is_null(), "file grants take no path");
        if params["requireReadyMarker"] == true && !self.marker_written {
          return Ok(json!({ "state": "waitingForMarker", "fileName": "build_dir.vpk" }));
        }
        if self.snapshot["state"] == "ready" {
          let staged = self.snapshot["snapshot"].clone();
          if !self.staged.contains(&staged) {
            self.staged.insert(0, staged);
          }
        }
        let mut value = self.snapshot.clone();
        value["fileName"] = json!("build_dir.vpk");
        Ok(value)
      }
      "files.snapshots" => Ok(json!({ "snapshots": self.staged })),
      "mods.installed" => Ok(json!({ "hash": self.deployed })),
      "mods.install" => {
        assert_eq!(
          params.as_object().unwrap().len(),
          1,
          "install takes only a hash"
        );
        let hash = params["hash"].as_str().unwrap().to_owned();
        if !self.staged.iter().any(|staged| staged["hash"] == hash) {
          return Err(PluginError::new(
            "invalid_snapshot",
            "That snapshot is not staged",
          ));
        }
        if self.trap == Trap::BeforeDeploy {
          panic!("instance trapped before deploying");
        }
        self.deployed = Some(hash);
        if self.trap == Trap::AfterDeploy {
          panic!("instance trapped after deploying");
        }
        Ok(json!({ "hash": self.deployed }))
      }
      "storage.get" => Ok(json!({
        "value": self.storage.get(params["key"].as_str().unwrap()).cloned().unwrap_or(Value::Null),
      })),
      "storage.set" => {
        self.storage.insert(
          params["key"].as_str().unwrap().to_owned(),
          params["value"].clone(),
        );
        Ok(Value::Null)
      }
      other => panic!("unexpected hostcall {other}"),
    }
  }
}

fn hash(build: u64) -> String {
  format!("{build:064x}")
}

fn snapshot(build: u64) -> Value {
  json!({ "hash": hash(build), "size": 1000 + build, "resources": 3, "stagedAt": "2026-10-30T12:00:00Z" })
}

fn run(host: &mut FakeHost, command: &str, payload: Value) -> Value {
  let input = serde_json::to_vec(&json!({ "command": command, "payload": payload })).unwrap();
  let output = dispatch(&input, host, handle);
  serde_json::from_slice(&output).unwrap()
}

fn ok(host: &mut FakeHost, command: &str, payload: Value) -> Value {
  let response = run(host, command, payload);
  assert_eq!(response["ok"], true, "{command} failed: {response}");
  response["value"].clone()
}

fn error_code(host: &mut FakeHost, command: &str, payload: Value) -> String {
  let response = run(host, command, payload);
  assert_eq!(
    response["ok"], false,
    "{command} unexpectedly succeeded: {response}"
  );
  response["error"]["code"].as_str().unwrap().to_owned()
}

fn tick(host: &mut FakeHost) -> Value {
  ok(host, "tick", json!({}))
}

fn stage(host: &mut FakeHost, build: u64) {
  host.file_ready(build);
  assert_eq!(tick(host)["outcome"], "ready");
}

fn history(status: &Value) -> Vec<String> {
  status["builds"]
    .as_array()
    .unwrap()
    .iter()
    .map(|build| build["hash"].as_str().unwrap().to_owned())
    .collect()
}

#[test]
fn tick_without_a_file_grant_does_not_snapshot_or_write() {
  let mut host = FakeHost::new();
  host.file_granted = false;
  assert_eq!(tick(&mut host)["outcome"], "notConfigured");
  assert_eq!(host.count("files.snapshot"), 0);
  assert!(host.storage.is_empty());
}

#[test]
fn tick_stages_each_ready_build_once_and_waits_for_stable_output() {
  let mut host = FakeHost::new();
  host.snapshot = json!({ "state": "changing" });
  assert_eq!(tick(&mut host)["outcome"], "changing");
  let status = ok(&mut host, "status", json!({}));
  assert_eq!(status["watch"], "changing");
  assert!(history(&status).is_empty());

  stage(&mut host, 1);
  let writes = host.count("storage.set");
  tick(&mut host);
  tick(&mut host);
  assert_eq!(
    host.count("storage.set"),
    writes,
    "steady output must not rewrite storage"
  );

  stage(&mut host, 2);
  assert_eq!(
    history(&ok(&mut host, "status", json!({}))),
    vec![hash(2), hash(1)]
  );
  stage(&mut host, 1);
  assert_eq!(
    history(&ok(&mut host, "status", json!({}))),
    vec![hash(1), hash(2)]
  );
}

#[test]
fn history_is_bounded_and_keeps_the_deployed_build() {
  let mut host = FakeHost::new();
  stage(&mut host, 0);
  ok(&mut host, "deploy", json!({ "hash": hash(0) }));
  for build in 1..=12 {
    stage(&mut host, build);
  }
  let status = ok(&mut host, "status", json!({}));
  let builds = history(&status);
  assert_eq!(builds.len(), HISTORY_LIMIT);
  assert_eq!(builds[0], hash(12));
  assert_eq!(builds.last(), Some(&hash(0)));
  assert_eq!(status["deployedHash"], hash(0));
  assert_eq!(status["builds"][HISTORY_LIMIT - 1]["deployed"], true);
}

#[test]
fn invalid_output_is_reported_until_the_next_observation() {
  let mut host = FakeHost::new();
  host.snapshot = json!({ "state": "invalid", "message": "VPK resource checksum mismatch" });
  assert_eq!(tick(&mut host)["outcome"], "invalid");
  let status = ok(&mut host, "status", json!({}));
  assert_eq!(status["watchError"]["code"], "artifact_invalid");
  assert_eq!(
    status["watchError"]["message"],
    "VPK resource checksum mismatch"
  );

  stage(&mut host, 3);
  let status = ok(&mut host, "status", json!({}));
  assert!(status["watchError"].is_null());
  assert_eq!(status["builds"][0]["resources"], 3);
  assert_eq!(status["builds"][0]["size"], 1003);
}

#[test]
fn deploy_and_redeploy_follow_the_host_deployed_build() {
  let mut host = FakeHost::new();
  stage(&mut host, 1);
  stage(&mut host, 2);
  let status = ok(&mut host, "deploy", json!({ "hash": hash(1) }));
  assert_eq!(status["deployedHash"], hash(1));
  assert_eq!(status["builds"][1]["deployed"], true);
  assert_eq!(status["builds"][0]["deployed"], false);
  assert_eq!(
    ok(&mut host, "deploy", json!({ "hash": hash(2) }))["deployedHash"],
    hash(2)
  );
  assert_eq!(
    ok(&mut host, "deploy", json!({ "hash": hash(1) }))["deployedHash"],
    hash(1)
  );
  assert_eq!(host.deployed, Some(hash(1)));
  assert_eq!(host.count("mods.install"), 3);
}

#[test]
fn deploy_rejects_malformed_and_unknown_hashes_before_calling_the_host() {
  let mut host = FakeHost::new();
  stage(&mut host, 0xabc);
  for payload in [
    json!({ "hash": "not-a-hash" }),
    json!({ "hash": hash(0xabc).to_uppercase() }),
    json!({ "hash": hash(0xabc), "profile": "default" }),
    json!(null),
  ] {
    assert_eq!(error_code(&mut host, "deploy", payload), "invalid_request");
  }
  assert_eq!(
    error_code(&mut host, "deploy", json!({ "hash": hash(9) })),
    "unknown_build"
  );
  assert_eq!(host.count("mods.install"), 0);
}

#[test]
fn deploy_requires_a_profile_grant_and_a_build_the_host_still_holds() {
  let mut host = FakeHost::new();
  stage(&mut host, 1);
  host.profile_granted = false;
  assert_eq!(
    error_code(&mut host, "deploy", json!({ "hash": hash(1) })),
    "profile_not_granted"
  );

  host.profile_granted = true;
  host.staged.clear();
  assert_eq!(
    error_code(&mut host, "deploy", json!({ "hash": hash(1) })),
    "artifact_unavailable"
  );
  assert_eq!(
    ok(&mut host, "status", json!({}))["builds"][0]["available"],
    false
  );
  assert_eq!(host.count("mods.install"), 0);
}

#[test]
fn denied_deploy_is_recorded_without_leaving_a_pending_marker() {
  let mut host = FakeHost::new();
  stage(&mut host, 1);
  host.denied.insert("mods.install");
  assert_eq!(
    error_code(&mut host, "deploy", json!({ "hash": hash(1) })),
    "permission_denied"
  );
  let status = ok(&mut host, "status", json!({}));
  assert_eq!(status["deployError"]["code"], "permission_denied");
  assert!(status["pendingHash"].is_null());
  assert!(status["deployedHash"].is_null());

  host.denied.clear();
  let status = ok(&mut host, "deploy", json!({ "hash": hash(1) }));
  assert!(status["deployError"].is_null());
  assert_eq!(status["deployedHash"], hash(1));
}

#[test]
fn denied_storage_fails_commands_instead_of_losing_state() {
  let mut host = FakeHost::new();
  host.denied.insert("storage.get");
  assert_eq!(
    error_code(&mut host, "tick", json!({})),
    "permission_denied"
  );
  assert_eq!(
    error_code(&mut host, "status", json!({})),
    "permission_denied"
  );
  assert_eq!(host.count("files.snapshot"), 0);

  host.denied = BTreeSet::from(["storage.set"]);
  host.file_ready(1);
  assert_eq!(
    error_code(&mut host, "tick", json!({})),
    "permission_denied"
  );
}

#[test]
fn denied_snapshot_is_shown_and_cleared_once_access_returns() {
  let mut host = FakeHost::new();
  host.denied.insert("files.snapshot");
  assert_eq!(tick(&mut host)["outcome"], "error");
  assert_eq!(
    ok(&mut host, "status", json!({}))["watchError"]["code"],
    "permission_denied"
  );

  host.denied.clear();
  stage(&mut host, 1);
  assert!(ok(&mut host, "status", json!({}))["watchError"].is_null());
}

#[test]
fn status_still_returns_history_when_grants_and_listing_are_denied() {
  let mut host = FakeHost::new();
  stage(&mut host, 1);
  host.denied = BTreeSet::from(["grants.get", "files.snapshots"]);
  let status = ok(&mut host, "status", json!({}));
  assert_eq!(history(&status), vec![hash(1)]);
  assert!(status["grants"].is_null());
  assert_eq!(status["grantsError"]["code"], "permission_denied");
  assert_eq!(status["listError"]["code"], "permission_denied");
  assert!(status["builds"][0]["available"].is_null());
}

fn trapped_deploy(host: &mut FakeHost, trap: Trap, build: u64) {
  host.trap = trap;
  let result = catch_unwind(AssertUnwindSafe(|| {
    run(host, "deploy", json!({ "hash": hash(build) }))
  }));
  assert!(result.is_err());
  host.trap = Trap::None;
}

#[test]
fn deploy_interrupted_after_the_host_committed_is_recovered() {
  let mut host = FakeHost::new();
  stage(&mut host, 1);
  host.denied.insert("mods.install");
  assert!(
    !run(&mut host, "deploy", json!({ "hash": hash(1) }))["ok"]
      .as_bool()
      .unwrap()
  );
  host.denied.clear();
  trapped_deploy(&mut host, Trap::AfterDeploy, 1);
  assert_eq!(host.storage["workflow"]["pendingHash"], hash(1));

  let status = ok(&mut host, "status", json!({}));
  assert_eq!(status["deployedHash"], hash(1));
  assert!(status["pendingHash"].is_null());
  assert!(status["deployError"].is_null());
}

#[test]
fn deploy_interrupted_before_the_host_committed_asks_for_a_retry() {
  let mut host = FakeHost::new();
  stage(&mut host, 1);
  stage(&mut host, 2);
  ok(&mut host, "deploy", json!({ "hash": hash(1) }));
  trapped_deploy(&mut host, Trap::BeforeDeploy, 2);

  let status = ok(&mut host, "status", json!({}));
  assert_eq!(status["deployedHash"], hash(1));
  assert!(status["pendingHash"].is_null());
  assert_eq!(status["deployError"]["code"], "deploy_interrupted");
  assert_eq!(
    ok(&mut host, "deploy", json!({ "hash": hash(2) }))["deployedHash"],
    hash(2)
  );
}

#[test]
fn deployed_build_missing_from_history_is_restored_from_host_metadata() {
  let mut host = FakeHost::new();
  host.staged.push(snapshot(5));
  host.deployed = Some(hash(5));
  let status = ok(&mut host, "status", json!({}));
  assert_eq!(history(&status), vec![hash(5)]);
  assert_eq!(status["builds"][0]["deployed"], true);
}

#[test]
fn deployed_hash_survives_missing_history_and_staged_snapshot() {
  let mut host = FakeHost::new();
  host.deployed = Some(hash(5));
  let status = ok(&mut host, "status", json!({}));
  assert_eq!(status["deployedHash"], hash(5));
  assert!(history(&status).is_empty());
  assert_eq!(ok(&mut host, "status", json!({}))["deployedHash"], hash(5));
}

#[test]
fn unreadable_stored_state_is_reset_and_reported() {
  for stored in [
    json!({ "schema": 99 }),
    json!("garbage"),
    json!({ "schema": 1, "builds": [{ "hash": "x" }] }),
  ] {
    let mut host = FakeHost::new();
    host.storage.insert("workflow".into(), stored);
    let status = ok(&mut host, "status", json!({}));
    assert!(history(&status).is_empty());
    assert_eq!(status["watchError"]["code"], "state_reset");
    assert_eq!(host.storage["workflow"]["schema"], 1);
  }
}

#[test]
fn ui_state_round_trips_through_storage() {
  let mut host = FakeHost::new();
  assert_eq!(
    ok(&mut host, "status", json!({}))["ui"]["historyExpanded"],
    false
  );
  ok(&mut host, "setUiState", json!({ "historyExpanded": true }));
  assert_eq!(
    ok(&mut host, "status", json!({}))["ui"]["historyExpanded"],
    true
  );
  assert_eq!(
    error_code(&mut host, "setUiState", json!({ "historyExpanded": "yes" })),
    "invalid_request"
  );
  assert_eq!(
    error_code(&mut host, "setUiState", json!({ "theme": "dark" })),
    "invalid_request"
  );
}

#[test]
fn unknown_commands_are_rejected() {
  let mut host = FakeHost::new();
  assert_eq!(
    error_code(&mut host, "creator_bridge_status", json!({})),
    "unknown_command"
  );
  assert!(host.calls.is_empty());
}

#[test]
fn ready_marker_setting_is_passed_to_the_host_snapshot() {
  let mut host = FakeHost::new();
  host.file_ready(1);
  let settings = ok(
    &mut host,
    "configure",
    json!({ "requireReadyMarker": true }),
  );
  assert_eq!(settings, json!({ "requireReadyMarker": true }));
  assert_eq!(tick(&mut host)["outcome"], "waitingForMarker");
  assert_eq!(
    ok(&mut host, "status", json!({}))["watch"],
    "waitingForMarker"
  );

  host.marker_written = true;
  assert_eq!(tick(&mut host)["outcome"], "ready");
  assert_eq!(
    error_code(
      &mut host,
      "configure",
      json!({ "outputPath": "C:/elsewhere.vpk" })
    ),
    "invalid_request"
  );
}
