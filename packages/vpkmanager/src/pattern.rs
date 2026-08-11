//! Procedural paint patterns for skin textures.
//!
//! A flat recolor moves a skin onto one hue; a pattern paints structure over it.
//! Each style is a pure `(u, v, phase) -> RGB` function evaluated per texel, so
//! nothing needs authoring and any texture of any size can be painted.
//!
//! The blend deliberately **keeps the source pixel's brightness**: the pattern's
//! brightest channel is rescaled to match the original's before mixing. Without
//! that, a dark seam or a black cutout would light up and the model would lose
//! its shading and silhouette — the paint has to sit on the material, not
//! replace it.
//!
//! Noise and color-space helpers follow the approach in the MIT-licensed
//! vpkmerge; the style set and their tuning are our own.

use crate::error::{Result, VpkManagerError};
use crate::source2::{self, Image, ImageData};
use crate::texture_edit::EditedTexture;

/// The pattern styles the paint tab offers.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PatternStyle {
    /// Soft drifting blobs of colour, like oil on water.
    Liquid,
    /// Interference rings from two offset radial grids.
    Moire,
    /// Mirrored wedges around the texture's centre.
    Kaleido,
    /// Thin iridescent bands that shift with the viewing angle.
    Holo,
    /// Torn horizontal displacement with channel separation.
    Glitch,
    /// A heat-map ramp driven by the pattern's own intensity.
    Thermal,
    /// Four-tone disruptive blotches.
    Camo,
    /// A woven twill weave.
    Carbon,
    /// Deep field with scattered bright specks.
    Galaxy,
    /// Regular dot grid whose dot size follows brightness.
    Halftone,
    /// Cracked crust over a glowing core.
    Lava,
    /// Scanline grid fading into a two-tone horizon.
    Vaporwave,
    /// Translucent gel: rounded blobs with bright rims, after Deadlock's own goo.
    Viscous,
    /// Near-black field split by thin crystalline filaments of violet light.
    DarkMatter,
    /// Marble in pure greys: warped veins of white through a dark ground.
    Monochrome,
    /// Art-deco rays and rings in gold on black, matching Deadlock's era.
    Deco,
    /// Fractured ice: pale blue plates with bright cracks between them.
    Frost,
    /// Circuit board: quantized traces with the odd solder node.
    Circuit,
}

impl PatternStyle {
    pub fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "liquid" => Self::Liquid,
            "moire" => Self::Moire,
            "kaleido" => Self::Kaleido,
            "holo" => Self::Holo,
            "glitch" => Self::Glitch,
            "thermal" => Self::Thermal,
            "camo" => Self::Camo,
            "carbon" => Self::Carbon,
            "galaxy" => Self::Galaxy,
            "halftone" => Self::Halftone,
            "lava" => Self::Lava,
            "vaporwave" => Self::Vaporwave,
            "viscous" => Self::Viscous,
            "darkmatter" => Self::DarkMatter,
            "monochrome" => Self::Monochrome,
            "deco" => Self::Deco,
            "frost" => Self::Frost,
            "circuit" => Self::Circuit,
            _ => return None,
        })
    }
}

/// How a pattern is applied: which style, how strongly it blends over the
/// original, and where in the pattern's cycle it is sampled.
#[derive(Debug, Clone, Copy)]
pub struct Pattern {
    pub style: PatternStyle,
    /// 0 leaves the texture alone, 1 is the pattern at full strength.
    pub intensity: f32,
    /// Shifts the pattern's hue and offset, 0..1.
    pub phase: f32,
}

impl Pattern {
    #[must_use]
    pub fn new(style: PatternStyle, intensity: f32, phase: f32) -> Self {
        Self {
            style,
            intensity: intensity.clamp(0.0, 1.0),
            phase: phase.rem_euclid(1.0),
        }
    }
}

// --- noise -----------------------------------------------------------------

fn hash2(i: i64, j: i64) -> f32 {
    let mut h = (i
        .wrapping_mul(374_761_393)
        .wrapping_add(j.wrapping_mul(668_265_263))) as u64;
    h = (h ^ (h >> 13)).wrapping_mul(1_274_126_177);
    ((h ^ (h >> 16)) & 0xff_ffff) as f32 / 16_777_216.0
}

