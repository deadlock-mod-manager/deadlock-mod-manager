//! Recoloring a compiled particle system (`.vpcf_c`).
//!
//! Ability VFX carry their color in two places: the particle operators' color
//! parameters, and the textures those particles sample. This module handles the
//! first; [`crate::texture_edit`] handles the second, and both take the same
//! [`Recolor`] so one picked color lands them together.
//!
//! The edit is **surgical, not a re-encode**. Decoding a `.vpcf_c` to a value
//! tree and writing it back loses value flags and typed-array tags that the
//! engine's loader depends on, which produces a file that parses offline but
//! fails in game. So the tree is only used to *locate* the color scalars; the
//! bytes are then patched in place on a byte-faithful uncompressed re-wrap of
//! the block, leaving every other byte untouched.

use crate::error::{Result, VpkManagerError};
use crate::source2::kv3::{self, Seg, Value};
use crate::source2::resource::Resource;
use crate::texture_edit::Recolor;

/// Key names whose value is a particle color. Source 2 spells these several
/// ways across operator classes, so the match is on the substring rather than an
/// exact list that would silently miss a variant.
fn is_color_key(key: &str) -> bool {
    let lower = key.to_ascii_lowercase();
    lower.contains("color") || lower.contains("tint")
}

/// An 8-bit RGB(A) color, as particle parameters store it: an array of three or
/// four integers in 0..=255. Anything else under a color-ish key — a float
/// vector, a string, a nested operator — is left alone.
fn as_rgb8(value: &Value) -> Option<[u8; 3]> {
    let items = value.as_array()?;
    if items.len() < 3 || items.len() > 4 {
        return None;
    }
    let mut rgb = [0u8; 3];
    for (index, slot) in rgb.iter_mut().enumerate() {
        let channel = match &items[index] {
            Value::Int(value) => *value,
            Value::UInt(value) => i64::try_from(*value).ok()?,
            _ => return None,
        };
        *slot = u8::try_from(channel).ok()?;
    }
    // A fourth element must be an integer alpha, not something else entirely.
    if items.len() == 4 && !matches!(items[3], Value::Int(_) | Value::UInt(_)) {
        return None;
    }
    Some(rgb)
}

