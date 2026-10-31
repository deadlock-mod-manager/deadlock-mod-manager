//! Downloads one file as four Range requests to the same server at once. A
//! single connection to a far-away file server is limited per connection, so
//! four of them get much closer to the line's speed.
//!
//! The first segment's request doubles as the probe: its answer says whether
//! the server honours ranges, which node the redirects ended on, and which
//! version of the file it serves. Every other segment then goes to that node
//! only. Anything unexpected falls back to the single-stream download, except
//! GameBanana saying it's busy, which ends the attempt as it always has.

use super::budget::{Admission, TransferBudget, origin_of};
use super::downloader::{
  DownloadProgress, DownloadSource, MAX_RECONNECTS, PROGRESS_THROTTLE_MS, PauseHandle, STALL_TICK,
  STALL_TIMEOUT, SpeedWindow, classify_source, describe_request_error, download_client,
  retry_after_secs, validate_download_url, verify_download,
};
use super::range::validate_range_response;
use super::segment_staging::{SEGMENT_COUNT, SegmentSource, Staging, discard_staging};
use crate::errors::Error;
use futures::StreamExt;
use reqwest::header::{ACCEPT_ENCODING, ETAG, IF_RANGE, LAST_MODIFIED, RANGE};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;
use tokio::task::JoinSet;
use tokio_util::sync::CancellationToken;

/// Smaller files gain little: at a 241 ms round trip most of a short segment
/// is spent in TCP slow start.
pub const MIN_SEGMENTED_SIZE: u64 = 8 * 1024 * 1024;

#[derive(Debug)]
pub enum Segmented {
  Finished,
  /// The server can't be trusted with segments; download it in one stream.
  Unsupported(String),
}

#[derive(Debug)]
enum WorkerError {
  /// The server answered in a way segments can't use.
  Unsupported(String),
  /// Stopped because the attempt was ending.
  Stopped,
  Failed(Error),
}

/// What every segment of one file shares.
struct Transfer {
  client: reqwest::Client,
  url: String,
  origin: String,
  source: SegmentSource,
  total: u64,
  part_paths: Vec<PathBuf>,
  staging: Mutex<Staging>,
  /// Bytes on disk across the segments, for progress.
  downloaded: AtomicU64,
  cancel_token: CancellationToken,
  pause: PauseHandle,
  budget: Arc<TransferBudget>,
}

fn range_header(start: u64, end_exclusive: u64) -> String {
  format!("bytes={start}-{}", end_exclusive - 1)
}

fn is_busy(source: DownloadSource, status: reqwest::StatusCode) -> bool {
  source == DownloadSource::GameBanana
    && (status == reqwest::StatusCode::TOO_MANY_REQUESTS || status.is_server_error())
}

fn busy_error(response: &reqwest::Response) -> Error {
  Error::DownloadSourceBusy {
    status: response.status().as_u16(),
    retry_after_secs: retry_after_secs(response.headers()),
  }
}

fn strong_etag(headers: &reqwest::header::HeaderMap) -> Option<String> {
  let etag = headers.get(ETAG)?.to_str().ok()?;
  (!etag.starts_with("W/")).then(|| etag.to_string())
}

/// Waits out a pause and a place in the budget. `None` once cancelled.
async fn admit(
  budget: &Arc<TransferBudget>,
  origin: &str,
  pause: &PauseHandle,
  cancel_token: &CancellationToken,
) -> Option<Admission> {
  loop {
    pause.wait_until_running(cancel_token).await;
    // The pause gate also opens on cancel, while still paused.
    if cancel_token.is_cancelled() {
      return None;
    }
    let admission = budget.admit(origin, cancel_token).await?;
    // Paused while waiting: give the place back rather than open a connection.
    if !pause.is_paused() {
      return Some(admission);
    }
  }
}

async fn backoff(attempt: u32, cancel_token: &CancellationToken) -> bool {
  let delay = Duration::from_secs(1 << (attempt - 1));
  tokio::select! {
    () = tokio::time::sleep(delay) => true,
    () = cancel_token.cancelled() => false,
  }
}

