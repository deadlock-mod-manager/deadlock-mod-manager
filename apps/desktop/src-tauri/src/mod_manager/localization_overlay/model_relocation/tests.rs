use super::super::{
  HistoricalLocalizationIndex, Kv3Value, LocalizationModInput, LocalizationOverlayPlan, Resource,
  kv3, resources::tests::pack,
};
use super::*;
use crate::mod_manager::vdata_history::encode_history_index;
use source2_model::vpk_extract::VpkArchive;
use std::{fs, path::Path};

const OLD: &str = "models/retired/body.vmdl_c";
const CURRENT: &str = "models/rebuilt/character.vmdl_c";
const OTHER: &str = "models/unrelated/second.vmdl_c";

fn model(current: bool, complete: bool) -> Kv3Value {
  let names = if complete {
    vec!["root", "head"]
  } else {
    vec!["root"]
  };
  let count = names.len();
  let mut fields = vec![
    (
      "authoredAppearance".into(),
      Kv3Value::String("keep my custom appearance".into()),
    ),
    (
      "m_modelSkeleton".into(),
      Kv3Value::Object(vec![
        (
          "m_boneName".into(),
          Kv3Value::Array(
            names
              .into_iter()
              .map(|s| Kv3Value::String(s.into()))
              .collect(),
          ),
        ),
        (
          "m_nParent".into(),
          Kv3Value::Array(if complete {
            vec![Kv3Value::Int(-1), Kv3Value::Int(0)]
          } else {
            vec![Kv3Value::Int(-1)]
          }),
        ),
        (
          "m_bonePosParent".into(),
          Kv3Value::Array(vec![Kv3Value::Array(vec![Kv3Value::Double(0.0); 3]); count]),
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
            count
          ]),
        ),
        (
          "m_boneScaleParent".into(),
          Kv3Value::Array(vec![Kv3Value::Double(1.0); count]),
        ),
      ]),
    ),
  ];
  if current {
    fields.extend([
      (
        "m_vecNmSkeletonRefs".into(),
        Kv3Value::Array(vec![Kv3Value::String("models/rig.vnmskel".into())]),
      ),
      (
        "m_animGraph2Refs".into(),
        Kv3Value::Array(vec![Kv3Value::Object(vec![
          ("m_sIdentifier".into(), Kv3Value::String("".into())),
          (
            "m_hGraph".into(),
            Kv3Value::String("animgraphs/current.vnmgraph".into()),
          ),
        ])]),
      ),
    ]);
  }
  Kv3Value::Object(fields)
}

fn resource(value: &Kv3Value) -> Vec<u8> {
  let blocks = [
    (*b"DATA", kv3::encode(value, &kv3::Format([0; 16]))),
    (*b"RERL", vec![8, 0, 0, 0, 0, 0, 0, 0]),
    (*b"VBIB", vec![9, 8, 7, 6]),
  ];
  let mut bytes = vec![0; 16 + blocks.len() * 12];
  bytes[4..6].copy_from_slice(&12u16.to_le_bytes());
  bytes[8..12].copy_from_slice(&8u32.to_le_bytes());
  bytes[12..16].copy_from_slice(&(blocks.len() as u32).to_le_bytes());
  for (index, (kind, data)) in blocks.into_iter().enumerate() {
    let offset = 16 + index * 12;
    bytes[offset..offset + 4].copy_from_slice(&kind);
    let relative = (bytes.len() - offset - 4) as u32;
    bytes[offset + 4..offset + 8].copy_from_slice(&relative.to_le_bytes());
    bytes[offset + 8..offset + 12].copy_from_slice(&(data.len() as u32).to_le_bytes());
    bytes.extend(data);
  }
  let length = bytes.len() as u32;
  bytes[..4].copy_from_slice(&length.to_le_bytes());
  bytes
}

fn registry(row: &str, model: &str) -> Kv3Value {
  Kv3Value::Object(vec![(
    row.into(),
    Kv3Value::Object(vec![(
      "m_strModelName".into(),
      Kv3Value::String(model.trim_end_matches("_c").into()),
    )]),
  )])
}

