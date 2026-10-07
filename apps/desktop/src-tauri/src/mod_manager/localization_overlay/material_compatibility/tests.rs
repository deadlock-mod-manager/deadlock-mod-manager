use super::super::{LocalizationModInput, LocalizationOverlayPlan};
use super::*;
use std::{
  fs,
  path::{Path, PathBuf},
};

fn source(root: &Path, id: &str, roles: &[&str]) -> LocalizationModInput {
  let folder = root.join(id);
  for role in roles {
    let path = folder.join(format!(
      "models/npc/trooper/materials/candle_trooper_wax_{role}.vmat_c"
    ));
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, b"fixture-invalid-resource").unwrap();
  }
  let archive = root.join(format!("{id}.vpk"));
  vpkmanager::pack_directory(&folder, &archive).unwrap();
  LocalizationModInput {
    mod_id: id.into(),
    vpks: vec![archive],
  }
}

#[test]
fn partial_roles_are_visible_and_never_publish_half_a_repair() {
  let temp = tempfile::tempdir().unwrap();
  let input = source(temp.path(), "color-mod", &["friendly"]);
  let before = fs::read(&input.vpks[0]).unwrap();
  let plan = LocalizationOverlayPlan::build(temp.path(), std::slice::from_ref(&input)).unwrap();
  assert!(plan.material_assets.is_empty());
  assert_eq!(plan.analysis.asset_warnings.len(), 1);
  assert_eq!(plan.analysis.asset_warnings[0].mod_id, "color-mod");
  assert!(
    plan.analysis.asset_warnings[0]
      .detail
      .contains("four material roles")
  );
  let result = plan.write(&temp.path().join("overlay.vpk"), &[]).unwrap();
  assert!(!result.has_overlay);
  assert_eq!(before, fs::read(&input.vpks[0]).unwrap());
}

#[test]
fn opted_out_material_role_prevents_a_partial_migration_in_either_order() {
  let temp = tempfile::tempdir().unwrap();
  let selected = source(
    temp.path(),
    "selected",
    &["friendly", "enemy", "amber", "sapphire"],
  );
  let original = source(temp.path(), "original", &["friendly"]);
  for inputs in [
    vec![selected.clone(), original.clone()],
    vec![original.clone(), selected.clone()],
  ] {
    let plan = LocalizationOverlayPlan::build_selected(
      temp.path(),
      &inputs,
      &BTreeSet::from(["selected".into()]),
    )
    .unwrap();
    assert!(plan.material_assets.is_empty());
    assert!(plan.analysis.asset_repairs.is_empty());
    assert_eq!(plan.analysis.protected_resources.len(), 1);
    assert_eq!(plan.analysis.asset_warnings.len(), 3);
    assert!(plan.analysis.asset_warnings.iter().all(
      |warning| warning.mod_id == "selected" && warning.detail.contains("four material roles")
    ));
    assert!(
      !plan
        .write(&temp.path().join("overlay.vpk"), &[])
        .unwrap()
        .has_overlay
    );
  }
}

#[test]
fn mixed_winning_providers_are_reported_for_both_mods() {
  let temp = tempfile::tempdir().unwrap();
  let first = source(temp.path(), "first", &["friendly"]);
  let second = source(
    temp.path(),
    "second",
    &["friendly", "enemy", "amber", "sapphire"],
  );
  let plan = LocalizationOverlayPlan::build(temp.path(), &[first, second]).unwrap();
  assert!(plan.material_assets.is_empty());
  assert!(plan.analysis.asset_repairs.is_empty());
  let owners: BTreeSet<_> = plan
    .analysis
    .asset_warnings
    .iter()
    .map(|w| w.mod_id.as_str())
    .collect();
  assert_eq!(owners, BTreeSet::from(["first", "second"]));
}

#[test]
fn absent_current_reference_is_reported_without_rewriting_the_mod() {
  let temp = tempfile::tempdir().unwrap();
  let input = source(
    temp.path(),
    "all-roles",
    &["friendly", "enemy", "amber", "sapphire"],
  );
  let plan = LocalizationOverlayPlan::build(temp.path(), &[input]).unwrap();
  assert!(plan.material_assets.is_empty());
  assert_eq!(plan.analysis.asset_warnings.len(), 4);
  assert!(
    plan.analysis.asset_warnings[0]
      .detail
      .contains("Missing current game dependency")
  );
}

#[test]
fn recipe_recognition_uses_exact_resource_roles_not_mod_ids_or_similar_names() {
  assert_eq!(
    minion_glow::source_role("models/npc/trooper/materials/candle_trooper_wax_enemy.vmat_c"),
    Some("enemy")
  );
  assert_eq!(
    minion_glow::source_role("models/npc/trooper/materials/candle_trooper_wax_enemy_copy.vmat_c"),
    None
  );
  assert_eq!(
    minion_glow::source_role("materials/candle_trooper_wax_enemy.vmat_c"),
    None
  );
}

