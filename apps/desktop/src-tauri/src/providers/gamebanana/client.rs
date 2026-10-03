use super::models::{
  BulkHydration, DownloadPage, FileserverPage, IndexPage, Profile, UpdateSnapshot, UpdatesPage,
  core_error,
};
use super::transport::{GameBananaTransport, TransportConfig};
use crate::errors::Error;
use crate::providers::{SubmissionProvider, SubmissionRef, SubmissionType};
use tokio_util::sync::CancellationToken;

const API_BASE: &str = "https://gamebanana.com/apiv11/";
// `Core/Item/Data` multicall only exists on the legacy API host, not under apiv11.
const LEGACY_API_BASE: &str = "https://api.gamebanana.com/";
pub(crate) const DEADLOCK_GAME_ID: u64 = 20_948;
const INDEX_PAGE_SIZE: u32 = 50;
const MAX_INDEX_PAGE: u32 = 250;
const MAX_BULK_ITEMS: usize = 50;
const UPDATES_PAGE_SIZE: u32 = 10;
// Each item repeats the full field list; 50 hydration items exceed the URL limit (GameBanana answers 414).
pub(crate) const MAX_HYDRATION_ITEMS: usize = 40;
const MAX_BULK_URL_BYTES: usize = 7_000;
const BULK_FIELDS: &[&str] = &[
  "name",
  "downloads",
  "Category().name",
  "RootCategory().name",
  "description",
  "text",
  "Files().aFiles()",
];
const UPDATE_FIELDS: &[&str] = &["Url().sProfileUrl()", "mdate", "Files().aFiles()"];

#[derive(Clone)]
pub struct GameBananaClient {
  transport: GameBananaTransport,
  api_base: String,
  legacy_api_base: String,
}

impl GameBananaClient {
  pub fn new() -> Result<Self, Error> {
    let (api_base, legacy_api_base) = crate::runtime_environment::current()
      .e2e()
      .map(|configuration| {
        let origin = configuration
          .endpoint(crate::runtime_environment::ServiceName::Gamebanana)
          .trim_end_matches('/');
        (format!("{origin}/apiv11/"), format!("{origin}/"))
      })
      .unwrap_or_else(|| (API_BASE.to_string(), LEGACY_API_BASE.to_string()));
    Self::with_base_and_config(api_base, legacy_api_base, TransportConfig::default())
  }

  fn with_base_and_config(
    api_base: String,
    legacy_api_base: String,
    config: TransportConfig,
  ) -> Result<Self, Error> {
    Ok(Self {
      transport: GameBananaTransport::new(config)?,
      api_base,
      legacy_api_base,
    })
  }

  pub async fn index(
    &self,
    submission_type: SubmissionType,
    page: u32,
    latest_modified: bool,
    cancel: &CancellationToken,
  ) -> Result<IndexPage, Error> {
    let url = index_url(&self.api_base, submission_type, page, latest_modified)?;

    self.transport.get_json("index", url, cancel).await
  }

  pub async fn profile(
    &self,
    submission: &SubmissionRef,
    cancel: &CancellationToken,
  ) -> Result<Profile, Error> {
    let url = submission_url(&self.api_base, submission, "ProfilePage")?;
    self.transport.get_json("profile", url, cancel).await
  }

  pub async fn download_page(
    &self,
    submission: &SubmissionRef,
    cancel: &CancellationToken,
  ) -> Result<DownloadPage, Error> {
    let url = submission_url(&self.api_base, submission, "DownloadPage")?;
    self.transport.get_json("download page", url, cancel).await
  }

  pub async fn updates(
    &self,
    submission: &SubmissionRef,
    page: u32,
    cancel: &CancellationToken,
  ) -> Result<UpdatesPage, Error> {
    let mut url = submission_url(&self.api_base, submission, "Updates")?;
    url
      .query_pairs_mut()
      .append_pair("_nPage", &page.max(1).to_string())
      .append_pair("_nPerpage", &UPDATES_PAGE_SIZE.to_string());
    self.transport.get_json("updates", url, cancel).await
  }

  pub async fn fileservers(&self, cancel: &CancellationToken) -> Result<FileserverPage, Error> {
    let url = reqwest::Url::parse(&format!("{}Util/Fileservers?_nPage=1", self.api_base))
      .map_err(|error| Error::ProviderInvalidResponse(error.to_string()))?;
    self.transport.get_json("fileservers", url, cancel).await
  }

