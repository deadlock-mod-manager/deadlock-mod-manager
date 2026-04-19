use crate::errors::Error;
use futures::StreamExt;
use reqwest::header::{HeaderMap, RANGE};
use serde::{Deserialize, Serialize};
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;
use tokio::fs::{File, OpenOptions};
use tokio::io::AsyncWriteExt;
use tokio::sync::Notify;
use tokio_util::sync::CancellationToken;

#[allow(dead_code)]
const BUFFER_SIZE: usize = 64 * 1024; // 64KB buffer for future use
const PROGRESS_THROTTLE_MS: u128 = 500; // Emit progress every 500ms

#[derive(Clone, Debug)]
pub struct DownloadProgress {
  pub downloaded: u64,
  pub speed: f64,
}

/// Shared pause gate for in-flight downloads (one per mod).
#[derive(Clone, Debug)]
pub struct PauseHandle {
  paused: Arc<AtomicBool>,
  notify: Arc<Notify>,
}

impl PauseHandle {
  pub fn new() -> Self {
    Self {
      paused: Arc::new(AtomicBool::new(false)),
      notify: Arc::new(Notify::new()),
    }
  }

  pub fn pause(&self) {
    self.paused.store(true, Ordering::SeqCst);
  }

  pub fn resume(&self) {
    self.paused.store(false, Ordering::SeqCst);
    self.notify.notify_waiters();
  }

  pub fn is_paused(&self) -> bool {
    self.paused.load(Ordering::SeqCst)
  }

  pub async fn wait_until_running(&self, cancel_token: &CancellationToken) {
    while !cancel_token.is_cancelled() && self.is_paused() {
      tokio::select! {
        () = self.notify.notified() => {}
        () = cancel_token.cancelled() => {}
      }
    }
  }
}

impl Default for PauseHandle {
  fn default() -> Self {
    Self::new()
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct PartialMeta {
  etag: Option<String>,
}

fn partial_download_path(target: &Path) -> PathBuf {
  let name = target.file_name().unwrap_or_default().to_owned();
  let mut new_name = name;
  new_name.push(".partial");
  target.with_file_name(new_name)
}

fn partial_meta_path(partial: &Path) -> PathBuf {
  let mut name = partial.file_name().unwrap_or_default().to_os_string();
  name.push(".meta");
  partial.with_file_name(name)
}

fn header_etag(headers: &HeaderMap) -> Option<String> {
  headers
    .get(reqwest::header::ETAG)
    .or_else(|| headers.get("etag"))
    .and_then(|v| v.to_str().ok())
    .map(std::string::ToString::to_string)
}

fn parse_content_range_total(headers: &HeaderMap) -> Option<u64> {
  let value = headers
    .get(reqwest::header::CONTENT_RANGE)
    .or_else(|| headers.get("content-range"))?
    .to_str()
    .ok()?;
  let (_, rest) = value.split_once('/')?;
  rest.trim().parse().ok()
}

async fn read_partial_meta(path: &Path) -> Option<PartialMeta> {
  let bytes = tokio::fs::read(path).await.ok()?;
  serde_json::from_slice(&bytes).ok()
}

async fn write_partial_meta(path: &Path, meta: &PartialMeta) -> Result<(), Error> {
  if let Some(parent) = path.parent() {
    tokio::fs::create_dir_all(parent).await.map_err(Error::Io)?;
  }
  let data = serde_json::to_vec(meta).map_err(|e| Error::Network(e.to_string()))?;
  tokio::fs::write(path, data)
    .await
    .map_err(|e| Error::FileWriteFailed(format!("Failed to write resume meta: {e}")))?;
  Ok(())
}

async fn remove_partial_pair(partial_path: &Path, meta_path: &Path) {
  let _ = tokio::fs::remove_file(partial_path).await;
  let _ = tokio::fs::remove_file(meta_path).await;
}

/// Non-pausing download (still staged via `*.partial` then renamed).
#[allow(dead_code)] // Public helper; kept for tests and future callers.
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
  let pause = PauseHandle::new();
  download_file_resumable(
    url,
    target_path,
    0,
    on_progress,
    cancel_token,
    pause,
    max_bytes,
  )
  .await
}

/// Resumable download using a `*.partial` staging file and HTTP Range when supported.
/// On success, renames the partial file to `target_path`.
pub async fn download_file_resumable<F>(
  url: &str,
  target_path: &Path,
  expected_size: u64,
  on_progress: F,
  cancel_token: CancellationToken,
  pause: PauseHandle,
  max_bytes: Option<u64>,
) -> Result<(), Error>
where
  F: Fn(DownloadProgress) + Send + 'static,
{
  log::info!(
    "Starting resumable download from {url} to {target_path:?} (expected_size={expected_size}, max_bytes={max_bytes:?})"
  );

  let partial_path = partial_download_path(target_path);
  let meta_path = partial_meta_path(&partial_path);

  if let Some(parent) = target_path.parent() {
    tokio::fs::create_dir_all(parent).await.map_err(Error::Io)?;
  }

  let client = crate::proxy::build_http_client(|b| {
    b.connect_timeout(std::time::Duration::from_secs(30))
      .read_timeout(std::time::Duration::from_secs(60))
  })?;

  let start_time = Instant::now();
  let mut last_progress_time = Instant::now();

  'retry: loop {
    let stored_meta = read_partial_meta(&meta_path).await.unwrap_or_default();
    let resume_from = match tokio::fs::metadata(&partial_path).await {
      Ok(m) => m.len(),
      Err(_) => 0,
    };

    if resume_from == 0 {
      let _ = tokio::fs::remove_file(&meta_path).await;
    } else if stored_meta.etag.is_none() {
      log::warn!("Partial file without resume metadata; restarting download");
      remove_partial_pair(&partial_path, &meta_path).await;
      continue 'retry;
    }

    let base_offset = resume_from;
    let mut session_downloaded: u64 = 0;
    let mut total_entity_size = expected_size;

    let mut request = client.get(url);
    if resume_from > 0 {
      request = request.header(RANGE, format!("bytes={resume_from}-"));
    }

    let response = request
      .send()
      .await
      .map_err(|e| Error::Network(format!("Failed to send request: {e}")))?;

    let status = response.status();

    if status == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
      log::warn!("Server returned 416; clearing partial and retrying");
      remove_partial_pair(&partial_path, &meta_path).await;
      continue 'retry;
    }