#[allow(clippy::too_many_arguments)]
pub async fn download_file_segmented<F>(
  url: &str,
  target_path: &Path,
  expected_size: u64,
  expected_md5: &str,
  on_progress: &F,
  cancel_token: &CancellationToken,
  pause: &PauseHandle,
  budget: &Arc<TransferBudget>,
  trusted_hosts_only: bool,
) -> Result<Segmented, Error>
where
  F: Fn(DownloadProgress),
{
  if trusted_hosts_only {
    validate_download_url(url)?;
  }
  if let Some(parent) = target_path.parent() {
    tokio::fs::create_dir_all(parent).await.map_err(Error::Io)?;
  }
  let mut staging = Staging::open(target_path, expected_size, expected_md5).await?;

  let Some(probe_index) = staging.first_incomplete() else {
    // Everything arrived before the app stopped; the checksum decides the rest.
    let source = staging
      .segment(0)
      .source
      .as_ref()
      .and_then(|source| reqwest::Url::parse(&source.url).ok())
      .map_or(DownloadSource::Other, |url| classify_source(&url));
    return finish(
      target_path,
      staging,
      expected_size,
      expected_md5,
      cancel_token,
      on_progress,
      source,
    )
    .await;
  };
  // The probe asks for its whole segment, so whatever the answer, nothing it
  // writes depends on bytes from an earlier attempt.
  staging.restart_segment(probe_index).await?;

  let probe_client = download_client(trusted_hosts_only, true, true)?;
  let probe_origin = origin_of(url);
  let segment = staging.segment(probe_index).clone();
  let mut reconnects = 0;
  let (response, mut admission) = loop {
    let Some(admission) = admit(budget, &probe_origin, pause, cancel_token).await else {
      return cancelled(target_path).await;
    };
    let request = probe_client
      .get(url)
      .header(RANGE, range_header(segment.start, segment.end))
      .header(ACCEPT_ENCODING, "identity");
    let sent = tokio::select! {
      biased;
      () = cancel_token.cancelled() => return cancelled(target_path).await,
      sent = request.send() => sent,
    };
    match sent {
      Ok(response) => break (response, admission),
      Err(error) => {
        let transient = !error.is_redirect();
        let reason = describe_request_error(error);
        drop(admission);
        if transient && reconnects < MAX_RECONNECTS {
          reconnects += 1;
          log::warn!("Segment probe failed (retry {reconnects}/{MAX_RECONNECTS}): {reason}");
          if !backoff(reconnects, cancel_token).await {
            return cancelled(target_path).await;
          }
          continue;
        }
        return Err(Error::Network(format!("Failed to send request: {reason}")));
      }
    }
  };

  let status = response.status();
  let source_kind = classify_source(response.url());
  if is_busy(source_kind, status) {
    return Err(busy_error(&response));
  }
  // Ignoring the Range header or refusing it: either way an ordinary request
  // may still work.
  if status == reqwest::StatusCode::OK || status == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
    discard_staging(target_path).await?;
    return Ok(Segmented::Unsupported(format!(
      "the server answered the Range request with {status}"
    )));
  }
  if !status.is_success() {
    return Err(Error::Network(format!(
      "Server returned error status: {status}"
    )));
  }
  if let Err(error) = validate_range_response(
    status,
    response.headers(),
    segment.start,
    Some(segment.end - 1),
    Some(expected_size),
  ) {
    discard_staging(target_path).await?;
    return Ok(Segmented::Unsupported(error.to_string()));
  }
  let Some(etag) = strong_etag(response.headers()) else {
    discard_staging(target_path).await?;
    return Ok(Segmented::Unsupported(
      "the server sent no strong ETag".to_string(),
    ));
  };
  let source = SegmentSource {
    url: response.url().to_string(),
    etag,
    last_modified: response
      .headers()
      .get(LAST_MODIFIED)
      .and_then(|value| value.to_str().ok())
      .map(str::to_string),
  };
  staging.pin_source(&source).await?;
  log::info!(
    "Downloading {target_path:?} in {SEGMENT_COUNT} segments from {}",
    response.url().origin().ascii_serialization()
  );

  let child_token = cancel_token.child_token();
  let transfer = Arc::new(Transfer {
    client: download_client(trusted_hosts_only, false, true)?,
    url: source.url.clone(),
    origin: origin_of(&source.url),
    source,
    total: expected_size,
    part_paths: (0..SEGMENT_COUNT)
      .map(|index| staging.part_path(index))
      .collect(),
    downloaded: AtomicU64::new(staging.stored_total()),
    staging: Mutex::new(staging),
    cancel_token: child_token.clone(),
    pause: pause.clone(),
    budget: Arc::clone(budget),
  });

  let mut workers = JoinSet::new();
  // The probe was counted against the address it asked for; it belongs to the
  // node it reached. If that node already has four connections, close it and
  // let its segment wait its turn like the others.
  let mut probe = if admission.retarget(&transfer.origin) {
    Some((response, admission))
  } else {
    log::info!(
      "{} is busy with other downloads; segment {probe_index} waits",
      transfer.origin
    );
    drop(response);
    drop(admission);
    None
  };
  for index in 0..SEGMENT_COUNT {
    let (complete, stored) = {
      let staging = transfer.staging.lock().await;
      (staging.segment(index).complete, staging.stored(index))
    };
    if complete {
      continue;
    }
    let first = if index == probe_index {
      probe.take()
    } else {
      None
    };
    workers.spawn(fetch_segment(Arc::clone(&transfer), index, stored, first));
  }

  let results = collect_workers(
    &mut workers,
    &transfer,
    &child_token,
    on_progress,
    source_kind,
  )
  .await;

  if cancel_token.is_cancelled() {
    return cancelled(target_path).await;
  }
  match settle(results) {
    Ok(()) => {}
    Err(WorkerError::Unsupported(reason)) => {
      drop(transfer);
      discard_staging(target_path).await?;
      return Ok(Segmented::Unsupported(reason));
    }
    Err(WorkerError::Failed(error)) => return Err(error),
    Err(WorkerError::Stopped) => {
      return Err(Error::DownloadFailed(
        "Segment workers stopped without a reason".to_string(),
      ));
    }
  }

  let Ok(transfer) = Arc::try_unwrap(transfer) else {
    return Err(Error::DownloadFailed(
      "A segment worker outlived its download".to_string(),
    ));
  };
  finish(
    target_path,
    transfer.staging.into_inner(),
    expected_size,
    expected_md5,
    cancel_token,
    on_progress,
    source_kind,
  )
  .await
}

