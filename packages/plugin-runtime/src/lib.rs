//! Runtime-installed external plugins: packages unpacked from archives,
//! interfaces served to sandboxed frames, and Rust/WASM backends running in
//! supervised worker processes behind a permission broker. See `README.md`.

mod abi;
mod activity;
mod adapter;
mod deploy;
mod error;
mod events;
mod files;
mod host_api;
mod manifest;
mod network;
mod package;
mod protocol;
mod registry;
mod snapshots;
mod storage;
mod supervisor;
mod view;
mod worker;

use activity::{ActivityLog, ExternalPluginActivityKind as ActivityKind};
use deploy::Deployments;
use manifest::{ExternalPluginPermissionId as PermissionId, PluginManifest};
use registry::{ActivePlugin, InstalledPlugin, Registry, RuntimeStats, StoredGrant, StoredPackage};
use snapshots::{Observation, SnapshotStore};
use std::collections::{HashMap, HashSet, VecDeque};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use std::time::{Duration, Instant};
use storage::PluginStorage;
use supervisor::{CallOutcome, Supervisor};

pub use activity::{ExternalPluginActivity, ExternalPluginActivityKind};
pub use adapter::{Deployment, HostAdapter, HttpRequest, HttpResponse, ProfileMod};
pub use dmm_plugin_sdk::events as event_contract;
pub use error::Error;
pub use manifest::{
  ExternalPluginFileAccess, ExternalPluginFileKind, ExternalPluginModAccess,
  ExternalPluginPermission, ExternalPluginPermissionId, ExternalPluginProfileScope,
};
pub use package::MAX_ARCHIVE_BYTES;
pub use registry::{
  ExternalPluginGrant, ExternalPluginGrantedFile, ExternalPluginPendingUpdate,
  ExternalPluginSource, ExternalPluginStatus, ExternalPluginSummary, SessionDenied,
};
pub use supervisor::WorkerLauncher;
pub use view::{PluginView, ViewAsset};
pub use worker::{WORKER_ARG, run as run_worker};

const TICK_INPUT: &str = r#"{"command":"tick","payload":{}}"#;
const TICK_INTERVAL: Duration = Duration::from_secs(2);
const MAX_UI_PAYLOAD_BYTES: usize = 64 * 1024;

struct PluginServices {
  snapshots: SnapshotStore,
  deployments: Deployments,
  storage: PluginStorage,
  activity: ActivityLog,
}

type RetireHook = Box<dyn Fn(&str) + Send + Sync>;
type BlockedHook = Box<dyn Fn(&str, &ExternalPluginActivity) + Send + Sync>;
/// Snapshot observations of one plugin, by resolved file path.
type Observations = HashMap<PathBuf, Observation>;
type NotificationHook = Box<dyn Fn(&str, &str, &str) + Send + Sync>;

/// Notifications one plugin may show per [`NOTIFICATION_WINDOW`].
const MAX_NOTIFICATIONS: usize = 3;
const NOTIFICATION_WINDOW: Duration = Duration::from_secs(60);
/// Files a plugin's snapshots watch at once before observations start over.
const MAX_OBSERVED_FILES: usize = 64;

pub struct PluginHost {
  runtime_transition: Mutex<()>,
  root: PathBuf,
  registry: Mutex<Registry>,
  supervisor: Supervisor,
  adapter: Arc<dyn HostAdapter>,
  services: Mutex<HashMap<String, Arc<PluginServices>>>,
  observations: Mutex<HashMap<String, (u64, Observations)>>,
  notifications: Mutex<HashMap<String, VecDeque<Instant>>>,
  ticking: Mutex<HashSet<String>>,
  last_ticks: Mutex<HashMap<String, String>>,
  retire_hook: OnceLock<RetireHook>,
  blocked_hook: OnceLock<BlockedHook>,
  notification_hook: OnceLock<NotificationHook>,
  events: Mutex<events::EventJournal>,
}

fn invalid(message: impl Into<String>) -> Error {
  Error::InvalidInput(message.into())
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
  mutex.lock().unwrap_or_else(|poison| poison.into_inner())
}

fn is_valid_command(command: &str) -> bool {
  command != "tick"
    && (1..=64).contains(&command.len())
    && command.starts_with(|first: char| first.is_ascii_lowercase())
    && command
      .bytes()
      .all(|byte| byte.is_ascii_alphanumeric() || b"_.-".contains(&byte))
}

