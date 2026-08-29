use std::path::{Path, PathBuf};

use crate::errors::Error;
use crate::mod_manager::archive_extractor::ArchiveExtractor;
use crate::mod_manager::file_tree::ModFileTree;
use crate::mod_manager::filesystem_helper::FileSystemHelper;
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use tokio::io::AsyncWriteExt;
use vpkmanager::ops;
use vpkmanager::ops::PrefixedVpkCopyStatus;

use super::mods::resolve_addons_path;
use super::state::MANAGER;

const ALLOWED_DOWNLOAD_HOSTS: &[&str] = &["gamebanana.com", "deadlockmods.app"];

fn sanitize_archive_name(name: &str) -> Result<String, Error> {
  if name.is_empty() {
    return Err(Error::InvalidInput(
      "Archive name cannot be empty".to_string(),
    ));
  }
  if name.contains('/') || name.contains('\\') || name.contains("..") {
    return Err(Error::InvalidInput(format!(
      "Archive name contains path separators or parent components: {name}"
    )));
  }
  let path = std::path::Path::new(name);
  match path.file_name().and_then(|f| f.to_str()) {
    Some(f) if f == name => Ok(f.to_string()),
    _ => Err(Error::InvalidInput(format!("Invalid archive name: {name}"))),
  }
}

fn is_allowed_download_host(host: &str) -> bool {
  ALLOWED_DOWNLOAD_HOSTS
    .iter()
    .any(|allowed| host == *allowed || host.ends_with(&format!(".{allowed}")))
}

fn validate_download_url(url: &str) -> Result<(), Error> {
  let parsed = reqwest::Url::parse(url)
    .map_err(|e| Error::InvalidInput(format!("Invalid download URL: {e}")))?;
  validate_download_parsed(&parsed)
}

fn validate_download_parsed(parsed: &reqwest::Url) -> Result<(), Error> {
  match parsed.scheme() {
    "http" | "https" => {}
    scheme => {
      return Err(Error::InvalidInput(format!(
        "Download URL scheme must be http or https, got: {scheme}"
      )));
    }
  }

  let host = parsed
    .host_str()
    .ok_or_else(|| Error::InvalidInput(format!("Download URL has no host: {parsed}")))?;

  if !is_allowed_download_host(host) {
    return Err(Error::InvalidInput(format!(
      "Download URL host not in allowlist: {host}"
    )));
  }

  Ok(())
}

fn download_http_client() -> Result<reqwest::Client, Error> {
  reqwest::Client::builder()
    .redirect(reqwest::redirect::Policy::custom(
      |attempt| match validate_download_parsed(attempt.url()) {
        Ok(()) => attempt.follow(),
        Err(_) => attempt.error("redirect target host is not in the download allowlist"),
      },
    ))
    .build()
    .map_err(|e| Error::Network(format!("Failed to build HTTP client: {e}")))
}

async fn write_response_body(
  response: reqwest::Response,
  path: &Path,
  url: &str,
) -> Result<(), Error> {
  let mut file = tokio::fs::File::create(path)
    .await
    .map_err(|e| Error::DownloadFailed(format!("Failed to create {}: {e}", path.display())))?;
  let mut stream = response.bytes_stream();
  while let Some(chunk) = stream.next().await {
    let chunk =
      chunk.map_err(|e| Error::DownloadFailed(format!("Failed reading body for {url}: {e}")))?;
    file
      .write_all(&chunk)
      .await
      .map_err(|e| Error::DownloadFailed(format!("Failed writing {}: {e}", path.display())))?;
  }
  file
    .flush()
    .await
    .map_err(|e| Error::DownloadFailed(format!("Failed flushing {}: {e}", path.display())))?;
  Ok(())
}

fn vpk_original_names(vpk_files: &[(PathBuf, u64)]) -> Vec<String> {
  vpk_files
    .iter()
    .filter_map(|(path, _)| {
      path
        .file_name()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string())
    })
    .collect()
}

fn sync_profile(profile_folder: Option<&str>) {
  MANAGER.lock().unwrap().sync_after_change(profile_folder);
}

