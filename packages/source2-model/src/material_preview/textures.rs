use super::normalize_compiled_path;
use crate::vpk_extract::VpkArchive;
use crate::{
    DecodedTexture, PreviewTexture, Resource, VtexFormat, VtexHeader, encode_png_bytes, vmesh,
};

const PREVIEW_TEXTURE_SIDE: u32 = 1024;

pub(super) fn decode_texture_preview(
    archive: &VpkArchive,
    texture_path: &str,
    material_path: Option<&str>,
) -> Option<PreviewTexture> {
    let resource = preview_resource(archive.extract_entry(texture_path).ok()?)?;
    decode_texture_preview_resource(
        texture_path.to_string(),
        material_path.map(str::to_string),
        &resource,
        true,
    )
}

pub(super) fn decode_texture_preview_resource(
    texture_path: String,
    material_path: Option<String>,
    resource: &Resource,
    opaque: bool,
) -> Option<PreviewTexture> {
    let mut decoded = decode_rgba(resource)?;
    if opaque {
        // Source alpha can hold shader masks. Preserve RGB through browser image
        // decoding instead of exporting those masks as transparency.
        for pixel in decoded.rgba.as_chunks_mut::<4>().0 {
            pixel[3] = 255;
        }
    }
    let png = encode_png_bytes(&decoded, PREVIEW_TEXTURE_SIDE).ok()?;
    Some(PreviewTexture {
        name: texture_path,
        material: material_path.map(|path| normalize_compiled_path(&path, ".vmat")),
        png,
        normal_png: None,
        orm_png: None,
        emissive_png: None,
        vertex_color: false,
        double_sided: false,
        base_color_factor: [1.0; 4],
        metalness_factor: 0.0,
        alpha_mode: vmesh::MaterialAlphaMode::Opaque,
        alpha_cutoff: 0.5,
        emissive_factor: None,
        emissive_strength: 1.0,
        outline: None,
    })
}

pub(super) fn decode_normal_pixel(pixel: [u8; 4], hemi_oct: bool) -> [u8; 4] {
    let red = f32::from(pixel[0]) / 255.0;
    let green = f32::from(pixel[1]) / 255.0;
    let (x, y, z) = if hemi_oct {
        // Source 2's hemi-octahedral packing; the Y flip matches its tangent basis.
        let x = red + green - (256.0 / 255.0);
        let y = red - green;
        let z = 1.0 - x.abs() - y.abs();
        let length = (x * x + y * y + z * z).sqrt().max(f32::EPSILON);
        (x / length, -y / length, z / length)
    } else {
        let x = red * 2.0 - 1.0;
        let y = green * 2.0 - 1.0;
        (x, y, (1.0 - x * x - y * y).max(0.0).sqrt())
    };
    let encode = |value: f32| ((value * 0.5 + 0.5).clamp(0.0, 1.0) * 255.0).round() as u8;
    [encode(x), encode(y), encode(z), 255]
}

pub(super) fn decode_normal_png(resource: &Resource, hemi_oct: bool) -> Option<Vec<u8>> {
    let mut decoded = decode_rgba(resource)?;
    for pixel in decoded.rgba.as_chunks_mut::<4>().0 {
        *pixel = decode_normal_pixel(*pixel, hemi_oct);
    }
    encode_png_bytes(&decoded, PREVIEW_TEXTURE_SIDE).ok()
}

pub(super) fn preview_resource(bytes: Vec<u8>) -> Option<Resource> {
    // Resource::parse reserves the declared block count before checking the table.
    let count = u32::from_le_bytes(bytes.get(12..16)?.try_into().ok()?);
    if count as usize > bytes.len() / 12 {
        return None;
    }
    Resource::parse(bytes).ok()
}

pub(super) fn preview_dimensions(header: &VtexHeader) -> Option<(u32, u32)> {
    // Embedded images and non-2D layouts need their own preview decoding path.
    if matches!(
        header.format,
        VtexFormat::PngRgba8888
            | VtexFormat::JpegRgba8888
            | VtexFormat::PngDxt5
            | VtexFormat::JpegDxt5
    ) || header.num_mip_levels == 0
        || header.num_mip_levels > 16
        || header.width == 0
        || header.height == 0
        || header.depth > 1
        || header.flags & 0x70 != 0
    {
        return None;
    }
    let mut width = u32::from(header.width);
    let mut height = u32::from(header.height);
    // mip_bytes computes sizes for the entire chain with u32 arithmetic for raw RGBA.
    width.checked_mul(height)?.checked_mul(4)?;
    for _ in 1..header.num_mip_levels {
        if width.max(height) <= PREVIEW_TEXTURE_SIDE {
            break;
        }
        width = (width >> 1).max(1);
        height = (height >> 1).max(1);
    }
    Some((width, height))
}

