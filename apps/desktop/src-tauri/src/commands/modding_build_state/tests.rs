use super::*;

struct Project {
  directory: tempfile::TempDir,
  addon: ModdingAddon,
}

impl Project {
  fn new() -> Self {
    let directory = tempfile::tempdir().unwrap();
    for name in ["content", "game"] {
      std::fs::create_dir(directory.path().join(name)).unwrap();
    }
    let addon = ModdingAddon {
      id: "fixture".into(),
      name: "fixture".into(),
      sdk_root: String::new(),
      archive_path: String::new(),
      content_path: directory.path().join("content").to_string_lossy().into(),
      game_path: directory.path().join("game").to_string_lossy().into(),
    };
    Self { directory, addon }
  }

  fn write(&self, path: &str, bytes: &[u8]) {
    let path = self.directory.path().join(path);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, bytes).unwrap();
  }

  fn root(&self) -> &Path {
    Path::new(&self.addon.content_path)
  }
  fn inputs(&self, paths: &[&str]) -> Vec<PathBuf> {
    paths.iter().map(|path| self.root().join(path)).collect()
  }
}

#[test]
fn appearance_patches_do_not_schedule_an_unchanged_model_or_its_animation() {
  let project = Project::new();
  project.write("content/models/hero.vmdl", b"{ mesh=\"models/hero.dmx\" }");
  project.write("content/models/hero.dmx", b"mesh bytes");
  project.write(
    "content/clips/idle.vnmclip",
    b"{ source=\"clips/idle.dmx\" }",
  );
  project.write("content/clips/idle.dmx", b"animation bytes");
  let inputs = project.inputs(&["models/hero.vmdl", "clips/idle.vnmclip"]);
  let snapshot = Snapshot::capture(&project.addon, &inputs).unwrap();
  let mut state = State {
    version: 1,
    ..State::default()
  };
  snapshot
    .record(
      &mut state,
      project.root(),
      Path::new(&project.addon.game_path),
      &inputs,
    )
    .unwrap();
  for (input, output) in [
    ("models/hero.vmdl", "models/hero.vmdl_c"),
    ("clips/idle.vnmclip", "clips/idle.vnmclip_c"),
  ] {
    project.write(&format!("game/{output}"), b"compiled appearance patch");
    assert!(state.inputs.contains_key(input));
  }
  let current = Snapshot::capture(&project.addon, &[]).unwrap();
  assert!(
    current
      .changed(
        &state,
        project.root(),
        Path::new(&project.addon.game_path),
        &inputs
      )
      .unwrap()
      .is_empty()
  );
}

#[test]
fn geometry_and_transitive_dependency_changes_compile_only_their_consumers() {
  let project = Project::new();
  project.write("content/models/hero.vmdl", b"{ mesh=\"models/hero.dmx\" }");
  project.write("content/models/hero.dmx", b"mesh bytes");
  project.write(
    "content/particles/parent.vpcf",
    b"{child=resource:\"particles/child.vpcf\"}",
  );
  project.write(
    "content/particles/child.vpcf",
    b"{ texture=\"materials/color.png\" }",
  );
  project.write("content/materials/color.png", b"old pixels");
  let inputs = project.inputs(&[
    "models/hero.vmdl",
    "particles/parent.vpcf",
    "particles/child.vpcf",
  ]);
  let original = Snapshot::capture(&project.addon, &inputs).unwrap();
  let mut state = State {
    version: 1,
    ..State::default()
  };
  original
    .record(
      &mut state,
      project.root(),
      Path::new(&project.addon.game_path),
      &inputs,
    )
    .unwrap();
  for path in state.inputs.values().flat_map(|input| &input.outputs) {
    project.write(&format!("game/{path}"), b"compiled");
  }
  project.write("content/models/hero.dmx", b"new mesh");
  let current = Snapshot::capture(&project.addon, &[]).unwrap();
  assert_eq!(
    current
      .changed(
        &state,
        project.root(),
        Path::new(&project.addon.game_path),
        &inputs
      )
      .unwrap(),
    project.inputs(&["models/hero.vmdl"])
  );
  project.write("content/models/hero.dmx", b"mesh bytes");
  project.write("content/materials/color.png", b"new pixels");
  let current = Snapshot::capture(&project.addon, &[]).unwrap();
  assert_eq!(
    current
      .changed(
        &state,
        project.root(),
        Path::new(&project.addon.game_path),
        &inputs
      )
      .unwrap(),
    project.inputs(&["particles/parent.vpcf", "particles/child.vpcf"])
  );
}

