// Module declarations
pub mod addon_analyzer;
pub mod archive_extractor;
pub mod file_tree;
pub mod filesystem_helper;
pub mod game_config_manager;
pub mod game_process_manager;
pub mod manager;
pub mod mod_repository;
pub mod steam_manager;
pub mod vpk_manager;

// Re-export main types
pub use addon_analyzer::{AddonAnalyzer, AnalyzeAddonsResult, LocalAddonInfo};
pub use file_tree::ModFileTree;
pub use manager::ModManager;
pub use mod_repository::Mod;
