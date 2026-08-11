//! Editing a compiled `.vtex_c` while keeping it a valid Source 2 texture.
//!
//! Both operations here decode the texture's top mip, transform the pixels, and
//! re-encode the **full mip pyramid in the texture's own format** (BC7, DXT5,
//! RGBA8888, …). That matters: writing an uncompressed replacement instead would
//! inflate a 4K BC7 texture roughly eightfold and drop the mip chain the engine
//! samples at distance, so the skin would both bloat the VPK and shimmer in game.
//! Re-encoding BCn is lossy, which is acceptable when the pixels were being
//! changed on purpose anyway.

use image::imageops::{FilterType, crop_imm, resize};
use image::{ImageBuffer, Rgba};

use crate::error::{Result, VpkManagerError};
use crate::source2::{self, Image, ImageData};

/// A recolor target: an absolute hue to set, plus multipliers on each pixel's own
/// saturation and brightness.
///
/// Hue alone cannot express "pale blue" — pastel lives on the saturation and
/// value axes — so the target carries both scales. They are *scales*, not
/// absolutes, so the texture's light-to-dark structure survives; a flat retint
/// would lose it. A neutral pixel (zero saturation: a white highlight, a black
/// shadow) stays neutral at any hue, because scaling zero chroma is still zero.
#[derive(Debug, Clone, Copy)]
pub struct Recolor {
    /// Absolute target hue in degrees, taken mod 360.
    pub hue: f64,
    /// Saturation multiplier, clamped per pixel. 1.0 keeps the source saturation.
    pub saturation: f64,
    /// Brightness (HSV value) multiplier, clamped per pixel. 1.0 keeps the source.
    pub brightness: f64,
}

impl Recolor {
    #[must_use]
    pub fn new(hue: f64, saturation: f64, brightness: f64) -> Self {
        Self {
            hue,
            saturation,
            brightness,
        }
    }
}