impl PluginHost {
  pub fn open(
    root: PathBuf,
    launcher: WorkerLauncher,
    adapter: Arc<dyn HostAdapter>,
  ) -> Result<Self, Error> {
    fs::create_dir_all(&root)?;
    let staging = root.join("staging");
    if staging.exists() {
      fs::remove_dir_all(&staging)?;
    }
    Ok(Self {
      runtime_transition: Mutex::new(()),
      registry: Mutex::new(Registry::open(&root)?),
      root,
      supervisor: Supervisor::new(launcher),
      adapter,
      services: Mutex::new(HashMap::new()),
      observations: Mutex::new(HashMap::new()),
      ticking: Mutex::new(HashSet::new()),
      last_ticks: Mutex::new(HashMap::new()),
      retire_hook: OnceLock::new(),
      blocked_hook: OnceLock::new(),
      notification_hook: OnceLock::new(),
      notifications: Mutex::new(HashMap::new()),
      events: Mutex::new(events::EventJournal::default()),
    })
  }

  #[cfg(test)]
  pub fn root(&self) -> &Path {
    &self.root
  }

  pub fn runtime_enabled(&self) -> bool {
    lock(&self.registry).runtime_enabled()
  }

  /// The host starts suspended until the application restores the user's opt-in.
  pub fn set_runtime_enabled(&self, enabled: bool) {
    let _transition = lock(&self.runtime_transition);
    let ids = lock(&self.registry).set_runtime_enabled(enabled);
    for id in ids {
      self.retire(&id);
      // Drain a call that passed authorization just before suspension, including
      // one that had not spawned its worker when retire ran.
      self
        .supervisor
        .exclusive(&id, || self.supervisor.terminate(&id));
    }
  }

  /// Called with the plugin id whenever its sessions are retired or its
  /// pending update changes, so the Tauri layer can refresh that plugin.
  pub fn set_retire_hook(&self, hook: RetireHook) {
    let _ = self.retire_hook.set(hook);
  }

  /// Called when a hostcall refusal is recorded as `blocked` activity.
  pub fn set_blocked_hook(&self, hook: BlockedHook) {
    let _ = self.blocked_hook.set(hook);
  }

  fn data_dir(&self, id: &str) -> PathBuf {
    self.root.join("data").join(id)
  }

  fn services(&self, id: &str) -> Arc<PluginServices> {
    let data = self.data_dir(id);
    Arc::clone(
      lock(&self.services)
        .entry(id.to_owned())
        .or_insert_with(|| {
          Arc::new(PluginServices {
            snapshots: SnapshotStore::new(&data),
            deployments: Deployments::new(&data),
            storage: PluginStorage::new(&data),
            activity: ActivityLog::new(&data),
          })
        }),
    )
  }

  fn adapter(&self) -> &dyn HostAdapter {
    self.adapter.as_ref()
  }

  /// Called with the plugin id, title and body of every notification a
  /// plugin is allowed to show.
  pub fn set_notification_hook(&self, hook: NotificationHook) {
    let _ = self.notification_hook.set(hook);
  }

  fn with_observation<T>(
    &self,
    plugin: &ActivePlugin,
    path: &Path,
    f: impl FnOnce(&mut Observation) -> T,
  ) -> T {
    let mut observations = lock(&self.observations);
    let entry = observations
      .entry(plugin.id.clone())
      .or_insert_with(|| (plugin.generation, HashMap::new()));
    if entry.0 != plugin.generation || entry.1.len() >= MAX_OBSERVED_FILES {
      *entry = (plugin.generation, HashMap::new());
    }
    f(entry.1.entry(path.to_path_buf()).or_default())
  }

  /// Takes one of the plugin's notifications for the current window.
  fn allow_notification(&self, id: &str) -> bool {
    let mut notifications = lock(&self.notifications);
    let shown = notifications.entry(id.to_owned()).or_default();
    let now = Instant::now();
    while shown
      .front()
      .is_some_and(|at| now.duration_since(*at) >= NOTIFICATION_WINDOW)
    {
      shown.pop_front();
    }
    if shown.len() >= MAX_NOTIFICATIONS {
      return false;
    }
    shown.push_back(now);
    true
  }

