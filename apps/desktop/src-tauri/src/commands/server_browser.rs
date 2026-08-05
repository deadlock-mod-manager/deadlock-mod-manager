use std::net::SocketAddr;
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

async fn resolve_address(address: &str) -> Option<SocketAddr> {
  lookup_host(address).await.ok()?.next()
}

async fn ping_address(address: &str) -> Option<u64> {
  let target = resolve_address(address).await?;
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

    let latency = ping_address(&address.to_string()).await;

    task.await.unwrap();
    assert!(latency.is_some());
  }

  #[tokio::test]
  async fn rejects_invalid_addresses() {
    assert_eq!(ping_address("not-an-address").await, None);
  }
}
