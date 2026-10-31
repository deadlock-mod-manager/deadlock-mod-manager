use super::deploy::is_dedicated_profile;
use super::files;
use super::manifest::{
  ExternalPluginFileKind, ExternalPluginModAccess, ExternalPluginPermission,
  ExternalPluginPermissionId as PermissionId, PluginManifest,
};
use crate::Error;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use ts_rs::TS;

pub const REGISTRY_SCHEMA_VERSION: u32 = 1;

/// A user grant, stored outside plugin storage. The file and profile are
/// picked in trusted host UI; plugin payloads never set them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredGrant {
  /// The approved requests, exactly as the manifest declared them.
  pub permissions: Vec<ExternalPluginPermission>,
  /// Canonical path of the picked file or folder, for `files`.
  pub file: Option<String>,
  /// The picked profile folder, for `mods` with `profiles: "picked"`.
  pub profile: Option<String>,
  pub granted_at: String,
}

impl StoredGrant {
  /// Drops approvals `manifest` no longer requests and picked resources its
  /// scopes no longer allow. A request removed and later reintroduced needs
  /// consent again.
  pub fn narrow_to(&mut self, manifest: &PluginManifest) {
    self
      .permissions
      .retain(|permission| manifest.permissions.required.contains(permission));
    if self
      .file
      .as_deref()
      .is_some_and(|file| !file_allowed(manifest, Path::new(file)))
    {
      self.file = None;
    }
    if self
      .profile
      .as_deref()
      .is_some_and(|folder| !profile_allowed(manifest, folder))
    {
      self.profile = None;
    }
  }
}

/// Whether the manifest's `files` request admits `path`: the same kind of
/// entry and, for files, an allowed extension.
pub fn file_allowed(manifest: &PluginManifest, path: &Path) -> bool {
  match manifest.permissions.required(PermissionId::Files) {
    Some(ExternalPluginPermission::Files {
      kind: ExternalPluginFileKind::Folder,
      ..
    }) => path.is_dir(),
    Some(ExternalPluginPermission::Files {
      kind: ExternalPluginFileKind::File,
      extensions,
      ..
    }) => !path.is_dir() && files::extension_allowed(extensions, path),
    _ => false,
  }
}

/// Whether the manifest's `mods` request admits a picked `folder`. Installing
/// never targets the default profile; reading may.
pub fn profile_allowed(manifest: &PluginManifest, folder: &str) -> bool {
  manifest
    .permissions
    .required(PermissionId::Mods)
    .is_some_and(|request| {
      request.needs_profile()
        && (!request.allows_mods(ExternalPluginModAccess::Install) || is_dedicated_profile(folder))
    })
}

/// How an installed or pending package arrived.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ExternalPluginSource {
  #[default]
  File,
  Catalog,
}

/// An unpacked package under `packages/<id>/<package_dir>`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredPackage {
  pub manifest: PluginManifest,
  pub package_dir: String,
  pub archive_hash: String,
  pub backend_hash: Option<String>,
  pub package_size: u64,
  pub source: ExternalPluginSource,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPlugin {
  pub manifest: PluginManifest,
  pub package_dir: String,
  pub archive_hash: String,
  pub backend_hash: Option<String>,
  #[serde(default)]
  pub package_size: u64,
  #[serde(default)]
  pub source: ExternalPluginSource,
  pub enabled: bool,
  pub grant: Option<StoredGrant>,
  pub generation: u64,
  pub installed_at: String,
  pub updated_at: String,
  pub last_error: Option<String>,
  #[serde(default)]
  pub last_error_at: Option<String>,
  pub quarantined: bool,
  /// A newer package that needs permissions the grant does not cover. It
  /// waits for approval while the installed version keeps running.
  #[serde(default)]
  pub pending_update: Option<StoredPackage>,
}

impl InstalledPlugin {
  pub fn new(package: StoredPackage) -> Self {
    let now = chrono::Utc::now().to_rfc3339();
    Self {
      manifest: package.manifest,
      package_dir: package.package_dir,
      archive_hash: package.archive_hash,
      backend_hash: package.backend_hash,
      package_size: package.package_size,
      source: package.source,
      enabled: false,
      grant: None,
      generation: 0,
      installed_at: now.clone(),
      updated_at: now,
      last_error: None,
      last_error_at: None,
      quarantined: false,
      pending_update: None,
    }
  }

  /// A required request is not approved exactly, or a resource it needs is
  /// not picked.
  pub fn needs_consent(&self) -> bool {
    if !self.uncovered(&self.manifest).is_empty() {
      return true;
    }
    let requests = &self.manifest.permissions;
    let grant = self.grant.as_ref();
    let missing_file = requests.required(PermissionId::Files).is_some()
      && grant.is_none_or(|grant| grant.file.is_none());
    let missing_profile = requests
      .required(PermissionId::Mods)
      .is_some_and(ExternalPluginPermission::needs_profile)
      && grant.is_none_or(|grant| grant.profile.is_none());
    missing_file || missing_profile
  }

