use std::collections::HashSet;

use crate::errors::Error;
use reqwest::Url;

use super::network::{invalid, resolve_url, validate_source_url};
use super::types::*;

pub(super) fn validate_id(value: &str) -> Result<(), Error> {
  if value.is_empty() || value.len() > 256 || value.chars().any(char::is_control) {
    return Err(invalid(
      "IDs must contain 1–256 characters without control characters",
    ));
  }
  Ok(())
}

fn validate_text(value: &str, max: usize) -> Result<(), Error> {
  if value.is_empty() || value.len() > max || value.contains('\0') {
    return Err(invalid(
      "Required text is empty or exceeds its safety limit",
    ));
  }
  Ok(())
}

pub(super) fn validate_descriptor(
  mut descriptor: NativeSourceDescriptor,
  url: &Url,
  allow_local: bool,
) -> Result<NativeSourceDescriptor, Error> {
  if descriptor.format != "dmm-source"
    || descriptor.protocol_version != "1.0"
    || descriptor.game_id != "deadlock"
  {
    return Err(invalid(
      "Unsupported format, protocol version or game (expected dmm-source 1.0 / deadlock)",
    ));
  }
  validate_id(&descriptor.source_id)?;
  validate_text(&descriptor.name, 256)?;
  for origins in [
    &mut descriptor.network_origins.api,
    &mut descriptor.network_origins.downloads,
    &mut descriptor.network_origins.media,
  ] {
    if origins.len() > 16 {
      return Err(invalid(
        "A source may declare at most 16 origins per operation",
      ));
    }
    for origin in origins.iter_mut() {
      let parsed = validate_source_url(origin, allow_local)?;
      if parsed.path() != "/" || parsed.query().is_some() {
        return Err(invalid(
          "Network origins must not contain paths or query strings",
        ));
      }
      *origin = parsed.origin().ascii_serialization();
    }
    origins.sort();
    origins.dedup();
  }
  if descriptor.network_origins.api.is_empty() || descriptor.network_origins.downloads.is_empty() {
    return Err(invalid("API and download origins are required"));
  }
  match &mut descriptor.catalog {
    NativeSourceCatalog::Static { index_url } => {
      *index_url =
        resolve_url(url, index_url, &descriptor.network_origins.api, allow_local)?.to_string();
    }
    NativeSourceCatalog::Api {
      list_url,
      detail_url_template,
      release_url_template,
    } => {
      *list_url =
        resolve_url(url, list_url, &descriptor.network_origins.api, allow_local)?.to_string();
      for template in [detail_url_template, release_url_template]
        .into_iter()
        .flatten()
      {
        let expanded = template
          .replace("{listingId}", "example")
          .replace("{releaseId}", "example");
        resolve_url(url, &expanded, &descriptor.network_origins.api, allow_local)?;
        *template = url
          .join(template)
          .map_err(|_| invalid("Invalid API template"))?
          .to_string();
      }
    }
  }
  if let Some(capabilities) = &descriptor.capabilities {
    if capabilities.dependencies
      || capabilities.release_history
      || capabilities.comments
      || capabilities.changelog
    {
      return Err(invalid(
        "Dependencies, history, comments and changelog operations are not supported by this native-source slice",
      ));
    }
    if capabilities
      .search
      .as_deref()
      .is_some_and(|value| !["local", "server", "none"].contains(&value))
    {
      return Err(invalid("Unsupported search capability"));
    }
  }
  if let Some(icon) = &mut descriptor.icon_url {
    let parsed = resolve_url(url, icon, &descriptor.network_origins.media, allow_local)?;
    let path = parsed.path().to_ascii_lowercase();
    if ![".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico"]
      .iter()
      .any(|suffix| path.ends_with(suffix))
    {
      return Err(invalid(
        "Source icon must be a raster image (PNG, JPEG, WebP, GIF or ICO)",
      ));
    }
    *icon = parsed.to_string();
  }
  if let Some(homepage) = &mut descriptor.homepage_url {
    *homepage = validate_source_url(
      url
        .join(homepage)
        .map_err(|_| invalid("Invalid homepage URL"))?
        .as_str(),
      allow_local,
    )?
    .to_string();
  }
  Ok(descriptor)
}

