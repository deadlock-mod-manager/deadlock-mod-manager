//! Decoder for Source 2 compiled assets used by the Mod Foundry.
//!
//! The first slice targets textures (`.vtex_c`): extract an entry from a VPK,
//! parse the resource block table, decode the top mip to RGBA8, and encode PNG.

pub mod error;
pub mod kv3;
pub mod resource;
pub mod vmesh;
pub mod vpk_extract;
pub mod vtex;

use std::io::Cursor;
use std::path::Path;
use std::thread;

use image::codecs::png::PngEncoder;
use image::imageops::FilterType;
use image::{ExtendedColorType, ImageBuffer, ImageEncoder, Rgba};

pub use error::{Result, Source2Error};
pub use resource::Resource;
pub use vmesh::{ModelGlb, PreviewTexture};
use vpk_extract::VpkArchive;
pub use vtex::{DecodedTexture, VtexFormat, VtexHeader};

/// A decoded texture ready to hand to the UI.
pub struct TexturePng {
    pub width: u32,
    pub height: u32,
    pub png: Vec<u8>,
}

fn texture_candidate_score(model_entry_path: &str, texture_path: &str) -> i32 {
    let model_lower = model_entry_path.to_ascii_lowercase();
    let texture_lower = texture_path.to_ascii_lowercase();
    if !texture_lower.ends_with(".vtex_c") {
        return i32::MIN;
    }
    if texture_lower.contains("panorama/")
        || texture_lower.contains("hero_card")
        || texture_lower.contains("_card")
        || texture_lower.contains("selection")
    {
        return i32::MIN;
    }

    let mut score = 0;
    if let Some((model_dir, _)) = model_lower.rsplit_once('/')
        && !model_dir.is_empty()
    {
        if texture_lower.starts_with(model_dir) || texture_lower.contains(model_dir) {
            score += 100;
        }
        if let Some(hero_dir) = model_dir.rsplit('/').next()
            && texture_lower.contains(hero_dir)
        {
            score += 40;
        }
    }
    if texture_lower.contains("/materials/") {
        score += 30;
    }
    if texture_lower.contains("color") || texture_lower.contains("albedo") {
        score += 120;
    }
    if texture_lower.contains("body") || texture_lower.contains("torso") {
        score += 20;
    }
    if texture_lower.contains("normal")
        || texture_lower.contains("rough")
        || texture_lower.contains("mask")
        || texture_lower.contains("ambient")
        || texture_lower.contains("_ao")
        || texture_lower.contains("illum")
        || texture_lower.contains("gradient")
    {
        score -= 160;
    }
    score
}

fn encode_png_bytes(decoded: &DecodedTexture, max_side: u32) -> Result<Vec<u8>> {
    let (width, height, rgba) = if decoded.width > max_side || decoded.height > max_side {
        let image: ImageBuffer<Rgba<u8>, Vec<u8>> =
            ImageBuffer::from_raw(decoded.width, decoded.height, decoded.rgba.clone())
                .ok_or_else(|| Source2Error::Decode("invalid decoded texture dimensions".into()))?;
        let scale = (max_side as f32 / decoded.width.max(decoded.height) as f32).min(1.0);
        let target_width = ((decoded.width as f32 * scale).round() as u32).max(1);
        let target_height = ((decoded.height as f32 * scale).round() as u32).max(1);
        let resized =
            image::imageops::resize(&image, target_width, target_height, FilterType::Triangle);
        (target_width, target_height, resized.into_raw())
    } else {
        (decoded.width, decoded.height, decoded.rgba.clone())
    };

    let mut png = Vec::new();
    PngEncoder::new(Cursor::new(&mut png)).write_image(
        &rgba,
        width,
        height,
        ExtendedColorType::Rgba8,
    )?;
    Ok(png)
}

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

fn material_color_texture(archive: &VpkArchive, material_path: &str) -> Option<String> {
    let material_path = normalize_compiled_path(material_path, ".vmat");
    let bytes = archive.extract_entry(&material_path).ok()?;
    let res = Resource::parse(bytes).ok()?;
    let data = res
        .block_bytes("DATA")
        .and_then(|bytes| kv3::parse(bytes).ok())?;
    let texture_params = data.get("m_textureParams")?.as_array()?;

    texture_params
        .into_iter()
        .filter_map(|param| {
            let name = param.get("m_name")?.as_string()?;
            let path = param.get("m_pValue")?.as_string()?;
            let score = texture_param_score(name, path);
            (score > 0).then_some((score, normalize_compiled_path(path, ".vtex")))
        })
        .max_by_key(|(score, _)| *score)
        .map(|(_, path)| path)
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
    })
}

