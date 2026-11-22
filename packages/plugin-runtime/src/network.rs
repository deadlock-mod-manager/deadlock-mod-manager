//! `http.fetch` policy. The runtime checks every request against the
//! plugin's approved hosts and the host's request rules; the adapter performs
//! it and enforces the transport rules (no redirects, no private addresses,
//! timeout, response cap).

use super::adapter::{HttpRequest, HttpResponse};
use super::files::{Encoding, encode_base64};
use super::manifest::is_network_host;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const MAX_REQUEST_BODY_BYTES: usize = 1024 * 1024;
pub const MAX_RESPONSE_BODY_BYTES: usize = 4 * 1024 * 1024;
const MAX_URL_BYTES: usize = 2048;
const MAX_HEADERS: usize = 32;
const MAX_HEADER_VALUE_BYTES: usize = 8192;
const METHODS: [&str; 5] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
/// Ambient credentials, routing and hop-by-hop headers stay with the host.
const FORBIDDEN_HEADERS: [&str; 13] = [
  "connection",
  "content-length",
  "cookie",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "cookie2",
];
/// Response headers plugins never see.
const HIDDEN_RESPONSE_HEADERS: [&str; 2] = ["set-cookie", "set-cookie2"];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FetchParams {
  pub url: String,
  pub method: String,
  #[serde(default)]
  pub headers: BTreeMap<String, String>,
  #[serde(default)]
  pub body: Option<String>,
  #[serde(default)]
  pub body_encoding: Option<Encoding>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Refusal {
  /// A well-formed URL whose host the grant does not list.
  HostNotAllowed(String),
  Invalid(String),
}

fn invalid(message: impl Into<String>) -> Refusal {
  Refusal::Invalid(message.into())
}

/// The authority of an `https://` URL, which must be a bare host name: no
/// credentials, no port.
fn url_host(url: &str) -> Result<&str, Refusal> {
  let rest = url
    .strip_prefix("https://")
    .ok_or_else(|| invalid("Only https:// URLs are allowed"))?;
  let host = &rest[..rest.find(['/', '?', '#']).unwrap_or(rest.len())];
  if !is_network_host(host) {
    return Err(invalid(
      "The URL must name a host without credentials, port or IP address",
    ));
  }
  Ok(host)
}

fn is_token(name: &str) -> bool {
  (1..=64).contains(&name.len())
    && name
      .bytes()
      .all(|byte| byte.is_ascii_alphanumeric() || b"!#$%&'*+-.^_`|~".contains(&byte))
}

/// Checks a plugin's request against `hosts` and the request rules.
pub fn check(params: FetchParams, hosts: &[String]) -> Result<HttpRequest, Refusal> {
  if params.url.len() > MAX_URL_BYTES
    || params
      .url
      .chars()
      .any(|ch| ch.is_control() || ch.is_whitespace() || ch == '\\')
  {
    return Err(invalid(
      "The URL must be at most 2048 characters without spaces, control characters or backslashes",
    ));
  }
  let host = url_host(&params.url)?.to_owned();
  if !hosts.contains(&host) {
    return Err(Refusal::HostNotAllowed(host));
  }
  if !METHODS.contains(&params.method.as_str()) {
    return Err(invalid("method must be GET, POST, PUT, PATCH or DELETE"));
  }
  if params.headers.len() > MAX_HEADERS {
    return Err(invalid("At most 32 headers are allowed"));
  }
  let mut headers = Vec::with_capacity(params.headers.len());
  for (name, value) in params.headers {
    let name = name.to_ascii_lowercase();
    if !is_token(&name) {
      return Err(invalid(format!("{name} is not a valid header name")));
    }
    if FORBIDDEN_HEADERS.contains(&name.as_str()) {
      return Err(invalid(format!("The {name} header is set by the host")));
    }
    if value.len() > MAX_HEADER_VALUE_BYTES || value.chars().any(|ch| ch.is_control() && ch != '\t')
    {
      return Err(invalid(format!("The {name} header value is not allowed")));
    }
    headers.push((name, value));
  }
  let body = match params.body {
    Some(body) => params
      .body_encoding
      .unwrap_or(Encoding::Utf8)
      .decode(&body)
      .map_err(|_| invalid("body is not valid for its bodyEncoding"))?,
    None => Vec::new(),
  };
  if body.len() > MAX_REQUEST_BODY_BYTES {
    return Err(invalid("Request bodies are limited to 1 MiB"));
  }
  Ok(HttpRequest {
    url: params.url,
    host,
    method: params.method,
    headers,
    body,
  })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchResult {
  pub status: u16,
  pub headers: BTreeMap<String, String>,
  pub body: String,
  pub body_encoding: Encoding,
}

/// Shapes a response for the plugin: lowercase header names with repeated
/// headers joined, cookies removed, and the body as UTF-8 text when it is
/// text, base64 otherwise.
pub fn result(response: HttpResponse) -> Result<FetchResult, String> {
  if response.body.len() > MAX_RESPONSE_BODY_BYTES {
    return Err("The response exceeds 4 MiB".into());
  }
  let mut headers: BTreeMap<String, String> = BTreeMap::new();
  for (name, value) in response.headers {
    let name = name.to_ascii_lowercase();
    if HIDDEN_RESPONSE_HEADERS.contains(&name.as_str()) {
      continue;
    }
    headers
      .entry(name)
      .and_modify(|joined| {
        joined.push_str(", ");
        joined.push_str(&value);
      })
      .or_insert(value);
  }
  let (body, body_encoding) = match String::from_utf8(response.body) {
    Ok(text) => (text, Encoding::Utf8),
    Err(error) => (encode_base64(error.as_bytes()), Encoding::Base64),
  };
  Ok(FetchResult {
    status: response.status,
    headers,
    body,
    body_encoding,
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  fn fetch(request: serde_json::Value) -> Result<HttpRequest, Refusal> {
    let hosts = ["api.example.com".to_owned()];
    check(serde_json::from_value(request).unwrap(), &hosts)
  }

  fn get(url: &str) -> Result<HttpRequest, Refusal> {
    fetch(json!({ "url": url, "method": "GET" }))
  }

  #[test]
  fn allows_https_to_listed_hosts_only() {
    let request = get("https://api.example.com/v1/items?q=1").unwrap();
    assert_eq!(request.host, "api.example.com");
    assert_eq!(
      get("https://evil.example.com/"),
      Err(Refusal::HostNotAllowed("evil.example.com".into()))
    );
    assert_eq!(
      get("https://example.com"),
      Err(Refusal::HostNotAllowed("example.com".into()))
    );
    for url in [
      "http://api.example.com/",
      "HTTPS://api.example.com/",
      "https://api.example.com:8443/",
      "https://user@api.example.com/",
      "https://api.example.com@evil.com/",
      "https://API.example.com/",
      "https://127.0.0.1/",
      "https://[::1]/",
      "https://localhost/",
      "https://api.example.com\\@evil.com/",
      "https://api.example.com/ x",
      "ftp://api.example.com/",
      "//api.example.com/",
    ] {
      assert!(matches!(get(url), Err(Refusal::Invalid(_))), "{url}");
    }
  }

  #[test]
  fn enforces_methods_headers_and_body_limits() {
    let url = "https://api.example.com/upload";
    for method in ["HEAD", "OPTIONS", "CONNECT", "get", "TRACE"] {
      assert!(
        fetch(json!({ "url": url, "method": method })).is_err(),
        "{method}"
      );
    }
    for name in [
      "Cookie",
      "host",
      "Connection",
      "Transfer-Encoding",
      "Upgrade",
      "Proxy-Authorization",
      "TE",
      "Bad Name",
    ] {
      let request = json!({ "url": url, "method": "POST", "headers": { name: "x" } });
      assert!(fetch(request).is_err(), "{name}");
    }
    let split = json!({ "url": url, "method": "POST", "headers": { "x-a": "1\r\nHost: evil" } });
    assert!(fetch(split).is_err());
    let ok = fetch(json!({
      "url": url,
      "method": "POST",
      "headers": { "Content-Type": "application/json", "Authorization": "Bearer t" },
      "body": "aGk=",
      "bodyEncoding": "base64"
    }))
    .unwrap();
    assert_eq!(ok.body, b"hi");
    assert_eq!(
      ok.headers[1],
      ("content-type".into(), "application/json".into())
    );
    let large = "x".repeat(MAX_REQUEST_BODY_BYTES + 1);
    assert!(fetch(json!({ "url": url, "method": "PUT", "body": large })).is_err());
    assert!(
      serde_json::from_value::<FetchParams>(json!({ "url": url, "method": "GET", "follow": true }))
        .is_err()
    );
  }

  #[test]
  fn hides_cookies_and_encodes_binary_bodies() {
    let shaped = result(HttpResponse {
      status: 200,
      headers: vec![
        ("Set-Cookie".into(), "a=1".into()),
        ("Vary".into(), "a".into()),
        ("vary".into(), "b".into()),
      ],
      body: vec![0xff, 0x00],
    })
    .unwrap();
    assert!(!shaped.headers.contains_key("set-cookie"));
    assert_eq!(shaped.headers["vary"], "a, b");
    assert_eq!(shaped.body_encoding, Encoding::Base64);
    assert_eq!(shaped.body, encode_base64(&[0xff, 0x00]));
    let too_large = HttpResponse {
      status: 200,
      headers: Vec::new(),
      body: vec![b'x'; MAX_RESPONSE_BODY_BYTES + 1],
    };
    assert!(result(too_large).is_err());
  }
}
