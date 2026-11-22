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

pub(crate) struct ConsoleLogTail {
  path: PathBuf,
  offset: u64,
}

impl ConsoleLogTail {
  pub(crate) fn from_start(game_path: &Path) -> Self {
    Self {
      path: get_console_log_path(game_path),
      offset: 0,
    }
  }

  pub(crate) fn from_end(game_path: &Path) -> Self {
    let path = get_console_log_path(game_path);
    let offset = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    Self { path, offset }
  }

  pub(crate) fn read_new(&mut self) -> Option<String> {
    let mut file = std::fs::File::open(&self.path).ok()?;
    let current_len = file.metadata().ok()?.len();

    if current_len < self.offset {
      self.offset = 0;
    }

    if current_len <= self.offset {
      return None;
    }

    file.seek(SeekFrom::Start(self.offset)).ok()?;
    let to_read = (current_len - self.offset) as usize;
    let mut buf = vec![0u8; to_read];
    file.read_exact(&mut buf).ok()?;
    self.offset = current_len;

    String::from_utf8(buf).ok()
  }
}

pub async fn watch_for_connect_code(
  game_path: &Path,
  running_flag: Arc<AtomicBool>,
) -> Option<String> {
  let re = Regex::new(r"ServerSteamID=(\[A:\d+:\d+:\d+\])").expect("invalid regex");
  let mut tail = ConsoleLogTail::from_end(game_path);

  loop {
    if !running_flag.load(Ordering::Relaxed) {
      log::info!("Console log watcher stopped by flag");
      return None;
    }

    if let Some(chunk) = tail.read_new()
      && let Some(caps) = re.captures(&chunk)
    {
      let code = caps.get(1).map(|m| m.as_str().to_string());
      if code.is_some() {
        log::info!("Found connect code in console.log: {:?}", code);
        return code;
      }
    }

    tokio::time::sleep(std::time::Duration::from_millis(POLL_INTERVAL_MS)).await;
  }
}