#[derive(Debug, Clone, Deserialize)]
pub struct MissingVariantArchive {
  pub url: String,
  pub archive_name: String,
  pub wanted_originals: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FetchMissingModVariantsResult {
  pub staged_originals: Vec<String>,
  pub skipped_originals: Vec<String>,
  pub missing_originals: Vec<String>,
}

#[tauri::command]
pub async fn fetch_missing_mod_variants(
  mod_id: String,
  profile_folder: Option<String>,
  archives: Vec<MissingVariantArchive>,
) -> Result<FetchMissingModVariantsResult, Error> {
  use std::collections::HashSet;

  log::info!(
    "Fetching missing mod variants for {mod_id} (profile: {profile_folder:?}, {} archives)",
    archives.len()
  );

  let addons_path = resolve_addons_path(profile_folder.as_deref())?;

  if !addons_path.exists() {
    return Err(Error::GamePathNotSet);
  }

  let prefix = format!("{mod_id}_");

  let existing_disabled: HashSet<String> = ops::find_prefixed_vpks(&addons_path, &mod_id)?
    .into_iter()
    .filter_map(|n| n.strip_prefix(&prefix).map(|s| s.to_string()))
    .collect();

  let mut staged: Vec<String> = Vec::new();
  let mut skipped: Vec<String> = Vec::new();
  let mut missing: Vec<String> = Vec::new();

  let client = download_http_client()?;

  for archive in archives {
    let to_fetch: Vec<String> = archive
      .wanted_originals
      .iter()
      .filter(|name| !existing_disabled.contains(*name) && !staged.contains(name))
      .cloned()
      .collect();

    for name in &archive.wanted_originals {
      if existing_disabled.contains(name) || staged.contains(name) {
        skipped.push(name.clone());
      }
    }

    if to_fetch.is_empty() {
      log::info!(
        "Archive {} has no missing originals to fetch (all already staged)",
        archive.archive_name
      );
      continue;
    }

    validate_download_url(&archive.url)?;
    let safe_archive_name = sanitize_archive_name(&archive.archive_name)?;

    log::info!(
      "Downloading archive {} from {} for {} missing originals",
      safe_archive_name,
      archive.url,
      to_fetch.len()
    );

    let response = client
      .get(&archive.url)
      .send()
      .await
      .map_err(|e| Error::Network(format!("Failed to fetch {}: {e}", archive.url)))?;

    if !response.status().is_success() {
      return Err(Error::DownloadFailed(format!(
        "{} returned status {}",
        archive.url,
        response.status()
      )));
    }

    let temp_dir = tempfile::tempdir()?;
    let archive_path = temp_dir.path().join(&safe_archive_name);
    write_response_body(response, &archive_path, &archive.url).await?;

    let extract_dir = temp_dir.path().join("extracted");

    let extractor = ArchiveExtractor::new();
    extractor.extract_archive(&archive_path, &extract_dir)?;

    for copy in ops::copy_named_vpks_with_prefix(&extract_dir, &addons_path, &mod_id, &to_fetch)? {
      match copy.status {
        PrefixedVpkCopyStatus::Copied => {
          log::info!(
            "Staged missing VPK {} -> {}",
            copy.original_name,
            copy.prefixed_name
          );
          staged.push(copy.original_name);
        }
        PrefixedVpkCopyStatus::AlreadyExists => {
          log::info!("Skipping already-staged VPK: {}", copy.original_name);
          skipped.push(copy.original_name);
        }
        PrefixedVpkCopyStatus::MissingSource => {
          log::warn!(
            "Requested VPK {} not found in archive {}",
            copy.original_name,
            archive.archive_name
          );
          missing.push(copy.original_name);
        }
      }
    }
  }

  sync_profile(profile_folder.as_deref());

  Ok(FetchMissingModVariantsResult {
    staged_originals: staged,
    skipped_originals: skipped,
    missing_originals: missing,
  })
}

#[derive(Debug, Clone, Serialize)]
pub struct StageDownloadArchiveResult {
  pub staged_originals: Vec<String>,
}

#[tauri::command]
pub async fn stage_download_archive(
  mod_id: String,
  profile_folder: Option<String>,
  archive_url: String,
  archive_name: String,
) -> Result<StageDownloadArchiveResult, Error> {
  log::info!("Staging download archive for {mod_id} (profile: {profile_folder:?}): {archive_name}");

  let addons_path = resolve_addons_path(profile_folder.as_deref())?;

  if !addons_path.exists() {
    return Err(Error::GamePathNotSet);
  }

  validate_download_url(&archive_url)?;
  let safe_archive_name = sanitize_archive_name(&archive_name)?;

  let client = download_http_client()?;

  let response = client
    .get(&archive_url)
    .send()
    .await
    .map_err(|e| Error::Network(format!("Failed to fetch {}: {e}", archive_url)))?;

  if !response.status().is_success() {
    return Err(Error::DownloadFailed(format!(
      "{} returned status {}",
      archive_url,
      response.status()
    )));
  }

  let temp_dir = tempfile::tempdir()?;
  let archive_path = temp_dir.path().join(&safe_archive_name);
  write_response_body(response, &archive_path, &archive_url).await?;

  let extract_dir = temp_dir.path().join("extracted");

  let extractor = ArchiveExtractor::new();
  extractor.extract_archive(&archive_path, &extract_dir)?;

  let filesystem = FileSystemHelper::new();
  let vpk_files = filesystem.find_files_recursive(&extract_dir, "vpk")?;

  if vpk_files.is_empty() {
    return Err(Error::InvalidInput(format!(
      "No VPK files found in archive {safe_archive_name}"
    )));
  }

  let mut staged: Vec<String> = Vec::new();

  let originals = vpk_original_names(&vpk_files);

  for copy in ops::copy_named_vpks_with_prefix(&extract_dir, &addons_path, &mod_id, &originals)? {
    match copy.status {
      PrefixedVpkCopyStatus::Copied => {
        log::info!(
          "Staged VPK {} -> {}",
          copy.original_name,
          copy.prefixed_name
        );
        staged.push(copy.original_name);
      }
      PrefixedVpkCopyStatus::AlreadyExists => {
        log::info!("Skipping already-staged VPK: {}", copy.original_name);
        staged.push(copy.original_name);
      }
      PrefixedVpkCopyStatus::MissingSource => {
        log::warn!(
          "Skipping VPK missing from extracted archive: {}",
          copy.original_name
        );
      }
    }
  }

  log::info!(
    "Staged {} VPK(s) from archive {archive_name}: {:?}",
    staged.len(),
    staged
  );

  sync_profile(profile_folder.as_deref());

  Ok(StageDownloadArchiveResult {
    staged_originals: staged,
  })
}

#[derive(Debug, Clone, Serialize)]
pub struct SwitchDownloadVariantResult {
  pub installed_vpks: Vec<String>,
  pub original_vpk_names: Vec<String>,
  pub file_tree: ModFileTree,
}

#[tauri::command]
pub async fn switch_mod_download_variant(
  mod_id: String,
  profile_folder: Option<String>,
  archive_url: String,
  archive_name: String,
  current_installed_vpks: Vec<String>,
  current_original_names: Vec<String>,
) -> Result<SwitchDownloadVariantResult, Error> {
  log::info!(
    "Switching download variant for {mod_id} (profile: {profile_folder:?}) to archive {archive_name}"
  );

  let addons_path = resolve_addons_path(profile_folder.as_deref())?;

  if !addons_path.exists() {
    return Err(Error::GamePathNotSet);
  }

  validate_download_url(&archive_url)?;
  let safe_archive_name = sanitize_archive_name(&archive_name)?;

  log::info!(
    "Downloading archive {} from {}",
    safe_archive_name,
    archive_url
  );

  let client = download_http_client()?;

  let response = client
    .get(&archive_url)
    .send()
    .await
    .map_err(|e| Error::Network(format!("Failed to fetch {}: {e}", archive_url)))?;

  if !response.status().is_success() {
    return Err(Error::DownloadFailed(format!(
      "{} returned status {}",
      archive_url,
      response.status()
    )));
  }

  let temp_dir = tempfile::tempdir()?;
  let archive_path = temp_dir.path().join(&safe_archive_name);
  write_response_body(response, &archive_path, &archive_url).await?;

  let extract_dir = temp_dir.path().join("extracted");

  let extractor = ArchiveExtractor::new();
  extractor.extract_archive(&archive_path, &extract_dir)?;

  let filesystem = FileSystemHelper::new();
  let vpk_files = filesystem.find_files_recursive(&extract_dir, "vpk")?;

  let new_originals = vpk_original_names(&vpk_files);

  if new_originals.is_empty() {
    return Err(Error::InvalidInput(format!(
      "No VPK files found in archive {safe_archive_name}"
    )));
  }
  let mut unique_originals = std::collections::HashSet::new();
  if new_originals
    .iter()
    .any(|name| !unique_originals.insert(name.as_str()))
  {
    return Err(Error::InvalidInput(format!(
      "Archive {safe_archive_name} contains duplicate VPK filenames"
    )));
  }

  log::info!(
    "Found {} VPK(s) in archive: {:?}",
    new_originals.len(),
    new_originals
  );

  let staging_dir = tempfile::tempdir()?;
  for original in &new_originals {
    if let Some(src) = vpk_files.iter().find_map(|(path, _)| {
      path
        .file_name()
        .and_then(|s| s.to_str())
        .filter(|s| *s == original.as_str())
        .map(|_| path)
    }) {
      filesystem.copy_file(src, &staging_dir.path().join(original))?;
    }
  }

  let pending = ops::stage_copy_vpks_with_prefix(staging_dir.path(), &addons_path, &mod_id, None)?;
  log::info!(
    "Staged {} variant VPK(s): {:?}",
    pending.value().len(),
    pending.value()
  );

  let variant_result = match MANAGER.lock().unwrap().apply_variant_selection(
    &mod_id,
    profile_folder.clone(),
    &current_installed_vpks,
    &current_original_names,
    new_originals,
  ) {
    Ok(result) => result,
    Err(error) => return Err(pending.rollback(error)),
  };
  pending.commit();
  sync_profile(profile_folder.as_deref());

  log::info!(
    "Variant switch complete: {} VPKs enabled as {:?}",
    variant_result.installed_vpks.len(),
    variant_result.installed_vpks
  );

  Ok(SwitchDownloadVariantResult {
    installed_vpks: variant_result.installed_vpks,
    original_vpk_names: variant_result.original_vpk_names,
    file_tree: variant_result.file_tree,
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn download_url_allows_gamebanana_and_subdomains() {
    assert!(validate_download_url("https://gamebanana.com/dl/123").is_ok());
    assert!(validate_download_url("https://files.gamebanana.com/mod.zip").is_ok());
    assert!(validate_download_url("https://deadlockmods.app/file.zip").is_ok());
  }

  #[test]
  fn download_url_rejects_other_hosts_and_schemes() {
    assert!(validate_download_url("https://evil.example/x").is_err());
    assert!(validate_download_url("file:///tmp/x").is_err());
    assert!(validate_download_url("https://notgamebanana.com/x").is_err());
  }
}
