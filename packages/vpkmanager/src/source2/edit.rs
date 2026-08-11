//! Splice an edited image back into an existing `.vtex_c` resource.
//!
//! Two splice paths live here:
//!
//! - [`replace_face_mip`] / [`replace_face0_mip0`]: narrow, Phase 1-style.
//!   Replace exactly one face/mip with newly-encoded bytes of the same
//!   length. Does not regenerate the rest of the mip chain.
//! - [`replace_face_mip_chain`] / [`replace_mip_chain`]: Phase 3. Take a
//!   new mip-0 [`Image`] for one face, downsample it 2x2 (box) all the way
//!   down, re-encode each level in the texture's format, and splice the
//!   full per-face mip pyramid. Other faces are untouched.
//!
//! The address arithmetic for both paths lives in
//! [`crate::source2::texture::face_mip_byte_range`]; this module just calls it,
//! validates the new payload's length, and splices.

use crate::source2::DecodeOptions;
use crate::source2::error::{DecodeError, EncodeError};
use crate::source2::resource::Resource;
use crate::source2::texture::format::{TextureFlags, TextureFormat};
use crate::source2::texture::{
    Image, ImageData, encode::encode_image, face_mip_byte_range, mip_dims, parse_texture_header,
};

/// Replace one face/mip of an existing `.vtex_c` with `new_pixels`.
///
/// `new_pixels` must already be in the on-wire format of the texture (see
/// [`crate::source2::encode_image`]) and must have exactly the same byte length as
/// the slot it's replacing. Returns a fresh owned copy of the resource with
/// the splice applied; the input is not mutated.
pub fn replace_face_mip(
    resource_bytes: &[u8],
    opts: DecodeOptions,
    new_pixels: &[u8],
) -> Result<Vec<u8>, EncodeError> {
    let resource = Resource::parse(resource_bytes)?;
    let data = resource.data_block()?;
    let info = parse_texture_header(data)?;
    let range = face_mip_byte_range(&resource, &info, opts)?;
    let expected = range.end - range.start;
    if new_pixels.len() != expected {
        return Err(EncodeError::SpliceLengthMismatch {
            expected,
            got: new_pixels.len(),
        });
    }
    let mut out = resource_bytes.to_vec();
    out[range].copy_from_slice(new_pixels);
    Ok(out)
}

/// Convenience for the dominant case: mip 0, face 0, slice 0.
pub fn replace_face0_mip0(
    resource_bytes: &[u8],
    new_pixels: &[u8],
) -> Result<Vec<u8>, EncodeError> {
    replace_face_mip(resource_bytes, DecodeOptions::default(), new_pixels)
}

/// Replace one face's full mip pyramid with a regenerated chain built from
/// `new_mip0`.
///
/// Downsamples `new_mip0` 2x2 (box filter) at each level, encodes each level
/// in the texture's format, and splices each into its slot. Other faces are
/// untouched (byte-exact). `new_mip0` must match the texture's mip-0 dims
/// and the right pixel kind for its format (RGBA8 for LDR formats, RGBA f16
/// for BC6H).
///
/// Inline formats (`PNG_*` / `JPEG_*`) have no on-wire mip chain; the
/// regen path is not meaningful for them and returns
/// [`EncodeError::Unimplemented`] in that case. Callers that just want to
/// swap a single inline payload should use [`replace_face0_mip0`] instead
/// (subject to its same-length constraint).
pub fn replace_face_mip_chain(
    resource_bytes: &[u8],
    face: u8,
    new_mip0: &Image,
) -> Result<Vec<u8>, EncodeError> {
    let resource = Resource::parse(resource_bytes)?;
    let data = resource.data_block()?;
    let info = parse_texture_header(data)?;

    if is_inline_format(info.format) {
        return Err(EncodeError::Unimplemented(info.format));
    }

    let face_count = if info.flags.contains(TextureFlags::CUBE_TEXTURE) {
        6u8
    } else {
        1u8
    };
    if face >= face_count {
        return Err(EncodeError::Decode(DecodeError::InvalidTarget {
            mip: 0,
            slice: 0,
            face,
        }));
    }

    if new_mip0.width != u32::from(info.width) || new_mip0.height != u32::from(info.height) {
        return Err(EncodeError::SizeMismatch {
            format: info.format,
            width: new_mip0.width,
            height: new_mip0.height,
            expected: (u32::from(info.width) as usize) * (u32::from(info.height) as usize),
            got: (new_mip0.width as usize) * (new_mip0.height as usize),
        });
    }
    require_pixel_kind(new_mip0, info.format)?;

    // Precompute slot ranges from the original (offsets are stable across
    // splices since we only overwrite pixel bytes, never resize the file).
    let mut ranges = Vec::with_capacity(usize::from(info.mip_count));
    for mip in 0..info.mip_count {
        let r = face_mip_byte_range(
            &resource,
            &info,
            DecodeOptions {
                mip,
                slice: 0,
                face,
            },
        )?;
        ranges.push(r);
    }

    let mut out = resource_bytes.to_vec();
    let mut current = new_mip0.clone();
    for mip in 0..info.mip_count {
        let encoded = encode_image(&current, info.format)?;
        let range = ranges[usize::from(mip)].clone();
        let expected = range.end - range.start;
        if encoded.len() != expected {
            return Err(EncodeError::SpliceLengthMismatch {
                expected,
                got: encoded.len(),
            });
        }
        out[range].copy_from_slice(&encoded);

        if mip + 1 < info.mip_count {
            let (mw, mh) = mip_dims(info.width, info.height, mip + 1);
            current = downsample_to(&current, u32::from(mw), u32::from(mh));
        }
    }
    Ok(out)
}

