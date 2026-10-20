use super::animation_contract::{
  AnimationDependencyIssueKind as Issue, AnimationDependencyStatus as Status,
};
use super::asset_compatibility::WarningKind;
use super::resources::tests::pack;
use super::tests::compiled_resource;
use super::*;

fn strings(values: &[&str]) -> Kv3Value {
  Kv3Value::Array(
    values
      .iter()
      .map(|value| Kv3Value::String((*value).into()))
      .collect(),
  )
}

fn model() -> Vec<u8> {
  compiled_resource(vec![
    (
      "m_vecNmSkeletonRefs".into(),
      strings(&["models/test.vnmskel"]),
    ),
    (
      "m_animGraph2Refs".into(),
      Kv3Value::Array(vec![Kv3Value::Object(vec![
        ("m_sIdentifier".into(), Kv3Value::String(String::new())),
        (
          "m_hGraph".into(),
          Kv3Value::String("animgraphs/test.vnmgraph".into()),
        ),
      ])]),
    ),
  ])
}

fn graph(children: &[&str]) -> Vec<u8> {
  compiled_resource(vec![
    (
      "m_skeleton".into(),
      Kv3Value::String("models/test.vnmskel".into()),
    ),
    ("m_resources".into(), strings(children)),
  ])
}

fn skeleton() -> Vec<u8> {
  let pose = Kv3Value::Array(
    [0., 0., 0., 1., 0., 0., 0., 1.]
      .into_iter()
      .map(Kv3Value::Double)
      .collect(),
  );
  compiled_resource(vec![
    ("m_boneIDs".into(), strings(&["root"])),
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

fn clip(tracks: usize) -> Vec<u8> {
  compiled_resource(vec![
    (
      "m_skeleton".into(),
      Kv3Value::String("models/test.vnmskel".into()),
    ),
    (
      "m_trackCompressionSettings".into(),
      Kv3Value::Array(vec![Kv3Value::Object(vec![]); tracks]),
    ),
  ])
}

fn plan(game: &[(&str, &[u8])], mods: &[(&str, &[u8])]) -> LocalizationOverlayPlan {
  let root = tempfile::tempdir().unwrap();
  let citadel = root.path().join("citadel");
  fs::create_dir_all(&citadel).unwrap();
  let model = model();
  let skeleton = skeleton();
  let mut entries = vec![
    ("models/test.vmdl_c", model.as_slice()),
    ("models/test.vnmskel_c", skeleton.as_slice()),
  ];
  entries.extend_from_slice(game);
  pack(&citadel, "pak01", &entries);
  let mut entries = vec![("models/test.vmdl_c", model.as_slice())];
  entries.extend_from_slice(mods);
  let archive = pack(root.path(), "skin", &entries);
  LocalizationOverlayPlan::build(
    &citadel,
    &[LocalizationModInput {
      mod_id: "skin".into(),
      vpks: vec![archive],
    }],
  )
  .unwrap()
}

#[test]
fn bound_model_reports_missing_nested_animation_dependency() {
  let root_graph = graph(&["animgraphs/nested.vnmgraph"]);
  let nested = graph(&["animations/missing.vnmclip"]);
  let plan = plan(
    &[],
    &[
      ("animgraphs/test.vnmgraph_c", &root_graph),
      ("animgraphs/nested.vnmgraph_c", &nested),
    ],
  );
  assert!(
    plan.analysis.asset_warnings.iter().any(|warning| {
      warning.file_path == "models/test.vmdl_c"
        && warning.kind == WarningKind::MissingResource
        && warning.detail.contains("animations/missing.vnmclip")
    }),
    "the bound model must expose its missing nested clip"
  );
}

#[test]
fn bound_model_reports_game_clip_mismatched_with_mod_skeleton() {
  let graph = graph(&["animations/test.vnmclip"]);
  let clip = clip(2);
  let skeleton = skeleton();
  let plan = plan(
    &[
      ("animgraphs/test.vnmgraph_c", &graph),
      ("animations/test.vnmclip_c", &clip),
    ],
    &[("models/test.vnmskel_c", &skeleton)],
  );
  assert!(
    plan.analysis.asset_warnings.iter().any(|warning| {
      warning.file_path == "models/test.vmdl_c"
        && warning.kind == WarningKind::AnimationMapping
        && warning.detail.contains("2 tracks")
    }),
    "a game-owned clip still samples the effective mod skeleton"
  );
}

#[test]
fn bound_model_distinguishes_verified_dependencies_from_absent_game_clips() {
  let graph = graph(&["animations/test.vnmclip"]);
  let clip = clip(1);
  let complete = plan(
    &[
      ("animgraphs/test.vnmgraph_c", &graph),
      ("animations/test.vnmclip_c", &clip),
    ],
    &[],
  );
  let check = &complete.analysis.animation_checks[0];
  assert_eq!(check.before, check.after);
  assert_eq!(check.after.status, Status::Verified);
  assert_eq!(check.after.checked_resources, 3);
  let optional = plan(&[("animgraphs/test.vnmgraph_c", &graph)], &[]);
  assert_eq!(
    optional.analysis.animation_checks[0].after.status,
    Status::NotChecked
  );
  assert!(optional.analysis.asset_warnings.is_empty());
}

#[test]
fn bound_model_checks_effective_dependency_provider() {
  let graph = graph(&["animations/test.vnmclip"]);
  let good = clip(1);
  let bad = clip(2);
  let result = plan(
    &[
      ("animgraphs/test.vnmgraph_c", &graph),
      ("animations/test.vnmclip_c", &good),
    ],
    &[
      ("animations/test.vnmclip_c", &bad),
      ("models/test.vnmskel_c", &skeleton()),
    ],
  );
  assert_eq!(
    result.analysis.animation_checks[0].after.status,
    Status::Unresolved
  );
  assert!(
    result.analysis.animation_checks[0]
      .after
      .issues
      .iter()
      .any(|issue| issue.kind == Issue::AnimationMapping)
  );
}

#[test]
fn cached_animation_facts_do_not_hide_edits_removals_or_corruption() {
  let graph = graph(&["animations/test.vnmclip"]);
  let good = clip(1);
  let bad = clip(2);
  for (bytes, expected, issue) in [
    (Some(good.as_slice()), Status::Verified, None),
    (
      Some(bad.as_slice()),
      Status::Unresolved,
      Some(Issue::AnimationMapping),
    ),
    (None, Status::Unresolved, Some(Issue::MissingResource)),
    (
      Some(&good[..good.len() - 1]),
      Status::Unresolved,
      Some(Issue::UnreadableResource),
    ),
    (Some(good.as_slice()), Status::Verified, None),
  ] {
    let mut entries = vec![("animgraphs/test.vnmgraph_c", graph.as_slice())];
    if let Some(bytes) = bytes {
      entries.push(("animations/test.vnmclip_c", bytes));
    }
    let result = plan(&[], &entries);
    let check = &result.analysis.animation_checks[0].after;
    assert_eq!(check.status, expected);
    if let Some(issue) = issue {
      assert!(check.issues.iter().any(|finding| finding.kind == issue));
    }
  }
}

#[test]
fn bound_model_postconditions_use_repaired_dependencies_and_preserve_before_findings() {
  let root = tempfile::tempdir().unwrap();
  let citadel = root.path().join("citadel");
  fs::create_dir_all(&citadel).unwrap();
  let graph = graph(&["animations/test.vnmclip"]);
  let bad = clip(2);
  let rig = skeleton();
  pack(
    &citadel,
    "pak01",
    &[
      ("animgraphs/test.vnmgraph_c", &graph),
      ("animations/test.vnmclip_c", &bad),
      ("models/test.vnmskel_c", &rig),
    ],
  );
  let archive = pack(root.path(), "skin", &[("models/test.vmdl_c", &model())]);
  let resources = resources::ResourceSnapshot::open(
    &citadel,
    &[LocalizationModInput {
      mod_id: "skin".into(),
      vpks: vec![archive],
    }],
  )
  .unwrap();
  let models = BTreeMap::from([(
    "models/test.vmdl_c".into(),
    vec![CompiledDataSource {
      mod_id: "skin".into(),
      source_vpk: "skin_dir.vpk".into(),
      priority: 0,
      bytes: model(),
    }],
  )]);
  let good = clip(1);
  let repaired = BTreeMap::from([("animations/test.vnmclip_c", good.as_slice())]);
  let mut warnings = Vec::new();
  let checks = animation_contract::analyze(&resources, &models, &repaired, &[], &mut warnings);
  assert_eq!(checks[0].before.status, Status::Unresolved);
  assert_eq!(checks[0].after.status, Status::Verified);
  assert!(warnings.is_empty());
  let broken = BTreeMap::from([
    ("animations/test.vnmclip_c", good.as_slice()),
    ("models/test.vnmskel_c", b"truncated".as_slice()),
  ]);
  let checks = animation_contract::analyze(&resources, &models, &broken, &[], &mut warnings);
  assert_eq!(checks[0].after.status, Status::Unresolved);
  assert!(
    warnings
      .iter()
      .any(|warning| warning.kind == WarningKind::UnreadableResource)
  );
  let (_, mut invalid_model, _) = decode_compiled_data(&model(), "fixture").unwrap();
  let Kv3Value::Array(graphs) = invalid_model.get_mut("m_animGraph2Refs").unwrap() else {
    panic!()
  };
  *graphs[0].get_mut("m_hGraph").unwrap() = Kv3Value::String("../unsupported.vnmgraph".into());
  let Kv3Value::Object(fields) = invalid_model else {
    panic!()
  };
  let invalid_model = compiled_resource(fields);
  let repaired = BTreeMap::from([("models/test.vmdl_c", invalid_model.as_slice())]);
  warnings.clear();
  let checks = animation_contract::analyze(&resources, &models, &repaired, &[], &mut warnings);
  assert_eq!(
    checks[0].after.status,
    Status::NotChecked,
    "unsupported graph paths must not disappear from the verdict"
  );
  let moved_model = model();
  let repaired = BTreeMap::from([
    ("models/relocated.vmdl_c", moved_model.as_slice()),
    ("animations/test.vnmclip_c", good.as_slice()),
  ]);
  let relocation = asset_compatibility::AssetRepair {
    mod_id: "skin".into(),
    source_vpk: "skin_dir.vpk".into(),
    file_path: "models/relocated.vmdl_c".into(),
    kind: asset_compatibility::RepairKind::ModelRelocation,
  };
  warnings.clear();
  let checks = animation_contract::analyze(
    &resources,
    &BTreeMap::new(),
    &repaired,
    &[relocation],
    &mut warnings,
  );
  assert_eq!(
    checks.len(),
    1,
    "newly relocated model paths must be checked"
  );
  assert_eq!(checks[0].file_path, "models/relocated.vmdl_c");
  assert_eq!(checks[0].before.status, Status::NotChecked);
  assert_eq!(checks[0].after.status, Status::Verified);
  assert!(warnings.is_empty());
}

#[test]
fn bound_model_graph_cycles_terminate_and_shared_resources_are_counted_once() {
  let root = graph(&["animgraphs/nested.vnmgraph", "animations/test.vnmclip"]);
  let nested = graph(&["animgraphs/test.vnmgraph", "animations/test.vnmclip"]);
  let result = plan(
    &[
      ("animgraphs/test.vnmgraph_c", &root),
      ("animgraphs/nested.vnmgraph_c", &nested),
      ("animations/test.vnmclip_c", &clip(1)),
    ],
    &[],
  );
  assert_eq!(
    result.analysis.animation_checks[0].after.checked_resources,
    4
  );
}

#[test]
fn bound_model_unknown_layout_is_not_a_proven_animation_failure() {
  let result = plan(
    &[("animgraphs/test.vnmgraph_c", &compiled_resource(vec![]))],
    &[],
  );
  let check = &result.analysis.animation_checks[0];
  assert_eq!(check.after.status, Status::NotChecked);
  assert!(
    check
      .after
      .issues
      .iter()
      .all(|issue| issue.kind == Issue::NotChecked)
  );
  assert!(result.analysis.asset_warnings.is_empty());
}

fn check_rebuilt_model(bytes: &[u8]) -> Vec<animation_contract::AnimationDependencyCheck> {
  let root = tempfile::tempdir().unwrap();
  let citadel = root.path().join("citadel");
  fs::create_dir_all(&citadel).unwrap();
  pack(
    &citadel,
    "pak01",
    &[
      ("models/test.vnmskel_c", &skeleton()),
      ("animgraphs/test.vnmgraph_c", &graph(&[])),
    ],
  );
  let archive = pack(root.path(), "skin", &[("models/test.vmdl_c", &model())]);
  let resources = resources::ResourceSnapshot::open(
    &citadel,
    &[LocalizationModInput {
      mod_id: "skin".into(),
      vpks: vec![archive],
    }],
  )
  .unwrap();
  let models = BTreeMap::from([(
    "models/test.vmdl_c".into(),
    vec![CompiledDataSource {
      mod_id: "skin".into(),
      source_vpk: "skin_dir.vpk".into(),
      priority: 0,
      bytes: model(),
    }],
  )]);
  animation_contract::analyze(
    &resources,
    &models,
    &BTreeMap::from([("models/test.vmdl_c", bytes)]),
    &[],
    &mut Vec::new(),
  )
}

#[test]
fn unreadable_rebuilt_model_keeps_a_failed_postcondition() {
  let checks = check_rebuilt_model(b"truncated");
  assert_eq!(
    checks.len(),
    1,
    "an unreadable repair must not erase its check"
  );
  assert_eq!(checks[0].before.status, Status::Verified);
  assert_eq!(checks[0].after.status, Status::Unresolved);
  assert_eq!(checks[0].after.issues[0].kind, Issue::UnreadableResource);
}

#[test]
fn rebuilt_model_without_bindings_keeps_an_incomplete_postcondition() {
  let checks = check_rebuilt_model(&compiled_resource(vec![]));
  assert_eq!(
    checks.len(),
    1,
    "lost bindings must not erase an existing check"
  );
  assert_eq!(checks[0].before.status, Status::Verified);
  assert_eq!(checks[0].after.status, Status::NotChecked);
  assert_eq!(checks[0].after.issues[0].kind, Issue::NotChecked);
}

#[test]
fn selected_model_checks_the_winning_animation_even_when_its_owner_is_not_selected() {
  let root = tempfile::tempdir().unwrap();
  let citadel = root.path().join("citadel");
  fs::create_dir_all(&citadel).unwrap();
  pack(
    &citadel,
    "pak01",
    &[
      ("models/test.vmdl_c", &model()),
      ("models/test.vnmskel_c", &skeleton()),
      (
        "animgraphs/test.vnmgraph_c",
        &graph(&["animations/test.vnmclip"]),
      ),
    ],
  );
  let skin = pack(root.path(), "skin", &[("models/test.vmdl_c", &model())]);
  let good = pack(
    root.path(),
    "good",
    &[("animations/test.vnmclip_c", &clip(1))],
  );
  let bad = pack(
    root.path(),
    "bad",
    &[("animations/test.vnmclip_c", &clip(2))],
  );
  for (animations, expected) in [
    ([&bad, &good], Status::Unresolved),
    ([&good, &bad], Status::Verified),
  ] {
    let mut mods = vec![LocalizationModInput {
      mod_id: "skin".into(),
      vpks: vec![skin.clone()],
    }];
    mods.extend(
      animations
        .into_iter()
        .enumerate()
        .map(|(index, archive)| LocalizationModInput {
          mod_id: format!("animation-{index}"),
          vpks: vec![archive.clone()],
        }),
    );
    let plan =
      LocalizationOverlayPlan::build_selected(&citadel, &mods, &BTreeSet::from(["skin".into()]))
        .unwrap();
    assert_eq!(plan.analysis.animation_checks[0].after.status, expected);
    assert!(
      plan.animation_clips.is_empty(),
      "unselected animation files stay unchanged"
    );
  }
}
