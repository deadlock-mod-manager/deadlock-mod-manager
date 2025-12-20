use serde::Serialize;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Manager};

// Scheme constants
pub const SCHEME_PRIMARY: &str = "deadlock-mod-manager:";
pub const SCHEME_SECONDARY: &str = "deadlock-modmanager:";
pub const SCHEME_SHORT: &str = "dlmm:";

// Event name constants
pub const EVENT_OIDC_CALLBACK: &str = "oidc-callback-received";
pub const EVENT_OIDC_ERROR: &str = "oidc-callback-error";
pub const EVENT_AUTH_CALLBACK: &str = "auth-callback-received";
pub const EVENT_AUTH_ERROR: &str = "auth-callback-error";
pub const EVENT_DEEP_LINK_RECEIVED: &str = "deep-link-received";

// Path constants
pub const PATH_OIDC_CALLBACK: &str = "//auth/callback";
pub const PATH_LEGACY_AUTH_CALLBACK: &str = "//auth-callback";

// Validation constants
pub const GAMEBANANA_DOMAIN: &str = "gamebanana.com";
pub const MOD_ID_PARTS_COUNT: usize = 3;

/// Parse query parameters from a query string with URL decoding
pub fn parse_query_params(query: &str) -> HashMap<String, String> {
  query
    .split('&')
    .filter_map(|pair| {
      let mut parts = pair.split('=');
      let key = parts.next()?.to_string();
      let value = urlencoding::decode(parts.next()?).ok()?.into_owned();
      Some((key, value))
    })
    .collect()
}

/// Extract data part after scheme removal
pub fn strip_scheme(url: &str) -> Option<&str> {
  let url = url.trim();
  if let Some(stripped) = url.strip_prefix(SCHEME_PRIMARY) {
    Some(stripped)
  } else if let Some(stripped) = url.strip_prefix(SCHEME_SECONDARY) {
    Some(stripped)
  } else if let Some(stripped) = url.strip_prefix(SCHEME_SHORT) {
    Some(stripped)
  } else {
    None
  }
}

/// Emit event to main window
pub fn emit_to_main_window<T: Serialize + Clone>(
  app_handle: &AppHandle,
  event: &str,
  payload: T,
) -> Result<(), tauri::Error> {
  if let Some(window) = app_handle.get_webview_window("main") {
    window.emit(event, payload)?;
  }
  Ok(())
}

/// Check if URL starts with any of the supported deep link schemes
pub fn is_deep_link(url: &str) -> bool {
  url.starts_with(SCHEME_PRIMARY)
    || url.starts_with(SCHEME_SECONDARY)
    || url.starts_with(SCHEME_SHORT)
}

/// Validate and parse mod installation deep link data
/// Returns (download_url, mod_type, mod_id) if valid, None otherwise
pub fn validate_mod_deep_link(data_part: &str) -> Option<(String, String, String)> {
  let parts: Vec<&str> = data_part.split(',').collect();

  if parts.len() != MOD_ID_PARTS_COUNT {
    return None;
  }

  let download_url = parts[0].to_string();
  let mod_type = parts[1].to_string();
  let mod_id = parts[2].to_string();

  if !download_url.contains(GAMEBANANA_DOMAIN) {
    return None;
  }

  if mod_id.parse::<u32>().is_err() {
    return None;
  }

  Some((download_url, mod_type, mod_id))
}
