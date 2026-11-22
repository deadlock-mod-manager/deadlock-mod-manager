//! The Deadworks UI bootstrap: one VPK the in-game UI needs that no server
//! advertises, so it comes from the Deadworks API instead.
//!
//! It is installed as `citadel/deadworks_mods/pak01_dir.vpk`, which the
//! `Game citadel/deadworks_mods` line DMM writes into `gameinfo.gi` mounts.
//! See <https://docs.deadworks.net/guides/content-discovery/>.

use std::path::Path;

use reqwest::{StatusCode, Url};
use serde::Deserialize;

use crate::errors::Error;

use super::deadworks_fetch::{Fetched, decode_vpk, fetch_to_file, file_sha256_hex};

const MANIFEST_URL: &str = "https://api.deadworks.net/api/bootstrap";
const BOOTSTRAP_FILE: &str = "pak01_dir.vpk";
const MAX_BOOTSTRAP_BYTES: u64 = 256 * 1024 * 1024;

#[derive(Deserialize)]
struct Manifest {
  version: u64,
  /// SHA-256 of the decompressed VPK.
  sha256: String,
  download_url: String,
  /// Oldest installed version allowed to join servers; 0 allows any.
  #[serde(default)]
  min_version: u64,
}

/// `None` when nothing is published (the endpoint answers 404).
async fn fetch_manifest() -> Result<Option<Manifest>, Error> {
  let client = crate::proxy::build_http_client(|b| b)?;
  let response = client
    .get(MANIFEST_URL)
    .send()
    .await
    .map_err(|e| Error::Network(format!("Bootstrap manifest request failed: {e}")))?;
  if response.status() == StatusCode::NOT_FOUND {
    return Ok(None);
  }
  let response = response
    .error_for_status()
    .map_err(|e| Error::Network(format!("Bootstrap manifest request failed: {e}")))?;
  let manifest = response
    .json()
    .await
    .map_err(|e| Error::Network(format!("Invalid bootstrap manifest: {e}")))?;
  Ok(Some(manifest))
}

/// The directory must hold no VPK but the bootstrap.
fn remove_stray_vpks(mods_dir: &Path) -> Result<(), Error> {
  for entry in std::fs::read_dir(mods_dir)? {
    let path = entry?.path();
    let is_stray = path.extension().is_some_and(|ext| ext == "vpk")
      && path.file_name().is_some_and(|name| name != BOOTSTRAP_FILE);
    if is_stray {
      log::info!("Removing {} from deadworks_mods", path.display());
      std::fs::remove_file(&path)?;
    }
  }
  Ok(())
}

async fn install(
  manifest: &Manifest,
  mods_dir: &Path,
  cache_dir: &Path,
  on_progress: impl Fn(u64, Option<u64>),
) -> Result<(), Error> {
  let url = Url::parse(&manifest.download_url)
    .map_err(|e| Error::InvalidInput(format!("Invalid bootstrap URL: {e}")))?;
  std::fs::create_dir_all(cache_dir)?;
  std::fs::create_dir_all(mods_dir)?;

  let compressed = cache_dir.join("bootstrap.download");
  let fetched = fetch_to_file(url, &compressed, false, MAX_BOOTSTRAP_BYTES, on_progress)
    .await
    .inspect_err(|_| {
      let _ = std::fs::remove_file(&compressed);
    })?;
  if matches!(fetched, Fetched::Missing) {
    return Err(Error::Network(
      "The Deadworks UI bootstrap is not available for download".to_string(),
    ));
  }

  let part = mods_dir.join(format!("{BOOTSTRAP_FILE}.part"));
  let (compressed_path, part_path) = (compressed.clone(), part.clone());
  let decoded = tokio::task::spawn_blocking(move || {
    decode_vpk(&compressed_path, &part_path, MAX_BOOTSTRAP_BYTES)
  })
  .await
  .map_err(|e| Error::BackgroundTaskFailed(format!("Decompression task failed: {e}")))?;
  let _ = std::fs::remove_file(&compressed);
  let decoded = decoded.inspect_err(|_| {
    let _ = std::fs::remove_file(&part);
  })?;

  if !decoded.sha256_hex().eq_ignore_ascii_case(&manifest.sha256) {
    let _ = std::fs::remove_file(&part);
    return Err(Error::ModInvalid(
      "The downloaded Deadworks UI bootstrap does not match its published hash".to_string(),
    ));
  }
  std::fs::rename(&part, mods_dir.join(BOOTSTRAP_FILE)).inspect_err(|_| {
    let _ = std::fs::remove_file(&part);
  })?;
  Ok(())
}

/// Make sure the latest published bootstrap is installed, and return the
/// version now on disk. The game must be closed: it keeps the file open.
///
/// An unreachable manifest keeps whatever is installed. A failed install only
/// fails the join when the installed version is older than the manifest allows.
pub async fn ensure_bootstrap(
  mods_dir: &Path,
  cache_dir: &Path,
  installed_version: Option<u64>,
  on_progress: impl Fn(u64, Option<u64>),
) -> Result<Option<u64>, Error> {
  let manifest = match fetch_manifest().await {
    Ok(Some(manifest)) => manifest,
    Ok(None) => return Ok(installed_version),
    Err(error) => {
      log::warn!("Could not check the Deadworks UI bootstrap: {error}");
      return Ok(installed_version);
    }
  };

  let dest = mods_dir.join(BOOTSTRAP_FILE);
  let on_disk = if dest.is_file() {
    let dest = dest.clone();
    tokio::task::spawn_blocking(move || file_sha256_hex(&dest))
      .await
      .map_err(|e| Error::BackgroundTaskFailed(format!("Bootstrap hash task failed: {e}")))??
  } else {
    String::new()
  };

  if !on_disk.eq_ignore_ascii_case(&manifest.sha256) {
    if let Err(error) = install(&manifest, mods_dir, cache_dir, on_progress).await {
      let usable =
        dest.is_file() && installed_version.is_some_and(|version| version >= manifest.min_version);
      if !usable {
        return Err(error);
      }
      log::warn!("Keeping the installed Deadworks UI bootstrap: {error}");
      return Ok(installed_version);
    }
    log::info!("Installed Deadworks UI bootstrap v{}", manifest.version);
  }
  remove_stray_vpks(mods_dir)?;
  Ok(Some(manifest.version))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn only_the_bootstrap_vpk_stays() {
    let dir = tempfile::tempdir().expect("temp dir");
    for name in [BOOTSTRAP_FILE, "pak01_000.vpk", "old.vpk", "notes.txt"] {
      std::fs::write(dir.path().join(name), b"x").unwrap();
    }
    remove_stray_vpks(dir.path()).unwrap();
    let mut left: Vec<String> = std::fs::read_dir(dir.path())
      .unwrap()
      .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
      .collect();
    left.sort();
    assert_eq!(left, vec!["notes.txt", BOOTSTRAP_FILE]);
  }
}