fn texture(provenance: &[u8], pixels: &[u8]) -> Vec<u8> {
  let mut header = vec![0u8; 40];
  header[..2].copy_from_slice(&1u16.to_le_bytes());
  header[20..26].copy_from_slice(&[1, 0, 1, 0, 1, 0]);
  header[26] = 4; // RGBA8888
  header[27] = 1;
  let mut bytes = vec![0u8; 40];
  bytes[4..6].copy_from_slice(&12u16.to_le_bytes());
  bytes[8..12].copy_from_slice(&8u32.to_le_bytes());
  bytes[12..16].copy_from_slice(&2u32.to_le_bytes());
  for (index, (kind, data)) in [(*b"REDI", provenance.to_vec()), (*b"DATA", header)]
    .into_iter()
    .enumerate()
  {
    let at = 16 + index * 12;
    bytes[at..at + 4].copy_from_slice(&kind);
    let relative = (bytes.len() - at - 4) as u32;
    bytes[at + 4..at + 8].copy_from_slice(&relative.to_le_bytes());
    bytes[at + 8..at + 12].copy_from_slice(&(data.len() as u32).to_le_bytes());
    bytes.extend(data);
  }
  let size = bytes.len() as u32;
  bytes[..4].copy_from_slice(&size.to_le_bytes());
  bytes.extend(pixels);
  bytes
}

#[test]
fn bundled_defaults_may_differ_only_in_provenance_not_rendering_data() {
  let current = texture(b"current compiler", &[255; 4]);
  let legacy = texture(b"older compiler with another input path", &[255; 4]);
  assert!(same_texture_runtime(&legacy, &current));
  assert!(!same_texture_runtime(
    &texture(b"current compiler", &[0; 4]),
    &current
  ));
  let mut different_header = legacy.clone();
  let resource = vpkmanager::source2::resource::Resource::parse(&different_header).unwrap();
  let data = resource
    .blocks()
    .iter()
    .find(|b| b.kind == *b"DATA")
    .unwrap()
    .offset as usize;
  different_header[data + 2] = 1; // changed clamp flags
  assert!(!same_texture_runtime(&different_header, &current));
  assert!(!same_texture_runtime(b"truncated", &current));
}

#[test]
fn materials_without_a_recipe_still_report_unreadable_resources() {
  let temp = tempfile::tempdir().unwrap();
  let folder = temp.path().join("source");
  fs::create_dir_all(folder.join("materials")).unwrap();
  fs::write(folder.join("materials/custom.vmat_c"), b"broken").unwrap();
  let archive = temp.path().join("custom.vpk");
  vpkmanager::pack_directory(&folder, &archive).unwrap();
  let plan = LocalizationOverlayPlan::build(
    temp.path(),
    &[LocalizationModInput {
      mod_id: "custom-material".into(),
      vpks: vec![archive],
    }],
  )
  .unwrap();
  assert_eq!(plan.analysis.asset_warnings.len(), 1);
  assert_eq!(
    plan.analysis.asset_warnings[0].kind,
    WarningKind::UnreadableResource
  );
  assert_eq!(
    plan.analysis.asset_warnings[0].file_path,
    "materials/custom.vmat_c"
  );
}

#[test]
#[ignore = "requires DMM_REAL_CITADEL and DMM_NEON_SOURCE installed local fixtures"]
fn original_neon_builds_private_materials_and_all_six_current_models() {
  let citadel = PathBuf::from(std::env::var("DMM_REAL_CITADEL").unwrap());
  let source = PathBuf::from(std::env::var("DMM_NEON_SOURCE").unwrap());
  let before = fs::read(&source).unwrap();
  let plan = LocalizationOverlayPlan::build(
    &citadel,
    &[LocalizationModInput {
      mod_id: "arbitrary-id".into(),
      vpks: vec![source.clone()],
    }],
  )
  .unwrap();
  assert!(
    plan.analysis.asset_warnings.is_empty(),
    "{:?}",
    plan.analysis.asset_warnings
  );
  assert_eq!(plan.analysis.asset_repairs.len(), 6);
  assert_eq!(plan.material_assets.len(), 19);
  assert_eq!(
    plan
      .material_assets
      .keys()
      .filter(|p| p.ends_with(".vmdl_c"))
      .count(),
    6
  );
  assert!(
    plan
      .material_assets
      .keys()
      .filter(|p| p.ends_with(".vmat_c"))
      .all(|p| p.starts_with("dmm/compatibility/materials/"))
  );
  let resources = ResourceSnapshot::open(
    &citadel,
    &[LocalizationModInput {
      mod_id: "arbitrary-id".into(),
      vpks: vec![source.clone()],
    }],
  )
  .unwrap();
  validate_dependencies(&resources, &plan.material_assets).unwrap();
  for (path, bytes) in &plan.material_assets {
    for (id, name) in edit::references(bytes).unwrap() {
      if name.starts_with("dmm/") {
        assert_eq!(id, resource_id(&name).unwrap(), "{path}");
      }
    }
  }
  let temp = tempfile::tempdir().unwrap();
  let output = temp.path().join("overlay.vpk");
  let applied = plan.write(&output, &[]).unwrap();
  assert_eq!(applied.packed_files, 19);
  let archive = source2_model::vpk_extract::VpkArchive::open(&output).unwrap();
  for (path, expected) in &plan.material_assets {
    assert_eq!(&archive.extract_entry(path).unwrap(), expected);
  }
  assert_eq!(before, fs::read(source).unwrap());
}

