use super::*;
use crate::error::{Result, Source2Error};
use crate::kv3::KvValue;
use crate::resource::Resource;
use crate::skeleton::{Skeleton, parse_model_skeleton};
use std::collections::HashMap;

pub(crate) fn read_vertex_set(
    vbib: &Vbib,
    buffer_indices: &[usize],
    bone_weight_count: usize,
) -> Result<VertexSet> {
    let mut candidates = buffer_indices
        .iter()
        .filter_map(|index| vbib.vertex_buffers.get(*index))
        .collect::<Vec<_>>();
    for buffer in &vbib.vertex_buffers {
        if !candidates
            .iter()
            .any(|candidate| std::ptr::eq(*candidate, buffer))
        {
            candidates.push(buffer);
        }
    }
    let vertex_buffer = candidates
        .iter()
        .copied()
        .find(|buffer| find_field(buffer, "POSITION").is_some())
        .ok_or_else(|| Source2Error::Resource("no POSITION vertex buffer".into()))?;
    let position_field = find_field(vertex_buffer, "POSITION")
        .ok_or_else(|| Source2Error::Resource("no POSITION attribute".into()))?;
    let positions = read_positions(vertex_buffer, position_field)?;
    let vertex_count = vertex_buffer.element_count;
    let matching = |semantic: &str, prefix: bool| {
        candidates.iter().copied().find_map(|buffer| {
            if buffer.element_count != vertex_count {
                return None;
            }
            let field = if prefix {
                find_field_prefix(buffer, semantic)
            } else {
                find_field(buffer, semantic)
            }?;
            Some((buffer, field))
        })
    };
    let normals =
        matching("NORMAL", false).and_then(|(buffer, field)| read_normals(buffer, field).ok());
    let texcoords =
        matching("TEXCOORD", true).and_then(|(buffer, field)| read_texcoords(buffer, field).ok());
    let joint_stream = matching("BLENDINDICES", true);
    let weight_stream = matching("BLENDWEIGHT", true);
    let skinning = match (joint_stream, weight_stream) {
        (Some((joint_buffer, joint_field)), Some((weight_buffer, weight_field))) => Some(
            read_skinning(joint_buffer, joint_field, weight_buffer, weight_field, 8)?,
        ),
        (Some((joint_buffer, joint_field)), None) if bone_weight_count > 0 => {
            read_joints(joint_buffer, joint_field).ok().map(|joints| {
                let weights = default_skin_weights(vertex_count, bone_weight_count);
                (joints, weights)
            })
        }
        _ => None,
    };
    let (joints, weights) = skinning
        .map(|(joints, weights)| (Some(joints), Some(weights)))
        .unwrap_or((None, None));

    Ok(VertexSet {
        positions,
        normals,
        texcoords,
        joints,
        weights,
    })
}