#[test]
fn missing_outputs_new_sources_and_deleted_dependencies_are_dirty() {
  let project = Project::new();
  project.write("content/hero.vmdl", b"{ mesh=\"hero.dmx\" }");
  project.write("content/hero.dmx", b"geometry");
  let inputs = project.inputs(&["hero.vmdl"]);
  let snapshot = Snapshot::capture(&project.addon, &inputs).unwrap();
  let mut state = State {
    version: 1,
    ..State::default()
  };
  assert_eq!(
    snapshot
      .changed(
        &state,
        project.root(),
        Path::new(&project.addon.game_path),
        &inputs
      )
      .unwrap(),
    inputs
  );
  snapshot
    .record(
      &mut state,
      project.root(),
      Path::new(&project.addon.game_path),
      &inputs,
    )
    .unwrap();
  assert_eq!(
    snapshot
      .changed(
        &state,
        project.root(),
        Path::new(&project.addon.game_path),
        &inputs
      )
      .unwrap(),
    inputs
  );
  project.write("game/hero.vmdl_c", b"compiled");
  std::fs::remove_file(project.root().join("hero.dmx")).unwrap();
  let current = Snapshot::capture(&project.addon, &[]).unwrap();
  assert_eq!(
    current
      .changed(
        &state,
        project.root(),
        Path::new(&project.addon.game_path),
        &inputs
      )
      .unwrap(),
    inputs
  );
  assert!(snapshot.verify(project.root(), &inputs).is_err());
}

#[test]
fn missing_generated_clip_output_rebuilds_its_parent() {
  let project = Project::new();
  project.write("content/aim.vnmclip", b"{}");
  project.write("game/aim.vnmclip_c", b"compiled");
  project.write("game/aim.vnmclip+non_additive.vnmclip_c", b"absolute pose");
  let inputs = project.inputs(&["aim.vnmclip"]);
  let snapshot = Snapshot::capture(&project.addon, &[]).unwrap();
  let mut state = State {
    version: 1,
    ..State::default()
  };
  snapshot
    .record(
      &mut state,
      project.root(),
      Path::new(&project.addon.game_path),
      &inputs,
    )
    .unwrap();
  assert!(
    snapshot
      .changed(
        &state,
        project.root(),
        Path::new(&project.addon.game_path),
        &inputs
      )
      .unwrap()
      .is_empty()
  );
  std::fs::remove_file(
    Path::new(&project.addon.game_path).join("aim.vnmclip+non_additive.vnmclip_c"),
  )
  .unwrap();
  assert_eq!(
    snapshot
      .changed(
        &state,
        project.root(),
        Path::new(&project.addon.game_path),
        &inputs
      )
      .unwrap(),
    inputs
  );
}

#[test]
fn imported_originals_are_recorded_only_when_sources_and_compiled_outputs_match() {
  let project = Project::new();
  let export = tempfile::tempdir().unwrap();
  let game = tempfile::tempdir().unwrap();
  std::fs::write(export.path().join("hero.vmdl"), b"{mesh=\"hero.dmx\"}").unwrap();
  std::fs::write(export.path().join("hero.dmx"), b"geometry").unwrap();
  let compiled = [16, 0, 0, 0, 12, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0];
  std::fs::write(game.path().join("hero.vmdl_c"), compiled).unwrap();
  project.write("content/hero.vmdl", b"{mesh=\"hero.dmx\"}");
  project.write("content/hero.dmx", b"custom geometry");
  project.write("game/hero.vmdl_c", &compiled);
  record_import(&project.addon, export.path(), game.path()).unwrap();
  assert!(State::load(project.root()).unwrap().inputs.is_empty());
  project.write("content/hero.dmx", b"geometry");
  record_import(&project.addon, export.path(), game.path()).unwrap();
  assert!(
    State::load(project.root())
      .unwrap()
      .inputs
      .contains_key("hero.vmdl")
  );
}