/// What the workers' results add up to, once all of them are in. GameBanana
/// being busy outranks everything: it means wait, never retry another way. A
/// server segments can't use comes next, since the single stream may still
/// work. Workers stopped by another's failure say nothing.
fn settle(results: Vec<Result<(), WorkerError>>) -> Result<(), WorkerError> {
  let mut outcome = Ok(());
  for result in results {
    let Err(error) = result else { continue };
    let rank = |error: &WorkerError| match error {
      WorkerError::Failed(Error::DownloadSourceBusy { .. }) => 3,
      WorkerError::Unsupported(_) => 2,
      WorkerError::Failed(_) => 1,
      WorkerError::Stopped => 0,
    };
    if outcome
      .as_ref()
      .err()
      .is_none_or(|current| rank(&error) > rank(current))
    {
      outcome = Err(error);
    }
  }
  outcome
}

async fn cancelled(target_path: &Path) -> Result<Segmented, Error> {
  log::info!("Segmented download cancelled");
  discard_staging(target_path).await?;
  Err(Error::DownloadCancelled)
}

/// Reports progress until every worker has returned. The first failure stops
/// the rest, so nothing decides the outcome while a worker still writes.
async fn collect_workers<F>(
  workers: &mut JoinSet<Result<(), WorkerError>>,
  transfer: &Transfer,
  child_token: &CancellationToken,
  on_progress: &F,
  source: DownloadSource,
) -> Vec<Result<(), WorkerError>>
where
  F: Fn(DownloadProgress),
{
  let started = Instant::now();
  let mut speed_window = SpeedWindow::new(started, transfer.downloaded.load(Ordering::Relaxed));
  let report = |speed_window: &mut SpeedWindow| {
    let now = Instant::now();
    let downloaded = transfer.downloaded.load(Ordering::Relaxed);
    speed_window.record(now, downloaded);
    on_progress(DownloadProgress {
      downloaded,
      speed: speed_window.rate(now, downloaded),
      total: Some(transfer.total),
      source,
    });
  };
  report(&mut speed_window);
  let mut ticker = tokio::time::interval(Duration::from_millis(PROGRESS_THROTTLE_MS as u64));
  ticker.tick().await;
  let mut results = Vec::new();
  loop {
    tokio::select! {
      joined = workers.join_next() => match joined {
        Some(joined) => {
          let result = joined.unwrap_or_else(|error| {
            Err(WorkerError::Failed(Error::DownloadFailed(format!("Segment task failed: {error}"))))
          });
          if result.is_err() {
            child_token.cancel();
          }
          results.push(result);
        }
        None => break,
      },
      _ = ticker.tick() => report(&mut speed_window),
    }
  }
  report(&mut speed_window);
  results
}