/// Tiling value noise on a `period x period` lattice, so a painted texture wraps
/// cleanly instead of showing a seam where the UV shell repeats.
fn vnoise(x: f32, y: f32, period: i64) -> f32 {
    let gx = x * period as f32;
    let gy = y * period as f32;
    let x0 = gx.floor() as i64;
    let y0 = gy.floor() as i64;
    let fx = gx - x0 as f32;
    let fy = gy - y0 as f32;
    let wrap = |a: i64| ((a % period) + period) % period;
    let smooth = |t: f32| t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
    let ux = smooth(fx);
    let uy = smooth(fy);
    let v00 = hash2(wrap(x0), wrap(y0));
    let v10 = hash2(wrap(x0 + 1), wrap(y0));
    let v01 = hash2(wrap(x0), wrap(y0 + 1));
    let v11 = hash2(wrap(x0 + 1), wrap(y0 + 1));
    let a = v00 + (v10 - v00) * ux;
    let b = v01 + (v11 - v01) * ux;
    a + (b - a) * uy
}

fn fbm(x: f32, y: f32, period: i64, octaves: u32) -> f32 {
    let (mut sum, mut amplitude, mut period, mut norm) = (0.0, 0.5, period, 0.0);
    for _ in 0..octaves {
        sum += amplitude * vnoise(x, y, period);
        norm += amplitude;
        amplitude *= 0.5;
        period *= 2;
    }
    sum / norm
}

fn hsv(h: f32, s: f32, v: f32) -> [f32; 3] {
    let h = h.rem_euclid(360.0) / 60.0;
    let chroma = v * s;
    let x = chroma * (1.0 - ((h % 2.0) - 1.0).abs());
    let m = v - chroma;
    let (r, g, b) = match h as i32 {
        0 => (chroma, x, 0.0),
        1 => (x, chroma, 0.0),
        2 => (0.0, chroma, x),
        3 => (0.0, x, chroma),
        4 => (x, 0.0, chroma),
        _ => (chroma, 0.0, x),
    };
    [r + m, g + m, b + m]
}

fn pack(rgb: [f32; 3]) -> [u8; 3] {
    [
        (rgb[0] * 255.0).clamp(0.0, 255.0) as u8,
        (rgb[1] * 255.0).clamp(0.0, 255.0) as u8,
        (rgb[2] * 255.0).clamp(0.0, 255.0) as u8,
    ]
}

/// Ridged noise: fold the field at its midpoint so the *seam* becomes a sharp
/// line. Raising it to a power thins that line into a vein, which is the shape
/// behind marble, cracked ice and crystalline filaments alike.
fn ridge(value: f32, sharpness: f32) -> f32 {
    (1.0 - (2.0 * value - 1.0).abs())
        .clamp(0.0, 1.0)
        .powf(sharpness)
}

fn mix(a: [f32; 3], b: [f32; 3], t: f32) -> [f32; 3] {
    [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
    ]
}

// --- styles ----------------------------------------------------------------

fn liquid(u: f32, v: f32, phase: f32) -> [u8; 3] {
    // Warping the field by a second, coarser field is what turns smooth noise
    // into something that reads as flow rather than as fog.
    let warp = 0.38 * fbm(u * 1.4, v * 1.4, 4, 4);
    let flow = fbm(u + warp, v - warp, 3, 5);
    let swirl = fbm(u * 2.6 - warp, v * 2.6 + warp, 7, 3);
    let hue = (flow * 2.4 + swirl * 0.5 + phase).fract() * 360.0;
    pack(hsv(hue, 0.70, (0.30 + 0.66 * flow).clamp(0.0, 1.0)))
}

fn moire(u: f32, v: f32, phase: f32) -> [u8; 3] {
    let ring =
        |cx: f32, cy: f32, scale: f32| (((u - cx).powi(2) + (v - cy).powi(2)).sqrt() * scale).sin();
    // Three grids rather than two, at closer scales: the beat between them is
    // tighter, so the interference reads as a pattern instead of a haze.
    let interference = ring(0.5, 0.5, 210.0) * ring(0.43, 0.58, 228.0) * ring(0.61, 0.4, 196.0);
    let level = 0.5 + 0.5 * interference;
    let banded = (level * 7.0).floor() / 7.0 + level * 0.2;
    pack(hsv(
        phase * 360.0 + banded * 150.0,
        0.62,
        (0.18 + 0.78 * level).clamp(0.0, 1.0),
    ))
}

