// SPDX-FileCopyrightText: 2026 esoc
// SPDX-FileCopyrightText: 2015 ValveResourceFormat Contributors
// SPDX-License-Identifier: MIT

//! New `.vtex_c` resource writers.
//!
//! This starts with the smallest format useful for generated soul-container
//! base-color textures: `PNG_RGBA8888`. Unlike the template-splice APIs, these
//! functions create a complete Source 2 resource from scratch.

use crate::source2::error::EncodeError;
use crate::source2::resource::build_resource_with_tail;
use crate::source2::texture::Image;
use crate::source2::texture::encode::encode_image;
use crate::source2::texture::format::{TextureFlags, TextureFormat};

const RESOURCE_VERSION: u16 = 1;
const VTEX_VERSION: u16 = 1;
const VTEX_FORMAT_PNG_RGBA8888: u8 = 16;
const VTEX_FORMAT_BC7: u8 = 20;
const TEXTURE_DATA_HEADER_SIZE: usize = 40;

/// Build a complete `.vtex_c` resource using inline `PNG_RGBA8888` pixel data.
///
/// The supplied image is encoded as a PNG payload and attached after a minimal
/// VTEX `DATA` block. The resulting bytes can be passed to [`crate::source2::inspect`]
/// and [`crate::source2::decode`] directly.
pub fn encode_vtex_png_rgba8888(
    image: &Image,
    flags: TextureFlags,
) -> Result<Vec<u8>, EncodeError> {
    let width = u16_dimension(image.width, "width")?;
    let height = u16_dimension(image.height, "height")?;
    let png = encode_image(image, TextureFormat::PngRgba8888)?;
    build_png_rgba8888_resource(width, height, flags, &png)
}

/// Build a complete `.vtex_c` resource from an existing PNG payload.
///
/// The PNG bytes are validated and copied through unchanged, which is useful
/// for compiler-source paths that already emitted a base-color PNG.
pub fn encode_vtex_png_rgba8888_from_png(
    png_bytes: &[u8],
    flags: TextureFlags,
) -> Result<Vec<u8>, EncodeError> {
    let decoded = image::load_from_memory_with_format(png_bytes, image::ImageFormat::Png)
        .map_err(|e| EncodeError::InlineImage(e.to_string()))?;
    let width = u16_dimension(decoded.width(), "width")?;
    let height = u16_dimension(decoded.height(), "height")?;
    build_png_rgba8888_resource(width, height, flags, png_bytes)
}

/// Build a single-mip, GPU-compressed BC7 texture. RGBA channels, including
/// packed material masks in alpha, are encoded together in 4x4 blocks.
pub fn encode_vtex_bc7(image: &Image, flags: TextureFlags) -> Result<Vec<u8>, EncodeError> {
    if image.width == 0 || image.height == 0 {
        return Err(EncodeError::InlineImage(
            "BC7 textures require nonzero dimensions".into(),
        ));
    }
    let width = u16_dimension(image.width, "width")?;
    let height = u16_dimension(image.height, "height")?;
    let pixels = encode_image(image, TextureFormat::Bc7)?;
    let data = texture_data_header(width, height, flags, VTEX_FORMAT_BC7);
    build_resource_with_tail(&[(*b"DATA", data.as_slice())], &pixels, RESOURCE_VERSION)
        .map_err(EncodeError::Decode)
}

fn build_png_rgba8888_resource(
    width: u16,
    height: u16,
    flags: TextureFlags,
    png_bytes: &[u8],
) -> Result<Vec<u8>, EncodeError> {
    let data = texture_data_header(width, height, flags, VTEX_FORMAT_PNG_RGBA8888);
    build_resource_with_tail(&[(*b"DATA", data.as_slice())], png_bytes, RESOURCE_VERSION)
        .map_err(EncodeError::Decode)
}

