use serde::Deserialize;
use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Deserialize)]
pub struct PageMetadata {
  #[serde(rename = "_nRecordCount", default)]
  pub record_count: u64,
  #[serde(rename = "_nPerpage", default)]
  pub per_page: u32,
  #[serde(rename = "_bIsComplete", default)]
  pub is_complete: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct IndexPage {
  #[serde(rename = "_aMetadata")]
  pub metadata: PageMetadata,
  #[serde(rename = "_aRecords")]
  pub records: Vec<serde_json::Value>,
}

impl IndexPage {
  pub fn valid_records(&self) -> Vec<IndexSubmission> {
    self
      .records
      .iter()
      .filter_map(|record| serde_json::from_value(record.clone()).ok())
      .filter(IndexSubmission::is_valid)
      .collect()
  }
}

#[derive(Debug, Clone, Deserialize)]
pub struct IndexSubmission {
  #[serde(rename = "_idRow")]
  pub id: u64,
  #[serde(rename = "_sModelName")]
  pub model_name: String,
  #[serde(rename = "_sName")]
  pub name: String,
  #[serde(rename = "_sProfileUrl")]
  #[serde(default)]
  pub profile_url: String,
  #[serde(rename = "_tsDateAdded", default)]
  pub date_added: Option<i64>,
  #[serde(rename = "_tsDateModified", default)]
  pub date_modified: Option<i64>,
  #[serde(rename = "_aSubmitter", default)]
  pub submitter: Option<Submitter>,
  #[serde(rename = "_aRootCategory", default)]
  pub root_category: Option<Category>,
  #[serde(rename = "_aSubCategory", default)]
  pub sub_category: Option<Category>,
  #[serde(rename = "_bHasFiles", default)]
  pub has_files: bool,
  #[serde(rename = "_bIsObsolete", default)]
  pub is_obsolete: bool,
}

impl IndexSubmission {
  fn is_valid(&self) -> bool {
    self.id > 0
      && matches!(self.model_name.as_str(), "Mod" | "Sound")
      && !self.name.trim().is_empty()
      && (self.profile_url.is_empty() || self.profile_url.starts_with("https://gamebanana.com/"))
  }
}

#[derive(Debug, Clone, Deserialize)]
pub struct Category {
  #[serde(rename = "_sName", default)]
  pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Submitter {
  #[serde(rename = "_sName", default)]
  pub name: String,
  #[serde(rename = "_aDonationMethods", default)]
  pub donation_methods: Vec<DonationMethod>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DonationMethod {
  #[serde(rename = "_sTitle", default)]
  pub title: String,
  #[serde(rename = "_sValue", default)]
  pub value: String,
  #[serde(rename = "_bIsUrl", default)]
  pub is_url: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum Tag {
  Text(String),
  Label {
    #[serde(rename = "_sTitle", default)]
    title: String,
    #[serde(rename = "_sValue", default)]
    value: String,
  },
}

#[derive(Debug, Clone, Deserialize)]
pub struct PreviewImage {
  #[serde(rename = "_sBaseUrl", default)]
  pub base_url: String,
  #[serde(rename = "_sFile", default)]
  pub file: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct PreviewMetadata {
  #[serde(rename = "_sAudioUrl", default)]
  pub audio_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct PreviewMedia {
  #[serde(rename = "_aImages", default)]
  pub images: Vec<PreviewImage>,
  #[serde(rename = "_aMetadata", default)]
  pub metadata: PreviewMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmissionFile {
  #[serde(rename = "_idRow")]
  pub id: u64,
  #[serde(rename = "_sFile", default)]
  pub name: String,
  #[serde(rename = "_nFilesize", default)]
  pub size: u64,
  #[serde(rename = "_tsDateAdded", default)]
  pub date_added: Option<i64>,
  #[serde(rename = "_sDownloadUrl", default)]
  pub download_url: String,
  #[serde(rename = "_sMd5Checksum", default)]
  pub md5: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Profile {
  #[serde(rename = "_idRow")]
  pub id: u64,
  #[serde(rename = "_sName", default)]
  pub name: String,
  #[serde(rename = "_sText", default)]
  pub text: String,
  #[serde(rename = "_sDescription", default)]
  pub description: String,
  #[serde(rename = "_sProfileUrl", default)]
  pub profile_url: String,
  #[serde(rename = "_tsDateAdded", default)]
  pub date_added: Option<i64>,
  #[serde(rename = "_tsDateModified", default)]
  pub date_modified: Option<i64>,
  #[serde(rename = "_nDownloadCount", default)]
  pub download_count: u64,
  #[serde(rename = "_nLikeCount", default)]
  pub likes: u64,
  #[serde(rename = "_bIsPrivate", default)]
  pub is_private: bool,
  #[serde(rename = "_bIsTrashed", default)]
  pub is_trashed: bool,
  #[serde(rename = "_bIsWithheld", default)]
  pub is_withheld: bool,
  #[serde(rename = "_bIsObsolete", default)]
  pub is_obsolete: bool,
  #[serde(rename = "_sInitialVisibility", default)]
  pub initial_visibility: String,
  #[serde(rename = "_aContentRatings", default)]
  pub content_ratings: BTreeMap<String, String>,
  #[serde(rename = "_aTags", default)]
  pub tags: Vec<Tag>,
  #[serde(rename = "_aCategory", default)]
  pub category: Option<Category>,
  #[serde(rename = "_aSuperCategory", default)]
  pub super_category: Option<Category>,
  #[serde(rename = "_aRootCategory", default)]
  pub root_category: Option<Category>,
  #[serde(rename = "_aSubmitter", default)]
  pub submitter: Option<Submitter>,
  #[serde(rename = "_aPreviewMedia", default)]
  pub preview_media: PreviewMedia,
  #[serde(rename = "_aFiles", default)]
  pub files: Vec<SubmissionFile>,
  #[serde(rename = "_aRequirements", default)]
  pub requirements: Vec<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DownloadPage {
  #[serde(rename = "_bIsTrashed", default)]
  pub is_trashed: bool,
  #[serde(rename = "_bIsWithheld", default)]
  pub is_withheld: bool,
  #[serde(rename = "_aFiles", default)]
  pub files: Vec<SubmissionFile>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FileserverPage {
  #[serde(rename = "_aRecords", default)]
  pub records: Vec<FileserverRecord>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FileserverRecord {
  #[serde(rename = "_idRow")]
  pub id: u64,
  #[serde(rename = "_sDomain", default)]
  pub domain: String,
  #[serde(rename = "_sState", default)]
  pub state: String,
  #[serde(rename = "_aStats", default)]
  pub stats: FileserverStats,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct FileserverStats {
  #[serde(rename = "_a1hr", default)]
  pub hour: Option<FileserverStatsBucket>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FileserverStatsBucket {
  #[serde(rename = "_fRate", default)]
  pub rate: f64,
  #[serde(rename = "_nRequests", default)]
  pub requests: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateSnapshot {
  pub remote_updated_at: i64,
  pub files: Vec<SubmissionFile>,
}

impl UpdateSnapshot {
  pub fn parse_many(
    value: serde_json::Value,
    submissions: &[crate::providers::SubmissionRef],
  ) -> Vec<Option<Self>> {
    let values = match value {
      serde_json::Value::Array(values)
        if submissions.len() == 1 && values.first().is_some_and(serde_json::Value::is_string) =>
      {
        vec![serde_json::Value::Array(values)]
      }
      serde_json::Value::Array(values) => values,
      value => vec![value],
    };
    values
      .into_iter()
      .zip(submissions)
      .map(|(value, submission)| Self::parse(value, submission))
      .collect()
  }

  fn parse(value: serde_json::Value, submission: &crate::providers::SubmissionRef) -> Option<Self> {
    let fields = value.as_array()?;
    let profile_url = fields.first()?.as_str()?;
    let expected_path = match submission.submission_type {
      crate::providers::SubmissionType::Mod => "mods",
      crate::providers::SubmissionType::Sound => "sounds",
    };
    let parsed_url = reqwest::Url::parse(profile_url).ok()?;
    if parsed_url.host_str() != Some("gamebanana.com")
      || parsed_url.path() != format!("/{expected_path}/{}", submission.submission_id)
    {
      return None;
    }
    let remote_updated_at = fields.get(1)?.as_i64()?;
    let files = parse_update_files(fields.get(2)?);
    Some(Self {
      remote_updated_at,
      files,
    })
  }
}

fn parse_update_files(value: &serde_json::Value) -> Vec<SubmissionFile> {
  match value {
    serde_json::Value::Array(files) => files
      .iter()
      .filter_map(|file| serde_json::from_value(file.clone()).ok())
      .collect(),
    serde_json::Value::Object(files) => files
      .values()
      .filter_map(|file| serde_json::from_value(file.clone()).ok())
      .collect(),
    _ => Vec::new(),
  }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BulkHydration {
  pub name: String,
  pub download_count: u64,
  pub category: String,
  pub root_category: String,
  pub is_nsfw: bool,
  pub description: String,
  pub text: String,
}

impl BulkHydration {
  pub fn parse_many(value: serde_json::Value) -> Vec<Option<Self>> {
    match value {
      serde_json::Value::Array(records) => records.into_iter().map(Self::from_array).collect(),
      serde_json::Value::Object(fields) => vec![Self::from_object(&fields)],
      _ => Vec::new(),
    }
  }

  fn from_array(value: serde_json::Value) -> Option<Self> {
    let values = value.as_array()?;
    Some(Self {
      name: values.first()?.as_str()?.to_string(),
      download_count: values.get(1)?.as_u64()?,
      category: values.get(2)?.as_str().unwrap_or_default().to_string(),
      root_category: values.get(3)?.as_str().unwrap_or_default().to_string(),
      is_nsfw: values.get(4)?.as_bool().unwrap_or_default(),
      description: values.get(5)?.as_str().unwrap_or_default().to_string(),
      text: values.get(6)?.as_str().unwrap_or_default().to_string(),
    })
  }

  fn from_object(fields: &serde_json::Map<String, serde_json::Value>) -> Option<Self> {
    Some(Self {
      name: fields.get("name")?.as_str()?.to_string(),
      download_count: fields.get("downloads")?.as_u64()?,
      category: string_field(fields, "Category().name"),
      root_category: string_field(fields, "RootCategory().name"),
      is_nsfw: fields
        .get("Nsfw().bIsNsfw()")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or_default(),
      description: string_field(fields, "description"),
      text: string_field(fields, "text"),
    })
  }
}

fn string_field(fields: &serde_json::Map<String, serde_json::Value>, key: &str) -> String {
  fields
    .get(key)
    .and_then(serde_json::Value::as_str)
    .unwrap_or_default()
    .to_string()
}

#[cfg(test)]
mod tests {
  use super::{BulkHydration, FileserverPage, IndexPage, UpdateSnapshot};
  use crate::providers::SubmissionRef;

  #[test]
  fn malformed_index_records_do_not_discard_the_page() {
    let json = r#"{
      "_aMetadata":{"_nRecordCount":2,"_nPerpage":2,"_bIsComplete":true},
      "_aRecords":[
        {"_idRow":1,"_sModelName":"Mod","_sName":"Valid","_sProfileUrl":"https://gamebanana.com/mods/1"},
        {"_idRow":"broken","_sName":[]}
      ]
    }"#;

    let page: IndexPage = serde_json::from_str(json).unwrap();

    assert_eq!(page.valid_records().len(), 1);
    assert_eq!(page.metadata.record_count, 2);
  }

  #[test]
  fn missing_index_records_are_not_an_empty_catalog() {
    let response = serde_json::json!({
      "_aMetadata": {"_bIsComplete": true}
    });

    assert!(serde_json::from_value::<IndexPage>(response).is_err());
  }

  #[test]
  fn bulk_hydration_accepts_multicall_and_single_item_shapes() {
    let fixture: serde_json::Value = serde_json::from_str(include_str!(
      "../../../tests/fixtures/gamebanana/core-item-data.json"
    ))
    .unwrap();
    let multi = BulkHydration::parse_many(fixture["modMulticall"].clone());
    let single = BulkHydration::parse_many(fixture["sound"].clone());

    assert_eq!(multi.len(), 2);
    assert_eq!(multi[0].as_ref().unwrap().category, "Drifter");
    assert_eq!(single.len(), 1);
    assert_eq!(single[0].as_ref().unwrap().category, "Abilities");
  }

  #[test]
  fn fileserver_fixture_is_tolerantly_deserialized() {
    let page: FileserverPage = serde_json::from_str(include_str!(
      "../../../tests/fixtures/gamebanana/fileservers.json"
    ))
    .unwrap();

    assert!(!page.records.is_empty());
    assert!(page.records.iter().all(|server| !server.domain.is_empty()));
  }

  #[test]
  fn update_snapshots_verify_single_and_multicall_identity() {
    let mod_ref = SubmissionRef::parse_slug("123").unwrap();
    let sound_ref = SubmissionRef::parse_slug("snd-456").unwrap();
    let file = serde_json::json!({
      "_idRow": 9,
      "_sFile": "archive.zip",
      "_nFilesize": 8,
      "_sDownloadUrl": "https://gamebanana.com/dl/9",
      "_tsDateAdded": 200,
      "_sMd5Checksum": "a64a0e51930cb356581d3de2b3fa7a09"
    });
    let single = serde_json::json!(["https://gamebanana.com/mods/123", 300, [file.clone()]]);
    let multi = serde_json::json!([
      single.clone(),
      ["https://gamebanana.com/sounds/456", 301, [file]]
    ]);

    let parsed_single = UpdateSnapshot::parse_many(single, std::slice::from_ref(&mod_ref));
    assert_eq!(parsed_single.len(), 1);
    assert_eq!(parsed_single[0].as_ref().unwrap().files[0].id, 9);

    let parsed_multi = UpdateSnapshot::parse_many(multi, &[mod_ref, sound_ref]);
    assert!(parsed_multi.iter().all(Option::is_some));
  }

  #[test]
  fn update_snapshots_reject_reordered_or_untrusted_identity() {
    let submissions = [
      SubmissionRef::parse_slug("123").unwrap(),
      SubmissionRef::parse_slug("snd-456").unwrap(),
    ];
    let response = serde_json::json!([
      ["https://gamebanana.com/sounds/456", 1, []],
      ["https://evil.test/mods/123", 1, []]
    ]);

    let parsed = UpdateSnapshot::parse_many(response, &submissions);
    assert_eq!(parsed.len(), 2);
    assert!(parsed.iter().all(Option::is_none));
  }
}
