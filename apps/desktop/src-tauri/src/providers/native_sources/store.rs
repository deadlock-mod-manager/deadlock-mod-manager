use std::collections::{BTreeMap, HashSet};
use std::io::Write;
use std::path::PathBuf;

use crate::errors::Error;
use reqwest::Url;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::sync::Mutex;

use super::links::{NativeSourceLink, NativeSourceLinkTarget};
use super::network::{fetch_json, invalid, resolve_url, validate_source_url};
use super::types::*;
use super::validation::{normalize_listing, validate_descriptor, validate_release};

const MAX_PAGES: usize = 100;
const MAX_LISTINGS: usize = 10_000;
const MAX_REFRESH_DOCUMENTS: usize = 1_000;
const MAX_HISTORY_PAGES: usize = 20;
const MAX_HISTORY_RELEASES: usize = 500;

#[derive(Clone, Default, Serialize, Deserialize)]
struct Registry {
  sources: BTreeMap<String, StoredSource>,
}

#[derive(Clone, Serialize, Deserialize)]
struct StoredSource {
  summary: NativeSourceSummary,
  listings: Vec<NativeSourceListing>,
  #[serde(default)]
  generation: u64,
  /// Enrolled from DMM's API without a review (`hosted.rs`), which also
  /// vouches for the download origins it adds later.
  #[serde(default)]
  hosted: bool,
}

pub struct NativeSourceManager {
  path: PathBuf,
  registry: Mutex<Registry>,
  initialization_error: Option<String>,
}

impl NativeSourceManager {
  pub fn open(path: PathBuf) -> Result<Self, Error> {
    let loaded = (|| -> Result<Registry, Error> {
      match std::fs::metadata(&path) {
        Ok(metadata) if metadata.len() > 128 * 1024 * 1024 => {
          return Err(invalid(
            "Local source catalog exceeds its 128 MiB safety limit",
          ));
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
          return Ok(Registry::default());
        }
        Err(error) => return Err(error.into()),
        Ok(_) => {}
      }
      serde_json::from_slice(&std::fs::read(&path)?)
        .map_err(|_| invalid("Local source catalog is invalid"))
    })();
    let (registry, initialization_error) = match loaded {
      Ok(registry) => (registry, None),
      Err(error) => (
        Registry::default(),
        Some(format!(
          "{error}. Restore or repair native-sources-v1.json; its existing contents have been preserved. Local downloaded and installed mods remain manageable."
        )),
      ),
    };
    Ok(Self {
      path,
      registry: Mutex::new(registry),
      initialization_error,
    })
  }

  fn ensure_available(&self) -> Result<(), Error> {
    match &self.initialization_error {
      Some(message) => Err(Error::Catalog(message.clone())),
      None => Ok(()),
    }
  }

  pub async fn preview(
    &self,
    descriptor_url: &str,
    allow_local_network: bool,
  ) -> Result<NativeSourceSummary, Error> {
    self.ensure_available()?;
    let url = validate_source_url(descriptor_url, allow_local_network)?;
    let descriptor = validate_descriptor(
      fetch_json(&url, allow_local_network).await?,
      &url,
      allow_local_network,
    )?;
    let accepted_origin = url.origin().ascii_serialization();
    let preview_token = hex::encode(Sha256::digest(
      serde_json::to_vec(&(&descriptor, url.as_str(), allow_local_network))
        .map_err(|_| invalid("Could not validate descriptor preview"))?,
    ));
    Ok(NativeSourceSummary {
      key: super::source_key(&accepted_origin, &descriptor.source_id),
      preview_token,
      descriptor_url: url.to_string(),
      accepted_origin,
      descriptor,
      enabled: true,
      removed: false,
      allow_local_network,
      last_sync: None,
      last_error: None,
      listing_count: 0,
    })
  }

  pub async fn add(
    &self,
    descriptor_url: &str,
    allow_local_network: bool,
  ) -> Result<NativeSourceSummary, Error> {
    let summary = self.preview(descriptor_url, allow_local_network).await?;
    self.add_preview(summary, false).await
  }

  pub(super) async fn add_hosted(
    &self,
    descriptor_url: &str,
    allow_local_network: bool,
  ) -> Result<NativeSourceSummary, Error> {
    let summary = self.preview(descriptor_url, allow_local_network).await?;
    self.add_preview(summary, true).await
  }

