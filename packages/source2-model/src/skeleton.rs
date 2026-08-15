use crate::error::{Result, Source2Error};
use crate::kv3::KvValue;
use crate::resource::Resource;

const BONE_FLAG_CLOTH: u32 = 0x8;
const BONE_FLAG_PROCEDURAL: u32 = 0x400000;

/// A bone's local transform. The Foundry never plays animation, but it does
/// stand the model in the game's idle rest pose so the weapon sits in the hand,
/// and the glTF skin writer needs the decomposed TRS of each bone matrix.
#[derive(Debug, Clone, Copy)]
pub struct BoneTransform {
    pub translation: [f32; 3],
    pub rotation: [f32; 4],
    pub scale: [f32; 3],
}

#[derive(Debug, Clone)]
pub struct Bone {
    pub name: String,
    pub parent: i32,
    pub flags: u32,
    pub bind_pos: [f32; 3],
    pub bind_rot: [f32; 4],
    pub bind_scale: [f32; 3],
    pub local_bind_matrix: [f32; 16],
    pub model_bind_matrix: [f32; 16],
}

#[derive(Debug, Clone)]
pub struct Skeleton {
    pub bones: Vec<Bone>,
    pub inverse_bind_matrices: Vec<[f32; 16]>,
}

impl Skeleton {
    fn from_model_skeleton(value: &KvValue) -> Result<Self> {
        let names = required_array(value, "m_boneName")?;
        let parents = required_array(value, "m_nParent")?;
        let positions = required_array(value, "m_bonePosParent")?;
        let rotations = required_array(value, "m_boneRotParent")?;
        let scales = required_array(value, "m_boneScaleParent")?;
        let flags = value.get("m_nFlag").and_then(KvValue::as_array);
        let bone_count = names.len();
        if parents.len() != bone_count
            || positions.len() != bone_count
            || rotations.len() != bone_count
            || scales.len() != bone_count
        {
            return Err(Source2Error::Resource(
                "model skeleton channel length mismatch".into(),
            ));
        }

        let mut bones = Vec::with_capacity(bone_count);
        let mut model_bind_matrices = Vec::with_capacity(bone_count);
        for i in 0..bone_count {
            let bind_pos = source_vec3_to_gltf(parse_vec3(&positions[i])?);
            let bind_rot = source_quat_to_gltf(parse_quat(&rotations[i])?);
            let bind_scale = parse_scale(&scales[i])?;
            let parent = parse_i32(&parents[i])?;
            let local_bind_matrix = mat4_from_trs(bind_pos, bind_rot, bind_scale);
            let model_bind_matrix = if parent >= 0 {
                let parent_index = usize::try_from(parent).map_err(|_| {
                    Source2Error::Resource(format!("negative parent index {parent}"))
                })?;
                let parent_matrix = model_bind_matrices.get(parent_index).ok_or_else(|| {
                    Source2Error::Resource(format!("parent index {parent} out of bounds"))
                })?;
                mat4_mul(parent_matrix, &local_bind_matrix)
            } else {
                local_bind_matrix
            };
            model_bind_matrices.push(model_bind_matrix);
            bones.push(Bone {
                name: parse_string(&names[i])?,
                parent,
                flags: flags
                    .and_then(|values| values.get(i))
                    .and_then(KvValue::as_u32)
                    .unwrap_or(0),
                bind_pos,
                bind_rot,
                bind_scale,
                local_bind_matrix,
                model_bind_matrix,
            });
        }

        let inverse_bind_matrices = model_bind_matrices
            .iter()
            .map(invert_affine)
            .collect::<Result<Vec<_>>>()?;
        Ok(Self {
            bones,
            inverse_bind_matrices,
        })
    }