  pub async fn bulk_hydrate(
    &self,
    submissions: &[SubmissionRef],
    cancel: &CancellationToken,
  ) -> Result<Vec<Option<BulkHydration>>, Error> {
    let url = item_data_url(
      &self.legacy_api_base,
      submissions,
      BULK_FIELDS,
      MAX_HYDRATION_ITEMS,
      "bulk hydration",
    )?;
    let value = self
      .transport
      .get_json::<serde_json::Value>("bulk hydration", url, cancel)
      .await?;
    if let Some(error) = core_error(&value) {
      return Err(Error::ProviderInvalidResponse(format!(
        "bulk hydration failed: {error}"
      )));
    }
    let records = BulkHydration::parse_many(value);
    if records.len() != submissions.len() {
      return Err(Error::ProviderInvalidResponse(format!(
        "bulk hydration returned {} records for {} submissions",
        records.len(),
        submissions.len()
      )));
    }
    Ok(records)
  }

  pub async fn bulk_updates(
    &self,
    submissions: &[SubmissionRef],
    cancel: &CancellationToken,
  ) -> Result<Vec<Option<UpdateSnapshot>>, Error> {
    let url = item_data_url(
      &self.legacy_api_base,
      submissions,
      UPDATE_FIELDS,
      MAX_BULK_ITEMS,
      "bulk update",
    )?;
    let value = self
      .transport
      .get_json::<serde_json::Value>("bulk updates", url, cancel)
      .await?;
    if let Some(error) = core_error(&value) {
      return Err(Error::ProviderInvalidResponse(format!(
        "bulk update failed: {error}"
      )));
    }
    let records = UpdateSnapshot::parse_many(value, submissions);
    if records.len() != submissions.len() {
      return Err(Error::ProviderInvalidResponse(
        "bulk update response length did not match the request".to_string(),
      ));
    }
    Ok(records)
  }
}

fn index_url(
  api_base: &str,
  submission_type: SubmissionType,
  page: u32,
  latest_modified: bool,
) -> Result<reqwest::Url, Error> {
  if !(1..=MAX_INDEX_PAGE).contains(&page) {
    return Err(Error::ProviderInvalidResponse(format!(
      "index page must be between 1 and {MAX_INDEX_PAGE}"
    )));
  }

  let model = model_name(submission_type);
  let mut url = reqwest::Url::parse(&format!("{api_base}{model}/Index"))
    .map_err(|error| Error::ProviderInvalidResponse(error.to_string()))?;
  {
    let mut query = url.query_pairs_mut();
    query
      .append_pair("_nPerpage", &INDEX_PAGE_SIZE.to_string())
      .append_pair("_aFilters[Generic_Game]", &DEADLOCK_GAME_ID.to_string())
      .append_pair("_nPage", &page.to_string());
    // The default order is unstable near the tail, so full crawls page oldest-first,
    // where new uploads only append to the end.
    query.append_pair(
      "_sSort",
      if latest_modified {
        "Generic_LatestModified"
      } else {
        "Generic_Oldest"
      },
    );
  }

  Ok(url)
}

/// `Core/Item/Data` pairs `itemtype[i]`, `itemid[i]`, and `fields[i]` by index,
/// so every item needs its own comma-separated field list.
fn item_data_url(
  legacy_api_base: &str,
  submissions: &[SubmissionRef],
  fields: &[&str],
  max_items: usize,
  label: &str,
) -> Result<reqwest::Url, Error> {
  let first = submissions.first().ok_or_else(|| {
    Error::ProviderInvalidResponse(format!("{label} requires at least one submission"))
  })?;
  if submissions.len() > max_items
    || submissions.iter().any(|submission| {
      submission.provider != SubmissionProvider::Gamebanana
        || submission.submission_type != first.submission_type
        || submission.submission_id.parse::<u64>().is_err()
    })
  {
    return Err(Error::ProviderInvalidResponse(format!(
      "{label} requires up to {max_items} GameBanana submissions of one type"
    )));
  }
  let mut url = reqwest::Url::parse(&format!("{legacy_api_base}Core/Item/Data"))
    .map_err(|error| Error::ProviderInvalidResponse(error.to_string()))?;
  let fields = fields.join(",");
  {
    let mut query = url.query_pairs_mut();
    for submission in submissions {
      query
        .append_pair("itemtype[]", model_name(submission.submission_type))
        .append_pair("itemid[]", &submission.submission_id)
        .append_pair("fields[]", &fields);
    }
  }
  if url.as_str().len() > MAX_BULK_URL_BYTES {
    return Err(Error::ProviderInvalidResponse(format!(
      "{label} request exceeds the URL safety limit"
    )));
  }
  Ok(url)
}

