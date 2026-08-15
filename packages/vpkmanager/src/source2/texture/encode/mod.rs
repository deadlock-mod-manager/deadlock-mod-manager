// SPDX-FileCopyrightText: 2026 esoc
// SPDX-FileCopyrightText: 2015 ValveResourceFormat Contributors
// SPDX-License-Identifier: MIT

//! Per-format pixel encoders.
//!
//! Mirror of [`crate::source2::texture::decode`]: each supported format gets its own
//! submodule, and the dispatcher here is intentionally exhaustive so adding
//! a new format requires either implementing it or extending the match.
//!
//! Phase 1 covers the uncompressed and inline-PNG paths; block-compressed
//! formats (DXT*, BC*) come in Phase 2 with `texpresso` / BC7 deps.

mod bcn;
mod inline;
mod rgba8;

use crate::source2::error::EncodeError;
use crate::source2::texture::Image;
use crate::source2::texture::format::TextureFormat;

/// Encode an [`Image`] into the wire bytes for a single face / mip of the
/// given [`TextureFormat`]. The image's dimensions are taken as the mip's
/// dimensions; callers are responsible for handing in the right-sized image
/// for the mip slot they intend to write.
///
/// Returns the raw bytes that should sit in the pixel-data region at the
/// face/mip's offset. For inline formats this is a full PNG/JPEG file; for
/// block-compressed and uncompressed formats it's just the pixel payload
/// (no header).
pub fn encode_image(image: &Image, format: TextureFormat) -> Result<Vec<u8>, EncodeError> {
    match format {
        TextureFormat::Rgba8888 => rgba8::encode_rgba(image),
        TextureFormat::Bgra8888 => rgba8::encode_bgra(image),
        TextureFormat::Dxt1 => bcn::encode_bc1(image),
        TextureFormat::Dxt5 => bcn::encode_bc3(image),
        TextureFormat::Ati1n => bcn::encode_bc4(image),
        TextureFormat::Ati2n => bcn::encode_bc5(image),
        TextureFormat::Bc7 => bcn::encode_bc7(image),
        TextureFormat::Bc6h => bcn::encode_bc6h(image),
        TextureFormat::PngRgba8888 => inline::encode_png(image),
        other => Err(EncodeError::Unimplemented(other)),
    }
}
