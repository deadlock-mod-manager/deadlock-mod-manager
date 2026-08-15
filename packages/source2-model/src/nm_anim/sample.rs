use super::*;
use crate::skeleton::BoneTransform;
use crate::error::{Result, Source2Error};

impl NmAnimation {
    pub fn reference_pose(&self) -> Vec<BoneTransform> {
        self.skeleton
            .reference_pose
            .iter()
            .map(|reference| BoneTransform {
                translation: source_vec3_to_gltf(reference.translation),
                rotation: source_quat_to_gltf(normalize_quat(reference.rotation)),
                scale: [reference.scale, reference.scale, reference.scale],
            })
            .collect()
    }

    pub fn fps(&self) -> f32 {
        if self.clip.frame_count <= 1 || self.clip.duration_seconds <= f32::EPSILON {
            0.0
        } else {
            (self.clip.frame_count - 1) as f32 / self.clip.duration_seconds
        }
    }

    pub fn sample_frame(&self, frame_index: usize) -> Result<Vec<BoneTransform>> {
        if self.clip.frame_count == 0 {
            return Err(Source2Error::Resource("NM clip has no frames".into()));
        }
        let frame_index = frame_index.min(self.clip.frame_count - 1);
        let pose_offset = *self
            .clip
            .compressed_pose_offsets
            .get(frame_index)
            .ok_or_else(|| Source2Error::Resource("NM clip frame offset is missing".into()))?;
        let mut data_pos = pose_offset
            .checked_mul(2)
            .ok_or_else(|| Source2Error::Resource("NM clip frame byte offset overflow".into()))?;
        let track_count = self
            .skeleton
            .bone_names
            .len()
            .min(self.clip.track_settings.len());
        let mut pose = Vec::with_capacity(track_count);

        for (index, setting) in self
            .clip
            .track_settings
            .iter()
            .take(track_count)
            .enumerate()
        {
            let mut rotation = setting.constant_rotation;
            let mut translation = [
                setting.translation[0].start,
                setting.translation[1].start,
                setting.translation[2].start,
            ];
            let mut scale = setting.scale.start;

            if !setting.rotation_static {
                rotation =
                    decode_quaternion(read_u16x3(&self.clip.compressed_pose_data, &mut data_pos)?);
            }
            if !setting.translation_static {
                let encoded = read_u16x3(&self.clip.compressed_pose_data, &mut data_pos)?;
                translation = [
                    decode_float(encoded[0], setting.translation[0]),
                    decode_float(encoded[1], setting.translation[1]),
                    decode_float(encoded[2], setting.translation[2]),
                ];
            }
            if !setting.scale_static {
                scale = decode_float(
                    read_u16(&self.clip.compressed_pose_data, &mut data_pos)?,
                    setting.scale,
                );
            }

            // Additive clips store deltas from the skeleton's reference pose:
            // rotation composes onto the reference, translation and scale add.
            // Resolve here, in raw Source space, so every consumer receives a
            // complete local pose instead of an un-layerable delta.
            if self.clip.additive {
                let reference = self
                    .skeleton
                    .reference_pose
                    .get(index)
                    .copied()
                    .unwrap_or_default();
                rotation = quat_mul(reference.rotation, rotation);
                translation = [
                    reference.translation[0] + translation[0],
                    reference.translation[1] + translation[1],
                    reference.translation[2] + translation[2],
                ];
                scale += reference.scale;
            }

            pose.push(BoneTransform {
                translation: source_vec3_to_gltf(translation),
                rotation: source_quat_to_gltf(normalize_quat(rotation)),
                scale: [scale, scale, scale],
            });
        }
        Ok(pose)
    }

    pub fn sample_additive_delta_frame(&self, frame_index: usize) -> Result<Vec<BoneTransform>> {
        if !self.clip.additive {
            return Err(Source2Error::Resource("NM clip is not additive".into()));
        }
        if self.clip.frame_count == 0 {
            return Err(Source2Error::Resource("NM clip has no frames".into()));
        }
        let frame_index = frame_index.min(self.clip.frame_count - 1);
        let pose_offset = *self
            .clip
            .compressed_pose_offsets
            .get(frame_index)
            .ok_or_else(|| Source2Error::Resource("NM clip frame offset is missing".into()))?;
        let mut data_pos = pose_offset
            .checked_mul(2)
            .ok_or_else(|| Source2Error::Resource("NM clip frame byte offset overflow".into()))?;
        let track_count = self
            .skeleton
            .bone_names
            .len()
            .min(self.clip.track_settings.len());
        let mut pose = Vec::with_capacity(track_count);
        for setting in self.clip.track_settings.iter().take(track_count) {
            let mut rotation = setting.constant_rotation;
            let mut translation = [
                setting.translation[0].start,
                setting.translation[1].start,
                setting.translation[2].start,
            ];
            let mut scale = setting.scale.start;
            if !setting.rotation_static {
                rotation =
                    decode_quaternion(read_u16x3(&self.clip.compressed_pose_data, &mut data_pos)?);
            }
            if !setting.translation_static {
                let encoded = read_u16x3(&self.clip.compressed_pose_data, &mut data_pos)?;
                translation = [
                    decode_float(encoded[0], setting.translation[0]),
                    decode_float(encoded[1], setting.translation[1]),
                    decode_float(encoded[2], setting.translation[2]),
                ];
            }
            if !setting.scale_static {
                scale = decode_float(
                    read_u16(&self.clip.compressed_pose_data, &mut data_pos)?,
                    setting.scale,
                );
            }
            pose.push(BoneTransform {
                translation: source_vec3_to_gltf(translation),
                rotation: source_quat_to_gltf(normalize_quat(rotation)),
                scale: [scale, scale, scale],
            });
        }
        Ok(pose)
    }

