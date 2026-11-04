#[derive(Debug, thiserror::Error)]
pub enum Error {
  #[error(transparent)]
  Io(#[from] std::io::Error),
  #[error(transparent)]
  Zip(#[from] zip::result::ZipError),
  #[error("Invalid input: {0}")]
  InvalidInput(String),
  #[error("{message}")]
  Host { code: &'static str, message: String },
}
