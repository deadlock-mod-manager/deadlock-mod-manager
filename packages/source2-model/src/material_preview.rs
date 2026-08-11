use super::*;
use std::thread;

fn normalize_compiled_path(path: &str, source_extension: &str) -> String {
    let mut normalized = path.replace('\\', "/").to_ascii_lowercase();
    if normalized.ends_with("_c") {
        return normalized;
    }
    if normalized.ends_with(source_extension) {
        normalized.push_str("_c");
    }
    normalized
}

fn texture_param_score(name: &str, path: &str) -> i32 {
    let name = name.to_ascii_lowercase();
    let path = path.to_ascii_lowercase();
    let mut score = 0;
    if name.contains("color") || name.contains("albedo") || name.contains("base") {
        score += 120;
    }
    if path.contains("color") || path.contains("albedo") {
        score += 80;
    }
    if name == "g_tcolor" || name == "g_tcolor1" || name == "g_talbedo" {
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
struct MaterialPreviewProperties {
    color_texture: String,
    normal_texture: Option<String>,
    /// Texture whose channel holds surface roughness (see `roughness_in_alpha`).
    roughness_texture: Option<String>,
    /// True when roughness is packed in the alpha of a combined normal+roughness
    /// map; false when it is the red channel of a dedicated roughness map.
    roughness_in_alpha: bool,
    /// Dedicated ambient-occlusion map (glTF occlusion = red channel).
    occlusion_texture: Option<String>,
    emissive_texture: Option<String>,
    base_color_factor: [f32; 4],
    metalness_factor: f32,
    alpha_mode: vmesh::MaterialAlphaMode,
    alpha_cutoff: f32,
    emissive_factor: Option<[f32; 3]>,
}

fn material_preview_properties(
    archive: &VpkArchive,
    material_path: &str,
) -> Option<MaterialPreviewProperties> {
    let material_path = normalize_compiled_path(material_path, ".vmat");
    let bytes = archive.extract_entry(&material_path).ok()?;
    let res = Resource::parse(bytes).ok()?;
    let data = res
        .block_bytes("DATA")
        .and_then(|bytes| kv3::parse(bytes).ok())?;
    let texture_params = data.get("m_textureParams")?.as_array()?;

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
    let normal_texture = find_texture(|name, path| {
        if name.contains("normal") || path.contains("normal") {
            100 + i32::from(name == "g_tnormal") * 100
        } else {
            0
        }
    });
    // Dedicated ambient-occlusion map. Never a normal map — its RGB is a normal,
    // not occlusion/roughness/metalness.
    let occlusion_texture = find_texture(|name, path| {
        if name.contains("normal") || path.contains("normal") {
            return 0;
        }
        if name.contains("ambientocclusion")
            || name.contains("occlusion")
            || name.contains("_ao")
            || path.contains("_ao")
        {
            100
        } else {
            0
        }
    });
    // Source 2 hero shaders (pbr.vfx) pack roughness in the ALPHA of the normal
    // map (g_tNormalRoughness). Some materials instead ship a dedicated roughness
    // or ORM map (roughness in red). Detect which so we read the correct channel
    // rather than mistaking a normal map's RGB for a glTF ORM.
    let normal_roughness_combined = texture_params.iter().any(|param| {
        param
            .get("m_name")
            .and_then(kv3::KvValue::as_string)
            .map(|name| {
                let name = name.to_ascii_lowercase();
                name.contains("normal") && name.contains("rough")
            })
            .unwrap_or(false)
    });
    let dedicated_roughness = find_texture(|name, path| {
        if name.contains("normal") || path.contains("normal") {
            return 0;
        }
        if name.contains("orm") || path.contains("_orm") {
            120
        } else if name.contains("rough") || path.contains("rough") {
            100
        } else {
            0
        }
    });
    let (roughness_texture, roughness_in_alpha) = if let Some(rough) = dedicated_roughness {
        (Some(rough), false)
    } else if normal_roughness_combined {
        (normal_texture.clone(), true)
    } else {
        (None, false)
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
    let alpha_test = named_i64(&data, "m_intParams", "F_ALPHA_TEST").unwrap_or(0) != 0;
    let translucent = named_i64(&data, "m_intParams", "F_TRANSLUCENT").unwrap_or(0) != 0
        || named_i64(&data, "m_intParams", "F_ADVANCED_TRANSLUCENCY").unwrap_or(0) != 0;
    let alpha_mode = if alpha_test {
        vmesh::MaterialAlphaMode::Mask
    } else if translucent {
        vmesh::MaterialAlphaMode::Blend
    } else {
        vmesh::MaterialAlphaMode::Opaque
    };
    let mut base_color_factor = named_vec4(&data, "g_vColorTint")
        .or_else(|| named_vec4(&data, "g_vColorTint1"))
        .unwrap_or([1.0; 4]);
    // VMAT tint vectors use W for shader-specific data; it is not opacity.
    base_color_factor[3] = 1.0;
    // Match ValveResourceFormat: assume non-metallic unless the VMAT declares
    // an explicit metalness float. Deadlock hero "mask" textures do not carry
    // glTF-style metalness in their blue channel, so blindly treating them as an
    // ORM (metalness = 1) produced the oily/chrome skin look.
    let metalness_factor = named_f32(&data, "m_floatParams", "g_flMetalness")
        .unwrap_or(0.0)
        .clamp(0.0, 1.0);
    let self_illum = named_i64(&data, "m_intParams", "F_SELF_ILLUM").unwrap_or(0) != 0;
    let emissive_texture = self_illum.then_some(emissive_texture_candidate).flatten();
    let emissive_factor = self_illum.then_some([
        base_color_factor[0].clamp(0.0, 1.0),
        base_color_factor[1].clamp(0.0, 1.0),
        base_color_factor[2].clamp(0.0, 1.0),
    ]);
    Some(MaterialPreviewProperties {
        color_texture,
        normal_texture,
        roughness_texture,
        roughness_in_alpha,
        occlusion_texture,
        emissive_texture,
        base_color_factor,
        metalness_factor,
        alpha_mode,
        alpha_cutoff: named_f32(&data, "m_floatParams", "g_flAlphaTestReference")
            .or_else(|| named_f32(&data, "m_floatParams", "g_flAlphaTestReference1"))
            .unwrap_or(0.5)
            .clamp(0.0, 1.0),
        emissive_factor,
    })
}

fn decode_texture_preview(
    archive: &VpkArchive,
    texture_path: &str,
    material_path: Option<&str>,
) -> Option<PreviewTexture> {
    let bytes = archive.extract_entry(texture_path).ok()?;
    decode_texture_preview_bytes(
        texture_path.to_string(),
        material_path.map(str::to_string),
        bytes,
    )
}

fn decode_texture_preview_bytes(
    texture_path: String,
    material_path: Option<String>,
    bytes: Vec<u8>,
) -> Option<PreviewTexture> {
    let res = Resource::parse(bytes).ok()?;
    let header = VtexHeader::parse(&res).ok()?;
    let decoded = header.decode_preview(&res.data, 512).ok()?;
    let png = encode_png_bytes(&decoded, 512).ok()?;
    Some(PreviewTexture {
        name: texture_path,
        material: material_path.map(|path| normalize_compiled_path(&path, ".vmat")),
        png,
        normal_png: None,
        orm_png: None,
        emissive_png: None,
        base_color_factor: [1.0; 4],
        metalness_factor: 0.0,
        alpha_mode: vmesh::MaterialAlphaMode::Opaque,
        alpha_cutoff: 0.5,
        emissive_factor: None,
    })
}

fn decode_preview_png_bytes(bytes: Vec<u8>) -> Option<Vec<u8>> {
    let res = Resource::parse(bytes).ok()?;
    let header = VtexHeader::parse(&res).ok()?;
    let decoded = header.decode_preview(&res.data, 512).ok()?;
    encode_png_bytes(&decoded, 512).ok()
}

fn decode_rgba(bytes: Vec<u8>) -> Option<DecodedTexture> {
    let res = Resource::parse(bytes).ok()?;
    let header = VtexHeader::parse(&res).ok()?;
    header.decode_preview(&res.data, 512).ok()
}

/// Nearest-neighbour sample of one channel, coords clamped and scaled from the
/// output (w,h) grid to the texture's own resolution.
fn sample_channel(tex: &DecodedTexture, x: u32, y: u32, w: u32, h: u32, ch: usize) -> u8 {
    let tx = if tex.width == w {
        x
    } else {
        x * tex.width / w.max(1)
    }
    .min(tex.width.saturating_sub(1));
    let ty = if tex.height == h {
        y
    } else {
        y * tex.height / h.max(1)
    }
    .min(tex.height.saturating_sub(1));
    tex.rgba[((ty * tex.width + tx) * 4) as usize + ch]
}

/// Build a glTF ORM texture (R = occlusion, G = roughness, B = 0 metalness).
/// Roughness is taken from the alpha channel of a combined normal+roughness map
/// (Source 2 `g_tNormalRoughness`) or the red channel of a dedicated roughness
/// map — never from the RGB of a normal map, whose blue channel misreads as
/// glTF metalness and caused the oily/chrome look.
fn pack_orm_png(
    roughness: Option<&DecodedTexture>,
    roughness_in_alpha: bool,
    occlusion: Option<&DecodedTexture>,
) -> Option<Vec<u8>> {
    let (w, h) = roughness.or(occlusion).map(|t| (t.width, t.height))?;
    if w == 0 || h == 0 {
        return None;
    }
    let rough_ch = if roughness_in_alpha { 3 } else { 0 };
    let mut rgba = vec![0u8; (w * h * 4) as usize];
    for y in 0..h {
        for x in 0..w {
            let i = ((y * w + x) * 4) as usize;
            let occ = occlusion.map_or(255, |t| sample_channel(t, x, y, w, h, 0));
            // Matte fallback (~0.86 roughness) when a material ships no roughness map.
            let rough = roughness.map_or(220, |t| sample_channel(t, x, y, w, h, rough_ch));
            rgba[i] = occ;
            rgba[i + 1] = rough;
            rgba[i + 2] = 0;
            rgba[i + 3] = 255;
        }
    }
    encode_png_bytes(
        &DecodedTexture {
            width: w,
            height: h,
            rgba,
        },
        512,
    )
    .ok()
}

fn cached_texture_bytes(
    archive: &VpkArchive,
    cache: &mut Vec<(String, Vec<u8>)>,
    texture_path: &str,
) -> Option<Vec<u8>> {
    if let Some((_, bytes)) = cache
        .iter()
        .find(|(path, _)| path.eq_ignore_ascii_case(texture_path))
    {
        return Some(bytes.clone());
    }
    let bytes = archive.extract_entry(texture_path).ok()?;
    cache.push((texture_path.to_string(), bytes.clone()));
    Some(bytes)
}

fn decode_material_preview_textures(
    archive: &VpkArchive,
    material_paths: &[String],
) -> Vec<PreviewTexture> {
    let mut jobs = Vec::<(
        String,
        String,
        Vec<u8>,
        Option<Vec<u8>>,
        Option<Vec<u8>>,
        Option<Vec<u8>>,
        Option<Vec<u8>>,
        MaterialPreviewProperties,
    )>::new();
    let mut raw_cache = Vec::<(String, Vec<u8>)>::new();
    // These are the mesh's actual drawcall materials, so the count is naturally
    // bounded; cap only to guard against pathological models.
    for material_path in material_paths.iter().take(64) {
        let Some(properties) = material_preview_properties(archive, material_path) else {
            continue;
        };
        let texture_path = properties.color_texture.clone();
        if !archive.contains_entry(&texture_path) {
            continue;
        }
        let Some(bytes) = cached_texture_bytes(archive, &mut raw_cache, &texture_path) else {
            continue;
        };
        let normal = properties
            .normal_texture
            .as_deref()
            .and_then(|path| cached_texture_bytes(archive, &mut raw_cache, path));
        let roughness = properties
            .roughness_texture
            .as_deref()
            .and_then(|path| cached_texture_bytes(archive, &mut raw_cache, path));
        let occlusion = properties
            .occlusion_texture
            .as_deref()
            .and_then(|path| cached_texture_bytes(archive, &mut raw_cache, path));
        let emissive = properties
            .emissive_texture
            .as_deref()
            .and_then(|path| cached_texture_bytes(archive, &mut raw_cache, path));
        jobs.push((
            texture_path,
            material_path.clone(),
            bytes,
            normal,
            roughness,
            occlusion,
            emissive,
            properties,
        ));
    }

    thread::scope(|scope| {
        let handles = jobs
            .into_iter()
            .map(
                |(
                    texture_path,
                    material_path,
                    bytes,
                    normal,
                    roughness,
                    occlusion,
                    emissive,
                    properties,
                )| {
                    scope.spawn(move || {
                        let mut texture =
                            decode_texture_preview_bytes(texture_path, Some(material_path), bytes)?;
                        texture.normal_png = normal.and_then(decode_preview_png_bytes);
                        let roughness_tex = roughness.and_then(decode_rgba);
                        let occlusion_tex = occlusion.and_then(decode_rgba);
                        texture.orm_png = if roughness_tex.is_some() || occlusion_tex.is_some() {
                            pack_orm_png(
                                roughness_tex.as_ref(),
                                properties.roughness_in_alpha,
                                occlusion_tex.as_ref(),
                            )
                        } else {
                            None
                        };
                        texture.emissive_png = emissive.and_then(decode_preview_png_bytes);
                        texture.base_color_factor = properties.base_color_factor;
                        texture.metalness_factor = properties.metalness_factor;
                        texture.alpha_mode = properties.alpha_mode;
                        texture.alpha_cutoff = properties.alpha_cutoff;
                        texture.emissive_factor = properties.emissive_factor;
                        Some(texture)
                    })
                },
            )
            .collect::<Vec<_>>();

        handles
            .into_iter()
            .filter_map(|handle| handle.join().ok().flatten())
            .collect()
    })
}

fn decode_fallback_preview_textures(
    archive: &VpkArchive,
    model_entry_path: &str,
) -> Vec<PreviewTexture> {
    let mut texture_paths = archive
        .list_entries()
        .into_iter()
        .filter_map(|entry| {
            let score = texture_candidate_score(model_entry_path, &entry);
            (score > 0).then_some((score, entry))
        })
        .collect::<Vec<_>>();
    texture_paths.sort_by(|(left_score, left_path), (right_score, right_path)| {
        right_score
            .cmp(left_score)
            .then_with(|| left_path.cmp(right_path))
    });

    texture_paths
        .into_iter()
        .take(4)
        .filter_map(|(_, texture_path)| decode_texture_preview(archive, &texture_path, None))
        .collect()
}

fn candidate_material_paths(archive: &VpkArchive, model_entry_path: &str) -> Vec<String> {
    let model_lower = model_entry_path.to_ascii_lowercase();
    let hero_token = model_lower
        .split('/')
        .filter(|part| !part.is_empty())
        .rev()
        .find(|part| {
            !part.ends_with(".vmdl_c")
                && !part.ends_with(".vmesh_c")
                && *part != "models"
                && !part.starts_with("heroes")
        })
        .unwrap_or("");

    let mut candidates = archive
        .list_entries()
        .into_iter()
        .filter(|entry| {
            let lower = entry.to_ascii_lowercase();
            lower.ends_with(".vmat_c")
                && lower.contains("materials/")
                && (hero_token.is_empty() || lower.contains(hero_token))
        })
        .collect::<Vec<_>>();
    candidates.sort();
    candidates.truncate(16);
    candidates
}

pub(crate) fn decode_preview_textures(
    archive: &VpkArchive,
    model_entry_path: &str,
    material_paths: &[String],
) -> Vec<PreviewTexture> {
    let candidates = if material_paths.is_empty() {
        candidate_material_paths(archive, model_entry_path)
    } else {
        material_paths.to_vec()
    };
    let textures = decode_material_preview_textures(archive, &candidates);
    if textures.is_empty() {
        decode_fallback_preview_textures(archive, model_entry_path)
    } else {
        textures
    }
}
