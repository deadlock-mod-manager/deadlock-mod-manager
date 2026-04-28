use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const STABLE_ENDPOINT: &str = "https://github.com/deadlock-mod-manager/deadlock-mod-manager/releases/latest/download/latest.json";
const NIGHTLY_ENDPOINT: &str = "https://github.com/deadlock-mod-manager/deadlock-mod-manager/releases/download/nightly/latest.json";

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
  dirs::config_dir().map(|config_dir| config_dir.join(identifier).join(CHANNEL_FILE))
}

pub fn resolve_channel(identifier: &str) -> UpdateChannel {
  channel_config_path(identifier)
    .and_then(|path| std::fs::read_to_string(&path).ok())
    .and_then(|contents| serde_json::from_str::<ChannelConfig>(&contents).ok())
    .map(|cfg| cfg.channel)
    .unwrap_or(UpdateChannel::Stable)
}

pub fn apply_to_context(context: &mut tauri::Context) {
  let identifier = context.config().identifier.clone();
  let channel = resolve_channel(&identifier);

  let endpoint = match channel {
    UpdateChannel::Stable => STABLE_ENDPOINT,
    UpdateChannel::Nightly => NIGHTLY_ENDPOINT,
  };

  log::info!("Updater channel resolved: {channel:?}, endpoint: {endpoint}");

  if let Some(updater) = context.config_mut().plugins.0.get_mut("updater") {
    updater["endpoints"] = serde_json::json!([endpoint]);
  }
}

#[tauri::command]
pub fn get_update_channel(app: tauri::AppHandle) -> String {
  let channel = resolve_channel(&app.config().identifier);
  match channel {
    UpdateChannel::Stable => "stable".to_string(),
    UpdateChannel::Nightly => "nightly".to_string(),
  }
}

#[tauri::command]
pub fn set_update_channel(app: tauri::AppHandle, channel: String) -> Result<(), String> {
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
