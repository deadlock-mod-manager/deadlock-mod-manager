use std::collections::HashMap;

use serde_json::json;

use crate::error::{Result, Source2Error};
use crate::kv3::KvValue;
use crate::resource::Resource;

const FORMAT_R32G32B32_FLOAT: u32 = 6;
const FORMAT_R32G32_FLOAT: u32 = 16;
const FORMAT_R8G8B8A8_UNORM: u32 = 28;
const FORMAT_R16G16_FLOAT: u32 = 34;
const FORMAT_R16G16_UNORM: u32 = 35;
const FORMAT_R16G16_SNORM: u32 = 37;
const FORMAT_R32_UINT: u32 = 42;
const GL_FLOAT: u32 = 5126;
const GL_UNSIGNED_SHORT: u32 = 5123;
const GL_UNSIGNED_INT: u32 = 5125;
const GL_ARRAY_BUFFER: u32 = 34962;
const GL_ELEMENT_ARRAY_BUFFER: u32 = 34963;

#[derive(Debug, Clone)]
struct LayoutField {
    semantic_name: String,
    format: u32,
    offset: usize,
}

#[derive(Debug)]
struct BufferData {
    element_count: usize,
    element_size: usize,
    fields: Vec<LayoutField>,
    data: Vec<u8>,
}

#[derive(Debug)]
struct Vbib {
    vertex_buffers: Vec<BufferData>,
    index_buffers: Vec<BufferData>,
}

pub struct ModelGlb {
    pub vertex_count: u32,
    pub index_count: u32,
    pub glb: Vec<u8>,
}

pub struct PreviewTexture {
    pub name: String,
    pub material: Option<String>,
    pub png: Vec<u8>,
}

struct GlbPrimitive<'a> {
    positions: &'a [f32],
    normals: Option<&'a [f32]>,
    texcoords: Option<&'a [f32]>,
    indices: &'a [u8],
    index_component: u32,
    material: usize,
}

struct DecodedPrimitive {
    positions: Vec<f32>,
    normals: Option<Vec<f32>>,
    texcoords: Option<Vec<f32>>,
    indices: Vec<u8>,
    index_component: u32,
    index_count: usize,
    material: usize,
}

struct DrawCall {
    material: Option<String>,
    index_buffer: usize,
    vertex_buffers: Vec<usize>,
    base_vertex: usize,
    start_index: usize,
    index_count: usize,
}

struct VertexSet {
    positions: Vec<f32>,
    normals: Option<Vec<f32>>,
    texcoords: Option<Vec<f32>>,
}

fn read_u32(data: &[u8], pos: usize) -> Result<u32> {
    data.get(pos..pos + 4)
        .map(|b| u32::from_le_bytes(b.try_into().unwrap()))
        .ok_or_else(|| Source2Error::Resource(format!("u32 read out of bounds at {pos}")))
}

fn read_i32(data: &[u8], pos: usize) -> Result<i32> {
    data.get(pos..pos + 4)
        .map(|b| i32::from_le_bytes(b.try_into().unwrap()))
        .ok_or_else(|| Source2Error::Resource(format!("i32 read out of bounds at {pos}")))
}

fn read_f32(data: &[u8], pos: usize) -> Result<f32> {
    data.get(pos..pos + 4)
        .map(|b| f32::from_le_bytes(b.try_into().unwrap()))
        .ok_or_else(|| Source2Error::Resource(format!("f32 read out of bounds at {pos}")))
}

fn push_padding(data: &mut Vec<u8>, byte: u8) {
    while data.len() % 4 != 0 {
        data.push(byte);
    }
}

fn read_semantic(data: &[u8], pos: usize) -> Result<String> {
    let bytes = data
        .get(pos..pos + 32)
        .ok_or_else(|| Source2Error::Resource("layout semantic out of bounds".into()))?;
    let end = bytes.iter().position(|b| *b == 0).unwrap_or(bytes.len());
    Ok(String::from_utf8_lossy(&bytes[..end]).to_ascii_uppercase())
}

