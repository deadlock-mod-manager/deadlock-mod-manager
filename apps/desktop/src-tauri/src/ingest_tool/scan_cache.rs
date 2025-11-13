use crate::ingest_tool::ingestion_cache;
use crate::ingest_tool::utils::Salts;
use memchr::{memchr, memmem};
use notify::event::{CreateKind, ModifyKind};
use notify::{EventKind, RecursiveMode, Watcher};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

const DEADLOCK_APP_ID: &str = "1422450";
const MAX_BYTES_TO_READ: usize = 200;
const SEARCH_SEQUENCE: &[u8; 10] = b".valve.net";
const PATH_END_MARKERS: [u8; 6] = [b' ', b'\'', b'\0', b'\n', b'\r', b'"'];

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

fn scan_directory(dir: &Path, results: &mut Vec<String>) {
  if let Ok(entries) = fs::read_dir(dir) {
    for entry in entries.flatten() {
      let path = entry.path();

      if path.is_dir() {
        scan_directory(&path, results);
      } else if path.is_file()
        && let Some(url) = extract_replay_url(&path)
      {
        let file_path = path.display().to_string();
        log::info!("Found: {file_path} -> {url}");
        results.push(url);
      }
    }
  }
}

fn extract_replay_url(path: &Path) -> Option<String> {
  let Ok(mut file) = fs::File::open(path) else {
    return None;
  };
  let mut data = vec![0u8; MAX_BYTES_TO_READ];
  file.read_exact(&mut data).ok()?;

  let finder = memmem::Finder::new(SEARCH_SEQUENCE);

  // Find all occurrences of .valve.net
  for i in finder.find_iter(&data) {
    // Extract Host
    let host_start = (0..i)
      .rev()
      .find(|&pos| !data[pos].is_ascii_alphanumeric() && data[pos] != b'.')
      .map_or(0, |pos| pos + 1);
    let host_end = i + SEARCH_SEQUENCE.len();
    let host_slice = &data[host_start..host_end];

    let Ok(host) = core::str::from_utf8(host_slice) else {
      continue;
    };
    if !host.starts_with("replay") || !host.contains(".valve.net") {
      continue;
    }

    // Extract Path
    let path_start = match memchr(b'/', &data[host_end..]) {
      Some(slash_pos) => host_end + slash_pos,
      None => continue,
    };
    let path_slice = &data[path_start..];
    let path_end = PATH_END_MARKERS
      .into_iter()
      .filter_map(|marker| memchr(marker, path_slice))
      .min()?;

    let Ok(path) = core::str::from_utf8(&path_slice[..path_end]) else {
      continue;
    };
    if !path.contains(DEADLOCK_APP_ID) {
      continue;
    }

    // Construct full URL
    return Some(format!("http://{host}{path}"));
  }

  None
}

pub async fn initial_cache_dir_ingest(cache_dir: &Path) {
  log::info!("Scanning cache directory: {}", cache_dir.display());
  let mut results = Vec::new();
  scan_directory(cache_dir, &mut results);
  let salts = results
    .into_iter()
    .filter_map(|url| Salts::from_url(&url))
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
        let is_data_modify = matches!(event.kind, EventKind::Modify(ModifyKind::Data(_)));
        let is_file_create = matches!(
          event.kind,
          EventKind::Create(CreateKind::Any | CreateKind::File)
        );
        if !is_data_modify && !is_file_create {
          continue;
        }
        // Wait 200ms for the file to be fully written
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        for path in event.paths {
          if let Some(url) = extract_replay_url(&path)
            && let Some(salts) = Salts::from_url(&url)
          {
            // Check if we've already ingested this salt using the shared cache
            let is_new_metadata =
              salts.metadata_salt.is_some() && !ingestion_cache::is_ingested(salts.match_id, true);
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