    /// Source 2 drives procedural cloth roots with a solver the Foundry does not
    /// run. Without it those bones fall back to their bind transform and the
    /// cloth detaches from the body, so mirror the renderer's fallback: copy the
    /// skinning transform from the first non-procedural bone marked as a cloth
    /// anchor. This is a static fix-up of one pose, not simulation.
    pub fn pin_procedural_cloth_roots(&self, pose: &mut [BoneTransform]) {
        if pose.len() < self.bones.len() {
            return;
        }

        let mut model_matrices = Vec::with_capacity(self.bones.len());
        for (index, bone) in self.bones.iter().enumerate() {
            let transform = pose[index];
            let local = mat4_from_trs(transform.translation, transform.rotation, transform.scale);
            let model = if bone.parent >= 0 {
                model_matrices
                    .get(bone.parent as usize)
                    .map(|parent| mat4_mul(parent, &local))
                    .unwrap_or(local)
            } else {
                local
            };
            model_matrices.push(model);
        }
        let Some(anchor_index) = self.bones.iter().position(|bone| {
            bone.flags & BONE_FLAG_CLOTH != 0 && bone.flags & BONE_FLAG_PROCEDURAL == 0
        }) else {
            return;
        };
        let cloth_skinning = mat4_mul(
            &model_matrices[anchor_index],
            &self.inverse_bind_matrices[anchor_index],
        );
        for (index, bone) in self.bones.iter().enumerate() {
            if bone.parent < 0
                && bone.flags & (BONE_FLAG_CLOTH | BONE_FLAG_PROCEDURAL)
                    == (BONE_FLAG_CLOTH | BONE_FLAG_PROCEDURAL)
            {
                let pinned = mat4_mul(&cloth_skinning, &bone.model_bind_matrix);
                pose[index] = decompose_trs(&pinned);
            }
        }
    }
}

pub fn parse_model_skeleton(res: &Resource) -> Result<Option<Skeleton>> {
    let Some(data) = res.block_bytes("DATA") else {
        return Ok(None);
    };
    let root = crate::kv3::parse(data)?;
    let Some(model_skeleton) = root.get("m_modelSkeleton") else {
        return Ok(None);
    };
    Skeleton::from_model_skeleton(model_skeleton).map(Some)
}

fn required_array<'a>(value: &'a KvValue, key: &str) -> Result<&'a [KvValue]> {
    value
        .get(key)
        .and_then(KvValue::as_array)
        .ok_or_else(|| Source2Error::Resource(format!("missing skeleton array {key}")))
}

fn parse_string(value: &KvValue) -> Result<String> {
    match value {
        KvValue::String(value) => Ok(value.clone()),
        KvValue::Binary(bytes) => {
            let end = bytes.iter().position(|b| *b == 0).unwrap_or(bytes.len());
            Ok(String::from_utf8_lossy(&bytes[..end]).into_owned())
        }
        _ => Err(Source2Error::Resource(
            "skeleton name is not a string".into(),
        )),
    }
}

fn parse_i32(value: &KvValue) -> Result<i32> {
    value
        .as_i64()
        .and_then(|value| i32::try_from(value).ok())
        .ok_or_else(|| Source2Error::Resource("skeleton parent is not i32".into()))
}

fn parse_f32(value: &KvValue) -> Option<f32> {
    match value {
        KvValue::Float(value) => Some(*value as f32),
        KvValue::Int(value) => Some(*value as f32),
        KvValue::UInt(value) => Some(*value as f32),
        _ => None,
    }
}

fn parse_vec3(value: &KvValue) -> Result<[f32; 3]> {
    if let Some(values) = value.as_array()
        && values.len() >= 3
    {
        return Ok([
            parse_f32(&values[0])
                .ok_or_else(|| Source2Error::Resource("vec3 x is not numeric".into()))?,
            parse_f32(&values[1])
                .ok_or_else(|| Source2Error::Resource("vec3 y is not numeric".into()))?,
            parse_f32(&values[2])
                .ok_or_else(|| Source2Error::Resource("vec3 z is not numeric".into()))?,
        ]);
    }

    match value {
        KvValue::Object(_) => Ok([
            object_f32(value, &["x", "m_flX", "m_x"])?,
            object_f32(value, &["y", "m_flY", "m_y"])?,
            object_f32(value, &["z", "m_flZ", "m_z"])?,
        ]),
        _ => Err(Source2Error::Resource("skeleton vec3 is malformed".into())),
    }
}

