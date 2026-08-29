use serde::Deserialize;
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
  #[serde(rename = "_aRecords", default)]
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
  pub profile_url: String,
  #[serde(rename = "_tsDateAdded", default)]
  pub date_added: Option<i64>,
  #[serde(rename = "_tsDateModified", default)]
  pub date_modified: Option<i64>,
}

impl IndexSubmission {
  fn is_valid(&self) -> bool {
    self.id > 0
      && matches!(self.model_name.as_str(), "Mod" | "Sound")
      && !self.name.trim().is_empty()
      && self.profile_url.starts_with("https://gamebanana.com/")
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

#[derive(Debug, Clone, Deserialize)]
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

#[cfg(test)]
mod tests {
  use super::IndexPage;

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
}
