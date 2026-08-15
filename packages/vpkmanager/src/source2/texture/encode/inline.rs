// SPDX-FileCopyrightText: 2026 esoc
// SPDX-FileCopyrightText: 2015 ValveResourceFormat Contributors
// SPDX-License-Identifier: MIT

//! Inline image format encoder.
//!
//! `PngRgba8888` textures store a literal PNG payload in place of a mip
//! chain. We round-trip through the `image` crate, which is also what the
//! decoder uses. JPEG inline formats are intentionally omitted from Phase 1:
//! re-encoding lossy JPEG would degrade the texture each edit cycle, so the
//! splice path will refuse JPEG inputs until we settle on a quality policy.

use crate::source2::error::EncodeError;
use crate::source2::texture::format::TextureFormat;
use crate::source2::texture::{Image, ImageData};

pub fn encode_png(image: &Image) -> Result<Vec<u8>, EncodeError> {
    let ImageData::Rgba8(buf) = &image.data else {
        return Err(EncodeError::WrongPixelKind {
            format: TextureFormat::PngRgba8888,
            reason: "expected Rgba8 pixels, got Rgba16F",
        });
    };
    let expected = (image.width as usize) * (image.height as usize) * 4;
    if buf.len() != expected {
        return Err(EncodeError::SizeMismatch {
            format: TextureFormat::PngRgba8888,
            width: image.width,
            height: image.height,
            expected,
            got: buf.len(),
        });
    }
    let img: image::RgbaImage =
        image::ImageBuffer::from_raw(image.width, image.height, buf.clone())
            .ok_or_else(|| EncodeError::InlineImage("RgbaImage::from_raw failed".into()))?;
    let mut out = Vec::with_capacity(expected);
    img.write_to(&mut std::io::Cursor::new(&mut out), image::ImageFormat::Png)
        .map_err(|e| EncodeError::InlineImage(e.to_string()))?;
    Ok(out)
}
