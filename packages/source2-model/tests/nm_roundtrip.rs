use source2_model::{Resource, nm_anim, vpk_extract::VpkArchive};
use std::path::PathBuf;

fn archives() -> (VpkArchive, VpkArchive) {
    let base = PathBuf::from(std::env::var_os("DMM_NM_BASE_VPK").unwrap());
    let overlay = PathBuf::from(std::env::var_os("DMM_NM_ROUNDTRIP_GAME").unwrap());
    (
        VpkArchive::open(&base).unwrap(),
        VpkArchive::open(&base)
            .unwrap()
            .with_overlay(Some(&overlay)),
    )
}

#[test]
#[ignore = "requires DMM_NM_BASE_VPK, DMM_NM_ROUNDTRIP_GAME and DMM_NM_SKELETON"]
fn recompiled_skeleton_keeps_the_bone_order_used_by_staged_clips() {
    let (base, overlay) = archives();
    let path = std::env::var("DMM_NM_SKELETON").unwrap();
    let skeleton = |archive: &VpkArchive| {
        nm_anim::parse_nm_skeleton(&Resource::parse(archive.extract_entry(&path).unwrap()).unwrap())
            .unwrap()
    };
    assert_eq!(skeleton(&base).bone_names, skeleton(&overlay).bone_names);
}

#[test]
#[ignore = "requires DMM_NM_BASE_VPK, DMM_NM_ROUNDTRIP_GAME and DMM_NM_CLIPS"]
fn recompiled_aiming_clips_preserve_named_bone_poses() {
    let (base, overlay) = archives();
    for path in std::env::var("DMM_NM_CLIPS").unwrap().split(',') {
        let expected = nm_anim::load_nm_animation_from_archive(&base, path).unwrap();
        let actual = nm_anim::load_nm_animation_from_archive(&overlay, path).unwrap();
        assert_eq!(expected.clip.frame_count, actual.clip.frame_count, "{path}");
        assert_eq!(expected.clip.additive, actual.clip.additive, "{path}");
        let mapping: Vec<_> = expected
            .skeleton
            .bone_names
            .iter()
            .map(|name| {
                actual
                    .skeleton
                    .bone_names
                    .iter()
                    .position(|candidate| candidate == name)
                    .unwrap_or_else(|| panic!("{path}: missing bone {name}"))
            })
            .collect();
        for frame in 0..expected.clip.frame_count {
            let a = expected.sample_frame(frame).unwrap();
            let b = actual.sample_frame(frame).unwrap();
            for (index, &target) in mapping.iter().enumerate() {
                let bone = &expected.skeleton.bone_names[index];
                let distance = a[index]
                    .translation
                    .iter()
                    .zip(b[target].translation)
                    .map(|(x, y)| (x - y).powi(2))
                    .sum::<f32>()
                    .sqrt();
                let norm = |q: [f32; 4]| q.iter().map(|v| v * v).sum::<f32>().sqrt();
                let dot = a[index]
                    .rotation
                    .iter()
                    .zip(b[target].rotation)
                    .map(|(x, y)| x * y)
                    .sum::<f32>()
                    / (norm(a[index].rotation) * norm(b[target].rotation));
                let angle = 2.0 * dot.abs().clamp(0.0, 1.0).acos().to_degrees();
                assert!(
                    distance.is_finite() && distance <= 0.25 && angle.is_finite() && angle <= 0.5,
                    "{path} frame {frame}, {bone}: translation error {distance}, rotation error {angle} degrees"
                );
            }
        }
    }
}