pub(crate) fn compact_primitive(
    vertices: &VertexSet,
    source_indices: &[u32],
    material: usize,
) -> Option<DecodedPrimitive> {
    if source_indices.len() < 3 {
        return None;
    }
    let source_vertex_count = vertices.positions.len() / 3;
    if source_indices
        .iter()
        .any(|index| *index as usize >= source_vertex_count)
    {
        return None;
    }
    let joint_stride = attribute_stride(vertices.joints.as_deref(), source_vertex_count)?;
    let weight_stride = attribute_stride(vertices.weights.as_deref(), source_vertex_count)?;
    if joint_stride != weight_stride {
        return None;
    }

    let mut remap = HashMap::<u32, u32>::new();
    let mut indices = Vec::<u32>::with_capacity(source_indices.len());
    let mut positions = Vec::<f32>::new();
    let mut normals = vertices.normals.as_ref().map(|_| Vec::<f32>::new());
    let mut texcoords = vertices.texcoords.as_ref().map(|_| Vec::<f32>::new());
    let mut joints = vertices.joints.as_ref().map(|_| Vec::<u16>::new());
    let mut weights = vertices.weights.as_ref().map(|_| Vec::<f32>::new());

    for source_index in source_indices {
        let next_index = remap.len() as u32;
        let target_index = *remap.entry(*source_index).or_insert_with(|| {
            let index = *source_index as usize;
            positions.extend_from_slice(&vertices.positions[index * 3..index * 3 + 3]);
            if let (Some(source), Some(out)) = (&vertices.normals, &mut normals) {
                out.extend_from_slice(&source[index * 3..index * 3 + 3]);
            }
            if let (Some(source), Some(out)) = (&vertices.texcoords, &mut texcoords) {
                out.extend_from_slice(&source[index * 2..index * 2 + 2]);
            }
            if let (Some(source), Some(out)) = (&vertices.joints, &mut joints) {
                let start = index * joint_stride;
                out.extend_from_slice(&source[start..start + joint_stride]);
            }
            if let (Some(source), Some(out)) = (&vertices.weights, &mut weights) {
                let start = index * weight_stride;
                out.extend_from_slice(&source[start..start + weight_stride]);
            }
            next_index
        });
        indices.push(target_index);
    }

    indices.truncate(indices.len() - (indices.len() % 3));
    if indices.len() < 3 {
        return None;
    }

    let vertex_count = positions.len() / 3;
    let (index_bytes, index_component) = write_index_bytes(&indices, vertex_count);
    Some(DecodedPrimitive {
        positions,
        normals,
        texcoords,
        joints,
        weights,
        indices: index_bytes,
        index_component,
        index_count: indices.len(),
        material,
        mesh_group_mask: u64::MAX,
    })
}

fn attribute_stride<T>(values: Option<&[T]>, vertex_count: usize) -> Option<usize> {
    let Some(values) = values else {
        return Some(0);
    };
    if vertex_count == 0 || values.len() % vertex_count != 0 {
        return None;
    }
    let stride = values.len() / vertex_count;
    matches!(stride, 4 | 8).then_some(stride)
}

pub(crate) fn decode_drawcall_primitives(
    vbib: &Vbib,
    mesh_data: &KvValue,
    preview_textures: &[PreviewTexture],
) -> Result<Vec<DecodedPrimitive>> {
    let drawcalls = drawcalls_from_mesh_data(mesh_data);
    if drawcalls.is_empty() {
        return Ok(Vec::new());
    }

    let mut vertex_cache = HashMap::<Vec<usize>, VertexSet>::new();
    let mut decoded = Vec::new();
    let bone_weight_count = mesh_data
        .get("m_skeleton")
        .and_then(|skeleton| skeleton.get("m_nBoneWeightCount"))
        .and_then(KvValue::as_u32)
        .unwrap_or(0) as usize;

    for drawcall in drawcalls {
        let Some(_position_buffer_index) = drawcall
            .vertex_buffers
            .iter()
            .copied()
            .find(|index| {
                vbib.vertex_buffers
                    .get(*index)
                    .is_some_and(|buffer| find_field(buffer, "POSITION").is_some())
            })
            .or_else(|| {
                vbib.vertex_buffers
                    .iter()
                    .position(|buffer| find_field(buffer, "POSITION").is_some())
            })
        else {
            continue;
        };

        let mut vertex_buffer_key = drawcall.vertex_buffers.clone();
        vertex_buffer_key.sort_unstable();
        vertex_buffer_key.dedup();
        if !vertex_cache.contains_key(&vertex_buffer_key) {
            let vertices = read_vertex_set(vbib, &vertex_buffer_key, bone_weight_count)?;
            vertex_cache.insert(vertex_buffer_key.clone(), vertices);
        }
        let vertices = vertex_cache
            .get(&vertex_buffer_key)
            .ok_or_else(|| Source2Error::Resource("missing cached vertex buffer".into()))?;
        let index_buffer = vbib
            .index_buffers
            .get(drawcall.index_buffer)
            .ok_or_else(|| Source2Error::Resource("draw call index buffer out of bounds".into()))?;
        let source_indices = read_draw_indices_u32(
            index_buffer,
            drawcall.start_index,
            drawcall.index_count,
            drawcall.base_vertex,
            vertices.positions.len() / 3,
        )?;
        let material = material_index_for_material(drawcall.material.as_deref(), preview_textures);
        if let Some(primitive) = compact_primitive(vertices, &source_indices, material) {
            decoded.push(primitive);
        }
    }

    Ok(decoded)
}

