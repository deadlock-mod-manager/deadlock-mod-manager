//! Material-scoped model edits. Packed channels follow Deadlock's pbr.vfx layout.
//! See LICENSE.vpkmerge for the upstream workshop layout research.
pub mod material;

use crate::{
    error::{Result, VpkManagerError},
    material_repair,
    source2::{
        self, ImageData,
        kv3::{self, Value},
        resource::Resource,
    },
};

fn invalid(message: impl Into<String>) -> VpkManagerError {
    VpkManagerError::Invalid(message.into())
}
fn array<'a>(value: &'a Value, name: &str) -> &'a [Value] {
    value.get(name).and_then(Value::as_array).unwrap_or(&[])
}
fn flag(value: &Value, name: &str) -> bool {
    array(value, "m_intParams").iter().any(|p| {
        p.get("m_name").and_then(Value::as_str) == Some(name)
            && p.get("m_nValue")
                .and_then(Value::as_int)
                .is_some_and(|v| v != 0)
    })
}
pub struct MaterialLayout {
    pub color: Option<(String, String)>,
    pub roughness: Option<(String, String, usize)>,
    pub metalness: Option<(String, String, usize)>,
    pub pbr: bool,
    pub finishable: bool,
}

pub fn material_layout(bytes: &[u8]) -> Result<MaterialLayout> {
    let (tree, _, _) = material_repair::decode(bytes).map_err(|e| invalid(e.to_string()))?;
    let pbr = tree.get("m_shaderName").and_then(Value::as_str) == Some("pbr.vfx");
    let texture = |slots: &[&str]| {
        slots.iter().find_map(|slot| {
            let matches: Vec<_> = array(&tree, "m_textureParams")
                .iter()
                .filter(|p| p.get("m_name").and_then(Value::as_str) == Some(*slot))
                .collect();
            let [entry] = matches.as_slice() else {
                return None;
            };
            Some((
                (*slot).to_owned(),
                entry.get("m_pValue")?.as_str()?.to_owned(),
            ))
        })
    };
    let color = texture(&["g_tColor", "g_tColorA", "g_tBaseColor", "g_tAlbedo"]);
    let roughness = texture(&["g_tRoughness", "g_tRoughness1"])
        .map(|(slot, path)| (slot, path, 0))
        .or_else(|| texture(&["g_tNormalRoughness"]).map(|(slot, path)| (slot, path, 2)));
    let transparent = [
        "F_ALPHA_TEST",
        "F_TRANSLUCENT",
        "F_ADVANCED_TRANSLUCENCY",
        "F_ADDITIVE_BLEND",
        "F_UNLIT",
        "F_BLEND_MODE",
    ]
    .iter()
    .any(|name| flag(&tree, name));
    let metalness = if transparent {
        texture(&["g_tMetalness", "g_tMetalnessMask"]).map(|(slot, path)| (slot, path, 0))
    } else {
        color.clone().map(|(slot, path)| (slot, path, 3))
    };
    let dynamic_finish = array(&tree, "m_dynamicParams").iter().any(|p| {
        p.get("m_name")
            .and_then(Value::as_str)
            .is_some_and(|name| name.contains("Roughness") || name.contains("Metalness"))
    });
    Ok(MaterialLayout {
        color,
        roughness,
        metalness,
        pbr,
        finishable: pbr && !dynamic_finish,
    })
}

