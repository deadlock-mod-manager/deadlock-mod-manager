//! Fetching the maps and addons a Deadworks server requires.
//!
//! The server advertises them in its A2S_RULES reply (see [`super::deadworks_rules`])
//! and serves them from its own fastdl host. Maps land in `citadel/maps`,
//! addons in `citadel/deadworks_addons/vpks`, which the `addonroot` line DMM
//! writes into `gameinfo.gi` lets the server mount.

use std::collections::{BTreeSet, HashMap};
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};
use tauri::Emitter;

use crate::app_runtime::AppHandle;
use crate::errors::Error;

use super::deadworks_bootstrap::ensure_bootstrap;
use super::deadworks_fetch::{Fetched, MAX_FILE_BYTES, decode_vpk, fetch_to_file, file_sha256_hex};
use super::deadworks_rules::{
  Advertisement, ContentEntry, ContentKind, parse_advertisement, query_rules,
};
use super::server_browser::is_public_target;
use super::state::game_path;

/// Cap on bytes written to disk for one join, compressed plus decompressed.
const MAX_JOIN_BYTES: u64 = 16 * 1024 * 1024 * 1024;
const PROGRESS_EVENT: &str = "deadworks-content-progress";
const STATE_FILE: &str = "dmm_content_state.json";
/// Written by DMM before servers advertised content over A2S; its map keys
/// tell us which maps DMM installed and may therefore replace.
const LEGACY_STATE_FILE: &str = "dmm_content_versions.json";

/// The size and mtime a hash was computed at, so a 1 GB stock map is not
/// re-hashed on every join.
#[derive(Serialize, Deserialize, Clone)]
struct HashRecord {
  len: u64,
  modified_ms: u64,
  sha16: String,
}

#[derive(Serialize, Deserialize, Default)]
struct ContentState {
  /// Maps DMM installed. Any other map in `citadel/maps` is never overwritten.
  #[serde(default)]
  owned_maps: BTreeSet<String>,
  #[serde(default)]
  hashes: HashMap<String, HashRecord>,
  /// The Deadworks UI bootstrap version DMM last saw installed.
  #[serde(default)]
  bootstrap_version: Option<u64>,
}

#[derive(Deserialize)]
struct LegacyState {
  #[serde(default)]
  managed: HashMap<String, u64>,
}

