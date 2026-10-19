use super::*;

fn array(values: &[f64]) -> Kv3Value {
  Kv3Value::Array(values.iter().copied().map(Kv3Value::Double).collect())
}

fn point(name: &str, parent: &str, offset: [f64; 3], q: [f64; 4]) -> Kv3Value {
  Kv3Value::Object(vec![
    ("key".into(), Kv3Value::String(name.into())),
    (
      "value".into(),
      Kv3Value::Object(vec![
        ("m_nInfluences".into(), Kv3Value::Int(1)),
        (
          "m_influenceNames".into(),
          Kv3Value::Array(vec![
            Kv3Value::String(parent.into()),
            Kv3Value::String(String::new()),
            Kv3Value::String(String::new()),
          ]),
        ),
        (
          "m_bInfluenceRootTransform".into(),
          Kv3Value::Array(vec![Kv3Value::Bool(false); 3]),
        ),
        ("m_influenceWeights".into(), array(&[1.0, 0.0, 0.0])),
        (
          "m_vInfluenceOffsets".into(),
          Kv3Value::Array(vec![array(&offset), array(&[0.0; 3]), array(&[0.0; 3])]),
        ),
        (
          "m_vInfluenceRotations".into(),
          Kv3Value::Array(vec![array(&q), array(&IDENTITY), array(&IDENTITY)]),
        ),
      ]),
    ),
  ])
}

fn mesh(frame: [f64; 4]) -> Kv3Value {
  Kv3Value::Object(vec![
    (
      "m_attachments".into(),
      Kv3Value::Array(vec![
        point("standing_pivot", "root_motion", [2.0, 94.0, -3.0], frame),
        point("crouching_pivot", "root_motion", [1.0, 55.0, 4.0], frame),
        point("aim", "root_motion", [5.0, 70.0, 6.0], frame),
        point("custom_fx", "head", [7.0, 8.0, 9.0], frame),
      ]),
    ),
    ("mesh_data".into(), Kv3Value::Binary(vec![1, 2, 3, 4])),
  ])
}

fn container(model: &Kv3Value, meshes: &[Kv3Value]) -> Vec<u8> {
  let mut blocks = vec![(*b"DATA", kv3::encode(model, &kv3::Format([3; 16])))];
  blocks.extend(
    meshes
      .iter()
      .map(|mesh| (*b"MDAT", kv3::encode(mesh, &kv3::Format([4; 16])))),
  );
  blocks.push((*b"VBIB", vec![1, 2, 3, 4, 5]));
  let mut bytes = vec![0; 16 + 12 * blocks.len()];
  bytes[4..6].copy_from_slice(&12u16.to_le_bytes());
  bytes[8..12].copy_from_slice(&8u32.to_le_bytes());
  bytes[12..16].copy_from_slice(&(blocks.len() as u32).to_le_bytes());
  for (i, (kind, data)) in blocks.iter().enumerate() {
    let entry = 16 + 12 * i;
    let offset = bytes.len();
    bytes[entry..entry + 4].copy_from_slice(kind);
    bytes[entry + 4..entry + 8].copy_from_slice(&((offset - entry - 4) as u32).to_le_bytes());
    bytes[entry + 8..entry + 12].copy_from_slice(&(data.len() as u32).to_le_bytes());
    bytes.extend_from_slice(data);
  }
  let len = bytes.len() as u32;
  bytes[..4].copy_from_slice(&len.to_le_bytes());
  bytes
}

fn model() -> Kv3Value {
  super::super::model_animation::tests::model(&["root_motion", "head"], &[-1, 0])
}

