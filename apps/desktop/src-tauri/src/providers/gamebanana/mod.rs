mod activity;
pub mod catalog;
mod client;
mod embedded_video;
mod generated_hero_registry;
mod hero_registry;
mod models;
mod normalization;
mod transport;

pub use activity::{ActivityPage, SubmissionUpdate, gamebanana_url};
pub use client::GameBananaClient;
pub use embedded_video::{EmbeddedVideo, VideoProvider, embedded_videos};
pub use models::{
  BulkHydration, CategoryListing, CollectionDescription, DownloadPage, FileserverPage,
  FileserverRecord, IndexCollection, IndexPage, MemberProfile, Profile, SubmissionFile,
  UpdateSnapshot, WithholdNotice,
};
pub use normalization::{
  DonationLink, NormalizedRequirement, NormalizedSubmission, classify_nsfw, donation_links,
  extract_map_name, is_nsfw_visibility, normalize_profile, parse_requirements, parse_tags,
};
pub use transport::{ApiResponse, TransportConfig};