  pub async fn add_reviewed(
    &self,
    descriptor_url: &str,
    allow_local_network: bool,
    preview_token: &str,
  ) -> Result<NativeSourceSummary, Error> {
    let summary = self.preview(descriptor_url, allow_local_network).await?;
    if summary.preview_token != preview_token {
      return Err(invalid(
        "Descriptor changed after preview; review the source and its origins again",
      ));
    }
    self.add_preview(summary, false).await
  }

  async fn add_preview(
    &self,
    mut summary: NativeSourceSummary,
    hosted: bool,
  ) -> Result<NativeSourceSummary, Error> {
    if self
      .registry
      .lock()
      .await
      .sources
      .get(&summary.key)
      .is_some_and(|source| !source.summary.removed)
    {
      return Err(invalid("This source is already added"));
    }
    super::media::hydrate_source_icon(&mut summary).await;
    let listings = bounded_catalog(&summary).await?;
    let summary = synced_summary(summary, listings.len());
    let mut registry = self.registry.lock().await;
    if registry
      .sources
      .get(&summary.key)
      .is_some_and(|source| !source.summary.removed)
    {
      return Err(invalid(
        "This source was already added while enrollment was running",
      ));
    }
    let mut updated = registry.clone();
    if let Some(previous) = updated.sources.get(&summary.key) {
      validate_revision_invariants(&previous.listings, &listings)?;
    }
    let generation = updated
      .sources
      .get(&summary.key)
      .map_or(0, |source| source.generation + 1);
    updated.sources.insert(
      summary.key.clone(),
      StoredSource {
        summary: summary.clone(),
        listings,
        generation,
        hosted,
      },
    );
    self.save(&updated)?;
    *registry = updated;
    Ok(summary)
  }

  /// Whether the registry knows the source at all, removed ones included.
  pub(super) async fn has_entry(&self, source_key: &str) -> bool {
    self.registry.lock().await.sources.contains_key(source_key)
  }

  pub async fn list(&self) -> Result<Vec<NativeSourceSummary>, Error> {
    self.ensure_available()?;
    Ok(
      self
        .registry
        .lock()
        .await
        .sources
        .values()
        .filter(|source| !source.summary.removed)
        .map(|source| source.summary.clone())
        .collect(),
    )
  }

  pub async fn set_enabled(
    &self,
    source_key: &str,
    enabled: bool,
  ) -> Result<NativeSourceSummary, Error> {
    self.ensure_available()?;
    let mut registry = self.registry.lock().await;
    let mut updated = registry.clone();
    let source = active_source_mut(&mut updated, source_key)?;
    source.summary.enabled = enabled;
    source.generation += 1;
    let summary = source.summary.clone();
    self.save(&updated)?;
    *registry = updated;
    Ok(summary)
  }

  /// Keep the accepted source identity and complete catalog as a tombstone;
  /// local downloaded/installed records remain independently manageable.
  pub async fn remove(&self, source_key: &str) -> Result<(), Error> {
    self.ensure_available()?;
    let mut registry = self.registry.lock().await;
    let mut updated = registry.clone();
    let source = active_source_mut(&mut updated, source_key)?;
    source.summary.removed = true;
    source.summary.enabled = false;
    source.generation += 1;
    self.save(&updated)?;
    *registry = updated;
    Ok(())
  }

