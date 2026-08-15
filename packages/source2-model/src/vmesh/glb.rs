use super::*;
use crate::error::{Result, Source2Error};
use crate::resource::Resource;
use crate::skeleton::{Skeleton, parse_model_skeleton};
use serde_json::json;
use std::collections::HashMap;

pub fn rebind_render_model_to_skeleton_by_name(
    model: &mut RenderModel,
    target_skeleton: Skeleton,
) -> Result<()> {
    let Some(source_skeleton) = model.skeleton.as_ref() else {
        model.skeleton = Some(target_skeleton);
        return Ok(());
    };

    let target_indices = target_skeleton
        .bones
        .iter()
        .enumerate()
        .map(|(index, bone)| (bone.name.to_ascii_lowercase(), index as u16))
        .collect::<HashMap<_, _>>();
    let mut remap = Vec::with_capacity(source_skeleton.bones.len());
    for bone in &source_skeleton.bones {
        remap.push(
            target_indices
                .get(&bone.name.to_ascii_lowercase())
                .copied()
                .unwrap_or(0),
        );
    }

    for primitive in &mut model.primitives {
        let Some(joints) = primitive.joints.as_mut() else {
            continue;
        };
        for joint in joints {
            *joint = remap.get(*joint as usize).copied().unwrap_or(0);
        }
    }
    model.skeleton = Some(target_skeleton);
    Ok(())
}

pub(crate) fn write_index_bytes(indices: &[u32], vertex_count: usize) -> (Vec<u8>, u32) {
    if vertex_count <= u16::MAX as usize {
        let mut bytes = Vec::with_capacity(indices.len() * 2);
        for index in indices {
            bytes.extend_from_slice(&(*index as u16).to_le_bytes());
        }
        (bytes, GL_UNSIGNED_SHORT)
    } else {
        let mut bytes = Vec::with_capacity(indices.len() * 4);
        for index in indices {
            bytes.extend_from_slice(&index.to_le_bytes());
        }
        (bytes, GL_UNSIGNED_INT)
    }
}

pub(crate) fn write_f32_slice(out: &mut Vec<u8>, values: &[f32]) {
    for value in values {
        out.extend_from_slice(&value.to_le_bytes());
    }
}

pub(crate) fn write_u16_slice(out: &mut Vec<u8>, values: &[u16]) {
    for value in values {
        out.extend_from_slice(&value.to_le_bytes());
    }
}

pub(crate) fn write_mat4_slice(out: &mut Vec<u8>, values: &[[f32; 16]]) {
    for matrix in values {
        write_f32_slice(out, matrix);
    }
}

pub(crate) fn vec3_min_max(values: &[f32]) -> ([f32; 3], [f32; 3]) {
    let mut min = [f32::MAX; 3];
    let mut max = [f32::MIN; 3];
    for chunk in values.chunks_exact(3) {
        for i in 0..3 {
            min[i] = min[i].min(chunk[i]);
            max[i] = max[i].max(chunk[i]);
        }
    }
    (min, max)
}

fn append_png_texture(
    bin: &mut Vec<u8>,
    buffer_views: &mut Vec<serde_json::Value>,
    images: &mut Vec<serde_json::Value>,
    texture_defs: &mut Vec<serde_json::Value>,
    png: &[u8],
    name: &str,
) -> usize {
    let offset = bin.len();
    bin.extend_from_slice(png);
    push_padding(bin, 0);
    let view_index = buffer_views.len();
    buffer_views.push(json!({
        "buffer": 0,
        "byteOffset": offset,
        "byteLength": png.len()
    }));
    let image_index = images.len();
    images.push(json!({
        "bufferView": view_index,
        "mimeType": "image/png",
        "name": name
    }));
    let texture_index = texture_defs.len();
    texture_defs.push(json!({ "sampler": 0, "source": image_index }));
    texture_index
}

