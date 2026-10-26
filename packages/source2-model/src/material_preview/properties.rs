use super::normalize_compiled_path;
use super::textures::preview_resource;
use crate::vpk_extract::VpkArchive;
use crate::{kv3, vmesh};

pub(super) fn texture_param_score(name: &str, path: &str) -> i32 {
    let name = name.to_ascii_lowercase();
    let path = path.to_ascii_lowercase();
    // Shader roles take priority over filenames: NPR transmission textures also
    // contain "color" but are not the surface albedo.
    if matches!(
        name.as_str(),
        "g_tcolor" | "g_tcolor1" | "g_talbedo" | "g_tbasecolor"
    ) {
        return 1000;
    }
    if name.contains("transmiss") || name.contains("npr") || name.contains("specular") {
        return 0;
    }
    let mut score = 0;
    if name.contains("color") || name.contains("albedo") || name.contains("base") {
        score += 120;
    }
    if path.contains("color") || path.contains("albedo") {
        score += 80;
    }
    if name.contains("normal")
        || name.contains("rough")
        || name.contains("metal")
        || name.contains("mask")
        || name.contains("ao")
        || name.contains("illum")
        || name.contains("tint")
        || path.contains("normal")
        || path.contains("rough")
        || path.contains("metal")
        || path.contains("mask")
        || path.contains("_ao")
        || path.contains("illum")
    {
        score -= 220;
    }
    score
}

pub fn material_color_texture(archive: &VpkArchive, material_path: &str) -> Option<String> {
    material_preview_properties(archive, material_path).map(|properties| properties.color_texture)
}

fn named_i64(data: &kv3::KvValue, collection: &str, name: &str) -> Option<i64> {
    data.get(collection)?.as_array()?.iter().find_map(|param| {
        param
            .get("m_name")?
            .as_string()?
            .eq_ignore_ascii_case(name)
            .then(|| param.get("m_nValue")?.as_i64())?
    })
}

fn named_f32(data: &kv3::KvValue, collection: &str, name: &str) -> Option<f32> {
    data.get(collection)?.as_array()?.iter().find_map(|param| {
        if !param.get("m_name")?.as_string()?.eq_ignore_ascii_case(name) {
            return None;
        }
        match param.get("m_flValue")? {
            kv3::KvValue::Float(value) => Some(*value as f32),
            kv3::KvValue::Int(value) => Some(*value as f32),
            kv3::KvValue::UInt(value) => Some(*value as f32),
            _ => None,
        }
    })
}

fn named_vec4(data: &kv3::KvValue, name: &str) -> Option<[f32; 4]> {
    let value = data
        .get("m_vectorParams")?
        .as_array()?
        .iter()
        .find_map(|param| {
            param
                .get("m_name")?
                .as_string()?
                .eq_ignore_ascii_case(name)
                .then(|| param.get("m_value")?.as_array())?
        })?;
    let mut result = [1.0; 4];
    for (index, item) in value.iter().take(4).enumerate() {
        result[index] = match item {
            kv3::KvValue::Float(value) => *value as f32,
            kv3::KvValue::Int(value) => *value as f32,
            kv3::KvValue::UInt(value) => *value as f32,
            _ => result[index],
        };
    }
    Some(result)
}

#[derive(Debug, Clone)]
pub(super) struct MaterialPreviewProperties {
    pub(super) color_texture: String,
    pub(super) normal_texture: Option<String>,
    pub(super) roughness_texture: Option<String>,
    pub(super) roughness_channel: usize,
    pub(super) hemi_oct_normal: bool,
    pub(super) metalness_texture: Option<String>,
    pub(super) metalness_channel: usize,
    /// Dedicated ambient-occlusion map (glTF occlusion = red channel).
    pub(super) occlusion_texture: Option<String>,
    pub(super) emissive_texture: Option<String>,
    /// How much of the albedo colours the glow (`g_flSelfIllumAlbedoFactor`):
    /// 0 glows in the tint alone, 1 glows in the surface's own colour.
    pub(super) self_illum_albedo_factor: f32,
    /// `F_VERTEX_COLOR`: the colour lives in the mesh's COLOR stream and the
    /// colour texture is a flat placeholder.
    pub(super) vertex_color: bool,
    pub(super) double_sided: bool,
    pub(super) base_color_factor: [f32; 4],
    pub(super) metalness_factor: f32,
    pub(super) alpha_mode: vmesh::MaterialAlphaMode,
    pub(super) alpha_cutoff: f32,
    pub(super) emissive_factor: Option<[f32; 3]>,
    pub(super) emissive_strength: f32,
    pub(super) outline: Option<vmesh::MaterialOutline>,
}

