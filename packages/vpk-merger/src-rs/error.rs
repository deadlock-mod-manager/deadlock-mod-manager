use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum VpkMergerError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("VPK parse error: {0}")]
    Parse(#[from] vpk_parser::VpkError),

    #[error("Unsupported VPK version {version} (only versions 1 and 2 are supported)")]
    UnsupportedVersion { version: u32 },

    #[error("Invalid VPK: {message}")]
    Invalid { message: String },

    #[error("Operation cancelled")]
    Cancelled,

    #[error(
        "Missing archive chunk for entry \"{entry_path}\" (expected {})",
        .expected_archive.display()
    )]
    MissingChunk {
        entry_path: String,
        expected_archive: PathBuf,
    },
}

pub type Result<T> = std::result::Result<T, VpkMergerError>;
