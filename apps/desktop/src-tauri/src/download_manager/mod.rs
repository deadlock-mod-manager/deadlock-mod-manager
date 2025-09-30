mod downloader;

use crate::errors::Error;
use downloader::{download_file, DownloadProgress as FileProgress};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DownloadFileDto {
  pub url: String,
  pub name: String,
  pub size: u64,
}

#[derive(Clone, Debug)]
pub struct DownloadTask {
  pub mod_id: String,
  pub mod_name: String,
  pub files: Vec<DownloadFileDto>,
  pub target_dir: PathBuf,
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

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadCompletedEvent {
  pub mod_id: String,
  pub path: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadErrorEvent {
  pub mod_id: String,
  pub error: String,
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
  status: String,
  progress: f64,
  speed: f64,
}

pub struct DownloadManager {
  queue: Arc<Mutex<VecDeque<DownloadTask>>>,
  active_downloads: Arc<Mutex<HashMap<String, ActiveDownload>>>,
  app_handle: AppHandle,
  processing: Arc<Mutex<bool>>,
}

impl DownloadManager {
  pub fn new(app_handle: AppHandle) -> Self {
    Self {
      queue: Arc::new(Mutex::new(VecDeque::new())),
      active_downloads: Arc::new(Mutex::new(HashMap::new())),
      app_handle,
      processing: Arc::new(Mutex::new(false)),
    }
  }

  pub async fn queue_download(&self, task: DownloadTask) -> Result<(), Error> {
    log::info!("Queueing download for mod: {}", task.mod_id);

    {
      let mut queue = self.queue.lock().await;
      queue.push_back(task);
    }

    self.process_queue().await;
    Ok(())
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
          Some(task) => {
            if let Err(e) =
              Self::download_mod(task, Arc::clone(&active_clone), app_handle.clone()).await
            {
              log::error!("Failed to download mod: {}", e);
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
    task: DownloadTask,
    active_downloads: Arc<Mutex<HashMap<String, ActiveDownload>>>,
    app_handle: AppHandle,
  ) -> Result<(), Error> {
    let mod_id = task.mod_id.clone();
    let cancel_token = CancellationToken::new();

    {
      let mut active = active_downloads.lock().await;
      active.insert(
        mod_id.clone(),
        ActiveDownload {
          cancel_token: cancel_token.clone(),
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

    log::info!("Starting download for mod: {}", mod_id);

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
      let mod_id_clone = mod_id.clone();
      let app_handle_clone = app_handle.clone();
      let cancel_token_clone = cancel_token.clone();
      let active_downloads_clone = Arc::clone(&active_downloads);
      let file_sizes_clone = file_sizes.clone();
      let file_downloaded_shared = Arc::new(Mutex::new(file_downloaded.clone()));

      let handle = tokio::spawn(async move {
        let result = download_file(
          &url,
          &target_path,
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
          errors.push(format!("Task join error: {}", e));
        }
      }
    }

    {
      let mut active = active_downloads.lock().await;
      active.remove(&mod_id);
    }

    if !errors.is_empty() {
      let error_message = errors.join("; ");
      log::error!("Download failed for mod {}: {}", mod_id, error_message);

      app_handle
        .emit(
          "download-error",
          DownloadErrorEvent {
            mod_id: mod_id.clone(),
            error: error_message.clone(),
          },
        )
        .ok();

      return Err(Error::DownloadFailed(error_message));
    }

    log::info!(
      "Download completed for mod: {} ({} files)",
      mod_id,
      downloaded_files.len()
    );

    app_handle
      .emit(
        "download-completed",
        DownloadCompletedEvent {
          mod_id: mod_id.clone(),
          path: task.target_dir.to_string_lossy().to_string(),
        },
      )
      .ok();

    Ok(())
  }

  pub async fn cancel_download(&self, mod_id: &str) -> Result<(), Error> {
    log::info!("Cancelling download for mod: {}", mod_id);

    let mut active = self.active_downloads.lock().await;
    if let Some(download) = active.remove(mod_id) {
      download.cancel_token.cancel();
      Ok(())
    } else {
      Err(Error::InvalidInput(format!(
        "No active download found for mod: {}",
        mod_id
      )))
    }
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
}
