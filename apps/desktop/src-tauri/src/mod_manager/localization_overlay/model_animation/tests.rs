use super::*;

pub(super) fn strings(names: &[&str]) -> Kv3Value {
  Kv3Value::Array(
    names
      .iter()
      .map(|name| Kv3Value::String((*name).into()))
      .collect(),
  )
}

pub(in super::super) fn model(names: &[&str], parents: &[i64]) -> Kv3Value {
  Kv3Value::Object(vec![(
    "m_modelSkeleton".into(),
    Kv3Value::Object(vec![
      ("m_boneName".into(), strings(names)),
      (
        "m_nParent".into(),
        Kv3Value::Array(
          parents
            .iter()
            .map(|parent| Kv3Value::Int(*parent))
            .collect(),
        ),
      ),
      (
        "m_bonePosParent".into(),
        Kv3Value::Array(vec![
          Kv3Value::Array(vec![Kv3Value::Double(0.0); 3]);
          names.len()
        ]),
      ),
      (
        "m_boneRotParent".into(),
        Kv3Value::Array(vec![
          Kv3Value::Array(vec![
            Kv3Value::Double(0.0),
            Kv3Value::Double(0.0),
            Kv3Value::Double(0.0),
            Kv3Value::Double(1.0)
          ]);
          names.len()
        ]),
      ),
      (
        "m_boneScaleParent".into(),
        Kv3Value::Array(vec![Kv3Value::Double(1.0); names.len()]),
      ),
    ]),
  )])
}

fn samples() -> Kv3Value {
  let pose = Kv3Value::Array(vec![Kv3Value::Double(0.0); 8]);
  Kv3Value::Object(vec![
    ("m_boneIDs".into(), strings(&["head"])),
    (
      "m_parentIndices".into(),
      Kv3Value::Array(vec![Kv3Value::Int(-1)]),
    ),
    (
      "m_parentSpaceReferencePose".into(),
      Kv3Value::Array(vec![pose.clone()]),
    ),
    (
      "m_modelSpaceReferencePose".into(),
      Kv3Value::Array(vec![pose]),
    ),
  ])
}

#[test]
fn sampled_rig_allows_extra_authored_bones_and_reordered_indices() {
  let old = model(&["custom", "head", "root"], &[1, 2, -1]);
  let current = model(&["root", "head"], &[-1, 0]);
  assert!(prove_sampled_rig(&old, &current, &samples()).is_ok());
}

#[test]
fn sampled_rig_checks_unsampled_ancestors_and_rejects_missing_or_ambiguous_names() {
  let current = model(&["root", "head"], &[-1, 0]);
  for old in [
    model(&["root"], &[-1]),
    model(&["root", "head", "HEAD"], &[-1, 0, 0]),
    model(&["root", "head"], &[-1, -1]),
  ] {
    assert!(prove_sampled_rig(&old, &current, &samples()).is_err());
  }
  let mut old = current.clone();
  *old
    .get_mut("m_modelSkeleton")
    .unwrap()
    .get_mut("m_boneScaleParent")
    .unwrap() = Kv3Value::Array(vec![Kv3Value::Double(1.2), Kv3Value::Double(1.0)]);
  assert_eq!(
    prove_sampled_rig(&old, &current, &samples()).unwrap_err(),
    "Changed sampled bone reference pose: root"
  );
}

fn bindings(model: &mut Kv3Value) {
  let Kv3Value::Object(fields) = model else {
    panic!("model object");
  };
  fields.push((
    FIELDS[0].into(),
    Kv3Value::Array(vec![Kv3Value::Object(vec![
      ("m_sIdentifier".into(), Kv3Value::String("".into())),
      (
        "m_hGraph".into(),
        Kv3Value::String("animgraphs/hero.vnmgraph+cat.vnmgraph".into()),
      ),
    ])]),
  ));
  fields.push((FIELDS[1].into(), strings(&["models/cat.vnmskel"])));
}

fn resource(value: &Kv3Value) -> Vec<u8> {
  let blocks = [
    (*b"DATA", kv3::encode(value, &kv3::Format([0; 16]))),
    (*b"RERL", vec![8, 0, 0, 0, 0, 0, 0, 0]),
    (*b"ANIM", vec![1, 2, 3]),
    (*b"MDAT", vec![4, 5, 6]),
  ];
  let mut bytes = vec![0; 16 + blocks.len() * 12];
  bytes[4..6].copy_from_slice(&12u16.to_le_bytes());
  bytes[8..12].copy_from_slice(&8u32.to_le_bytes());
  bytes[12..16].copy_from_slice(&(blocks.len() as u32).to_le_bytes());
  for (index, (kind, data)) in blocks.into_iter().enumerate() {
    let table = 16 + index * 12;
    bytes[table..table + 4].copy_from_slice(&kind);
    let relative = (bytes.len() - (table + 4)) as u32;
    bytes[table + 4..table + 8].copy_from_slice(&relative.to_le_bytes());
    bytes[table + 8..table + 12].copy_from_slice(&(data.len() as u32).to_le_bytes());
    bytes.extend(data);
  }
  let length = bytes.len() as u32;
  bytes[..4].copy_from_slice(&length.to_le_bytes());
  bytes
}

