use std::collections::BTreeMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

use serde_json::{Value, json};
use tokio_util::sync::CancellationToken;
use vpk_parser::{VpkParseOptions, VpkParser};

use crate::download_manager::downloader::{PauseHandle, download_native_artifact};
use crate::mod_manager::archive_extractor::ArchiveExtractor;
use crate::mod_manager::file_tree::ModFileTree;
use crate::mod_manager::shard::ShardIndex;
use crate::mod_manager::vpk_manager::{MissingVpkPolicy, VpkManager};
use crate::mod_manager::vpk_manifest::ProfileVpkManifest;

use super::{NativeSourceManager, build_component_selection, listing_slug, source_key};

const EXAMPLE_DESCRIPTOR: &str = include_str!(concat!(
  env!("CARGO_MANIFEST_DIR"),
  "/../../../examples/mod-source/dmm-source.json"
));
const EXAMPLE_INDEX: &str = include_str!(concat!(
  env!("CARGO_MANIFEST_DIR"),
  "/../../../examples/mod-source/catalog.json"
));
const EXAMPLE_DETAIL: &str = include_str!(concat!(
  env!("CARGO_MANIFEST_DIR"),
  "/../../../examples/mod-source/mods/example.json"
));
const EXAMPLE_VPK: &[u8] = include_bytes!(concat!(
  env!("CARGO_MANIFEST_DIR"),
  "/../../../examples/mod-source/files/example.vpk"
));
const EXAMPLE_ZIP: &[u8] = include_bytes!(concat!(
  env!("CARGO_MANIFEST_DIR"),
  "/../../../examples/mod-source/files/example.zip"
));
const CHOICES_DETAIL: &str = include_str!(concat!(
  env!("CARGO_MANIFEST_DIR"),
  "/../../../examples/mod-source/mods/choices.json"
));
const CHOICES_ZIP: &[u8] = include_bytes!(concat!(
  env!("CARGO_MANIFEST_DIR"),
  "/../../../examples/mod-source/files/example-choices.zip"
));

#[derive(Clone)]
struct Response {
  status: u16,
  bytes: Vec<u8>,
  location: Option<String>,
}

/// A real HTTP boundary with mutable snapshots and failures; it serves the same
/// documents authors copy, rather than substituting a mocked catalog manager.
struct SourceServer {
  origin: String,
  routes: Arc<Mutex<BTreeMap<String, Response>>>,
  stopped: Arc<AtomicBool>,
  thread: Option<JoinHandle<()>>,
}

impl SourceServer {
  fn start() -> Self {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let routes = Arc::new(Mutex::new(BTreeMap::<String, Response>::new()));
    let stopped = Arc::new(AtomicBool::new(false));
    let thread_routes = Arc::clone(&routes);
    let thread_stopped = Arc::clone(&stopped);
    let thread = std::thread::spawn(move || {
      while let Ok((mut connection, _)) = listener.accept() {
        if thread_stopped.load(Ordering::SeqCst) {
          break;
        }
        connection
          .set_read_timeout(Some(Duration::from_secs(5)))
          .unwrap();
        let mut request = Vec::new();
        let mut chunk = [0; 4096];
        while !request.windows(4).any(|bytes| bytes == b"\r\n\r\n") {
          let Ok(length) = connection.read(&mut chunk) else {
            break;
          };
          if length == 0 || request.len() > 16384 {
            break;
          }
          request.extend_from_slice(&chunk[..length]);
        }
        let request = String::from_utf8_lossy(&request);
        let path = request.split_whitespace().nth(1).unwrap_or("/");
        let routes = thread_routes.lock().unwrap();
        let response = routes
          .get(path)
          .or_else(|| routes.get(path.split('?').next().unwrap()))
          .cloned()
          .unwrap_or(Response {
            status: 404,
            bytes: b"missing fixture".to_vec(),
            location: None,
          });
        drop(routes);
        let location = response
          .location
          .map(|location| format!("Location: {location}\r\n"))
          .unwrap_or_default();
        let header = format!(
          "HTTP/1.1 {} Fixture\r\nContent-Length: {}\r\nContent-Type: application/json\r\n{location}Connection: close\r\n\r\n",
          response.status,
          response.bytes.len()
        );
        let _ = connection.write_all(header.as_bytes());
        let _ = connection.write_all(&response.bytes);
      }
    });
    let server = Self {
      origin,
      routes,
      stopped,
      thread: Some(thread),
    };
    server.set_bytes(
      "/dmm-source.json",
      EXAMPLE_DESCRIPTOR
        .replace("https://mods.example.org", &server.origin)
        .into_bytes(),
    );
    server.set_bytes("/catalog.json", EXAMPLE_INDEX.as_bytes().to_vec());
    server.set_bytes(
      "/mods/example.json",
      EXAMPLE_DETAIL
        .replace("https://mods.example.org", &server.origin)
        .into_bytes(),
    );
    server.set_bytes("/files/example.vpk", EXAMPLE_VPK.to_vec());
    server.set_bytes("/files/example.zip", EXAMPLE_ZIP.to_vec());
    server
  }

