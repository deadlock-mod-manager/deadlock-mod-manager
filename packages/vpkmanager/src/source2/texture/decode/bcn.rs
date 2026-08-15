// SPDX-FileCopyrightText: 2026 esoc
// SPDX-FileCopyrightText: 2015 ValveResourceFormat Contributors
// SPDX-License-Identifier: MIT

//! `BCn` block decompression via `bcdec_rs` (safe pure-Rust port of bcdec.h).
//!
//! The caller (`texture::pixel_data`) has already sliced `pixels` to exactly
//! mip 0's bytes, so this module deals with a single mip and doesn't need to
//! know about the mip chain.

use crate::source2::error::DecodeError;
use crate::source2::texture::{Image, ImageData, TextureInfo};

const BC1_BLOCK_BYTES: usize = 8;
const BC3_BLOCK_BYTES: usize = 16;
const BC4_BLOCK_BYTES: usize = 8;
const BC5_BLOCK_BYTES: usize = 16;
const BC6H_BLOCK_BYTES: usize = 16;
const BC7_BLOCK_BYTES: usize = 16;

/// BC1 (DXT1): RGBA output, 8 bytes/block.
pub fn decode_bc1(info: &TextureInfo, pixels: &[u8]) -> Result<Image, DecodeError> {
    decode_to_rgba(info, pixels, BC1_BLOCK_BYTES, bcdec_rs::bc1)
}

/// BC3 (DXT5): RGBA output with alpha block, 16 bytes/block.
pub fn decode_bc3(info: &TextureInfo, pixels: &[u8]) -> Result<Image, DecodeError> {
    decode_to_rgba(info, pixels, BC3_BLOCK_BYTES, bcdec_rs::bc3)
}

/// BC7: RGBA output, 16 bytes/block, 8 mode variants. By count the dominant
/// `BCn` format in Deadlock.
pub fn decode_bc7(info: &TextureInfo, pixels: &[u8]) -> Result<Image, DecodeError> {
    decode_to_rgba(info, pixels, BC7_BLOCK_BYTES, bcdec_rs::bc7)
}

/// BC4 (ATI1N): single-channel R, 8 bytes/block. Replicated to RGB with
/// alpha = 255 to match VRF's default output for ungated textures.
pub fn decode_bc4(info: &TextureInfo, pixels: &[u8]) -> Result<Image, DecodeError> {
    let (w, h) = check(info, pixels, BC4_BLOCK_BYTES)?;
    let (wu, hu) = (usize::from(w), usize::from(h));
    let mut r = vec![0u8; wu * hu];
    iter_blocks_into(
        wu,
        hu,
        pixels,
        BC4_BLOCK_BYTES,
        &mut r,
        1,
        |block, dst, pitch| {
            bcdec_rs::bc4(block, dst, pitch, false);
        },
    );
    Ok(splat_r_to_rgba(w, h, &r))
}

/// BC6H (unsigned half-float): RGB f16 output, 16 bytes/block. Source 2
/// always uses the unsigned variant (UF16); the signed BC6H format id is not
/// present in `VTexFormat`. Expanded to RGBA by appending alpha = 1.0 per
/// pixel so the rest of the pipeline can stay RGBA-shaped.
pub fn decode_bc6h(info: &TextureInfo, pixels: &[u8]) -> Result<Image, DecodeError> {
    let (w, h) = check(info, pixels, BC6H_BLOCK_BYTES)?;
    let (wu, hu) = (usize::from(w), usize::from(h));
    let mut rgb_bits = vec![0u16; wu * hu * 3];
    let pitch = wu * 3;
    let blocks_x = wu.div_ceil(4);
    let blocks_y = hu.div_ceil(4);
    let scratch_pitch = 4 * 3;
    let mut scratch = vec![0u16; scratch_pitch * 4];
    for by in 0..blocks_y {
        for bx in 0..blocks_x {
            let block_idx = by * blocks_x + bx;
            let block = &pixels[block_idx * BC6H_BLOCK_BYTES..(block_idx + 1) * BC6H_BLOCK_BYTES];
            bcdec_rs::bc6h_half(block, &mut scratch, scratch_pitch, false);
            let rows = (hu - by * 4).min(4);
            let cols = (wu - bx * 4).min(4);
            let row_u16s = cols * 3;
            for y in 0..rows {
                let dst_offset = (by * 4 + y) * pitch + (bx * 4) * 3;
                let src_offset = y * scratch_pitch;
                rgb_bits[dst_offset..dst_offset + row_u16s]
                    .copy_from_slice(&scratch[src_offset..src_offset + row_u16s]);
            }
        }
    }
    Ok(rgb_f16_to_rgba_f16(w, h, &rgb_bits))
}

