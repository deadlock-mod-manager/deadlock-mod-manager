use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicUsize};

use std::path::PathBuf;
use std::sync::LazyLock;
use tokio::sync::OnceCell;
use tokio_util::sync::CancellationToken;

use crate::download_manager::DownloadManager;
use crate::errors::Error;
use crate::mod_manager::ModManager;

pub(crate) static MANAGER: LazyLock<Mutex<ModManager>> =
  LazyLock::new(|| Mutex::new(ModManager::new()));
pub(crate) static API_URL: LazyLock<Mutex<String>> =
  LazyLock::new(|| Mutex::new("http://localhost:9000".to_string()));
pub(crate) static DOWNLOAD_MANAGER: OnceCell<DownloadManager> = OnceCell::const_new();

pub(crate) static INGEST_WATCHER_RUNNING: LazyLock<Arc<AtomicBool>> =
  LazyLock::new(|| Arc::new(AtomicBool::new(false)));
pub(crate) static INGEST_WATCHER_GEN: LazyLock<Arc<AtomicUsize>> =
  LazyLock::new(|| Arc::new(AtomicUsize::new(0)));

pub(crate) static CONSOLE_LOG_WATCHER_RUNNING: LazyLock<Arc<AtomicBool>> =
  LazyLock::new(|| Arc::new(AtomicBool::new(false)));

/// Cancellation handle for the in-flight server connect watchdog. Only one may
/// run at a time so two join attempts cannot interleave their progress events.
pub(crate) static SERVER_CONNECT_WATCHDOG: LazyLock<Mutex<Option<CancellationToken>>> =
  LazyLock::new(|| Mutex::new(None));

pub(crate) fn game_path() -> Result<PathBuf, Error> {
  let manager = MANAGER
    .lock()
    .map_err(|_| Error::BackgroundTaskFailed("Mod manager lock poisoned".to_string()))?;
  manager
    .get_steam_manager()
    .get_game_path()
    .cloned()
    .ok_or(Error::GamePathNotSet)
}

pub fn get_api_url() -> String {
  match API_URL.lock() {
    Ok(url) => url.clone(),
    Err(_) => {
      log::warn!("Failed to acquire API URL lock, using default");
      "http://localhost:9000".to_string()
    }
  }
}
