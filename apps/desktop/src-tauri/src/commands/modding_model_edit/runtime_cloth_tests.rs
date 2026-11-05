use super::*;

fn object(fields: Vec<(&str, Value)>) -> Value {
  Value::Object(
    fields
      .into_iter()
      .map(|(key, value)| (key.into(), value))
      .collect(),
  )
}
fn floats(values: &[f64]) -> Value {
  Value::Array(values.iter().map(|value| Value::Double(*value)).collect())
}
fn fixture(cloth: bool, shift: f64) -> Vec<u8> {
  let names = if cloth {
    ["pelvis", "$cloth_point"]
  } else {
    ["pelvis", "_cloth_point"]
  };
  let skeleton = object(vec![
    (
      "m_boneName",
      Value::Array(names.map(|name| Value::String(name.into())).to_vec()),
    ),
    ("m_nParent", Value::Array(vec![Value::Int(-1); 2])),
    (
      "m_bonePosParent",
      Value::Array(vec![floats(&[0., 0., 0.]), floats(&[1. + shift, 0., 1.])]),
    ),
    (
      "m_boneRotParent",
      Value::Array(vec![floats(&[0., 0., 0., 1.]); 2]),
    ),
    (
      "m_boneScaleParent",
      Value::Array(vec![Value::Double(1.); 2]),
    ),
    (
      "m_nFlag",
      Value::Array(if cloth {
        vec![Value::UInt(0x1cc8), Value::UInt(0x401c88)]
      } else {
        vec![Value::UInt(0x1cc0); 2]
      }),
    ),
  ]);
  let fe = if cloth {
    object(vec![
      ("m_nNodeCount", Value::UInt(2)),
      ("m_nStaticNodes", Value::UInt(1)),
      (
        "m_CtrlName",
        Value::Array(names.map(|name| Value::String(name.into())).to_vec()),
      ),
      (
        "m_SkelParents",
        Value::Array(vec![Value::Int(-1), Value::Int(0)]),
      ),
      ("m_NodeInvMasses", floats(&[0., 1.])),
      (
        "m_InitPose",
        Value::Array(vec![
          floats(&[0., 0., 0., 1., 0., 0., 0., 1.]),
          floats(&[1., 0., 1., 1., 0., 0., 0., 1.]),
        ]),
      ),
    ])
  } else {
    Value::Null
  };
  let physics = object(vec![
    ("m_pFeModel", fe),
    (
      "m_parts",
      Value::Array(vec![Value::UInt(if cloth { 5 } else { 9 })]),
    ),
  ]);
  let data = object(vec![("m_modelSkeleton", skeleton)]);
  let payloads = [
    (*b"DATA", kv3::encode(&data, &Format([3; 16]))),
    (*b"PHYS", kv3::encode(&physics, &Format([3; 16]))),
    (
      *b"MDAT",
      kv3::encode(
        &object(vec![(
          "m_sceneObjects",
          Value::Array(vec![object(vec![(
            "m_drawCalls",
            Value::Array(
              ["materials/body.vmat", "materials/head.vmat"]
                .map(|name| {
                  object(vec![
                    ("m_material", Value::String(name.into())),
                    ("m_nIndexCount", Value::Int(30)),
                  ])
                })
                .to_vec(),
            ),
          )])]),
        )]),
        &Format([3; 16]),
      ),
    ),
    (*b"ANIM", vec![6, 5, 4]),
    (*b"CTRL", vec![3, 2, 1]),
  ];
  let mut bytes = vec![0; 16 + 12 * payloads.len()];
  bytes[4..6].copy_from_slice(&12u16.to_le_bytes());
  bytes[8..12].copy_from_slice(&8u32.to_le_bytes());
  bytes[12..16].copy_from_slice(&(payloads.len() as u32).to_le_bytes());
  for (index, (kind, payload)) in payloads.into_iter().enumerate() {
    let at = 16 + 12 * index;
    bytes[at..at + 4].copy_from_slice(&kind);
    let offset = (bytes.len() - at - 4) as u32;
    bytes[at + 4..at + 8].copy_from_slice(&offset.to_le_bytes());
    bytes[at + 8..at + 12].copy_from_slice(&(payload.len() as u32).to_le_bytes());
    bytes.extend(payload);
  }
  let size = bytes.len() as u32;
  bytes[..4].copy_from_slice(&size.to_le_bytes());
  bytes
}

fn verify(target: &[u8], original: &[u8], output: &[u8]) {
  let before = Resource::parse(target).unwrap();
  let after = Resource::parse(output).unwrap();
  assert_eq!(before.blocks().len(), after.blocks().len());
  for (index, block) in before.blocks().iter().enumerate() {
    assert_eq!(block.kind, after.blocks()[index].kind);
    if ![*b"PHYS", *b"DATA"].contains(&block.kind) {
      assert_eq!(
        before.get_block_by_index(index),
        after.get_block_by_index(index)
      );
    }
  }
  let (source_phys, _, _) = decode(original, *b"PHYS").unwrap().unwrap();
  let (target_phys, _, _) = decode(target, *b"PHYS").unwrap().unwrap();
  let (output_phys, _, _) = decode(output, *b"PHYS").unwrap().unwrap();
  assert_eq!(output_phys.get("m_pFeModel"), source_phys.get("m_pFeModel"));
  for (key, value) in target_phys.as_object().unwrap() {
    if key != "m_pFeModel" {
      assert_eq!(output_phys.get(key), Some(value));
    }
  }
  let resource = ReadResource::parse(output.to_vec()).unwrap();
  assert!(
    source2_model::fe_model::parse_model_cloth(&resource)
      .unwrap()
      .is_some()
  );
  let source_rig = skeleton::parse_model_skeleton(&ReadResource::parse(original.to_vec()).unwrap())
    .unwrap()
    .unwrap();
  let rig = skeleton::parse_model_skeleton(&resource).unwrap().unwrap();
  for bone in source_rig
    .bones
    .iter()
    .filter(|bone| bone.flags & CLOTH != 0)
  {
    let restored = rig
      .bones
      .iter()
      .find(|restored| restored.name == bone.name)
      .unwrap();
    assert_eq!(
      restored.flags & (CLOTH | PROCEDURAL | ANIMATION),
      bone.flags & (CLOTH | PROCEDURAL | ANIMATION)
    );
  }
}

