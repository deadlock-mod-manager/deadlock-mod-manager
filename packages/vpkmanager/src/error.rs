use thiserror::Error;

use crate::source2::{DecodeError, EncodeError};

#[derive(Debug, Error)]
pub enum VpkManagerError {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error("failed to read Source 2 asset: {0}")]
    Decode(#[from] DecodeError),
    #[error("failed to write Source 2 asset: {0}")]
    Encode(#[from] EncodeError),
    #[error("unsupported image: {0}")]
    Image(#[from] image::ImageError),
    #[error("unsupported audio: {0}")]
    Audio(String),
    #[error("VPK error: {0}")]
    Vpk(String),
    #[error("{0}")]
    Invalid(String),
    /// A VPK the ledger expects is not on disk.
    #[error("VPK file not found: {0}")]
    NotFound(String),
    /// The game (or another process) is holding a VPK open.
    #[error("VPK files are in use: {0}")]
    InUse(String),
    /// An operation failed *and* undoing it failed, so the profile may be in a
    /// state neither the caller nor the ledger describes.
    #[error("operation failed and rollback was incomplete: {0}")]
    RollbackFailed(String),
}

pub type Result<T> = std::result::Result<T, VpkManagerError>;
