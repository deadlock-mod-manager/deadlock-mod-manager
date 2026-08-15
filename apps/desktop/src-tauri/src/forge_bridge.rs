//! Loopback HTTP bridge for 1-click installs from DeadlockForge.
//!
//! The site builds VPKs in the browser, so there is no URL to hand the deep
//! link flow. It posts the bytes here instead. Trust is the Origin header:
//! browsers set it themselves, and the install route is deliberately a
//! non-simple request so a preflight always precedes it.

use crate::app_runtime::AppHandle;
use crate::errors::Error;
use http_body_util::{BodyExt, Full, Limited};
use hyper::body::{Bytes, Incoming};
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Method, Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use serde::Serialize;
use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};
use tokio::net::TcpListener;
use tokio::sync::oneshot;

const FORGE_PROTOCOL_VERSION: u32 = 1;

/// Distinct from Grimoire's 43110-43114 so both managers can run at once.
const FORGE_PORTS: [u16; 5] = [43120, 43121, 43122, 43123, 43124];

/// Lets the site tell managers apart if one answers in the other's range.
const FORGE_APP_ID: &str = "deadlock-mod-manager";

const EVENT_FORGE_INSTALL_REQUESTED: &str = "forge-install-requested";

const ALLOWED_ORIGINS: &[&str] = &["https://deadlockforge.net", "https://www.deadlockforge.net"];

/// Sound builds run large: roughly 16 KB per second of audio per replaced
/// sound, so 600 sounds from a 30 second clip approaches 300 MB.
const MAX_BODY_BYTES: usize = 512 * 1024 * 1024;

/// Below this a payload cannot carry a VPK header.
const MIN_BODY_BYTES: usize = 32;

const VPK_SIGNATURE: u32 = 0x55AA_1234;

const PROTOCOL_HEADER: &str = "x-forge-protocol";
const NAME_HEADER: &str = "x-forge-name";
const AUTHOR_HEADER: &str = "x-forge-author";

/// Every header the site sends. One missing here is not ignored: the browser
/// refuses to send the request at all, which looks like an unreachable app.
const ALLOWED_REQUEST_HEADERS: &str =
  "content-type, x-forge-protocol, x-forge-name, x-forge-type, x-forge-author";
const CONTENT_TYPE: &str = "application/octet-stream";

struct BridgeHandle {
  port: u16,
  shutdown: oneshot::Sender<()>,
}

static BRIDGE: Mutex<Option<BridgeHandle>> = Mutex::new(None);

/// Payloads staged and not yet cleaned up. Only a path listed here is ever
/// deleted, so the cleanup command cannot delete arbitrary files.
static STAGED: Mutex<Vec<PathBuf>> = Mutex::new(Vec::new());

/// One install may await an answer at a time, so a page cannot stack dialogs.
/// An instant rather than a flag, so a dialog that never reports back cannot
/// hold the slot for the rest of the session.
static IN_FLIGHT_SINCE: Mutex<Option<Instant>> = Mutex::new(None);

/// How long an unanswered install keeps the slot before another may take it.
const INSTALL_ANSWER_TIMEOUT: Duration = Duration::from_secs(300);

/// Serialises start and stop; two concurrent starts would otherwise bind
/// separate ports and only the handle stored last could be closed.
static LIFECYCLE: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[derive(Serialize, Clone)]
struct PingBody {
  ok: bool,
  app: &'static str,
  protocol: u32,
}

#[derive(Serialize, Clone)]
pub struct ForgeInstallRequest {
  pub name: String,
  pub path: String,
  pub author: Option<String>,
}

fn json_response(status: StatusCode, body: &str, origin: Option<&str>) -> Response<Full<Bytes>> {
  let mut builder = Response::builder()
    .status(status)
    .header("content-type", "application/json")
    .header("cache-control", "no-store");

  if let Some(origin) = origin {
    builder = builder
      .header("access-control-allow-origin", origin)
      .header("vary", "Origin");
  }

  builder
    .body(Full::new(Bytes::from(body.to_owned())))
    .unwrap_or_else(|_| Response::new(Full::new(Bytes::from_static(b"{}"))))
}

