//! Fetching the maps and addons a Deadworks server requires.
//!
//! Deadworks servers do not publish `required_mods` — their content lives
//! behind a per-server manifest (`/api/servers/{id}/content`) listing
//! bzip2-compressed VPKs. Without them the client connects and immediately
//! fails on a map it does not have, so we mirror what their launcher does:
//! maps land in `citadel/maps`, addons in the per-server addons folder DMM
//! already wires into `gameinfo.gi`.

use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tokio_util::sync::CancellationToken;

use crate::app_runtime::AppHandle;
use crate::download_manager::downloader::download_file_with_limit;
use crate::errors::Error;

use super::downloads::validate_custom_provider_url;
use super::server_profiles::{
  server_addons_folder_name, validate_addons_subfolder, validate_remote_server_id,
};
use super::state::game_path;

/// The registry is part of the integration, not caller-supplied data: accepting
/// a base URL from the frontend would turn this command into an arbitrary-URL
/// fetcher that writes into the game directory.
const REGISTRY_BASE: &str = "https://api.deadworks.net";
/// Hard cap on a single decompressed VPK, so a hostile manifest cannot fill
/// the disk with a bzip2 bomb.
const MAX_VPK_BYTES: u64 = 4 * 1024 * 1024 * 1024;
/// Cap on the compressed download itself, enforced by the downloader against
/// both the advertised `Content-Length` and the bytes actually received.
const MAX_COMPRESSED_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const VPK_MAGIC: [u8; 4] = [0x34, 0x12, 0xAA, 0x55];
const PROGRESS_EVENT: &str = "deadworks-content-progress";
const CACHE_FILE: &str = "dmm_content_versions.json";

#[derive(Deserialize, Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
enum ContentKind {
  Map,
  Addon,
}

#[derive(Deserialize)]
struct ManifestItem {
  filename: String,
  kind: ContentKind,
  version: u64,
  #[serde(default)]
  compressed_size: u64,
  download_url: String,
}

#[derive(Deserialize)]
struct ContentManifest {
  items: Vec<ManifestItem>,
}