  fn descriptor_url(&self) -> String {
    format!("{}/dmm-source.json", self.origin)
  }

  fn set_bytes(&self, path: &str, bytes: Vec<u8>) {
    self.routes.lock().unwrap().insert(
      path.into(),
      Response {
        status: 200,
        bytes,
        location: None,
      },
    );
  }

  fn redirect(&self, path: &str, location: String) {
    self.routes.lock().unwrap().insert(
      path.into(),
      Response {
        status: 302,
        bytes: Vec::new(),
        location: Some(location),
      },
    );
  }

  fn set_json(&self, path: &str, value: Value) {
    self.set_bytes(path, serde_json::to_vec(&value).unwrap());
  }

  fn edit_json(&self, path: &str, edit: impl FnOnce(&mut Value)) {
    let mut value = serde_json::from_slice(&self.routes.lock().unwrap()[path].bytes).unwrap();
    edit(&mut value);
    self.set_json(path, value);
  }

  fn unavailable(&self, path: &str) {
    self.routes.lock().unwrap().insert(
      path.into(),
      Response {
        status: 503,
        bytes: b"source offline".to_vec(),
        location: None,
      },
    );
  }
}

impl Drop for SourceServer {
  fn drop(&mut self) {
    self.stopped.store(true, Ordering::SeqCst);
    let _ = TcpStream::connect(self.origin.trim_start_matches("http://"));
    self.thread.take().unwrap().join().unwrap();
  }
}

#[test]
fn copyable_artifacts_contain_a_real_parseable_vpk_and_archive() {
  let parsed = VpkParser::parse(
    EXAMPLE_VPK.to_vec(),
    VpkParseOptions {
      include_entries: true,
      include_full_file_hash: true,
      ..Default::default()
    },
  )
  .unwrap();
  assert_eq!(parsed.version, 1);
  assert_eq!(parsed.entries.len(), 1);
  assert_eq!(
    parsed.entries[0].full_path,
    "resource/dmm-source-example.txt"
  );
  assert_eq!(
    parsed.fingerprint.sha256,
    "0ef66746810e2611130e9407a078daeb9657f3716fe5f952bc555276b2af7c5a"
  );
  let mut archive = zip::ZipArchive::new(std::io::Cursor::new(EXAMPLE_ZIP)).unwrap();
  assert_eq!(archive.len(), 1);
  let mut entry = archive.by_name("example.vpk").unwrap();
  let mut extracted = Vec::new();
  entry.read_to_end(&mut extracted).unwrap();
  assert_eq!(extracted, EXAMPLE_VPK);
}

#[tokio::test]
async fn preview_is_non_enrolling_and_local_network_needs_explicit_consent() {
  let server = SourceServer::start();
  let temp = tempfile::tempdir().unwrap();
  let manager = NativeSourceManager::open(temp.path().join("sources.json")).unwrap();
  assert!(manager.preview("not a URL", false).await.is_err());
  assert!(
    manager
      .preview(&server.descriptor_url(), false)
      .await
      .is_err()
  );
  let preview = manager
    .preview(&server.descriptor_url(), true)
    .await
    .unwrap();
  assert_eq!(preview.descriptor.name, "My Community Mods");
  assert_eq!(preview.accepted_origin, server.origin);
  assert!(manager.list().await.unwrap().is_empty());
  server.edit_json("/dmm-source.json", |descriptor| {
    descriptor["protocolVersion"] = json!("999")
  });
  assert!(manager.add(&server.descriptor_url(), true).await.is_err());
  assert!(manager.list().await.unwrap().is_empty());
}

