use super::hero_registry;
use super::models::{DonationMethod, Profile, Tag};
use crate::providers::{SubmissionProvider, SubmissionRef, SubmissionType};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::LazyLock;

const NSFW_CONTENT_RATINGS: &[&str] = &["st", "sa", "lp", "pn", "nu"];
const NSFW_KEYWORDS: &[&str] = &[
  "nsfw",
  "adult",
  "18+",
  "nude",
  "nudity",
  "full nudity",
  "partial nudity",
  "lewd",
  "skimpy",
  "sex",
  "sexual",
  "explicit",
];
const NEGATIVE_STATE_CODES: &[&str] = &["2", "4", "6", "8", "10"];
const NEGATIVE_STATE_LABELS: &[&str] = &["uninstalled", "absent", "disabled", "off", "false"];
const POSITIVE_STATE_LABELS: &[&str] = &["installed", "present", "enabled", "on", "true"];

static GAMEBANANA_MOD_URL: LazyLock<Regex> = LazyLock::new(|| {
  Regex::new(r"(?i)^https?://(?:www\.)?gamebanana\.com/mods/(\d+)")
    .expect("GameBanana mod URL regex must be valid")
});
static QUOTED_MAP: LazyLock<Regex> = LazyLock::new(|| {
  Regex::new(r#"(?i)(?:["'`>]|&quot;)\s*map\s+([a-z][a-z0-9_]{2,})\b"#)
    .expect("quoted map regex must be valid")
});
static BARE_MAP: LazyLock<Regex> = LazyLock::new(|| {
  Regex::new(r"(?i)\bmap\s+([a-z][a-z0-9_]{2,})\b").expect("bare map regex must be valid")
});
static URL_PATTERN: LazyLock<Regex> =
  LazyLock::new(|| Regex::new(r#"(?i)https?://[^\s"'<>]+"#).expect("URL regex must be valid"));

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedSubmission {
  pub slug: String,
  pub name: String,
  pub description: String,
  pub author: String,
  pub category: String,
  pub hero: Option<String>,
  pub download_count: u64,
  pub likes: u64,
  pub is_audio: bool,
  pub is_map: bool,
  pub is_nsfw: bool,
  pub is_obsolete: bool,
  pub remote_added_at: i64,
  pub remote_updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedRequirement {
  pub label: String,
  pub url: Option<String>,
  pub remote_id: Option<String>,
  pub level: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DonationLink {
  pub url: String,
  pub platform: String,
}

pub fn normalize_profile(
  profile: &Profile,
  submission_type: SubmissionType,
) -> Option<NormalizedSubmission> {
  if profile.is_private || profile.is_withheld || profile.is_trashed {
    return None;
  }

  if profile.id == 0
    || profile.name.trim().is_empty()
    || !profile.profile_url.starts_with("https://gamebanana.com/")
  {
    return None;
  }

  let slug = SubmissionRef {
    provider: SubmissionProvider::Gamebanana,
    submission_type,
    submission_id: profile.id.to_string(),
  }
  .to_slug();

  let description = if profile.text.is_empty() {
    profile.description.clone()
  } else {
    profile.text.clone()
  };
  let category = category(profile);
  let is_audio = submission_type == SubmissionType::Sound;
  let is_map = !is_audio && category == "Maps";
  let (remote_added_at, remote_updated_at) =
    normalize_timestamps(profile.date_added, profile.date_modified);

  Some(NormalizedSubmission {
    slug,
    name: profile.name.clone(),
    description,
    author: profile
      .submitter
      .as_ref()
      .map(|submitter| submitter.name.trim())
      .filter(|name| !name.is_empty())
      .unwrap_or("Unknown")
      .to_string(),
    category,
    hero: hero_registry::resolve_from_skin_category(
      profile
        .super_category
        .as_ref()
        .map(|value| value.name.as_str()),
      profile.category.as_ref().map(|value| value.name.as_str()),
      &profile.name,
    ),
    download_count: profile.download_count,
    likes: profile.likes,
    is_audio,
    is_map,
    is_nsfw: classify_nsfw(profile),
    is_obsolete: profile.is_obsolete,
    remote_added_at,
    remote_updated_at,
  })
}

pub fn parse_tags(tags: &[Tag]) -> Vec<String> {
  tags
    .iter()
    .filter_map(|tag| {
      let value = match tag {
        Tag::Text(value) => value.trim().to_string(),
        Tag::Label { title, value } => [title.trim(), value.trim()]
          .into_iter()
          .filter(|part| !part.is_empty())
          .collect::<Vec<_>>()
          .join(" "),
      };
      (!value.is_empty()).then_some(value)
    })
    .collect()
}

pub fn parse_requirements(rows: &[Vec<String>]) -> Vec<NormalizedRequirement> {
  let mut requirements = Vec::new();

  for row in rows {
    let label = row.first().map(|value| value.trim()).unwrap_or_default();
    let url = row.get(1).map(|value| value.trim()).unwrap_or_default();
    if label.is_empty() && url.is_empty() {
      continue;
    }

    let metadata = row
      .iter()
      .skip(2)
      .map(|value| value.trim().to_lowercase())
      .collect::<Vec<_>>();
    let uses_labels = metadata.iter().any(|value| {
      matches!(value.as_str(), "required" | "recommended")
        || NEGATIVE_STATE_LABELS.contains(&value.as_str())
        || POSITIVE_STATE_LABELS.contains(&value.as_str())
    });

    let (level, incompatible) = if uses_labels {
      (
        metadata
          .iter()
          .find(|value| matches!(value.as_str(), "required" | "recommended"))
          .cloned(),
        metadata
          .iter()
          .any(|value| NEGATIVE_STATE_LABELS.contains(&value.as_str())),
      )
    } else {
      (
        match metadata.first().map(String::as_str) {
          Some("1") => Some("required".to_string()),
          Some("2") => Some("recommended".to_string()),
          _ => None,
        },
        metadata
          .get(1)
          .is_some_and(|value| NEGATIVE_STATE_CODES.contains(&value.as_str())),
      )
    };

    if incompatible {
      continue;
    }

    let remote_id = GAMEBANANA_MOD_URL
      .captures(url)
      .and_then(|captures| captures.get(1))
      .map(|value| value.as_str().to_string());
    requirements.push(NormalizedRequirement {
      label: label.to_string(),
      url: (!url.is_empty()).then(|| url.to_string()),
      remote_id,
      level,
    });
  }

  requirements
}

pub fn classify_nsfw(profile: &Profile) -> bool {
  if profile
    .content_ratings
    .keys()
    .any(|rating| NSFW_CONTENT_RATINGS.contains(&rating.as_str()))
  {
    return true;
  }

  let mut hint_score = usize::from(profile.initial_visibility == "hide");
  let content = format!(
    "{} {} {} {}",
    profile.name,
    profile.description,
    profile.text,
    parse_tags(&profile.tags).join(" ")
  )
  .to_lowercase();

  if NSFW_KEYWORDS
    .iter()
    .any(|keyword| content.contains(keyword))
  {
    hint_score += 1;
  }

  hint_score >= 2
}

pub fn extract_map_name(description: &str) -> Option<String> {
  if let Some(captures) = QUOTED_MAP.captures(description) {
    return captures.get(1).map(|value| value.as_str().to_lowercase());
  }

  let excluded = [
    "features",
    "includes",
    "currently",
    "loading",
    "created",
    "queue",
    "using",
    "look",
    "making",
    "overrides",
    "works",
    "featuring",
    "breaking",
    "correctly",
    "again",
  ];
  BARE_MAP.captures_iter(description).find_map(|captures| {
    let value = captures.get(1)?.as_str().to_lowercase();
    (!excluded.contains(&value.as_str())).then_some(value)
  })
}

pub fn donation_links(methods: &[DonationMethod], description: &str) -> Vec<DonationLink> {
  let mut links = Vec::new();
  let mut seen = HashSet::new();

  for (value, title) in methods
    .iter()
    .filter(|method| method.is_url)
    .map(|method| (method.value.as_str(), Some(method.title.as_str())))
    .chain(
      URL_PATTERN
        .find_iter(description)
        .map(|found| (found.as_str(), None)),
    )
  {
    if let Some(link) = donation_link(value, title)
      && seen.insert(link.url.clone())
    {
      links.push(link);
    }
  }

  links
}

fn category(profile: &Profile) -> String {
  [
    profile.super_category.as_ref(),
    profile.root_category.as_ref(),
    profile.category.as_ref(),
  ]
    .into_iter()
    .filter_map(|value| value.map(|category| category.name.trim()))
    .find(|value| !value.is_empty())
    .unwrap_or("Other")
    .to_string()
}

fn normalize_timestamps(added: Option<i64>, updated: Option<i64>) -> (i64, i64) {
  let added = added.filter(|value| *value > 0);
  let updated = updated.filter(|value| *value > 0);
  let fallback = added.or(updated).unwrap_or(0);
  (added.unwrap_or(fallback), updated.unwrap_or(fallback))
}

fn donation_link(value: &str, title: Option<&str>) -> Option<DonationLink> {
  let cleaned = value.trim_end_matches([')', '"', '\'', '>', '.', ',', ';', ':', '!', '?', ']']);
  let url = reqwest::Url::parse(cleaned).ok()?;
  let host = url.host_str()?.trim_start_matches("www.").to_lowercase();
  let allowed = [
    "ko-fi.com",
    "patreon.com",
    "buymeacoffee.com",
    "paypal.me",
    "paypal.com",
    "liberapay.com",
    "opencollective.com",
    "github.com",
  ];
  if !allowed.contains(&host.as_str())
    || (host == "github.com" && !url.path().starts_with("/sponsors"))
  {
    return None;
  }

  let hint = title.unwrap_or_default().to_lowercase();
  let platform = if hint.contains("ko-fi") || hint.contains("kofi") || host == "ko-fi.com" {
    "Ko-fi"
  } else if hint.contains("patreon") || host == "patreon.com" {
    "Patreon"
  } else if hint.contains("buy me a coffee") || host == "buymeacoffee.com" {
    "Buy Me a Coffee"
  } else if hint.contains("paypal") || matches!(host.as_str(), "paypal.me" | "paypal.com") {
    "PayPal"
  } else if host == "liberapay.com" {
    "Liberapay"
  } else if host == "opencollective.com" {
    "Open Collective"
  } else {
    "GitHub Sponsors"
  };

  Some(DonationLink {
    url: url.to_string(),
    platform: platform.to_string(),
  })
}

#[cfg(test)]
mod tests {
  use super::{NormalizedSubmission, category, normalize_profile};
  use crate::providers::SubmissionType;
  use crate::providers::gamebanana::models::Profile;

  const MOD_PROFILE: &str = include_str!("../../../tests/fixtures/gamebanana/mod-profile.json");
  const SOUND_PROFILE: &str = include_str!("../../../tests/fixtures/gamebanana/sound-profile.json");
  const EXPECTED: &str =
    include_str!("../../../tests/fixtures/gamebanana/normalized-retained.json");

  #[test]
  fn rust_normalizer_matches_the_retained_field_oracle() {
    let expected: Vec<NormalizedSubmission> = serde_json::from_str(EXPECTED).unwrap();
    let mod_profile: Profile = serde_json::from_str(MOD_PROFILE).unwrap();
    let sound_profile: Profile = serde_json::from_str(SOUND_PROFILE).unwrap();

    let actual = vec![
      normalize_profile(&mod_profile, SubmissionType::Mod).unwrap(),
      normalize_profile(&sound_profile, SubmissionType::Sound).unwrap(),
    ];

    assert_eq!(actual, expected);
  }

  #[test]
  fn empty_category_names_fall_through_to_the_next_level() {
    let profile: Profile = serde_json::from_value(serde_json::json!({
      "_idRow": 1,
      "_aSuperCategory": { "_sName": " " },
      "_aRootCategory": { "_sName": "Maps" },
      "_aCategory": { "_sName": "Other" }
    }))
    .unwrap();

    assert_eq!(category(&profile), "Maps");
  }
}
