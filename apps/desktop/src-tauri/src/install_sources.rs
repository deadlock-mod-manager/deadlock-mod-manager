//! 1-click installs from allowlisted mod sites other than GameBanana.
//!
//! A site links `deadlock-mod-manager://install?source=<id>&mod=<id>&release=<id>`.
//! The link carries IDs, never URLs: the manifest address comes from the
//! source's entry below, and the file may only come from that source's
//! download hosts. The file downloaded is the one in the manifest the user
//! confirmed, its size and SHA-256 are checked before anything is installed,
//! and the mod is added as a local mod.

use crate::deep_link::parse_query_params;
use crate::download_manager::downloader::{PauseHandle, download_file_resumable};
use crate::errors::Error;
use crate::staged_files::{self, Stager};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tokio_util::sync::CancellationToken;
use ts_rs::TS;

pub const PATH_INSTALL: &str = "//install";

const MANIFEST_FORMAT: &str = "dmm-one-click";
const MANIFEST_VERSION: u32 = 1;

/// A manifest is a few hundred bytes; anything near this is not one.
const MAX_MANIFEST_BYTES: usize = 64 * 1024;

/// Same ceiling as staged GameBanana archives.
const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024 * 1024;

const MAX_ID_LEN: usize = 64;
const MAX_PENDING: usize = 10;
const MAX_TEXT_LEN: usize = 120;

const INSTALLABLE_EXTENSIONS: &[&str] = &["zip", "7z", "rar", "vpk"];

struct InstallSource {
  id: &'static str,
  name: &'static str,
  /// `{mod}` and `{release}` become the link's IDs, which are URL-safe.
  manifest_url: &'static str,
  /// JSON pointer to the manifest within the response; empty for the root.
  manifest_pointer: &'static str,
  /// Exact hosts, never subdomains, for the mod page link.
  site_hosts: &'static [&'static str],
  /// Hosts for the cover image.
  media_hosts: &'static [&'static str],
  /// Hosts for the mod file itself.
  download_hosts: &'static [&'static str],
}

const SOURCES: &[InstallSource] = &[InstallSource {
  id: "divineskins",
  name: "Divine Skins",
  manifest_url: "https://api.divineskins.gg/api/v1/mods/{mod}/versions/{release}/dmm",
  manifest_pointer: "/data",
  site_hosts: &["divineskins.gg", "www.divineskins.gg"],
  media_hosts: &["lol-assets.divine-cdn.com", "images.divine-cdn.com"],
  download_hosts: &["lol-mods.divine-cdn.com"],
}];

/// A link whose source is allowlisted and whose IDs are URL-safe.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct InstallLink {
  pub source: String,
  pub source_name: String,
  pub mod_id: String,
  pub release_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
  format: String,
  version: u32,
  mod_id: String,
  release_id: String,
  name: String,
  author: Option<String>,
  page_url: String,
  image_url: Option<String>,
  file: ManifestFile,
}

#[derive(Deserialize)]
struct ManifestFile {
  name: String,
  url: String,
  size: u64,
  sha256: String,
}

/// A manifest that passed validation. The download URL and hash stay in Rust.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct SourceInstall {
  pub source_name: String,
  pub name: String,
  pub author: Option<String>,
  pub page_url: String,
  pub image_url: Option<String>,
  pub file_name: String,
  #[ts(type = "number")]
  pub size: u64,
  #[serde(skip)]
  download_url: String,
  #[serde(skip)]
  sha256: String,
}

/// Links waiting for the window. A link that starts the app arrives before the
/// window listens, so links wait here and the event only says to look.
static PENDING: Mutex<Vec<InstallLink>> = Mutex::new(Vec::new());

/// Manifests shown to the user, newest last, so the download uses the one
/// they confirmed instead of fetching it again.
static RESOLVED: Mutex<Vec<(InstallLink, SourceInstall)>> = Mutex::new(Vec::new());

fn find_source(id: &str) -> Option<&'static InstallSource> {
  SOURCES.iter().find(|source| source.id == id)
}

