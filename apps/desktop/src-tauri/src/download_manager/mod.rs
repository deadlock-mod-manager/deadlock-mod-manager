pub mod downloader;

use crate::app_runtime::AppHandle;
use crate::errors::Error;
use downloader::{DownloadProgress as FileProgress, PauseHandle, download_file_resumable};
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
  pub progress: f64,
  pub speed: f64,
}

struct ActiveDownload {
  cancel_token: CancellationToken,
  pause: PauseHandle,
  status: String,
  progress: f64,
  speed: f64,
}

#[derive(Clone, Debug)]
pub struct PreparedDownload {
  pub operation_id: u64,
  pub mod_id: String,
  pub profile_folder: Option<String>,
  pub vpk_paths: Vec<PathBuf>,
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

  pub async fn queue_download_and_prepare(
    &self,
    task: DownloadTask,
  ) -> Result<PreparedDownload, Error> {
    let (sender, receiver) = oneshot::channel();
    self
      .queue(task, DownloadPurpose::PrepareUpdate, Some(sender))
      .await;

    receiver
      .await
      .map_err(|_| Error::BackgroundTaskFailed("Download worker stopped unexpectedly".to_string()))?
      .map_err(Error::DownloadFailed)
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
        let task = {
          let mut queue = queue_clone.lock().await;
          queue.pop_front()
        };

        match task {
          Some(queued) => {
            let mod_id = queued.task.mod_id.clone();
            let profile_folder = queued.task.profile_folder.clone();
            let task_path = queued.task.target_dir.to_string_lossy().to_string();
            let result = Self::download_mod(
              queued.operation_id,
              queued.task,
              queued.purpose,
              Arc::clone(&active_clone),
              app_handle.clone(),
            )
            .await;

            active_clone.lock().await.remove(&mod_id);

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
                    DownloadErrorEvent {
                      mod_id: mod_id.clone(),
                      error: error.to_string(),
                    },
                  )
                  .ok();
              }
            }

