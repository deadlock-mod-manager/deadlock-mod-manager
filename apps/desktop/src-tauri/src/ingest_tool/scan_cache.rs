use crate::ingest_tool::ingestion_cache;
use crate::ingest_tool::utils::Salts;
use memchr::{memchr, memmem};
use notify::event::CreateKind;
use notify::{EventKind, RecursiveMode, Watcher};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

/// Get the Steam HTTP cache directory using steamlocate
pub fn get_cache_directory() -> Option<PathBuf> {
  let steam_dir = steamlocate::SteamDir::locate().ok()?;
  let steam_path = steam_dir.path();
  let cache_path = steam_path.join("appcache").join("httpcache");

  if cache_path.exists() && cache_path.is_dir() {
    log::info!("Found Steam cache directory: {}", cache_path.display());
    Some(cache_path)
  } else {
    log::warn!(
      "Steam directory found at {}, but cache directory does not exist at {}",
      steam_path.display(),
      cache_path.display()
    );
    None
  }
}

fn scan_directory(dir: &Path, results: &mut Vec<(String, String)>) {
  if let Ok(entries) = fs::read_dir(dir) {
    for entry in entries.flatten() {
      let path = entry.path();

      if path.is_dir() {
        scan_directory(&path, results);
      } else if path.is_file() {
        if let Some(url) = scan_file(&path) {
          let file_path = path.display().to_string();
          log::info!("Found: {file_path} -> {url}");
          results.push((file_path, url));
        }
      }
    }
  }
}

fn scan_file(path: &Path) -> Option<String> {
  if let Ok(mut file) = fs::File::open(path) {
    let mut buffer = Vec::new();
    if file.read_to_end(&mut buffer).is_ok() {
      return extract_replay_url(&buffer);
    }
  }
  None
}

fn extract_replay_url(data: &[u8]) -> Option<String> {
  let finder = memmem::Finder::new(b".valve.net");

  // Find all occurrences of .valve.net
  for i in finder.find_iter(data) {
    // Look backwards to find the start of the host (replayXXX)
    let mut host_start = i;
    while host_start > 0 {
      let c = data[host_start - 1];
      if c.is_ascii_alphanumeric() || c == b'.' {
        host_start -= 1;
      } else {
        break;
      }
    }

    // Extract host
    let host_end = i + b".valve.net".len();
    if let Ok(host) = core::str::from_utf8(&data[host_start..host_end]) {
      if host.starts_with("replay") && host.contains(".valve.net") {
        let mut path_start = None;

        if let Some(slash_pos) = memchr(b'/', &data[host_end..data.len().min(host_end + 200)]) {
          path_start = Some(host_end + slash_pos);
        }

        if let Some(start) = path_start {
          // Find the end of the path (null byte, newline, space, quote)
          let search_slice = &data[start..data.len().min(start + 300)];

          let end_markers = [b'\0', b'\n', b'\r', b' ', b'"', b'\''];
          let mut min_end = search_slice.len();

          for &marker in &end_markers {
            if let Some(pos) = memchr(marker, search_slice) {
              min_end = min_end.min(pos);
            }
          }

          if let Ok(path) = core::str::from_utf8(&data[start..start + min_end]) {
            let url = format!("http://{host}{path}");
            // Check for Deadlock
            if url.contains("1422450") {
              return Some(url);
            }
          }
        }
      }
    }
  }

  None
}

pub async fn initial_cache_dir_ingest(cache_dir: &Path) {
  log::info!("Scanning cache directory: {}", cache_dir.display());
  let mut results = Vec::new();
  scan_directory(cache_dir, &mut results);
  let salts = results
    .into_iter()
    .filter_map(|(_, url)| Salts::from_url(&url))
    .collect::<Vec<_>>();

  if salts.is_empty() {
    return;
  }

  match Salts::ingest_many(&salts).await {
    Ok(..) => {
      // Mark all salts as successfully ingested in the shared cache
      for salt in &salts {
        ingestion_cache::mark_ingested(salt);
      }
    }
    Err(e) => log::error!("Failed to ingest salts: {e:?}"),
  }
}

pub async fn watch_cache_dir(
  cache_dir: &Path,
  running_flag: Arc<AtomicBool>,
) -> notify::Result<()> {
  log::info!("Watching cache directory: {}", cache_dir.display());
  let (tx, rx) = std::sync::mpsc::channel();
  let mut watcher = notify::recommended_watcher(tx)?;
  watcher.watch(cache_dir, RecursiveMode::Recursive)?;

  loop {
    // Check if we should stop
    if !running_flag.load(Ordering::Relaxed) {
      log::info!("Cache watcher stopping due to flag");
      break;
    }

    // Use recv_timeout to periodically check the running flag
    match rx.recv_timeout(std::time::Duration::from_secs(10)) {
      Ok(Ok(event)) => {
        if event.kind != EventKind::Create(CreateKind::File) {
          continue;
        }
        // Wait 200ms for the file to be fully written
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        for path in event.paths {
          if let Some(url) = scan_file(&path) {
            if let Some(salts) = Salts::from_url(&url) {
              // Check if we've already ingested this salt using the shared cache
              let is_new_metadata = salts.metadata_salt.is_some()
                && !ingestion_cache::is_ingested(salts.match_id, true);
              let is_new_replay =
                salts.replay_salt.is_some() && !ingestion_cache::is_ingested(salts.match_id, false);

              if !is_new_metadata && !is_new_replay {
                continue;
              }

              match salts.ingest().await {
                Ok(..) => {
                  log::info!("Ingested salts: {salts:?}");
                  ingestion_cache::mark_ingested(&salts);
                }
                Err(e) => log::error!("Failed to ingest salts: {e:?}"),
              }
            }
          }
        }
      }
      Ok(Err(_)) => continue, // Watcher error, continue
      Err(std::sync::mpsc::RecvTimeoutError::Timeout) => continue, // Timeout, check flag again
      Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
        log::warn!("Watcher channel disconnected");
        break;
      }
    }
  }
  Ok(())
}