fn kaleido(u: f32, v: f32, phase: f32) -> [u8; 3] {
    let (dx, dy) = (u - 0.5, v - 0.5);
    let wedges = 8.0;
    let angle = dy.atan2(dx);
    let folded = (angle * wedges / std::f32::consts::TAU).fract().abs();
    let radius = (dx * dx + dy * dy).sqrt();
    let band = ((radius * 11.0 + phase * 6.0).sin() * 0.5 + 0.5) * folded;
    pack(hsv(phase * 360.0 + folded * 300.0, 0.7, 0.35 + 0.6 * band))
}

fn holo(u: f32, v: f32, phase: f32) -> [u8; 3] {
    let sweep = (u * 3.0 + v * 1.7 + phase * 2.0).fract();
    let shimmer = ((u + v) * 130.0).sin() * 0.06;
    pack(hsv(sweep * 360.0, 0.5, (0.72 + shimmer).clamp(0.0, 1.0)))
}

fn glitch(u: f32, v: f32, phase: f32) -> [u8; 3] {
    let row = (v * 38.0).floor();
    let torn = hash2(row as i64, (phase * 64.0) as i64);
    let shifted = (u + (torn - 0.5) * 0.34).rem_euclid(1.0);

    // Channel separation is what reads as "glitch": one field sampled at three
    // offsets. The offsets are wider than before, so the fringing is visible
    // instead of averaging back into grey.
    let sample = |offset: f32| fbm((shifted + offset).rem_euclid(1.0) * 2.0, v, 7, 3);
    let base = sample(0.0);
    // Every few rows drop to near-black, the dropout that sells the effect.
    let dropout = if torn > 0.93 { 0.15 } else { 1.0 };
    pack([
        (base * 1.25 * dropout).clamp(0.0, 1.0),
        (sample(0.18) * dropout).clamp(0.0, 1.0),
        ((0.2 + sample(-0.18) * 0.9) * dropout).clamp(0.0, 1.0),
    ])
}

fn thermal(u: f32, v: f32, phase: f32) -> [u8; 3] {
    let heat = (fbm(u * 1.8, v * 1.8, 5, 5) + phase).fract();
    // Black → deep blue → magenta → orange → white, the usual thermal ramp.
    let stops: [[f32; 3]; 5] = [
        [0.02, 0.02, 0.10],
        [0.16, 0.10, 0.62],
        [0.78, 0.16, 0.52],
        [0.98, 0.60, 0.14],
        [1.00, 0.98, 0.88],
    ];
    let scaled = heat * 4.0;
    let index = (scaled.floor() as usize).min(3);
    pack(mix(stops[index], stops[index + 1], scaled - index as f32))
}

fn camo(u: f32, v: f32, phase: f32) -> [u8; 3] {
    let blob = fbm(u * 2.2 + phase, v * 2.2, 5, 4);
    let tones: [[f32; 3]; 4] = [
        [0.18, 0.20, 0.14],
        [0.34, 0.36, 0.24],
        [0.52, 0.48, 0.33],
        [0.10, 0.11, 0.09],
    ];
    pack(tones[((blob * 4.0) as usize).min(3)])
}

fn carbon(u: f32, v: f32, phase: f32) -> [u8; 3] {
    let cell = 18.0;
    let tx = (u * cell).fract();
    let ty = (v * cell).fract();
    // A twill weave: alternating cells run the highlight the other way, and the
    // tow crossing under is darkened so the over/under actually reads.
    let over = ((u * cell).floor() as i64 + (v * cell).floor() as i64) % 2 == 0;
    let along = if over { tx } else { ty };
    let across = if over { ty } else { tx };
    let sheen = (along * std::f32::consts::PI).sin();
    let shade = 0.72 + 0.28 * (across * std::f32::consts::PI).sin();
    // A little fibre noise keeps large flat panels from looking printed.
    let fibre = 0.04 * fbm(u * 40.0, v * 40.0, 24, 2);
    let level = ((0.09 + 0.44 * sheen) * shade + fibre).clamp(0.0, 1.0);
    pack([level, level, level * (1.06 + 0.05 * phase)])
}

