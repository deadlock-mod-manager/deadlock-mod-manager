// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "linux")]
fn should_enable_linux_gpu_optimization() -> bool {
  let cli_args = desktop_lib::cli::get_cli_args();
  
  if cli_args.linux_gpu_fix {
    eprintln!("[GPU Opt] Enabled via --linux-gpu-fix CLI flag");
    return true;
  }

  let data_dir = match std::env::var_os("XDG_DATA_HOME")
    .map(std::path::PathBuf::from)
    .or_else(|| {
      std::env::var_os("HOME").map(|home| {
        std::path::PathBuf::from(home).join(".local").join("share")
      })
    }) {
    Some(dir) => dir,
    None => {
      eprintln!("[GPU Opt] Could not determine data directory");
      return false;
    }
  };

  let store_path = data_dir
    .join("dev.stormix.deadlock-mod-manager")
    .join("state.json");

  let content = match std::fs::read_to_string(&store_path) {
    Ok(c) => c,
    Err(e) => {
      if e.kind() != std::io::ErrorKind::NotFound {
        eprintln!("[GPU Opt] Failed to read state file: {}", e);
      }
      return false;
    }
  };

  let store_json = match serde_json::from_str::<serde_json::Value>(&content) {
    Ok(json) => json,
    Err(e) => {
      eprintln!("[GPU Opt] Failed to parse state.json: {}", e);
      return false;
    }
  };

  let config_str = match store_json.get("local-config").and_then(|v| v.as_str()) {
    Some(s) => s,
    None => return false,
  };

  let config_json = match serde_json::from_str::<serde_json::Value>(config_str) {
    Ok(json) => json,
    Err(e) => {
      eprintln!("[GPU Opt] Failed to parse local-config: {}", e);
      return false;
    }
  };

  let enabled = config_json
    .get("state")
    .and_then(|state| state.get("linuxGpuOptimization"))
    .and_then(|v| v.as_bool())
    .unwrap_or(false);

  if enabled {
    eprintln!("[GPU Opt] Enabled via settings");
  }

  enabled
}

fn main() {
  desktop_lib::cli::get_cli_args();

  #[cfg(target_os = "linux")]
  {
    if should_enable_linux_gpu_optimization() {
      eprintln!("[GPU Opt] Setting WebKit environment variables for improved compatibility");
      unsafe {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        std::env::set_var("NODEVICE_SELECT", "1");
      }
    }
  }

  desktop_lib::run()
}
