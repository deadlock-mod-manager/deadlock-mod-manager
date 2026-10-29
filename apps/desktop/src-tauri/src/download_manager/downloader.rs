use crate::errors::Error;
use futures::StreamExt;
use md5::{Digest, Md5};
use reqwest::header::{HeaderMap, RANGE};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tokio::fs::{File, OpenOptions};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::Notify;
use tokio_util::sync::CancellationToken;

#[allow(dead_code)]
const BUFFER_SIZE: usize = 64 * 1024; // 64KB buffer for future use
const PROGRESS_THROTTLE_MS: u128 = 500; // Emit progress every 500ms
const MAX_REDIRECTS: usize = 5;
const MAX_RECONNECTS: u32 = 3;
/// How far back the reported speed looks, so a stall shows as a falling rate
/// instead of hiding behind the average since the download started.
const SPEED_WINDOW: Duration = Duration::from_secs(5);
/// How often a silent connection still reports progress, letting the rate decay.
const STALL_TICK: Duration = Duration::from_secs(1);
/// Silence after which the connection is dropped and the Range request re-issued.
const STALL_TIMEOUT: Duration = Duration::from_secs(20);

/// Where the bytes of a download are coming from, so the UI can say whose end a
/// slow or failed download is on.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DownloadSource {
  GameBanana,
  Other,
}

fn is_gamebanana_host(host: &str) -> bool {
  host == "gamebanana.com" || host.ends_with(".gamebanana.com")
}

/// Read from the URL after redirects, which is the server actually sending the bytes.
fn classify_source(url: &reqwest::Url) -> DownloadSource {
  if url.host_str().is_some_and(is_gamebanana_host) {
    DownloadSource::GameBanana
  } else {
    DownloadSource::Other
  }
}

/// reqwest's own message is just "error sending request"; the cause (reset, TLS,
/// DNS, timeout) lives further down the source chain.
fn describe_request_error(error: reqwest::Error) -> String {
  let error = error.without_url();
  let mut message = error.to_string();
  let mut source = std::error::Error::source(&error);
  while let Some(cause) = source {
    message.push_str(": ");
    message.push_str(&cause.to_string());
    source = cause.source();
  }
  message
}

fn retry_after_secs(headers: &HeaderMap) -> Option<u64> {
  headers
    .get(reqwest::header::RETRY_AFTER)?
    .to_str()
    .ok()?
    .trim()
    .parse()
    .ok()
}

/// Transfer rate over the last [`SPEED_WINDOW`].
struct SpeedWindow {
  samples: VecDeque<(Instant, u64)>,
}

impl SpeedWindow {
  fn new(now: Instant, bytes: u64) -> Self {
    Self {
      samples: VecDeque::from([(now, bytes)]),
    }
  }

  fn record(&mut self, now: Instant, bytes: u64) {
    self.samples.push_back((now, bytes));
    // The front stays the newest sample at least a window old, the baseline the
    // rate is measured from.
    while self.samples.len() > 2 && now.duration_since(self.samples[1].0) >= SPEED_WINDOW {
      self.samples.pop_front();
    }
  }

  /// Bytes over the window ending at `now` rather than at the last sample, so
  /// silence lowers the rate.
  fn rate(&self, now: Instant, bytes: u64) -> f64 {
    let window_start = now.checked_sub(SPEED_WINDOW);
    let Some(&(since, baseline)) = self
      .samples
      .iter()
      .rev()
      .find(|(at, _)| window_start.is_some_and(|start| *at <= start))
      .or_else(|| self.samples.front())
    else {
      return 0.0;
    };
    let elapsed = now.duration_since(since).as_secs_f64();
    if elapsed > 0.0 {
      bytes.saturating_sub(baseline) as f64 / elapsed
    } else {
      0.0
    }
  }
}

pub fn validate_download_url(url: &str) -> Result<(), Error> {
  let parsed = reqwest::Url::parse(url)
    .map_err(|_| Error::InvalidInput("Invalid download URL".to_string()))?;
  if !is_allowed_download_url(&parsed) {
    return Err(Error::InvalidInput(
      "Download URL must use HTTPS on a trusted host".to_string(),
    ));
  }
  Ok(())
}

