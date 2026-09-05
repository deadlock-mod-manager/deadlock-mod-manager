use crate::app_runtime::{AppHandle, AppRuntime};
use serde::Serialize;
use std::collections::HashMap;
use tauri::{Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;

use crate::commands::deep_link::DeepLinkData;

pub const SCHEMES: &[&str] = &["deadlock-mod-manager:", "deadlock-modmanager:", "dlmm:"];

pub const EVENT_OIDC_CALLBACK: &str = "oidc-callback-received";
pub const EVENT_OIDC_ERROR: &str = "oidc-callback-error";
pub const EVENT_AUTH_CALLBACK: &str = "auth-callback-received";
pub const EVENT_AUTH_ERROR: &str = "auth-callback-error";
pub const EVENT_DEEP_LINK_RECEIVED: &str = "deep-link-received";
pub const EVENT_FORGE_LAUNCH: &str = "forge-launch-requested";

pub const PATH_OIDC_CALLBACK: &str = "//auth/callback";
pub const PATH_LEGACY_AUTH_CALLBACK: &str = "//auth-callback";

/// Fired by deadlockforge.net when its 1-click button cannot find the bridge.
/// Brings the app up and asks whether to turn 1-click installs on.
pub const PATH_FORGE_LAUNCH: &str = "//forge/launch";

pub const GAMEBANANA_DOMAIN: &str = "gamebanana.com";
pub const MOD_ID_PARTS_COUNT: usize = 3;

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

pub fn strip_scheme(url: &str) -> Option<&str> {
  let url = url.trim();
  SCHEMES.iter().find_map(|scheme| url.strip_prefix(scheme))
}

pub fn scheme_names() -> Vec<String> {
  SCHEMES
    .iter()
    .map(|s| s.trim_end_matches(':').to_string())
    .collect()
}

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

pub fn is_deep_link(url: &str) -> bool {
  SCHEMES.iter().any(|scheme| url.starts_with(scheme))
}

#[cfg(desktop)]
pub fn on_second_instance(app_handle: &AppHandle, argv: Vec<String>, _cwd: String) {
  log::info!(
    "[DeepLink] Single instance callback triggered with {} argument(s)",
    argv.len()
  );

  for arg in &argv {
    if is_deep_link(arg) {
      if let Err(e) = handle_deep_link_url(app_handle, arg) {
        log::error!("[DeepLink] Failed to handle deep link from single instance: {e}");
      }

      if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.set_focus();
        let _ = window.show();
        let _ = window.unminimize();
      } else {
        log::warn!("[DeepLink] Could not find main window to focus");
      }
    }
  }
}

/// Validate and parse mod installation deep link data
/// Returns (download_url, mod_type, mod_id) if valid, None otherwise
pub fn validate_mod_deep_link(data_part: &str) -> Option<(String, String, String)> {
  let parts: Vec<&str> = data_part.split(',').collect();

  if parts.len() != MOD_ID_PARTS_COUNT {
    return None;
  }

  let download_url = reqwest::Url::parse(parts[0]).ok()?;
  let mod_type = parts[1].to_ascii_lowercase();
  let mod_id = parts[2].to_string();

  let host = download_url.host_str()?;
  if download_url.scheme() != "https"
    || (host != GAMEBANANA_DOMAIN && !host.ends_with(&format!(".{GAMEBANANA_DOMAIN}")))
    || !matches!(mod_type.as_str(), "mod" | "sound")
  {
    return None;
  }

  if mod_id.parse::<u32>().is_err() {
    return None;
  }

  Some((download_url.to_string(), mod_type, mod_id))
}

