use crate::errors::Error;
use crate::providers::gamebanana::catalog::{CatalogCollection, CatalogPage, CatalogRecord};
use crate::providers::gamebanana::{
  NormalizedSubmission, Profile, SubmissionFile, donation_links, extract_map_name,
  parse_requirements, parse_tags,
};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct CatalogModDto {
  pub id: String,
  pub remote_id: String,
  pub name: String,
  pub description: Option<String>,
  pub remote_url: String,
  pub category: String,
  #[ts(type = "number")]
  pub likes: u64,
  pub author: String,
  pub author_remote_id: Option<String>,
  pub downloadable: bool,
  #[ts(type = "number")]
  pub remote_added_at: i64,
  #[ts(type = "number")]
  pub remote_updated_at: i64,
  pub tags: Vec<String>,
  pub images: Vec<String>,
  pub thumbnail_url: Option<String>,
  pub hero: Option<String>,
  pub is_audio: bool,
  pub is_map: bool,
  pub audio_url: Option<String>,
  #[ts(type = "number")]
  pub download_count: u64,
  pub is_nsfw: bool,
  pub is_obsolete: bool,
  #[ts(type = "number | null")]
  pub files_updated_at: Option<i64>,
  pub development_state: Option<String>,
  pub completion_percentage: Option<u8>,
  pub metadata: Option<CatalogModMetadataDto>,
  pub dependencies: Vec<CatalogDependencyDto>,
  #[ts(type = "number | null")]
  pub created_at: Option<i64>,
  #[ts(type = "number | null")]
  pub updated_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct CatalogCollectionDto {
  pub id: String,
  pub name: String,
  pub description: String,
  pub profile_url: String,
  pub cover_url: Option<String>,
  pub author: String,
  pub author_remote_id: Option<String>,
  pub author_avatar_url: Option<String>,
  #[ts(type = "number")]
  pub item_count: i64,
  #[ts(type = "number")]
  pub likes: i64,
  pub is_nsfw: bool,
  pub is_featured: bool,
  #[ts(type = "number")]
  pub remote_updated_at: i64,
  /// False until the sync has crawled this collection's items.
  pub items_synced: bool,
  /// Thumbnails of the first few mods, to build a cover when `cover_url` is missing.
  pub preview_images: Vec<String>,
  /// Heroes the collection's mods are for, most common first.
  pub heroes: Vec<String>,
}

impl CatalogCollectionDto {
  pub fn new(
    collection: &CatalogCollection,
    is_featured: bool,
    preview_images: Vec<String>,
    heroes: Vec<String>,
  ) -> Self {
    Self {
      id: collection.collection_id.clone(),
      name: collection.name.clone(),
      description: collection.description.clone(),
      profile_url: collection.profile_url.clone(),
      cover_url: collection.cover_url.clone(),
      author: collection.author.clone(),
      author_remote_id: collection.author_remote_id.clone(),
      author_avatar_url: collection.author_avatar_url.clone(),
      item_count: collection.item_count,
      likes: collection.likes,
      is_nsfw: collection.is_nsfw,
      is_featured,
      remote_updated_at: collection.remote_updated_at,
      items_synced: collection.items_synced_at.is_some(),
      preview_images,
      heroes,
    }
  }
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct CatalogCollectionDetailDto {
  pub collection: CatalogCollectionDto,
  /// GameBanana markup describing the collection.
  pub text: String,
  /// Remote ids of the collection's mods, sounds, and WIPs in collection order.
  pub items: Vec<String>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct CatalogModMetadataDto {
  pub map_name: Option<String>,
  pub donation_links: Vec<CatalogDonationLinkDto>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct CatalogDonationLinkDto {
  pub url: String,
  pub platform: String,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct CatalogDependencyDto {
  pub label: String,
  pub url: Option<String>,
  pub remote_id: Option<String>,
  pub level: Option<String>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct CatalogPageDto {
  pub items: Vec<CatalogModDto>,
  #[ts(type = "number")]
  pub total: u64,
  pub page: u32,
  pub page_size: u32,
  pub stale: bool,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct CatalogDownloadDto {
  pub file_id: String,
  #[ts(type = "number")]
  pub size: u64,
  pub name: String,
  pub description: Option<String>,
  #[ts(type = "number | null")]
  pub created_at: Option<i64>,
  #[ts(type = "number | null")]
  pub updated_at: Option<i64>,
  pub md5_checksum: Option<String>,
  /// The author superseded this file with a newer one.
  pub is_archived: bool,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct CatalogDownloadsDto {
  pub downloads: Vec<CatalogDownloadDto>,
  #[ts(type = "number")]
  pub count: u64,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct CatalogSyncStatusDto {
  pub sync_phase: Option<String>,
  pub sync_percentage: Option<u32>,
  pub available: bool,
  #[ts(type = "number")]
  pub count: u64,
  pub stale: bool,
  #[ts(type = "number | null")]
  pub last_incremental_at: Option<u64>,
  #[ts(type = "number | null")]
  pub last_full_sync_at: Option<u64>,
  pub outcome: Option<String>,
  pub unavailable_reason: Option<String>,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct InstalledSubmissionDto {
  pub remote_id: String,
  #[ts(type = "number")]
  pub installed_at: i64,
  #[serde(default)]
  pub selected_file_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct CatalogUpdateDto {
  pub r#mod: CatalogModDto,
  /// Unix seconds of the change that triggered this update.
  #[ts(type = "number")]
  pub updated_at: i64,
  pub downloads: Vec<CatalogDownloadDto>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct CatalogUpdatesDto {
  pub updates: Vec<CatalogUpdateDto>,
  pub unknown: Vec<String>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct GameBananaFileserverDto {
  pub id: String,
  pub provider: String,
  pub domain: String,
  pub name: String,
  pub state: String,
  pub url_template: String,
  pub stats: Option<GameBananaFileserverStatsDto>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct GameBananaFileserverStatsDto {
  #[ts(type = "number")]
  pub rate_bytes: u64,
  #[ts(type = "number")]
  pub requests_per_hour: u64,
}

impl CatalogModDto {
  pub fn from_record(record: CatalogRecord) -> Result<Self, Error> {
    let slug = record
      .submission
      .to_slug()
      .map_err(|error| Error::InvalidInput(error.to_string()))?;
    Ok(Self {
      id: slug.clone(),
      remote_id: slug,
      name: record.name,
      description: (!record.description.is_empty()).then_some(record.description),
      remote_url: record.profile_url,
      category: record.category,
      likes: record.likes,
      author: record.author,
      author_remote_id: record.author_remote_id,
      downloadable: record.has_files,
      remote_added_at: record.remote_added_at,
      remote_updated_at: record.remote_updated_at,
      tags: record.tags,
      images: record.images,
      thumbnail_url: record.thumbnail_url,
      hero: record.hero,
      is_audio: record.is_audio,
      is_map: record.is_map,
      audio_url: record.audio_url,
      download_count: record.download_count,
      is_nsfw: record.is_nsfw,
      is_obsolete: record.is_obsolete,
      files_updated_at: (record.files_updated_at > 0).then_some(record.files_updated_at),
      development_state: record.development_state,
      completion_percentage: record.completion_percentage,
      metadata: None,
      dependencies: Vec::new(),
      created_at: None,
      updated_at: None,
    })
  }

  pub fn from_profile(profile: &Profile, normalized: NormalizedSubmission) -> Self {
    let images = profile.preview_media.image_urls();
    let dependencies = parse_requirements(&profile.requirements)
      .into_iter()
      .map(|dependency| CatalogDependencyDto {
        label: dependency.label,
        url: dependency.url,
        remote_id: dependency.remote_id,
        level: dependency.level,
      })
      .collect();
    let donations = donation_links(
      profile
        .submitter
        .as_ref()
        .map(|submitter| submitter.donation_methods.as_slice())
        .unwrap_or_default(),
      &normalized.description,
    )
    .into_iter()
    .map(|link| CatalogDonationLinkDto {
      url: link.url,
      platform: link.platform,
    })
    .collect();
    let files_updated_at = profile
      .files
      .iter()
      .filter_map(|file| file.date_added)
      .max();
    Self {
      id: normalized.slug.clone(),
      remote_id: normalized.slug,
      name: normalized.name,
      description: (!normalized.description.is_empty()).then_some(normalized.description.clone()),
      remote_url: profile.profile_url.clone(),
      category: normalized.category,
      likes: normalized.likes,
      author: normalized.author,
      author_remote_id: profile
        .submitter
        .as_ref()
        .and_then(|submitter| (submitter.id > 0).then(|| submitter.id.to_string())),
      downloadable: !profile.files.is_empty(),
      remote_added_at: normalized.remote_added_at,
      remote_updated_at: normalized.remote_updated_at,
      tags: parse_tags(&profile.tags),
      images,
      thumbnail_url: profile.preview_media.thumbnail_url(),
      hero: normalized.hero,
      is_audio: normalized.is_audio,
      is_map: normalized.is_map,
      audio_url: profile.preview_media.audio_url(),
      download_count: normalized.download_count,
      is_nsfw: normalized.is_nsfw,
      is_obsolete: normalized.is_obsolete,
      files_updated_at,
      development_state: profile.development_state.clone(),
      completion_percentage: profile.completion_percentage,
      metadata: Some(CatalogModMetadataDto {
        map_name: extract_map_name(&normalized.description),
        donation_links: donations,
      }),
      dependencies,
      created_at: None,
      updated_at: None,
    }
  }
}

impl CatalogPageDto {
  pub fn from_page(page: CatalogPage, stale: bool) -> Result<Self, Error> {
    Ok(Self {
      items: page
        .items
        .into_iter()
        .map(CatalogModDto::from_record)
        .collect::<Result<Vec<_>, _>>()?,
      total: page.total,
      page: page.page,
      page_size: page.page_size,
      stale,
    })
  }
}

impl From<SubmissionFile> for CatalogDownloadDto {
  fn from(file: SubmissionFile) -> Self {
    Self {
      file_id: file.id.to_string(),
      size: file.size,
      name: file.name,
      description: file
        .description
        .filter(|description| !description.trim().is_empty()),
      created_at: file.date_added,
      updated_at: file.date_added,
      md5_checksum: file.md5,
      is_archived: file.is_archived,
    }
  }
}
