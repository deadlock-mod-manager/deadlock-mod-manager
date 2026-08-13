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
}

pub type Result<T> = std::result::Result<T, VpkManagerError>;
