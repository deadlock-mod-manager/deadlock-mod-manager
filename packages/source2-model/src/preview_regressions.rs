//! Synthetic archive fixtures only; no Valve assets are stored in this repository.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Arc;

use crate::preview_report::PreviewIssueKind;
use crate::vpk_extract::VpkArchive;

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "dmm-preview-regression-{}-{nonce}",
            std::process::id()
        ));
        std::fs::create_dir_all(&root).unwrap();
        Self(root)
    }

    fn archive(&self, name: &str, entries: &[(&str, Vec<u8>)]) -> VpkArchive {
        let mut groups = BTreeMap::<&str, BTreeMap<&str, Vec<(&str, &Vec<u8>)>>>::new();
        for (path, bytes) in entries {
            let (stem, extension) = path.rsplit_once('.').unwrap();
            let (folder, filename) = stem.rsplit_once('/').unwrap();
            groups
                .entry(extension)
                .or_default()
                .entry(folder)
                .or_default()
                .push((filename, bytes));
        }
        let mut tree = Vec::new();
        let mut payload = Vec::new();
        for (extension, folders) in groups {
            tree.extend_from_slice(extension.as_bytes());
            tree.push(0);
            for (folder, entries) in folders {
                tree.extend_from_slice(folder.as_bytes());
                tree.push(0);
                for (filename, bytes) in entries {
                    tree.extend_from_slice(filename.as_bytes());
                    tree.push(0);
                    tree.extend_from_slice(&0u32.to_le_bytes());
                    tree.extend_from_slice(&0u16.to_le_bytes());
                    tree.extend_from_slice(&0x7fffu16.to_le_bytes());
                    tree.extend_from_slice(&(payload.len() as u32).to_le_bytes());
                    tree.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
                    tree.extend_from_slice(&0xffffu16.to_le_bytes());
                    payload.extend_from_slice(bytes);
                }
                tree.push(0);
            }
            tree.push(0);
        }
        tree.push(0);
        let mut bytes = 0x55aa1234u32.to_le_bytes().to_vec();
        bytes.extend_from_slice(&1u32.to_le_bytes());
        bytes.extend_from_slice(&(tree.len() as u32).to_le_bytes());
        bytes.extend(tree);
        bytes.extend(payload);
        let path = self.0.join(name);
        std::fs::write(&path, bytes).unwrap();
        VpkArchive::open(&path).unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn resource(blocks: &[(&str, Vec<u8>)]) -> Vec<u8> {
    let mut bytes = vec![0; 16 + blocks.len() * 12];
    bytes[4..6].copy_from_slice(&12u16.to_le_bytes());
    bytes[8..12].copy_from_slice(&8u32.to_le_bytes());
    bytes[12..16].copy_from_slice(&(blocks.len() as u32).to_le_bytes());
    for (index, (name, data)) in blocks.iter().enumerate() {
        let pos = 16 + index * 12;
        bytes[pos..pos + 4].copy_from_slice(name.as_bytes());
        let relative = (bytes.len() - (pos + 4)) as u32;
        bytes[pos + 4..pos + 8].copy_from_slice(&relative.to_le_bytes());
        bytes[pos + 8..pos + 12].copy_from_slice(&(data.len() as u32).to_le_bytes());
        bytes.extend_from_slice(data);
    }
    let size = bytes.len() as u32;
    bytes[..4].copy_from_slice(&size.to_le_bytes());
    bytes
}

fn model(meshes: &[&str]) -> Vec<u8> {
    let mut rerl = vec![0; 8 + meshes.len() * 16];
    rerl[..4].copy_from_slice(&8u32.to_le_bytes());
    rerl[4..8].copy_from_slice(&(meshes.len() as u32).to_le_bytes());
    for (index, path) in meshes.iter().enumerate() {
        let offset = 16 + index * 16;
        let relative = (rerl.len() - offset) as i64;
        rerl[offset..offset + 8].copy_from_slice(&relative.to_le_bytes());
        rerl.extend_from_slice(path.as_bytes());
        rerl.push(0);
    }
    resource(&[("RERL", rerl)])
}

fn triangle() -> Vec<u8> {
    let mut vbib = vec![0; 162];
    let mut set = |pos: usize, value: u32| vbib[pos..pos + 4].copy_from_slice(&value.to_le_bytes());
    set(0, 16);
    set(4, 1);
    set(8, 32);
    set(12, 1);
    // Vertex/index descriptors; one POSITION field and three triangle indices.
    set(16, 3);
    set(20, 12);
    set(24, 40);
    set(28, 1);
    set(32, 88);
    set(36, 36);
    set(40, 3);
    set(44, 2);
    set(56, 100);
    set(60, 6);
    set(100, 6); // DXGI_FORMAT_R32G32B32_FLOAT
    vbib[64..72].copy_from_slice(b"POSITION");
    for (index, value) in [0.0f32, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0]
        .iter()
        .enumerate()
    {
        vbib[120 + index * 4..124 + index * 4].copy_from_slice(&value.to_le_bytes());
    }
    vbib[156..162].copy_from_slice(&[0, 0, 1, 0, 2, 0]);
    resource(&[("VBIB", vbib)])
}

fn color_texture() -> Vec<u8> {
    let mut data = vec![0; 40];
    data[20..22].copy_from_slice(&1u16.to_le_bytes());
    data[22..24].copy_from_slice(&1u16.to_le_bytes());
    data[24..26].copy_from_slice(&1u16.to_le_bytes());
    data[26] = crate::VtexFormat::Rgba8888 as u8;
    data[27] = 1;
    let mut bytes = resource(&[("DATA", data)]);
    bytes.extend_from_slice(&[220, 30, 50, 255]);
    bytes
}

#[test]
fn texture_only_mod_assembles_all_base_meshes_and_reports_provenance() {
    let fixture = Fixture::new();
    let base = Arc::new(fixture.archive(
        "base.vpk",
        &[
            (
                "models/heroes/test/body.vmdl_c",
                model(&[
                    "models/heroes/test/body.vmesh_c",
                    "models/heroes/test/weapon.vmesh_c",
                ]),
            ),
            ("models/heroes/test/body.vmesh_c", triangle()),
            ("models/heroes/test/weapon.vmesh_c", triangle()),
        ],
    ));
    let archive = fixture
        .archive(
            "mod.vpk",
            &[(
                "materials/models/heroes/test/body_color.vtex_c",
                color_texture(),
            )],
        )
        .with_fallbacks(vec![base])
        .with_preview_report();
    let decoded =
        crate::decode_model_glb_from_archive(&archive, "models/heroes/test/body.vmdl_c").unwrap();
    assert_eq!((decoded.vertex_count, decoded.index_count), (6, 6));
    assert_eq!(&decoded.glb[..4], b"glTF");
    let report = archive.preview_report();
    assert!(
        report
            .dependencies
            .iter()
            .any(|source| source.path.ends_with("body_color.vtex_c")
                && source.archive.ends_with("mod.vpk"))
    );
    assert!(
        report
            .dependencies
            .iter()
            .any(|source| source.path.ends_with("body.vmdl_c")
                && source.archive.ends_with("base.vpk"))
    );
    assert!(
        report
            .issues
            .iter()
            .all(|issue| issue.kind == PreviewIssueKind::Unsupported)
    );
}

#[test]
fn corrupt_mod_mesh_never_falls_back_to_stock_and_usable_mesh_survives() {
    let fixture = Fixture::new();
    let base = Arc::new(fixture.archive(
        "base.vpk",
        &[
            (
                "models/heroes/test/body.vmdl_c",
                model(&[
                    "models/heroes/test/body.vmesh_c",
                    "models/heroes/test/weapon.vmesh_c",
                ]),
            ),
            ("models/heroes/test/body.vmesh_c", triangle()),
            ("models/heroes/test/weapon.vmesh_c", triangle()),
        ],
    ));
    let archive = fixture
        .archive(
            "mod.vpk",
            &[(
                "models/heroes/test/weapon.vmesh_c",
                b"corrupt mod mesh".to_vec(),
            )],
        )
        .with_fallbacks(vec![base])
        .with_preview_report();
    let decoded =
        crate::decode_model_glb_from_archive(&archive, "models/heroes/test/body.vmdl_c").unwrap();
    assert_eq!(decoded.vertex_count, 3);
    assert!(
        archive
            .preview_report()
            .issues
            .iter()
            .any(|issue| issue.path.ends_with("weapon.vmesh_c")
                && issue.kind == PreviewIssueKind::CorruptOverride)
    );
}

#[test]
fn every_dependency_kind_obeys_overlay_mod_base_core_order() {
    let fixture = Fixture::new();
    let paths = [
        "models/a.vmdl_c",
        "materials/a.vmat_c",
        "textures/a.vtex_c",
        "clips/a.vnmclip_c",
        "particles/a.vpcf_c",
    ];
    let entries = |value: &[u8]| {
        paths
            .iter()
            .map(|path| (*path, value.to_vec()))
            .collect::<Vec<_>>()
    };
    let core = Arc::new(fixture.archive("core.vpk", &entries(b"core")));
    let base = Arc::new(fixture.archive("base.vpk", &entries(b"base")));
    let addon = fixture
        .archive("mod.vpk", &entries(b"mod"))
        .with_fallbacks(vec![base, core]);
    for path in paths {
        assert_eq!(addon.extract_entry_limited(path, 16).unwrap(), b"mod");
    }
    let overlay = fixture.0.join("overlay");
    std::fs::create_dir_all(overlay.join("textures")).unwrap();
    std::fs::write(overlay.join("textures/a.vtex_c"), b"edit").unwrap();
    let overlay = VpkArchive::open_with_overlay(&fixture.0.join("mod.vpk"), Some(&overlay))
        .unwrap()
        .with_preview_report();
    assert_eq!(overlay.extract_entry("textures/a.vtex_c").unwrap(), b"edit");
    assert!(overlay.preview_report().dependencies[0].overlay);
    assert!(matches!(
        overlay.extract_entry("missing/a.vtex_c"),
        Err(crate::Source2Error::EntryNotFound(_))
    ));
    assert_eq!(
        overlay.preview_report().issues[0].kind,
        PreviewIssueKind::MissingDependency
    );
    let core = Arc::new(fixture.archive(
        "core-only.vpk",
        &[("particles/shared.vpcf_c", b"core effect".to_vec())],
    ));
    let base = Arc::new(fixture.archive(
        "base-only.vpk",
        &[("textures/shared.vtex_c", b"game texture".to_vec())],
    ));
    let partial = fixture
        .archive(
            "partial.vpk",
            &[("models/unique.vmdl_c", b"mod model".to_vec())],
        )
        .with_fallbacks(vec![base, core]);
    assert_eq!(
        partial.extract_entry("textures/shared.vtex_c").unwrap(),
        b"game texture"
    );
    assert_eq!(
        partial.extract_entry("particles/shared.vpcf_c").unwrap(),
        b"core effect"
    );
}

#[test]
fn failed_explicit_material_is_not_replaced_with_a_guessed_color_map() {
    let fixture = Fixture::new();
    let archive = fixture
        .archive(
            "mod.vpk",
            &[
                (
                    "materials/models/heroes/test/body.vmat_c",
                    b"invalid material".to_vec(),
                ),
                (
                    "materials/models/heroes/test/body_color.vtex_c",
                    color_texture(),
                ),
            ],
        )
        .with_preview_report();
    let textures = crate::material_preview::decode_preview_textures(
        &archive,
        "models/heroes/test/body.vmdl_c",
        &["materials/models/heroes/test/body.vmat_c".into()],
    );
    assert!(textures.is_empty());
    assert_eq!(
        archive.preview_report().issues[0].kind,
        PreviewIssueKind::CorruptOverride
    );
}

#[test]
fn truncated_texture_payload_is_corrupt_while_unknown_encoding_is_unsupported() {
    let fixture = Fixture::new();
    let mut truncated = color_texture();
    truncated.pop();
    let mut unsupported = color_texture();
    unsupported[28 + 26] = 255;
    let archive = fixture
        .archive(
            "mod.vpk",
            &[
                (
                    "materials/models/heroes/test/truncated_color.vtex_c",
                    truncated,
                ),
                (
                    "materials/models/heroes/test/unsupported_color.vtex_c",
                    unsupported,
                ),
            ],
        )
        .with_preview_report();
    let textures = crate::material_preview::decode_preview_textures(
        &archive,
        "models/heroes/test/body.vmdl_c",
        &[],
    );
    assert!(textures.is_empty());
    let report = archive.preview_report();
    assert!(
        report
            .issues
            .iter()
            .any(|issue| issue.path.ends_with("truncated_color.vtex_c")
                && issue.kind == PreviewIssueKind::CorruptOverride)
    );
    assert!(
        report
            .issues
            .iter()
            .any(|issue| issue.path.ends_with("unsupported_color.vtex_c")
                && issue.kind == PreviewIssueKind::Unsupported)
    );
}

#[test]
fn dependency_diagnostics_remain_bounded_for_large_broken_archives() {
    let fixture = Fixture::new();
    let archive = fixture
        .archive("mod.vpk", &[("models/a.vmdl_c", vec![0])])
        .with_preview_report();
    for index in 0..600 {
        assert!(
            archive
                .extract_entry(&format!("textures/missing-{index}.vtex_c"))
                .is_err()
        );
    }
    let report = archive.preview_report();
    assert!(report.truncated);
    assert!(report.issues.len() <= 512);
}

/// Optional game-update smoke check:
/// DMM_PREVIEW_GAME_VPK=<local pak01_dir.vpk> [DMM_PREVIEW_CORE_VPK=<core pak>]
/// DMM_PREVIEW_MODEL_PATHS=<compiled model paths separated by semicolons>
/// cargo test --manifest-path packages/source2-model/Cargo.toml local_game_preview_compatibility -- --nocapture
#[test]
fn local_game_preview_compatibility() {
    let Some(path) = std::env::var_os("DMM_PREVIEW_GAME_VPK")
        .map(PathBuf::from)
        .filter(|path| path.is_file())
    else {
        eprintln!(
            "SKIP local_game_preview_compatibility: DMM_PREVIEW_GAME_VPK is absent or unavailable"
        );
        return;
    };
    let mut fallbacks = Vec::new();
    if let Some(core) = std::env::var_os("DMM_PREVIEW_CORE_VPK").map(PathBuf::from) {
        if core.is_file() {
            fallbacks.push(Arc::new(VpkArchive::open(&core).unwrap()));
        } else {
            eprintln!("SKIP optional core archive: {}", core.display());
        }
    }
    let archive = VpkArchive::open(&path)
        .unwrap()
        .with_fallbacks(fallbacks)
        .with_preview_report();
    let models = std::env::var("DMM_PREVIEW_MODEL_PATHS").unwrap_or_else(|_| {
        "models/heroes_wip/abrams/abrams.vmdl_c;models/heroes_staging/yamato_v2/yamato.vmdl_c"
            .into()
    });
    let listing = archive.list_entries();
    for path in models.split(';').filter(|path| !path.is_empty()).take(8) {
        assert!(
            archive.contains_entry(path),
            "representative model moved or disappeared: {path}"
        );
        let decoded = crate::decode_model_glb_from_archive(&archive, path).unwrap();
        assert!(decoded.vertex_count > 0 && decoded.index_count >= 3);
        assert_eq!(&decoded.glb[..4], b"glTF");
        assert_eq!(
            u32::from_le_bytes(decoded.glb[8..12].try_into().unwrap()) as usize,
            decoded.glb.len()
        );
        let resource = crate::Resource::parse(archive.extract_entry(path).unwrap()).unwrap();
        if let Some(skeleton) = crate::skeleton::parse_model_skeleton(&resource).unwrap() {
            for clip in crate::nm_anim::model_clip_paths(&archive, path, &listing)
                .iter()
                .take(2)
            {
                let animation =
                    crate::nm_anim::load_nm_animation_from_archive(&archive, clip).unwrap();
                assert!(animation.clip.duration_seconds.is_finite());
                for time in [0.0, animation.clip.duration_seconds] {
                    let sampled = animation.sample_pose(time, false).unwrap();
                    let pose = crate::nm_anim::retarget_nm_pose(&animation, &sampled, &skeleton);
                    assert_eq!(pose.len(), skeleton.bones.len());
                    assert!(pose.iter().all(|bone| {
                        bone.translation
                            .iter()
                            .chain(&bone.rotation)
                            .chain(&bone.scale)
                            .all(|value| value.is_finite())
                    }));
                }
            }
        }
        let discovery =
            crate::particles::discover_model_preview_particles(&archive, &resource, path).unwrap();
        let systems = crate::particles::load_particle_systems(&archive, &discovery.paths);
        eprintln!(
            "{path}: vertices={}, indices={}, particle roots={}, particle diagnostics={}",
            decoded.vertex_count,
            decoded.index_count,
            systems.systems.len(),
            systems.diagnostics.len()
        );
    }
    let report = archive.preview_report();
    assert!(
        !report.truncated,
        "preview dependency evidence exceeded its bound"
    );
    assert!(
        report.issues.is_empty(),
        "game-update preview regressions: {:?}",
        report.issues
    );
}