  fn show_notification(&self, id: &str, title: &str, body: &str) {
    if let Some(hook) = self.notification_hook.get() {
      hook(id, title, body);
    }
  }

  fn retire(&self, id: &str) {
    self.supervisor.terminate(id);
    lock(&self.events).retire(id);
    lock(&self.observations).remove(id);
    self.notify(id);
  }

  fn notify(&self, id: &str) {
    if let Some(hook) = self.retire_hook.get() {
      hook(id);
    }
  }

  pub(crate) fn record_activity(&self, id: &str, entry: ExternalPluginActivity) {
    match self.services(id).activity.record(&entry) {
      Ok(true) if entry.kind == ActivityKind::Blocked => {
        if let Some(hook) = self.blocked_hook.get() {
          hook(id, &entry);
        }
      }
      Ok(_) => {}
      Err(error) => log::warn!("[ExternalPlugins] Could not record activity of {id}: {error}"),
    }
  }

  /// Recorded activity, newest first; `limit` is clamped to 1-100.
  pub fn activity(&self, id: &str, limit: usize) -> Result<Vec<ExternalPluginActivity>, Error> {
    lock(&self.registry).require(id)?;
    self
      .services(id)
      .activity
      .list(limit.clamp(1, activity::MAX_ENTRIES))
  }

  pub(crate) fn authorize(&self, id: &str, generation: u64) -> Result<ActivePlugin, SessionDenied> {
    lock(&self.registry).authorize(id, generation)
  }

  pub(crate) fn active(&self, id: &str) -> Result<ActivePlugin, Error> {
    let registry = lock(&self.registry);
    let plugin = registry.require(id)?;
    registry
      .active(plugin)
      .map_err(|denied| invalid(denied.message()))
  }

  fn summarize(&self, plugin: &InstalledPlugin) -> ExternalPluginSummary {
    let id = &plugin.manifest.id;
    ExternalPluginSummary::new(
      plugin,
      RuntimeStats {
        storage_bytes: PluginStorage::new(&self.data_dir(id)).size(),
        last_tick_at: lock(&self.last_ticks).get(id).cloned(),
        restarts_today: self.supervisor.restarts_today(id),
      },
    )
  }

  fn summary(&self, id: &str) -> Result<ExternalPluginSummary, Error> {
    Ok(self.summarize(lock(&self.registry).require(id)?))
  }

  pub fn list(&self) -> Vec<ExternalPluginSummary> {
    lock(&self.registry)
      .list()
      .map(|plugin| self.summarize(plugin))
      .collect()
  }

  /// Installs or updates from an archive the user picked in host UI. New
  /// installs start disabled and ungranted. An update that needs permissions
  /// the grant does not cover waits as the pending update; the installed
  /// version keeps running until the user applies or discards it.
  pub fn install(&self, archive: &Path) -> Result<ExternalPluginSummary, Error> {
    self.install_from(archive, ExternalPluginSource::File, None)
  }

  /// Installs a downloaded catalog archive after checking it against the
  /// SHA-256 the catalog published.
  pub fn install_catalog(
    &self,
    archive: &Path,
    sha256: &str,
  ) -> Result<ExternalPluginSummary, Error> {
    self.install_from(archive, ExternalPluginSource::Catalog, Some(sha256))
  }

