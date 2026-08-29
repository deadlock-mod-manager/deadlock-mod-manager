use super::models::{DownloadPage, IndexPage, Profile};
use super::transport::{GameBananaTransport, TransportConfig};
use crate::errors::Error;
use crate::providers::{SubmissionProvider, SubmissionRef, SubmissionType};
use tokio_util::sync::CancellationToken;

const API_BASE: &str = "https://gamebanana.com/apiv11/";
const DEADLOCK_GAME_ID: u64 = 20_948;
const INDEX_PAGE_SIZE: u32 = 50;
const MAX_INDEX_PAGE: u32 = 250;

pub struct GameBananaClient {
  transport: GameBananaTransport,
}

impl GameBananaClient {
  pub fn new() -> Result<Self, Error> {
    Self::with_config(TransportConfig::default())
  }

  pub fn with_config(config: TransportConfig) -> Result<Self, Error> {
    Ok(Self {
      transport: GameBananaTransport::new(config)?,
    })
  }

  pub async fn index(
    &self,
    submission_type: SubmissionType,
    page: u32,
    latest_modified: bool,
    cancel: &CancellationToken,
  ) -> Result<IndexPage, Error> {
    if !(1..=MAX_INDEX_PAGE).contains(&page) {
      return Err(Error::ProviderInvalidResponse(format!(
        "index page must be between 1 and {MAX_INDEX_PAGE}"
      )));
    }

    let model = model_name(submission_type);
    let mut url = reqwest::Url::parse(&format!("{API_BASE}{model}/Index"))
      .map_err(|error| Error::ProviderInvalidResponse(error.to_string()))?;
    {
      let mut query = url.query_pairs_mut();
      query
        .append_pair("_nPerpage", &INDEX_PAGE_SIZE.to_string())
        .append_pair("_aFilters[Generic_Game]", &DEADLOCK_GAME_ID.to_string())
        .append_pair("_nPage", &page.to_string());
      if latest_modified {
        query.append_pair("_sSort", "Generic_LatestModified");
      }
    }

    self.transport.get_json("index", url, cancel).await
  }

  pub async fn profile(
    &self,
    submission: &SubmissionRef,
    cancel: &CancellationToken,
  ) -> Result<Profile, Error> {
    let url = submission_url(submission, "ProfilePage")?;
    self.transport.get_json("profile", url, cancel).await
  }

  pub async fn download_page(
    &self,
    submission: &SubmissionRef,
    cancel: &CancellationToken,
  ) -> Result<DownloadPage, Error> {
    let url = submission_url(submission, "DownloadPage")?;
    self.transport.get_json("download page", url, cancel).await
  }
}

fn submission_url(submission: &SubmissionRef, operation: &str) -> Result<reqwest::Url, Error> {
  if submission.provider != SubmissionProvider::Gamebanana
    || submission
      .submission_id
      .parse::<u64>()
      .ok()
      .filter(|id| *id > 0)
      .is_none()
  {
    return Err(Error::ProviderInvalidResponse(
      "operation requires a GameBanana submission".to_string(),
    ));
  }

  reqwest::Url::parse(&format!(
    "{API_BASE}{}/{}/{operation}",
    model_name(submission.submission_type),
    submission.submission_id
  ))
  .map_err(|error| Error::ProviderInvalidResponse(error.to_string()))
}

fn model_name(submission_type: SubmissionType) -> &'static str {
  match submission_type {
    SubmissionType::Mod => "Mod",
    SubmissionType::Sound => "Sound",
  }
}

#[cfg(test)]
mod tests {
  use super::{MAX_INDEX_PAGE, model_name, submission_url};
  use crate::providers::{SubmissionRef, SubmissionType};

  #[test]
  fn endpoints_are_derived_from_validated_provider_identity() {
    let sound = SubmissionRef::parse_slug("snd-42").unwrap();
    assert_eq!(model_name(SubmissionType::Sound), "Sound");
    assert_eq!(
      submission_url(&sound, "ProfilePage").unwrap().as_str(),
      "https://gamebanana.com/apiv11/Sound/42/ProfilePage"
    );

    let local =
      SubmissionRef::parse_slug("local-550e8400-e29b-41d4-a716-446655440000").unwrap();
    assert!(submission_url(&local, "ProfilePage").is_err());
    assert_eq!(MAX_INDEX_PAGE, 250);
  }
}