pub(crate) fn decode_vbib_primitive(
    _name: String,
    vbib: Vbib,
    material: usize,
) -> Result<DecodedPrimitive> {
    let vertex_buffer = vbib
        .vertex_buffers
        .iter()
        .find(|buffer| find_field(buffer, "POSITION").is_some())
        .ok_or_else(|| Source2Error::Resource("no POSITION vertex buffer".into()))?;
    let position_field = find_field(vertex_buffer, "POSITION")
        .ok_or_else(|| Source2Error::Resource("no POSITION attribute".into()))?;
    let positions = read_positions(vertex_buffer, position_field)?;
    let normals = find_field(vertex_buffer, "NORMAL")
        .and_then(|field| read_normals(vertex_buffer, field).ok());
    let texcoords = find_field_prefix(vertex_buffer, "TEXCOORD")
        .and_then(|field| read_texcoords(vertex_buffer, field).ok());
    let skinning = find_field_prefix(vertex_buffer, "BLENDINDICES")
        .zip(
            find_field_prefix(vertex_buffer, "BLENDWEIGHT")
                .or_else(|| find_field_prefix(vertex_buffer, "BLENDWEIGHTS")),
        )
        .and_then(|(joint_field, weight_field)| {
            read_skinning(vertex_buffer, joint_field, vertex_buffer, weight_field, 8).ok()
        });
    let (joints, weights) = skinning
        .map(|(joints, weights)| (Some(joints), Some(weights)))
        .unwrap_or((None, None));

    let index_buffer = vbib
        .index_buffers
        .first()
        .ok_or_else(|| Source2Error::Resource("no index buffer".into()))?;
    let (indices, index_component, index_count) =
        read_indices(index_buffer, vertex_buffer.element_count)?;
    if index_count < 3 {
        return Err(Source2Error::Resource(
            "no drawable triangle indices".into(),
        ));
    }

    let index_size = if index_component == GL_UNSIGNED_SHORT {
        2
    } else {
        4
    };
    Ok(DecodedPrimitive {
        positions,
        normals,
        texcoords,
        joints,
        weights,
        indices: indices[..index_count * index_size].to_vec(),
        index_component,
        index_count,
        material,
        mesh_group_mask: u64::MAX,
    })
}

pub(crate) fn decoded_indices_u32(primitive: &DecodedPrimitive) -> Result<Vec<u32>> {
    match primitive.index_component {
        GL_UNSIGNED_SHORT => primitive
            .indices
            .chunks_exact(2)
            .take(primitive.index_count)
            .map(|chunk| Ok(u16::from_le_bytes(chunk.try_into().unwrap()) as u32))
            .collect(),
        GL_UNSIGNED_INT => primitive
            .indices
            .chunks_exact(4)
            .take(primitive.index_count)
            .map(|chunk| Ok(u32::from_le_bytes(chunk.try_into().unwrap())))
            .collect(),
        _ => Err(Source2Error::UnsupportedFormat(format!(
            "unsupported render index component {}",
            primitive.index_component
        ))),
    }
}

pub(crate) fn apply_bone_remap(primitive: &mut DecodedPrimitive, bone_remap: Option<&[u16]>) {
    let (Some(joints), Some(bone_remap)) = (&mut primitive.joints, bone_remap) else {
        return;
    };
    for joint in joints {
        if let Some(remapped) = bone_remap.get(*joint as usize) {
            *joint = *remapped;
        }
    }
}

pub(crate) fn apply_bone_remap_to_primitives(
    primitives: &mut [DecodedPrimitive],
    bone_remap: Option<&[u16]>,
) {
    for primitive in primitives {
        apply_bone_remap(primitive, bone_remap);
    }
}

