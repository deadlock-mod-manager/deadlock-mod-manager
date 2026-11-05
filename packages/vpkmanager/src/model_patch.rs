//! Add rigid skinned patches without rebuilding a hero's skeleton, animation or physics.
mod material;
use crate::{
    error::{Result, VpkManagerError},
    source2::{
        kv3::{self, Encoding, EncodingChildren, Value},
        resource::{Resource, build_resource_with_tail},
    },
};
pub use material::{PatchMaterial, material};
use std::collections::BTreeMap;

#[derive(Clone)]
pub struct PatchVertex {
    pub position: [f32; 3],
    pub normal: [f32; 3],
    pub tangent: [f32; 4],
    pub uv: [f32; 2],
}

pub struct AttachedPatch<'a> {
    pub host_material: &'a str,
    pub material: &'a str,
    pub bone: &'a str,
    pub vertices: &'a [PatchVertex],
    pub indices: &'a [u16],
}

fn invalid(message: impl Into<String>) -> VpkManagerError {
    VpkManagerError::Invalid(message.into())
}
fn array<'a>(value: &'a Value, key: &str) -> Result<&'a [Value]> {
    value
        .get(key)
        .and_then(Value::as_array)
        .ok_or_else(|| invalid(format!("Missing patch mesh array: {key}")))
}
fn set(value: &mut Value, key: &str, next: Value) -> Result<()> {
    *value
        .get_mut(key)
        .ok_or_else(|| invalid(format!("Missing patch mesh field: {key}")))? = next;
    Ok(())
}
fn number(value: usize) -> Value {
    Value::Int(value as i64)
}
fn equivalent(left: &Value, right: &Value) -> bool {
    if left == right {
        return true;
    }
    match (left, right) {
        (Value::Array(a), Value::Array(b)) => {
            a.len() == b.len() && a.iter().zip(b).all(|(a, b)| equivalent(a, b))
        }
        (Value::Object(a), Value::Object(b)) => {
            a.len() == b.len()
                && a.iter()
                    .zip(b)
                    .all(|((ka, a), (kb, b))| ka == kb && equivalent(a, b))
        }
        (Value::Int(a), Value::UInt(b)) | (Value::UInt(b), Value::Int(a)) => {
            u64::try_from(*a).ok() == Some(*b)
        }
        _ => false,
    }
}
fn flags_preserved(expected: &Encoding, actual: &Encoding) -> bool {
    if expected.flag() != actual.flag() || expected.is_float() != actual.is_float() {
        return false;
    }
    match (&expected.children, &actual.children) {
        (EncodingChildren::None, EncodingChildren::None) => true,
        (EncodingChildren::Array(a), EncodingChildren::Array(b)) => {
            a.len() == b.len() && a.iter().zip(b).all(|(a, b)| flags_preserved(a, b))
        }
        (EncodingChildren::Object(a), EncodingChildren::Object(b)) => {
            a.len() == b.len()
                && a.iter()
                    .zip(b)
                    .all(|((ka, a), (kb, b))| ka == kb && flags_preserved(a, b))
        }
        _ => false,
    }
}
fn push(
    value: &mut Value,
    encoding: &mut Encoding,
    key: &str,
    item: Value,
    shape: Encoding,
) -> Result<usize> {
    let Some(Value::Array(items)) = value.get_mut(key) else {
        return Err(invalid(format!("Invalid patch array: {key}")));
    };
    let Some(Encoding {
        children: EncodingChildren::Array(metadata),
        ..
    }) = encoding.get_mut(key)
    else {
        return Err(invalid("Missing patch array encoding"));
    };
    let index = items.len();
    items.push(item);
    metadata.push(shape);
    Ok(index)
}
fn encode(value: &Value, shape: &Encoding, original: &[u8]) -> Result<Vec<u8>> {
    let output =
        kv3::wire::encode_preserving_v5(value, shape, &kv3::Format::from_payload(original)?)?;
    let (decoded, metadata) = kv3::decode_preserving(&output)?;
    if !equivalent(&decoded, value) || !flags_preserved(shape, &metadata) {
        return Err(invalid(
            "Attached patch failed resource encoding verification",
        ));
    }
    Ok(output)
}

