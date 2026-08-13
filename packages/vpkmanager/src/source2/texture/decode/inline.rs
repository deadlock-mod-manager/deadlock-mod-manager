//! Inline image formats: the payload following the DATA block is a literal
//! PNG or JPEG file. VRF treats all of `PNG_RGBA8888`, `PNG_DXT5`,
//! `JPEG_DXT5`, `JPEG_RGBA8888` identically: read the bytes, hand them to
//! Skia. We do the same via the `image` crate.
//!
//! The format-name suffix (`_DXT5`, `_RGBA8888`) is what the texture WOULD
//! have been if it weren't inline-encoded; for decode purposes it's just a
//! PNG or JPEG and we ignore the suffix.

use crate::source2::error::DecodeError;
use crate::source2::texture::{Image, ImageData, TextureInfo};

pub fn decode_inline(_info: &TextureInfo, pixels: &[u8]) -> Result<Image, DecodeError> {
    let img = image::load_from_memory(pixels)
        .map_err(|e| DecodeError::InlineImage(e.to_string()))?
        .to_rgba8();
    let (w, h) = (img.width(), img.height());
    let mut raw = img.into_raw();
    // VRF decodes via Skia (premultiplied alpha) and re-encodes. For A=0
    // pixels Skia zeroes RGB; we match that so the diff against the oracle
    // PNG is byte-exact. Partial-alpha pixels are unaffected: Skia's
    // round-trip preserves them.
    for px in raw.chunks_exact_mut(4) {
        if px[3] == 0 {
            px[0] = 0;
            px[1] = 0;
            px[2] = 0;
        }
    }
    Ok(Image {
        width: w,
        height: h,
        data: ImageData::Rgba8(raw),
    })
}
