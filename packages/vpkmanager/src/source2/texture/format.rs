// SPDX-FileCopyrightText: 2026 esoc
// SPDX-FileCopyrightText: 2015 ValveResourceFormat Contributors
// SPDX-License-Identifier: MIT

//! Texture format enum + flag bits.
//!
//! Variant names match VRF's `VTexFormat` strings (which is also what the C#
//! oracle writes into each `.meta.json`'s `format` field), so meta parsing is
//! a direct `match`.
//!
//! Distribution observed in Deadlock pak01 (12,518 `.vtex_c`, 2026-05-17):
//!
//! | Format        | Count |
//! |---------------|-------|
//! | BC7           | 6051  |
//! | ATI1N (BC4)   | 3002  |
//! | BGRA8888      | 1537  |
//! | DXT5 (BC3)    |  617  |
//! | ATI2N (BC5)   |  519  |
//! | DXT1 (BC1)    |  323  |
//! | PNG_RGBA8888  |  182  |
//! | RGBA8888      |  173  |
//! | BC6H          |   78  |
//! | PNG_DXT5      |   35  |
//! | JPEG_DXT5     |    1  |

use crate::source2::error::DecodeError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TextureFormat {
    Unknown,
    /// 4 bytes per pixel, RGBA byte order, top-left origin.
    Rgba8888,
    /// 4 bytes per pixel, BGRA byte order, top-left origin. Dominant
    /// uncompressed format in Deadlock; swizzle to RGBA on decode.
    Bgra8888,
    /// Inline-stored PNG bytes decoded by an image crate.
    PngRgba8888,
    /// `BCn` block compression. Reference for VRF names is in parens.
    Dxt1, // BC1
    Dxt5,  // BC3
    Ati1n, // BC4
    Ati2n, // BC5
    Bc6h,
    Bc7,
    /// Inline-stored PNG that is itself encoded as DXT5 once decoded.
    PngDxt5,
    /// Inline-stored JPEG that is itself encoded as DXT5 once decoded.
    JpegDxt5,
    Rgba16161616F,
}

impl TextureFormat {
    /// Parse the textual format from a `.meta.json` (matches VRF's
    /// `VTexFormat.ToString()` exactly).
    pub fn from_meta_name(s: &str) -> Result<Self, DecodeError> {
        Ok(match s {
            "RGBA8888" => Self::Rgba8888,
            "BGRA8888" => Self::Bgra8888,
            "PNG_RGBA8888" => Self::PngRgba8888,
            "DXT1" => Self::Dxt1,
            "DXT5" => Self::Dxt5,
            "ATI1N" => Self::Ati1n,
            "ATI2N" => Self::Ati2n,
            "BC6H" => Self::Bc6h,
            "BC7" => Self::Bc7,
            "PNG_DXT5" => Self::PngDxt5,
            "JPEG_DXT5" => Self::JpegDxt5,
            "RGBA16161616F" => Self::Rgba16161616F,
            "UNKNOWN" => Self::Unknown,
            _ => return Err(DecodeError::UnknownFormatName),
        })
    }

    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Self::Unknown => "UNKNOWN",
            Self::Rgba8888 => "RGBA8888",
            Self::Bgra8888 => "BGRA8888",
            Self::PngRgba8888 => "PNG_RGBA8888",
            Self::Dxt1 => "DXT1",
            Self::Dxt5 => "DXT5",
            Self::Ati1n => "ATI1N",
            Self::Ati2n => "ATI2N",
            Self::Bc6h => "BC6H",
            Self::Bc7 => "BC7",
            Self::PngDxt5 => "PNG_DXT5",
            Self::JpegDxt5 => "JPEG_DXT5",
            Self::Rgba16161616F => "RGBA16161616F",
        }
    }
}

bitflags::bitflags! {
    /// Texture flags per `VTexFlags`. Only the bits we currently care about
    /// are named; round-trip is preserved via the raw `u16`.
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub struct TextureFlags: u16 {
        const SUGGEST_CLAMP_S    = 1 << 0;
        const SUGGEST_CLAMP_T    = 1 << 1;
        const SUGGEST_CLAMP_U    = 1 << 2;
        const NO_LOD             = 1 << 3;
        const CUBE_TEXTURE       = 1 << 4;
        const VOLUME_TEXTURE     = 1 << 5;
        const TEXTURE_ARRAY      = 1 << 6;
    }
}