/// Neutralize matching embedded draws without rewriting vertex buffers, flags or animation blocks.
pub fn hide_materials(bytes: &[u8], materials: &[String]) -> Result<Vec<u8>> {
    if materials.is_empty() {
        return Ok(bytes.to_vec());
    }
    let original = Resource::parse(bytes).map_err(|e| invalid(e.to_string()))?;
    let mut output = bytes.to_vec();
    let mut found = std::collections::BTreeSet::new();
    let mut visible = 0;
    for (index, block) in original.blocks().iter().enumerate() {
        if block.kind != *b"MDAT" {
            continue;
        }
        let data = original
            .get_block_by_index(index)
            .ok_or_else(|| invalid("Missing mesh block"))?;
        let tree = kv3::decode(data).map_err(|e| invalid(e.to_string()))?;
        let mut targets = Vec::new();
        for (scene_index, scene) in array(&tree, "m_sceneObjects").iter().enumerate() {
            for (draw_index, draw) in array(scene, "m_drawCalls").iter().enumerate() {
                if draw
                    .get("m_nIndexCount")
                    .and_then(Value::as_uint)
                    .unwrap_or(0)
                    == 0
                {
                    continue;
                }
                let name = draw
                    .get("m_material")
                    .or_else(|| draw.get("m_pMaterial"))
                    .and_then(Value::as_str)
                    .unwrap_or("");
                if let Some(target) = materials
                    .iter()
                    .find(|target| target.eq_ignore_ascii_case(name.trim_end_matches("_c")))
                {
                    targets.push((scene_index, draw_index));
                    found.insert(target.clone());
                } else {
                    visible += 1;
                }
            }
        }
        if !targets.is_empty() {
            let edits: Vec<_> = targets
                .iter()
                .map(|(scene, draw)| {
                    (
                        vec![
                            kv3::Seg::Key("m_sceneObjects".into()),
                            kv3::Seg::Index(*scene),
                            kv3::Seg::Key("m_drawCalls".into()),
                            kv3::Seg::Index(*draw),
                            kv3::Seg::Key("m_nIndexCount".into()),
                        ],
                        0,
                    )
                })
                .collect();
            let edited = kv3::set_scalars(data, &edits).map_err(|e| invalid(e.to_string()))?;
            output = Resource::parse(&output)
                .and_then(|r| r.rebuild_with_block_preserving(index, &edited))
                .map_err(|e| invalid(e.to_string()))?;
        }
    }
    if found.len() != materials.len() || visible == 0 {
        return Err(invalid(
            "Hidden materials must match embedded draws and leave at least one part visible",
        ));
    }
    Ok(output)
}

#[derive(Clone, Copy, Default)]
pub struct TextureEdit {
    /// Linear RGB multiplier; authoring color pickers must convert from sRGB.
    pub tint: Option<[f64; 3]>,
    /// Absolute hue in degrees, saturation and brightness multipliers (linear RGB HSV).
    pub recolor: Option<[f64; 3]>,
    pub channels: [Option<f64>; 4],
    pub pattern: Option<crate::pattern::Pattern>,
}
fn linear(value: f64) -> f64 {
    if value <= 0.04045 {
        value / 12.92
    } else {
        ((value + 0.055) / 1.055).powf(2.4)
    }
}
fn srgb(value: f64) -> f64 {
    if value <= 0.0031308 {
        value * 12.92
    } else {
        1.055 * value.powf(1.0 / 2.4) - 0.055
    }
}
fn byte(value: f64) -> u8 {
    (value.clamp(0., 1.) * 255.).round() as u8
}
fn paint(rgb: [f64; 3], [hue, saturation, brightness]: [f64; 3]) -> [f64; 3] {
    let peak = rgb.into_iter().fold(0., f64::max);
    let low = rgb.into_iter().fold(1., f64::min);
    let sat = if peak == 0. { 0. } else { (peak - low) / peak };
    if sat < 0.08 {
        return rgb.map(|v| (v * brightness).clamp(0., 1.));
    }
    let value = (peak * brightness).clamp(0., 1.);
    let chroma = value * (sat * saturation).clamp(0., 1.);
    let sector = hue.rem_euclid(360.) / 60.;
    let x = chroma * (1. - (sector.rem_euclid(2.) - 1.).abs());
    let c = match sector as u32 {
        0 => [chroma, x, 0.],
        1 => [x, chroma, 0.],
        2 => [0., chroma, x],
        3 => [0., x, chroma],
        4 => [x, 0., chroma],
        _ => [chroma, 0., x],
    };
    c.map(|v| v + value - chroma)
}
pub fn texture_editable(bytes: &[u8]) -> bool {
    use source2::texture::format::{TextureFlags, TextureFormat};
    source2::inspect(bytes).is_ok_and(|info| {
        u64::from(info.width) * u64::from(info.height) <= 16 * 1024 * 1024
            && info.depth == 1
            && !info.ycocg
            && !info.flags.contains(TextureFlags::CUBE_TEXTURE)
            && matches!(
                info.format,
                TextureFormat::Rgba8888
                    | TextureFormat::Bgra8888
                    | TextureFormat::Dxt1
                    | TextureFormat::Dxt5
                    | TextureFormat::Ati1n
                    | TextureFormat::Ati2n
                    | TextureFormat::Bc7
                    | TextureFormat::PngRgba8888
            )
    })
}

pub fn edit_texture(bytes: &[u8], edit: TextureEdit) -> Result<Vec<u8>> {
    edit_texture_with_image(bytes, edit, None)
}

