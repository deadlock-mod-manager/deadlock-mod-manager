pub mod downloader;
mod progress;

use crate::app_runtime::AppHandle;
use crate::errors::Error;
use crate::mod_manager::filesystem_helper::FileSystemHelper;
use crate::mod_manager::perf_config::staging as perf_staging;
use crate::mod_manager::perf_config::types::{ConfigFoundEvent, ImportVariant};
use downloader::{
  DownloadProgress as FileProgress, DownloadSource, PauseHandle, download_file_resumable,
};
use progress::{AcceptedProgress, ProgressAggregator};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};
use std::path::PathBuf;
use std::sync::{
  Arc,
  atomic::{AtomicU64, Ordering},
};
use tauri::Emitter;
use tokio::sync::{Mutex, oneshot};
use tokio_util::sync::CancellationToken;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DownloadFileDto {
  pub url: String,
  pub name: String,
  pub size: u64,
  #[serde(default, rename = "md5Checksum")]
  pub md5_checksum: Option<String>,
}

#[derive(Clone, Debug)]
pub struct DownloadTask {
  pub mod_id: String,
  pub files: Vec<DownloadFileDto>,
  pub target_dir: PathBuf,
  pub profile_folder: Option<String>,
  pub is_profile_import: bool,
  pub file_tree: Option<crate::mod_manager::file_tree::ModFileTree>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadStartedEvent {
  pub mod_id: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgressEvent {
  pub mod_id: String,
  pub file_index: usize,
  pub total_files: usize,
  pub progress: u64,
  pub progress_total: u64,
  pub total: u64,
  pub transfer_speed: f64,
  pub percentage: f64,
  /// `None` on reports that carry no response, such as a file finishing.
  pub source: Option<DownloadSource>,
}

impl DownloadProgressEvent {
  fn from_accepted(
    accepted: AcceptedProgress,
    mod_id: &str,
    file_index: usize,
    total_files: usize,
    source: Option<DownloadSource>,
  ) -> Self {
    Self {
      mod_id: mod_id.to_string(),
      file_index,
      total_files,
      progress: accepted.file_downloaded,
      progress_total: accepted.total_downloaded,
      total: accepted.total_size,
      transfer_speed: accepted.total_speed,
      percentage: accepted.percentage,
      source,
    }
  }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadCompletedEvent {
  pub mod_id: String,
  pub path: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadFileTreeEvent {
  pub mod_id: String,
  pub file_tree: crate::mod_manager::file_tree::ModFileTree,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadExtractingEvent {
  pub mod_id: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadFontsFoundEvent {
  pub mod_id: String,
  pub fonts: Vec<crate::mod_manager::FontInfo>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadErrorEvent {
  pub mod_id: String,
  pub error: String,
  /// Set when the failure is on the download server's side rather than the app's.
  pub reason: Option<DownloadFailureReason>,
  pub retry_after_secs: Option<u64>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DownloadFailureReason {
  /// GameBanana answered with 429 or a 5xx.
  SourceBusy,
  /// The server stopped sending data and reconnecting did not help.
  Stalled,
}

impl DownloadErrorEvent {
  fn new(mod_id: String, error: &Error) -> Self {
    let (reason, retry_after_secs) = match error {
      Error::DownloadSourceBusy {
        retry_after_secs, ..
      } => (Some(DownloadFailureReason::SourceBusy), *retry_after_secs),
      Error::DownloadStalled => (Some(DownloadFailureReason::Stalled), None),
      _ => (None, None),
    };
    Self {
      mod_id,
      error: error.to_string(),
      reason,
      retry_after_secs,
    }
  }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadPausedEvent {
  pub mod_id: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadResumedEvent {
  pub mod_id: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadStatus {
  pub mod_id: String,
  pub status: String,
}

struct ActiveDownload {
  cancel_token: CancellationToken,
  pause: PauseHandle,
  status: String,
  profile_folder: Option<String>,
}

#[derive(Clone, Debug)]
pub struct PreparedDownload {
  pub vpk_paths: Vec<PathBuf>,
  /// What was actually prepared, so the installed mod stops reporting the
  /// selection it was updated from.
  pub file_tree: Option<crate::mod_manager::file_tree::ModFileTree>,
  /// No saved choice fits an archive with several VPKs, so nothing was
  /// prepared and `file_tree` is what the user picks from.
  pub selection_required: bool,
  scratch_paths: Vec<PathBuf>,
}

impl PreparedDownload {
  pub fn remove_scratch_files(&self) {
    for path in &self.scratch_paths {
      let result = if path.is_dir() {
        std::fs::remove_dir_all(path)
      } else {
        std::fs::remove_file(path)
      };
      if let Err(error) = result
        && path.exists()
      {
        log::warn!(
          "Failed to remove update scratch path {}: {error}",
          path.display()
        );
      }
    }
  }
}

#[derive(Clone, Copy, Debug)]
enum DownloadPurpose {
  Install,
  PrepareUpdate,
}

struct QueuedDownload {
  operation_id: u64,
  task: DownloadTask,
  purpose: DownloadPurpose,
  completion: Option<oneshot::Sender<Result<PreparedDownload, String>>>,
  /// Paused downloads keep their place in the queue, but the worker skips them.
  paused: bool,
}

pub struct DownloadManager {
  queue: Arc<Mutex<VecDeque<QueuedDownload>>>,
  active_downloads: Arc<Mutex<HashMap<String, ActiveDownload>>>,
  app_handle: AppHandle,
  processing: Arc<Mutex<bool>>,
  next_operation_id: AtomicU64,
}

impl DownloadManager {
  pub fn new(app_handle: AppHandle) -> Self {
    Self {
      queue: Arc::new(Mutex::new(VecDeque::new())),
      active_downloads: Arc::new(Mutex::new(HashMap::new())),
      app_handle,
      processing: Arc::new(Mutex::new(false)),
      next_operation_id: AtomicU64::new(1),
    }
  }

  pub async fn queue_download(&self, task: DownloadTask) -> Result<(), Error> {
    self.queue(task, DownloadPurpose::Install, None).await;
    Ok(())
  }

  /// Resolves once the files are placed. A download dropped from the queue
  /// before it started reports as cancelled.
  pub async fn queue_download_and_wait(&self, task: DownloadTask) -> Result<(), Error> {
    self
      .queue_with_completion(task, DownloadPurpose::Install)
      .await
      .await
      .map_err(|_| Error::DownloadCancelled)?
      .map(|_| ())
      .map_err(Error::DownloadFailed)
  }

  /// A download dropped from the queue before it started reports as cancelled.
  pub async fn queue_download_and_prepare(
    &self,
    task: DownloadTask,
  ) -> Result<PreparedDownload, Error> {
    self
      .queue_with_completion(task, DownloadPurpose::PrepareUpdate)
      .await
      .await
      .map_err(|_| Error::DownloadCancelled)?
      .map_err(Error::DownloadFailed)
  }

  async fn queue_with_completion(
    &self,
    task: DownloadTask,
    purpose: DownloadPurpose,
  ) -> oneshot::Receiver<Result<PreparedDownload, String>> {
    let (sender, receiver) = oneshot::channel();
    self.queue(task, purpose, Some(sender)).await;
    receiver
  }

  async fn queue(
    &self,
    task: DownloadTask,
    purpose: DownloadPurpose,
    completion: Option<oneshot::Sender<Result<PreparedDownload, String>>>,
  ) {
    let operation_id = self.next_operation_id.fetch_add(1, Ordering::Relaxed);
    log::info!(
      "Queueing download operation {operation_id} for mod {} (profile: {:?})",
      task.mod_id,
      task.profile_folder
    );

    {
      let mut queue = self.queue.lock().await;
      queue.push_back(QueuedDownload {
        operation_id,
        task,
        purpose,
        completion,
        paused: false,
      });
    }

    self.process_queue().await;
  }

  async fn process_queue(&self) {
    let mut processing = self.processing.lock().await;
    if *processing {
      log::debug!("Queue is already being processed");
      return;
    }
    *processing = true;
    drop(processing);

    let queue_clone = Arc::clone(&self.queue);
    let active_clone = Arc::clone(&self.active_downloads);
    let app_handle = self.app_handle.clone();
    let processing_clone = Arc::clone(&self.processing);

    tokio::spawn(async move {
      loop {
        // Register the download as active before releasing the queue, so status
        // checks and profile cancellation never miss a task between the two.
        let task = {
          let mut queue = queue_clone.lock().await;
          match Self::next_runnable(&mut queue) {
            Some(queued) => {
              let cancel_token = CancellationToken::new();
              let pause = PauseHandle::new();
              active_clone.lock().await.insert(
                queued.task.mod_id.clone(),
                ActiveDownload {
                  cancel_token: cancel_token.clone(),
                  pause: pause.clone(),
                  status: "downloading".to_string(),
                  profile_folder: queued.task.profile_folder.clone(),
                },
              );
              Some((queued, cancel_token, pause))
            }
            None => None,
          }
        };

        match task {
          Some((queued, cancel_token, pause)) => {
            let mod_id = queued.task.mod_id.clone();
            let profile_folder = queued.task.profile_folder.clone();
            let task_path = queued.task.target_dir.to_string_lossy().to_string();
            let result = Self::download_mod(
              queued.operation_id,
              &queued.task,
              queued.purpose,
              cancel_token.clone(),
              pause,
              Arc::clone(&active_clone),
              app_handle.clone(),
            )
            .await;

            let (queued, result) = if matches!(result, Err(Error::DownloadPaused)) {
              let cancelled = {
                let mut queue = queue_clone.lock().await;
                Self::park(&mut queue, &mut *active_clone.lock().await, queued)
              };
              let Some(queued) = cancelled else {
                continue;
              };
              // Cancelled while its files were stopping, which left their partials.
              Self::remove_partials(&queued.task).await;
              (queued, Err(Error::DownloadCancelled))
            } else {
              active_clone.lock().await.remove(&mod_id);
              // A file that stopped for a pause just before the cancel kept its partial.
              if cancel_token.is_cancelled() {
                Self::remove_partials(&queued.task).await;
              }
              (queued, result)
            };

            match &result {
              Ok(_) => {
                app_handle
                  .emit(
                    "download-completed",
                    DownloadCompletedEvent {
                      mod_id: mod_id.clone(),
                      path: task_path,
                    },
                  )
                  .ok();
              }
              Err(error) => {
                log::error!(
                  "Download operation {} failed for mod {} (profile: {:?}): {}",
                  queued.operation_id,
                  mod_id,
                  profile_folder,
                  error
                );
                app_handle
                  .emit(
                    "download-error",
                    DownloadErrorEvent::new(mod_id.clone(), error),
                  )
                  .ok();
              }
            }

            if let Some(completion) = queued.completion {
              completion
                .send(result.map_err(|error| error.to_string()))
                .ok();
            }
          }
          None => break,
        }
      }

      let mut processing = processing_clone.lock().await;
      *processing = false;
    });
  }

  async fn download_mod(
    operation_id: u64,
    task: &DownloadTask,
    purpose: DownloadPurpose,
    cancel_token: CancellationToken,
    pause: PauseHandle,
    active_downloads: Arc<Mutex<HashMap<String, ActiveDownload>>>,
    app_handle: AppHandle,
  ) -> Result<PreparedDownload, Error> {
    let mod_id = task.mod_id.clone();

    app_handle
      .emit(
        "download-started",
        DownloadStartedEvent {
          mod_id: mod_id.clone(),
        },
      )
      .ok();

    log::info!("Starting download for mod: {mod_id}");

    let total_files = task.files.len();
    let mut downloaded_files = Vec::new();
    let declared_sizes: Vec<u64> = task.files.iter().map(|f| f.size).collect();

    let aggregator = Arc::new(ProgressAggregator::new(&declared_sizes));

    let mut handles = Vec::new();

    for (file_index, file) in task.files.iter().enumerate() {
      let target_path = task.target_dir.join(&file.name);
      // A resumed download shows the bytes it already holds before its first response.
      let resumed = downloader::partial_download_len(&target_path).await;
      if resumed > 0 {
        aggregator.record(file_index, resumed, None, 0.0, |accepted| {
          Self::publish_progress(
            accepted,
            &mod_id,
            file_index,
            total_files,
            None,
            &app_handle,
          );
        });
      }
      let url = file.url.clone();
      let file_size = file.size;
      let md5_checksum = file.md5_checksum.clone();
      let mod_id_clone = mod_id.clone();
      let app_handle_clone = app_handle.clone();
      let cancel_token_clone = cancel_token.clone();
      let pause_clone = pause.clone();
      let aggregator_shared = Arc::clone(&aggregator);

      let handle = tokio::spawn(async move {
        let result = download_file_resumable(
          &url,
          &target_path,
          file_size,
          {
            let app_handle = app_handle_clone.clone();
            let mod_id = mod_id_clone.clone();
            let aggregator = Arc::clone(&aggregator_shared);

            move |progress: FileProgress| {
              aggregator.record(
                file_index,
                progress.downloaded,
                progress.total,
                progress.speed,
                |accepted| {
                  Self::publish_progress(
                    accepted,
                    &mod_id,
                    file_index,
                    total_files,
                    Some(progress.source),
                    &app_handle,
                  );
                },
              );
            }
          },
          cancel_token_clone,
          pause_clone,
          Some(if file_size == 0 {
            2 * 1024 * 1024 * 1024
          } else {
            file_size.min(2 * 1024 * 1024 * 1024)
          }),
          md5_checksum.as_deref(),
          true,
        )
        .await;

        // Unconditional: `finish` is the only thing that zeroes the slot's rate, so a file
        // that failed mid-transfer would keep donating its last observed speed.
        aggregator_shared.finish(file_index, |accepted| {
          Self::publish_progress(
            accepted,
            &mod_id_clone,
            file_index,
            total_files,
            None,
            &app_handle_clone,
          );
        });

        result.map(|_| target_path)
      });

      handles.push(handle);
    }

    let results = futures::future::join_all(handles).await;

    let mut errors = Vec::new();
    for result in results {
      match result {
        Ok(Ok(path)) => {
          downloaded_files.push(path);
        }
        Ok(Err(e)) => {
          errors.push(e);
        }
        Err(e) => {
          errors.push(Error::DownloadFailed(format!("Task join error: {e}")));
        }
      }
    }

    if let Some(error) = Self::combine_file_errors(errors) {
      return Err(error);
    }

    log::info!(
      "Download completed for mod: {mod_id} ({} files)",
      downloaded_files.len()
    );

    {
      let mut active = active_downloads.lock().await;
      if let Some(download) = active.get_mut(&mod_id) {
        download.status = "processing".to_string();
      }
    }

    match purpose {
      DownloadPurpose::Install => {
        Self::process_downloaded_files(task, &downloaded_files, &app_handle).await?;
        Ok(PreparedDownload {
          vpk_paths: Vec::new(),
          file_tree: None,
          selection_required: false,
          scratch_paths: Vec::new(),
        })
      }
      DownloadPurpose::PrepareUpdate => {
        let prepared =
          Self::prepare_downloaded_vpks(operation_id, task, &downloaded_files, &app_handle).await;
        let mut scratch_paths = downloaded_files;
        scratch_paths.push(task.target_dir.join(format!("prepared-{operation_id}")));
        match prepared {
          Ok(prepared) => Ok(PreparedDownload {
            scratch_paths,
            ..prepared
          }),
          Err(error) => {
            PreparedDownload {
              vpk_paths: Vec::new(),
              file_tree: None,
              selection_required: false,
              scratch_paths,
            }
            .remove_scratch_files();
            Err(error)
          }
        }
      }
    }
  }

  /// A server-side failure is surfaced as is, so the UI can tell the user it is
  /// not the app's fault. Anything else keeps each distinct message once: every
  /// file of a mod usually fails the same way, and repeating it per file buries it.
  /// Files that stopped for a pause only count when no other file failed: the mod
  /// then waits in the queue with its partial files.
  fn combine_file_errors(mut errors: Vec<Error>) -> Option<Error> {
    let paused = errors
      .iter()
      .any(|error| matches!(error, Error::DownloadPaused));
    errors.retain(|error| !matches!(error, Error::DownloadPaused));
    if let Some(index) = errors.iter().position(|error| {
      matches!(
        error,
        Error::DownloadSourceBusy { .. } | Error::DownloadStalled
      )
    }) {
      return Some(errors.swap_remove(index));
    }
    if errors.is_empty() {
      return paused.then_some(Error::DownloadPaused);
    }
    let mut messages: Vec<String> = Vec::new();
    for message in errors.iter().map(ToString::to_string) {
      if !messages.contains(&message) {
        messages.push(message);
      }
    }
    Some(Error::DownloadFailed(messages.join("; ")))
  }

  async fn prepare_downloaded_vpks(
    operation_id: u64,
    task: &DownloadTask,
    downloaded_files: &[PathBuf],
    app_handle: &AppHandle,
  ) -> Result<PreparedDownload, Error> {
    use crate::mod_manager::archive_extractor::ArchiveExtractor;
    use crate::mod_manager::file_tree::{FileTreeAnalyzer, ModFileTree};

    let prepared_dir = task.target_dir.join(format!("prepared-{operation_id}"));
    if prepared_dir.exists() {
      std::fs::remove_dir_all(&prepared_dir)?;
    }
    std::fs::create_dir_all(&prepared_dir)?;

    let prepare_result = async {
      let extractor = ArchiveExtractor::new();
      let analyzer = FileTreeAnalyzer::new();
      let mut prepared_files = Vec::new();
      let held_path = |index: usize| prepared_dir.join(format!("{index}.pending"));
      enum Slot {
        Loose(PathBuf, usize),
        Held(usize),
      }
      let mut slots = Vec::new();
      let downloaded_names: Vec<&str> = downloaded_files
        .iter()
        .filter_map(|path| path.file_name()?.to_str())
        .collect();
      let mut selection_required = false;
      let mut replaced_archives: HashMap<String, &str> = HashMap::new();

      for (archive_index, downloaded_file) in downloaded_files.iter().enumerate() {
        if !extractor.is_supported_archive(downloaded_file) {
          if Self::is_vpk_path(downloaded_file) {
            let is_selected =
              Self::downloaded_vpk_is_selected(downloaded_file, task.file_tree.as_ref());
            let file_name = downloaded_file
              .file_name()
              .and_then(|name| name.to_str())
              .ok_or_else(|| Error::InvalidInput("VPK filename is invalid".into()))?;
            if is_selected {
              slots.push(Slot::Loose(downloaded_file.clone(), prepared_files.len()));
            }
            prepared_files.push(crate::mod_manager::file_tree::ModFile {
              name: file_name.to_string(),
              path: file_name.to_string(),
              size: downloaded_file.metadata()?.len(),
              is_selected,
              archive_name: file_name.to_string(),
            });
          }
          continue;
        }

        app_handle
          .emit(
            "download-extracting",
            DownloadExtractingEvent {
              mod_id: task.mod_id.clone(),
            },
          )
          .ok();

        let archive_path = downloaded_file.clone();
        let extract_target = task.target_dir.clone();
        let extract_prefix = format!("prepared-extracted-{operation_id}-{archive_index}-");
        const EXTRACTION_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(600);
        let extraction_result = tokio::time::timeout(
          EXTRACTION_TIMEOUT,
          tokio::task::spawn_blocking(move || {
            Self::extract_prepared_archive(&archive_path, &extract_target, &extract_prefix)
          }),
        )
        .await;

        let extracted_dir = match extraction_result {
          Ok(Ok(Ok(directory))) => directory,
          Ok(Ok(Err(error))) => return Err(error),
          Ok(Err(error)) => {
            return Err(Error::ModExtractionFailed(format!(
              "Extraction task panicked: {error}"
            )));
          }
          Err(_) => {
            return Err(Error::ModExtractionFailed(format!(
              "Extraction timed out after {} seconds for mod {}",
              EXTRACTION_TIMEOUT.as_secs(),
              task.mod_id
            )));
          }
        };

        let archive_name = downloaded_file
          .file_name()
          .and_then(|name| name.to_str())
          .unwrap_or_default();
        let extracted_tree =
          analyzer.get_file_tree_from_extracted(extracted_dir.path(), archive_name)?;
        let carried = (extracted_tree.has_multiple_files
          && !Self::selection_covers_archive(task.file_tree.as_ref(), archive_name))
        .then(|| {
          Self::carry_selection_to_archive(
            &extracted_tree,
            task.file_tree.as_ref(),
            &downloaded_names,
          )
        });
        let selected_paths = match &carried {
          Some(None) => {
            selection_required = true;
            Vec::new()
          }
          Some(Some((carried, replaced))) => {
            replaced_archives.insert(archive_name.to_string(), replaced);
            Self::selected_extracted_vpks(extracted_dir.path(), &extracted_tree, Some(carried))
          }
          None => Self::selected_extracted_vpks(
            extracted_dir.path(),
            &extracted_tree,
            task.file_tree.as_ref(),
          ),
        };

        // Each archive's temp dir is gone before the names are known, so
        // selected files wait under their index in the tree.
        for mut file in extracted_tree.files {
          let source = extracted_dir.path().join(&file.path);
          file.is_selected = selected_paths.contains(&source);
          file.path = format!("{archive_name}/{}", file.path);
          if file.is_selected {
            FileSystemHelper::new().move_file(&source, &held_path(prepared_files.len()))?;
            slots.push(Slot::Held(prepared_files.len()));
          }
          prepared_files.push(file);
        }

        extracted_dir.close()?;
      }

      let mut tree = ModFileTree::from_extracted(prepared_files);
      if selection_required {
        Self::keep_saved_order(
          &mut tree,
          task.file_tree.as_ref(),
          &replaced_archives,
          &downloaded_names,
        );
        // Held files go with the prepared directory; the pick downloads again.
        return Ok(PreparedDownload {
          vpk_paths: Vec::new(),
          file_tree: Some(tree),
          selection_required: true,
          scratch_paths: Vec::new(),
        });
      }

      let mut prepared_paths = Vec::new();
      for slot in slots {
        match slot {
          Slot::Loose(source, index) => {
            let destination = Self::prepared_destination(&prepared_dir, &tree.files[index].name)?;
            std::fs::copy(&source, &destination)?;
            prepared_paths.push(destination);
          }
          Slot::Held(index) => Self::place_prepared_vpk(
            &held_path(index),
            &tree.files[index].name,
            &prepared_dir,
            &mut prepared_paths,
          )?,
        }
      }

      if prepared_paths.is_empty() {
        return Err(Error::InvalidInput(
          "No VPKs matched the update selection".to_string(),
        ));
      }
      // Slots hold indexes into the tree, so it is only reordered now.
      Self::keep_saved_order(
        &mut tree,
        task.file_tree.as_ref(),
        &replaced_archives,
        &downloaded_names,
      );

      Ok(PreparedDownload {
        vpk_paths: prepared_paths,
        file_tree: (!tree.files.is_empty()).then_some(tree),
        selection_required: false,
        scratch_paths: Vec::new(),
      })
    }
    .await;

    if prepare_result.is_err()
      && prepared_dir.exists()
      && let Err(error) = std::fs::remove_dir_all(&prepared_dir)
    {
      log::warn!(
        "Failed to remove incomplete prepared update directory {}: {}",
        prepared_dir.display(),
        error
      );
    }

    prepare_result
  }

  fn is_vpk_path(path: &std::path::Path) -> bool {
    path
      .extension()
      .and_then(|extension| extension.to_str())
      .is_some_and(|extension| extension.eq_ignore_ascii_case("vpk"))
  }

  // The blocking worker owns cleanup until extraction finishes, including when
  // its async caller times out and drops the receiver.
  fn extract_prepared_archive(
    archive: &std::path::Path,
    target: &std::path::Path,
    prefix: &str,
  ) -> Result<tempfile::TempDir, Error> {
    let directory = tempfile::Builder::new().prefix(prefix).tempdir_in(target)?;
    crate::mod_manager::archive_extractor::ArchiveExtractor::new()
      .extract_archive(archive, directory.path())?;
    Ok(directory)
  }

  fn selected_extracted_vpks(
    extracted_dir: &std::path::Path,
    extracted_tree: &crate::mod_manager::file_tree::ModFileTree,
    selection: Option<&crate::mod_manager::file_tree::ModFileTree>,
  ) -> Vec<PathBuf> {
    extracted_tree
      .files
      .iter()
      .filter(|candidate| Self::file_is_selected(candidate, selection))
      .map(|file| extracted_dir.join(&file.path))
      .collect()
  }

  fn file_is_selected(
    candidate: &crate::mod_manager::file_tree::ModFile,
    selection: Option<&crate::mod_manager::file_tree::ModFileTree>,
  ) -> bool {
    selection
      .filter(|selection| Self::selection_covers_archive(Some(selection), &candidate.archive_name))
      .is_none_or(|selection| {
        let listed = |lists: fn(&_, &_) -> bool| {
          selection
            .files
            .iter()
            .filter(|&listed| lists(listed, candidate))
            .map(|listed| listed.is_selected)
            .reduce(|selected, next| selected || next)
        };
        // An entry with this file's own name beats a bare path that fits every
        // variant. A file the selection doesn't list at all is new, so it stays,
        // unless the selection lists only installed names and has a sibling
        // variant: then this one was left out.
        listed(Self::lists_by_name)
          .or_else(|| listed(Self::lists_by_path))
          .unwrap_or_else(|| {
            !selection
              .files
              .iter()
              .any(|listed| Self::lists_sibling_of(listed, candidate))
          })
      })
  }

  /// Trees rebuilt from installed names list no variant they left out, so
  /// another name from the same source file means this one wasn't picked.
  fn lists_sibling_of(
    listed: &crate::mod_manager::file_tree::ModFile,
    file: &crate::mod_manager::file_tree::ModFile,
  ) -> bool {
    Self::lists_archive_of(listed, file)
      && listed.path == listed.name
      && crate::mod_manager::file_tree::is_name_from_source_of(&listed.name, file)
  }

  /// Whether a saved tree entry is `file`, by its path in the archive. Saved
  /// paths may or may not start with the archive's folder.
  fn lists_by_path(
    listed: &crate::mod_manager::file_tree::ModFile,
    file: &crate::mod_manager::file_tree::ModFile,
  ) -> bool {
    let listed_path = listed.path.replace('\\', "/");
    let relative_path = crate::mod_manager::file_tree::relative_path(file);
    Self::lists_archive_of(listed, file)
      && (listed_path == relative_path
        || listed_path == format!("{}/{relative_path}", file.archive_name))
  }

  /// Trees rebuilt from installed names alone carry the name as the path, but
  /// a qualified name still says which archive and folder it came from.
  fn lists_by_name(
    listed: &crate::mod_manager::file_tree::ModFile,
    file: &crate::mod_manager::file_tree::ModFile,
  ) -> bool {
    Self::lists_archive_of(listed, file)
      && listed.path == listed.name
      && listed
        .name
        .eq_ignore_ascii_case(&crate::mod_manager::file_tree::variant_vpk_name(file))
  }

  fn lists_archive_of(
    listed: &crate::mod_manager::file_tree::ModFile,
    file: &crate::mod_manager::file_tree::ModFile,
  ) -> bool {
    listed.archive_name.is_empty() || listed.archive_name == file.archive_name
  }

  fn adopt_names_by_path(
    tree: &mut crate::mod_manager::file_tree::ModFileTree,
    names: &crate::mod_manager::file_tree::ModFileTree,
  ) {
    // An archive-less entry fits that path in every archive, so each entry
    // names one file at most. The last archive wins: before names were unique,
    // its copy is the one the sharer ended up with.
    let mut claimed = vec![false; names.files.len()];
    let mut adopted = vec![false; tree.files.len()];
    let mut taken = HashSet::new();
    for (file, was_adopted) in tree.files.iter_mut().zip(&mut adopted).rev() {
      let unclaimed = |lists: fn(&_, &_) -> bool| {
        names
          .files
          .iter()
          .zip(&claimed)
          .position(|(named, claimed)| !claimed && lists(named, &*file))
      };
      // A name made for this file beats a bare one any archive's file fits.
      if let Some(index) = unclaimed(Self::lists_by_name).or_else(|| unclaimed(Self::lists_by_path))
      {
        claimed[index] = true;
        *was_adopted = true;
        file.name = names.files[index].name.clone();
        taken.insert(file.name.to_lowercase());
      } else if names
        .files
        .iter()
        .any(|named| Self::lists_by_name(named, file) || Self::lists_by_path(named, file))
      {
        // Its entry went to another archive's copy, the one the sharer has.
        file.is_selected = false;
      }
    }

    // The install matches the adopted names, so the other files make way.
    for (file, was_adopted) in tree.files.iter_mut().zip(&adopted) {
      if !was_adopted {
        file.name = crate::mod_manager::file_tree::claim_unique_vpk_name(&mut taken, &file.name);
      }
    }
  }

  // A selection saved from another variant says nothing about this archive.
  fn selection_covers_archive(
    selection: Option<&crate::mod_manager::file_tree::ModFileTree>,
    archive_name: &str,
  ) -> bool {
    selection.is_some_and(|selection| {
      selection
        .files
        .iter()
        .any(|file| file.archive_name.is_empty() || file.archive_name == archive_name)
    })
  }

  /// A re-upload under a new file name leaves the selection scoped to an
  /// archive that no longer downloads. Of the saved archives this update
  /// doesn't download, the one with the most chosen VPKs found here (then the
  /// most VPK names shared) is taken as its old upload, and its choices carry
  /// over. Files it didn't choose, new ones included, stay out: they are
  /// usually other variants. Returns the carried selection and the saved
  /// archive it came from; `None` leaves the choice to the user.
  fn carry_selection_to_archive<'a>(
    extracted_tree: &crate::mod_manager::file_tree::ModFileTree,
    selection: Option<&'a crate::mod_manager::file_tree::ModFileTree>,
    downloaded_names: &[&str],
  ) -> Option<(crate::mod_manager::file_tree::ModFileTree, &'a str)> {
    use crate::mod_manager::file_tree::{ModFile, ModFileTree, relative_path, source_file_name};

    let selection = selection?;
    let name_of = |file: &ModFile| source_file_name(file).to_lowercase();
    let name_counts = |files: &mut dyn Iterator<Item = &ModFile>| {
      let mut counts: HashMap<String, usize> = HashMap::new();
      for file in files {
        *counts.entry(name_of(file)).or_default() += 1;
      }
      counts
    };
    let here = name_counts(&mut extracted_tree.files.iter());
    let saved_in = |archive: &str| -> Vec<&ModFile> {
      selection
        .files
        .iter()
        .filter(|file| file.archive_name == archive)
        .collect()
    };

    let mut replaced: Vec<&str> = selection
      .files
      .iter()
      .map(|file| file.archive_name.as_str())
      .filter(|archive| !archive.is_empty() && !downloaded_names.contains(archive))
      .collect();
    replaced.sort_unstable();
    replaced.dedup();

    // A sibling variant can share more names, so chosen ones rank first.
    let mut ranked: Vec<((usize, usize), &str)> = replaced
      .into_iter()
      .map(|archive| {
        let found: Vec<&ModFile> = saved_in(archive)
          .into_iter()
          .filter(|file| here.contains_key(&name_of(file)))
          .collect();
        let chosen = found.iter().filter(|file| file.is_selected).count();
        ((chosen, found.len()), archive)
      })
      .filter(|((chosen, _), _)| *chosen > 0)
      .collect();
    ranked.sort_by_key(|(rank, _)| std::cmp::Reverse(*rank));
    let &(best, paired) = ranked.first()?;
    if ranked.get(1).is_some_and(|(rank, _)| *rank == best) {
      return None;
    }

    let saved = saved_in(paired);
    let before = name_counts(&mut saved.iter().copied());
    let chosen: Vec<&ModFile> = saved.into_iter().filter(|file| file.is_selected).collect();
    let path_of = |file: &ModFile| relative_path(file).to_lowercase();
    let files: Vec<ModFile> = extracted_tree
      .files
      .iter()
      .map(|file| {
        let name = name_of(file);
        // A name alone only counts when it names one file before and after,
        // so it can't pick a variant the user turned down.
        let is_selected = chosen.iter().any(|listed| path_of(listed) == path_of(file))
          || (here[&name] == 1
            && before.get(&name) == Some(&1)
            && chosen.iter().any(|listed| name_of(listed) == name));
        ModFile {
          path: format!("{}/{}", file.archive_name, relative_path(file)),
          is_selected,
          ..file.clone()
        }
      })
      .collect();

    if !files.iter().any(|file| file.is_selected) {
      return None;
    }
    let total_files = files.len();
    Some((
      ModFileTree {
        files,
        total_files,
        has_multiple_files: total_files > 1,
      },
      paired,
    ))
  }

  /// An update keeps the mod's load order. A file the saved tree lists takes
  /// its place there, found by its path in the archive it came from (the
  /// replaced one for a re-upload) or else by its name. A new file goes where
  /// the author put it: before the first file from a later download.
  fn keep_saved_order(
    tree: &mut crate::mod_manager::file_tree::ModFileTree,
    saved: Option<&crate::mod_manager::file_tree::ModFileTree>,
    replaced_archives: &HashMap<String, &str>,
    downloaded_names: &[&str],
  ) {
    use crate::mod_manager::file_tree::{ModFile, relative_path};

    let Some(saved) = saved else {
      return;
    };
    let path_key =
      |archive: &str, file: &ModFile| (archive.to_string(), relative_path(file).to_lowercase());
    let by_path: HashMap<(String, String), usize> = saved
      .files
      .iter()
      .enumerate()
      .map(|(index, file)| (path_key(&file.archive_name, file), index))
      .collect();
    let by_name: HashMap<&str, usize> = saved
      .files
      .iter()
      .enumerate()
      .map(|(index, file)| (file.name.as_str(), index))
      .collect();
    let (mut kept, added): (Vec<_>, Vec<_>) = std::mem::take(&mut tree.files)
      .into_iter()
      .map(|file| {
        let archive = replaced_archives
          .get(&file.archive_name)
          .copied()
          .unwrap_or(&file.archive_name);
        let position = by_path
          .get(&path_key(archive, &file))
          .or_else(|| by_name.get(file.name.as_str()))
          .copied();
        (position, file)
      })
      .partition(|(position, _)| position.is_some());
    kept.sort_by_key(|(position, _)| *position);

    let archive_rank = |file: &ModFile| {
      downloaded_names
        .iter()
        .position(|name| *name == file.archive_name)
        .unwrap_or(downloaded_names.len())
    };
    let mut files: Vec<ModFile> = kept.into_iter().map(|(_, file)| file).collect();
    for (_, file) in added {
      let rank = archive_rank(&file);
      let before = files
        .iter()
        .position(|existing| archive_rank(existing) > rank)
        .unwrap_or(files.len());
      files.insert(before, file);
    }
    tree.files = files;
  }

  fn downloaded_vpk_is_selected(
    path: &std::path::Path,
    selection: Option<&crate::mod_manager::file_tree::ModFileTree>,
  ) -> bool {
    let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
      return selection.is_none();
    };

    let file = crate::mod_manager::file_tree::ModFile {
      name: file_name.to_string(),
      path: file_name.to_string(),
      size: 0,
      is_selected: true,
      archive_name: file_name.to_string(),
    };
    Self::file_is_selected(&file, selection)
  }

  fn place_prepared_vpk(
    held: &std::path::Path,
    name: &str,
    prepared_dir: &std::path::Path,
    prepared_paths: &mut Vec<PathBuf>,
  ) -> Result<(), Error> {
    let destination = Self::prepared_destination(prepared_dir, name)?;
    FileSystemHelper::new().move_file(held, &destination)?;
    prepared_paths.push(destination);
    Ok(())
  }

  fn prepared_destination(prepared_dir: &std::path::Path, name: &str) -> Result<PathBuf, Error> {
    let destination = prepared_dir.join(name);
    if destination.exists() {
      return Err(Error::InvalidInput(format!(
        "Update contains duplicate VPK filename: {name}"
      )));
    }
    Ok(destination)
  }

  fn publish_progress(
    accepted: AcceptedProgress,
    mod_id: &str,
    file_index: usize,
    total_files: usize,
    source: Option<DownloadSource>,
    app_handle: &AppHandle,
  ) {
    app_handle
      .emit(
        "download-progress",
        DownloadProgressEvent::from_accepted(accepted, mod_id, file_index, total_files, source),
      )
      .ok();
  }

  async fn process_downloaded_files(
    task: &DownloadTask,
    downloaded_files: &[PathBuf],
    app_handle: &AppHandle,
  ) -> Result<(), Error> {
    use crate::commands::archive::persist_prefixed_import;
    use crate::commands::state::MANAGER;
    use crate::mod_manager::archive_extractor::ArchiveExtractor;
    use crate::mod_manager::vpk_manager::VpkManager;

    log::info!("Processing downloaded files for mod: {}", task.mod_id);

    let game_path = {
      let manager = MANAGER.lock().unwrap();
      manager
        .get_steam_manager()
        .get_game_path()
        .ok_or(Error::GamePathNotSet)?
        .clone()
    };

    let destination_path = if let Some(ref profile_folder) = task.profile_folder {
      game_path
        .join("game")
        .join("citadel")
        .join("addons")
        .join(profile_folder)
    } else {
      game_path.join("game").join("citadel").join("addons")
    };

    log::info!(
      "Using game destination path: {destination_path:?} (profile_folder: {:?})",
      task.profile_folder
    );

    if !destination_path.exists() {
      log::info!("Creating destination directory: {destination_path:?}");
      std::fs::create_dir_all(&destination_path)?;
    }

    use crate::mod_manager::file_tree::{FileTreeAnalyzer, ModFileTree};

    let vpk_manager = VpkManager::new();
    let file_tree_analyzer = FileTreeAnalyzer::new();
    let font_manager = crate::mod_manager::FontManager::new();
    let stash_dir = task.target_dir.join("fonts");
    let mut found_font_infos: Vec<crate::mod_manager::FontInfo> = Vec::new();
    let mut seen_font_files = HashSet::new();
    let mut collected_files = Vec::new();
    let mut needs_selection = false;
    let mut imported_archives = Vec::new();
    let extraction_root = task.target_dir.join("extracted");
    if extraction_root.exists() {
      std::fs::remove_dir_all(&extraction_root)?;
    }

    let emit_fonts_found = |font_infos: &[crate::mod_manager::FontInfo]| {
      if font_infos.is_empty() {
        return;
      }

      log::info!(
        "Found {} font(s) in mod {}, emitting fonts-found event",
        font_infos.len(),
        task.mod_id
      );
      app_handle
        .emit(
          "download-fonts-found",
          DownloadFontsFoundEvent {
            mod_id: task.mod_id.clone(),
            fonts: font_infos.to_vec(),
          },
        )
        .ok();
    };

    for file_path in downloaded_files {
      if !ArchiveExtractor::new().is_supported_archive(file_path) {
        continue;
      }

      app_handle
        .emit(
          "download-extracting",
          DownloadExtractingEvent {
            mod_id: task.mod_id.clone(),
          },
        )
        .ok();

      log::info!("Extracting archive: {file_path:?}");

      let archive_name = file_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| Error::InvalidInput("Archive filename is invalid".into()))?;
      let extracted_dir = extraction_root.join(archive_name);
      if extracted_dir.exists() {
        log::warn!("Extracted directory already exists, removing: {extracted_dir:?}");
        std::fs::remove_dir_all(&extracted_dir)?;
      }
      std::fs::create_dir_all(&extracted_dir)?;

      // Run extraction on a blocking thread with a timeout so it never blocks the async runtime
      let archive_path = file_path.clone();
      let extract_target = extracted_dir.clone();
      const EXTRACTION_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(600);

      let extraction_result = tokio::time::timeout(
        EXTRACTION_TIMEOUT,
        tokio::task::spawn_blocking(move || {
          ArchiveExtractor::new().extract_archive(&archive_path, &extract_target)
        }),
      )
      .await;

      match extraction_result {
        Ok(Ok(Ok(()))) => {}
        Ok(Ok(Err(e))) => return Err(e),
        Ok(Err(e)) => {
          return Err(Error::ModExtractionFailed(format!(
            "Extraction task panicked: {e}"
          )));
        }
        Err(_) => {
          return Err(Error::ModExtractionFailed(format!(
            "Extraction timed out after {} seconds for mod {}",
            EXTRACTION_TIMEOUT.as_secs(),
            task.mod_id
          )));
        }
      }

      // Scan for font files before processing VPKs and emit an event if any are found.
      // Fonts may be loose files under panorama/fonts/ OR packed inside a .vpk.
      let found_loose = font_manager.scan_for_fonts(&extracted_dir);
      let found_vpk = font_manager.scan_vpks_for_fonts(&extracted_dir);
      if !found_loose.is_empty() || !found_vpk.is_empty() {
        if !found_loose.is_empty() {
          match font_manager.stash_fonts(&found_loose, &stash_dir) {
            Ok(fonts) => {
              for font in fonts {
                if seen_font_files.insert(font.file_name.clone()) {
                  found_font_infos.push(font);
                }
              }
            }
            Err(e) => log::warn!("Failed to stash loose fonts for mod {}: {e}", task.mod_id),
          }
        }
        if !found_vpk.is_empty() {
          // Drop any VPK-packed font whose filename was already stashed from a
          // loose `.ttf` so we never overwrite the loose font's bytes on disk
          // while keeping its metadata in `found_font_infos`.
          let vpk_to_stash: Vec<(String, Vec<u8>)> = found_vpk
            .into_iter()
            .filter(|(name, _)| !seen_font_files.contains(name))
            .collect();

          if !vpk_to_stash.is_empty() {
            match font_manager.stash_font_bytes(&vpk_to_stash, &stash_dir) {
              Ok(fonts) => {
                for font in fonts {
                  if seen_font_files.insert(font.file_name.clone()) {
                    found_font_infos.push(font);
                  }
                }
              }
              Err(e) => log::warn!(
                "Failed to stash VPK-packed fonts for mod {}: {e}",
                task.mod_id
              ),
            }
          }
        }
      }

      match file_tree_analyzer.get_file_tree_from_extracted(&extracted_dir, archive_name) {
        Ok(file_tree) => {
          log::info!(
            "Analyzed file tree: {} files, has_multiple: {}",
            file_tree.total_files,
            file_tree.has_multiple_files
          );

          // Named after the loop: whether a name needs qualifying depends on
          // the other archives.
          if task.is_profile_import {
            // No shared selection to choose from: stop as before, installing
            // only the earlier archives.
            if file_tree.has_multiple_files && task.file_tree.is_none() {
              break;
            }
            let selected_paths =
              Self::selected_extracted_vpks(&extracted_dir, &file_tree, task.file_tree.as_ref());
            for mut file in file_tree.files {
              let source = extracted_dir.join(&file.path);
              file.is_selected = selected_paths.contains(&source);
              // Extractions wait until every archive is named, so files that
              // won't be placed, and the archive, go now.
              if !file.is_selected
                && let Err(error) = std::fs::remove_file(&source)
              {
                log::warn!("Failed to remove unselected VPK {source:?}: {error}");
              }
              file.path = format!("{archive_name}/{}", file.path);
              collected_files.push(file);
            }
            if let Err(error) = std::fs::remove_file(file_path) {
              log::warn!("Failed to remove extracted archive {file_path:?}: {error}");
            }
            imported_archives.push((extracted_dir, file_path));
          } else {
            needs_selection |= file_tree.has_multiple_files;
            for mut file in file_tree.files {
              file.path = format!("{archive_name}/{}", file.path);
              collected_files.push(file);
            }
          }
        }
        Err(e) => {
          log::warn!(
            "Failed to analyze file tree for mod {}: {}. Proceeding with normal copy.",
            task.mod_id,
            e
          );
          vpk_manager.copy_vpks_with_prefix(&extracted_dir, &destination_path, &task.mod_id)?;
          persist_prefixed_import(
            &destination_path,
            &task.mod_id,
            vpk_manager.find_prefixed_vpks(&destination_path, &task.mod_id)?,
          )?;

          Self::cleanup_extracted(&extracted_dir, file_path);
        }
      }
    }

    // The backend doesn't know the mod's display name; the frontend swaps in
    // the name it has and keeps the archive name as a fallback.
    let config_label = Self::archive_label(downloaded_files).unwrap_or_else(|| task.mod_id.clone());
    // Profile imports install someone else's mod list in bulk; asking about a
    // config for each of those mods would bury the import in prompts.
    let staged_config = if task.is_profile_import {
      None
    } else {
      Self::stage_bundled_config(app_handle, &extraction_root, &config_label, &task.mod_id)
    };
    let vpk_count = collected_files.len();

    if !collected_files.is_empty() {
      let mut aggregated_tree = ModFileTree::from_extracted(collected_files);
      if task.is_profile_import {
        // The import installs by the shared tree's names, so the copies take them.
        if let Some(shared) = &task.file_tree {
          Self::adopt_names_by_path(&mut aggregated_tree, shared);
        }
        vpk_manager.place_selected_vpks_with_prefix(
          &extraction_root,
          &destination_path,
          &task.mod_id,
          &aggregated_tree,
        )?;
        // Rescanned: the entry is replaced whole, and archives whose analysis
        // failed were copied separately.
        persist_prefixed_import(
          &destination_path,
          &task.mod_id,
          vpk_manager.find_prefixed_vpks(&destination_path, &task.mod_id)?,
        )?;
      } else {
        if !needs_selection {
          let placed = vpk_manager.place_selected_vpks_with_prefix(
            &extraction_root,
            &destination_path,
            &task.mod_id,
            &aggregated_tree,
          )?;
          persist_prefixed_import(&destination_path, &task.mod_id, placed)?;
          for file_path in downloaded_files {
            Self::cleanup_extracted(&extraction_root, file_path);
          }
        }
        app_handle
          .emit(
            "download-file-tree",
            DownloadFileTreeEvent {
              mod_id: task.mod_id.clone(),
              file_tree: aggregated_tree,
            },
          )
          .ok();
      }
    }
    for (extracted_dir, file_path) in &imported_archives {
      Self::cleanup_extracted(extracted_dir, file_path);
    }

    if let Some(event) = staged_config.map(|(staging_id, variants)| ConfigFoundEvent {
      mod_id: task.mod_id.clone(),
      mod_name: config_label,
      staging_id,
      variants,
      installed_vpks: u32::try_from(vpk_count).unwrap_or(u32::MAX),
    }) {
      log::info!(
        "Found {} performance config variant(s) in mod {}, emitting config-found event",
        event.variants.len(),
        task.mod_id
      );
      app_handle.emit("download-config-found", event).ok();
    }

    emit_fonts_found(&found_font_infos);

    log::info!(
      "Finished processing downloaded files for mod: {}",
      task.mod_id
    );
    Ok(())
  }

  /// Copies performance configs (gameinfo.gi, autoexec, video.txt) out of the
  /// extracted archives before they are cleaned up, so the user can review and
  /// import them. The VPK pipeline never installs them, and a failure here
  /// never fails the download.
  fn stage_bundled_config(
    app_handle: &AppHandle,
    extraction_root: &std::path::Path,
    label: &str,
    mod_id: &str,
  ) -> Option<(String, Vec<ImportVariant>)> {
    if !extraction_root.exists() {
      return None;
    }
    let app_data_dir = match crate::runtime_environment::app_local_data_dir(app_handle) {
      Ok(directory) => directory,
      Err(error) => {
        log::warn!("Skipping performance config scan for mod {mod_id}: {error}");
        return None;
      }
    };
    match perf_staging::stage_from_dir(&app_data_dir, extraction_root, label) {
      Ok(found) => found,
      Err(error) => {
        log::warn!("Failed to stage performance config for mod {mod_id}: {error}");
        None
      }
    }
  }

  /// The first archive's name without its extension.
  fn archive_label(downloaded_files: &[PathBuf]) -> Option<String> {
    let extractor = crate::mod_manager::archive_extractor::ArchiveExtractor::new();
    downloaded_files
      .iter()
      .find(|path| extractor.is_supported_archive(path))
      .and_then(|path| path.file_stem())
      .and_then(|stem| stem.to_str())
      .map(str::to_string)
  }

  fn cleanup_extracted(extracted_dir: &PathBuf, archive_path: &PathBuf) {
    if extracted_dir.exists() {
      log::info!("Removing extracted directory: {extracted_dir:?}");
      if let Err(e) = std::fs::remove_dir_all(extracted_dir) {
        log::warn!("Failed to remove extracted directory: {e}");
      }
    }
    if archive_path.exists() {
      log::info!("Removing archive: {archive_path:?}");
      if let Err(e) = std::fs::remove_file(archive_path) {
        log::warn!("Failed to remove archive file: {e}");
      }
    }
  }

  pub async fn cancel_download(&self, mod_id: &str) -> Result<(), Error> {
    log::info!("Cancelling download for mod: {mod_id}");

    // Both locks are held, queue first: the worker moves a download between the
    // queue and active while holding both, so it can't slip past the two checks.
    let (dropped, cancelled) = {
      let mut queue = self.queue.lock().await;
      let dropped = Self::cancel_queued(&mut queue, mod_id);
      let cancelled = Self::cancel_active(&mut *self.active_downloads.lock().await, mod_id);
      (dropped, cancelled)
    };
    for queued in &dropped {
      Self::remove_partials(&queued.task).await;
      // Reported like a cancelled running download, so a paused one settles too.
      self
        .app_handle
        .emit(
          "download-error",
          DownloadErrorEvent::new(mod_id.to_string(), &Error::DownloadCancelled),
        )
        .ok();
    }
    if cancelled || !dropped.is_empty() {
      Ok(())
    } else {
      Err(Error::InvalidInput(format!(
        "No active download found for mod: {mod_id}"
      )))
    }
  }

  fn cancel_queued(queue: &mut VecDeque<QueuedDownload>, mod_id: &str) -> Vec<QueuedDownload> {
    Self::take_queued(queue, |queued| queued.task.mod_id == mod_id)
  }

  fn take_queued(
    queue: &mut VecDeque<QueuedDownload>,
    matches: impl Fn(&QueuedDownload) -> bool,
  ) -> Vec<QueuedDownload> {
    let (taken, kept): (VecDeque<_>, _) = std::mem::take(queue).into_iter().partition(matches);
    *queue = kept;
    taken.into()
  }

  /// A paused download keeps its partial files while it waits in the queue.
  async fn remove_partials(task: &DownloadTask) {
    for file in &task.files {
      downloader::remove_partial_download(&task.target_dir.join(&file.name)).await;
    }
  }

  fn cancel_active(active: &mut HashMap<String, ActiveDownload>, mod_id: &str) -> bool {
    let Some(download) = active.remove(mod_id) else {
      return false;
    };
    download.pause.resume();
    download.cancel_token.cancel();
    true
  }

  /// Drops queued downloads for a profile folder and cancels the running one,
  /// so a deleted profile's folder isn't recreated when they finish.
  pub async fn cancel_profile_downloads(&self, profile_folder: &str) {
    let targets = |folder: &Option<String>| folder.as_deref() == Some(profile_folder);

    let (dropped, cancelled) = {
      let mut queue = self.queue.lock().await;
      let dropped = Self::take_queued(&mut queue, |queued| targets(&queued.task.profile_folder));

      let mut active = self.active_downloads.lock().await;
      let cancelled: Vec<String> = active
        .iter()
        .filter(|(_, download)| targets(&download.profile_folder))
        .map(|(mod_id, _)| mod_id.clone())
        .collect();
      for mod_id in &cancelled {
        Self::cancel_active(&mut active, mod_id);
      }
      (dropped, cancelled)
    };
    for queued in &dropped {
      Self::remove_partials(&queued.task).await;
    }

    if !dropped.is_empty() || !cancelled.is_empty() {
      log::info!(
        "Cancelled downloads for deleted profile {profile_folder}: {} queued, {} active",
        dropped.len(),
        cancelled.len()
      );
    }
  }

  /// A running download stops and gives the next queued one the worker; a
  /// queued one stays where it is but is skipped until resumed.
  pub async fn pause_download(&self, mod_id: &str) -> Result<(), Error> {
    let mut queue = self.queue.lock().await;
    let mut active = self.active_downloads.lock().await;
    if let Some(entry) = active.get_mut(mod_id) {
      if entry.status != "downloading" {
        return Err(Error::InvalidInput(format!(
          "Download for mod {mod_id} is not active (status: {})",
          entry.status
        )));
      }
      entry.pause.pause();
      entry.status = "paused".to_string();
    } else if !Self::pause_queued(&mut queue, mod_id) {
      return Err(Error::InvalidInput(format!(
        "No active download found for mod: {mod_id}"
      )));
    }
    // Emit while holding the lock so the event cannot race with download completion.
    self
      .app_handle
      .emit(
        "download-paused",
        DownloadPausedEvent {
          mod_id: mod_id.to_string(),
        },
      )
      .ok();
    Ok(())
  }

  /// A paused download that already gave up the worker runs next, after the
  /// download running now.
  pub async fn resume_download(&self, mod_id: &str) -> Result<(), Error> {
    {
      let mut queue = self.queue.lock().await;
      let mut active = self.active_downloads.lock().await;
      if let Some(entry) = active.get_mut(mod_id) {
        if entry.status != "paused" {
          return Err(Error::InvalidInput(format!(
            "Download for mod {mod_id} is not paused (status: {})",
            entry.status
          )));
        }
        entry.pause.resume();
        entry.status = "downloading".to_string();
      } else if !Self::resume_queued(&mut queue, mod_id) {
        return Err(Error::InvalidInput(format!(
          "No paused download found for mod: {mod_id}"
        )));
      }
      // Emit while holding the lock so the event cannot race with download completion.
      self
        .app_handle
        .emit(
          "download-resumed",
          DownloadResumedEvent {
            mod_id: mod_id.to_string(),
          },
        )
        .ok();
    }
    self.process_queue().await;
    Ok(())
  }

  /// Puts a download that stopped for a pause back in the queue, or hands it
  /// back when it was cancelled while its files were stopping.
  fn park(
    queue: &mut VecDeque<QueuedDownload>,
    active: &mut HashMap<String, ActiveDownload>,
    queued: QueuedDownload,
  ) -> Option<QueuedDownload> {
    let Some(download) = active.remove(&queued.task.mod_id) else {
      return Some(queued);
    };
    // One resumed while its files were stopping runs again next.
    queue.push_front(QueuedDownload {
      paused: download.pause.is_paused(),
      ..queued
    });
    None
  }

  /// Paused downloads keep their place but don't hold up the rest of the queue.
  fn next_runnable(queue: &mut VecDeque<QueuedDownload>) -> Option<QueuedDownload> {
    let index = queue.iter().position(|queued| !queued.paused)?;
    queue.remove(index)
  }

  fn pause_queued(queue: &mut VecDeque<QueuedDownload>, mod_id: &str) -> bool {
    let Some(queued) = queue
      .iter_mut()
      .find(|queued| queued.task.mod_id == mod_id && !queued.paused)
    else {
      return false;
    };
    queued.paused = true;
    true
  }

  fn resume_queued(queue: &mut VecDeque<QueuedDownload>, mod_id: &str) -> bool {
    let Some(mut queued) = queue
      .iter()
      .position(|queued| queued.task.mod_id == mod_id && queued.paused)
      .and_then(|index| queue.remove(index))
    else {
      return false;
    };
    queued.paused = false;
    queue.push_front(queued);
    true
  }

  pub async fn get_download_status(&self, mod_id: &str) -> Result<Option<DownloadStatus>, Error> {
    let active = self.active_downloads.lock().await;
    Ok(active.get(mod_id).map(|download| DownloadStatus {
      mod_id: mod_id.to_string(),
      status: download.status.clone(),
    }))
  }

  pub async fn is_busy(&self) -> bool {
    *self.processing.lock().await
      || !self.queue.lock().await.is_empty()
      || !self.active_downloads.lock().await.is_empty()
  }

  /// Lists paused downloads waiting in the queue as well as running ones, so a
  /// webview reload cancels them like any download it no longer tracks.
  pub async fn get_all_downloads(&self) -> Result<Vec<DownloadStatus>, Error> {
    // The worker's lock order, so a download moving between the two is in one of them.
    let queue = self.queue.lock().await;
    let active = self.active_downloads.lock().await;
    Ok(Self::list_downloads(&queue, &active))
  }

  fn list_downloads(
    queue: &VecDeque<QueuedDownload>,
    active: &HashMap<String, ActiveDownload>,
  ) -> Vec<DownloadStatus> {
    let paused = queue
      .iter()
      .filter(|queued| queued.paused)
      .map(|queued| DownloadStatus {
        mod_id: queued.task.mod_id.clone(),
        status: "paused".to_string(),
      });
    let running = active.iter().map(|(mod_id, download)| DownloadStatus {
      mod_id: mod_id.clone(),
      status: download.status.clone(),
    });
    paused.chain(running).collect()
  }

  /// Debug-only: run the post-download processing pipeline on an already-copied local file.
  #[cfg(debug_assertions)]
  pub async fn process_local_file(
    task: DownloadTask,
    file_path: std::path::PathBuf,
    app_handle: AppHandle,
  ) -> Result<(), Error> {
    Self::process_downloaded_files(&task, &[file_path], &app_handle).await
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::mod_manager::file_tree::{ModFile, ModFileTree};

  #[test]
  fn config_label_names_the_first_archive() {
    let files = vec![
      PathBuf::from("downloads/pak01_dir.vpk"),
      PathBuf::from("downloads/OptiLock v5.1.zip"),
      PathBuf::from("downloads/extras.7z"),
    ];
    assert_eq!(
      DownloadManager::archive_label(&files).as_deref(),
      Some("OptiLock v5.1")
    );
    assert_eq!(
      DownloadManager::archive_label(&[PathBuf::from("mod.vpk")]),
      None
    );
  }

  fn queued(mod_id: &str) -> QueuedDownload {
    QueuedDownload {
      operation_id: 0,
      task: DownloadTask {
        mod_id: mod_id.to_string(),
        files: Vec::new(),
        target_dir: PathBuf::new(),
        profile_folder: None,
        is_profile_import: false,
        file_tree: None,
      },
      purpose: DownloadPurpose::Install,
      completion: None,
      paused: false,
    }
  }

  fn mod_ids(queue: &VecDeque<QueuedDownload>) -> Vec<(&str, bool)> {
    queue
      .iter()
      .map(|queued| (queued.task.mod_id.as_str(), queued.paused))
      .collect()
  }

  fn active(mod_id: &str, paused: bool) -> HashMap<String, ActiveDownload> {
    let pause = PauseHandle::new();
    if paused {
      pause.pause();
    }
    HashMap::from([(
      mod_id.to_string(),
      ActiveDownload {
        cancel_token: CancellationToken::new(),
        pause,
        status: if paused { "paused" } else { "downloading" }.to_string(),
        profile_folder: None,
      },
    )])
  }

  #[test]
  fn cancelling_a_queued_download_drops_only_that_mod() {
    let (completion, mut waiter) = oneshot::channel();
    let second = QueuedDownload {
      completion: Some(completion),
      ..queued("second")
    };
    let mut queue = VecDeque::from([queued("first"), second]);

    let dropped = DownloadManager::cancel_queued(&mut queue, "second");
    assert_eq!(dropped.len(), 1);
    assert_eq!(mod_ids(&queue), [("first", false)]);
    drop(dropped);
    // `queue_download_and_wait` reports a dropped sender as cancelled.
    assert!(matches!(
      waiter.try_recv(),
      Err(oneshot::error::TryRecvError::Closed)
    ));
    assert!(DownloadManager::cancel_queued(&mut queue, "second").is_empty());
  }

  #[test]
  fn a_paused_download_does_not_hold_up_the_queue() {
    let mut queue = VecDeque::from([
      QueuedDownload {
        paused: true,
        ..queued("paused")
      },
      queued("next"),
    ]);

    let next = DownloadManager::next_runnable(&mut queue)
      .expect("the worker found nothing to run while a download was paused");
    assert_eq!(next.task.mod_id, "next");
    assert_eq!(mod_ids(&queue), [("paused", true)]);
    assert!(
      DownloadManager::next_runnable(&mut queue).is_none(),
      "the worker started a paused download"
    );
  }

  #[test]
  fn a_resumed_download_runs_next_without_losing_its_caller() {
    let (completion, mut waiter) = oneshot::channel();
    let mut queue = VecDeque::from([
      queued("first"),
      QueuedDownload {
        operation_id: 7,
        completion: Some(completion),
        paused: true,
        ..queued("paused")
      },
    ]);

    assert!(!DownloadManager::resume_queued(&mut queue, "first"));
    assert!(DownloadManager::resume_queued(&mut queue, "paused"));
    assert_eq!(mod_ids(&queue), [("paused", false), ("first", false)]);
    assert!(!DownloadManager::resume_queued(&mut queue, "paused"));

    let resumed = DownloadManager::next_runnable(&mut queue).unwrap();
    assert_eq!(resumed.operation_id, 7);
    // Update All and profile import still hear back from the resumed download.
    assert!(matches!(
      waiter.try_recv(),
      Err(oneshot::error::TryRecvError::Empty)
    ));
  }

  #[test]
  fn pausing_a_queued_download_keeps_its_place() {
    let mut queue = VecDeque::from([queued("first"), queued("second")]);

    assert!(DownloadManager::pause_queued(&mut queue, "first"));
    assert!(!DownloadManager::pause_queued(&mut queue, "first"));
    assert!(!DownloadManager::pause_queued(&mut queue, "missing"));
    assert_eq!(mod_ids(&queue), [("first", true), ("second", false)]);
  }

  #[test]
  fn a_download_stopped_for_a_pause_waits_in_the_queue() {
    let mut queue = VecDeque::from([queued("next")]);
    let mut downloads = active("paused", true);

    assert!(DownloadManager::park(&mut queue, &mut downloads, queued("paused")).is_none());
    assert!(downloads.is_empty());
    assert_eq!(mod_ids(&queue), [("paused", true), ("next", false)]);
  }

  #[test]
  fn a_download_resumed_while_stopping_runs_next() {
    let mut queue = VecDeque::from([queued("next")]);
    let mut downloads = active("resumed", false);

    assert!(DownloadManager::park(&mut queue, &mut downloads, queued("resumed")).is_none());
    assert_eq!(mod_ids(&queue), [("resumed", false), ("next", false)]);
  }

  #[test]
  fn a_download_cancelled_while_stopping_is_not_queued_again() {
    let mut queue = VecDeque::new();

    let cancelled = DownloadManager::park(&mut queue, &mut HashMap::new(), queued("cancelled"));
    assert_eq!(
      cancelled.map(|queued| queued.task.mod_id).as_deref(),
      Some("cancelled")
    );
    assert!(
      queue.is_empty(),
      "a cancelled download would start again after the next one"
    );
  }

  #[test]
  fn listing_downloads_includes_paused_ones_waiting_in_the_queue() {
    let queue = VecDeque::from([
      queued("waiting"),
      QueuedDownload {
        paused: true,
        ..queued("paused")
      },
    ]);

    let listed: Vec<(String, String)> =
      DownloadManager::list_downloads(&queue, &active("running", false))
        .into_iter()
        .map(|download| (download.mod_id, download.status))
        .collect();
    assert_eq!(
      listed,
      [
        ("paused".to_string(), "paused".to_string()),
        ("running".to_string(), "downloading".to_string()),
      ],
      "a reload would leave the paused download in the queue behind a Failed card"
    );
  }

  #[test]
  fn a_mod_counts_as_paused_only_when_no_file_failed() {
    assert!(matches!(
      DownloadManager::combine_file_errors(vec![Error::DownloadPaused, Error::DownloadPaused]),
      Some(Error::DownloadPaused)
    ));
    let failed = DownloadManager::combine_file_errors(vec![
      Error::DownloadPaused,
      Error::Network("Server returned error status: 403 Forbidden".to_string()),
    ]);
    assert_eq!(
      failed.map(|error| error.to_string()).as_deref(),
      Some("Download failed: Network error: Server returned error status: 403 Forbidden"),
      "a file that failed was hidden behind a sibling's pause"
    );
  }

  #[test]
  fn direct_vpk_downloads_accept_mixed_case_extensions() {
    assert!(DownloadManager::is_vpk_path(std::path::Path::new(
      "MOD.VPK"
    )));
    assert!(DownloadManager::is_vpk_path(std::path::Path::new(
      "mod.VpK"
    )));
    assert!(!DownloadManager::is_vpk_path(std::path::Path::new(
      "mod.vpk.zip"
    )));
  }

  #[test]
  fn failed_prepared_extraction_removes_partial_directory() {
    let root = tempfile::tempdir().unwrap();
    let archive = root.path().join("broken.zip");
    std::fs::write(&archive, b"invalid archive").unwrap();
    assert!(
      DownloadManager::extract_prepared_archive(&archive, root.path(), "prepared-extracted-")
        .is_err()
    );
    let remaining = std::fs::read_dir(root.path())
      .unwrap()
      .map(|entry| entry.unwrap().file_name())
      .collect::<Vec<_>>();
    assert_eq!(remaining, vec![std::ffi::OsString::from("broken.zip")]);
  }

  #[test]
  fn prepared_extraction_is_cleaned_when_its_consumer_exits() {
    use std::io::Write;
    let root = tempfile::tempdir().unwrap();
    let archive = root.path().join("mod.zip");
    let mut zip = zip::ZipWriter::new(std::fs::File::create(&archive).unwrap());
    zip
      .start_file("mod.vpk", zip::write::SimpleFileOptions::default())
      .unwrap();
    zip.write_all(b"fixture").unwrap();
    zip.finish().unwrap();
    let directory =
      DownloadManager::extract_prepared_archive(&archive, root.path(), "prepared-extracted-")
        .unwrap();
    let path = directory.path().to_path_buf();
    assert_eq!(std::fs::read(path.join("mod.vpk")).unwrap(), b"fixture");
    drop(directory);
    assert!(!path.exists());
  }
  fn tree(files: Vec<ModFile>) -> ModFileTree {
    let total_files = files.len();
    ModFileTree {
      files,
      total_files,
      has_multiple_files: total_files > 1,
    }
  }

  fn file(archive_name: &str, path: &str, is_selected: bool) -> ModFile {
    ModFile {
      name: PathBuf::from(path)
        .file_name()
        .unwrap()
        .to_string_lossy()
        .to_string(),
      path: path.to_string(),
      size: 1,
      is_selected,
      archive_name: archive_name.to_string(),
    }
  }

  #[test]
  fn profile_import_copies_take_the_shared_tree_names() {
    // A tree shared before names were made unique.
    let shared = ModFileTree::from_extracted(vec![
      file("red.zip", "red.zip/pak01_dir.vpk", true),
      file("blue.zip", "pak01_dir.vpk", true),
    ]);
    // Only one variant downloaded, so on its own it would keep the bare name.
    let mut downloaded =
      ModFileTree::from_extracted(vec![file("red.zip", "red.zip/pak01_dir.vpk", true)]);

    DownloadManager::adopt_names_by_path(&mut downloaded, &shared);

    assert_eq!(downloaded.files[0].name, "pak01-red_dir.vpk");
  }

  #[test]
  fn profile_import_gives_an_archiveless_shared_name_to_one_variant() {
    // Trees rebuilt by install or a variant swap carry no archive names.
    let shared = ModFileTree::from_extracted(vec![file("", "pak01_dir.vpk", true)]);
    let mut downloaded = ModFileTree::from_extracted(vec![
      file("red.zip", "red.zip/pak01_dir.vpk", true),
      file("blue.zip", "blue.zip/pak01_dir.vpk", true),
    ]);

    DownloadManager::adopt_names_by_path(&mut downloaded, &shared);

    let names: Vec<&str> = downloaded.files.iter().map(|f| f.name.as_str()).collect();
    assert_eq!(names, ["pak01-red_dir.vpk", "pak01_dir.vpk"]);
    // The sharer had only blue's copy, so red isn't installed alongside it.
    assert!(!downloaded.files[0].is_selected);
    assert!(downloaded.files[1].is_selected);
  }

  #[test]
  fn profile_import_moves_unshared_names_aside_for_adopted_ones() {
    let shared = ModFileTree::from_extracted(vec![
      file("", "blue/pak01_dir.vpk", true),
      file("", "red/pak01_dir.vpk", true),
    ]);
    let mut downloaded = ModFileTree::from_extracted(vec![
      file("blue.zip", "blue.zip/pak01_dir.vpk", true),
      file("skins.zip", "skins.zip/blue/pak01_dir.vpk", true),
    ]);
    assert_eq!(downloaded.files[0].name, "pak01-blue_dir.vpk");

    DownloadManager::adopt_names_by_path(&mut downloaded, &shared);

    let names: Vec<&str> = downloaded.files.iter().map(|f| f.name.as_str()).collect();
    assert_eq!(names, ["pak01-blue-2_dir.vpk", "pak01-blue_dir.vpk"]);
  }

  #[test]
  fn profile_import_matches_qualified_names_before_bare_ones() {
    // Rebuilt from installed names: red was staged while the bare name was free.
    let shared = tree(vec![
      file("", "pak01_dir.vpk", true),
      file("", "pak01-blue_dir.vpk", true),
    ]);
    let mut downloaded = ModFileTree::from_extracted(vec![
      file("red.zip", "red.zip/pak01_dir.vpk", true),
      file("blue.zip", "blue.zip/pak01_dir.vpk", true),
    ]);

    DownloadManager::adopt_names_by_path(&mut downloaded, &shared);

    let names: Vec<&str> = downloaded.files.iter().map(|f| f.name.as_str()).collect();
    assert_eq!(names, ["pak01_dir.vpk", "pak01-blue_dir.vpk"]);
  }

  #[test]
  fn update_selection_lets_a_variants_own_name_overrule_a_bare_path() {
    // Rebuilt from installed names: red holds the bare name, blue is unticked.
    let selection = tree(vec![
      file("", "pak01_dir.vpk", true),
      file("", "pak01-blue_dir.vpk", false),
    ]);
    let selected_in = |archive: &str| {
      DownloadManager::selected_extracted_vpks(
        std::path::Path::new("extracted"),
        &tree(vec![file(archive, "pak01_dir.vpk", true)]),
        Some(&selection),
      )
    };

    assert!(selected_in("blue.zip").is_empty());
    assert_eq!(
      selected_in("red.zip"),
      vec![std::path::Path::new("extracted").join("pak01_dir.vpk")]
    );
  }

  #[test]
  fn update_selection_finds_variants_in_trees_rebuilt_from_names() {
    let extracted = tree(vec![file("red.zip", "pak01_dir.vpk", true)]);
    let selection = tree(vec![
      file("", "pak01-red_dir.vpk", true),
      file("", "pak01-blue_dir.vpk", false),
    ]);

    assert_eq!(
      DownloadManager::selected_extracted_vpks(
        std::path::Path::new("extracted"),
        &extracted,
        Some(&selection),
      ),
      vec![std::path::Path::new("extracted").join("pak01_dir.vpk")]
    );
  }

  #[test]
  fn update_selection_skips_variants_left_out_of_trees_listing_only_installed_files() {
    // Interchange import lists just the bundled VPKs, by installed name.
    let selection = tree(vec![file("", "pak01-red_dir.vpk", true)]);
    let selected_in = |archive: &str, path: &str| {
      !DownloadManager::selected_extracted_vpks(
        std::path::Path::new("extracted"),
        &tree(vec![file(archive, path, true)]),
        Some(&selection),
      )
      .is_empty()
    };

    assert!(selected_in("red.zip", "pak01_dir.vpk"));
    assert!(!selected_in("blue.zip", "pak01_dir.vpk"));
    assert!(selected_in("blue.zip", "extras_dir.vpk"));
  }

  #[test]
  fn update_selection_preserves_selected_and_deselected_files() {
    let extracted = tree(vec![
      file("mod.zip", "main.vpk", true),
      file("mod.zip", "optional.vpk", true),
    ]);
    let selection = tree(vec![
      file("mod.zip", "mod.zip/main.vpk", true),
      file("mod.zip", "mod.zip/optional.vpk", false),
    ]);

    assert_eq!(
      DownloadManager::selected_extracted_vpks(
        std::path::Path::new("extracted"),
        &extracted,
        Some(&selection),
      ),
      vec![std::path::Path::new("extracted").join("main.vpk")]
    );
  }

  #[test]
  fn update_selection_includes_new_files() {
    let extracted = tree(vec![
      file("mod.zip", "main.vpk", true),
      file("mod.zip", "new.vpk", true),
    ]);
    let selection = tree(vec![file("mod.zip", "mod.zip/main.vpk", true)]);

    assert_eq!(
      DownloadManager::selected_extracted_vpks(
        std::path::Path::new("extracted"),
        &extracted,
        Some(&selection),
      ),
      vec![
        std::path::Path::new("extracted").join("main.vpk"),
        std::path::Path::new("extracted").join("new.vpk"),
      ]
    );
  }

  #[test]
  fn update_selection_includes_renamed_files() {
    let extracted = tree(vec![file("mod.zip", "renamed.vpk", true)]);
    let selection = tree(vec![file("mod.zip", "mod.zip/old.vpk", false)]);

    assert_eq!(
      DownloadManager::selected_extracted_vpks(
        std::path::Path::new("extracted"),
        &extracted,
        Some(&selection),
      ),
      vec![std::path::Path::new("extracted").join("renamed.vpk")]
    );
  }

  #[test]
  fn update_selection_distinguishes_identical_paths_from_multiple_archives() {
    let extracted = tree(vec![file("second.zip", "variants/main.vpk", true)]);
    let selection = tree(vec![
      file("first.zip", "variants/main.vpk", true),
      file("second.zip", "variants/main.vpk", false),
    ]);

    assert!(
      DownloadManager::selected_extracted_vpks(
        std::path::Path::new("extracted"),
        &extracted,
        Some(&selection),
      )
      .is_empty()
    );
  }

  #[test]
  fn update_selection_accepts_normalized_windows_paths() {
    for (candidate_path, selected_path) in [
      ("variants/main.vpk", "variants\\main.vpk"),
      ("variants\\main.vpk", "variants/main.vpk"),
      ("variants/main.vpk", "mod.zip\\variants\\main.vpk"),
    ] {
      for is_selected in [true, false] {
        let extracted = tree(vec![file("mod.zip", candidate_path, true)]);
        let selection = tree(vec![file("mod.zip", selected_path, is_selected)]);
        let expected = if is_selected {
          vec![std::path::Path::new("extracted").join(candidate_path)]
        } else {
          vec![]
        };

        assert_eq!(
          DownloadManager::selected_extracted_vpks(
            std::path::Path::new("extracted"),
            &extracted,
            Some(&selection),
          ),
          expected
        );
      }
    }
  }

  #[test]
  fn update_selection_accepts_paths_scoped_to_the_source_archive() {
    let extracted = tree(vec![file("mod.zip", "variants/main.vpk", true)]);
    let selection = tree(vec![file("mod.zip", "mod.zip/variants/main.vpk", true)]);
    assert_eq!(
      DownloadManager::selected_extracted_vpks(
        std::path::Path::new("extracted"),
        &extracted,
        Some(&selection)
      ),
      vec![std::path::Path::new("extracted").join("variants/main.vpk")]
    );
  }

  #[test]
  fn update_selection_ignores_archives_it_does_not_cover() {
    let extracted = tree(vec![file("red.rar", "pak01_dir.vpk", true)]);
    let selection = tree(vec![file("base.zip", "pak01_dir.vpk", false)]);

    assert_eq!(
      DownloadManager::selected_extracted_vpks(
        std::path::Path::new("extracted"),
        &extracted,
        Some(&selection)
      ),
      vec![std::path::Path::new("extracted").join("pak01_dir.vpk")]
    );
    assert!(!DownloadManager::selection_covers_archive(
      Some(&selection),
      "red.rar"
    ));
  }

  fn carried_selection(
    extracted: &ModFileTree,
    selection: &ModFileTree,
    downloaded: &[&str],
  ) -> Option<Vec<String>> {
    DownloadManager::carry_selection_to_archive(extracted, Some(selection), downloaded).map(
      |(carried, _)| {
        DownloadManager::selected_extracted_vpks(
          std::path::Path::new("extracted"),
          extracted,
          Some(&carried),
        )
        .into_iter()
        .map(|path| {
          path
            .strip_prefix("extracted")
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/")
        })
        .collect()
      },
    )
  }

  #[test]
  fn update_selection_carries_over_to_a_reuploaded_archive() {
    let new = "bonus_pack_1_3a4f9.zip";
    let extracted = tree(vec![
      file(new, "kaze_yuzu.vpk", true),
      file(new, "ember.vpk", true),
      file(new, "brand_new.vpk", true),
    ]);
    let selection = tree(vec![
      file("bonus_pack_1.zip", "bonus_pack_1.zip/kaze_yuzu.vpk", true),
      file("bonus_pack_1.zip", "bonus_pack_1.zip/ember.vpk", false),
    ]);

    assert_eq!(
      carried_selection(&extracted, &selection, &[new]),
      Some(vec!["kaze_yuzu.vpk".to_string()])
    );
  }

  #[test]
  fn update_selection_carries_each_pack_its_own_choices() {
    let selection = tree(vec![
      file("pack_a.zip", "pack_a.zip/pak01_dir.vpk", true),
      file("pack_a.zip", "pack_a.zip/a_only.vpk", false),
      file("pack_a.zip", "pack_a.zip/a_extra.vpk", false),
      file("pack_b.zip", "pack_b.zip/pak01_dir.vpk", false),
      file("pack_b.zip", "pack_b.zip/b_only.vpk", true),
    ]);
    let downloaded = ["pack_a_v2.zip", "pack_b_v2.zip"];
    let pack_a = tree(vec![
      file("pack_a_v2.zip", "pak01_dir.vpk", true),
      file("pack_a_v2.zip", "a_only.vpk", true),
      file("pack_a_v2.zip", "a_extra.vpk", true),
    ]);
    let pack_b = tree(vec![
      file("pack_b_v2.zip", "pak01_dir.vpk", true),
      file("pack_b_v2.zip", "b_only.vpk", true),
    ]);

    assert_eq!(
      carried_selection(&pack_a, &selection, &downloaded),
      Some(vec!["pak01_dir.vpk".to_string()])
    );
    assert_eq!(
      carried_selection(&pack_b, &selection, &downloaded),
      Some(vec!["b_only.vpk".to_string()])
    );
  }

  #[test]
  fn update_selection_carries_over_moved_files_with_a_unique_name() {
    let new = "mod_v2.zip";
    let selection = tree(vec![
      file("mod.zip", "mod.zip/kaze.vpk", true),
      file("mod.zip", "mod.zip/pak01_dir.vpk", true),
      file("mod.zip", "mod.zip/other.vpk", false),
    ]);
    let extracted = tree(vec![
      file(new, "colours/kaze.vpk", true),
      file(new, "red/pak01_dir.vpk", true),
      file(new, "blue/pak01_dir.vpk", true),
      file(new, "other.vpk", true),
    ]);

    assert_eq!(
      carried_selection(&extracted, &selection, &[new]),
      Some(vec!["colours/kaze.vpk".to_string()])
    );
  }

  #[test]
  fn update_selection_asks_about_a_pack_with_nothing_chosen() {
    // Carrying "nothing" over would leave the update with no VPKs to install.
    let new = "mod_v2.zip";
    let selection = tree(vec![
      file("mod.zip", "mod.zip/one.vpk", false),
      file("mod.zip", "mod.zip/two.vpk", false),
    ]);
    let extracted = tree(vec![file(new, "one.vpk", true), file(new, "two.vpk", true)]);

    assert_eq!(carried_selection(&extracted, &selection, &[new]), None);
  }

  #[test]
  fn update_selection_pairs_with_the_archive_whose_choices_are_found() {
    // Blue wasn't downloaded this time and shares more names, but nothing
    // in it was chosen.
    let selection = tree(vec![
      file("red.zip", "red.zip/pak01_dir.vpk", true),
      file("blue.zip", "blue.zip/pak01_dir.vpk", false),
      file("blue.zip", "blue.zip/extra.vpk", false),
    ]);
    let extracted = tree(vec![
      file("red_v2.zip", "pak01_dir.vpk", true),
      file("red_v2.zip", "extra.vpk", true),
    ]);

    assert_eq!(
      carried_selection(&extracted, &selection, &["red_v2.zip"]),
      Some(vec!["pak01_dir.vpk".to_string()])
    );
  }

  #[test]
  fn update_selection_never_picks_a_turned_down_variant_by_name() {
    let new = "mod_v2.zip";
    let selection = tree(vec![
      file("mod.zip", "mod.zip/red/pak01_dir.vpk", false),
      file("mod.zip", "mod.zip/blue/pak01_dir.vpk", true),
    ]);
    // Blue is gone and red moved, so only the name could still match.
    let extracted = tree(vec![
      file(new, "skins/pak01_dir.vpk", true),
      file(new, "other.vpk", true),
    ]);

    assert_eq!(carried_selection(&extracted, &selection, &[new]), None);
  }

  #[test]
  fn update_selection_asks_when_nothing_carries_over() {
    let new = "mod_v2.zip";
    let extracted = tree(vec![file(new, "one.vpk", true), file(new, "two.vpk", true)]);

    // The chosen VPK is gone from the new upload.
    let gone = tree(vec![
      file("mod.zip", "mod.zip/one.vpk", false),
      file("mod.zip", "mod.zip/removed.vpk", true),
    ]);
    assert_eq!(carried_selection(&extracted, &gone, &[new]), None);

    // No replaced archive shares a name with it.
    let unrelated = tree(vec![file("mod.zip", "mod.zip/other.vpk", true)]);
    assert_eq!(carried_selection(&extracted, &unrelated, &[new]), None);

    // The archive it was saved for still downloads, so it was not replaced.
    let current = tree(vec![file("mod.zip", "mod.zip/one.vpk", true)]);
    assert_eq!(
      carried_selection(&extracted, &current, &[new, "mod.zip"]),
      None
    );

    // Two replaced archives fit it equally well.
    let tied = tree(vec![
      file("a.zip", "a.zip/one.vpk", true),
      file("b.zip", "b.zip/two.vpk", true),
    ]);
    assert_eq!(carried_selection(&extracted, &tied, &[new]), None);
  }

  fn saved_order(
    prepared: Vec<ModFile>,
    saved: &ModFileTree,
    replaced: &[(&str, &'static str)],
    downloaded: &[&str],
  ) -> Vec<String> {
    let mut prepared = tree(prepared);
    let replaced = replaced
      .iter()
      .map(|(archive, old)| (archive.to_string(), *old))
      .collect();
    DownloadManager::keep_saved_order(&mut prepared, Some(saved), &replaced, downloaded);
    prepared.files.into_iter().map(|file| file.path).collect()
  }

  #[test]
  fn update_keeps_the_saved_load_order_and_places_new_files_by_download() {
    // The player moved b.zip's file ahead of a.zip's.
    let saved = tree(vec![
      file("b.zip", "b.zip/two.vpk", true),
      file("a.zip", "a.zip/one.vpk", true),
    ]);
    let prepared = vec![
      file("a.zip", "a.zip/one.vpk", true),
      file("a.zip", "a.zip/added.vpk", true),
      file("b.zip", "b.zip/two.vpk", true),
    ];

    // A new file in the first download goes before the first file of a later one.
    assert_eq!(
      saved_order(prepared, &saved, &[], &["a.zip", "b.zip"]),
      ["a.zip/added.vpk", "b.zip/two.vpk", "a.zip/one.vpk"]
    );
  }

  #[test]
  fn update_keeps_the_saved_load_order_across_a_reupload() {
    let saved = tree(vec![
      file("pack_1a2b3.zip", "pack_1a2b3.zip/red/pak01_dir.vpk", true),
      file("pack_1a2b3.zip", "pack_1a2b3.zip/blue/pak01_dir.vpk", true),
    ]);
    // Install names come from the archive, so only the path still matches.
    let mut blue = file("pack_4c5d6.zip", "pack_4c5d6.zip/blue/pak01_dir.vpk", true);
    blue.name = "pak01-blue-new_dir.vpk".to_string();
    let mut red = file("pack_4c5d6.zip", "pack_4c5d6.zip/red/pak01_dir.vpk", true);
    red.name = "pak01-red-new_dir.vpk".to_string();

    assert_eq!(
      saved_order(
        vec![blue, red],
        &saved,
        &[("pack_4c5d6.zip", "pack_1a2b3.zip")],
        &["pack_4c5d6.zip"],
      ),
      [
        "pack_4c5d6.zip/red/pak01_dir.vpk",
        "pack_4c5d6.zip/blue/pak01_dir.vpk"
      ]
    );
  }

  #[test]
  fn update_selection_preserves_legacy_unscoped_choices() {
    let extracted = tree(vec![file("mod.zip", "main.vpk", true)]);
    let selection = tree(vec![file("", "main.vpk", false)]);

    assert!(
      DownloadManager::selected_extracted_vpks(
        std::path::Path::new("extracted"),
        &extracted,
        Some(&selection),
      )
      .is_empty()
    );
  }

  #[test]
  fn direct_vpk_selection_preserves_choices_and_includes_new_or_renamed_files() {
    let selection = tree(vec![
      file("", "main.vpk", true),
      file("", "optional.vpk", false),
      file("", "old.vpk", false),
    ]);

    for (name, expected) in [
      ("main.vpk", true),
      ("optional.vpk", false),
      ("new.vpk", true),
      ("renamed.vpk", true),
    ] {
      assert_eq!(
        DownloadManager::downloaded_vpk_is_selected(
          &std::path::Path::new("downloads").join(name),
          Some(&selection),
        ),
        expected,
        "{name}"
      );
    }
  }

  #[test]
  fn direct_vpk_selection_ignores_other_archives() {
    let selection = tree(vec![file("other.zip", "main.vpk", false)]);

    assert!(DownloadManager::downloaded_vpk_is_selected(
      std::path::Path::new("downloads/main.vpk"),
      Some(&selection),
    ));
  }

  #[test]
  fn direct_vpk_selection_accepts_scoped_windows_paths() {
    for is_selected in [true, false] {
      let selection = tree(vec![file("main.vpk", "main.vpk\\main.vpk", is_selected)]);

      assert_eq!(
        DownloadManager::downloaded_vpk_is_selected(
          std::path::Path::new("downloads/main.vpk"),
          Some(&selection),
        ),
        is_selected
      );
    }
  }

  #[test]
  fn each_aggregate_figure_reaches_its_own_event_field() {
    let event = DownloadProgressEvent::from_accepted(
      AcceptedProgress {
        file_downloaded: 1,
        total_downloaded: 2,
        total_size: 3,
        total_speed: 4.0,
        percentage: 5.0,
      },
      "mod-7",
      8,
      9,
      None,
    );

    assert_eq!(event.mod_id, "mod-7");
    assert_eq!(event.file_index, 8);
    assert_eq!(event.total_files, 9);
    assert_eq!(
      event.progress, 1,
      "the three byte counts are mutually assignable, so a transposition among them compiles and no reader on the frontend would catch it"
    );
    assert_eq!(event.progress_total, 2);
    assert_eq!(event.total, 3);
    assert_eq!(
      event.transfer_speed, 4.0,
      "the speed and the percentage are the only two figures the UI reads, and each accepts the other's value"
    );
    assert_eq!(
      event.percentage, 5.0,
      "the bar was driven by the transfer rate"
    );
  }

  #[test]
  fn files_failing_the_same_way_report_the_failure_once() {
    let forbidden = || Error::Network("Server returned error status: 403 Forbidden".to_string());
    let errors = vec![
      forbidden(),
      forbidden(),
      Error::Network("Failed to send request: timed out".to_string()),
      forbidden(),
    ];

    assert_eq!(
      DownloadManager::combine_file_errors(errors)
        .map(|error| error.to_string())
        .as_deref(),
      Some(
        "Download failed: Network error: Server returned error status: 403 Forbidden; Network error: Failed to send request: timed out"
      ),
      "a six-file mod showed the same 403 six times in one message"
    );
  }
}
