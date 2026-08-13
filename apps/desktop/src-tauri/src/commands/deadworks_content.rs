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

use futures::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tokio::io::AsyncWriteExt;

use crate::app_runtime::AppHandle;
use crate::errors::Error;

use super::server_profiles::validate_addons_subfolder;
use super::state::MANAGER;

/// Hard cap on a single decompressed VPK, so a hostile manifest cannot fill
/// the disk with a bzip2 bomb.
const MAX_VPK_BYTES: u64 = 4 * 1024 * 1024 * 1024;
const VPK_MAGIC: [u8; 4] = [0x34, 0x12, 0xAA, 0x55];
const PROGRESS_EVENT: &str = "deadworks-content-progress";
const CACHE_FILE: &str = "dmm_content_versions.json";

#[derive(Deserialize)]
struct ManifestItem {
  filename: String,
  /// `map` or `addon`.
  kind: String,
  version: u64,
  #[serde(default)]
  compressed_size: u64,
  download_url: String,
}

#[derive(Deserialize)]
struct ContentManifest {
  items: Vec<ManifestItem>,
}

#[derive(Serialize, Deserialize, Clone)]
struct VersionEntry {
  kind: String,
  version: u64,
}

#[derive(Serialize, Deserialize, Default)]
struct VersionCache {
  #[serde(default)]
  managed: HashMap<String, VersionEntry>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ContentProgress {
  /// `checking` | `downloading` | `decompressing` | `ready`
  status: String,
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

fn require_https(url: &str, what: &str) -> Result<(), Error> {
  if !url.starts_with("https://") {
    return Err(Error::InvalidInput(format!("{what} must be https: {url}")));
  }
  Ok(())
}

fn game_path() -> Result<PathBuf, Error> {
  let manager = MANAGER
    .lock()
    .map_err(|_| Error::InvalidInput("Manager lock poisoned".to_string()))?;
  manager
    .get_steam_manager()
    .get_game_path()
    .cloned()
    .ok_or(Error::GamePathNotSet)
}

fn cache_path(citadel: &Path) -> PathBuf {
  citadel.join("deadworks_cache").join(CACHE_FILE)
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
    .map_err(|e| Error::InvalidInput(format!("Could not serialize the content cache: {e}")))?;
  std::fs::write(&path, bytes)?;
  Ok(())
}

fn emit(app: &AppHandle, progress: ContentProgress) {
  if let Err(error) = app.emit(PROGRESS_EVENT, progress) {
    log::warn!("Failed to emit Deadworks content progress: {error}");
  }
}

struct DownloadTask<'a> {
  url: &'a str,
  dest: &'a Path,
  name: &'a str,
  index: usize,
  total: usize,
  expected_size: u64,
}

/// Download `url` (a `.vpk.bz2`) and write the decompressed VPK to `dest`.
/// Goes through a `.part` file so an interrupted download never leaves a
/// truncated VPK where the engine can find it.
async fn download_and_decompress(
  app: &AppHandle,
  client: &reqwest::Client,
  item: DownloadTask<'_>,
) -> Result<(), Error> {
  let DownloadTask {
    url,
    dest,
    name,
    index,
    total,
    expected_size,
  } = item;
  require_https(url, "Content download URL")?;

  let part = dest.with_extension("vpk.part");
  let compressed = dest.with_extension("vpk.bz2.part");

  let response = client
    .get(url)
    .send()
    .await
    .map_err(|e| Error::InvalidInput(format!("Download failed for {name}: {e}")))?;
  if !response.status().is_success() {
    return Err(Error::InvalidInput(format!(
      "Download for {name} returned HTTP {}",
      response.status()
    )));
  }

  let total_bytes = response.content_length().unwrap_or(expected_size);
  let mut downloaded: u64 = 0;
  let mut file = tokio::fs::File::create(&compressed).await?;
  let mut stream = response.bytes_stream();

  while let Some(chunk) = stream.next().await {
    let chunk = chunk.map_err(|e| Error::InvalidInput(format!("Download failed: {e}")))?;
    downloaded += chunk.len() as u64;
    file.write_all(&chunk).await?;
    emit(
      app,
      ContentProgress {
        status: "downloading".to_string(),
        name: name.to_string(),
        bytes_downloaded: downloaded,
        total_bytes,
        item_index: index,
        total_items: total,
      },
    );
  }
  file.flush().await?;
  drop(file);

  emit(
    app,
    ContentProgress {
      status: "decompressing".to_string(),
      name: name.to_string(),
      bytes_downloaded: 0,
      total_bytes: downloaded,
      item_index: index,
      total_items: total,
    },
  );

  let compressed_path = compressed.clone();
  let part_path = part.clone();
  let decompressed = tokio::task::spawn_blocking(move || -> Result<(), Error> {
    let source = std::fs::File::open(&compressed_path)?;
    let mut decoder = bzip2::read::BzDecoder::new(source).take(MAX_VPK_BYTES + 1);
    let mut out = std::fs::File::create(&part_path)?;
    let written = std::io::copy(&mut decoder, &mut out)?;
    if written > MAX_VPK_BYTES {
      return Err(Error::InvalidInput(
        "Decompressed content exceeds the size limit".to_string(),
      ));
    }
    Ok(())
  })
  .await
  .map_err(|e| Error::InvalidInput(format!("Decompression task failed: {e}")))?;

  let _ = std::fs::remove_file(&compressed);
  if let Err(error) = decompressed {
    let _ = std::fs::remove_file(&part);
    return Err(error);
  }

  verify_vpk_magic(&part).inspect_err(|_| {
    let _ = std::fs::remove_file(&part);
  })?;

  std::fs::rename(&part, dest)?;
  Ok(())
}

fn verify_vpk_magic(path: &Path) -> Result<(), Error> {
  let mut file = std::fs::File::open(path)?;
  let mut magic = [0_u8; 4];
  file.read_exact(&mut magic)?;
  if magic != VPK_MAGIC {
    return Err(Error::InvalidInput(format!(
      "{} is not a valid VPK",
      path.display()
    )));
  }
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
  registry_url: String,
  server_id: String,
  server_folder: String,
) -> Result<ContentResult, Error> {
  require_https(&registry_url, "Registry URL")?;
  validate_addons_subfolder(&server_folder)?;

  let base = registry_url.trim_end_matches('/');
  let endpoint = format!("{base}/api/servers/{server_id}/content");
  log::info!("Fetching Deadworks content manifest: {endpoint}");

  let client = crate::proxy::build_default_http_client()?;
  let response = client
    .get(&endpoint)
    .send()
    .await
    .map_err(|e| Error::InvalidInput(format!("Content manifest request failed: {e}")))?;
  if !response.status().is_success() {
    return Err(Error::InvalidInput(format!(
      "Content manifest returned HTTP {}",
      response.status()
    )));
  }
  let manifest: ContentManifest = response
    .json()
    .await
    .map_err(|e| Error::InvalidInput(format!("Could not parse the content manifest: {e}")))?;

  for item in &manifest.items {
    validate_filename(&item.filename)?;
    require_https(&item.download_url, "Content download URL")?;
  }

  if manifest.items.is_empty() {
    return Ok(ContentResult {
      installed: 0,
      skipped: 0,
    });
  }

  let citadel = game_path()?.join("game").join("citadel");
  let maps_dir = citadel.join("maps");
  let addons_dir = citadel.join("addons").join(&server_folder);
  std::fs::create_dir_all(&maps_dir)?;
  std::fs::create_dir_all(&addons_dir)?;

  let mut cache = load_cache(&citadel);
  let total = manifest.items.len();
  let mut installed = 0_usize;
  let mut skipped = 0_usize;

  for (index, item) in manifest.items.iter().enumerate() {
    let target_dir = match item.kind.as_str() {
      "map" => &maps_dir,
      "addon" => &addons_dir,
      other => {
        return Err(Error::InvalidInput(format!(
          "Unknown content kind: {other}"
        )));
      }
    };
    let dest = target_dir.join(format!("{}.vpk", item.filename));
    let name = if item.kind == "map" {
      format!("Map: {}", item.filename)
    } else {
      item.filename.clone()
    };

    // The addons folder is recreated per stage, so a cache hit still has to
    // see the file itself before we skip the download.
    let cache_key = format!("{}:{}", item.kind, item.filename);
    let current = dest.exists()
      && cache
        .managed
        .get(&cache_key)
        .is_some_and(|entry| entry.version == item.version && entry.kind == item.kind);

    if current {
      skipped += 1;
      emit(
        &app,
        ContentProgress {
          status: "ready".to_string(),
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
        status: "checking".to_string(),
        name: name.clone(),
        bytes_downloaded: 0,
        total_bytes: item.compressed_size,
        item_index: index,
        total_items: total,
      },
    );

    download_and_decompress(
      &app,
      &client,
      DownloadTask {
        url: &item.download_url,
        dest: &dest,
        name: &name,
        index,
        total,
        expected_size: item.compressed_size,
      },
    )
    .await?;

    cache.managed.insert(
      cache_key,
      VersionEntry {
        kind: item.kind.clone(),
        version: item.version,
      },
    );
    save_cache(&citadel, &cache)?;
    installed += 1;

    emit(
      &app,
      ContentProgress {
        status: "ready".to_string(),
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
  fn rejects_plaintext_download_urls() {
    assert!(require_https("http://example.net/a.vpk.bz2", "url").is_err());
    assert!(require_https("https://example.net/a.vpk.bz2", "url").is_ok());
  }
}