/// Apply appearance edits to an optional, already-painted LDR base image.
pub fn edit_texture_with_image(
    bytes: &[u8],
    edit: TextureEdit,
    replacement: Option<source2::Image>,
) -> Result<Vec<u8>> {
    if edit
        .tint
        .is_some_and(|v| v.iter().any(|v| !v.is_finite() || !(0.0..=1.0).contains(v)))
        || edit
            .channels
            .iter()
            .flatten()
            .any(|v| !v.is_finite() || !(0.0..=1.0).contains(v))
        || edit.recolor.is_some_and(|[h, s, b]| {
            !h.is_finite()
                || !s.is_finite()
                || !b.is_finite()
                || !(0.0..=360.0).contains(&h)
                || !(0.0..=2.0).contains(&s)
                || !(0.0..=2.0).contains(&b)
        })
    {
        return Err(invalid("Invalid model texture edit"));
    }
    if !texture_editable(bytes) {
        return Err(invalid(
            "Model editing supports LDR 2D textures up to 16 megapixels; HDR, YCoCg and cubemaps are not editable",
        ));
    }
    let info = source2::inspect(bytes)?;
    let mut image = match replacement {
        Some(image) => image,
        None => source2::decode(bytes)?,
    };
    if image.width == 0
        || image.height == 0
        || u64::from(image.width) * u64::from(image.height) > 16 * 1024 * 1024
        || !matches!(&image.data, ImageData::Rgba8(pixels) if pixels.len() as u64 == u64::from(image.width) * u64::from(image.height) * 4)
    {
        return Err(invalid("Invalid painted texture dimensions or pixels"));
    }
    let expand_pattern = edit.pattern.is_some() && (image.width < 128 || image.height < 128);
    let expanded = expand_pattern
        || image.width != u32::from(info.width)
        || image.height != u32::from(info.height);
    if expand_pattern {
        let ImageData::Rgba8(pixels) = &image.data else {
            return Err(invalid("LDR required"));
        };
        let buffer = image::RgbaImage::from_raw(image.width, image.height, pixels.clone())
            .ok_or_else(|| invalid("Invalid pattern input"))?;
        let resized =
            image::imageops::resize(&buffer, 256, 256, image::imageops::FilterType::Nearest);
        image = source2::Image {
            width: 256,
            height: 256,
            data: ImageData::Rgba8(resized.into_raw()),
        };
    }
    if let Some(pattern) = edit.pattern {
        crate::pattern::paint_image(&mut image, pattern)?;
    }
    let ImageData::Rgba8(pixels) = &mut image.data else {
        return Err(invalid("Model editing supports LDR textures only"));
    };
    for pixel in pixels.chunks_exact_mut(4) {
        if edit.tint.is_some() || edit.recolor.is_some() {
            let mut rgb = [pixel[0], pixel[1], pixel[2]].map(|v| linear(f64::from(v) / 255.));
            if let Some(recolor) = edit.recolor {
                rgb = paint(rgb, recolor);
            }
            if let Some(tint) = edit.tint {
                rgb = std::array::from_fn(|i| rgb[i] * tint[i]);
            }
            for i in 0..3 {
                pixel[i] = byte(srgb(rgb[i]));
            }
        }
        for (channel, value) in edit.channels.iter().enumerate() {
            if let Some(value) = value {
                pixel[channel] = byte(*value);
            }
        }
    }
    if expanded {
        return source2::texture::encode_vtex_png_rgba8888(&image, info.flags)
            .map_err(|e| invalid(e.to_string()));
    }
    if info.format == source2::texture::format::TextureFormat::PngRgba8888 {
        let resource = Resource::parse(bytes).map_err(|e| invalid(e.to_string()))?;
        let payload = source2::encode_image(&image, info.format)?;
        let blocks = resource
            .blocks()
            .iter()
            .enumerate()
            .map(|(i, b)| {
                resource
                    .get_block_by_index(i)
                    .map(|data| (b.kind, data))
                    .ok_or_else(|| invalid("Missing texture block"))
            })
            .collect::<Result<Vec<_>>>()?;
        return source2::resource::build_resource_with_tail(
            &blocks,
            &payload,
            u16::from_le_bytes([bytes[6], bytes[7]]),
        )
        .map_err(|e| invalid(e.to_string()));
    }
    Ok(source2::edit::replace_mip_chain(bytes, &image)?)
}

#[cfg(test)]
mod tests;
