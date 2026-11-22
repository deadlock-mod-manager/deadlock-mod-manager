//! Standing a hero that ships no gameplay clips.
//!
//! Heroes from a release vote arrive with only their menu clips (2026-10:
//! Baba, Deadman Danny, Nurse Harrow, Solomon and Violet). Those clips are
//! staged for a menu camera, not for a neutral preview: Violet's hero-picker
//! clip is a jump with her brush parked two metres underground, and Danny's
//! carries his flamethrower at his side with the off hand raised above it. So
//! the clip is chosen by what the pose looks like, a weapon can be borrowed
//! from a clip that holds it better, and the hands are then seated on the
//! weapon's own grip points.

use crate::error::Result;
use crate::nm_anim;
use crate::skeleton::{
    BoneTransform, Skeleton, decompose_trs, invert_affine, mat4_from_trs, mat4_mul,
};
use crate::vpk_extract::VpkArchive;

/// Menu clips worth trying, in order of preference when several pass.
const MENU_POSE_CLIPS: [&str; 6] = [
    "ui_hero_select",
    "ui_hero_info",
    "ui_main_menu",
    "ui_pose",
    "ui_shop",
    "ui_matchmaking",
];

/// Menu clips that hold a hero's weapon the way the game does, for heroes
/// whose standing clip does not: model file stem → clip.
///
/// No pose measure tells these apart reliably — Danny's hero-picker weapon
/// sits as far in front of his chest as Nurse Harrow's, which is held fine —
/// so this is picked by eye. Danny's shop clip carries the flamethrower at his
/// hip, barrel forward, but crouches, so only the weapon is taken from it.
/// Entries go stale once the hero ships `weapon_stand_idle`, which wins.
const WEAPON_HOLD_CLIPS: [(&str, &str); 1] = [("deadpack", "ui_shop")];

/// How far above its bind height a foot may sit and still count as standing.
/// Measured on the 2026-10 menu clips: standing poses stay within 8 units,
/// jumps and crouches lift the lower foot by 18 or more.
const GROUNDED_TOLERANCE: f32 = 8.0;

/// How far the weapon bone may sit from the nearest hand and still count as
/// held. Held weapons measured 5–10 units; parked ones 58 and more.
const HELD_WEAPON_DISTANCE: f32 = 20.0;

/// A hand further than this from its grip point is posed away on purpose
/// (waving, pointing), so it is left alone rather than dragged across the body.
const MAX_GRIP_CORRECTION: f32 = 30.0;

type Mat4 = [f32; 16];

fn bone_index(skeleton: &Skeleton, name: &str) -> Option<usize> {
    skeleton
        .bones
        .iter()
        .position(|bone| bone.name.eq_ignore_ascii_case(name))
}

fn parent_of(skeleton: &Skeleton, index: usize) -> Option<usize> {
    usize::try_from(skeleton.bones.get(index)?.parent).ok()
}

fn local_matrix(transform: &BoneTransform) -> Mat4 {
    mat4_from_trs(transform.translation, transform.rotation, transform.scale)
}

fn model_matrices(skeleton: &Skeleton, pose: &[BoneTransform]) -> Vec<Mat4> {
    let mut models: Vec<Mat4> = Vec::with_capacity(pose.len());
    for (index, transform) in pose.iter().enumerate() {
        let local = local_matrix(transform);
        let model = parent_of(skeleton, index)
            .and_then(|parent| models.get(parent))
            .map_or(local, |parent| mat4_mul(parent, &local));
        models.push(model);
    }
    models
}

fn identity() -> Mat4 {
    mat4_from_trs([0.0; 3], [0.0, 0.0, 0.0, 1.0], [1.0; 3])
}

fn position(matrix: &Mat4) -> [f32; 3] {
    [matrix[12], matrix[13], matrix[14]]
}