fn error_response(status: StatusCode, reason: &str, origin: Option<&str>) -> Response<Full<Bytes>> {
  json_response(status, &format!("{{\"error\":\"{reason}\"}}"), origin)
}

fn allowed_origin(origin: Option<&str>) -> Option<&str> {
  let origin = origin?;
  ALLOWED_ORIGINS
    .iter()
    .find(|allowed| **allowed == origin)
    .copied()
}

/// Requires a loopback literal, which is what stops a DNS rebind.
fn host_is_loopback(host: Option<&str>) -> bool {
  let Some(host) = host else {
    return false;
  };
  let hostname = host.rsplit_once(':').map_or(host, |(name, _)| name);
  hostname == "127.0.0.1" || hostname == "[::1]" || hostname == "::1"
}

fn is_plausible_vpk(bytes: &[u8]) -> bool {
  if bytes.len() < 4 {
    return false;
  }
  let signature = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
  signature == VPK_SIGNATURE
}

/// Percent encoded in transit, and stripped of anything path-like because this
/// becomes a filename.
fn decode_mod_name(raw: Option<&str>) -> String {
  let decoded = raw
    .and_then(|value| urlencoding::decode(value).ok())
    .map(|value| value.into_owned())
    .unwrap_or_default();

  let cleaned: String = decoded
    .chars()
    .filter(|c| !matches!(c, '/' | '\\' | ':' | '<' | '>' | '"' | '|' | '?' | '*'))
    .filter(|c| !c.is_control())
    .collect();

  let trimmed = cleaned.trim().trim_matches('.').trim();
  if trimmed.is_empty() {
    "DeadlockForge mod".to_string()
  } else {
    trimmed.chars().take(120).collect()
  }
}

fn decode_optional(raw: Option<&str>) -> Option<String> {
  let decoded = raw
    .and_then(|value| urlencoding::decode(value).ok())
    .map(|value| value.into_owned())?;
  let cleaned: String = decoded.chars().filter(|c| !c.is_control()).collect();
  let trimmed = cleaned.trim();
  if trimmed.is_empty() {
    None
  } else {
    Some(trimmed.chars().take(120).collect())
  }
}

fn preflight_response(origin: &str, wants_private_network: bool) -> Response<Full<Bytes>> {
  let mut builder = Response::builder()
    .status(StatusCode::NO_CONTENT)
    .header("access-control-allow-origin", origin)
    .header("access-control-allow-methods", "POST, GET, OPTIONS")
    .header("access-control-allow-headers", ALLOWED_REQUEST_HEADERS)
    .header("access-control-max-age", "600")
    .header("vary", "Origin");

  if wants_private_network {
    builder = builder.header("access-control-allow-private-network", "true");
  }

  builder
    .body(Full::new(Bytes::new()))
    .unwrap_or_else(|_| Response::new(Full::new(Bytes::new())))
}

async fn write_temp_vpk(bytes: &[u8]) -> Result<PathBuf, std::io::Error> {
  let file = tempfile::Builder::new()
    .prefix("deadlockforge-")
    .suffix(".vpk")
    .tempfile()?;
  let (_, path) = file.keep().map_err(|e| e.error)?;
  tokio::fs::write(&path, bytes).await?;
  Ok(path)
}

async fn handle_install(
  req: Request<Incoming>,
  origin: &str,
  app_handle: AppHandle,
) -> Response<Full<Bytes>> {
  let headers = req.headers().clone();

  let protocol_ok = headers
    .get(PROTOCOL_HEADER)
    .and_then(|v| v.to_str().ok())
    .and_then(|v| v.parse::<u32>().ok())
    .is_some_and(|v| v == FORGE_PROTOCOL_VERSION);
  if !protocol_ok {
    return error_response(StatusCode::BAD_REQUEST, "BAD_PROTOCOL", Some(origin));
  }

  let content_type_ok = headers
    .get(hyper::header::CONTENT_TYPE)
    .and_then(|v| v.to_str().ok())
    .is_some_and(|v| v.split(';').next().unwrap_or("").trim() == CONTENT_TYPE);
  if !content_type_ok {
    return error_response(
      StatusCode::UNSUPPORTED_MEDIA_TYPE,
      "BAD_CONTENT_TYPE",
      Some(origin),
    );
  }

  let Some(abandoned) = claim_install_slot() else {
    return error_response(StatusCode::TOO_MANY_REQUESTS, "BUSY", Some(origin));
  };

  for path in abandoned {
    let _ = tokio::fs::remove_file(&path).await;
  }

  let response = read_and_dispatch(req, origin, &headers, app_handle).await;
  if response.status() != StatusCode::ACCEPTED {
    release_in_flight();
  }
  response
}

