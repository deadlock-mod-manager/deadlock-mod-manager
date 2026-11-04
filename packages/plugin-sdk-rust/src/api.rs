//! Typed wrappers for the SDK 1 hostcalls. The host enforces every grant and
//! scope; these helpers only shape requests and decode responses.

use crate::envelope::{PluginError, codes};
use crate::host::Host;
use base64::Engine;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;

pub mod methods {
  pub const GRANTS_GET: &str = "grants.get";
  pub const FILES_INFO: &str = "files.info";
  pub const FILES_LIST: &str = "files.list";
  pub const FILES_READ: &str = "files.read";
  pub const FILES_WRITE: &str = "files.write";
  pub const FILES_SNAPSHOT: &str = "files.snapshot";
  pub const FILES_SNAPSHOTS: &str = "files.snapshots";
  pub const MODS_LIST: &str = "mods.list";
  pub const MODS_INSTALL: &str = "mods.install";
  pub const MODS_INSTALLED: &str = "mods.installed";
  pub const HTTP_FETCH: &str = "http.fetch";
  pub const GAME_STATE: &str = "game.state";
  pub const EVENTS_SNAPSHOT: &str = "events.snapshot";
  pub const EVENTS_READ: &str = "events.read";
  pub const STORAGE_GET: &str = "storage.get";
  pub const STORAGE_SET: &str = "storage.set";
  pub const NOTIFICATIONS_SHOW: &str = "notifications.show";
}

