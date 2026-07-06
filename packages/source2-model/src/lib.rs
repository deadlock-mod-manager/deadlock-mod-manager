//! Decoder for Source 2 compiled assets used by the Mod Foundry.
//!
//! The first slice targets textures (`.vtex_c`): extract an entry from a VPK,
//! parse the resource block table, decode the top mip to RGBA8, and encode PNG.

pub mod error;
pub mod resource;
pub mod vpk_extract;
pub mod vtex;

use std::io::Cursor;
use std::path::Path;

use image::{ImageEncoder, ExtendedColorType};
use image::codecs::png::PngEncoder;

pub use error::{Result, Source2Error};
pub use resource::Resource;
pub use vtex::{DecodedTexture, VtexFormat, VtexHeader};

/// A decoded texture ready to hand to the UI.
pub struct TexturePng {
    pub width: u32,
    pub height: u32,
    pub png: Vec<u8>,
}

/// Decode a `.vtex_c` entry inside a VPK to a PNG.
pub fn decode_texture_png(vpk_path: &Path, entry_path: &str) -> Result<TexturePng> {
    let bytes = vpk_extract::extract_entry(vpk_path, entry_path)?;
    let res = Resource::parse(bytes)?;
    let header = VtexHeader::parse(&res)?;
    let decoded = header.decode(&res.data)?;
    encode_png(&decoded)
}

/// Parse only the texture header (dimensions / format / mips) without decoding.
pub fn inspect_texture(vpk_path: &Path, entry_path: &str) -> Result<(u32, u32, String)> {
    let bytes = vpk_extract::extract_entry(vpk_path, entry_path)?;
    let res = Resource::parse(bytes)?;
    let header = VtexHeader::parse(&res)?;
    Ok((
        header.width as u32,
        header.height as u32,
        format!("{:?}", header.format),
    ))
}

fn encode_png(decoded: &DecodedTexture) -> Result<TexturePng> {
    let mut png = Vec::new();
    PngEncoder::new(Cursor::new(&mut png)).write_image(
        &decoded.rgba,
        decoded.width,
        decoded.height,
        ExtendedColorType::Rgba8,
    )?;
    Ok(TexturePng {
        width: decoded.width,
        height: decoded.height,
        png,
    })
}
