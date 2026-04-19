use crate::errors::Error;
use futures::StreamExt;
use std::path::Path;
use std::time::Instant;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use tokio_util::sync::CancellationToken;

#[allow(dead_code)]
const BUFFER_SIZE: usize = 64 * 1024; // 64KB buffer for future use
const PROGRESS_THROTTLE_MS: u128 = 500; // Emit progress every 500ms

#[derive(Clone, Debug)]
pub struct DownloadProgress {
  pub downloaded: u64,
  pub speed: f64,
}

pub async fn download_file<F>(
  url: &str,
  target_path: &Path,
  on_progress: F,
  cancel_token: CancellationToken,
) -> Result<(), Error>
where
  F: Fn(DownloadProgress) + Send + 'static,
{
  download_file_with_limit(url, target_path, on_progress, cancel_token, None).await
}

/// Download a file with an optional maximum byte size. When `max_bytes` is
/// `Some`, the download is aborted (and the partial file deleted) as soon as
/// the response body exceeds the limit, including the case where the server
/// advertises a too-large `Content-Length` upfront.
pub async fn download_file_with_limit<F>(
  url: &str,
  target_path: &Path,
  on_progress: F,
  cancel_token: CancellationToken,
  max_bytes: Option<u64>,
) -> Result<(), Error>
where
  F: Fn(DownloadProgress) + Send + 'static,
{
  log::info!("Starting download from {url} to {target_path:?} (max_bytes={max_bytes:?})");

  let client = crate::proxy::build_http_client(|b| {
    b.connect_timeout(std::time::Duration::from_secs(30))
      .read_timeout(std::time::Duration::from_secs(60))
  })?;

  let response = client
    .get(url)
    .send()
    .await
    .map_err(|e| Error::Network(format!("Failed to send request: {e}")))?;

  if !response.status().is_success() {
    return Err(Error::Network(format!(
      "Server returned error status: {}",
      response.status()
    )));
  }

  let total_size = response.content_length().unwrap_or(0);
  log::info!("Download size: {total_size} bytes");

  if let Some(limit) = max_bytes
    && total_size > limit
  {
    return Err(Error::Network(format!(
      "Refusing to download {total_size} bytes (limit {limit})"
    )));
  }

  if let Some(parent) = target_path.parent() {
    tokio::fs::create_dir_all(parent).await.map_err(Error::Io)?;
  }

  let mut file = File::create(target_path)
    .await
    .map_err(|e| Error::FileWriteFailed(format!("Failed to create file: {e}")))?;

  let mut stream = response.bytes_stream();
  let mut downloaded: u64 = 0;
  let start_time = Instant::now();
  let mut last_progress_time = Instant::now();

  while let Some(chunk) = stream.next().await {
    if cancel_token.is_cancelled() {
      log::info!("Download cancelled");
      drop(file);
      let _ = tokio::fs::remove_file(target_path).await;
      return Err(Error::DownloadCancelled);
    }

    let chunk = chunk.map_err(|e| Error::Network(format!("Failed to read chunk: {e}")))?;

    downloaded += chunk.len() as u64;

    if let Some(limit) = max_bytes
      && downloaded > limit
    {
      log::warn!("Download exceeded size limit ({downloaded} > {limit}), aborting");
      drop(file);
      let _ = tokio::fs::remove_file(target_path).await;
      return Err(Error::Network(format!(
        "Download exceeded size limit of {limit} bytes"
      )));
    }

    file
      .write_all(&chunk)
      .await
      .map_err(|e| Error::FileWriteFailed(format!("Failed to write to file: {e}")))?;

    let now = Instant::now();
    let elapsed_since_last = now.duration_since(last_progress_time).as_millis();

    let is_complete = total_size > 0 && downloaded >= total_size;

    if is_complete || elapsed_since_last >= PROGRESS_THROTTLE_MS {
      let elapsed_total = start_time.elapsed().as_secs_f64();
      let speed = if elapsed_total > 0.0 {
        downloaded as f64 / elapsed_total
      } else {
        0.0
      };

      on_progress(DownloadProgress { downloaded, speed });

      last_progress_time = now;
    }
  }

  file
    .flush()
    .await
    .map_err(|e| Error::FileWriteFailed(format!("Failed to flush file: {e}")))?;

  log::info!("Download completed: {target_path:?}");
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;
  use tempfile::tempdir;

  #[tokio::test]
  async fn test_download_file() {
    let dir = tempdir().unwrap();
    let file_path = dir.path().join("test.txt");
    let cancel_token = CancellationToken::new();

    let result = download_file(
      "https://httpbin.org/bytes/1024",
      &file_path,
      |progress| {
        println!("Downloaded: {} bytes", progress.downloaded);
      },
      cancel_token,
    )
    .await;

    assert!(result.is_ok());
    assert!(file_path.exists());
  }
}
