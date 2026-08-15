//! Source 2 mesh (`.vmesh_c`) decoding: VBIB buffers → GLB / render model.
//!
//! Split by concern; submodules share the data types in `types` and each
//! other's helpers through the re-exports below (`use super::*`).

mod binary;
#[cfg(test)]
mod binary_tests;
mod decode;
mod glb;
mod meshdata;
mod pose_glb;
mod types;

pub(crate) use binary::*;
pub use decode::*;
pub use glb::*;
pub(crate) use meshdata::*;
pub use pose_glb::*;
pub use types::*;
