use serde::{Deserialize, Serialize};
use std::path::PathBuf;
#[cfg(target_os = "linux")]
use std::process::Command;

use crate::app_runtime::{AppHandle, AppRuntime};
use crate::update_target::{
  Architecture, InstallationStrategy, InstallerFormat, OperatingSystem, RuntimeKind, UpdateChannel,
  UpdateTarget, resolve_update_target,
};

const CHANNEL_FILE: &str = "update-channel.json";
const FLATPAK_UPDATE_VERIFICATION_FILE: &str =
  "/app/share/deadlock-mod-manager/self-update-verified";

#[derive(Debug, Serialize, Deserialize)]
struct ChannelConfig {
  channel: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTargetInfo {
  channel: &'static str,
  runtime: &'static str,
  operating_system: &'static str,
  architecture: &'static str,
  installer: &'static str,
  installation_strategy: &'static str,
  manifest_target: String,
  flatpak_asset: Option<&'static str>,
}

fn channel_config_path(identifier: &str) -> Option<PathBuf> {
  dirs::config_dir().map(|config_dir| config_dir.join(identifier).join(CHANNEL_FILE))
}

pub fn resolve_channel(identifier: &str) -> UpdateChannel {
  channel_config_path(identifier)
    .and_then(|path| std::fs::read_to_string(&path).ok())
    .and_then(|contents| serde_json::from_str::<ChannelConfig>(&contents).ok())
    .and_then(|config| match config.channel.as_str() {
      "stable" => Some(UpdateChannel::Stable),
      "nightly" => Some(UpdateChannel::Nightly),
      _ => None,
    })
    .unwrap_or(UpdateChannel::Stable)
}

fn runtime_kind() -> RuntimeKind {
  match crate::commands::app::get_runtime_kind() {
    "cef" => RuntimeKind::Cef,
    _ => RuntimeKind::Wry,
  }
}

fn operating_system() -> OperatingSystem {
  if cfg!(target_os = "windows") {
    OperatingSystem::Windows
  } else if cfg!(target_os = "linux") {
    OperatingSystem::Linux
  } else {
    OperatingSystem::Unsupported
  }
}

fn architecture() -> Architecture {
  if cfg!(target_arch = "x86_64") {
    Architecture::X86_64
  } else if cfg!(target_arch = "aarch64") {
    Architecture::Aarch64
  } else {
    Architecture::Unsupported
  }
}

#[cfg(target_os = "linux")]
fn installer_from_marker(marker: &str) -> Option<InstallerFormat> {
  match marker {
    "deb" => Some(InstallerFormat::Deb),
    "rpm" => Some(InstallerFormat::Rpm),
    "flatpak" => Some(InstallerFormat::Flatpak),
    "aur" => Some(InstallerFormat::Aur),
    "nix" => Some(InstallerFormat::Nix),
    _ => None,
  }
}

#[cfg(target_os = "linux")]
fn package_owns_executable(
  program: &str,
  arguments: &[&str],
  executable: &std::path::Path,
) -> bool {
  Command::new(program)
    .args(arguments)
    .arg(executable)
    .output()
    .is_ok_and(|output| output.status.success())
}

#[cfg(target_os = "linux")]
fn linux_installer_format() -> InstallerFormat {
  if std::env::var_os("FLATPAK_ID").is_some() {
    return InstallerFormat::Flatpak;
  }

  if let Ok(marker) = std::env::var("DMM_INSTALLER_FORMAT")
    && let Some(installer) = installer_from_marker(&marker)
  {
    return installer;
  }

  let Ok(executable) = std::env::current_exe() else {
    return InstallerFormat::Unknown;
  };

  if executable.starts_with("/nix/store") {
    return InstallerFormat::Nix;
  }

  if package_owns_executable("dpkg-query", &["--search"], &executable) {
    return InstallerFormat::Deb;
  }
  if package_owns_executable("rpm", &["--query", "--file"], &executable) {
    return InstallerFormat::Rpm;
  }
  if package_owns_executable("pacman", &["--query", "--owns"], &executable) {
    return InstallerFormat::Aur;
  }

  InstallerFormat::Unknown
}

fn installer_format() -> InstallerFormat {
  #[cfg(target_os = "windows")]
  {
    InstallerFormat::Nsis
  }

  #[cfg(target_os = "linux")]
  {
    linux_installer_format()
  }

  #[cfg(not(any(target_os = "windows", target_os = "linux")))]
  {
    InstallerFormat::Unknown
  }
}

fn flatpak_self_update_verified(runtime: RuntimeKind, installer: InstallerFormat) -> bool {
  if installer != InstallerFormat::Flatpak {
    return false;
  }

  let expected_runtime = match runtime {
    RuntimeKind::Wry => "wry",
    RuntimeKind::Cef => "cef",
  };

  std::fs::read_to_string(FLATPAK_UPDATE_VERIFICATION_FILE)
    .is_ok_and(|contents| contents.trim() == expected_runtime)
}

fn resolved_update_target(identifier: &str) -> UpdateTarget {
  let runtime = runtime_kind();
  let installer = installer_format();
  resolve_update_target(
    resolve_channel(identifier),
    runtime,
    operating_system(),
    architecture(),
    installer,
    flatpak_self_update_verified(runtime, installer),
  )
}

fn update_target_info(target: UpdateTarget) -> UpdateTargetInfo {
  UpdateTargetInfo {
    channel: match target.channel {
      UpdateChannel::Stable => "stable",
      UpdateChannel::Nightly => "nightly",
    },
    runtime: match target.runtime {
      RuntimeKind::Wry => "wry",
      RuntimeKind::Cef => "cef",
    },
    operating_system: match target.operating_system {
      OperatingSystem::Windows => "windows",
      OperatingSystem::Linux => "linux",
      OperatingSystem::Unsupported => "unsupported",
    },
    architecture: match target.architecture {
      Architecture::X86_64 => "x86_64",
      Architecture::Aarch64 => "aarch64",
      Architecture::Unsupported => "unsupported",
    },
    installer: match target.installer {
      InstallerFormat::Nsis => "nsis",
      InstallerFormat::Deb => "deb",
      InstallerFormat::Rpm => "rpm",
      InstallerFormat::Flatpak => "flatpak",
      InstallerFormat::Aur => "aur",
      InstallerFormat::Nix => "nix",
      InstallerFormat::Unknown => "unknown",
    },
    installation_strategy: match target.installation_strategy {
      InstallationStrategy::Native => "native",
      InstallationStrategy::Flatpak => "flatpak",
      InstallationStrategy::PackageManager => "packageManager",
      InstallationStrategy::Unsupported => "unsupported",
    },
    manifest_target: target.manifest_target,
    flatpak_asset: target.flatpak_asset,
  }
}

pub fn apply_to_context(context: &mut tauri::Context<AppRuntime>) {
  let identifier = context.config().identifier.clone();
  let target = resolved_update_target(&identifier);
  let endpoint = target.endpoint;

  log::info!(
    "Updater target resolved: channel={:?}, runtime={:?}, os={:?}, arch={:?}, installer={:?}, manifest_target={}, endpoint={endpoint}",
    target.channel,
    target.runtime,
    target.operating_system,
    target.architecture,
    target.installer,
    target.manifest_target,
  );

  if let Some(updater) = context.config_mut().plugins.0.get_mut("updater") {
    updater["endpoints"] = serde_json::json!([endpoint]);
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

  let config = ChannelConfig {
    channel: match parsed {
      UpdateChannel::Stable => "stable".to_string(),
      UpdateChannel::Nightly => "nightly".to_string(),
    },
  };
  let contents =
    serde_json::to_string_pretty(&config).map_err(|e| format!("Failed to serialize: {e}"))?;

  std::fs::write(&path, contents).map_err(|e| format!("Failed to write channel config: {e}"))?;

  log::info!("Updater channel preference saved: {channel}");
  Ok(())
}

#[tauri::command]
pub fn get_update_target(app: AppHandle) -> UpdateTargetInfo {
  update_target_info(resolved_update_target(&app.config().identifier))
}
