use crate::commands::get_api_url;
use crate::errors::Error;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateReportRequest {
  #[serde(rename = "modId")]
  pub mod_id: String,
  #[serde(rename = "type")]
  pub report_type: String,
  pub reason: String,
  pub description: Option<String>,
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
pub struct ReportTypeCounts {
  pub total: u32,
  pub verified: u32,
  pub unverified: u32,
  pub dismissed: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportCounts {
  pub total: u32,
  pub verified: u32,
  pub unverified: u32,
  pub dismissed: u32,
  #[serde(rename = "byType")]
  pub by_type: Option<std::collections::HashMap<String, ReportTypeCounts>>,
}

pub struct ReportService {
  client: reqwest::Client,
  api_url: String,
}

impl ReportService {
  pub fn new() -> Self {
    Self {
      client: reqwest::Client::new(),
      api_url: get_api_url(),
    }
  }

  pub async fn create_report(
    &self,
    data: CreateReportRequest,
  ) -> Result<CreateReportResponse, Error> {
    let mut request_body = serde_json::json!({
      "modId": data.mod_id,
      "type": data.report_type,
      "reason": data.reason
    });

    // Only include optional fields if they have values
    if let Some(description) = data.description {
      request_body["description"] = serde_json::Value::String(description);
    }
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
      .map_err(|e| Error::NetworkError(format!("Failed to send report request: {e}")))?;

    if !response.status().is_success() {
      let status = response.status();
      let error_text = response.text().await.unwrap_or_default();
      return Err(Error::NetworkError(format!(
        "Report request failed with status {status}: {error_text}"
      )));
    }

    let result: CreateReportResponse = response
      .json()
      .await
      .map_err(|e| Error::NetworkError(format!("Failed to parse report response: {e}")))?;

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
      .map_err(|e| Error::NetworkError(format!("Failed to fetch report counts: {e}")))?;

    if !response.status().is_success() {
      let status = response.status();
      let error_text = response.text().await.unwrap_or_default();
      return Err(Error::NetworkError(format!(
        "Report counts request failed with status {status}: {error_text}"
      )));
    }

    let result: ReportCounts = response
      .json()
      .await
      .map_err(|e| Error::NetworkError(format!("Failed to parse report counts response: {e}")))?;

    Ok(result)
  }
}

impl Default for ReportService {
  fn default() -> Self {
    Self::new()
  }
}