#[test]
fn binary_export_identity_comparison_retains_geometry_and_channel_bytes() {
  let source = include_bytes!(
    "../../../../../../packages/source2-model/tests/fixtures/source-quad-binary9.dmx"
  );
  let canonical = imports::canonical(source).unwrap();
  let mut regenerated = source.to_vec();
  let index = source
    .iter()
    .zip(&canonical)
    .position(|(a, b)| a != b)
    .unwrap();
  regenerated[index] ^= 0x55;
  assert_eq!(imports::canonical(&regenerated).unwrap(), canonical);
  let mut edited = source.to_vec();
  *edited.last_mut().unwrap() ^= 1;
  assert_ne!(imports::canonical(&edited).unwrap(), canonical);
}

#[test]
fn text_export_identity_comparison_keeps_reference_relationships() {
  let a = b"<!-- dmx encoding keyvalues2 4 format model 22 -->\n\"DmeJoint\" {\"id\" \"elementid\" \"11111111-1111-1111-1111-111111111111\" \"name\" \"string\" \"arm\" \"children\" \"element_array\" [\"element\" \"11111111-1111-1111-1111-111111111111\"]}";
  let b = String::from_utf8(a.to_vec()).unwrap().replace(
    "11111111-1111-1111-1111-111111111111",
    "22222222-2222-2222-2222-222222222222",
  );
  assert_eq!(
    imports::canonical(a).unwrap(),
    imports::canonical(b.as_bytes()).unwrap()
  );
  assert_ne!(
    imports::canonical(a).unwrap(),
    imports::canonical(b.replace("\"arm\"", "\"leg\"").as_bytes()).unwrap()
  );
}

fn nm_resource(fields: Vec<(&str, vpkmanager::source2::kv3::Value)>) -> Vec<u8> {
  use vpkmanager::source2::kv3::{self, Format, Value};
  let value = Value::Object(
    fields
      .into_iter()
      .map(|(name, value)| (name.into(), value))
      .collect(),
  );
  let payload = kv3::encode(&value, &Format([3; 16]));
  let mut bytes = vec![0; 28];
  bytes[4..6].copy_from_slice(&12u16.to_le_bytes());
  bytes[8..12].copy_from_slice(&8u32.to_le_bytes());
  bytes[12..16].copy_from_slice(&1u32.to_le_bytes());
  bytes[16..20].copy_from_slice(b"DATA");
  bytes[20..24].copy_from_slice(&8u32.to_le_bytes());
  bytes[24..28].copy_from_slice(&(payload.len() as u32).to_le_bytes());
  bytes.extend(payload);
  let length = bytes.len() as u32;
  bytes[..4].copy_from_slice(&length.to_le_bytes());
  bytes
}

#[test]
fn a_reordered_skeleton_cannot_be_packed_with_untouched_animation_tracks() {
  use vpkmanager::source2::kv3::Value;
  let project = Project::new();
  let skeleton = |names: [&str; 2]| {
    nm_resource(vec![
      ("m_ID", Value::String("hero".into())),
      (
        "m_boneIDs",
        Value::Array(names.map(|name| Value::String(name.into())).to_vec()),
      ),
      (
        "m_parentIndices",
        Value::Array(vec![Value::Int(-1), Value::Int(0)]),
      ),
    ])
  };
  let clip = nm_resource(vec![
    ("m_skeleton", Value::String("hero.vnmskel".into())),
    ("m_nNumFrames", Value::UInt(1)),
    ("m_flDuration", Value::Double(1.0)),
    ("m_bIsAdditive", Value::Bool(false)),
    (
      "m_compressedPoseOffsets",
      Value::Array(vec![Value::UInt(0)]),
    ),
    ("m_trackCompressionSettings", Value::Array(vec![])),
    ("m_compressedPoseData", Value::Binary(vec![0; 4])),
  ]);
  project.write("game/hero.vnmskel_c", &skeleton(["root", "arm"]));
  project.write("game/idle.vnmclip_c", &clip);
  let inputs = project.inputs(&["hero.vnmskel"]);
  let bindings = AnimationBindings::capture(Path::new(&project.addon.game_path), &inputs).unwrap();
  bindings
    .verify(Path::new(&project.addon.game_path))
    .unwrap();
  project.write("game/hero.vnmskel_c", &skeleton(["arm", "root"]));
  let error = bindings
    .verify(Path::new(&project.addon.game_path))
    .unwrap_err()
    .to_string();
  assert!(
    error.contains("idle.vnmclip_c") && error.contains("bone order"),
    "{error}"
  );
}

