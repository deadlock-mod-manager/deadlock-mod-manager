use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct NativeSourceDescriptor {
  pub format: String,
  pub protocol_version: String,
  pub source_id: String,
  pub name: String,
  pub game_id: String,
  pub icon_url: Option<String>,
  pub homepage_url: Option<String>,
  pub catalog: NativeSourceCatalog,
  pub network_origins: NativeSourceOrigins,
  pub capabilities: Option<NativeSourceCapabilities>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(
  tag = "kind",
  rename_all = "lowercase",
  rename_all_fields = "camelCase"
)]
pub enum NativeSourceCatalog {
  Static {
    index_url: String,
  },
  Api {
    list_url: String,
    detail_url_template: Option<String>,
    release_url_template: Option<String>,
    release_history_url_template: Option<String>,
  },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export)]
pub struct NativeSourceOrigins {
  pub api: Vec<String>,
  pub downloads: Vec<String>,
  #[serde(default)]
  pub media: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct NativeSourceCapabilities {
  pub search: Option<String>,
  #[serde(default)]
  pub release_history: bool,
  #[serde(default)]
  pub installation_choices: bool,
  #[serde(default)]
  pub dependencies: bool,
  #[serde(default)]
  pub comments: bool,
  #[serde(default)]
  pub changelog: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct NativeSourceSummary {
  pub key: String,
  pub preview_token: String,
  pub descriptor_url: String,
  pub accepted_origin: String,
  pub descriptor: NativeSourceDescriptor,
  pub enabled: bool,
  pub removed: bool,
  pub allow_local_network: bool,
  pub last_sync: Option<String>,
  pub last_error: Option<String>,
  pub listing_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct NativeSourceListing {
  #[serde(default)]
  pub remote_id: String,
  pub id: String,
  #[serde(default)]
  pub title: String,
  pub availability: NativeSourceAvailability,
  pub detail_url: Option<String>,
  pub description: Option<String>,
  pub author: Option<String>,
  pub hero: Option<String>,
  pub content_type: Option<String>,
  pub is_nsfw: Option<bool>,
  #[serde(default)]
  pub tags: Vec<String>,
  #[serde(default)]
  pub images: Vec<String>,
  pub homepage_url: Option<String>,
  pub updated_at: Option<String>,
  pub release: Option<NativeSourceRelease>,
  pub release_url: Option<String>,
  pub release_history_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "lowercase")]
pub enum NativeSourceAvailability {
  Available,
  Unavailable,
  Removed,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct NativeSourceRelease {
  pub id: String,
  pub content_revision: String,
  pub version: Option<String>,
  pub published_at: Option<String>,
  pub changelog: Option<String>,
  pub artifacts: Vec<NativeSourceArtifact>,
  pub installation: NativeSourceInstallation,
  #[serde(default, skip_serializing_if = "Vec::is_empty")]
  #[ts(skip)]
  pub dependencies: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct NativeSourceArtifact {
  pub id: String,
  pub filename: String,
  pub format: String,
  pub download: NativeSourceDownload,
  #[ts(type = "number | null")]
  pub size: Option<u64>,
  pub hashes: Option<NativeSourceHashes>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct NativeSourceDownload {
  pub url: Option<String>,
  pub resolver_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(deny_unknown_fields)]
pub struct NativeSourceHashes {
  pub sha256: Option<String>,
  pub md5: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct NativeSourceInstallation {
  pub mode: String,
  #[serde(default)]
  pub components: Vec<NativeSourceComponent>,
  #[serde(default)]
  pub required_components: Vec<String>,
  #[serde(default)]
  pub choice_groups: Vec<NativeSourceChoiceGroup>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct NativeSourceComponent {
  pub id: String,
  pub label: String,
  pub files: Vec<NativeSourceComponentFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct NativeSourceComponentFile {
  pub artifact_id: String,
  pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct NativeSourceChoiceGroup {
  pub id: String,
  pub label: String,
  pub min_selections: usize,
  pub max_selections: usize,
  pub component_ids: Vec<String>,
  pub default_component_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct NativeSourceProvenance {
  pub source_key: String,
  pub source_id: String,
  pub source_name: String,
  pub accepted_origin: String,
  pub descriptor_url: String,
  pub listing_id: String,
  pub release_id: String,
  pub content_revision: String,
  pub artifact_ids: Vec<String>,
  pub component_ids: Vec<String>,
  pub icon_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct NativeSourceMod {
  pub remote_id: String,
  pub source: NativeSourceSummary,
  pub listing: NativeSourceListing,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct NativeSourceBackupEntry {
  pub mod_id: String,
  pub source: NativeSourceProvenance,
}

#[derive(Debug, Clone)]
pub struct ResolvedNativeArtifact {
  pub url: String,
  pub filename: String,
  pub size: Option<u64>,
  pub hashes: Option<NativeSourceHashes>,
  pub allowed_origins: Vec<String>,
  pub allow_local_network: bool,
}

#[derive(Debug, Clone)]
pub struct NativeArtifactReference {
  pub source_key: String,
  pub listing_id: String,
  pub release_id: String,
  pub content_revision: String,
  pub artifact_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CatalogPage {
  pub snapshot_id: Option<String>,
  pub items: Vec<NativeSourceListing>,
  pub next_url: Option<String>,
  #[serde(default)]
  pub next_cursor: CatalogCursor,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ReleaseHistoryPage {
  pub items: Vec<NativeSourceRelease>,
  #[serde(default)]
  pub next_cursor: CatalogCursor,
}

#[derive(Debug, Default)]
pub(super) enum CatalogCursor {
  #[default]
  Missing,
  Done,
  Next(String),
}

impl<'de> Deserialize<'de> for CatalogCursor {
  fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
    Ok(match Option::<String>::deserialize(deserializer)? {
      Some(cursor) => Self::Next(cursor),
      None => Self::Done,
    })
  }
}