pub(crate) fn render_model_from_decoded_primitives(
    primitives: Vec<DecodedPrimitive>,
    skeleton: Option<Skeleton>,
    preview_textures: &[PreviewTexture],
) -> Result<RenderModel> {
    let mut materials = Vec::with_capacity(preview_textures.len() + 1);
    materials.push(RenderMaterial {
        name: "default".into(),
        base_color_png: None,
        normal_png: None,
        orm_png: None,
        emissive_png: None,
        base_color_factor: [1.0; 4],
        alpha_mode: MaterialAlphaMode::Opaque,
        alpha_cutoff: 0.5,
        emissive_factor: None,
    });
    materials.extend(preview_textures.iter().map(|texture| RenderMaterial {
        name: texture.name.clone(),
        base_color_png: Some(texture.png.clone()),
        normal_png: texture.normal_png.clone(),
        orm_png: texture.orm_png.clone(),
        emissive_png: texture.emissive_png.clone(),
        base_color_factor: texture.base_color_factor,
        alpha_mode: texture.alpha_mode,
        alpha_cutoff: texture.alpha_cutoff,
        emissive_factor: texture.emissive_factor,
    }));

    Ok(RenderModel {
        primitives: primitives
            .into_iter()
            .map(|primitive| {
                Ok(RenderPrimitive {
                    indices: decoded_indices_u32(&primitive)?,
                    positions: primitive.positions,
                    normals: primitive.normals,
                    texcoords: primitive.texcoords,
                    joints: primitive.joints,
                    weights: primitive.weights,
                    material: primitive.material,
                    mesh_group_mask: primitive.mesh_group_mask,
                })
            })
            .collect::<Result<Vec<_>>>()?,
        materials,
        skeleton,
        default_mesh_group_mask: u64::MAX,
    })
}

pub(crate) fn decode_mesh_render_model_from_resource_with_skeleton(
    res: &Resource,
    skeleton: Option<Skeleton>,
    preview_textures: &[PreviewTexture],
    bone_remap: Option<&[u16]>,
) -> Result<RenderModel> {
    let vbib_bytes = res
        .block_bytes("VBIB")
        .ok_or_else(|| Source2Error::Resource("no VBIB block".into()))?;
    let vbib = parse_vbib(vbib_bytes)?;
    if let Some(mesh_data) = res
        .block_bytes("DATA")
        .and_then(|bytes| crate::kv3::parse(bytes).ok())
    {
        let mut decoded = decode_drawcall_primitives(&vbib, &mesh_data, &[])?;
        apply_bone_remap_to_primitives(&mut decoded, bone_remap);
        if !decoded.is_empty() {
            return render_model_from_decoded_primitives(decoded, skeleton, preview_textures);
        }
    }

    let mut primitive = decode_vbib_primitive("mesh".into(), vbib, 0)?;
    apply_bone_remap(&mut primitive, bone_remap);
    render_model_from_decoded_primitives(vec![primitive], skeleton, preview_textures)
}

pub(crate) fn decode_mesh_primitives_from_resource(
    res: &Resource,
    preview_textures: &[PreviewTexture],
    bone_remap: Option<&[u16]>,
) -> Result<Vec<DecodedPrimitive>> {
    let vbib_bytes = res
        .block_bytes("VBIB")
        .ok_or_else(|| Source2Error::Resource("no VBIB block".into()))?;
    let vbib = parse_vbib(vbib_bytes)?;
    if let Some(mesh_data) = res
        .block_bytes("DATA")
        .and_then(|bytes| crate::kv3::parse(bytes).ok())
    {
        let mut primitives = decode_drawcall_primitives(&vbib, &mesh_data, preview_textures)?;
        apply_bone_remap_to_primitives(&mut primitives, bone_remap);
        if !primitives.is_empty() {
            return Ok(primitives);
        }
    }

    let material = usize::from(!preview_textures.is_empty());
    let mut primitive = decode_vbib_primitive(String::new(), vbib, material)?;
    apply_bone_remap(&mut primitive, bone_remap);
    Ok(vec![primitive])
}