    pub fn sample_pose(&self, time_seconds: f32, looping: bool) -> Result<Vec<BoneTransform>> {
        if self.clip.frame_count <= 1 || self.fps() <= f32::EPSILON {
            return self.sample_frame(0);
        }
        let duration = self.clip.duration_seconds;
        let sample_time = if looping {
            time_seconds.rem_euclid(duration)
        } else {
            time_seconds.clamp(0.0, duration)
        };
        let frame = sample_time * self.fps();
        let left_index = (frame.floor() as usize).min(self.clip.frame_count - 1);
        let right_index = if looping {
            (left_index + 1) % self.clip.frame_count
        } else {
            (left_index + 1).min(self.clip.frame_count - 1)
        };
        let amount = frame - left_index as f32;
        let left = self.sample_frame(left_index)?;
        if amount <= f32::EPSILON || left_index == right_index {
            return Ok(left);
        }
        let right = self.sample_frame(right_index)?;
        Ok(left
            .into_iter()
            .zip(right)
            .map(|(left, right)| BoneTransform {
                translation: lerp_vec3(left.translation, right.translation, amount),
                rotation: nlerp_quat(left.rotation, right.rotation, amount),
                scale: lerp_vec3(left.scale, right.scale, amount),
            })
            .collect())
    }
}

pub(crate) fn read_u16(data: &[u8], pos: &mut usize) -> Result<u16> {
    let value = data
        .get(*pos..pos.saturating_add(2))
        .map(|bytes| u16::from_le_bytes(bytes.try_into().unwrap()))
        .ok_or_else(|| Source2Error::Resource("NM compressed pose is truncated".into()))?;
    *pos += 2;
    Ok(value)
}

pub(crate) fn read_u16x3(data: &[u8], pos: &mut usize) -> Result<[u16; 3]> {
    Ok([
        read_u16(data, pos)?,
        read_u16(data, pos)?,
        read_u16(data, pos)?,
    ])
}

pub(crate) fn decode_float(value: u16, range: QuantizationRange) -> f32 {
    (f32::from(value) / f32::from(u16::MAX)).mul_add(range.length, range.start)
}

pub(crate) fn decode_quaternion(data: [u16; 3]) -> [f32; 4] {
    let minimum = -std::f32::consts::FRAC_1_SQRT_2;
    let multiplier = (std::f32::consts::SQRT_2) / 32_767.0;
    let values = [
        (f32::from(data[0] & 0x7fff) * multiplier) + minimum,
        (f32::from(data[1] & 0x7fff) * multiplier) + minimum,
        (f32::from(data[2]) * multiplier) + minimum,
    ];
    let largest = (1.0
        - values[0].mul_add(
            values[0],
            values[1].mul_add(values[1], values[2] * values[2]),
        ))
    .max(0.0)
    .sqrt();
    match ((data[0] >> 14) & 2) | (data[1] >> 15) {
        0 => [largest, values[0], values[1], values[2]],
        1 => [values[0], largest, values[1], values[2]],
        2 => [values[0], values[1], largest, values[2]],
        _ => [values[0], values[1], values[2], largest],
    }
}

pub(crate) fn lerp_vec3(left: [f32; 3], right: [f32; 3], amount: f32) -> [f32; 3] {
    [
        amount.mul_add(right[0] - left[0], left[0]),
        amount.mul_add(right[1] - left[1], left[1]),
        amount.mul_add(right[2] - left[2], left[2]),
    ]
}

pub(crate) fn nlerp_quat(left: [f32; 4], mut right: [f32; 4], amount: f32) -> [f32; 4] {
    let dot = left[0].mul_add(
        right[0],
        left[1].mul_add(right[1], left[2].mul_add(right[2], left[3] * right[3])),
    );
    if dot < 0.0 {
        right = [-right[0], -right[1], -right[2], -right[3]];
    }
    normalize_quat([
        amount.mul_add(right[0] - left[0], left[0]),
        amount.mul_add(right[1] - left[1], left[1]),
        amount.mul_add(right[2] - left[2], left[2]),
        amount.mul_add(right[3] - left[3], left[3]),
    ])
}