#[derive(Serialize, Clone, Copy)]
#[serde(rename_all = "kebab-case")]
pub enum ContentStatus {
  Checking,
  Downloading,
  Decompressing,
  Ready,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ContentProgress {
  status: ContentStatus,
  name: String,
  bytes_downloaded: u64,
  total_bytes: u64,
  item_index: usize,
  total_items: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentResult {
  installed: usize,
  skipped: usize,
  /// Entries whose host serves a different build than the server runs. They
  /// were not installed; pass their keys back in `accept_mismatch` to install
  /// the host's copy anyway.
  mismatched: Vec<MismatchedEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MismatchedEntry {
  key: String,
  name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentPreview {
  /// The server answered with Deadworks content keys.
  advertised: bool,
  total_items: usize,
  pending_items: usize,
  /// Uncompressed size of the pending items the server gave a size for.
  pending_bytes: u64,
  /// The server's list did not fit one reply; only what is listed installs.
  truncated: bool,
  /// Content is pending but the server gave no usable download URL.
  missing_source: bool,
  /// Maps DMM did not install whose build differs from the server's.
  blocked_maps: Vec<String>,
}

struct Paths {
  cache_dir: PathBuf,
  mods_dir: PathBuf,
  maps_dir: PathBuf,
  addons_dir: PathBuf,
}

impl Paths {
  fn new() -> Result<Self, Error> {
    let citadel = game_path()?.join("game").join("citadel");
    Ok(Self {
      cache_dir: citadel.join("deadworks_cache"),
      mods_dir: citadel.join("deadworks_mods"),
      maps_dir: citadel.join("maps"),
      addons_dir: citadel.join("deadworks_addons").join("vpks"),
    })
  }

  fn dest(&self, entry: &ContentEntry) -> PathBuf {
    let dir = match entry.kind {
      ContentKind::Addon => &self.addons_dir,
      ContentKind::Map => &self.maps_dir,
    };
    dir.join(format!("{}.vpk", entry.name))
  }
}

fn load_state(cache_dir: &Path) -> ContentState {
  if let Some(state) = std::fs::read(cache_dir.join(STATE_FILE))
    .ok()
    .and_then(|bytes| serde_json::from_slice(&bytes).ok())
  {
    return state;
  }
  let owned_maps = std::fs::read(cache_dir.join(LEGACY_STATE_FILE))
    .ok()
    .and_then(|bytes| serde_json::from_slice::<LegacyState>(&bytes).ok())
    .map(|legacy| {
      legacy
        .managed
        .keys()
        .filter_map(|key| key.strip_prefix("map:").map(str::to_string))
        .collect()
    })
    .unwrap_or_default();
  ContentState {
    owned_maps,
    ..ContentState::default()
  }
}

fn save_state(cache_dir: &Path, state: &ContentState) -> Result<(), Error> {
  std::fs::create_dir_all(cache_dir)?;
  let bytes = serde_json::to_vec_pretty(state)
    .map_err(|e| Error::FileWriteFailed(format!("Could not serialize the content state: {e}")))?;
  std::fs::write(cache_dir.join(STATE_FILE), bytes)?;
  Ok(())
}

fn hash_prefix(path: &Path) -> Result<String, Error> {
  Ok(file_sha256_hex(path)?[..16].to_string())
}

fn modified_ms(meta: &std::fs::Metadata) -> u64 {
  meta
    .modified()
    .ok()
    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
    .map_or(0, |d| d.as_millis() as u64)
}

/// Whether the installed file matches the advertised size and hash prefix.
fn is_current(state: &mut ContentState, entry: &ContentEntry, dest: &Path) -> Result<bool, Error> {
  let Ok(meta) = std::fs::metadata(dest) else {
    return Ok(false);
  };
  if entry.size.is_some_and(|size| size != meta.len()) {
    return Ok(false);
  }
  let key = entry.key();
  let modified = modified_ms(&meta);
  let cached = state
    .hashes
    .get(&key)
    .filter(|r| r.len == meta.len() && r.modified_ms == modified)
    .map(|r| r.sha16.clone());
  let sha16 = match cached {
    Some(sha16) => sha16,
    None => {
      let sha16 = hash_prefix(dest)?;
      state.hashes.insert(
        key,
        HashRecord {
          len: meta.len(),
          modified_ms: modified,
          sha16: sha16.clone(),
        },
      );
      sha16
    }
  };
  Ok(sha16 == entry.hash)
}

/// A map already on disk that DMM did not put there must never be replaced.
fn is_blocked_map(state: &ContentState, entry: &ContentEntry, dest: &Path) -> bool {
  entry.kind == ContentKind::Map && dest.exists() && !state.owned_maps.contains(&entry.name)
}

fn display_name(entry: &ContentEntry) -> String {
  match entry.kind {
    ContentKind::Map => format!("Map: {}", entry.name),
    ContentKind::Addon => entry.name.clone(),
  }
}

async fn resolve_server(address: &str) -> Result<SocketAddr, Error> {
  tokio::net::lookup_host(address)
    .await
    .map_err(|e| Error::Network(format!("Could not resolve {address}: {e}")))?
    .next()
    .ok_or_else(|| Error::Network(format!("{address} did not resolve")))
}

/// Ask the server what it needs. A silent server advertises nothing.
async fn read_advertisement(server: SocketAddr) -> Result<Option<Advertisement>, Error> {
  Ok(
    query_rules(server)
      .await?
      .as_ref()
      .and_then(parse_advertisement),
  )
}

fn emit(app: &AppHandle, progress: ContentProgress) {
  if let Err(error) = app.emit(PROGRESS_EVENT, progress) {
    log::warn!("Failed to emit Deadworks content progress: {error}");
  }
}

fn content_url(
  base: &reqwest::Url,
  entry: &ContentEntry,
  ext: &str,
) -> Result<reqwest::Url, Error> {
  let base = base.as_str().trim_end_matches('/');
  reqwest::Url::parse(&format!(
    "{base}/{}/{}_{}.vpk.{ext}",
    entry.kind.dir(),
    entry.name,
    entry.hash
  ))
  .map_err(|e| Error::InvalidInput(format!("Invalid content URL: {e}")))
}

/// Count what a join would download, without writing any content.
#[tauri::command]
pub async fn preview_deadworks_content(address: String) -> Result<ContentPreview, Error> {
  let server = resolve_server(&address).await?;
  let Some(ad) = read_advertisement(server).await? else {
    return Ok(ContentPreview {
      advertised: false,
      total_items: 0,
      pending_items: 0,
      pending_bytes: 0,
      truncated: false,
      missing_source: false,
      blocked_maps: Vec::new(),
    });
  };

  let paths = Paths::new()?;
  tokio::task::spawn_blocking(move || {
    let mut state = load_state(&paths.cache_dir);
    let mut pending_items = 0;
    let mut pending_bytes = 0;
    let mut blocked_maps = Vec::new();
    for entry in &ad.entries {
      let dest = paths.dest(entry);
      if is_current(&mut state, entry, &dest)? {
        continue;
      }
      if is_blocked_map(&state, entry, &dest) {
        blocked_maps.push(entry.name.clone());
        continue;
      }
      pending_items += 1;
      pending_bytes += entry.size.unwrap_or(0);
    }
    if let Err(error) = save_state(&paths.cache_dir, &state) {
      log::warn!("Could not save the Deadworks hash cache: {error}");
    }
    Ok(ContentPreview {
      advertised: true,
      total_items: ad.entries.len(),
      pending_items,
      pending_bytes,
      truncated: ad.truncated,
      missing_source: pending_items > 0 && ad.fastdl.is_none(),
      blocked_maps,
    })
  })
  .await
  .map_err(|e| Error::BackgroundTaskFailed(format!("Content check failed: {e}")))?
}

/// Install everything the Deadworks server at `address` advertises.
///
/// The list is re-read from the server rather than taken from the caller.
/// Files whose host serves a different build are reported, not installed,
/// unless their key is in `accept_mismatch`; those still pass the size caps
/// and VPK check but are not recorded as the advertised build, so the next
/// join checks them again.
#[tauri::command]
pub async fn download_deadworks_content(
  app: AppHandle,
  address: String,
  accept_mismatch: Vec<String>,
  guard_permit: Option<String>,
) -> Result<ContentResult, Error> {
  crate::game_guard::ensure_game_idle_locked(
    "download_deadworks_content",
    guard_permit.as_deref(),
  )?;
  let paths = Paths::new()?;
  let cache_dir = paths.cache_dir.clone();
  let mut state = load_state(&cache_dir);

  // Every Deadworks server needs the UI bootstrap, whatever it advertises.
  let bootstrap_progress = |status, bytes_downloaded, total_bytes| ContentProgress {
    status,
    name: "Deadworks UI".to_string(),
    bytes_downloaded,
    total_bytes,
    item_index: 0,
    total_items: 1,
  };
  let bootstrap_version = ensure_bootstrap(
    &paths.mods_dir,
    &cache_dir,
    state.bootstrap_version,
    |received, declared: Option<u64>| {
      emit(
        &app,
        bootstrap_progress(ContentStatus::Downloading, received, declared.unwrap_or(0)),
      );
    },
  )
  .await?;
  if bootstrap_version != state.bootstrap_version {
    state.bootstrap_version = bootstrap_version;
    save_state(&cache_dir, &state)?;
  }

  let server = resolve_server(&address).await?;
  let Some(ad) = read_advertisement(server).await? else {
    return Ok(ContentResult {
      installed: 0,
      skipped: 0,
      mismatched: Vec::new(),
    });
  };
  if ad.truncated {
    log::warn!("{address} advertises more content than fits one reply; installing what is listed");
  }
  // The game server's own LAN is the one place private hosts are expected.
  let allow_private = !is_public_target(&server);

  std::fs::create_dir_all(&paths.maps_dir)?;
  std::fs::create_dir_all(&paths.addons_dir)?;

  let total = ad.entries.len();
  let mut budget = MAX_JOIN_BYTES;
  let mut installed = 0;
  let mut skipped = 0;
  let mut mismatched = Vec::new();

  for (index, entry) in ad.entries.iter().enumerate() {
    let dest = paths.dest(entry);
    let name = display_name(entry);
    let progress = |status, bytes_downloaded, total_bytes| ContentProgress {
      status,
      name: name.clone(),
      bytes_downloaded,
      total_bytes,
      item_index: index,
      total_items: total,
    };
    emit(&app, progress(ContentStatus::Checking, 0, 0));

    if is_current(&mut state, entry, &dest)? {
      skipped += 1;
      emit(&app, progress(ContentStatus::Ready, 0, 0));
      continue;
    }
    if is_blocked_map(&state, entry, &dest) {
      log::warn!(
        "Not replacing {}: DMM did not install it and its build differs from the server's",
        dest.display()
      );
      skipped += 1;
      continue;
    }
    let Some(fastdl) = ad.fastdl.as_ref() else {
      return Err(Error::Network(format!(
        "The server needs {name} but gives no download URL"
      )));
    };

    std::fs::create_dir_all(&cache_dir)?;
    let compressed = cache_dir.join(format!("{}_{}.download", entry.kind.dir(), entry.name));
    let mut fetched = Fetched::Missing;
    for ext in ["zst", "bz2"] {
      let on_progress = |received, declared: Option<u64>| {
        emit(
          &app,
          progress(ContentStatus::Downloading, received, declared.unwrap_or(0)),
        );
      };
      fetched = fetch_to_file(
        content_url(fastdl, entry, ext)?,
        &compressed,
        allow_private,
        MAX_FILE_BYTES.min(budget),
        on_progress,
      )
      .await
      .inspect_err(|_| {
        let _ = std::fs::remove_file(&compressed);
      })?;
      if matches!(fetched, Fetched::Saved) {
        break;
      }
    }
    if matches!(fetched, Fetched::Missing) {
      return Err(Error::Network(format!(
        "The server's download host does not have {name}"
      )));
    }
    let compressed_len = std::fs::metadata(&compressed)?.len();
    budget = budget.saturating_sub(compressed_len);

    // The download is complete, so the bar holds full while unpacking.
    emit(
      &app,
      progress(ContentStatus::Decompressing, compressed_len, compressed_len),
    );
    let part = dest.with_extension("vpk.part");
    let decode_limit = MAX_FILE_BYTES.min(budget);
    let (compressed_path, part_path) = (compressed.clone(), part.clone());
    let decoded =
      tokio::task::spawn_blocking(move || decode_vpk(&compressed_path, &part_path, decode_limit))
        .await
        .map_err(|e| Error::BackgroundTaskFailed(format!("Decompression task failed: {e}")))?;
    let _ = std::fs::remove_file(&compressed);
    let decoded = decoded.inspect_err(|_| {
      let _ = std::fs::remove_file(&part);
    })?;
    budget = budget.saturating_sub(decoded.size);

    let actual = decoded.sha256_hex();
    let matches_build =
      entry.size.is_none_or(|size| size == decoded.size) && actual.starts_with(&entry.hash);
    if !matches_build && !accept_mismatch.contains(&entry.key()) {
      let _ = std::fs::remove_file(&part);
      mismatched.push(MismatchedEntry {
        key: entry.key(),
        name: name.clone(),
      });
      continue;
    }

    std::fs::rename(&part, &dest).inspect_err(|_| {
      let _ = std::fs::remove_file(&part);
    })?;
    let meta = std::fs::metadata(&dest)?;
    state.hashes.insert(
      entry.key(),
      HashRecord {
        len: meta.len(),
        modified_ms: modified_ms(&meta),
        sha16: actual[..16].to_string(),
      },
    );
    if entry.kind == ContentKind::Map {
      state.owned_maps.insert(entry.name.clone());
    }
    save_state(&cache_dir, &state)?;
    installed += 1;
    emit(
      &app,
      progress(ContentStatus::Ready, decoded.size, decoded.size),
    );
  }

  save_state(&cache_dir, &state)?;
  log::info!(
    "Deadworks content for {address}: {installed} installed, {skipped} current, {} mismatched",
    mismatched.len()
  );
  Ok(ContentResult {
    installed,
    skipped,
    mismatched,
  })
}

#[cfg(test)]
mod tests {
  use sha2::{Digest, Sha256};

  use super::*;

  fn entry(kind: ContentKind, name: &str, data: &[u8]) -> ContentEntry {
    let hash: String = Sha256::digest(data)[..8]
      .iter()
      .map(|b| format!("{b:02x}"))
      .collect();
    ContentEntry {
      kind,
      name: name.to_string(),
      hash,
      size: Some(data.len() as u64),
    }
  }

  #[test]
  fn current_check_compares_size_then_hash_prefix() {
    let dir = tempfile::tempdir().expect("temp dir");
    let dest = dir.path().join("turbo.vpk");
    let mut state = ContentState::default();
    let wanted = entry(ContentKind::Addon, "turbo", b"build-a");

    assert!(!is_current(&mut state, &wanted, &dest).unwrap());
    std::fs::write(&dest, b"build-a").unwrap();
    assert!(is_current(&mut state, &wanted, &dest).unwrap());

    std::fs::write(&dest, b"build-b").unwrap();
    state.hashes.clear();
    assert!(!is_current(&mut state, &wanted, &dest).unwrap());
  }

  #[test]
  fn only_maps_dmm_installed_may_be_replaced() {
    let dir = tempfile::tempdir().expect("temp dir");
    let dest = dir.path().join("dl_midtown.vpk");
    std::fs::write(&dest, b"stock").unwrap();
    let mut state = ContentState::default();
    let map = entry(ContentKind::Map, "dl_midtown", b"other build");

    assert!(is_blocked_map(&state, &map, &dest));
    state.owned_maps.insert("dl_midtown".into());
    assert!(!is_blocked_map(&state, &map, &dest));
    assert!(!is_blocked_map(
      &ContentState::default(),
      &entry(ContentKind::Addon, "dl_midtown", b"x"),
      &dest
    ));
  }

  #[test]
  fn maps_from_the_old_manifest_cache_stay_owned() {
    let dir = tempfile::tempdir().expect("temp dir");
    std::fs::write(
      dir.path().join(LEGACY_STATE_FILE),
      br#"{"managed":{"map:bhop_asko":3,"addon:mog":1}}"#,
    )
    .unwrap();
    let state = load_state(dir.path());
    assert_eq!(
      state.owned_maps.into_iter().collect::<Vec<_>>(),
      vec!["bhop_asko".to_string()]
    );
  }

  #[test]
  fn content_urls_follow_the_fastdl_layout() {
    let base = reqwest::Url::parse("https://dl.example.com/deadworks").unwrap();
    let addon = ContentEntry {
      kind: ContentKind::Addon,
      name: "turbo".into(),
      hash: "9330149c74886724".into(),
      size: None,
    };
    assert_eq!(
      content_url(&base, &addon, "zst").unwrap().as_str(),
      "https://dl.example.com/deadworks/addons/turbo_9330149c74886724.vpk.zst"
    );
  }
}
