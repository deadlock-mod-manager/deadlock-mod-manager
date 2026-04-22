use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use vpkmerger::CompressionLevel;

static COMPRESSION_ENABLED: AtomicBool = AtomicBool::new(false);
static PROFILE_FOLDER: Mutex<Option<String>> = Mutex::new(None);
static COMPRESSION_LEVEL: Mutex<CompressionLevel> = Mutex::new(CompressionLevel::Low);

pub fn set_compression_config(
  enabled: bool,
  level: CompressionLevel,
  profile_folder: Option<String>,
) {
  COMPRESSION_ENABLED.store(enabled, Ordering::SeqCst);
  if let Ok(mut g) = PROFILE_FOLDER.lock() {
    *g = profile_folder;
  }
  if let Ok(mut l) = COMPRESSION_LEVEL.lock() {
    *l = level;
  }
}

pub fn set_compression_enabled(enabled: bool, profile_folder: Option<String>) {
  COMPRESSION_ENABLED.store(enabled, Ordering::SeqCst);
  if let Ok(mut g) = PROFILE_FOLDER.lock() {
    *g = profile_folder;
  }
}

pub fn set_compression_level(level: CompressionLevel) {
  if let Ok(mut l) = COMPRESSION_LEVEL.lock() {
    *l = level;
  }
}

pub fn get_compression_level() -> CompressionLevel {
  COMPRESSION_LEVEL
    .lock()
    .ok()
    .map(|g| *g)
    .unwrap_or(CompressionLevel::Low)
}

pub fn is_compression_enabled() -> bool {
  COMPRESSION_ENABLED.load(Ordering::SeqCst)
}

pub fn get_compression_profile_folder() -> Option<String> {
  PROFILE_FOLDER
    .lock()
    .ok()
    .and_then(|g| g.clone())
    .filter(|s| !s.is_empty())
}
