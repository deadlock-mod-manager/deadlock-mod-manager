use crate::commands::get_api_url;
use crate::errors::Error;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateReportRequest {
  #[serde(rename = "modId")]
  pub mod_id: String,
  #[serde(rename = "reporterHardwareId")]
  pub reporter_hardware_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateReportResponse {
  pub id: String,
  pub status: String,
  pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportCounts {
  pub total: u32,
}

pub struct ReportService {
  client: reqwest::Client,
  api_url: String,
}

impl ReportService {
  pub fn new() -> Result<Self, crate::errors::Error> {
    Ok(Self {
      client: crate::proxy::build_default_http_client()?,
      api_url: get_api_url(),
    })
  }

  pub async fn create_report(
    &self,
    data: CreateReportRequest,
  ) -> Result<CreateReportResponse, Error> {
    let mut request_body = serde_json::json!({
      "modId": data.mod_id,
    });

    if let Some(reporter_hardware_id) = data.reporter_hardware_id {
      request_body["reporterHardwareId"] = serde_json::Value::String(reporter_hardware_id);
    }

    log::info!("Creating report for mod: {}", data.mod_id);

    let response = self
      .client
      .post(format!("{}/api/v2/reports", self.api_url))
      .json(&request_body)
      .send()
      .await
      .map_err(|e| Error::Network(format!("Failed to send report request: {e}")))?;

    if !response.status().is_success() {
      let status = response.status();
      let error_text = response.text().await.unwrap_or_default();
      return Err(Error::Network(format!(
        "Report request failed with status {status}: {error_text}"
      )));
    }

    let result: CreateReportResponse = response
      .json()
      .await
      .map_err(|e| Error::Network(format!("Failed to parse report response: {e}")))?;

    log::info!("Report created successfully: {}", result.id);
    Ok(result)
  }

  pub async fn get_report_counts(&self, mod_id: &str) -> Result<ReportCounts, Error> {
    log::debug!("Fetching report counts for mod: {mod_id}");

    let response = self
      .client
      .get(format!(
        "{}/api/v2/reports/mod/{mod_id}/counts",
        self.api_url
      ))
      .send()
      .await
      .map_err(|e| Error::Network(format!("Failed to fetch report counts: {e}")))?;

    if !response.status().is_success() {
      let status = response.status();
      let error_text = response.text().await.unwrap_or_default();
      return Err(Error::Network(format!(
        "Report counts request failed with status {status}: {error_text}"
      )));
    }

    let result: ReportCounts = response
      .json()
      .await
      .map_err(|e| Error::Network(format!("Failed to parse report counts response: {e}")))?;

    Ok(result)
  }
}
