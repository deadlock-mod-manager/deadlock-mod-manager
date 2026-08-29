mod client;
mod generated_hero_registry;
mod hero_registry;
mod models;
mod normalization;
mod transport;

pub use client::GameBananaClient;
pub use models::{DownloadPage, IndexPage, Profile, SubmissionFile};
pub use normalization::{
  DonationLink, NormalizedRequirement, NormalizedSubmission, classify_nsfw, donation_links,
  extract_map_name, normalize_profile, parse_requirements, parse_tags,
};
pub use transport::TransportConfig;
