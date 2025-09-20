use thiserror::Error;

#[derive(Error, Debug)]
pub enum VpkError {
    #[error("Buffer too small for VPK header: expected at least {expected} bytes, got {actual}")]
    BufferTooSmall { expected: usize, actual: usize },

    #[error("Invalid VPK signature: expected 0x{expected:08x}, got 0x{actual:08x}")]
    InvalidSignature { expected: u32, actual: u32 },

    #[error("Cursor overrun: attempted to read {requested} bytes at position {cursor}, buffer size is {buffer_size}")]
    CursorOverrun {
        cursor: usize,
        requested: usize,
        buffer_size: usize,
    },

    #[error("Invalid null-terminated string: no null terminator found")]
    InvalidString,

    #[error("Invalid entry terminator: expected 0xFFFF, got 0x{actual:04x}")]
    InvalidTerminator { actual: u16 },

    #[error("UTF-8 conversion error: {0}")]
    Utf8(#[from] std::string::FromUtf8Error),

    #[error("JSON serialization error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Validation error: {message}")]
    Validation { message: String },
}

pub type Result<T> = std::result::Result<T, VpkError>;