#[derive(Serialize, Deserialize, Default)]
struct VersionCache {
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
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentPreview {
  total_items: usize,
  pending_items: usize,
  pending_bytes: u64,
  total_bytes: u64,
}

/// Manifest filenames become path components, so only a single bare name with
/// no reserved characters is allowed.
fn validate_filename(name: &str) -> Result<(), Error> {
  if name.is_empty() || name.len() > 128 || name == "." || name == ".." {
    return Err(Error::InvalidInput(format!("Invalid content name: {name}")));
  }
  if name.chars().any(|c| {
    matches!(
      c,
      '/' | '\\' | ':' | '\0' | '*' | '?' | '"' | '<' | '>' | '|'
    )
  }) {
    return Err(Error::InvalidInput(format!(
      "Content name contains a reserved character: {name}"
    )));
  }
  Ok(())
}

fn cache_path(citadel: &Path) -> PathBuf {
  citadel.join("deadworks_cache").join(CACHE_FILE)
}

fn cache_key(kind: ContentKind, filename: &str) -> String {
  match kind {
    ContentKind::Map => format!("map:{filename}"),
    ContentKind::Addon => format!("addon:{filename}"),
  }
}

fn load_cache(citadel: &Path) -> VersionCache {
  std::fs::read(cache_path(citadel))
    .ok()
    .and_then(|bytes| serde_json::from_slice(&bytes).ok())
    .unwrap_or_default()
}

fn save_cache(citadel: &Path, cache: &VersionCache) -> Result<(), Error> {
  let path = cache_path(citadel);
  if let Some(parent) = path.parent() {
    std::fs::create_dir_all(parent)?;
  }
  let bytes = serde_json::to_vec_pretty(cache)
    .map_err(|e| Error::FileWriteFailed(format!("Could not serialize the content cache: {e}")))?;
  std::fs::write(&path, bytes)?;
  Ok(())
}

fn emit(app: &AppHandle, progress: ContentProgress) {
  if let Err(error) = app.emit(PROGRESS_EVENT, progress) {
    log::warn!("Failed to emit Deadworks content progress: {error}");
  }
}

fn display_name(item: &ManifestItem) -> String {
  match item.kind {
    ContentKind::Map => format!("Map: {}", item.filename),
    ContentKind::Addon => item.filename.clone(),
  }
}

fn item_dest(maps_dir: &Path, addons_dir: &Path, item: &ManifestItem) -> PathBuf {
  match item.kind {
    ContentKind::Map => maps_dir.join(format!("{}.vpk", item.filename)),
    ContentKind::Addon => addons_dir.join(format!("{}.vpk", item.filename)),
  }
}

fn is_item_current(dest: &Path, cache: &VersionCache, item: &ManifestItem) -> bool {
  dest.exists() && cache.managed.get(&cache_key(item.kind, &item.filename)) == Some(&item.version)
}

async fn fetch_manifest(server_id: &str) -> Result<ContentManifest, Error> {
  let endpoint = format!("{REGISTRY_BASE}/api/servers/{server_id}/content");
  log::info!("Fetching Deadworks content manifest: {endpoint}");

  let client = crate::proxy::build_default_http_client()?;
  let response = client
    .get(&endpoint)
    .send()
    .await
    .map_err(|e| Error::Network(format!("Content manifest request failed: {e}")))?;
  if !response.status().is_success() {
    return Err(Error::Network(format!(
      "Content manifest returned HTTP {}",
      response.status()
    )));
  }
  response
    .json()
    .await
    .map_err(|e| Error::Network(format!("Could not parse the content manifest: {e}")))
}

async fn validate_manifest(manifest: &ContentManifest) -> Result<(), Error> {
  for item in &manifest.items {
    validate_filename(&item.filename)?;
    validate_custom_provider_url(&item.download_url).await?;
  }
  Ok(())
}

fn citadel_dirs(server_folder: &str) -> Result<(PathBuf, PathBuf, PathBuf), Error> {
  let game = game_path()?;
  let addons_dir = crate::mod_manager::profile_base_from_game(&game, Some(server_folder))?;
  let citadel = game.join("game").join("citadel");
  let maps_dir = citadel.join("maps");
  Ok((citadel, maps_dir, addons_dir.to_path_buf()))
}

fn verify_vpk_magic(path: &Path) -> Result<(), Error> {
  let mut file = std::fs::File::open(path)?;
  let mut magic = [0_u8; 4];
  file.read_exact(&mut magic)?;
  if magic != VPK_MAGIC {
    return Err(Error::ModInvalid(format!(
      "{} is not a valid VPK",
      path.display()
    )));
  }
  Ok(())
}

/// Decompress `compressed` into `dest`, staging through a `.part` file so an
/// interrupted run never leaves a truncated VPK where the engine can find it.
async fn decompress_into(compressed: &Path, dest: &Path) -> Result<(), Error> {
  let part = dest.with_extension("vpk.part");

  let source_path = compressed.to_path_buf();
  let part_path = part.clone();
  let result = tokio::task::spawn_blocking(move || -> Result<(), Error> {
    let source = std::fs::File::open(&source_path)?;
    let mut decoder = bzip2::read::BzDecoder::new(source).take(MAX_VPK_BYTES + 1);
    let mut out = std::fs::File::create(&part_path)?;
    let written = std::io::copy(&mut decoder, &mut out)?;
    if written > MAX_VPK_BYTES {
      return Err(Error::ModInvalid(
        "Decompressed content exceeds the size limit".to_string(),
      ));
    }
    Ok(())
  })
  .await
  .map_err(|e| Error::BackgroundTaskFailed(format!("Decompression task failed: {e}")))?;

  let _ = std::fs::remove_file(compressed);
  if let Err(error) = result {
    let _ = std::fs::remove_file(&part);
    return Err(error);
  }

  verify_vpk_magic(&part).inspect_err(|_| {
    let _ = std::fs::remove_file(&part);
  })?;

  std::fs::rename(&part, dest)?;
  Ok(())
}

/// Install everything a Deadworks server lists in its content manifest.
///
/// Maps go to `citadel/maps` (where the engine looks them up by name), addons
/// into the per-server addons folder that `apply_server_gameinfo` mounts.
/// Files already present at the manifest's version are left alone.
#[tauri::command]
pub async fn download_deadworks_content(
  app: AppHandle,
  server_id: String,
  server_folder: String,
) -> Result<ContentResult, Error> {
  let server_id = validate_remote_server_id(&server_id)?;
  validate_addons_subfolder(&server_folder)?;

  let manifest = fetch_manifest(&server_id).await?;
  if manifest.items.is_empty() {
    return Ok(ContentResult {
      installed: 0,
      skipped: 0,
    });
  }

  // Validate the whole manifest before touching the disk: a manifest that is
  // partly hostile should install none of it.
  validate_manifest(&manifest).await?;

  let (citadel, maps_dir, addons_dir) = citadel_dirs(&server_folder)?;
  std::fs::create_dir_all(&maps_dir)?;
  std::fs::create_dir_all(&addons_dir)?;

  let mut cache = load_cache(&citadel);
  let total = manifest.items.len();
  let mut installed = 0_usize;
  let mut skipped = 0_usize;

  for (index, item) in manifest.items.iter().enumerate() {
    let dest = item_dest(&maps_dir, &addons_dir, item);
    let name = display_name(item);
    let key = cache_key(item.kind, &item.filename);

    if is_item_current(&dest, &cache, item) {
      skipped += 1;
      emit(
        &app,
        ContentProgress {
          status: ContentStatus::Ready,
          name,
          bytes_downloaded: item.compressed_size,
          total_bytes: item.compressed_size,
          item_index: index,
          total_items: total,
        },
      );
      continue;
    }

    emit(
      &app,
      ContentProgress {
        status: ContentStatus::Checking,
        name: name.clone(),
        bytes_downloaded: 0,
        total_bytes: item.compressed_size,
        item_index: index,
        total_items: total,
      },
    );

    let compressed = dest.with_extension("vpk.bz2");
    let on_progress = {
      let app = app.clone();
      let name = name.clone();
      let total_bytes = item.compressed_size;
      move |progress: crate::download_manager::downloader::DownloadProgress| {
        emit(
          &app,
          ContentProgress {
            status: ContentStatus::Downloading,
            name: name.clone(),
            bytes_downloaded: progress.downloaded,
            total_bytes,
            item_index: index,
            total_items: total,
          },
        );
      }
    };

    download_file_with_limit(
      &item.download_url,
      &compressed,
      on_progress,
      CancellationToken::new(),
      Some(MAX_COMPRESSED_BYTES),
    )
    .await?;

    emit(
      &app,
      ContentProgress {
        status: ContentStatus::Decompressing,
        name: name.clone(),
        bytes_downloaded: 0,
        total_bytes: item.compressed_size,
        item_index: index,
        total_items: total,
      },
    );
    decompress_into(&compressed, &dest).await?;

    cache.managed.insert(key, item.version);
    save_cache(&citadel, &cache)?;
    installed += 1;

    emit(
      &app,
      ContentProgress {
        status: ContentStatus::Ready,
        name,
        bytes_downloaded: item.compressed_size,
        total_bytes: item.compressed_size,
        item_index: index,
        total_items: total,
      },
    );
  }

  log::info!("Deadworks content ready: {installed} installed, {skipped} already current");
  Ok(ContentResult { installed, skipped })
}

/// Count how many manifest items still need downloading, without writing
/// anything, so the join dialog can show the cost before the user confirms.
#[tauri::command]
pub async fn preview_deadworks_content(server_id: String) -> Result<ContentPreview, Error> {
  let server_id = validate_remote_server_id(&server_id)?;
  let server_folder = server_addons_folder_name(&server_id)?;

  let manifest = fetch_manifest(&server_id).await?;
  for item in &manifest.items {
    validate_filename(&item.filename)?;
  }

  let (citadel, maps_dir, addons_dir) = citadel_dirs(&server_folder)?;
  let cache = load_cache(&citadel);

  let mut pending_items = 0_usize;
  let mut pending_bytes = 0_u64;
  let mut total_bytes = 0_u64;

  for item in &manifest.items {
    total_bytes += item.compressed_size;
    let dest = item_dest(&maps_dir, &addons_dir, item);
    if is_item_current(&dest, &cache, item) {
      continue;
    }
    pending_items += 1;
    pending_bytes += item.compressed_size;
  }

  Ok(ContentPreview {
    total_items: manifest.items.len(),
    pending_items,
    pending_bytes,
    total_bytes,
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn rejects_filenames_that_escape_the_target_directory() {
    assert!(validate_filename("../../evil").is_err());
    assert!(validate_filename("maps/evil").is_err());
    assert!(validate_filename("").is_err());
    assert!(validate_filename("dl_midtown_custom").is_ok());
  }

  #[test]
  fn manifest_rejects_unknown_content_kinds() {
    let ok: Result<ManifestItem, _> = serde_json::from_str(
      r#"{"filename":"a","kind":"map","version":1,"download_url":"https://x/a.bz2"}"#,
    );
    assert!(ok.is_ok());

    let bad: Result<ManifestItem, _> = serde_json::from_str(
      r#"{"filename":"a","kind":"executable","version":1,"download_url":"https://x/a.bz2"}"#,
    );
    assert!(bad.is_err());
  }

  #[test]
  fn cache_keys_are_namespaced_by_kind() {
    assert_eq!(cache_key(ContentKind::Map, "dl_city"), "map:dl_city");
    assert_eq!(cache_key(ContentKind::Addon, "dl_city"), "addon:dl_city");
  }

  fn sample_item(filename: &str, version: u64) -> ManifestItem {
    ManifestItem {
      filename: filename.to_string(),
      kind: ContentKind::Map,
      version,
      compressed_size: 100,
      download_url: "https://example.invalid/a.bz2".to_string(),
    }
  }

  #[test]
  fn skip_check_requires_file_and_matching_version() {
    let dir = tempfile::tempdir().expect("temp dir");
    let dest = dir.path().join("bhop_asko.vpk");
    let item = sample_item("bhop_asko", 7);
    let mut cache = VersionCache::default();

    assert!(!is_item_current(&dest, &cache, &item));

    std::fs::write(&dest, b"x").expect("write dest");
    assert!(!is_item_current(&dest, &cache, &item));

    cache
      .managed
      .insert(cache_key(item.kind, &item.filename), 7);
    assert!(is_item_current(&dest, &cache, &item));

    cache
      .managed
      .insert(cache_key(item.kind, &item.filename), 8);
    assert!(!is_item_current(&dest, &cache, &item));
  }

  #[test]
  fn item_dest_puts_maps_and_addons_in_separate_folders() {
    let maps = PathBuf::from("citadel").join("maps");
    let addons = PathBuf::from("citadel").join("addons").join("server_abc");
    let map = sample_item("bhop_asko", 1);
    let mut addon = sample_item("mog_cosmetics", 1);
    addon.kind = ContentKind::Addon;

    assert_eq!(item_dest(&maps, &addons, &map), maps.join("bhop_asko.vpk"));
    assert_eq!(
      item_dest(&maps, &addons, &addon),
      addons.join("mog_cosmetics.vpk")
    );
  }
}
