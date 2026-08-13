use super::*;
use crate::error::{Result, Source2Error};

pub(crate) fn read_u32(data: &[u8], pos: usize) -> Result<u32> {
    data.get(pos..pos + 4)
        .map(|b| u32::from_le_bytes(b.try_into().unwrap()))
        .ok_or_else(|| Source2Error::Resource(format!("u32 read out of bounds at {pos}")))
}

pub(crate) fn read_i32(data: &[u8], pos: usize) -> Result<i32> {
    data.get(pos..pos + 4)
        .map(|b| i32::from_le_bytes(b.try_into().unwrap()))
        .ok_or_else(|| Source2Error::Resource(format!("i32 read out of bounds at {pos}")))
}

pub(crate) fn read_f32(data: &[u8], pos: usize) -> Result<f32> {
    data.get(pos..pos + 4)
        .map(|b| f32::from_le_bytes(b.try_into().unwrap()))
        .ok_or_else(|| Source2Error::Resource(format!("f32 read out of bounds at {pos}")))
}

pub(crate) fn push_padding(data: &mut Vec<u8>, byte: u8) {
    while !data.len().is_multiple_of(4) {
        data.push(byte);
    }
}

pub(crate) fn read_semantic(data: &[u8], pos: usize) -> Result<String> {
    let bytes = data
        .get(pos..pos + 32)
        .ok_or_else(|| Source2Error::Resource("layout semantic out of bounds".into()))?;
    let end = bytes.iter().position(|b| *b == 0).unwrap_or(bytes.len());
    Ok(String::from_utf8_lossy(&bytes[..end]).to_ascii_uppercase())
}

pub(crate) fn read_buffer(data: &[u8], pos: usize, is_vertex: bool) -> Result<(BufferData, usize)> {
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

pub(crate) fn parse_vbib(data: &[u8]) -> Result<Vbib> {
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

pub(crate) fn find_field<'a>(buffer: &'a BufferData, semantic: &str) -> Option<&'a LayoutField> {
    buffer
        .fields
        .iter()
        .find(|field| field.semantic_name == semantic)
}

pub(crate) fn find_field_prefix<'a>(
    buffer: &'a BufferData,
    semantic: &str,
) -> Option<&'a LayoutField> {
    buffer
        .fields
        .iter()
        .find(|field| field.semantic_name.starts_with(semantic))
}