pub(super) fn decode_rgba(resource: &Resource) -> Option<DecodedTexture> {
    let block = resource.block_bytes("DATA")?;
    let extra_count = u32::from_le_bytes(block.get(36..40)?.try_into().ok()?);
    if extra_count as usize > resource.data.len() / 12 {
        return None;
    }
    let header = VtexHeader::parse(resource).ok()?;
    preview_dimensions(&header)?;
    for extra in header.extra.iter().filter(|extra| extra.kind == 4) {
        // The mip decoder reserves this externally supplied count before reading the array.
        let count_at = extra.offset.checked_add(8)?;
        let count = u32::from_le_bytes(resource.data.get(count_at..count_at + 4)?.try_into().ok()?);
        if count > u32::from(header.num_mip_levels) {
            return None;
        }
    }
    header
        .decode_preview(&resource.data, PREVIEW_TEXTURE_SIDE)
        .ok()
}

/// Bake the glTF emissive map for a self-illuminated material.
///
/// Source 2 reads the self-illum mask from its red channel and glows in the
/// albedo blended towards white by `albedo_factor`. Handing the mask over as an
/// RGB texture instead made every masked texel glow red.
pub(super) fn bake_self_illum_png(
    mask: &DecodedTexture,
    albedo: Option<&DecodedTexture>,
    albedo_factor: f32,
) -> Option<Vec<u8>> {
    let (w, h) = albedo.map_or((mask.width, mask.height), |t| (t.width, t.height));
    if w == 0 || h == 0 {
        return None;
    }
    let mut rgba = vec![0u8; (w * h * 4) as usize];
    for y in 0..h {
        for x in 0..w {
            let i = ((y * w + x) * 4) as usize;
            let strength = f32::from(sample_channel(mask, x, y, w, h, 0)) / 255.0;
            for ch in 0..3 {
                let colour = albedo.map_or(1.0, |t| {
                    let albedo = f32::from(sample_channel(t, x, y, w, h, ch)) / 255.0;
                    1.0 + (albedo - 1.0) * albedo_factor
                });
                rgba[i + ch] = (colour * strength * 255.0).round() as u8;
            }
            rgba[i + 3] = 255;
        }
    }
    encode_png_bytes(
        &DecodedTexture {
            width: w,
            height: h,
            rgba,
        },
        PREVIEW_TEXTURE_SIDE,
    )
    .ok()
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

/// Build a glTF ORM texture from each shader-selected channel.
pub(super) fn pack_orm_png(
    roughness: Option<&DecodedTexture>,
    roughness_channel: usize,
    occlusion: Option<&DecodedTexture>,
    metalness: Option<&DecodedTexture>,
    metalness_channel: usize,
) -> Option<Vec<u8>> {
    let (w, h) = roughness
        .or(occlusion)
        .or(metalness)
        .map(|t| (t.width, t.height))?;
    if w == 0 || h == 0 {
        return None;
    }
    let mut rgba = vec![0u8; (w * h * 4) as usize];
    for y in 0..h {
        for x in 0..w {
            let i = ((y * w + x) * 4) as usize;
            let occ = occlusion.map_or(255, |t| sample_channel(t, x, y, w, h, 0));
            // Matte fallback (~0.86 roughness) when a material ships no roughness map.
            let rough = roughness.map_or(220, |t| sample_channel(t, x, y, w, h, roughness_channel));
            rgba[i] = occ;
            rgba[i + 1] = rough;
            // White preserves a uniform metallicFactor when there is no metalness map.
            rgba[i + 2] =
                metalness.map_or(255, |t| sample_channel(t, x, y, w, h, metalness_channel));
            rgba[i + 3] = 255;
        }
    }
    encode_png_bytes(
        &DecodedTexture {
            width: w,
            height: h,
            rgba,
        },
        PREVIEW_TEXTURE_SIDE,
    )
    .ok()
}