fn is_allowed_download_url(url: &reqwest::Url) -> bool {
  #[cfg(feature = "e2e-harness")]
  if crate::runtime_environment::is_e2e_active() {
    return crate::runtime_environment::current()
      .e2e()
      .is_some_and(|configuration| configuration.permits_download_url(url));
  }
  if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
    return false;
  }
  url.host_str().is_some_and(|host| {
    host == "gamebanana.com"
      || host.ends_with(".gamebanana.com")
      || host == "deadlockmods.app"
      || host.ends_with(".deadlockmods.app")
  })
}

#[derive(Clone, Debug)]
pub struct DownloadProgress {
  pub downloaded: u64,
  /// Bytes per second over the last few seconds.
  pub speed: f64,
  /// `None` until a response states the entity's size; a declared size is not one.
  pub total: Option<u64>,
  pub source: DownloadSource,
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
  last_modified: Option<String>,
}

fn partial_download_path(target: &Path) -> PathBuf {
  let mut name = target.file_name().unwrap_or_default().to_owned();
  name.push(".partial");
  target.with_file_name(name)
}

fn partial_meta_path(partial: &Path) -> PathBuf {
  let mut name = partial.file_name().unwrap_or_default().to_os_string();
  name.push(".meta");
  partial.with_file_name(name)
}

fn header_etag(headers: &HeaderMap) -> Option<String> {
  headers
    .get(reqwest::header::ETAG)
    .and_then(|v| v.to_str().ok())
    .map(std::string::ToString::to_string)
}

fn header_last_modified(headers: &HeaderMap) -> Option<String> {
  headers
    .get(reqwest::header::LAST_MODIFIED)
    .and_then(|v| v.to_str().ok())
    .map(std::string::ToString::to_string)
}