/// Error codes the host answers hostcalls with.
pub mod host_codes {
  pub const PERMISSION_DENIED: &str = "permission_denied";
  pub const UNKNOWN_METHOD: &str = "unknown_method";
  pub const INVALID_REQUEST: &str = "invalid_request";
  pub const INVALID_PARAMS: &str = "invalid_params";
  pub const NOT_FOUND: &str = "not_found";
  pub const INVALID_ENCODING: &str = "invalid_encoding";
  pub const INVALID_SNAPSHOT: &str = "invalid_snapshot";
  pub const QUOTA_EXCEEDED: &str = "quota_exceeded";
  pub const GAME_RUNNING: &str = "game_running";
  pub const RATE_LIMITED: &str = "rate_limited";
  pub const NETWORK_ERROR: &str = "network_error";
  pub const DESTINATION_REFUSED: &str = "destination_refused";
  pub const RESPONSE_TOO_LARGE: &str = "response_too_large";
  pub const REQUEST_TOO_LARGE: &str = "request_too_large";
  pub const HOST_ERROR: &str = "host_error";
  pub const CURSOR_EXPIRED: &str = "cursor_expired";
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FileKind {
  File,
  Folder,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FileAccess {
  Read,
  ReadWrite,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ModAccess {
  Read,
  Install,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProfileScope {
  Picked,
  All,
}

/// A granted permission request, as the manifest declared it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "id", rename_all = "camelCase")]
pub enum Permission {
  Files {
    kind: FileKind,
    #[serde(default)]
    extensions: Vec<String>,
    access: FileAccess,
  },
  Mods {
    access: Vec<ModAccess>,
    profiles: ProfileScope,
  },
  Network {
    hosts: Vec<String>,
  },
  Game {},
  Events {
    types: Vec<crate::events::HostEventType>,
  },
  Storage {},
  Notifications {},
}

/// What the user granted, reduced to display values. The host resolves the
/// real path and profile from its own grant records; nothing here is
/// authority.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Grants {
  #[serde(default)]
  pub permissions: Vec<Permission>,
  /// The picked file or folder; `None` without `files`.
  #[serde(default)]
  pub file: Option<FileGrant>,
  /// The picked profile; `None` unless `mods` asks for a picked profile.
  #[serde(default)]
  pub profile: Option<ProfileGrant>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileGrant {
  pub name: String,
  pub kind: FileKind,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileGrant {
  /// The profile folder; `"default"` is the default profile.
  pub folder: String,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Encoding {
  #[default]
  Utf8,
  Base64,
}

pub fn encode_base64(bytes: &[u8]) -> String {
  base64::engine::general_purpose::STANDARD.encode(bytes)
}

pub fn decode_base64(data: &str) -> Result<Vec<u8>, PluginError> {
  base64::engine::general_purpose::STANDARD
    .decode(data)
    .map_err(|error| PluginError::new(codes::INVALID_HOST_RESPONSE, error.to_string()))
}

fn decode(data: &str, encoding: Encoding) -> Result<Vec<u8>, PluginError> {
  match encoding {
    Encoding::Utf8 => Ok(data.as_bytes().to_vec()),
    Encoding::Base64 => decode_base64(data),
  }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
  pub exists: bool,
  #[serde(default)]
  pub kind: Option<FileKind>,
  /// `None` for folders and missing entries.
  #[serde(default)]
  pub size: Option<u64>,
  #[serde(default)]
  pub modified_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
  pub name: String,
  pub kind: FileKind,
  #[serde(default)]
  pub size: Option<u64>,
  #[serde(default)]
  pub modified_at: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileList {
  /// Sorted by name, at most 1000.
  #[serde(default)]
  pub entries: Vec<FileEntry>,
  #[serde(default)]
  pub truncated: bool,
}

/// At most 1 MiB of a file. A UTF-8 chunk ends on a character boundary, so
/// the next offset is the previous one plus `data.len()`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChunk {
  pub data: String,
  /// Size of the whole file.
  pub size: u64,
  pub eof: bool,
}

impl FileChunk {
  pub fn bytes(&self, encoding: Encoding) -> Result<Vec<u8>, PluginError> {
    decode(&self.data, encoding)
  }
}

/// A copy of a granted file that the host has checked for stability,
/// validated (VPKs down to every resource CRC), hashed and staged.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
  pub hash: String,
  pub size: u64,
  /// VPK resource count; `None` for other files.
  #[serde(default)]
  pub resources: Option<u32>,
  pub staged_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum SnapshotState {
  /// The file does not exist yet.
  Missing,
  /// The file changed recently; the host waits until it settles.
  Changing,
  /// The plugin asked for a completion marker and none newer than the file
  /// exists yet.
  WaitingForMarker,
  /// The file settled but failed host validation.
  Invalid {
    message: String,
  },
  Ready {
    snapshot: Snapshot,
  },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledMod {
  pub id: String,
  /// Present for mods whose name the host knows cheaply (local mods).
  #[serde(default)]
  pub name: Option<String>,
  pub enabled: bool,
  /// File names of the mod's VPKs in the profile.
  #[serde(default)]
  pub files: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileMods {
  /// The profile folder; `"default"` is the default profile.
  pub folder: String,
  #[serde(default)]
  pub mods: Vec<InstalledMod>,
}

/// An HTTPS request to a granted host. The host refuses `Cookie`, `Host` and
/// hop-by-hop headers, follows no redirects, and caps bodies at 1 MiB
/// (request) and 4 MiB (response).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchRequest {
  pub url: String,
  /// `GET`, `POST`, `PUT`, `PATCH` or `DELETE`.
  pub method: String,
  #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
  pub headers: BTreeMap<String, String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub body: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub body_encoding: Option<Encoding>,
}

impl FetchRequest {
  pub fn get(url: impl Into<String>) -> Self {
    Self {
      url: url.into(),
      method: "GET".into(),
      headers: BTreeMap::new(),
      body: None,
      body_encoding: None,
    }
  }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchResponse {
  pub status: u16,
  /// Lowercase names; repeated headers are joined with `, `. Cookies are
  /// never passed through.
  #[serde(default)]
  pub headers: BTreeMap<String, String>,
  pub body: String,
  /// `utf8` when the body is UTF-8 text, `base64` otherwise.
  pub body_encoding: Encoding,
}

impl FetchResponse {
  pub fn bytes(&self) -> Result<Vec<u8>, PluginError> {
    decode(&self.body, self.body_encoding)
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameState {
  pub running: bool,
}

fn request<R: DeserializeOwned>(
  host: &mut impl Host,
  method: &str,
  params: Value,
) -> Result<R, PluginError> {
  let value = host.call(method, params)?;
  serde_json::from_value(value).map_err(|error| {
    PluginError::new(
      codes::INVALID_HOST_RESPONSE,
      format!("{method} returned an unexpected shape: {error}"),
    )
  })
}

pub fn grants(host: &mut impl Host) -> Result<Grants, PluginError> {
  request(host, methods::GRANTS_GET, json!({}))
}

/// `path` names an entry inside a granted folder (`/`-separated, relative);
/// file grants take `None`.
pub fn files_info(host: &mut impl Host, path: Option<&str>) -> Result<FileInfo, PluginError> {
  request(host, methods::FILES_INFO, json!({ "path": path }))
}

/// Lists the granted folder, or a folder inside it. Files the extension
/// filter excludes and redirects are left out.
pub fn files_list(host: &mut impl Host, path: Option<&str>) -> Result<FileList, PluginError> {
  request(host, methods::FILES_LIST, json!({ "path": path }))
}

/// Reads at most `length` bytes (default and maximum 1 MiB) from `offset`.
pub fn files_read(
  host: &mut impl Host,
  path: Option<&str>,
  offset: u64,
  length: Option<u64>,
  encoding: Encoding,
) -> Result<FileChunk, PluginError> {
  request(
    host,
    methods::FILES_READ,
    json!({ "path": path, "offset": offset, "length": length, "encoding": encoding }),
  )
}

/// Replaces a file atomically with `data` (at most 4 MiB once decoded).
/// Needs `readWrite` access. Returns the bytes written.
pub fn files_write(
  host: &mut impl Host,
  path: Option<&str>,
  data: &str,
  encoding: Encoding,
) -> Result<u64, PluginError> {
  #[derive(Deserialize)]
  struct Written {
    size: u64,
  }
  let Written { size } = request(
    host,
    methods::FILES_WRITE,
    json!({ "path": path, "data": data, "encoding": encoding }),
  )?;
  Ok(size)
}

/// One step of watching a file: once it has held still (and, with
/// `require_ready_marker`, a `<file>.ready` newer than it exists), the host
/// stages a copy under its own storage.
pub fn files_snapshot(
  host: &mut impl Host,
  path: Option<&str>,
  require_ready_marker: bool,
) -> Result<SnapshotState, PluginError> {
  request(
    host,
    methods::FILES_SNAPSHOT,
    json!({ "path": path, "requireReadyMarker": require_ready_marker }),
  )
}

/// Staged snapshots, newest first.
pub fn files_snapshots(host: &mut impl Host) -> Result<Vec<Snapshot>, PluginError> {
  #[derive(Deserialize)]
  struct Snapshots {
    #[serde(default)]
    snapshots: Vec<Snapshot>,
  }
  let Snapshots { snapshots } = request(host, methods::FILES_SNAPSHOTS, json!({}))?;
  Ok(snapshots)
}

/// Mods of the picked profile, or of every profile with `profiles: "all"`.
pub fn mods_list(host: &mut impl Host) -> Result<Vec<ProfileMods>, PluginError> {
  #[derive(Deserialize)]
  struct Profiles {
    #[serde(default)]
    profiles: Vec<ProfileMods>,
  }
  let Profiles { profiles } = request(host, methods::MODS_LIST, json!({}))?;
  Ok(profiles)
}

#[derive(Deserialize)]
struct InstalledHash {
  #[serde(default)]
  hash: Option<String>,
}

/// Installs a staged VPK snapshot as this plugin's mod in the picked
/// profile. Fails with `game_running` while Deadlock runs.
pub fn mods_install(host: &mut impl Host, hash: &str) -> Result<(), PluginError> {
  request::<InstalledHash>(host, methods::MODS_INSTALL, json!({ "hash": hash }))?;
  Ok(())
}

/// The snapshot hash this plugin's mod currently runs in the picked
/// profile, read from the profile itself.
pub fn mods_installed(host: &mut impl Host) -> Result<Option<String>, PluginError> {
  let InstalledHash { hash } = request(host, methods::MODS_INSTALLED, json!({}))?;
  Ok(hash)
}

pub fn http_fetch(
  host: &mut impl Host,
  fetch: &FetchRequest,
) -> Result<FetchResponse, PluginError> {
  let params = serde_json::to_value(fetch)
    .map_err(|error| PluginError::new(codes::INVALID_REQUEST, error.to_string()))?;
  request(host, methods::HTTP_FETCH, params)
}

pub fn game_state(host: &mut impl Host) -> Result<GameState, PluginError> {
  request(host, methods::GAME_STATE, json!({}))
}

/// Captures the latest permitted observations and a matching replay cursor.
pub fn events_snapshot(
  host: &mut impl Host,
  types: &[crate::events::HostEventType],
) -> Result<crate::events::EventSnapshot, PluginError> {
  request(host, methods::EVENTS_SNAPSHOT, json!({ "types": types }))
}

/// Non-blocking, bounded read for background `tick`. Store the returned cursor
/// after processing; a repeated read may deliver the same event IDs.
pub fn events_read(
  host: &mut impl Host,
  read: &crate::events::EventRead,
) -> Result<crate::events::EventBatch, PluginError> {
  let params = serde_json::to_value(read)
    .map_err(|error| PluginError::new(codes::INVALID_REQUEST, error.to_string()))?;
  request(host, methods::EVENTS_READ, params)
}

#[derive(Deserialize)]
struct StoredValue {
  #[serde(default)]
  value: Value,
}

/// Returns `None` when the key has never been written. Keys are 1-64 ASCII
/// alphanumerics or `._-:`; the host enforces a per-plugin quota.
pub fn storage_get(host: &mut impl Host, key: &str) -> Result<Option<Value>, PluginError> {
  let StoredValue { value } = request(host, methods::STORAGE_GET, json!({ "key": key }))?;
  Ok((!value.is_null()).then_some(value))
}

pub fn storage_set(host: &mut impl Host, key: &str, value: Value) -> Result<(), PluginError> {
  host.call(methods::STORAGE_SET, json!({ "key": key, "value": value }))?;
  Ok(())
}

/// Shows a toast attributed to the plugin: `title` 1-60 characters, `body`
/// at most 200. At most three a minute; more fail with `rate_limited`.
pub fn notifications_show(
  host: &mut impl Host,
  title: &str,
  body: &str,
) -> Result<(), PluginError> {
  host.call(
    methods::NOTIFICATIONS_SHOW,
    json!({ "title": title, "body": body }),
  )?;
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  /// Answers with queued values and records each request.
  struct Replies {
    replies: Vec<Value>,
    requests: Vec<(String, Value)>,
  }

  impl Replies {
    fn new(replies: Vec<Value>) -> Self {
      Self {
        replies,
        requests: Vec::new(),
      }
    }
  }

  impl Host for Replies {
    fn call(&mut self, method: &str, params: Value) -> Result<Value, PluginError> {
      self.requests.push((method.to_owned(), params));
      Ok(self.replies.remove(0))
    }
  }

  #[test]
  fn decodes_snapshot_states_with_extra_host_fields() {
    let mut host = Replies::new(vec![
      json!({ "state": "waitingForMarker", "fileName": "build_dir.vpk" }),
      json!({
        "state": "ready",
        "fileName": "build_dir.vpk",
        "snapshot": { "hash": "ab", "size": 9, "resources": 1, "stagedAt": "2026-10-30T00:00:00Z" }
      }),
      json!({
        "state": "ready",
        "snapshot": { "hash": "cd", "size": 2, "stagedAt": "2026-10-30T00:00:00Z" }
      }),
    ]);
    assert_eq!(
      files_snapshot(&mut host, None, true).unwrap(),
      SnapshotState::WaitingForMarker
    );
    let SnapshotState::Ready { snapshot } = files_snapshot(&mut host, None, false).unwrap() else {
      panic!("expected ready");
    };
    assert_eq!(snapshot.resources, Some(1));
    let SnapshotState::Ready { snapshot } =
      files_snapshot(&mut host, Some("notes.json"), false).unwrap()
    else {
      panic!("expected ready");
    };
    assert_eq!(snapshot.resources, None);
    assert_eq!(
      host.requests[2].1,
      json!({ "path": "notes.json", "requireReadyMarker": false })
    );
  }

  #[test]
  fn decodes_grants_with_scoped_permissions() {
    let mut host = Replies::new(vec![json!({
      "permissions": [
        { "id": "files", "kind": "file", "extensions": ["vpk"], "access": "read" },
        { "id": "mods", "access": ["install"], "profiles": "picked" },
        { "id": "storage" }
      ],
      "file": { "name": "build_dir.vpk", "kind": "file" },
      "profile": { "folder": "profile_2_test" }
    })]);
    let granted = grants(&mut host).unwrap();
    assert_eq!(granted.permissions[2], Permission::Storage {});
    assert_eq!(
      granted.permissions[1],
      Permission::Mods {
        access: vec![ModAccess::Install],
        profiles: ProfileScope::Picked
      }
    );
    assert_eq!(granted.file.unwrap().kind, FileKind::File);
  }

  #[test]
  fn shapes_fetch_requests_and_decodes_binary_bodies() {
    let mut host = Replies::new(vec![json!({
      "status": 200,
      "headers": { "content-type": "application/octet-stream" },
      "body": encode_base64(&[0, 255]),
      "bodyEncoding": "base64"
    })]);
    let response = http_fetch(&mut host, &FetchRequest::get("https://api.example.com/x")).unwrap();
    assert_eq!(response.bytes().unwrap(), [0, 255]);
    assert_eq!(
      host.requests[0],
      (
        methods::HTTP_FETCH.to_owned(),
        json!({ "url": "https://api.example.com/x", "method": "GET" })
      )
    );
  }

  #[test]
  fn shapes_file_reads_and_writes() {
    let mut host = Replies::new(vec![
      json!({ "data": encode_base64(b"hi"), "size": 2, "eof": true }),
      json!({ "size": 2 }),
    ]);
    let chunk = files_read(&mut host, Some("a.bin"), 0, None, Encoding::Base64).unwrap();
    assert_eq!(chunk.bytes(Encoding::Base64).unwrap(), b"hi");
    assert_eq!(
      files_write(&mut host, None, "hi", Encoding::Utf8).unwrap(),
      2
    );
    assert_eq!(
      host.requests[0].1,
      json!({ "path": "a.bin", "offset": 0, "length": null, "encoding": "base64" })
    );
    assert_eq!(
      host.requests[1].1,
      json!({ "path": null, "data": "hi", "encoding": "utf8" })
    );
  }

  #[test]
  fn unwraps_stored_values_and_installed_hashes() {
    let mut host = Replies::new(vec![
      json!({ "value": { "n": 1 } }),
      json!({ "value": null }),
      json!({ "hash": null }),
    ]);
    assert_eq!(
      storage_get(&mut host, "k").unwrap(),
      Some(json!({ "n": 1 }))
    );
    assert_eq!(storage_get(&mut host, "k").unwrap(), None);
    assert_eq!(mods_installed(&mut host).unwrap(), None);
  }
}
