use super::*;
fn array(values: &[f64]) -> Kv3Value {
  Kv3Value::Array(values.iter().copied().map(Kv3Value::Double).collect())
}
fn object(fields: Vec<(&str, Kv3Value)>) -> Kv3Value {
  Kv3Value::Object(fields.into_iter().map(|(k, v)| (k.into(), v)).collect())
}
fn pose(x: f64) -> Kv3Value {
  array(&[x, 0., 0., 1., 0., 0., 0., 1.])
}
fn track(x: f64) -> Kv3Value {
  let range = |x| {
    object(vec![
      ("m_flRangeStart", Kv3Value::Double(x)),
      ("m_flRangeLength", Kv3Value::Double(0.1)),
    ])
  };
  object(vec![
    ("m_bIsRotationStatic", Kv3Value::Bool(true)),
    ("m_bIsTranslationStatic", Kv3Value::Bool(true)),
    ("m_bIsScaleStatic", Kv3Value::Bool(true)),
    ("m_constantRotation", array(&[0., 0., 0., 1.])),
    ("m_nTrackReadOffset", Kv3Value::UInt(0)),
    ("m_translationRangeX", range(x)),
    ("m_translationRangeY", range(0.)),
    ("m_translationRangeZ", range(0.)),
    ("m_scaleRange", range(1.)),
  ])
}
fn fixture() -> (Kv3Value, Kv3Value, Kv3Value) {
  let mut names = vec!["root_motion".to_string()];
  names.extend((0..12).map(|i| format!("bone_{i}")));
  let positions: Vec<_> = (0..names.len())
    .map(|i| array(&[i as f64, 0., 0.]))
    .collect();
  let rig = object(vec![
    (
      "m_boneName",
      Kv3Value::Array(names.iter().cloned().map(Kv3Value::String).collect()),
    ),
    (
      "m_nParent",
      Kv3Value::Array(
        (0..names.len())
          .map(|i| Kv3Value::Int(if i == 0 { -1 } else { 0 }))
          .collect(),
      ),
    ),
    ("m_bonePosParent", Kv3Value::Array(positions)),
    (
      "m_boneRotParent",
      Kv3Value::Array(vec![array(&[0., 0., 0., 1.]); names.len()]),
    ),
    ("m_boneScaleParent", array(&vec![1.; names.len()])),
  ]);
  let mut current = names.clone();
  current.insert(1, "inserted_helper".into());
  let skeleton = object(vec![
    (
      "m_boneIDs",
      Kv3Value::Array(current.iter().cloned().map(Kv3Value::String).collect()),
    ),
    (
      "m_parentIndices",
      Kv3Value::Array(
        (0..current.len())
          .map(|i| {
            Kv3Value::Int(match i {
              0 => -1,
              1 => 0,
              _ => 1,
            })
          })
          .collect(),
      ),
    ),
    (
      "m_parentSpaceReferencePose",
      Kv3Value::Array(
        (0..current.len())
          .map(|i| pose(if i < 2 { 0. } else { (i - 1) as f64 }))
          .collect(),
      ),
    ),
  ]);
  let clip = object(vec![
    (
      "m_trackCompressionSettings",
      Kv3Value::Array((0..names.len()).map(|i| track(i as f64)).collect()),
    ),
    ("m_nNumFrames", Kv3Value::UInt(2)),
    (
      "m_compressedPoseOffsets",
      Kv3Value::Array(vec![Kv3Value::UInt(0); 2]),
    ),
    ("m_compressedPoseData", Kv3Value::Binary(vec![])),
    ("m_bIsAdditive", Kv3Value::Bool(false)),
    ("m_secondaryAnimations", Kv3Value::Array(vec![])),
    ("m_modelSpaceBoneSamplingIndices", Kv3Value::Array(vec![])),
    ("m_modelSpaceSamplingChain", Kv3Value::Array(vec![])),
    ("m_floatChannelData", Kv3Value::Array(vec![])),
    ("m_events", Kv3Value::Array(vec![])),
  ]);
  (object(vec![("m_modelSkeleton", rig)]), skeleton, clip)
}
fn container(value: &Kv3Value) -> Vec<u8> {
  let data = kv3::encode(value, &kv3::Format([3; 16]));
  let mut bytes = vec![0; 28];
  bytes[4..6].copy_from_slice(&12u16.to_le_bytes());
  bytes[8..12].copy_from_slice(&8u32.to_le_bytes());
  bytes[12..16].copy_from_slice(&1u32.to_le_bytes());
  bytes[16..20].copy_from_slice(b"DATA");
  bytes[20..24].copy_from_slice(&8u32.to_le_bytes());
  bytes[24..28].copy_from_slice(&(data.len() as u32).to_le_bytes());
  bytes.extend(data);
  let len = bytes.len() as u32;
  bytes[..4].copy_from_slice(&len.to_le_bytes());
  bytes
}
#[test]
fn inserted_identity_helper_preserves_existing_tracks_and_additive_motion() {
  let (model, skeleton, mut clip) = fixture();
  let old = clip
    .get("m_trackCompressionSettings")
    .unwrap()
    .as_array()
    .unwrap()
    .to_vec();
  let layout = layout::mapping(&skeleton, &model, &old).unwrap();
  assert_eq!(layout[1], None);
  for additive in [false, true] {
    *clip.get_mut("m_bIsAdditive").unwrap() = Kv3Value::Bool(additive);
    let rebuilt = expand(&container(&clip), &skeleton, &layout).unwrap();
    let (_, value, _) = decode_compiled_data(&rebuilt, "expanded fixture").unwrap();
    let tracks = value
      .get("m_trackCompressionSettings")
      .unwrap()
      .as_array()
      .unwrap();
    for (i, old_index) in layout.iter().enumerate() {
      if let Some(old_index) = old_index {
        assert_eq!(&tracks[i], &old[*old_index]);
      }
    }
    assert_eq!(frame_words(&value, tracks), Some(0));
    assert_eq!(
      tracks[1]
        .get("m_scaleRange")
        .unwrap()
        .get("m_flRangeStart")
        .unwrap()
        .as_f64(),
      Some(if additive { 0. } else { 1. })
    );
    for field in [
      "m_compressedPoseData",
      "m_compressedPoseOffsets",
      "m_events",
    ] {
      assert_eq!(value.get(field), clip.get(field));
    }
  }
}
#[test]
fn refuses_nonidentity_inserted_ancestor_and_unanchored_layout() {
  let (model, mut skeleton, clip) = fixture();
  let tracks = clip
    .get("m_trackCompressionSettings")
    .unwrap()
    .as_array()
    .unwrap();
  let Kv3Value::Array(poses) = skeleton.get_mut("m_parentSpaceReferencePose").unwrap() else {
    panic!()
  };
  poses[1] = pose(10.);
  assert!(layout::mapping(&skeleton, &model, tracks).is_none());
  let (_, skeleton, mut clip) = fixture();
  let Kv3Value::Array(tracks) = clip.get_mut("m_trackCompressionSettings").unwrap() else {
    panic!()
  };
  for track in tracks.iter_mut() {
    *track.get_mut("m_bIsTranslationStatic").unwrap() = Kv3Value::Bool(false);
  }
  assert!(layout::mapping(&skeleton, &model, tracks).is_none());
}
#[test]
fn refuses_truncated_frames_and_bone_indexed_channels() {
  let (_, _, mut clip) = fixture();
  let tracks = clip
    .get("m_trackCompressionSettings")
    .unwrap()
    .as_array()
    .unwrap()
    .to_vec();
  *clip.get_mut("m_compressedPoseData").unwrap() = Kv3Value::Binary(vec![0, 1]);
  assert!(frame_words(&clip, &tracks).is_none());
  *clip.get_mut("m_compressedPoseData").unwrap() = Kv3Value::Binary(vec![]);
  *clip.get_mut("m_modelSpaceBoneSamplingIndices").unwrap() =
    Kv3Value::Array(vec![Kv3Value::UInt(1)]);
  assert!(frame_words(&clip, &tracks).is_none());
}