fn fixture(
  root: &Path,
  row: &str,
  complete: bool,
  ambiguous: bool,
) -> (std::path::PathBuf, LocalizationModInput, VdataHistoryIndex) {
  let citadel = root.join("citadel");
  fs::create_dir_all(&citadel).unwrap();
  let mut current = registry(row, CURRENT);
  let mut old = registry(row, OLD);
  if ambiguous {
    let Kv3Value::Object(rows) = &mut current else {
      unreachable!()
    };
    rows.extend(
      registry("hero_other", OTHER)
        .as_object()
        .unwrap()
        .iter()
        .cloned(),
    );
    let Kv3Value::Object(rows) = &mut old else {
      unreachable!()
    };
    rows.extend(
      registry("hero_other", OLD)
        .as_object()
        .unwrap()
        .iter()
        .cloned(),
    );
  }
  let history = VdataHistoryIndex::from_bytes(
    &encode_history_index(&[(HEROES_VDATA_PATH.into(), vec![(1, old)])]).unwrap(),
  )
  .unwrap();
  let pose = Kv3Value::Array(
    [0., 0., 0., 1., 0., 0., 0., 1.]
      .into_iter()
      .map(Kv3Value::Double)
      .collect(),
  );
  let skeleton = resource(&Kv3Value::Object(vec![
    (
      "m_boneIDs".into(),
      Kv3Value::Array(vec![Kv3Value::String("head".into())]),
    ),
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
  ]));
  let current = resource(&current);
  let base_model = resource(&model(true, true));
  pack(
    &citadel,
    "pak01",
    &[
      (HEROES_VDATA_PATH, &current),
      (OLD, &base_model),
      (CURRENT, &base_model),
      (OTHER, &base_model),
      ("models/rig.vnmskel_c", &skeleton),
      ("animgraphs/current.vnmgraph_c", b"available graph"),
    ],
  );
  let source = resource(&model(false, complete));
  let input = LocalizationModInput {
    mod_id: "skin".into(),
    vpks: vec![pack(root, "skin", &[(OLD, &source)])],
  };
  (citadel, input, history)
}

fn plan(
  citadel: &Path,
  inputs: &[LocalizationModInput],
  history: &VdataHistoryIndex,
) -> LocalizationOverlayPlan {
  LocalizationOverlayPlan::build_with_indices(
    citadel,
    inputs,
    HistoricalLocalizationIndex::embedded(),
    history,
  )
  .unwrap()
}

#[test]
fn recorded_bindings_relocate_differently_named_heroes_and_preserve_authored_geometry() {
  for row in ["hero_copper", "hero_turtle"] {
    let root = tempfile::tempdir().unwrap();
    let (citadel, input, history) = fixture(root.path(), row, true, false);
    let original = fs::read(&input.vpks[0]).unwrap();
    let plan = plan(&citadel, std::slice::from_ref(&input), &history);
    assert!(
      plan
        .analysis
        .asset_repairs
        .iter()
        .any(|r| matches!(r.kind, RepairKind::ModelRelocation) && r.file_path == CURRENT)
    );
    let out = root.path().join("overlay.vpk");
    plan.write(&out, &[]).unwrap();
    let bytes = VpkArchive::open(&out)
      .unwrap()
      .extract_entry(CURRENT)
      .unwrap();
    let (_, actual, _) = decode_compiled_data(&bytes, CURRENT).unwrap();
    let source = model(false, true);
    assert_eq!(
      actual.get("authoredAppearance"),
      source.get("authoredAppearance")
    );
    assert_eq!(actual.get("m_modelSkeleton"), source.get("m_modelSkeleton"));
    assert_eq!(
      Resource::parse(&bytes).unwrap().find_block(*b"VBIB"),
      Some([9, 8, 7, 6].as_slice())
    );
    assert_eq!(fs::read(&input.vpks[0]).unwrap(), original);
  }
}

#[test]
fn missing_required_bones_and_ambiguous_historical_bindings_decline_relocation() {
  for (complete, ambiguous) in [(false, false), (true, true)] {
    let root = tempfile::tempdir().unwrap();
    let (citadel, input, history) = fixture(root.path(), "hero_copper", complete, ambiguous);
    let plan = plan(&citadel, &[input], &history);
    assert!(!plan.camera_models.contains_key(CURRENT));
    assert!(
      plan
        .analysis
        .asset_warnings
        .iter()
        .any(|w| w.kind == WarningKind::ModelMapping)
    );
  }
}

