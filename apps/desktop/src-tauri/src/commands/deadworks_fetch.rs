//! Downloading and unpacking Deadworks VPKs from hosts we do not trust.
//!
//! The download URL comes from a game server, so every hop is checked before
//! connecting and pinned to the address that was checked. Sizes the server
//! advertises are only claims: the caps apply to bytes actually received and
//! written.

use std::io::{Read, Write};
use std::net::SocketAddr;
use std::path::Path;
use std::time::{Duration, Instant};

use reqwest::{StatusCode, Url};
use sha2::{Digest, Sha256};

use crate::errors::Error;

use super::server_browser::is_public_target;

/// Per-file cap, compressed and decompressed.
pub const MAX_FILE_BYTES: u64 = 4 * 1024 * 1024 * 1024;
const MAX_REDIRECTS: usize = 5;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const READ_TIMEOUT: Duration = Duration::from_secs(30);
/// A transfer slower than this over a whole window is dropped.
const MIN_RATE_WINDOW: Duration = Duration::from_secs(30);
const MIN_BYTES_PER_WINDOW: u64 = 32 * 1024;
/// zstd window log 27 is 128 MiB; larger windows are refused.
/// How often progress is reported, so a large file is not thousands of events.
const PROGRESS_INTERVAL: Duration = Duration::from_millis(250);
const MAX_ZSTD_WINDOW_LOG: u32 = 27;
pub const VPK_MAGIC: [u8; 4] = [0x34, 0x12, 0xAA, 0x55];

pub enum Fetched {
  Saved,
  /// 403, 404 or 410: the host does not have this file in this format.
  Missing,
}

/// Resolve `url` and refuse loopback, private and link-local targets unless
/// the game server itself is on the player's LAN.
async fn checked_addrs(url: &Url, allow_private: bool) -> Result<(String, Vec<SocketAddr>), Error> {
  if !matches!(url.scheme(), "http" | "https")
    || !url.username().is_empty()
    || url.password().is_some()
  {
    return Err(Error::InvalidInput(format!("Refusing download URL {url}")));
  }
  let host = url
    .host_str()
    .ok_or_else(|| Error::InvalidInput("Download URL has no host".to_string()))?
    .trim_start_matches('[')
    .trim_end_matches(']')
    .to_string();
  let port = url.port_or_known_default().unwrap_or(443);
  let addrs: Vec<SocketAddr> = tokio::net::lookup_host((host.as_str(), port))
    .await
    .map_err(|e| Error::Network(format!("Failed to resolve {host}: {e}")))?
    .collect();
  if addrs.is_empty() {
    return Err(Error::Network(format!("{host} did not resolve")));
  }
  if !allow_private && let Some(blocked) = addrs.iter().find(|a| !is_public_target(a)) {
    return Err(Error::UnauthorizedPath(format!(
      "Refusing to download from non-public address {}",
      blocked.ip()
    )));
  }
  Ok((host, addrs))
}

