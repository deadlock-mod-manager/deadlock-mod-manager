use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

use super::{ModdingRepairKind as Kind, history, scan, stock::Stock};

const TEMPLATE: &str = "// preserve this comment\r\nLayer0\r\n{\r\n shader \"csgo_environment.vfx\"\r\n g_vColorTint \"[1.000 1.000 1.000 0.000]\"\r\n TextureColor1 \"\"\r\n}\r\n";

fn put(root: &Path, path: &str, bytes: impl AsRef<[u8]>) {
  let file = root.join(path);
  std::fs::create_dir_all(file.parent().unwrap()).unwrap();
  std::fs::write(file, bytes).unwrap();
}

fn selected(scan: &scan::Scan) -> Vec<String> {
  scan
    .report
    .issues
    .iter()
    .filter(|issue| issue.repairable)
    .map(|issue| issue.id.clone())
    .collect()
}

#[test]
fn scans_are_read_only_repeatable_and_repairs_restore_exact_originals() {
  let root = tempfile::tempdir().unwrap();
  put(root.path(), "materials/costume.vmat", TEMPLATE);
  let before = scan::snapshot(root.path()).unwrap();
  let first = scan::scan(root.path(), &Stock::unavailable()).unwrap();
  assert_eq!(scan::snapshot(root.path()).unwrap(), before);
  assert!(!root.path().join(".dmm-history").exists());
  let second = scan::scan(root.path(), &Stock::unavailable()).unwrap();
  assert_eq!(first.report.fingerprint, second.report.fingerprint);
  assert_eq!(selected(&first), selected(&second));
  assert!(
    first
      .report
      .issues
      .iter()
      .any(|issue| issue.kind == Kind::EmptyTemplate)
  );
  let ids = selected(&first);
  let expected = first.report.fingerprint.clone();
  let result = super::apply(root.path(), first, &expected, ids).unwrap();
  let changed = std::fs::read_to_string(root.path().join("materials/costume.vmat")).unwrap();
  assert!(changed.contains("shader \"pbr.vfx\""));
  assert!(changed.contains("\"g_vColorTint1\""));
  assert!(changed.contains("// preserve this comment\r\n"));
  let again = scan::scan(root.path(), &Stock::unavailable()).unwrap();
  assert!(selected(&again).is_empty());
  assert!(
    again
      .report
      .issues
      .iter()
      .any(|issue| issue.kind == Kind::EmptyTemplate)
  );
  history::restore(root.path(), &result.backup_id).unwrap();
  assert_eq!(scan::snapshot(root.path()).unwrap(), before);
  assert_eq!(
    std::fs::read_to_string(root.path().join("materials/costume.vmat")).unwrap(),
    TEMPLATE
  );
  assert!(history::list(root.path()).unwrap()[0].restored);
  history::restore(root.path(), &result.backup_id).unwrap();
}

#[test]
fn only_verified_untextured_template_features_are_converted() {
  for extra in [
    "F_TRANSLUCENT \"1\"",
    "Unknown \"1\"",
    "DynamicParams {}",
    "TextureColor1 \"custom/color.png\"",
    "g_vColorTint1 \"[1 0 0 0]\"",
    "g_bSnowLayer1 \"1\"",
    "g_vTexCoordScale1 \"[2 2]\"",
  ] {
    let root = tempfile::tempdir().unwrap();
    let text = TEMPLATE.replacen("TextureColor1 \"\"", extra, 1);
    put(root.path(), "material.vmat", &text);
    let scan = scan::scan(root.path(), &Stock::unavailable()).unwrap();
    assert!(
      !scan
        .report
        .issues
        .iter()
        .any(|issue| issue.kind == Kind::ShaderConversion),
      "{extra}"
    );
    assert!(
      scan
        .report
        .issues
        .iter()
        .any(|issue| issue.kind == Kind::UnsupportedFeature),
      "{extra}"
    );
    assert_eq!(
      std::fs::read_to_string(root.path().join("material.vmat")).unwrap(),
      text
    );
  }
  let root = tempfile::tempdir().unwrap();
  put(
    root.path(),
    "material.vmat",
    TEMPLATE.replace("csgo_environment.vfx", "csgo_complex.vfx"),
  );
  let scan = scan::scan(root.path(), &Stock::unavailable()).unwrap();
  assert!(selected(&scan).is_empty());
  assert!(
    scan
      .report
      .issues
      .iter()
      .any(|issue| issue.kind == Kind::UnsupportedShader)
  );
}