pub fn decode_embedded_model_render_model_from_resource(
    res: &Resource,
    preview_textures: &[PreviewTexture],
) -> Result<RenderModel> {
    let skeleton = parse_model_skeleton(res)?;
    let ctrl = res
        .block_bytes("CTRL")
        .ok_or_else(|| Source2Error::Resource("model has no CTRL block".into()))?;
    let root = crate::kv3::parse(ctrl)?;
    let meshes = root
        .get("embedded_meshes")
        .and_then(KvValue::as_array)
        .ok_or_else(|| Source2Error::Resource("model has no embedded meshes".into()))?;
    if meshes.is_empty() {
        return Err(Source2Error::Resource(
            "model has no embedded meshes".into(),
        ));
    }

    let mesh_group_masks = default_mesh_group_masks(res);
    let default_mesh_group_mask = mesh_group_masks
        .as_ref()
        .map_or(u64::MAX, |(mask, _)| u64::from(*mask));
    let mut selected_meshes = meshes
        .iter()
        .enumerate()
        .filter_map(|(mesh_index, mesh)| {
            let name = kv_string(mesh, "m_Name")
                .or_else(|| kv_string(mesh, "name"))
                .unwrap_or_else(|| "mesh".into());
            let source_index = kv_usize(mesh, "m_nMeshIndex")
                .or_else(|| kv_usize(mesh, "mesh_index"))
                .unwrap_or(mesh_index);
            let group_mask = mesh_group_masks
                .as_ref()
                .and_then(|(_, masks)| masks.get(source_index))
                .map_or(u64::MAX, |mask| u64::from(*mask));
            (!is_lod_mesh(&name)).then_some((mesh_index, name, mesh, group_mask))
        })
        .collect::<Vec<_>>();
    if selected_meshes.is_empty() {
        selected_meshes = meshes
            .iter()
            .enumerate()
            .map(|(mesh_index, mesh)| {
                (
                    mesh_index,
                    kv_string(mesh, "m_Name")
                        .or_else(|| kv_string(mesh, "name"))
                        .unwrap_or_else(|| "mesh".into()),
                    mesh,
                    u64::MAX,
                )
            })
            .collect();
    }

    let mut decoded = Vec::new();
    for (mesh_index, name, mesh, group_mask) in selected_meshes {
        let bone_remap = model_mesh_bone_remap(res, mesh_index)?;
        let vbib = parse_embedded_mesh_buffers(res, mesh)?;
        let mesh_data = kv_usize(mesh, "m_nDataBlock")
            .or_else(|| kv_usize(mesh, "data_block"))
            .and_then(|index| block_value(res, index));
        if let Some(mesh_data) = mesh_data {
            let mut drawcall_primitives =
                decode_drawcall_primitives(&vbib, &mesh_data, preview_textures)?;
            if !drawcall_primitives.is_empty() {
                apply_bone_remap_to_primitives(&mut drawcall_primitives, bone_remap.as_deref());
                for primitive in &mut drawcall_primitives {
                    primitive.mesh_group_mask = group_mask;
                }
                decoded.extend(drawcall_primitives);
                continue;
            }
        }
        let material = material_index_for_mesh(&name, preview_textures);
        let mut primitive = decode_vbib_primitive(name, vbib, material)?;
        apply_bone_remap(&mut primitive, bone_remap.as_deref());
        primitive.mesh_group_mask = group_mask;
        decoded.push(primitive);
    }

    if decoded.is_empty() {
        return Err(Source2Error::Resource(
            "no drawable embedded triangle indices".into(),
        ));
    }
    let mut model = render_model_from_decoded_primitives(decoded, skeleton, preview_textures)?;
    model.default_mesh_group_mask = default_mesh_group_mask;
    Ok(model)
}

