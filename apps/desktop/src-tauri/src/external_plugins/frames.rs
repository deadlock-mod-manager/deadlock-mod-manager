//! Serves plugin interfaces to embedded frames over the `dmm-plugin`
//! protocol, at `frame/<view token>/<path>`. The token comes from
//! [`PluginHost::view`], so a frame cannot name another plugin's assets and
//! its asset requests go stale when the plugin updates.
//!
//! The app embeds them as `<iframe sandbox="allow-scripts">`, so a frame's
//! origin is opaque: Tauri rejects IPC from it (`Origin: null`), it cannot
//! reach the app document, and the CSP below keeps it off the network. It
//! talks to the app only through `postMessage`, which the embedding page
//! relays with `external_plugins_frame_call`. Sandboxing still lets a frame
//! navigate itself, so [`guard_navigation`] keeps plugin frames on this
//! protocol: a page loaded elsewhere would escape the CSP and inherit the
//! frame's relay.

use crate::app_runtime::AppRuntime;
use dmm_plugin_runtime::PluginHost;
use std::path::Path;
use std::sync::Arc;
use tauri::Manager;
use tauri::http::{Request, Response, StatusCode, header};

pub const PROTOCOL: &str = "dmm-plugin";

/// Module scripts from an opaque origin are CORS requests, hence the
/// allow-origin header on every response.
const CONTENT_SECURITY_POLICY: &str = "default-src 'none'; \
  script-src http://dmm-plugin.localhost dmm-plugin://localhost; \
  style-src http://dmm-plugin.localhost dmm-plugin://localhost 'unsafe-inline'; \
  img-src http://dmm-plugin.localhost dmm-plugin://localhost data: blob:; \
  font-src http://dmm-plugin.localhost dmm-plugin://localhost data:; \
  media-src http://dmm-plugin.localhost dmm-plugin://localhost blob:; \
  connect-src 'none'; manifest-src 'none'; worker-src 'none'; frame-src 'none'; \
  child-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; \
  frame-ancestors http://localhost:1420 http://tauri.localhost tauri://localhost";

fn content_type(path: &Path) -> &'static str {
  match path
    .extension()
    .and_then(|extension| extension.to_str())
    .map(str::to_ascii_lowercase)
    .as_deref()
  {
    Some("html") => "text/html; charset=utf-8",
    Some("js" | "mjs") => "text/javascript; charset=utf-8",
    Some("css") => "text/css; charset=utf-8",
    Some("json" | "map") => "application/json",
    Some("svg") => "image/svg+xml",
    Some("png") => "image/png",
    Some("jpg" | "jpeg") => "image/jpeg",
    Some("gif") => "image/gif",
    Some("webp") => "image/webp",
    Some("ico") => "image/x-icon",
    Some("woff2") => "font/woff2",
    Some("woff") => "font/woff",
    Some("ttf") => "font/ttf",
    Some("txt") => "text/plain; charset=utf-8",
    _ => "application/octet-stream",
  }
}

fn respond(status: StatusCode, content_type: &str, body: Vec<u8>) -> Response<Vec<u8>> {
  Response::builder()
    .status(status)
    .header(header::CONTENT_TYPE, content_type)
    .header(header::CONTENT_SECURITY_POLICY, CONTENT_SECURITY_POLICY)
    .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
    .header("Cross-Origin-Resource-Policy", "cross-origin")
    .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
    .header(header::REFERRER_POLICY, "no-referrer")
    .header(header::CACHE_CONTROL, "no-store")
    .body(body)
    .unwrap_or_default()
}

fn denied(status: StatusCode) -> Response<Vec<u8>> {
  respond(status, "text/plain; charset=utf-8", Vec::new())
}