#[test]
#[ignore = "requires DMM_BUILD_SDK, DMM_BUILD_BASE_VPK and DMM_BUILD_CLI"]
fn legacy_bebop_sources_keep_the_original_compiled_rig_without_recompilation() {
  let sdk = PathBuf::from(std::env::var_os("DMM_BUILD_SDK").unwrap());
  let base = PathBuf::from(std::env::var_os("DMM_BUILD_BASE_VPK").unwrap());
  let cli = PathBuf::from(std::env::var_os("DMM_BUILD_CLI").unwrap());
  let mut project = Project::new();
  project.addon.archive_path = base.to_string_lossy().into();
  let prefix = "models/heroes_staging/bebop";
  for hierarchy in ["content", "game"] {
    let source = sdk
      .join(hierarchy)
      .join("citadel_addons/dmm_workbench")
      .join(prefix);
    let target = project.directory.path().join(hierarchy).join(prefix);
    std::fs::create_dir_all(&target).unwrap();
    super::super::modding_build::pack_files(&source, &target).unwrap();
  }
  let textures = "materials/dmm_model_edits";
  let target = Path::new(&project.addon.game_path).join(textures);
  std::fs::create_dir_all(&target).unwrap();
  super::super::modding_build::pack_files(
    &sdk.join("game/citadel_addons/dmm_workbench").join(textures),
    &target,
  )
  .unwrap();
  let inputs = super::super::modding_batch::files(project.root())
    .unwrap()
    .into_iter()
    .filter(|path| {
      path.ends_with(".vmdl") || path.ends_with(".vnmskel") || path.ends_with(".vnmclip")
    })
    .filter(|path| !path.contains('+'))
    .map(|path| project.root().join(path))
    .collect::<Vec<_>>();
  let snapshot = Snapshot::capture(&project.addon, &inputs).unwrap();
  let mut state = State {
    version: 1,
    ..State::default()
  };
  adopt_existing(&project.addon, &sdk, &cli, &snapshot, &mut state, &inputs).unwrap();
  let changed = snapshot
    .changed(
      &state,
      project.root(),
      Path::new(&project.addon.game_path),
      &inputs,
    )
    .unwrap();
  assert!(
    changed.is_empty(),
    "Unchanged exported sources were scheduled: {changed:?}"
  );
  let archive = source2_model::vpk_extract::VpkArchive::open(&base).unwrap();
  for path in [
    format!("{prefix}/bebop.vmdl_c"),
    format!("{prefix}/bebop.vnmskel_c"),
    format!("{prefix}/clips/aim_zoomed.vnmclip_c"),
    format!("{prefix}/clips/aim_zoomed.vnmclip+non_additive.vnmclip_c"),
  ] {
    assert_eq!(
      read(&Path::new(&project.addon.game_path).join(&path)).unwrap(),
      archive.extract_entry(&path).unwrap(),
      "{path}"
    );
  }
  println!(
    "Preserved {} original compiled resources without running CSDK12",
    state.inputs.len()
  );
  let package = project.directory.path().join("appearance_dir.vpk");
  let mut writer = std::fs::File::create(&package).unwrap();
  let count = super::super::modding_build::pack_addon(&project.addon, &mut writer).unwrap();
  drop(writer);
  let packed = source2_model::vpk_extract::VpkArchive::open(&package).unwrap();
  let recipe_path = sdk.join("content/citadel_addons/dmm_workbench/.dmm-model-editor/state.json");
  let recipe: serde_json::Value =
    serde_json::from_slice(&std::fs::read(recipe_path).unwrap()).unwrap();
  let expected = recipe["resources"]
    .as_object()
    .unwrap()
    .keys()
    .cloned()
    .collect::<BTreeSet<_>>();
  assert_eq!(
    packed.list_entries().into_iter().collect::<BTreeSet<_>>(),
    expected
  );
  assert_eq!(count, expected.len());
  println!("Packed {count} native appearance overrides; no model, skeleton or animation overrides");
}
