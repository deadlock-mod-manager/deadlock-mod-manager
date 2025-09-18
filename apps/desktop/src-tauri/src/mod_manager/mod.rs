// Module declarations
pub mod addons_manager;
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
pub use file_tree::ModFileTree;
pub use manager::ModManager;
pub use mod_repository::Mod;
