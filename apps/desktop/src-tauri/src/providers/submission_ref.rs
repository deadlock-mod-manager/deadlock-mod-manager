use serde::{Deserialize, Serialize};
use std::str::FromStr;
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "lowercase")]
pub enum SubmissionProvider {
  Gamebanana,
  Local,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "lowercase")]
pub enum SubmissionType {
  Mod,
  Sound,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct SubmissionRef {
  pub provider: SubmissionProvider,
  pub submission_type: SubmissionType,
  pub submission_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("invalid submission slug: {slug}")]
pub struct ParseSubmissionRefError {
  slug: String,
}

impl SubmissionRef {
  pub fn parse_slug(slug: &str) -> Result<Self, ParseSubmissionRefError> {
    if let Some(submission_id) = slug.strip_prefix("local-")
      && is_uuid(submission_id)
    {
      return Ok(Self {
        provider: SubmissionProvider::Local,
        submission_type: SubmissionType::Mod,
        submission_id: submission_id.to_string(),
      });
    }

    if let Some(submission_id) = slug.strip_prefix("snd-")
      && is_canonical_gamebanana_id(submission_id)
    {
      return Ok(Self {
        provider: SubmissionProvider::Gamebanana,
        submission_type: SubmissionType::Sound,
        submission_id: submission_id.to_string(),
      });
    }

    if is_canonical_gamebanana_id(slug) {
      return Ok(Self {
        provider: SubmissionProvider::Gamebanana,
        submission_type: SubmissionType::Mod,
        submission_id: slug.to_string(),
      });
    }

    Err(ParseSubmissionRefError {
      slug: slug.to_string(),
    })
  }

  pub fn to_slug(&self) -> String {
    match (self.provider, self.submission_type) {
      (SubmissionProvider::Gamebanana, SubmissionType::Mod) => self.submission_id.clone(),
      (SubmissionProvider::Gamebanana, SubmissionType::Sound) => {
        format!("snd-{}", self.submission_id)
      }
      (SubmissionProvider::Local, SubmissionType::Mod) => {
        format!("local-{}", self.submission_id)
      }
      _ => String::new(),
    }
  }
}

fn is_uuid(value: &str) -> bool {
  let mut segments = value.split('-');
  [8, 4, 4, 4, 12].into_iter().all(|length| {
    segments.next().is_some_and(|segment| {
      segment.len() == length && segment.bytes().all(|byte| byte.is_ascii_hexdigit())
    })
  }) && segments.next().is_none()
}

fn is_canonical_gamebanana_id(value: &str) -> bool {
  !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit()) && !value.starts_with('0')
}

impl FromStr for SubmissionRef {
  type Err = ParseSubmissionRefError;

  fn from_str(slug: &str) -> Result<Self, Self::Err> {
    Self::parse_slug(slug)
  }
}

#[cfg(test)]
mod tests {
  use super::{SubmissionProvider, SubmissionRef, SubmissionType};

  #[test]
  fn legacy_numeric_slug_round_trips_as_a_gamebanana_mod() {
    let submission = SubmissionRef::parse_slug("123456").unwrap();

    assert_eq!(submission.provider, SubmissionProvider::Gamebanana);
    assert_eq!(submission.submission_type, SubmissionType::Mod);
    assert_eq!(submission.submission_id, "123456");
    assert_eq!(submission.to_slug(), "123456");
  }

  #[test]
  fn sound_slug_round_trips_without_colliding_with_mod_ids() {
    let submission = SubmissionRef::parse_slug("snd-123456").unwrap();

    assert_eq!(submission.provider, SubmissionProvider::Gamebanana);
    assert_eq!(submission.submission_type, SubmissionType::Sound);
    assert_eq!(submission.submission_id, "123456");
    assert_eq!(submission.to_slug(), "snd-123456");
  }

  #[test]
  fn local_slug_round_trips_with_its_uuid() {
    let submission =
      SubmissionRef::parse_slug("local-550e8400-e29b-41d4-a716-446655440000").unwrap();

    assert_eq!(submission.provider, SubmissionProvider::Local);
    assert_eq!(submission.submission_type, SubmissionType::Mod);
    assert_eq!(
      submission.submission_id,
      "550e8400-e29b-41d4-a716-446655440000"
    );
    assert_eq!(
      submission.to_slug(),
      "local-550e8400-e29b-41d4-a716-446655440000"
    );
  }

  #[test]
  fn malformed_slugs_are_rejected() {
    for slug in [
      "",
      "0",
      "01",
      "snd-",
      "snd-0",
      "snd-01",
      "snd-one",
      "local-",
      "local-abc-123",
      "local-550e8400-e29b-41d4-a716-44665544000z",
      "local-550e8400-e29b-41d4-a716-446655440000-extra",
      "local-a_b",
      "local-a/b",
      "gamebanana:mod:1",
      "-1",
      "mod-1",
    ] {
      assert!(SubmissionRef::parse_slug(slug).is_err(), "accepted {slug}");
    }
  }
}
