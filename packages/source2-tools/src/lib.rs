mod clock;
mod launch;
mod metadata;
mod prepare;
mod profile;
mod provision;

pub use clock::{ANIMATION_SYSTEM_SHA256, EDITOR_SHA256, PATCHED_EDITOR_SHA256, patch_modeldoc};
pub use launch::{
    ProtonRuntime, SdkTool, compiler_command, sdk_command, sdk_project_command, viewer_command,
};
pub use metadata::{editor_addon_root, modeldoc_preview_entity};
pub use prepare::{PrepareOptions, WORKBENCH_ADDON, prepare_sdk};
pub use profile::{ModuleCheck, SdkInspection, inspect_sdk};
pub use provision::{RuntimeDepot, depot_command, runtime_available, runtime_depots};

use std::io;
use std::path::PathBuf;

use sha2::{Digest, Sha256};

#[derive(Debug, thiserror::Error)]
pub enum ToolError {
    #[error("{path}: {source}")]
    Io { path: PathBuf, source: io::Error },
    #[error("Unsupported {component} SHA-256: {actual}")]
    UnsupportedBinary {
        component: &'static str,
        actual: String,
    },
    #[error("Invalid PE image: {0}")]
    InvalidPe(&'static str),
    #[error("Invalid bundled compatibility profile: {0}")]
    InvalidProfile(#[from] serde_json::Error),
    #[error("The patch output differs from the verified compatibility profile")]
    UnexpectedPatch,
    #[error("{0}")]
    InvalidInput(String),
}

fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn read(path: &std::path::Path) -> Result<Vec<u8>, ToolError> {
    std::fs::read(path).map_err(|source| ToolError::Io {
        path: path.to_owned(),
        source,
    })
}