  fn install_from(
    &self,
    archive: &Path,
    source: ExternalPluginSource,
    expected_hash: Option<&str>,
  ) -> Result<ExternalPluginSummary, Error> {
    let staging = self.root.join("staging");
    fs::create_dir_all(&staging)?;
    let unpacked = staging.join(format!(
      "{}-{}",
      std::process::id(),
      chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
    ));
    let extracted = match package::extract(archive, &unpacked, expected_hash) {
      Ok(extracted) => extracted,
      Err(error) => {
        let _ = fs::remove_dir_all(&unpacked);
        return Err(error);
      }
    };
    let id = extracted.manifest.id.clone();
    let mut registry = lock(&self.registry);
    let previous = registry.get(&id).cloned();
    if let Some(previous) = &previous {
      let (installed, incoming) = (
        previous.manifest.parsed_version(),
        extracted.manifest.parsed_version(),
      );
      let unchanged = (incoming == installed && previous.archive_hash == extracted.archive_hash)
        || previous
          .pending_update
          .as_ref()
          .is_some_and(|pending| pending.archive_hash == extracted.archive_hash);
      let pending_version = previous
        .pending_update
        .as_ref()
        .map(|pending| pending.manifest.parsed_version());
      if unchanged
        || incoming <= installed
        || pending_version.is_some_and(|version| incoming <= version)
      {
        let _ = fs::remove_dir_all(&unpacked);
        drop(registry);
        if unchanged {
          return self.summary(&id);
        }
        return Err(invalid(format!(
          "{} {} cannot replace the installed or pending version; select a newer archive",
          previous.manifest.name, extracted.manifest.version
        )));
      }
    }

    let package_dir = format!(
      "{}-{}",
      extracted.manifest.version,
      &extracted.archive_hash[..12]
    );
    let destination = registry.package_path(&id, &package_dir);
    if destination.exists() {
      fs::remove_dir_all(&destination)?;
    }
    if let Some(parent) = destination.parent() {
      fs::create_dir_all(parent)?;
    }
    fs::rename(&unpacked, &destination)?;
    let package = StoredPackage {
      manifest: extracted.manifest,
      package_dir,
      archive_hash: extracted.archive_hash,
      backend_hash: extracted.backend_hash,
      package_size: extracted.archive_size,
      source,
    };
    let version = package.manifest.version.clone();

    let Some(previous) = previous else {
      if let Err(error) = registry.insert(InstalledPlugin::new(package)) {
        let _ = fs::remove_dir_all(&destination);
        return Err(error);
      }
      drop(registry);
      self.retire(&id);
      log::info!("[ExternalPlugins] Installed {id} {version}");
      return self.summary(&id);
    };
    let awaits_approval =
      previous.grant.is_some() && !previous.uncovered(&package.manifest).is_empty();
    let replaced = if awaits_approval {
      registry.amend(&id, |plugin| plugin.pending_update.replace(package))
    } else {
      registry.update(&id, |plugin| {
        plugin.install_package(package);
        let installed = plugin.manifest.parsed_version();
        Ok(
          plugin
            .pending_update
            .take_if(|pending| pending.manifest.parsed_version() <= installed),
        )
      })
    };
    let replaced = match replaced {
      Ok(replaced) => replaced,
      Err(error) => {
        let _ = fs::remove_dir_all(&destination);
        return Err(error);
      }
    };
    let mut obsolete: Vec<PathBuf> = replaced
      .map(|pending| registry.package_path(&id, &pending.package_dir))
      .into_iter()
      .collect();
    if !awaits_approval {
      obsolete.push(registry.package_dir(&previous));
    }
    drop(registry);
    for dir in obsolete.iter().filter(|dir| **dir != destination) {
      if let Err(error) = fs::remove_dir_all(dir) {
        log::warn!("[ExternalPlugins] Could not remove a previous package of {id}: {error}");
      }
    }
    if awaits_approval {
      self.notify(&id);
      log::info!("[ExternalPlugins] {id} {version} waits for permission approval");
    } else {
      self.retire(&id);
      self.record_activity(
        &id,
        ExternalPluginActivity {
          reason: Some(version.clone()),
          ..ExternalPluginActivity::new(ActivityKind::Updated)
        },
      );
      log::info!("[ExternalPlugins] Updated {id} to {version}");
    }
    self.summary(&id)
  }

  /// Installs the pending update. The user approved its requests, so they
  /// become the grant; the picked file and profile stay when the new scopes
  /// still allow them, and so does the enabled state while nothing is left
  /// to pick.
  pub fn apply_update(
    &self,
    id: &str,
    expected_hash: &str,
  ) -> Result<ExternalPluginSummary, Error> {
    let mut registry = lock(&self.registry);
    let plugin = registry.require(id)?;
    let pending = plugin
      .pending_update
      .as_ref()
      .ok_or_else(|| invalid("No update is waiting for approval"))?;
    if pending.archive_hash != expected_hash {
      return Err(invalid("The update changed; review its permissions again"));
    }
    if !registry.package_path(id, &pending.package_dir).is_dir() {
      return Err(invalid(
        "The downloaded update is missing; install it again",
      ));
    }
    let version = pending.manifest.version.clone();
    let previous = registry.package_dir(plugin);
    registry.update(id, |plugin| {
      let package = plugin
        .pending_update
        .take()
        .ok_or_else(|| invalid("No update is waiting for approval"))?;
      if let Some(grant) = &mut plugin.grant {
        grant
          .permissions
          .clone_from(&package.manifest.permissions.required);
      }
      plugin.install_package(package);
      Ok(())
    })?;
    drop(registry);
    if let Err(error) = fs::remove_dir_all(&previous) {
      log::warn!("[ExternalPlugins] Could not remove the previous package of {id}: {error}");
    }
    self.retire(id);
    self.record_activity(
      id,
      ExternalPluginActivity {
        reason: Some(version.clone()),
        ..ExternalPluginActivity::new(ActivityKind::Updated)
      },
    );
    log::info!("[ExternalPlugins] Updated {id} to {version} with new permissions");
    self.summary(id)
  }