async fn read_and_dispatch(
  req: Request<Incoming>,
  origin: &str,
  headers: &hyper::HeaderMap,
  app_handle: AppHandle,
) -> Response<Full<Bytes>> {
  let collected = match Limited::new(req.into_body(), MAX_BODY_BYTES)
    .collect()
    .await
  {
    Ok(body) => body.to_bytes(),
    Err(_) => {
      return error_response(StatusCode::PAYLOAD_TOO_LARGE, "TOO_LARGE", Some(origin));
    }
  };

  if collected.len() < MIN_BODY_BYTES {
    return error_response(StatusCode::BAD_REQUEST, "TOO_SMALL", Some(origin));
  }

  if !is_plausible_vpk(&collected) {
    return error_response(StatusCode::BAD_REQUEST, "NOT_A_VPK", Some(origin));
  }

  let name = decode_mod_name(headers.get(NAME_HEADER).and_then(|v| v.to_str().ok()));
  let author = decode_optional(headers.get(AUTHOR_HEADER).and_then(|v| v.to_str().ok()));

  let path = match write_temp_vpk(&collected).await {
    Ok(path) => path,
    Err(error) => {
      log::error!("[ForgeBridge] Failed to stage payload: {error}");
      return error_response(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL", Some(origin));
    }
  };
  remember_staged(&path);

  let payload = ForgeInstallRequest {
    name,
    path: path.to_string_lossy().into_owned(),
    author,
  };

  if let Some(window) = app_handle.get_webview_window("main") {
    let _ = window.set_focus();
    let _ = window.show();
    let _ = window.unminimize();
    if let Err(error) = window.emit(EVENT_FORGE_INSTALL_REQUESTED, payload) {
      log::error!("[ForgeBridge] Failed to notify the window: {error}");
      forget_staged(&path);
      let _ = tokio::fs::remove_file(&path).await;
      return error_response(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL", Some(origin));
    }
  } else {
    forget_staged(&path);
    let _ = tokio::fs::remove_file(&path).await;
    return error_response(StatusCode::SERVICE_UNAVAILABLE, "NO_WINDOW", Some(origin));
  }

  json_response(
    StatusCode::ACCEPTED,
    "{\"ok\":true,\"queued\":true}",
    Some(origin),
  )
}

/// Split from the response building so the trust rules can be tested without
/// standing up a window.
#[derive(Debug, PartialEq, Eq)]
enum Decision<'a> {
  Reject(StatusCode, &'static str),
  Preflight {
    origin: &'a str,
    private_network: bool,
  },
  Ping {
    origin: &'a str,
  },
  Install {
    origin: &'a str,
  },
  NotFound {
    origin: &'a str,
  },
}

fn classify<'a>(
  method: &Method,
  path: &str,
  host: Option<&str>,
  origin: Option<&'a str>,
  private_network: bool,
) -> Decision<'a> {
  if !host_is_loopback(host) {
    return Decision::Reject(StatusCode::FORBIDDEN, "BAD_HOST");
  }

  let Some(origin) = allowed_origin(origin) else {
    return Decision::Reject(StatusCode::FORBIDDEN, "BAD_ORIGIN");
  };

  if method == Method::OPTIONS {
    return Decision::Preflight {
      origin,
      private_network,
    };
  }

  match (method, path) {
    (&Method::GET, "/forge/v1/ping") => Decision::Ping { origin },
    (&Method::POST, "/forge/v1/install") => Decision::Install { origin },
    _ => Decision::NotFound { origin },
  }
}

