use super::resources::tests::pack;
use super::tests::compiled_resource;
use super::*;

const TEXT_PATH: &str = "resource/localization/safe_english.txt";
const BASE_TEXT: &[u8] =
  b"\"lang\" { \"Language\" \"English\" \"Tokens\" { \"X\" \"Vanilla\" \"Y\" \"Current\" } }";
const MOD_TEXT: &[u8] = b"\"lang\" { \"Language\" \"English\" \"Tokens\" { \"X\" \"Authored\" } }";

fn raw_vpk(root: &Path, name: &str, entries: &[(&str, &[u8])]) -> PathBuf {
  let mut groups = BTreeMap::new();
  for (path, bytes) in entries {
    let (directory, file) = path.rsplit_once('/').unwrap();
    let (stem, extension) = file.rsplit_once('.').unwrap();
    groups
      .entry(extension)
      .or_insert_with(BTreeMap::new)
      .entry(directory)
      .or_insert_with(Vec::new)
      .push((stem, bytes));
  }
  let mut tree = Vec::new();
  let mut data = Vec::new();
  for (extension, directories) in groups {
    tree.extend_from_slice(extension.as_bytes());
    tree.push(0);
    for (directory, files) in directories {
      tree.extend_from_slice(directory.as_bytes());
      tree.push(0);
      for (stem, bytes) in files {
        tree.extend_from_slice(stem.as_bytes());
        tree.push(0);
        tree.extend_from_slice(&0u32.to_le_bytes());
        tree.extend_from_slice(&0u16.to_le_bytes());
        tree.extend_from_slice(&0x7fffu16.to_le_bytes());
        tree.extend_from_slice(&u32::try_from(data.len()).unwrap().to_le_bytes());
        tree.extend_from_slice(&u32::try_from(bytes.len()).unwrap().to_le_bytes());
        tree.extend_from_slice(&0xffffu16.to_le_bytes());
        data.extend_from_slice(bytes);
      }
      tree.push(0);
    }
    tree.push(0);
  }
  tree.push(0);
  let mut archive = Vec::new();
  archive.extend_from_slice(&0x55aa1234u32.to_le_bytes());
  archive.extend_from_slice(&1u32.to_le_bytes());
  archive.extend_from_slice(&u32::try_from(tree.len()).unwrap().to_le_bytes());
  archive.extend(tree);
  archive.extend(data);
  let path = root.join(format!("{name}_dir.vpk"));
  fs::write(&path, archive).unwrap();
  path
}

#[test]
fn traversal_localization_is_warned_and_valid_text_is_still_applied() {
  let root = tempfile::tempdir().unwrap();
  let citadel = root.path().join("citadel");
  fs::create_dir_all(&citadel).unwrap();
  pack(&citadel, "pak01", &[(TEXT_PATH, BASE_TEXT)]);
  let escaped_name = format!(
    "{}-escaped.txt",
    root.path().file_name().unwrap().to_str().unwrap()
  )
  .to_ascii_lowercase();
  let unsafe_path = format!("resource/localization/../../../{escaped_name}");
  let escaped = std::env::temp_dir().join(escaped_name);
  assert!(!escaped.exists());
  let input = LocalizationModInput {
    mod_id: "mixed".into(),
    vpks: vec![raw_vpk(
      root.path(),
      "mixed",
      &[(&unsafe_path, MOD_TEXT), (TEXT_PATH, MOD_TEXT)],
    )],
  };
  assert_eq!(
    localization_paths(std::slice::from_ref(&input)).unwrap(),
    BTreeSet::from([TEXT_PATH.into()])
  );
  assert!(has_checkable_resources(&input).unwrap());
  let plan = LocalizationOverlayPlan::build(&citadel, &[input]).unwrap();
  assert_eq!(plan.analysis.parse_warnings.len(), 1);
  let warning = &plan.analysis.parse_warnings[0];
  assert_eq!(warning.mod_id, "mixed");
  assert_eq!(warning.file_path, unsafe_path);
  assert!(
    warning
      .error
      .as_deref()
      .unwrap()
      .contains("unsafe resource path")
  );
  let output = root.path().join("overlay_dir.vpk");
  assert_eq!(plan.write(&output, &[]).unwrap().packed_files, 1);
  let archive = VpkArchive::open(&output).unwrap();
  assert_eq!(archive.list_entries(), [TEXT_PATH]);
  let text =
    parse_localization_bytes(&archive.extract_entry(TEXT_PATH).unwrap(), TEXT_PATH).unwrap();
  assert_eq!(text.file.tokens["X"], "Authored");
  assert_eq!(text.file.tokens["Y"], "Current");
  assert!(!escaped.exists());
}

