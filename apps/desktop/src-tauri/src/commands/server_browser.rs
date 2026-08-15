use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::time::{Duration, Instant};

use futures::future::join_all;
use serde::{Deserialize, Serialize};
use tokio::net::{UdpSocket, lookup_host};
use tokio::time::timeout;

const A2S_INFO: &[u8] = b"\xFF\xFF\xFF\xFFTSource Engine Query\0";
const MAX_PING_TARGETS: usize = 500;
const PING_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerPingTarget {
  id: String,
  address: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerPingResult {
  id: String,
  latency_ms: Option<u64>,
}

fn is_public_ipv4(ip: Ipv4Addr) -> bool {
  if ip.is_unspecified()
    || ip.is_loopback()
    || ip.is_private()
    || ip.is_link_local()
    || ip.is_broadcast()
    || ip.is_multicast()
    || ip.is_documentation()
  {
    return false;
  }

  let octets = ip.octets();
  // Shared address space 100.64.0.0/10
  if octets[0] == 100 && (octets[1] & 0xc0) == 64 {
    return false;
  }
  // Benchmarking 198.18.0.0/15
  if octets[0] == 198 && (octets[1] & 0xfe) == 18 {
    return false;
  }

  true
}

fn is_public_ipv6(ip: Ipv6Addr) -> bool {
  if ip.is_unspecified() || ip.is_loopback() || ip.is_multicast() || ip.is_unicast_link_local() {
    return false;
  }
  // Unique local fc00::/7
  ip.octets()[0] & 0xfe != 0xfc
}

fn is_public_target(addr: &SocketAddr) -> bool {
  match addr.ip() {
    IpAddr::V4(ip) => is_public_ipv4(ip),
    IpAddr::V6(ip) => match ip.to_ipv4_mapped() {
      Some(v4) => is_public_ipv4(v4),
      None => is_public_ipv6(ip),
    },
  }
}

async fn resolve_address(address: &str) -> Option<SocketAddr> {
  lookup_host(address)
    .await
    .ok()?
    .find(|candidate| is_public_target(candidate))
}

async fn ping_address(address: &str) -> Option<u64> {
  let target = resolve_address(address).await?;
  ping_socket_addr(target).await
}

async fn ping_socket_addr(target: SocketAddr) -> Option<u64> {
  let bind_address = if target.is_ipv4() {
    "0.0.0.0:0"
  } else {
    "[::]:0"
  };
  let socket = UdpSocket::bind(bind_address).await.ok()?;
  socket.connect(target).await.ok()?;

  let started_at = Instant::now();
  socket.send(A2S_INFO).await.ok()?;

  let mut response = [0_u8; 1400];
  timeout(PING_TIMEOUT, socket.recv(&mut response))
    .await
    .ok()?
    .ok()?;

  u64::try_from(started_at.elapsed().as_millis()).ok()
}

#[tauri::command]
pub async fn ping_servers(targets: Vec<ServerPingTarget>) -> Vec<ServerPingResult> {
  join_all(
    targets
      .into_iter()
      .take(MAX_PING_TARGETS)
      .map(|target| async move {
        ServerPingResult {
          latency_ms: ping_address(&target.address).await,
          id: target.id,
        }
      }),
  )
  .await
}

#[cfg(test)]
mod tests {
  use super::*;

  #[tokio::test]
  async fn measures_the_first_udp_response() {
    let responder = UdpSocket::bind("127.0.0.1:0").await.unwrap();
    let address = responder.local_addr().unwrap();
    let task = tokio::spawn(async move {
      let mut request = [0_u8; 1400];
      let (_, peer) = responder.recv_from(&mut request).await.unwrap();
      assert_eq!(&request[..A2S_INFO.len()], A2S_INFO);
      responder.send_to(b"response", peer).await.unwrap();
    });

    let latency = ping_socket_addr(address).await;

    task.await.unwrap();
    assert!(latency.is_some());
  }

  #[tokio::test]
  async fn rejects_invalid_addresses() {
    assert_eq!(ping_address("not-an-address").await, None);
  }

  #[tokio::test]
  async fn resolve_address_rejects_loopback() {
    assert_eq!(resolve_address("127.0.0.1:27015").await, None);
  }

  #[tokio::test]
  async fn resolve_address_rejects_private_addresses() {
    assert_eq!(resolve_address("192.168.1.10:27015").await, None);
    assert_eq!(resolve_address("10.0.0.1:27015").await, None);
  }

  #[tokio::test]
  async fn resolve_address_accepts_a_public_literal() {
    assert_eq!(
      resolve_address("8.8.8.8:27015").await,
      Some("8.8.8.8:27015".parse().unwrap())
    );
  }

  #[test]
  fn is_public_target_rejects_special_use_ipv4() {
    assert!(!is_public_target(&"127.0.0.1:27015".parse().unwrap()));
    assert!(!is_public_target(&"10.0.0.1:27015".parse().unwrap()));
    assert!(!is_public_target(&"169.254.1.1:27015".parse().unwrap()));
    assert!(!is_public_target(&"100.64.0.1:27015".parse().unwrap()));
    assert!(!is_public_target(&"203.0.113.10:27015".parse().unwrap()));
    assert!(is_public_target(&"8.8.8.8:27015".parse().unwrap()));
  }
}