#[test]
fn respects_compatibility_selection_and_mod_provided_skeletons() {
  use super::super::LocalizationModInput;
  use std::{collections::BTreeSet, fs};
  use tempfile::TempDir;
  for (selected, bundled, expected) in [(true, false, 1), (false, false, 0), (true, true, 0)] {
    let temp = TempDir::new().unwrap();
    let game = temp.path().join("citadel");
    fs::create_dir(&game).unwrap();
    let game_source = temp.path().join("game_source");
    let source = temp.path().join("source");
    fs::create_dir_all(game_source.join("models")).unwrap();
    fs::create_dir_all(source.join("models")).unwrap();
    let (mut model, skeleton, mut clip) = fixture();
    let Kv3Value::Object(fields) = &mut model else {
      panic!()
    };
    fields.push((
      "m_vecNmSkeletonRefs".into(),
      Kv3Value::Array(vec![Kv3Value::String("models/test.vnmskel".into())]),
    ));
    let Kv3Value::Object(fields) = &mut clip else {
      panic!()
    };
    fields.push((
      "m_skeleton".into(),
      Kv3Value::String("models/test.vnmskel".into()),
    ));
    let original = container(&clip);
    let model_bytes = container(&model);
    fs::write(
      game_source.join("models/test.vnmskel_c"),
      container(&skeleton),
    )
    .unwrap();
    fs::write(source.join("models/test.vmdl_c"), &model_bytes).unwrap();
    fs::write(source.join("models/idle.vnmclip_c"), &original).unwrap();
    if bundled {
      fs::write(source.join("models/test.vnmskel_c"), container(&skeleton)).unwrap();
    }
    vpkmanager::pack_directory(&game_source, &game.join("pak01_dir.vpk")).unwrap();
    let archive = temp.path().join("skin_dir.vpk");
    vpkmanager::pack_directory(&source, &archive).unwrap();
    let inputs = vec![LocalizationModInput {
      mod_id: "skin".into(),
      vpks: vec![archive],
    }];
    let resources = ResourceSnapshot::open(&game, &inputs).unwrap();
    let enabled = if selected {
      BTreeSet::from(["skin".into()])
    } else {
      BTreeSet::new()
    };
    let scope = RepairScope::new(&inputs, &enabled, &resources);
    let models = BTreeMap::from([(
      "models/test.vmdl_c".into(),
      vec![CompiledDataSource {
        mod_id: "skin".into(),
        source_vpk: "skin_dir.vpk".into(),
        priority: 0,
        bytes: model_bytes,
      }],
    )]);
    let mut repairs = vec![];
    let mut warnings = vec![];
    let result = prepare(&resources, &models, &scope, &mut repairs, &mut warnings).unwrap();
    assert_eq!(result.len(), expected);
    assert_eq!(repairs.len(), expected);
    assert!(warnings.is_empty());
    assert_eq!(
      *resources
        .resolve("models/idle.vnmclip_c")
        .unwrap()
        .unwrap()
        .1,
      original
    );
  }
}

