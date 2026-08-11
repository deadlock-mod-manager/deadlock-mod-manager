//! The Mod Foundry: load a hero skin VPK, preview its character model, edit its
//! cards, textures and sounds, and pack the result back into a working VPK.
//!
//! Split by concern:
//! - `analyze` turns a VPK into the categorized manifest the UI renders
//! - `staging` keeps every read off the user's original files
//! - `archive_cache` keeps opened VPKs around; parsing pak01 is ~550 ms
//! - `workspace` owns the unpacked, editable copy and the VPK writer
//! - `paint` recolors whole parts of the hero (body, gun, abilities)
//! - `sounds` groups a hero's clips by ability slot
//! - `hero` holds the codename tables those two need
//! - `export` delivers the packed VPK to a file, a new mod, or the source mod
//! - `commands` is the Tauri surface

mod analyze;
mod archive_cache;
mod commands;
mod export;
mod game;
mod hero;
mod paint;
mod resolve;
mod sounds;
mod staging;
mod types;
mod workspace;

pub use commands::*;
pub use resolve::*;