#[test]
#[ignore = "requires DMM_REAL_CITADEL and DMM_MINA_SOURCE original fixtures"]
fn legacy_material_scan_reports_the_unverified_runtime_eye_feature() {
  let citadel = PathBuf::from(std::env::var("DMM_REAL_CITADEL").unwrap());
  let source = PathBuf::from(std::env::var("DMM_MINA_SOURCE").unwrap());
  let input = LocalizationModInput {
    mod_id: "arbitrary-material-mod".into(),
    vpks: vec![source],
  };
  let resources = ResourceSnapshot::open(&citadel, std::slice::from_ref(&input)).unwrap();
  let path = "models/heroes_wip/vampirebat/materials/vampirebat_eyes.vmat_c";
  let authored = edit::decode(&resources.resolve(path).unwrap().unwrap().1)
    .unwrap()
    .0;
  let current = edit::decode(&resources.game_bytes(path).unwrap().unwrap())
    .unwrap()
    .0;
  // Both omit the runtime-requested slot. Only the authored variant enables
  // this feature, so the current same-path material cannot supply a safe default.
  let source_textures = authored.get("m_textureParams").unwrap().as_array().unwrap();
  let current_textures = current.get("m_textureParams").unwrap().as_array().unwrap();
  for entries in [source_textures, current_textures] {
    assert!(!entries.iter().any(|entry| {
      entry
        .get("m_name")
        .and_then(vpkmanager::source2::kv3::Value::as_str)
        == Some("g_tAltColor_Reveal")
    }));
  }
  let plan = LocalizationOverlayPlan::build(&citadel, &[input]).unwrap();
  assert!(
    plan.analysis.asset_warnings.iter().any(|warning| {
      warning.file_path == path
        && warning.detail.contains("F_USE_STATUS_EFFECTS_PROXY")
        && warning.kind == WarningKind::MaterialInterface
    }),
    "authored shader feature with unverified texture requirements was absent from the compatibility report"
  );
}

fn material(shader: &str, features: &[(&str, i64)], textures: &[(&str, &str)]) -> Vec<u8> {
  use super::super::{Kv3Value as Value, tests::compiled_resource};
  let texture_entries = textures
    .iter()
    .map(|(name, path)| {
      Value::Object(vec![
        ("m_name".into(), Value::String((*name).into())),
        ("m_pValue".into(), Value::String((*path).into())),
      ])
    })
    .collect();
  let feature_entries = features
    .iter()
    .map(|(name, value)| {
      Value::Object(vec![
        ("m_name".into(), Value::String((*name).into())),
        ("m_nValue".into(), Value::Int(*value)),
      ])
    })
    .collect();
  compiled_resource(vec![
    ("m_shaderName".into(), Value::String(shader.into())),
    ("m_intParams".into(), Value::Array(feature_entries)),
    ("m_textureParams".into(), Value::Array(texture_entries)),
  ])
}

fn material_plan(root: &Path, authored: &[u8], current: Option<&[u8]>) -> LocalizationOverlayPlan {
  let path = "materials/authored.vmat_c";
  let folder = root.join("mod");
  fs::create_dir_all(folder.join("materials")).unwrap();
  fs::write(folder.join(path), authored).unwrap();
  if let Some(current) = current {
    fs::create_dir_all(root.join("materials")).unwrap();
    fs::write(root.join(path), current).unwrap();
  }
  let archive = root.join("authored.vpk");
  vpkmanager::pack_directory(&folder, &archive).unwrap();
  LocalizationOverlayPlan::build(
    root,
    &[LocalizationModInput {
      mod_id: "any-material-mod".into(),
      vpks: vec![archive],
    }],
  )
  .unwrap()
}

