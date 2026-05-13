use crate::deep_link::{scheme_names, strip_scheme, validate_mod_deep_link};
use crate::errors::Error;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeepLinkData {
  pub download_url: String,
  pub mod_type: String,
  pub mod_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeepLinkDebugInfo {
  pub debug_mode: bool,
  pub target_os: String,
  pub registered_schemes: Vec<String>,
  pub registry_status: std::collections::HashMap<String, String>,
}

#[tauri::command]
pub async fn parse_deep_link(url: String) -> Result<DeepLinkData, Error> {
  log::info!("Parsing deep link: {url}");

  let data_part = strip_scheme(&url).ok_or_else(|| {
    Error::InvalidInput(format!(
      "Invalid deep link format. Expected schemes: {}",
      scheme_names().join(", ")
    ))
  })?;

  let (download_url, mod_type, mod_id) = validate_mod_deep_link(data_part).ok_or_else(|| {
    Error::InvalidInput(
      "Invalid mod installation deep link format. Must contain 3 comma-separated parts: download_url,mod_type,mod_id".to_string(),
    )
  })?;

  log::info!("Parsed deep link - Download URL: {download_url}, Type: {mod_type}, Mod ID: {mod_id}");

  Ok(DeepLinkData {
    download_url,
    mod_type,
    mod_id,
  })
}

#[tauri::command]
pub async fn get_deep_link_debug_info() -> Result<DeepLinkDebugInfo, Error> {
  log::debug!("[DeepLink] Getting debug info...");

  let debug_mode = cfg!(debug_assertions);
  let target_os = std::env::consts::OS.to_string();
  let registered_schemes = scheme_names();

  let mut registry_status = std::collections::HashMap::new();

  #[cfg(windows)]
  {
    use std::process::Command;

    for scheme in &registered_schemes {
      let output = Command::new("reg")
        .args([
          "query",
          &format!("HKEY_CURRENT_USER\\Software\\Classes\\{}", scheme),
        ])
        .output();

      match output {
        Ok(result) => {
          if result.status.success() {
            registry_status.insert(scheme.clone(), "REGISTERED".to_string());
          } else {
            registry_status.insert(scheme.clone(), "NOT_FOUND".to_string());
          }
        }
        Err(e) => {
          registry_status.insert(scheme.clone(), format!("ERROR: {}", e));
        }
      }
    }
  }

  #[cfg(not(windows))]
  {
    for scheme in &registered_schemes {
      registry_status.insert(scheme.clone(), "N/A (non-Windows)".to_string());
    }
  }

  log::debug!(
    "[DeepLink] Debug info: debug_mode={}, os={}, registry={:?}",
    debug_mode,
    target_os,
    registry_status
  );

  Ok(DeepLinkDebugInfo {
    debug_mode,
    target_os,
    registered_schemes,
    registry_status,
  })
}