fn sub(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

fn add(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

fn scale(a: [f32; 3], factor: f32) -> [f32; 3] {
    [a[0] * factor, a[1] * factor, a[2] * factor]
}

fn dot(a: [f32; 3], b: [f32; 3]) -> f32 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

fn cross(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

fn length(a: [f32; 3]) -> f32 {
    dot(a, a).sqrt()
}

fn normalized(a: [f32; 3]) -> Option<[f32; 3]> {
    let len = length(a);
    (len > 1e-5).then(|| scale(a, 1.0 / len))
}

/// The rotation turning `from` onto `to`, pivoting about `pivot`.
fn rotation_about(pivot: [f32; 3], from: [f32; 3], to: [f32; 3]) -> Option<Mat4> {
    let from = normalized(from)?;
    let to = normalized(to)?;
    let axis = cross(from, to);
    let sin = length(axis);
    let cos = dot(from, to);
    if sin < 1e-6 {
        // Already aligned; an exact flip cannot happen inside the reach clamp.
        return None;
    }
    let half = sin.atan2(cos) * 0.5;
    let axis = scale(axis, half.sin() / sin);
    let rotation = mat4_from_trs([0.0; 3], [axis[0], axis[1], axis[2], half.cos()], [1.0; 3]);
    let rotated_pivot = [
        rotation[0] * pivot[0] + rotation[4] * pivot[1] + rotation[8] * pivot[2],
        rotation[1] * pivot[0] + rotation[5] * pivot[1] + rotation[9] * pivot[2],
        rotation[2] * pivot[0] + rotation[6] * pivot[1] + rotation[10] * pivot[2],
    ];
    let mut about = rotation;
    let offset = sub(pivot, rotated_pivot);
    about[12] = offset[0];
    about[13] = offset[1];
    about[14] = offset[2];
    Some(about)
}

/// Whether a menu pose reads as the hero standing with the weapon in hand.
/// A check whose bones the rig lacks is skipped rather than failed.
fn pose_is_neutral(skeleton: &Skeleton, pose: &[BoneTransform]) -> bool {
    let models = model_matrices(skeleton, pose);

    let feet = ["ankle_L", "ankle_R"]
        .iter()
        .filter_map(|name| bone_index(skeleton, name))
        .collect::<Vec<_>>();
    let grounded = feet.is_empty() || {
        let lowest = feet.iter().map(|&foot| models[foot][13]);
        let bind_lowest = feet
            .iter()
            .map(|&foot| skeleton.bones[foot].model_bind_matrix[13]);
        lowest.fold(f32::MAX, f32::min) - bind_lowest.fold(f32::MAX, f32::min) <= GROUNDED_TOLERANCE
    };

    let held = match bone_index(skeleton, "weapon") {
        None => true,
        Some(weapon) => ["hand_R", "hand_L"]
            .iter()
            .filter_map(|name| bone_index(skeleton, name))
            .any(|hand| {
                length(sub(position(&models[weapon]), position(&models[hand])))
                    <= HELD_WEAPON_DISTANCE
            }),
    };

    grounded && held
}

fn load_menu_pose(
    archive: &VpkArchive,
    clip_path: &str,
    skeleton: &Skeleton,
) -> Result<Option<Vec<BoneTransform>>> {
    if !archive.contains_entry(clip_path) {
        return Ok(None);
    }
    let animation = nm_anim::load_nm_animation_from_archive(archive, clip_path)?;
    let frame = animation.sample_frame(0)?;
    Ok(Some(nm_anim::retarget_nm_pose(
        &animation, &frame, skeleton,
    )))
}

/// The topmost bone of the weapon's own chain (`weaponPivot` in every 2026-10
/// rig): the ancestor of `weapon` that hangs directly off the skeleton root.
fn weapon_root(skeleton: &Skeleton) -> Option<usize> {
    let mut bone = bone_index(skeleton, "weapon")?;
    loop {
        let parent = parent_of(skeleton, bone)?;
        if parent_of(skeleton, parent).is_none() {
            return Some(bone);
        }
        bone = parent;
    }
}

fn descends_from(skeleton: &Skeleton, mut bone: usize, ancestor: usize) -> bool {
    loop {
        if bone == ancestor {
            return true;
        }
        match parent_of(skeleton, bone) {
            Some(parent) => bone = parent,
            None => return false,
        }
    }
}

/// The bone whose heading a borrowed weapon turns with: the chest, which the
/// arms holding it hang from.
const HEADING_BONE: &str = "spine_3";

/// An upright frame at the pelvis, turned the way the chest faces.
///
/// Only the heading is taken from the chest: a crouching clip tilts the pelvis
/// and chest, and a weapon placed relative to either inherits the tilt and
/// points at the floor once the body stands up again. The feet are no guide
/// to the heading in a menu pose — Danny stands with them splayed 45° apart —
/// but in the bind pose they point straight ahead, so they fix which of the
/// chest's own axes is forward.
fn body_frame(skeleton: &Skeleton, models: &[Mat4]) -> Option<Mat4> {
    let pelvis = bone_index(skeleton, "pelvis")?;
    let chest = bone_index(skeleton, HEADING_BONE).unwrap_or(pelvis);

    let mut bind_forward = [0.0; 3];
    for side in ["L", "R"] {
        let ankle = bone_index(skeleton, &format!("ankle_{side}"))?;
        let toe = bone_index(skeleton, &format!("ball_{side}"))
            .or_else(|| bone_index(skeleton, &format!("toe_{side}")))?;
        let step = sub(
            position(&skeleton.bones[toe].model_bind_matrix),
            position(&skeleton.bones[ankle].model_bind_matrix),
        );
        bind_forward = add(bind_forward, [step[0], 0.0, step[2]]);
    }
    let to_chest = invert_affine(&skeleton.bones[chest].model_bind_matrix).ok()?;
    let chest_forward = transform_vector(&to_chest, normalized(bind_forward)?);

    let facing = transform_vector(&models[chest], chest_forward);
    let forward = normalized([facing[0], 0.0, facing[2]])?;
    let side = cross(forward, [0.0, 1.0, 0.0]);
    let origin = position(&models[pelvis]);
    Some([
        forward[0], forward[1], forward[2], 0.0, //
        0.0, 1.0, 0.0, 0.0, //
        side[0], side[1], side[2], 0.0, //
        origin[0], origin[1], origin[2], 1.0,
    ])
}

/// A direction through `matrix`, ignoring its translation.
fn transform_vector(matrix: &Mat4, v: [f32; 3]) -> [f32; 3] {
    [
        matrix[0] * v[0] + matrix[4] * v[1] + matrix[8] * v[2],
        matrix[1] * v[0] + matrix[5] * v[1] + matrix[9] * v[2],
        matrix[2] * v[0] + matrix[6] * v[1] + matrix[10] * v[2],
    ]
}

/// Move the weapon in `base` to where `donor` holds it relative to the body.
/// The weapon's own bones (hoses, triggers) take the donor's pose with it.
fn transplant_weapon(
    skeleton: &Skeleton,
    base: &mut [BoneTransform],
    donor: &[BoneTransform],
) -> Option<()> {
    let root = weapon_root(skeleton)?;
    let parent = parent_of(skeleton, root)?;
    let base_models = model_matrices(skeleton, base);
    let donor_models = model_matrices(skeleton, donor);

    let relative_to_body = mat4_mul(
        &invert_affine(&body_frame(skeleton, &donor_models)?).ok()?,
        &donor_models[root],
    );
    let placed = mat4_mul(&body_frame(skeleton, &base_models)?, &relative_to_body);
    base[root] = decompose_trs(&mat4_mul(
        &invert_affine(&base_models[parent]).ok()?,
        &placed,
    ));
    for bone in 0..base.len() {
        if bone != root && descends_from(skeleton, bone, root) {
            base[bone] = donor[bone];
        }
    }
    Some(())
}

/// How much of an arm's full length a hand may be asked to reach, so a seated
/// arm keeps a slight bend instead of locking straight.
const COMFORTABLE_REACH: f32 = 0.92;

/// Where the wrist must be for the hand's grip point to land on the weapon's,
/// with the shoulder it hangs from and how far that arm reaches.
fn grip_reach(
    skeleton: &Skeleton,
    models: &[Mat4],
    pose: &[BoneTransform],
    side: &str,
) -> Option<([f32; 3], [f32; 3], f32)> {
    let hand = bone_index(skeleton, &format!("hand_{side}"))?;
    let grip = bone_index(skeleton, &format!("attachHand_{side}"))?;
    let weapon_grip = bone_index(skeleton, &format!("weaponAttachHand_{side}"))?;
    let lower = parent_of(skeleton, hand)?;
    let upper = parent_of(skeleton, lower)?;
    let wrist = position(&mat4_mul(
        &models[weapon_grip],
        &invert_affine(&local_matrix(&pose[grip])).ok()?,
    ));
    let shoulder = position(&models[upper]);
    let reach = length(sub(position(&models[lower]), shoulder))
        + length(sub(position(&models[hand]), position(&models[lower])));
    Some((wrist, shoulder, reach * COMFORTABLE_REACH))
}

/// Slide a borrowed weapon (without turning it) towards the body until both
/// grips are within arm's reach. The donor clip's body is shaped differently —
/// Danny's crouches — so its hold can leave a grip further out than the
/// standing arm can stretch.
fn pull_weapon_into_reach(skeleton: &Skeleton, pose: &mut [BoneTransform]) -> Option<()> {
    let root = weapon_root(skeleton)?;
    let parent = parent_of(skeleton, root)?;
    for _ in 0..8 {
        let models = model_matrices(skeleton, pose);
        let mut shortfall = [0.0; 3];
        let mut short = 0;
        for side in ["R", "L"] {
            let Some((wrist, shoulder, reach)) = grip_reach(skeleton, &models, pose, side) else {
                continue;
            };
            let out = sub(wrist, shoulder);
            let distance = length(out);
            if distance > reach {
                shortfall = add(shortfall, scale(out, (distance - reach) / distance));
                short += 1;
            }
        }
        if short == 0 {
            break;
        }
        let mut moved = models[root];
        let step = scale(shortfall, 1.0 / short as f32);
        moved[12] -= step[0];
        moved[13] -= step[1];
        moved[14] -= step[2];
        pose[root] = decompose_trs(&mat4_mul(&invert_affine(&models[parent]).ok()?, &moved));
    }
    Some(())
}

/// Stand a hero in a menu pose with the weapon in hand.
///
/// The pose is the first menu clip whose first frame stands with the weapon in
/// a hand, falling back to the first menu clip present — that still beats the
/// bind pose. A hero listed in [`WEAPON_HOLD_CLIPS`] then takes its weapon
/// from that clip instead, and the hands are seated on the weapon's grips.
pub(crate) fn menu_pose(
    archive: &VpkArchive,
    entry_path: &str,
    skeleton: &Skeleton,
) -> Result<Option<Vec<BoneTransform>>> {
    let normalized = entry_path.replace('\\', "/").to_ascii_lowercase();
    let Some((model_directory, file_name)) = normalized.rsplit_once('/') else {
        return Ok(None);
    };
    let clip_path = |clip: &str| format!("{model_directory}/clips/{clip}.vnmclip_c");

    let mut chosen = None;
    let mut fallback = None;
    for clip in MENU_POSE_CLIPS {
        let Some(pose) = load_menu_pose(archive, &clip_path(clip), skeleton)? else {
            continue;
        };
        if pose_is_neutral(skeleton, &pose) {
            chosen = Some(pose);
            break;
        }
        fallback.get_or_insert(pose);
    }
    let Some(mut pose) = chosen.or(fallback) else {
        return Ok(None);
    };

    let stem = file_name.trim_end_matches(".vmdl_c");
    let hold_clip = WEAPON_HOLD_CLIPS
        .iter()
        .find(|(model, _)| *model == stem)
        .map(|(_, clip)| clip_path(clip));
    let mut max_correction = MAX_GRIP_CORRECTION;
    if let Some(hold_clip) = hold_clip
        && let Some(donor) = load_menu_pose(archive, &hold_clip, skeleton)?
        && transplant_weapon(skeleton, &mut pose, &donor).is_some()
    {
        pull_weapon_into_reach(skeleton, &mut pose);
        // The weapon has moved away from the hands, so they follow it however far.
        max_correction = f32::MAX;
    }
    seat_hands_on_weapon(skeleton, &mut pose, max_correction);
    Ok(Some(pose))
}

/// Seat each hand on the weapon's grip point for it.
///
/// Deadlock rigs carry the grip twice: `attachHand_<side>` under the hand and
/// `weaponAttachHand_<side>` under the weapon. The game's anim graph pulls the
/// one onto the other at runtime; a sampled menu clip does not, so a two-bone
/// IK on the arm does it here. Rigs without the pair are left untouched, and so
/// is a hand further than `max_correction` from its grip.
fn seat_hands_on_weapon(skeleton: &Skeleton, pose: &mut [BoneTransform], max_correction: f32) {
    for side in ["R", "L"] {
        seat_hand(skeleton, pose, side, max_correction);
    }
}

fn seat_hand(
    skeleton: &Skeleton,
    pose: &mut [BoneTransform],
    side: &str,
    max_correction: f32,
) -> Option<()> {
    let hand = bone_index(skeleton, &format!("hand_{side}"))?;
    let grip = bone_index(skeleton, &format!("attachHand_{side}"))?;
    let weapon_grip = bone_index(skeleton, &format!("weaponAttachHand_{side}"))?;
    if parent_of(skeleton, grip)? != hand {
        return None;
    }
    let lower = parent_of(skeleton, hand)?;
    let upper = parent_of(skeleton, lower)?;
    let models = model_matrices(skeleton, pose);

    // Where the hand must be for its grip point to land on the weapon's.
    let target_hand = mat4_mul(
        &models[weapon_grip],
        &invert_affine(&local_matrix(&pose[grip])).ok()?,
    );
    let correction = length(sub(position(&models[grip]), position(&models[weapon_grip])));
    if !(0.5..=max_correction).contains(&correction) {
        return None;
    }

    let shoulder = position(&models[upper]);
    let elbow = position(&models[lower]);
    let wrist = position(&models[hand]);
    let upper_length = length(sub(elbow, shoulder));
    let lower_length = length(sub(wrist, elbow));
    let to_target = sub(position(&target_hand), shoulder);
    let direction = normalized(to_target)?;
    let reach = length(to_target).clamp(
        (upper_length - lower_length).abs() + 1e-3,
        upper_length + lower_length - 1e-3,
    );
    let wrist_target = add(shoulder, scale(direction, reach));

    // Keep the elbow bending the way the clip bent it.
    let current_bend = sub(elbow, shoulder);
    let pole = normalized(sub(
        current_bend,
        scale(direction, dot(current_bend, direction)),
    ))?;
    let cos = ((upper_length.powi(2) + reach.powi(2) - lower_length.powi(2))
        / (2.0 * upper_length * reach))
        .clamp(-1.0, 1.0);
    let sin = (1.0 - cos * cos).sqrt();
    let elbow_target = add(
        shoulder,
        scale(add(scale(direction, cos), scale(pole, sin)), upper_length),
    );

    let swing_upper = rotation_about(shoulder, sub(elbow, shoulder), sub(elbow_target, shoulder))
        .unwrap_or_else(identity);
    let upper_model = mat4_mul(&swing_upper, &models[upper]);
    let lower_swung = mat4_mul(&swing_upper, &models[lower]);
    let hand_swung = mat4_mul(&swing_upper, &models[hand]);
    let swing_lower = rotation_about(
        elbow_target,
        sub(position(&hand_swung), elbow_target),
        sub(wrist_target, elbow_target),
    )
    .unwrap_or_else(identity);
    let lower_model = mat4_mul(&swing_lower, &lower_swung);
    let mut hand_model = target_hand;
    hand_model[12] = wrist_target[0];
    hand_model[13] = wrist_target[1];
    hand_model[14] = wrist_target[2];

    let upper_parent = match parent_of(skeleton, upper) {
        Some(parent) => invert_affine(&models[parent]).ok()?,
        None => identity(),
    };
    pose[upper] = decompose_trs(&mat4_mul(&upper_parent, &upper_model));
    pose[lower] = decompose_trs(&mat4_mul(&invert_affine(&upper_model).ok()?, &lower_model));
    pose[hand] = decompose_trs(&mat4_mul(&invert_affine(&lower_model).ok()?, &hand_model));
    Some(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::skeleton::Bone;

    const IDENTITY: [f32; 4] = [0.0, 0.0, 0.0, 1.0];

    fn at(translation: [f32; 3]) -> BoneTransform {
        BoneTransform {
            translation,
            rotation: IDENTITY,
            scale: [1.0; 3],
        }
    }

    fn skeleton_from(bones: &[(&str, i32)], pose: &[BoneTransform]) -> Skeleton {
        Skeleton {
            bones: bones
                .iter()
                .zip(pose)
                .map(|((name, parent), transform)| {
                    let local = local_matrix(transform);
                    Bone {
                        name: (*name).to_string(),
                        parent: *parent,
                        flags: 0,
                        bind_pos: transform.translation,
                        bind_rot: transform.rotation,
                        bind_scale: transform.scale,
                        local_bind_matrix: local,
                        model_bind_matrix: local,
                    }
                })
                .collect(),
            inverse_bind_matrices: Vec::new(),
        }
    }

    /// A shoulder → elbow → wrist arm with a grip under the hand, and a weapon
    /// whose grip point sits `offset` away from the hand's.
    fn arm_holding_weapon(offset: [f32; 3]) -> (Skeleton, Vec<BoneTransform>) {
        let bones = [
            ("root_motion", -1),
            ("arm_upper_L", 0),
            ("arm_lower_L", 1),
            ("hand_L", 2),
            ("attachHand_L", 3),
            ("weapon", 0),
            ("weaponAttachHand_L", 5),
        ];
        let pose = vec![
            at([0.0; 3]),
            at([0.0, 50.0, 0.0]),
            at([15.0, 0.0, 0.0]),
            at([15.0, 0.0, 0.0]),
            at([2.0, 0.0, 0.0]),
            at([0.0; 3]),
            at(add([22.0, 50.0, 10.0], offset)),
        ];
        (skeleton_from(&bones, &pose), pose)
    }

    fn grip_gap(skeleton: &Skeleton, pose: &[BoneTransform]) -> f32 {
        let models = model_matrices(skeleton, pose);
        length(sub(position(&models[4]), position(&models[6])))
    }

    #[test]
    fn seats_an_off_hand_on_the_weapon_grip() {
        let (skeleton, mut pose) = arm_holding_weapon([-6.0, 8.0, 0.0]);
        assert!(grip_gap(&skeleton, &pose) > 10.0);
        seat_hands_on_weapon(&skeleton, &mut pose, MAX_GRIP_CORRECTION);
        assert!(grip_gap(&skeleton, &pose) < 0.01);

        // The arm keeps its bone lengths.
        let models = model_matrices(&skeleton, &pose);
        let upper = length(sub(position(&models[2]), position(&models[1])));
        let lower = length(sub(position(&models[3]), position(&models[2])));
        assert!((upper - 15.0).abs() < 0.01 && (lower - 15.0).abs() < 0.01);
    }

    #[test]
    fn leaves_a_hand_posed_far_from_the_weapon_alone() {
        let (skeleton, mut pose) = arm_holding_weapon([0.0, 60.0, 0.0]);
        let before = pose.clone();
        seat_hands_on_weapon(&skeleton, &mut pose, MAX_GRIP_CORRECTION);
        assert_eq!(pose[3].translation, before[3].translation);
        assert_eq!(pose[1].rotation, before[1].rotation);
    }

    #[test]
    fn transplants_the_weapon_upright_and_turned_with_the_chest() {
        let bones = [
            ("root_motion", -1),
            ("pelvis", 0),
            ("ankle_L", 1),
            ("ball_L", 2),
            ("ankle_R", 1),
            ("ball_R", 4),
            ("weaponPivot", 0),
            ("weapon", 6),
        ];
        // The bind pose: pelvis at 50, feet pointing +x.
        let standing = |height: f32, pelvis_rotation: [f32; 4], pivot: [f32; 3]| {
            vec![
                at([0.0; 3]),
                BoneTransform {
                    rotation: pelvis_rotation,
                    ..at([0.0, height, 0.0])
                },
                at([-5.0, 10.0 - height, 0.0]),
                at([8.0, 0.0, 0.0]),
                at([5.0, 10.0 - height, 0.0]),
                at([8.0, 0.0, 0.0]),
                at(pivot),
                at([1.0, 0.0, 0.0]),
            ]
        };
        let mut base = standing(50.0, IDENTITY, [0.0; 3]);
        // Donor: crouched to 40 with the hips turned to face +z, weapon held 20
        // in front of them.
        let half = std::f32::consts::FRAC_1_SQRT_2;
        let donor = standing(40.0, [0.0, -half, 0.0, half], [0.0, 40.0, 20.0]);
        let skeleton = skeleton_from(&bones, &base);
        transplant_weapon(&skeleton, &mut base, &donor).unwrap();

        let models = model_matrices(&skeleton, &base);
        let close = |a: [f32; 3], b: [f32; 3]| length(sub(a, b)) < 1e-4;
        assert!(
            close(position(&models[6]), [20.0, 50.0, 0.0]),
            "20 in front of the base pelvis"
        );
        // The donor's weapon pointed along +x while facing +z, i.e. to its
        // left; turned onto a body facing +x that is -z.
        assert!(close(position(&models[7]), [20.0, 50.0, -1.0]));
    }
}
