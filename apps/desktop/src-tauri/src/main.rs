// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "linux")]
fn is_nvidia_gpu_present() -> bool {
  if std::path::Path::new("/proc/driver/nvidia/version").exists() {
    eprintln!("[GPU Compat] Detected NVIDIA driver via /proc/driver/nvidia/version");
    return true;
  }

  if let Ok(entries) = std::fs::read_dir("/sys/bus/pci/devices") {
    for entry in entries.flatten() {
      let vendor_path = entry.path().join("vendor");
      if let Ok(vendor) = std::fs::read_to_string(&vendor_path)
        && vendor.trim() == "0x10de"
      {
        eprintln!(
          "[GPU Compat] Detected NVIDIA PCI device at {}",
          entry.path().display()
        );
        return true;
      }
    }
  }

  eprintln!("[GPU Compat] No NVIDIA GPU detected");
  false
}

#[cfg(target_os = "linux")]
fn gpu_compat_enabled(
  setting: &str,
  cli_disabled: bool,
  is_wry: bool,
  nvidia_present: bool,
) -> bool {
  is_wry
    && !cli_disabled
    && match setting {
      "on" => true,
      "off" => false,
      _ => nvidia_present,
    }
}

#[cfg(target_os = "linux")]
fn read_gpu_compat_setting() -> String {
  let data_dir = match std::env::var_os("XDG_DATA_HOME")
    .map(std::path::PathBuf::from)
    .or_else(|| {
      std::env::var_os("HOME")
        .map(|home| std::path::PathBuf::from(home).join(".local").join("share"))
    }) {
    Some(dir) => dir,
    None => return "auto".to_string(),
  };

  let store_path = data_dir
    .join("dev.stormix.deadlock-mod-manager")
    .join("state.json");

  eprintln!("[GPU Compat] Reading state file: {}", store_path.display());

  let content = match std::fs::read_to_string(&store_path) {
    Ok(c) => c,
    Err(e) => {
      if e.kind() != std::io::ErrorKind::NotFound {
        eprintln!("[GPU Compat] Failed to read state file: {}", e);
      }
      return "auto".to_string();
    }
  };

  let store_json = match serde_json::from_str::<serde_json::Value>(&content) {
    Ok(json) => json,
    Err(e) => {
      eprintln!("[GPU Compat] Failed to parse state.json: {}", e);
      return "auto".to_string();
    }
  };

  let config_str = match store_json.get("local-config").and_then(|v| v.as_str()) {
    Some(s) => s,
    None => return "auto".to_string(),
  };

  let config_json = match serde_json::from_str::<serde_json::Value>(config_str) {
    Ok(json) => json,
    Err(e) => {
      eprintln!("[GPU Compat] Failed to parse local-config: {}", e);
      return "auto".to_string();
    }
  };

  let value = config_json
    .get("state")
    .and_then(|state| state.get("linuxGpuOptimization"));

  match value {
    Some(serde_json::Value::String(s)) => s.clone(),
    // Legacy boolean support for users who haven't migrated yet
    Some(serde_json::Value::Bool(true)) => "auto".to_string(),
    Some(serde_json::Value::Bool(false)) => "off".to_string(),
    _ => "auto".to_string(),
  }
}

#[cfg(target_os = "linux")]
fn should_enable_gpu_compat_workaround() -> bool {
  let cli_args = desktop_lib::cli::get_cli_args();
  let is_wry = cfg!(not(feature = "cef"));

  if !is_wry {
    eprintln!("[GPU Compat] Skipping WebKit workaround for CEF runtime");
    return false;
  }

  let cli_disabled = cli_args.disable_linux_gpu_optimization;
  if cli_disabled {
    eprintln!("[GPU Compat] Disabled via --disable-linux-gpu-optimization CLI flag");
    return false;
  }

  let setting = read_gpu_compat_setting();
  eprintln!("[GPU Compat] Setting value: '{setting}'");

  match setting.as_str() {
    "on" => {
      eprintln!("[GPU Compat] Forced ON via settings");
      gpu_compat_enabled(setting.as_str(), cli_disabled, is_wry, false)
    }
    "off" => {
      eprintln!("[GPU Compat] Forced OFF via settings");
      gpu_compat_enabled(setting.as_str(), cli_disabled, is_wry, false)
    }
    _ => {
      let session_type = std::env::var("XDG_SESSION_TYPE").unwrap_or_default();
      eprintln!("[GPU Compat] Auto-detecting NVIDIA on {session_type}...");
      let nvidia_present = is_nvidia_gpu_present();
      gpu_compat_enabled(setting.as_str(), cli_disabled, is_wry, nvidia_present)
    }
  }
}

#[cfg_attr(feature = "cef", tauri::cef_entry_point)]
fn main() {
  let _ = fix_path_env::fix();

  desktop_lib::cli::get_cli_args();

  #[cfg(target_os = "linux")]
  {
    eprintln!("[GPU Compat] Checking if WebKit DMA-BUF workaround should be enabled");
    if should_enable_gpu_compat_workaround() {
      eprintln!("[GPU Compat] Enabling WebKit workaround for NVIDIA compatibility");
      unsafe {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
      }
    }
  }

  desktop_lib::run()
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
  use super::gpu_compat_enabled;

  #[test]
  fn gpu_compat_is_never_enabled_for_cef() {
    assert!(!gpu_compat_enabled("on", false, false, true));
  }

  #[test]
  fn cli_override_disables_all_wry_modes() {
    assert!(!gpu_compat_enabled("on", true, true, true));
  }

  #[test]
  fn forced_modes_override_gpu_detection_on_wry() {
    assert!(gpu_compat_enabled("on", false, true, false));
    assert!(!gpu_compat_enabled("off", false, true, true));
  }

  #[test]
  fn auto_mode_follows_nvidia_detection_on_wry() {
    assert!(gpu_compat_enabled("auto", false, true, true));
    assert!(!gpu_compat_enabled("auto", false, true, false));
    assert!(gpu_compat_enabled("invalid", false, true, true));
  }
}