  pub async fn refresh(&self, source_key: &str) -> Result<NativeSourceSummary, Error> {
    self.ensure_available()?;
    let existing = {
      let registry = self.registry.lock().await;
      active_source(&registry, source_key)?.clone()
    };
    if !existing.summary.enabled {
      return Err(invalid("Source is disabled"));
    }
    let previous = existing.summary.clone();
    let result = async {
      let mut fresh = self
        .preview(&previous.descriptor_url, previous.allow_local_network)
        .await?;
      let fresh_origins = &fresh.descriptor.network_origins;
      let previous_origins = &previous.descriptor.network_origins;
      let origins_changed = if existing.hosted {
        fresh_origins.api != previous_origins.api
      } else {
        fresh_origins != previous_origins
      };
      if fresh.key != previous.key
        || fresh.accepted_origin != previous.accepted_origin
        || origins_changed
      {
        return Err(invalid(
          "Source identity or network origins changed; remove and review this source again",
        ));
      }
      super::media::hydrate_source_icon(&mut fresh).await;
      let listings = bounded_catalog(&fresh).await?;
      validate_revision_invariants(&existing.listings, &listings)?;
      Ok((synced_summary(fresh, listings.len()), listings))
    }
    .await;
    let mut registry = self.registry.lock().await;
    let current = active_source(&registry, source_key)?;
    if !current.summary.enabled || current.generation != existing.generation {
      return Err(invalid(
        "Source changed while refreshing; results were discarded",
      ));
    }
    let mut updated = registry.clone();
    match result {
      Ok((summary, listings)) => {
        updated.sources.insert(
          source_key.to_string(),
          StoredSource {
            summary: summary.clone(),
            listings,
            generation: existing.generation + 1,
            hosted: existing.hosted,
          },
        );
        self.save(&updated)?;
        *registry = updated;
        Ok(summary)
      }
      Err(error) => {
        // Only diagnostics change on failure. No incomplete snapshot can erase
        // cached listings or become evidence of a deleted release.
        if let Some(source) = updated.sources.get_mut(source_key) {
          source.summary.last_error = Some(error.to_string());
        }
        self.save(&updated)?;
        *registry = updated;
        Err(error)
      }
    }
  }

  pub async fn query(
    &self,
    source_key: &str,
    query: &str,
  ) -> Result<Vec<NativeSourceListing>, Error> {
    self.ensure_available()?;
    let registry = self.registry.lock().await;
    let source = active_source(&registry, source_key)?;
    if !source.summary.enabled {
      return Err(invalid("Source is disabled"));
    }
    let needle = query.to_lowercase();
    Ok(
      source
        .listings
        .iter()
        .filter(|listing| {
          listing.availability != NativeSourceAvailability::Removed
            && (needle.is_empty()
              || listing.title.to_lowercase().contains(&needle)
              || listing
                .tags
                .iter()
                .any(|tag| tag.to_lowercase().contains(&needle)))
        })
        .cloned()
        .collect(),
    )
  }

  pub async fn detail(
    &self,
    source_key: &str,
    listing_id: &str,
  ) -> Result<NativeSourceListing, Error> {
    self.ensure_available()?;
    let registry = self.registry.lock().await;
    let source = active_source(&registry, source_key)?;
    source
      .listings
      .iter()
      .find(|listing| listing.id == listing_id)
      .cloned()
      .ok_or_else(|| invalid("Listing was not found in the complete cached catalog"))
  }

  /// Also resolves retained metadata for removed sources, so an installed detail
  /// page can explain provenance without making a network request.
  pub async fn mod_by_remote_id(&self, remote_id: &str) -> Result<NativeSourceMod, Error> {
    self.ensure_available()?;
    let registry = self.registry.lock().await;
    for source in registry.sources.values() {
      if let Some(listing) = source
        .listings
        .iter()
        .find(|listing| listing.remote_id == remote_id)
      {
        return Ok(NativeSourceMod {
          remote_id: remote_id.to_string(),
          source: source.summary.clone(),
          listing: listing.clone(),
        });
      }
    }
    Err(invalid("Source listing was not found in the local catalog"))
  }

  /// Finds an install link's listing among added sources. The source is the
  /// one at the link's origin with its declared ID, so a link cannot point an
  /// added source's name at another site. A listing the cached catalog lacks
  /// gets one refresh, since a site links to mods it has just published.
  pub async fn resolve_link(
    &self,
    link: &NativeSourceLink,
  ) -> Result<NativeSourceLinkTarget, Error> {
    self.ensure_available()?;
    let NativeSourceLink::Install {
      descriptor_url,
      source_id,
      listing_id,
      release_id,
      artifact_id,
    } = link
    else {
      return Err(invalid("Not an install link"));
    };
    let url = validate_source_url(descriptor_url, true)?;
    let key = super::source_key(&url.origin().ascii_serialization(), source_id);

    let find = |registry: &Registry| -> Option<Result<NativeSourceLinkTarget, Error>> {
      let source = registry.sources.get(&key).filter(|s| !s.summary.removed)?;
      if !source.summary.enabled {
        return Some(Ok(NativeSourceLinkTarget::Disabled {
          source_key: key.clone(),
        }));
      }
      let listing = source
        .listings
        .iter()
        .find(|listing| &listing.id == listing_id)?;
      Some(link_target(source, listing, release_id, artifact_id))
    };

    if let Some(target) = find(&*self.registry.lock().await) {
      return target;
    }
    if !self
      .registry
      .lock()
      .await
      .sources
      .get(&key)
      .is_some_and(|source| !source.summary.removed)
    {
      return Ok(NativeSourceLinkTarget::NotAdded);
    }
    self.refresh(&key).await?;
    find(&*self.registry.lock().await)
      .unwrap_or_else(|| Err(invalid("This mod is not in the source's catalog")))
  }