fn read_buffer(data: &[u8], pos: usize, is_vertex: bool) -> Result<(BufferData, usize)> {
    let element_count = read_u32(data, pos)? as usize;
    let packed_size = read_i32(data, pos + 4)?;
    let element_size = (packed_size & 0x03ff_ffff) as usize;
    let metadata_pos = pos + 8;
    let attr_offset = read_u32(data, metadata_pos)? as usize;
    let attr_count = read_u32(data, metadata_pos + 4)? as usize;
    let data_pos = pos + 16;
    let raw_data_offset = read_u32(data, data_pos)? as usize;
    let total_size = read_i32(data, data_pos + 4)?;
    if total_size < 0 {
        return Err(Source2Error::UnsupportedFormat(
            "negative mesh buffer size".into(),
        ));
    }

    let mut fields = Vec::with_capacity(attr_count);
    if is_vertex {
        let mut field_pos = metadata_pos + attr_offset;
        for _ in 0..attr_count {
            fields.push(LayoutField {
                semantic_name: read_semantic(data, field_pos)?,
                format: read_u32(data, field_pos + 36)?,
                offset: read_u32(data, field_pos + 40)? as usize,
            });
            field_pos += 56;
        }
    }

    let raw_start = data_pos + raw_data_offset;
    let raw_end = raw_start + total_size as usize;
    let expected_size = element_count
        .checked_mul(element_size)
        .ok_or_else(|| Source2Error::Resource("mesh buffer size overflow".into()))?;
    if expected_size > total_size as usize {
        return Err(Source2Error::UnsupportedFormat(
            "meshopt-compressed mesh buffers are not supported yet".into(),
        ));
    }
    let buffer_data = data
        .get(raw_start..raw_end)
        .ok_or_else(|| Source2Error::Resource("mesh buffer data out of bounds".into()))?
        .to_vec();

    Ok((
        BufferData {
            element_count,
            element_size,
            fields,
            data: buffer_data,
        },
        data_pos + 8,
    ))
}

fn parse_vbib(data: &[u8]) -> Result<Vbib> {
    if data.len() < 16 {
        return Err(Source2Error::Resource("VBIB block too small".into()));
    }
    let vertex_offset = read_u32(data, 0)? as usize;
    let vertex_count = read_u32(data, 4)? as usize;
    let index_offset = read_u32(data, 8)? as usize;
    let index_count = read_u32(data, 12)? as usize;

    let mut vertex_buffers = Vec::with_capacity(vertex_count);
    let mut pos = vertex_offset;
    for _ in 0..vertex_count {
        let (buffer, next) = read_buffer(data, pos, true)?;
        vertex_buffers.push(buffer);
        pos = next;
    }

    let mut index_buffers = Vec::with_capacity(index_count);
    pos = 8 + index_offset;
    for _ in 0..index_count {
        let (buffer, next) = read_buffer(data, pos, false)?;
        index_buffers.push(buffer);
        pos = next;
    }

    Ok(Vbib {
        vertex_buffers,
        index_buffers,
    })
}

fn find_field<'a>(buffer: &'a BufferData, semantic: &str) -> Option<&'a LayoutField> {
    buffer
        .fields
        .iter()
        .find(|field| field.semantic_name == semantic)
}

fn find_field_prefix<'a>(buffer: &'a BufferData, semantic: &str) -> Option<&'a LayoutField> {
    buffer
        .fields
        .iter()
        .find(|field| field.semantic_name.starts_with(semantic))
}

fn read_positions(buffer: &BufferData, field: &LayoutField) -> Result<Vec<f32>> {
    if field.format != FORMAT_R32G32B32_FLOAT {
        return Err(Source2Error::UnsupportedFormat(format!(
            "unsupported POSITION format {}",
            field.format
        )));
    }

    let mut positions = Vec::with_capacity(buffer.element_count * 3);
    for i in 0..buffer.element_count {
        let pos = i * buffer.element_size + field.offset;
        let x = read_f32(&buffer.data, pos)?;
        let y = read_f32(&buffer.data, pos + 4)?;
        let z = read_f32(&buffer.data, pos + 8)?;
        positions.extend_from_slice(&[x, z, -y]);
    }
    Ok(positions)
}

