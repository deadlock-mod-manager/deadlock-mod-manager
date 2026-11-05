//! Public native source transport and complete-snapshot catalog. Installation
//! remains owned by the existing download manager and mod manager.
#[cfg(test)]
mod integration_fixture_tests;
pub mod links;
mod media;
mod network;
mod selection;
mod store;
mod types;
mod validation;

pub use links::{NativeSourceLink, NativeSourceLinkTarget};
pub use network::{artifact_download_client, source_request_client, validate_source_url};
pub use selection::build_component_selection;
pub use store::NativeSourceManager;
pub use types::*;

use crate::errors::Error;
use sha2::{Digest, Sha256};
use std::path::Path;
use tokio::io::AsyncReadExt;

/// Portable source identity is the accepted origin and declared source ID,
/// never the descriptor locator alone or a provider-global numeric ID.
pub fn source_key(accepted_origin: &str, source_id: &str) -> String {
  hex::encode(Sha256::digest(format!("{accepted_origin}\0{source_id}")))
}

pub fn listing_slug(source_key: &str, listing_id: &str) -> String {
  format!(
    "source-{}",
    hex::encode(Sha256::digest(format!("{source_key}\0{listing_id}")))
  )
}

pub fn validate_source_listing_slug(value: &str) -> bool {
  value.strip_prefix("source-").is_some_and(is_key)
}

fn is_key(value: &str) -> bool {
  value.len() == 64
    && value
      .bytes()
      .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

pub fn artifact_reference(
  source_key: &str,
  listing_id: &str,
  release_id: &str,
  content_revision: &str,
  artifact_id: &str,
) -> String {
  format!(
    "dmm-source-file://{source_key}/{}/{}/{}/{}",
    urlencoding::encode(listing_id),
    urlencoding::encode(release_id),
    urlencoding::encode(content_revision),
    urlencoding::encode(artifact_id)
  )
}

pub fn parse_artifact_reference(value: &str) -> Result<NativeArtifactReference, Error> {
  let Some(rest) = value.strip_prefix("dmm-source-file://") else {
    return Err(network::invalid("Invalid artifact reference scheme"));
  };
  let segments: Vec<_> = rest.split('/').collect();
  if segments.len() != 5 || !is_key(segments[0]) {
    return Err(network::invalid("Invalid immutable artifact reference"));
  }
  let mut decoded = Vec::new();
  for segment in &segments[1..] {
    let value = urlencoding::decode(segment)
      .map_err(|_| network::invalid("Invalid encoded artifact identity"))?
      .into_owned();
    validation::validate_id(&value)?;
    decoded.push(value);
  }
  Ok(NativeArtifactReference {
    source_key: segments[0].to_string(),
    listing_id: decoded[0].clone(),
    release_id: decoded[1].clone(),
    content_revision: decoded[2].clone(),
    artifact_id: decoded[3].clone(),
  })
}

/// Verify all supplied supported hashes before any extraction or replacement.
/// A source without hashes can still install, without publisher verification.
pub async fn verify_artifact(path: &Path, hashes: &NativeSourceHashes) -> Result<(), Error> {
  let mut file = tokio::fs::File::open(path).await?;
  let mut sha256 = Sha256::new();
  let mut md5 = md5::Md5::new();
  let mut buffer = [0u8; 64 * 1024];
  loop {
    let read = file.read(&mut buffer).await?;
    if read == 0 {
      break;
    }
    sha256.update(&buffer[..read]);
    md5.update(&buffer[..read]);
  }
  if hashes
    .sha256
    .as_ref()
    .is_some_and(|expected| !expected.eq_ignore_ascii_case(&hex::encode(sha256.finalize())))
    || hashes
      .md5
      .as_ref()
      .is_some_and(|expected| !expected.eq_ignore_ascii_case(&hex::encode(md5.finalize())))
  {
    return Err(network::invalid(
      "Artifact integrity verification failed; existing installation was not replaced",
    ));
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn identity_includes_origin_source_and_listing() {
    let a = source_key("https://a.example", "same");
    let b = source_key("https://b.example", "same");
    assert_ne!(a, b);
    assert_ne!(listing_slug(&a, "42"), listing_slug(&b, "42"));
    assert!(validate_source_listing_slug(&listing_slug(&a, "42")));
    assert!(!validate_source_listing_slug("42"));
  }

  #[test]
  fn immutable_artifact_reference_roundtrips_opaque_ids() {
    let key = source_key("https://a.example", "source");
    let value = artifact_reference(&key, "mods/42", "release #1", "revision?2", "asset/雪");
    let parsed = parse_artifact_reference(&value).unwrap();
    assert_eq!(parsed.listing_id, "mods/42");
    assert_eq!(parsed.release_id, "release #1");
    assert_eq!(parsed.content_revision, "revision?2");
    assert_eq!(parsed.artifact_id, "asset/雪");
  }
}