/// Serves `frame/<view token>/<path>` from an enabled plugin's interface
/// folder; an empty path is the manifest's entry page.
pub fn serve(host: &PluginHost, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
  if request.method() != tauri::http::Method::GET && request.method() != tauri::http::Method::HEAD {
    return denied(StatusCode::METHOD_NOT_ALLOWED);
  }
  let Ok(path) = urlencoding::decode(request.uri().path()) else {
    return denied(StatusCode::NOT_FOUND);
  };
  let Some((token, path)) = path
    .trim_start_matches('/')
    .strip_prefix("frame/")
    .and_then(|rest| rest.split_once('/'))
  else {
    return denied(StatusCode::NOT_FOUND);
  };
  let Ok(view) = host.view_session(token) else {
    return denied(StatusCode::FORBIDDEN);
  };
  let path = if path.is_empty() { &view.entry } else { path };
  match host.read_view_asset(&view.plugin_id, view.generation, path) {
    Ok(Some(asset)) => {
      let bytes = if request.method() == tauri::http::Method::HEAD {
        Vec::new()
      } else {
        asset.bytes
      };
      respond(StatusCode::OK, content_type(&asset.path), bytes)
    }
    Ok(None) => denied(StatusCode::NOT_FOUND),
    Err(_) => denied(StatusCode::FORBIDDEN),
  }
}

pub fn register(builder: tauri::Builder<AppRuntime>) -> tauri::Builder<AppRuntime> {
  builder.register_asynchronous_uri_scheme_protocol(PROTOCOL, |context, request, responder| {
    let app = context.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || {
      let response = match app.try_state::<Arc<PluginHost>>() {
        Some(host) => serve(&host, &request),
        None => denied(StatusCode::SERVICE_UNAVAILABLE),
      };
      responder.respond(response);
    });
  })
}

/// Cancels navigations that would take a frame off the plugin protocol after
/// it has loaded a plugin page. The app sets each plugin frame's first URL,
/// so only plugin frames are locked; other embeds navigate freely.
#[cfg(windows)]
pub fn guard_navigation(window: &tauri::WebviewWindow<AppRuntime>) {
  use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2_4, ICoreWebView2Frame2};
  use webview2_com::{FrameCreatedEventHandler, FrameNavigationStartingEventHandler, take_pwstr};
  use windows_core::{Interface, PWSTR};

  const ORIGINS: [&str; 2] = [
    "http://dmm-plugin.localhost/",
    "https://dmm-plugin.localhost/",
  ];

  let result = window.with_webview(|platform| {
    let install = || -> windows_core::Result<()> {
      let webview = unsafe { platform.controller().CoreWebView2()? }.cast::<ICoreWebView2_4>()?;
      let on_frame = FrameCreatedEventHandler::create(Box::new(|_, args| {
        let Some(args) = args else {
          return Ok(());
        };
        let frame = unsafe { args.Frame()? }.cast::<ICoreWebView2Frame2>()?;
        let mut plugin_frame = false;
        let on_navigation =
          FrameNavigationStartingEventHandler::create(Box::new(move |_, args| {
            let Some(args) = args else {
              return Ok(());
            };
            let mut uri = PWSTR::null();
            unsafe { args.Uri(&mut uri)? };
            let uri = take_pwstr(uri);
            if ORIGINS.iter().any(|origin| uri.starts_with(origin)) {
              plugin_frame = true;
            } else if plugin_frame {
              log::warn!(
                "[ExternalPlugins] Blocked a plugin frame from leaving the plugin protocol"
              );
              unsafe { args.SetCancel(true)? };
            }
            Ok(())
          }));
        let mut token = 0;
        unsafe { frame.add_NavigationStarting(&on_navigation, &mut token) }
      }));
      let mut token = 0;
      unsafe { webview.add_FrameCreated(&on_frame, &mut token) }
    };
    if let Err(error) = install() {
      log::error!("[ExternalPlugins] Could not guard plugin frame navigation: {error}");
    }
  });
  if let Err(error) = result {
    log::error!("[ExternalPlugins] Could not reach the webview to guard plugin frames: {error}");
  }
}
