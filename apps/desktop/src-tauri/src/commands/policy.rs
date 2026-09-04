use super::gamebanana_catalog::{CatalogDonationLinkDto, CatalogModDto, CatalogModMetadataDto};
use crate::errors::Error;
use crate::providers::{SubmissionProvider, SubmissionRef, SubmissionType};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::RwLock;
use std::time::Duration;
use tauri::State;

const POLICY_SCHEMA_VERSION: u32 = 1;
const MAX_POLICY_BYTES: usize = 2 * 1024 * 1024;
const MAX_POLICY_RULES: usize = 10_000;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PolicyMetadataCorrection {
  pub name: Option<String>,
  pub description: Option<String>,
  pub category: Option<String>,
  pub hero: Option<String>,
  pub is_map: Option<bool>,
  pub is_audio: Option<bool>,
  #[serde(rename = "isNSFW")]
  pub is_nsfw: Option<bool>,
  pub is_obsolete: Option<bool>,
  pub tags: Option<Vec<String>>,
  pub metadata: Option<PolicyMetadata>,
  pub downloads: Option<Vec<PolicyDownloadCorrection>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PolicyMetadata {
  pub map_name: Option<String>,
  pub donation_links: Option<Vec<PolicyDonationLink>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PolicyDonationLink {
  pub url: String,
  pub platform: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PolicyDownloadCorrection {
  pub url: String,
  pub file: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum PolicyRuleKind {
  Hidden,
  Blacklisted,
  Takedown,
  MetadataCorrection,
  EmergencyDisable,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PolicyRule {
  pub provider: SubmissionProvider,
  pub submission_type: SubmissionType,
  pub submission_id: String,
  pub kind: PolicyRuleKind,
  pub reason: Option<String>,
  pub correction: Option<PolicyMetadataCorrection>,
  pub updated_at: String,
}

impl PolicyRule {
  fn submission(&self) -> SubmissionRef {
    SubmissionRef {
      provider: self.provider,
      submission_type: self.submission_type,
      submission_id: self.submission_id.clone(),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PolicyManifest {
  pub version: u32,
  pub revision: u64,
  pub generated_at: String,
  pub rules: Vec<PolicyRule>,
}

impl Default for PolicyManifest {
  fn default() -> Self {
    Self {
      version: POLICY_SCHEMA_VERSION,
      revision: 0,
      generated_at: "1970-01-01T00:00:00Z".to_string(),
      rules: Vec::new(),
    }
  }
}

pub struct PolicyState {
  path: PathBuf,
  manifest: RwLock<PolicyManifest>,
  refresh_lock: tokio::sync::Mutex<()>,
}

impl PolicyState {
  pub fn open(path: PathBuf) -> Self {
    let manifest = load_best_manifest(&path).unwrap_or_else(|error| {
      log::warn!("Policy cache unavailable; continuing without policy: {error}");
      PolicyManifest::default()
    });
    Self {
      path,
      manifest: RwLock::new(manifest),
      refresh_lock: tokio::sync::Mutex::new(()),
    }
  }

  pub fn unavailable_slugs(&self) -> Result<Vec<String>, Error> {
    let manifest = self
      .manifest
      .read()
      .map_err(|_| Error::BackgroundTaskFailed("Policy lock poisoned".to_string()))?;
    Ok(
      manifest
        .rules
        .iter()
        .filter(|rule| {
          matches!(
            rule.kind,
            PolicyRuleKind::Hidden | PolicyRuleKind::Blacklisted | PolicyRuleKind::Takedown
          )
        })
        .map(|rule| rule.submission().to_slug())
        .collect(),
    )
  }

  pub fn apply_to_mod(&self, mod_data: &mut CatalogModDto) -> Result<bool, Error> {
    let manifest = self
      .manifest
      .read()
      .map_err(|_| Error::BackgroundTaskFailed("Policy lock poisoned".to_string()))?;
    let remote_id = mod_data.remote_id.clone();
    let rules = manifest
      .rules
      .iter()
      .filter(|rule| rule.submission().to_slug() == remote_id);
    for rule in rules {
      match rule.kind {
        PolicyRuleKind::Hidden | PolicyRuleKind::Blacklisted | PolicyRuleKind::Takedown => {
          return Ok(false);
        }
        PolicyRuleKind::EmergencyDisable => mod_data.downloadable = false,
        PolicyRuleKind::MetadataCorrection => {
          if let Some(correction) = &rule.correction {
            apply_correction(mod_data, correction);
          }
        }
      }
    }
    Ok(true)
  }

  pub fn ensure_download_allowed(&self, slug: &str) -> Result<(), Error> {
    let manifest = self
      .manifest
      .read()
      .map_err(|_| Error::BackgroundTaskFailed("Policy lock poisoned".to_string()))?;
    if manifest.rules.iter().any(|rule| {
      rule.submission().to_slug() == slug
        && matches!(
          rule.kind,
          PolicyRuleKind::Hidden
            | PolicyRuleKind::Blacklisted
            | PolicyRuleKind::Takedown
            | PolicyRuleKind::EmergencyDisable
        )
    }) {
      return Err(Error::InvalidInput(
        "This submission is unavailable by policy".to_string(),
      ));
    }
    Ok(())
  }

  async fn refresh(&self) -> Result<bool, Error> {
    let _refresh_guard = self.refresh_lock.lock().await;
    let base_url = super::state::get_api_url();
    let url = reqwest::Url::parse(&format!(
      "{}/api/v2/policy-manifest",
      base_url.trim_end_matches('/')
    ))
    .map_err(|_| Error::Network("Invalid policy API URL".to_string()))?;
    let client = crate::proxy::build_http_client(|builder| {
      builder
        .user_agent(concat!("DMM/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::limited(3))
    })?;
    let response = client
      .get(url)
      .send()
      .await
      .map_err(|error| Error::Network(error.to_string()))?;
    if !response.status().is_success() {
      return Err(Error::Network(format!(
        "Policy endpoint returned {}",
        response.status()
      )));
    }
    if response
      .content_length()
      .is_some_and(|length| length > MAX_POLICY_BYTES as u64)
    {
      return Err(Error::Network("Policy manifest is too large".to_string()));
    }
    let bytes = read_bounded_response(response, MAX_POLICY_BYTES).await?;
    let next = parse_manifest(&bytes)?;
    let current_revision = self
      .manifest
      .read()
      .map_err(|_| Error::BackgroundTaskFailed("Policy lock poisoned".to_string()))?
      .revision;
    if !should_replace(current_revision, next.revision) {
      return Ok(false);
    }

    write_manifest(&self.path, &next)?;
    *self
      .manifest
      .write()
      .map_err(|_| Error::BackgroundTaskFailed("Policy lock poisoned".to_string()))? = next;
    Ok(true)
  }
}

async fn read_bounded_response(
  mut response: reqwest::Response,
  max_bytes: usize,
) -> Result<Vec<u8>, Error> {
  let mut body = Vec::with_capacity(
    response
      .content_length()
      .and_then(|length| usize::try_from(length).ok())
      .unwrap_or_default()
      .min(max_bytes),
  );
  while let Some(chunk) = response
    .chunk()
    .await
    .map_err(|error| Error::Network(error.to_string()))?
  {
    if body.len().saturating_add(chunk.len()) > max_bytes {
      return Err(Error::Network("Policy manifest is too large".to_string()));
    }
    body.extend_from_slice(&chunk);
  }
  Ok(body)
}

fn should_replace(current_revision: u64, next_revision: u64) -> bool {
  next_revision >= current_revision
}

#[tauri::command]
pub async fn refresh_policy_manifest(state: State<'_, PolicyState>) -> Result<bool, Error> {
  state.refresh().await
}

fn apply_correction(mod_data: &mut CatalogModDto, correction: &PolicyMetadataCorrection) {
  if let Some(value) = &correction.name {
    mod_data.name.clone_from(value);
  }
  if let Some(value) = &correction.description {
    mod_data.description = Some(value.clone());
  }
  if let Some(value) = &correction.category {
    mod_data.category.clone_from(value);
  }
  if let Some(value) = &correction.hero {
    mod_data.hero = Some(value.clone());
  }
  if let Some(value) = correction.is_map {
    mod_data.is_map = value;
  }
  if let Some(value) = correction.is_audio {
    mod_data.is_audio = value;
  }
  if let Some(value) = correction.is_nsfw {
    mod_data.is_nsfw = value;
  }
  if let Some(value) = correction.is_obsolete {
    mod_data.is_obsolete = value;
  }
  if let Some(value) = &correction.tags {
    mod_data.tags.clone_from(value);
  }
  if let Some(metadata) = &correction.metadata {
    let current = mod_data
      .metadata
      .get_or_insert_with(|| CatalogModMetadataDto {
        map_name: None,
        donation_links: Vec::new(),
      });
    if let Some(map_name) = &metadata.map_name {
      current.map_name = Some(map_name.clone());
    }
    if let Some(links) = &metadata.donation_links {
      current.donation_links = links
        .iter()
        .map(|link| CatalogDonationLinkDto {
          url: link.url.clone(),
          platform: link.platform.clone(),
        })
        .collect();
    }
  }
}

fn parse_manifest(bytes: &[u8]) -> Result<PolicyManifest, Error> {
  let manifest: PolicyManifest = serde_json::from_slice(bytes)
    .map_err(|error| Error::InvalidInput(format!("Invalid policy manifest: {error}")))?;
  validate_manifest(&manifest)?;
  Ok(manifest)
}

fn validate_manifest(manifest: &PolicyManifest) -> Result<(), Error> {
  if manifest.version != POLICY_SCHEMA_VERSION || manifest.rules.len() > MAX_POLICY_RULES {
    return Err(Error::InvalidInput(
      "Unsupported or oversized policy manifest".to_string(),
    ));
  }
  chrono::DateTime::parse_from_rfc3339(&manifest.generated_at)
    .map_err(|_| Error::InvalidInput("Invalid policy generation time".to_string()))?;
  let mut identities = BTreeSet::new();
  for rule in &manifest.rules {
    chrono::DateTime::parse_from_rfc3339(&rule.updated_at)
      .map_err(|_| Error::InvalidInput("Invalid policy update time".to_string()))?;
    let submission = rule.submission();
    if submission.provider != SubmissionProvider::Gamebanana
      || !submission
        .submission_id
        .bytes()
        .enumerate()
        .all(|(index, byte)| byte.is_ascii_digit() && (index > 0 || byte != b'0'))
      || submission.submission_id.is_empty()
    {
      return Err(Error::InvalidInput("Invalid policy identity".to_string()));
    }
    if !identities.insert((submission.to_slug(), rule.kind)) {
      return Err(Error::InvalidInput("Duplicate policy rule".to_string()));
    }
    if (rule.kind == PolicyRuleKind::MetadataCorrection) != rule.correction.is_some() {
      return Err(Error::InvalidInput(
        "Policy correction payload does not match its rule kind".to_string(),
      ));
    }
  }
  Ok(())
}

fn load_best_manifest(path: &Path) -> Result<PolicyManifest, Error> {
  let pending = path.with_extension("json.next");
  let paths = [path.to_path_buf(), pending];
  let mut candidates = paths
    .into_iter()
    .filter(|candidate| candidate.is_file())
    .filter_map(|candidate| fs::read(candidate).ok())
    .filter_map(|bytes| parse_manifest(&bytes).ok())
    .collect::<Vec<_>>();
  candidates.sort_by_key(|manifest| manifest.revision);
  Ok(candidates.pop().unwrap_or_default())
}

fn write_manifest(path: &Path, manifest: &PolicyManifest) -> Result<(), Error> {
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent)?;
  }
  let pending = path.with_extension("json.next");
  let bytes = serde_json::to_vec_pretty(manifest)
    .map_err(|error| Error::InvalidInput(format!("Failed to encode policy: {error}")))?;
  fs::write(&pending, bytes)?;
  if path.exists() {
    fs::remove_file(path)?;
  }
  fs::rename(pending, path)?;
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  fn manifest(revision: u64, kind: PolicyRuleKind) -> PolicyManifest {
    PolicyManifest {
      version: 1,
      revision,
      generated_at: "2026-08-30T12:00:00Z".to_string(),
      rules: vec![PolicyRule {
        provider: SubmissionProvider::Gamebanana,
        submission_type: SubmissionType::Sound,
        submission_id: "42".to_string(),
        kind,
        reason: None,
        correction: None,
        updated_at: "2026-08-30T12:00:00Z".to_string(),
      }],
    }
  }

  #[test]
  fn malformed_pending_manifest_never_replaces_the_cached_policy() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("policy.json");
    write_manifest(&path, &manifest(7, PolicyRuleKind::Blacklisted)).unwrap();
    fs::write(path.with_extension("json.next"), b"not json").unwrap();

    let state = PolicyState::open(path);
    assert!(state.ensure_download_allowed("snd-42").is_err());
  }

  #[test]
  fn crash_pending_manifest_is_used_when_it_is_newer() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("policy.json");
    write_manifest(&path, &manifest(7, PolicyRuleKind::Blacklisted)).unwrap();
    fs::write(
      path.with_extension("json.next"),
      serde_json::to_vec(&manifest(8, PolicyRuleKind::EmergencyDisable)).unwrap(),
    )
    .unwrap();

    let state = PolicyState::open(path);
    assert!(state.ensure_download_allowed("snd-42").is_err());
    assert_eq!(state.manifest.read().unwrap().revision, 8);
  }

  #[test]
  fn rejects_correction_payloads_on_non_correction_rules() {
    let mut value = manifest(1, PolicyRuleKind::Hidden);
    value.rules[0].correction = Some(PolicyMetadataCorrection::default());
    assert!(validate_manifest(&value).is_err());
  }

  #[test]
  fn older_policy_responses_cannot_replace_the_cached_revision() {
    assert!(!should_replace(8, 7));
    assert!(should_replace(8, 8));
    assert!(should_replace(8, 9));
  }

  #[test]
  fn applies_metadata_corrections_without_hiding_the_submission() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("policy.json");
    let mut value = manifest(1, PolicyRuleKind::MetadataCorrection);
    value.rules[0].correction = Some(PolicyMetadataCorrection {
      name: Some("Corrected voice".to_string()),
      is_nsfw: Some(true),
      tags: Some(vec!["curated".to_string()]),
      ..PolicyMetadataCorrection::default()
    });
    write_manifest(&path, &value).unwrap();
    let state = PolicyState::open(path);
    let mut mod_data = CatalogModDto {
      id: "snd-42".to_string(),
      remote_id: "snd-42".to_string(),
      name: "Old voice".to_string(),
      description: None,
      remote_url: "https://gamebanana.com/sounds/42".to_string(),
      category: "VOs".to_string(),
      likes: 0,
      author: "author".to_string(),
      downloadable: true,
      remote_added_at: 0,
      remote_updated_at: 0,
      tags: Vec::new(),
      images: Vec::new(),
      hero: None,
      is_audio: true,
      is_map: false,
      audio_url: None,
      download_count: 0,
      is_nsfw: false,
      is_obsolete: false,
      files_updated_at: None,
      metadata: None,
      dependencies: Vec::new(),
      created_at: None,
      updated_at: None,
    };

    assert!(state.apply_to_mod(&mut mod_data).unwrap());
    assert_eq!(mod_data.name, "Corrected voice");
    assert!(mod_data.is_nsfw);
    assert_eq!(mod_data.tags, ["curated"]);
  }
}
