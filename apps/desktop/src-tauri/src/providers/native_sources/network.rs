use crate::errors::Error;
use reqwest::{Client, Url};
use serde::de::DeserializeOwned;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::time::Duration;

use super::ResolvedNativeArtifact;

pub const MAX_JSON_BYTES: usize = 10 * 1024 * 1024;
const MAX_ARTIFACT_REDIRECTS: usize = 5;
static SOURCE_REQUESTS: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(4);

pub(super) async fn request_permit() -> Result<tokio::sync::SemaphorePermit<'static>, Error> {
  tokio::time::timeout(Duration::from_secs(30), SOURCE_REQUESTS.acquire())
    .await
    .map_err(|_| invalid("Source request concurrency budget is busy; retry later"))?
    .map_err(|_| invalid("Source request transport is shutting down"))
}

pub(super) fn invalid(message: impl Into<String>) -> Error {
  Error::InvalidInput(format!("Mod source: {}", message.into()))
}

/// Returns a credential-free HTTP URL. HTTP and non-public hosts need an
/// explicit enrollment opt-in; every actual request also checks resolved IPs.
pub fn validate_source_url(value: &str, allow_local_network: bool) -> Result<Url, Error> {
  if value.len() > 8192 {
    return Err(invalid("URL exceeds the 8192-character limit"));
  }
  let mut url = Url::parse(value).map_err(|_| invalid("Invalid descriptor or resource URL"))?;
  if !url.username().is_empty() || url.password().is_some() || url.host_str().is_none() {
    return Err(invalid(
      "URLs must have a host and cannot contain credentials",
    ));
  }
  if url.scheme() != "https" && !(allow_local_network && url.scheme() == "http") {
    return Err(invalid(
      "HTTPS is required; local HTTP needs explicit opt-in",
    ));
  }
  if let Some(host) = url.host_str() {
    let literal = host.trim_start_matches('[').trim_end_matches(']');
    if !allow_local_network
      && (host.eq_ignore_ascii_case("localhost")
        || host.ends_with(".localhost")
        || host.ends_with(".local")
        || literal.parse::<IpAddr>().is_ok_and(|ip| !is_public_ip(ip)))
    {
      return Err(invalid(
        "Local/private network access needs explicit opt-in",
      ));
    }
  }
  url.set_fragment(None);
  Ok(url)
}

pub(super) fn resolve_url(
  base: &Url,
  value: &str,
  origins: &[String],
  allow_local_network: bool,
) -> Result<Url, Error> {
  let joined = base
    .join(value)
    .map_err(|_| invalid("Invalid relative resource URL"))?;
  let url = validate_source_url(joined.as_str(), allow_local_network)?;
  if !origins.contains(&url.origin().ascii_serialization()) {
    return Err(invalid(
      "Resource origin was not accepted for this source operation",
    ));
  }
  Ok(url)
}

fn is_public_v4(ip: Ipv4Addr) -> bool {
  let [a, b, c, _] = ip.octets();
  !(ip.is_private()
    || ip.is_loopback()
    || ip.is_link_local()
    || ip.is_broadcast()
    || ip.is_documentation()
    || ip.is_unspecified()
    || ip.is_multicast()
    || a == 0
    || a >= 240
    || (a == 100 && (64..=127).contains(&b))
    || (a == 198 && (b == 18 || b == 19))
    || (a == 192 && b == 0 && c == 0))
}

fn is_public_v6(ip: Ipv6Addr) -> bool {
  if let Some(v4) = ip.to_ipv4_mapped() {
    return is_public_v4(v4);
  }
  let segments = ip.segments();
  // Only global unicast; exclude documentation, transition and protocol ranges.
  (segments[0] & 0xe000) == 0x2000
    && segments[0] != 0x2002
    && !(segments[0] == 0x2001 && segments[1] < 0x0200)
    && !(segments[0] == 0x2001 && segments[1] == 0x0db8)
    && !(segments[0] == 0x3fff && segments[1] < 0x1000)
}

fn is_public_ip(ip: IpAddr) -> bool {
  match ip {
    IpAddr::V4(ip) => is_public_v4(ip),
    IpAddr::V6(ip) => is_public_v6(ip),
  }
}

/// Pins the validated DNS result to the connection, avoiding a second lookup
/// after the public-address check. Redirects and environment proxies are off.
pub async fn source_request_client(url: &Url, allow_local_network: bool) -> Result<Client, Error> {
  request_client(url, allow_local_network, Duration::from_secs(30)).await
}

async fn request_client(
  url: &Url,
  allow_local_network: bool,
  timeout: Duration,
) -> Result<Client, Error> {
  let (host, addresses) = pinned_addresses(url, allow_local_network).await?;
  transport_builder(timeout)
    .redirect(reqwest::redirect::Policy::none())
    .resolve_to_addrs(&host, &addresses)
    .build()
    .map_err(|_| Error::Network("Could not initialize mod source transport".into()))
}

fn transport_builder(timeout: Duration) -> reqwest::ClientBuilder {
  Client::builder()
    .no_proxy()
    .connect_timeout(Duration::from_secs(10))
    .timeout(timeout)
    .user_agent("DeadlockModManager/native-source-v1")
}

