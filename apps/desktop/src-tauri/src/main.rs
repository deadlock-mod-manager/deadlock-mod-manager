// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(all(test, target_os = "linux"))]
mod linux_gpu_tests;

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

/// Kernel drivers of the GPUs that have a connected display, e.g. `["amdgpu"]`.
#[cfg(target_os = "linux")]
fn display_drivers(drm_dir: &std::path::Path) -> Vec<String> {
  let mut drivers = Vec::new();
  let Ok(entries) = std::fs::read_dir(drm_dir) else {
    return drivers;
  };

  for entry in entries.flatten() {
    let name = entry.file_name().to_string_lossy().into_owned();
    // Connectors are named like `card1-eDP-1`; the card itself is `card1`.
    let Some((card, _)) = name.split_once('-') else {
      continue;
    };
    if !card.starts_with("card") {
      continue;
    }
    let connected = std::fs::read_to_string(entry.path().join("status"))
      .is_ok_and(|status| status.trim() == "connected");
    if !connected {
      continue;
    }
    if let Ok(driver) = std::fs::read_link(drm_dir.join(card).join("device").join("driver"))
      && let Some(driver) = driver.file_name()
    {
      let driver = driver.to_string_lossy().into_owned();
      if !drivers.contains(&driver) {
        drivers.push(driver);
      }
    }
  }

  drivers
}

#[cfg(target_os = "linux")]
fn nvidia_prime_offload_requested(
  offload: Option<&std::ffi::OsStr>,
  vendor: Option<&std::ffi::OsStr>,
  provider: Option<&std::ffi::OsStr>,
) -> bool {
  offload.is_some_and(|value| value == "1")
    || vendor.is_some_and(|value| value == "nvidia")
    || provider.is_some_and(|value| !value.is_empty())
}

/// Detect NVIDIA rendering from explicit offload requests or connected displays.
#[cfg(target_os = "linux")]
fn nvidia_renders_webview() -> bool {
  let prime_offload = nvidia_prime_offload_requested(
    std::env::var_os("__NV_PRIME_RENDER_OFFLOAD").as_deref(),
    std::env::var_os("__GLX_VENDOR_LIBRARY_NAME").as_deref(),
    std::env::var_os("__NV_PRIME_RENDER_OFFLOAD_PROVIDER").as_deref(),
  );
  if prime_offload {
    eprintln!("[GPU Compat] NVIDIA PRIME render offload requested");
    return true;
  }

  let drivers = display_drivers(std::path::Path::new("/sys/class/drm"));
  if drivers.is_empty() {
    // nvidia-drm without modeset exposes no connectors, so fall back to presence.
    eprintln!("[GPU Compat] Could not tell which GPU drives the displays");
    return is_nvidia_gpu_present();
  }

  eprintln!("[GPU Compat] Displays are driven by {drivers:?}");
  drivers
    .iter()
    .any(|driver| driver == "nvidia" || driver == "nouveau")
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
  let setting = read_gpu_compat_setting();
  eprintln!("[GPU Compat] Setting value: '{setting}'");

  gpu_compat_workaround_enabled(
    cli_args.disable_linux_gpu_optimization,
    &setting,
    std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").as_deref(),
    nvidia_renders_webview,
  )
}

#[cfg(target_os = "linux")]
fn gpu_compat_workaround_enabled(
  disabled_by_cli: bool,
  setting: &str,
  dmabuf_override: Option<&std::ffi::OsStr>,
  detect_nvidia: impl FnOnce() -> bool,
) -> bool {
  if disabled_by_cli {
    eprintln!("[GPU Compat] Disabled via --disable-linux-gpu-optimization CLI flag");
    return false;
  }

  match setting {
    "on" => {
      eprintln!("[GPU Compat] Forced ON via settings");
      true
    }
    "off" => {
      eprintln!("[GPU Compat] Forced OFF via settings");
      false
    }
    _ => {
      if let Some(value) = dmabuf_override {
        eprintln!(
          "[GPU Compat] WEBKIT_DISABLE_DMABUF_RENDERER={value:?} set in the environment, leaving it"
        );
        return false;
      }
      let session_type = std::env::var("XDG_SESSION_TYPE").unwrap_or_default();
      eprintln!("[GPU Compat] Auto-detecting NVIDIA on {session_type}...");
      detect_nvidia()
    }
  }
}

#[cfg_attr(feature = "cef", tauri_runtime_cef::cef_entry_point)]
fn main() {
  let _ = fix_path_env::fix();

  desktop_lib::cli::get_cli_args();
  if let Err(error) = desktop_lib::runtime_environment::initialize() {
    eprintln!("[E2E] Refusing to start: {error}");
    std::process::exit(2);
  }
  desktop_lib::runtime_environment::configure_process();

  #[cfg(target_os = "linux")]
  {
    eprintln!("[GPU Compat] Checking if WebKit DMA-BUF workaround should be enabled");
    if should_enable_gpu_compat_workaround() {
      eprintln!("[GPU Compat] Enabling WebKit workaround for NVIDIA + Wayland compatibility");
      unsafe {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
      }
    }
  }

  desktop_lib::run()
}