pub fn handle_deep_link_url(
  app_handle: &AppHandle,
  url: &str,
) -> Result<(), Box<dyn std::error::Error>> {
  log::info!("[DeepLink] Processing deep link URL");

  let data_part = match strip_scheme(url) {
    Some(part) => part,
    None => {
      log::error!(
        "[DeepLink] Invalid deep link format - no matching scheme found. Expected: {}",
        scheme_names().join(", ")
      );
      return Ok(());
    }
  };

  if data_part.starts_with(PATH_OIDC_CALLBACK) {
    if let Some(query_start) = data_part.find('?') {
      let query = &data_part[query_start + 1..];
      let params = parse_query_params(query);

      if let Some(code) = params.get("code") {
        let state = params.get("state").cloned();
        emit_to_main_window(
          app_handle,
          EVENT_OIDC_CALLBACK,
          serde_json::json!({ "code": code, "state": state }),
        )?;
        return Ok(());
      }

      if let Some(error) = params.get("error") {
        let error_description = params.get("error_description").cloned();
        log::error!("OIDC callback error: {error}");
        emit_to_main_window(
          app_handle,
          EVENT_OIDC_ERROR,
          serde_json::json!({ "error": error, "error_description": error_description }),
        )?;
        return Ok(());
      }
    }

    log::error!("OIDC callback deep link missing code or error parameter");
    return Ok(());
  }

  if data_part.starts_with(PATH_FORGE_LAUNCH) {
    emit_to_main_window(app_handle, EVENT_FORGE_LAUNCH, ())?;
    return Ok(());
  }

  if data_part.starts_with(PATH_LEGACY_AUTH_CALLBACK) {
    if let Some(query_start) = data_part.find('?') {
      let query = &data_part[query_start + 1..];
      let params = parse_query_params(query);

      if let Some(token) = params.get("token") {
        emit_to_main_window(app_handle, EVENT_AUTH_CALLBACK, token)?;
        return Ok(());
      }

      if let Some(error) = params.get("error") {
        log::error!("Auth callback error: {error}");
        emit_to_main_window(app_handle, EVENT_AUTH_ERROR, error)?;
        return Ok(());
      }
    }

    log::error!("Auth callback deep link missing token or error parameter");
    return Ok(());
  }

  if let Some((download_url, mod_type, mod_id)) = validate_mod_deep_link(data_part) {
    let parsed_data = DeepLinkData {
      download_url,
      mod_type,
      mod_id,
    };
    emit_to_main_window(app_handle, EVENT_DEEP_LINK_RECEIVED, parsed_data)?;
  } else {
    log::error!("Invalid mod installation deep link format");
  }

  Ok(())
}

pub fn setup(app: &tauri::App<AppRuntime>) -> Result<(), Box<dyn std::error::Error>> {
  #[cfg(any(target_os = "linux", target_os = "windows"))]
  {
    log::info!("[DeepLink] Registering deep link protocols...");
    if let Err(e) = app.deep_link().register_all() {
      log::error!("[DeepLink] Failed to register protocols: {e}");
    }
  }

  let handle = app.app_handle();
  let start_urls = app.deep_link().get_current()?;

  if let Some(urls) = start_urls {
    log::info!(
      "[DeepLink] App started with {} deep link URL(s)",
      urls.len()
    );
    for url in urls {
      if let Err(e) = handle_deep_link_url(handle, url.as_ref()) {
        log::error!("[DeepLink] Failed to handle startup deep link: {e}");
      }
    }
  }

  let deep_link_handle = app.app_handle().clone();
  app.deep_link().on_open_url(move |event| {
    for url in event.urls() {
      log::info!("[DeepLink] Received open URL event");
      if let Err(e) = handle_deep_link_url(&deep_link_handle, url.as_ref()) {
        log::error!("[DeepLink] Failed to handle open URL: {e}");
      }
    }
  });

  Ok(())
}

#[cfg(test)]
mod tests {
  use super::{PATH_FORGE_LAUNCH, strip_scheme, validate_mod_deep_link};

  #[test]
  fn recognises_the_forge_launch_url_the_site_fires() {
    // The site hardcodes this URL, so a change to either the scheme list or
    // the path silently stops the 1-click button from waking the app.
    let stripped =
      strip_scheme("deadlock-mod-manager://forge/launch").expect("scheme should be recognised");
    assert!(stripped.starts_with(PATH_FORGE_LAUNCH));
  }

  #[test]
  fn validates_mod_and_sound_install_links() {
    assert!(validate_mod_deep_link("https://gamebanana.com/mmdl/12,Mod,42").is_some());
    let sound = validate_mod_deep_link("https://files.gamebanana.com/mmdl/13,Sound,42").unwrap();
    assert_eq!(sound.1, "sound");
  }

  #[test]
  fn rejects_untrusted_or_unknown_install_links() {
    assert!(validate_mod_deep_link("https://gamebanana.com.evil.test/mmdl/12,Mod,42").is_none());
    assert!(validate_mod_deep_link("http://gamebanana.com/mmdl/12,Mod,42").is_none());
    assert!(validate_mod_deep_link("https://gamebanana.com/mmdl/12,Map,42").is_none());
  }
}
