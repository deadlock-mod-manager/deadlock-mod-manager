use super::downloader::remove_partial_download;
use super::segment_staging::discard_staging;
use crate::errors::Error;
use std::future::Future;
use std::path::Path;

pub(super) async fn download_from_sources<F, Attempt>(
  urls: &[String],
  target: &Path,
  mut download: F,
) -> Result<(), Error>
where
  F: FnMut(String) -> Attempt,
  Attempt: Future<Output = Result<(), Error>>,
{
  let (last, alternatives) = urls
    .split_last()
    .ok_or_else(|| Error::InvalidInput("No download URLs provided".to_string()))?;
  for url in alternatives {
    match download(url.clone()).await {
      Ok(()) => return Ok(()),
      Err(error)
        if matches!(
          error,
          Error::Network(_)
            | Error::DownloadFailed(_)
            | Error::DownloadSourceBusy { .. }
            | Error::DownloadStalled
        ) =>
      {
        log::warn!("Download source failed; trying the next server: {error}");
        remove_partial_download(target).await;
        discard_staging(target).await?;
      }
      Err(error) => return Err(error),
    }
  }
  download(last.clone()).await
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::download_manager::downloader::{
    PauseHandle, download_file_resumable, partial_download_len,
  };
  use crate::download_manager::test_server::{Reply, TestServer};
  use tokio_util::sync::CancellationToken;

  async fn transfer(urls: &[String], target: &Path, pause: PauseHandle) -> Result<(), Error> {
    download_from_sources(urls, target, |url| {
      let target = target.to_path_buf();
      let pause = pause.clone();
      async move {
        download_file_resumable(
          &url,
          &target,
          5,
          |_| {},
          CancellationToken::new(),
          pause,
          Some(5),
          Some("5d41402abc4b2a76b9719d911017c592"),
          false,
        )
        .await
      }
    })
    .await
  }

  #[tokio::test]
  async fn interrupted_mirror_restarts_on_fallback_without_mixing_bytes() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("mod.zip");
    let mirror = TestServer::start(|_, index| {
      if index > 0 {
        return Reply::new(503, Vec::new());
      }
      let mut reply = Reply::new(200, b"xxxxx".to_vec()).header("etag", "\"v1\"");
      reply.disconnect_after = Some(3);
      reply.chunk = 1;
      reply.chunk_delay = std::time::Duration::from_millis(10);
      reply
    })
    .await;
    let fallback = TestServer::start(|_, _| Reply::new(200, b"hello".to_vec())).await;
    transfer(
      &[mirror.url("/mod.zip"), fallback.url("/mod.zip")],
      &target,
      PauseHandle::new(),
    )
    .await
    .unwrap();
    assert_eq!(tokio::fs::read(&target).await.unwrap(), b"hello");
    assert_eq!(mirror.requests().len(), 2);
    assert_eq!(fallback.requests().len(), 1);
    assert!(fallback.requests()[0].range.is_none());
    assert_eq!(partial_download_len(&target).await, 0);
  }

  #[tokio::test]
  async fn checksum_failure_tries_the_next_server() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("mod.zip");
    let mirror = TestServer::start(|_, _| Reply::new(200, b"xxxxx".to_vec())).await;
    let fallback = TestServer::start(|_, _| Reply::new(200, b"hello".to_vec())).await;
    transfer(
      &[mirror.url("/mod.zip"), fallback.url("/mod.zip")],
      &target,
      PauseHandle::new(),
    )
    .await
    .unwrap();
    assert_eq!(tokio::fs::read(&target).await.unwrap(), b"hello");
    assert_eq!(mirror.requests().len(), 1);
    assert_eq!(fallback.requests().len(), 1);
  }

  #[tokio::test]
  async fn exhausted_servers_do_not_finalize_a_file() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("mod.zip");
    let first = TestServer::start(|_, _| Reply::new(404, Vec::new())).await;
    let last = TestServer::start(|_, _| Reply::new(503, Vec::new())).await;
    assert!(
      transfer(
        &[first.url("/mod.zip"), last.url("/mod.zip")],
        &target,
        PauseHandle::new()
      )
      .await
      .is_err()
    );
    assert!(!target.exists());
    assert_eq!(first.requests().len(), 1);
    assert_eq!(last.requests().len(), 1);
  }

  #[tokio::test]
  async fn a_partial_from_a_different_source_restarts_even_with_the_same_etag() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("mod.zip");
    tokio::fs::write(
      super::super::downloader::partial_download_path(&target),
      b"xxx",
    )
    .await
    .unwrap();
    let metadata = serde_json::json!({ "url": "https://old.gamebanana.com/mod.zip", "etag": "\"v1\"", "last_modified": null });
    tokio::fs::write(
      dir.path().join("mod.zip.partial.meta"),
      serde_json::to_vec(&metadata).unwrap(),
    )
    .await
    .unwrap();
    let server =
      TestServer::start(|request, _| Reply::serve(b"hello", request).header("etag", "\"v1\""))
        .await;
    transfer(&[server.url("/mod.zip")], &target, PauseHandle::new())
      .await
      .unwrap();
    assert_eq!(tokio::fs::read(&target).await.unwrap(), b"hello");
    assert!(server.requests()[0].range.is_none());
  }

  #[tokio::test]
  async fn pause_keeps_the_partial_and_never_tries_a_fallback() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("mod.zip");
    tokio::fs::write(
      super::super::downloader::partial_download_path(&target),
      b"hel",
    )
    .await
    .unwrap();
    let first = TestServer::start(|_, _| Reply::new(200, b"hello".to_vec())).await;
    let last = TestServer::start(|_, _| Reply::new(200, b"hello".to_vec())).await;
    let pause = PauseHandle::new();
    pause.pause();
    assert!(matches!(
      transfer(
        &[first.url("/mod.zip"), last.url("/mod.zip")],
        &target,
        pause
      )
      .await,
      Err(Error::DownloadPaused)
    ));
    assert_eq!(partial_download_len(&target).await, 3);
    assert!(first.requests().is_empty() && last.requests().is_empty());
  }

  /// Each server as `DownloadManager::download_file` tries it with segments on.
  #[tokio::test]
  async fn a_refused_range_request_retries_the_server_in_one_stream_before_the_next() {
    use crate::download_manager::budget::TransferBudget;
    use crate::download_manager::segment_staging::staging_dir;
    use crate::download_manager::segmented::{Segmented, download_file_segmented};
    use std::sync::Arc;

    const MD5: &str = "5d41402abc4b2a76b9719d911017c592";
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("mod.zip");
    let mirror = TestServer::start(|request, _| {
      Reply::new(if request.range.is_some() { 400 } else { 500 }, Vec::new())
    })
    .await;
    let fallback = TestServer::start(|_, _| Reply::new(200, b"hello".to_vec())).await;
    let budget = Arc::new(TransferBudget::default());
    budget.set_segmented_enabled(true);

    download_from_sources(
      &[mirror.url("/mod.zip"), fallback.url("/mod.zip")],
      &target,
      |url| {
        let target = target.clone();
        let budget = Arc::clone(&budget);
        async move {
          let (cancel, pause) = (CancellationToken::new(), PauseHandle::new());
          let segmented = download_file_segmented(
            &url,
            &target,
            5,
            MD5,
            &|_| {},
            &cancel,
            &pause,
            &budget,
            false,
          )
          .await?;
          if let Segmented::Finished = segmented {
            return Ok(());
          }
          download_file_resumable(
            &url,
            &target,
            5,
            |_| {},
            cancel,
            pause,
            None,
            Some(MD5),
            false,
          )
          .await
        }
      },
    )
    .await
    .unwrap();

    assert_eq!(tokio::fs::read(&target).await.unwrap(), b"hello");
    let ranged: Vec<bool> = mirror
      .requests()
      .iter()
      .map(|request| request.range.is_some())
      .collect();
    assert_eq!(
      ranged,
      [true, false],
      "the mirror wasn't asked once without Range before the fallback"
    );
    assert!(!staging_dir(&target).exists());
  }
}