async fn route(req: Request<Incoming>, app_handle: AppHandle) -> Response<Full<Bytes>> {
  let headers = req.headers().clone();
  let header = |name: &str| headers.get(name).and_then(|v| v.to_str().ok());

  let private_network =
    header("access-control-request-private-network").is_some_and(|v| v == "true");
  let path = req.uri().path().to_string();

  match classify(
    req.method(),
    &path,
    header("host"),
    header("origin"),
    private_network,
  ) {
    Decision::Reject(status, reason) => error_response(status, reason, None),
    Decision::Preflight {
      origin,
      private_network,
    } => preflight_response(origin, private_network),
    Decision::Ping { origin } => {
      let body = PingBody {
        ok: true,
        app: FORGE_APP_ID,
        protocol: FORGE_PROTOCOL_VERSION,
      };
      let encoded = serde_json::to_string(&body).unwrap_or_else(|_| "{}".to_string());
      json_response(StatusCode::OK, &encoded, Some(origin))
    }
    Decision::Install { origin } => {
      let origin = origin.to_owned();
      handle_install(req, &origin, app_handle).await
    }
    Decision::NotFound { origin } => {
      error_response(StatusCode::NOT_FOUND, "NOT_FOUND", Some(origin))
    }
  }
}

async fn bind_first_free() -> Option<(TcpListener, u16)> {
  for port in FORGE_PORTS {
    let addr = SocketAddr::V4(SocketAddrV4::new(Ipv4Addr::LOCALHOST, port));
    if let Ok(listener) = TcpListener::bind(addr).await {
      return Some((listener, port));
    }
  }
  None
}

pub async fn start(app_handle: AppHandle) -> Result<u16, Error> {
  let _serialised = LIFECYCLE.lock().await;

  {
    let guard = BRIDGE
      .lock()
      .map_err(|_| Error::InvalidInput("Forge bridge state is poisoned".to_string()))?;
    if let Some(handle) = guard.as_ref() {
      return Ok(handle.port);
    }
  }

  let Some((listener, port)) = bind_first_free().await else {
    return Err(Error::InvalidInput(
      "No free loopback port for the forge bridge".to_string(),
    ));
  };

  let (shutdown_tx, mut shutdown_rx) = oneshot::channel();

  tokio::spawn(async move {
    loop {
      tokio::select! {
        _ = &mut shutdown_rx => break,
        accepted = listener.accept() => {
          let Ok((stream, _)) = accepted else { continue };
          let handle = app_handle.clone();
          tokio::spawn(async move {
            let service = service_fn(move |req| {
              let handle = handle.clone();
              async move { Ok::<_, std::convert::Infallible>(route(req, handle).await) }
            });
            if let Err(error) = http1::Builder::new()
              .serve_connection(TokioIo::new(stream), service)
              .await
            {
              log::debug!("[ForgeBridge] Connection ended: {error}");
            }
          });
        }
      }
    }
  });

  if let Ok(mut guard) = BRIDGE.lock() {
    *guard = Some(BridgeHandle {
      port,
      shutdown: shutdown_tx,
    });
  }

  log::info!("[ForgeBridge] Listening on 127.0.0.1:{port}");
  Ok(port)
}

pub async fn stop() {
  let _serialised = LIFECYCLE.lock().await;

  let handle = BRIDGE.lock().ok().and_then(|mut guard| guard.take());
  if let Some(handle) = handle {
    let _ = handle.shutdown.send(());
    release_in_flight();
    log::info!("[ForgeBridge] Stopped");
  }
}

/// Takes the slot, or `None` if held. A slot past the timeout is taken over,
/// returning whatever the abandoned install staged so it can be deleted.
fn claim_install_slot() -> Option<Vec<PathBuf>> {
  let mut guard = IN_FLIGHT_SINCE.lock().ok()?;

  match *guard {
    Some(since) if since.elapsed() < INSTALL_ANSWER_TIMEOUT => None,
    _ => {
      *guard = Some(Instant::now());
      Some(drain_staged())
    }
  }
}

fn drain_staged() -> Vec<PathBuf> {
  STAGED
    .lock()
    .map(|mut guard| std::mem::take(&mut *guard))
    .unwrap_or_default()
}

