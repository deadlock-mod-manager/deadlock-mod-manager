//! Hostcall broker. Every method checks the session's current grant and the
//! scope of the request it approved; the plugin identity comes from the
//! worker session, never from the request.

use super::PluginHost;
use super::abi;
use super::activity::{ExternalPluginActivity, ExternalPluginActivityKind as Kind};
use super::deploy::DeployError;
use super::files::{self, Encoding, FileError, Scope};
use super::manifest::{
  ExternalPluginFileAccess as FileAccess, ExternalPluginModAccess as ModAccess,
  ExternalPluginPermission as Permission, ExternalPluginPermissionId as Id,
  ExternalPluginProfileScope as ProfileScope, is_display_text,
};
use super::network::{self, FetchParams, Refusal};
use super::registry::{ActivePlugin, file_name};
use super::snapshots::{Inspection, SnapshotError};
use super::storage::{self, StorageError};
use crate::Error;
use serde::Deserialize;
use serde_json::{Value, json};
use std::path::Path;

/// Refusals recorded as `blocked` activity: a permission or scope the grant
/// does not cover, or a method outside the host API.
const BLOCKED_CODES: [&str; 2] = ["permission_denied", "unknown_method"];
const MAX_NOTIFICATION_TITLE: usize = 60;
const MAX_NOTIFICATION_BODY: usize = 200;

pub struct HostError {
  code: &'static str,
  message: String,
  permission: Option<Id>,
  host: Option<String>,
}

impl HostError {
  fn new(code: &'static str, message: impl Into<String>) -> Self {
    Self {
      code,
      message: message.into(),
      permission: None,
      host: None,
    }
  }

  fn denied(permission: Id, message: impl Into<String>) -> Self {
    Self {
      permission: Some(permission),
      ..Self::new("permission_denied", message)
    }
  }

  fn invalid(message: impl Into<String>) -> Self {
    Self::new("invalid_params", message)
  }
}

impl From<Error> for HostError {
  fn from(error: Error) -> Self {
    match error {
      Error::Host { code, message } => Self::new(code, message),
      other => {
        log::warn!("[ExternalPlugins] Hostcall failed: {other}");
        Self::new("host_error", other.to_string())
      }
    }
  }
}

impl From<SnapshotError> for HostError {
  fn from(error: SnapshotError) -> Self {
    match error {
      SnapshotError::Quota(message) => Self::new("quota_exceeded", message),
      SnapshotError::Io(error) => Error::from(error).into(),
      other => Self::new("invalid_snapshot", other.to_string()),
    }
  }
}

impl From<FileError> for HostError {
  fn from(error: FileError) -> Self {
    match error {
      FileError::Denied(message) => Self::denied(Id::Files, message),
      FileError::Invalid(message) => Self::invalid(message),
      FileError::Missing(message) => Self::new("not_found", message),
      FileError::Encoding(message) => Self::new("invalid_encoding", message),
      FileError::Io(error) => Error::from(error).into(),
    }
  }
}