#[test]
fn migrates_every_mesh_and_preserves_authored_offsets_and_other_blocks() {
  let original = container(&model(), &[mesh(OLD_FRAME), mesh(OLD_FRAME)]);
  let base = container(&model(), &[mesh(IDENTITY)]);
  let repaired = repair(&original, &base).unwrap().unwrap();
  let before = Resource::parse(&original).unwrap();
  let after = Resource::parse(&repaired).unwrap();
  assert_eq!(before.blocks().len(), after.blocks().len());
  for (i, block) in before.blocks().iter().enumerate() {
    let a = before.get_block_by_index(i).unwrap();
    let b = after.get_block_by_index(i).unwrap();
    if block.kind != *b"MDAT" {
      assert_eq!(a, b);
      continue;
    }
    let mut expected = mesh(OLD_FRAME);
    migrate_mesh(&mut expected, None).unwrap();
    assert_eq!(kv3::decode(b).unwrap(), expected);
    let point = attachment(&expected, "standing_pivot").unwrap();
    assert_eq!(
      point.get("m_vInfluenceOffsets"),
      Some(&Kv3Value::Array(vec![
        array(&[-3.0, 2.0, 94.0]),
        array(&[0.0; 3]),
        array(&[0.0; 3])
      ]))
    );
    assert!(same_rotation(rotation(point).unwrap(), IDENTITY));
    assert_eq!(expected.get("mesh_data"), mesh(OLD_FRAME).get("mesh_data"));
  }
  assert!(
    repair(&repaired, &base).unwrap().is_none(),
    "migration must be idempotent"
  );
}

#[test]
fn translated_root_keeps_authored_bind_and_receives_the_local_frame_migration() {
  let mut authored = model();
  let Kv3Value::Array(poses) = authored
    .get_mut("m_modelSkeleton")
    .unwrap()
    .get_mut("m_bonePosParent")
    .unwrap()
  else {
    panic!()
  };
  poses[0] = array(&[1.27852571, 0.266090095, 0.0]);
  let base = container(&model(), &[mesh(IDENTITY)]);
  let original = container(&authored, &[mesh(OLD_FRAME)]);
  let repaired = repair(&original, &base).unwrap().unwrap();
  let before = Resource::parse(&original).unwrap();
  let after = Resource::parse(&repaired).unwrap();
  for (index, block) in before.blocks().iter().enumerate() {
    if block.kind != *b"MDAT" {
      assert_eq!(
        before.get_block_by_index(index),
        after.get_block_by_index(index)
      );
    }
  }
  let mut expected = mesh(OLD_FRAME);
  migrate_mesh(&mut expected, None).unwrap();
  assert_eq!(
    kv3::decode(after.find_block(*b"MDAT").unwrap()).unwrap(),
    expected
  );
  assert!(repair(&repaired, &base).unwrap().is_none());
}

#[test]
fn tolerates_exporter_root_rotation_drift_without_changing_the_authored_bind() {
  let mut canonical = model();
  let mut authored = model();
  let set_root = |model: &mut Kv3Value, rotation: [f64; 4]| {
    let Kv3Value::Array(values) = model
      .get_mut("m_modelSkeleton")
      .unwrap()
      .get_mut("m_boneRotParent")
      .unwrap()
    else {
      panic!()
    };
    values[0] = array(&rotation);
  };
  set_root(
    &mut canonical,
    [0.4999999404, 0.4999998808, 0.5, 0.5000001788],
  );
  let exported = [0.5001600981, 0.4999464452, 0.4999467432, 0.4999467432];
  let base = container(&canonical, &[mesh(IDENTITY)]);
  for rotation in [exported, exported.map(|value| -value)] {
    set_root(&mut authored, rotation);
    let original = container(&authored, &[mesh(OLD_FRAME), mesh(OLD_FRAME)]);
    let repaired = repair(&original, &base)
      .unwrap()
      .expect("export rounding blocked camera repair");
    let before = Resource::parse(&original).unwrap();
    let after = Resource::parse(&repaired).unwrap();
    for (index, block) in before.blocks().iter().enumerate() {
      if block.kind != *b"MDAT" {
        assert_eq!(
          before.get_block_by_index(index),
          after.get_block_by_index(index)
        );
      } else {
        let mut expected = mesh(OLD_FRAME);
        migrate_mesh(&mut expected, None).unwrap();
        assert_eq!(
          kv3::decode(after.get_block_by_index(index).unwrap()).unwrap(),
          expected
        );
      }
    }
    assert!(repair(&repaired, &base).unwrap().is_none());
  }
}