pub fn release_in_flight() {
  if let Ok(mut guard) = IN_FLIGHT_SINCE.lock() {
    *guard = None;
  }
}

/// Resolve a reported path without consuming the entry.
pub fn peek_staged(candidate: &str) -> Result<PathBuf, Error> {
  let candidate = PathBuf::from(candidate);
  let guard = STAGED
    .lock()
    .map_err(|_| Error::InvalidInput("Forge staging state is poisoned".to_string()))?;

  if guard.contains(&candidate) {
    Ok(candidate)
  } else {
    Err(Error::UnauthorizedPath(candidate.display().to_string()))
  }
}

/// Resolve a reported path to one this bridge actually staged.
pub fn staged_path(candidate: &str) -> Result<PathBuf, Error> {
  let candidate = PathBuf::from(candidate);
  let mut guard = STAGED
    .lock()
    .map_err(|_| Error::InvalidInput("Forge staging state is poisoned".to_string()))?;

  match guard.iter().position(|staged| *staged == candidate) {
    Some(index) => Ok(guard.remove(index)),
    None => Err(Error::UnauthorizedPath(candidate.display().to_string())),
  }
}

fn remember_staged(path: &Path) {
  if let Ok(mut guard) = STAGED.lock() {
    guard.push(path.to_path_buf());
  }
}