fn parse_quat(value: &KvValue) -> Result<[f32; 4]> {
    let quat = if let Some(values) = value.as_array()
        && values.len() >= 4
    {
        [
            parse_f32(&values[0])
                .ok_or_else(|| Source2Error::Resource("quat x is not numeric".into()))?,
            parse_f32(&values[1])
                .ok_or_else(|| Source2Error::Resource("quat y is not numeric".into()))?,
            parse_f32(&values[2])
                .ok_or_else(|| Source2Error::Resource("quat z is not numeric".into()))?,
            parse_f32(&values[3])
                .ok_or_else(|| Source2Error::Resource("quat w is not numeric".into()))?,
        ]
    } else {
        match value {
            KvValue::Object(_) => [
                object_f32(value, &["x", "m_flX", "m_x"])?,
                object_f32(value, &["y", "m_flY", "m_y"])?,
                object_f32(value, &["z", "m_flZ", "m_z"])?,
                object_f32(value, &["w", "m_flW", "m_w"])?,
            ],
            _ => return Err(Source2Error::Resource("skeleton quat is malformed".into())),
        }
    };
    Ok(normalize_quat(quat))
}

fn parse_scale(value: &KvValue) -> Result<[f32; 3]> {
    if let Some(value) = parse_f32(value) {
        return Ok([value, value, value]);
    }
    Ok(source_scale_to_gltf(parse_vec3(value)?))
}

fn object_f32(value: &KvValue, keys: &[&str]) -> Result<f32> {
    for key in keys {
        if let Some(value) = value.get(key).and_then(parse_f32) {
            return Ok(value);
        }
    }
    Err(Source2Error::Resource(format!(
        "missing numeric object field {}",
        keys[0]
    )))
}

fn normalize_quat(quat: [f32; 4]) -> [f32; 4] {
    let len =
        ((quat[0] * quat[0]) + (quat[1] * quat[1]) + (quat[2] * quat[2]) + (quat[3] * quat[3]))
            .sqrt();
    if len <= f32::EPSILON {
        [0.0, 0.0, 0.0, 1.0]
    } else {
        [quat[0] / len, quat[1] / len, quat[2] / len, quat[3] / len]
    }
}

fn quat_mul(left: [f32; 4], right: [f32; 4]) -> [f32; 4] {
    [
        (left[3] * right[0]) + (left[0] * right[3]) + (left[1] * right[2]) - (left[2] * right[1]),
        (left[3] * right[1]) - (left[0] * right[2]) + (left[1] * right[3]) + (left[2] * right[0]),
        (left[3] * right[2]) + (left[0] * right[1]) - (left[1] * right[0]) + (left[2] * right[3]),
        (left[3] * right[3]) - (left[0] * right[0]) - (left[1] * right[1]) - (left[2] * right[2]),
    ]
}

fn quat_conjugate(quat: [f32; 4]) -> [f32; 4] {
    [-quat[0], -quat[1], -quat[2], quat[3]]
}

fn source_vec3_to_gltf(value: [f32; 3]) -> [f32; 3] {
    [value[0], value[2], -value[1]]
}

fn source_scale_to_gltf(value: [f32; 3]) -> [f32; 3] {
    [value[0], value[2], value[1]]
}

fn source_quat_to_gltf(value: [f32; 4]) -> [f32; 4] {
    let half = std::f32::consts::FRAC_PI_4;
    let source_to_gltf = [-half.sin(), 0.0, 0.0, half.cos()];
    normalize_quat(quat_mul(
        quat_mul(source_to_gltf, value),
        quat_conjugate(source_to_gltf),
    ))
}

pub(crate) fn mat4_from_trs(
    translation: [f32; 3],
    rotation: [f32; 4],
    scale: [f32; 3],
) -> [f32; 16] {
    let [x, y, z, w] = rotation;
    let xx = x * x;
    let yy = y * y;
    let zz = z * z;
    let xy = x * y;
    let xz = x * z;
    let yz = y * z;
    let wx = w * x;
    let wy = w * y;
    let wz = w * z;

    [
        (1.0 - (2.0 * (yy + zz))) * scale[0],
        (2.0 * (xy + wz)) * scale[0],
        (2.0 * (xz - wy)) * scale[0],
        0.0,
        (2.0 * (xy - wz)) * scale[1],
        (1.0 - (2.0 * (xx + zz))) * scale[1],
        (2.0 * (yz + wx)) * scale[1],
        0.0,
        (2.0 * (xz + wy)) * scale[2],
        (2.0 * (yz - wx)) * scale[2],
        (1.0 - (2.0 * (xx + yy))) * scale[2],
        0.0,
        translation[0],
        translation[1],
        translation[2],
        1.0,
    ]
}