#[tokio::test]
async fn changed_descriptor_requires_a_new_review_before_enrollment() {
  let server = SourceServer::start();
  let temp = tempfile::tempdir().unwrap();
  let manager = NativeSourceManager::open(temp.path().join("sources.json")).unwrap();
  let preview = manager
    .preview(&server.descriptor_url(), true)
    .await
    .unwrap();
  server.edit_json("/dmm-source.json", |descriptor| {
    descriptor["name"] = json!("Changed after review")
  });
  assert!(
    manager
      .add_reviewed(&server.descriptor_url(), true, &preview.preview_token)
      .await
      .is_err()
  );
  assert!(manager.list().await.unwrap().is_empty());
  let reviewed = manager
    .preview(&server.descriptor_url(), true)
    .await
    .unwrap();
  assert_eq!(
    manager
      .add_reviewed(&server.descriptor_url(), true, &reviewed.preview_token)
      .await
      .unwrap()
      .descriptor
      .name,
    "Changed after review"
  );
}

#[tokio::test]
async fn api_catalog_continues_after_an_empty_page_and_requires_explicit_completion() {
  let server = SourceServer::start();
  server.edit_json("/dmm-source.json", |descriptor| {
    descriptor["catalog"] = json!({"kind":"api", "listUrl":"./api"});
  });
  server.set_json("/api", json!({"items":[], "nextCursor":"after"}));
  let detail: Value = serde_json::from_str(EXAMPLE_DETAIL).unwrap();
  server.set_json(
    "/api?cursor=after&limit=100",
    json!({"items":[detail], "nextCursor":null}),
  );
  let temp = tempfile::tempdir().unwrap();
  let manager = NativeSourceManager::open(temp.path().join("sources.json")).unwrap();
  let source = manager.add(&server.descriptor_url(), true).await.unwrap();
  assert_eq!(manager.query(&source.key, "").await.unwrap().len(), 1);
  server.set_json("/api", json!({"items":[]}));
  assert!(manager.refresh(&source.key).await.is_err());
  assert_eq!(manager.query(&source.key, "").await.unwrap().len(), 1);
  server.set_json("/api", json!({"items":[], "nextCursor":null}));
  manager.refresh(&source.key).await.unwrap();
  assert!(manager.query(&source.key, "").await.unwrap().is_empty());
}

#[tokio::test]
async fn release_history_follows_declared_template_and_pagination_on_demand() {
  let server = SourceServer::start();
  let detail: Value = serde_json::from_str(EXAMPLE_DETAIL).unwrap();
  let current = detail["release"].clone();
  let mut previous = current.clone();
  previous["id"] = json!("release-0");
  previous["publishedAt"] = json!("2026-01-01T00:00:00Z");
  previous["changelog"] = json!("Initial release");
  server.edit_json("/dmm-source.json", |descriptor| {
    descriptor["catalog"] = json!({
      "kind":"api",
      "listUrl":"./api",
      "releaseHistoryUrlTemplate":"./history/{listingId}"
    });
    // Comments and dependencies are not implemented and must be ignored.
    descriptor["capabilities"] = json!({"comments":true, "dependencies":true});
  });
  server.set_json("/api", json!({"items":[detail], "nextCursor":null}));
  server.set_json(
    "/history/example",
    json!({"items":[current], "nextCursor":"older"}),
  );
  server.set_json(
    "/history/example?cursor=older&limit=100",
    json!({"items":[previous], "nextCursor":null}),
  );
  let temp = tempfile::tempdir().unwrap();
  let manager = NativeSourceManager::open(temp.path().join("sources.json")).unwrap();
  let source = manager.add(&server.descriptor_url(), true).await.unwrap();
  let remote_id = listing_slug(&source.key, "example");
  assert!(manager.release_history(&remote_id).await.is_err());

  server.edit_json("/dmm-source.json", |descriptor| {
    descriptor["capabilities"] = json!({"releaseHistory":true});
  });
  manager.refresh(&source.key).await.unwrap();
  let history = manager.release_history(&remote_id).await.unwrap();
  let ids: Vec<_> = history.iter().map(|release| release.id.as_str()).collect();
  assert_eq!(ids, ["release-1", "release-0"]);
  assert_eq!(history[1].changelog.as_deref(), Some("Initial release"));

  server.set_json(
    "/history/example?cursor=older&limit=100",
    json!({"items":[]}),
  );
  assert!(manager.release_history(&remote_id).await.is_err());
}

