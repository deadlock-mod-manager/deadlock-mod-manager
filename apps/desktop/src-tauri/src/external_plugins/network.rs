//! `http.fetch` transport. The runtime has already checked the request
//! against the plugin's grant; this layer refuses destinations that resolve
//! to non-public addresses, follows no redirects, ignores proxies (so the
//! address check covers the real destination) and caps time and size.

use dmm_plugin_runtime::{Error as RuntimeError, HttpRequest, HttpResponse};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::sync::{Arc, OnceLock};
use std::time::Duration;

const TIMEOUT: Duration = Duration::from_secs(15);
const MAX_RESPONSE_BYTES: usize = 4 * 1024 * 1024;

fn host_error(code: &'static str, message: impl Into<String>) -> RuntimeError {
  RuntimeError::Host {
    code,
    message: message.into(),
  }
}

fn is_public_v4(ip: Ipv4Addr) -> bool {
  let [a, b, c, _] = ip.octets();
  !(ip.is_unspecified()
    || ip.is_loopback()
    || ip.is_private()
    || ip.is_link_local()
    || ip.is_broadcast()
    || ip.is_documentation()
    || ip.is_multicast()
    || a == 0
    || (a == 100 && (64..128).contains(&b))
    || (a == 192 && b == 0 && c == 0)
    || (a == 198 && (18..20).contains(&b))
    || a >= 240)
}

fn is_public_v6(ip: Ipv6Addr) -> bool {
  if let Some(mapped) = ip.to_ipv4_mapped() {
    return is_public_v4(mapped);
  }
  let segments = ip.segments();
  let embedded_v4 =
    |high: u16, low: u16| Ipv4Addr::new((high >> 8) as u8, high as u8, (low >> 8) as u8, low as u8);
  // NAT64 (64:ff9b::/96) and 6to4 (2002::/16) reach the IPv4 they embed.
  if segments[..6] == [0x64, 0xff9b, 0, 0, 0, 0] {
    return is_public_v4(embedded_v4(segments[6], segments[7]));
  }
  if segments[0] == 0x2002 {
    return is_public_v4(embedded_v4(segments[1], segments[2]));
  }
  !(ip.is_unspecified()
    || ip.is_loopback()
    || ip.is_multicast()
    || (segments[0] & 0xfe00) == 0xfc00
    || (segments[0] & 0xffc0) == 0xfe80
    || (segments[0] & 0xffc0) == 0xfec0
    || (segments[0] == 0x2001 && segments[1] == 0x0db8)
    || segments[..6] == [0, 0, 0, 0, 0, 0])
}

pub fn is_public(ip: IpAddr) -> bool {
  match ip {
    IpAddr::V4(ip) => is_public_v4(ip),
    IpAddr::V6(ip) => is_public_v6(ip),
  }
}

/// A destination that resolved only to private, loopback or link-local
/// addresses.
#[derive(Debug)]
struct PrivateDestination(String);

impl std::fmt::Display for PrivateDestination {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    write!(f, "{} does not resolve to a public address", self.0)
  }
}

impl std::error::Error for PrivateDestination {}

/// The system resolver with every non-public address removed, so the
/// connection can only go to an address that passed the check.
struct PublicResolver;

impl reqwest::dns::Resolve for PublicResolver {
  fn resolve(&self, name: reqwest::dns::Name) -> reqwest::dns::Resolving {
    let host = name.as_str().to_owned();
    Box::pin(async move {
      let public: Vec<SocketAddr> = tokio::net::lookup_host((host.as_str(), 0))
        .await?
        .filter(|address| is_public(address.ip()))
        .collect();
      if public.is_empty() {
        return Err(Box::new(PrivateDestination(host)) as Box<dyn std::error::Error + Send + Sync>);
      }
      Ok(Box::new(public.into_iter()) as reqwest::dns::Addrs)
    })
  }
}

fn client() -> Result<&'static reqwest::Client, RuntimeError> {
  static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
  if let Some(client) = CLIENT.get() {
    return Ok(client);
  }
  let client = reqwest::Client::builder()
    .no_proxy()
    .https_only(true)
    .redirect(reqwest::redirect::Policy::none())
    .referer(false)
    .timeout(TIMEOUT)
    .dns_resolver(Arc::new(PublicResolver))
    .user_agent(concat!("DeadlockModManager/", env!("CARGO_PKG_VERSION")))
    .build()
    .map_err(|error| host_error("network_error", error.to_string()))?;
  Ok(CLIENT.get_or_init(|| client))
}