  /// Fetched on demand rather than during refresh, so history never counts
  /// against the snapshot budget or blocks installing the current release.
  pub async fn release_history(&self, remote_id: &str) -> Result<Vec<NativeSourceRelease>, Error> {
    let NativeSourceMod {
      source, listing, ..
    } = self.mod_by_remote_id(remote_id).await?;
    if !source.enabled || source.removed {
      return Err(invalid("Source is disabled or removed"));
    }
    if !source
      .descriptor
      .capabilities
      .as_ref()
      .is_some_and(|capabilities| capabilities.release_history)
    {
      return Err(invalid("Source does not declare release history"));
    }
    let history_url = listing
      .release_history_url
      .clone()
      .or_else(|| match &source.descriptor.catalog {
        NativeSourceCatalog::Api {
          release_history_url_template: Some(template),
          ..
        } => Some(expand_listing_template(template, &listing.id)),
        _ => None,
      })
      .ok_or_else(|| invalid("Source declares release history without a history URL"))?;
    let descriptor_url =
      Url::parse(&source.descriptor_url).map_err(|_| invalid("Invalid descriptor locator"))?;
    let initial_url = resolve_url(
      &descriptor_url,
      &history_url,
      &source.descriptor.network_origins.api,
      source.allow_local_network,
    )?;
    tokio::time::timeout(
      std::time::Duration::from_secs(30),
      fetch_release_history(&source, initial_url),
    )
    .await
    .map_err(|_| invalid("Release history exceeded its 30-second budget"))?
  }

  pub async fn resolve_artifact(
    &self,
    source_key: &str,
    listing_id: &str,
    release_id: &str,
    content_revision: &str,
    artifact_id: &str,
  ) -> Result<ResolvedNativeArtifact, Error> {
    self.ensure_available()?;
    let source = {
      let registry = self.registry.lock().await;
      active_source(&registry, source_key)?.clone()
    };
    if !source.summary.enabled {
      return Err(invalid(
        "Source is disabled; downloads and updates are paused",
      ));
    }
    let listing = source
      .listings
      .iter()
      .find(|listing| listing.id == listing_id)
      .ok_or_else(|| invalid("Requested listing is unavailable"))?;
    if listing.availability != NativeSourceAvailability::Available {
      return Err(invalid(
        "Requested listing is not available for installation",
      ));
    }
    let release = listing
      .release
      .as_ref()
      .filter(|release| release.id == release_id && release.content_revision == content_revision)
      .ok_or_else(|| {
        invalid("Exact requested release/revision is unavailable; latest was not substituted")
      })?;
    let artifact = release
      .artifacts
      .iter()
      .find(|artifact| artifact.id == artifact_id)
      .ok_or_else(|| invalid("Requested artifact is unavailable"))?;
    let url = if let Some(url) = &artifact.download.url {
      url.clone()
    } else {
      #[derive(Deserialize)]
      struct Resolution {
        url: String,
      }
      let resolver = Url::parse(
        artifact
          .download
          .resolver_url
          .as_deref()
          .ok_or_else(|| invalid("Artifact has no resolver"))?,
      )
      .map_err(|_| invalid("Invalid cached resolver URL"))?;
      let result: Resolution = fetch_json(&resolver, source.summary.allow_local_network).await?;
      resolve_url(
        &resolver,
        &result.url,
        &source.summary.descriptor.network_origins.downloads,
        source.summary.allow_local_network,
      )?
      .to_string()
    };
    Ok(ResolvedNativeArtifact {
      url,
      filename: artifact.filename.clone(),
      size: artifact.size,
      hashes: artifact.hashes.clone(),
      allowed_origins: source.summary.descriptor.network_origins.downloads.clone(),
      allow_local_network: source.summary.allow_local_network,
    })
  }