#[test]
fn rejects_root_rotation_outside_camera_tolerance_and_invalid_quaternions() {
  let base = container(&model(), &[mesh(IDENTITY)]);
  for rotation in [
    [0.001_f64.sin(), 0.0, 0.0, 0.001_f64.cos()],
    [0.0, 0.0, 0.0, 0.0],
    [0.0, 0.0, 0.0, 2.0],
  ] {
    let mut authored = model();
    let Kv3Value::Array(values) = authored
      .get_mut("m_modelSkeleton")
      .unwrap()
      .get_mut("m_boneRotParent")
      .unwrap()
    else {
      panic!()
    };
    values[0] = array(&rotation);
    assert!(repair(&container(&authored, &[mesh(OLD_FRAME)]), &base).is_err());
  }
}

#[test]
fn declines_changed_root_axes_scale_hierarchy_and_mixed_pivots() {
  let base = container(&model(), &[mesh(IDENTITY)]);
  for (field, replacement) in [
    ("m_boneRotParent", array(&[0.0, 0.0, 1.0, 0.0])),
    ("m_boneScaleParent", Kv3Value::Double(2.0)),
    ("m_nParent", Kv3Value::Int(1)),
  ] {
    let mut authored = model();
    let Kv3Value::Array(values) = authored
      .get_mut("m_modelSkeleton")
      .unwrap()
      .get_mut(field)
      .unwrap()
    else {
      panic!()
    };
    values[0] = replacement;
    assert!(
      repair(&container(&authored, &[mesh(OLD_FRAME)]), &base).is_err(),
      "{field}"
    );
  }
  let mut mixed = mesh(OLD_FRAME);
  let Kv3Value::Array(points) = mixed.get_mut("m_attachments").unwrap() else {
    panic!()
  };
  points[1] = point("crouching_pivot", "root_motion", [0.0; 3], IDENTITY);
  assert!(repair(&container(&model(), &[mixed]), &base).is_err());
}

#[test]
fn preserves_current_and_deliberately_rotated_camera_models() {
  let base = container(&model(), &[mesh(IDENTITY)]);
  assert!(repair(&base, &base).unwrap().is_none());
  let custom = container(
    &model(),
    &[mesh([
      0.0,
      0.0,
      std::f64::consts::FRAC_1_SQRT_2,
      std::f64::consts::FRAC_1_SQRT_2,
    ])],
  );
  assert!(repair(&custom, &base).unwrap().is_none());
  let negative = OLD_FRAME.map(|v| -v);
  assert!(
    repair(&container(&model(), &[mesh(negative)]), &base)
      .unwrap()
      .is_some()
  );
}

#[test]
fn selected_overlay_repairs_camera_without_modifying_the_source_archive() {
  use super::super::{LocalizationModInput, LocalizationOverlayPlan, resources};
  use source2_model::vpk_extract::VpkArchive;
  let temp = tempfile::tempdir().unwrap();
  let citadel = temp.path().join("citadel");
  let path = "models/heroes/test/test.vmdl_c";
  let original = container(&model(), &[mesh(OLD_FRAME), mesh(OLD_FRAME)]);
  let current = container(&model(), &[mesh(IDENTITY)]);
  resources::tests::pack(&citadel, "pak01", &[(path, &current)]);
  let archive = resources::tests::pack(temp.path(), "skin", &[(path, &original)]);
  let saved = std::fs::read(&archive).unwrap();
  let mods = [LocalizationModInput {
    mod_id: "skin".into(),
    vpks: vec![archive.clone()],
  }];
  let selected = BTreeSet::from(["skin".into()]);
  let plan = LocalizationOverlayPlan::build_selected(&citadel, &mods, &selected).unwrap();
  assert!(
    plan
      .analysis
      .asset_repairs
      .iter()
      .any(|repair| matches!(repair.kind, RepairKind::CameraAttachmentFrame))
  );
  let output = temp.path().join("fixed_dir.vpk");
  assert!(plan.write(&output, &[]).unwrap().has_overlay);
  let repaired = VpkArchive::open(&output)
    .unwrap()
    .extract_entry(path)
    .unwrap();
  assert!(repair(&repaired, &current).unwrap().is_none());
  assert_eq!(std::fs::read(&archive).unwrap(), saved);
  let opted_out =
    LocalizationOverlayPlan::build_selected(&citadel, &mods, &BTreeSet::new()).unwrap();
  assert!(
    !opted_out
      .analysis
      .asset_repairs
      .iter()
      .any(|repair| matches!(repair.kind, RepairKind::CameraAttachmentFrame))
  );
}

