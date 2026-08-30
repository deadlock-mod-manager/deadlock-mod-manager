use crate::app_runtime::AppHandle;
use crate::download_manager::{DownloadFileDto, DownloadManager, DownloadStatus, DownloadTask};
use crate::errors::Error;
use crate::mod_manager::ModFileTree;
use futures::future::join_all;
use serde::{Deserialize, Serialize};
use std::time::Instant;
use tauri::Manager;
use tauri::State;

use super::mods::InstalledModInfo;
use super::server_profiles::validate_addons_subfolder;
use super::state::{DOWNLOAD_MANAGER, MANAGER, game_path};

pub(crate) async fn get_download_manager(app_handle: AppHandle) -> &'static DownloadManager {
  DOWNLOAD_MANAGER
    .get_or_init(|| async { DownloadManager::new(app_handle) })
    .await
}

#[tauri::command]
pub async fn queue_download(
  app_handle: AppHandle,
  catalog_state: State<'_, super::gamebanana_catalog::GameBananaCatalogState>,
  mod_id: String,
  files: Vec<DownloadFileDto>,
  profile_folder: Option<String>,
  fileserver_preference: Option<String>,
  _is_map: bool,
) -> Result<(), Error> {
  log::info!(
    "Received download request for mod: {mod_id} with {} files (profile: {profile_folder:?})",
    files.len()
  );

  crate::providers::SubmissionRef::parse_slug(&mod_id)
    .map_err(|_| Error::InvalidInput("Invalid download identity".to_string()))?;
  if files.is_empty() || files.len() > 100 {
    return Err(Error::InvalidInput(
      "A download must contain between 1 and 100 files".to_string(),
    ));
  }

  let mut resolved_files = Vec::with_capacity(files.len());
  for file in files {
    let resolved = if file.url.starts_with("gamebanana-file://") {
      resolve_gamebanana_file(&catalog_state, &file.url, fileserver_preference.as_deref()).await?
    } else {
      validate_download_file_name(&file.name)?;
      crate::download_manager::downloader::validate_download_url(&file.url)?;
      file
    };
    resolved_files.push(resolved);
  }

  let app_local_data_dir = app_handle
    .path()
    .app_local_data_dir()
    .map_err(Error::Tauri)?;

  let target_dir = app_local_data_dir.join("mods").join(&mod_id);

  let task = DownloadTask {
    mod_id,
    files: resolved_files,
    target_dir,
    profile_folder,
    is_profile_import: false,
    file_tree: None,
  };

  let manager = get_download_manager(app_handle).await;
  manager.queue_download(task).await
}

async fn resolve_gamebanana_file(
  state: &State<'_, super::gamebanana_catalog::GameBananaCatalogState>,
  token: &str,
  fileserver_preference: Option<&str>,
) -> Result<DownloadFileDto, Error> {
  let parsed = reqwest::Url::parse(token)
    .map_err(|_| Error::InvalidInput("Invalid GameBanana file token".to_string()))?;
  if parsed.scheme() != "gamebanana-file"
    || parsed.query().is_some()
    || parsed.fragment().is_some()
    || !parsed.username().is_empty()
    || parsed.password().is_some()
  {
    return Err(Error::InvalidInput(
      "Invalid GameBanana file token".to_string(),
    ));
  }
  let slug = parsed
    .host_str()
    .ok_or_else(|| Error::InvalidInput("GameBanana file token has no submission".to_string()))?;
  let segments = parsed
    .path_segments()
    .map(Iterator::collect::<Vec<_>>)
    .ok_or_else(|| Error::InvalidInput("GameBanana file token has no file".to_string()))?;
  let [file_id] = segments.as_slice() else {
    return Err(Error::InvalidInput(
      "Invalid GameBanana file token".to_string(),
    ));
  };
  if file_id.is_empty() {
    return Err(Error::InvalidInput(
      "GameBanana file token has no file".to_string(),
    ));
  }
  let submission = crate::providers::SubmissionRef::parse_slug(slug)
    .map_err(|_| Error::InvalidInput("Invalid GameBanana submission".to_string()))?;
  let file_id = file_id
    .parse::<u64>()
    .map_err(|_| Error::InvalidInput("Invalid GameBanana file identity".to_string()))?;
  let page = state
    .backend()?
    .client
    .download_page(&submission, &tokio_util::sync::CancellationToken::new())
    .await?;
  if page.is_trashed || page.is_withheld {
    return Err(Error::ProviderInvalidResponse(
      "GameBanana files are not publicly available".to_string(),
    ));
  }
  let file = page
    .files
    .into_iter()
    .find(|candidate| candidate.id == file_id)
    .ok_or_else(|| Error::ProviderInvalidResponse("GameBanana file was not found".to_string()))?;
  validate_download_file_name(&file.name)?;
  let mut download_url = file.download_url;
  if let Some(preference) = fileserver_preference.filter(|value| *value != "default") {
    match state.backend()?.fileservers(false).await {
      Ok(servers) => {
        let selected = if preference == "auto" {
          servers
            .iter()
            .filter(|server| server.state == "up")
            .max_by_key(|server| {
              server
                .stats
                .as_ref()
                .map(|stats| stats.rate_bytes)
                .unwrap_or_default()
            })
        } else {
          servers
            .iter()
            .find(|server| server.id == preference && server.state != "terminated")
        };
        if let Some(server) = selected {
          let category = match submission.submission_type {
            crate::providers::SubmissionType::Mod => "mods",
            crate::providers::SubmissionType::Sound => "sounds",
          };
          download_url = format!(
            "https://{}/{}/{}",
            server.domain,
            category,
            urlencoding::encode(&file.name)
          );
        }
      }
      Err(error) => {
        log::warn!("GameBanana fileserver directory unavailable; using canonical URL: {error}");
      }
    }
  }
  crate::download_manager::downloader::validate_download_url(&download_url)?;
  Ok(DownloadFileDto {
    url: download_url,
    name: file.name,
    size: file.size,
    md5_checksum: file.md5,
  })
}

