//! The Mod Foundry: load a hero skin VPK, preview its character model, edit its
//! cards, textures and sounds, and pack the result back into a working VPK.
//!
//! Split by concern:
//! - `analyze` turns a VPK into the categorized manifest the UI renders
//! - `staging` keeps every read off the user's original files
//! - opened VPKs are cached in [`crate::vpk_archive_cache`]; parsing pak01 is
//!   ~550 ms
//! - `workspace` owns the unpacked, editable copy and the VPK writer
//! - `paint` recolors whole parts of the hero (body, gun, abilities), and
//!   `palette` offers the colors the skin already wears
//! - `remove_parts` takes sections of the hero out of the game
//! - `sounds` groups a hero's clips by ability slot
//! - `hero` holds the codename tables those two need
//! - `vdata` asks the game which model is a hero's body
//! - `export` delivers the packed VPK to a file, a new mod, or the source mod
//! - `animation`, `cloth` and `particles` feed the animated 3D preview, and
//!   `ability_vfx` picks the effects an ability plays on its caster
//! - `commands` is the Tauri surface

mod ability_vfx;
mod analyze;
mod animation;
pub(crate) use crate::vpk_archive_cache::open_archive;
mod cloth;
mod commands;
mod effect_catalog;
mod export;
mod game;
mod hero;
mod model_abilities;
mod model_assets;
mod paint;
mod palette;
mod particles;
mod preview;
mod remove_parts;
mod resolve;
mod sounds;
mod source_particles;
pub(crate) use sounds::find_mp3_payload;
mod staging;
mod types;
pub(crate) use types::FoundryModel;
mod vdata;
mod workspace;

pub use animation::*;
pub use cloth::*;
pub use commands::*;
pub use effect_catalog::*;
pub use model_abilities::*;
pub use model_assets::*;
pub use particles::*;
pub use preview::*;
pub use resolve::*;
pub use source_particles::*;