fn submission_url(
  api_base: &str,
  submission: &SubmissionRef,
  operation: &str,
) -> Result<reqwest::Url, Error> {
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
    "{api_base}{}/{}/{operation}",
    model_name(submission.submission_type),
    submission.submission_id
  ))
  .map_err(|error| Error::ProviderInvalidResponse(error.to_string()))
}

fn model_name(submission_type: SubmissionType) -> &'static str {
  match submission_type {
    SubmissionType::Mod => "Mod",
    SubmissionType::Sound => "Sound",
    SubmissionType::Wip => "Wip",
  }
}

#[cfg(test)]
mod tests {
  use super::{
    API_BASE, BULK_FIELDS, LEGACY_API_BASE, MAX_BULK_ITEMS, MAX_BULK_URL_BYTES,
    MAX_HYDRATION_ITEMS, MAX_INDEX_PAGE, index_url, item_data_url, model_name, submission_url,
  };
  use crate::providers::{SubmissionRef, SubmissionType};

  #[test]
  fn endpoints_are_derived_from_validated_provider_identity() {
    let sound = SubmissionRef::parse_slug("snd-42").unwrap();
    assert_eq!(model_name(SubmissionType::Sound), "Sound");
    assert_eq!(
      submission_url(API_BASE, &sound, "ProfilePage")
        .unwrap()
        .as_str(),
      "https://gamebanana.com/apiv11/Sound/42/ProfilePage"
    );

    let local = SubmissionRef::parse_slug("local-550e8400-e29b-41d4-a716-446655440000").unwrap();
    assert!(submission_url(API_BASE, &local, "ProfilePage").is_err());
    assert_eq!(MAX_INDEX_PAGE, 250);
    assert_eq!(MAX_BULK_ITEMS, 50);
    assert_eq!(MAX_BULK_URL_BYTES, 7_000);
  }
  #[test]
  fn index_query_preserves_wire_format_and_pagination() {
    let url = index_url(API_BASE, SubmissionType::Sound, 3, true).unwrap();
    assert_eq!(
      url.as_str(),
      "https://gamebanana.com/apiv11/Sound/Index?_nPerpage=50&_aFilters%5BGeneric_Game%5D=20948&_nPage=3&_sSort=Generic_LatestModified"
    );
    let request = reqwest::Client::new().get(url.clone()).build().unwrap();
    assert_eq!(request.url(), &url);
    assert!(
      index_url(API_BASE, SubmissionType::Mod, 1, false)
        .unwrap()
        .query()
        .unwrap()
        .ends_with("_sSort=Generic_Oldest")
    );
    assert!(index_url(API_BASE, SubmissionType::Mod, 0, false).is_err());
    assert!(index_url(API_BASE, SubmissionType::Mod, MAX_INDEX_PAGE + 1, false).is_err());
  }

  #[test]
  fn item_data_targets_legacy_host_with_per_item_fields() {
    let submissions = ["723531", "707574"]
      .map(|id| SubmissionRef::parse_slug(id).unwrap())
      .to_vec();
    let url = item_data_url(
      LEGACY_API_BASE,
      &submissions,
      &["name", "downloads"],
      MAX_BULK_ITEMS,
      "test",
    )
    .unwrap();
    assert_eq!(
      url.as_str(),
      "https://api.gamebanana.com/Core/Item/Data?itemtype%5B%5D=Mod&itemid%5B%5D=723531&fields%5B%5D=name%2Cdownloads&itemtype%5B%5D=Mod&itemid%5B%5D=707574&fields%5B%5D=name%2Cdownloads"
    );
  }

  #[test]
  fn full_hydration_batch_fits_the_url_limit() {
    let submissions = vec![SubmissionRef::parse_slug("9999999").unwrap(); MAX_HYDRATION_ITEMS];
    assert!(
      item_data_url(
        LEGACY_API_BASE,
        &submissions,
        BULK_FIELDS,
        MAX_HYDRATION_ITEMS,
        "test"
      )
      .is_ok()
    );
  }
}