#[test]
fn repairs_only_unambiguous_paths_and_handles_windows_separators_and_case() {
  let root = tempfile::tempdir().unwrap();
  put(
    root.path(),
    "models/hero/materials/Mask.PNG",
    b"custom mask",
  );
  put(
    root.path(),
    "materials/weapon.vmat",
    "\"Layer0\" { \"shader\" \"pbr.vfx\" \"TextureRimLightMask1\" \"materials\\default\\mask.png\" }",
  );
  let report = scan::scan(root.path(), &Stock::unavailable()).unwrap();
  let issue = report
    .report
    .issues
    .iter()
    .find(|issue| issue.kind == Kind::PathRepair)
    .unwrap();
  assert_eq!(
    issue.proposed.as_deref(),
    Some("models/hero/materials/Mask.PNG")
  );
  let result = super::apply(
    root.path(),
    scan::scan(root.path(), &Stock::unavailable()).unwrap(),
    &report.report.fingerprint,
    vec![issue.id.clone()],
  )
  .unwrap();
  assert!(
    std::fs::read_to_string(root.path().join("materials/weapon.vmat"))
      .unwrap()
      .contains("models/hero/materials/Mask.PNG")
  );
  assert_eq!(
    std::fs::read(root.path().join("models/hero/materials/Mask.PNG")).unwrap(),
    b"custom mask"
  );
  history::restore(root.path(), &result.backup_id).unwrap();
  put(root.path(), "another/mask.png", b"different custom mask");
  let report = scan::scan(root.path(), &Stock::unavailable()).unwrap();
  assert!(
    report
      .report
      .issues
      .iter()
      .any(|issue| issue.kind == Kind::AmbiguousPath && issue.targets.len() == 2)
  );
  assert!(selected(&report).is_empty());
}

#[test]
fn changing_any_source_or_candidate_invalidates_the_scan_before_writes() {
  let root = tempfile::tempdir().unwrap();
  put(root.path(), "material.vmat", TEMPLATE);
  let report = scan::scan(root.path(), &Stock::unavailable()).unwrap();
  let expected = report.report.fingerprint.clone();
  let ids = selected(&report);
  put(
    root.path(),
    "new-custom-file.png",
    b"new dependency candidate",
  );
  assert!(super::apply(root.path(), report, &expected, ids.clone()).is_err());
  let report = scan::scan(root.path(), &Stock::unavailable()).unwrap();
  assert!(super::apply(root.path(), report, &expected, ids).is_err());
  assert_eq!(
    std::fs::read_to_string(root.path().join("material.vmat")).unwrap(),
    TEMPLATE
  );
  assert!(!root.path().join(".dmm-history").exists());
}

#[test]
fn restoring_preserves_newer_edits_and_tracks_created_stock_sidecars() {
  let root = tempfile::tempdir().unwrap();
  put(root.path(), "material.vmat", TEMPLATE);
  let original = std::fs::read(root.path().join("material.vmat")).unwrap();
  let result = history::commit(
    root.path(),
    BTreeMap::from([
      ("material.vmat".into(), b"repaired material".to_vec()),
      ("models/hero/rig.vnmskel".into(), b"stock skeleton".to_vec()),
      ("models/hero/rig.dmx".into(), b"stock sidecar".to_vec()),
    ]),
  )
  .unwrap();
  put(root.path(), "material.vmat", b"new custom artwork");
  assert!(history::restore(root.path(), &result.backup_id).is_err());
  assert!(root.path().join("models/hero/rig.vnmskel").exists());
  assert_eq!(
    std::fs::read(root.path().join("material.vmat")).unwrap(),
    b"new custom artwork"
  );
  put(root.path(), "material.vmat", b"repaired material");
  history::restore(root.path(), &result.backup_id).unwrap();
  assert_eq!(
    std::fs::read(root.path().join("material.vmat")).unwrap(),
    original
  );
  assert!(!root.path().join("models/hero/rig.vnmskel").exists());
  assert!(!root.path().join("models/hero/rig.dmx").exists());
}