            if let Some(completion) = queued.completion {
              completion.send(result.map_err(|error| error.to_string())).ok();
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
    task: DownloadTask,
    purpose: DownloadPurpose,
    active_downloads: Arc<Mutex<HashMap<String, ActiveDownload>>>,
    app_handle: AppHandle,
  ) -> Result<PreparedDownload, Error> {
    let mod_id = task.mod_id.clone();
    let cancel_token = CancellationToken::new();
    let pause = PauseHandle::new();

    {
      let mut active = active_downloads.lock().await;
      active.insert(
        mod_id.clone(),
        ActiveDownload {
          cancel_token: cancel_token.clone(),
          pause: pause.clone(),
          status: "downloading".to_string(),
          progress: 0.0,
          speed: 0.0,
        },
      );
    }

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
    let mut file_sizes = Vec::new();
    let mut file_downloaded = Vec::new();

    for file in &task.files {
      file_sizes.push(file.size);
      file_downloaded.push(0u64);
    }

    let mut handles = Vec::new();

    for (file_index, file) in task.files.iter().enumerate() {
      let target_path = task.target_dir.join(&file.name);
      let url = file.url.clone();
      let file_size = file.size;
      let md5_checksum = file.md5_checksum.clone();
      let mod_id_clone = mod_id.clone();
      let app_handle_clone = app_handle.clone();
      let cancel_token_clone = cancel_token.clone();
      let pause_clone = pause.clone();
      let active_downloads_clone = Arc::clone(&active_downloads);
      let file_sizes_clone = file_sizes.clone();
      let file_downloaded_shared = Arc::new(Mutex::new(file_downloaded.clone()));

      let handle = tokio::spawn(async move {
        let result = download_file_resumable(
          &url,
          &target_path,
          file_size,
          {
            let app_handle = app_handle_clone.clone();
            let mod_id = mod_id_clone.clone();
            let active_downloads = Arc::clone(&active_downloads_clone);
            let file_downloaded = Arc::clone(&file_downloaded_shared);

            move |progress: FileProgress| {
              let app_handle = app_handle.clone();
              let mod_id = mod_id.clone();
              let active_downloads = Arc::clone(&active_downloads);
              let file_downloaded = Arc::clone(&file_downloaded);
              let file_sizes = file_sizes_clone.clone();

              tokio::spawn(async move {
                {
                  let mut downloaded = file_downloaded.lock().await;
                  downloaded[file_index] = progress.downloaded;
                }

                let downloaded = file_downloaded.lock().await;
                let total_downloaded: u64 = downloaded.iter().sum();
                let total_size: u64 = file_sizes.iter().sum();

                let overall_percentage = if total_size > 0 {
                  (total_downloaded as f64 / total_size as f64) * 100.0
                } else {
                  0.0
                };

                {
                  let mut active = active_downloads.lock().await;
                  if let Some(download) = active.get_mut(&mod_id) {
                    download.progress = overall_percentage;
                    download.speed = progress.speed;
                  }
                }

                app_handle
                  .emit(
                    "download-progress",
                    DownloadProgressEvent {
                      mod_id: mod_id.clone(),
                      file_index,
                      total_files,
                      progress: progress.downloaded,
                      progress_total: total_downloaded,
                      total: total_size,
                      transfer_speed: progress.speed,
                      percentage: overall_percentage,
                    },
                  )
                  .ok();
              });
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
          errors.push(e.to_string());
        }
        Err(e) => {
          errors.push(format!("Task join error: {e}"));
        }
      }
    }

    if !errors.is_empty() {
      let error_message = errors.join("; ");
      return Err(Error::DownloadFailed(error_message));
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

    let vpk_paths = match purpose {
      DownloadPurpose::Install => {
        Self::process_downloaded_files(&task, &downloaded_files, &app_handle).await?;
        Vec::new()
      }
      DownloadPurpose::PrepareUpdate => {
        Self::prepare_downloaded_vpks(operation_id, &task, &downloaded_files, &app_handle).await?
      }
    };

    Ok(PreparedDownload {
      operation_id,
      mod_id,
      profile_folder: task.profile_folder,
      vpk_paths,
    })
  }

  async fn prepare_downloaded_vpks(
    operation_id: u64,
    task: &DownloadTask,
    downloaded_files: &[PathBuf],
    app_handle: &AppHandle,
  ) -> Result<Vec<PathBuf>, Error> {
    use crate::mod_manager::archive_extractor::ArchiveExtractor;
    use crate::mod_manager::file_tree::FileTreeAnalyzer;

    let prepared_dir = task.target_dir.join(format!("prepared-{operation_id}"));
    if prepared_dir.exists() {
      std::fs::remove_dir_all(&prepared_dir)?;
    }
    std::fs::create_dir_all(&prepared_dir)?;

    let prepare_result = async {
      let extractor = ArchiveExtractor::new();
      let analyzer = FileTreeAnalyzer::new();
      let mut prepared_paths = Vec::new();

      for (archive_index, downloaded_file) in downloaded_files.iter().enumerate() {
        if !extractor.is_supported_archive(downloaded_file) {
          if downloaded_file.extension().and_then(|extension| extension.to_str()) == Some("vpk")
            && Self::downloaded_vpk_is_selected(downloaded_file, task.file_tree.as_ref())
          {
            Self::copy_prepared_vpk(downloaded_file, &prepared_dir, &mut prepared_paths)?;
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

        let extracted_dir = task
          .target_dir
          .join(format!("prepared-extracted-{operation_id}-{archive_index}"));
        if extracted_dir.exists() {
          std::fs::remove_dir_all(&extracted_dir)?;
        }
        std::fs::create_dir_all(&extracted_dir)?;

        let archive_path = downloaded_file.clone();
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
        }

        let archive_name = downloaded_file
          .file_name()
          .and_then(|name| name.to_str())
          .unwrap_or_default();
        let extracted_tree = analyzer.get_file_tree_from_extracted(&extracted_dir, archive_name)?;
        let selected_paths =
          Self::selected_extracted_vpks(&extracted_dir, &extracted_tree, task.file_tree.as_ref());

        if extracted_tree.has_multiple_files && task.file_tree.is_none() {
          return Err(Error::InvalidInput(format!(
            "A VPK selection is required to update mod {}",
            task.mod_id
          )));
        }

        for selected_path in selected_paths {
          Self::copy_prepared_vpk(&selected_path, &prepared_dir, &mut prepared_paths)?;
        }

        std::fs::remove_dir_all(&extracted_dir)?;
      }

      if prepared_paths.is_empty() {
        return Err(Error::InvalidInput(
          "No VPKs matched the update selection".to_string(),
        ));
      }

      Ok(prepared_paths)
    }
    .await;

    if prepare_result.is_err() && prepared_dir.exists()
      && let Err(error) = std::fs::remove_dir_all(&prepared_dir) {
        log::warn!(
          "Failed to remove incomplete prepared update directory {}: {}",
          prepared_dir.display(),
          error
        );
      }

    prepare_result
  }

  fn selected_extracted_vpks(
    extracted_dir: &std::path::Path,
    extracted_tree: &crate::mod_manager::file_tree::ModFileTree,
    selection: Option<&crate::mod_manager::file_tree::ModFileTree>,
  ) -> Vec<PathBuf> {
    extracted_tree
      .files
      .iter()
      .filter(|candidate| {
        selection.is_none_or(|selection| {
          selection.files.iter().any(|selected| {
            selected.is_selected
              && (selected.archive_name.is_empty()
                || selected.archive_name == candidate.archive_name)
              && selected.path.replace('\\', "/") == candidate.path.replace('\\', "/")
          })
        })
      })
      .map(|file| extracted_dir.join(&file.path))
      .collect()
  }

  fn downloaded_vpk_is_selected(
    path: &std::path::Path,
    selection: Option<&crate::mod_manager::file_tree::ModFileTree>,
  ) -> bool {
    let Some(selection) = selection else {
      return true;
    };
    let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
      return false;
    };

    selection
      .files
      .iter()
      .any(|file| file.is_selected && file.name == file_name)
  }

  fn copy_prepared_vpk(
    source: &std::path::Path,
    prepared_dir: &std::path::Path,
    prepared_paths: &mut Vec<PathBuf>,
  ) -> Result<(), Error> {
    let file_name = source.file_name().ok_or_else(|| {
      Error::InvalidInput(format!("VPK source has no filename: {}", source.display()))
    })?;
    let destination = prepared_dir.join(file_name);
    if destination.exists() {
      return Err(Error::InvalidInput(format!(
        "Update contains duplicate VPK filename: {}",
        file_name.to_string_lossy()
      )));
    }
    std::fs::copy(source, &destination)?;
    prepared_paths.push(destination);
    Ok(())
  }

  async fn process_downloaded_files(
    task: &DownloadTask,
    downloaded_files: &[PathBuf],
    app_handle: &AppHandle,
  ) -> Result<(), Error> {
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

    use crate::mod_manager::file_tree::FileTreeAnalyzer;

    let vpk_manager = VpkManager::new();
    let file_tree_analyzer = FileTreeAnalyzer::new();
    let font_manager = crate::mod_manager::FontManager::new();
    let stash_dir = task.target_dir.join("fonts");
    let mut found_font_infos: Vec<crate::mod_manager::FontInfo> = Vec::new();
    let mut seen_font_files = HashSet::new();
    let mut vpk_archive_map: HashMap<String, String> = HashMap::new();

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

      let extracted_dir = task.target_dir.join("extracted");
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

      let archive_name = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

      match file_tree_analyzer.get_file_tree_from_extracted(&extracted_dir, &archive_name) {
        Ok(file_tree) => {
          log::info!(
            "Analyzed file tree: {} files, has_multiple: {}",
            file_tree.total_files,
            file_tree.has_multiple_files
          );

          if file_tree.has_multiple_files {
            if task.is_profile_import {
              if let Some(ref provided_file_tree) = task.file_tree {
                log::info!(
                  "Profile import: File tree provided with selections, copying selected VPKs for mod: {}",
                  task.mod_id
                );

                let copied_vpks = vpk_manager.copy_selected_vpks_with_prefix(
                  &extracted_dir,
                  &destination_path,
                  &task.mod_id,
                  provided_file_tree,
                )?;

                log::info!(
                  "Copied {} VPKs for mod {}: {:?}",
                  copied_vpks.len(),
                  task.mod_id,
                  copied_vpks
                );

                if copied_vpks.is_empty() {
                  log::error!("No VPKs were copied for mod: {}", task.mod_id);
                  return Err(Error::InvalidInput(
                    "No VPKs matched the file tree selection".to_string(),
                  ));
                }

                emit_fonts_found(&found_font_infos);
                Self::cleanup_extracted(&extracted_dir, file_path);
                return Ok(());
              } else {
                log::info!(
                  "Profile import: Mod has multiple VPK files, skipping file tree event for mod: {}",
                  task.mod_id
                );
                emit_fonts_found(&found_font_infos);
                return Ok(());
              }
            }

            log::info!(
              "Mod has multiple VPK files, emitting file tree event for mod: {}",
              task.mod_id
            );

            app_handle
              .emit(
                "download-file-tree",
                DownloadFileTreeEvent {
                  mod_id: task.mod_id.clone(),
                  file_tree: file_tree.clone(),
                },
              )
              .ok();

            emit_fonts_found(&found_font_infos);
            return Ok(());
          }

          log::info!(
            "Mod has single VPK file, copying directly for mod: {}",
            task.mod_id
          );
          let copied =
            vpk_manager.copy_vpks_with_prefix(&extracted_dir, &destination_path, &task.mod_id)?;
          let prefix = format!("{}_", task.mod_id);
          for vpk_name in &copied {
            let original = vpk_name
              .strip_prefix(&prefix)
              .unwrap_or(vpk_name)
              .to_string();
            vpk_archive_map.insert(original, archive_name.clone());
          }
          Self::cleanup_extracted(&extracted_dir, file_path);
        }
        Err(e) => {
          log::warn!(
            "Failed to analyze file tree for mod {}: {}. Proceeding with normal copy.",
            task.mod_id,
            e
          );
          let copied =
            vpk_manager.copy_vpks_with_prefix(&extracted_dir, &destination_path, &task.mod_id)?;
          let prefix = format!("{}_", task.mod_id);
          for vpk_name in &copied {
            let original = vpk_name
              .strip_prefix(&prefix)
              .unwrap_or(vpk_name)
              .to_string();
            vpk_archive_map.insert(original, archive_name.clone());
          }
          Self::cleanup_extracted(&extracted_dir, file_path);
        }
      }
    }

    if !task.is_profile_import {
      let prefixed_vpks = vpk_manager.find_prefixed_vpks(&destination_path, &task.mod_id)?;

      if !prefixed_vpks.is_empty() {
        let prefix = format!("{}_", task.mod_id);
        let files: Vec<crate::mod_manager::file_tree::ModFile> = prefixed_vpks
          .iter()
          .map(|vpk_name| {
            let original_name = vpk_name
              .strip_prefix(&prefix)
              .unwrap_or(vpk_name)
              .to_string();
            let size = std::fs::metadata(destination_path.join(vpk_name))
              .map(|m| m.len())
              .unwrap_or(0);
            let archive = vpk_archive_map
              .get(&original_name)
              .cloned()
              .unwrap_or_default();
            crate::mod_manager::file_tree::ModFile {
              name: original_name.clone(),
              path: original_name,
              size,
              is_selected: true,
              archive_name: archive,
            }
          })
          .collect();

        let total_files = files.len();
        let aggregated_tree = crate::mod_manager::file_tree::ModFileTree {
          files,
          total_files,
          has_multiple_files: false,
        };

        log::info!(
          "Emitting aggregated file tree for mod {}: {} files",
          task.mod_id,
          total_files
        );

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

    emit_fonts_found(&found_font_infos);

    log::info!(
      "Finished processing downloaded files for mod: {}",
      task.mod_id
    );
    Ok(())
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

    let mut active = self.active_downloads.lock().await;
    if let Some(download) = active.remove(mod_id) {
      download.pause.resume();
      download.cancel_token.cancel();
      Ok(())
    } else {
      Err(Error::InvalidInput(format!(
        "No active download found for mod: {mod_id}"
      )))
    }
  }

  pub async fn pause_download(&self, mod_id: &str) -> Result<(), Error> {
    let mut active = self.active_downloads.lock().await;
    let Some(entry) = active.get_mut(mod_id) else {
      return Err(Error::InvalidInput(format!(
        "No active download found for mod: {mod_id}"
      )));
    };
    if entry.status != "downloading" {
      return Err(Error::InvalidInput(format!(
        "Download for mod {mod_id} is not active (status: {})",
        entry.status
      )));
    }
    entry.pause.pause();
    entry.status = "paused".to_string();
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

  pub async fn resume_download(&self, mod_id: &str) -> Result<(), Error> {
    let mut active = self.active_downloads.lock().await;
    let Some(entry) = active.get_mut(mod_id) else {
      return Err(Error::InvalidInput(format!(
        "No active download found for mod: {mod_id}"
      )));
    };
    if entry.status != "paused" {
      return Err(Error::InvalidInput(format!(
        "Download for mod {mod_id} is not paused (status: {})",
        entry.status
      )));
    }
    entry.pause.resume();
    entry.status = "downloading".to_string();
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
    Ok(())
  }

  pub async fn get_download_status(&self, mod_id: &str) -> Result<Option<DownloadStatus>, Error> {
    let active = self.active_downloads.lock().await;
    Ok(active.get(mod_id).map(|download| DownloadStatus {
      mod_id: mod_id.to_string(),
      status: download.status.clone(),
      progress: download.progress,
      speed: download.speed,
    }))
  }

  pub async fn get_all_downloads(&self) -> Result<Vec<DownloadStatus>, Error> {
    let active = self.active_downloads.lock().await;
    Ok(
      active
        .iter()
        .map(|(mod_id, download)| DownloadStatus {
          mod_id: mod_id.clone(),
          status: download.status.clone(),
          progress: download.progress,
          speed: download.speed,
        })
        .collect(),
    )
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
    let extracted = tree(vec![file("mod.zip", "variants/main.vpk", true)]);
    let selection = tree(vec![file("mod.zip", "variants\\main.vpk", true)]);

    assert_eq!(
      DownloadManager::selected_extracted_vpks(
        std::path::Path::new("extracted"),
        &extracted,
        Some(&selection),
      ),
      vec![std::path::Path::new("extracted").join("variants/main.vpk")]
    );
  }
}
