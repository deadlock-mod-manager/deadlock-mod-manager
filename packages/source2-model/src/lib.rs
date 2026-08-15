//! Decoder for the Source 2 compiled assets the Mod Foundry previews.
//!
//! Scope is deliberately narrow, and read-only: character models
//! (`.vmdl_c` / `.vmesh_c`) and the materials and textures they reference.
//! Animation, particle and physics decoding are intentionally not part of this
//! crate — the Foundry previews a static character model only — and the write
//! side (recolor, replace, pack) lives in `vpkmanager`.
//!
//! Decode and export behavior is adapted from the MIT-licensed
//! [ValveResourceFormat](https://github.com/ValveResourceFormat/ValveResourceFormat)
//! project. The full license text is in `LICENSE-ValveResourceFormat`.

pub mod error;
pub mod kv3;
mod material_preview;
pub mod nm_anim;
pub mod resource;
pub mod skeleton;
pub mod vmesh;
pub mod vpk_extract;
pub mod vtex;

use std::io::Cursor;
use std::path::Path;

use image::codecs::png::PngEncoder;
use image::imageops::FilterType;
use image::{ExtendedColorType, ImageBuffer, ImageEncoder, Rgba};

pub use error::{Result, Source2Error};
use material_preview::decode_preview_textures;
pub use material_preview::material_color_texture;
pub use resource::Resource;
pub use skeleton::{Bone, BoneTransform, Skeleton};
pub use vmesh::{ModelGlb, PreviewTexture, RenderMaterial, RenderModel, RenderPrimitive};
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

/// Decode a `.vtex_c` entry inside a VPK to a PNG.
pub fn decode_texture_png(vpk_path: &Path, entry_path: &str) -> Result<TexturePng> {
    let bytes = vpk_extract::extract_entry(vpk_path, entry_path)?;
    decode_texture_png_bytes(bytes)
}

/// Decode a `.vtex_c` file that is already available as raw bytes to a PNG.
pub fn decode_texture_png_bytes(bytes: Vec<u8>) -> Result<TexturePng> {
    let res = Resource::parse(bytes)?;
    let header = VtexHeader::parse(&res)?;
    let decoded = header.decode(&res.data)?;
    encode_png(&decoded)
}

