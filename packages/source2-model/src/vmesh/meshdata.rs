use super::*;
use crate::error::{Result, Source2Error};
use crate::kv3::KvValue;
use crate::resource::Resource;

pub(crate) fn kv_required<'a>(value: &'a KvValue, key: &str) -> Result<&'a KvValue> {
    value
        .get(key)
        .ok_or_else(|| Source2Error::Resource(format!("missing KV3 key {key}")))
}

pub(crate) fn kv_u32(value: &KvValue, key: &str) -> Result<u32> {
    kv_required(value, key)?
        .as_u32()
        .ok_or_else(|| Source2Error::Resource(format!("KV3 key {key} is not u32")))
}

pub(crate) fn kv_usize(value: &KvValue, key: &str) -> Option<usize> {
    value.get(key)?.as_u32().map(|value| value as usize)
}

pub(crate) fn kv_array_usize(values: &[KvValue], index: usize) -> Result<usize> {
    values
        .get(index)
        .and_then(KvValue::as_i64)
        .and_then(|value| usize::try_from(value).ok())
        .ok_or_else(|| Source2Error::Resource("KV3 array value is not usize".into()))
}

pub(crate) fn kv_bool(value: &KvValue, key: &str) -> bool {
    value.get(key).and_then(KvValue::as_bool).unwrap_or(false)
}

pub(crate) fn kv_semantic_name(value: &KvValue) -> Result<String> {
    match kv_required(value, "m_pSemanticName")? {
        KvValue::String(value) => Ok(value.to_ascii_uppercase()),
        KvValue::Binary(bytes) => {
            let end = bytes.iter().position(|b| *b == 0).unwrap_or(bytes.len());
            Ok(String::from_utf8_lossy(&bytes[..end]).to_ascii_uppercase())
        }
        _ => Err(Source2Error::Resource(
            "m_pSemanticName is not a string or blob".into(),
        )),
    }
}

pub(crate) fn decode_meshopt_vertex_buffer(
    encoded: &[u8],
    element_count: usize,
    element_size: usize,
) -> Result<Vec<u8>> {
    let decoded_size = element_count
        .checked_mul(element_size)
        .ok_or_else(|| Source2Error::Resource("vertex buffer size overflow".into()))?;
    let mut decoded = vec![0u8; decoded_size];
    let result = unsafe {
        meshopt::ffi::meshopt_decodeVertexBuffer(
            decoded.as_mut_ptr().cast(),
            element_count,
            element_size,
            encoded.as_ptr(),
            encoded.len(),
        )
    };
    if result != 0 {
        return Err(Source2Error::Decode(format!(
            "meshopt vertex decode failed with code {result}"
        )));
    }
    Ok(decoded)
}

pub(crate) fn decode_index_buffer(
    encoded: &[u8],
    element_count: usize,
    element_size: usize,
    compressed: bool,
) -> Result<Vec<u8>> {
    if !compressed {
        return Ok(encoded.to_vec());
    }

    if element_size == 2 {
        let indices = meshopt::decode_index_buffer::<u16>(encoded, element_count)
            .map_err(|e| Source2Error::Decode(format!("meshopt index decode failed: {e}")))?;
        let mut bytes = Vec::with_capacity(indices.len() * 2);
        for index in indices {
            bytes.extend_from_slice(&index.to_le_bytes());
        }
        Ok(bytes)
    } else if element_size == 4 {
        let indices = meshopt::decode_index_buffer::<u32>(encoded, element_count)
            .map_err(|e| Source2Error::Decode(format!("meshopt index decode failed: {e}")))?;
        let mut bytes = Vec::with_capacity(indices.len() * 4);
        for index in indices {
            bytes.extend_from_slice(&index.to_le_bytes());
        }
        Ok(bytes)
    } else {
        Err(Source2Error::UnsupportedFormat(format!(
            "unsupported index size {element_size}"
        )))
    }
}