fn parse_content_range_total(headers: &HeaderMap) -> Option<u64> {
  let value = headers.get(reqwest::header::CONTENT_RANGE)?.to_str().ok()?;
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

#[allow(dead_code)]
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
    None,
    false,
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
  expected_md5: Option<&str>,
  trusted_hosts_only: bool,
) -> Result<(), Error>
where
  F: Fn(DownloadProgress) + Send + 'static,
{
  log::info!(
    "Starting resumable download to {target_path:?} (expected_size={expected_size}, max_bytes={max_bytes:?})"
  );

  let partial_path = partial_download_path(target_path);
  let meta_path = partial_meta_path(&partial_path);

  if let Some(parent) = target_path.parent() {
    tokio::fs::create_dir_all(parent).await.map_err(Error::Io)?;
  }

  if trusted_hosts_only {
    validate_download_url(url)?;
  }
  let client = crate::proxy::build_http_client(|b| {
    let builder = b
      .connect_timeout(std::time::Duration::from_secs(30))
      .read_timeout(std::time::Duration::from_secs(60));
    if trusted_hosts_only {
      builder.redirect(reqwest::redirect::Policy::custom(|attempt| {
        if attempt.previous().len() >= MAX_REDIRECTS {
          return attempt.error("download redirect limit exceeded");
        }
        if is_allowed_download_url(attempt.url()) {
          attempt.follow()
        } else {
          attempt.error("download redirect left the trusted host allowlist")
        }
      }))
    } else {
      builder.redirect(reqwest::redirect::Policy::none())
    }
  })?;

  let mut reconnects: u32 = 0;

  'retry: loop {
    let stored_meta = read_partial_meta(&meta_path).await.unwrap_or_default();
    let resume_from = match tokio::fs::metadata(&partial_path).await {
      Ok(m) => m.len(),
      Err(_) => 0,
    };

    if resume_from == 0 {
      let _ = tokio::fs::remove_file(&meta_path).await;
    } else if stored_meta.etag.is_none() && stored_meta.last_modified.is_none() {
      log::warn!("Partial file without resume metadata; restarting download");
      remove_partial_pair(&partial_path, &meta_path).await;
      continue 'retry;
    }

    let base_offset = resume_from;
    let mut session_downloaded: u64 = 0;
    let mut confirmed_entity_size: Option<u64> = None;
    let mut completion_reported = false;

    let mut request = client.get(url);
    if resume_from > 0 {
      request = request.header(RANGE, format!("bytes={resume_from}-"));
    }

    // The read loop only sees the token once headers arrive; a connect or a server
    // holding its headers back would keep a cancelled download alive until a timeout.
    let sent = tokio::select! {
      biased;
      () = cancel_token.cancelled() => {
        log::info!("Download cancelled before the server responded");
        remove_partial_pair(&partial_path, &meta_path).await;
        return Err(Error::DownloadCancelled);
      }
      sent = request.send() => sent,
    };
    let response = match sent {
      Ok(response) => response,
      Err(e) => {
        // A redirect the policy rejected fails the same way on every attempt.
        let transient = !e.is_redirect();
        let reason = describe_request_error(e);
        // Connections refused or reset before the first byte are as transient as a
        // dropped stream, and several files of one mod start at the same moment.
        if transient && reconnects < MAX_RECONNECTS {
          reconnects += 1;
          let delay = Duration::from_secs(1 << (reconnects - 1));
          log::warn!(
            "Request failed (retry {reconnects}/{MAX_RECONNECTS} in {}s): {reason}",
            delay.as_secs()
          );
          tokio::select! {
            () = tokio::time::sleep(delay) => continue 'retry,
            () = cancel_token.cancelled() => return Err(Error::DownloadCancelled),
          }
        }
        return Err(Error::Network(format!("Failed to send request: {reason}")));
      }
    };

    let status = response.status();

    if status == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
      log::warn!("Server returned 416; clearing partial and retrying");
      remove_partial_pair(&partial_path, &meta_path).await;
      continue 'retry;
    }

    let source = classify_source(response.url());

    if !status.is_success() {
      if source == DownloadSource::GameBanana
        && (status == reqwest::StatusCode::TOO_MANY_REQUESTS || status.is_server_error())
      {
        return Err(Error::DownloadSourceBusy {
          status: status.as_u16(),
          retry_after_secs: retry_after_secs(response.headers()),
        });
      }
      return Err(Error::Network(format!(
        "Server returned error status: {status}"
      )));
    }

    let headers = response.headers().clone();
    let resp_etag = header_etag(&headers);
    let resp_last_modified = header_last_modified(&headers);

    if resume_from > 0 {
      if status != reqwest::StatusCode::PARTIAL_CONTENT {
        log::info!("Resume not honored (status {status}); restarting from scratch");
        remove_partial_pair(&partial_path, &meta_path).await;
        continue 'retry;
      }

      if let Some(ref stored_etag) = stored_meta.etag
        && resp_etag.as_ref() != Some(stored_etag)
      {
        // ETag changed; accept the resume only if Last-Modified still matches.
        if resp_last_modified.is_none() || resp_last_modified != stored_meta.last_modified {
          log::warn!("ETag changed since partial download; restarting");
          remove_partial_pair(&partial_path, &meta_path).await;
          continue 'retry;
        }
        log::info!("ETag changed but Last-Modified matches; accepting resume");
      }

      if let Some(total) = parse_content_range_total(&headers) {
        confirmed_entity_size = Some(total);
        if let Some(limit) = max_bytes
          && total > limit
        {
          return Err(Error::Network(format!(
            "Refusing to download {total} bytes (limit {limit})"
          )));
        }
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

      if let Some(total) = response.content_length().filter(|&total| total > 0) {
        confirmed_entity_size = Some(total);
      }
    }

    let assumed_total_size = confirmed_entity_size.unwrap_or(expected_size);

    // A resumed file already holds `base_offset` bytes, which the bar reads as zero until
    // its first chunk lands.
    on_progress(DownloadProgress {
      downloaded: base_offset,
      speed: 0.0,
      total: confirmed_entity_size,
      source,
    });

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
        last_modified: resp_last_modified.clone(),
      };
      if let Err(e) = write_partial_meta(&meta_path, &meta).await {
        log::warn!("Failed to write initial resume meta: {e}");
      }
      f
    };

    let mut stream = response.bytes_stream();
    let mut last_data_at = Instant::now();
    let mut speed_window = SpeedWindow::new(last_data_at, 0);
    // Counted from the first byte, not the request: a slow response would otherwise
    // report its first chunk at once, measured over a few milliseconds.
    let mut last_progress_time = last_data_at;

    loop {
      if cancel_token.is_cancelled() {
        log::info!("Download cancelled");
        drop(file);
        remove_partial_pair(&partial_path, &meta_path).await;
        return Err(Error::DownloadCancelled);
      }

      if pause.is_paused() {
        pause.wait_until_running(&cancel_token).await;
        // Time spent paused is not the server going quiet.
        last_data_at = Instant::now();
        speed_window = SpeedWindow::new(last_data_at, session_downloaded);
      }
      if cancel_token.is_cancelled() {
        drop(file);
        remove_partial_pair(&partial_path, &meta_path).await;
        return Err(Error::DownloadCancelled);
      }

      let chunk = match tokio::time::timeout(STALL_TICK, stream.next()).await {
        Ok(Some(Ok(c))) => c,
        Ok(Some(Err(e))) => {
          // Stream errors after a long pause are typically stale TCP connections.
          // Drop the stream and re-issue the Range request using the partial file.
          if reconnects < MAX_RECONNECTS {
            reconnects += 1;
            log::warn!(
              "Chunk read error (retry {reconnects}/{MAX_RECONNECTS}), re-issuing Range request: {e}"
            );
            drop(file);
            continue 'retry;
          }
          return Err(Error::Network(format!(
            "Failed to read chunk after {reconnects} retries: {e}"
          )));
        }
        Ok(None) => break,
        Err(_) => {
          let now = Instant::now();
          if now.duration_since(last_data_at) >= STALL_TIMEOUT {
            if reconnects < MAX_RECONNECTS {
              reconnects += 1;
              log::warn!(
                "No data for {}s (retry {reconnects}/{MAX_RECONNECTS}), re-issuing Range request",
                STALL_TIMEOUT.as_secs()
              );
              drop(file);
              continue 'retry;
            }
            return Err(Error::DownloadStalled);
          }
          on_progress(DownloadProgress {
            downloaded: base_offset.saturating_add(session_downloaded),
            speed: speed_window.rate(now, session_downloaded),
            total: confirmed_entity_size,
            source,
          });
          last_progress_time = now;
          continue;
        }
      };

      last_data_at = Instant::now();
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

      // One report on reaching the assumed size, not one per chunk past it: a declared size
      // that understates the file leaves every remaining chunk complete and unthrottled.
      let is_complete = assumed_total_size > 0 && downloaded_total >= assumed_total_size;
      let report_completion = is_complete && !completion_reported;
      completion_reported |= is_complete;

      if report_completion || elapsed_since_last >= PROGRESS_THROTTLE_MS {
        speed_window.record(now, session_downloaded);

        on_progress(DownloadProgress {
          downloaded: downloaded_total,
          speed: speed_window.rate(now, session_downloaded),
          total: confirmed_entity_size,
          source,
        });

        last_progress_time = now;
      }
    }

    let final_total = base_offset.saturating_add(session_downloaded);

    // Falling back to the bytes read: a declared size that overstated the file, and that no
    // response corrected, would otherwise leave the bar short of 100% for good.
    on_progress(DownloadProgress {
      downloaded: final_total,
      speed: speed_window.rate(Instant::now(), session_downloaded),
      total: confirmed_entity_size.or(Some(final_total)),
      source,
    });

    file
      .flush()
      .await
      .map_err(|e| Error::FileWriteFailed(format!("Failed to flush file: {e}")))?;

    drop(file);

    if let Err(error) = verify_download(&partial_path, expected_size, expected_md5).await {
      remove_partial_pair(&partial_path, &meta_path).await;
      return Err(error);
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

async fn md5_file(path: &Path) -> Result<String, Error> {
  let mut file = File::open(path).await.map_err(Error::Io)?;
  let mut digest = Md5::new();
  let mut buffer = vec![0_u8; 64 * 1024];
  loop {
    let read = file.read(&mut buffer).await.map_err(Error::Io)?;
    if read == 0 {
      break;
    }
    digest.update(&buffer[..read]);
  }
  Ok(hex::encode(digest.finalize()))
}

async fn verify_download(
  path: &Path,
  expected_size: u64,
  expected_md5: Option<&str>,
) -> Result<(), Error> {
  let final_size = tokio::fs::metadata(path).await.map_err(Error::Io)?.len();
  if final_size == 0 {
    return Err(Error::Network("Downloaded empty file".to_string()));
  }
  if expected_size > 0 && final_size != expected_size {
    return Err(Error::DownloadFailed(format!(
      "Downloaded file size mismatch: expected {expected_size}, received {final_size}"
    )));
  }
  if let Some(expected_md5) = expected_md5 {
    let actual_md5 = md5_file(path).await?;
    if !actual_md5.eq_ignore_ascii_case(expected_md5) {
      return Err(Error::DownloadFailed(
        "Downloaded file checksum did not match GameBanana metadata".to_string(),
      ));
    }
  }
  Ok(())
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

  #[test]
  fn download_allowlist_rejects_scheme_host_and_credential_escapes() {
    assert!(validate_download_url("https://gamebanana.com/dl/1").is_ok());
    assert!(validate_download_url("https://files.gamebanana.com/file.zip").is_ok());
    assert!(validate_download_url("http://gamebanana.com/dl/1").is_err());
    assert!(validate_download_url("https://gamebanana.com.evil.test/dl/1").is_err());
    assert!(validate_download_url("https://user@gamebanana.com/dl/1").is_err());
    assert!(validate_download_url("http://127.0.0.1:43199/files/mod.vpk").is_err());
    assert!(validate_download_url("https://127.0.0.1:43199/files/mod.vpk").is_err());
  }

  #[test]
  fn a_sub_range_withholding_its_total_confirms_nothing() {
    let mut headers = HeaderMap::new();
    headers.insert(
      reqwest::header::CONTENT_RANGE,
      reqwest::header::HeaderValue::from_static("bytes 600000-1648575/*"),
    );

    assert_eq!(
      parse_content_range_total(&headers),
      None,
      "a slice that withheld the total was sized at its own end, confirming a fragment as the whole entity"
    );
  }

  #[test]
  fn a_silent_connection_reports_a_falling_rate() {
    let start = Instant::now();
    let mut window = SpeedWindow::new(start, 0);
    let mut bytes = 0;
    for second in 1..=10 {
      bytes += 1_000_000;
      window.record(start + Duration::from_secs(second), bytes);
    }
    let busy = start + Duration::from_secs(10);
    assert_eq!(window.rate(busy, bytes), 1_000_000.0);

    let silent = busy + Duration::from_secs(5);
    assert!(
      window.rate(silent, bytes) < 200_000.0,
      "five seconds without data still reported the earlier rate, hiding the stall from the user"
    );
  }

  #[tokio::test]
  async fn cancel_ends_a_request_whose_headers_never_arrive() {
    use tempfile::tempdir;
    use tokio::net::TcpListener;

    let dir = tempdir().unwrap();
    let target = dir.path().join("mod.zip");
    // A resumable partial, so the request is a Range reconnect.
    let partial = partial_download_path(&target);
    let meta = partial_meta_path(&partial);
    tokio::fs::write(&partial, b"first bytes").await.unwrap();
    let stored = PartialMeta {
      etag: Some("\"v1\"".to_string()),
      last_modified: None,
    };
    write_partial_meta(&meta, &stored).await.unwrap();
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}/mod.zip", listener.local_addr().unwrap());
    let cancel_token = CancellationToken::new();

    let download = tokio::spawn({
      let target = target.clone();
      let cancel_token = cancel_token.clone();
      async move {
        download_file_resumable(
          &url,
          &target,
          0,
          |_| {},
          cancel_token,
          PauseHandle::new(),
          None,
          None,
          false,
        )
        .await
      }
    });
    // Accepted and never answered, like a server that withholds its headers.
    let (_connection, _) = tokio::time::timeout(Duration::from_secs(5), listener.accept())
      .await
      .expect("download never connected to the fixture")
      .unwrap();
    cancel_token.cancel();

    let result = tokio::time::timeout(Duration::from_secs(5), download)
      .await
      .expect("cancel waited for headers that never arrived")
      .unwrap();
    assert!(
      matches!(result, Err(Error::DownloadCancelled)),
      "{result:?}"
    );
    assert!(!partial.exists() && !meta.exists());
  }

  #[tokio::test]
  async fn verifies_size_and_md5_before_finalizing() {
    use tempfile::tempdir;

    let dir = tempdir().unwrap();
    let file_path = dir.path().join("test.txt");
    tokio::fs::write(&file_path, b"hello").await.unwrap();

    assert!(
      verify_download(&file_path, 5, Some("5d41402abc4b2a76b9719d911017c592"))
        .await
        .is_ok()
    );
    assert!(verify_download(&file_path, 4, None).await.is_err());
    assert!(
      verify_download(&file_path, 5, Some("00000000000000000000000000000000"))
        .await
        .is_err()
    );
  }
}
