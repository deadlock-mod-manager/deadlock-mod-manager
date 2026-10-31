//! Lifecycle and worker tests. Workers are real processes: this test binary
//! re-runs itself with `worker_child_process` selected, which then serves the
//! worker protocol exactly like the app binary in `--dmm-plugin-worker` mode.

use super::*;
use crate::adapter::tests::TestProfiles;
use crate::package::tests::{full_permissions, plugin_archive, write_archive};
use crate::snapshots::tests::vpk;
use serde_json::{Value, json};
use std::sync::atomic::Ordering;

const CHILD_ENV: &str = "DMM_PLUGIN_WORKER_TEST_CHILD";
const ID: &str = "example.creator-workspace-bridge";

#[test]
fn worker_child_process() {
  if std::env::var_os(CHILD_ENV).is_some() {
    std::process::exit(worker::run());
  }
}

struct Fixture {
  dir: tempfile::TempDir,
  host: Arc<PluginHost>,
  adapter: Arc<TestProfiles>,
}

fn launcher(dir: &Path) -> WorkerLauncher {
  WorkerLauncher {
    program: std::env::current_exe().unwrap(),
    args: [
      "tests::worker_child_process",
      "--exact",
      "--nocapture",
      "--test-threads=1",
    ]
    .map(Into::into)
    .to_vec(),
    env: vec![(CHILD_ENV.into(), "1".into())],
    cwd: dir.to_path_buf(),
  }
}

fn open(dir: tempfile::TempDir) -> Fixture {
  let citadel = dir.path().join("game/citadel");
  fs::create_dir_all(citadel.join("addons/test-profile")).unwrap();
  fs::write(citadel.join("gameinfo.gi"), b"").unwrap();
  let adapter = Arc::new(TestProfiles::new(citadel.join("addons")));
  let host = PluginHost::open(
    dir.path().join("plugins"),
    launcher(dir.path()),
    Arc::clone(&adapter) as Arc<dyn HostAdapter>,
  )
  .unwrap();
  host.set_runtime_enabled(true);
  Fixture {
    dir,
    host: Arc::new(host),
    adapter,
  }
}

fn fixture() -> Fixture {
  open(tempfile::tempdir().unwrap())
}

impl Fixture {
  fn install(&self, version: &str) -> ExternalPluginSummary {
    let archive = self.dir.path().join(format!("plugin-{version}.zip"));
    plugin_archive(&archive, version);
    self.host.install(&archive).unwrap()
  }

  fn install_with(&self, version: &str, permissions: Value) -> ExternalPluginSummary {
    self
      .host
      .install(&archive_with(self, version, permissions))
      .unwrap()
  }

  fn output(&self) -> PathBuf {
    let output = self.dir.path().join("output.vpk");
    fs::write(&output, vpk("skin")).unwrap();
    output
  }

  /// Grants what the installed manifest asks for: the output file when it
  /// requests `files`, the test profile when it requests a picked profile.
  fn enable(&self) -> u64 {
    let summary = self.host.summary(ID).unwrap();
    let asks = |id: &str| {
      summary
        .required_permissions
        .iter()
        .any(|permission| serde_json::to_value(permission).unwrap()["id"] == id)
    };
    let output = self.output();
    let file = asks("files").then(|| output.to_str().unwrap().to_owned());
    let profile = asks("mods").then_some("test-profile");
    self.host.grant(ID, file.as_deref(), profile).unwrap();
    self.host.set_enabled(ID, true).unwrap();
    self.generation()
  }

  fn generation(&self) -> u64 {
    self.host.view(ID).unwrap().generation
  }

  fn call(&self, generation: u64, command: &str, payload: Value) -> Result<Value, SessionDenied> {
    self
      .host
      .ui_call(ID, generation, command, &payload.to_string())
      .map(|output| serde_json::from_str(&output).unwrap())
  }

  fn hostcall(&self, generation: u64, method: &str, params: Value) -> Value {
    self
      .call(
        generation,
        "host",
        json!({ "method": method, "params": params }),
      )
      .unwrap()
  }
}

/// An archive whose manifest requires exactly `permissions`.
fn archive_with(fixture: &Fixture, version: &str, permissions: Value) -> PathBuf {
  let digest = scope_digest(&permissions);
  let archive = fixture
    .dir
    .path()
    .join(format!("plugin-{version}-{digest}.zip"));
  let mut manifest: Value = serde_json::from_str(&package::tests::manifest_json(version)).unwrap();
  manifest["permissions"]["required"] = permissions;
  manifest["changelog"] = json!([format!("Release {version}")]);
  let wasm = abi::tests::test_guest();
  write_archive(
    &archive,
    &[
      ("manifest.json", manifest.to_string().as_bytes()),
      ("ui/index.html", b"<!doctype html>"),
      ("backend.wasm", &wasm),
    ],
  );
  archive
}

fn scope_digest(permissions: &Value) -> String {
  use sha2::Digest;
  format!(
    "{:x}",
    sha2::Sha256::digest(permissions.to_string().as_bytes())
  )[..12]
    .to_owned()
}

fn files_vpk() -> Value {
  json!({ "id": "files", "kind": "file", "extensions": ["vpk"], "access": "read" })
}

fn mods_install() -> Value {
  json!({ "id": "mods", "access": ["read", "install"], "profiles": "picked" })
}

/// The output file, a dedicated profile and storage.
fn narrow() -> Value {
  json!([files_vpk(), mods_install(), { "id": "storage" }])
}

fn permission(value: Value) -> ExternalPluginPermission {
  serde_json::from_value(value).unwrap()
}