  pub fn discard_update(&self, id: &str) -> Result<(), Error> {
    let mut registry = lock(&self.registry);
    let pending = registry
      .amend(id, |plugin| plugin.pending_update.take())?
      .ok_or_else(|| invalid("No update is waiting for approval"))?;
    let dir = registry.package_path(id, &pending.package_dir);
    drop(registry);
    if let Err(error) = fs::remove_dir_all(&dir) {
      log::warn!("[ExternalPlugins] Could not remove the discarded update of {id}: {error}");
    }
    self.notify(id);
    Ok(())
  }

  /// Deletes the plugin's storage. Staged snapshots and deployment records
  /// stay. The worker is stopped first and restarts on the next call.
  pub fn clear_data(&self, id: &str) -> Result<(), Error> {
    lock(&self.registry).update(id, |_| Ok(()))?;
    self.supervisor.terminate(id);
    let services = self.services(id);
    self.supervisor.exclusive(id, || services.storage.clear())?;
    self.record_activity(id, ExternalPluginActivity::new(ActivityKind::DataCleared));
    self.retire(id);
    Ok(())
  }

  /// Records the user's consent for every required request, with the file
  /// or folder and the profile the user picked in host UI. Each is required
  /// exactly when a request needs it.
  pub fn grant(
    &self,
    id: &str,
    expected_hash: &str,
    file: Option<&str>,
    profile: Option<&str>,
  ) -> Result<ExternalPluginSummary, Error> {
    let manifest = {
      let registry = lock(&self.registry);
      let plugin = registry.require(id)?;
      if plugin.archive_hash != expected_hash {
        return Err(invalid("The plugin changed; review its permissions again"));
      }
      plugin.manifest.clone()
    };
    let file = self.picked_file(&manifest, file)?;
    let profile = self.picked_profile(&manifest, profile)?;
    lock(&self.registry).update(id, |plugin| {
      if plugin.archive_hash != expected_hash || plugin.manifest != manifest {
        return Err(invalid(
          "The plugin changed while granting; review its permissions again",
        ));
      }
      plugin.grant = Some(StoredGrant {
        permissions: manifest.permissions.required.clone(),
        file,
        profile,
        granted_at: chrono::Utc::now().to_rfc3339(),
      });
      plugin.set_error(None);
      Ok(())
    })?;
    self.retire(id);
    self.record_activity(id, ExternalPluginActivity::new(ActivityKind::Granted));
    self.summary(id)
  }

  fn picked_file(
    &self,
    manifest: &PluginManifest,
    picked: Option<&str>,
  ) -> Result<Option<String>, Error> {
    let request = manifest.permissions.required(PermissionId::Files);
    let (
      Some(ExternalPluginPermission::Files {
        kind, extensions, ..
      }),
      Some(picked),
    ) = (request, picked)
    else {
      return match (request, picked) {
        (None, None) => Ok(None),
        (None, Some(_)) => Err(invalid("This plugin does not ask for a file or folder")),
        _ => Err(invalid("Select the file or folder this plugin asks for")),
      };
    };
    let canonical = canonical_pick(Path::new(picked), *kind)?;
    if *kind == ExternalPluginFileKind::File && !files::extension_allowed(extensions, &canonical) {
      return Err(invalid(format!(
        "Select a file ending in .{}",
        extensions.join(", .")
      )));
    }
    let root = fs::canonicalize(&self.root).unwrap_or_else(|_| self.root.clone());
    if canonical.starts_with(&root) || root.starts_with(&canonical) {
      return Err(invalid(
        "Select a location outside Deadlock Mod Manager's plugin storage",
      ));
    }
    Ok(Some(canonical.to_string_lossy().into_owned()))
  }

