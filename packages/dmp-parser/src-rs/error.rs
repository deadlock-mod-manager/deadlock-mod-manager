use thiserror::Error;

#[derive(Error, Debug)]
pub enum DmpError {
  #[error("Failed to parse minidump: {0}")]
  ParseError(String),

  #[error("File not found: {0}")]
  FileNotFound(String),
}

pub type Result<T> = std::result::Result<T, DmpError>;
