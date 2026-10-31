//! Trusted desktop producers for the plugin host's typed observation journal.
pub mod downloads;
pub mod game;

use dmm_plugin_runtime::{
  PluginHost,
  event_contract::{HostEventData, ModOperation, Profile},
};
use std::sync::{
  Arc, OnceLock, Weak,
  atomic::{AtomicU64, Ordering},
};

static HOST: OnceLock<Weak<PluginHost>> = OnceLock::new();
static NEXT_OPERATION: AtomicU64 = AtomicU64::new(1);

pub fn init(host: &Arc<PluginHost>, app: crate::app_runtime::AppHandle) {
  let _ = HOST.set(Arc::downgrade(host));
  game::start(host, app);
}

pub(super) fn host() -> Option<Arc<PluginHost>> {
  HOST.get()?.upgrade()
}

pub fn publish(event: HostEventData, operation_id: Option<String>) {
  if let Some(host) = host() {
    host.publish_event(event, operation_id);
  }
}

pub fn profile_created(folder: &str) {
  publish(
    HostEventData::ProfileCreated(Profile {
      folder: folder.into(),
    }),
    None,
  );
}

pub fn profile_activated(folder: Option<&str>) {
  publish(
    HostEventData::ProfileActivated(Profile {
      folder: folder.unwrap_or("default").into(),
    }),
    None,
  );
}

pub fn profile_removed(folder: &str) {
  publish(
    HostEventData::ProfileRemoved(Profile {
      folder: folder.into(),
    }),
    None,
  );
}

pub fn mod_disabled(mod_id: &str, profile: Option<&str>) {
  publish(HostEventData::ModDisabled(mod_data(mod_id, profile)), None);
}

pub fn mod_removed(mod_id: &str, profile: Option<&str>) {
  publish(HostEventData::ModRemoved(mod_data(mod_id, profile)), None);
}

pub fn mod_updated(mod_id: &str, profile: Option<&str>) {
  publish(HostEventData::ModUpdated(mod_data(mod_id, profile)), None);
}

fn mod_data(mod_id: &str, profile: Option<&str>) -> ModOperation {
  ModOperation {
    mod_id: mod_id.into(),
    profile: profile.unwrap_or("default").into(),
  }
}

pub struct ModInstallObservation {
  data: ModOperation,
  operation: String,
  completed: bool,
}

impl ModInstallObservation {
  pub fn start(mod_id: &str, profile: Option<&str>) -> Self {
    let observation = Self {
      data: mod_data(mod_id, profile),
      operation: format!("mod:{}", NEXT_OPERATION.fetch_add(1, Ordering::Relaxed)),
      completed: false,
    };
    publish(
      HostEventData::ModInstallStarted(observation.data.clone()),
      Some(observation.operation.clone()),
    );
    observation
  }

  pub fn complete(mut self) {
    self.completed = true;
    publish(
      HostEventData::ModInstallCompleted(self.data.clone()),
      Some(self.operation.clone()),
    );
  }
}

impl Drop for ModInstallObservation {
  fn drop(&mut self) {
    if !self.completed {
      publish(
        HostEventData::ModInstallFailed(self.data.clone()),
        Some(self.operation.clone()),
      );
    }
  }
}