  fn picked_profile(
    &self,
    manifest: &PluginManifest,
    picked: Option<&str>,
  ) -> Result<Option<String>, Error> {
    let request = manifest
      .permissions
      .required(PermissionId::Mods)
      .filter(|request| request.needs_profile());
    let (Some(request), Some(folder)) = (request, picked) else {
      return match (request, picked) {
        (None, None) => Ok(None),
        (None, Some(_)) => Err(invalid("This plugin does not ask for a profile")),
        _ => Err(invalid("Select the profile this plugin asks for")),
      };
    };
    if !deploy::is_profile_folder(folder) {
      return Err(invalid("Invalid profile folder"));
    }
    if request.allows_mods(ExternalPluginModAccess::Install)
      && !deploy::is_dedicated_profile(folder)
    {
      return Err(invalid("Select a dedicated, non-default profile"));
    }
    self.adapter.validate_profile(folder)?;
    Ok(Some(folder.to_owned()))
  }

  pub fn revoke(&self, id: &str) -> Result<ExternalPluginSummary, Error> {
    lock(&self.registry).update(id, |plugin| {
      plugin.grant = None;
      plugin.enabled = false;
      Ok(())
    })?;
    self.retire(id);
    self.record_activity(id, ExternalPluginActivity::new(ActivityKind::Revoked));
    self.summary(id)
  }

  pub fn set_enabled(&self, id: &str, enabled: bool) -> Result<ExternalPluginSummary, Error> {
    lock(&self.registry).update(id, |plugin| {
      if enabled && plugin.needs_consent() {
        return Err(invalid(
          "Approve the plugin's permissions before enabling it",
        ));
      }
      plugin.enabled = enabled;
      if enabled {
        plugin.quarantined = false;
        plugin.set_error(None);
      }
      Ok(())
    })?;
    if enabled {
      self.supervisor.forget_crashes(id);
    }
    self.retire(id);
    self.summary(id)
  }

  /// Removes the package, its grant and its private data. Mods it deployed
  /// stay installed in their profile as ordinary local mods.
  pub fn remove(&self, id: &str) -> Result<(), Error> {
    self.retire(id);
    let removed = lock(&self.registry).remove(id)?;
    if removed.is_none() {
      return Err(invalid(format!("Plugin {id} is not installed")));
    }
    lock(&self.services).remove(id);
    lock(&self.last_ticks).remove(id);
    self.supervisor.forget(id);
    for dir in [self.root.join("packages").join(id), self.data_dir(id)] {
      if dir.exists()
        && let Err(error) = fs::remove_dir_all(&dir)
      {
        log::warn!(
          "[ExternalPlugins] Could not remove {}: {error}",
          dir.display()
        );
      }
    }
    log::info!("[ExternalPlugins] Removed {id}");
    Ok(())
  }

  fn quarantine(&self, id: &str, generation: u64, reason: &str) {
    let mut registry = lock(&self.registry);
    if registry
      .get(id)
      .is_none_or(|plugin| plugin.generation != generation)
    {
      return;
    }
    let message = format!("Stopped after repeated worker failures: {reason}");
    let result = registry.update(id, |plugin| {
      plugin.enabled = false;
      plugin.quarantined = true;
      plugin.set_error(Some(message.clone()));
      Ok(())
    });
    drop(registry);
    if let Err(error) = result {
      log::warn!("[ExternalPlugins] Could not quarantine {id}: {error}");
    }
    log::warn!("[ExternalPlugins] Quarantined {id}: {reason}");
    self.retire(id);
    self.record_activity(
      id,
      ExternalPluginActivity {
        reason: Some(message),
        ..ExternalPluginActivity::new(ActivityKind::Stopped)
      },
    );
  }