#[test]
fn restore_preserves_authored_rig_legacy_animations_and_mesh_blocks_with_valid_ids() {
  let old = model(&["custom", "head", "root"], &[1, 2, -1]);
  let mut current = model(&["root", "head"], &[-1, 0]);
  bindings(&mut current);
  let source = resource(&old);
  let rebuilt = restore_bindings(&source, &resource(&current)).unwrap();
  let (_, value, _) = decode_compiled_data(&rebuilt, "test").unwrap();
  assert_eq!(value.get("m_modelSkeleton"), old.get("m_modelSkeleton"));
  for field in FIELDS {
    assert_eq!(value.get(field), current.get(field));
  }
  for (id, name) in material_repair::references(&rebuilt).unwrap() {
    assert_eq!(id, resource_id(&name).unwrap());
  }
  let before = Resource::parse(&source).unwrap();
  let after = Resource::parse(&rebuilt).unwrap();
  for kind in [*b"ANIM", *b"MDAT"] {
    assert_eq!(before.find_block(kind), after.find_block(kind));
  }
  assert!(restore_bindings(&rebuilt, &resource(&current)).is_none());
}

#[test]
fn existing_partial_or_authored_bindings_are_not_overwritten() {
  let mut current = model(&["root", "head"], &[-1, 0]);
  bindings(&mut current);
  let mut old = model(&["root", "head"], &[-1, 0]);
  assert!(eligible(&old, &current));
  let Kv3Value::Object(fields) = &mut old else {
    panic!("model object");
  };
  fields.push((FIELDS[1].into(), strings(&["models/authored.vnmskel"])));
  assert!(!eligible(&old, &current));
}

#[test]
fn canonical_unused_nm_leaf_is_not_a_missing_render_bone() {
  let model = model(&["root", "head"], &[-1, 0]);
  let identity = Kv3Value::Array(
    [0., 0., 0., 1., 0., 0., 0., 1.]
      .map(Kv3Value::Double)
      .to_vec(),
  );
  let skeleton = Kv3Value::Object(vec![
    ("m_boneIDs".into(), strings(&["root", "head", "control"])),
    (
      "m_parentIndices".into(),
      Kv3Value::Array([-1, 0, 1].map(Kv3Value::Int).to_vec()),
    ),
    (
      "m_parentSpaceReferencePose".into(),
      Kv3Value::Array(vec![identity.clone(); 3]),
    ),
    (
      "m_modelSpaceReferencePose".into(),
      Kv3Value::Array(vec![identity; 3]),
    ),
  ]);
  assert!(prove_sampled_rig(&model, &model, &skeleton).is_ok());
  let current = super::tests::model(&["root", "head", "control"], &[-1, 0, 1]);
  assert_eq!(
    prove_sampled_rig(&model, &current, &skeleton).unwrap_err(),
    "Missing sampled bone: control"
  );
  let mut nonidentity = skeleton.clone();
  for field in ["m_parentSpaceReferencePose", "m_modelSpaceReferencePose"] {
    let Kv3Value::Array(poses) = nonidentity.get_mut(field).unwrap() else {
      unreachable!()
    };
    let Kv3Value::Array(pose) = &mut poses[2] else {
      unreachable!()
    };
    pose[0] = Kv3Value::Double(0.2);
  }
  assert!(prove_sampled_rig(&model, &model, &nonidentity).is_ok());
  let mut inconsistent = skeleton.clone();
  let Kv3Value::Array(poses) = inconsistent.get_mut("m_modelSpaceReferencePose").unwrap() else {
    unreachable!()
  };
  let Kv3Value::Array(pose) = &mut poses[2] else {
    unreachable!()
  };
  pose[0] = Kv3Value::Double(5.);
  assert!(prove_sampled_rig(&model, &model, &inconsistent).is_err());
}

#[test]
fn unused_nm_branches_require_both_models_to_omit_every_descendant() {
  let base = model(&["root", "head"], &[-1, 0]);
  let pose = |x| {
    Kv3Value::Array(
      [x, 0., 0., 1., 0., 0., 0., 1.]
        .map(Kv3Value::Double)
        .to_vec(),
    )
  };
  let skeleton = Kv3Value::Object(vec![
    (
      "m_boneIDs".into(),
      strings(&["root", "head", "strand", "strand_tip"]),
    ),
    (
      "m_parentIndices".into(),
      Kv3Value::Array([-1, 0, 1, 2].map(Kv3Value::Int).to_vec()),
    ),
    (
      "m_parentSpaceReferencePose".into(),
      Kv3Value::Array(vec![pose(0.), pose(0.), pose(2.), pose(3.)]),
    ),
    (
      "m_modelSpaceReferencePose".into(),
      Kv3Value::Array(vec![pose(0.), pose(0.), pose(2.), pose(5.)]),
    ),
  ]);
  assert!(prove_sampled_rig(&base, &base, &skeleton).is_ok());
  for names in [
    vec!["root", "head", "strand"],
    vec!["root", "head", "strand_tip"],
  ] {
    let authored = model(&names, &[-1, 0, 1]);
    assert!(prove_sampled_rig(&authored, &base, &skeleton).is_err());
    assert!(prove_sampled_rig(&base, &authored, &skeleton).is_err());
  }
  let unanchored = model(&["unrelated"], &[-1]);
  assert!(prove_sampled_rig(&unanchored, &unanchored, &skeleton).is_err());
}