fn validate_download_file_name(file_name: &str) -> Result<(), Error> {
  if file_name.is_empty()
    || file_name.len() > 255
    || file_name.contains('/')
    || file_name.contains('\\')
    || file_name.contains("..")
    || file_name.chars().any(|character| {
      character.is_control() || matches!(character, '<' | '>' | ':' | '"' | '|' | '?' | '*')
    })
    || file_name.ends_with(['.', ' '])
  {
    return Err(Error::InvalidInput(
      "Invalid download file name".to_string(),
    ));
  }
  Ok(())
}

#[tauri::command]
pub async fn cancel_download(app_handle: AppHandle, mod_id: String) -> Result<(), Error> {
  let manager = get_download_manager(app_handle).await;
  manager.cancel_download(&mod_id).await
}

#[tauri::command]
pub async fn pause_download(app_handle: AppHandle, mod_id: String) -> Result<(), Error> {
  let manager = get_download_manager(app_handle).await;
  manager.pause_download(&mod_id).await
}

#[tauri::command]
pub async fn resume_download(app_handle: AppHandle, mod_id: String) -> Result<(), Error> {
  let manager = get_download_manager(app_handle).await;
  manager.resume_download(&mod_id).await
}

#[tauri::command]
pub async fn get_download_status(
  app_handle: AppHandle,
  mod_id: String,
) -> Result<Option<DownloadStatus>, Error> {
  let manager = get_download_manager(app_handle).await;
  manager.get_download_status(&mod_id).await
}

#[tauri::command]
pub async fn get_all_downloads(app_handle: AppHandle) -> Result<Vec<DownloadStatus>, Error> {
  let manager = get_download_manager(app_handle).await;
  manager.get_all_downloads().await
}

#[tauri::command]
pub async fn clear_download_cache() -> Result<u64, Error> {
  let mod_manager = MANAGER.lock().unwrap();
  mod_manager.clear_download_cache()
}

const SERVER_FOLDER_PREFIX: &str = "server_";
const CUSTOM_PROVIDER_MAX_BYTES: u64 = 512 * 1024 * 1024;
const CUSTOM_PROVIDER_ALLOWED_EXTS: &[&str] = &["vpk", "zip", "7z", "rar"];

fn validate_custom_file_name(file_name: &str) -> Result<(), Error> {
  if file_name.is_empty()
    || file_name.contains('/')
    || file_name.contains('\\')
    || file_name.contains("..")
  {
    return Err(Error::InvalidInput(
      "Invalid custom mod file name".to_string(),
    ));
  }

  let ext_ok = std::path::Path::new(file_name)
    .extension()
    .and_then(|e| e.to_str())
    .map(|e| {
      let lower = e.to_ascii_lowercase();
      CUSTOM_PROVIDER_ALLOWED_EXTS.contains(&lower.as_str())
    })
    .unwrap_or(false);

  if !ext_ok {
    return Err(Error::InvalidInput(format!(
      "Custom mod file must have one of these extensions: {}",
      CUSTOM_PROVIDER_ALLOWED_EXTS.join(", ")
    )));
  }

  Ok(())
}