  fn save(&self, registry: &Registry) -> Result<(), Error> {
    self.ensure_available()?;
    let directory = self
      .path
      .parent()
      .ok_or_else(|| invalid("Catalog path has no parent"))?;
    std::fs::create_dir_all(directory)?;
    let mut temporary = tempfile::NamedTempFile::new_in(directory)?;
    serde_json::to_writer(temporary.as_file_mut(), registry)
      .map_err(|_| invalid("Could not serialize source catalog"))?;
    if temporary.as_file().metadata()?.len() > 128 * 1024 * 1024 {
      return Err(invalid(
        "Local source registry exceeded its 128 MiB safety limit; previous catalog retained",
      ));
    }
    temporary.flush()?;
    temporary.as_file().sync_all()?;
    temporary
      .persist(&self.path)
      .map_err(|error| Error::Io(error.error))?;
    Ok(())
  }
}

/// A link may pin the current release and name one of its files; older
/// releases cannot be installed, so a stale pin is an error rather than a
/// silent upgrade.
fn link_target(
  source: &StoredSource,
  listing: &NativeSourceListing,
  release_id: &Option<String>,
  artifact_id: &Option<String>,
) -> Result<NativeSourceLinkTarget, Error> {
  if listing.availability != NativeSourceAvailability::Available {
    return Err(invalid("This mod is not available from its source"));
  }
  let release = listing
    .release
    .as_ref()
    .ok_or_else(|| invalid("This mod has no installable release"))?;
  if release_id.as_ref().is_some_and(|id| id != &release.id) {
    return Err(invalid(
      "The linked release is not the mod's current release",
    ));
  }
  if artifact_id
    .as_ref()
    .is_some_and(|id| !release.artifacts.iter().any(|artifact| &artifact.id == id))
  {
    return Err(invalid(
      "The linked file is not part of the current release",
    ));
  }
  Ok(NativeSourceLinkTarget::Ready {
    record: Box::new(NativeSourceMod {
      remote_id: listing.remote_id.clone(),
      source: source.summary.clone(),
      listing: listing.clone(),
    }),
  })
}

fn active_source<'a>(registry: &'a Registry, key: &str) -> Result<&'a StoredSource, Error> {
  registry
    .sources
    .get(key)
    .filter(|source| !source.summary.removed)
    .ok_or_else(|| invalid("Source was removed or is not registered"))
}

fn active_source_mut<'a>(
  registry: &'a mut Registry,
  key: &str,
) -> Result<&'a mut StoredSource, Error> {
  registry
    .sources
    .get_mut(key)
    .filter(|source| !source.summary.removed)
    .ok_or_else(|| invalid("Source was removed or is not registered"))
}

fn synced_summary(mut summary: NativeSourceSummary, count: usize) -> NativeSourceSummary {
  summary.last_sync = Some(chrono::Utc::now().to_rfc3339());
  summary.last_error = None;
  summary.listing_count = count;
  summary
}

async fn bounded_catalog(source: &NativeSourceSummary) -> Result<Vec<NativeSourceListing>, Error> {
  tokio::time::timeout(std::time::Duration::from_secs(120), fetch_catalog(source))
    .await
    .map_err(|_| {
      invalid("Refresh exceeded its two-minute operation budget; previous catalog retained")
    })?
}

