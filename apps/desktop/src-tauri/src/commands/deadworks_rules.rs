//! What a Deadworks server says it needs, read straight off the game server.
//!
//! Servers publish their addons, maps and download URL as `dw_*` keys in their
//! A2S_RULES reply (<https://docs.deadworks.net/guides/content-discovery/>).
//! Every value is untrusted: names become file names and the URL is fetched.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::time::Duration;

use tokio::net::UdpSocket;
use tokio::time::{Instant, timeout_at};

use crate::errors::Error;

const RULES_REQUEST: [u8; 5] = [0xFF, 0xFF, 0xFF, 0xFF, 0x56];
const NO_CHALLENGE: [u8; 4] = [0xFF; 4];
const CHALLENGE_REPLY: u8 = 0x41;
const RULES_REPLY: u8 = 0x45;
/// The spec's budget: no reply within it means the server advertises nothing.
const RULES_DEADLINE: Duration = Duration::from_millis(1500);
/// Resend interval, so one lost datagram does not cost the whole budget.
const RESEND_INTERVAL: Duration = Duration::from_millis(500);
const MAX_NAME_LEN: usize = 64;
const HASH_LEN: usize = 16;
const WINDOWS_DEVICE_NAMES: [&str; 4] = ["con", "prn", "aux", "nul"];

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum ContentKind {
  Addon,
  Map,
}

impl ContentKind {
  /// Directory segment in the fastdl layout and prefix in cache keys.
  pub fn dir(self) -> &'static str {
    match self {
      ContentKind::Addon => "addons",
      ContentKind::Map => "maps",
    }
  }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ContentEntry {
  pub kind: ContentKind,
  pub name: String,
  /// First 16 hex digits of the SHA-256 of the uncompressed `.vpk`.
  pub hash: String,
  /// Uncompressed size, when the server sent one.
  pub size: Option<u64>,
}

impl ContentEntry {
  /// Stable id the frontend echoes back to accept a mismatched build.
  pub fn key(&self) -> String {
    format!("{}:{}", self.kind.dir(), self.name)
  }
}

#[derive(Debug, PartialEq, Eq)]
pub struct Advertisement {
  pub entries: Vec<ContentEntry>,
  /// The server dropped entries to fit one datagram; install what is listed.
  pub truncated: bool,
  pub fastdl: Option<reqwest::Url>,
}

fn is_valid_name(name: &str) -> bool {
  if name.is_empty() || name.len() > MAX_NAME_LEN {
    return false;
  }
  if !name
    .bytes()
    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
  {
    return false;
  }
  if WINDOWS_DEVICE_NAMES.contains(&name) {
    return false;
  }
  // com1-com9 and lpt1-lpt9
  let bytes = name.as_bytes();
  !(bytes.len() == 4
    && (name.starts_with("com") || name.starts_with("lpt"))
    && (b'1'..=b'9').contains(&bytes[3]))
}

