//! Writing Deadlock VPKs and the compiled Source 2 assets inside them.
//!
//! This is the shared *write* half of the mod manager's VPK work: recoloring and
//! replacing textures, swapping sounds, and packing a directory tree back into a
//! loadable VPK. The read/render half — decoding models to glTF for the 3D
//! preview — lives in `source2-model`.
//!
//! The codecs under [`source2`] are vendored from the MIT-licensed
//! [vpkmerge](https://github.com/Slush97/vpkmerge) project (its `morphic` crate),
//! whose algorithms are adapted from ValveResourceFormat (MIT). Full license
//! texts live in `LICENSE-vpkmerge` and `LICENSE-ValveResourceFormat`. See the
//! `source2` module for what was and was not taken.

pub mod audio;
pub mod error;
pub mod fingerprint;
pub mod pack;
pub mod particle_edit;
pub mod pattern;
pub mod sound_edit;
pub mod source2;
pub mod texture_edit;
pub mod vpkdir;

pub use error::{Result, VpkManagerError};
pub use fingerprint::VpkFingerprint;
pub use pack::pack_directory;
pub use particle_edit::recolor_particle_colors;
pub use pattern::{Pattern, PatternStyle, pattern_swatch, pattern_texture};
pub use sound_edit::{SoundInput, classify_sound_input, swap_sound};
pub use texture_edit::{
    EditedTexture, Recolor, paint_texture, recolor_texture, replace_texture_image,
};
pub use vpkdir::VpkDir;

/// Parse only a texture's header: its format, stored size and mip count.
pub fn inspect_texture(bytes: &[u8]) -> Result<(u32, u32, String)> {
    let info = source2::inspect(bytes)?;
    Ok((
        u32::from(info.width),
        u32::from(info.height),
        format!("{:?}", info.format),
    ))
}