fn is_valid_id(id: &str) -> bool {
  (1..=MAX_ID_LEN).contains(&id.len())
    && id
      .bytes()
      .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

/// Applies the same checks to IDs from the renderer as to IDs from a link.
pub fn install_link(source: &str, mod_id: &str, release_id: &str) -> Option<InstallLink> {
  let source = find_source(source)?;
  (is_valid_id(mod_id) && is_valid_id(release_id)).then(|| InstallLink {
    source: source.id.to_string(),
    source_name: source.name.to_string(),
    mod_id: mod_id.to_string(),
    release_id: release_id.to_string(),
  })
}

/// Parses the part after the scheme. Windows may add a slash before the query
/// or after it.
pub fn parse_install_link(data_part: &str) -> Option<InstallLink> {
  let rest = data_part.strip_prefix(PATH_INSTALL)?;
  let query = rest
    .strip_prefix('/')
    .unwrap_or(rest)
    .strip_prefix('?')?
    .trim_end_matches('/');
  let params = parse_query_params(query);

  install_link(
    params.get("source")?,
    params.get("mod")?,
    params.get("release")?,
  )
}

/// Queues a link for the window, returning false when it was dropped as a
/// repeat of a waiting link or because the queue is full.
pub fn queue_pending(link: InstallLink) -> bool {
  let Ok(mut pending) = PENDING.lock() else {
    return false;
  };
  if pending.contains(&link) || pending.len() >= MAX_PENDING {
    return false;
  }
  pending.push(link);
  true
}

pub fn take_pending() -> Vec<InstallLink> {
  PENDING
    .lock()
    .map(|mut pending| std::mem::take(&mut *pending))
    .unwrap_or_default()
}

fn manifest_url(source: &InstallSource, link: &InstallLink) -> String {
  source
    .manifest_url
    .replace("{mod}", &link.mod_id)
    .replace("{release}", &link.release_id)
}

/// Plain HTTPS on one of `hosts`: no credentials and no custom port.
fn is_https_url_on(raw: &str, hosts: &[&str]) -> bool {
  let Ok(url) = reqwest::Url::parse(raw) else {
    return false;
  };
  url.scheme() == "https"
    && url.username().is_empty()
    && url.password().is_none()
    && url.port().is_none()
    && url.host_str().is_some_and(|host| hosts.contains(&host))
}

fn has_installable_extension(file_name: &str) -> bool {
  Path::new(file_name)
    .extension()
    .and_then(|extension| extension.to_str())
    .is_some_and(|extension| {
      INSTALLABLE_EXTENSIONS
        .iter()
        .any(|allowed| extension.eq_ignore_ascii_case(allowed))
    })
}

/// Drops control characters and caps the length; `None` when nothing is left.
fn clean_text(raw: &str) -> Option<String> {
  let cleaned: String = raw.chars().filter(|c| !c.is_control()).collect();
  let trimmed = cleaned.trim();
  (!trimmed.is_empty()).then(|| trimmed.chars().take(MAX_TEXT_LEN).collect())
}

fn validate_manifest(
  source: &InstallSource,
  link: &InstallLink,
  manifest: Manifest,
) -> Result<SourceInstall, Error> {
  let invalid = |reason: &str| {
    Error::InvalidInput(format!(
      "{} sent an invalid install manifest: {reason}",
      source.name
    ))
  };

  if manifest.format != MANIFEST_FORMAT || manifest.version != MANIFEST_VERSION {
    return Err(invalid("unsupported format"));
  }
  // A manifest for another mod would install something the user never chose.
  if manifest.mod_id != link.mod_id || manifest.release_id != link.release_id {
    return Err(invalid("it describes a different mod"));
  }
  let name = clean_text(&manifest.name).ok_or_else(|| invalid("missing name"))?;
  if !is_https_url_on(&manifest.page_url, source.site_hosts) {
    return Err(invalid("the page link is not on the source's site"));
  }

  let file = manifest.file;
  crate::commands::downloads::validate_download_file_name(&file.name)
    .map_err(|_| invalid("unsafe file name"))?;
  if !has_installable_extension(&file.name) {
    return Err(invalid("unsupported file type"));
  }
  if !is_https_url_on(&file.url, source.download_hosts) {
    return Err(invalid("the file is not on the source's download host"));
  }
  if file.size == 0 || file.size > MAX_FILE_BYTES {
    return Err(invalid("file size out of range"));
  }
  if file.sha256.len() != 64 || !file.sha256.bytes().all(|byte| byte.is_ascii_hexdigit()) {
    return Err(invalid("missing SHA-256"));
  }

  Ok(SourceInstall {
    source_name: source.name.to_string(),
    name,
    author: manifest.author.as_deref().and_then(clean_text),
    page_url: manifest.page_url,
    // The image is decoration: one hosted elsewhere is dropped, not fatal.
    image_url: manifest
      .image_url
      .filter(|url| is_https_url_on(url, source.media_hosts)),
    file_name: file.name,
    size: file.size,
    download_url: file.url,
    sha256: file.sha256.to_ascii_lowercase(),
  })
}

async fn fetch_manifest(source: &InstallSource, link: &InstallLink) -> Result<Manifest, Error> {
  let client = crate::proxy::build_http_client(|builder| {
    builder
      .connect_timeout(Duration::from_secs(10))
      .timeout(Duration::from_secs(30))
      .redirect(reqwest::redirect::Policy::none())
      .user_agent(concat!("DMM/", env!("CARGO_PKG_VERSION")))
  })?;

  let mut response = client
    .get(manifest_url(source, link))
    .header(reqwest::header::ACCEPT, "application/json")
    .send()
    .await
    .map_err(|e| Error::Network(format!("Could not reach {}: {e}", source.name)))?;

  let status = response.status();
  if !status.is_success() {
    return Err(Error::Network(format!(
      "{} answered {status} for this mod",
      source.name
    )));
  }

  let too_large = || {
    Error::InvalidInput(format!(
      "{}'s install manifest exceeds {MAX_MANIFEST_BYTES} bytes",
      source.name
    ))
  };
  if response
    .content_length()
    .is_some_and(|length| length > MAX_MANIFEST_BYTES as u64)
  {
    return Err(too_large());
  }

  let mut body = Vec::new();
  while let Some(chunk) = response.chunk().await.map_err(|e| {
    Error::Network(format!(
      "Failed to read {}'s install manifest: {e}",
      source.name
    ))
  })? {
    if body.len() + chunk.len() > MAX_MANIFEST_BYTES {
      return Err(too_large());
    }
    body.extend_from_slice(&chunk);
  }

  parse_manifest(source, &body)
}

fn parse_manifest(source: &InstallSource, body: &[u8]) -> Result<Manifest, Error> {
  let invalid = |e: serde_json::Error| {
    Error::InvalidInput(format!(
      "{} sent an invalid install manifest: {e}",
      source.name
    ))
  };

  let mut document: serde_json::Value = serde_json::from_slice(body).map_err(invalid)?;
  let manifest = document
    .pointer_mut(source.manifest_pointer)
    .map(serde_json::Value::take)
    .ok_or_else(|| {
      Error::InvalidInput(format!(
        "{}'s response holds no install manifest",
        source.name
      ))
    })?;
  serde_json::from_value(manifest).map_err(invalid)
}

pub async fn resolve(link: &InstallLink) -> Result<SourceInstall, Error> {
  let source = find_source(&link.source)
    .ok_or_else(|| Error::InvalidInput("Unknown install source".to_string()))?;
  let manifest = fetch_manifest(source, link).await?;
  let install = validate_manifest(source, link, manifest)?;
  remember_resolved(link, &install);
  Ok(install)
}

/// Replaces an earlier resolve of the same link. A declined link is never
/// taken, so the oldest give way past the cap.
fn remember_resolved(link: &InstallLink, install: &SourceInstall) {
  if let Ok(mut resolved) = RESOLVED.lock() {
    resolved.retain(|(known, _)| known != link);
    if resolved.len() >= MAX_PENDING {
      resolved.remove(0);
    }
    resolved.push((link.clone(), install.clone()));
  }
}

/// The manifest the user was shown for `link`, consumed.
pub fn take_resolved(link: &InstallLink) -> Result<SourceInstall, Error> {
  let mut resolved = RESOLVED
    .lock()
    .map_err(|_| Error::InvalidInput("Install state is poisoned".to_string()))?;
  let index = resolved
    .iter()
    .position(|(known, _)| known == link)
    .ok_or_else(|| Error::InvalidInput("This install was not confirmed".to_string()))?;
  Ok(resolved.remove(index).1)
}

async fn verify_file(path: &Path, size: u64, sha256: &str) -> Result<(), Error> {
  let path = path.to_path_buf();
  let expected = sha256.to_string();

  tokio::task::spawn_blocking(move || -> Result<(), Error> {
    let mut file = std::fs::File::open(&path)?;
    if file.metadata()?.len() != size {
      return Err(Error::DownloadFailed(
        "The downloaded file's size does not match the source".to_string(),
      ));
    }
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher)?;
    if hex::encode(hasher.finalize()) != expected {
      return Err(Error::DownloadFailed(
        "The downloaded file does not match the source's SHA-256".to_string(),
      ));
    }
    Ok(())
  })
  .await
  .map_err(|e| Error::InvalidInput(format!("Could not check the downloaded file: {e}")))?
}