fn decode_material_preview_textures(
    archive: &VpkArchive,
    material_paths: &[String],
) -> Vec<PreviewTexture> {
    let mut jobs = Vec::<(String, String, Vec<u8>)>::new();
    let mut raw_cache = Vec::<(String, Vec<u8>)>::new();
    for material_path in material_paths.iter().take(16) {
        let Some(texture_path) = material_color_texture(archive, material_path) else {
            continue;
        };
        if !archive.contains_entry(&texture_path) {
            continue;
        }
        let bytes = if let Some((_, bytes)) = raw_cache
            .iter()
            .find(|(path, _)| path.eq_ignore_ascii_case(&texture_path))
        {
            bytes.clone()
        } else {
            let Ok(bytes) = archive.extract_entry(&texture_path) else {
                continue;
            };
            raw_cache.push((texture_path.clone(), bytes.clone()));
            bytes
        };
        jobs.push((texture_path, material_path.clone(), bytes));
    }

    thread::scope(|scope| {
        let handles = jobs
            .into_iter()
            .map(|(texture_path, material_path, bytes)| {
                scope.spawn(move || {
                    decode_texture_preview_bytes(texture_path, Some(material_path), bytes)
                })
            })
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

fn decode_preview_textures(
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

/// Decode a `.vtex_c` entry inside a VPK to a PNG.
pub fn decode_texture_png(vpk_path: &Path, entry_path: &str) -> Result<TexturePng> {
    let bytes = vpk_extract::extract_entry(vpk_path, entry_path)?;
    let res = Resource::parse(bytes)?;
    let header = VtexHeader::parse(&res)?;
    let decoded = header.decode(&res.data)?;
    encode_png(&decoded)
}

/// Decode a `.vmesh_c` entry inside a VPK to a binary GLB for the live preview.
pub fn decode_mesh_glb(vpk_path: &Path, entry_path: &str) -> Result<ModelGlb> {
    let archive = VpkArchive::open(vpk_path)?;
    decode_mesh_glb_from_archive(&archive, entry_path)
}

fn decode_mesh_glb_from_archive(archive: &VpkArchive, entry_path: &str) -> Result<ModelGlb> {
    let bytes = archive.extract_entry(entry_path)?;
    let res = Resource::parse(bytes)?;
    let material_paths = vmesh::referenced_materials(&res);
    let preview_textures = decode_preview_textures(archive, entry_path, &material_paths);
    vmesh::decode_mesh_glb_from_resource(&res, &preview_textures)
}

/// Decode a `.vmesh_c`, or resolve the first referenced mesh from a `.vmdl_c`.
pub fn decode_model_glb(vpk_path: &Path, entry_path: &str) -> Result<ModelGlb> {
    let archive = VpkArchive::open(vpk_path)?;
    decode_model_glb_from_archive(&archive, entry_path)
}

fn decode_model_glb_from_archive(archive: &VpkArchive, entry_path: &str) -> Result<ModelGlb> {
    if entry_path.ends_with(".vmesh_c") {
        return decode_mesh_glb_from_archive(archive, entry_path);
    }

    let bytes = archive.extract_entry(entry_path)?;
    let res = Resource::parse(bytes)?;
    if let Some(mesh_path) = vmesh::referenced_meshes(&res)?.into_iter().next() {
        return decode_mesh_glb_from_archive(archive, &mesh_path);
    }
    let material_paths = vmesh::referenced_materials(&res);
    let preview_textures = decode_preview_textures(archive, entry_path, &material_paths);
    vmesh::decode_embedded_model_glb_from_resource(&res, &preview_textures)
}

/// Parse only the texture header (dimensions / format / mips) without decoding.
pub fn inspect_texture(vpk_path: &Path, entry_path: &str) -> Result<(u32, u32, String)> {
    let bytes = vpk_extract::extract_entry(vpk_path, entry_path)?;
    let res = Resource::parse(bytes)?;
    let header = VtexHeader::parse(&res)?;
    Ok((
        header.width as u32,
        header.height as u32,
        format!("{:?}", header.format),
    ))
}

fn encode_png(decoded: &DecodedTexture) -> Result<TexturePng> {
    let png = encode_png_bytes(decoded, u32::MAX)?;
    Ok(TexturePng {
        width: decoded.width,
        height: decoded.height,
        png,
    })
}