/// BC5 (ATI2N): R + G, 16 bytes/block. Output as RGBA with B = 0, A = 255
/// (raw VRF emission when no channel remap is requested).
pub fn decode_bc5(info: &TextureInfo, pixels: &[u8]) -> Result<Image, DecodeError> {
    let (w, h) = check(info, pixels, BC5_BLOCK_BYTES)?;
    let (wu, hu) = (usize::from(w), usize::from(h));
    let mut rg = vec![0u8; wu * hu * 2];
    iter_blocks_into(
        wu,
        hu,
        pixels,
        BC5_BLOCK_BYTES,
        &mut rg,
        2,
        |block, dst, pitch| {
            bcdec_rs::bc5(block, dst, pitch, false);
        },
    );
    Ok(rg_to_rgba(w, h, &rg))
}

// --- internals ---

fn decode_to_rgba(
    info: &TextureInfo,
    pixels: &[u8],
    block_bytes: usize,
    decode_fn: fn(&[u8], &mut [u8], usize),
) -> Result<Image, DecodeError> {
    let (w, h) = check(info, pixels, block_bytes)?;
    let (wu, hu) = (usize::from(w), usize::from(h));
    let mut rgba = vec![0u8; wu * hu * 4];
    iter_blocks_into(
        wu,
        hu,
        pixels,
        block_bytes,
        &mut rgba,
        4,
        |block, dst, pitch| {
            decode_fn(block, dst, pitch);
        },
    );
    Ok(Image {
        width: u32::from(w),
        height: u32::from(h),
        data: ImageData::Rgba8(rgba),
    })
}

fn check(info: &TextureInfo, pixels: &[u8], block_bytes: usize) -> Result<(u16, u16), DecodeError> {
    let blocks_x = usize::from(info.width).div_ceil(4);
    let blocks_y = usize::from(info.height).div_ceil(4);
    let needed = blocks_x * blocks_y * block_bytes;
    if pixels.len() < needed {
        return Err(DecodeError::Truncated {
            offset: 0,
            needed,
            had: pixels.len(),
        });
    }
    Ok((info.width, info.height))
}

// BCn block decoders always emit a full 4x4 region. For mip levels (or
// future non-multiple-of-4 textures) where the destination is smaller than
// the block grid, we decode into a 4x4 scratch buffer and copy only the
// valid sub-block into the output. The scratch alloc is one-per-call;
// negligible compared to the decode work itself.
fn iter_blocks_into(
    width: usize,
    height: usize,
    pixels: &[u8],
    block_bytes: usize,
    dst: &mut [u8],
    bytes_per_pixel: usize,
    mut decode_block: impl FnMut(&[u8], &mut [u8], usize),
) {
    let pitch = width * bytes_per_pixel;
    let blocks_x = width.div_ceil(4);
    let blocks_y = height.div_ceil(4);
    let scratch_pitch = 4 * bytes_per_pixel;
    let mut scratch = vec![0u8; scratch_pitch * 4];
    for by in 0..blocks_y {
        for bx in 0..blocks_x {
            let block_idx = by * blocks_x + bx;
            let block = &pixels[block_idx * block_bytes..(block_idx + 1) * block_bytes];
            decode_block(block, &mut scratch, scratch_pitch);
            let rows = (height - by * 4).min(4);
            let cols = (width - bx * 4).min(4);
            let row_bytes = cols * bytes_per_pixel;
            for y in 0..rows {
                let dst_offset = (by * 4 + y) * pitch + (bx * 4) * bytes_per_pixel;
                let src_offset = y * scratch_pitch;
                dst[dst_offset..dst_offset + row_bytes]
                    .copy_from_slice(&scratch[src_offset..src_offset + row_bytes]);
            }
        }
    }
}