/// Each patch is inserted in every host-material LOD using that mesh's existing bone palette.
pub fn attach(model: &[u8], patches: &[AttachedPatch<'_>]) -> Result<Vec<u8>> {
    if patches.is_empty() {
        return Ok(model.to_vec());
    }
    if patches.len() > 16 {
        return Err(invalid("A model supports at most 16 attached patches"));
    }
    let resource = Resource::parse(model)?;
    let end = resource
        .blocks()
        .iter()
        .map(|b| b.offset as usize + b.size as usize)
        .max()
        .unwrap_or(0);
    if model[end..].len() > 15 || model[end..].iter().any(|b| *b != 0) {
        return Err(invalid(
            "Attached patches do not support external model stream data",
        ));
    }
    let ctrl_index = resource
        .blocks()
        .iter()
        .position(|b| b.kind == *b"CTRL")
        .ok_or_else(|| invalid("Model has no embedded mesh registry"))?;
    let original_ctrl = resource
        .get_block_by_index(ctrl_index)
        .ok_or_else(|| invalid("Missing model mesh registry"))?;
    let (mut ctrl, mut ctrl_shape) = kv3::decode_preserving(original_ctrl)?;
    let mesh_count = array(&ctrl, "embedded_meshes")?.len();
    let mut replacements = BTreeMap::new();
    let mut extra: Vec<([u8; 4], Vec<u8>)> = Vec::new();
    for patch in patches {
        if patch.vertices.len() < 3
            || patch.vertices.len() > 4096
            || patch.indices.is_empty()
            || !patch.indices.len().is_multiple_of(3)
            || patch.indices.len() > 24576
            || patch
                .indices
                .iter()
                .any(|i| usize::from(*i) >= patch.vertices.len())
            || patch.vertices.iter().any(|v| {
                v.position
                    .iter()
                    .chain(&v.normal)
                    .chain(&v.tangent)
                    .chain(&v.uv)
                    .any(|v| !v.is_finite())
            })
            || !patch.material.starts_with("materials/")
            || !patch.material.ends_with(".vmat")
            || patch
                .material
                .split('/')
                .any(|part| part.is_empty() || part == ".." || part == ".")
            || patch.material.contains('\\')
            || patch.material.contains(':')
        {
            return Err(invalid("Invalid attached patch geometry or material"));
        }
        let mut found = 0;
        for mesh_index in 0..mesh_count {
            let Some(Value::Array(meshes)) = ctrl.get_mut("embedded_meshes") else {
                unreachable!()
            };
            let mesh = &mut meshes[mesh_index];
            let mesh_shape = ctrl_shape
                .get_mut("embedded_meshes")
                .and_then(Encoding::as_array_mut)
                .and_then(|v| v.get_mut(mesh_index))
                .ok_or_else(|| invalid("Missing embedded mesh encoding"))?;
            let block = match mesh.get("m_nDataBlock") {
                Some(Value::Int(v)) => usize::try_from(*v).ok(),
                Some(Value::UInt(v)) => usize::try_from(*v).ok(),
                _ => None,
            }
            .ok_or_else(|| invalid("Invalid embedded mesh data block"))?;
            let original = resource
                .get_block_by_index(block)
                .ok_or_else(|| invalid("Missing embedded mesh data"))?;
            let input = replacements
                .get(&block)
                .map(Vec::as_slice)
                .unwrap_or(original);
            let (mut data, mut data_shape) = kv3::decode_preserving(input)?;
            let mut host = None;
            for (scene, object) in array(&data, "m_sceneObjects")?.iter().enumerate() {
                for (draw, call) in array(object, "m_drawCalls")?.iter().enumerate() {
                    if call
                        .get("m_material")
                        .and_then(Value::as_str)
                        .is_some_and(|m| {
                            m.trim_end_matches("_c")
                                .eq_ignore_ascii_case(patch.host_material.trim_end_matches("_c"))
                        })
                    {
                        host = Some((scene, draw));
                        break;
                    }
                }
                if host.is_some() {
                    break;
                }
            }
            let Some((scene_index, draw_index)) = host else {
                continue;
            };
            let bones = data
                .get("m_skeleton")
                .map(|v| array(v, "m_bones"))
                .transpose()?
                .unwrap_or(&[]);
            let bone = if bones.is_empty() {
                if !patch.bone.is_empty() {
                    return Err(invalid("Static patch host cannot bind an animation bone"));
                }
                None
            } else {
                Some(
                    bones
                        .iter()
                        .position(|v| {
                            v.get("m_boneName").and_then(Value::as_str) == Some(patch.bone)
                        })
                        .ok_or_else(|| {
                            invalid(format!(
                                "Patch bone {} is unavailable in LOD {mesh_index}",
                                patch.bone
                            ))
                        })?,
                )
            };
            let vertex_template = array(mesh, "m_vertexBuffers")?
                .first()
                .ok_or_else(|| invalid("Missing vertex buffer template"))?
                .clone();
            let vertex_shape = mesh_shape
                .get("m_vertexBuffers")
                .and_then(Encoding::as_array)
                .and_then(|v| v.first())
                .ok_or_else(|| invalid("Missing vertex encoding"))?
                .clone();
            let index_template = array(mesh, "m_indexBuffers")?
                .first()
                .ok_or_else(|| invalid("Missing index buffer template"))?
                .clone();
            let index_shape = mesh_shape
                .get("m_indexBuffers")
                .and_then(Encoding::as_array)
                .and_then(|v| v.first())
                .ok_or_else(|| invalid("Missing index encoding"))?
                .clone();
            let wide = bone.is_some_and(|v| v > 255);
            let stride = if wide { 72 } else { 64 };
            let mut vertex_bytes = Vec::with_capacity(patch.vertices.len() * stride);
            for vertex in patch.vertices {
                for v in vertex
                    .position
                    .iter()
                    .chain(&vertex.uv)
                    .chain(&vertex.normal)
                    .chain(&vertex.tangent)
                {
                    vertex_bytes.extend_from_slice(&v.to_le_bytes());
                }
                let bone = u16::try_from(bone.unwrap_or(0))
                    .map_err(|_| invalid("Patch bone palette exceeds 16-bit indices"))?;
                if wide {
                    vertex_bytes.extend_from_slice(&bone.to_le_bytes());
                    vertex_bytes.extend_from_slice(&[0; 14]);
                } else {
                    vertex_bytes.extend_from_slice(&[bone as u8, 0, 0, 0, 0, 0, 0, 0]);
                }
                vertex_bytes.extend_from_slice(&[255, 0, 0, 0, 0, 0, 0, 0]);
            }
            let mut vertices = vertex_template;
            let mut vertices_shape = vertex_shape;
            let field = array(&vertices, "m_inputLayoutFields")?
                .first()
                .ok_or_else(|| invalid("Missing vertex field template"))?
                .clone();
            let field_shape = vertices_shape
                .get("m_inputLayoutFields")
                .and_then(Encoding::as_array)
                .and_then(|v| v.first())
                .ok_or_else(|| invalid("Missing vertex field encoding"))?
                .clone();
            let fields = [
                ("POSITION", "PosXyz", 6, 0),
                ("TEXCOORD", "LowPrecisionUv", 16, 12),
                ("NORMAL", "Normal", 6, 20),
                ("TANGENT", "TangentU_SignV", 2, 32),
                (
                    "BLENDINDICES",
                    "BlendIndices",
                    if wide { 4 } else { 12 },
                    48,
                ),
                ("BLENDWEIGHT", "", 11, if wide { 64 } else { 56 }),
            ];
            let mut layout = Vec::new();
            let mut shapes = Vec::new();
            for (semantic, shader, format, offset) in
                fields.into_iter().take(if bone.is_some() { 6 } else { 4 })
            {
                let mut item = field.clone();
                set(&mut item, "m_pSemanticName", Value::String(semantic.into()))?;
                set(
                    &mut item,
                    "m_szShaderSemantic",
                    Value::String(shader.into()),
                )?;
                set(&mut item, "m_Format", number(format))?;
                set(&mut item, "m_nOffset", number(offset))?;
                layout.push(item);
                shapes.push(field_shape.clone());
            }
            set(&mut vertices, "m_inputLayoutFields", Value::Array(layout))?;
            vertices_shape
                .get_mut("m_inputLayoutFields")
                .ok_or_else(|| invalid("Missing layout encoding"))?
                .children = EncodingChildren::Array(shapes);
            set(
                &mut vertices,
                "m_nElementCount",
                number(patch.vertices.len()),
            )?;
            set(&mut vertices, "m_nElementSizeInBytes", number(stride))?;
            set(&mut vertices, "m_bMeshoptCompressed", Value::Bool(false))?;
            set(&mut vertices, "m_bCompressedZSTD", Value::Bool(false))?;
            set(
                &mut vertices,
                "m_nBlockIndex",
                number(resource.blocks().len() + extra.len()),
            )?;
            extra.push((*b"MVTX", vertex_bytes));
            let vertex_buffer = push(
                mesh,
                mesh_shape,
                "m_vertexBuffers",
                vertices,
                vertices_shape,
            )?;
            let mut indices = index_template;
            set(&mut indices, "m_nElementCount", number(patch.indices.len()))?;
            set(&mut indices, "m_nElementSizeInBytes", number(2))?;
            set(&mut indices, "m_bMeshoptCompressed", Value::Bool(false))?;
            set(&mut indices, "m_bCompressedZSTD", Value::Bool(false))?;
            set(
                &mut indices,
                "m_nBlockIndex",
                number(resource.blocks().len() + extra.len()),
            )?;
            extra.push((
                *b"MIDX",
                patch.indices.iter().flat_map(|v| v.to_le_bytes()).collect(),
            ));
            let index_buffer = push(mesh, mesh_shape, "m_indexBuffers", indices, index_shape)?;
            let Some(Value::Array(scenes)) = data.get_mut("m_sceneObjects") else {
                unreachable!()
            };
            let scene = &mut scenes[scene_index];
            let scene_shape = data_shape
                .get_mut("m_sceneObjects")
                .and_then(Encoding::as_array_mut)
                .and_then(|v| v.get_mut(scene_index))
                .ok_or_else(|| invalid("Missing scene encoding"))?;
            let mut call = array(scene, "m_drawCalls")?[draw_index].clone();
            let call_shape = scene_shape
                .get("m_drawCalls")
                .and_then(Encoding::as_array)
                .and_then(|v| v.get(draw_index))
                .ok_or_else(|| invalid("Missing draw encoding"))?
                .clone();
            set(
                &mut call,
                "m_material",
                Value::String(patch.material.into()),
            )?;
            for (key, value) in [
                ("m_nBaseVertex", 0),
                ("m_nStartIndex", 0),
                ("m_nIndexCount", patch.indices.len()),
                ("m_nVertexCount", patch.vertices.len()),
                ("m_nAppliedIndexOffset", 0),
                ("m_nNumMeshlets", 0),
                ("m_nFirstMeshlet", 0),
            ] {
                set(&mut call, key, number(value))?;
            }
            set(
                &mut call,
                "m_bUseCompressedNormalTangent",
                Value::Bool(false),
            )?;
            let binding = |handle| {
                Value::Object(vec![
                    ("m_hBuffer".into(), number(handle)),
                    ("m_nBindOffsetBytes".into(), number(0)),
                ])
            };
            set(&mut call, "m_indexBuffer", binding(index_buffer))?;
            set(
                &mut call,
                "m_vertexBuffers",
                Value::Array(vec![binding(vertex_buffer)]),
            )?;
            push(scene, scene_shape, "m_drawCalls", call, call_shape)?;
            for (key, min) in [("m_vMinBounds", true), ("m_vMaxBounds", false)] {
                if let Some(Value::Array(bounds)) = scene.get_mut(key) {
                    for (axis, bound) in bounds.iter_mut().take(3).enumerate() {
                        if let Value::Double(current) = bound {
                            for v in patch.vertices {
                                *current = if min {
                                    current.min(f64::from(v.position[axis]))
                                } else {
                                    current.max(f64::from(v.position[axis]))
                                };
                            }
                        }
                    }
                }
            }
            replacements.insert(block, encode(&data, &data_shape, original)?);
            found += 1;
        }
        if found == 0 {
            return Err(invalid(
                "Patch host material is not drawn by an embedded model mesh",
            ));
        }
    }
    replacements.insert(ctrl_index, encode(&ctrl, &ctrl_shape, original_ctrl)?);
    let mut blocks = resource
        .blocks()
        .iter()
        .enumerate()
        .map(|(i, b)| {
            (
                b.kind,
                replacements.get(&i).map(Vec::as_slice).unwrap_or_else(|| {
                    resource
                        .get_block_by_index(i)
                        .expect("validated resource block")
                }),
            )
        })
        .collect::<Vec<_>>();
    blocks.extend(extra.iter().map(|(kind, bytes)| (*kind, bytes.as_slice())));
    let output = build_resource_with_tail(&blocks, &[], u16::from_le_bytes([model[6], model[7]]))?;
    let additions = patches
        .iter()
        .map(|p| {
            Ok((
                crate::resource_id::resource_id(p.material)?,
                format!("{}_c", p.material),
            ))
        })
        .collect::<Result<Vec<_>>>()?;
    let output = crate::material_repair::add_references(&output, &additions)
        .map_err(|e| invalid(e.to_string()))?;
    let check = Resource::parse(&output)?;
    for (i, block) in resource.blocks().iter().enumerate() {
        if !replacements.contains_key(&i)
            && block.kind != *b"RERL"
            && resource.get_block_by_index(i) != check.get_block_by_index(i)
        {
            return Err(invalid("Attached patch changed an unrelated model block"));
        }
    }
    Ok(output)
}

#[cfg(test)]
mod tests;
