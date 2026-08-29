//! Managing the game install: mods, profiles, backups, config.
//!
//! Everything that reads or writes a VPK inside a `citadel/addonsN` folder goes
//! through the shared `vpkmanager` package rather than touching the filesystem
//! here. This module re-exports that package's types under the names the rest of
//! the app uses, so there is exactly one place a VPK operation can come from and
//! exactly one book — the profile ledger — recording where every mod file is.

pub mod addon_analyzer;
pub mod addons_backup_manager;
pub mod archive_extractor;
pub mod autoexec_manager;
pub mod console_log_watcher;
pub mod file_tree;
pub mod filesystem_helper;
pub mod font_manager;
pub mod game_config_manager;
pub mod game_process_manager;
pub mod manager;
pub mod mod_repository;
pub mod shard_report;
pub mod steam_manager;
pub(crate) mod steam_uri_launcher;

pub use addon_analyzer::{AddonAnalyzer, AnalyzeAddonsResult};
pub use addons_backup_manager::AddonsBackup;
pub use autoexec_manager::{AutoexecConfig, ReadonlySection};
pub use file_tree::ModFileTree;
pub use font_manager::{FontInfo, FontManager};
pub use manager::ModManager;
pub(crate) use manager::profile_base_from_game;
pub use mod_repository::Mod;

/// The profile shard layout: which `citadel/addonsN` folder a mod's files live
/// in, and how a file is addressed across that layout.
pub use vpkmanager::profile as shard;