pub(crate) fn mat4_mul(left: &[f32; 16], right: &[f32; 16]) -> [f32; 16] {
    let mut out = [0.0; 16];
    for column in 0..4 {
        for row in 0..4 {
            let mut value = 0.0;
            for i in 0..4 {
                value += left[(i * 4) + row] * right[(column * 4) + i];
            }
            out[(column * 4) + row] = value;
        }
    }
    out
}

pub(crate) fn decompose_trs(matrix: &[f32; 16]) -> BoneTransform {
    let mut scale = [0.0f32; 3];
    for (column, axis_scale) in scale.iter_mut().enumerate() {
        let offset = column * 4;
        *axis_scale =
            (matrix[offset].powi(2) + matrix[offset + 1].powi(2) + matrix[offset + 2].powi(2))
                .sqrt()
                .max(f32::EPSILON);
    }
    let m00 = matrix[0] / scale[0];
    let m01 = matrix[4] / scale[1];
    let m02 = matrix[8] / scale[2];
    let m10 = matrix[1] / scale[0];
    let m11 = matrix[5] / scale[1];
    let m12 = matrix[9] / scale[2];
    let m20 = matrix[2] / scale[0];
    let m21 = matrix[6] / scale[1];
    let m22 = matrix[10] / scale[2];
    let trace = m00 + m11 + m22;
    let rotation = if trace > 0.0 {
        let s = (trace + 1.0).sqrt() * 2.0;
        [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s * 0.25]
    } else if m00 > m11 && m00 > m22 {
        let s = (1.0 + m00 - m11 - m22).sqrt() * 2.0;
        [s * 0.25, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]
    } else if m11 > m22 {
        let s = (1.0 + m11 - m00 - m22).sqrt() * 2.0;
        [(m01 + m10) / s, s * 0.25, (m12 + m21) / s, (m02 - m20) / s]
    } else {
        let s = (1.0 + m22 - m00 - m11).sqrt() * 2.0;
        [(m02 + m20) / s, (m12 + m21) / s, s * 0.25, (m10 - m01) / s]
    };
    BoneTransform {
        translation: [matrix[12], matrix[13], matrix[14]],
        rotation: normalize_quat(rotation),
        scale,
    }
}

pub(crate) fn invert_affine(matrix: &[f32; 16]) -> Result<[f32; 16]> {
    let a00 = matrix[0];
    let a01 = matrix[4];
    let a02 = matrix[8];
    let a10 = matrix[1];
    let a11 = matrix[5];
    let a12 = matrix[9];
    let a20 = matrix[2];
    let a21 = matrix[6];
    let a22 = matrix[10];

    let c00 = (a11 * a22) - (a12 * a21);
    let c01 = -((a10 * a22) - (a12 * a20));
    let c02 = (a10 * a21) - (a11 * a20);
    let c10 = -((a01 * a22) - (a02 * a21));
    let c11 = (a00 * a22) - (a02 * a20);
    let c12 = -((a00 * a21) - (a01 * a20));
    let c20 = (a01 * a12) - (a02 * a11);
    let c21 = -((a00 * a12) - (a02 * a10));
    let c22 = (a00 * a11) - (a01 * a10);
    let det = (a00 * c00) + (a01 * c01) + (a02 * c02);
    if det.abs() <= f32::EPSILON {
        return Err(Source2Error::Resource(
            "skeleton bind matrix is not invertible".into(),
        ));
    }
    let inv_det = 1.0 / det;
    let inv00 = c00 * inv_det;
    let inv01 = c10 * inv_det;
    let inv02 = c20 * inv_det;
    let inv10 = c01 * inv_det;
    let inv11 = c11 * inv_det;
    let inv12 = c21 * inv_det;
    let inv20 = c02 * inv_det;
    let inv21 = c12 * inv_det;
    let inv22 = c22 * inv_det;

    let tx = matrix[12];
    let ty = matrix[13];
    let tz = matrix[14];
    Ok([
        inv00,
        inv10,
        inv20,
        0.0,
        inv01,
        inv11,
        inv21,
        0.0,
        inv02,
        inv12,
        inv22,
        0.0,
        -((inv00 * tx) + (inv01 * ty) + (inv02 * tz)),
        -((inv10 * tx) + (inv11 * ty) + (inv12 * tz)),
        -((inv20 * tx) + (inv21 * ty) + (inv22 * tz)),
        1.0,
    ])
}