/// Convenience for the non-cubemap case: regenerate face 0's full mip chain.
pub fn replace_mip_chain(resource_bytes: &[u8], new_mip0: &Image) -> Result<Vec<u8>, EncodeError> {
    replace_face_mip_chain(resource_bytes, 0, new_mip0)
}

fn is_inline_format(fmt: TextureFormat) -> bool {
    matches!(
        fmt,
        TextureFormat::PngRgba8888 | TextureFormat::PngDxt5 | TextureFormat::JpegDxt5
    )
}

fn require_pixel_kind(image: &Image, format: TextureFormat) -> Result<(), EncodeError> {
    match (format, &image.data) {
        (TextureFormat::Bc6h | TextureFormat::Rgba16161616F, ImageData::Rgba16F(_))
        | (
            TextureFormat::Rgba8888
            | TextureFormat::Bgra8888
            | TextureFormat::Dxt1
            | TextureFormat::Dxt5
            | TextureFormat::Ati1n
            | TextureFormat::Ati2n
            | TextureFormat::Bc7
            | TextureFormat::PngRgba8888
            | TextureFormat::PngDxt5
            | TextureFormat::JpegDxt5,
            ImageData::Rgba8(_),
        ) => Ok(()),
        (fmt, ImageData::Rgba8(_)) => Err(EncodeError::WrongPixelKind {
            format: fmt,
            reason: "expected Rgba16F pixels, got Rgba8",
        }),
        (fmt, ImageData::Rgba16F(_)) => Err(EncodeError::WrongPixelKind {
            format: fmt,
            reason: "expected Rgba8 pixels, got Rgba16F",
        }),
    }
}

/// 2x2 box downsample to the target dims. This is the standard cascading
/// mip filter: each destination pixel is the average of a 2x2 source
/// footprint, with edge-clamping when the source dim is 1. Visually
/// identical to what most `BCn` pipelines emit. Source must already be
/// exactly mip-N dims; target is mip-(N+1) dims.
fn downsample_to(src: &Image, dst_w: u32, dst_h: u32) -> Image {
    let src_width = src.width as usize;
    let src_height = src.height as usize;
    let dest_width = dst_w as usize;
    let dest_height = dst_h as usize;
    match &src.data {
        ImageData::Rgba8(buf) => Image {
            width: dst_w,
            height: dst_h,
            data: ImageData::Rgba8(downsample_rgba8(
                buf,
                src_width,
                src_height,
                dest_width,
                dest_height,
            )),
        },
        ImageData::Rgba16F(buf) => Image {
            width: dst_w,
            height: dst_h,
            data: ImageData::Rgba16F(downsample_rgba16f(
                buf,
                src_width,
                src_height,
                dest_width,
                dest_height,
            )),
        },
    }
}

fn downsample_rgba8(
    src: &[u8],
    src_width: usize,
    src_height: usize,
    dest_width: usize,
    dest_height: usize,
) -> Vec<u8> {
    let mut out = vec![0u8; dest_width * dest_height * 4];
    for y in 0..dest_height {
        let sy0 = (y * 2).min(src_height - 1);
        let sy1 = (y * 2 + 1).min(src_height - 1);
        for x in 0..dest_width {
            let sx0 = (x * 2).min(src_width - 1);
            let sx1 = (x * 2 + 1).min(src_width - 1);
            let mut sums = [0u32; 4];
            for &(px, py) in &[(sx0, sy0), (sx1, sy0), (sx0, sy1), (sx1, sy1)] {
                let i = (py * src_width + px) * 4;
                sums[0] += u32::from(src[i]);
                sums[1] += u32::from(src[i + 1]);
                sums[2] += u32::from(src[i + 2]);
                sums[3] += u32::from(src[i + 3]);
            }
            let o = (y * dest_width + x) * 4;
            // +2 for rounding to nearest.
            #[allow(clippy::cast_possible_truncation)]
            {
                out[o] = ((sums[0] + 2) / 4) as u8;
                out[o + 1] = ((sums[1] + 2) / 4) as u8;
                out[o + 2] = ((sums[2] + 2) / 4) as u8;
                out[o + 3] = ((sums[3] + 2) / 4) as u8;
            }
        }
    }
    out
}

fn downsample_rgba16f(
    src: &[half::f16],
    src_width: usize,
    src_height: usize,
    dest_width: usize,
    dest_height: usize,
) -> Vec<half::f16> {
    let mut out = vec![half::f16::ZERO; dest_width * dest_height * 4];
    for y in 0..dest_height {
        let sy0 = (y * 2).min(src_height - 1);
        let sy1 = (y * 2 + 1).min(src_height - 1);
        for x in 0..dest_width {
            let sx0 = (x * 2).min(src_width - 1);
            let sx1 = (x * 2 + 1).min(src_width - 1);
            let mut sums = [0f32; 4];
            for &(px, py) in &[(sx0, sy0), (sx1, sy0), (sx0, sy1), (sx1, sy1)] {
                let i = (py * src_width + px) * 4;
                sums[0] += src[i].to_f32();
                sums[1] += src[i + 1].to_f32();
                sums[2] += src[i + 2].to_f32();
                sums[3] += src[i + 3].to_f32();
            }
            let o = (y * dest_width + x) * 4;
            out[o] = half::f16::from_f32(sums[0] * 0.25);
            out[o + 1] = half::f16::from_f32(sums[1] * 0.25);
            out[o + 2] = half::f16::from_f32(sums[2] * 0.25);
            out[o + 3] = half::f16::from_f32(sums[3] * 0.25);
        }
    }
    out
}