#[test]
fn overlapping_skins_repair_only_the_effective_selected_model() {
  use super::super::{LocalizationModInput, LocalizationOverlayPlan, resources};
  let temp = tempfile::tempdir().unwrap();
  let citadel = temp.path().join("citadel");
  let path = "models/heroes/test/test.vmdl_c";
  let current = container(&model(), &[mesh(IDENTITY)]);
  resources::tests::pack(&citadel, "pak01", &[(path, &current)]);
  let mut inputs = Vec::new();
  let mut originals = Vec::new();
  for (index, id) in ["skin-a", "skin-b", "skin-c"].into_iter().enumerate() {
    let mut authored = mesh(OLD_FRAME);
    *authored.get_mut("mesh_data").unwrap() = Kv3Value::Binary(vec![index as u8; 8]);
    let bytes = container(&model(), &[authored]);
    let archive = resources::tests::pack(temp.path(), id, &[(path, &bytes)]);
    originals.push((archive.clone(), std::fs::read(&archive).unwrap(), bytes));
    inputs.push(LocalizationModInput {
      mod_id: id.into(),
      vpks: vec![archive],
    });
  }
  let mut failures = Vec::new();
  for count in [2, 3] {
    for shared_mod_id in [false, true] {
      for reversed in [false, true] {
        let mut ordered = if shared_mod_id {
          vec![LocalizationModInput {
            mod_id: "multiple-variations".into(),
            vpks: inputs[..count]
              .iter()
              .flat_map(|input| input.vpks.clone())
              .collect(),
          }]
        } else {
          inputs[..count].to_vec()
        };
        if reversed {
          ordered.reverse();
          if shared_mod_id {
            ordered[0].vpks.reverse();
          }
        }
        let winner = &ordered[0];
        for selected in [
          BTreeSet::new(),
          BTreeSet::from([winner.mod_id.clone()]),
          ordered
            .get(1)
            .map(|input| BTreeSet::from([input.mod_id.clone()]))
            .unwrap_or_default(),
          ordered.iter().map(|input| input.mod_id.clone()).collect(),
        ] {
          let plan =
            LocalizationOverlayPlan::build_selected(&citadel, &ordered, &selected).unwrap();
          let should_repair = selected.contains(&winner.mod_id);
          if plan.camera_models.contains_key(path) != should_repair {
            failures.push(format!(
              "count={count}, reversed={reversed}, selected={selected:?}"
            ));
            continue;
          }
          if should_repair {
            assert!(
              plan
                .analysis
                .asset_warnings
                .iter()
                .any(|warning| warning.file_path == path
                  && warning.mod_id == winner.mod_id
                  && matches!(warning.kind, WarningKind::OverlappingModel))
            );
            let original = &originals
              .iter()
              .find(|(archive, _, _)| archive == &winner.vpks[0])
              .unwrap()
              .2;
            let expected = repair(original, &current).unwrap().unwrap();
            assert_eq!(
              plan.camera_models[path], expected,
              "losing skin replaced the winning model"
            );
            assert!(
              plan
                .analysis
                .asset_repairs
                .iter()
                .all(|repair| repair.mod_id == winner.mod_id)
            );
            let output = temp.path().join("overlap_dir.vpk");
            assert!(plan.write(&output, &[]).unwrap().has_overlay);
            let packed = source2_model::vpk_extract::VpkArchive::open(&output).unwrap();
            assert_eq!(packed.extract_entry(path).unwrap(), expected);
          } else {
            assert!(plan.analysis.asset_repairs.is_empty());
          }
        }
      }
    }
  }
  assert!(failures.is_empty(), "camera repair skipped: {failures:?}");
  for (archive, bytes, _) in originals {
    assert_eq!(std::fs::read(archive).unwrap(), bytes);
  }
}