fn forget_staged(path: &Path) {
  if let Ok(mut guard) = STAGED.lock() {
    guard.retain(|staged| staged != path);
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  const OK_ORIGIN: &str = "https://deadlockforge.net";
  const OK_HOST: &str = "127.0.0.1:43120";

  fn classify_get(path: &str) -> Decision<'static> {
    classify(&Method::GET, path, Some(OK_HOST), Some(OK_ORIGIN), false)
  }

  #[test]
  fn answers_a_ping_from_an_allowlisted_origin() {
    assert_eq!(
      classify_get("/forge/v1/ping"),
      Decision::Ping { origin: OK_ORIGIN }
    );
  }

  #[test]
  fn refuses_a_foreign_origin_before_anything_else() {
    let decision = classify(
      &Method::POST,
      "/forge/v1/install",
      Some(OK_HOST),
      Some("https://evil.com"),
      false,
    );
    assert_eq!(
      decision,
      Decision::Reject(StatusCode::FORBIDDEN, "BAD_ORIGIN")
    );
  }

  #[test]
  fn refuses_a_missing_origin() {
    let decision = classify(&Method::GET, "/forge/v1/ping", Some(OK_HOST), None, false);
    assert_eq!(
      decision,
      Decision::Reject(StatusCode::FORBIDDEN, "BAD_ORIGIN")
    );
  }

  #[test]
  fn refuses_a_rebound_dns_name_even_from_a_good_origin() {
    let decision = classify(
      &Method::GET,
      "/forge/v1/ping",
      Some("attacker.example.com:43120"),
      Some(OK_ORIGIN),
      false,
    );
    assert_eq!(
      decision,
      Decision::Reject(StatusCode::FORBIDDEN, "BAD_HOST")
    );
  }

  #[test]
  fn grants_private_network_access_only_when_asked() {
    let asked = classify(
      &Method::OPTIONS,
      "/forge/v1/install",
      Some(OK_HOST),
      Some(OK_ORIGIN),
      true,
    );
    assert_eq!(
      asked,
      Decision::Preflight {
        origin: OK_ORIGIN,
        private_network: true
      }
    );

    let not_asked = classify(
      &Method::OPTIONS,
      "/forge/v1/install",
      Some(OK_HOST),
      Some(OK_ORIGIN),
      false,
    );
    assert_eq!(
      not_asked,
      Decision::Preflight {
        origin: OK_ORIGIN,
        private_network: false
      }
    );
  }

  #[test]
  fn does_not_expose_anything_beyond_the_two_routes() {
    assert_eq!(
      classify_get("/forge/v1/anything"),
      Decision::NotFound { origin: OK_ORIGIN }
    );
    assert_eq!(
      classify(
        &Method::GET,
        "/forge/v1/install",
        Some(OK_HOST),
        Some(OK_ORIGIN),
        false
      ),
      Decision::NotFound { origin: OK_ORIGIN }
    );
  }

  #[test]
  fn refuses_a_second_install_while_one_is_awaiting_an_answer() {
    release_in_flight();
    assert!(claim_install_slot().is_some());
    assert!(claim_install_slot().is_none());
    release_in_flight();
    assert!(claim_install_slot().is_some());
    release_in_flight();
  }

  #[test]
  fn takes_over_a_slot_whose_answer_never_came() {
    // Without the timeout a lost dialog would refuse installs all session.
    let stale = std::env::temp_dir().join("deadlockforge-abandoned.vpk");
    remember_staged(&stale);
    *IN_FLIGHT_SINCE.lock().expect("lock") =
      Some(Instant::now() - INSTALL_ANSWER_TIMEOUT - Duration::from_secs(1));

    let abandoned = claim_install_slot().expect("stale slot should be taken over");
    assert_eq!(
      abandoned,
      vec![stale],
      "the leftover payload must come back"
    );
    release_in_flight();
  }

  #[test]
  fn only_deletes_a_path_the_bridge_staged() {
    let path = std::env::temp_dir().join("deadlockforge-test-not-staged.vpk");
    assert!(staged_path(&path.to_string_lossy()).is_err());

    remember_staged(&path);
    assert!(staged_path(&path.to_string_lossy()).is_ok());
    assert!(staged_path(&path.to_string_lossy()).is_err());
  }

  #[test]
  fn allows_every_header_the_site_sends_on_an_install() {
    // Regression: omitting x-forge-type and x-forge-author made the browser
    // refuse the POST, which looked like the app being unreachable.
    for header in [
      "content-type",
      PROTOCOL_HEADER,
      NAME_HEADER,
      "x-forge-type",
      AUTHOR_HEADER,
    ] {
      assert!(
        ALLOWED_REQUEST_HEADERS.contains(header),
        "{header} is sent by the site but not permitted by the preflight"
      );
    }
  }

  #[test]
  fn drops_an_empty_optional_header() {
    assert_eq!(
      decode_optional(Some("Sirsyorrz")),
      Some("Sirsyorrz".to_string())
    );
    assert_eq!(decode_optional(Some("  ")), None);
    assert_eq!(decode_optional(None), None);
  }

  #[test]
  fn accepts_only_the_exact_allowlisted_origins() {
    assert!(allowed_origin(Some("https://deadlockforge.net")).is_some());
    assert!(allowed_origin(Some("https://www.deadlockforge.net")).is_some());
    assert!(allowed_origin(Some("https://deadlockforge.net.evil.com")).is_none());
    assert!(allowed_origin(Some("http://deadlockforge.net")).is_none());
    assert!(allowed_origin(Some("null")).is_none());
    assert!(allowed_origin(None).is_none());
  }

  #[test]
  fn requires_a_loopback_host() {
    assert!(host_is_loopback(Some("127.0.0.1:43120")));
    assert!(host_is_loopback(Some("127.0.0.1")));
    assert!(!host_is_loopback(Some("localhost:43120")));
    assert!(!host_is_loopback(Some("attacker.example.com:43120")));
    assert!(!host_is_loopback(None));
  }

  #[test]
  fn detects_a_vpk_signature() {
    assert!(is_plausible_vpk(&[0x34, 0x12, 0xAA, 0x55, 0x02]));
    assert!(!is_plausible_vpk(&[0x50, 0x4B, 0x03, 0x04]));
    assert!(!is_plausible_vpk(&[0x34, 0x12]));
  }

  #[test]
  fn strips_path_separators_from_the_name() {
    assert_eq!(
      decode_mod_name(Some("Abrams%20Ult%20Airhorn")),
      "Abrams Ult Airhorn"
    );
    assert_eq!(decode_mod_name(Some("..%2F..%2Fetc%2Fpasswd")), "etcpasswd");
    assert_eq!(decode_mod_name(Some("")), "DeadlockForge mod");
    assert_eq!(decode_mod_name(None), "DeadlockForge mod");
  }

  #[test]
  fn caps_an_absurdly_long_name() {
    let long = "a".repeat(500);
    assert_eq!(decode_mod_name(Some(&long)).chars().count(), 120);
  }
}