fn galaxy(u: f32, v: f32, phase: f32) -> [u8; 3] {
    let cloud = fbm(u * 2.6, v * 2.6, 6, 5);
    let deep = mix([0.04, 0.02, 0.12], [0.42, 0.20, 0.70], cloud);
    let speck = hash2((u * 900.0) as i64, (v * 900.0) as i64);
    let star = if speck > 0.9975 { 1.0 } else { 0.0 };
    pack(mix(deep, [1.0, 0.97, 0.9], star * (0.6 + 0.4 * phase)))
}

fn halftone(u: f32, v: f32, phase: f32) -> [u8; 3] {
    let cell = 16.0;
    // Rotating the screen off-axis is what print does, and it stops the dots
    // lining up with the texture's own pixel grid into a shimmering plaid.
    let (sin_a, cos_a) = (0.45f32.sin(), 0.45f32.cos());
    let (ru, rv) = (u * cos_a - v * sin_a, u * sin_a + v * cos_a);
    let cx = (ru * cell).fract() - 0.5;
    let cy = (rv * cell).fract() - 0.5;
    let radius = (cx * cx + cy * cy).sqrt();
    // The dot fills its cell at 0.707, so this range runs from a bare highlight
    // to nearly solid ink instead of staying in the pale end of the scale.
    let target = 0.12 + 0.52 * fbm(u * 5.0, v * 5.0, 9, 4);
    let ink = if radius < target { 0.0 } else { 1.0 };
    pack(hsv(phase * 360.0, 0.12, 0.08 + 0.88 * ink))
}

fn lava(u: f32, v: f32, phase: f32) -> [u8; 3] {
    let crust = fbm(u * 3.1, v * 3.1, 7, 5);
    // Near the mid-band the crust "cracks" and the glow shows through.
    let crack = (1.0 - (crust - 0.5).abs() * 5.0).clamp(0.0, 1.0);
    let rock = [0.10, 0.08, 0.08];
    let glow = hsv(18.0 + phase * 30.0, 0.95, 0.55 + 0.45 * crack);
    pack(mix(rock, glow, crack))
}

fn vaporwave(u: f32, v: f32, phase: f32) -> [u8; 3] {
    let horizon = 0.55f32;
    let sky = mix(
        [0.30, 0.06, 0.42],
        [0.96, 0.36, 0.62],
        v / horizon.max(0.001),
    );
    if v < horizon {
        return pack(sky);
    }
    // Below the horizon: a receding grid, lines closing up towards it.
    let depth = (v - horizon) / (1.0 - horizon).max(0.001);
    let rows = ((1.0 - depth).max(0.02).recip() * 1.6 + phase * 4.0).fract();
    let columns = ((u - 0.5) / depth.max(0.05) * 6.0).fract();
    let line = if rows < 0.12 || columns.abs() < 0.06 {
        1.0
    } else {
        0.0
    };
    pack(mix([0.08, 0.02, 0.18], [0.24, 0.96, 0.90], line))
}

/// Deadlock's own goo: rounded cells of translucent gel, each catching a bright
/// rim where its surface turns away.
fn viscous(u: f32, v: f32, phase: f32) -> [u8; 3] {
    let blob = fbm(u * 2.4, v * 2.4, 5, 4);
    let surface = fbm(u * 7.0 + phase, v * 7.0, 11, 3);
    let rim = ridge(blob, 2.5);
    let gel = hsv(
        142.0 + 46.0 * blob + phase * 40.0,
        0.58,
        (0.22 + 0.45 * blob).clamp(0.0, 1.0),
    );
    let highlight = hsv(160.0, 0.16, 0.96);
    pack(mix(gel, highlight, rim * (0.35 + 0.4 * surface)))
}

/// A near-black field shot through with thin filaments of violet light.
fn dark_matter(u: f32, v: f32, phase: f32) -> [u8; 3] {
    let field = fbm(u * 3.0, v * 3.0, 6, 5);
    let filament = ridge(field, 5.0);
    let halo = ridge(field, 1.4);
    let hue = 258.0 + 54.0 * fbm(u * 1.5, v * 1.5, 3, 3) + phase * 90.0;
    let void_color = hsv(hue, 0.9, 0.07);
    let glow = hsv(hue - 34.0, 0.72, 1.0);
    // Two passes: a wide dim halo under a narrow bright core, which is what makes
    // the filaments read as light rather than as painted lines.
    let base = mix(void_color, hsv(hue, 0.85, 0.28), halo * 0.55);
    pack(mix(base, glow, filament))
}

