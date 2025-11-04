use thiserror::Error;

#[derive(Error, Debug)]
pub enum IngestError {
  #[error("Failed to ingest: {0}")]
  FailedToIngest(String),
  #[error("Request error: {0}")]
  RequestError(reqwest::Error),
}