pub(crate) fn parse_embedded_buffer(
    res: &Resource,
    value: &KvValue,
    is_vertex: bool,
) -> Result<BufferData> {
    let element_count = kv_u32(value, "m_nElementCount")? as usize;
    let element_size = kv_u32(value, "m_nElementSizeInBytes")? as usize;
    let compressed = kv_bool(value, "m_bMeshoptCompressed");
    let zstd_compressed = kv_bool(value, "m_bCompressedZSTD");
    if zstd_compressed {
        return Err(Source2Error::UnsupportedFormat(
            "ZSTD-compressed model buffers are not supported yet".into(),
        ));
    }

    let block_index = kv_u32(value, "m_nBlockIndex")? as usize;
    let block = res.blocks.get(block_index).ok_or_else(|| {
        Source2Error::Resource(format!("model block index {block_index} out of bounds"))
    })?;
    let encoded = res
        .data
        .get(block.offset..block.offset + block.size)
        .ok_or_else(|| Source2Error::Resource("model buffer block out of bounds".into()))?;

    let data = if is_vertex {
        if compressed {
            decode_meshopt_vertex_buffer(encoded, element_count, element_size)?
        } else {
            encoded.to_vec()
        }
    } else {
        decode_index_buffer(encoded, element_count, element_size, compressed)?
    };

    let mut fields = Vec::new();
    if is_vertex {
        let field_values = kv_required(value, "m_inputLayoutFields")?
            .as_array()
            .ok_or_else(|| Source2Error::Resource("m_inputLayoutFields is not an array".into()))?;
        fields.reserve(field_values.len());
        for field in field_values {
            fields.push(LayoutField {
                semantic_name: kv_semantic_name(field)?,
                format: kv_u32(field, "m_Format")?,
                offset: kv_u32(field, "m_nOffset")? as usize,
            });
        }
    }

    Ok(BufferData {
        element_count,
        element_size,
        fields,
        data,
    })
}

pub(crate) fn parse_embedded_mesh_buffers(res: &Resource, mesh: &KvValue) -> Result<Vbib> {
    if let Some(block_index) = kv_usize(mesh, "vbib_block") {
        let block = res
            .blocks
            .get(block_index)
            .ok_or_else(|| Source2Error::Resource("legacy VBIB block index is invalid".into()))?;
        let bytes = res
            .data
            .get(block.offset..block.offset + block.size)
            .ok_or_else(|| Source2Error::Resource("legacy VBIB block is out of bounds".into()))?;
        return parse_vbib(bytes);
    }
    let vertex_values = kv_required(mesh, "m_vertexBuffers")?
        .as_array()
        .ok_or_else(|| Source2Error::Resource("m_vertexBuffers is not an array".into()))?;
    let index_values = kv_required(mesh, "m_indexBuffers")?
        .as_array()
        .ok_or_else(|| Source2Error::Resource("m_indexBuffers is not an array".into()))?;

    let mut vertex_buffers = Vec::with_capacity(vertex_values.len());
    for value in vertex_values {
        vertex_buffers.push(parse_embedded_buffer(res, value, true)?);
    }

    let mut index_buffers = Vec::with_capacity(index_values.len());
    for value in index_values {
        index_buffers.push(parse_embedded_buffer(res, value, false)?);
    }

    Ok(Vbib {
        vertex_buffers,
        index_buffers,
    })
}

pub(crate) fn kv_string(value: &KvValue, key: &str) -> Option<String> {
    kv_value_string(value.get(key)?)
}

pub(crate) fn kv_value_string(value: &KvValue) -> Option<String> {
    match value {
        KvValue::String(value) => Some(value.clone()),
        KvValue::Binary(bytes) => {
            let end = bytes.iter().position(|b| *b == 0).unwrap_or(bytes.len());
            Some(String::from_utf8_lossy(&bytes[..end]).into_owned())
        }
        _ => None,
    }
}

pub(crate) fn block_value(res: &Resource, index: usize) -> Option<KvValue> {
    let block = res.blocks.get(index)?;
    let bytes = res.data.get(block.offset..block.offset + block.size)?;
    crate::kv3::parse(bytes).ok()
}