fn failure(error: &reqwest::Error) -> RuntimeError {
  let mut source: Option<&(dyn std::error::Error + 'static)> = Some(error);
  while let Some(current) = source {
    if let Some(private) = current.downcast_ref::<PrivateDestination>() {
      return host_error("destination_refused", private.to_string());
    }
    source = current.source();
  }
  let message = if error.is_timeout() {
    "The request timed out after 15 seconds".to_owned()
  } else {
    error.to_string()
  };
  host_error("network_error", message)
}

async fn perform(request: &HttpRequest) -> Result<HttpResponse, RuntimeError> {
  let url =
    reqwest::Url::parse(&request.url).map_err(|_| host_error("invalid_params", "Invalid URL"))?;
  if url.scheme() != "https"
    || url.host_str() != Some(request.host.as_str())
    || url.port().is_some()
    || !url.username().is_empty()
    || url.password().is_some()
  {
    return Err(host_error(
      "permission_denied",
      "The URL does not name the approved host",
    ));
  }
  let method = reqwest::Method::from_bytes(request.method.as_bytes())
    .map_err(|_| host_error("invalid_params", "Invalid method"))?;
  let mut builder = client()?.request(method, url);
  for (name, value) in &request.headers {
    builder = builder.header(name, value);
  }
  if !request.body.is_empty() {
    builder = builder.body(request.body.clone());
  }
  let mut response = builder.send().await.map_err(|error| failure(&error))?;
  let too_large = || host_error("response_too_large", "The response exceeds 4 MiB");
  if response
    .content_length()
    .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
  {
    return Err(too_large());
  }
  let status = response.status().as_u16();
  let headers = response
    .headers()
    .iter()
    .filter_map(|(name, value)| {
      value
        .to_str()
        .ok()
        .map(|value| (name.as_str().to_owned(), value.to_owned()))
    })
    .collect();
  let mut body = Vec::new();
  while let Some(chunk) = response.chunk().await.map_err(|error| failure(&error))? {
    if body.len() + chunk.len() > MAX_RESPONSE_BYTES {
      return Err(too_large());
    }
    body.extend_from_slice(&chunk);
  }
  Ok(HttpResponse {
    status,
    headers,
    body,
  })
}

/// Performs `request` from a hostcall thread. Hostcalls run on plain threads
/// or the blocking pool, never on an async worker, so blocking on the app
/// runtime here is sound.
pub fn fetch(request: &HttpRequest) -> Result<HttpResponse, RuntimeError> {
  tauri::async_runtime::block_on(perform(request))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn only_public_addresses_pass() {
    for private in [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "255.255.255.255",
      "::1",
      "::",
      "fe80::1",
      "fd00::1",
      "::ffff:127.0.0.1",
      "::ffff:10.0.0.1",
      "64:ff9b::a00:1",
      "2002:c0a8:101::1",
    ] {
      assert!(!is_public(private.parse().unwrap()), "{private}");
    }
    for public in ["1.1.1.1", "93.184.216.34", "2606:4700:4700::1111"] {
      assert!(is_public(public.parse().unwrap()), "{public}");
    }
  }

  #[test]
  fn refuses_names_that_resolve_to_loopback() {
    let request = HttpRequest {
      url: "https://localhost/".into(),
      host: "localhost".into(),
      method: "GET".into(),
      headers: Vec::new(),
      body: Vec::new(),
    };
    match fetch(&request) {
      Err(RuntimeError::Host { code, .. }) => assert_eq!(code, "destination_refused"),
      other => panic!("expected a refusal, got {other:?}"),
    }
  }

  #[test]
  fn refuses_urls_naming_another_host() {
    let request = HttpRequest {
      url: "https://evil.example.com/".into(),
      host: "api.example.com".into(),
      method: "GET".into(),
      headers: Vec::new(),
      body: Vec::new(),
    };
    assert!(matches!(
      fetch(&request),
      Err(RuntimeError::Host {
        code: "permission_denied",
        ..
      })
    ));
  }
}