async fn fetch_catalog(source: &NativeSourceSummary) -> Result<Vec<NativeSourceListing>, Error> {
  let descriptor_url =
    Url::parse(&source.descriptor_url).map_err(|_| invalid("Invalid descriptor locator"))?;
  let (initial_url, is_static) = match &source.descriptor.catalog {
    NativeSourceCatalog::Static { index_url } => (index_url, true),
    NativeSourceCatalog::Api { list_url, .. } => (list_url, false),
  };
  let initial_url = Url::parse(initial_url).map_err(|_| invalid("Invalid catalog URL"))?;
  let mut next_url = initial_url.clone();
  let mut visited = HashSet::new();
  let mut snapshot: Option<String> = None;
  let mut listings = Vec::new();
  let mut ids = HashSet::new();
  let mut documents = 0;
  let mut catalog_bytes = 0;
  for _ in 0..MAX_PAGES {
    if !visited.insert(next_url.to_string()) {
      return Err(invalid("Catalog pagination repeated a URL or cursor"));
    }
    let page: CatalogPage = fetch_json(&next_url, source.allow_local_network).await?;
    documents += 1;
    if is_static {
      let id = page
        .snapshot_id
        .as_ref()
        .filter(|id| !id.is_empty())
        .ok_or_else(|| invalid("Static catalog pages need a snapshotId"))?;
      if snapshot.as_ref().is_some_and(|previous| previous != id) {
        return Err(invalid("Static catalog pages disagree about snapshotId"));
      }
      snapshot = Some(id.clone());
    }
    if listings.len() + page.items.len() > MAX_LISTINGS {
      return Err(invalid("Catalog exceeds the 10000-listing limit"));
    }
    for mut listing in page.items {
      normalize_listing(&mut listing, &next_url, source)?;
      if !ids.insert(listing.id.clone()) {
        return Err(invalid(
          "Listing IDs must be unique across the complete snapshot",
        ));
      }
      let detail_url = listing
        .detail_url
        .clone()
        .or_else(|| match &source.descriptor.catalog {
          NativeSourceCatalog::Api {
            detail_url_template: Some(template),
            ..
          } => Some(expand_listing_template(template, &listing.id)),
          _ => None,
        });
      if let Some(detail_url) = detail_url {
        let url = resolve_url(
          &descriptor_url,
          &detail_url,
          &source.descriptor.network_origins.api,
          source.allow_local_network,
        )?;
        let mut detail: NativeSourceListing = fetch_json(&url, source.allow_local_network).await?;
        documents += 1;
        if detail.id != listing.id {
          return Err(invalid("Detail listing ID does not match its index record"));
        }
        normalize_listing(&mut detail, &url, source)?;
        listing = detail;
      }
      if let Some(release_url) = &listing.release_url {
        if listing.release.is_some() {
          return Err(invalid(
            "Listing cannot embed a release and also link a release document",
          ));
        }
        let url = resolve_url(
          &next_url,
          release_url,
          &source.descriptor.network_origins.api,
          source.allow_local_network,
        )?;
        let mut release: NativeSourceRelease = fetch_json(&url, source.allow_local_network).await?;
        documents += 1;
        validate_release(&mut release, &url, source)?;
        listing.release = Some(release);
      }
      if listing.availability == NativeSourceAvailability::Available && listing.release.is_none() {
        return Err(invalid("Available listings require an installable release"));
      }
      if documents > MAX_REFRESH_DOCUMENTS {
        return Err(invalid(
          "Refresh exceeded its 1000-document budget; previous catalog retained",
        ));
      }
      let image_urls = std::mem::take(&mut listing.images);
      for url in image_urls.iter().take(4) {
        if let Ok(data_url) = super::media::raster_data_url(url, source.allow_local_network).await {
          listing.images.push(data_url);
        }
      }
      catalog_bytes += serde_json::to_vec(&listing)
        .map_err(|_| invalid("Could not index listing"))?
        .len();
      if catalog_bytes > 64 * 1024 * 1024 {
        return Err(invalid(
          "Catalog exceeded its 64 MiB normalized snapshot budget",
        ));
      }
      listings.push(listing);
    }
    let continuation = if is_static {
      page
        .next_url
        .map(|value| {
          resolve_url(
            &next_url,
            &value,
            &source.descriptor.network_origins.api,
            source.allow_local_network,
          )
        })
        .transpose()?
    } else {
      match page.next_cursor {
        CatalogCursor::Missing => {
          return Err(invalid(
            "Native API pages must explicitly terminate with nextCursor: null",
          ));
        }
        CatalogCursor::Done => None,
        CatalogCursor::Next(cursor) => {
          if cursor.is_empty() || cursor.len() > 8192 {
            return Err(invalid("API cursor is empty or exceeds its safety limit"));
          }
          let mut url = initial_url.clone();
          url
            .query_pairs_mut()
            .append_pair("cursor", &cursor)
            .append_pair("limit", "100");
          Some(url)
        }
      }
    };
    match continuation {
      Some(url) => next_url = url,
      None => return Ok(listings),
    }
  }
  Err(invalid(
    "Catalog pagination exceeded its 100-page budget; previous catalog retained",
  ))
}