#[test]
fn user_selection_applies_only_selected_repairs_and_rejects_forged_ids() {
  let root = tempfile::tempdir().unwrap();
  put(root.path(), "one.vmat", TEMPLATE);
  put(root.path(), "two.vmat", TEMPLATE);
  let report = scan::scan(root.path(), &Stock::unavailable()).unwrap();
  let ids = selected(&report);
  assert_eq!(ids.len(), 2);
  assert!(report.changes(&BTreeSet::from(["forged".into()])).is_err());
  let result = super::apply(
    root.path(),
    scan::scan(root.path(), &Stock::unavailable()).unwrap(),
    &report.report.fingerprint,
    vec![ids[0].clone()],
  )
  .unwrap();
  assert_eq!(result.files.len(), 1);
  assert_eq!(
    selected(&scan::scan(root.path(), &Stock::unavailable()).unwrap()).len(),
    1
  );
}

#[test]
fn reports_missing_custom_assets_and_fbx_textures_without_rewriting_fbx() {
  let root = tempfile::tempdir().unwrap();
  put(
    root.path(),
    "hero.vmdl",
    "{ material = \"models/custom/missing.vmat\" }",
  );
  let fbx = "FileName: \"C:\\Artist\\Custom\\paint.png\"\nRelativeFilename: \"paint.png\"\n";
  put(root.path(), "mesh.fbx", fbx);
  let report = scan::scan(root.path(), &Stock::unavailable()).unwrap();
  assert!(
    report
      .report
      .issues
      .iter()
      .any(|issue| issue.kind == Kind::MissingDependency)
  );
  assert!(
    report
      .report
      .issues
      .iter()
      .any(|issue| issue.kind == Kind::ExternalFbxTexture && issue.current.starts_with("C:"))
  );
  assert!(selected(&report).is_empty());
  assert_eq!(
    std::fs::read_to_string(root.path().join("mesh.fbx")).unwrap(),
    fbx
  );
  assert!(super::fbx::textures(b"Kaydara FBX Binary  \0\x1a\0").is_err());
}

#[test]
fn rejects_traversal_and_corrupt_backups() {
  let root = tempfile::tempdir().unwrap();
  assert!(history::restore(root.path(), "../outside").is_err());
  assert!(
    history::commit(
      root.path(),
      BTreeMap::from([("../outside".into(), vec![1])])
    )
    .is_err()
  );
  put(root.path(), "material.vmat", TEMPLATE);
  let result = history::commit(
    root.path(),
    BTreeMap::from([("material.vmat".into(), b"after".to_vec())]),
  )
  .unwrap();
  put(
    root.path(),
    &format!(".dmm-history/{}/0", result.backup_id),
    b"corrupt backup",
  );
  assert!(history::restore(root.path(), &result.backup_id).is_err());
  assert_eq!(
    std::fs::read(root.path().join("material.vmat")).unwrap(),
    b"after"
  );
}

#[test]
#[ignore = "requires DMM_REPAIR_FIXTURE pointing to the locally extracted tester addon"]
fn supplied_addon_scan_apply_rescan_restore() {
  let source = std::env::var("DMM_REPAIR_FIXTURE").expect("set DMM_REPAIR_FIXTURE");
  let root = tempfile::tempdir().unwrap();
  super::super::modding_import::publish_missing(Path::new(&source), root.path()).unwrap();
  let before = scan::snapshot(root.path()).unwrap();
  let stock = Stock::unavailable();
  let report = scan::scan(root.path(), &stock).unwrap();
  let conversions = report
    .report
    .issues
    .iter()
    .filter(|issue| issue.kind == Kind::ShaderConversion)
    .count();
  let fbx = report
    .report
    .issues
    .iter()
    .filter(|issue| issue.kind == Kind::ExternalFbxTexture)
    .count();
  let paths = report
    .report
    .issues
    .iter()
    .filter(|issue| issue.kind == Kind::PathRepair)
    .count();
  println!(
    "Supplied addon: {conversions} shader conversions, {paths} path repairs, {fbx} external FBX texture references"
  );
  assert_eq!(conversions, 13);
  assert!(paths >= 1);
  assert!(fbx > 0);
  let expected = report.report.fingerprint.clone();
  let ids = selected(&report);
  let result = super::apply(root.path(), report, &expected, ids).unwrap();
  let after = scan::scan(root.path(), &stock).unwrap();
  assert!(selected(&after).is_empty());
  assert!(
    after
      .report
      .issues
      .iter()
      .any(|issue| issue.current.ends_with("violet_halloween_green_02.vmat"))
  );
  assert!(
    after
      .report
      .issues
      .iter()
      .any(|issue| issue.current.ends_with("violet_halloween_wood.vmat"))
  );
  history::restore(root.path(), &result.backup_id).unwrap();
  assert_eq!(scan::snapshot(root.path()).unwrap(), before);
}

