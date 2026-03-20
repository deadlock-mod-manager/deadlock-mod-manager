use thiserror::Error;

#[derive(Error, Debug)]
pub enum DmpError {
  #[error("Failed to read minidump file: {0}")]
  ReadError(String),

  #[error("Failed to parse minidump: {0}")]
  ParseError(String),

  #[error("File not found: {0}")]
  FileNotFound(String),

  #[error("Invalid minidump format: {0}")]
  InvalidFormat(String),

  #[error("IO error: {0}")]
  Io(#[from] std::io::Error),

  #[error("JSON serialization error: {0}")]
  Json(#[from] serde_json::Error),
}

pub type Result<T> = std::result::Result<T, DmpError>;
