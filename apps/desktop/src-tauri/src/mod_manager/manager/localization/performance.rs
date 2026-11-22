//! Opt-in measurements against an isolated profile backed by installed game archives.
use super::*;
use std::time::Instant;

#[test]
#[ignore = "requires DMM_REAL_CITADEL, DMM_PERF_CASES and DMM_PERF_REPORT"]
fn measure_real_profile_merge_and_apply() {
  use std::os::unix::fs::symlink;

  #[derive(Deserialize)]
  struct Case {
    id: u32,
    archive: PathBuf,
    sha256: String,
    vpks: Vec<PathBuf>,
  }

  let installed = PathBuf::from(std::env::var("DMM_REAL_CITADEL").unwrap());
  let cases: Vec<Case> =
    serde_json::from_slice(&fs::read(std::env::var("DMM_PERF_CASES").unwrap()).unwrap()).unwrap();
  let temp = tempfile::tempdir().unwrap();
  let mut manager = super::tests::test_manager(temp.path());
  let citadel = manager.citadel_path().unwrap();
  for name in ["citadel", "core"] {
    let source = installed.with_file_name(name);
    let target = citadel.with_file_name(name);
    fs::create_dir_all(&target).unwrap();
    for entry in fs::read_dir(source).unwrap() {
      let path = entry.unwrap().path();
      let filename = path.file_name().unwrap();
      if path.extension().is_some_and(|extension| extension == "vpk")
        || filename == "steam.inf"
        || [
          "resource",
          "scripts",
          "models",
          "materials",
          "animations",
          "animgraphs",
        ]
        .iter()
        .any(|name| filename == *name)
      {
        symlink(&path, target.join(filename)).unwrap();
      }
    }
  }
  let base = manager.get_addons_path(None).unwrap();
  fs::create_dir_all(&base).unwrap();
  let mut manifest = ProfileVpkManifest::default();
  for (index, case) in cases.iter().enumerate() {
    assert_eq!(
      hex::encode(Sha256::digest(fs::read(&case.archive).unwrap())),
      case.sha256
    );
    assert_eq!(case.vpks.len(), 1, "use single-VPK fixtures");
    let filename = format!("pak{:02}_dir.vpk", index + 1);
    fs::copy(&case.vpks[0], base.join(&filename)).unwrap();
    let id = case.id.to_string();
    manifest.mark_enabled(
      &id,
      vec![filename],
      vec![],
      Some(index as u32),
      ShardIndex::FIRST,
    );
    manifest.mods.get_mut(&id).unwrap().compatibility_enabled = true;
  }
  manifest.save(&base).unwrap();
  let started = Instant::now();
  let (_, inputs, mut key) = manager.localization_overlay_inputs(None).unwrap();
  let input_ms = started.elapsed().as_secs_f64() * 1000.0;
  let started = Instant::now();
  let plan = build_overlay_plan(&citadel, &inputs, &mut key, &|_| {}).unwrap();
  let analysis_ms = started.elapsed().as_secs_f64() * 1000.0;
  assert!(!requires_review(&plan.analysis));
  let analysis = serde_json::to_value(&plan.analysis).unwrap();
  let started = Instant::now();
  receipt::write(&plan, key, &[]).unwrap();
  let apply_ms = started.elapsed().as_secs_f64() * 1000.0;
  let output = manager.localization_overlay_vpk_path(None).unwrap();
  let expected = fs::read(&output).unwrap();
  let findings = || {
    let mut receipt = serde_json::to_value(receipt::load(&output).unwrap().unwrap()).unwrap();
    // Library edits change input stamps, but every saved repair and diagnostic
    // should agree with the cold analysis when the effective model data is unchanged.
    receipt.as_object_mut().unwrap().remove("key");
    receipt
  };
  let expected_findings = findings();
  let mut cached_ms = Vec::new();
  let mut changed_ms = Vec::new();
  for iteration in 0..3 {
    let started = Instant::now();
    manager
      .prepare_localization_overlay_with_progress(None, true, || {
        panic!("cache miss on unchanged inputs")
      })
      .unwrap();
    cached_ms.push(started.elapsed().as_secs_f64() * 1000.0);
    super::tests::write_vpk(
      &base.join("pak50_dir.vpk"),
      &[("sounds/unrelated.vsnd_c", &[iteration])],
    );
    manifest.mark_enabled(
      "unrelated",
      vec!["pak50_dir.vpk".into()],
      vec![],
      Some(50),
      ShardIndex::FIRST,
    );
    manifest.save(&base).unwrap();
    let started = Instant::now();
    manager.invalidate_localization_overlay(None);
    super::tests::refresh_repairs(&mut manager, None).unwrap();
    changed_ms.push(started.elapsed().as_secs_f64() * 1000.0);
    assert_eq!(
      fs::read(&output).unwrap(),
      expected,
      "unrelated edits must preserve repair bytes"
    );
    assert_eq!(findings(), expected_findings);
    let (_, _, key) = manager.localization_overlay_inputs(None).unwrap();
    assert!(
      receipt::load(&output)
        .unwrap()
        .unwrap()
        .is_current(&key)
        .unwrap()
    );
  }
  let report = serde_json::json!({
    "inputMs": input_ms, "analysisMs": analysis_ms, "applyMs": apply_ms,
    "cachedMs": cached_ms, "changedMs": changed_ms, "analysis": analysis,
    "overlaySha256": hex::encode(Sha256::digest(&expected)), "overlayBytes": expected.len(),
  });
  fs::write(
    std::env::var("DMM_PERF_REPORT").unwrap(),
    serde_json::to_vec_pretty(&report).unwrap(),
  )
  .unwrap();
  if let Some(path) = history::path(&citadel) {
    fs::remove_file(&path).unwrap();
    fs::remove_dir(path.parent().unwrap()).unwrap();
  }
}