pub(crate) fn normalize_material_path(path: &str) -> String {
    let mut normalized = path.replace('\\', "/").to_ascii_lowercase();
    if normalized.ends_with(".vmat_c") {
        return normalized;
    }
    if normalized.ends_with(".vmat") {
        normalized.push_str("_c");
    }
    normalized
}

pub(crate) fn drawcalls_from_mesh_data(mesh_data: &KvValue) -> Vec<DrawCall> {
    let mut drawcalls = Vec::new();
    let Some(scene_objects) = mesh_data.get("m_sceneObjects").and_then(KvValue::as_array) else {
        return drawcalls;
    };

    for scene_object in scene_objects {
        let Some(object_drawcalls) = scene_object.get("m_drawCalls").and_then(KvValue::as_array)
        else {
            continue;
        };
        for drawcall in object_drawcalls {
            let Some(index_buffer) = drawcall
                .get("m_indexBuffer")
                .and_then(|value| kv_usize(value, "m_hBuffer"))
            else {
                continue;
            };

            let vertex_buffers = drawcall
                .get("m_vertexBuffers")
                .and_then(KvValue::as_array)
                .map(|values| {
                    values
                        .iter()
                        .filter_map(|value| kv_usize(value, "m_hBuffer"))
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();

            drawcalls.push(DrawCall {
                material: kv_string(drawcall, "m_material")
                    .or_else(|| kv_string(drawcall, "m_pMaterial"))
                    .map(|path| normalize_material_path(&path)),
                index_buffer,
                vertex_buffers,
                base_vertex: kv_usize(drawcall, "m_nBaseVertex").unwrap_or(0),
                start_index: kv_usize(drawcall, "m_nStartIndex").unwrap_or(0),
                index_count: kv_usize(drawcall, "m_nIndexCount").unwrap_or(0),
            });
        }
    }

    drawcalls
}

pub(crate) fn material_paths_from_mesh_data(mesh_data: &KvValue, out: &mut Vec<String>) {
    for drawcall in drawcalls_from_mesh_data(mesh_data) {
        if let Some(material) = drawcall.material
            && !out.iter().any(|path| path.eq_ignore_ascii_case(&material))
        {
            out.push(material);
        }
    }
}

pub(crate) fn is_lod_mesh(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.contains("_lod") || lower.ends_with("lod0") || lower.ends_with("lod1")
}

/// The model's default mesh-group mask and one group mask per mesh.
///
/// These are 64-bit: a model with many body groups (Rat King's banner, sewer
/// lid, 19 ammo states and seven guards) sets bits past 32, and reading them as
/// `u32` dropped the whole table, so every optional mesh rendered at once.
pub(crate) fn default_mesh_group_masks(res: &Resource) -> Option<(u64, Vec<u64>)> {
    let data = res
        .block_bytes("DATA")
        .and_then(|bytes| crate::kv3::parse(bytes).ok())?;
    let default_mask = data.get("m_nDefaultMeshGroupMask")?.as_u64()?;
    let masks = data
        .get("m_refMeshGroupMasks")?
        .as_array()?
        .iter()
        .map(|mask| mask.as_u64().unwrap_or(u64::MAX))
        .collect::<Vec<_>>();
    (!masks.is_empty()).then_some((default_mask, masks))
}

/// One choice of a body group: bit `bit` of the mesh-group masks.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MeshGroupChoice {
    /// The body group it belongs to, like `default`.
    pub body_group: String,
    /// The choice's own name, like `inflated`.
    pub name: String,
    pub bit: u32,
}

/// A model's mesh groups when it has alternates to switch between: Viscous
/// swaps his `body` for the `inflated` ball, Rat King adds armour pieces.
#[derive(Debug, Clone)]
pub struct MeshGroups {
    pub choices: Vec<MeshGroupChoice>,
    pub default_mask: u64,
    /// One group mask per mesh, as `default_mesh_group_masks` reads them.
    pub masks: Vec<u64>,
}

/// `m_meshGroups` names read `<body group>_@<choice index>_#&<choice name>`.
fn mesh_group_choice(name: &str, bit: u32) -> MeshGroupChoice {
    let (body_group, choice) = name.split_once("_@").unwrap_or((name, ""));
    let choice = choice
        .split_once("_#&")
        .map_or(choice, |(_, choice)| choice);
    MeshGroupChoice {
        body_group: body_group.to_string(),
        name: if choice.is_empty() { name } else { choice }.to_string(),
        bit,
    }
}

/// The model's mesh groups, or `None` when it has fewer than two.
pub fn model_mesh_groups(res: &Resource) -> Option<MeshGroups> {
    let (default_mask, masks) = default_mesh_group_masks(res)?;
    let data = res
        .block_bytes("DATA")
        .and_then(|bytes| crate::kv3::parse(bytes).ok())?;
    let choices = data
        .get("m_meshGroups")?
        .as_array()?
        .iter()
        .take(64)
        .enumerate()
        .filter_map(|(bit, name)| Some(mesh_group_choice(name.as_string()?, bit as u32)))
        .collect::<Vec<_>>();
    (choices.len() > 1).then_some(MeshGroups {
        choices,
        default_mask,
        masks,
    })
}

/// One LOD mask per mesh (`m_refLODGroupMasks`): bit 0 marks the meshes the
/// game draws up close. Mesh names are no guide — a hero's LOD meshes rarely
/// carry `_lod` in their name — so the mask is what keeps the lower LODs from
/// being stacked inside the full-detail body.
pub(crate) fn lod_group_masks(res: &Resource) -> Option<Vec<u64>> {
    let data = res
        .block_bytes("DATA")
        .and_then(|bytes| crate::kv3::parse(bytes).ok())?;
    let masks = data
        .get("m_refLODGroupMasks")?
        .as_array()?
        .iter()
        .map(|mask| mask.as_u64().unwrap_or(u64::MAX))
        .collect::<Vec<_>>();
    (!masks.is_empty()).then_some(masks)
}

/// Whether mesh `index` belongs to LOD0. Without a mask table every mesh does.
pub(crate) fn mesh_is_lod0(lod_masks: Option<&[u64]>, index: usize) -> bool {
    lod_masks
        .and_then(|masks| masks.get(index))
        .is_none_or(|mask| mask & 1 != 0)
}

/// Which of a model's `m_refMeshes` a preview decodes: LOD0 of every body
/// group when the model has groups to switch between (`model_mesh_groups`),
/// otherwise what the game draws by default.
pub fn preview_mesh_selection(res: &Resource, mesh_count: usize) -> Vec<bool> {
    if model_mesh_groups(res).is_none() {
        return default_mesh_selection(res, mesh_count);
    }
    let lod_masks = lod_group_masks(res);
    let shown = (0..mesh_count)
        .map(|index| mesh_is_lod0(lod_masks.as_deref(), index))
        .collect::<Vec<_>>();
    if shown.iter().any(|&shown| shown) {
        shown
    } else {
        vec![true; mesh_count]
    }
}

/// Which of a model's `m_refMeshes` the game draws by default: LOD0 and a
/// body group the default mask turns on.
pub fn default_mesh_selection(res: &Resource, mesh_count: usize) -> Vec<bool> {
    let lod_masks = lod_group_masks(res);
    let groups = default_mesh_group_masks(res);
    let shown = (0..mesh_count)
        .map(|index| {
            let group = groups.as_ref().is_none_or(|(default_mask, masks)| {
                *default_mask == 0 || masks.get(index).is_none_or(|mask| mask & default_mask != 0)
            });
            mesh_is_lod0(lod_masks.as_deref(), index) && group
        })
        .collect::<Vec<_>>();
    // A model whose tables select nothing is still better shown whole.
    if shown.iter().any(|&shown| shown) {
        shown
    } else {
        vec![true; mesh_count]
    }
}

pub(crate) fn mesh_is_enabled(
    mesh: &KvValue,
    fallback_index: usize,
    masks: Option<&(u64, Vec<u64>)>,
) -> bool {
    let Some((default_mask, masks)) = masks else {
        return true;
    };
    if *default_mask == 0 {
        return true;
    }
    let mesh_index = kv_usize(mesh, "m_nMeshIndex")
        .or_else(|| kv_usize(mesh, "mesh_index"))
        .unwrap_or(fallback_index);
    masks
        .get(mesh_index)
        .is_none_or(|mesh_mask| mesh_mask & default_mask != 0)
}

pub(crate) fn contains_any(value: &str, tokens: &[&str]) -> bool {
    tokens.iter().any(|token| value.contains(token))
}

pub(crate) fn texture_match_score(mesh_name: &str, texture_name: &str) -> i32 {
    let mesh = mesh_name.to_ascii_lowercase();
    let texture = texture_name.to_ascii_lowercase();
    if !contains_any(&texture, &["color", "albedo"]) {
        return i32::MIN;
    }

    let mut score = 0;
    if contains_any(&mesh, &["head", "face"]) {
        score += if contains_any(&texture, &["head", "face"]) {
            240
        } else {
            -120
        };
    }
    if mesh.contains("eye") {
        score += if texture.contains("eye") { 240 } else { -120 };
    }
    if contains_any(&mesh, &["sticky", "bomb", "ball"]) {
        score += if texture.contains("stickybomb")
            || (texture.contains("sticky") && texture.contains("bomb"))
        {
            240
        } else if contains_any(&texture, &["scrumpy", "bottle", "flask"]) {
            120
        } else {
            -80
        };
    }
    if contains_any(&mesh, &["scrumpy", "bottle", "flask"]) {
        score += if contains_any(&texture, &["scrumpy", "bottle", "flask"]) {
            240
        } else {
            -80
        };
    }
    if contains_any(&mesh, &["body", "hand", "forearm", "arm", "leg"]) {
        score += if contains_any(&texture, &["bodytex", "body", "torso"]) {
            220
        } else {
            -40
        };
    }
    if contains_any(&mesh, &["gun", "weapon"]) {
        score += if contains_any(&texture, &["gun", "weapon"]) {
            240
        } else {
            -180
        };
    }

    for token in mesh.split(['_', '-', '/', '.']) {
        if token.len() < 4 || matches!(token, "bebop" | "model" | "base" | "front") {
            continue;
        }
        if texture.contains(token) {
            score += 35;
        }
    }

    score
}

pub(crate) fn material_index_for_mesh(mesh_name: &str, textures: &[PreviewTexture]) -> usize {
    if textures.len() == 1 {
        return 1;
    }
    textures
        .iter()
        .enumerate()
        .filter_map(|(index, texture)| {
            let score = texture_match_score(mesh_name, &texture.name);
            (score >= 140).then_some((score, index + 1))
        })
        .max_by_key(|(score, _)| *score)
        .map(|(_, index)| index)
        .unwrap_or(0)
}

pub(crate) fn material_index_for_material(
    material: Option<&str>,
    textures: &[PreviewTexture],
) -> usize {
    let Some(material) = material.map(normalize_material_path) else {
        return usize::from(textures.len() == 1);
    };
    textures
        .iter()
        .position(|texture| {
            texture
                .material
                .as_deref()
                .map(normalize_material_path)
                .is_some_and(|candidate| candidate == material)
        })
        .map(|index| index + 1)
        // A named material that failed to decode gets the neutral default, not
        // whichever other material happened to decode.
        .unwrap_or(0)
}

#[cfg(test)]
mod mesh_group_tests {
    use super::*;

    #[test]
    fn mesh_group_names_split_into_body_group_and_choice() {
        // Viscous' groups as `m_meshGroups` stores them.
        assert_eq!(
            mesh_group_choice("default_@1_#&inflated", 1),
            MeshGroupChoice {
                body_group: "default".into(),
                name: "inflated".into(),
                bit: 1,
            }
        );
        assert_eq!(mesh_group_choice("unnamed", 0).name, "unnamed");
    }
}
