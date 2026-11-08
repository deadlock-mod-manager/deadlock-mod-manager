use std::io::Write;

use serde_json::{Value, json};
use tokio_util::sync::CancellationToken;

use super::{EXAMPLE_VPK, SourceServer};
use crate::download_manager::downloader::{PauseHandle, download_native_artifact};
use crate::mod_manager::archive_extractor::ArchiveExtractor;
use crate::mod_manager::vpk_manager::VpkManager;
use crate::providers::native_sources::{
  NativeSourceManager, build_component_selection, listing_slug,
};

/// The API's hosted-source output for its example pack; its test keeps the
/// two in step.
const HOSTED_PACK_CATALOG: &str = include_str!(concat!(
  env!("CARGO_MANIFEST_DIR"),
  "/../../api/src/hosted-sources/fixtures/example-pack/catalog.json"
));

#[tokio::test]
async fn hosted_pack_catalog_installs_choices_from_both_archive_folders_in_pak_order() {
  use sha2::Digest;
  let server = SourceServer::start();
  let mut catalog: Value = serde_json::from_str(HOSTED_PACK_CATALOG).unwrap();
  let release = &mut catalog["items"][0]["release"];
  let paths: Vec<String> = release["installation"]["components"]
    .as_array()
    .unwrap()
    .iter()
    .map(|component| component["files"][0]["path"].as_str().unwrap().to_string())
    .collect();
  let mut writer = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
  for path in &paths {
    writer
      .start_file(path.as_str(), zip::write::SimpleFileOptions::default())
      .unwrap();
    writer.write_all(EXAMPLE_VPK).unwrap();
  }
  writer
    .start_file(
      "game/citadel/gameinfo.gi",
      zip::write::SimpleFileOptions::default(),
    )
    .unwrap();
  writer.write_all(b"\"GameInfo\" {}").unwrap();
  let archive = writer.finish().unwrap().into_inner();
  let artifact = &mut release["artifacts"][0];
  artifact["download"]["url"] = json!(format!("{}/dl/example-pack.zip", server.origin));
  artifact["size"] = json!(archive.len());
  artifact["hashes"]["sha256"] = json!(hex::encode(sha2::Sha256::digest(&archive)));
  server.set_json("/catalog.json", catalog);
  server.set_bytes("/dl/example-pack.zip", archive);

  let temp = tempfile::tempdir().unwrap();
  let manager = NativeSourceManager::open(temp.path().join("sources.json")).unwrap();
  let source = manager.add(&server.descriptor_url(), true).await.unwrap();
  let release = manager
    .detail(&source.key, "example-pack")
    .await
    .unwrap()
    .release
    .unwrap();
  let installation = &release.installation;
  let defaults: Vec<String> = installation
    .required_components
    .iter()
    .chain(
      installation
        .choice_groups
        .iter()
        .flat_map(|group| &group.default_component_ids),
    )
    .cloned()
    .collect();
  let artifact_ids = vec!["archive".to_string()];
  assert!(build_component_selection(&release, &defaults, &artifact_ids).is_ok());
  // The reduced variant, the second outline and every extra.
  let mut everything: Vec<String> = installation
    .components
    .iter()
    .map(|component| component.id.clone())
    .collect();
  everything.retain(|id| {
    id != "game/citadel/addons/pak02_dir.vpk" && id != "game/citadel/addons/pak03_dir.vpk"
  });
  let tree = build_component_selection(&release, &everything, &artifact_ids)
    .unwrap()
    .unwrap();
  let load_order: Vec<_> = tree
    .files
    .iter()
    .filter(|file| file.is_selected)
    .map(|file| {
      file
        .path
        .trim_start_matches("example-pack.zip/game/citadel/")
    })
    .collect();
  assert_eq!(
    load_order,
    [
      "addons/pak01_dir.vpk",
      "optional-addons/pak02_dir.vpk",
      "addons/pak04_dir.vpk",
      "optional-addons/pak05_dir.vpk"
    ],
    "The optional pak02 takes the default pak02's place in the load order"
  );

  let resolved = manager
    .resolve_artifact(
      &source.key,
      "example-pack",
      &release.id,
      &release.content_revision,
      "archive",
    )
    .await
    .unwrap();
  let downloaded = temp.path().join("downloads/example-pack.zip");
  download_native_artifact(
    &resolved,
    &downloaded,
    |_| {},
    CancellationToken::new(),
    PauseHandle::new(),
  )
  .await
  .unwrap();
  let extraction = temp.path().join("extracted");
  ArchiveExtractor::new()
    .extract_archive(&downloaded, &extraction.join("example-pack.zip"))
    .unwrap();
  let addons = temp.path().join("game/citadel/addons");
  std::fs::create_dir_all(&addons).unwrap();
  let placed = VpkManager::new()
    .place_selected_vpks_with_prefix(
      &extraction,
      &addons,
      &listing_slug(&source.key, "example-pack"),
      &tree,
    )
    .unwrap();
  assert_eq!(placed.len(), 4, "{placed:?}");
  let unique: std::collections::HashSet<_> = placed.iter().collect();
  assert_eq!(unique.len(), placed.len(), "{placed:?}");
}

#[tokio::test]
async fn hosted_sync_enrolls_once_trusts_new_download_origins_and_never_re_adds_a_removed_one() {
  let api = SourceServer::start();
  let elsewhere = SourceServer::start();
  api.set_json(
    "/api/v2/hosted-sources",
    json!({"sources": [
      {"id": "my-community", "descriptorUrl": api.descriptor_url()},
      {"id": "my-community", "descriptorUrl": elsewhere.descriptor_url()},
    ]}),
  );
  let temp = tempfile::tempdir().unwrap();
  let manager = NativeSourceManager::open(temp.path().join("sources.json")).unwrap();

  manager.sync_hosted(&api.origin, true).await.unwrap();
  let sources = manager.list().await.unwrap();
  assert_eq!(
    sources.len(),
    1,
    "Only the API's own origin enrolls unreviewed"
  );
  assert_eq!(sources[0].accepted_origin, api.origin);

  manager.sync_hosted(&api.origin, true).await.unwrap();
  assert_eq!(manager.list().await.unwrap().len(), 1);

  // A new hosted project can download from another origin without a review.
  api.edit_json("/dmm-source.json", |descriptor| {
    descriptor["networkOrigins"]["downloads"]
      .as_array_mut()
      .unwrap()
      .push(json!("https://downloads.example.org"));
  });
  let refreshed = manager.refresh(&sources[0].key).await.unwrap();
  assert_eq!(refreshed.descriptor.network_origins.downloads.len(), 2);

  manager.remove(&sources[0].key).await.unwrap();
  manager.sync_hosted(&api.origin, true).await.unwrap();
  assert!(
    manager.list().await.unwrap().is_empty(),
    "A source the user removed stays removed"
  );

  let reviewed = manager
    .add(&elsewhere.descriptor_url(), true)
    .await
    .unwrap();
  elsewhere.edit_json("/dmm-source.json", |descriptor| {
    descriptor["networkOrigins"]["downloads"]
      .as_array_mut()
      .unwrap()
      .push(json!("https://downloads.example.org"));
  });
  assert!(
    manager.refresh(&reviewed.key).await.is_err(),
    "A source the user reviewed needs a new review for new origins"
  );
}
