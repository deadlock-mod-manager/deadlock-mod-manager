//! Sources DMM's API publishes for mod projects that only offer an archive
//! link (`apps/api/src/hosted-sources`). The API lists the ones switched on;
//! each is enrolled once and is then an ordinary source the user can disable
//! or remove. A removed source stays removed: its tombstone is never re-added.

use std::collections::HashSet;

use reqwest::Url;
use serde::Deserialize;

use super::NativeSourceManager;
use super::network::fetch_json;
use super::source_key;
use crate::errors::Error;

const LIST_PATH: &str = "/api/v2/hosted-sources";

#[derive(Deserialize)]
struct HostedSourceList {
  sources: Vec<HostedSourceEntry>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HostedSourceEntry {
  id: String,
  descriptor_url: String,
}

impl NativeSourceManager {
  /// Enrolls listed hosted sources this registry has never seen, then
  /// refreshes the enrolled ones so a project switched off disappears.
  pub async fn sync_hosted(&self, api_url: &str, allow_local_network: bool) -> Result<(), Error> {
    let api = Url::parse(api_url).map_err(|_| Error::InvalidInput("Invalid API URL".into()))?;
    let api_origin = api.origin().ascii_serialization();
    let list: HostedSourceList = fetch_json(
      &api
        .join(LIST_PATH)
        .map_err(|_| Error::InvalidInput("Invalid API URL".into()))?,
      allow_local_network,
    )
    .await?;

    // Enrollment fetched these catalogs moments ago.
    let mut added = HashSet::new();
    for entry in list.sources {
      // Only DMM's own API may hand out descriptors without a user review.
      let same_origin = Url::parse(&entry.descriptor_url)
        .is_ok_and(|url| url.origin().ascii_serialization() == api_origin);
      if !same_origin {
        log::warn!(
          "Ignoring hosted source {} outside {api_origin}",
          entry.descriptor_url
        );
        continue;
      }
      if self.has_entry(&source_key(&api_origin, &entry.id)).await {
        continue;
      }
      match self
        .add_hosted(&entry.descriptor_url, allow_local_network)
        .await
      {
        Ok(summary) => {
          log::info!("Added hosted mod source {}", summary.descriptor.name);
          added.insert(summary.key);
        }
        Err(error) => log::warn!("Hosted source {} not added: {error}", entry.id),
      }
    }

    let hosted_prefix = format!("{api_origin}{LIST_PATH}/");
    for source in self.list().await? {
      if source.enabled
        && !added.contains(&source.key)
        && source.descriptor_url.starts_with(&hosted_prefix)
        && let Err(error) = self.refresh(&source.key).await
      {
        log::warn!(
          "Hosted source {} kept its cached catalog: {error}",
          source.descriptor.name
        );
      }
    }
    Ok(())
  }
}
