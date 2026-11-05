//! Framework-independent Deadlock relay selection. Only the firewall helper
//! requires elevation; catalog access, preferences and measurements do not.
pub mod catalog;
mod engine;
pub mod firewall;
pub mod helper;
mod persistence;
mod probe;
pub mod types;

pub use engine::ServerPicker;
pub use types::*;

#[derive(Debug, thiserror::Error)]
pub enum PickerError {
  #[error("{0}")]
  Validation(String),
  #[error("{0}")]
  Firewall(String),
  #[error("{0}")]
  Catalog(String),
  #[error("Server picker storage failed: {0}")]
  Storage(#[from] std::io::Error),
  #[error("Server picker data is invalid: {0}")]
  Data(#[from] serde_json::Error),
  #[error("Latency measurement was cancelled")]
  Cancelled,
}

impl PickerError {
  pub fn code(&self) -> &'static str {
    match self {
      Self::Validation(_) => "validation",
      Self::Firewall(_) => "firewall",
      Self::Catalog(_) => "catalog",
      Self::Storage(_) => "storage",
      Self::Data(_) => "data",
      Self::Cancelled => "cancelled",
    }
  }
}

pub(crate) fn now_ms() -> u64 {
  std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .unwrap_or_default()
    .as_millis()
    .try_into()
    .unwrap_or(u64::MAX)
}
