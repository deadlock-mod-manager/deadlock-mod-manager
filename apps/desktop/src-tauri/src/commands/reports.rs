use crate::errors::Error;
use crate::reports::{CreateReportRequest, CreateReportResponse, ReportCounts, ReportService};

#[tauri::command]
pub async fn create_report(data: CreateReportRequest) -> Result<CreateReportResponse, Error> {
  let report_service = ReportService::new()?;
  report_service.create_report(data).await
}

#[tauri::command]
pub async fn get_report_counts(mod_id: String) -> Result<ReportCounts, Error> {
  let report_service = ReportService::new()?;
  report_service.get_report_counts(&mod_id).await
}
