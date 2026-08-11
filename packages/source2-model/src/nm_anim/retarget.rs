use std::collections::HashMap;

use crate::skeleton::BoneTransform;
use crate::skeleton::{Skeleton, decompose_trs, invert_affine, mat4_from_trs, mat4_mul};

use super::NmAnimation;

fn local_matrix(transform: BoneTransform) -> [f32; 16] {
    mat4_from_trs(transform.translation, transform.rotation, transform.scale)
}

fn build_model_matrices(local: &[BoneTransform], parents: &[i32]) -> Vec<[f32; 16]> {
    let mut models = Vec::with_capacity(local.len());
    for (index, transform) in local.iter().enumerate() {
        let local = local_matrix(*transform);
        let model = parents
            .get(index)
            .filter(|parent| **parent >= 0)
            .and_then(|parent| models.get(*parent as usize))
            .map_or(local, |parent| mat4_mul(parent, &local));
        models.push(model);
    }
    models
}

/// Project a sampled NM pose onto a model skeleton in component space. NM
/// clips can contain staging-only parents such as `root_motion`; projecting
/// globals preserves their effect while collapsing bones absent from the model.
pub fn retarget_nm_pose(
    animation: &NmAnimation,
    sampled: &[BoneTransform],
    target: &Skeleton,
) -> Vec<BoneTransform> {
    let source_pose = build_model_matrices(sampled, &animation.skeleton.parent_indices);
    let source = animation
        .skeleton
        .bone_names
        .iter()
        .enumerate()
        .map(|(index, name)| (name.to_ascii_lowercase(), index))
        .collect::<HashMap<_, _>>();

    let mut target_models = Vec::with_capacity(target.bones.len());
    let mut target_pose = Vec::with_capacity(target.bones.len());
    for bone in &target.bones {
        let animated_model = source
            .get(&bone.name.to_ascii_lowercase())
            .and_then(|index| source_pose.get(*index))
            .copied()
            .unwrap_or_else(|| {
                if bone.parent >= 0 {
                    target_models
                        .get(bone.parent as usize)
                        .map_or(bone.model_bind_matrix, |parent| {
                            mat4_mul(parent, &bone.local_bind_matrix)
                        })
                } else {
                    bone.model_bind_matrix
                }
            });
        let local = if bone.parent >= 0 {
            target_models
                .get(bone.parent as usize)
                .and_then(|parent| invert_affine(parent).ok())
                .map_or(animated_model, |inverse| {
                    mat4_mul(&inverse, &animated_model)
                })
        } else {
            animated_model
        };
        target_models.push(animated_model);
        target_pose.push(decompose_trs(&local));
    }
    target_pose
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_matrix_builder_respects_parent_hierarchy() {
        let local = [
            BoneTransform {
                translation: [1.0, 0.0, 0.0],
                rotation: [0.0, 0.0, 0.0, 1.0],
                scale: [1.0; 3],
            },
            BoneTransform {
                translation: [0.0, 2.0, 0.0],
                rotation: [0.0, 0.0, 0.0, 1.0],
                scale: [1.0; 3],
            },
        ];
        let matrices = build_model_matrices(&local, &[-1, 0]);
        assert_eq!(
            [matrices[1][12], matrices[1][13], matrices[1][14]],
            [1.0, 2.0, 0.0]
        );
    }
}