pub(crate) fn normalize_quat(quaternion: [f32; 4]) -> [f32; 4] {
    let length = quaternion[0]
        .mul_add(
            quaternion[0],
            quaternion[1].mul_add(
                quaternion[1],
                quaternion[2].mul_add(quaternion[2], quaternion[3] * quaternion[3]),
            ),
        )
        .sqrt();
    if length <= f32::EPSILON {
        [0.0, 0.0, 0.0, 1.0]
    } else {
        [
            quaternion[0] / length,
            quaternion[1] / length,
            quaternion[2] / length,
            quaternion[3] / length,
        ]
    }
}

pub(crate) fn quat_mul(left: [f32; 4], right: [f32; 4]) -> [f32; 4] {
    [
        left[3].mul_add(
            right[0],
            left[0].mul_add(right[3], left[1] * right[2] - left[2] * right[1]),
        ),
        left[3].mul_add(
            right[1],
            (-left[0]).mul_add(right[2], left[1] * right[3] + left[2] * right[0]),
        ),
        left[3].mul_add(
            right[2],
            left[0].mul_add(right[1], -left[1] * right[0] + left[2] * right[3]),
        ),
        left[3].mul_add(
            right[3],
            (-left[0]).mul_add(right[0], -left[1] * right[1] - left[2] * right[2]),
        ),
    ]
}

pub(crate) fn source_vec3_to_gltf(value: [f32; 3]) -> [f32; 3] {
    [value[0], value[2], -value[1]]
}

pub(crate) fn source_quat_to_gltf(value: [f32; 4]) -> [f32; 4] {
    let half = std::f32::consts::FRAC_PI_4;
    let transform = [-half.sin(), 0.0, 0.0, half.cos()];
    normalize_quat(quat_mul(
        quat_mul(transform, value),
        [-transform[0], -transform[1], -transform[2], transform[3]],
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::nm_anim::types::{
        NmAnimationClip, NmSkeleton, QuantizationRange, ReferenceTransform, TrackCompressionSetting,
    };

    fn static_setting(
        translation: [f32; 3],
        scale: f32,
        rotation: [f32; 4],
    ) -> TrackCompressionSetting {
        TrackCompressionSetting {
            translation: [
                QuantizationRange {
                    start: translation[0],
                    length: 0.0,
                },
                QuantizationRange {
                    start: translation[1],
                    length: 0.0,
                },
                QuantizationRange {
                    start: translation[2],
                    length: 0.0,
                },
            ],
            scale: QuantizationRange {
                start: scale,
                length: 0.0,
            },
            constant_rotation: rotation,
            rotation_static: true,
            translation_static: true,
            scale_static: true,
        }
    }

    fn animation(additive: bool) -> NmAnimation {
        NmAnimation {
            clip_path: "test".into(),
            skeleton: NmSkeleton {
                name: "test".into(),
                bone_names: vec!["root".into()],
                parent_indices: vec![-1],
                reference_pose: vec![ReferenceTransform {
                    translation: [1.0, 2.0, 3.0],
                    scale: 1.0,
                    rotation: [0.0, 0.0, 0.0, 1.0],
                }],
            },
            clip: NmAnimationClip {
                skeleton_path: "test".into(),
                frame_count: 1,
                duration_seconds: 0.0,
                additive,
                compressed_pose_data: Vec::new(),
                compressed_pose_offsets: vec![0],
                // A pure translation delta with an identity rotation delta.
                track_settings: vec![static_setting([0.5, 0.0, 0.0], 0.0, [0.0, 0.0, 0.0, 1.0])],
            },
        }
    }

    #[test]
    fn additive_clip_layers_delta_over_reference_pose() {
        let pose = animation(true).sample_frame(0).expect("sample");
        // Source-space result (ref + delta) = [1.5, 2, 3], scale 1, then the
        // Z-up -> Y-up conversion maps [x, y, z] -> [x, z, -y].
        assert!((pose[0].translation[0] - 1.5).abs() < 1e-5);
        assert!((pose[0].translation[1] - 3.0).abs() < 1e-5);
        assert!((pose[0].translation[2] + 2.0).abs() < 1e-5);
        assert!((pose[0].scale[0] - 1.0).abs() < 1e-5);
    }

    #[test]
    fn non_additive_clip_ignores_reference_pose() {
        let pose = animation(false).sample_frame(0).expect("sample");
        // Only the raw delta is emitted: [0.5, 0, 0] -> [0.5, 0, -0].
        assert!((pose[0].translation[0] - 0.5).abs() < 1e-5);
        assert!(pose[0].translation[1].abs() < 1e-5);
        assert!(pose[0].translation[2].abs() < 1e-5);
        assert!((pose[0].scale[0] - 0.0).abs() < 1e-5);
    }

    #[test]
    fn additive_delta_can_be_layered_on_an_external_pose() {
        let pose = animation(true)
            .sample_additive_delta_frame(0)
            .expect("sample delta");
        assert!((pose[0].translation[0] - 0.5).abs() < 1e-5);
        assert!(pose[0].translation[1].abs() < 1e-5);
        assert!(pose[0].translation[2].abs() < 1e-5);
        assert!(pose[0].scale[0].abs() < 1e-5);
    }
}