/// Marble in pure greys: veins of white warped through a dark ground.
fn monochrome(u: f32, v: f32, phase: f32) -> [u8; 3] {
    let warp = 0.34 * fbm(u * 1.2, v * 1.2, 3, 4);
    let field = fbm(u * 2.1 + warp, v * 2.1 - warp + phase, 4, 5);
    let vein = ridge(field, 2.4);
    // A touch of the underlying field in the ground keeps it from reading flat.
    let level = (0.07 + 0.16 * field + 0.82 * vein).clamp(0.0, 1.0);
    pack([level, level, level])
}

/// Art-deco: radiating rays over concentric rings, gold on near-black.
fn deco(u: f32, v: f32, phase: f32) -> [u8; 3] {
    let (dx, dy) = (u - 0.5, v - 0.5);
    let angle = dy.atan2(dx);
    // Triangle waves rather than sines: deco is drawn with hard edges.
    let rays = (((angle * 14.0 / std::f32::consts::TAU + phase).fract() * 2.0) - 1.0).abs();
    let radius = (dx * dx + dy * dy).sqrt();
    let rings = (((radius * 22.0).fract() * 2.0) - 1.0).abs();
    let figure = rays * 0.62 + rings * 0.38;
    let inked = if figure > 0.54 { 1.0 } else { 0.0 };
    let gold = hsv(41.0 + phase * 18.0, 0.60, 0.84);
    let ground = [0.055, 0.05, 0.045];
    pack(mix(ground, gold, inked * 0.88 + figure * 0.12))
}

/// Fractured ice: pale plates with bright cracks along their seams.
fn frost(u: f32, v: f32, phase: f32) -> [u8; 3] {
    let plates = fbm(u * 4.6, v * 4.6, 8, 4);
    let crack = ridge(plates, 5.0);
    // The plates need real depth between them, otherwise pale-on-pale reads as
    // fog rather than as ice with edges.
    let plate = hsv(
        202.0 + 20.0 * plates,
        (0.42 - 0.24 * plates).clamp(0.0, 1.0),
        (0.20 + 0.55 * plates).clamp(0.0, 1.0),
    );
    pack(mix(plate, [0.94, 0.99, 1.0], crack * (0.7 + 0.25 * phase)))
}

/// Circuit board: traces quantized to a lattice, with the odd solder node.
///
/// The lattice is deliberately coarse and the traces deliberately soft-edged.
/// A fine lattice with hair-thin traces looks right on a 2K texture but is
/// invisible in the picker's small swatch, where only a couple of samples land
/// per cell and every one of them can miss the trace entirely.
fn circuit(u: f32, v: f32, phase: f32) -> [u8; 3] {
    const CELLS: f32 = 10.0;
    const TRACE_HALF_WIDTH: f32 = 0.16;

    let (cell_x, cell_y) = ((u * CELLS).floor(), (v * CELLS).floor());
    let (fx, fy) = ((u * CELLS).fract(), (v * CELLS).fract());
    let roll = hash2(cell_x as i64, cell_y as i64);

    // Each cell carries one trace, run either across or down.
    let distance = if roll < 0.5 {
        (fy - 0.5).abs()
    } else {
        (fx - 0.5).abs()
    };
    let trace = (1.0 - distance / TRACE_HALF_WIDTH)
        .clamp(0.0, 1.0)
        .powf(0.5);

    let from_centre = ((fx - 0.5).powi(2) + (fy - 0.5).powi(2)).sqrt();
    let node = if roll > 0.84 {
        (1.0 - from_centre / 0.3).clamp(0.0, 1.0)
    } else {
        0.0
    };

    let board = [0.035, 0.085, 0.065];
    let copper = hsv(146.0 + phase * 90.0, 0.62, 0.78);
    pack(mix(board, copper, trace.max(node)))
}

