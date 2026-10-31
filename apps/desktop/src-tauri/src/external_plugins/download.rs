//! Catalog downloads for `external_plugins_install_url`. The runtime stays
//! network-free: the archive lands in a temporary file under the runtime's
//! archive cap, and the runtime checks its SHA-256 before installing.

use crate::errors::Error;
use dmm_plugin_runtime::MAX_ARCHIVE_BYTES;
use futures::StreamExt;
use std::time::Duration;
use tempfile::TempPath;
use tokio::io::AsyncWriteExt;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(300);
const MAX_REDIRECTS: usize = 5;

fn too_large() -> Error {
  Error::InvalidInput("Plugin archive exceeds the 64 MiB limit".into())
}

fn network(error: reqwest::Error) -> Error {
  Error::Network(error.to_string())
}

pub fn https_url(url: &str) -> Result<reqwest::Url, Error> {
  let url =
    reqwest::Url::parse(url).map_err(|_| Error::InvalidInput("Invalid plugin URL".into()))?;
  if url.scheme() != "https" {
    return Err(Error::InvalidInput(
      "Plugin downloads must use https".into(),
    ));
  }
  Ok(url)
}

pub fn is_sha256(value: &str) -> bool {
  value.len() == 64
    && value
      .bytes()
      .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
}

/// Downloads `url` into a temporary file that is deleted when dropped.
/// Redirects must stay on https.
pub async fn fetch_archive(url: reqwest::Url) -> Result<TempPath, Error> {
  let client = crate::proxy::build_http_client(|builder| {
    builder
      .connect_timeout(CONNECT_TIMEOUT)
      .timeout(DOWNLOAD_TIMEOUT)
      .redirect(reqwest::redirect::Policy::custom(|attempt| {
        if attempt.url().scheme() != "https" {
          attempt.error("Plugin downloads must stay on https")
        } else if attempt.previous().len() > MAX_REDIRECTS {
          attempt.error("Too many redirects")
        } else {
          attempt.follow()
        }
      }))
  })?;
  let response = client
    .get(url)
    .send()
    .await
    .and_then(reqwest::Response::error_for_status)
    .map_err(network)?;
  if response
    .content_length()
    .is_some_and(|length| length > MAX_ARCHIVE_BYTES)
  {
    return Err(too_large());
  }
  let path = tempfile::Builder::new()
    .prefix("dmm-plugin-")
    .suffix(".zip")
    .tempfile()?
    .into_temp_path();
  let mut file = tokio::fs::File::create(&path).await?;
  let mut stream = response.bytes_stream();
  let mut total = 0u64;
  while let Some(chunk) = stream.next().await {
    let chunk = chunk.map_err(network)?;
    total += chunk.len() as u64;
    if total > MAX_ARCHIVE_BYTES {
      return Err(too_large());
    }
    file.write_all(&chunk).await?;
  }
  file.flush().await?;
  Ok(path)
}