#[tokio::test]
async fn copied_source_can_enroll_browse_persist_and_resolve_stable_artifact_identity() {
  let server = SourceServer::start();
  let temp = tempfile::tempdir().unwrap();
  let path = temp.path().join("sources.json");
  let manager = NativeSourceManager::open(path.clone()).unwrap();
  let added = manager.add(&server.descriptor_url(), true).await.unwrap();
  assert_eq!(added.listing_count, 1);
  let listings = manager.query(&added.key, "harmless").await.unwrap();
  assert_eq!(listings.len(), 1);
  assert!(
    manager
      .query(&added.key, "missing search phrase")
      .await
      .unwrap()
      .is_empty()
  );
  let detail = manager.detail(&added.key, "example").await.unwrap();
  let release = detail.release.unwrap();
  assert_eq!(release.id, "release-1");
  let artifact = manager
    .resolve_artifact(
      &added.key,
      "example",
      "release-1",
      "revision-1",
      "example-vpk",
    )
    .await
    .unwrap();
  assert_eq!(artifact.url, format!("{}/files/example.vpk", server.origin));
  assert_eq!(artifact.size, Some(EXAMPLE_VPK.len() as u64));
  assert!(
    manager
      .resolve_artifact(
        &added.key,
        "example",
        "release-1",
        "wrong-revision",
        "example-vpk"
      )
      .await
      .is_err()
  );
  drop(manager);
  let reopened = NativeSourceManager::open(path).unwrap();
  assert_eq!(reopened.query(&added.key, "").await.unwrap().len(), 1);
}

#[tokio::test]
async fn artifact_redirects_are_followed_only_to_declared_download_origins() {
  let source = SourceServer::start();
  let storage = SourceServer::start();
  let temp = tempfile::tempdir().unwrap();
  source.redirect(
    "/files/example.vpk",
    format!("{}/bucket/example.vpk", storage.origin),
  );
  storage.set_bytes("/bucket/example.vpk", EXAMPLE_VPK.to_vec());
  let artifact = |allowed_origins: Vec<String>| super::ResolvedNativeArtifact {
    url: format!("{}/files/example.vpk", source.origin),
    filename: "example.vpk".into(),
    size: Some(EXAMPLE_VPK.len() as u64),
    hashes: None,
    allowed_origins,
    allow_local_network: true,
  };

  let downloaded = temp.path().join("declared/example.vpk");
  download_native_artifact(
    &artifact(vec![source.origin.clone(), storage.origin.clone()]),
    &downloaded,
    |_| {},
    CancellationToken::new(),
    PauseHandle::new(),
  )
  .await
  .unwrap();
  assert_eq!(std::fs::read(&downloaded).unwrap(), EXAMPLE_VPK);

  let refused = temp.path().join("undeclared/example.vpk");
  assert!(
    download_native_artifact(
      &artifact(vec![source.origin.clone()]),
      &refused,
      |_| {},
      CancellationToken::new(),
      PauseHandle::new(),
    )
    .await
    .is_err()
  );
  assert!(!refused.exists());
}

#[tokio::test]
async fn origin_and_declared_source_id_namespace_identical_listing_and_artifact_ids() {
  let first = SourceServer::start();
  let second = SourceServer::start();
  let temp = tempfile::tempdir().unwrap();
  let manager = NativeSourceManager::open(temp.path().join("sources.json")).unwrap();
  let a = manager.add(&first.descriptor_url(), true).await.unwrap();
  let b = manager.add(&second.descriptor_url(), true).await.unwrap();
  assert_ne!(a.key, b.key);
  assert_ne!(listing_slug(&a.key, "42"), listing_slug(&b.key, "42"));
  assert_ne!(listing_slug(&a.key, "snd-42"), listing_slug(&a.key, "42"));
  assert!(!listing_slug(&a.key, "42").starts_with("gb-"));
  assert_ne!(
    source_key(&first.origin, "my-community"),
    source_key(&first.origin, "other-community")
  );
  assert_eq!(manager.query(&a.key, "").await.unwrap().len(), 1);
  assert_eq!(manager.query(&b.key, "").await.unwrap().len(), 1);
}

