use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use ts_rs::TS;

pub const SCHEMA_VERSION: u32 = 2;
pub const SDK_VERSION: u32 = 2;

pub const MAX_FILE_EXTENSIONS: usize = 10;
pub const MAX_NETWORK_HOSTS: usize = 10;

/// The host permission catalog. Each ID names a DMM resource; the request in
/// [`ExternalPluginPermission`] carries its scope.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ExternalPluginPermissionId {
  Files,
  Mods,
  Network,
  Game,
  Storage,
  Notifications,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ExternalPluginFileKind {
  File,
  Folder,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ExternalPluginFileAccess {
  Read,
  ReadWrite,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ExternalPluginModAccess {
  Read,
  Install,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ExternalPluginProfileScope {
  Picked,
  All,
}

/// One permission request and its scope. Manifests are normalized on parse
/// (list scopes sorted), so two requests have the same scope exactly when
/// they are equal.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, TS)]
#[serde(tag = "id", rename_all = "camelCase")]
#[ts(export)]
pub enum ExternalPluginPermission {
  Files {
    kind: ExternalPluginFileKind,
    /// Lowercase, without the dot. Empty allows any extension.
    extensions: Vec<String>,
    access: ExternalPluginFileAccess,
  },
  Mods {
    access: Vec<ExternalPluginModAccess>,
    profiles: ExternalPluginProfileScope,
  },
  Network {
    hosts: Vec<String>,
  },
  Game {},
  Storage {},
  Notifications {},
}

/// Deserializes [`ExternalPluginPermission`] rejecting unknown fields. A
/// separate type because ts-rs cannot parse `deny_unknown_fields`.
#[derive(Deserialize)]
#[serde(tag = "id", rename_all = "camelCase", deny_unknown_fields)]
enum StrictPermission {
  Files {
    kind: ExternalPluginFileKind,
    #[serde(default)]
    extensions: Vec<String>,
    access: ExternalPluginFileAccess,
  },
  Mods {
    access: Vec<ExternalPluginModAccess>,
    profiles: ExternalPluginProfileScope,
  },
  Network {
    hosts: Vec<String>,
  },
  Game {},
  Storage {},
  Notifications {},
}

impl<'de> Deserialize<'de> for ExternalPluginPermission {
  fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
    Ok(match StrictPermission::deserialize(deserializer)? {
      StrictPermission::Files {
        kind,
        extensions,
        access,
      } => Self::Files {
        kind,
        extensions,
        access,
      },
      StrictPermission::Mods { access, profiles } => Self::Mods { access, profiles },
      StrictPermission::Network { hosts } => Self::Network { hosts },
      StrictPermission::Game {} => Self::Game {},
      StrictPermission::Storage {} => Self::Storage {},
      StrictPermission::Notifications {} => Self::Notifications {},
    })
  }
}

impl ExternalPluginPermission {
  pub fn id(&self) -> ExternalPluginPermissionId {
    match self {
      Self::Files { .. } => ExternalPluginPermissionId::Files,
      Self::Mods { .. } => ExternalPluginPermissionId::Mods,
      Self::Network { .. } => ExternalPluginPermissionId::Network,
      Self::Game {} => ExternalPluginPermissionId::Game,
      Self::Storage {} => ExternalPluginPermissionId::Storage,
      Self::Notifications {} => ExternalPluginPermissionId::Notifications,
    }
  }

  /// A `mods` request that includes `access`.
  pub fn allows_mods(&self, access: ExternalPluginModAccess) -> bool {
    matches!(self, Self::Mods { access: granted, .. } if granted.contains(&access))
  }

  /// A request the user answers by picking one profile.
  pub fn needs_profile(&self) -> bool {
    matches!(
      self,
      Self::Mods {
        profiles: ExternalPluginProfileScope::Picked,
        ..
      }
    )
  }

  /// Sorts list scopes and checks them against the catalog.
  fn normalize(&mut self) -> Result<(), String> {
    match self {
      Self::Files { extensions, .. } => {
        if extensions.len() > MAX_FILE_EXTENSIONS
          || !extensions.iter().all(|extension| is_extension(extension))
        {
          return Err(format!(
            "files extensions must list at most {MAX_FILE_EXTENSIONS} lowercase names of 1-10 letters or digits, without the dot"
          ));
        }
        sort_unique(extensions, "files extensions")
      }
      Self::Mods { access, profiles } => {
        if access.is_empty() {
          return Err("mods access must list read, install or both".into());
        }
        sort_unique(access, "mods access")?;
        if access.contains(&ExternalPluginModAccess::Install)
          && *profiles != ExternalPluginProfileScope::Picked
        {
          return Err("mods install access needs profiles \"picked\"".into());
        }
        Ok(())
      }
      Self::Network { hosts } => {
        if !(1..=MAX_NETWORK_HOSTS).contains(&hosts.len())
          || !hosts.iter().all(|host| is_network_host(host))
        {
          return Err(format!(
            "network hosts must list 1-{MAX_NETWORK_HOSTS} lowercase DNS names without scheme, port or wildcard; IP addresses and localhost are not allowed"
          ));
        }
        sort_unique(hosts, "network hosts")
      }
      Self::Game {} | Self::Storage {} | Self::Notifications {} => Ok(()),
    }
  }
}

fn sort_unique<T: Ord>(values: &mut [T], what: &str) -> Result<(), String> {
  values.sort();
  if values.windows(2).any(|pair| pair[0] == pair[1]) {
    return Err(format!("{what} must not repeat a value"));
  }
  Ok(())
}

fn is_extension(value: &str) -> bool {
  (1..=10).contains(&value.len())
    && value
      .bytes()
      .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
}

/// A lowercase DNS name with at least two labels that is neither an IP
/// literal nor `localhost`.
pub fn is_network_host(value: &str) -> bool {
  let labels: Vec<&str> = value.split('.').collect();
  value.len() <= 253
    && labels.len() >= 2
    && labels.iter().all(|label| {
      (1..=63).contains(&label.len())
        && !label.starts_with('-')
        && !label.ends_with('-')
        && label
          .bytes()
          .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    })
    && labels
      .last()
      .is_some_and(|tld| *tld != "localhost" && !tld.bytes().all(|byte| byte.is_ascii_digit()))
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PermissionRequests {
  #[serde(default)]
  pub required: Vec<ExternalPluginPermission>,
  #[serde(default)]
  pub optional: Vec<ExternalPluginPermission>,
}

impl PermissionRequests {
  pub fn required(&self, id: ExternalPluginPermissionId) -> Option<&ExternalPluginPermission> {
    self
      .required
      .iter()
      .find(|permission| permission.id() == id)
  }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginManifest {
  pub schema_version: u32,
  pub id: String,
  pub name: String,
  pub version: String,
  pub sdk_version: u32,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub description: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub author: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub icon: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub accent: Option<String>,
  #[serde(default, skip_serializing_if = "Vec::is_empty")]
  pub changelog: Vec<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub ui: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub backend: Option<String>,
  pub permissions: PermissionRequests,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct PluginVersion(pub u64, pub u64, pub u64);

impl PluginVersion {
  pub fn parse(value: &str) -> Option<Self> {
    let mut parts = value.split('.');
    let mut next = || {
      let part = parts.next()?;
      let valid = !part.is_empty()
        && part.len() <= 9
        && part.bytes().all(|byte| byte.is_ascii_digit())
        && (part == "0" || !part.starts_with('0'));
      valid.then(|| part.parse().ok()).flatten()
    };
    let version = Self(next()?, next()?, next()?);
    parts.next().is_none().then_some(version)
  }
}

pub fn is_valid_plugin_id(id: &str) -> bool {
  (3..=64).contains(&id.len())
    && id.contains('.')
    && id.split(['.', '-']).all(|segment| {
      !segment.is_empty()
        && segment
          .bytes()
          .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
    })
}

/// A `/`-separated package path that maps to the same file on every platform:
/// no traversal, no drive letters, no reserved Windows device names.
pub fn is_safe_package_path(path: &str) -> bool {
  !path.is_empty()
    && path.len() <= 240
    && path.split('/').count() <= 16
    && path.split('/').all(|component| {
      let stem = component
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
      let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ((stem.starts_with("COM") || stem.starts_with("LPT"))
          && stem.len() == 4
          && stem.as_bytes()[3].is_ascii_digit());
      !component.is_empty()
        && component != "."
        && component != ".."
        && !component.ends_with('.')
        && !reserved
        && component
          .bytes()
          .all(|byte| byte.is_ascii_alphanumeric() || b"._-@+~".contains(&byte))
    })
}

pub fn is_display_text(value: &str, max: usize) -> bool {
  !value.trim().is_empty() && value.chars().count() <= max && !value.chars().any(char::is_control)
}

/// A Phosphor icon name in kebab case. The host decides how to render names
/// it does not know.
fn is_icon_name(value: &str) -> bool {
  value.len() <= 40
    && value.split('-').all(|segment| {
      !segment.is_empty()
        && segment
          .bytes()
          .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
    })
}

fn is_hex_color(value: &str) -> bool {
  value
    .strip_prefix('#')
    .is_some_and(|hex| hex.len() == 6 && hex.bytes().all(|byte| byte.is_ascii_hexdigit()))
}

impl PluginManifest {
  pub fn parse(bytes: &[u8]) -> Result<Self, String> {
    let mut manifest: Self =
      serde_json::from_slice(bytes).map_err(|error| format!("Invalid manifest.json: {error}"))?;
    manifest.validate()?;
    Ok(manifest)
  }

  pub fn parsed_version(&self) -> PluginVersion {
    PluginVersion::parse(&self.version).unwrap_or(PluginVersion(0, 0, 0))
  }

  fn validate(&mut self) -> Result<(), String> {
    if self.schema_version != SCHEMA_VERSION {
      return Err(format!(
        "Unsupported manifest schemaVersion {}",
        self.schema_version
      ));
    }
    if self.sdk_version != SDK_VERSION {
      return Err(format!(
        "Plugin targets SDK {}, this host supports SDK {SDK_VERSION}",
        self.sdk_version
      ));
    }
    if !is_valid_plugin_id(&self.id) {
      return Err("Plugin id must be a namespaced lowercase id like publisher.plugin-name".into());
    }
    if !is_display_text(&self.name, 64) {
      return Err("Plugin name must be 1-64 printable characters".into());
    }
    if PluginVersion::parse(&self.version).is_none() {
      return Err("Plugin version must be MAJOR.MINOR.PATCH".into());
    }
    if let Some(description) = &self.description
      && !is_display_text(description, 500)
    {
      return Err("Plugin description must be at most 500 printable characters".into());
    }
    if let Some(author) = &self.author
      && !is_display_text(author, 100)
    {
      return Err("Plugin author must be at most 100 printable characters".into());
    }
    if let Some(icon) = &self.icon
      && !is_icon_name(icon)
    {
      return Err("Plugin icon must be a kebab-case icon name of at most 40 characters".into());
    }
    if let Some(accent) = &self.accent
      && !is_hex_color(accent)
    {
      return Err("Plugin accent must be a #RRGGBB color".into());
    }
    if self.changelog.len() > 10
      || !self
        .changelog
        .iter()
        .all(|entry| is_display_text(entry, 200))
    {
      return Err(
        "Plugin changelog must list at most 10 entries of 1-200 printable characters".into(),
      );
    }
    if self.ui.is_none() && self.backend.is_none() {
      return Err("Plugin must declare a ui entry, a backend, or both".into());
    }
    if let Some(ui) = &self.ui
      && !(is_safe_package_path(ui) && ui.ends_with(".html"))
    {
      return Err("ui must be a relative .html path inside the package".into());
    }
    if let Some(backend) = &self.backend
      && !(is_safe_package_path(backend) && backend.ends_with(".wasm"))
    {
      return Err("backend must be a relative .wasm path inside the package".into());
    }
    let requests = &mut self.permissions;
    let mut ids = BTreeSet::new();
    for permission in requests
      .required
      .iter_mut()
      .chain(requests.optional.iter_mut())
    {
      if !ids.insert(permission.id()) {
        return Err("Each permission may be requested once".into());
      }
      permission.normalize()?;
    }
    Ok(())
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  fn manifest(overrides: serde_json::Value) -> Result<PluginManifest, String> {
    let mut value = json!({
      "schemaVersion": 2,
      "id": "example.creator-workspace-bridge",
      "name": "Creator Workspace Bridge",
      "version": "0.1.0",
      "sdkVersion": 2,
      "ui": "ui/index.html",
      "backend": "backend.wasm",
      "permissions": {
        "required": [
          { "id": "files", "kind": "file", "extensions": ["vpk"], "access": "read" },
          { "id": "mods", "access": ["install"], "profiles": "picked" },
          { "id": "storage" }
        ],
        "optional": []
      }
    });
    for (key, field) in overrides.as_object().unwrap() {
      value[key] = field.clone();
    }
    PluginManifest::parse(&serde_json::to_vec(&value).unwrap())
  }

  fn required(permissions: serde_json::Value) -> Result<PluginManifest, String> {
    manifest(json!({ "permissions": { "required": permissions } }))
  }

  #[test]
  fn accepts_the_contract_manifest() {
    let parsed = manifest(json!({})).unwrap();
    assert_eq!(parsed.permissions.required.len(), 3);
    assert_eq!(parsed.parsed_version(), PluginVersion(0, 1, 0));
    assert!(
      parsed
        .permissions
        .required(ExternalPluginPermissionId::Mods)
        .unwrap()
        .needs_profile()
    );
  }

  #[test]
  fn rejects_unknown_ids_and_fields_in_every_request() {
    for permission in [
      json!({ "id": "shell.exec" }),
      json!({ "id": "artifact.read" }),
      json!({ "id": "storage", "maxBytes": 10 }),
      json!({ "id": "game", "scope": {} }),
      json!({ "id": "notifications", "rate": 3 }),
      json!({ "id": "files", "kind": "file", "access": "read", "recursive": true }),
      json!({ "id": "mods", "access": ["read"], "profiles": "all", "write": true }),
      json!({ "id": "network", "hosts": ["api.example.com"], "methods": ["GET"] }),
      json!("storage"),
    ] {
      assert!(required(json!([permission])).is_err(), "{permission}");
    }
    for permission in [
      json!({ "id": "storage" }),
      json!({ "id": "game" }),
      json!({ "id": "notifications" }),
    ] {
      assert!(required(json!([permission])).is_ok(), "{permission}");
    }
  }

  #[test]
  fn validates_file_scopes() {
    let files = |scope: serde_json::Value| {
      let mut request = json!({ "id": "files", "kind": "folder", "access": "readWrite" });
      for (key, field) in scope.as_object().unwrap() {
        request[key] = field.clone();
      }
      required(json!([request]))
    };
    let parsed = files(json!({ "extensions": ["vpk", "json", "txt"] })).unwrap();
    assert_eq!(
      parsed.permissions.required[0],
      ExternalPluginPermission::Files {
        kind: ExternalPluginFileKind::Folder,
        extensions: vec!["json".into(), "txt".into(), "vpk".into()],
        access: ExternalPluginFileAccess::ReadWrite,
      },
      "extensions are sorted so equal scopes compare equal"
    );
    assert!(files(json!({})).is_ok(), "no extensions allows any file");
    let eleven: Vec<_> = (0..11).map(|index| format!("e{index}")).collect();
    for extensions in [
      json!(eleven),
      json!(["VPK"]),
      json!([".vpk"]),
      json!([""]),
      json!(["abcdefghijk"]),
      json!(["tar.gz"]),
      json!(["vpk", "vpk"]),
    ] {
      assert!(
        files(json!({ "extensions": extensions })).is_err(),
        "{extensions}"
      );
    }
    assert!(files(json!({ "kind": "symlink" })).is_err());
    assert!(files(json!({ "access": "write" })).is_err());
  }

  #[test]
  fn validates_mod_scopes() {
    let mods = |access: serde_json::Value, profiles: &str| {
      required(json!([{ "id": "mods", "access": access, "profiles": profiles }]))
    };
    let parsed = mods(json!(["install", "read"]), "picked").unwrap();
    let request = &parsed.permissions.required[0];
    assert_eq!(
      *request,
      ExternalPluginPermission::Mods {
        access: vec![
          ExternalPluginModAccess::Read,
          ExternalPluginModAccess::Install
        ],
        profiles: ExternalPluginProfileScope::Picked,
      }
    );
    assert!(request.allows_mods(ExternalPluginModAccess::Install));
    assert!(mods(json!(["read"]), "all").is_ok());
    assert!(mods(json!(["install"]), "all").is_err());
    assert!(mods(json!([]), "picked").is_err());
    assert!(mods(json!(["read", "read"]), "picked").is_err());
    assert!(mods(json!(["delete"]), "picked").is_err());
    assert!(mods(json!(["read"]), "default").is_err());
  }

  #[test]
  fn validates_network_hosts() {
    let network = |hosts: serde_json::Value| required(json!([{ "id": "network", "hosts": hosts }]));
    let parsed = network(json!(["b.example.com", "api.deadlock-api.com"])).unwrap();
    let ExternalPluginPermission::Network { hosts } = &parsed.permissions.required[0] else {
      panic!("expected a network request");
    };
    assert_eq!(hosts, &["api.deadlock-api.com", "b.example.com"]);
    let eleven: Vec<_> = (0..11)
      .map(|index| format!("h{index}.example.com"))
      .collect();
    for hosts in [
      json!([]),
      json!(eleven),
      json!(["https://api.example.com"]),
      json!(["api.example.com:443"]),
      json!(["*.example.com"]),
      json!(["API.example.com"]),
      json!(["127.0.0.1"]),
      json!(["[::1]"]),
      json!(["localhost"]),
      json!(["dev.localhost"]),
      json!(["intranet"]),
      json!(["-bad.example.com"]),
      json!(["example..com"]),
      json!(["api.example.com/v1"]),
      json!(["a.example.com", "a.example.com"]),
    ] {
      assert!(network(hosts.clone()).is_err(), "{hosts}");
    }
  }

  #[test]
  fn each_permission_id_appears_once() {
    assert!(
      manifest(json!({
        "permissions": { "required": [{ "id": "storage" }], "optional": [{ "id": "storage" }] }
      }))
      .is_err()
    );
    assert!(
      required(json!([
        { "id": "files", "kind": "file", "access": "read" },
        { "id": "files", "kind": "folder", "access": "read" }
      ]))
      .is_err()
    );
    let optional = manifest(json!({
      "permissions": {
        "required": [{ "id": "storage" }],
        "optional": [{ "id": "network", "hosts": ["api.example.com"] }]
      }
    }))
    .unwrap();
    assert_eq!(optional.permissions.optional.len(), 1);
  }

  #[test]
  fn rejects_other_versions_unknown_fields_and_unsafe_paths() {
    assert!(manifest(json!({ "grants": [] })).is_err());
    for ui in [
      "../index.html",
      "/index.html",
      "ui\\index.html",
      "C:/x.html",
      "ui/NUL.html",
    ] {
      assert!(manifest(json!({ "ui": ui })).is_err(), "{ui}");
    }
    assert!(manifest(json!({ "id": "NoNamespace" })).is_err());
    assert!(manifest(json!({ "version": "1.0" })).is_err());
    let sdk = manifest(json!({ "sdkVersion": 1 })).unwrap_err();
    assert!(sdk.contains("this host supports SDK 2"), "{sdk}");
    let schema = manifest(json!({ "schemaVersion": 1 })).unwrap_err();
    assert!(schema.contains("schemaVersion 1"), "{schema}");
  }

  #[test]
  fn validates_presentation_fields() {
    let parsed = manifest(json!({
      "icon": "wrench",
      "accent": "#E3B35A",
      "changelog": ["Watches the output again after a rename"]
    }))
    .unwrap();
    assert_eq!(parsed.icon.as_deref(), Some("wrench"));
    assert_eq!(parsed.changelog.len(), 1);
    assert!(manifest(json!({ "icon": "arrows-clockwise" })).is_ok());
    for icon in [
      "Wrench",
      "-wrench",
      "wrench-",
      "two--dashes",
      "x y",
      &"a".repeat(41),
    ] {
      assert!(manifest(json!({ "icon": icon })).is_err(), "{icon}");
    }
    for accent in ["E3B35A", "#E3B35", "#E3B35AFF", "#G3B35A", "red"] {
      assert!(manifest(json!({ "accent": accent })).is_err(), "{accent}");
    }
    let eleven: Vec<_> = (0..11).map(|index| format!("Change {index}")).collect();
    for changelog in [
      json!(eleven),
      json!([""]),
      json!(["x".repeat(201)]),
      json!(["line\nbreak"]),
      json!("not a list"),
    ] {
      assert!(
        manifest(json!({ "changelog": changelog })).is_err(),
        "{changelog}"
      );
    }
  }

  #[test]
  fn orders_versions_numerically() {
    assert!(PluginVersion::parse("0.10.0") > PluginVersion::parse("0.9.9"));
    assert_eq!(PluginVersion::parse("01.0.0"), None);
    assert_eq!(PluginVersion::parse("1.0.0-beta"), None);
  }
}