  /// Requests `manifest` requires that the current grant does not hold with
  /// exactly that scope.
  pub fn uncovered(&self, manifest: &PluginManifest) -> Vec<ExternalPluginPermission> {
    manifest
      .permissions
      .required
      .iter()
      .filter(|permission| {
        !self
          .grant
          .as_ref()
          .is_some_and(|grant| grant.permissions.contains(permission))
      })
      .cloned()
      .collect()
  }

  pub fn set_error(&mut self, error: Option<String>) {
    self.last_error_at = error.as_ref().map(|_| chrono::Utc::now().to_rfc3339());
    self.last_error = error;
  }

  /// Switches to `package`; the caller removes the previous package directory.
  /// The grant keeps only what the new manifest still allows, and without
  /// full consent for it the plugin is disabled.
  pub fn install_package(&mut self, package: StoredPackage) {
    self.manifest = package.manifest;
    self.package_dir = package.package_dir;
    self.archive_hash = package.archive_hash;
    self.backend_hash = package.backend_hash;
    self.package_size = package.package_size;
    self.source = package.source;
    if let Some(grant) = &mut self.grant {
      grant.narrow_to(&self.manifest);
    }
    self.set_error(None);
    self.quarantined = false;
    if self.needs_consent() {
      self.enabled = false;
    }
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ExternalPluginStatus {
  Disabled,
  NeedsConsent,
  Enabled,
  Quarantined,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ExternalPluginGrant {
  pub permissions: Vec<ExternalPluginPermission>,
  pub file: Option<ExternalPluginGrantedFile>,
  pub profile_folder: Option<String>,
  pub granted_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ExternalPluginGrantedFile {
  /// The picked path as the user would type it.
  pub path: String,
  pub name: String,
  pub kind: ExternalPluginFileKind,
}

impl ExternalPluginGrantedFile {
  fn new(manifest: &PluginManifest, path: &str) -> Self {
    let kind = match manifest.permissions.required(PermissionId::Files) {
      Some(ExternalPluginPermission::Files { kind, .. }) => *kind,
      _ if Path::new(path).is_dir() => ExternalPluginFileKind::Folder,
      _ => ExternalPluginFileKind::File,
    };
    Self {
      path: display_path(path),
      name: file_name(path),
      kind,
    }
  }
}

pub fn file_name(path: &str) -> String {
  Path::new(path)
    .file_name()
    .map(|name| name.to_string_lossy().into_owned())
    .unwrap_or_default()
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ExternalPluginPendingUpdate {
  pub version: String,
  pub package_hash: String,
  #[ts(type = "number")]
  pub package_size: u64,
  /// Requests the update requires that the grant does not hold exactly.
  pub new_permissions: Vec<ExternalPluginPermission>,
  pub changelog: Vec<String>,
  pub source: ExternalPluginSource,
}

/// Live state the registry does not hold.
#[derive(Debug)]
pub struct RuntimeStats {
  pub storage_bytes: u64,
  pub last_tick_at: Option<String>,
  pub restarts_today: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ExternalPluginSummary {
  pub id: String,
  pub name: String,
  pub version: String,
  pub description: Option<String>,
  pub author: Option<String>,
  pub icon: Option<String>,
  pub accent: Option<String>,
  pub changelog: Vec<String>,
  pub sdk_version: u32,
  pub required_permissions: Vec<ExternalPluginPermission>,
  pub optional_permissions: Vec<ExternalPluginPermission>,
  pub has_ui: bool,
  pub has_backend: bool,
  pub enabled: bool,
  pub status: ExternalPluginStatus,
  pub grant: Option<ExternalPluginGrant>,
  pub package_hash: String,
  pub source: ExternalPluginSource,
  #[ts(type = "number")]
  pub package_size: u64,
  #[ts(type = "number")]
  pub storage_bytes: u64,
  pub installed_at: String,
  pub updated_at: String,
  pub last_tick_at: Option<String>,
  pub restarts_today: u32,
  pub last_error: Option<String>,
  pub last_error_at: Option<String>,
  pub pending_update: Option<ExternalPluginPendingUpdate>,
}

/// Canonical Windows paths carry the `\\?\` extended-length prefix, which
/// nobody types; show the path the way the user picked it.
fn display_path(path: &str) -> String {
  match path.strip_prefix(r"\\?\UNC\") {
    Some(share) => format!(r"\\{share}"),
    None => path.strip_prefix(r"\\?\").unwrap_or(path).to_owned(),
  }
}

impl ExternalPluginSummary {
  pub fn new(plugin: &InstalledPlugin, stats: RuntimeStats) -> Self {
    let manifest = &plugin.manifest;
    let status = if plugin.quarantined {
      ExternalPluginStatus::Quarantined
    } else if plugin.needs_consent() {
      ExternalPluginStatus::NeedsConsent
    } else if plugin.enabled {
      ExternalPluginStatus::Enabled
    } else {
      ExternalPluginStatus::Disabled
    };
    Self {
      id: manifest.id.clone(),
      name: manifest.name.clone(),
      version: manifest.version.clone(),
      description: manifest.description.clone(),
      author: manifest.author.clone(),
      icon: manifest.icon.clone(),
      accent: manifest.accent.clone(),
      changelog: manifest.changelog.clone(),
      sdk_version: manifest.sdk_version,
      required_permissions: manifest.permissions.required.clone(),
      optional_permissions: manifest.permissions.optional.clone(),
      has_ui: manifest.ui.is_some(),
      has_backend: manifest.backend.is_some(),
      enabled: plugin.enabled,
      status,
      grant: plugin.grant.as_ref().map(|grant| ExternalPluginGrant {
        permissions: grant.permissions.clone(),
        file: grant
          .file
          .as_deref()
          .map(|file| ExternalPluginGrantedFile::new(manifest, file)),
        profile_folder: grant.profile.clone(),
        granted_at: grant.granted_at.clone(),
      }),
      package_hash: plugin.archive_hash.clone(),
      source: plugin.source,
      package_size: plugin.package_size,
      storage_bytes: stats.storage_bytes,
      installed_at: plugin.installed_at.clone(),
      updated_at: plugin.updated_at.clone(),
      last_tick_at: stats.last_tick_at,
      restarts_today: stats.restarts_today,
      last_error: plugin.last_error.clone(),
      last_error_at: plugin.last_error_at.clone(),
      pending_update: plugin
        .pending_update
        .as_ref()
        .map(|pending| ExternalPluginPendingUpdate {
          version: pending.manifest.version.clone(),
          package_hash: pending.archive_hash.clone(),
          package_size: pending.package_size,
          new_permissions: plugin.uncovered(&pending.manifest),
          changelog: pending.manifest.changelog.clone(),
          source: pending.source,
        }),
    }
  }
}

/// What a live session may use. Built from the registry on every check, so a
/// stale generation cannot keep authority after disable, revoke or update.
#[derive(Debug, Clone)]
pub struct ActivePlugin {
  pub id: String,
  pub generation: u64,
  pub manifest: PluginManifest,
  pub package_dir: PathBuf,
  pub backend_hash: Option<String>,
  pub grant: StoredGrant,
}

impl ActivePlugin {
  /// The required request for `id`, when the grant approves it exactly.
  pub fn permission(&self, id: PermissionId) -> Option<&ExternalPluginPermission> {
    self
      .manifest
      .permissions
      .required(id)
      .filter(|request| self.grant.permissions.contains(request))
  }
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegistryFile {
  schema_version: u32,
  next_generation: u64,
  plugins: BTreeMap<String, InstalledPlugin>,
}

pub struct Registry {
  path: PathBuf,
  packages_root: PathBuf,
  file: RegistryFile,
}

impl Registry {
  pub fn open(root: &Path) -> Result<Self, Error> {
    let path = root.join("registry.json");
    let packages_root = root.join("packages");
    let empty = RegistryFile {
      schema_version: REGISTRY_SCHEMA_VERSION,
      next_generation: 1,
      plugins: BTreeMap::new(),
    };
    let file = match fs::read(&path) {
      Ok(bytes) => {
        let corrupt = |error: serde_json::Error| {
          Error::InvalidInput(format!("Plugin registry is corrupt: {error}"))
        };
        let value: serde_json::Value = serde_json::from_slice(&bytes).map_err(corrupt)?;
        match value
          .get("schemaVersion")
          .and_then(serde_json::Value::as_u64)
        {
          Some(version) if version == u64::from(REGISTRY_SCHEMA_VERSION) => {
            serde_json::from_value(value).map_err(corrupt)?
          }
          other => {
            return Err(Error::InvalidInput(format!(
              "Plugin registry schema {} is not supported by this version of the app",
              other.map_or_else(|| "unknown".to_owned(), |version| version.to_string())
            )));
          }
        }
      }
      Err(error) if error.kind() == std::io::ErrorKind::NotFound => empty,
      Err(error) => return Err(error.into()),
    };
    Ok(Self {
      path,
      packages_root,
      file,
    })
  }

  pub fn save(&self) -> Result<(), Error> {
    if let Some(parent) = self.path.parent() {
      fs::create_dir_all(parent)?;
    }
    let bytes = serde_json::to_vec_pretty(&self.file)
      .map_err(|error| Error::InvalidInput(error.to_string()))?;
    let partial = self.path.with_extension("json.part");
    fs::write(&partial, bytes)?;
    fs::rename(partial, &self.path)?;
    Ok(())
  }

  pub fn next_generation(&mut self) -> u64 {
    let generation = self.file.next_generation.max(1);
    self.file.next_generation = generation + 1;
    generation
  }

  pub fn get(&self, id: &str) -> Option<&InstalledPlugin> {
    self.file.plugins.get(id)
  }

  pub fn require(&self, id: &str) -> Result<&InstalledPlugin, Error> {
    self
      .get(id)
      .ok_or_else(|| Error::InvalidInput(format!("Plugin {id} is not installed")))
  }

  /// Applies `change` and moves the plugin to a new generation, which retires
  /// every view and worker session of the previous one.
  pub fn update<T>(
    &mut self,
    id: &str,
    change: impl FnOnce(&mut InstalledPlugin) -> Result<T, Error>,
  ) -> Result<T, Error> {
    let generation = self.next_generation();
    let plugin = self
      .file
      .plugins
      .get_mut(id)
      .ok_or_else(|| Error::InvalidInput(format!("Plugin {id} is not installed")))?;
    let result = change(plugin)?;
    plugin.generation = generation;
    plugin.updated_at = chrono::Utc::now().to_rfc3339();
    self.save()?;
    Ok(result)
  }

  /// Applies `change` without a new generation, for changes that grant or
  /// revoke nothing, such as staging an update for approval.
  pub fn amend<T>(
    &mut self,
    id: &str,
    change: impl FnOnce(&mut InstalledPlugin) -> T,
  ) -> Result<T, Error> {
    let plugin = self
      .file
      .plugins
      .get_mut(id)
      .ok_or_else(|| Error::InvalidInput(format!("Plugin {id} is not installed")))?;
    let result = change(plugin);
    self.save()?;
    Ok(result)
  }

  pub fn insert(&mut self, mut plugin: InstalledPlugin) -> Result<(), Error> {
    plugin.generation = self.next_generation();
    self.file.plugins.insert(plugin.manifest.id.clone(), plugin);
    self.save()
  }

  pub fn remove(&mut self, id: &str) -> Result<Option<InstalledPlugin>, Error> {
    let removed = self.file.plugins.remove(id);
    self.save()?;
    Ok(removed)
  }

  /// Records a non-authority change such as a background error message.
  pub fn note_error(&mut self, id: &str, generation: u64, error: Option<String>) {
    if let Some(plugin) = self.file.plugins.get_mut(id)
      && plugin.generation == generation
      && plugin.last_error != error
    {
      plugin.set_error(error);
      if let Err(error) = self.save() {
        log::warn!("[ExternalPlugins] Failed to save registry: {error}");
      }
    }
  }

  pub fn list(&self) -> impl Iterator<Item = &InstalledPlugin> {
    self.file.plugins.values()
  }

  pub fn package_dir(&self, plugin: &InstalledPlugin) -> PathBuf {
    self.package_path(&plugin.manifest.id, &plugin.package_dir)
  }

  pub fn package_path(&self, id: &str, package_dir: &str) -> PathBuf {
    self.packages_root.join(id).join(package_dir)
  }

  pub fn authorize(&self, id: &str, generation: u64) -> Result<ActivePlugin, SessionDenied> {
    let plugin = self.get(id).ok_or(SessionDenied::Removed)?;
    if plugin.generation != generation {
      return Err(SessionDenied::Stale);
    }
    self.active(plugin)
  }

  pub fn active(&self, plugin: &InstalledPlugin) -> Result<ActivePlugin, SessionDenied> {
    if plugin.quarantined || !plugin.enabled {
      return Err(SessionDenied::Disabled);
    }
    if plugin.needs_consent() {
      return Err(SessionDenied::NeedsConsent);
    }
    let grant = plugin.grant.clone().ok_or(SessionDenied::NeedsConsent)?;
    Ok(ActivePlugin {
      id: plugin.manifest.id.clone(),
      generation: plugin.generation,
      manifest: plugin.manifest.clone(),
      package_dir: self.package_dir(plugin),
      backend_hash: plugin.backend_hash.clone(),
      grant,
    })
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionDenied {
  Removed,
  Stale,
  Disabled,
  NeedsConsent,
}

impl SessionDenied {
  pub fn code(self) -> &'static str {
    match self {
      Self::Removed => "plugin_removed",
      Self::Stale => "session_revoked",
      Self::Disabled => "plugin_disabled",
      Self::NeedsConsent => "consent_required",
    }
  }

  pub fn message(self) -> &'static str {
    match self {
      Self::Removed => "The plugin was removed",
      Self::Stale => "The plugin changed since this session started; reopen it",
      Self::Disabled => "The plugin is disabled",
      Self::NeedsConsent => "The plugin needs permission approval in Deadlock Mod Manager",
    }
  }
}