pub(super) fn material_preview_properties(
    archive: &VpkArchive,
    material_path: &str,
) -> Option<MaterialPreviewProperties> {
    let material_path = normalize_compiled_path(material_path, ".vmat");
    let bytes = archive.extract_entry(&material_path).ok()?;
    let res = preview_resource(bytes)?;
    let data = res
        .block_bytes("DATA")
        .and_then(|bytes| kv3::parse(bytes).ok())?;
    material_preview_properties_from_data(&data)
}

pub(super) fn material_preview_properties_from_data(
    data: &kv3::KvValue,
) -> Option<MaterialPreviewProperties> {
    let texture_params = data.get("m_textureParams")?.as_array()?;
    let shader = data
        .get("m_shaderName")
        .and_then(kv3::KvValue::as_string)
        .unwrap_or("");
    // Only these verified shader families use g_tNormalRoughness as RG hemi-oct + B roughness.
    let pbr = shader.eq_ignore_ascii_case("pbr.vfx");
    let hemi_oct_normal = pbr || shader.eq_ignore_ascii_case("citadel_overlay.vfx");
    let int_flag = |name: &str| named_i64(data, "m_intParams", name).unwrap_or(0) != 0;

    let color_texture = texture_params
        .iter()
        .filter_map(|param| {
            let name = param.get("m_name")?.as_string()?;
            let path = param.get("m_pValue")?.as_string()?;
            let score = texture_param_score(name, path);
            (score > 0).then_some((score, normalize_compiled_path(path, ".vtex")))
        })
        .max_by_key(|(score, _)| *score)
        .map(|(_, path)| path)?;
    let find_texture = |score: fn(&str, &str) -> i32| {
        texture_params
            .iter()
            .filter_map(|param| {
                let name = param.get("m_name")?.as_string()?;
                let path = param.get("m_pValue")?.as_string()?;
                let score = score(&name.to_ascii_lowercase(), &path.to_ascii_lowercase());
                (score > 0).then_some((score, normalize_compiled_path(path, ".vtex")))
            })
            .max_by_key(|(score, _)| *score)
            .map(|(_, path)| path)
    };
    let normal_texture = find_texture(|name, _| match name {
        "g_tnormalroughness" => 200,
        "g_tnormal" => 100,
        _ => 0,
    });
    let combined_normal = texture_params.iter().any(|param| {
        param
            .get("m_name")
            .and_then(kv3::KvValue::as_string)
            .is_some_and(|name| name.eq_ignore_ascii_case("g_tNormalRoughness"))
    });
    // Unverified packed normal encodings must not be decoded as ordinary RG normals.
    let normal_texture = normal_texture.filter(|_| !combined_normal || hemi_oct_normal);
    let orm_texture = find_texture(|name, _| {
        i32::from(matches!(name, "g_torm" | "g_tocclusionroughnessmetalness"))
    });
    let occlusion_texture = find_texture(|name, _| {
        i32::from(matches!(
            name,
            "g_tambientocclusion" | "g_tocclusion" | "g_tao"
        ))
    })
    .or_else(|| orm_texture.clone());
    let dedicated_roughness =
        find_texture(|name, _| i32::from(matches!(name, "g_troughness" | "g_troughness1")));
    let (roughness_texture, roughness_channel) = if let Some(orm) = &orm_texture {
        (Some(orm.clone()), 1)
    } else if let Some(roughness) = dedicated_roughness {
        (Some(roughness), 0)
    } else if combined_normal && hemi_oct_normal {
        (normal_texture.clone(), 2)
    } else {
        (None, 0)
    };
    let emissive_texture_candidate = find_texture(|name, path| {
        if name.contains("selfillum")
            || name.contains("emissive")
            || path.contains("selfillum")
            || path.contains("emissive")
        {
            100
        } else {
            0
        }
    });
    let alpha_test = int_flag("F_ALPHA_TEST");
    let translucent = int_flag("F_TRANSLUCENT") || int_flag("F_ADVANCED_TRANSLUCENCY");
    let alpha_mode = if alpha_test {
        vmesh::MaterialAlphaMode::Mask
    } else if translucent {
        vmesh::MaterialAlphaMode::Blend
    } else {
        vmesh::MaterialAlphaMode::Opaque
    };
    let mut base_color_factor = named_vec4(data, "g_vColorTint")
        .or_else(|| named_vec4(data, "g_vColorTint1"))
        .unwrap_or([1.0; 4]);
    // VMAT tint vectors use W for shader-specific data; it is not opacity.
    base_color_factor[3] = 1.0;
    let metalness_factor = if pbr {
        0.0
    } else {
        named_f32(data, "m_floatParams", "g_flMetalness")
            .unwrap_or(0.0)
            .clamp(0.0, 1.0)
    };
    // pbr_features.slang reserves color alpha for opacity on cutout/translucent materials.
    // Unlit PBR has no metalness. Other shader families retain their scalar fallback.
    let (metalness_texture, metalness_channel) = if pbr {
        if int_flag("F_UNLIT") {
            (None, 0)
        } else if alpha_test || translucent {
            (find_texture(|name, _| i32::from(name == "g_tmetalness")), 0)
        } else {
            (Some(color_texture.clone()), 3)
        }
    } else {
        (orm_texture, 2)
    };
    // `F_SELF_ILLUM` only compiles the glow in; `g_flSelfIllumScale` is what
    // turns it up. Most hero materials ship the flag with a scale of 0 and the
    // engine's default mask, which is pure red (masks are read from R) — taking
    // the flag alone painted those surfaces as glowing red.
    let self_illum_scale = named_f32(data, "m_floatParams", "g_flSelfIllumScale1")
        .or_else(|| named_f32(data, "m_floatParams", "g_flSelfIllumScale"))
        .unwrap_or(1.0);
    let self_illum = int_flag("F_SELF_ILLUM") && self_illum_scale > 0.0;
    let emissive_texture = emissive_texture_candidate.filter(|_| self_illum);
    let self_illum_tint = named_vec4(data, "g_vSelfIllumTint1")
        .or_else(|| named_vec4(data, "g_vSelfIllumTint"))
        .unwrap_or([1.0; 4]);
    // glTF caps emissiveFactor at 1; the rest of the scale travels as
    // KHR_materials_emissive_strength so bright glows bloom.
    let emissive_factor = self_illum.then(|| {
        [0, 1, 2]
            .map(|channel| (self_illum_tint[channel] * self_illum_scale.min(1.0)).clamp(0.0, 1.0))
    });
    let emissive_strength = if self_illum {
        // Higher values bloom whole glowing parts (helmets, gun barrels) to white.
        self_illum_scale.clamp(1.0, 2.5)
    } else {
        1.0
    };
    let outline =
        (int_flag("F_USE_NPR_LIGHTING") && !int_flag("F_DISABLE_NPR_OUTLINE")).then(|| {
            vmesh::MaterialOutline {
                tint: int_flag("F_SOLID_COLOR_OUTLINE")
                    .then(|| named_vec4(data, "g_vSolidOutlineTint"))
                    .flatten()
                    .map(|tint| [tint[0], tint[1], tint[2]]),
            }
        });
    let self_illum_albedo_factor = named_f32(data, "m_floatParams", "g_flSelfIllumAlbedoFactor1")
        .or_else(|| named_f32(data, "m_floatParams", "g_flSelfIllumAlbedoFactor"))
        .unwrap_or(1.0)
        .clamp(0.0, 1.0);
    Some(MaterialPreviewProperties {
        color_texture,
        normal_texture,
        roughness_texture,
        roughness_channel,
        hemi_oct_normal,
        metalness_texture,
        metalness_channel,
        occlusion_texture,
        emissive_texture,
        self_illum_albedo_factor,
        vertex_color: int_flag("F_VERTEX_COLOR"),
        double_sided: named_i64(data, "m_intParams", "F_RENDER_BACKFACES").unwrap_or(0) == 1,
        base_color_factor,
        metalness_factor,
        alpha_mode,
        alpha_cutoff: named_f32(data, "m_floatParams", "g_flAlphaTestReference")
            .or_else(|| named_f32(data, "m_floatParams", "g_flAlphaTestReference1"))
            .unwrap_or(0.5)
            .clamp(0.0, 1.0),
        emissive_factor,
        emissive_strength,
        outline,
    })
}
