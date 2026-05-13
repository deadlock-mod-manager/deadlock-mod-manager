use std::sync::Arc;
use std::sync::atomic::Ordering;

use crate::errors::Error;
use crate::ingest_tool;
use serde::{Deserialize, Serialize};

use super::state::{INGEST_WATCHER_GEN, INGEST_WATCHER_RUNNING};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IngestStatus {
  pub is_running: bool,
  pub cache_directory: Option<String>,
}

#[tauri::command]
pub async fn trigger_cache_scan() -> Result<(), Error> {
  log::info!("Triggering cache scan");

  let cache_dir = ingest_tool::get_cache_directory()
    .ok_or_else(|| Error::InvalidInput("Could not find Steam cache directory".to_string()))?;

  tokio::task::spawn(async move {
    ingest_tool::initial_cache_dir_ingest(&cache_dir).await;
  });

  Ok(())
}

#[tauri::command]
pub async fn start_cache_watcher() -> Result<(), Error> {
  log::info!("Starting cache watcher");

  let cache_dir = ingest_tool::get_cache_directory()
    .ok_or_else(|| Error::InvalidInput("Could not find Steam cache directory".to_string()))?;

  if INGEST_WATCHER_RUNNING
    .compare_exchange(false, true, Ordering::AcqRel, Ordering::Relaxed)
    .is_err()
  {
    log::warn!("Cache watcher is already running");
    return Ok(());
  }

  let generation = INGEST_WATCHER_GEN.fetch_add(1, Ordering::Relaxed) + 1;
  let running_flag = Arc::clone(&INGEST_WATCHER_RUNNING);
  let gen_counter = Arc::clone(&INGEST_WATCHER_GEN);

  tokio::task::spawn(async move {
    log::info!("Cache watcher task started");
    let mut requested_stop = false;

    ingest_tool::initial_cache_dir_ingest(&cache_dir).await;

    loop {
      if !running_flag.load(Ordering::Relaxed) {
        log::info!("Cache watcher stopped by flag");
        requested_stop = true;
        break;
      }

      match ingest_tool::watch_cache_dir(&cache_dir, Arc::clone(&running_flag)).await {
        Ok(_) => {
          log::info!("Cache watcher exited normally");
          break;
        }
        Err(e) => {
          log::error!("Cache watcher error: {e:?}");
          tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

          if !running_flag.load(Ordering::Relaxed) {
            requested_stop = true;
            break;
          }
          log::info!("Restarting cache watcher after error");
        }
      }
    }

    if !requested_stop && gen_counter.load(Ordering::Relaxed) == generation {
      running_flag.store(false, Ordering::Relaxed);
    }
    log::info!("Cache watcher thread exited");
  });

  Ok(())
}

#[tauri::command]
pub async fn stop_cache_watcher() -> Result<(), Error> {
  log::info!("Stopping cache watcher");
  INGEST_WATCHER_RUNNING.store(false, Ordering::Relaxed);
  Ok(())
}

#[tauri::command]
pub async fn get_ingest_status() -> Result<IngestStatus, Error> {
  let is_running = INGEST_WATCHER_RUNNING.load(Ordering::Relaxed);
  let cache_directory = ingest_tool::get_cache_directory().map(|p| p.display().to_string());

  Ok(IngestStatus {
    is_running,
    cache_directory,
  })
}

#[tauri::command]
pub async fn initialize_ingest_tool() -> Result<(), Error> {
  log::info!("Initializing ingest tool on startup");

  if INGEST_WATCHER_RUNNING.load(Ordering::Relaxed) {
    log::warn!("Cache watcher is already running, skipping initialization");
    return Ok(());
  }

  let cache_dir = match ingest_tool::get_cache_directory() {
    Some(dir) => dir,
    None => {
      log::warn!("Could not find Steam cache directory, ingest tool will not start");
      return Ok(());
    }
  };

  log::info!("Found cache directory: {}", cache_dir.display());

  log::info!("Running initial cache scan");
  ingest_tool::initial_cache_dir_ingest(&cache_dir).await;

  log::info!("Starting cache watcher");
  let generation = INGEST_WATCHER_GEN.fetch_add(1, Ordering::Relaxed) + 1;
  INGEST_WATCHER_RUNNING.store(true, Ordering::Relaxed);

  let running = INGEST_WATCHER_RUNNING.clone();
  let gen_counter = INGEST_WATCHER_GEN.clone();
  tokio::task::spawn(async move {
    if let Err(e) = ingest_tool::watch_cache_dir(&cache_dir, running.clone()).await {
      log::error!("Cache watcher error: {e}");
    }
    if gen_counter.load(Ordering::Relaxed) == generation {
      running.store(false, Ordering::Relaxed);
      log::info!("Cache watcher stopped");
    } else {
      log::info!("Cache watcher stopped but not clearing flag - newer generation exists");
    }
  });

  log::info!("Ingest tool initialized successfully");
  Ok(())
}