#[test]
#[ignore = "requires DMM_REPAIR_FIXTURE, DMM_REPAIR_ARCHIVE, DMM_REPAIR_SDK and DMM_REPAIR_S2V"]
fn supplied_addon_stock_recovery_round_trip() {
  use super::super::{modding_tools::ModdingToolsConfig, modding_workspace::ModdingAddon};
  let source = std::env::var("DMM_REPAIR_FIXTURE").unwrap();
  let root = tempfile::tempdir().unwrap();
  super::super::modding_import::publish_missing(Path::new(&source), root.path()).unwrap();
  let before = scan::snapshot(root.path()).unwrap();
  let sdk = std::env::var("DMM_REPAIR_SDK").unwrap();
  let addon = ModdingAddon {
    id: "fixture".into(),
    name: "fixture".into(),
    sdk_root: sdk.clone(),
    content_path: root.path().to_string_lossy().into_owned(),
    game_path: String::new(),
    archive_path: std::env::var("DMM_REPAIR_ARCHIVE").unwrap(),
  };
  let config = ModdingToolsConfig {
    prepared_sdk: sdk,
    ..Default::default()
  };
  let stock = Stock::open(
    &addon,
    &config,
    Path::new(&std::env::var("DMM_REPAIR_S2V").unwrap()),
  );
  let report = scan::scan(root.path(), &stock).unwrap();
  println!(
    "Stock recovery diagnostics: {:?}",
    report.report.diagnostics
  );
  let stock_issues = report
    .report
    .issues
    .iter()
    .filter(|issue| issue.kind == Kind::StockDependency)
    .collect::<Vec<_>>();
  for issue in &stock_issues {
    println!("Stock export {} -> {:?}", issue.current, issue.targets);
  }
  assert!(stock_issues.iter().any(|issue| {
    issue.targets.iter().any(|path| path.ends_with(".vnmskel"))
      && issue.targets.iter().any(|path| path.ends_with(".dmx"))
  }));
  let expected = report.report.fingerprint.clone();
  let ids = selected(&report);
  let repeat = scan::scan(root.path(), &stock).unwrap();
  assert_eq!(
    expected, repeat.report.fingerprint,
    "Stock exports must yield repeatable plans"
  );
  let result = super::apply(root.path(), repeat, &expected, ids.clone()).unwrap();
  let after = scan::scan(root.path(), &stock).unwrap();
  let completed: BTreeSet<_> = ids.into_iter().collect();
  let remaining = selected(&after);
  assert!(
    remaining.iter().all(|id| !completed.contains(id)),
    "Completed repairs must not recur; stock graphs can expose additional dependencies"
  );
  assert!(
    !after
      .report
      .issues
      .iter()
      .any(|issue| issue.kind == Kind::ShaderConversion)
  );
  println!(
    "Re-scan: {} newly exposed repairs; no completed repair proposed again",
    remaining.len()
  );
  history::restore(root.path(), &result.backup_id).unwrap();
  assert_eq!(scan::snapshot(root.path()).unwrap(), before);

  let skeleton = stock_issues
    .iter()
    .find(|issue| issue.current.ends_with(".vnmskel"))
    .unwrap();
  let sidecar = skeleton
    .targets
    .iter()
    .find(|path| path.ends_with(".dmx"))
    .unwrap();
  let preserved = tempfile::tempdir().unwrap();
  put(preserved.path(), sidecar, b"custom skeleton source");
  put(
    preserved.path(),
    "clip.vnmclip",
    format!("{{ skeleton = \"{}\" }}", skeleton.current),
  );
  let report = scan::scan(preserved.path(), &stock).unwrap();
  let repair = report
    .report
    .issues
    .iter()
    .find(|issue| issue.kind == Kind::StockDependency)
    .unwrap();
  assert!(
    !repair.targets.contains(sidecar),
    "Existing custom sidecars must not be replaced"
  );
  let expected = report.report.fingerprint.clone();
  let id = repair.id.clone();
  let result = super::apply(preserved.path(), report, &expected, vec![id]).unwrap();
  assert_eq!(
    std::fs::read(preserved.path().join(sidecar)).unwrap(),
    b"custom skeleton source"
  );
  history::restore(preserved.path(), &result.backup_id).unwrap();
  assert_eq!(
    std::fs::read(preserved.path().join(sidecar)).unwrap(),
    b"custom skeleton source"
  );
}