/// Joins the parts, checks the whole file, and only then puts it in place.
async fn finish<F>(
  target_path: &Path,
  mut staging: Staging,
  expected_size: u64,
  expected_md5: &str,
  cancel_token: &CancellationToken,
  on_progress: &F,
  source: DownloadSource,
) -> Result<Segmented, Error>
where
  F: Fn(DownloadProgress),
{
  on_progress(DownloadProgress {
    downloaded: expected_size,
    speed: 0.0,
    total: Some(expected_size),
    source,
  });
  let assembled = match staging.assemble(cancel_token).await {
    Ok(path) => path,
    Err(Error::DownloadCancelled) => return cancelled(target_path).await,
    Err(error) => {
      discard_staging(target_path).await?;
      return Err(error);
    }
  };
  if let Err(error) = verify_download(&assembled, expected_size, Some(expected_md5)).await {
    discard_staging(target_path).await?;
    return Err(error);
  }
  if cancel_token.is_cancelled() {
    return cancelled(target_path).await;
  }
  tokio::fs::rename(&assembled, target_path)
    .await
    .map_err(|error| Error::FileWriteFailed(format!("Failed to finalize download: {error}")))?;
  discard_staging(target_path).await?;
  log::info!("Download completed: {target_path:?}");
  Ok(Segmented::Finished)
}