pub fn decode_embedded_model_glb_from_resource(
    res: &Resource,
    preview_textures: &[PreviewTexture],
) -> Result<ModelGlb> {
    let skeleton = parse_model_skeleton(res)?;
    let ctrl = res
        .block_bytes("CTRL")
        .ok_or_else(|| Source2Error::Resource("model has no CTRL block".into()))?;
    let root = crate::kv3::parse(ctrl)?;
    let meshes = root
        .get("embedded_meshes")
        .and_then(KvValue::as_array)
        .ok_or_else(|| Source2Error::Resource("model has no embedded meshes".into()))?;
    if meshes.is_empty() {
        return Err(Source2Error::Resource(
            "model has no embedded meshes".into(),
        ));
    }

    let mesh_group_masks = default_mesh_group_masks(res);
    let mut selected_meshes = meshes
        .iter()
        .enumerate()
        .filter_map(|(mesh_index, mesh)| {
            let name = kv_string(mesh, "m_Name")
                .or_else(|| kv_string(mesh, "name"))
                .unwrap_or_else(|| "mesh".into());
            (!is_lod_mesh(&name) && mesh_is_enabled(mesh, mesh_index, mesh_group_masks.as_ref()))
                .then_some((mesh_index, name, mesh))
        })
        .collect::<Vec<_>>();
    if selected_meshes.is_empty() {
        selected_meshes = meshes
            .iter()
            .enumerate()
            .map(|(mesh_index, mesh)| {
                (
                    mesh_index,
                    kv_string(mesh, "m_Name")
                        .or_else(|| kv_string(mesh, "name"))
                        .unwrap_or_else(|| "mesh".into()),
                    mesh,
                )
            })
            .collect();
    }

    let mut decoded = Vec::new();
    for (mesh_index, name, mesh) in selected_meshes {
        let bone_remap = model_mesh_bone_remap(res, mesh_index)?;
        let vbib = parse_embedded_mesh_buffers(res, mesh)?;
        let mesh_data = kv_usize(mesh, "m_nDataBlock")
            .or_else(|| kv_usize(mesh, "data_block"))
            .and_then(|index| block_value(res, index));
        if let Some(mesh_data) = mesh_data {
            let mut drawcall_primitives =
                decode_drawcall_primitives(&vbib, &mesh_data, preview_textures)?;
            if !drawcall_primitives.is_empty() {
                apply_bone_remap_to_primitives(&mut drawcall_primitives, bone_remap.as_deref());
                decoded.extend(drawcall_primitives);
                continue;
            }
        }

        let material = material_index_for_mesh(&name, preview_textures);
        let mut primitive = decode_vbib_primitive(name, vbib, material)?;
        apply_bone_remap(&mut primitive, bone_remap.as_deref());
        decoded.push(primitive);
    }
    if decoded.is_empty() {
        return Err(Source2Error::Resource(
            "no drawable embedded triangle indices".into(),
        ));
    }

    model_from_decoded_primitives(&decoded, preview_textures, skeleton.as_ref())
}

pub fn referenced_meshes(res: &Resource) -> Result<Vec<String>> {
    let model_meshes = model_referenced_meshes(res)?;
    if !model_meshes.is_empty() {
        return Ok(model_meshes);
    }

    let Some(block) = res.block("RERL") else {
        return Ok(Vec::new());
    };
    let data = &res.data;
    let offset = read_u32(data, block.offset)? as usize;
    let count = read_u32(data, block.offset + 4)? as usize;
    if count == 0 {
        return Ok(Vec::new());
    }

    let mut meshes = Vec::new();
    let mut pos = block.offset + offset;
    for _ in 0..count {
        let string_offset_pos = pos + 8;
        let string_rel = data
            .get(string_offset_pos..string_offset_pos + 8)
            .map(|b| i64::from_le_bytes(b.try_into().unwrap()))
            .ok_or_else(|| Source2Error::Resource("RERL string offset out of bounds".into()))?;
        if string_rel >= 0 {
            let string_pos = (string_offset_pos as i64 + string_rel) as usize;
            if let Some(bytes) = data.get(string_pos..) {
                let end = bytes.iter().position(|b| *b == 0).unwrap_or(bytes.len());
                let name = String::from_utf8_lossy(&bytes[..end]).replace('\\', "/");
                if name.ends_with(".vmesh_c") {
                    meshes.push(name);
                } else if name.ends_with(".vmesh") {
                    meshes.push(format!("{name}_c"));
                }
            }
        }
        pos += 16;
    }
    Ok(meshes)
}

