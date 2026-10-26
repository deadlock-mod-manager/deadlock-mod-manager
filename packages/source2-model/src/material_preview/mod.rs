mod properties;
mod textures;

use std::sync::Arc;
use std::thread;

use crate::vpk_extract::VpkArchive;
use crate::{PreviewTexture, Resource, texture_candidate_score, vmesh};
pub use properties::material_color_texture;
use properties::{MaterialPreviewProperties, material_preview_properties};
use textures::{
    bake_self_illum_png, decode_normal_png, decode_rgba, decode_texture_preview,
    decode_texture_preview_resource, pack_orm_png, preview_resource,
};

const PREVIEW_WORKERS: usize = 4;

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

fn cached_texture_resource(
    archive: &VpkArchive,
    cache: &mut Vec<(String, Arc<Resource>)>,
    texture_path: &str,
) -> Option<Arc<Resource>> {
    if let Some((_, resource)) = cache
        .iter()
        .find(|(path, _)| path.eq_ignore_ascii_case(texture_path))
    {
        return Some(Arc::clone(resource));
    }
    let bytes = archive.extract_entry(texture_path).ok()?;
    let resource = Arc::new(preview_resource(bytes)?);
    cache.push((texture_path.to_string(), Arc::clone(&resource)));
    Some(resource)
}

fn decode_material_preview_textures(
    archive: &VpkArchive,
    material_paths: &[String],
) -> Vec<PreviewTexture> {
    let materials = material_paths.iter().filter_map(|path| {
        material_preview_properties(archive, path).map(|properties| (path.clone(), properties))
    });
    decode_material_previews(archive, materials)
}

fn decode_material_previews(
    archive: &VpkArchive,
    materials: impl Iterator<Item = (String, MaterialPreviewProperties)>,
) -> Vec<PreviewTexture> {
    let mut materials = materials.peekable();
    let mut textures = Vec::new();
    while materials.peek().is_some() {
        let batch = thread::scope(|scope| {
            let mut raw_cache = Vec::new();
            let mut handles = Vec::new();
            for (material_path, properties) in materials.by_ref().take(PREVIEW_WORKERS) {
                let texture_path = properties.color_texture.clone();
                let Some(resource) =
                    cached_texture_resource(archive, &mut raw_cache, &texture_path)
                else {
                    continue;
                };
                let mut load = |path: Option<&str>| {
                    path.and_then(|path| cached_texture_resource(archive, &mut raw_cache, path))
                };
                let normal = load(properties.normal_texture.as_deref());
                let roughness = load(properties.roughness_texture.as_deref());
                let occlusion = load(properties.occlusion_texture.as_deref());
                let emissive = load(properties.emissive_texture.as_deref());
                let metalness = load(properties.metalness_texture.as_deref());
                handles.push(scope.spawn(move || {
                    let albedo = emissive.is_some().then(|| decode_rgba(&resource)).flatten();
                    let mut texture = decode_texture_preview_resource(
                        texture_path,
                        Some(material_path),
                        &resource,
                        matches!(properties.alpha_mode, vmesh::MaterialAlphaMode::Opaque),
                    )?;
                    texture.normal_png = normal.and_then(|resource| {
                        decode_normal_png(&resource, properties.hemi_oct_normal)
                    });
                    let roughness_tex = roughness.and_then(|resource| decode_rgba(&resource));
                    let occlusion_tex = occlusion.and_then(|resource| decode_rgba(&resource));
                    let metalness_tex = metalness.and_then(|resource| decode_rgba(&resource));
                    texture.orm_png = pack_orm_png(
                        roughness_tex.as_ref(),
                        properties.roughness_channel,
                        occlusion_tex.as_ref(),
                        metalness_tex.as_ref(),
                        properties.metalness_channel,
                    );
                    texture.metalness_factor =
                        if metalness_tex.is_some() && texture.orm_png.is_some() {
                            1.0
                        } else {
                            properties.metalness_factor
                        };
                    // Drop decoded ORM inputs before allocating the emissive mask and output.
                    drop((roughness_tex, occlusion_tex, metalness_tex));
                    texture.emissive_png = emissive
                        .and_then(|resource| decode_rgba(&resource))
                        .and_then(|mask| {
                            bake_self_illum_png(
                                &mask,
                                albedo.as_ref(),
                                properties.self_illum_albedo_factor,
                            )
                        });
                    texture.vertex_color = properties.vertex_color;
                    texture.double_sided = properties.double_sided;
                    texture.base_color_factor = properties.base_color_factor;
                    texture.alpha_mode = properties.alpha_mode;
                    texture.alpha_cutoff = properties.alpha_cutoff;
                    let has_mask = texture.emissive_png.is_some();
                    texture.emissive_factor = properties.emissive_factor.filter(|_| has_mask);
                    texture.emissive_strength = if has_mask {
                        properties.emissive_strength
                    } else {
                        1.0
                    };
                    texture.outline = properties.outline;
                    Some(texture)
                }));
            }
            handles
                .into_iter()
                .filter_map(|handle| handle.join().ok().flatten())
                .collect::<Vec<_>>()
        });
        textures.extend(batch);
    }
    textures
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

#[cfg(test)]
mod tests;