/// Downloads into a fresh temporary folder and verifies size and hash. Only a
/// verified file is listed as staged; anything else is deleted.
pub async fn download<F>(install: &SourceInstall, on_progress: F) -> Result<PathBuf, Error>
where
  F: Fn(u64, Option<u64>) + Send + 'static,
{
  let dir = tempfile::Builder::new()
    .prefix("dmm-source-install-")
    .tempdir()?
    .keep();
  let path = dir.join(&install.file_name);

  let result = async {
    download_file_resumable(
      &install.download_url,
      &path,
      install.size,
      move |progress| on_progress(progress.downloaded, progress.total),
      CancellationToken::new(),
      PauseHandle::new(),
      Some(install.size),
      None,
      // The URL was checked against the source's hosts. With this off the
      // downloader refuses redirects, so it cannot leave them.
      false,
    )
    .await?;
    verify_file(&path, install.size, &install.sha256).await
  }
  .await;

  if let Err(error) = result {
    let _ = tokio::fs::remove_dir_all(&dir).await;
    return Err(error);
  }

  staged_files::remember(Stager::Source, &path);
  Ok(path)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::deep_link::strip_scheme;

  const SHA: &str = "fcfe4bdeb53cf44dcdd5966e1a4538807ad17dccab80df76400f9397c114f6a5";

  fn divine() -> &'static InstallSource {
    find_source("divineskins").expect("Divine Skins is allowlisted")
  }

  fn link() -> InstallLink {
    install_link("divineskins", "123", "456").expect("valid link")
  }

  fn manifest() -> Manifest {
    Manifest {
      format: MANIFEST_FORMAT.to_string(),
      version: MANIFEST_VERSION,
      mod_id: "123".to_string(),
      release_id: "456".to_string(),
      name: "Abrams Ult Airhorn".to_string(),
      author: Some("someone".to_string()),
      page_url: "https://divineskins.gg/deadlock/abrams-ult-airhorn".to_string(),
      image_url: Some("https://lol-assets.divine-cdn.com/123/cover.webp".to_string()),
      file: ManifestFile {
        name: "abrams-ult-airhorn-1.0.zip".to_string(),
        url: "https://lol-mods.divine-cdn.com/123/7f1c.zip".to_string(),
        size: 1_667_455,
        sha256: SHA.to_uppercase(),
      },
    }
  }

  #[test]
  fn parses_the_link_a_site_sends() {
    // Sites hardcode this shape, so a change here breaks their buttons.
    let url = "deadlock-mod-manager://install?source=divineskins&mod=123&release=456";
    let parsed = parse_install_link(strip_scheme(url).expect("scheme should be recognised"));
    assert_eq!(parsed, Some(link()));
    assert_eq!(
      parsed.map(|link| link.source_name).as_deref(),
      Some("Divine Skins")
    );
  }

  #[test]
  fn tolerates_the_slashes_windows_adds() {
    for data_part in [
      "//install/?source=divineskins&mod=123&release=456",
      "//install?source=divineskins&mod=123&release=456/",
      "//install?release=456&mod=123&source=divineskins",
    ] {
      assert_eq!(parse_install_link(data_part), Some(link()), "{data_part}");
    }
  }

  #[test]
  fn rejects_unknown_sources_and_unsafe_ids() {
    for data_part in [
      "//install?source=evil&mod=123&release=456",
      "//install?source=divineskins&mod=..%2F123&release=456",
      "//install?source=divineskins&mod=123&release=4%3F6",
      "//install?source=divineskins&mod=&release=456",
      "//install?source=divineskins&mod=123",
      "//installer?source=divineskins&mod=123&release=456",
      "//install",
    ] {
      assert_eq!(parse_install_link(data_part), None, "{data_part}");
    }
    assert_eq!(install_link("divineskins", &"1".repeat(65), "456"), None);
  }

  #[test]
  fn builds_the_manifest_url_from_the_link() {
    assert_eq!(
      manifest_url(divine(), &link()),
      "https://api.divineskins.gg/api/v1/mods/123/versions/456/dmm"
    );
  }

  #[test]
  fn reads_the_manifest_from_the_source_envelope() {
    let body = br#"{"data": {
      "format": "dmm-one-click", "version": 1, "modId": "123", "releaseId": "456",
      "name": "Abrams Ult Airhorn", "author": null,
      "pageUrl": "https://divineskins.gg/deadlock/abrams-ult-airhorn", "imageUrl": null,
      "file": {"name": "a.zip", "url": "https://lol-mods.divine-cdn.com/123/a.zip",
        "size": 10, "sha256": "fcfe4bdeb53cf44dcdd5966e1a4538807ad17dccab80df76400f9397c114f6a5"}
    }}"#;
    let manifest = parse_manifest(divine(), body).expect("should parse");
    assert_eq!(manifest.release_id, "456");

    assert!(parse_manifest(divine(), br#"{"format": "dmm-one-click"}"#).is_err());
    assert!(parse_manifest(divine(), br#"{"data": {"modId": 123}}"#).is_err());
  }

  #[test]
  fn accepts_a_valid_manifest() {
    let install = validate_manifest(divine(), &link(), manifest()).expect("should be valid");
    assert_eq!(install.name, "Abrams Ult Airhorn");
    assert_eq!(install.file_name, "abrams-ult-airhorn-1.0.zip");
    assert_eq!(install.sha256, SHA);
    assert!(install.image_url.is_some());
  }

  #[test]
  fn rejects_a_manifest_for_another_mod() {
    let mut other = manifest();
    other.release_id = "457".to_string();
    assert!(validate_manifest(divine(), &link(), other).is_err());
  }

  #[test]
  fn only_downloads_from_the_source_hosts_over_plain_https() {
    for url in [
      "http://lol-mods.divine-cdn.com/123/7f1c.zip",
      "https://evil.example/123/7f1c.zip",
      "https://lol-mods.divine-cdn.com.evil.example/123/7f1c.zip",
      "https://cdn.lol-mods.divine-cdn.com/123/7f1c.zip",
      "https://user:pass@lol-mods.divine-cdn.com/123/7f1c.zip",
      "https://lol-mods.divine-cdn.com:8443/123/7f1c.zip",
    ] {
      let mut bad = manifest();
      bad.file.url = url.to_string();
      assert!(validate_manifest(divine(), &link(), bad).is_err(), "{url}");
    }
  }

  #[test]
  fn rejects_unsafe_or_unsupported_files() {
    for name in ["../mod.zip", "folder/mod.zip", "mod.exe", "mod", ""] {
      let mut bad = manifest();
      bad.file.name = name.to_string();
      assert!(
        validate_manifest(divine(), &link(), bad).is_err(),
        "{name:?}"
      );
    }
    for size in [0, MAX_FILE_BYTES + 1] {
      let mut bad = manifest();
      bad.file.size = size;
      assert!(validate_manifest(divine(), &link(), bad).is_err(), "{size}");
    }
    let not_hex = "g".repeat(64);
    for sha256 in ["", "abc", not_hex.as_str()] {
      let mut bad = manifest();
      bad.file.sha256 = sha256.to_string();
      assert!(
        validate_manifest(divine(), &link(), bad).is_err(),
        "{sha256}"
      );
    }
  }

  #[test]
  fn drops_an_image_hosted_elsewhere_but_requires_the_page_on_the_site() {
    let mut foreign_image = manifest();
    foreign_image.image_url = Some("https://tracker.example/pixel.png".to_string());
    let install = validate_manifest(divine(), &link(), foreign_image).expect("still valid");
    assert_eq!(install.image_url, None);

    let mut foreign_page = manifest();
    foreign_page.page_url = "https://evil.example/mod".to_string();
    assert!(validate_manifest(divine(), &link(), foreign_page).is_err());
  }

  #[test]
  fn cleans_names_from_the_manifest() {
    let mut messy = manifest();
    messy.name = "  Abrams\u{0007} Skin  ".to_string();
    messy.author = Some("   ".to_string());
    let install = validate_manifest(divine(), &link(), messy).expect("should be valid");
    assert_eq!(install.name, "Abrams Skin");
    assert_eq!(install.author, None);
  }

  #[tokio::test]
  async fn verifies_size_and_hash_of_the_download() {
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("mod.zip");
    std::fs::write(&path, b"mod bytes").expect("write");
    let sha256 = hex::encode(Sha256::digest(b"mod bytes"));

    assert!(verify_file(&path, 9, &sha256).await.is_ok());
    assert!(verify_file(&path, 10, &sha256).await.is_err());
    assert!(verify_file(&path, 9, SHA).await.is_err());
  }

  #[test]
  fn downloads_only_a_manifest_the_user_was_shown() {
    let shown = install_link("divineskins", "123", "999").expect("valid link");
    assert!(take_resolved(&shown).is_err());

    let install = validate_manifest(divine(), &link(), manifest()).expect("should be valid");
    remember_resolved(&shown, &install);
    assert_eq!(
      take_resolved(&shown).expect("resolved").file_name,
      install.file_name
    );
    assert!(take_resolved(&shown).is_err());
  }

  #[test]
  fn queues_links_until_the_window_takes_them() {
    assert!(queue_pending(link()));
    assert!(!queue_pending(link()));
    assert_eq!(take_pending(), vec![link()]);
    assert!(take_pending().is_empty());
  }
}