pub(crate) fn normalize_mesh_ref(path: &str) -> Option<String> {
    let normalized = path.replace('\\', "/");
    if normalized.ends_with(".vmesh_c") {
        Some(normalized)
    } else if normalized.ends_with(".vmesh") {
        Some(format!("{normalized}_c"))
    } else {
        None
    }
}

pub fn model_referenced_meshes(res: &Resource) -> Result<Vec<String>> {
    let Some(data) = res.block_bytes("DATA").map(crate::kv3::parse).transpose()? else {
        return Ok(Vec::new());
    };
    Ok(data
        .get("m_refMeshes")
        .and_then(KvValue::as_array)
        .unwrap_or(&[])
        .iter()
        .filter_map(kv_value_string)
        .filter_map(|path| normalize_mesh_ref(&path))
        .collect())
}

pub fn model_mesh_bone_remap(res: &Resource, mesh_index: usize) -> Result<Option<Vec<u16>>> {
    let Some(data) = res.block_bytes("DATA").map(crate::kv3::parse).transpose()? else {
        return Ok(None);
    };
    let starts = data
        .get("m_remappingTableStarts")
        .and_then(KvValue::as_array)
        .unwrap_or(&[]);
    if starts.len() <= mesh_index {
        return Ok(None);
    }
    let table = data
        .get("m_remappingTable")
        .and_then(KvValue::as_array)
        .unwrap_or(&[]);
    let start = kv_array_usize(starts, mesh_index)?;
    let end = if starts.len() > mesh_index + 1 {
        kv_array_usize(starts, mesh_index + 1)?
    } else {
        table.len()
    };
    if start > end || end > table.len() {
        return Err(Source2Error::Resource(
            "model mesh bone remap is out of bounds".into(),
        ));
    }

    table[start..end]
        .iter()
        .map(|value| {
            value
                .as_i64()
                .and_then(|value| u16::try_from(value).ok())
                .ok_or_else(|| Source2Error::Resource("bone remap value is not u16".into()))
        })
        .collect::<Result<Vec<_>>>()
        .map(Some)
}

pub fn referenced_materials(res: &Resource) -> Vec<String> {
    let mut materials = Vec::new();

    if let Some(mesh_data) = res
        .block_bytes("DATA")
        .and_then(|bytes| crate::kv3::parse(bytes).ok())
    {
        material_paths_from_mesh_data(&mesh_data, &mut materials);
    }

    let Some(ctrl) = res.block_bytes("CTRL") else {
        return materials;
    };
    let Ok(root) = crate::kv3::parse(ctrl) else {
        return materials;
    };
    let Some(meshes) = root.get("embedded_meshes").and_then(KvValue::as_array) else {
        return materials;
    };

    let mut selected_meshes = meshes
        .iter()
        .filter(|mesh| {
            let name = kv_string(mesh, "m_Name")
                .or_else(|| kv_string(mesh, "name"))
                .unwrap_or_else(|| "mesh".into());
            !is_lod_mesh(&name)
        })
        .collect::<Vec<_>>();
    if selected_meshes.is_empty() {
        selected_meshes = meshes.iter().collect();
    }

    for mesh in selected_meshes {
        if let Some(mesh_data) = kv_usize(mesh, "m_nDataBlock")
            .or_else(|| kv_usize(mesh, "data_block"))
            .and_then(|index| block_value(res, index))
        {
            material_paths_from_mesh_data(&mesh_data, &mut materials);
        }
    }

    materials
}