pub(crate) fn build_glb(
    primitives: &[GlbPrimitive<'_>],
    textures: &[PreviewTexture],
    skeleton: Option<&Skeleton>,
) -> Result<Vec<u8>> {
    if primitives.is_empty() {
        return Err(Source2Error::Resource("no drawable primitives".into()));
    }

    let mut bin = Vec::new();
    let mut buffer_views = Vec::new();
    let mut accessors = Vec::new();
    let mut gltf_primitives = Vec::with_capacity(primitives.len());
    let has_skinning = skeleton.is_some()
        && primitives.iter().any(|primitive| {
            let vertex_count = primitive.positions.len() / 3;
            primitive
                .joints
                .is_some_and(|values| matches!(values.len() / vertex_count.max(1), 4 | 8))
                && primitive
                    .weights
                    .is_some_and(|values| matches!(values.len() / vertex_count.max(1), 4 | 8))
        });

    for primitive in primitives {
        let vertex_count = primitive.positions.len() / 3;
        let index_size = if primitive.index_component == GL_UNSIGNED_SHORT {
            2
        } else {
            4
        };
        let index_count = primitive.indices.len() / index_size;

        let position_offset = bin.len();
        write_f32_slice(&mut bin, primitive.positions);
        push_padding(&mut bin, 0);
        let position_view = buffer_views.len();
        buffer_views.push(json!({
            "buffer": 0,
            "byteOffset": position_offset,
            "byteLength": primitive.positions.len() * 4,
            "target": GL_ARRAY_BUFFER
        }));
        let position_accessor = accessors.len();
        let (min, max) = vec3_min_max(primitive.positions);
        accessors.push(json!({
            "bufferView": position_view,
            "componentType": GL_FLOAT,
            "count": vertex_count,
            "type": "VEC3",
            "min": min,
            "max": max
        }));

        let mut attributes = json!({ "POSITION": position_accessor });
        if let Some(normal_values) = primitive
            .normals
            .filter(|values| values.len() == vertex_count * 3)
        {
            let offset = bin.len();
            write_f32_slice(&mut bin, normal_values);
            push_padding(&mut bin, 0);
            let view_index = buffer_views.len();
            buffer_views.push(json!({
                "buffer": 0,
                "byteOffset": offset,
                "byteLength": normal_values.len() * 4,
                "target": GL_ARRAY_BUFFER
            }));
            let accessor_index = accessors.len();
            accessors.push(json!({
                "bufferView": view_index,
                "componentType": GL_FLOAT,
                "count": vertex_count,
                "type": "VEC3"
            }));
            attributes["NORMAL"] = json!(accessor_index);
        }
        if let Some(texcoord_values) = primitive
            .texcoords
            .filter(|values| values.len() == vertex_count * 2)
        {
            let offset = bin.len();
            write_f32_slice(&mut bin, texcoord_values);
            push_padding(&mut bin, 0);
            let view_index = buffer_views.len();
            buffer_views.push(json!({
                "buffer": 0,
                "byteOffset": offset,
                "byteLength": texcoord_values.len() * 4,
                "target": GL_ARRAY_BUFFER
            }));
            let accessor_index = accessors.len();
            accessors.push(json!({
                "bufferView": view_index,
                "componentType": GL_FLOAT,
                "count": vertex_count,
                "type": "VEC2"
            }));
            attributes["TEXCOORD_0"] = json!(accessor_index);
        }
        let joint_stride = primitive
            .joints
            .map_or(0, |values| values.len() / vertex_count.max(1));
        let weight_stride = primitive
            .weights
            .map_or(0, |values| values.len() / vertex_count.max(1));
        if has_skinning {
            let offset = bin.len();
            let byte_length = vertex_count * 4 * 2;
            for vertex in 0..vertex_count {
                if let Some(values) = primitive.joints
                    && matches!(joint_stride, 4 | 8)
                {
                    let start = vertex * joint_stride;
                    write_u16_slice(&mut bin, &values[start..start + 4]);
                } else {
                    write_u16_slice(&mut bin, &[0; 4]);
                }
            }
            push_padding(&mut bin, 0);
            let view_index = buffer_views.len();
            buffer_views.push(json!({
                "buffer": 0,
                "byteOffset": offset,
                "byteLength": byte_length,
                "target": GL_ARRAY_BUFFER
            }));
            let accessor_index = accessors.len();
            accessors.push(json!({
                "bufferView": view_index,
                "componentType": GL_UNSIGNED_SHORT,
                "count": vertex_count,
                "type": "VEC4"
            }));
            attributes["JOINTS_0"] = json!(accessor_index);
        }
        if has_skinning {
            let offset = bin.len();
            let byte_length = vertex_count * 4 * 4;
            for vertex in 0..vertex_count {
                if let Some(values) = primitive.weights
                    && matches!(weight_stride, 4 | 8)
                {
                    let start = vertex * weight_stride;
                    write_f32_slice(&mut bin, &values[start..start + 4]);
                } else {
                    write_f32_slice(&mut bin, &[1.0, 0.0, 0.0, 0.0]);
                }
            }
            push_padding(&mut bin, 0);
            let view_index = buffer_views.len();
            buffer_views.push(json!({
                "buffer": 0,
                "byteOffset": offset,
                "byteLength": byte_length,
                "target": GL_ARRAY_BUFFER
            }));
            let accessor_index = accessors.len();
            accessors.push(json!({
                "bufferView": view_index,
                "componentType": GL_FLOAT,
                "count": vertex_count,
                "type": "VEC4"
            }));
            attributes["WEIGHTS_0"] = json!(accessor_index);

            if joint_stride == 8 && weight_stride == 8 {
                let joint_offset = bin.len();
                for vertex in 0..vertex_count {
                    let start = vertex * joint_stride + 4;
                    write_u16_slice(&mut bin, &primitive.joints.unwrap()[start..start + 4]);
                }
                push_padding(&mut bin, 0);
                let joint_view = buffer_views.len();
                buffer_views.push(json!({
                    "buffer": 0,
                    "byteOffset": joint_offset,
                    "byteLength": vertex_count * 4 * 2,
                    "target": GL_ARRAY_BUFFER
                }));
                let joint_accessor = accessors.len();
                accessors.push(json!({
                    "bufferView": joint_view,
                    "componentType": GL_UNSIGNED_SHORT,
                    "count": vertex_count,
                    "type": "VEC4"
                }));
                attributes["JOINTS_1"] = json!(joint_accessor);

                let weight_offset = bin.len();
                for vertex in 0..vertex_count {
                    let start = vertex * weight_stride + 4;
                    write_f32_slice(&mut bin, &primitive.weights.unwrap()[start..start + 4]);
                }
                push_padding(&mut bin, 0);
                let weight_view = buffer_views.len();
                buffer_views.push(json!({
                    "buffer": 0,
                    "byteOffset": weight_offset,
                    "byteLength": vertex_count * 4 * 4,
                    "target": GL_ARRAY_BUFFER
                }));
                let weight_accessor = accessors.len();
                accessors.push(json!({
                    "bufferView": weight_view,
                    "componentType": GL_FLOAT,
                    "count": vertex_count,
                    "type": "VEC4"
                }));
                attributes["WEIGHTS_1"] = json!(weight_accessor);
            }
        }

        let index_offset = bin.len();
        bin.extend_from_slice(primitive.indices);
        push_padding(&mut bin, 0);
        let index_view = buffer_views.len();
        buffer_views.push(json!({
            "buffer": 0,
            "byteOffset": index_offset,
            "byteLength": primitive.indices.len(),
            "target": GL_ELEMENT_ARRAY_BUFFER
        }));
        let index_accessor = accessors.len();
        accessors.push(json!({
            "bufferView": index_view,
            "componentType": primitive.index_component,
            "count": index_count,
            "type": "SCALAR"
        }));

        let material = if primitive.material <= textures.len() {
            primitive.material
        } else {
            0
        };
        gltf_primitives.push(json!({
            "attributes": attributes,
            "indices": index_accessor,
            "material": material,
            "mode": 4
        }));
    }

    let mut images = Vec::with_capacity(textures.len() * 4);
    let mut texture_defs = Vec::with_capacity(textures.len() * 4);
    let texture_indices = textures
        .iter()
        .map(|texture| {
            let base = append_png_texture(
                &mut bin,
                &mut buffer_views,
                &mut images,
                &mut texture_defs,
                &texture.png,
                &texture.name,
            );
            let normal = texture.normal_png.as_deref().map(|png| {
                append_png_texture(
                    &mut bin,
                    &mut buffer_views,
                    &mut images,
                    &mut texture_defs,
                    png,
                    &format!("{} normal", texture.name),
                )
            });
            let orm = texture.orm_png.as_deref().map(|png| {
                append_png_texture(
                    &mut bin,
                    &mut buffer_views,
                    &mut images,
                    &mut texture_defs,
                    png,
                    &format!("{} orm", texture.name),
                )
            });
            let emissive = texture.emissive_png.as_deref().map(|png| {
                append_png_texture(
                    &mut bin,
                    &mut buffer_views,
                    &mut images,
                    &mut texture_defs,
                    png,
                    &format!("{} emissive", texture.name),
                )
            });
            (base, normal, orm, emissive)
        })
        .collect::<Vec<_>>();

    let mut materials = vec![json!({
        "pbrMetallicRoughness": {
            "baseColorFactor": [0.72, 0.70, 0.66, 1.0],
            "metallicFactor": 0.0,
            "roughnessFactor": 0.82
        },
        "doubleSided": true
    })];
    for (texture, (base, normal, orm, emissive)) in textures.iter().zip(&texture_indices) {
        let alpha_mode = match texture.alpha_mode {
            MaterialAlphaMode::Opaque => "OPAQUE",
            MaterialAlphaMode::Mask => "MASK",
            MaterialAlphaMode::Blend => "BLEND",
        };
        let mut material = json!({
            "name": texture.name,
            "alphaMode": alpha_mode,
            "alphaCutoff": texture.alpha_cutoff,
            "pbrMetallicRoughness": {
                "baseColorFactor": texture.base_color_factor,
                "baseColorTexture": { "index": base },
                "metallicFactor": 0.0,
                "roughnessFactor": 0.8
            },
            "doubleSided": true
        });
        if let Some(normal) = normal {
            material["normalTexture"] = json!({ "index": normal });
        }
        if let Some(orm) = orm {
            // The packed texture drives occlusion (R) and roughness (G) detail, but
            // its blue channel is not reliably glTF-style metalness for Source 2 hero
            // "mask" textures. Keep metalness at the material's declared value (0 for
            // non-metals) so metalness = metallicFactor * B stays 0 and skin/cloth no
            // longer reads as oily chrome. See ValveResourceFormat GltfModelExporter.
            material["occlusionTexture"] = json!({ "index": orm });
            material["pbrMetallicRoughness"]["metallicRoughnessTexture"] = json!({ "index": orm });
            material["pbrMetallicRoughness"]["metallicFactor"] = json!(texture.metalness_factor);
            material["pbrMetallicRoughness"]["roughnessFactor"] = json!(1.0);
        }
        if let Some(emissive_factor) = texture.emissive_factor {
            material["emissiveFactor"] = json!(emissive_factor);
            if let Some(emissive) = emissive {
                material["emissiveTexture"] = json!({ "index": emissive });
            }
        }
        materials.push(material);
    }

    let mut scene_nodes = vec![0usize];
    let (nodes, skin) = if let Some(skeleton) = skeleton.filter(|_| has_skinning) {
        let inverse_bind_offset = bin.len();
        write_mat4_slice(&mut bin, &skeleton.inverse_bind_matrices);
        push_padding(&mut bin, 0);
        let inverse_bind_view = buffer_views.len();
        buffer_views.push(json!({
            "buffer": 0,
            "byteOffset": inverse_bind_offset,
            "byteLength": skeleton.inverse_bind_matrices.len() * 16 * 4
        }));
        let inverse_bind_accessor = accessors.len();
        accessors.push(json!({
            "bufferView": inverse_bind_view,
            "componentType": GL_FLOAT,
            "count": skeleton.inverse_bind_matrices.len(),
            "type": "MAT4"
        }));

        let mut child_indices = vec![Vec::<usize>::new(); skeleton.bones.len()];
        let mut root_nodes = Vec::new();
        for (bone_index, bone) in skeleton.bones.iter().enumerate() {
            let node_index = bone_index + 1;
            if bone.parent >= 0 {
                let parent_index = bone.parent as usize;
                if let Some(children) = child_indices.get_mut(parent_index) {
                    children.push(node_index);
                }
            } else {
                root_nodes.push(node_index);
            }
        }
        scene_nodes.extend(root_nodes.iter().copied());

        let mut nodes = vec![json!({
            "mesh": 0,
            "skin": 0
        })];
        for (bone_index, bone) in skeleton.bones.iter().enumerate() {
            let mut node = json!({
                "name": bone.name,
                "translation": bone.bind_pos,
                "rotation": bone.bind_rot,
                "scale": bone.bind_scale
            });
            if !child_indices[bone_index].is_empty() {
                node["children"] = json!(child_indices[bone_index]);
            }
            nodes.push(node);
        }

        let joint_nodes = (0..skeleton.bones.len())
            .map(|bone_index| bone_index + 1)
            .collect::<Vec<_>>();
        let mut skin = json!({
            "inverseBindMatrices": inverse_bind_accessor,
            "joints": joint_nodes
        });
        if let Some(root_node) = root_nodes.first() {
            skin["skeleton"] = json!(root_node);
        }

        (nodes, Some(skin))
    } else {
        (vec![json!({ "mesh": 0 })], None)
    };

    let mut gltf = json!({
        "asset": { "version": "2.0", "generator": "Open VPKRender" },
        "scene": 0,
        "scenes": [{ "nodes": scene_nodes }],
        "nodes": nodes,
        "materials": materials,
        "meshes": [{
            "primitives": gltf_primitives
        }],
        "buffers": [{ "byteLength": bin.len() }],
        "bufferViews": buffer_views,
        "accessors": accessors
    });
    if let Some(skin) = skin {
        gltf["skins"] = json!([skin]);
    }
    if !textures.is_empty() {
        gltf["samplers"] = json!([{
            "magFilter": 9729,
            "minFilter": 9729,
            "wrapS": 10497,
            "wrapT": 10497
        }]);
        gltf["images"] = json!(images);
        gltf["textures"] = json!(texture_defs);
    }

    let mut json_bytes =
        serde_json::to_vec(&gltf).map_err(|e| Source2Error::Decode(format!("glTF json: {e}")))?;
    push_padding(&mut json_bytes, b' ');

    let total_len = 12 + 8 + json_bytes.len() + 8 + bin.len();
    let mut glb = Vec::with_capacity(total_len);
    glb.extend_from_slice(&0x4654_6c67u32.to_le_bytes());
    glb.extend_from_slice(&2u32.to_le_bytes());
    glb.extend_from_slice(&(total_len as u32).to_le_bytes());
    glb.extend_from_slice(&(json_bytes.len() as u32).to_le_bytes());
    glb.extend_from_slice(&0x4e4f_534au32.to_le_bytes());
    glb.extend_from_slice(&json_bytes);
    glb.extend_from_slice(&(bin.len() as u32).to_le_bytes());
    glb.extend_from_slice(&0x004e_4942u32.to_le_bytes());
    glb.extend_from_slice(&bin);
    Ok(glb)
}

pub(crate) fn model_from_decoded_primitives(
    decoded: &[DecodedPrimitive],
    preview_textures: &[PreviewTexture],
    skeleton: Option<&Skeleton>,
) -> Result<ModelGlb> {
    let glb_primitives = decoded
        .iter()
        .map(|primitive| GlbPrimitive {
            positions: &primitive.positions,
            normals: primitive.normals.as_deref(),
            texcoords: primitive.texcoords.as_deref(),
            joints: primitive.joints.as_deref(),
            weights: primitive.weights.as_deref(),
            indices: &primitive.indices,
            index_component: primitive.index_component,
            material: primitive.material,
        })
        .collect::<Vec<_>>();
    let vertex_count = decoded
        .iter()
        .map(|primitive| primitive.positions.len() / 3)
        .sum::<usize>();
    let index_count = decoded
        .iter()
        .map(|primitive| primitive.index_count)
        .sum::<usize>();
    let glb = build_glb(&glb_primitives, preview_textures, skeleton)?;
    Ok(ModelGlb {
        vertex_count: vertex_count as u32,
        index_count: index_count as u32,
        glb,
    })
}

pub fn decode_mesh_glb_from_resource(
    res: &Resource,
    preview_textures: &[PreviewTexture],
) -> Result<ModelGlb> {
    let skeleton = parse_model_skeleton(res)?;
    decode_mesh_glb_from_resource_with_skeleton(res, preview_textures, skeleton.as_ref(), None)
}

pub(crate) fn decode_mesh_glb_from_resource_with_skeleton(
    res: &Resource,
    preview_textures: &[PreviewTexture],
    skeleton: Option<&Skeleton>,
    bone_remap: Option<&[u16]>,
) -> Result<ModelGlb> {
    let vbib_bytes = res
        .block_bytes("VBIB")
        .ok_or_else(|| Source2Error::Resource("no VBIB block".into()))?;
    let vbib = parse_vbib(vbib_bytes)?;
    if let Some(mesh_data) = res
        .block_bytes("DATA")
        .and_then(|bytes| crate::kv3::parse(bytes).ok())
    {
        let mut decoded = decode_drawcall_primitives(&vbib, &mesh_data, preview_textures)?;
        apply_bone_remap_to_primitives(&mut decoded, bone_remap);
        if !decoded.is_empty() {
            return model_from_decoded_primitives(&decoded, preview_textures, skeleton);
        }
    }

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
            read_skinning(vertex_buffer, joint_field, vertex_buffer, weight_field, 4).ok()
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

    let mut decoded = DecodedPrimitive {
        positions,
        normals,
        texcoords,
        joints,
        weights,
        indices: indices[..index_count
            * if index_component == GL_UNSIGNED_SHORT {
                2
            } else {
                4
            }]
            .to_vec(),
        index_component,
        index_count,
        material: usize::from(!preview_textures.is_empty()),
        mesh_group_mask: u64::MAX,
    };
    apply_bone_remap(&mut decoded, bone_remap);
    let primitive = GlbPrimitive {
        positions: &decoded.positions,
        normals: decoded.normals.as_deref(),
        texcoords: decoded.texcoords.as_deref(),
        joints: decoded.joints.as_deref(),
        weights: decoded.weights.as_deref(),
        indices: &decoded.indices,
        index_component: decoded.index_component,
        material: decoded.material,
    };
    let glb = build_glb(&[primitive], preview_textures, skeleton)?;
    Ok(ModelGlb {
        vertex_count: vertex_buffer.element_count as u32,
        index_count: index_count as u32,
        glb,
    })
}