/// Rejects anything that is not a public https endpoint, including hosts that
/// resolve to loopback/private/link-local addresses. Every command that
/// downloads from a caller- or manifest-supplied URL must go through this.
pub(crate) async fn validate_custom_provider_url(url_str: &str) -> Result<(), Error> {
  let parsed = reqwest::Url::parse(url_str)
    .map_err(|e| Error::InvalidInput(format!("Invalid custom provider URL: {e}")))?;

  if parsed.scheme() != "https" {
    return Err(Error::InvalidInput(
      "Custom provider URL must use https://".to_string(),
    ));
  }

  let host = parsed
    .host_str()
    .ok_or_else(|| Error::InvalidInput("Custom provider URL has no host".to_string()))?
    .to_string();
  let port = parsed.port_or_known_default().unwrap_or(443);

  let addrs: Vec<std::net::SocketAddr> = tokio::net::lookup_host((host.as_str(), port))
    .await
    .map_err(|e| Error::Network(format!("Failed to resolve {host}: {e}")))?
    .collect();

  if addrs.is_empty() {
    return Err(Error::Network(format!(
      "Custom provider host {host} did not resolve"
    )));
  }

  for addr in &addrs {
    let ip = addr.ip();
    let is_blocked = match ip {
      std::net::IpAddr::V4(v4) => {
        v4.is_loopback()
          || v4.is_private()
          || v4.is_link_local()
          || v4.is_broadcast()
          || v4.is_multicast()
          || v4.is_unspecified()
          || v4.is_documentation()
      }
      std::net::IpAddr::V6(v6) => {
        v6.is_loopback() || v6.is_multicast() || v6.is_unspecified() || v6.is_unique_local()
      }
    };
    if is_blocked {
      return Err(Error::UnauthorizedPath(format!(
        "Refusing to download from non-public address {ip}"
      )));
    }
  }

  Ok(())
}

#[tauri::command]
pub async fn download_custom_provider_mod(
  server_folder: String,
  url: String,
  file_name: String,
) -> Result<(), Error> {
  log::info!("Downloading custom provider mod into {server_folder}: {file_name} from {url}");

  if !server_folder.starts_with(SERVER_FOLDER_PREFIX) {
    return Err(Error::InvalidInput(format!(
      "Expected server folder name with '{SERVER_FOLDER_PREFIX}' prefix, got: {server_folder}"
    )));
  }
  validate_addons_subfolder(&server_folder)?;
  validate_custom_file_name(&file_name)?;
  validate_custom_provider_url(&url).await?;

  let addons_path = game_path()?.join("game").join("citadel").join("addons");
  let folder_path = addons_path.join(&server_folder);
  std::fs::create_dir_all(&folder_path)?;

  let target_path = folder_path.join(&file_name);

  let addons_canonical = addons_path
    .canonicalize()
    .map_err(|_| Error::UnauthorizedPath("Unable to resolve addons directory".to_string()))?;
  let folder_canonical = folder_path
    .canonicalize()
    .map_err(|_| Error::UnauthorizedPath("Unable to resolve server folder".to_string()))?;

  if !folder_canonical.starts_with(&addons_canonical) {
    return Err(Error::UnauthorizedPath(
      "Server folder must be within addons directory".to_string(),
    ));
  }

  let cancel_token = tokio_util::sync::CancellationToken::new();
  crate::download_manager::downloader::download_file_with_limit(
    &url,
    &target_path,
    |_progress| {},
    cancel_token,
    Some(CUSTOM_PROVIDER_MAX_BYTES),
  )
  .await?;

  log::info!("Custom provider mod downloaded to: {target_path:?}");
  Ok(())
}

