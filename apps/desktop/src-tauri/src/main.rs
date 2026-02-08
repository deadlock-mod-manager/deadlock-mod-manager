// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "linux")]
fn should_enable_linux_gpu_optimization() -> bool {
  let cli_args = desktop_lib::cli::get_cli_args();

  if cli_args.disable_linux_gpu_optimization {
    eprintln!("[GPU Opt] Disabled via --disable-linux-gpu-optimization CLI flag");
    return false;
  }

  let data_dir = match std::env::var_os("XDG_DATA_HOME")
    .map(std::path::PathBuf::from)
    .or_else(|| {
      std::env::var_os("HOME")
        .map(|home| std::path::PathBuf::from(home).join(".local").join("share"))
    }) {
    Some(dir) => dir,
    None => return true,
  };

  let store_path = data_dir
    .join("dev.stormix.deadlock-mod-manager")
    .join("state.json");

  eprintln!("[GPU Opt] Reading state file: {}", store_path.display());

  let content = match std::fs::read_to_string(&store_path) {
    Ok(c) => c,
    Err(e) => {
      if e.kind() != std::io::ErrorKind::NotFound {
        eprintln!("[GPU Opt] Failed to read state file: {}", e);
      }
      return true;
    }
  };

  let store_json = match serde_json::from_str::<serde_json::Value>(&content) {
    Ok(json) => json,
    Err(e) => {
      eprintln!("[GPU Opt] Failed to parse state.json: {}", e);
      return true;
    }
  };

  let config_str = match store_json.get("local-config").and_then(|v| v.as_str()) {
    Some(s) => s,
    None => return true,
  };

  let config_json = match serde_json::from_str::<serde_json::Value>(config_str) {
    Ok(json) => json,
    Err(e) => {
      eprintln!("[GPU Opt] Failed to parse local-config: {}", e);
      return true;
    }
  };

  let enabled = config_json
    .get("state")
    .and_then(|state| state.get("linuxGpuOptimization"))
    .and_then(|v| v.as_bool())
    .unwrap_or(true);

  if !enabled {
    eprintln!("[GPU Opt] Disabled via settings");
  }

  enabled
}

fn main() {
  let _ = fix_path_env::fix();

  desktop_lib::cli::get_cli_args();

  #[cfg(target_os = "linux")]
  {
    eprintln!("[GPU Opt] Checking if Linux GPU optimization should be enabled");
    if should_enable_linux_gpu_optimization() {
      eprintln!("[GPU Opt] Setting WebKit environment variables for improved compatibility");
      unsafe {
        std::env::set_var("__NV_PRIME_RENDER_OFFLOAD", "1");
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        std::env::set_var("NODEVICE_SELECT", "1");
        std::env::set_var("WEBKIT_FORCE_HARDWARE_ACCELERATION", "1");
      }
    }
  }

  desktop_lib::run()
}