/// Validated templates are stored joined to their base URL, which percent-
/// encodes the braces, so both spellings are expanded.
fn expand_listing_template(template: &str, listing_id: &str) -> String {
  let id = urlencoding::encode(listing_id);
  template
    .replace("%7BlistingId%7D", &id)
    .replace("{listingId}", &id)
}

async fn fetch_release_history(
  source: &NativeSourceSummary,
  initial_url: Url,
) -> Result<Vec<NativeSourceRelease>, Error> {
  let mut next_url = initial_url.clone();
  let mut visited = HashSet::new();
  let mut releases = Vec::new();
  let mut ids = HashSet::new();
  for _ in 0..MAX_HISTORY_PAGES {
    if !visited.insert(next_url.to_string()) {
      return Err(invalid("Release history pagination repeated a cursor"));
    }
    let page: ReleaseHistoryPage = fetch_json(&next_url, source.allow_local_network).await?;
    if releases.len() + page.items.len() > MAX_HISTORY_RELEASES {
      return Err(invalid("Release history exceeds the 500-release limit"));
    }
    for mut release in page.items {
      validate_release(&mut release, &next_url, source)?;
      if !ids.insert(release.id.clone()) {
        return Err(invalid("Release IDs must be unique within a history"));
      }
      releases.push(release);
    }
    match page.next_cursor {
      CatalogCursor::Missing => {
        return Err(invalid(
          "Release history pages must explicitly terminate with nextCursor: null",
        ));
      }
      CatalogCursor::Done => return Ok(releases),
      CatalogCursor::Next(cursor) => {
        if cursor.is_empty() || cursor.len() > 8192 {
          return Err(invalid("API cursor is empty or exceeds its safety limit"));
        }
        next_url = initial_url.clone();
        next_url
          .query_pairs_mut()
          .append_pair("cursor", &cursor)
          .append_pair("limit", "100");
      }
    }
  }
  Err(invalid("Release history exceeded its 20-page budget"))
}

fn validate_revision_invariants(
  previous: &[NativeSourceListing],
  next: &[NativeSourceListing],
) -> Result<(), Error> {
  for listing in next {
    let Some(old) = previous
      .iter()
      .find(|old| old.id == listing.id)
      .and_then(|listing| listing.release.as_ref())
    else {
      continue;
    };
    let Some(new) = &listing.release else {
      continue;
    };
    if old.id == new.id && old.content_revision == new.content_revision {
      // Transport URLs may rotate and metadata may change. Installation meaning
      // and any supplied byte evidence must not change under the same revision.
      let evidence = |release: &NativeSourceRelease| -> Result<Vec<u8>, Error> {
        let artifacts: Vec<_> = release
          .artifacts
          .iter()
          .map(|artifact| {
            (
              &artifact.id,
              &artifact.filename,
              &artifact.format,
              artifact.size,
              &artifact.hashes,
            )
          })
          .collect();
        let installation = &release.installation;
        let components: Vec<_> = installation
          .components
          .iter()
          .map(|component| (&component.id, &component.files))
          .collect();
        let groups: Vec<_> = installation
          .choice_groups
          .iter()
          .map(|group| {
            (
              &group.id,
              group.min_selections,
              group.max_selections,
              &group.component_ids,
              &group.default_component_ids,
            )
          })
          .collect();
        serde_json::to_vec(&(
          artifacts,
          &installation.mode,
          components,
          &installation.required_components,
          groups,
        ))
        .map_err(|_| invalid("Could not compare release revisions"))
      };
      if evidence(old)? != evidence(new)? {
        return Err(invalid(
          "Installable content changed without a new contentRevision",
        ));
      }
    }
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[tokio::test]
  async fn corrupt_source_state_is_unavailable_without_overwriting_original_bytes() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("native-sources-v1.json");
    let original = b"{ interrupted catalog write";
    std::fs::write(&path, original).unwrap();
    let manager = NativeSourceManager::open(path.clone()).unwrap();
    let error = manager.list().await.unwrap_err().to_string();
    assert!(error.contains("Restore or repair"));
    assert!(
      manager
        .preview("https://example.org/source.json", false)
        .await
        .is_err()
    );
    assert!(manager.remove("missing").await.is_err());
    assert!(manager.set_enabled("missing", true).await.is_err());
    assert_eq!(std::fs::read(path).unwrap(), original);
  }
}
