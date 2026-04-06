use regex::Regex;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

const CONSOLE_LOG_FILENAME: &str = "console.log";
const POLL_INTERVAL_MS: u64 = 1500;

fn get_console_log_path(game_path: &Path) -> PathBuf {
  game_path
    .join("game")
    .join("citadel")
    .join(CONSOLE_LOG_FILENAME)
}

/// Polls `console.log` from `last_offset`, returns any new bytes appended.
fn read_new_content(path: &Path, last_offset: &mut u64) -> Option<String> {
  let mut file = std::fs::File::open(path).ok()?;
  let metadata = file.metadata().ok()?;
  let current_len = metadata.len();

  if current_len < *last_offset {
    // File was truncated / rotated; start from scratch.
    *last_offset = 0;
  }

  if current_len <= *last_offset {
    return None;
  }

  file.seek(SeekFrom::Start(*last_offset)).ok()?;
  let to_read = (current_len - *last_offset) as usize;
  let mut buf = vec![0u8; to_read];
  file.read_exact(&mut buf).ok()?;
  *last_offset = current_len;

  String::from_utf8(buf).ok()
}

/// Watches the console log for `ServerSteamID=\[...\]` until found or stopped.
/// Returns the connect code (e.g. `[A:1:3695290372:49365]`) or `None` if stopped.
pub async fn watch_for_connect_code(
  game_path: &Path,
  running_flag: Arc<AtomicBool>,
) -> Option<String> {
  let log_path = get_console_log_path(game_path);
  let re = Regex::new(r"ServerSteamID=(\[A:\d+:\d+:\d+\])").expect("invalid regex");

  // Start reading from the current end of the file (or 0 if it doesn't exist yet)
  // so we don't pick up stale IDs from a previous session.
  let mut offset: u64 = std::fs::metadata(&log_path).map(|m| m.len()).unwrap_or(0);

  loop {
    if !running_flag.load(Ordering::Relaxed) {
      log::info!("Console log watcher stopped by flag");
      return None;
    }

    if let Some(chunk) = read_new_content(&log_path, &mut offset)
      && let Some(caps) = re.captures(&chunk) {
        let code = caps.get(1).map(|m| m.as_str().to_string());
        if code.is_some() {
          log::info!("Found connect code in console.log: {:?}", code);
          return code;
        }
      }

    tokio::time::sleep(std::time::Duration::from_millis(POLL_INTERVAL_MS)).await;
  }
}
