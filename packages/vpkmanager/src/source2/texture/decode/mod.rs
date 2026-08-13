//! Pixel decode dispatch. Each format gets its own submodule; the dispatcher
//! lives here and is intentionally exhaustive so adding a format requires
//! either implementing it or extending the match.

mod bcn;
mod inline;
mod rgba8;

use crate::source2::DecodeOptions;
use crate::source2::error::DecodeError;
use crate::source2::texture::{Image, TextureInfo, mip_dims};

use super::format::TextureFormat;

pub fn decode_image(
    info: &TextureInfo,
    pixels: &[u8],
    opts: &DecodeOptions,
) -> Result<Image, DecodeError> {
    // face and mip are validated and sliced in pixel_data. 3D depth / array
    // slices (rest of M10) are still pending; reject any non-zero slice here.
    if opts.slice != 0 {
        return Err(DecodeError::InvalidTarget {
            mip: opts.mip,
            slice: opts.slice,
            face: opts.face,
        });
    }
    // Decoders work in terms of width/height; pass them the mip-adjusted
    // dims rather than the texture's mip-0 dims.
    let (mw, mh) = mip_dims(info.width, info.height, opts.mip);
    let mip_info = TextureInfo {
        format: info.format,
        width: mw,
        height: mh,
        // Block decoders work on the stored canvas; cropping to the non-pow2
        // actual size is a display-layer concern (see `inspect`/`crop_to_actual`).
        actual_width: mw,
        actual_height: mh,
        depth: info.depth,
        mip_count: info.mip_count,
        flags: info.flags,
        ycocg: info.ycocg,
    };
    let info = &mip_info;
    let mut image = match info.format {
        TextureFormat::Rgba8888 => rgba8::decode_rgba(info, pixels),
        TextureFormat::Bgra8888 => rgba8::decode_bgra(info, pixels),
        TextureFormat::Dxt1 => bcn::decode_bc1(info, pixels),
        TextureFormat::Dxt5 => bcn::decode_bc3(info, pixels),
        TextureFormat::Ati1n => bcn::decode_bc4(info, pixels),
        TextureFormat::Ati2n => bcn::decode_bc5(info, pixels),
        TextureFormat::Bc6h => bcn::decode_bc6h(info, pixels),
        TextureFormat::Bc7 => bcn::decode_bc7(info, pixels),
        TextureFormat::PngRgba8888 | TextureFormat::PngDxt5 | TextureFormat::JpegDxt5 => {
            inline::decode_inline(info, pixels)
        }
        other => Err(DecodeError::Unimplemented(other)),
    }?;
    // YCoCg-encoded textures (flagged in RED2, common on DXT5) carry chroma in the
    // color channels and luma in alpha; reverse it now that the blocks are decoded.
    if info.ycocg {
        crate::source2::texture::apply_ycocg(&mut image);
    }
    Ok(image)
}
