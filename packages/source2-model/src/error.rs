use thiserror::Error;

#[derive(Debug, Error)]
pub enum Source2Error {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error("VPK error: {0}")]
    Vpk(String),
    #[error("entry not found in VPK: {0}")]
    EntryNotFound(String),
    #[error("malformed Source 2 resource: {0}")]
    Resource(String),
    #[error("unsupported texture format: {0}")]
    UnsupportedFormat(String),
    #[error("texture decode failed: {0}")]
    Decode(String),
    #[error("image encode failed: {0}")]
    Encode(#[from] image::ImageError),
}

pub type Result<T> = std::result::Result<T, Source2Error>;