fn deploy_error(error: DeployError) -> HostError {
  match error {
    DeployError::Invalid(message) => HostError::new("invalid_snapshot", message),
    DeployError::Host(error) => error.into(),
  }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct HostRequest {
  method: String,
  #[serde(default)]
  params: Value,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NoParams {}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PathParams {
  #[serde(default)]
  path: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ReadParams {
  #[serde(default)]
  path: Option<String>,
  #[serde(default)]
  offset: u64,
  #[serde(default)]
  length: Option<u64>,
  encoding: Encoding,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct WriteParams {
  #[serde(default)]
  path: Option<String>,
  data: String,
  encoding: Encoding,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SnapshotParams {
  #[serde(default)]
  path: Option<String>,
  #[serde(default)]
  require_ready_marker: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct HashParams {
  hash: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct StorageGetParams {
  key: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct StorageSetParams {
  key: String,
  value: Value,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NotificationParams {
  title: String,
  #[serde(default)]
  body: String,
}

fn params<T: for<'de> Deserialize<'de>>(value: Value) -> Result<T, HostError> {
  let value = if value.is_null() { json!({}) } else { value };
  serde_json::from_value(value).map_err(|error| HostError::invalid(error.to_string()))
}

fn to_value(value: impl serde::Serialize) -> Result<Value, HostError> {
  serde_json::to_value(value).map_err(|error| HostError::new("host_error", error.to_string()))
}

fn require(plugin: &ActivePlugin, id: Id) -> Result<&Permission, HostError> {
  plugin.permission(id).ok_or_else(|| {
    let name = to_value(id)
      .ok()
      .and_then(|value| value.as_str().map(str::to_owned))
      .unwrap_or_default();
    HostError::denied(id, format!("This plugin was not granted {name}"))
  })
}

/// The `mods` request, when it includes `access`.
fn require_mods(plugin: &ActivePlugin, access: ModAccess) -> Result<&Permission, HostError> {
  let request = require(plugin, Id::Mods)?;
  if !request.allows_mods(access) {
    let what = match access {
      ModAccess::Read => "read mods",
      ModAccess::Install => "install mods",
    };
    return Err(HostError::denied(
      Id::Mods,
      format!("This plugin may not {what}"),
    ));
  }
  Ok(request)
}

fn picked_profile(plugin: &ActivePlugin) -> Result<&str, HostError> {
  plugin
    .grant
    .profile
    .as_deref()
    .ok_or_else(|| HostError::denied(Id::Mods, "No profile was picked for this plugin"))
}

/// The granted file or folder with the request's access level.
fn file_scope(plugin: &ActivePlugin) -> Result<(Scope<'_>, FileAccess), HostError> {
  let Permission::Files {
    kind,
    extensions,
    access,
  } = require(plugin, Id::Files)?
  else {
    return Err(HostError::denied(
      Id::Files,
      "This plugin was not granted files",
    ));
  };
  let root =
    plugin.grant.file.as_deref().ok_or_else(|| {
      HostError::denied(Id::Files, "No file or folder was picked for this plugin")
    })?;
  Ok((
    Scope {
      root: Path::new(root),
      kind: *kind,
      extensions,
    },
    *access,
  ))
}

fn dispatch(
  host: &PluginHost,
  plugin: &ActivePlugin,
  method: &str,
  raw: Value,
) -> Result<Value, HostError> {
  match method {
    "grants.get" => {
      params::<NoParams>(raw)?;
      let granted: Vec<_> = plugin
        .manifest
        .permissions
        .required
        .iter()
        .filter(|request| plugin.permission(request.id()).is_some())
        .collect();
      let file = match plugin.permission(Id::Files) {
        Some(Permission::Files { kind, .. }) => plugin
          .grant
          .file
          .as_deref()
          .map(|file| json!({ "name": file_name(file), "kind": kind })),
        _ => None,
      };
      let profile = plugin
        .permission(Id::Mods)
        .filter(|request| request.needs_profile())
        .and(plugin.grant.profile.as_deref())
        .map(|folder| json!({ "folder": folder }));
      Ok(json!({ "permissions": granted, "file": file, "profile": profile }))
    }
    "files.info" => {
      let (scope, _) = file_scope(plugin)?;
      let PathParams { path } = params(raw)?;
      to_value(files::info(&scope, path.as_deref())?)
    }
    "files.list" => {
      let (scope, _) = file_scope(plugin)?;
      let PathParams { path } = params(raw)?;
      to_value(files::list(&scope, path.as_deref())?)
    }
    "files.read" => {
      let (scope, _) = file_scope(plugin)?;
      let ReadParams {
        path,
        offset,
        length,
        encoding,
      } = params(raw)?;
      to_value(files::read(
        &scope,
        path.as_deref(),
        offset,
        length,
        encoding,
      )?)
    }
    "files.write" => {
      let (scope, access) = file_scope(plugin)?;
      if access != FileAccess::ReadWrite {
        return Err(HostError::denied(
          Id::Files,
          "This plugin may only read its granted files",
        ));
      }
      let WriteParams {
        path,
        data,
        encoding,
      } = params(raw)?;
      let bytes = encoding.decode(&data)?;
      let written = files::write(&scope, path.as_deref(), &bytes)?;
      host.record_activity(
        &plugin.id,
        ExternalPluginActivity {
          permission: Some(Id::Files),
          file_name: Some(written.name()),
          size: Some(bytes.len() as u64),
          ..ExternalPluginActivity::new(Kind::Wrote)
        },
      );
      Ok(json!({ "size": bytes.len() }))
    }
    "files.snapshot" => {
      let (scope, _) = file_scope(plugin)?;
      let SnapshotParams {
        path,
        require_ready_marker,
      } = params(raw)?;
      let resolved = match scope.resolve_file(path.as_deref()) {
        Err(FileError::Missing(_)) => {
          let name = match path.as_deref() {
            Some(path) => path.rsplit('/').next().unwrap_or(path).to_owned(),
            None => file_name(&scope.root.to_string_lossy()),
          };
          return Ok(json!({ "state": "missing", "fileName": name }));
        }
        other => other?,
      };
      let services = host.services(&plugin.id);
      let pinned = services.deployments.pinned()?;
      let inspection = host.with_observation(plugin, &resolved.path, |observation| {
        services
          .snapshots
          .inspect(observation, &resolved.path, require_ready_marker, &pinned)
      })?;
      let mut value = to_value(&inspection)?;
      value["fileName"] = json!(resolved.name());
      match &inspection {
        Inspection::Invalid { message } => {
          log::debug!(
            "[ExternalPlugins] {} snapshot rejected: {message}",
            plugin.id
          );
        }
        Inspection::Ready {
          snapshot,
          staged: true,
        } => host.record_activity(
          &plugin.id,
          ExternalPluginActivity {
            permission: Some(Id::Files),
            hash: Some(snapshot.hash.clone()),
            size: Some(snapshot.size),
            resources: snapshot.resources.map(|resources| resources as u64),
            file_name: Some(resolved.name()),
            ..ExternalPluginActivity::new(Kind::Staged)
          },
        ),
        _ => {}
      }
      Ok(value)
    }
    "files.snapshots" => {
      file_scope(plugin)?;
      params::<NoParams>(raw)?;
      Ok(json!({ "snapshots": host.services(&plugin.id).snapshots.list()? }))
    }
    "mods.list" => {
      let Permission::Mods { profiles, .. } = require_mods(plugin, ModAccess::Read)? else {
        return Err(HostError::denied(
          Id::Mods,
          "This plugin was not granted mods",
        ));
      };
      params::<NoParams>(raw)?;
      let folders = match profiles {
        ProfileScope::Picked => vec![picked_profile(plugin)?.to_owned()],
        ProfileScope::All => host.adapter().profiles()?,
      };
      let mut listed = Vec::with_capacity(folders.len());
      for folder in folders {
        let mods = host.adapter().profile_mods(&folder)?;
        listed.push(json!({ "folder": folder, "mods": mods }));
      }
      Ok(json!({ "profiles": listed }))
    }
    "mods.install" => {
      require_mods(plugin, ModAccess::Install)?;
      let profile = picked_profile(plugin)?;
      let HashParams { hash } = params(raw)?;
      let services = host.services(&plugin.id);
      services
        .deployments
        .deploy(
          host.adapter(),
          &services.snapshots,
          &plugin.id,
          &plugin.manifest.name,
          profile,
          &hash,
        )
        .map_err(deploy_error)?;
      host.record_activity(
        &plugin.id,
        ExternalPluginActivity {
          permission: Some(Id::Mods),
          hash: Some(hash.clone()),
          profile_folder: Some(profile.to_owned()),
          ..ExternalPluginActivity::new(Kind::Deployed)
        },
      );
      Ok(json!({ "hash": hash }))
    }
    "mods.installed" => {
      require_mods(plugin, ModAccess::Install)?;
      let profile = picked_profile(plugin)?;
      params::<NoParams>(raw)?;
      let services = host.services(&plugin.id);
      let hash = services
        .deployments
        .reconcile(host.adapter(), &services.snapshots, &plugin.id, profile)
        .map_err(deploy_error)?;
      Ok(json!({ "hash": hash }))
    }
    "http.fetch" => {
      let Permission::Network { hosts } = require(plugin, Id::Network)? else {
        return Err(HostError::denied(
          Id::Network,
          "This plugin was not granted network",
        ));
      };
      let request =
        network::check(params::<FetchParams>(raw)?, hosts).map_err(|refusal| match refusal {
          Refusal::HostNotAllowed(target) => HostError {
            host: Some(target.clone()),
            ..HostError::denied(
              Id::Network,
              format!("This plugin may not connect to {target}"),
            )
          },
          Refusal::Invalid(message) => HostError::invalid(message),
        })?;
      let target = request.host.clone();
      let response = host.adapter().fetch(&request)?;
      let result = network::result(response)
        .map_err(|message| HostError::new("response_too_large", message))?;
      host.record_activity(
        &plugin.id,
        ExternalPluginActivity {
          permission: Some(Id::Network),
          host: Some(target),
          ..ExternalPluginActivity::new(Kind::Fetched)
        },
      );
      to_value(result)
    }
    "game.state" => {
      require(plugin, Id::Game)?;
      params::<NoParams>(raw)?;
      Ok(json!({ "running": host.adapter().game_running()? }))
    }
    "storage.get" => {
      require(plugin, Id::Storage)?;
      let StorageGetParams { key } = params(raw)?;
      if !storage::is_valid_key(&key) {
        return Err(HostError::invalid("Invalid storage key"));
      }
      Ok(json!({ "value": host.services(&plugin.id).storage.get(&key)? }))
    }
    "storage.set" => {
      require(plugin, Id::Storage)?;
      let StorageSetParams { key, value } = params(raw)?;
      if !storage::is_valid_key(&key) {
        return Err(HostError::invalid("Invalid storage key"));
      }
      host
        .services(&plugin.id)
        .storage
        .set(&key, value)
        .map_err(|error| match error {
          StorageError::Quota(message) => HostError::new("quota_exceeded", message),
          StorageError::Host(error) => error.into(),
        })?;
      Ok(Value::Null)
    }
    "notifications.show" => {
      require(plugin, Id::Notifications)?;
      let NotificationParams { title, body } = params(raw)?;
      if !is_display_text(&title, MAX_NOTIFICATION_TITLE) {
        return Err(HostError::invalid(
          "title must be 1-60 printable characters",
        ));
      }
      if body.chars().count() > MAX_NOTIFICATION_BODY || body.chars().any(char::is_control) {
        return Err(HostError::invalid(
          "body must be at most 200 printable characters",
        ));
      }
      if !host.allow_notification(&plugin.id) {
        return Err(HostError::new(
          "rate_limited",
          "Plugins may show at most 3 notifications a minute",
        ));
      }
      host.show_notification(&plugin.id, &title, &body);
      host.record_activity(
        &plugin.id,
        ExternalPluginActivity {
          permission: Some(Id::Notifications),
          reason: Some(title),
          ..ExternalPluginActivity::new(Kind::Notified)
        },
      );
      Ok(Value::Null)
    }
    other => Err(HostError::new(
      "unknown_method",
      format!("Unknown host method {other}"),
    )),
  }
}

/// Handles one hostcall and always answers with an envelope.
pub fn handle(host: &PluginHost, plugin: &ActivePlugin, request: &str) -> String {
  let request: HostRequest = match serde_json::from_str(request) {
    Ok(request) => request,
    Err(error) => return abi::error_envelope("invalid_request", &error.to_string()),
  };
  let response = match dispatch(host, plugin, &request.method, request.params) {
    Ok(value) => abi::ok_envelope(value),
    Err(error) => {
      if BLOCKED_CODES.contains(&error.code) {
        host.record_activity(
          &plugin.id,
          ExternalPluginActivity {
            permission: error.permission,
            method: Some(request.method.chars().take(64).collect()),
            host: error.host.clone(),
            reason: Some(error.code.to_owned()),
            ..ExternalPluginActivity::new(Kind::Blocked)
          },
        );
      }
      abi::error_envelope(error.code, &error.message)
    }
  };
  if response.len() > abi::MAX_HOSTCALL_RESPONSE_BYTES {
    return abi::error_envelope(
      "response_too_large",
      "Host response exceeds the hostcall response limit",
    );
  }
  response
}