fn rgb_to_hsv(r: f64, g: f64, b: f64) -> (f64, f64, f64) {
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let delta = max - min;
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

/// Apply a recolor to one 8-bit color, matching the texture path's transform so
/// particles and their textures land on the same color.
fn recolor_rgb8(rgb: [u8; 3], recolor: Recolor) -> [u8; 3] {
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
    [
        (r * 255.0).round().clamp(0.0, 255.0) as u8,
        (g * 255.0).round().clamp(0.0, 255.0) as u8,
        (b * 255.0).round().clamp(0.0, 255.0) as u8,
    ]
}

/// Walk the tree collecting a channel-level edit for every color parameter.
///
/// Each RGB channel is its own scalar in the block, so a color becomes three
/// edits addressed by `path + Index(channel)`. Alpha is never touched: it is
/// opacity, not color, and shifting it would change how the effect reads.
fn collect_color_edits(
    value: &Value,
    path: &mut Vec<Seg>,
    edits: &mut Vec<(Vec<Seg>, i64)>,
    recolor: Recolor,
) {
    match value {
        Value::Object(pairs) => {
            for (key, child) in pairs {
                path.push(Seg::Key(key.clone()));
                if is_color_key(key)
                    && let Some(rgb) = as_rgb8(child)
                {
                    let recolored = recolor_rgb8(rgb, recolor);
                    if recolored != rgb {
                        for (channel, component) in recolored.iter().enumerate() {
                            let mut channel_path = path.clone();
                            channel_path.push(Seg::Index(channel));
                            edits.push((channel_path, i64::from(*component)));
                        }
                    }
                } else {
                    collect_color_edits(child, path, edits, recolor);
                }
                path.pop();
            }
        }
        Value::Array(items) => {
            for (index, item) in items.iter().enumerate() {
                path.push(Seg::Index(index));
                collect_color_edits(item, path, edits, recolor);
                path.pop();
            }
        }
        _ => {}
    }
}

/// Recolor every color parameter of a compiled particle system.
///
/// Returns `Ok(None)` when the system has no color parameter to change — common
/// for systems that only reference a texture or drive motion — so the caller can
/// tell "nothing to do" from "failed".
pub fn recolor_particle_colors(vpcf_bytes: &[u8], recolor: Recolor) -> Result<Option<Vec<u8>>> {
    let resource = Resource::parse(vpcf_bytes)?;
    let data = resource.data_block()?;
    let tree = kv3::decode(data)?;

    let mut edits = Vec::new();
    collect_color_edits(&tree, &mut Vec::new(), &mut edits, recolor);
    if edits.is_empty() {
        return Ok(None);
    }

    let patched = kv3::set_scalars(data, &edits).map_err(|error| {
        VpkManagerError::Invalid(format!("particle color patch failed: {error}"))
    })?;
    Ok(Some(resource.rebuild_with_data(&patched)?))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn color(r: i64, g: i64, b: i64, a: i64) -> Value {
        Value::Array(vec![
            Value::Int(r),
            Value::Int(g),
            Value::Int(b),
            Value::Int(a),
        ])
    }

    fn edits_for(tree: &Value, recolor: Recolor) -> Vec<(Vec<Seg>, i64)> {
        let mut edits = Vec::new();
        collect_color_edits(tree, &mut Vec::new(), &mut edits, recolor);
        edits
    }

    #[test]
    fn color_parameters_are_found_at_any_depth() {
        let tree = Value::Object(vec![(
            "m_Operators".to_string(),
            Value::Array(vec![Value::Object(vec![(
                "m_ColorFade".to_string(),
                color(255, 0, 0, 255),
            )])]),
        )]);
        let edits = edits_for(&tree, Recolor::new(240.0, 1.0, 1.0));
        // Three channel edits, addressed through the operator array.
        assert_eq!(edits.len(), 3);
        assert_eq!(edits[0].1, 0);
        assert_eq!(edits[1].1, 0);
        assert_eq!(edits[2].1, 255);
        assert_eq!(
            edits[2].0,
            vec![
                Seg::Key("m_Operators".to_string()),
                Seg::Index(0),
                Seg::Key("m_ColorFade".to_string()),
                Seg::Index(2),
            ]
        );
    }

    #[test]
    fn alpha_is_never_edited() {
        let tree = Value::Object(vec![("m_Color".to_string(), color(255, 0, 0, 128))]);
        let edits = edits_for(&tree, Recolor::new(120.0, 1.0, 1.0));
        assert!(
            edits
                .iter()
                .all(|(path, _)| path.last() != Some(&Seg::Index(3)))
        );
    }

    #[test]
    fn neutral_and_unchanged_colors_produce_no_edit() {
        // White has no chroma to shift, so a hue change leaves it alone.
        let tree = Value::Object(vec![("m_Color".to_string(), color(255, 255, 255, 255))]);
        assert!(edits_for(&tree, Recolor::new(200.0, 1.0, 1.0)).is_empty());
    }

    #[test]
    fn non_color_values_under_color_keys_are_left_alone() {
        let tree = Value::Object(vec![
            ("m_ColorScale".to_string(), Value::Double(1.5)),
            (
                "m_hColorTexture".to_string(),
                Value::String("a.vtex".into()),
            ),
            // A float tint is a different representation this patch does not handle.
            (
                "m_vColorTint".to_string(),
                Value::Array(vec![
                    Value::Double(1.0),
                    Value::Double(0.5),
                    Value::Double(0.0),
                ]),
            ),
        ]);
        assert!(edits_for(&tree, Recolor::new(30.0, 1.0, 1.0)).is_empty());
    }
}