#[test]
fn install_starts_disabled_and_requires_consent() {
  let fixture = fixture();
  let summary = fixture.install("0.1.0");
  assert!(!summary.enabled);
  assert_eq!(summary.status, registry::ExternalPluginStatus::NeedsConsent);
  assert_eq!(summary.required_permissions.len(), 6);
  assert!(fixture.host.set_enabled(ID, true).is_err());
  assert!(fixture.host.view(ID).is_err());
}

#[test]
fn grants_take_exactly_the_resources_the_manifest_asks_for() {
  let fixture = fixture();
  fixture.install("0.1.0");
  let output = fixture.output();
  let output = output.to_str().unwrap();
  let grant = |file: Option<&str>, profile: Option<&str>| fixture.host.grant(ID, file, profile);
  assert!(
    grant(None, Some("test-profile")).is_err(),
    "files needs a file"
  );
  assert!(grant(Some(output), None).is_err(), "mods needs a profile");
  assert!(
    grant(Some(output), Some("default")).is_err(),
    "install never targets the default profile"
  );
  assert!(grant(Some(output), Some("missing-profile")).is_err());
  assert!(grant(Some(output), Some("../escape")).is_err());
  assert!(grant(Some("relative.vpk"), Some("test-profile")).is_err());
  let text = fixture.dir.path().join("notes.txt");
  fs::write(&text, b"x").unwrap();
  assert!(
    grant(Some(text.to_str().unwrap()), Some("test-profile")).is_err(),
    "the extension filter applies to the picked file"
  );
  assert!(
    grant(
      Some(fixture.dir.path().to_str().unwrap()),
      Some("test-profile")
    )
    .is_err(),
    "a file request does not take a folder"
  );
  let inside = fixture.host.root().join("inside.vpk");
  fs::write(&inside, vpk("x")).unwrap();
  assert!(grant(Some(inside.to_str().unwrap()), Some("test-profile")).is_err());
  let pending = fixture.dir.path().join("not-built-yet.vpk");
  let summary = grant(Some(pending.to_str().unwrap()), Some("test-profile")).unwrap();
  let granted = summary.grant.unwrap();
  let file = granted.file.unwrap();
  assert_eq!(file.name, "not-built-yet.vpk");
  assert_eq!(file.kind, ExternalPluginFileKind::File);
  assert!(!file.path.starts_with(r"\\?\"), "{}", file.path);
  assert_eq!(granted.profile_folder.as_deref(), Some("test-profile"));
  assert_eq!(granted.permissions.len(), 6);
  assert_eq!(summary.status, registry::ExternalPluginStatus::Disabled);

  fixture.host.revoke(ID).unwrap();
  fixture.install_with(
    "0.2.0",
    json!([
      { "id": "files", "kind": "folder", "access": "readWrite" },
      { "id": "mods", "access": ["read"], "profiles": "picked" }
    ]),
  );
  let folder = fixture.dir.path().join("workspace");
  fs::create_dir_all(&folder).unwrap();
  let folder = folder.to_str().unwrap();
  assert!(
    grant(Some(output), Some("default")).is_err(),
    "a folder request does not take a file"
  );
  assert!(
    grant(Some(fixture.dir.path().to_str().unwrap()), Some("default")).is_err(),
    "a folder that contains plugin storage is refused"
  );
  let read_only = grant(Some(folder), Some("default")).unwrap();
  assert_eq!(
    read_only.grant.unwrap().profile_folder.as_deref(),
    Some("default"),
    "reading may target the default profile"
  );

  fixture.host.revoke(ID).unwrap();
  fixture.install_with("0.3.0", json!([{ "id": "storage" }]));
  assert!(grant(Some(folder), None).is_err(), "no file was asked for");
  assert!(
    grant(None, Some("test-profile")).is_err(),
    "no profile was asked for"
  );
  let storage_only = grant(None, None).unwrap().grant.unwrap();
  assert!(storage_only.file.is_none() && storage_only.profile_folder.is_none());
}

#[test]
fn runs_commands_and_hostcalls_in_a_worker_process() {
  let fixture = fixture();
  fixture.install("0.1.0");
  let generation = fixture.enable();
  let echo = fixture.call(generation, "echo", json!({ "n": 1 })).unwrap();
  assert_eq!(echo["value"]["payload"]["n"], 1);
  assert!(fixture.host.supervisor.is_running(ID));

  let set = fixture.hostcall(
    generation,
    "storage.set",
    json!({ "key": "history", "value": [1, 2] }),
  );
  assert_eq!(set["ok"], true, "{set}");
  let get = fixture.hostcall(generation, "storage.get", json!({ "key": "history" }));
  assert_eq!(get["value"]["value"], json!([1, 2]));

  let grants = fixture.hostcall(generation, "grants.get", Value::Null);
  assert_eq!(grants["value"]["file"]["name"], "output.vpk");
  assert_eq!(grants["value"]["file"]["kind"], "file");
  assert_eq!(grants["value"]["profile"]["folder"], "test-profile");
  assert_eq!(grants["value"]["permissions"], full_permissions());
  assert!(
    !grants
      .to_string()
      .contains(&fixture.dir.path().display().to_string()),
    "plugins learn the file name, not the full path"
  );

  let info = fixture.hostcall(generation, "files.info", Value::Null);
  assert_eq!(info["value"]["exists"], true);
  assert_eq!(info["value"]["size"], vpk("skin").len());
  let read = fixture.hostcall(
    generation,
    "files.read",
    json!({ "length": 4, "encoding": "base64" }),
  );
  assert_eq!(
    read["value"]["data"],
    files::encode_base64(&vpk("skin")[..4])
  );
  assert_eq!(read["value"]["eof"], false);
  let with_path = fixture.hostcall(
    generation,
    "files.read",
    json!({ "path": "output.vpk", "encoding": "utf8" }),
  );
  assert_eq!(with_path["error"]["code"], "invalid_params");

  fixture.adapter.game_running.store(true, Ordering::SeqCst);
  let state = fixture.hostcall(generation, "game.state", Value::Null);
  assert_eq!(state["value"]["running"], true);

  let mods = fixture.hostcall(generation, "mods.list", Value::Null);
  assert_eq!(mods["value"]["profiles"][0]["folder"], "test-profile");
  assert_eq!(mods["value"]["profiles"][0]["mods"], json!([]));

  let unknown = fixture.hostcall(generation, "process.spawn", Value::Null);
  assert_eq!(unknown["error"]["code"], "unknown_method");
}

#[test]
fn snapshots_and_installs_through_hostcalls() {
  let fixture = fixture();
  fixture.install("0.1.0");
  let generation = fixture.enable();
  let first = fixture.hostcall(generation, "files.snapshot", Value::Null);
  assert_eq!(first["value"]["state"], "changing", "{first}");
  assert_eq!(first["value"]["fileName"], "output.vpk");
  // Stage directly instead of sleeping through the stability window.
  let plugin = fixture.host.authorize(ID, generation).unwrap();
  let services = fixture.host.services(ID);
  let output = PathBuf::from(plugin.grant.file.as_deref().unwrap());
  let (staged, _) = services
    .snapshots
    .stage(&output, snapshots::stamp(&output).unwrap(), &[])
    .unwrap();

  let list = fixture.hostcall(generation, "files.snapshots", Value::Null);
  assert_eq!(list["value"]["snapshots"][0]["hash"], staged.hash);
  assert_eq!(list["value"]["snapshots"][0]["resources"], 1);
  let installed = fixture.hostcall(generation, "mods.installed", Value::Null);
  assert!(installed["value"]["hash"].is_null(), "{installed}");

  let install = fixture.hostcall(generation, "mods.install", json!({ "hash": staged.hash }));
  assert_eq!(install["value"]["hash"], staged.hash, "{install}");
  let installed = fixture.hostcall(generation, "mods.installed", Value::Null);
  assert_eq!(installed["value"]["hash"], staged.hash);
  let mods = fixture.hostcall(generation, "mods.list", Value::Null);
  assert_eq!(mods["value"]["profiles"][0]["mods"][0]["id"], ID);
  let unknown = fixture.hostcall(
    generation,
    "mods.install",
    json!({ "hash": "0".repeat(64) }),
  );
  assert_eq!(unknown["error"]["code"], "invalid_snapshot");
}

#[test]
fn folder_grants_resolve_paths_and_refuse_escapes() {
  let fixture = fixture();
  fixture.install_with(
    "0.1.0",
    json!([{ "id": "files", "kind": "folder", "extensions": ["json"], "access": "readWrite" }]),
  );
  let folder = fixture.dir.path().join("workspace");
  fs::create_dir_all(folder.join("builds")).unwrap();
  fs::write(fixture.dir.path().join("secret.json"), b"{}").unwrap();
  fixture
    .host
    .grant(ID, Some(folder.to_str().unwrap()), None)
    .unwrap();
  fixture.host.set_enabled(ID, true).unwrap();
  let generation = fixture.generation();

  let write = fixture.hostcall(
    generation,
    "files.write",
    json!({ "path": "builds/state.json", "data": "{\"n\":1}", "encoding": "utf8" }),
  );
  assert_eq!(write["value"]["size"], 7, "{write}");
  assert_eq!(
    fs::read(folder.join("builds/state.json")).unwrap(),
    br#"{"n":1}"#
  );
  let read = fixture.hostcall(
    generation,
    "files.read",
    json!({ "path": "builds/state.json", "encoding": "utf8" }),
  );
  assert_eq!(read["value"]["data"], r#"{"n":1}"#);
  assert_eq!(read["value"]["eof"], true);
  let list = fixture.hostcall(generation, "files.list", json!({ "path": "builds" }));
  assert_eq!(list["value"]["entries"][0]["name"], "state.json");
  assert_eq!(list["value"]["truncated"], false);

  for (method, params) in [
    (
      "files.read",
      json!({ "path": "../secret.json", "encoding": "utf8" }),
    ),
    (
      "files.write",
      json!({ "path": "run.exe", "data": "x", "encoding": "utf8" }),
    ),
  ] {
    let refused = fixture.hostcall(generation, method, params);
    assert_eq!(refused["error"]["code"], "permission_denied", "{refused}");
  }
  let missing = fixture.hostcall(
    generation,
    "files.read",
    json!({ "path": "builds/none.json", "encoding": "utf8" }),
  );
  assert_eq!(missing["error"]["code"], "not_found");

  let activity = fixture.host.activity(ID, 10).unwrap();
  let kinds: Vec<_> = activity.iter().map(|entry| entry.kind).collect();
  assert_eq!(
    kinds,
    [
      ExternalPluginActivityKind::Blocked,
      ExternalPluginActivityKind::Blocked,
      ExternalPluginActivityKind::Wrote,
      ExternalPluginActivityKind::Granted
    ]
  );
  assert_eq!(activity[2].file_name.as_deref(), Some("state.json"));
  assert_eq!(
    activity[1].permission,
    Some(ExternalPluginPermissionId::Files)
  );
}

#[test]
fn read_only_scopes_refuse_writes_and_installs() {
  let fixture = fixture();
  fixture.install_with(
    "0.1.0",
    json!([files_vpk(), { "id": "mods", "access": ["read"], "profiles": "all" }]),
  );
  let output = fixture.output();
  fixture
    .host
    .grant(ID, Some(output.to_str().unwrap()), None)
    .unwrap();
  fixture.host.set_enabled(ID, true).unwrap();
  let generation = fixture.generation();
  let write = fixture.hostcall(
    generation,
    "files.write",
    json!({ "data": "x", "encoding": "utf8" }),
  );
  assert_eq!(write["error"]["code"], "permission_denied");
  for method in ["mods.install", "mods.installed", "storage.get"] {
    let refused = fixture.hostcall(
      generation,
      method,
      json!({ "hash": "a".repeat(64), "key": "k" }),
    );
    assert_eq!(refused["error"]["code"], "permission_denied", "{method}");
  }
  let all = fixture.hostcall(generation, "mods.list", Value::Null);
  let folders: Vec<_> = all["value"]["profiles"]
    .as_array()
    .unwrap()
    .iter()
    .map(|profile| profile["folder"].clone())
    .collect();
  assert_eq!(folders, [json!("default"), json!("test-profile")]);
}

#[test]
fn fetches_through_the_adapter_within_the_granted_hosts() {
  let fixture = fixture();
  fixture.install("0.1.0");
  let generation = fixture.enable();
  let fetched = fixture.hostcall(
    generation,
    "http.fetch",
    json!({
      "url": "https://api.example.com/v1/heroes",
      "method": "POST",
      "headers": { "Content-Type": "application/json" },
      "body": "{}"
    }),
  );
  assert_eq!(fetched["value"]["status"], 200, "{fetched}");
  assert_eq!(fetched["value"]["body"], r#"{"ok":true}"#);
  assert_eq!(fetched["value"]["bodyEncoding"], "utf8");
  assert!(fetched["value"]["headers"].get("set-cookie").is_none());
  let sent = fixture.adapter.fetches.lock().unwrap().clone();
  assert_eq!(sent.len(), 1);
  assert_eq!(sent[0].host, "api.example.com");
  assert_eq!(sent[0].body, b"{}");

  let elsewhere = fixture.hostcall(
    generation,
    "http.fetch",
    json!({ "url": "https://evil.example.com/", "method": "GET" }),
  );
  assert_eq!(elsewhere["error"]["code"], "permission_denied");
  let cookie = fixture.hostcall(
    generation,
    "http.fetch",
    json!({ "url": "https://api.example.com/", "method": "GET", "headers": { "Cookie": "a=1" } }),
  );
  assert_eq!(cookie["error"]["code"], "invalid_params");
  assert_eq!(fixture.adapter.fetches.lock().unwrap().len(), 1);

  let activity = fixture.host.activity(ID, 2).unwrap();
  assert_eq!(activity[0].kind, ExternalPluginActivityKind::Blocked);
  assert_eq!(activity[0].host.as_deref(), Some("evil.example.com"));
  assert_eq!(
    activity[0].permission,
    Some(ExternalPluginPermissionId::Network)
  );
  assert_eq!(activity[1].kind, ExternalPluginActivityKind::Fetched);
  assert_eq!(activity[1].host.as_deref(), Some("api.example.com"));
}

#[test]
fn notifications_are_rate_limited_per_plugin() {
  let fixture = fixture();
  fixture.install("0.1.0");
  let generation = fixture.enable();
  let shown = Arc::new(Mutex::new(Vec::new()));
  let sink = Arc::clone(&shown);
  fixture
    .host
    .set_notification_hook(Box::new(move |id, title, body| {
      sink
        .lock()
        .unwrap()
        .push((id.to_owned(), title.to_owned(), body.to_owned()));
    }));
  let show = |title: &str| {
    fixture.hostcall(
      generation,
      "notifications.show",
      json!({ "title": title, "body": "Build ready" }),
    )
  };
  for index in 0..3 {
    assert_eq!(show(&format!("Build {index}"))["ok"], true);
  }
  assert_eq!(show("Build 3")["error"]["code"], "rate_limited");
  assert_eq!(show(&"x".repeat(61))["error"]["code"], "invalid_params");
  let long_body = fixture.hostcall(
    generation,
    "notifications.show",
    json!({ "title": "t", "body": "x".repeat(201) }),
  );
  assert_eq!(long_body["error"]["code"], "invalid_params");
  let shown = shown.lock().unwrap();
  assert_eq!(shown.len(), 3);
  assert_eq!(
    shown[0],
    (
      ID.to_owned(),
      "Build 0".to_owned(),
      "Build ready".to_owned()
    )
  );
  let newest = &fixture.host.activity(ID, 1).unwrap()[0];
  assert_eq!(newest.kind, ExternalPluginActivityKind::Notified);
  assert_eq!(newest.reason.as_deref(), Some("Build 2"));

  // Another plugin has its own allowance.
  assert!(fixture.host.allow_notification("example.other"));
}

#[test]
fn disable_revoke_and_update_retire_sessions() {
  let fixture = fixture();
  fixture.install("0.1.0");
  let generation = fixture.enable();
  assert!(fixture.call(generation, "echo", Value::Null).is_ok());

  fixture.host.set_enabled(ID, false).unwrap();
  assert!(!fixture.host.supervisor.is_running(ID));
  assert_eq!(
    fixture.call(generation, "echo", Value::Null),
    Err(SessionDenied::Stale)
  );

  fixture.host.set_enabled(ID, true).unwrap();
  let generation = fixture.generation();
  assert!(fixture.call(generation, "echo", Value::Null).is_ok());
  fixture.host.revoke(ID).unwrap();
  assert_eq!(
    fixture.call(generation, "echo", Value::Null),
    Err(SessionDenied::Stale)
  );
  assert!(fixture.host.set_enabled(ID, true).is_err());

  let generation = fixture.enable();
  let updated = fixture.install("0.2.0");
  assert_eq!(updated.version, "0.2.0");
  assert!(
    updated.enabled,
    "an update with the same permissions keeps consent"
  );
  assert_eq!(
    fixture.call(generation, "echo", Value::Null),
    Err(SessionDenied::Stale)
  );
  assert!(
    fixture
      .call(fixture.generation(), "echo", Value::Null)
      .is_ok()
  );

  let archive = fixture.dir.path().join("plugin-0.1.0.zip");
  assert!(
    fixture.host.install(&archive).is_err(),
    "downgrades are refused"
  );
}

#[test]
fn runtime_suspension_stops_workers_and_retires_views_without_losing_opt_ins() {
  let fixture = fixture();
  fixture.install("0.1.0");
  let generation = fixture.enable();
  assert!(fixture.call(generation, "echo", Value::Null).is_ok());
  assert!(fixture.host.supervisor.is_running(ID));

  fixture.host.set_runtime_enabled(false);
  assert!(!fixture.host.supervisor.is_running(ID));
  assert!(fixture.host.view(ID).is_err());
  assert!(fixture.call(generation, "echo", Value::Null).is_err());
  let summary = fixture.host.summary(ID).unwrap();
  assert!(summary.enabled);
  assert!(summary.grant.is_some());

  fixture.host.set_runtime_enabled(true);
  assert!(matches!(
    fixture.host.read_view_asset(ID, generation, "app.js"),
    Err(SessionDenied::Stale)
  ));
  assert!(
    fixture
      .call(fixture.generation(), "echo", Value::Null)
      .is_ok()
  );

  fixture.host.set_runtime_enabled(false);
  let reopened = PluginHost::open(
    fixture.host.root().to_path_buf(),
    launcher(fixture.dir.path()),
    Arc::clone(&fixture.adapter) as Arc<dyn HostAdapter>,
  )
  .unwrap();
  assert!(!reopened.runtime_enabled());
  assert!(reopened.view(ID).is_err());
  assert!(reopened.summary(ID).unwrap().enabled);
  reopened.set_runtime_enabled(true);
  assert!(reopened.view(ID).is_ok());
}

fn package_dirs(fixture: &Fixture) -> usize {
  fs::read_dir(fixture.host.root().join("packages").join(ID)).map_or(0, |entries| entries.count())
}

fn record_changes(fixture: &Fixture) -> Arc<Mutex<Vec<String>>> {
  let changes = Arc::new(Mutex::new(Vec::new()));
  let sink = Arc::clone(&changes);
  fixture
    .host
    .set_retire_hook(Box::new(move |id| sink.lock().unwrap().push(id.to_owned())));
  changes
}

#[test]
fn update_with_new_permissions_waits_for_approval() {
  let fixture = fixture();
  fixture.install_with("0.1.0", narrow());
  let generation = fixture.enable();
  let changes = record_changes(&fixture);

  let staged = fixture.install("0.2.0");
  assert_eq!(staged.version, "0.1.0");
  assert!(staged.enabled);
  assert_eq!(staged.status, registry::ExternalPluginStatus::Enabled);
  let pending = staged.pending_update.unwrap();
  assert_eq!(pending.version, "0.2.0");
  assert_eq!(
    pending.new_permissions,
    [
      permission(json!({ "id": "network", "hosts": ["api.example.com"] })),
      permission(json!({ "id": "game" })),
      permission(json!({ "id": "notifications" })),
    ]
  );
  assert_eq!(fixture.generation(), generation);
  assert!(
    fixture.call(generation, "echo", Value::Null).is_ok(),
    "the installed version keeps running"
  );
  assert_eq!(changes.lock().unwrap().as_slice(), [ID]);

  let newer = archive_with(&fixture, "0.3.0", full_permissions());
  let replaced = fixture.host.install(&newer).unwrap();
  assert_eq!(replaced.pending_update.unwrap().version, "0.3.0");
  assert_eq!(package_dirs(&fixture), 2, "the replaced update is deleted");
  let again = fixture.host.install(&newer).unwrap();
  assert_eq!(again.pending_update.unwrap().version, "0.3.0");

  let applied = fixture.host.apply_update(ID).unwrap();
  assert_eq!(applied.version, "0.3.0");
  assert_eq!(applied.changelog, ["Release 0.3.0"]);
  assert!(applied.enabled);
  assert!(applied.pending_update.is_none());
  let grant = applied.grant.unwrap();
  assert_eq!(grant.permissions.len(), 6);
  assert_eq!(grant.profile_folder.as_deref(), Some("test-profile"));
  assert_eq!(grant.file.unwrap().name, "output.vpk");
  assert_eq!(package_dirs(&fixture), 1);
  assert_eq!(
    fixture.call(generation, "echo", Value::Null),
    Err(SessionDenied::Stale)
  );
  assert!(
    fixture
      .call(fixture.generation(), "echo", Value::Null)
      .is_ok()
  );
  let newest = &fixture.host.activity(ID, 1).unwrap()[0];
  assert_eq!(newest.kind, ExternalPluginActivityKind::Updated);
  assert_eq!(newest.reason.as_deref(), Some("0.3.0"));
  assert!(fixture.host.apply_update(ID).is_err());
}

#[test]
fn changed_scopes_need_consent_and_clear_resources_they_no_longer_allow() {
  let fixture = fixture();
  fixture.install_with("0.1.0", narrow());
  fixture.enable();

  let broader = json!([
    { "id": "files", "kind": "file", "extensions": ["vpk", "zip"], "access": "read" },
    mods_install(),
    { "id": "storage" }
  ]);
  let pending = fixture
    .install_with("0.2.0", broader)
    .pending_update
    .unwrap();
  assert_eq!(
    pending.new_permissions.len(),
    1,
    "only the changed request waits"
  );
  let applied = fixture.host.apply_update(ID).unwrap();
  assert!(applied.enabled, "the picked file still fits the new scope");
  assert!(applied.grant.unwrap().file.is_some());

  let folder = json!([
    { "id": "files", "kind": "folder", "access": "read" },
    { "id": "mods", "access": ["read"], "profiles": "all" },
    { "id": "storage" }
  ]);
  fixture.install_with("0.3.0", folder);
  let applied = fixture.host.apply_update(ID).unwrap();
  let grant = applied.grant.unwrap();
  assert!(
    grant.file.is_none(),
    "a file does not answer a folder request"
  );
  assert!(
    grant.profile_folder.is_none(),
    "profiles: all needs no picked profile"
  );
  assert_eq!(applied.status, registry::ExternalPluginStatus::NeedsConsent);
  assert!(!applied.enabled);
}

#[test]
fn removed_requests_lose_approval_and_need_consent_when_reintroduced() {
  let fixture = fixture();
  fixture.install("0.1.0");
  fixture.enable();
  let without_network: Vec<_> = full_permissions()
    .as_array()
    .unwrap()
    .iter()
    .filter(|request| request["id"] != "network")
    .cloned()
    .collect();
  let narrower = fixture.install_with("0.2.0", json!(without_network));
  assert!(narrower.enabled);
  assert_eq!(narrower.grant.unwrap().permissions.len(), 5);
  let reintroduced = fixture.install_with("0.3.0", full_permissions());
  assert_eq!(reintroduced.version, "0.2.0");
  assert_eq!(
    reintroduced.pending_update.unwrap().new_permissions,
    [permission(
      json!({ "id": "network", "hosts": ["api.example.com"] })
    )]
  );
}

#[test]
fn updates_install_at_once_when_covered_or_ungranted() {
  let fixture = fixture();
  fixture.install_with("0.1.0", narrow());
  let ungranted = fixture.install("0.2.0");
  assert_eq!(ungranted.version, "0.2.0");
  assert!(ungranted.pending_update.is_none());
  assert_eq!(
    ungranted.status,
    registry::ExternalPluginStatus::NeedsConsent
  );

  let generation = fixture.enable();
  let narrower = fixture.install_with("0.3.0", narrow());
  assert_eq!(narrower.version, "0.3.0");
  assert!(narrower.enabled);
  assert_ne!(fixture.generation(), generation);
  assert_eq!(package_dirs(&fixture), 1);
}

#[test]
fn discard_and_remove_delete_pending_packages() {
  let fixture = fixture();
  fixture.install_with("0.1.0", narrow());
  let generation = fixture.enable();
  fixture.install("0.2.0");
  let changes = record_changes(&fixture);
  fixture.host.discard_update(ID).unwrap();
  assert_eq!(changes.lock().unwrap().as_slice(), [ID]);
  let summary = fixture.host.summary(ID).unwrap();
  assert!(summary.pending_update.is_none());
  assert_eq!(summary.version, "0.1.0");
  assert_eq!(package_dirs(&fixture), 1);
  assert_eq!(fixture.generation(), generation);
  assert!(fixture.host.discard_update(ID).is_err());

  fixture.install("0.2.0");
  assert_eq!(package_dirs(&fixture), 2);
  fixture.host.remove(ID).unwrap();
  assert!(!fixture.host.root().join("packages").join(ID).exists());
}

#[test]
fn catalog_installs_check_the_published_hash() {
  let fixture = fixture();
  let archive = fixture.dir.path().join("catalog.zip");
  plugin_archive(&archive, "0.1.0");
  let wrong = "0".repeat(64);
  assert!(fixture.host.install_catalog(&archive, &wrong).is_err());
  assert!(fixture.host.list().is_empty());
  let hash = snapshots::hash(&archive).unwrap();
  let summary = fixture.host.install_catalog(&archive, &hash).unwrap();
  assert_eq!(summary.source, ExternalPluginSource::Catalog);
  assert_eq!(summary.package_hash, hash);
  assert_eq!(summary.package_size, fs::metadata(&archive).unwrap().len());
}

#[test]
fn registry_version_1_round_trips_and_other_versions_are_preserved() {
  let fixture = fixture();
  let root = fixture.host.root();
  fixture.install("0.1.0");
  let saved: Value =
    serde_json::from_slice(&fs::read(root.join("registry.json")).unwrap()).unwrap();
  assert_eq!(saved["schemaVersion"], 1);
  assert!(registry::Registry::open(root).unwrap().get(ID).is_some());

  for version in [0, 2] {
    let mut unsupported = saved.clone();
    unsupported["schemaVersion"] = json!(version);
    let bytes = serde_json::to_vec(&unsupported).unwrap();
    fs::write(root.join("registry.json"), &bytes).unwrap();
    assert!(registry::Registry::open(root).is_err());
    assert_eq!(fs::read(root.join("registry.json")).unwrap(), bytes);
    assert!(root.join("packages").join(ID).is_dir());
  }
}

#[test]
fn refused_hostcalls_are_logged_once_and_announced() {
  let fixture = fixture();
  fixture.install_with("0.1.0", json!([files_vpk(), { "id": "storage" }]));
  let generation = fixture.enable();
  let blocked = Arc::new(Mutex::new(Vec::new()));
  let sink = Arc::clone(&blocked);
  fixture.host.set_blocked_hook(Box::new(move |id, activity| {
    sink.lock().unwrap().push((id.to_owned(), activity.clone()));
  }));

  fixture.hostcall(generation, "grants.get", Value::Null);
  fixture.hostcall(generation, "storage.set", json!({ "key": "k", "value": 1 }));
  let hash = "a".repeat(64);
  for _ in 0..2 {
    let denied = fixture.hostcall(generation, "mods.install", json!({ "hash": hash }));
    assert_eq!(denied["error"]["code"], "permission_denied");
  }
  fixture.hostcall(generation, "process.spawn", Value::Null);

  let activity = fixture.host.activity(ID, 100).unwrap();
  let kinds: Vec<_> = activity.iter().map(|entry| entry.kind).collect();
  assert_eq!(
    kinds,
    [
      ExternalPluginActivityKind::Blocked,
      ExternalPluginActivityKind::Blocked,
      ExternalPluginActivityKind::Granted
    ]
  );
  assert_eq!(activity[0].method.as_deref(), Some("process.spawn"));
  assert_eq!(activity[0].reason.as_deref(), Some("unknown_method"));
  assert_eq!(activity[0].permission, None);
  assert_eq!(activity[1].method.as_deref(), Some("mods.install"));
  assert_eq!(
    activity[1].permission,
    Some(ExternalPluginPermissionId::Mods)
  );
  assert_eq!(activity[1].reason.as_deref(), Some("permission_denied"));
  let blocked = blocked.lock().unwrap();
  assert_eq!(blocked.len(), 2);
  assert_eq!(blocked[1].0, ID);
  assert_eq!(blocked[1].1, activity[0]);
}

#[test]
fn logs_new_snapshots_and_installs_but_not_repeat_inspections() {
  let fixture = fixture();
  fixture.install("0.1.0");
  let generation = fixture.enable();
  fixture.hostcall(generation, "files.snapshot", Value::Null);
  let plugin = fixture.host.authorize(ID, generation).unwrap();
  let output = PathBuf::from(plugin.grant.file.as_deref().unwrap());
  fixture
    .host
    .with_observation(&plugin, &output, snapshots::tests::settle);
  let ready = fixture.hostcall(generation, "files.snapshot", Value::Null);
  assert_eq!(ready["value"]["state"], "ready", "{ready}");
  assert!(ready["value"].get("staged").is_none());
  let hash = ready["value"]["snapshot"]["hash"]
    .as_str()
    .unwrap()
    .to_owned();
  fixture.hostcall(generation, "files.snapshot", Value::Null);
  fixture.hostcall(generation, "mods.install", json!({ "hash": hash }));

  let activity = fixture.host.activity(ID, 100).unwrap();
  assert_eq!(activity.len(), 3, "{activity:?}");
  let (deployed, staged) = (&activity[0], &activity[1]);
  assert_eq!(deployed.kind, ExternalPluginActivityKind::Deployed);
  assert_eq!(deployed.hash.as_deref(), Some(hash.as_str()));
  assert_eq!(deployed.profile_folder.as_deref(), Some("test-profile"));
  assert_eq!(deployed.permission, Some(ExternalPluginPermissionId::Mods));
  assert_eq!(staged.kind, ExternalPluginActivityKind::Staged);
  assert_eq!(staged.hash.as_deref(), Some(hash.as_str()));
  assert_eq!(staged.resources, Some(1));
  assert_eq!(staged.size, Some(vpk("skin").len() as u64));
  assert_eq!(staged.file_name.as_deref(), Some("output.vpk"));
  assert_eq!(staged.permission, Some(ExternalPluginPermissionId::Files));
}

#[test]
fn clear_data_resets_storage_and_restarts_the_worker() {
  let fixture = fixture();
  fixture.install("0.1.0");
  let generation = fixture.enable();
  fixture.hostcall(generation, "storage.set", json!({ "key": "k", "value": 1 }));
  let plugin = fixture.host.authorize(ID, generation).unwrap();
  let output = PathBuf::from(plugin.grant.file.as_deref().unwrap());
  fixture
    .host
    .services(ID)
    .snapshots
    .stage(&output, snapshots::stamp(&output).unwrap(), &[])
    .unwrap();
  assert!(fixture.host.summary(ID).unwrap().storage_bytes > 0);
  let changes = record_changes(&fixture);

  fixture.host.clear_data(ID).unwrap();
  assert_eq!(changes.lock().unwrap().as_slice(), [ID]);
  assert!(!fixture.host.supervisor.is_running(ID));
  let summary = fixture.host.summary(ID).unwrap();
  assert_eq!(summary.storage_bytes, 0);
  assert!(summary.enabled);
  assert_eq!(
    fixture.call(generation, "echo", Value::Null),
    Err(SessionDenied::Stale)
  );
  let get = fixture.hostcall(fixture.generation(), "storage.get", json!({ "key": "k" }));
  assert!(get["value"]["value"].is_null(), "{get}");
  assert_eq!(fixture.host.services(ID).snapshots.list().unwrap().len(), 1);
  assert_eq!(
    fixture.host.activity(ID, 1).unwrap()[0].kind,
    ExternalPluginActivityKind::DataCleared
  );
}

#[test]
fn worker_failures_are_contained_and_quarantine_after_repeats() {
  let fixture = fixture();
  fixture.install("0.1.0");
  let generation = fixture.enable();

  let trap = fixture.call(generation, "trap", Value::Null).unwrap();
  assert_eq!(trap["error"]["code"], "guest_trap");
  assert!(fixture.call(generation, "echo", Value::Null).is_ok());

  for _ in 0..3 {
    assert!(fixture.call(generation, "echo", Value::Null).is_ok());
    fixture.host.supervisor.kill_process_for_test(ID);
    let crashed = fixture.call(generation, "echo", Value::Null).unwrap();
    assert_eq!(crashed["error"]["code"], "worker_failed", "{crashed}");
  }
  let summary = fixture.host.summary(ID).unwrap();
  assert_eq!(summary.status, registry::ExternalPluginStatus::Quarantined);
  assert!(summary.last_error_at.is_some());
  assert_eq!(summary.restarts_today, 3);
  let stopped = &fixture.host.activity(ID, 1).unwrap()[0];
  assert_eq!(stopped.kind, ExternalPluginActivityKind::Stopped);
  assert_eq!(stopped.reason, summary.last_error);
  assert!(fixture.call(generation, "echo", Value::Null).is_err());

  fixture.host.set_enabled(ID, true).unwrap();
  assert!(
    fixture
      .call(fixture.generation(), "echo", Value::Null)
      .is_ok(),
    "re-enabling recovers with a fresh worker"
  );
  let summary = fixture.host.summary(ID).unwrap();
  assert!(summary.last_error_at.is_none());
  assert_eq!(
    summary.restarts_today, 3,
    "re-enabling resets the quarantine window, not the daily count"
  );
}

#[test]
fn rejects_reserved_and_malformed_ui_calls() {
  let fixture = fixture();
  fixture.install("0.1.0");
  let generation = fixture.enable();
  let tick = fixture.call(generation, "tick", Value::Null).unwrap();
  assert_eq!(tick["error"]["code"], "invalid_command");
  let malformed = fixture
    .host
    .ui_call(ID, generation, "echo", "{not json")
    .unwrap();
  assert!(malformed.contains("invalid_payload"));
}

#[test]
fn remove_deletes_package_and_private_data() {
  let fixture = fixture();
  fixture.install("0.1.0");
  let generation = fixture.enable();
  fixture.hostcall(generation, "storage.set", json!({ "key": "k", "value": 1 }));
  fixture.host.remove(ID).unwrap();
  assert!(fixture.host.list().is_empty());
  assert!(!fixture.host.root().join("packages").join(ID).exists());
  assert!(!fixture.host.root().join("data").join(ID).exists());
  assert_eq!(
    fixture.call(generation, "echo", Value::Null),
    Err(SessionDenied::Removed)
  );
}

/// Installs a real package built outside this crate, e.g. the example
/// plugin: `DMM_EXAMPLE_PLUGIN_ZIP=<zip> cargo test --lib -- --ignored
/// tests::runs_an_external_package`.
#[test]
#[ignore = "needs DMM_EXAMPLE_PLUGIN_ZIP"]
fn runs_an_external_package() {
  let archive = PathBuf::from(std::env::var_os("DMM_EXAMPLE_PLUGIN_ZIP").unwrap());
  let fixture = fixture();
  let summary = fixture.host.install(&archive).unwrap();
  assert!(!summary.enabled);
  let generation = fixture.enable();
  let plugin = fixture.host.authorize(&summary.id, generation).unwrap();
  fixture.host.tick(&plugin);
  let output = PathBuf::from(plugin.grant.file.as_deref().unwrap());
  fixture
    .host
    .with_observation(&plugin, &output, snapshots::tests::settle);
  fixture.host.tick(&plugin);
  let status = fixture.call(generation, "status", json!({})).unwrap();
  assert_eq!(status["ok"], true, "{status}");
  assert_eq!(status["value"]["grants"]["file"]["name"], "output.vpk");
  assert_eq!(
    status["value"]["grants"]["profile"]["folder"],
    "test-profile"
  );
  assert_eq!(status["value"]["watch"], "ready");
  assert!(status["value"]["listError"].is_null(), "{status}");
  let builds = status["value"]["builds"].as_array().unwrap();
  assert_eq!(builds.len(), 1, "{status}");
  let hash = builds[0]["hash"].as_str().unwrap();
  assert_eq!(builds[0]["resources"], 1);

  fixture.adapter.game_running.store(true, Ordering::SeqCst);
  let refused = fixture
    .call(generation, "deploy", json!({ "hash": hash }))
    .unwrap();
  assert_eq!(refused["error"]["code"], "game_running", "{refused}");
  assert_eq!(
    fixture.adapter.installed_hash(ID, "test-profile").unwrap(),
    None
  );

  fixture.adapter.game_running.store(false, Ordering::SeqCst);
  let deployed = fixture
    .call(generation, "deploy", json!({ "hash": hash }))
    .unwrap();
  assert_eq!(deployed["ok"], true, "{deployed}");
  assert_eq!(deployed["value"]["deployedHash"], hash);
  assert_eq!(
    fixture
      .adapter
      .installed_hash(ID, "test-profile")
      .unwrap()
      .as_deref(),
    Some(hash)
  );
  assert_eq!(fixture.adapter.installed_hash(ID, "default").unwrap(), None);
  assert!(fixture.host.summary(ID).unwrap().last_error.is_none());

  fixture.host.revoke(ID).unwrap();
  assert_eq!(
    fixture.call(generation, "status", json!({})),
    Err(SessionDenied::Stale)
  );
  fixture.host.remove(ID).unwrap();
  assert!(fixture.host.list().is_empty());
  assert_eq!(
    fixture
      .adapter
      .installed_hash(ID, "test-profile")
      .unwrap()
      .as_deref(),
    Some(hash),
    "removing a plugin leaves its installed mod in the profile"
  );
}

#[test]
fn view_assets_are_confined_and_retired_with_the_session() {
  let fixture = fixture();
  fixture.install("0.1.0");
  let generation = fixture.enable();
  let view = fixture.host.view(ID).unwrap();
  assert_eq!(view.entry, "index.html");
  let asset = fixture
    .host
    .read_view_asset(ID, generation, "app.js")
    .unwrap()
    .unwrap();
  assert_eq!(asset.bytes, b"console.log(1)");
  assert_eq!(asset.path, PathBuf::from("app.js"));
  for path in [
    "../manifest.json",
    "../backend.wasm",
    "/index.html",
    "C:/secret",
  ] {
    assert!(
      fixture
        .host
        .read_view_asset(ID, generation, path)
        .unwrap()
        .is_none()
    );
  }
  fixture.host.revoke(ID).unwrap();
  assert!(matches!(
    fixture.host.read_view_asset(ID, generation, "app.js"),
    Err(SessionDenied::Stale)
  ));
  assert!(fixture.host.view(ID).is_err());
}

#[test]
fn scheduler_does_not_keep_the_runtime_alive() {
  let fixture = fixture();
  let host = Arc::downgrade(&fixture.host);
  fixture.host.start_scheduler();
  drop(fixture);
  assert!(host.upgrade().is_none());
}
