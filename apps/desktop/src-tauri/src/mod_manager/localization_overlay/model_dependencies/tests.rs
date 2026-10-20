use super::super::{resources::tests::pack, tests::compiled_resource};
use super::*;
use std::fs;

const MODEL: &str = "models/example/hero.vmdl_c";
const SKELETON: &str = "models/example/hero.vnmskel_c";
const GRAPH: &str = "models/example/hero.vnmgraph_c";

fn refs(field: &str, names: &[&str]) -> Vec<u8> {
  compiled_resource(vec![(
    field.into(),
    Kv3Value::Array(
      names
        .iter()
        .map(|name| Kv3Value::String((*name).into()))
        .collect(),
    ),
  )])
}

#[test]
fn follows_selected_model_dependencies_without_matching_hero_names() {
  let temp = tempfile::tempdir().unwrap();
  let citadel = temp.path().join("citadel");
  fs::create_dir_all(&citadel).unwrap();
  let model = refs("m_vecNmSkeletonRefs", &[SKELETON]);
  let game = compiled_resource(vec![("layout".into(), Kv3Value::Int(1))]);
  let changed = compiled_resource(vec![("layout".into(), Kv3Value::Int(2))]);
  pack(&citadel, "pak01", &[(SKELETON, &game)]);
  let first = LocalizationModInput {
    mod_id: "skin-a".into(),
    vpks: vec![pack(temp.path(), "skin-a", &[(MODEL, &model)])],
  };
  let second = LocalizationModInput {
    mod_id: "skin-b".into(),
    vpks: vec![pack(
      temp.path(),
      "skin-b",
      &[(MODEL, &model), (SKELETON, &changed)],
    )],
  };
  let unrelated = LocalizationModInput {
    mod_id: "other-hero".into(),
    vpks: vec![pack(
      temp.path(),
      "other",
      &[("models/other/hero.vnmskel_c", &changed)],
    )],
  };
  let resources = ResourceSnapshot::open(
    &citadel,
    &[first.clone(), second.clone(), unrelated.clone()],
  )
  .unwrap();
  assert_eq!(
    mixed_animation_dependencies(&resources, &first, MODEL).unwrap(),
    vec![MixedDependency {
      path: SKELETON.into(),
      mod_id: second.mod_id.clone()
    }]
  );
  let plan =
    super::super::LocalizationOverlayPlan::build(&citadel, &[first.clone(), second.clone()])
      .unwrap();
  assert!(plan.analysis.asset_warnings.iter().any(|warning| {
    warning.detail.contains("changed animation dependencies") && warning.detail.contains(SKELETON)
  }));
  for mods in [
    vec![first.clone(), unrelated],
    vec![second.clone(), first.clone()],
  ] {
    let resources = ResourceSnapshot::open(&citadel, &mods).unwrap();
    assert!(
      mixed_animation_dependencies(&resources, &mods[0], MODEL)
        .unwrap()
        .is_empty()
    );
  }
}

#[test]
fn identical_game_or_authored_dependencies_do_not_warn() {
  let temp = tempfile::tempdir().unwrap();
  let citadel = temp.path().join("citadel");
  fs::create_dir_all(&citadel).unwrap();
  let model = refs("m_vecNmSkeletonRefs", &[SKELETON]);
  let skeleton = compiled_resource(vec![("layout".into(), Kv3Value::Int(1))]);
  pack(&citadel, "pak01", &[(SKELETON, &skeleton)]);
  for bundled in [false, true] {
    let skeleton = if bundled {
      compiled_resource(vec![("layout".into(), Kv3Value::Int(2))])
    } else {
      skeleton.clone()
    };
    let entries = if bundled {
      vec![(MODEL, model.as_slice()), (SKELETON, skeleton.as_slice())]
    } else {
      vec![(MODEL, model.as_slice())]
    };
    let owner = LocalizationModInput {
      mod_id: "owner".into(),
      vpks: vec![pack(temp.path(), "owner", &entries)],
    };
    let dependency = LocalizationModInput {
      mod_id: "dependency".into(),
      vpks: vec![pack(temp.path(), "dependency", &[(SKELETON, &skeleton)])],
    };
    let resources = ResourceSnapshot::open(&citadel, &[dependency, owner.clone()]).unwrap();
    assert!(
      mixed_animation_dependencies(&resources, &owner, MODEL)
        .unwrap()
        .is_empty()
    );
  }
}

#[test]
fn follows_nested_graphs_and_terminates_cycles() {
  let temp = tempfile::tempdir().unwrap();
  let citadel = temp.path().join("citadel");
  fs::create_dir_all(&citadel).unwrap();
  let model = compiled_resource(vec![(
    "m_animGraph2Refs".into(),
    Kv3Value::Array(vec![Kv3Value::Object(vec![(
      "m_hGraph".into(),
      Kv3Value::String(GRAPH.into()),
    )])]),
  )]);
  let graph = refs("m_resources", &[GRAPH, SKELETON]);
  let skeleton = compiled_resource(vec![]);
  pack(&citadel, "pak01", &[(GRAPH, &graph)]);
  let owner = LocalizationModInput {
    mod_id: "owner".into(),
    vpks: vec![pack(temp.path(), "owner", &[(MODEL, &model)])],
  };
  let dependency = LocalizationModInput {
    mod_id: "dependency".into(),
    vpks: vec![pack(temp.path(), "dependency", &[(SKELETON, &skeleton)])],
  };
  let resources = ResourceSnapshot::open(&citadel, &[owner.clone(), dependency]).unwrap();
  let mixed = mixed_animation_dependencies(&resources, &owner, MODEL).unwrap();
  assert_eq!(
    mixed,
    vec![MixedDependency {
      path: SKELETON.into(),
      mod_id: "dependency".into()
    }]
  );
}