/// Stream `url` into `dest`, following up to five redirects and stopping at
/// `max_bytes` received. `on_progress` gets the running byte count and the
/// size the host declared, if any (a claim, used only for display).
pub async fn fetch_to_file(
  url: Url,
  dest: &Path,
  allow_private: bool,
  max_bytes: u64,
  on_progress: impl Fn(u64, Option<u64>),
) -> Result<Fetched, Error> {
  let mut url = url;
  let mut response = None;
  for _ in 0..=MAX_REDIRECTS {
    let (host, addrs) = checked_addrs(&url, allow_private).await?;
    let client = crate::proxy::build_http_client(|b| {
      b.redirect(reqwest::redirect::Policy::none())
        .connect_timeout(CONNECT_TIMEOUT)
        .read_timeout(READ_TIMEOUT)
        .resolve_to_addrs(&host, &addrs)
    })?;
    let reply = client
      .get(url.clone())
      .send()
      .await
      .map_err(|e| Error::Network(format!("Download request failed: {}", e.without_url())))?;
    if !reply.status().is_redirection() {
      response = Some(reply);
      break;
    }
    let location = reply
      .headers()
      .get(reqwest::header::LOCATION)
      .and_then(|v| v.to_str().ok())
      .ok_or_else(|| Error::Network("Redirect without a Location header".to_string()))?;
    url = url
      .join(location)
      .map_err(|e| Error::Network(format!("Invalid redirect target: {e}")))?;
  }
  let mut response =
    response.ok_or_else(|| Error::Network("Too many download redirects".to_string()))?;

  let status = response.status();
  if matches!(
    status,
    StatusCode::FORBIDDEN | StatusCode::NOT_FOUND | StatusCode::GONE
  ) {
    return Ok(Fetched::Missing);
  }
  if !status.is_success() {
    return Err(Error::Network(format!("Download host returned {status}")));
  }

  let declared = response.content_length();
  let mut file = tokio::fs::File::create(dest).await?;
  let mut received = 0_u64;
  let mut last_report = Instant::now();
  on_progress(0, declared);
  let mut window_start = Instant::now();
  let mut window_bytes = 0_u64;
  while let Some(chunk) = response
    .chunk()
    .await
    .map_err(|e| Error::Network(format!("Download interrupted: {}", e.without_url())))?
  {
    received += chunk.len() as u64;
    if received > max_bytes {
      return Err(Error::ModInvalid(
        "Download exceeds the size limit".to_string(),
      ));
    }
    tokio::io::AsyncWriteExt::write_all(&mut file, &chunk).await?;
    if last_report.elapsed() >= PROGRESS_INTERVAL {
      on_progress(received, declared);
      last_report = Instant::now();
    }

    window_bytes += chunk.len() as u64;
    if window_start.elapsed() >= MIN_RATE_WINDOW {
      if window_bytes < MIN_BYTES_PER_WINDOW {
        return Err(Error::Network("Download host is too slow".to_string()));
      }
      window_start = Instant::now();
      window_bytes = 0;
    }
  }
  tokio::io::AsyncWriteExt::flush(&mut file).await?;
  on_progress(received, declared.or(Some(received)));
  Ok(Fetched::Saved)
}

pub struct Decoded {
  pub size: u64,
  pub sha256: [u8; 32],
}

impl Decoded {
  pub fn sha256_hex(&self) -> String {
    self.sha256.iter().map(|b| format!("{b:02x}")).collect()
  }
}

enum Format {
  Zstd,
  Bzip2,
}

/// Full SHA-256 of the file at `path`, as lowercase hex. Blocking.
pub fn file_sha256_hex(path: &Path) -> Result<String, Error> {
  let mut hasher = Sha256::new();
  std::io::copy(&mut std::fs::File::open(path)?, &mut hasher)?;
  Ok(hex::encode(hasher.finalize()))
}

/// The format comes from the first bytes, never from the URL.
fn sniff(head: &[u8]) -> Option<Format> {
  match head {
    [0x28, 0xB5, 0x2F, 0xFD, ..] => Some(Format::Zstd),
    [0x50..=0x5F, 0x2A, 0x4D, 0x18, ..] => Some(Format::Zstd),
    [0x42, 0x5A, 0x68, ..] => Some(Format::Bzip2),
    _ => None,
  }
}

struct HashingWriter<W> {
  inner: W,
  hasher: Sha256,
  head: Vec<u8>,
}

impl<W: Write> Write for HashingWriter<W> {
  fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
    let n = self.inner.write(buf)?;
    self.hasher.update(&buf[..n]);
    if self.head.len() < VPK_MAGIC.len() {
      let take = (VPK_MAGIC.len() - self.head.len()).min(n);
      self.head.extend_from_slice(&buf[..take]);
    }
    Ok(n)
  }

  fn flush(&mut self) -> std::io::Result<()> {
    self.inner.flush()
  }
}