fn decompress_normal_v1(x: f32, y: f32) -> [f32; 3] {
    let mut x = x - 128.0;
    let mut y = y - 128.0;
    let z_sign_bit = if x < 0.0 { 1.0 } else { 0.0 };
    let t_sign_bit = if y < 0.0 { 1.0 } else { 0.0 };
    let z_sign = -((2.0 * z_sign_bit) - 1.0);
    let _t_sign = -((2.0 * t_sign_bit) - 1.0);

    x = (x * z_sign) - z_sign_bit;
    y = (y * _t_sign) - t_sign_bit;
    x -= 64.0;
    y -= 64.0;

    let x_sign_bit = if x < 0.0 { 1.0 } else { 0.0 };
    let y_sign_bit = if y < 0.0 { 1.0 } else { 0.0 };
    let x_sign = -((2.0 * x_sign_bit) - 1.0);
    let y_sign = -((2.0 * y_sign_bit) - 1.0);

    x = ((x * x_sign) - x_sign_bit) / 63.0;
    y = ((y * y_sign) - y_sign_bit) / 63.0;
    let z = 1.0 - x - y;
    let len = ((x * x) + (y * y) + (z * z)).sqrt().max(f32::EPSILON);

    [x / len * x_sign, z / len * z_sign, -(y / len * y_sign)]
}

fn decompress_normal_v2(packed: u32) -> [f32; 3] {
    let x_bits = ((packed >> 12) & 0x3ff) as f32;
    let y_bits = ((packed >> 22) & 0x3ff) as f32;
    let mut x = (x_bits / 1023.0) * 2.0 - 1.0;
    let mut y = (y_bits / 1023.0) * 2.0 - 1.0;
    let mut z = 1.0 - x.abs() - y.abs();

    let compensation = (-z).clamp(0.0, 1.0);
    x += if x >= 0.0 {
        -compensation
    } else {
        compensation
    };
    y += if y >= 0.0 {
        -compensation
    } else {
        compensation
    };
    z = 1.0 - x.abs() - y.abs();

    let len = ((x * x) + (y * y) + (z * z)).sqrt().max(f32::EPSILON);
    [x / len, z / len, -(y / len)]
}

fn read_normals(buffer: &BufferData, field: &LayoutField) -> Result<Vec<f32>> {
    let mut normals = Vec::with_capacity(buffer.element_count * 3);
    for i in 0..buffer.element_count {
        let pos = i * buffer.element_size + field.offset;
        let normal = match field.format {
            FORMAT_R32G32B32_FLOAT => {
                let x = read_f32(&buffer.data, pos)?;
                let y = read_f32(&buffer.data, pos + 4)?;
                let z = read_f32(&buffer.data, pos + 8)?;
                [x, z, -y]
            }
            FORMAT_R8G8B8A8_UNORM => {
                let x = *buffer
                    .data
                    .get(pos)
                    .ok_or_else(|| Source2Error::Resource("normal x out of bounds".into()))?;
                let y = *buffer
                    .data
                    .get(pos + 1)
                    .ok_or_else(|| Source2Error::Resource("normal y out of bounds".into()))?;
                decompress_normal_v1(f32::from(x), f32::from(y))
            }
            FORMAT_R32_UINT => {
                let packed = read_u32(&buffer.data, pos)?;
                decompress_normal_v2(packed)
            }
            other => {
                return Err(Source2Error::UnsupportedFormat(format!(
                    "unsupported NORMAL format {other}"
                )));
            }
        };
        normals.extend_from_slice(&normal);
    }
    Ok(normals)
}

fn half_to_f32(bits: u16) -> f32 {
    let sign = ((bits & 0x8000) as u32) << 16;
    let exponent = ((bits >> 10) & 0x1f) as i32;
    let mantissa = (bits & 0x03ff) as u32;

    let f32_bits = if exponent == 0 {
        if mantissa == 0 {
            sign
        } else {
            let mut mantissa = mantissa;
            let mut exponent = -14i32;
            while (mantissa & 0x0400) == 0 {
                mantissa <<= 1;
                exponent -= 1;
            }
            mantissa &= 0x03ff;
            sign | (((exponent + 127) as u32) << 23) | (mantissa << 13)
        }
    } else if exponent == 0x1f {
        sign | 0x7f80_0000 | (mantissa << 13)
    } else {
        sign | (((exponent - 15 + 127) as u32) << 23) | (mantissa << 13)
    };

    f32::from_bits(f32_bits)
}

