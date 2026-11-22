use super::models::PageMetadata;
use serde::Deserialize;
use serde::de::DeserializeOwned;

/// Shared shape of the `Posts` and `Updates` endpoints. Records stay raw so one
/// malformed entry cannot discard the rest of the page.
#[derive(Debug, Clone, Deserialize)]
pub struct ActivityPage {
  #[serde(rename = "_aMetadata", default)]
  pub metadata: PageMetadata,
  #[serde(rename = "_aRecords", default)]
  records: Vec<serde_json::Value>,
}

impl ActivityPage {
  pub fn has_more(&self) -> bool {
    !self.metadata.is_complete && !self.records.is_empty()
  }

  pub fn posts(&self) -> Vec<Post> {
    self
      .parse::<Post>()
      .filter(|post| post.id > 0 && !post.text.trim().is_empty())
      .collect()
  }

  pub fn updates(&self) -> Vec<SubmissionUpdate> {
    self
      .parse::<SubmissionUpdate>()
      .filter(|update| update.id > 0 && !update.is_private && !update.is_trashed)
      .collect()
  }

  fn parse<T: DeserializeOwned>(&self) -> impl Iterator<Item = T> + '_ {
    self
      .records
      .iter()
      .filter_map(|record| T::deserialize(record).ok())
  }
}

#[derive(Debug, Clone, Deserialize)]
pub struct Post {
  #[serde(rename = "_idRow")]
  pub id: u64,
  #[serde(rename = "_sText", default)]
  pub text: String,
  #[serde(rename = "_tsDateAdded", default)]
  pub date_added: i64,
  #[serde(rename = "_iPinLevel", default)]
  pub pin_level: i64,
  #[serde(rename = "_nStampScore", default)]
  pub stamp_score: i64,
  #[serde(rename = "_nReplyCount", default)]
  pub reply_count: u64,
  #[serde(rename = "_aPoster", default)]
  pub poster: Option<Poster>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Poster {
  #[serde(rename = "_idRow", default)]
  pub id: u64,
  #[serde(rename = "_sName", default)]
  pub name: String,
  #[serde(rename = "_sAvatarUrl", default)]
  pub avatar_url: Option<String>,
  #[serde(rename = "_sProfileUrl", default)]
  pub profile_url: Option<String>,
  #[serde(rename = "_sUserTitle", default)]
  pub title: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SubmissionUpdate {
  #[serde(rename = "_idRow")]
  pub id: u64,
  #[serde(rename = "_sName", default)]
  pub name: String,
  #[serde(rename = "_sVersion", default)]
  pub version: Option<String>,
  #[serde(rename = "_sText", default)]
  pub text: String,
  #[serde(rename = "_aChangeLog", default)]
  pub change_log: Vec<ChangeLogEntry>,
  #[serde(rename = "_tsDateAdded", default)]
  pub date_added: i64,
  #[serde(rename = "_bIsPrivate", default)]
  pub is_private: bool,
  #[serde(rename = "_bIsTrashed", default)]
  pub is_trashed: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChangeLogEntry {
  #[serde(default)]
  pub text: Option<String>,
  #[serde(default)]
  pub cat: Option<String>,
}

pub fn gamebanana_url(value: Option<&str>) -> Option<String> {
  let url = reqwest::Url::parse(value?.trim()).ok()?;
  let host = url.host_str()?;
  (url.scheme() == "https" && (host == "gamebanana.com" || host.ends_with(".gamebanana.com")))
    .then(|| url.to_string())
}

#[cfg(test)]
mod tests {
  use super::{ActivityPage, gamebanana_url};

  #[test]
  fn posts_skip_malformed_and_empty_records() {
    let page: ActivityPage = serde_json::from_value(serde_json::json!({
      "_aMetadata": {"_nRecordCount": 85, "_nPerpage": 15, "_bIsComplete": false},
      "_aRecords": [
        {
          "_idRow": 12862966,
          "_nStatus": "0",
          "_tsDateAdded": 1756234797,
          "_iPinLevel": 0,
          "_nStampScore": 22,
          "_sText": "<p>this mod is basically mandatory</p>",
          "_aPoster": {
            "_idRow": 4751525,
            "_sName": "CaliEOF",
            "_sAvatarUrl": "https://images.gamebanana.com/static/img/defaults/avatar.gif",
            "_sProfileUrl": "https://gamebanana.com/members/4751525",
            "_sUserTitle": "Bananite"
          }
        },
        {"_idRow": 2, "_sText": "   "},
        {"_idRow": "broken"}
      ]
    }))
    .unwrap();

    let posts = page.posts();
    assert_eq!(posts.len(), 1);
    assert_eq!(posts[0].stamp_score, 22);
    assert_eq!(posts[0].poster.as_ref().unwrap().name, "CaliEOF");
    assert_eq!(page.metadata.record_count, 85);
    assert!(page.has_more());
  }

  #[test]
  fn updates_keep_labeled_entries_and_drop_hidden_records() {
    let page: ActivityPage = serde_json::from_value(serde_json::json!({
      "_aMetadata": {"_nRecordCount": 3, "_bIsComplete": true},
      "_aRecords": [
        {
          "_idRow": 452175,
          "_sName": "QOL Lock",
          "_sVersion": "3.2.0",
          "_sText": "",
          "_aChangeLog": [
            {"text": "Added an update checker", "cat": "Addition"},
            {"text": "Fixed ESC menu button pivot points", "cat": "Bugfix"}
          ],
          "_tsDateAdded": 1788277631
        },
        {"_idRow": 3, "_sName": "Private", "_bIsPrivate": true},
        {"_idRow": 4, "_sName": "Trashed", "_bIsTrashed": true}
      ]
    }))
    .unwrap();

    let updates = page.updates();
    assert!(!page.has_more());
    assert_eq!(updates.len(), 1);
    assert_eq!(updates[0].version.as_deref(), Some("3.2.0"));
    assert_eq!(updates[0].change_log[1].cat.as_deref(), Some("Bugfix"));
  }

  #[test]
  fn only_gamebanana_https_urls_are_kept() {
    assert_eq!(
      gamebanana_url(Some("https://images.gamebanana.com/img/av/1.jpg")).as_deref(),
      Some("https://images.gamebanana.com/img/av/1.jpg")
    );
    assert!(gamebanana_url(Some("http://gamebanana.com/members/1")).is_none());
    assert!(gamebanana_url(Some("https://gamebanana.com.evil.test/x")).is_none());
    assert!(gamebanana_url(Some("")).is_none());
    assert!(gamebanana_url(None).is_none());
  }
}