#[test]
#[ignore = "requires DMM_REAL_CITADEL; uses a reframed reference when local game is pre-update"]
fn real_model_preserves_geometry_and_inactive_influences() {
  use source2_model::vpk_extract::VpkArchive;
  let citadel = std::path::PathBuf::from(std::env::var("DMM_REAL_CITADEL").unwrap());
  let pak = VpkArchive::open(&citadel.join("pak01_dir.vpk")).unwrap();
  let path = "models/heroes_wip/werewolf/werewolf.vmdl_c";
  let bytes = pak.extract_entry(path).unwrap();
  let res = Resource::parse(&bytes).unwrap();
  let indices: Vec<_> = res
    .blocks()
    .iter()
    .enumerate()
    .filter(|(_, block)| block.kind == *b"MDAT")
    .map(|(i, _)| i)
    .collect();
  let mut old = bytes.clone();
  let mut current = bytes.clone();
  let mut count = 0;
  for index in indices {
    let raw = res.get_block_by_index(index).unwrap();
    let (mut mesh, mut encoding) = kv3::decode_preserving(raw).unwrap();
    if pivots(&mesh, OLD_FRAME) {
      migrate_mesh(&mut mesh, None).unwrap();
      kv3::normalize_numeric_array_encoding(&mesh, &mut encoding).unwrap();
      let format = kv3::Format::from_payload(raw).unwrap();
      let payload = kv3::encode_preserving(&mesh, &encoding, &format).unwrap();
      current = Resource::parse(&current)
        .unwrap()
        .rebuild_with_block(index, &payload)
        .unwrap();
    } else if pivots(&mesh, IDENTITY) {
      let Kv3Value::Array(points) = mesh.get_mut("m_attachments").unwrap() else {
        panic!()
      };
      for item in points {
        let value = item.get_mut("value").unwrap();
        if !single_root(value) {
          continue;
        }
        let q = rotation(value).unwrap();
        let Kv3Value::Array(offsets) = value.get_mut("m_vInfluenceOffsets").unwrap() else {
          panic!()
        };
        let [x, y, z] = vector::<3>(&offsets[0]).unwrap();
        offsets[0] = array(&[y, z, x]);
        let [x, y, z, w] = q;
        let Kv3Value::Array(rotations) = value.get_mut("m_vInfluenceRotations").unwrap() else {
          panic!()
        };
        rotations[0] = array(&[
          (x - w - z + y) * 0.5,
          (y - w - x + z) * 0.5,
          (z - w - y + x) * 0.5,
          (w + x + y + z) * 0.5,
        ]);
      }
      kv3::normalize_numeric_array_encoding(&mesh, &mut encoding).unwrap();
      let format = kv3::Format::from_payload(raw).unwrap();
      let payload = kv3::encode_preserving(&mesh, &encoding, &format).unwrap();
      old = Resource::parse(&old)
        .unwrap()
        .rebuild_with_block(index, &payload)
        .unwrap();
    } else {
      continue;
    }
    count += 1;
  }
  assert!(count > 0, "fixture must contain supported camera pivots");
  let repaired = repair(&old, &current).unwrap().unwrap();
  let before = Resource::parse(&old).unwrap();
  let after = Resource::parse(&repaired).unwrap();
  let independent = source2_model::resource::Resource::parse(repaired.clone()).unwrap();
  for (index, block) in before.blocks().iter().enumerate() {
    let original = before.get_block_by_index(index).unwrap();
    let updated = after.get_block_by_index(index).unwrap();
    if block.kind != *b"MDAT" {
      assert_eq!(original, updated);
      continue;
    }
    let (mut expected, mut expected_encoding) = kv3::decode_preserving(original).unwrap();
    if pivots(&expected, OLD_FRAME) {
      migrate_mesh(&mut expected, None).unwrap();
      kv3::normalize_numeric_array_encoding(&expected, &mut expected_encoding).unwrap();
      round_float_values(&mut expected, &expected_encoding);
    }
    let decoded = kv3::decode(updated).unwrap();
    assert!(super::super::runtime_values_equal(&expected, &decoded));
    let raw = &independent.blocks[index];
    let other =
      source2_model::kv3::parse(&independent.data[raw.offset..raw.offset + raw.size]).unwrap();
    assert!(super::super::tests::independent_values_equal(
      &decoded, &other
    ));
  }
  assert!(repair(&repaired, &current).unwrap().is_none());
  assert_eq!(pak.extract_entry(path).unwrap(), bytes);
  eprintln!(
    "Validated {count} real mesh blocks; local game was {}",
    if old == bytes {
      "pre-update (derived current reference)"
    } else {
      "post-update"
    }
  );
}

