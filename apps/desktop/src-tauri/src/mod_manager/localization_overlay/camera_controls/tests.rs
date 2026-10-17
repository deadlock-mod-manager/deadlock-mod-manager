use super::*;

fn array(values: impl IntoIterator<Item = Kv3Value>) -> Kv3Value {
  Kv3Value::Array(values.into_iter().collect())
}
fn object(fields: Vec<(&str, Kv3Value)>) -> Kv3Value {
  Kv3Value::Object(
    fields
      .into_iter()
      .map(|(key, value)| (key.into(), value))
      .collect(),
  )
}
fn vector(values: &[f64]) -> Kv3Value {
  array(values.iter().copied().map(Kv3Value::Double))
}
fn fixture(control: bool) -> (Kv3Value, Kv3Value) {
  let names = if control {
    vec!["body", "new_camera_anchor"]
  } else {
    vec!["body"]
  };
  let count = names.len();
  let rig = object(vec![
    (
      "m_boneName",
      array(names.iter().map(|name| Kv3Value::String((*name).into()))),
    ),
    ("m_nParent", array(vec![Kv3Value::Int(-1); count])),
    (
      "m_bonePosParent",
      array(vec![vector(&[0.0, 0.0, 0.0]); count]),
    ),
    (
      "m_boneRotParent",
      array(vec![vector(&[0.0, 0.0, 0.0, 1.0]); count]),
    ),
    (
      "m_boneScaleParent",
      array(vec![Kv3Value::Double(1.0); count]),
    ),
    (
      "m_boneSphere",
      array((0..count).map(|index| Kv3Value::Double(if index == 0 { 1.0 } else { 0.0 }))),
    ),
    ("m_nFlag", array(vec![Kv3Value::Int(0); count])),
  ]);
  let mut model = object(vec![
    ("m_modelSkeleton", rig),
    (
      "m_animGraph2Refs",
      array([object(vec![
        (
          "m_hGraph",
          Kv3Value::String("graphs/camera.vnmgraph".into()),
        ),
        ("m_sIdentifier", Kv3Value::String(String::new())),
      ])]),
    ),
    (
      "m_vecNmSkeletonRefs",
      array([Kv3Value::String("models/camera.vnmskel".into())]),
    ),
    (
      "m_remappingTable",
      array((0..count).map(|index| Kv3Value::Int(index as i64))),
    ),
    ("m_remappingTableStarts", array([Kv3Value::Int(0)])),
  ]);
  let Kv3Value::Object(fields) = &mut model else {
    unreachable!()
  };
  for field in [
    "m_refMeshes",
    "m_refAnimGroups",
    "m_refAnimIncludeModels",
    "m_refSequenceGroups",
    "m_ExtParts",
    "m_boneFlexDrivers",
  ] {
    fields.push((field.into(), array([])));
  }
  let mesh = object(vec![
    ("m_constraints", array([])),
    (
      "m_skeleton",
      object(vec![(
        "m_bones",
        array(names.iter().map(|name| {
          object(vec![
            ("m_boneName", Kv3Value::String((*name).into())),
            ("m_parentName", Kv3Value::String(String::new())),
            ("m_flSphereRadius", Kv3Value::Double(0.0)),
            (
              "m_bbox",
              object(vec![("m_vecSize", vector(&[0.0, 0.0, 0.0]))]),
            ),
          ])
        })),
      )]),
    ),
    (
      "m_attachments",
      array([object(vec![
        ("key", Kv3Value::String("camera".into())),
        (
          "value",
          object(vec![
            ("m_nInfluences", Kv3Value::Int(1)),
            ("m_bInfluenceRootTransform", array([Kv3Value::Bool(false)])),
            (
              "m_influenceNames",
              array([Kv3Value::String("new_camera_anchor".into())]),
            ),
          ]),
        ),
      ])]),
    ),
  ]);
  (model, mesh)
}
fn encoding(value: &Kv3Value) -> Kv3Encoding {
  kv3::decode_preserving(&kv3::encode(value, &kv3::Format([0; 16])))
    .unwrap()
    .1
}
fn apply(
  model: &mut Kv3Value,
  mesh: &mut Kv3Value,
  current: &Kv3Value,
  base: &Kv3Value,
) -> Option<()> {
  let mut model_encoding = encoding(model);
  let mut mesh_encoding = encoding(mesh);
  let current_encoding = encoding(current);
  let base_encoding = encoding(base);
  extend(
    Encoded {
      value: model,
      encoding: &mut model_encoding,
    },
    Encoded {
      value: mesh,
      encoding: &mut mesh_encoding,
    },
    Reference {
      value: current,
      encoding: &current_encoding,
    },
    Reference {
      value: base,
      encoding: &base_encoding,
    },
    &["camera"],
  )?;
  for (value, encoding) in [(model, model_encoding), (mesh, mesh_encoding)] {
    let bytes = kv3::encode_preserving(value, &encoding, &kv3::Format([0; 16])).unwrap();
    assert_eq!(kv3::decode(&bytes).unwrap(), *value);
  }
  Some(())
}

