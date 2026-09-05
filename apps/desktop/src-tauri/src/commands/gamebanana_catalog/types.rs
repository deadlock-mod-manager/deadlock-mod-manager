use crate::providers::gamebanana::catalog::{CatalogPage, CatalogRecord};
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
  pub downloadable: bool,
  #[ts(type = "number")]
  pub remote_added_at: i64,
  #[ts(type = "number")]
  pub remote_updated_at: i64,
  pub tags: Vec<String>,
  pub images: Vec<String>,
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
  pub fn from_record(record: CatalogRecord) -> Self {
    let slug = record.submission.to_slug();
    Self {
      id: slug.clone(),
      remote_id: slug,
      name: record.name,
      description: (!record.description.is_empty()).then_some(record.description),
      remote_url: record.profile_url,
      category: record.category,
      likes: record.likes,
      author: record.author,
      downloadable: record.has_files,
      remote_added_at: record.remote_added_at,
      remote_updated_at: record.remote_updated_at,
      tags: Vec::new(),
      images: Vec::new(),
      hero: record.hero,
      is_audio: record.is_audio,
      is_map: record.is_map,
      audio_url: None,
      download_count: record.download_count,
      is_nsfw: record.is_nsfw,
      is_obsolete: record.is_obsolete,
      files_updated_at: (record.files_updated_at > 0).then_some(record.files_updated_at),
      metadata: None,
      dependencies: Vec::new(),
      created_at: None,
      updated_at: None,
    }
  }

  pub fn from_profile(profile: &Profile, normalized: NormalizedSubmission) -> Self {
    let images = profile
      .preview_media
      .images
      .iter()
      .filter_map(|image| image_url(&image.base_url, &image.file))
      .collect();
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
      downloadable: !profile.files.is_empty(),
      remote_added_at: normalized.remote_added_at,
      remote_updated_at: normalized.remote_updated_at,
      tags: parse_tags(&profile.tags),
      images,
      hero: normalized.hero,
      is_audio: normalized.is_audio,
      is_map: normalized.is_map,
      audio_url: profile.preview_media.metadata.audio_url.clone(),
      download_count: normalized.download_count,
      is_nsfw: normalized.is_nsfw,
      is_obsolete: normalized.is_obsolete,
      files_updated_at,
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
  pub fn from_page(page: CatalogPage, stale: bool) -> Self {
    Self {
      items: page
        .items
        .into_iter()
        .map(CatalogModDto::from_record)
        .collect(),
      total: page.total,
      page: page.page,
      page_size: page.page_size,
      stale,
    }
  }
}

impl From<SubmissionFile> for CatalogDownloadDto {
  fn from(file: SubmissionFile) -> Self {
    Self {
      file_id: file.id.to_string(),
      size: file.size,
      name: file.name,
      description: None,
      created_at: file.date_added,
      updated_at: file.date_added,
      md5_checksum: file.md5,
    }
  }
}

fn image_url(base_url: &str, file: &str) -> Option<String> {
  if !base_url.starts_with("https://") || file.is_empty() {
    return None;
  }
  Some(format!(
    "{}/{}",
    base_url.trim_end_matches('/'),
    file.trim_start_matches('/')
  ))
}