/// Decode a standalone `.vtex_c` file on disk to a PNG.
pub fn decode_texture_file(path: &Path) -> Result<TexturePng> {
    decode_texture_png_bytes(std::fs::read(path)?)
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

/// Decode a `.vmesh_c`, or assemble every mesh a `.vmdl_c` references, into one
/// GLB. A model's meshes are separate resources sharing the model's skeleton, so
/// the whole character is stitched together here rather than previewing a part.
pub fn decode_model_glb(vpk_path: &Path, entry_path: &str) -> Result<ModelGlb> {
    let archive = VpkArchive::open(vpk_path)?;
    decode_model_glb_from_archive(&archive, entry_path)
}

/// Decode a model with an unpacked workspace tree shadowing the archive, so the
/// preview shows the user's edited textures rather than the packed originals.
pub fn decode_model_glb_with_overlay(
    vpk_path: &Path,
    entry_path: &str,
    overlay_dir: Option<&Path>,
) -> Result<ModelGlb> {
    let archive = VpkArchive::open_with_overlay(vpk_path, overlay_dir)?;
    decode_model_glb_from_archive(&archive, entry_path)
}

pub fn decode_model_glb_from_archive(archive: &VpkArchive, entry_path: &str) -> Result<ModelGlb> {
    if entry_path.ends_with(".vmesh_c") {
        return decode_mesh_glb_from_archive(archive, entry_path);
    }

    let bytes = archive.extract_entry(entry_path)?;
    let res = Resource::parse(bytes)?;
    let mesh_paths = vmesh::referenced_meshes(&res)?;
    if !mesh_paths.is_empty() {
        let skeleton = skeleton::parse_model_skeleton(&res)?;
        let mut primitives = Vec::new();
        let mut preview_textures = Vec::new();
        for (mesh_index, mesh_path) in mesh_paths.into_iter().enumerate() {
            let mesh_bytes = archive.extract_entry(&mesh_path)?;
            let mesh_res = Resource::parse(mesh_bytes)?;
            let material_paths = vmesh::referenced_materials(&mesh_res);
            let mesh_textures = decode_preview_textures(archive, &mesh_path, &material_paths);
            let material_offset = preview_textures.len();
            let bone_remap = vmesh::model_mesh_bone_remap(&res, mesh_index)?;
            let mut mesh_primitives = vmesh::decode_mesh_primitives_from_resource(
                &mesh_res,
                &mesh_textures,
                bone_remap.as_deref(),
            )?;
            for primitive in &mut mesh_primitives {
                if primitive.material > 0 {
                    primitive.material += material_offset;
                }
            }
            primitives.append(&mut mesh_primitives);
            preview_textures.extend(mesh_textures);
        }
        return vmesh::model_from_decoded_primitives(
            &primitives,
            &preview_textures,
            skeleton.as_ref(),
        );
    }
    let material_paths = vmesh::referenced_materials(&res);
    let preview_textures = decode_preview_textures(archive, entry_path, &material_paths);
    vmesh::decode_embedded_model_glb_from_resource(&res, &preview_textures)
}

/// Decode a `.vmesh_c`, or resolve a `.vmdl_c`, into renderer-friendly mesh data.
pub fn decode_model_render_model(vpk_path: &Path, entry_path: &str) -> Result<RenderModel> {
    let archive = VpkArchive::open(vpk_path)?;
    decode_model_render_model_from_archive(&archive, entry_path)
}

fn decode_model_render_model_from_archive(
    archive: &VpkArchive,
    entry_path: &str,
) -> Result<RenderModel> {
    if entry_path.ends_with(".vmesh_c") {
        let bytes = archive.extract_entry(entry_path)?;
        let res = Resource::parse(bytes)?;
        let skeleton = skeleton::parse_model_skeleton(&res)?;
        let material_paths = vmesh::referenced_materials(&res);
        let preview_textures = decode_preview_textures(archive, entry_path, &material_paths);
        return vmesh::decode_mesh_render_model_from_resource_with_skeleton(
            &res,
            skeleton,
            &preview_textures,
            None,
        );
    }

    let bytes = archive.extract_entry(entry_path)?;
    let res = Resource::parse(bytes)?;
    let mesh_paths = vmesh::referenced_meshes(&res)?;
    if !mesh_paths.is_empty() {
        let skeleton = skeleton::parse_model_skeleton(&res)?;
        let mesh_groups = vmesh::default_mesh_group_masks(&res);
        let default_mesh_group_mask = mesh_groups
            .as_ref()
            .map_or(u64::MAX, |(mask, _)| u64::from(*mask));
        let mut primitives = Vec::new();
        let mut materials = vec![RenderMaterial {
            name: "default".into(),
            base_color_png: None,
            normal_png: None,
            orm_png: None,
            emissive_png: None,
            base_color_factor: [1.0; 4],
            alpha_mode: vmesh::MaterialAlphaMode::Opaque,
            alpha_cutoff: 0.5,
            emissive_factor: None,
        }];
        for (mesh_index, mesh_path) in mesh_paths.into_iter().enumerate() {
            let bone_remap = vmesh::model_mesh_bone_remap(&res, mesh_index)?;
            let mesh_bytes = archive.extract_entry(&mesh_path)?;
            let mesh_res = Resource::parse(mesh_bytes)?;
            let material_paths = vmesh::referenced_materials(&mesh_res);
            let preview_textures = decode_preview_textures(archive, &mesh_path, &material_paths);
            let material_offset = materials.len().saturating_sub(1);
            let mut render_model = vmesh::decode_mesh_render_model_from_resource_with_skeleton(
                &mesh_res,
                None,
                &preview_textures,
                bone_remap.as_deref(),
            )?;
            for primitive in &mut render_model.primitives {
                if primitive.material > 0 {
                    primitive.material += material_offset;
                }
                primitive.mesh_group_mask = mesh_groups
                    .as_ref()
                    .and_then(|(_, masks)| masks.get(mesh_index))
                    .map_or(u64::MAX, |mask| u64::from(*mask));
            }
            primitives.append(&mut render_model.primitives);
            materials.extend(render_model.materials.into_iter().skip(1));
        }
        return Ok(RenderModel {
            primitives,
            materials,
            skeleton,
            default_mesh_group_mask,
        });
    }

    let material_paths = vmesh::referenced_materials(&res);
    let preview_textures = decode_preview_textures(archive, entry_path, &material_paths);
    vmesh::decode_embedded_model_render_model_from_resource(&res, &preview_textures)
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

/// Load only the model skeleton from a `.vmdl_c`.
pub fn load_model_skeleton(vpk_path: &Path, entry_path: &str) -> Result<Option<Skeleton>> {
    let bytes = vpk_extract::extract_entry(vpk_path, entry_path)?;
    let res = Resource::parse(bytes)?;
    skeleton::parse_model_skeleton(&res)
}

/// The name of the game's neutral standing clip. Every hero has one, and it is
/// the pose Deadlock shows a hero in outside of combat: upright, weapon held in
/// the right hand.
const REST_POSE_CLIP: &str = "weapon_stand_idle";

/// Stand a decoded model in the game's idle rest pose.
///
/// A `.vmdl_c` on its own is in bind pose — arms out, weapon floating wherever
/// its own bind transform puts it — which is not how the hero ever looks. The
/// base game ships the idle as an NM clip beside the model, so the Foundry
/// samples its **first frame only** and bakes those bone transforms into the
/// glTF skeleton. Nothing is played back: this is one still pose, chosen so the
/// weapon sits in the hand and the silhouette reads like the real character.
///
/// Returns the model unchanged when the game isn't installed, the model has no
/// skeleton, or no idle clip resolves — a posed preview is an improvement, not a
/// requirement.
pub fn pose_model_at_rest(
    model: ModelGlb,
    base: &VpkArchive,
    skin: &VpkArchive,
    entry_path: &str,
) -> ModelGlb {
    match try_pose_model_at_rest(&model, base, skin, entry_path) {
        Ok(Some(posed)) => posed,
        Ok(None) => model,
        Err(error) => {
            log::warn!("[source2] Could not apply the rest pose to {entry_path}: {error}");
            model
        }
    }
}

fn skeleton_from_archive(archive: &VpkArchive, entry_path: &str) -> Option<Skeleton> {
    let bytes = archive.extract_entry(entry_path).ok()?;
    let res = Resource::parse(bytes).ok()?;
    skeleton::parse_model_skeleton(&res).ok().flatten()
}

fn try_pose_model_at_rest(
    model: &ModelGlb,
    base: &VpkArchive,
    skin: &VpkArchive,
    entry_path: &str,
) -> Result<Option<ModelGlb>> {
    // The skin's own VPK carries the skeleton when it ships the model; a
    // default-hero load reads it from the base game instead.
    let Some(skeleton) =
        skeleton_from_archive(skin, entry_path).or_else(|| skeleton_from_archive(base, entry_path))
    else {
        return Ok(None);
    };

    // Clips live beside the model in the base pak, never in a skin mod.
    let Some(resolved) =
        nm_anim::resolve_nm_clip_from_archive(base, entry_path, Some(REST_POSE_CLIP), None)?
    else {
        return Ok(None);
    };
    let animation = nm_anim::load_nm_animation_from_archive(base, &resolved.clip_path)?;
    let frame = animation.sample_frame(0)?;
    let mut pose = nm_anim::retarget_nm_pose(&animation, &frame, &skeleton);
    skeleton.pin_procedural_cloth_roots(&mut pose);
    vmesh::pose_model_glb(model, &skeleton, &pose).map(Some)
}

fn encode_png(decoded: &DecodedTexture) -> Result<TexturePng> {
    let png = encode_png_bytes(decoded, u32::MAX)?;
    Ok(TexturePng {
        width: decoded.width,
        height: decoded.height,
        png,
    })
}