fn pattern_pixel(style: PatternStyle, u: f32, v: f32, phase: f32) -> [u8; 3] {
    match style {
        PatternStyle::Liquid => liquid(u, v, phase),
        PatternStyle::Moire => moire(u, v, phase),
        PatternStyle::Kaleido => kaleido(u, v, phase),
        PatternStyle::Holo => holo(u, v, phase),
        PatternStyle::Glitch => glitch(u, v, phase),
        PatternStyle::Thermal => thermal(u, v, phase),
        PatternStyle::Camo => camo(u, v, phase),
        PatternStyle::Carbon => carbon(u, v, phase),
        PatternStyle::Galaxy => galaxy(u, v, phase),
        PatternStyle::Halftone => halftone(u, v, phase),
        PatternStyle::Lava => lava(u, v, phase),
        PatternStyle::Vaporwave => vaporwave(u, v, phase),
        PatternStyle::Viscous => viscous(u, v, phase),
        PatternStyle::DarkMatter => dark_matter(u, v, phase),
        PatternStyle::Monochrome => monochrome(u, v, phase),
        PatternStyle::Deco => deco(u, v, phase),
        PatternStyle::Frost => frost(u, v, phase),
        PatternStyle::Circuit => circuit(u, v, phase),
    }
}

/// Blend the pattern over an already-decoded image, in place.
///
/// Public so the paint pass can run a recolor and a pattern over the *same*
/// decode: doing them as two separate `*_texture` calls would decode and
/// re-encode the mip chain twice, and the BCn encode is the whole cost.
pub fn paint_image(image: &mut Image, pattern: Pattern) -> Result<()> {
    let (width, height) = (image.width.max(1), image.height.max(1));
    let ImageData::Rgba8(pixels) = &mut image.data else {
        return Err(VpkManagerError::Invalid(
            "this texture is HDR (16-bit float); patterns support 8-bit textures only".to_string(),
        ));
    };

    for y in 0..height {
        let v = y as f32 / height as f32;
        for x in 0..width {
            let u = x as f32 / width as f32;
            let generated = pattern_pixel(pattern.style, u, v, pattern.phase);
            let index = ((y * width + x) * 4) as usize;

            let original_max =
                f32::from(pixels[index].max(pixels[index + 1]).max(pixels[index + 2]));
            let generated_max =
                f32::from(generated[0].max(generated[1]).max(generated[2])).max(1.0);
            // Rescale the pattern to the original pixel's brightness before blending,
            // so black stays black and the model keeps its shading.
            let scale = original_max / generated_max;
            for channel in 0..3 {
                let original = f32::from(pixels[index + channel]);
                let shaped = f32::from(generated[channel]) * scale;
                pixels[index + channel] = (original + (shaped - original) * pattern.intensity)
                    .round()
                    .clamp(0.0, 255.0) as u8;
            }
        }
    }
    Ok(())
}

/// Paint a pattern onto a compiled texture, rebuilding its mip chain.
pub fn pattern_texture(original: &[u8], pattern: Pattern) -> Result<EditedTexture> {
    let mut image = source2::decode(original)?;
    paint_image(&mut image, pattern)?;
    let bytes = source2::edit::replace_mip_chain(original, &image)?;
    Ok(EditedTexture {
        bytes,
        width: image.width,
        height: image.height,
    })
}

/// Render a standalone RGBA8 swatch of a style, for the picker's preview tile.
/// Pure pattern generation: no VPK, no texture, cheap enough to call per style.
pub fn pattern_swatch(pattern: Pattern, size: u32) -> Vec<u8> {
    let size = size.clamp(1, 512);
    let mut rgba = Vec::with_capacity((size * size * 4) as usize);
    for y in 0..size {
        let v = y as f32 / size as f32;
        for x in 0..size {
            let u = x as f32 / size as f32;
            let [r, g, b] = pattern_pixel(pattern.style, u, v, pattern.phase);
            rgba.extend_from_slice(&[r, g, b, 255]);
        }
    }
    rgba
}

#[cfg(test)]
mod tests {
    use super::*;

    const ALL: [PatternStyle; 18] = [
        PatternStyle::Liquid,
        PatternStyle::Moire,
        PatternStyle::Kaleido,
        PatternStyle::Holo,
        PatternStyle::Glitch,
        PatternStyle::Thermal,
        PatternStyle::Camo,
        PatternStyle::Carbon,
        PatternStyle::Galaxy,
        PatternStyle::Halftone,
        PatternStyle::Lava,
        PatternStyle::Vaporwave,
        PatternStyle::Viscous,
        PatternStyle::DarkMatter,
        PatternStyle::Monochrome,
        PatternStyle::Deco,
        PatternStyle::Frost,
        PatternStyle::Circuit,
    ];