  /// A UI command from a verified plugin view session. Authentication
  /// failures are errors; everything after that is a JSON envelope.
  pub fn ui_call(
    &self,
    id: &str,
    generation: u64,
    command: &str,
    payload_json: &str,
  ) -> Result<String, SessionDenied> {
    let plugin = self.authorize(id, generation)?;
    if !is_valid_command(command) {
      return Ok(abi::error_envelope(
        "invalid_command",
        "Unknown plugin command",
      ));
    }
    if payload_json.len() > MAX_UI_PAYLOAD_BYTES {
      return Ok(abi::error_envelope(
        "payload_too_large",
        "Payload exceeds 64 KiB",
      ));
    }
    let Ok(payload) = serde_json::from_str::<serde_json::Value>(payload_json) else {
      return Ok(abi::error_envelope(
        "invalid_payload",
        "Payload is not JSON",
      ));
    };
    if let Some(method) = command.strip_prefix("host.events.") {
      let request = serde_json::json!({ "method": format!("events.{method}"), "params": payload });
      return Ok(host_api::handle(self, &plugin, &request.to_string()));
    }
    if plugin.manifest.backend.is_none() {
      return Ok(abi::error_envelope(
        "no_backend",
        "This plugin has no backend",
      ));
    }
    let input = serde_json::json!({ "command": command, "payload": payload }).to_string();
    match self.supervisor.call(self, &plugin, &input, true) {
      CallOutcome::Envelope { output, .. } => Ok(output),
      CallOutcome::Denied(denied) => Err(denied),
      CallOutcome::Busy => Ok(abi::error_envelope("busy", "Plugin is busy")),
    }
  }

  fn tick(&self, plugin: &ActivePlugin) {
    match self.supervisor.call(self, plugin, TICK_INPUT, false) {
      CallOutcome::Envelope { host_failure, .. } => {
        if host_failure.is_none() {
          lock(&self.last_ticks).insert(plugin.id.clone(), chrono::Utc::now().to_rfc3339());
        }
        lock(&self.registry).note_error(&plugin.id, plugin.generation, host_failure);
      }
      CallOutcome::Busy | CallOutcome::Denied(_) => {}
    }
  }

  /// Runs `tick` for every enabled backend on a fixed schedule, one call per
  /// plugin at a time, skipping plugins whose worker is still busy.
  pub fn start_scheduler(self: &Arc<Self>) {
    let host = Arc::downgrade(self);
    let spawned = std::thread::Builder::new()
      .name("external-plugin-ticks".into())
      .spawn(move || {
        loop {
          std::thread::sleep(TICK_INTERVAL);
          let Some(host) = host.upgrade() else {
            break;
          };
          let active: Vec<ActivePlugin> = {
            let registry = lock(&host.registry);
            registry
              .list()
              .filter_map(|plugin| registry.active(plugin).ok())
              .filter(|plugin| plugin.manifest.backend.is_some())
              .collect()
          };
          for plugin in active {
            if !lock(&host.ticking).insert(plugin.id.clone()) {
              continue;
            }
            let worker_host = Arc::clone(&host);
            let spawned = std::thread::Builder::new()
              .name(format!("external-plugin-tick-{}", plugin.id))
              .spawn(move || {
                worker_host.tick(&plugin);
                lock(&worker_host.ticking).remove(&plugin.id);
              });
            if let Err(error) = spawned {
              log::warn!("[ExternalPlugins] Could not schedule a tick: {error}");
            }
          }
        }
      });
    if let Err(error) = spawned {
      log::error!("[ExternalPlugins] Could not start the tick scheduler: {error}");
    }
  }
}

/// Canonicalizes a picked path. A folder must exist; a file may not exist
/// yet, but its folder must.
fn canonical_pick(path: &Path, kind: ExternalPluginFileKind) -> Result<PathBuf, Error> {
  if !path.is_absolute() {
    return Err(invalid("Select an absolute path"));
  }
  match kind {
    ExternalPluginFileKind::Folder => {
      let canonical = fs::canonicalize(path).map_err(|_| invalid("That folder does not exist"))?;
      if !canonical.is_dir() {
        return Err(invalid("Select a folder"));
      }
      Ok(canonical)
    }
    ExternalPluginFileKind::File if path.exists() => {
      let canonical = fs::canonicalize(path)?;
      if canonical.is_dir() {
        return Err(invalid("Select a file, not a folder"));
      }
      Ok(canonical)
    }
    ExternalPluginFileKind::File => {
      let parent = path
        .parent()
        .ok_or_else(|| invalid("Select the file's folder"))?;
      let name = path
        .file_name()
        .ok_or_else(|| invalid("Select a file name"))?;
      let parent = fs::canonicalize(parent).map_err(|_| invalid("That folder does not exist"))?;
      Ok(parent.join(name))
    }
  }
}

#[cfg(test)]
mod tests;