/// Fetches what's missing of one segment into its part, reconnecting from the
/// part's length when the connection drops or stalls.
async fn fetch_segment(
  transfer: Arc<Transfer>,
  index: usize,
  mut stored: u64,
  mut first: Option<(reqwest::Response, Admission)>,
) -> Result<(), WorkerError> {
  let (start, end) = {
    let staging = transfer.staging.lock().await;
    let segment = staging.segment(index);
    (segment.start, segment.end)
  };
  let length = end - start;
  let mut reconnects: u32 = 0;
  let mut file = tokio::fs::OpenOptions::new()
    .create(true)
    .append(true)
    .open(&transfer.part_paths[index])
    .await
    .map_err(|error| WorkerError::Failed(Error::Io(error)))?;

  while stored < length {
    let (response, _admission) = match first.take() {
      Some(probe) => probe,
      None => {
        let Some(admission) = admit(
          &transfer.budget,
          &transfer.origin,
          &transfer.pause,
          &transfer.cancel_token,
        )
        .await
        else {
          return Err(WorkerError::Stopped);
        };
        let request = transfer
          .client
          .get(&transfer.url)
          .header(RANGE, range_header(start + stored, end))
          .header(IF_RANGE, &transfer.source.etag)
          .header(ACCEPT_ENCODING, "identity");
        let sent = tokio::select! {
          biased;
          () = transfer.cancel_token.cancelled() => return Err(WorkerError::Stopped),
          sent = request.send() => sent,
        };
        let response = match sent {
          Ok(response) => response,
          Err(error) => {
            let reason = describe_request_error(error);
            drop(admission);
            if reconnects < MAX_RECONNECTS {
              reconnects += 1;
              log::warn!(
                "Segment {index} request failed (retry {reconnects}/{MAX_RECONNECTS}): {reason}"
              );
              if !backoff(reconnects, &transfer.cancel_token).await {
                return Err(WorkerError::Stopped);
              }
              continue;
            }
            return Err(WorkerError::Failed(Error::Network(format!(
              "Failed to send request: {reason}"
            ))));
          }
        };
        let status = response.status();
        if is_busy(classify_source(response.url()), status) {
          return Err(WorkerError::Failed(busy_error(&response)));
        }
        if let Err(error) = validate_range_response(
          status,
          response.headers(),
          start + stored,
          Some(end - 1),
          Some(transfer.total),
        ) {
          return Err(WorkerError::Unsupported(format!(
            "segment {index}: {error}"
          )));
        }
        if strong_etag(response.headers()).as_deref() != Some(transfer.source.etag.as_str()) {
          return Err(WorkerError::Unsupported(format!(
            "segment {index}: the file changed on the server"
          )));
        }
        (response, admission)
      }
    };

    let mut stream = response.bytes_stream();
    let mut last_data_at = Instant::now();
    loop {
      if transfer.cancel_token.is_cancelled() {
        return Err(WorkerError::Stopped);
      }
      if transfer.pause.is_paused() {
        transfer
          .pause
          .wait_until_running(&transfer.cancel_token)
          .await;
        // Time spent paused is not the server going quiet.
        last_data_at = Instant::now();
        continue;
      }
      match tokio::time::timeout(STALL_TICK, stream.next()).await {
        Ok(Some(Ok(chunk))) => {
          last_data_at = Instant::now();
          let chunk_length = chunk.len() as u64;
          if stored + chunk_length > length {
            return Err(WorkerError::Unsupported(format!(
              "segment {index}: the server sent more bytes than it described"
            )));
          }
          file.write_all(&chunk).await.map_err(|error| {
            WorkerError::Failed(Error::FileWriteFailed(format!(
              "Failed to write segment: {error}"
            )))
          })?;
          stored += chunk_length;
          transfer
            .downloaded
            .fetch_add(chunk_length, Ordering::Relaxed);
        }
        Ok(Some(Err(error))) => {
          if reconnects >= MAX_RECONNECTS {
            return Err(WorkerError::Failed(Error::Network(format!(
              "Failed to read chunk after {reconnects} retries: {error}"
            ))));
          }
          reconnects += 1;
          log::warn!(
            "Segment {index} read error (retry {reconnects}/{MAX_RECONNECTS}), re-issuing its Range request: {error}"
          );
          break;
        }
        Ok(None) => {
          if stored < length {
            return Err(WorkerError::Unsupported(format!(
              "segment {index}: the response ended {} bytes early",
              length - stored
            )));
          }
          break;
        }
        Err(_) => {
          if last_data_at.elapsed() >= STALL_TIMEOUT {
            if reconnects >= MAX_RECONNECTS {
              return Err(WorkerError::Failed(Error::DownloadStalled));
            }
            reconnects += 1;
            log::warn!(
              "Segment {index} silent for {}s (retry {reconnects}/{MAX_RECONNECTS}), re-issuing its Range request",
              STALL_TIMEOUT.as_secs()
            );
            break;
          }
        }
      }
    }
  }

  file
    .flush()
    .await
    .map_err(|error| WorkerError::Failed(Error::Io(error)))?;
  file
    .sync_all()
    .await
    .map_err(|error| WorkerError::Failed(Error::Io(error)))?;
  drop(file);
  transfer
    .staging
    .lock()
    .await
    .mark_complete(index)
    .await
    .map_err(WorkerError::Failed)
}

#[cfg(test)]
mod tests {
  use super::super::segment_staging::{plan_segments, staging_dir};
  use super::super::test_server::{Reply, TestServer};
  use super::*;
  use md5::{Digest, Md5};

  const ETAG: &str = "\"e2e-v1\"";

  fn body() -> Vec<u8> {
    (0..400_000_u32).map(|i| (i % 251) as u8).collect()
  }

  fn md5_of(body: &[u8]) -> String {
    hex::encode(Md5::digest(body))
  }

  fn enabled_budget() -> Arc<TransferBudget> {
    let budget = Arc::new(TransferBudget::default());
    budget.set_segmented_enabled(true);
    budget
  }