#[tokio::test]
async fn failed_later_page_and_mixed_snapshot_preserve_complete_catalog_across_restart() {
  let server = SourceServer::start();
  let temp = tempfile::tempdir().unwrap();
  let path = temp.path().join("sources.json");
  let manager = NativeSourceManager::open(path.clone()).unwrap();
  let added = manager.add(&server.descriptor_url(), true).await.unwrap();
  server.set_json(
    "/catalog.json",
    json!({"snapshotId":"new", "items":[], "nextUrl":"./page-2.json"}),
  );
  server.unavailable("/page-2.json");
  assert!(manager.refresh(&added.key).await.is_err());
  assert_eq!(
    manager.query(&added.key, "").await.unwrap()[0].title,
    "Harmless source example"
  );
  server.set_json(
    "/page-2.json",
    json!({"snapshotId":"inconsistent", "items":[]}),
  );
  assert!(manager.refresh(&added.key).await.is_err());
  drop(manager);
  let reopened = NativeSourceManager::open(path).unwrap();
  assert_eq!(reopened.query(&added.key, "").await.unwrap().len(), 1);
  assert!(
    reopened
      .list()
      .await
      .unwrap()
      .iter()
      .find(|source| source.key == added.key)
      .unwrap()
      .last_error
      .is_some()
  );
}

#[tokio::test]
async fn source_removal_and_readd_keep_scoped_identity_and_stop_remote_resolution() {
  let server = SourceServer::start();
  let temp = tempfile::tempdir().unwrap();
  let manager = NativeSourceManager::open(temp.path().join("sources.json")).unwrap();
  let added = manager.add(&server.descriptor_url(), true).await.unwrap();
  manager.set_enabled(&added.key, false).await.unwrap();
  assert!(
    manager
      .resolve_artifact(
        &added.key,
        "example",
        "release-1",
        "revision-1",
        "example-vpk"
      )
      .await
      .is_err()
  );
  manager.remove(&added.key).await.unwrap();
  assert!(
    manager
      .resolve_artifact(
        &added.key,
        "example",
        "release-1",
        "revision-1",
        "example-vpk"
      )
      .await
      .is_err()
  );
  let readded = manager.add(&server.descriptor_url(), true).await.unwrap();
  assert_eq!(readded.key, added.key);
  assert_eq!(
    listing_slug(&readded.key, "example"),
    listing_slug(&added.key, "example")
  );
  assert_eq!(manager.query(&readded.key, "").await.unwrap().len(), 1);
}

#[tokio::test]
async fn declared_download_origin_and_detail_identity_are_enforced() {
  let server = SourceServer::start();
  let temp = tempfile::tempdir().unwrap();
  let manager = NativeSourceManager::open(temp.path().join("sources.json")).unwrap();
  let added = manager.add(&server.descriptor_url(), true).await.unwrap();
  server.edit_json("/mods/example.json", |detail| {
    detail["release"]["artifacts"][0]["download"]["url"] =
      json!("https://unaccepted.example.org/mod.vpk");
  });
  assert!(manager.refresh(&added.key).await.is_err());
  server.edit_json("/mods/example.json", |detail| {
    detail["release"]["artifacts"][0]["download"]["url"] = json!("../files/example.vpk");
    detail["id"] = json!("different-listing");
  });
  assert!(manager.refresh(&added.key).await.is_err());
}

#[tokio::test]
async fn unsupported_package_flows_and_extensions_are_rejected_before_download() {
  for (format, filename) in [("dmodpkg", "example.dmodpkg"), ("zip", "example.ZIP")] {
    let server = SourceServer::start();
    let temp = tempfile::tempdir().unwrap();
    let manager = NativeSourceManager::open(temp.path().join("sources.json")).unwrap();
    server.edit_json("/mods/example.json", |detail| {
      detail["release"]["artifacts"][0]["format"] = json!(format);
      detail["release"]["artifacts"][0]["filename"] = json!(filename);
    });
    assert!(
      manager
        .add(&server.descriptor_url(), true)
        .await
        .unwrap_err()
        .to_string()
        .contains("lowercase extension")
    );
    assert!(manager.list().await.unwrap().is_empty());
  }
}

