mod discord;
mod patterns;

pub mod hero_data;
pub mod log_parser;
pub mod presence_builder;
pub mod state;
pub mod watcher;

pub use discord::{DiscordActivity, DiscordPresenceState, PresenceOwner, SetActivityOptions};
pub use hero_data::{HeroDataStore, HeroInfo};
pub use log_parser::LogParser;
pub use presence_builder::build_presence;
pub use state::{GamePhase, GameState, MatchMode};
pub use watcher::{GamePresenceWatcher, PresencePhase, PresenceStatusCallback};