  /// A Range-capable server slow enough that segments overlap.
  async fn range_server(body: &[u8]) -> TestServer {
    let body = body.to_vec();
    TestServer::start(move |request, _| {
      Reply::serve(&body, request)
        .header("etag", ETAG)
        .throttled(8 * 1024, Duration::from_millis(20))
    })
    .await
  }

  async fn download(
    server: &TestServer,
    target: &Path,
    body: &[u8],
    budget: &Arc<TransferBudget>,
    cancel_token: &CancellationToken,
  ) -> Result<Segmented, Error> {
    tokio::time::timeout(
      Duration::from_secs(20),
      download_file_segmented(
        &server.url("/mod.zip"),
        target,
        body.len() as u64,
        &md5_of(body),
        &|_| {},
        cancel_token,
        &PauseHandle::new(),
        budget,
        false,
      ),
    )
    .await
    .expect("the segmented download never settled")
  }

  fn spans(server: &TestServer) -> Vec<String> {
    let mut ranges: Vec<String> = server
      .requests()
      .into_iter()
      .map(|request| request.range.unwrap_or_default())
      .collect();
    ranges.sort();
    ranges
  }

  fn segment_ranges(size: u64) -> Vec<String> {
    let mut ranges: Vec<String> = plan_segments(size)
      .iter()
      .map(|segment| range_header(segment.start, segment.end))
      .collect();
    ranges.sort();
    ranges
  }

  #[tokio::test]
  async fn four_segments_arrive_over_four_connections_at_once() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("mod.zip");
    let body = body();
    let server = range_server(&body).await;

    let result = download(
      &server,
      &target,
      &body,
      &enabled_budget(),
      &CancellationToken::new(),
    )
    .await;