pub(crate) fn read_positions(buffer: &BufferData, field: &LayoutField) -> Result<Vec<f32>> {
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

pub(crate) fn decompress_normal_v1(x: f32, y: f32) -> [f32; 3] {
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

pub(crate) fn decompress_normal_v2(packed: u32) -> [f32; 3] {
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

pub(crate) fn read_normals(buffer: &BufferData, field: &LayoutField) -> Result<Vec<f32>> {
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

pub(crate) fn half_to_f32(bits: u16) -> f32 {
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

pub(crate) fn read_texcoords(buffer: &BufferData, field: &LayoutField) -> Result<Vec<f32>> {
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

pub(crate) fn read_joints(buffer: &BufferData, field: &LayoutField) -> Result<Vec<u16>> {
    let mut joints = Vec::with_capacity(buffer.element_count * 4);
    for i in 0..buffer.element_count {
        let pos = i * buffer.element_size + field.offset;
        match field.format {
            FORMAT_R8G8B8A8_UINT | FORMAT_R8G8B8A8_UNORM => {
                let raw = buffer
                    .data
                    .get(pos..pos + 4)
                    .ok_or_else(|| Source2Error::Resource("blend indices out of bounds".into()))?;
                joints.extend(raw.iter().map(|value| u16::from(*value)));
            }
            FORMAT_R16G16B16A16_UINT => {
                let raw = buffer
                    .data
                    .get(pos..pos + 8)
                    .ok_or_else(|| Source2Error::Resource("blend indices out of bounds".into()))?;
                joints.extend(raw[..4].iter().map(|value| u16::from(*value)));
            }
            FORMAT_R16G16_SINT => {
                let raw = buffer
                    .data
                    .get(pos..pos + 4)
                    .ok_or_else(|| Source2Error::Resource("blend indices out of bounds".into()))?;
                let first = u16::from_le_bytes(raw[0..2].try_into().unwrap());
                let second = u16::from_le_bytes(raw[2..4].try_into().unwrap());
                joints.extend_from_slice(&[first, second, second, second]);
            }
            FORMAT_R16G16B16A16_SINT | FORMAT_R32G32B32A32_SINT => {
                let raw = buffer
                    .data
                    .get(pos..pos + 8)
                    .ok_or_else(|| Source2Error::Resource("blend indices out of bounds".into()))?;
                for chunk in raw.chunks_exact(2).take(4) {
                    joints.push(u16::from_le_bytes(chunk.try_into().unwrap()));
                }
            }
            other => {
                return Err(Source2Error::UnsupportedFormat(format!(
                    "unsupported BLENDINDICES format {other}"
                )));
            }
        }
    }
    Ok(joints)
}

pub(crate) fn default_skin_weights(vertex_count: usize, bone_weight_count: usize) -> Vec<f32> {
    let retained = bone_weight_count.clamp(1, 8);
    let stride = if retained > 4 { 8 } else { 4 };
    let weight = 1.0 / retained as f32;
    let mut weights = Vec::with_capacity(vertex_count * stride);
    for _ in 0..vertex_count {
        for influence in 0..stride {
            weights.push(if influence < retained { weight } else { 0.0 });
        }
    }
    weights
}

/// Decode Source 2's paired skin streams, retaining the requested influences.
///
/// Valve uses the nominal 16-bit x4 DXGI formats as packed eight-byte streams
/// for eight joint influences. Treating those bytes as four u16 values creates
/// joint indices in the tens of thousands and collapses vertices to the origin.
pub(crate) fn read_skinning(
    joint_buffer: &BufferData,
    joint_field: &LayoutField,
    weight_buffer: &BufferData,
    weight_field: &LayoutField,
    max_influences: usize,
) -> Result<(Vec<u16>, Vec<f32>)> {
    if joint_buffer.element_count != weight_buffer.element_count {
        return Err(Source2Error::Resource(
            "joint and weight vertex counts differ".into(),
        ));
    }
    let vertex_count = joint_buffer.element_count;
    let influence_count = joint_influence_count(joint_field.format)?;
    let retained_count = influence_count.min(max_influences.clamp(1, 8));
    let mut joints = Vec::with_capacity(vertex_count * retained_count);
    let mut weights = Vec::with_capacity(vertex_count * retained_count);

    for vertex in 0..vertex_count {
        let joint_pos = vertex * joint_buffer.element_size + joint_field.offset;
        let weight_pos = vertex * weight_buffer.element_size + weight_field.offset;
        let decoded_joints = decode_vertex_joints(
            &joint_buffer.data,
            joint_pos,
            joint_field.format,
            influence_count,
        )
        .map_err(|error| {
            Source2Error::Resource(format!(
                "{error}; joint format={}, vertex={}, offset={}, stride={}, bytes={}, influences={}",
                joint_field.format,
                vertex,
                joint_field.offset,
                joint_buffer.element_size,
                joint_buffer.data.len(),
                influence_count
            ))
        })?;
        let decoded_weights = decode_vertex_weights(
            &weight_buffer.data,
            weight_pos,
            weight_field.format,
            influence_count,
        )?;
        let mut influences = decoded_joints
            .into_iter()
            .zip(decoded_weights)
            .collect::<Vec<_>>();
        influences.sort_by(|left, right| right.1.total_cmp(&left.1));

        let mut selected_joints = vec![0u16; retained_count];
        let mut selected_weights = vec![0.0f32; retained_count];
        for (slot, (joint, weight)) in influences.into_iter().take(retained_count).enumerate() {
            selected_joints[slot] = joint;
            selected_weights[slot] = weight;
        }
        normalize_weight_slice(&mut selected_weights);
        joints.extend_from_slice(&selected_joints);
        weights.extend_from_slice(&selected_weights);
    }
    Ok((joints, weights))
}

pub(super) fn joint_influence_count(format: u32) -> Result<usize> {
    let count = match format {
        FORMAT_R16G16B16A16_UINT | FORMAT_R32G32B32A32_SINT => 8,
        FORMAT_R8G8B8A8_UINT
        | FORMAT_R8G8B8A8_UNORM
        | FORMAT_R16G16_SINT
        | FORMAT_R16G16B16A16_SINT => 4,
        other => {
            return Err(Source2Error::UnsupportedFormat(format!(
                "unsupported BLENDINDICES format {other}"
            )));
        }
    };
    Ok(count)
}

fn normalize_weight_slice(weights: &mut [f32]) {
    let sum = weights.iter().copied().sum::<f32>();
    if sum > f32::EPSILON {
        for weight in weights {
            *weight /= sum;
        }
    } else if let Some(first) = weights.first_mut() {
        *first = 1.0;
    }
}

fn decode_vertex_joints(data: &[u8], pos: usize, format: u32, count: usize) -> Result<Vec<u16>> {
    match format {
        FORMAT_R8G8B8A8_UINT | FORMAT_R8G8B8A8_UNORM | FORMAT_R16G16B16A16_UINT => data
            .get(pos..pos + count)
            .map(|raw| raw.iter().map(|value| u16::from(*value)).collect())
            .ok_or_else(|| Source2Error::Resource("blend indices out of bounds".into())),
        FORMAT_R16G16_SINT | FORMAT_R16G16B16A16_SINT | FORMAT_R32G32B32A32_SINT => data
            .get(pos..pos + count * 2)
            .map(|raw| {
                raw.chunks_exact(2)
                    .map(|chunk| u16::from_le_bytes(chunk.try_into().unwrap()))
                    .collect()
            })
            .ok_or_else(|| Source2Error::Resource("blend indices out of bounds".into())),
        other => Err(Source2Error::UnsupportedFormat(format!(
            "unsupported BLENDINDICES format {other}"
        ))),
    }
}

fn decode_vertex_weights(data: &[u8], pos: usize, format: u32, count: usize) -> Result<Vec<f32>> {
    match format {
        FORMAT_R8G8B8A8_UNORM | FORMAT_R16G16B16A16_UNORM => data
            .get(pos..pos + count)
            .map(|raw| raw.iter().map(|value| f32::from(*value) / 255.0).collect())
            .ok_or_else(|| Source2Error::Resource("blend weights out of bounds".into())),
        FORMAT_R16G16_UNORM => {
            let raw = data
                .get(pos..pos + 4)
                .ok_or_else(|| Source2Error::Resource("blend weights out of bounds".into()))?;
            let mut values = vec![
                f32::from(u16::from_le_bytes(raw[0..2].try_into().unwrap())) / 65535.0,
                f32::from(u16::from_le_bytes(raw[2..4].try_into().unwrap())) / 65535.0,
            ];
            values.resize(count, 0.0);
            Ok(values)
        }
        other => Err(Source2Error::UnsupportedFormat(format!(
            "unsupported BLENDWEIGHT format {other}"
        ))),
    }
}

pub(crate) fn read_indices(
    buffer: &BufferData,
    vertex_count: usize,
) -> Result<(Vec<u8>, u32, usize)> {
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

pub(crate) fn read_draw_indices_u32(
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