#[test]
fn current_texture_slot_gaps_are_reported_without_replacing_authored_effects() {
  let temp = tempfile::tempdir().unwrap();
  let authored = material(
    "pbr.vfx",
    &[("F_SELF_ILLUM", 1)],
    &[("g_tColor", "mod/color.vtex")],
  );
  let current = material(
    "pbr.vfx",
    &[("F_SELF_ILLUM", 1)],
    &[
      ("g_tColor", "base/color.vtex"),
      ("g_tReveal", "base/reveal.vtex"),
    ],
  );
  let plan = material_plan(temp.path(), &authored, Some(&current));
  assert!(plan.material_assets.is_empty());
  assert!(plan.analysis.asset_repairs.is_empty());
  assert_eq!(plan.analysis.asset_warnings.len(), 1);
  let warning = &plan.analysis.asset_warnings[0];
  assert_eq!(warning.kind, WarningKind::MaterialInterface);
  assert!(warning.detail.contains("m_textureParams.g_tReveal"));
  assert_eq!(warning.mod_id, "any-material-mod");
  assert_eq!(warning.file_path, "materials/authored.vmat_c");
  assert!(
    !plan
      .write(&temp.path().join("overlay.vpk"), &[])
      .unwrap()
      .has_overlay
  );
  assert_eq!(
    fs::read(temp.path().join("mod/materials/authored.vmat_c")).unwrap(),
    authored
  );
}

#[test]
fn extra_enabled_features_are_unverified_not_declared_retired_or_replaced() {
  let temp = tempfile::tempdir().unwrap();
  let authored = material("pbr.vfx", &[("F_CUSTOM_EFFECT", 1)], &[]);
  let current = material("pbr.vfx", &[], &[]);
  let plan = material_plan(temp.path(), &authored, Some(&current));
  assert_eq!(plan.analysis.asset_warnings.len(), 1);
  assert!(
    plan.analysis.asset_warnings[0]
      .detail
      .contains("F_CUSTOM_EFFECT")
  );
  assert!(
    plan.analysis.asset_warnings[0]
      .detail
      .contains("may be intentional")
  );
  assert!(plan.material_assets.is_empty());
}

#[test]
fn custom_texture_values_and_disabled_features_are_not_interface_gaps() {
  let temp = tempfile::tempdir().unwrap();
  let authored = material(
    "pbr.vfx",
    &[("F_CUSTOM_EFFECT", 0)],
    &[("g_tColor", "mod/color.vtex")],
  );
  let current = material("pbr.vfx", &[], &[("g_tColor", "base/color.vtex")]);
  let plan = material_plan(temp.path(), &authored, Some(&current));
  assert!(plan.analysis.asset_warnings.is_empty());
}

#[test]
fn different_feature_variants_do_not_treat_optional_texture_slots_as_required() {
  let temp = tempfile::tempdir().unwrap();
  let authored = material(
    "pbr.vfx",
    &[("F_DETAIL", 0)],
    &[("g_tColor", "mod/color.vtex")],
  );
  let current = material(
    "pbr.vfx",
    &[("F_DETAIL", 1)],
    &[
      ("g_tColor", "base/color.vtex"),
      ("g_tDetail", "base/detail.vtex"),
    ],
  );
  let plan = material_plan(temp.path(), &authored, Some(&current));
  assert!(plan.analysis.asset_warnings.is_empty());
}

#[test]
fn different_shaders_do_not_invent_texture_slot_correspondence() {
  let temp = tempfile::tempdir().unwrap();
  let authored = material("custom.vfx", &[], &[]);
  let current = material("pbr.vfx", &[], &[("g_tReveal", "base/reveal.vtex")]);
  let plan = material_plan(temp.path(), &authored, Some(&current));
  assert_eq!(plan.analysis.asset_warnings.len(), 1);
  assert!(
    plan.analysis.asset_warnings[0]
      .detail
      .contains("Authored shader custom.vfx")
  );
  assert!(!plan.analysis.asset_warnings[0].detail.contains("g_tReveal"));
}

#[test]
fn duplicate_parameters_are_reported_as_ambiguous() {
  let temp = tempfile::tempdir().unwrap();
  let authored = material(
    "pbr.vfx",
    &[],
    &[("g_tColor", "mod/one.vtex"), ("g_tColor", "mod/two.vtex")],
  );
  let current = material("pbr.vfx", &[], &[]);
  let plan = material_plan(temp.path(), &authored, Some(&current));
  assert_eq!(plan.analysis.asset_warnings.len(), 1);
  assert!(
    plan.analysis.asset_warnings[0]
      .detail
      .contains("Duplicate material parameter")
  );
  assert!(plan.material_assets.is_empty());
}

#[test]
fn new_materials_without_a_current_reference_have_no_invented_interface() {
  let temp = tempfile::tempdir().unwrap();
  let authored = material("custom.vfx", &[("F_CUSTOM_EFFECT", 1)], &[]);
  let plan = material_plan(temp.path(), &authored, None);
  assert!(plan.analysis.asset_warnings.is_empty());
}