pub(super) fn normalize_listing(
  listing: &mut NativeSourceListing,
  base: &Url,
  source: &NativeSourceSummary,
) -> Result<(), Error> {
  validate_id(&listing.id)?;
  validate_text(&listing.title, 1024)?;
  if listing
    .description
    .as_ref()
    .is_some_and(|value| value.len() > 512 * 1024)
    || listing
      .author
      .as_ref()
      .is_some_and(|value| value.len() > 1024)
    || listing.tags.len() > 100
    || listing.images.len() > 32
  {
    return Err(invalid("Listing metadata exceeds its safety limits"));
  }
  if listing
    .updated_at
    .as_ref()
    .is_some_and(|value| chrono::DateTime::parse_from_rfc3339(value).is_err())
  {
    return Err(invalid("Listing updatedAt must be an RFC 3339 timestamp"));
  }
  listing.remote_id = super::listing_slug(&source.key, &listing.id);
  let origins = &source.descriptor.network_origins;
  for field in [&mut listing.detail_url, &mut listing.release_url]
    .into_iter()
    .flatten()
  {
    *field = resolve_url(base, field, &origins.api, source.allow_local_network)?.to_string();
  }
  for image in &mut listing.images {
    *image = resolve_url(base, image, &origins.media, source.allow_local_network)?.to_string();
  }
  if let Some(homepage) = &mut listing.homepage_url {
    *homepage = validate_source_url(
      base
        .join(homepage)
        .map_err(|_| invalid("Invalid listing homepage"))?
        .as_str(),
      source.allow_local_network,
    )?
    .to_string();
  }
  if let Some(release) = &mut listing.release {
    validate_release(release, base, source)?;
  }
  Ok(())
}

pub(super) fn validate_release(
  release: &mut NativeSourceRelease,
  base: &Url,
  source: &NativeSourceSummary,
) -> Result<(), Error> {
  if !release.dependencies.is_empty() {
    return Err(invalid(
      "Dependency installation plans are not supported in this native-source slice",
    ));
  }
  validate_id(&release.id)?;
  validate_id(&release.content_revision)?;
  if release.artifacts.is_empty() || release.artifacts.len() > 100 {
    return Err(invalid(
      "A release must contain between 1 and 100 artifacts",
    ));
  }
  let mut artifact_ids = HashSet::new();
  let mut filenames = HashSet::new();
  for artifact in &mut release.artifacts {
    validate_id(&artifact.id)?;
    if !artifact_ids.insert(artifact.id.clone())
      || !filenames.insert(artifact.filename.to_lowercase())
    {
      return Err(invalid(
        "Artifact IDs and filenames must be unique within a release",
      ));
    }
    if artifact.filename.is_empty()
      || artifact.filename.len() > 255
      || artifact
        .filename
        .contains(['/', '\\', ':', '<', '>', '"', '|', '?', '*'])
      || artifact.filename.chars().any(char::is_control)
      || artifact.filename == "."
      || artifact.filename == ".."
      || artifact.filename.ends_with(['.', ' '])
    {
      return Err(invalid("Artifact filename must be a safe basename"));
    }
    let stem = artifact
      .filename
      .split('.')
      .next()
      .unwrap_or_default()
      .to_ascii_uppercase();
    if ["CON", "PRN", "AUX", "NUL"].contains(&stem.as_str())
      || (stem.len() == 4
        && (stem.starts_with("COM") || stem.starts_with("LPT"))
        && matches!(stem.as_bytes()[3], b'1'..=b'9'))
    {
      return Err(invalid("Artifact filename is reserved on Windows"));
    }
    if !["zip", "rar", "7z", "vpk"].contains(&artifact.format.as_str())
      || !artifact
        .filename
        .ends_with(&format!(".{}", artifact.format))
    {
      return Err(invalid(
        "Native artifact format must be vpk, zip, rar, or 7z with a matching lowercase extension",
      ));
    }
    let origins = &source.descriptor.network_origins;
    match (
      &mut artifact.download.url,
      &mut artifact.download.resolver_url,
    ) {
      (Some(url), None) => {
        *url = resolve_url(base, url, &origins.downloads, source.allow_local_network)?.to_string()
      }
      (None, Some(url)) => {
        *url = resolve_url(base, url, &origins.api, source.allow_local_network)?.to_string()
      }
      _ => {
        return Err(invalid(
          "An artifact needs exactly one download URL or resolver URL",
        ));
      }
    }
    if let Some(hashes) = &artifact.hashes {
      for (value, length) in [(&hashes.sha256, 64), (&hashes.md5, 32)] {
        if value.as_ref().is_some_and(|value| {
          value.len() != length || !value.bytes().all(|b| b.is_ascii_hexdigit())
        }) {
          return Err(invalid("Invalid artifact hash"));
        }
      }
      if hashes.sha256.is_none() && hashes.md5.is_none() {
        return Err(invalid("An empty hashes object does not verify content"));
      }
    }
  }
  validate_installation(&release.installation, &artifact_ids)
}

