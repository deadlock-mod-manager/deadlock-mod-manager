use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

static COMPRESSION_ENABLED: AtomicBool = AtomicBool::new(false);
static PROFILE_FOLDER: Mutex<Option<String>> = Mutex::new(None);

pub fn set_compression_enabled(enabled: bool, profile_folder: Option<String>) {
  COMPRESSION_ENABLED.store(enabled, Ordering::SeqCst);
  if let Ok(mut g) = PROFILE_FOLDER.lock() {
    *g = profile_folder;
  }
}

pub fn is_compression_enabled() -> bool {
  COMPRESSION_ENABLED.load(Ordering::SeqCst)
}