#[test]
fn traversal_compiled_data_is_skipped_and_valid_table_is_still_applied() {
  let root = tempfile::tempdir().unwrap();
  let citadel = root.path().join("citadel");
  fs::create_dir_all(&citadel).unwrap();
  let path = "scripts/safe.vdata_c";
  let base = compiled_resource(vec![
    ("row".into(), Kv3Value::Int(1)),
    ("current".into(), Kv3Value::Int(3)),
  ]);
  let authored = compiled_resource(vec![("row".into(), Kv3Value::Int(2))]);
  pack(&citadel, "pak01", &[(path, &base)]);
  let escaped_name = format!(
    "{}-escaped.vdata_c",
    root.path().file_name().unwrap().to_str().unwrap()
  )
  .to_ascii_lowercase();
  let unsafe_path = format!("scripts/../../{escaped_name}");
  let escaped = std::env::temp_dir().join(escaped_name);
  assert!(!escaped.exists());
  let input = LocalizationModInput {
    mod_id: "mixed".into(),
    vpks: vec![raw_vpk(
      root.path(),
      "mixed",
      &[(&unsafe_path, &authored), (path, &authored)],
    )],
  };
  let snapshot = resources::ResourceSnapshot::open(&citadel, std::slice::from_ref(&input)).unwrap();
  assert!(snapshot.provider(&unsafe_path).is_none());
  assert!(snapshot.game_bytes(&unsafe_path).unwrap().is_none());
  assert_eq!(snapshot.mod_paths().cloned().collect::<Vec<_>>(), [path]);
  let plan = LocalizationOverlayPlan::build(&citadel, &[input]).unwrap();
  assert_eq!(plan.compiled_data.len(), 1);
  assert_eq!(plan.compiled_data[0].file_path, path);
  let output = root.path().join("overlay_dir.vpk");
  assert_eq!(plan.write(&output, &[]).unwrap().packed_files, 1);
  let archive = VpkArchive::open(&output).unwrap();
  assert_eq!(archive.list_entries(), [path]);
  let (_, merged, _) = decode_compiled_data(&archive.extract_entry(path).unwrap(), path).unwrap();
  assert_eq!(merged.get("row"), Some(&Kv3Value::Int(2)));
  assert_eq!(merged.get("current"), Some(&Kv3Value::Int(3)));
  assert!(!escaped.exists());
}

#[test]
fn unsafe_entries_protect_nothing_and_are_not_checkable() {
  let root = tempfile::tempdir().unwrap();
  let entries: Vec<_> = [
    "resource/localization/../bad.txt",
    "scripts/../bad.vdata_c",
    "models/../bad.vnmskel_c",
    "models/../bad.vmdl_c",
    "models/../bad.vmesh_c",
    "materials/../bad.vmat_c",
    "panorama/../bad.vxml_c",
  ]
  .into_iter()
  .map(|path| (path, MOD_TEXT))
  .collect();
  let input = LocalizationModInput {
    mod_id: "unsafe".into(),
    vpks: vec![raw_vpk(root.path(), "unsafe", &entries)],
  };
  assert!(
    localization_paths(std::slice::from_ref(&input))
      .unwrap()
      .is_empty()
  );
  assert!(!has_checkable_resources(&input).unwrap());
  let snapshot =
    resources::ResourceSnapshot::open(root.path(), std::slice::from_ref(&input)).unwrap();
  assert_eq!(snapshot.mod_paths().count(), 0);
  let scope =
    repair_scope::RepairScope::new(std::slice::from_ref(&input), &BTreeSet::new(), &snapshot);
  for (path, _) in &entries {
    assert!(!scope.protects(path));
  }
  let plan = LocalizationOverlayPlan::build(root.path(), &[input]).unwrap();
  assert!(plan.analysis.protected_resources.is_empty());
  assert!(plan.compiled_data.is_empty());
  assert!(plan.animation_skeletons.is_empty());
  assert!(plan.camera_models.is_empty());
  assert!(plan.material_assets.is_empty());
  assert!(
    !plan
      .write(&root.path().join("overlay_dir.vpk"), &[])
      .unwrap()
      .has_overlay
  );
}

#[test]
fn staging_rechecks_paths_before_creating_directories_or_files() {
  let root = tempfile::tempdir().unwrap();
  let workspace = root.path().join("workspace");
  for path in [
    "../escaped.txt",
    "scripts/../../escaped.vdata_c",
    "models/../../escaped.vmdl_c",
    "a//b",
    "a/NUL.txt",
    "a/file:stream",
  ] {
    assert!(
      write_staged_resource(&workspace, path, b"rejected").is_err(),
      "{path}"
    );
    assert!(!workspace.exists());
    assert!(!root.path().join("escaped.txt").exists());
    assert!(!root.path().join("escaped.vdata_c").exists());
    assert!(!root.path().join("escaped.vmdl_c").exists());
  }
  write_staged_resource(&workspace, "Models\\Hero.vmdl_c", b"accepted").unwrap();
  assert_eq!(
    fs::read(workspace.join("Models/Hero.vmdl_c")).unwrap(),
    b"accepted"
  );
}