fn is_valid_hash(hash: &str) -> bool {
  hash.len() == HASH_LEN
    && hash
      .bytes()
      .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// Parse one `name[:hash[:size]]` entry. An entry without a hash means the
/// server could not read the file, so it is skipped like an invalid one.
fn parse_entry(kind: ContentKind, raw: &str) -> Option<ContentEntry> {
  let mut parts = raw.split(':');
  let name = parts.next()?;
  let hash = parts.next()?;
  let size = match parts.next() {
    Some(size) if !size.is_empty() && size.bytes().all(|b| b.is_ascii_digit()) => {
      Some(size.parse::<u64>().ok()?)
    }
    Some(_) => return None,
    None => None,
  };
  if parts.next().is_some() || !is_valid_name(name) || !is_valid_hash(hash) {
    return None;
  }
  Some(ContentEntry {
    kind,
    name: name.to_string(),
    hash: hash.to_string(),
    size,
  })
}

/// Entries plus whether the server listed fewer than its `_n` count.
fn parse_list(
  rules: &HashMap<String, String>,
  key: &str,
  kind: ContentKind,
) -> (Vec<ContentEntry>, bool) {
  let raw: Vec<&str> = rules
    .get(key)
    .map(|value| value.split(',').filter(|e| !e.is_empty()).collect())
    .unwrap_or_default();
  let advertised_total = rules
    .get(&format!("{key}_n"))
    .and_then(|n| n.trim().parse::<usize>().ok())
    .unwrap_or(raw.len());
  let entries = raw.iter().filter_map(|e| parse_entry(kind, e)).collect();
  (entries, raw.len() < advertised_total)
}

/// An absolute http(s) URL with a host and no credentials, query or fragment.
/// Anything else is treated as absent.
fn parse_fastdl(raw: &str) -> Option<reqwest::Url> {
  let trimmed = raw.trim().trim_end_matches('/');
  let url = reqwest::Url::parse(trimmed).ok()?;
  let ok = matches!(url.scheme(), "http" | "https")
    && url.host_str().is_some_and(|h| !h.is_empty())
    && url.username().is_empty()
    && url.password().is_none()
    && url.query().is_none()
    && url.fragment().is_none();
  ok.then_some(url)
}

/// `None` when the server does not speak version 1 of the spec.
pub fn parse_advertisement(rules: &HashMap<String, String>) -> Option<Advertisement> {
  if rules.get("dw_ver").map(|v| v.trim()) != Some("1") {
    return None;
  }
  let (mut entries, addons_truncated) = parse_list(rules, "dw_addons", ContentKind::Addon);
  let (maps, maps_truncated) = parse_list(rules, "dw_maps", ContentKind::Map);
  entries.extend(maps);
  Some(Advertisement {
    entries,
    truncated: addons_truncated || maps_truncated,
    fastdl: rules.get("dw_fastdl").and_then(|v| parse_fastdl(v)),
  })
}

fn read_cstr(data: &[u8], pos: &mut usize) -> Option<String> {
  let rest = data.get(*pos..)?;
  let end = rest.iter().position(|&b| b == 0)?;
  let value = String::from_utf8_lossy(&rest[..end]).into_owned();
  *pos += end + 1;
  Some(value)
}

/// Parse an `FF FF FF FF 45` reply. Rule order is not relied on.
fn parse_rules_reply(data: &[u8]) -> Option<HashMap<String, String>> {
  if data.len() < 7 || data[..4] != [0xFF; 4] || data[4] != RULES_REPLY {
    return None;
  }
  let count = u16::from_le_bytes([data[5], data[6]]);
  let mut pos = 7;
  let mut rules = HashMap::with_capacity(count as usize);
  for _ in 0..count {
    let Some(name) = read_cstr(data, &mut pos) else {
      break;
    };
    let Some(value) = read_cstr(data, &mut pos) else {
      break;
    };
    rules.insert(name, value);
  }
  Some(rules)
}

fn rules_request(challenge: [u8; 4]) -> [u8; 9] {
  let mut packet = [0_u8; 9];
  packet[..5].copy_from_slice(&RULES_REQUEST);
  packet[5..].copy_from_slice(&challenge);
  packet
}

/// Query A2S_RULES, answering the challenge. Returns `None` when the server
/// stays silent for the spec's budget, which means it advertises nothing.
///
/// Source addresses can be spoofed, so a rules reply only counts after we have
/// echoed a challenge, except on loopback where the server skips it.
pub async fn query_rules(target: SocketAddr) -> Result<Option<HashMap<String, String>>, Error> {
  let bind = if target.is_ipv4() {
    "0.0.0.0:0"
  } else {
    "[::]:0"
  };
  let socket = UdpSocket::bind(bind)
    .await
    .map_err(|e| Error::Network(format!("Could not open a UDP socket: {e}")))?;

  let deadline = Instant::now() + RULES_DEADLINE;
  let mut challenge = NO_CHALLENGE;
  let mut echoed = false;
  let mut buf = [0_u8; 1400];

  while Instant::now() < deadline {
    socket
      .send_to(&rules_request(challenge), target)
      .await
      .map_err(|e| Error::Network(format!("A2S_RULES request failed: {e}")))?;
    let resend_at = (Instant::now() + RESEND_INTERVAL).min(deadline);

    loop {
      let Ok(received) = timeout_at(resend_at, socket.recv_from(&mut buf)).await else {
        break;
      };
      let Ok((len, from)) = received else {
        break;
      };
      if from != target {
        continue;
      }
      let reply = &buf[..len];
      if len >= 9 && reply[..4] == [0xFF; 4] && reply[4] == CHALLENGE_REPLY {
        challenge.copy_from_slice(&reply[5..9]);
        echoed = true;
        break;
      }
      if (echoed || target.ip().is_loopback())
        && let Some(rules) = parse_rules_reply(reply)
      {
        return Ok(Some(rules));
      }
    }
  }
  Ok(None)
}

#[cfg(test)]
mod tests {
  use super::*;

  fn rules(pairs: &[(&str, &str)]) -> HashMap<String, String> {
    pairs
      .iter()
      .map(|(k, v)| (k.to_string(), v.to_string()))
      .collect()
  }

  #[test]
  fn parses_the_spec_example() {
    let ad = parse_advertisement(&rules(&[
      ("dw_ver", "1"),
      ("dw_addons", "turbo:9330149c74886724:11965"),
      ("dw_addons_n", "1"),
      ("dw_maps", "dl_midtown:faf73184b902d52d:1053579891"),
      ("dw_maps_n", "1"),
      ("dw_digest", "8a1b839d"),
      ("dw_fastdl", " https://dl.example.com/deadworks/ "),
    ]))
    .expect("version 1");

    assert!(!ad.truncated);
    assert_eq!(
      ad.fastdl.map(|u| u.to_string()),
      Some("https://dl.example.com/deadworks".to_string())
    );
    assert_eq!(
      ad.entries,
      vec![
        ContentEntry {
          kind: ContentKind::Addon,
          name: "turbo".into(),
          hash: "9330149c74886724".into(),
          size: Some(11965),
        },
        ContentEntry {
          kind: ContentKind::Map,
          name: "dl_midtown".into(),
          hash: "faf73184b902d52d".into(),
          size: Some(1_053_579_891),
        },
      ]
    );
  }

  #[test]
  fn ignores_everything_without_version_one() {
    assert!(parse_advertisement(&rules(&[("dw_addons", "a:9330149c74886724")])).is_none());
    assert!(parse_advertisement(&rules(&[("dw_ver", "2")])).is_none());
  }

  #[test]
  fn flags_lists_shorter_than_their_count() {
    let ad = parse_advertisement(&rules(&[
      ("dw_ver", "1"),
      ("dw_addons", "a:9330149c74886724"),
      ("dw_addons_n", "3"),
    ]))
    .expect("version 1");
    assert!(ad.truncated);
    assert_eq!(ad.entries.len(), 1);
  }

  #[test]
  fn drops_entries_that_could_escape_or_collide() {
    for raw in [
      "unhashed",
      "../evil:9330149c74886724",
      "Turbo:9330149c74886724",
      "com1:9330149c74886724",
      "nul:9330149c74886724",
      "a:9330149C74886724",
      "a:93301:1",
      "a:9330149c74886724:-1",
      "a:9330149c74886724:99999999999999999999",
      "a:9330149c74886724:1:extra",
    ] {
      assert_eq!(parse_entry(ContentKind::Addon, raw), None, "{raw}");
    }
    assert!(parse_entry(ContentKind::Addon, "com10:9330149c74886724").is_some());
  }

  #[test]
  fn rejects_fastdl_urls_with_credentials_query_or_odd_schemes() {
    for raw in [
      "ftp://dl.example.com",
      "https://user:pw@dl.example.com",
      "https://dl.example.com/?x=1",
      "https://dl.example.com/#frag",
      "not a url",
    ] {
      assert!(parse_fastdl(raw).is_none(), "{raw}");
    }
  }

  #[test]
  fn parses_rules_replies_and_rejects_other_packets() {
    let mut reply = vec![0xFF, 0xFF, 0xFF, 0xFF, 0x45, 2, 0];
    reply.extend_from_slice(b"dw_ver\x001\x00dw_maps\x00dl_midtown:faf73184b902d52d\x00");
    let parsed = parse_rules_reply(&reply).expect("rules reply");
    assert_eq!(parsed.get("dw_ver").map(String::as_str), Some("1"));
    assert_eq!(parsed.len(), 2);

    assert!(parse_rules_reply(&[0xFF, 0xFF, 0xFF, 0xFF, 0x41, 1, 2, 3, 4]).is_none());
  }

  /// A local stand-in server: challenges first, then answers the echoed request.
  #[tokio::test]
  async fn answers_the_challenge_before_reading_rules() {
    let server = UdpSocket::bind("127.0.0.1:0").await.expect("bind");
    let target = server.local_addr().expect("addr");

    let serve = tokio::spawn(async move {
      let mut buf = [0_u8; 64];
      let (_, client) = server.recv_from(&mut buf).await.expect("request");
      server
        .send_to(&[0xFF, 0xFF, 0xFF, 0xFF, 0x41, 9, 8, 7, 6], client)
        .await
        .expect("challenge");
      let (len, _) = server.recv_from(&mut buf).await.expect("echo");
      assert_eq!(&buf[5..len], &[9, 8, 7, 6]);
      let mut reply = vec![0xFF, 0xFF, 0xFF, 0xFF, 0x45, 1, 0];
      reply.extend_from_slice(b"dw_ver\x001\x00");
      server.send_to(&reply, client).await.expect("rules");
    });

    let rules = query_rules(target).await.expect("query").expect("rules");
    assert_eq!(rules.get("dw_ver").map(String::as_str), Some("1"));
    serve.await.expect("server task");
  }
}
