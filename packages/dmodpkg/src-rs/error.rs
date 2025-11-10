use thiserror::Error;

/// Result type for dmodpkg operations
pub type Result<T> = std::result::Result<T, DmodpkgError>;

/// Errors that can occur during dmodpkg operations
#[derive(Error, Debug)]
pub enum DmodpkgError {
    /// IO errors (file reading, writing, etc.)
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    /// JSON parsing/serialization errors
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    /// Configuration validation errors
    #[error("Validation error: {0}")]
    Validation(String),

    /// Compression/decompression errors
    #[error("Compression error: {0}")]
    Compression(String),

    /// Binary format errors (invalid magic bytes, corrupted data, etc.)
    #[error("Format error: {0}")]
    Format(String),

    /// Checksum verification failures
    #[error("Checksum mismatch: {0}")]
    ChecksumMismatch(String),

    /// Invalid package structure
    #[error("Invalid package structure: {0}")]
    InvalidStructure(String),

    /// Layer errors (missing layer, conflicting layers, etc.)
    #[error("Layer error: {0}")]
    Layer(String),

    /// Variant errors (invalid variant selection, etc.)
    #[error("Variant error: {0}")]
    Variant(String),

    /// Transformer errors
    #[error("Transformer error: {0}")]
    Transformer(String),
}

impl DmodpkgError {
    /// Create a validation error
    pub fn validation(msg: impl Into<String>) -> Self {
        Self::Validation(msg.into())
    }

    /// Create a compression error
    pub fn compression(msg: impl Into<String>) -> Self {
        Self::Compression(msg.into())
    }

    /// Create a format error
    pub fn format(msg: impl Into<String>) -> Self {
        Self::Format(msg.into())
    }

    /// Create a checksum mismatch error
    pub fn checksum_mismatch(msg: impl Into<String>) -> Self {
        Self::ChecksumMismatch(msg.into())
    }

    /// Create an invalid structure error
    pub fn invalid_structure(msg: impl Into<String>) -> Self {
        Self::InvalidStructure(msg.into())
    }

    /// Create a layer error
    pub fn layer(msg: impl Into<String>) -> Self {
        Self::Layer(msg.into())
    }

    /// Create a variant error
    pub fn variant(msg: impl Into<String>) -> Self {
        Self::Variant(msg.into())
    }

    /// Create a transformer error
    pub fn transformer(msg: impl Into<String>) -> Self {
        Self::Transformer(msg.into())
    }
}

