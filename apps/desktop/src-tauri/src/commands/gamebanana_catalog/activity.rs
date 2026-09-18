use crate::providers::gamebanana::{ActivityPage, SubmissionUpdate, gamebanana_url};
use serde::Serialize;
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct CatalogCommentsDto {
  pub comments: Vec<CatalogCommentDto>,
  pub page: u32,
  #[ts(type = "number")]
  pub total: u64,
  pub has_more: bool,
  pub hidden: bool,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct CatalogCommentDto {
  pub id: String,
  pub text: String,
  #[ts(type = "number")]
  pub posted_at: i64,
  pub pinned: bool,
  #[ts(type = "number")]
  pub score: i64,
  #[ts(type = "number")]
  pub reply_count: u64,
  pub author: CatalogCommentAuthorDto,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct CatalogCommentAuthorDto {
  pub remote_id: Option<String>,
  pub name: String,
  pub avatar_url: Option<String>,
  pub profile_url: Option<String>,
  pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct CatalogChangelogDto {
  pub entries: Vec<CatalogChangelogEntryDto>,
  pub page: u32,
  #[ts(type = "number")]
  pub total: u64,
  pub has_more: bool,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct CatalogChangelogEntryDto {
  pub id: String,
  pub title: String,
  pub version: Option<String>,
  pub text: Option<String>,
  pub changes: Vec<CatalogChangeDto>,
  #[ts(type = "number")]
  pub published_at: i64,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct CatalogChangeDto {
  pub text: String,
  pub category: Option<String>,
}

impl CatalogCommentsDto {
  pub fn hidden(page: u32) -> Self {
    Self {
      comments: Vec::new(),
      page,
      total: 0,
      has_more: false,
      hidden: true,
    }
  }

  pub fn from_page(posts: &ActivityPage, page: u32) -> Self {
    let comments = posts
      .posts()
      .into_iter()
      .map(|post| {
        let poster = post.poster.as_ref();
        CatalogCommentDto {
          id: post.id.to_string(),
          text: post.text,
          posted_at: post.date_added,
          pinned: post.pin_level > 0,
          score: post.stamp_score,
          reply_count: post.reply_count,
          author: CatalogCommentAuthorDto {
            remote_id: poster
              .filter(|poster| poster.id > 0)
              .map(|poster| poster.id.to_string()),
            name: poster
              .map(|poster| poster.name.trim().to_string())
              .filter(|name| !name.is_empty())
              .unwrap_or_else(|| "Unknown".to_string()),
            avatar_url: poster.and_then(|poster| gamebanana_url(poster.avatar_url.as_deref())),
            profile_url: poster.and_then(|poster| gamebanana_url(poster.profile_url.as_deref())),
            title: poster
              .and_then(|poster| poster.title.as_deref())
              .map(str::trim)
              .filter(|title| !title.is_empty())
              .map(str::to_string),
          },
        }
      })
      .collect();
    Self {
      comments,
      page,
      total: posts.metadata.record_count,
      has_more: posts.has_more(),
      hidden: false,
    }
  }
}

impl CatalogChangelogDto {
  pub fn from_page(updates: &ActivityPage, page: u32) -> Self {
    Self {
      entries: updates
        .updates()
        .into_iter()
        .filter_map(CatalogChangelogEntryDto::from_update)
        .collect(),
      page,
      total: updates.metadata.record_count,
      has_more: updates.has_more(),
    }
  }
}

impl CatalogChangelogEntryDto {
  fn from_update(update: SubmissionUpdate) -> Option<Self> {
    let changes = update
      .change_log
      .into_iter()
      .filter_map(|entry| {
        let text = entry.text?.trim().to_string();
        (!text.is_empty()).then(|| CatalogChangeDto {
          text,
          category: entry
            .cat
            .map(|category| category.trim().to_string())
            .filter(|category| !category.is_empty()),
        })
      })
      .collect::<Vec<_>>();
    let text = Some(update.text.trim().to_string()).filter(|text| !text.is_empty());
    let title = update.name.trim().to_string();
    if title.is_empty() && text.is_none() && changes.is_empty() {
      return None;
    }
    Some(Self {
      id: update.id.to_string(),
      title,
      version: update
        .version
        .map(|version| version.trim().to_string())
        .filter(|version| !version.is_empty()),
      text,
      changes,
      published_at: update.date_added,
    })
  }
}

#[cfg(test)]
mod tests {
  use super::{CatalogChangelogDto, CatalogCommentsDto};

  #[test]
  fn comments_keep_only_gamebanana_links_and_report_paging() {
    let page = serde_json::from_value(serde_json::json!({
      "_aMetadata": {"_nRecordCount": 16, "_bIsComplete": false},
      "_aRecords": [{
        "_idRow": 1,
        "_sText": "<p>hi</p>",
        "_iPinLevel": 1,
        "_aPoster": {
          "_idRow": 7,
          "_sName": " Someone ",
          "_sAvatarUrl": "https://evil.test/a.png",
          "_sProfileUrl": "https://gamebanana.com/members/7",
          "_sUserTitle": ""
        }
      }]
    }))
    .unwrap();

    let dto = CatalogCommentsDto::from_page(&page, 1);
    let comment = &dto.comments[0];
    assert!(comment.pinned);
    assert_eq!(comment.author.name, "Someone");
    assert_eq!(comment.author.avatar_url, None);
    assert_eq!(
      comment.author.profile_url.as_deref(),
      Some("https://gamebanana.com/members/7")
    );
    assert_eq!(comment.author.title, None);
    assert!(dto.has_more);
  }

  #[test]
  fn changelog_entries_trim_labels_and_drop_empty_updates() {
    let page = serde_json::from_value(serde_json::json!({
      "_aMetadata": {"_nRecordCount": 2, "_bIsComplete": true},
      "_aRecords": [
        {
          "_idRow": 10,
          "_sName": "QOL Lock",
          "_sVersion": " 3.2.0 ",
          "_sText": "",
          "_aChangeLog": [
            {"text": " Fixed menus ", "cat": "Bugfix"},
            {"text": "   ", "cat": "Addition"},
            {"text": "Uncategorized"}
          ],
          "_tsDateAdded": 100
        },
        {"_idRow": 11, "_sName": " ", "_sText": " "}
      ]
    }))
    .unwrap();

    let dto = CatalogChangelogDto::from_page(&page, 1);
    assert_eq!(dto.entries.len(), 1);
    let entry = &dto.entries[0];
    assert_eq!(entry.version.as_deref(), Some("3.2.0"));
    assert_eq!(entry.text, None);
    assert_eq!(entry.changes.len(), 2);
    assert_eq!(entry.changes[0].text, "Fixed menus");
    assert_eq!(entry.changes[1].category, None);
    assert!(!dto.has_more);
  }
}