fn read_texcoords(buffer: &BufferData, field: &LayoutField) -> Result<Vec<f32>> {
    let mut texcoords = Vec::with_capacity(buffer.element_count * 2);
    for i in 0..buffer.element_count {
        let pos = i * buffer.element_size + field.offset;
        let uv = match field.format {
            FORMAT_R32G32_FLOAT => {
                let u = read_f32(&buffer.data, pos)?;
                let v = read_f32(&buffer.data, pos + 4)?;
                [u, v]
            }
            FORMAT_R16G16_FLOAT => {
                let raw = buffer
                    .data
                    .get(pos..pos + 4)
                    .ok_or_else(|| Source2Error::Resource("texcoord out of bounds".into()))?;
                let u = half_to_f32(u16::from_le_bytes(raw[0..2].try_into().unwrap()));
                let v = half_to_f32(u16::from_le_bytes(raw[2..4].try_into().unwrap()));
                [u, v]
            }
            FORMAT_R16G16_UNORM => {
                let raw = buffer
                    .data
                    .get(pos..pos + 4)
                    .ok_or_else(|| Source2Error::Resource("texcoord out of bounds".into()))?;
                let u = f32::from(u16::from_le_bytes(raw[0..2].try_into().unwrap())) / 65535.0;
                let v = f32::from(u16::from_le_bytes(raw[2..4].try_into().unwrap())) / 65535.0;
                [u, v]
            }
            FORMAT_R16G16_SNORM => {
                let raw = buffer
                    .data
                    .get(pos..pos + 4)
                    .ok_or_else(|| Source2Error::Resource("texcoord out of bounds".into()))?;
                let u = f32::from(i16::from_le_bytes(raw[0..2].try_into().unwrap())) / 32767.0;
                let v = f32::from(i16::from_le_bytes(raw[2..4].try_into().unwrap())) / 32767.0;
                [u.clamp(-1.0, 1.0), v.clamp(-1.0, 1.0)]
            }
            other => {
                return Err(Source2Error::UnsupportedFormat(format!(
                    "unsupported TEXCOORD format {other}"
                )));
            }
        };
        texcoords.extend_from_slice(&uv);
    }
    Ok(texcoords)
}

fn read_indices(buffer: &BufferData, vertex_count: usize) -> Result<(Vec<u8>, u32, usize)> {
    let index_count = buffer.element_count - (buffer.element_count % 3);
    let index_size = buffer.element_size;
    if index_size != 2 && index_size != 4 {
        return Err(Source2Error::UnsupportedFormat(format!(
            "unsupported index size {index_size}"
        )));
    }

    let mut bytes = Vec::with_capacity(index_count * index_size);
    let mut written = 0usize;
    for i in 0..index_count {
        let pos = i * index_size;
        if index_size == 2 {
            let Some(slice) = buffer.data.get(pos..pos + 2) else {
                break;
            };
            let index = u16::from_le_bytes(slice.try_into().unwrap()) as usize;
            if index >= vertex_count {
                continue;
            }
            bytes.extend_from_slice(slice);
        } else {
            let Some(slice) = buffer.data.get(pos..pos + 4) else {
                break;
            };
            let index = u32::from_le_bytes(slice.try_into().unwrap()) as usize;
            if index >= vertex_count {
                continue;
            }
            bytes.extend_from_slice(slice);
        }
        written += 1;
    }

    Ok((
        bytes,
        if index_size == 2 {
            GL_UNSIGNED_SHORT
        } else {
            GL_UNSIGNED_INT
        },
        written - (written % 3),
    ))
}

fn read_draw_indices_u32(
    buffer: &BufferData,
    start_index: usize,
    index_count: usize,
    base_vertex: usize,
    vertex_count: usize,
) -> Result<Vec<u32>> {
    let index_size = buffer.element_size;
    if index_size != 2 && index_size != 4 {
        return Err(Source2Error::UnsupportedFormat(format!(
            "unsupported index size {index_size}"
        )));
    }

    let available = buffer.element_count.saturating_sub(start_index);
    let count = index_count.min(available) - (index_count.min(available) % 3);
    let mut values = Vec::with_capacity(count);
    for i in 0..count {
        let pos = (start_index + i) * index_size;
        let raw = if index_size == 2 {
            let Some(slice) = buffer.data.get(pos..pos + 2) else {
                break;
            };
            usize::from(u16::from_le_bytes(slice.try_into().unwrap()))
        } else {
            let Some(slice) = buffer.data.get(pos..pos + 4) else {
                break;
            };
            u32::from_le_bytes(slice.try_into().unwrap()) as usize
        };
        let index = raw + base_vertex;
        if index < vertex_count {
            values.push(index as u32);
        }
    }
    values.truncate(values.len() - (values.len() % 3));
    Ok(values)
}