#[cfg(debug_assertions)]
#[tauri::command]
pub async fn debug_queue_local_zip(
  app_handle: AppHandle,
  mod_id: String,
  zip_path: String,
) -> Result<(), Error> {
  use super::fonts::get_validated_mod_folder_path;

  let path = std::path::Path::new(&zip_path);
  if !path.exists() {
    return Err(Error::Io(std::io::Error::new(
      std::io::ErrorKind::NotFound,
      format!("zip not found: {zip_path}"),
    )));
  }

  let size = std::fs::metadata(path)?.len();
  let file_name = path
    .file_name()
    .and_then(|n| n.to_str())
    .unwrap_or("mod.zip")
    .to_string();

  let target_dir = get_validated_mod_folder_path(&mod_id)?;
  std::fs::create_dir_all(&target_dir)?;

  let dest = target_dir.join(&file_name);
  std::fs::copy(path, &dest)?;

  let task = DownloadTask {
    mod_id,
    files: vec![DownloadFileDto {
      url: String::new(),
      name: file_name,
      size,
      md5_checksum: None,
    }],
    target_dir,
    profile_folder: None,
    is_profile_import: false,
    file_tree: None,
  };

  DownloadManager::process_local_file(task, dest, app_handle).await
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileserverLatencyRequest {
  pub id: String,
  pub test_url: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileserverLatencyResult {
  pub id: String,
  pub latency_ms: Option<u64>,
  pub reachable: bool,
}

#[tauri::command]
pub async fn test_fileserver_latency(
  servers: Vec<FileserverLatencyRequest>,
) -> Result<Vec<FileserverLatencyResult>, Error> {
  let client = crate::proxy::build_http_client(|b| {
    b.timeout(std::time::Duration::from_secs(5))
      .redirect(reqwest::redirect::Policy::none())
  })?;

  let futures_iter = servers.into_iter().map(|req| {
    let c = client.clone();
    async move { test_one_fileserver(&c, req).await }
  });

  Ok(join_all(futures_iter).await)
}

async fn test_one_fileserver(
  client: &reqwest::Client,
  req: FileserverLatencyRequest,
) -> FileserverLatencyResult {
  if crate::download_manager::downloader::validate_download_url(&req.test_url).is_err() {
    return FileserverLatencyResult {
      id: req.id,
      latency_ms: None,
      reachable: false,
    };
  }
  let start = Instant::now();
  match client.head(&req.test_url).send().await {
    Ok(_response) => FileserverLatencyResult {
      id: req.id,
      latency_ms: Some(start.elapsed().as_millis() as u64),
      reachable: true,
    },
    Err(_) => FileserverLatencyResult {
      id: req.id,
      latency_ms: None,
      reachable: false,
    },
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileImportMod {
  pub mod_id: String,
  pub mod_name: String,
  pub download_files: Vec<DownloadFileDto>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub file_tree: Option<ModFileTree>,
  #[serde(default)]
  pub is_map: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileImportProgressEvent {
  pub current_step: String,
  pub current_mod_index: usize,
  pub total_mods: usize,
  pub current_mod_name: String,
  pub overall_progress: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileImportResult {
  pub profile_folder: String,
  pub succeeded: Vec<String>,
  pub failed: Vec<(String, String)>,
  pub installed_mods: Vec<InstalledModInfo>,
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn validate_custom_file_name_accepts_known_extensions() {
    for ext in &["vpk", "zip", "7z", "rar", "VPK", "Zip"] {
      let name = format!("modfile.{ext}");
      assert!(
        validate_custom_file_name(&name).is_ok(),
        "should accept {name}"
      );
    }
  }

  #[test]
  fn validate_custom_file_name_rejects_unknown_extension() {
    assert!(validate_custom_file_name("modfile.exe").is_err());
    assert!(validate_custom_file_name("modfile.html").is_err());
    assert!(validate_custom_file_name("modfile").is_err());
  }

  #[test]
  fn validate_custom_file_name_rejects_traversal_or_separators() {
    assert!(validate_custom_file_name("../foo.vpk").is_err());
    assert!(validate_custom_file_name("foo/bar.vpk").is_err());
    assert!(validate_custom_file_name("foo\\bar.vpk").is_err());
    assert!(validate_custom_file_name("").is_err());
  }

  #[test]
  fn validate_download_file_name_rejects_cross_platform_unsafe_names() {
    assert!(validate_download_file_name("archive.zip").is_ok());
    for name in [
      "../archive.zip",
      "folder/archive.zip",
      "folder\\archive.zip",
      "drive:archive.zip",
      "archive?.zip",
      "archive.zip ",
      "",
    ] {
      assert!(
        validate_download_file_name(name).is_err(),
        "accepted {name:?}"
      );
    }
  }
}