#[test]
fn isolated_camera_control_preserves_authored_bones_and_mesh_indices() {
  let (mut model, mut mesh) = fixture(false);
  let (current, base) = fixture(true);
  *model
    .get_mut("m_modelSkeleton")
    .unwrap()
    .get_mut("m_bonePosParent")
    .unwrap() = array([vector(&[123.0, 0.0, 0.0])]);
  let old_model = model.clone();
  let old_mesh = mesh.clone();
  apply(&mut model, &mut mesh, &current, &base).unwrap();
  for field in BONE_FIELDS {
    assert_eq!(
      &model
        .get("m_modelSkeleton")
        .unwrap()
        .get(field)
        .unwrap()
        .as_array()
        .unwrap()[..1],
      old_model
        .get("m_modelSkeleton")
        .unwrap()
        .get(field)
        .unwrap()
        .as_array()
        .unwrap()
    );
  }
  assert_eq!(
    model.get("m_remappingTable").unwrap(),
    &array([Kv3Value::Int(0), Kv3Value::Int(1)])
  );
  assert_eq!(
    &mesh
      .get("m_skeleton")
      .unwrap()
      .get("m_bones")
      .unwrap()
      .as_array()
      .unwrap()[..1],
    old_mesh
      .get("m_skeleton")
      .unwrap()
      .get("m_bones")
      .unwrap()
      .as_array()
      .unwrap()
  );
}

#[test]
fn camera_control_extension_declines_deformation_and_unknown_layouts() {
  for case in 0..5 {
    let (mut model, mut mesh) = fixture(false);
    let (mut current, base) = fixture(true);
    match case {
      0 => {
        *current
          .get_mut("m_modelSkeleton")
          .unwrap()
          .get_mut("m_nParent")
          .unwrap() = array([Kv3Value::Int(-1), Kv3Value::Int(0)])
      }
      1 => {
        *current
          .get_mut("m_modelSkeleton")
          .unwrap()
          .get_mut("m_nParent")
          .unwrap() = array([Kv3Value::Int(1), Kv3Value::Int(-1)])
      }
      2 => {
        *current
          .get_mut("m_modelSkeleton")
          .unwrap()
          .get_mut("m_boneSphere")
          .unwrap() = array([Kv3Value::Double(1.0), Kv3Value::Double(1.0)])
      }
      3 => *current.get_mut("m_animGraph2Refs").unwrap() = array([]),
      4 => *model.get_mut("m_remappingTable").unwrap() = array([Kv3Value::Int(9)]),
      _ => unreachable!(),
    }
    let before = model.clone();
    assert!(
      apply(&mut model, &mut mesh, &current, &base).is_none(),
      "case {case}"
    );
    assert_eq!(model, before);
  }
}