#[test]
fn existing_current_models_block_relocation_for_selected_and_opted_out_mods_in_both_orders() {
  for selected in [true, false] {
    for reverse in [true, false] {
      let root = tempfile::tempdir().unwrap();
      let (citadel, input, history) = fixture(root.path(), "hero_copper", true, false);
      let competing = LocalizationModInput {
        mod_id: "current_skin".into(),
        vpks: vec![pack(
          root.path(),
          "current_skin",
          &[(CURRENT, b"authored current model")],
        )],
      };
      let mut inputs = vec![input, competing];
      if reverse {
        inputs.reverse();
      }
      let resources = ResourceSnapshot::open(&citadel, &inputs).unwrap();
      let selected = if selected {
        BTreeSet::from(["skin".into(), "current_skin".into()])
      } else {
        BTreeSet::from(["skin".into()])
      };
      let plan = LocalizationOverlayPlan::build_snapshot(
        &inputs,
        HistoricalLocalizationIndex::embedded(),
        &history,
        &resources,
        &selected,
      )
      .unwrap();
      assert!(!plan.camera_models.contains_key(CURRENT));
      assert!(
        plan
          .analysis
          .asset_warnings
          .iter()
          .any(|w| w.kind == WarningKind::ModelMapping)
      );
    }
  }
}

#[test]
fn already_active_models_unknown_history_and_opted_out_sources_do_not_relocate() {
  let root = tempfile::tempdir().unwrap();
  let (citadel, input, history) = fixture(root.path(), "hero_copper", true, false);
  let unknown = plan(&citadel, std::slice::from_ref(&input), &VdataHistoryIndex::default());
  assert!(!unknown.camera_models.contains_key(CURRENT));
  let resources = ResourceSnapshot::open(&citadel, std::slice::from_ref(&input)).unwrap();
  let disabled = LocalizationOverlayPlan::build_snapshot(
    std::slice::from_ref(&input),
    HistoricalLocalizationIndex::embedded(),
    &history,
    &resources,
    &BTreeSet::new(),
  )
  .unwrap();
  assert!(disabled.camera_models.is_empty());
  assert!(disabled.analysis.asset_warnings.is_empty());
  let active = LocalizationModInput {
    mod_id: "active".into(),
    vpks: vec![pack(
      root.path(),
      "active",
      &[(CURRENT, &resource(&model(false, true)))],
    )],
  };
  let active = plan(&citadel, &[active], &history);
  assert!(
    !active
      .analysis
      .asset_repairs
      .iter()
      .any(|r| matches!(r.kind, RepairKind::ModelRelocation))
  );
}

#[test]
fn already_valid_ag2_models_can_relocate_without_replacing_authored_bindings() {
  let root = tempfile::tempdir().unwrap();
  let (citadel, _, history) = fixture(root.path(), "hero_copper", true, false);
  let input = LocalizationModInput {
    mod_id: "valid_ag2".into(),
    vpks: vec![pack(
      root.path(),
      "valid_ag2",
      &[(OLD, &resource(&model(true, true)))],
    )],
  };
  let plan = plan(&citadel, &[input], &history);
  assert!(
    plan
      .analysis
      .asset_repairs
      .iter()
      .any(|r| matches!(r.kind, RepairKind::ModelRelocation) && r.file_path == CURRENT)
  );
  let (_, actual, _) = decode_compiled_data(&plan.camera_models[CURRENT], CURRENT).unwrap();
  assert_eq!(actual, model(true, true));
}

#[test]
fn modified_hero_registries_preserve_their_authored_model_choices() {
  let root = tempfile::tempdir().unwrap();
  let (citadel, input, history) = fixture(root.path(), "hero_copper", true, false);
  let registry = LocalizationModInput {
    mod_id: "registry".into(),
    vpks: vec![pack(
      root.path(),
      "registry",
      &[(
        HEROES_VDATA_PATH,
        &resource(&registry("hero_copper", OTHER)),
      )],
    )],
  };
  let plan = plan(&citadel, &[input, registry], &history);
  assert!(!plan.camera_models.contains_key(CURRENT));
  assert!(
    !plan
      .analysis
      .asset_repairs
      .iter()
      .any(|r| matches!(r.kind, RepairKind::ModelRelocation))
  );
}

#[test]
fn registry_changes_with_unchanged_model_binding_do_not_block_relocation() {
  let root = tempfile::tempdir().unwrap();
  let (citadel, input, history) = fixture(root.path(), "hero_copper", true, false);
  let definitions = LocalizationModInput {
    mod_id: "definitions".into(),
    vpks: vec![pack(
      root.path(),
      "definitions",
      &[(
        HEROES_VDATA_PATH,
        &resource(&registry("hero_copper", CURRENT)),
      )],
    )],
  };
  let plan = plan(&citadel, &[input, definitions], &history);
  assert!(
    plan
      .analysis
      .asset_repairs
      .iter()
      .any(|r| matches!(r.kind, RepairKind::ModelRelocation) && r.file_path == CURRENT)
  );
}
