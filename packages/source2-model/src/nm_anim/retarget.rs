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

/// The bone a duplicate rig copies: `spine_1_001` and `spine_1.001` (the
/// names Blender gives a second armature) follow `spine_1`.
fn twin_name(name: &str) -> Option<&str> {
    let (stem, suffix) = name.rsplit_once(['_', '.'])?;
    (suffix.len() == 3 && suffix.bytes().all(|b| b.is_ascii_digit()) && !stem.is_empty())
        .then_some(stem)
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

    let target_index = target
        .bones
        .iter()
        .enumerate()
        .map(|(index, bone)| (bone.name.to_ascii_lowercase(), index))
        .collect::<HashMap<_, _>>();
    let mut target_models: Vec<[f32; 16]> = Vec::with_capacity(target.bones.len());
    let mut target_pose = Vec::with_capacity(target.bones.len());
    let mut twinned = Vec::with_capacity(target.bones.len());
    for bone in &target.bones {
        let own = source
            .get(&bone.name.to_ascii_lowercase())
            .and_then(|index| source_pose.get(*index))
            .copied();
        // Some skins weight the mesh to a renamed copy of the hero's rig that
        // no clip animates; the game shows it following the original bones.
        // The copy keeps its own proportions and turns as its twin does.
        let twin = own
            .is_none()
            .then(|| twin_name(&bone.name))
            .flatten()
            .map(str::to_ascii_lowercase)
            // Only a bone the clip drives; `Bone_007` must not chase a helper `Bone`.
            .filter(|name| source.contains_key(name))
            .and_then(|name| target_index.get(&name))
            .filter(|index| **index < target_models.len())
            .and_then(|index| {
                let twin_bone = &target.bones[*index];
                let delta = mat4_mul(
                    &target_models[*index],
                    &invert_affine(&twin_bone.model_bind_matrix).ok()?,
                );
                let rotated = mat4_mul(&delta, &bone.model_bind_matrix);
                let parent = (bone.parent >= 0)
                    .then_some(bone.parent as usize)
                    .filter(|parent| twinned.get(*parent).copied().unwrap_or(false));
                Some(match parent {
                    Some(parent) => with_rotation_of(
                        &mat4_mul(&target_models[parent], &bone.local_bind_matrix),
                        &rotated,
                    ),
                    None => rotated,
                })
            });
        twinned.push(twin.is_some());
        let animated_model = own.or(twin).unwrap_or_else(|| {
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

/// `position`'s translation and scale with `rotation`'s orientation.
fn with_rotation_of(position: &[f32; 16], rotation: &[f32; 16]) -> [f32; 16] {
    let placed = decompose_trs(position);
    let turned = decompose_trs(rotation);
    mat4_from_trs(placed.translation, turned.rotation, placed.scale)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn duplicate_rig_names_resolve_to_their_twin() {
        assert_eq!(twin_name("spine_1_001"), Some("spine_1"));
        assert_eq!(twin_name("hand_R.002"), Some("hand_R"));
        assert_eq!(twin_name("Bone_007"), Some("Bone"));
        assert_eq!(twin_name("spine_1"), None);
        assert_eq!(twin_name("$cloth_m0p14"), None);
    }

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