fn with_camera_text(mut model: Kv3Value, text: &str) -> Kv3Value {
  let Kv3Value::Object(fields) = &mut model else {
    panic!()
  };
  fields.push((
    "m_modelInfo".into(),
    Kv3Value::Object(vec![(
      "m_keyValueText".into(),
      Kv3Value::String(text.into()),
    )]),
  ));
  model
}

fn points_mut(mesh: &mut Kv3Value) -> &mut Vec<Kv3Value> {
  let Kv3Value::Array(points) = mesh.get_mut("m_attachments").unwrap() else {
    panic!()
  };
  points
}

fn turned(q: [f64; 4], radians: f64) -> [f64; 4] {
  let [x, y, z, w] = q;
  let (s, c) = (radians / 2.0).sin_cos();
  [x * c + y * s, y * c - x * s, z * c + w * s, w * c - z * s]
}

const PITCH: [f64; 4] = [
  0.0,
  std::f64::consts::FRAC_1_SQRT_2,
  0.0,
  std::f64::consts::FRAC_1_SQRT_2,
];
const OLD_PITCH: [f64; 4] = [
  0.0,
  0.0,
  -std::f64::consts::FRAC_1_SQRT_2,
  std::f64::consts::FRAC_1_SQRT_2,
];

#[test]
fn tweaked_or_partial_old_pivots_migrate_with_their_authored_transforms() {
  let base = container(&model(), &[mesh(IDENTITY)]);
  let mut partial = mesh(OLD_FRAME);
  points_mut(&mut partial).remove(1);
  for authored in [mesh(turned(OLD_FRAME, 10_f64.to_radians())), partial] {
    let original = container(&model(), &[authored.clone()]);
    let repaired = repair(&original, &base).unwrap().unwrap();
    let mut expected = authored;
    migrate_mesh(&mut expected, None).unwrap();
    let after = Resource::parse(&repaired).unwrap();
    assert_eq!(
      kv3::decode(after.find_block(*b"MDAT").unwrap()).unwrap(),
      expected
    );
    assert!(repair(&repaired, &base).unwrap().is_none());
  }
}

#[test]
fn partially_migrated_meshes_convert_only_their_stale_root_attachments() {
  let base = container(&model(), &[mesh(IDENTITY)]);
  let mut authored = mesh(IDENTITY);
  let points = points_mut(&mut authored);
  points[2] = point("aim", "root_motion", [5.0, 70.0, 6.0], OLD_FRAME);
  points.push(point(
    "near_01",
    "root_motion",
    [-19.0, 124.0, -1.0],
    OLD_PITCH,
  ));
  points.push(point("far_01", "root_motion", [-43.0, 192.0, 27.0], OLD_PITCH));
  points.push(point(
    "near_02",
    "root_motion",
    [-5.0, -19.0, 108.0],
    [0.0, -PITCH[1], 0.0, PITCH[3]],
  ));
  let listed = with_camera_text(
    model(),
    r#"{ AttachmentCameraData = [ { attachment_name = "near_01" } { attachment_name = "near_02" } ] }"#,
  );
  let original = container(&listed, &[authored.clone(), authored.clone()]);
  let repaired = repair(&original, &base).unwrap().unwrap();
  let mut expected = authored;
  migrate_mesh(
    &mut expected,
    Some(&BTreeSet::from(["aim".into(), "near_01".into()])),
  )
  .unwrap();
  let after = Resource::parse(&repaired).unwrap();
  for (index, block) in after.blocks().iter().enumerate() {
    if block.kind == *b"MDAT" {
      let mesh = kv3::decode(after.get_block_by_index(index).unwrap()).unwrap();
      assert_eq!(mesh, expected);
      assert!(same_rotation(
        rotation(attachment(&mesh, "near_01").unwrap()).unwrap(),
        PITCH
      ));
    }
  }
  assert!(repair(&repaired, &base).unwrap().is_none());
}