    assert!(matches!(result, Ok(Segmented::Finished)), "{result:?}");
    assert_eq!(tokio::fs::read(&target).await.unwrap(), body);
    assert_eq!(spans(&server), segment_ranges(body.len() as u64));
    assert!(
      server
        .requests()
        .iter()
        .all(|request| request.path == "/mod.zip")
    );
    assert_eq!(
      server.peak_connections(),
      SEGMENT_COUNT,
      "the segments didn't download at the same time"
    );
    let if_ranges: Vec<_> = server
      .requests()
      .into_iter()
      .skip(1)
      .map(|r| r.if_range)
      .collect();
    assert!(
      if_ranges.iter().all(|value| value.as_deref() == Some(ETAG)),
      "{if_ranges:?}"
    );
    assert!(!staging_dir(&target).exists());
  }

  #[tokio::test]
  async fn a_server_that_ignores_ranges_is_left_to_the_single_stream() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("mod.zip");
    let body = body();
    let server = TestServer::start({
      let body = body.clone();
      move |_, _| Reply::new(200, body.clone()).header("etag", ETAG)
    })
    .await;

    let result = download(
      &server,
      &target,
      &body,
      &enabled_budget(),
      &CancellationToken::new(),
    )
    .await;

    assert!(
      matches!(result, Ok(Segmented::Unsupported(_))),
      "{result:?}"
    );
    assert_eq!(server.requests().len(), 1);
    assert!(!target.exists() && !staging_dir(&target).exists());
  }

  #[tokio::test]
  async fn a_server_that_refuses_ranges_is_left_to_the_single_stream() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("mod.zip");
    let body = body();
    let server = TestServer::start(|_, _| Reply::new(416, Vec::new())).await;

    let result = download(
      &server,
      &target,
      &body,
      &enabled_budget(),
      &CancellationToken::new(),
    )
    .await;

    assert!(
      matches!(result, Ok(Segmented::Unsupported(_))),
      "a 416 ended the download instead of falling back: {result:?}"
    );
    assert!(!staging_dir(&target).exists());
  }

  #[tokio::test]
  async fn a_weak_etag_cant_tie_segments_together() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("mod.zip");
    let body = body();
    let server = TestServer::start({
      let body = body.clone();
      move |request, _| Reply::serve(&body, request).header("etag", "W/\"e2e-v1\"")
    })
    .await;

    let result = download(
      &server,
      &target,
      &body,
      &enabled_budget(),
      &CancellationToken::new(),
    )
    .await;

    assert!(
      matches!(result, Ok(Segmented::Unsupported(_))),
      "{result:?}"
    );
  }

  #[tokio::test]
  async fn a_wrong_content_range_stops_every_segment_before_falling_back() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("mod.zip");
    let body = body();
    let third = plan_segments(body.len() as u64)[2].clone();
    let server = TestServer::start({
      let body = body.clone();
      move |request, _| {
        let reply = Reply::serve(&body, request)
          .header("etag", ETAG)
          .throttled(8 * 1024, Duration::from_millis(20));
        if request.byte_range().map(|(start, _)| start) == Some(third.start) {
          // Shifted by one byte: right length, wrong place.
          let mut wrong = Reply::new(
            206,
            body[(third.start + 1) as usize..=third.end as usize].to_vec(),
          )
          .header("etag", ETAG);
          wrong.headers.push((
            "content-range".to_string(),
            format!("bytes {}-{}/{}", third.start + 1, third.end, body.len()),
          ));
          return wrong;
        }
        reply
      }
    })
    .await;

    let result = download(
      &server,
      &target,
      &body,
      &enabled_budget(),
      &CancellationToken::new(),
    )
    .await;

    assert!(
      matches!(&result, Ok(Segmented::Unsupported(reason)) if reason.contains("segment 2")),
      "{result:?}"
    );
    let requests = server.requests().len();
    tokio::time::sleep(Duration::from_millis(300)).await;
    assert_eq!(
      server.requests().len(),
      requests,
      "a segment kept going after the fallback"
    );
    assert!(!staging_dir(&target).exists() && !target.exists());
  }

  #[tokio::test]
  async fn cancelling_stops_every_segment_and_removes_the_staging() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("mod.zip");
    let body = body();
    let server = TestServer::start({
      let body = body.clone();
      move |request, _| {
        Reply::serve(&body, request)
          .header("etag", ETAG)
          .throttled(1024, Duration::from_millis(50))
      }
    })
    .await;
    let cancel_token = CancellationToken::new();
    let running = tokio::spawn({
      let target = target.clone();
      let body = body.clone();
      let cancel_token = cancel_token.clone();
      let url = server.url("/mod.zip");
      async move {
        download_file_segmented(
          &url,
          &target,
          body.len() as u64,
          &md5_of(&body),
          &|_| {},
          &cancel_token,
          &PauseHandle::new(),
          &enabled_budget(),
          false,
        )
        .await
      }
    });
    while server.requests().len() < SEGMENT_COUNT {
      tokio::time::sleep(Duration::from_millis(10)).await;
    }
    tokio::time::sleep(Duration::from_millis(100)).await;

    cancel_token.cancel();
    let result = tokio::time::timeout(Duration::from_secs(5), running)
      .await
      .expect("cancel waited for the segments to finish downloading")
      .unwrap();

    assert!(
      matches!(result, Err(Error::DownloadCancelled)),
      "{result:?}"
    );
    assert!(!staging_dir(&target).exists() && !target.exists());
  }

  #[tokio::test]
  async fn cancelling_a_paused_download_ends_it() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("mod.zip");
    let body = body();
    let server = range_server(&body).await;
    let pause = PauseHandle::new();
    pause.pause();
    let cancel_token = CancellationToken::new();
    cancel_token.cancel();

    let result = tokio::time::timeout(
      Duration::from_secs(5),
      download_file_segmented(
        &server.url("/mod.zip"),
        &target,
        body.len() as u64,
        &md5_of(&body),
        &|_| {},
        &cancel_token,
        &pause,
        &enabled_budget(),
        false,
      ),
    )
    .await
    .expect("a cancelled download stayed paused");

    assert!(
      matches!(result, Err(Error::DownloadCancelled)),
      "{result:?}"
    );
    assert!(server.requests().is_empty() && !staging_dir(&target).exists());
  }

  #[tokio::test]
  async fn a_resumed_download_fetches_only_what_is_missing() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("mod.zip");
    let body = body();
    let server = range_server(&body).await;
    let size = body.len() as u64;
    let segments = plan_segments(size);
    {
      let mut staging = Staging::open(&target, size, &md5_of(&body)).await.unwrap();
      staging
        .pin_source(&SegmentSource {
          url: server.url("/mod.zip"),
          etag: ETAG.to_string(),
          last_modified: None,
        })
        .await
        .unwrap();
      let second = &segments[1];
      tokio::fs::write(
        staging.part_path(1),
        &body[second.start as usize..second.end as usize],
      )
      .await
      .unwrap();
      staging.mark_complete(1).await.unwrap();
      let fourth = &segments[3];
      let half = fourth.start + fourth.byte_count() / 2;
      tokio::fs::write(
        staging.part_path(3),
        &body[fourth.start as usize..half as usize],
      )
      .await
      .unwrap();
    }

    let result = download(
      &server,
      &target,
      &body,
      &enabled_budget(),
      &CancellationToken::new(),
    )
    .await;

    assert!(matches!(result, Ok(Segmented::Finished)), "{result:?}");
    assert_eq!(tokio::fs::read(&target).await.unwrap(), body);
    let half = segments[3].start + segments[3].byte_count() / 2;
    let mut expected = vec![
      range_header(segments[0].start, segments[0].end),
      range_header(segments[2].start, segments[2].end),
      range_header(half, segments[3].end),
    ];
    expected.sort();
    assert_eq!(
      spans(&server),
      expected,
      "finished or partly finished segments were downloaded again"
    );
  }

  #[tokio::test]
  async fn a_corrupted_segment_fails_the_checksum_and_leaves_nothing_behind() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("mod.zip");
    let body = body();
    let mut served = body.clone();
    let flipped = plan_segments(body.len() as u64)[2].start as usize + 10;
    served[flipped] ^= 0xff;
    let server = range_server(&served).await;

    let result = download(
      &server,
      &target,
      &body,
      &enabled_budget(),
      &CancellationToken::new(),
    )
    .await;

    assert!(
      matches!(&result, Err(Error::DownloadFailed(message)) if message.contains("checksum")),
      "{result:?}"
    );
    assert!(!staging_dir(&target).exists() && !target.exists());
  }

  #[tokio::test]
  async fn two_files_on_one_server_share_four_connections() {
    let dir = tempfile::tempdir().unwrap();
    let body = body();
    let server = range_server(&body).await;
    let budget = enabled_budget();
    let cancel_token = CancellationToken::new();
    let first = dir.path().join("a.zip");
    let second = dir.path().join("b.zip");

    let (a, b) = tokio::join!(
      download(&server, &first, &body, &budget, &cancel_token),
      download(&server, &second, &body, &budget, &cancel_token),
    );

    assert!(matches!(a, Ok(Segmented::Finished)) && matches!(b, Ok(Segmented::Finished)));
    assert_eq!(
      server.peak_connections(),
      super::super::budget::ORIGIN_LIMIT,
      "two segmented files opened more than four connections to one server"
    );
  }

  #[test]
  fn a_busy_server_outranks_a_segment_it_answered_wrongly() {
    let busy = || {
      WorkerError::Failed(Error::DownloadSourceBusy {
        status: 429,
        retry_after_secs: Some(60),
      })
    };
    for results in [
      vec![
        Err(WorkerError::Unsupported("segment 1".into())),
        Err(busy()),
        Err(WorkerError::Stopped),
      ],
      vec![
        Err(busy()),
        Err(WorkerError::Unsupported("segment 1".into())),
        Ok(()),
      ],
    ] {
      assert!(
        matches!(
          settle(results),
          Err(WorkerError::Failed(Error::DownloadSourceBusy { .. }))
        ),
        "a 429 turned into a fallback that opens yet another connection"
      );
    }
    assert!(matches!(
      settle(vec![
        Err(WorkerError::Failed(Error::DownloadStalled)),
        Err(WorkerError::Unsupported("x".into()))
      ]),
      Err(WorkerError::Unsupported(_))
    ));
    assert!(matches!(
      settle(vec![
        Ok(()),
        Err(WorkerError::Stopped),
        Err(WorkerError::Failed(Error::DownloadStalled))
      ]),
      Err(WorkerError::Failed(Error::DownloadStalled))
    ));
    assert!(settle(vec![Ok(()), Ok(())]).is_ok());
  }
}