fn write_index_bytes(indices: &[u32], vertex_count: usize) -> (Vec<u8>, u32) {
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

fn write_f32_slice(out: &mut Vec<u8>, values: &[f32]) {
    for value in values {
        out.extend_from_slice(&value.to_le_bytes());
    }
}

fn vec3_min_max(values: &[f32]) -> ([f32; 3], [f32; 3]) {
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

fn build_glb(primitives: &[GlbPrimitive<'_>], textures: &[PreviewTexture]) -> Result<Vec<u8>> {
    if primitives.is_empty() {
        return Err(Source2Error::Resource("no drawable primitives".into()));
    }

    let mut bin = Vec::new();
    let mut buffer_views = Vec::new();
    let mut accessors = Vec::new();
    let mut gltf_primitives = Vec::with_capacity(primitives.len());

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

    let mut images = Vec::with_capacity(textures.len());
    let mut texture_defs = Vec::with_capacity(textures.len());
    for (index, texture) in textures.iter().enumerate() {
        let offset = bin.len();
        bin.extend_from_slice(&texture.png);
        push_padding(&mut bin, 0);
        let view_index = buffer_views.len();
        buffer_views.push(json!({
            "buffer": 0,
            "byteOffset": offset,
            "byteLength": texture.png.len()
        }));
        images.push(json!({
            "bufferView": view_index,
            "mimeType": "image/png",
            "name": texture.name
        }));
        texture_defs.push(json!({ "sampler": 0, "source": index }));
    }

    let mut materials = vec![json!({
        "pbrMetallicRoughness": {
            "baseColorFactor": [0.72, 0.70, 0.66, 1.0],
            "metallicFactor": 0.0,
            "roughnessFactor": 0.82
        },
        "doubleSided": true
    })];
    for (index, texture) in textures.iter().enumerate() {
        materials.push(json!({
            "name": texture.name,
            "pbrMetallicRoughness": {
                "baseColorFactor": [1.0, 1.0, 1.0, 1.0],
                "baseColorTexture": { "index": index },
                "metallicFactor": 0.0,
                "roughnessFactor": 0.82
            },
            "doubleSided": true
        }));
    }

    let mut gltf = json!({
        "asset": { "version": "2.0", "generator": "Deadlock Mod Manager Foundry" },
        "scene": 0,
        "scenes": [{ "nodes": [0] }],
        "nodes": [{ "mesh": 0 }],
        "materials": materials,
        "meshes": [{
            "primitives": gltf_primitives
        }],
        "buffers": [{ "byteLength": bin.len() }],
        "bufferViews": buffer_views,
        "accessors": accessors
    });
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

fn model_from_decoded_primitives(
    decoded: &[DecodedPrimitive],
    preview_textures: &[PreviewTexture],
) -> Result<ModelGlb> {
    let glb_primitives = decoded
        .iter()
        .map(|primitive| GlbPrimitive {
            positions: &primitive.positions,
            normals: primitive.normals.as_deref(),
            texcoords: primitive.texcoords.as_deref(),
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
    let glb = build_glb(&glb_primitives, preview_textures)?;
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
    let vbib_bytes = res
        .block_bytes("VBIB")
        .ok_or_else(|| Source2Error::Resource("no VBIB block".into()))?;
    let vbib = parse_vbib(vbib_bytes)?;
    if let Some(mesh_data) = res
        .block_bytes("DATA")
        .and_then(|bytes| crate::kv3::parse(bytes).ok())
    {
        let decoded = decode_drawcall_primitives(&vbib, &mesh_data, preview_textures)?;
        if !decoded.is_empty() {
            return model_from_decoded_primitives(&decoded, preview_textures);
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

    let primitive = GlbPrimitive {
        positions: &positions,
        normals: normals.as_deref(),
        texcoords: texcoords.as_deref(),
        indices: &indices[..index_count
            * if index_component == GL_UNSIGNED_SHORT {
                2
            } else {
                4
            }],
        index_component,
        material: usize::from(!preview_textures.is_empty()),
    };
    let glb = build_glb(&[primitive], preview_textures)?;
    Ok(ModelGlb {
        vertex_count: vertex_buffer.element_count as u32,
        index_count: index_count as u32,
        glb,
    })
}

fn kv_required<'a>(value: &'a KvValue, key: &str) -> Result<&'a KvValue> {
    value
        .get(key)
        .ok_or_else(|| Source2Error::Resource(format!("missing KV3 key {key}")))
}

fn kv_u32(value: &KvValue, key: &str) -> Result<u32> {
    kv_required(value, key)?
        .as_u32()
        .ok_or_else(|| Source2Error::Resource(format!("KV3 key {key} is not u32")))
}

fn kv_usize(value: &KvValue, key: &str) -> Option<usize> {
    value.get(key)?.as_u32().map(|value| value as usize)
}

fn kv_bool(value: &KvValue, key: &str) -> bool {
    value.get(key).and_then(KvValue::as_bool).unwrap_or(false)
}

fn kv_semantic_name(value: &KvValue) -> Result<String> {
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

fn decode_meshopt_vertex_buffer(
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

fn decode_index_buffer(
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

fn parse_embedded_buffer(res: &Resource, value: &KvValue, is_vertex: bool) -> Result<BufferData> {
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

fn parse_embedded_mesh_buffers(res: &Resource, mesh: &KvValue) -> Result<Vbib> {
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

fn kv_string(value: &KvValue, key: &str) -> Option<String> {
    match value.get(key)? {
        KvValue::String(value) => Some(value.clone()),
        KvValue::Binary(bytes) => {
            let end = bytes.iter().position(|b| *b == 0).unwrap_or(bytes.len());
            Some(String::from_utf8_lossy(&bytes[..end]).into_owned())
        }
        _ => None,
    }
}

fn block_value(res: &Resource, index: usize) -> Option<KvValue> {
    let block = res.blocks.get(index)?;
    let bytes = res.data.get(block.offset..block.offset + block.size)?;
    crate::kv3::parse(bytes).ok()
}

fn normalize_material_path(path: &str) -> String {
    let mut normalized = path.replace('\\', "/").to_ascii_lowercase();
    if normalized.ends_with(".vmat_c") {
        return normalized;
    }
    if normalized.ends_with(".vmat") {
        normalized.push_str("_c");
    }
    normalized
}

fn drawcalls_from_mesh_data(mesh_data: &KvValue) -> Vec<DrawCall> {
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

fn material_paths_from_mesh_data(mesh_data: &KvValue, out: &mut Vec<String>) {
    for drawcall in drawcalls_from_mesh_data(mesh_data) {
        if let Some(material) = drawcall.material
            && !out.iter().any(|path| path.eq_ignore_ascii_case(&material))
        {
            out.push(material);
        }
    }
}

fn is_lod_mesh(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.contains("_lod") || lower.ends_with("lod0") || lower.ends_with("lod1")
}

fn contains_any(value: &str, tokens: &[&str]) -> bool {
    tokens.iter().any(|token| value.contains(token))
}

fn texture_match_score(mesh_name: &str, texture_name: &str) -> i32 {
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

fn material_index_for_mesh(mesh_name: &str, textures: &[PreviewTexture]) -> usize {
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

fn material_index_for_material(material: Option<&str>, textures: &[PreviewTexture]) -> usize {
    let Some(material) = material.map(normalize_material_path) else {
        return 0;
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
        .unwrap_or(0)
}

fn read_vertex_set(vbib: &Vbib, vertex_buffer_index: usize) -> Result<VertexSet> {
    let vertex_buffer = vbib
        .vertex_buffers
        .get(vertex_buffer_index)
        .ok_or_else(|| Source2Error::Resource("draw call vertex buffer out of bounds".into()))?;
    let position_field = find_field(vertex_buffer, "POSITION")
        .ok_or_else(|| Source2Error::Resource("no POSITION attribute".into()))?;
    let positions = read_positions(vertex_buffer, position_field)?;
    let normals = find_field(vertex_buffer, "NORMAL")
        .and_then(|field| read_normals(vertex_buffer, field).ok());
    let texcoords = find_field_prefix(vertex_buffer, "TEXCOORD")
        .and_then(|field| read_texcoords(vertex_buffer, field).ok());

    Ok(VertexSet {
        positions,
        normals,
        texcoords,
    })
}

fn compact_primitive(
    vertices: &VertexSet,
    source_indices: &[u32],
    material: usize,
) -> Option<DecodedPrimitive> {
    if source_indices.len() < 3 {
        return None;
    }

    let mut remap = HashMap::<u32, u32>::new();
    let mut indices = Vec::<u32>::with_capacity(source_indices.len());
    let mut positions = Vec::<f32>::new();
    let mut normals = vertices.normals.as_ref().map(|_| Vec::<f32>::new());
    let mut texcoords = vertices.texcoords.as_ref().map(|_| Vec::<f32>::new());

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
        indices: index_bytes,
        index_component,
        index_count: indices.len(),
        material,
    })
}

fn decode_drawcall_primitives(
    vbib: &Vbib,
    mesh_data: &KvValue,
    preview_textures: &[PreviewTexture],
) -> Result<Vec<DecodedPrimitive>> {
    let drawcalls = drawcalls_from_mesh_data(mesh_data);
    if drawcalls.is_empty() {
        return Ok(Vec::new());
    }

    let mut vertex_cache = Vec::<Option<VertexSet>>::new();
    vertex_cache.resize_with(vbib.vertex_buffers.len(), || None);
    let mut decoded = Vec::new();

    for drawcall in drawcalls {
        let Some(vertex_buffer_index) = drawcall
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

        if vertex_cache[vertex_buffer_index].is_none() {
            vertex_cache[vertex_buffer_index] = Some(read_vertex_set(vbib, vertex_buffer_index)?);
        }
        let vertices = vertex_cache[vertex_buffer_index]
            .as_ref()
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

fn decode_vbib_primitive(_name: String, vbib: Vbib, material: usize) -> Result<DecodedPrimitive> {
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
        indices: indices[..index_count * index_size].to_vec(),
        index_component,
        index_count,
        material,
    })
}

pub fn decode_embedded_model_glb_from_resource(
    res: &Resource,
    preview_textures: &[PreviewTexture],
) -> Result<ModelGlb> {
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

    let mut selected_meshes = meshes
        .iter()
        .filter_map(|mesh| {
            let name = kv_string(mesh, "m_Name").unwrap_or_else(|| "mesh".into());
            (!is_lod_mesh(&name)).then_some((name, mesh))
        })
        .collect::<Vec<_>>();
    if selected_meshes.is_empty() {
        selected_meshes = meshes
            .iter()
            .map(|mesh| {
                (
                    kv_string(mesh, "m_Name").unwrap_or_else(|| "mesh".into()),
                    mesh,
                )
            })
            .collect();
    }

    let mut decoded = Vec::new();
    for (name, mesh) in selected_meshes {
        let vbib = parse_embedded_mesh_buffers(res, mesh)?;
        let mesh_data = kv_usize(mesh, "m_nDataBlock").and_then(|index| block_value(res, index));
        if let Some(mesh_data) = mesh_data {
            let drawcall_primitives =
                decode_drawcall_primitives(&vbib, &mesh_data, preview_textures)?;
            if !drawcall_primitives.is_empty() {
                decoded.extend(drawcall_primitives);
                continue;
            }
        }

        let material = material_index_for_mesh(&name, preview_textures);
        decoded.push(decode_vbib_primitive(name, vbib, material)?);
    }
    if decoded.is_empty() {
        return Err(Source2Error::Resource(
            "no drawable embedded triangle indices".into(),
        ));
    }

    model_from_decoded_primitives(&decoded, preview_textures)
}

pub fn referenced_meshes(res: &Resource) -> Result<Vec<String>> {
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
            let name = kv_string(mesh, "m_Name").unwrap_or_else(|| "mesh".into());
            !is_lod_mesh(&name)
        })
        .collect::<Vec<_>>();
    if selected_meshes.is_empty() {
        selected_meshes = meshes.iter().collect();
    }

    for mesh in selected_meshes {
        if let Some(mesh_data) =
            kv_usize(mesh, "m_nDataBlock").and_then(|index| block_value(res, index))
        {
            material_paths_from_mesh_data(&mesh_data, &mut materials);
        }
    }

    materials
}
