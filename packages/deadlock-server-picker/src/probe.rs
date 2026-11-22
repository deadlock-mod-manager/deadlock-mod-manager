use std::{collections::BTreeMap, net::Ipv4Addr};

use futures::{StreamExt, stream};
use tokio_util::sync::CancellationToken;

use crate::{ServerPickerCatalog, ServerPickerLatency, ServerPickerLocation};

pub(crate) async fn sweep(
  catalog: &ServerPickerCatalog,
  preferred: &BTreeMap<String, String>,
  cancellation: &CancellationToken,
) -> Vec<(ServerPickerLatency, Option<String>)> {
  let pending: Vec<_> = catalog
    .locations
    .iter()
    .map(|location| {
      measure_location(
        location,
        preferred.get(&location.id).map(String::as_str),
        cancellation,
      )
    })
    .collect();
  stream::iter(pending).buffer_unordered(8).collect().await
}

async fn measure_location(
  location: &ServerPickerLocation,
  preferred: Option<&str>,
  cancellation: &CancellationToken,
) -> (ServerPickerLatency, Option<String>) {
  let mut addresses: Vec<&str> = location
    .relays
    .iter()
    .map(|relay| relay.address.as_str())
    .collect();
  addresses.sort_unstable();
  addresses.dedup();
  if let Some(preferred) = preferred {
    addresses.sort_by_key(|address| *address != preferred);
  }
  let mut samples = Vec::new();
  let mut responsive = None;
  for address in addresses.into_iter().take(2) {
    if cancellation.is_cancelled() {
      break;
    }
    let Ok(ip) = address.parse() else {
      continue;
    };
    if let Some(latency) = ping(ip).await {
      samples.push(latency);
      responsive = Some(address.to_owned());
      // Refine a responsive endpoint without scanning every relay in a PoP.
      for _ in 0..2 {
        if cancellation.is_cancelled() {
          break;
        }
        if let Some(latency) = ping(ip).await {
          samples.push(latency);
        }
      }
      break;
    }
  }
  samples.sort_by(f64::total_cmp);
  let latency_ms = samples.get(samples.len() / 2).copied();
  (
    ServerPickerLatency {
      location_id: location.id.clone(),
      latency_ms,
      measured_at: crate::now_ms(),
    },
    responsive,
  )
}

#[cfg(windows)]
async fn ping(address: Ipv4Addr) -> Option<f64> {
  tokio::task::spawn_blocking(move || {
    use windows::Win32::NetworkManagement::IpHelper::{
      ICMP_ECHO_REPLY, IcmpCloseHandle, IcmpCreateFile, IcmpSendEcho,
    };
    // The buffer uses machine-word alignment for the native ICMP_ECHO_REPLY.
    let mut reply = [0usize; 32];
    let request = [0u8; 8];
    unsafe {
      let handle = IcmpCreateFile().ok()?;
      let count = IcmpSendEcho(
        handle,
        u32::from_ne_bytes(address.octets()),
        request.as_ptr().cast(),
        request.len() as u16,
        None,
        reply.as_mut_ptr().cast(),
        std::mem::size_of_val(&reply) as u32,
        750,
      );
      let _ = IcmpCloseHandle(handle);
      if count == 0 {
        return None;
      }
      let response = &*reply.as_ptr().cast::<ICMP_ECHO_REPLY>();
      (response.Status == 0).then_some(f64::from(response.RoundTripTime))
    }
  })
  .await
  .ok()
  .flatten()
}

#[cfg(target_os = "linux")]
async fn ping(address: Ipv4Addr) -> Option<f64> {
  let output = tokio::time::timeout(
    std::time::Duration::from_millis(1200),
    tokio::process::Command::new("ping")
      .args(["-n", "-c", "1", "-W", "1", &address.to_string()])
      .env("LC_ALL", "C")
      .kill_on_drop(true)
      .output(),
  )
  .await
  .ok()?
  .ok()?;
  if !output.status.success() {
    return None;
  }
  parse_ping(&String::from_utf8_lossy(&output.stdout))
}

#[cfg(not(any(windows, target_os = "linux")))]
async fn ping(_address: Ipv4Addr) -> Option<f64> {
  None
}

#[cfg(any(target_os = "linux", test))]
fn parse_ping(output: &str) -> Option<f64> {
  let value = output
    .split("time=")
    .nth(1)?
    .split_whitespace()
    .next()?
    .parse::<f64>()
    .ok()?;
  (value.is_finite() && value >= 0.0).then_some(value)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn parses_reply_latency_but_not_unreachable_or_corrupt_output() {
    assert_eq!(
      parse_ping("64 bytes from 155.133.248.36: icmp_seq=1 ttl=56 time=12.8 ms"),
      Some(12.8)
    );
    assert_eq!(
      parse_ping("From 1.2.3.4 Destination Host Unreachable"),
      None
    );
    assert_eq!(parse_ping("time=NaN ms"), None);
    assert_eq!(parse_ping("time=-1 ms"), None);
  }
}