#[tokio::test]
async fn metadata_edits_are_not_content_updates_but_revised_bytes_need_a_new_revision() {
  let server = SourceServer::start();
  let temp = tempfile::tempdir().unwrap();
  let manager = NativeSourceManager::open(temp.path().join("sources.json")).unwrap();
  let added = manager.add(&server.descriptor_url(), true).await.unwrap();
  server.edit_json("/mods/example.json", |detail| {
    detail["title"] = json!("Corrected title");
    detail["description"] = json!("Corrected description");
  });
  manager.refresh(&added.key).await.unwrap();
  let metadata = manager.detail(&added.key, "example").await.unwrap();
  assert_eq!(metadata.title, "Corrected title");
  assert_eq!(metadata.release.unwrap().content_revision, "revision-1");
  server.edit_json("/mods/example.json", |detail| {
    detail["release"]["artifacts"][0]["hashes"]["sha256"] =
      json!("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  });
  assert!(manager.refresh(&added.key).await.is_err());
  assert_eq!(
    manager
      .detail(&added.key, "example")
      .await
      .unwrap()
      .release
      .unwrap()
      .content_revision,
    "revision-1"
  );
  server.edit_json("/mods/example.json", |detail| {
    detail["release"]["contentRevision"] = json!("revision-2")
  });
  manager.refresh(&added.key).await.unwrap();
  assert_eq!(
    manager
      .detail(&added.key, "example")
      .await
      .unwrap()
      .release
      .unwrap()
      .content_revision,
    "revision-2"
  );
  assert!(
    manager
      .resolve_artifact(
        &added.key,
        "example",
        "release-1",
        "revision-1",
        "example-vpk"
      )
      .await
      .is_err()
  );
}

#[tokio::test]
async fn downloaded_archive_uses_existing_selection_and_install_operations_and_hash_failure_keeps_install()
 {
  let server = SourceServer::start();
  server.edit_json("/mods/example.json", |detail| {
    let artifact = &mut detail["release"]["artifacts"][0];
    artifact["id"] = json!("example-archive");
    artifact["filename"] = json!("example.zip");
    artifact["format"] = json!("zip");
    artifact["download"]["url"] = json!("../files/example.zip");
    artifact["size"] = json!(EXAMPLE_ZIP.len());
    use sha2::Digest;
    artifact["hashes"]["sha256"] = json!(hex::encode(sha2::Sha256::digest(EXAMPLE_ZIP)));
  });
  let temp = tempfile::tempdir().unwrap();
  let manager = NativeSourceManager::open(temp.path().join("sources.json")).unwrap();
  let source = manager.add(&server.descriptor_url(), true).await.unwrap();
  let artifact = manager
    .resolve_artifact(
      &source.key,
      "example",
      "release-1",
      "revision-1",
      "example-archive",
    )
    .await
    .unwrap();
  let downloaded = temp.path().join("downloads/example.zip");
  download_native_artifact(
    &artifact,
    &downloaded,
    |_| {},
    CancellationToken::new(),
    PauseHandle::new(),
  )
  .await
  .unwrap();
  assert_eq!(std::fs::read(&downloaded).unwrap(), EXAMPLE_ZIP);
  let extraction = temp.path().join("extracted");
  ArchiveExtractor::new()
    .extract_archive(&downloaded, &extraction)
    .unwrap();
  assert_eq!(
    std::fs::read(extraction.join("example.vpk")).unwrap(),
    EXAMPLE_VPK
  );

  let addons = temp.path().join("game/citadel/addons");
  std::fs::create_dir_all(&addons).unwrap();
  let mod_id = listing_slug(&source.key, "example");
  let originals = vec!["example.vpk".to_string()];
  let tree = ModFileTree::from_options(&originals, &originals.iter().cloned().collect());
  let vpks = VpkManager::new();
  let mut manifest = ProfileVpkManifest::open_for_write(&addons).unwrap();
  let placed = vpks
    .place_selected_vpks_with_prefix(&extraction, &addons, &mod_id, &tree)
    .unwrap();
  assert_eq!(placed.len(), 1);
  manifest.mark_disabled(&mod_id, placed.clone(), originals.clone());
  manifest.save(&addons).unwrap();
  let enabled = vpks
    .enable_vpks_in(&addons, &addons, &mod_id, &placed)
    .unwrap();
  manifest.mark_enabled(
    &mod_id,
    enabled.clone(),
    originals.clone(),
    None,
    ShardIndex::FIRST,
  );
  manifest.save(&addons).unwrap();
  let installed = addons.join(&enabled[0]);
  assert_eq!(std::fs::read(&installed).unwrap(), EXAMPLE_VPK);

  server.edit_json("/mods/example.json", |detail| {
    detail["release"]["contentRevision"] = json!("revision-2");
    detail["release"]["artifacts"][0]["hashes"]["sha256"] =
      json!("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  });
  manager.refresh(&source.key).await.unwrap();
  let update = manager
    .resolve_artifact(
      &source.key,
      "example",
      "release-1",
      "revision-2",
      "example-archive",
    )
    .await
    .unwrap();
  let staged = temp.path().join("downloads/update.zip");
  assert!(
    download_native_artifact(
      &update,
      &staged,
      |_| {},
      CancellationToken::new(),
      PauseHandle::new()
    )
    .await
    .is_err()
  );
  assert!(
    !staged.exists(),
    "A failed integrity check cannot leave an installable archive"
  );
  assert_eq!(std::fs::read(&installed).unwrap(), EXAMPLE_VPK);
  assert_eq!(ProfileVpkManifest::load(&addons).unwrap(), manifest);

  manager.remove(&source.key).await.unwrap();
  let cached = manager.mod_by_remote_id(&mod_id).await.unwrap();
  assert_eq!(cached.source.accepted_origin, server.origin);
  assert!(cached.source.removed);
  let disabled = vpks
    .disable_vpks_in(
      &addons,
      &addons,
      &mod_id,
      &enabled,
      &originals,
      MissingVpkPolicy::Strict,
    )
    .unwrap();
  manifest.mark_disabled(&mod_id, disabled.clone(), originals.clone());
  manifest.save(&addons).unwrap();
  assert_eq!(
    std::fs::read(addons.join(&disabled[0])).unwrap(),
    EXAMPLE_VPK
  );
  let reenabled = vpks
    .enable_vpks_in(&addons, &addons, &mod_id, &disabled)
    .unwrap();
  manifest.mark_enabled(
    &mod_id,
    reenabled.clone(),
    originals,
    None,
    ShardIndex::FIRST,
  );
  manifest.save(&addons).unwrap();
  assert_eq!(
    std::fs::read(addons.join(&reenabled[0])).unwrap(),
    EXAMPLE_VPK
  );
}

#[tokio::test]
async fn untitled_tombstones_are_accepted_but_untitled_live_listings_are_not() {
  let server = SourceServer::start();
  server.set_json("/catalog.json", json!({"snapshotId":"tombstone-1", "items":[
    {"id":"gone", "availability":"removed", "detailUrl":"./mods/gone.json"},
    {"id":"example", "title":"Harmless source example", "availability":"available", "detailUrl":"./mods/example.json"}
  ]}));
  server.set_json(
    "/mods/gone.json",
    json!({"id":"gone", "availability":"removed", "detailUrl":"./gone.json"}),
  );
  let temp = tempfile::tempdir().unwrap();
  let manager = NativeSourceManager::open(temp.path().join("sources.json")).unwrap();
  let source = manager.add(&server.descriptor_url(), true).await.unwrap();
  let listings = manager.query(&source.key, "").await.unwrap();
  assert_eq!(listings.len(), 1);
  assert_eq!(listings[0].id, "example");

  server.set_json(
    "/catalog.json",
    json!({"snapshotId":"tombstone-2", "items":[
      {"id":"example", "availability":"available", "detailUrl":"./mods/example.json"}
    ]}),
  );
  assert!(manager.refresh(&source.key).await.is_err());
}

#[tokio::test]
async fn component_choices_select_exact_archive_paths_and_changed_choices_require_a_new_decision() {
  let server = SourceServer::start();
  server.set_json("/catalog.json", json!({"snapshotId":"choices-1", "items":[{
    "id":"choices", "title":"Harmless component choices", "availability":"available", "detailUrl":"./mods/choices.json"
  }]}));
  server.set_bytes("/mods/choices.json", CHOICES_DETAIL.as_bytes().to_vec());
  server.set_bytes("/files/example-choices.zip", CHOICES_ZIP.to_vec());
  let temp = tempfile::tempdir().unwrap();
  let manager = NativeSourceManager::open(temp.path().join("sources.json")).unwrap();
  let source = manager.add(&server.descriptor_url(), true).await.unwrap();
  let listing = manager.detail(&source.key, "choices").await.unwrap();
  let release = listing.release.unwrap();
  let components = vec!["base".into(), "blue".into()];
  let artifact_ids = vec!["choices-archive".into()];
  assert!(build_component_selection(&release, &["base".into()], &artifact_ids).is_err());
  let tree = build_component_selection(&release, &components, &artifact_ids)
    .unwrap()
    .unwrap();
  assert_eq!(tree.files.iter().filter(|file| file.is_selected).count(), 2);
  let artifact = manager
    .resolve_artifact(
      &source.key,
      "choices",
      &release.id,
      &release.content_revision,
      "choices-archive",
    )
    .await
    .unwrap();
  let downloaded = temp.path().join("downloads/example-choices.zip");
  download_native_artifact(
    &artifact,
    &downloaded,
    |_| {},
    CancellationToken::new(),
    PauseHandle::new(),
  )
  .await
  .unwrap();
  let extraction = temp.path().join("extracted");
  ArchiveExtractor::new()
    .extract_archive(&downloaded, &extraction.join("example-choices.zip"))
    .unwrap();
  for path in ["base/notice.vpk", "blue/choice.vpk", "red/choice.vpk"] {
    let bytes = std::fs::read(extraction.join("example-choices.zip").join(path)).unwrap();
    assert_eq!(
      VpkParser::parse(bytes, VpkParseOptions::default())
        .unwrap()
        .fingerprint
        .file_count,
      1
    );
  }
  let addons = temp.path().join("game/citadel/addons");
  std::fs::create_dir_all(&addons).unwrap();
  let mod_id = listing_slug(&source.key, "choices");
  let mut manifest = ProfileVpkManifest::open_for_write(&addons).unwrap();
  let originals = vec!["notice.vpk".into(), "choice.vpk".into()];
  let placed = VpkManager::new()
    .place_selected_vpks_with_prefix(&extraction, &addons, &mod_id, &tree)
    .unwrap();
  assert_eq!(placed.len(), 2);
  manifest.mark_disabled(&mod_id, placed.clone(), originals);
  manifest.save(&addons).unwrap();
  let old_bytes: Vec<_> = placed
    .iter()
    .map(|name| std::fs::read(addons.join(name)).unwrap())
    .collect();
  assert!(
    extraction
      .join("example-choices.zip/red/choice.vpk")
      .exists(),
    "The unselected component must not be installed"
  );
  server.edit_json("/mods/choices.json", |detail| {
    detail["release"]["contentRevision"] = json!("choices-revision-2");
    detail["release"]["installation"]["components"]
      .as_array_mut()
      .unwrap()
      .retain(|component| component["id"] != "blue");
    let group = &mut detail["release"]["installation"]["choiceGroups"][0];
    group["componentIds"] = json!(["red"]);
    group["defaultComponentIds"] = json!(["red"]);
  });
  manager.refresh(&source.key).await.unwrap();
  let updated = manager
    .detail(&source.key, "choices")
    .await
    .unwrap()
    .release
    .unwrap();
  assert!(
    build_component_selection(&updated, &components, &artifact_ids).is_err(),
    "A new default must not silently replace the user's saved choice"
  );
  assert_eq!(ProfileVpkManifest::load(&addons).unwrap(), manifest);
  for (name, old) in placed.iter().zip(old_bytes) {
    assert_eq!(std::fs::read(addons.join(name)).unwrap(), old);
  }
}