/// Decode every zstd frame or bzip2 stream in `compressed` into `out` (the
/// parallel compressors write several), stopping at `max_bytes`, and check
/// the result is a VPK. Blocking; run it off the async runtime.
pub fn decode_vpk(compressed: &Path, out: &Path, max_bytes: u64) -> Result<Decoded, Error> {
  let mut source = std::fs::File::open(compressed)?;
  let mut head = [0_u8; 4];
  source.read_exact(&mut head)?;
  let format = sniff(&head)
    .ok_or_else(|| Error::ModInvalid("Download is neither zstd nor bzip2".to_string()))?;
  let source = std::io::Read::chain(&head[..], source);

  let reader: Box<dyn Read> = match format {
    Format::Zstd => {
      let mut decoder = zstd::stream::read::Decoder::new(source)?;
      decoder.window_log_max(MAX_ZSTD_WINDOW_LOG)?;
      Box::new(decoder)
    }
    Format::Bzip2 => Box::new(bzip2::read::MultiBzDecoder::new(source)),
  };

  let mut writer = HashingWriter {
    inner: std::io::BufWriter::new(std::fs::File::create(out)?),
    hasher: Sha256::new(),
    head: Vec::with_capacity(VPK_MAGIC.len()),
  };
  let size = std::io::copy(&mut reader.take(max_bytes + 1), &mut writer)?;
  writer.flush()?;
  if size > max_bytes {
    return Err(Error::ModInvalid(
      "Decompressed content exceeds the size limit".to_string(),
    ));
  }
  if writer.head != VPK_MAGIC {
    return Err(Error::ModInvalid("Download is not a VPK".to_string()));
  }
  Ok(Decoded {
    size,
    sha256: writer.hasher.finalize().into(),
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  fn vpk_bytes() -> Vec<u8> {
    let mut data = VPK_MAGIC.to_vec();
    data.extend_from_slice(b"payload");
    data
  }

  fn decode(compressed: &[u8], max: u64) -> Result<Decoded, Error> {
    let dir = tempfile::tempdir().expect("temp dir");
    let input = dir.path().join("in");
    std::fs::write(&input, compressed).expect("write input");
    decode_vpk(&input, &dir.path().join("out"), max)
  }

  #[test]
  fn decodes_every_zstd_frame_including_skippable_ones() {
    let data = vpk_bytes();
    let (first, second) = data.split_at(5);
    // A skippable frame: magic 0x184D2A50 (LE), 4-byte length, payload.
    let mut stream = vec![0x50, 0x2A, 0x4D, 0x18, 2, 0, 0, 0, 0xAB, 0xCD];
    stream.extend(zstd::encode_all(first, 3).expect("frame 1"));
    stream.extend(zstd::encode_all(second, 3).expect("frame 2"));

    let decoded = decode(&stream, MAX_FILE_BYTES).expect("decode");
    assert_eq!(decoded.size, data.len() as u64);
    assert_eq!(decoded.sha256, <[u8; 32]>::from(Sha256::digest(&data)));
  }

  #[test]
  fn decodes_concatenated_bzip2_streams() {
    let data = vpk_bytes();
    let mut stream = Vec::new();
    for part in [&data[..3], &data[3..]] {
      let mut encoder = bzip2::write::BzEncoder::new(Vec::new(), bzip2::Compression::fast());
      encoder.write_all(part).expect("compress");
      stream.extend(encoder.finish().expect("finish"));
    }
    assert_eq!(
      decode(&stream, MAX_FILE_BYTES).expect("decode").size,
      data.len() as u64
    );
  }

  #[test]
  fn rejects_unknown_formats_oversized_output_and_non_vpks() {
    assert!(decode(b"PK\x03\x04zip", MAX_FILE_BYTES).is_err());
    let data = vpk_bytes();
    assert!(decode(&zstd::encode_all(&data[..], 3).unwrap(), 4).is_err());
    assert!(
      decode(
        &zstd::encode_all(&b"not a vpk"[..], 3).unwrap(),
        MAX_FILE_BYTES
      )
      .is_err()
    );
  }

  #[test]
  fn refuses_zstd_windows_above_128_mib() {
    let mut encoder = zstd::stream::write::Encoder::new(Vec::new(), 1).expect("encoder");
    encoder.window_log(28).expect("window log");
    encoder.include_contentsize(false).expect("content size");
    encoder.write_all(&vpk_bytes()).expect("compress");
    let stream = encoder.finish().expect("finish");
    assert!(decode(&stream, MAX_FILE_BYTES).is_err());
  }
}