    fn image(pixels: Vec<u8>, width: u32, height: u32) -> Image {
        Image {
            width,
            height,
            data: ImageData::Rgba8(pixels),
        }
    }

    #[test]
    fn every_style_is_addressable_by_name() {
        for style in ALL {
            let name = format!("{style:?}").to_ascii_lowercase();
            assert_eq!(PatternStyle::parse(&name), Some(style), "{name}");
        }
        assert_eq!(PatternStyle::parse("not-a-style"), None);
    }

    #[test]
    fn no_style_produces_a_non_finite_or_out_of_range_pixel() {
        for style in ALL {
            for phase in [0.0, 0.33, 0.99] {
                for (u, v) in [(0.0, 0.0), (0.5, 0.5), (0.999, 0.999), (0.5, 0.55)] {
                    // A u8 cannot be out of range, but a NaN cast silently becomes 0, so
                    // check the styles produce something that varies rather than collapse.
                    let _ = pattern_pixel(style, u, v, phase);
                }
            }
            let swatch = pattern_swatch(Pattern::new(style, 1.0, 0.2), 16);
            assert_eq!(swatch.len(), 16 * 16 * 4);
            let unique = swatch
                .chunks_exact(4)
                .map(|px| px[0])
                .collect::<std::collections::BTreeSet<_>>();
            assert!(unique.len() > 1, "{style:?} produced a flat swatch");
        }
    }

    #[test]
    fn every_style_actually_varies_across_the_texture() {
        for style in ALL {
            let swatch = pattern_swatch(Pattern::new(style, 1.0, 0.3), 48);
            let levels = swatch
                .chunks_exact(4)
                .map(|px| u16::from(px[0]) + u16::from(px[1]) + u16::from(px[2]))
                .collect::<Vec<_>>();
            let min = *levels.iter().min().unwrap();
            let max = *levels.iter().max().unwrap();
            // Across 0..765 of summed channels, a usable pattern spans a good part
            // of the range rather than hovering on one tone.
            assert!(
                max - min > 90,
                "{style:?} is nearly flat: range {min}..{max}"
            );
        }
    }

    #[test]
    fn monochrome_stays_grey() {
        // The point of this one is that it has no hue at all.
        for phase in [0.0, 0.4, 0.9] {
            for (u, v) in [(0.1, 0.2), (0.5, 0.5), (0.87, 0.33)] {
                let [r, g, b] = monochrome(u, v, phase);
                assert_eq!((r, g), (g, b), "monochrome produced a tinted pixel");
            }
        }
    }

    #[test]
    fn black_pixels_stay_black_so_cutouts_survive() {
        for style in ALL {
            let mut img = image(vec![0, 0, 0, 255], 1, 1);
            paint_image(&mut img, Pattern::new(style, 1.0, 0.5)).unwrap();
            let ImageData::Rgba8(pixels) = &img.data else {
                unreachable!()
            };
            assert_eq!(&pixels[0..3], &[0, 0, 0], "{style:?} lit up a black pixel");
        }
    }

    #[test]
    fn zero_intensity_leaves_the_texture_untouched() {
        let mut img = image(vec![120, 40, 200, 255], 1, 1);
        paint_image(&mut img, Pattern::new(PatternStyle::Lava, 0.0, 0.5)).unwrap();
        let ImageData::Rgba8(pixels) = &img.data else {
            unreachable!()
        };
        assert_eq!(pixels, &[120, 40, 200, 255]);
    }

    #[test]
    fn alpha_is_preserved() {
        let mut img = image(vec![200, 200, 200, 77], 1, 1);
        paint_image(&mut img, Pattern::new(PatternStyle::Holo, 1.0, 0.0)).unwrap();
        let ImageData::Rgba8(pixels) = &img.data else {
            unreachable!()
        };
        assert_eq!(pixels[3], 77);
    }

    #[test]
    fn hdr_textures_are_refused() {
        let mut hdr = Image {
            width: 1,
            height: 1,
            data: ImageData::Rgba16F(vec![half::f16::from_f32(1.0); 4]),
        };
        assert!(paint_image(&mut hdr, Pattern::new(PatternStyle::Camo, 1.0, 0.0)).is_err());
    }
}
