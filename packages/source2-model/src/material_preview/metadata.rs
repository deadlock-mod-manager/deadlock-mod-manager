use serde::Serialize;

use super::properties::{named_f32, named_i64, named_vec4};
use crate::{Resource, kv3::KvValue};

/// DMM's evaluated, static Source 2 preview contract, carried in GLB material extras.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Source2Material {
    pub schema_version: u8,
    pub shader: String,
    pub blend_mode: Source2BlendMode,
    pub unlit: bool,
    pub color: Option<Source2Color>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub emission: Option<Source2Emission>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Source2Emission {
    pub mask_texture: Option<usize>,
    pub albedo_factor: f32,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Source2BlendMode {
    Opaque,
    Translucent,
    Additive,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Source2Color {
    /// Linear tint, also exported as the glTF fallback baseColorFactor.
    pub tint: [f32; 3],
    pub tint_mode: i64,
    pub contrast_saturation_brightness: [f32; 3],
    pub reflectivity: [f32; 3],
    pub mask_color_tint: bool,
    pub mask_vertex_color: bool,
    pub vertex_color_before_correction: bool,
    pub vertex_color_strength: f32,
    pub tint_mask_texture: Option<usize>,
}

impl Source2Color {
    pub(super) fn needs_tint_mask(&self, vertex_color: bool) -> bool {
        (self.mask_color_tint && (self.tint_mode != 0 || self.tint != [1.; 3]))
            || (vertex_color && self.mask_vertex_color && self.vertex_color_strength != 0.)
    }
}

pub(super) fn linear(value: f32) -> f32 {
    if value <= 0.04045 {
        value / 12.92
    } else {
        ((value + 0.055) / 1.055).powf(2.4)
    }
}

pub(super) fn metadata(data: &KvValue, shader: &str) -> Source2Material {
    let flag = |name| named_i64(data, "m_intParams", name).unwrap_or(0) != 0;
    let boolean = |name| named_i64(data, "m_intParams", name).unwrap_or(1) != 0;
    let tint = named_vec4(data, "g_vColorTint1")
        .or_else(|| named_vec4(data, "g_vColorTint"))
        .unwrap_or([1.; 4]);
    let csb = named_vec4(data, "g_vAlbedoContrastSaturationBrightness1").unwrap_or([1.; 4]);
    let color_dynamic = data
        .get("m_dynamicParams")
        .and_then(KvValue::as_array)
        .is_some_and(|params| {
            params.iter().any(|param| {
                param
                    .get("m_name")
                    .and_then(KvValue::as_string)
                    .is_some_and(|name| {
                        [
                            "g_vColorTint",
                            "g_vAlbedoContrastSaturationBrightness",
                            "g_bMaskColorTint",
                            "g_bMaskVertexColorTint",
                            "g_bApplyTintToVertexColors",
                            "g_fVertexColorStrength",
                            "g_nTextureColorTintMode",
                        ]
                        .iter()
                        .any(|prefix| {
                            name.to_ascii_lowercase()
                                .starts_with(&prefix.to_ascii_lowercase())
                        })
                    })
            })
        });
    let tint_mode = named_i64(data, "m_intParams", "g_nTextureColorTintMode1").unwrap_or(0);
    let color = (shader.eq_ignore_ascii_case("pbr.vfx")
        && !color_dynamic
        && (0..=2).contains(&tint_mode)
        && tint[..3].iter().all(|value| (0.0..=1.0).contains(value))
        && tint.iter().chain(&csb).all(|value| value.is_finite()))
    .then(|| Source2Color {
        tint: [tint[0], tint[1], tint[2]].map(linear),
        tint_mode,
        contrast_saturation_brightness: [csb[0], csb[1], csb[2]],
        reflectivity: [0.; 3],
        mask_color_tint: boolean("g_bMaskColorTint1"),
        mask_vertex_color: boolean("g_bMaskVertexColorTint1"),
        vertex_color_before_correction: flag("g_bApplyTintToVertexColors"),
        vertex_color_strength: named_f32(data, "m_floatParams", "g_fVertexColorStrength1")
            .filter(|value| value.is_finite())
            .unwrap_or(1.)
            .clamp(0., 1.),
        tint_mask_texture: None,
    });
    Source2Material {
        schema_version: 1,
        shader: shader.to_string(),
        blend_mode: if flag("F_ADDITIVE_BLEND") {
            Source2BlendMode::Additive
        } else if flag("F_TRANSLUCENT") || flag("F_ADVANCED_TRANSLUCENCY") {
            Source2BlendMode::Translucent
        } else {
            Source2BlendMode::Opaque
        },
        unlit: flag("F_UNLIT"),
        color,
        emission: None,
    }
}

pub(super) fn reflectivity(resource: &Resource) -> Option<[f32; 3]> {
    let bytes = resource.block_bytes("DATA")?.get(4..16)?;
    let values = std::array::from_fn(|index| {
        f32::from_le_bytes(bytes[index * 4..index * 4 + 4].try_into().unwrap())
    });
    values
        .iter()
        .all(|value| value.is_finite() && *value >= 0.)
        .then_some(values)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AnimatedAlbedoAttribute {
    version: u8,
    scale: [f32; 2],
    offsets: Vec<[f32; 2]>,
    durations_ms: Vec<u32>,
    plays: u32,
}
/// Only DMM-authored atlas metadata is interpreted. Generic game expressions remain untouched.
pub(super) fn animated_albedo(data: &KvValue) -> Option<crate::vmesh::Source2AnimatedAlbedo> {
    if data.get("m_shaderName")?.as_string()? != "pbr.vfx" {
        return None;
    }
    if named_i64(data, "m_intParams", "F_ENABLE_TEXTURE_TRANSFORMS") != Some(1) {
        return None;
    }
    let attributes = data.get("m_stringAttributes")?.as_array()?;
    let mut own = attributes.iter().filter(|attribute| {
        attribute.get("m_name").and_then(KvValue::as_string) == Some("DmmAnimatedAlbedo")
    });
    let encoded = own.next()?.get("m_value")?.as_string()?;
    if own.next().is_some() || encoded.len() > 32 * 1024 {
        return None;
    }
    let attribute: AnimatedAlbedoAttribute = serde_json::from_str(encoded).ok()?;
    if attribute.version != 1
        || attribute.plays != 0
        || !(2..=128).contains(&attribute.offsets.len())
        || attribute.offsets.len() != attribute.durations_ms.len()
        || attribute.durations_ms.contains(&0)
        || attribute
            .scale
            .iter()
            .any(|value| !value.is_finite() || *value <= 0. || *value > 1.)
    {
        return None;
    }
    if attribute.offsets.iter().any(|offset| {
        offset
            .iter()
            .zip(attribute.scale)
            .any(|(value, scale)| !value.is_finite() || *value < 0. || value + scale > 1.00001)
    }) {
        return None;
    }
    let scale = named_vec4(data, "g_vAlbedoTexcoordScale1")?;
    if (scale[0] - attribute.scale[0]).abs() > 0.00001
        || (scale[1] - attribute.scale[1]).abs() > 0.00001
    {
        return None;
    }
    let dynamic = data.get("m_dynamicParams")?.as_array()?;
    let mut offsets = dynamic.iter().filter(|parameter| {
        parameter.get("m_name").and_then(KvValue::as_string) == Some("g_vAlbedoTexcoordOffset1")
    });
    let offset = offsets.next()?;
    if offsets.next().is_some()
        || !matches!(offset.get("m_value"),Some(KvValue::Binary(bytes)) if !bytes.is_empty())
    {
        return None;
    }
    Some(crate::vmesh::Source2AnimatedAlbedo {
        scale: attribute.scale,
        offsets: attribute.offsets,
        durations_ms: attribute.durations_ms,
        plays: attribute.plays,
    })
}
