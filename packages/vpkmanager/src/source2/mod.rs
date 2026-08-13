//! Source 2 container, texture, KV3 and sound codecs.
//!
//! Vendored from the `morphic` crate of the MIT-licensed
//! [vpkmerge](https://github.com/Slush97/vpkmerge) project, whose algorithms are
//! in turn adapted from ValveResourceFormat (MIT). Only the parts the mod
//! manager writes through are kept: the resource container, the `.vtex_c`
//! decoder/encoder (including the BCn mip-chain re-encode), binary KV3, and the
//! `.vsnd_c` codec. The model exporter, material compiler and VFX expression
//! compiler are deliberately not vendored — `source2-model` already covers the
//! read/render side.
//!
//! Keep this subtree close to upstream so a future `morphic` release can be
//! re-vendored; new behavior belongs in the modules beside it, not in here.

pub mod edit;
pub mod error;
pub mod kv3;
pub mod resource;
pub mod sound;
pub mod texture;

pub use error::{DecodeError, EncodeError};
pub use texture::format::{TextureFlags, TextureFormat};
pub use texture::{Image, ImageData, TextureInfo, crop_to_actual, parse_texture_header};

/// Decode options. Defaults select mip 0, slice 0, face 0.
#[derive(Clone, Copy, Debug, Default)]
pub struct DecodeOptions {
    pub mip: u8,
    pub slice: u16,
    pub face: u8,
}

/// Cheap header read: parses the resource container and the texture binary
/// header without touching pixel data.
pub fn inspect(bytes: &[u8]) -> Result<TextureInfo, DecodeError> {
    let resource = resource::Resource::parse(bytes)?;
    let data = resource.data_block()?;
    let mut info = parse_texture_header(data)?;
    info.ycocg = texture::detect_ycocg(&resource);
    Ok(info)
}

/// Decode the top mip of the first slice/face.
pub fn decode(bytes: &[u8]) -> Result<Image, DecodeError> {
    decode_at(bytes, &DecodeOptions::default())
}

/// Decode a specific mip/slice/face.
pub fn decode_at(bytes: &[u8], opts: &DecodeOptions) -> Result<Image, DecodeError> {
    let resource = resource::Resource::parse(bytes)?;
    let data = resource.data_block()?;
    let mut info = parse_texture_header(data)?;
    info.ycocg = texture::detect_ycocg(&resource);
    let pixels = texture::pixel_data(&resource, &info, *opts)?;
    texture::decode::decode_image(&info, pixels, opts)
}

pub use texture::encode::encode_image;