fn splat_r_to_rgba(width: u16, height: u16, red: &[u8]) -> Image {
    let n = usize::from(width) * usize::from(height);
    let mut rgba = vec![0u8; n * 4];
    for i in 0..n {
        let v = red[i];
        rgba[i * 4] = v;
        rgba[i * 4 + 1] = v;
        rgba[i * 4 + 2] = v;
        rgba[i * 4 + 3] = 255;
    }
    Image {
        width: u32::from(width),
        height: u32::from(height),
        data: ImageData::Rgba8(rgba),
    }
}

fn rg_to_rgba(w: u16, h: u16, rg: &[u8]) -> Image {
    let n = usize::from(w) * usize::from(h);
    let mut rgba = vec![0u8; n * 4];
    for i in 0..n {
        rgba[i * 4] = rg[i * 2];
        rgba[i * 4 + 1] = rg[i * 2 + 1];
        rgba[i * 4 + 2] = 0;
        rgba[i * 4 + 3] = 255;
    }
    Image {
        width: u32::from(w),
        height: u32::from(h),
        data: ImageData::Rgba8(rgba),
    }
}

fn rgb_f16_to_rgba_f16(w: u16, h: u16, rgb_bits: &[u16]) -> Image {
    let n = usize::from(w) * usize::from(h);
    let alpha = half::f16::ONE;
    let mut rgba = vec![half::f16::ZERO; n * 4];
    for i in 0..n {
        rgba[i * 4] = half::f16::from_bits(rgb_bits[i * 3]);
        rgba[i * 4 + 1] = half::f16::from_bits(rgb_bits[i * 3 + 1]);
        rgba[i * 4 + 2] = half::f16::from_bits(rgb_bits[i * 3 + 2]);
        rgba[i * 4 + 3] = alpha;
    }
    Image {
        width: u32::from(w),
        height: u32::from(h),
        data: ImageData::Rgba16F(rgba),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::source2::texture::format::{TextureFlags, TextureFormat};

    fn info(fmt: TextureFormat, w: u16, h: u16) -> TextureInfo {
        TextureInfo {
            format: fmt,
            width: w,
            height: h,
            actual_width: w,
            actual_height: h,
            depth: 1,
            mip_count: 1,
            flags: TextureFlags::empty(),
            ycocg: false,
        }
    }

    // 8x8 BC6H = 2x2 blocks. Cheap test that doesn't need an oracle: assert
    // dims, Rgba16F output, alpha=1.0 everywhere, finite channels, and that
    // the top-right block's pixels match a standalone decode of that 16-byte
    // block. Catches pitch and block-iteration bugs in the morphic wrapper.
    #[test]
    fn bc6h_wiring_matches_standalone_block_decode() {
        let mut input = [0u8; 64];
        for b in 0u8..4 {
            input[usize::from(b) * 16] = b * 0x11;
        }
        let img = decode_bc6h(&info(TextureFormat::Bc6h, 8, 8), &input).unwrap();
        assert_eq!((img.width, img.height), (8, 8));
        let pixels = match &img.data {
            ImageData::Rgba16F(p) => p,
            ImageData::Rgba8(_) => panic!("expected Rgba16F, got Rgba8"),
        };
        assert_eq!(pixels.len(), 8 * 8 * 4);
        for px in pixels.chunks_exact(4) {
            assert_eq!(px[3], half::f16::ONE, "alpha must be 1.0");
            for c in &px[..3] {
                assert!(c.is_finite(), "channel must be finite, got {c}");
            }
        }
        let mut standalone = [0u16; 4 * 4 * 3];
        bcdec_rs::bc6h_half(&input[16..32], &mut standalone, 4 * 3, false);
        for y in 0..4_usize {
            for x in 0..4_usize {
                let p = (y * 8 + (4 + x)) * 4;
                let s = (y * 4 + x) * 3;
                assert_eq!(pixels[p].to_bits(), standalone[s], "R top-right ({x},{y})");
                assert_eq!(
                    pixels[p + 1].to_bits(),
                    standalone[s + 1],
                    "G top-right ({x},{y})"
                );
                assert_eq!(
                    pixels[p + 2].to_bits(),
                    standalone[s + 2],
                    "B top-right ({x},{y})"
                );
            }
        }
    }
}
