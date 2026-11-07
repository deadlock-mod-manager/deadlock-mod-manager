//! Shared, lossless GameInfo source inspection and file commits.

mod conditions;
mod source;
mod write;

pub(crate) use conditions::Platform;
pub(crate) use source::{Comment, Document, Site, SiteKind, line_end, line_start};
pub(crate) use write::{WriteError, commit};
