use super::*;
use std::time::Instant;

#[derive(Deserialize)]
struct Input {
  mod_id: String,
  vpks: Vec<PathBuf>,
}

#[test]
#[ignore = "requires DMM_REAL_CITADEL, DMM_PROFILE_INPUTS and DMM_PROFILE_REPORT"]
fn profile_compatibility_benchmark() {
  let citadel = PathBuf::from(std::env::var("DMM_REAL_CITADEL").unwrap());
  let inputs: Vec<Input> =
    serde_json::from_slice(&fs::read(std::env::var("DMM_PROFILE_INPUTS").unwrap()).unwrap())
      .unwrap();
  let mods: Vec<_> = inputs
    .into_iter()
    .map(|input| LocalizationModInput {
      mod_id: input.mod_id,
      vpks: input.vpks,
    })
    .collect();
  let mut reports = Vec::new();
  assert!(!mods.is_empty(), "the benchmark needs at least one mod");
  for count in BTreeSet::from([1, 2.min(mods.len()), mods.len()]) {
    let started = Instant::now();
    let plan = LocalizationOverlayPlan::build(&citadel, &mods[..count]).unwrap();
    let elapsed = started.elapsed().as_millis();
    println!("combined {count}: {elapsed}ms");
    reports.push(serde_json::json!({"mode":"combined", "count":count,
      "elapsedMs":elapsed, "analysis":plan.analysis}));
  }
  let started = Instant::now();
  let game = Arc::new(GameIndex::open(&citadel).unwrap());
  let mut observed = VdataHistoryIndex::default();
  let mut recorded = BTreeSet::new();
  for input in &mods {
    let start = Instant::now();
    let (plan, _) = LocalizationOverlayPlan::build_standalone(
      &game,
      input.clone(),
      &mut observed,
      None,
      &mut recorded,
    )
    .unwrap();
    let elapsed = start.elapsed().as_millis();
    println!("standalone {}: {elapsed}ms", input.mod_id);
    reports.push(
      serde_json::json!({"mode":"standalone", "modId":input.mod_id,
      "elapsedMs":elapsed, "analysis":plan.analysis}),
    );
  }
  reports.push(
    serde_json::json!({"mode":"standalone-total", "count":mods.len(),
    "elapsedMs":started.elapsed().as_millis()}),
  );
  fs::write(
    std::env::var("DMM_PROFILE_REPORT").unwrap(),
    serde_json::to_vec_pretty(&reports).unwrap(),
  )
  .unwrap();
}

#[test]
#[ignore = "requires DMM_REAL_CITADEL, DMM_JOSUKE_VPK and DMM_SUIT_SHIV_VPK"]
fn shiv_pair_reports_foreign_animation_dependency_but_each_skin_alone_does_not() {
  let citadel = PathBuf::from(std::env::var("DMM_REAL_CITADEL").unwrap());
  let mods: Vec<_> = [
    ("679331", "DMM_JOSUKE_VPK"),
    ("710352", "DMM_SUIT_SHIV_VPK"),
  ]
  .into_iter()
  .map(|(id, env)| LocalizationModInput {
    mod_id: id.into(),
    vpks: vec![PathBuf::from(std::env::var(env).unwrap())],
  })
  .collect();
  let pair = LocalizationOverlayPlan::build(&citadel, &mods).unwrap();
  assert!(
    pair
      .analysis
      .asset_warnings
      .iter()
      .any(|warning| warning.mod_id == "679331"
        && matches!(
          warning.kind,
          asset_compatibility::WarningKind::OverlappingModel
        )
        && warning.detail.contains("710352")
        && warning.detail.contains("changed animation dependencies")),
    "the overlap warning must explain Suit Shiv's original animation dependency"
  );
  for single in [&mods[..1], &mods[1..]] {
    let plan = LocalizationOverlayPlan::build(&citadel, single).unwrap();
    assert!(
      !plan
        .analysis
        .asset_warnings
        .iter()
        .any(|warning| warning.detail.contains("another mod"))
    );
  }
}