fn texture_data_header(width: u16, height: u16, flags: TextureFlags, format: u8) -> Vec<u8> {
    let mut data = Vec::with_capacity(48);
    data.extend_from_slice(&VTEX_VERSION.to_le_bytes());
    data.extend_from_slice(&flags.bits().to_le_bytes());
    // Reflectivity. CSDK fills this from source pixels; zeros are accepted by
    // morphic and keep the first writer independent from material heuristics.
    for value in [0.0f32; 4] {
        data.extend_from_slice(&value.to_le_bytes());
    }
    data.extend_from_slice(&width.to_le_bytes());
    data.extend_from_slice(&height.to_le_bytes());
    data.extend_from_slice(&1u16.to_le_bytes()); // depth
    data.push(format);
    data.push(1); // mip_count
    data.extend_from_slice(&0u32.to_le_bytes()); // picmip0_res
    data.extend_from_slice(&0u32.to_le_bytes()); // extra_data_offset
    data.extend_from_slice(&0u32.to_le_bytes()); // extra_data_count
    debug_assert_eq!(data.len(), TEXTURE_DATA_HEADER_SIZE);
    // Pad the DATA block so the trailing PNG payload begins at the same
    // 16-byte alignment as Valve resources, without becoming part of the pixel
    // payload seen by `texture::pixel_data`.
    while data.len() % 16 != 0 {
        data.push(0);
    }
    data
}

fn u16_dimension(value: u32, label: &str) -> Result<u16, EncodeError> {
    u16::try_from(value).map_err(|_| {
        EncodeError::InlineImage(format!(
            "texture {label} {value} exceeds Source 2 VTEX u16 dimension limit"
        ))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::source2::{ImageData, resource::Resource};
    #[test]
    fn bc7_rejects_empty_dimensions_before_block_encoding() {
        for (width, height) in [(0, 4), (4, 0)] {
            let image = Image {
                width,
                height,
                data: ImageData::Rgba8(Vec::new()),
            };
            assert!(encode_vtex_bc7(&image, TextureFlags::empty()).is_err());
        }
    }
    #[test]
    fn bc7_atlas_uses_one_byte_per_pixel_and_retains_color_and_packed_alpha() {
        let image = Image {
            width: 16,
            height: 8,
            data: ImageData::Rgba8([18, 42, 73, 109].repeat(128)),
        };
        let encoded = encode_vtex_bc7(&image, TextureFlags::SUGGEST_CLAMP_S).unwrap();
        let resource = Resource::parse(&encoded).unwrap();
        let block = resource.data_block_meta().unwrap();
        assert_eq!(encoded.len() - (block.offset + block.size) as usize, 128);
        let info = crate::source2::inspect(&encoded).unwrap();
        assert_eq!(info.format, TextureFormat::Bc7);
        assert!(info.flags.contains(TextureFlags::SUGGEST_CLAMP_S));
        let decoded = crate::source2::decode(&encoded).unwrap();
        let ImageData::Rgba8(pixels) = decoded.data else {
            panic!("RGBA required")
        };
        for pixel in pixels.chunks_exact(4) {
            for (actual, expected) in pixel.iter().zip([18u8, 42, 73, 109]) {
                assert!(actual.abs_diff(expected) <= 3);
            }
        }
    }
    #[test]
    fn inline_texture_resource_size_excludes_streamed_png_payload() {
        let image = Image {
            width: 8,
            height: 4,
            data: ImageData::Rgba8([18, 42, 73, 109].repeat(32)),
        };
        let encoded = encode_vtex_png_rgba8888(&image, TextureFlags::empty()).unwrap();
        let resource = Resource::parse(&encoded).unwrap();
        let data = resource.data_block_meta().unwrap();
        let resource_size = u32::from_le_bytes(encoded[..4].try_into().unwrap()) as usize;
        assert_eq!(resource_size, (data.offset + data.size) as usize);
        assert_eq!(
            &encoded[resource_size..resource_size + 8],
            b"\x89PNG\r\n\x1a\n"
        );
        let decoded = crate::source2::decode(&encoded).unwrap();
        assert_eq!((decoded.width, decoded.height), (8, 4));
        let ImageData::Rgba8(pixels) = decoded.data else {
            panic!("RGBA required")
        };
        assert_eq!(pixels, [18, 42, 73, 109].repeat(32));
    }
}
