//! Desktop adapters for the independently testable plugin runtime.
pub mod download;
#[cfg(not(feature = "cef"))]
pub mod frames;
pub mod network;
pub mod profiles;

use dmm_plugin_runtime::ExternalPluginActivity;
use serde::Serialize;
use ts_rs::TS;

/// Emitted with a plugin id when it is installed, disabled, revoked, updated,
/// removed or stopped after repeated crashes, or when its pending update
/// changes, so the app refreshes its plugin views.
pub const CHANGED_EVENT: &str = "external-plugins-changed";

/// Emitted with [`ExternalPluginBlockedEvent`] when the host refuses a
/// plugin's hostcall for permission or scope reasons.
pub const BLOCKED_EVENT: &str = "external-plugins-blocked";

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ExternalPluginBlockedEvent {
  pub plugin_id: String,
  pub activity: ExternalPluginActivity,
}

/// Emitted with [`ExternalPluginNotificationEvent`] when a plugin shows a
/// notification within its rate limit.
pub const NOTIFICATION_EVENT: &str = "external-plugins-notification";

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ExternalPluginNotificationEvent {
  pub plugin_id: String,
  pub title: String,
  pub body: String,
}

impl From<dmm_plugin_runtime::Error> for crate::errors::Error {
  fn from(error: dmm_plugin_runtime::Error) -> Self {
    match error {
      dmm_plugin_runtime::Error::Io(error) => Self::Io(error),
      dmm_plugin_runtime::Error::Zip(error) => Self::Zip(error),
      dmm_plugin_runtime::Error::InvalidInput(message) => Self::InvalidInput(message),
      dmm_plugin_runtime::Error::Host {
        code: "game_running",
        ..
      } => Self::GameRunning,
      dmm_plugin_runtime::Error::Host { message, .. } => Self::BackgroundTaskFailed(message),
    }
  }
}

#[cfg(test)]
mod bindings {
  use ts_rs::TS;

  #[test]
  fn export_bindings_external_plugins() {
    dmm_plugin_runtime::ExternalPluginSummary::export_all().unwrap();
    dmm_plugin_runtime::ExternalPluginStatus::export_all().unwrap();
    dmm_plugin_runtime::ExternalPluginActivity::export_all().unwrap();
    dmm_plugin_runtime::ExternalPluginPermissionId::export_all().unwrap();
  }
}
