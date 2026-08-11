//! Uncompressed RGBA8888 / BGRA8888 encoders.
//!
//! These are the inverse of [`crate::source2::texture::decode::rgba8`]. RGBA8888 is a
//! straight passthrough of the [`Image`] buffer; BGRA8888 swaps the R and B
//! channels of each pixel.

use crate::source2::error::EncodeError;
use crate::source2::texture::format::TextureFormat;
use crate::source2::texture::{Image, ImageData};

pub fn encode_rgba(image: &Image) -> Result<Vec<u8>, EncodeError> {
    let buf = require_rgba8(image, TextureFormat::Rgba8888)?;
    check_len(buf, image, TextureFormat::Rgba8888)?;
    Ok(buf.to_vec())
}

pub fn encode_bgra(image: &Image) -> Result<Vec<u8>, EncodeError> {
    let buf = require_rgba8(image, TextureFormat::Bgra8888)?;
    check_len(buf, image, TextureFormat::Bgra8888)?;
    let mut out = buf.to_vec();
    for px in out.chunks_exact_mut(4) {
        px.swap(0, 2);
    }
    Ok(out)
}

fn require_rgba8(image: &Image, format: TextureFormat) -> Result<&[u8], EncodeError> {
    match &image.data {
        ImageData::Rgba8(buf) => Ok(buf),
        ImageData::Rgba16F(_) => Err(EncodeError::WrongPixelKind {
            format,
            reason: "expected Rgba8 pixels, got Rgba16F",
        }),
    }
}

fn check_len(buf: &[u8], image: &Image, format: TextureFormat) -> Result<(), EncodeError> {
    let expected = (image.width as usize) * (image.height as usize) * 4;
    if buf.len() != expected {
        return Err(EncodeError::SizeMismatch {
            format,
            width: image.width,
            height: image.height,
            expected,
            got: buf.len(),
        });
    }
    Ok(())
}
