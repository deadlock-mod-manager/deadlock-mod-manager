pub mod gamebanana;
pub mod native_sources;
mod submission_ref;

pub use submission_ref::{
  ParseSubmissionRefError, SubmissionProvider, SubmissionRef, SubmissionType,
};