    if !status.is_success() {
      return Err(Error::Network(format!(
        "Server returned error status: {status}"
      )));
    }

    let headers = response.headers().clone();
    let resp_etag = header_etag(&headers);

    if resume_from > 0 {
      if status != reqwest::StatusCode::PARTIAL_CONTENT {
        log::info!("Resume not honored (status {status}); restarting from scratch");
        remove_partial_pair(&partial_path, &meta_path).await;
        continue 'retry;
      }

      if let Some(ref stored) = stored_meta.etag
        && resp_etag.as_ref() != Some(stored) {
          log::warn!("ETag changed since partial download; restarting");
          remove_partial_pair(&partial_path, &meta_path).await;
          continue 'retry;
        }

      if let Some(total) = parse_content_range_total(&headers) {
        total_entity_size = total_entity_size.max(total);
      }
    } else {
      if let Some(limit) = max_bytes {
        let advertised = response.content_length().unwrap_or(0);
        if advertised > limit {
          return Err(Error::Network(format!(
            "Refusing to download {advertised} bytes (limit {limit})"
          )));
        }
      }

      let cl = response.content_length().unwrap_or(0);
      if cl > 0 {
        total_entity_size = total_entity_size.max(cl);
      }
    }

    let mut file = if resume_from > 0 {
      OpenOptions::new()
        .append(true)
        .open(&partial_path)
        .await
        .map_err(|e| Error::FileWriteFailed(format!("Failed to open partial file: {e}")))?
    } else {
      let f = File::create(&partial_path)
        .await
        .map_err(|e| Error::FileWriteFailed(format!("Failed to create partial file: {e}")))?;
      let meta = PartialMeta {
        etag: resp_etag.clone(),
      };
      if let Err(e) = write_partial_meta(&meta_path, &meta).await {
        log::warn!("Failed to write initial resume meta: {e}");
      }
      f
    };

    let mut stream = response.bytes_stream();

    loop {
      if cancel_token.is_cancelled() {
        log::info!("Download cancelled");
        drop(file);
        remove_partial_pair(&partial_path, &meta_path).await;
        return Err(Error::DownloadCancelled);
      }

      pause.wait_until_running(&cancel_token).await;
      if cancel_token.is_cancelled() {
        drop(file);
        remove_partial_pair(&partial_path, &meta_path).await;
        return Err(Error::DownloadCancelled);
      }

      let chunk = match stream.next().await {
        Some(c) => c.map_err(|e| Error::Network(format!("Failed to read chunk: {e}")))?,
        None => break,
      };

      session_downloaded += chunk.len() as u64;
      let downloaded_total = base_offset.saturating_add(session_downloaded);

      if let Some(limit) = max_bytes
        && downloaded_total > limit
      {
        log::warn!("Download exceeded size limit ({downloaded_total} > {limit}), aborting");
        drop(file);
        remove_partial_pair(&partial_path, &meta_path).await;
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

      let is_complete = total_entity_size > 0 && downloaded_total >= total_entity_size;

      if is_complete || elapsed_since_last >= PROGRESS_THROTTLE_MS {
        let elapsed_total = start_time.elapsed().as_secs_f64();
        let speed = if elapsed_total > 0.0 {
          session_downloaded as f64 / elapsed_total
        } else {
          0.0
        };

        on_progress(DownloadProgress {
          downloaded: downloaded_total,
          speed,
        });

        last_progress_time = now;
      }
    }

    let final_total = base_offset.saturating_add(session_downloaded);
    let elapsed_total = start_time.elapsed().as_secs_f64();
    let final_speed = if elapsed_total > 0.0 {
      session_downloaded as f64 / elapsed_total
    } else {
      0.0
    };
    on_progress(DownloadProgress {
      downloaded: final_total,
      speed: final_speed,
    });

    file
      .flush()
      .await
      .map_err(|e| Error::FileWriteFailed(format!("Failed to flush file: {e}")))?;

    drop(file);

    if tokio::fs::metadata(&partial_path)
      .await
      .map(|m| m.len())
      .unwrap_or(0)
      == 0
    {
      remove_partial_pair(&partial_path, &meta_path).await;
      return Err(Error::Network("Downloaded empty file".to_string()));
    }

    if let Err(e) = tokio::fs::rename(&partial_path, target_path).await {
      return Err(Error::FileWriteFailed(format!(
        "Failed to finalize download: {e}"
      )));
    }
    let _ = tokio::fs::remove_file(&meta_path).await;

    log::info!("Download completed: {target_path:?}");
    return Ok(());
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn parse_content_range_total_parses_suffix() {
    let mut headers = HeaderMap::new();
    headers.insert(
      reqwest::header::CONTENT_RANGE,
      reqwest::header::HeaderValue::from_static("bytes 0-1023/9360840"),
    );
    assert_eq!(parse_content_range_total(&headers), Some(9_360_840));
  }

  #[tokio::test]
  async fn test_download_file() {
    use tempfile::tempdir;

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