#[test]
fn restores_runtime_cloth_and_flags_without_replacing_mesh_animation_or_collision_data() {
  let original = fixture(true, 0.);
  let target = fixture(false, 0.);
  let output = restore(&target, &original).unwrap().unwrap();
  verify(&target, &original, &output);
  assert!(restore(&output, &original).unwrap().is_none());
  assert!(restore(&original, &original).unwrap().is_none());
}

#[test]
fn refuses_changed_bind_poses_and_leaves_models_without_original_cloth_alone() {
  let original = fixture(true, 0.);
  assert!(restore(&fixture(false, 1.), &original).is_err());
  let plain = fixture(false, 0.);
  assert!(restore(&plain, &plain).unwrap().is_none());
}

#[test]
fn runtime_restoration_preserves_saved_visibility_finish_and_incremental_timestamps() {
  let (_directory, mut addon) = super::super::tests::setup();
  let base = tempfile::tempdir().unwrap();
  std::fs::create_dir(base.path().join("models")).unwrap();
  std::fs::write(base.path().join("models/test.vmdl_c"), fixture(true, 0.)).unwrap();
  let packed = tempfile::NamedTempFile::new().unwrap();
  vpkmanager::pack::pack_directory_to_writer(base.path(), &mut packed.as_file(), |_| true).unwrap();
  addon.archive_path = packed.path().to_str().unwrap().into();
  let model = Path::new(&addon.game_path).join("models/test.vmdl_c");
  let raw = fixture(false, 0.);
  std::fs::write(&model, &raw).unwrap();
  let mut saved = storage::load(&addon).unwrap();
  let mut body = super::super::default_edit("materials/body.vmat".into());
  body.roughness = Some(0.2);
  let mut head = super::super::default_edit("materials/head.vmat".into());
  head.hidden = true;
  saved
    .models
    .insert("models/test.vmdl_c".into(), vec![body, head]);
  super::super::bake::apply(&addon, saved, false, None).unwrap();
  super::super::reapply_after_compile(&addon).unwrap();
  let restored = std::fs::read(&model).unwrap();
  let current = decode(&restored, *b"MDAT").unwrap().unwrap().0;
  let scene = &current.get("m_sceneObjects").unwrap().as_array().unwrap()[0];
  assert_eq!(
    scene.get("m_drawCalls").unwrap().as_array().unwrap()[1]
      .get("m_nIndexCount")
      .unwrap()
      .as_int(),
    Some(0)
  );
  assert!(
    source2_model::fe_model::parse_model_cloth(&ReadResource::parse(restored).unwrap())
      .unwrap()
      .is_some()
  );
  let saved = storage::load(&addon).unwrap();
  storage::verify(&addon, &saved).unwrap();
  assert_eq!(saved.models["models/test.vmdl_c"][0].roughness, Some(0.2));
  let original = storage::original_path(&addon, "models/test.vmdl_c").unwrap();
  assert!(
    source2_model::fe_model::parse_model_cloth(
      &ReadResource::parse(std::fs::read(original).unwrap()).unwrap()
    )
    .unwrap()
    .is_some()
  );
  assert_eq!(
    std::fs::read(
      Path::new(&addon.content_path)
        .join(".dmm-model-editor/runtime-cloth-originals/models/test.vmdl_c")
    )
    .unwrap(),
    raw
  );
  let time = std::time::UNIX_EPOCH + std::time::Duration::from_secs(1_000_000);
  for path in saved.resources.keys() {
    std::fs::File::options()
      .write(true)
      .open(Path::new(&addon.game_path).join(path))
      .unwrap()
      .set_modified(time)
      .unwrap();
  }
  super::super::reapply_after_compile(&addon).unwrap();
  for path in saved.resources.keys() {
    assert_eq!(
      std::fs::metadata(Path::new(&addon.game_path).join(path))
        .unwrap()
        .modified()
        .unwrap(),
      time
    );
  }
  std::fs::write(&model, &raw).unwrap();
  super::super::reapply_after_compile(&addon).unwrap();
  storage::verify(&addon, &storage::load(&addon).unwrap()).unwrap();
}

#[test]
#[ignore = "requires DMM_CLOTH_BASE_VPK, DMM_CLOTH_TARGET_VPK and DMM_CLOTH_MODEL"]
fn restores_cloth_in_a_real_packed_recompiled_hero() {
  let open = |variable| {
    source2_model::vpk_extract::VpkArchive::open(Path::new(&std::env::var(variable).unwrap()))
      .unwrap()
  };
  let base = open("DMM_CLOTH_BASE_VPK");
  let target = open("DMM_CLOTH_TARGET_VPK");
  let path = std::env::var("DMM_CLOTH_MODEL").unwrap();
  let original = base.extract_entry(&path).unwrap();
  let target = target.extract_entry(&path).unwrap();
  let output = restore(&target, &original)
    .unwrap()
    .expect("The packed hero must lack FE cloth");
  verify(&target, &original, &output);
  assert!(restore(&output, &original).unwrap().is_none());
  if let Some(path) = std::env::var_os("DMM_CLOTH_OUTPUT") {
    std::fs::write(path, output).unwrap();
  }
}