async fn pinned_addresses(
  url: &Url,
  allow_local_network: bool,
) -> Result<(String, Vec<SocketAddr>), Error> {
  validate_source_url(url.as_str(), allow_local_network)?;
  let host = url.host_str().ok_or_else(|| invalid("URL has no host"))?;
  let lookup_host = host.trim_start_matches('[').trim_end_matches(']');
  let port = url
    .port_or_known_default()
    .ok_or_else(|| invalid("URL has no port"))?;
  let addresses: Vec<_> = tokio::time::timeout(
    Duration::from_secs(10),
    tokio::net::lookup_host((lookup_host, port)),
  )
  .await
  .map_err(|_| Error::Network("Mod source host resolution timed out".into()))?
  .map_err(|_| Error::Network("Mod source host could not be resolved".into()))?
  .collect();
  if addresses.is_empty()
    || (!allow_local_network && addresses.iter().any(|a| !is_public_ip(a.ip())))
  {
    return Err(invalid(
      "Source resolved to a private or reserved network address",
    ));
  }
  Ok((host.to_string(), addresses))
}

/// Artifact URLs often redirect to storage (a presigned bucket URL), so
/// redirects are followed, but only to the source's declared download origins.
/// Every one of those hosts is resolved and pinned up front, so a redirect gets
/// the same public-address check as the first request.
pub async fn artifact_download_client(artifact: &ResolvedNativeArtifact) -> Result<Client, Error> {
  let allow_local_network = artifact.allow_local_network;
  let url = validate_source_url(&artifact.url, allow_local_network)?;
  if !artifact
    .allowed_origins
    .contains(&url.origin().ascii_serialization())
  {
    return Err(invalid("Artifact destination origin was not accepted"));
  }
  let mut builder = transport_builder(Duration::from_secs(60 * 60));
  let (host, addresses) = pinned_addresses(&url, allow_local_network).await?;
  builder = builder.resolve_to_addrs(&host, &addresses);
  let mut pinned_hosts = vec![host];
  for origin in &artifact.allowed_origins {
    let Ok(origin_url) = Url::parse(origin) else {
      continue;
    };
    if origin_url
      .host_str()
      .is_none_or(|host| pinned_hosts.iter().any(|pinned| pinned == host))
    {
      continue;
    }
    let (host, addresses) = pinned_addresses(&origin_url, allow_local_network).await?;
    builder = builder.resolve_to_addrs(&host, &addresses);
    pinned_hosts.push(host);
  }
  let allowed_origins = artifact.allowed_origins.clone();
  builder
    .redirect(reqwest::redirect::Policy::custom(move |attempt| {
      if attempt.previous().len() >= MAX_ARTIFACT_REDIRECTS {
        return attempt.error("Mod source download redirected too many times");
      }
      let accepted = validate_source_url(attempt.url().as_str(), allow_local_network)
        .is_ok_and(|next| allowed_origins.contains(&next.origin().ascii_serialization()));
      if accepted {
        attempt.follow()
      } else {
        attempt.error("Mod source download redirected outside its declared download origins")
      }
    }))
    .build()
    .map_err(|_| Error::Network("Could not initialize mod source transport".into()))
}

pub(super) async fn fetch_json<T: DeserializeOwned>(
  url: &Url,
  allow_local_network: bool,
) -> Result<T, Error> {
  let _permit = request_permit().await?;
  let client = source_request_client(url, allow_local_network).await?;
  let mut response = client
    .get(url.clone())
    .send()
    .await
    .map_err(|_| Error::Network("Mod source request failed".into()))?;
  if !response.status().is_success() {
    return Err(Error::Network(format!(
      "Mod source returned HTTP {} (redirects require an explicit accepted URL)",
      response.status().as_u16()
    )));
  }
  if response
    .content_length()
    .is_some_and(|size| size > MAX_JSON_BYTES as u64)
  {
    return Err(invalid("JSON response exceeds the 10 MiB limit"));
  }
  let mut bytes = Vec::new();
  while let Some(chunk) = response
    .chunk()
    .await
    .map_err(|_| Error::Network("Mod source response interrupted".into()))?
  {
    if bytes.len() + chunk.len() > MAX_JSON_BYTES {
      return Err(invalid("JSON response exceeds the 10 MiB limit"));
    }
    bytes.extend_from_slice(&chunk);
  }
  serde_json::from_slice(&bytes).map_err(|error| {
    invalid(format!(
      "Response does not match the native source contract: {error}"
    ))
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn public_policy_rejects_private_and_reserved_addresses() {
    for address in [
      "127.0.0.1",
      "10.0.0.1",
      "100.64.0.1",
      "169.254.1.1",
      "192.0.2.1",
      "::1",
      "::ffff:127.0.0.1",
      "2001:db8::1",
      "64:ff9b::a00:1",
    ] {
      assert!(!is_public_ip(address.parse().unwrap()), "{address}");
    }
    assert!(is_public_ip("1.1.1.1".parse().unwrap()));
    assert!(is_public_ip("2606:4700:4700::1111".parse().unwrap()));
  }

  #[test]
  fn source_urls_need_explicit_local_opt_in_and_never_accept_credentials() {
    assert!(validate_source_url("http://127.0.0.1/source.json", false).is_err());
    assert!(validate_source_url("http://127.0.0.1/source.json", true).is_ok());
    assert!(validate_source_url("https://user:pass@example.org/source.json", true).is_err());
    assert!(validate_source_url("file:///source.json", true).is_err());
  }
}
