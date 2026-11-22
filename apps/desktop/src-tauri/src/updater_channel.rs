use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::app_runtime::{AppHandle, AppRuntime};

// API first: Kaspersky flags processes that poll GitHub release downloads
// (NetTool.GitHubGetRepo.HTTP.C&C). GitHub stays as the fallback.
const STABLE_ENDPOINTS: [&str; 2] = [
  "https://api.deadlockmods.app/updates/stable/latest.json",
  "https://github.com/deadlock-mod-manager/deadlock-mod-manager/releases/latest/download/latest.json",
];
const NIGHTLY_ENDPOINTS: [&str; 2] = [
  "https://api.deadlockmods.app/updates/nightly/latest.json",
  "https://github.com/deadlock-mod-manager/deadlock-mod-manager/releases/download/nightly/latest.json",
];

const CEF_STABLE_ENDPOINTS: [&str; 2] = [
  "https://api.deadlockmods.app/updates/stable/latest-cef.json",
  "https://github.com/deadlock-mod-manager/deadlock-mod-manager/releases/latest/download/latest-cef.json",
];
const CEF_NIGHTLY_ENDPOINTS: [&str; 2] = [
  "https://api.deadlockmods.app/updates/nightly/latest-cef.json",
  "https://github.com/deadlock-mod-manager/deadlock-mod-manager/releases/download/nightly/latest-cef.json",
];

pub(crate) fn endpoints_for(channel: &UpdateChannel) -> &'static [&'static str] {
  match channel {
    UpdateChannel::Stable => {
      if cfg!(feature = "cef") {
        &CEF_STABLE_ENDPOINTS
      } else {
        &STABLE_ENDPOINTS
      }
    }
    UpdateChannel::Nightly => {
      if cfg!(feature = "cef") {
        &CEF_NIGHTLY_ENDPOINTS
      } else {
        &NIGHTLY_ENDPOINTS
      }
    }
  }
}

const CHANNEL_FILE: &str = "update-channel.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum UpdateChannel {
  Stable,
  Nightly,
}

#[derive(Debug, Serialize, Deserialize)]
struct ChannelConfig {
  channel: UpdateChannel,
}

fn channel_config_path(identifier: &str) -> Option<PathBuf> {
  crate::runtime_environment::app_config_dir(identifier).map(|path| path.join(CHANNEL_FILE))
}

pub fn resolve_channel(identifier: &str) -> UpdateChannel {
  channel_config_path(identifier)
    .and_then(|path| std::fs::read_to_string(&path).ok())
    .and_then(|contents| serde_json::from_str::<ChannelConfig>(&contents).ok())
    .map(|cfg| cfg.channel)
    .unwrap_or(UpdateChannel::Stable)
}

pub fn apply_to_context(context: &mut tauri::Context<AppRuntime>) {
  if let Some(configuration) = crate::runtime_environment::current().e2e() {
    let endpoints = match configuration.integrations.updater {
      crate::runtime_environment::UpdaterPolicy::Disabled => serde_json::json!([]),
      crate::runtime_environment::UpdaterPolicy::Fixture => serde_json::json!([format!(
        "{}/updater/latest.json",
        configuration
          .endpoint(crate::runtime_environment::ServiceName::Downloads)
          .trim_end_matches('/')
      )]),
    };
    if let Some(updater) = context.config_mut().plugins.0.get_mut("updater") {
      updater["endpoints"] = endpoints;
    }
    return;
  }

  let identifier = context.config().identifier.clone();
  let channel = resolve_channel(&identifier);

  let endpoints = endpoints_for(&channel);

  log::info!("Updater channel resolved: {channel:?}, endpoints: {endpoints:?}");

  if let Some(updater) = context.config_mut().plugins.0.get_mut("updater") {
    updater["endpoints"] = serde_json::json!(endpoints);
  }
}

#[tauri::command]
pub fn get_update_channel(app: AppHandle) -> String {
  let channel = resolve_channel(&app.config().identifier);
  match channel {
    UpdateChannel::Stable => "stable".to_string(),
    UpdateChannel::Nightly => "nightly".to_string(),
  }
}

#[tauri::command]
pub fn set_update_channel(app: AppHandle, channel: String) -> Result<(), String> {
  let identifier = &app.config().identifier;

  let parsed = match channel.as_str() {
    "stable" => UpdateChannel::Stable,
    "nightly" => UpdateChannel::Nightly,
    _ => return Err(format!("Invalid channel: {channel}")),
  };

  let path = channel_config_path(identifier)
    .ok_or_else(|| "Could not determine config directory".to_string())?;

  if let Some(parent) = path.parent() {
    std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create config dir: {e}"))?;
  }

  let config = ChannelConfig { channel: parsed };
  let contents =
    serde_json::to_string_pretty(&config).map_err(|e| format!("Failed to serialize: {e}"))?;

  std::fs::write(&path, contents).map_err(|e| format!("Failed to write channel config: {e}"))?;

  log::info!("Updater channel preference saved: {channel}");
  Ok(())
}