#[test]
fn reordered_limbs_do_not_pass_an_insertions_only_layout() {
  let (model, skeleton, clip) = fixture();
  let mut tracks = clip
    .get("m_trackCompressionSettings")
    .unwrap()
    .as_array()
    .unwrap()
    .to_vec();
  tracks.swap(2, 3);
  let mapping = layout::mapping(&skeleton, &model, &tracks).unwrap();
  assert_eq!(
    mapping[3],
    Some(3),
    "bone_1 must retain its named authored track"
  );
  assert_eq!(
    mapping[4],
    Some(2),
    "bone_2 must retain its named authored track"
  );
}

#[test]
fn reordered_compressed_segments_preserve_each_named_bones_motion() {
  use source2_model::nm_anim::{NmAnimation, parse_nm_clip, parse_nm_skeleton};
  use source2_model::resource::Resource as IndependentResource;
  let (model, mut skeleton, mut clip) = fixture();
  let Kv3Value::Array(tracks) = clip.get_mut("m_trackCompressionSettings").unwrap() else {
    panic!()
  };
  tracks.swap(2, 3);
  let mapping = layout::mapping(&skeleton, &model, tracks).unwrap();
  for (index, track) in tracks.iter_mut().enumerate() {
    *track.get_mut("m_nTrackReadOffset").unwrap() = Kv3Value::UInt(match index {
      0..=2 => 0,
      3 => 3,
      _ => 6,
    });
    if index == 2 || index == 3 {
      *track.get_mut("m_bIsTranslationStatic").unwrap() = Kv3Value::Bool(false);
      *track
        .get_mut("m_translationRangeX")
        .unwrap()
        .get_mut("m_flRangeLength")
        .unwrap() = Kv3Value::Double(1.);
    }
  }
  *clip.get_mut("m_compressedPoseOffsets").unwrap() =
    Kv3Value::Array(vec![Kv3Value::UInt(0), Kv3Value::UInt(6)]);
  *clip.get_mut("m_compressedPoseData").unwrap() = Kv3Value::Binary(
    [0u16, 0, 0, 0, 0, 0, 32768, 0, 0, 65535, 0, 0]
      .into_iter()
      .flat_map(u16::to_le_bytes)
      .collect(),
  );
  let Kv3Value::Object(fields) = &mut clip else {
    panic!()
  };
  fields.extend([
    (
      "m_skeleton".into(),
      Kv3Value::String("models/test.vnmskel".into()),
    ),
    ("m_flDuration".into(), Kv3Value::Double(1.)),
  ]);
  let Kv3Value::Object(fields) = &mut skeleton else {
    panic!()
  };
  fields.push(("m_ID".into(), Kv3Value::String("test".into())));
  let rebuilt = expand(&container(&clip), &skeleton, &mapping).unwrap();
  let animation = NmAnimation {
    clip_path: "test".into(),
    skeleton: parse_nm_skeleton(&IndependentResource::parse(container(&skeleton)).unwrap())
      .unwrap(),
    clip: parse_nm_clip(&IndependentResource::parse(rebuilt.clone()).unwrap()).unwrap(),
  };
  for (frame, expected_left, expected_right) in [(0, 2., 3.), (1, 3., 3.5)] {
    let pose = animation.sample_frame(frame).unwrap();
    assert!((pose[3].translation[0] - expected_left).abs() < 0.0001);
    assert!((pose[4].translation[0] - expected_right).abs() < 0.0001);
  }
  let (_, value, _) = decode_compiled_data(&rebuilt, "dynamic fixture").unwrap();
  assert_eq!(
    frame_words(
      &value,
      value
        .get("m_trackCompressionSettings")
        .unwrap()
        .as_array()
        .unwrap()
    ),
    Some(6)
  );
  assert!(expand(&container(&clip), &skeleton, &vec![Some(0); mapping.len()]).is_none());
}