/// The result of an edit: the new resource bytes plus the dimensions written.
pub struct EditedTexture {
    pub bytes: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

fn rgb_to_hsv(r: f64, g: f64, b: f64) -> (f64, f64, f64) {
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let delta = max - min;
    // `max` is by construction exactly one of r/g/b, so these comparisons are
    // exact rather than approximate; this is the canonical RGB->HSV form.
    let hue = if delta == 0.0 {
        0.0
    } else if max == r {
        60.0 * (((g - b) / delta).rem_euclid(6.0))
    } else if max == g {
        60.0 * (((b - r) / delta) + 2.0)
    } else {
        60.0 * (((r - g) / delta) + 4.0)
    };
    let saturation = if max == 0.0 { 0.0 } else { delta / max };
    (hue, saturation, max)
}

fn hsv_to_rgb(hue: f64, saturation: f64, value: f64) -> (f64, f64, f64) {
    let chroma = value * saturation;
    let sector = hue / 60.0;
    let x = chroma * (1.0 - (sector.rem_euclid(2.0) - 1.0).abs());
    let (r, g, b) = match sector as i32 {
        0 => (chroma, x, 0.0),
        1 => (x, chroma, 0.0),
        2 => (0.0, chroma, x),
        3 => (0.0, x, chroma),
        4 => (x, 0.0, chroma),
        _ => (chroma, 0.0, x),
    };
    let m = value - chroma;
    (r + m, g + m, b + m)
}

fn channel(value: f64) -> u8 {
    (value * 255.0).round().clamp(0.0, 255.0) as u8
}

/// One pixel: set its hue, scale its saturation and brightness.
fn set_color(rgb: [u8; 3], recolor: Recolor) -> [u8; 3] {
    let (_, saturation, value) = rgb_to_hsv(
        f64::from(rgb[0]) / 255.0,
        f64::from(rgb[1]) / 255.0,
        f64::from(rgb[2]) / 255.0,
    );
    let (r, g, b) = hsv_to_rgb(
        recolor.hue.rem_euclid(360.0),
        (saturation * recolor.saturation).clamp(0.0, 1.0),
        (value * recolor.brightness).clamp(0.0, 1.0),
    );
    [channel(r), channel(g), channel(b)]
}

/// Apply a per-pixel RGB transform to a decoded LDR image, preserving alpha.
///
/// HDR (f16) textures are rejected rather than silently mistreated: HSV on
/// linear half-floats is not the same transform, and Deadlock's color maps —
/// what a skin recolor targets — are all LDR, so an f16 here means the wrong
/// entry was picked.
fn map_pixels(image: &mut Image, transform: impl Fn([u8; 3]) -> [u8; 3]) -> Result<()> {
    match &mut image.data {
        ImageData::Rgba8(buffer) => {
            for px in buffer.chunks_exact_mut(4) {
                let [r, g, b] = transform([px[0], px[1], px[2]]);
                px[0] = r;
                px[1] = g;
                px[2] = b;
                // Alpha is deliberately preserved.
            }
            Ok(())
        }
        ImageData::Rgba16F(_) => Err(VpkManagerError::Invalid(
            "this texture is HDR (16-bit float); recoloring supports 8-bit textures only"
                .to_string(),
        )),
    }
}

fn finish(original: &[u8], image: &Image) -> Result<EditedTexture> {
    let bytes = source2::edit::replace_mip_chain(original, image)?;
    Ok(EditedTexture {
        bytes,
        width: image.width,
        height: image.height,
    })
}

/// Set every colored pixel's hue and scale its saturation/brightness, then
/// rebuild the mip chain. The mode for skins and weapons: shading survives.
pub fn recolor_texture(original: &[u8], recolor: Recolor) -> Result<EditedTexture> {
    paint_texture(original, recolor, None)
}

/// Recolor a texture and, when given one, lay a pattern over the result — in a
/// single decode/encode pass.
///
/// Chaining `recolor_texture` into `pattern_texture` would decode the texture,
/// re-encode its whole mip chain, then decode and re-encode it again. The BCn
/// encode is essentially the entire cost of a paint, so paying it twice doubles
/// the wait for no benefit: both transforms are per-pixel and compose.
///
/// The order is recolor first, pattern second. That way the pattern is shaped to
/// the brightness of the *recolored* pixel; patterning first would let the hue
/// set flatten the pattern back onto one colour.
pub fn paint_texture(
    original: &[u8],
    recolor: Recolor,
    pattern: Option<crate::pattern::Pattern>,
) -> Result<EditedTexture> {
    let mut image = source2::decode(original)?;
    map_pixels(&mut image, |rgb| set_color(rgb, recolor))?;
    if let Some(pattern) = pattern {
        crate::pattern::paint_image(&mut image, pattern)?;
    }
    finish(original, &image)
}

/// Center-crop `image` to `target_width : target_height` so a replacement is not
/// distorted when its aspect ratio differs from the texture's.
fn crop_to_aspect(
    image: &ImageBuffer<Rgba<u8>, Vec<u8>>,
    target_width: u32,
    target_height: u32,
) -> ImageBuffer<Rgba<u8>, Vec<u8>> {
    let source_width = image.width();
    let source_height = image.height();
    let wider = u64::from(source_width) * u64::from(target_height)
        > u64::from(source_height) * u64::from(target_width);

    let (x, y, width, height) = if wider {
        let width =
            (u64::from(source_height) * u64::from(target_width) / u64::from(target_height)) as u32;
        ((source_width - width) / 2, 0, width, source_height)
    } else {
        let height =
            (u64::from(source_width) * u64::from(target_height) / u64::from(target_width)) as u32;
        (0, (source_height - height) / 2, source_width, height)
    };

    crop_imm(image, x, y, width.max(1), height.max(1)).to_image()
}

/// Replace a texture's pixels with a user image (PNG, JPG, …), keeping the
/// texture's stored dimensions, format and mip count. The image is center-cropped
/// to the texture's aspect ratio and resampled to its size.
pub fn replace_texture_image(original: &[u8], image_bytes: &[u8]) -> Result<EditedTexture> {
    let info = source2::inspect(original)?;
    let target_width = u32::from(info.width).max(1);
    let target_height = u32::from(info.height).max(1);

    let source = image::load_from_memory(image_bytes)?.to_rgba8();
    let cropped = crop_to_aspect(&source, target_width, target_height);
    let scaled = resize(&cropped, target_width, target_height, FilterType::Lanczos3);

    let replacement = Image {
        width: target_width,
        height: target_height,
        data: ImageData::Rgba8(scaled.into_raw()),
    };
    finish(original, &replacement)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn roundtrip(rgb: [u8; 3]) -> [u8; 3] {
        let (h, s, v) = rgb_to_hsv(
            f64::from(rgb[0]) / 255.0,
            f64::from(rgb[1]) / 255.0,
            f64::from(rgb[2]) / 255.0,
        );
        let (r, g, b) = hsv_to_rgb(h.rem_euclid(360.0), s, v);
        [channel(r), channel(g), channel(b)]
    }

    #[test]
    fn hsv_round_trips_every_sector() {
        for color in [
            [255, 0, 0],
            [255, 255, 0],
            [0, 255, 0],
            [0, 255, 255],
            [0, 0, 255],
            [255, 0, 255],
            [18, 200, 137],
            [0, 0, 0],
            [255, 255, 255],
        ] {
            assert_eq!(roundtrip(color), color);
        }
    }

    #[test]
    fn neutral_pixels_survive_a_hue_change() {
        let recolor = Recolor::new(210.0, 1.0, 1.0);
        assert_eq!(set_color([255, 255, 255], recolor), [255, 255, 255]);
        assert_eq!(set_color([0, 0, 0], recolor), [0, 0, 0]);
        assert_eq!(set_color([128, 128, 128], recolor), [128, 128, 128]);
    }

    #[test]
    fn a_hue_set_lands_on_the_target_and_keeps_shading() {
        // Two reds of different brightness recolor to two blues of the same
        // brightness ratio: the light-to-dark structure is preserved.
        let recolor = Recolor::new(240.0, 1.0, 1.0);
        assert_eq!(set_color([255, 0, 0], recolor), [0, 0, 255]);
        assert_eq!(set_color([128, 0, 0], recolor), [0, 0, 128]);
    }

    #[test]
    fn scales_move_saturation_and_brightness() {
        let muted = set_color([255, 0, 0], Recolor::new(0.0, 0.5, 1.0));
        assert_eq!(muted, [255, 128, 128]);
        let darker = set_color([255, 0, 0], Recolor::new(0.0, 1.0, 0.5));
        assert_eq!(darker, [128, 0, 0]);
    }

    #[test]
    fn hdr_textures_are_refused_instead_of_mistreated() {
        let mut hdr = Image {
            width: 1,
            height: 1,
            data: ImageData::Rgba16F(vec![half::f16::from_f32(1.0); 4]),
        };
        assert!(map_pixels(&mut hdr, |rgb| rgb).is_err());
    }
}