/// Packs a game model with a complete camera interface and an old skin, then
/// plans the skin's repairs.
fn camera_interface_plan(
  temp: &std::path::Path,
  skin_text: &str,
  skin_meshes: &[Kv3Value],
) -> (super::super::LocalizationOverlayPlan, Kv3Value) {
  use super::super::{LocalizationModInput, LocalizationOverlayPlan, resources};
  let citadel = temp.join("citadel");
  let path = "models/heroes/test/test.vmdl_c";
  let mut game_mesh = mesh(IDENTITY);
  let near = point("near_00", "root_motion", [-14.0, -19.0, 113.0], IDENTITY);
  points_mut(&mut game_mesh).push(near.clone());
  let game_model = with_camera_text(
    model(),
    r#"{ CitadelCameraSettings_t = { m_flCameraHeightStanding = 80.0 } AttachmentCameraData = [ { attachment_name = "near_00" } ] }"#,
  );
  let current = container(&game_model, &[game_mesh]);
  resources::tests::pack(&citadel, "pak01", &[(path, &current)]);
  let original = container(&with_camera_text(model(), skin_text), skin_meshes);
  let archive = resources::tests::pack(temp, "skin", &[(path, &original)]);
  let mods = [LocalizationModInput {
    mod_id: "skin".into(),
    vpks: vec![archive],
  }];
  let plan =
    LocalizationOverlayPlan::build_selected(&citadel, &mods, &BTreeSet::from(["skin".into()]))
      .unwrap();
  (plan, near.get("value").unwrap().clone())
}

#[test]
fn restored_camera_points_stay_in_the_current_frame_on_every_mesh() {
  let temp = tempfile::tempdir().unwrap();
  let cases = [
    // Old pivots and no camera list: the frame migration runs before points are added.
    (
      "{ CitadelCameraSettings_t = { m_flCameraHeightStanding = 70.0 } }",
      mesh(OLD_FRAME),
    ),
    // A camera list naming a point the meshes lack.
    (
      r#"{ CitadelCameraSettings_t = { m_flCameraHeightStanding = 70.0 } AttachmentCameraData = [ { attachment_name = "near_00" } ] }"#,
      mesh(IDENTITY),
    ),
  ];
  for (index, (text, skin_mesh)) in cases.into_iter().enumerate() {
    let root = temp.path().join(index.to_string());
    let (plan, near) = camera_interface_plan(&root, text, &[skin_mesh.clone(), skin_mesh]);
    let repaired = &plan.camera_models["models/heroes/test/test.vmdl_c"];
    let resource = Resource::parse(repaired).unwrap();
    let mut meshes = 0;
    for (block_index, block) in resource.blocks().iter().enumerate() {
      if block.kind != *b"MDAT" {
        continue;
      }
      meshes += 1;
      let mesh = kv3::decode(resource.get_block_by_index(block_index).unwrap()).unwrap();
      assert!(pivots(&mesh, IDENTITY), "case {index}");
      assert!(
        super::super::runtime_values_equal(attachment(&mesh, "near_00").unwrap(), &near),
        "case {index}: restored point was converted again"
      );
    }
    assert_eq!(meshes, 2);
    assert!(
      plan
        .analysis
        .asset_warnings
        .iter()
        .all(|warning| !matches!(warning.kind, WarningKind::MissingCameraAttachments)),
      "case {index}"
    );
  }
}