fn validate_installation(
  installation: &NativeSourceInstallation,
  artifact_ids: &HashSet<String>,
) -> Result<(), Error> {
  if installation.mode == "manual" {
    if !installation.components.is_empty()
      || !installation.required_components.is_empty()
      || !installation.choice_groups.is_empty()
    {
      return Err(invalid(
        "Manual installation cannot also declare component choices",
      ));
    }
    return Ok(());
  }
  if installation.mode != "components"
    || installation.components.is_empty()
    || installation.components.len() > 500
    || installation.choice_groups.len() > 100
  {
    return Err(invalid("Unsupported or unbounded installation plan"));
  }
  let mut component_ids = HashSet::new();
  for component in &installation.components {
    validate_id(&component.id)?;
    validate_text(&component.label, 1024)?;
    if !component_ids.insert(component.id.clone())
      || component.files.is_empty()
      || component.files.len() > 500
    {
      return Err(invalid(
        "Components need unique IDs and bounded, nonempty file sets",
      ));
    }
    for file in &component.files {
      if !artifact_ids.contains(&file.artifact_id)
        || file.path.is_empty()
        || file.path.len() > 4096
        || file.path.contains(['\\', ':'])
        || file.path.chars().any(char::is_control)
        || file
          .path
          .split('/')
          .any(|part| part.is_empty() || part == "." || part == "..")
        || !file.path.to_ascii_lowercase().ends_with(".vpk")
      {
        return Err(invalid(
          "Component files must reference artifacts and exact safe VPK paths",
        ));
      }
    }
  }
  let mut assigned = HashSet::new();
  for id in &installation.required_components {
    if !component_ids.contains(id) || !assigned.insert(id.clone()) {
      return Err(invalid("Required component is missing or repeated"));
    }
  }
  let mut groups = HashSet::new();
  for group in &installation.choice_groups {
    validate_id(&group.id)?;
    if !groups.insert(&group.id)
      || group.min_selections > group.max_selections
      || group.max_selections > group.component_ids.len()
    {
      return Err(invalid("Choice group IDs or selection bounds are invalid"));
    }
    let mut members = HashSet::new();
    for id in &group.component_ids {
      if !component_ids.contains(id) || !members.insert(id) || !assigned.insert(id.clone()) {
        return Err(invalid(
          "A component must belong to exactly one required set or choice group",
        ));
      }
    }
    let defaults: HashSet<_> = group.default_component_ids.iter().collect();
    if defaults.len() != group.default_component_ids.len()
      || defaults.len() < group.min_selections
      || defaults.len() > group.max_selections
      || !defaults.is_subset(&members)
    {
      return Err(invalid(
        "Choice group defaults do not satisfy its selection rules",
      ));
    }
  }
  if assigned != component_ids {
    return Err(invalid(
      "Every component must belong to the required set or one choice group",
    ));
  }
  Ok(())
}
