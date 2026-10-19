use super::super::{LocalizationModInput, resources, tests::compiled_resource};
use super::*;
use std::path::Path;

const MODEL: &str = "models/heroes/test/test.vmdl_c";
const HEADER: &str = "<!-- kv3 encoding:text:version{e21c7f3c-8a33-41c5-9977-a76d3a32aa0d} format:vmdlkeys4:version{9f5c1002-f19f-470c-bd42-c3c26c063d33} -->";
const GAME_TABLE: &str = "scripts/tagged_sounds/test_anim_sounds.vdata";
const CUSTOM_TABLE: &str = "scripts/tagged_sounds/custom_steps.vdata";

fn binding(name: &str, table: &str) -> String {
  format!("{name} = \n\t{{\n\t\tm_taggedSounds = \n\t\t[\n\t\t\tresource:\"{table}\",\n\t\t]\n\t}}")
}

fn text(fields: &str) -> String {
  format!("{HEADER}\n{{\n\t// keep this comment\n\tCustom = {{ value = 7 }}\n\t{fields}\n}}\n")
}

fn model(text: &str, references: &[(u64, &str)]) -> Vec<u8> {
  let value = Kv3Value::Object(vec![
    (
      "m_modelInfo".into(),
      Kv3Value::Object(vec![(
        "m_keyValueText".into(),
        Kv3Value::String(text.into()),
      )]),
    ),
    ("authored".into(), Kv3Value::String("mesh and rig".into())),
  ]);
  let blocks = [
    (*b"DATA", kv3::encode(&value, &kv3::Format([0; 16]))),
    (*b"RERL", vec![8, 0, 0, 0, 0, 0, 0, 0]),
    (*b"MDAT", vec![4, 5, 6]),
  ];
  let mut bytes = vec![0; 16 + blocks.len() * 12];
  bytes[4..6].copy_from_slice(&12u16.to_le_bytes());
  bytes[8..12].copy_from_slice(&8u32.to_le_bytes());
  bytes[12..16].copy_from_slice(&(blocks.len() as u32).to_le_bytes());
  for (index, (kind, data)) in blocks.into_iter().enumerate() {
    let table = 16 + index * 12;
    bytes[table..table + 4].copy_from_slice(&kind);
    let relative = (bytes.len() - (table + 4)) as u32;
    bytes[table + 4..table + 8].copy_from_slice(&relative.to_le_bytes());
    bytes[table + 8..table + 12].copy_from_slice(&(data.len() as u32).to_le_bytes());
    bytes.extend(data);
  }
  let length = bytes.len() as u32;
  bytes[..4].copy_from_slice(&length.to_le_bytes());
  let references: Vec<_> = references
    .iter()
    .map(|(id, path)| (*id, (*path).to_owned()))
    .collect();
  material_repair::add_references(&bytes, &references).unwrap()
}

fn table(kind: &str) -> Vec<u8> {
  compiled_resource(vec![(
    "generic_data_type".into(),
    Kv3Value::String(kind.into()),
  )])
}

fn id(path: &str) -> u64 {
  resource_id(path).unwrap()
}

fn current() -> Vec<u8> {
  model(
    &text(&binding(SETTINGS, GAME_TABLE)),
    &[(id(GAME_TABLE), GAME_TABLE)],
  )
}

/// A game install with the current model and its sound table, plus a mod that
/// provides its own sound tables.
fn snapshot(root: &Path, mod_tables: &[(&str, &[u8])]) -> ResourceSnapshot {
  let citadel = root.join("citadel");
  let current = current();
  let game_table = table("CTaggedSound_t");
  resources::tests::pack(
    &citadel,
    "pak01",
    &[(MODEL, &current), (&format!("{GAME_TABLE}_c"), &game_table)],
  );
  let mut mods = Vec::new();
  if !mod_tables.is_empty() {
    mods.push(LocalizationModInput {
      mod_id: "skin".into(),
      vpks: vec![resources::tests::pack(root, "skin", mod_tables)],
    });
  }
  let game = resources::GameIndex::open(&citadel).unwrap();
  ResourceSnapshot::with_game(std::sync::Arc::new(game), &mods).unwrap()
}

fn text_of(bytes: &[u8]) -> String {
  let (_, value, _) = decode_compiled_data(bytes, "test").unwrap();
  model_text(&value).unwrap().to_owned()
}

fn assert_only_text_and_references_changed(source: &[u8], repaired: &[u8]) {
  let before = Resource::parse(source).unwrap();
  let after = Resource::parse(repaired).unwrap();
  for (index, block) in before.blocks().iter().enumerate() {
    if block.kind == *b"MDAT" {
      assert_eq!(
        before.get_block_by_index(index),
        after.get_block_by_index(index)
      );
    }
  }
  let (_, old, _) = decode_compiled_data(source, "source").unwrap();
  let (_, new, _) = decode_compiled_data(repaired, "repaired").unwrap();
  assert_eq!(old.get("authored"), new.get("authored"));
}

#[test]
fn legacy_binding_is_renamed_and_keeps_the_mods_own_sound_tables() {
  let temp = tempfile::tempdir().unwrap();
  let custom = table("CTaggedSound_t");
  let resources = snapshot(temp.path(), &[(&format!("{CUSTOM_TABLE}_c"), &custom)]);
  let authored = text(&binding(LEGACY_SETTINGS, CUSTOM_TABLE));
  let source = model(&authored, &[]);
  let (_, before, _) = decode_compiled_data(&source, "source").unwrap();
  let (_, game, _) = decode_compiled_data(&current(), "game").unwrap();
  assert!(missing(&before, &game));

  let repaired = repair(&source, &current(), &resources).unwrap().unwrap();
  assert_eq!(
    text_of(&repaired),
    authored.replacen(LEGACY_SETTINGS, SETTINGS, 1)
  );
  assert_eq!(
    material_repair::references(&repaired).unwrap(),
    [(id(CUSTOM_TABLE), CUSTOM_TABLE.to_owned())]
  );
  assert_only_text_and_references_changed(&source, &repaired);
  let (_, after, _) = decode_compiled_data(&repaired, "repaired").unwrap();
  assert!(!missing(&after, &game));
  assert!(repair(&repaired, &current(), &resources).unwrap().is_none());
}

#[test]
fn absent_binding_is_copied_from_the_current_model() {
  let temp = tempfile::tempdir().unwrap();
  let resources = snapshot(temp.path(), &[]);
  let authored = text("Other = { flag = true }");
  let source = model(&authored, &[]);
  let repaired = repair(&source, &current(), &resources).unwrap().unwrap();
  let updated = text_of(&repaired);
  let closing = authored.rfind('}').unwrap();
  assert_eq!(&updated[..closing], &authored[..closing]);
  assert!(updated.contains(&binding(SETTINGS, GAME_TABLE)));
  assert!(
    material_repair::references(&repaired)
      .unwrap()
      .contains(&(id(GAME_TABLE), GAME_TABLE.to_owned()))
  );
  assert_only_text_and_references_changed(&source, &repaired);
}

#[test]
fn authored_unknown_or_unverifiable_bindings_are_left_alone() {
  let temp = tempfile::tempdir().unwrap();
  let wrong = table("CSomethingElse_t");
  let resources = snapshot(
    temp.path(),
    &[("scripts/tagged_sounds/wrong_type.vdata_c", &wrong)],
  );
  for fields in [
    format!("{SETTINGS} = {{ }}"),
    format!("{SETTINGS} = {{ m_taggedSounds = [ ] }}"),
    format!("{LEGACY_SETTINGS} = {{ m_taggedSounds = [ resource:\"{GAME_TABLE}\" ] unknown = 1 }}"),
    format!("{LEGACY_SETTINGS} = {{ m_taggedSounds = [ \"{GAME_TABLE}\" ] }}"),
    binding(LEGACY_SETTINGS, "scripts/tagged_sounds/missing.vdata"),
    binding(LEGACY_SETTINGS, "scripts/tagged_sounds/wrong_type.vdata"),
    binding(LEGACY_SETTINGS, "sounds/elsewhere.vdata"),
  ] {
    let source = model(&text(&fields), &[]);
    assert!(
      repair(&source, &current(), &resources).unwrap().is_none(),
      "{fields}"
    );
  }
  // A conflicting authored reference to the same table is never overwritten.
  let source = model(
    &text(&binding(LEGACY_SETTINGS, GAME_TABLE)),
    &[(id(GAME_TABLE) ^ 1, GAME_TABLE)],
  );
  assert!(repair(&source, &current(), &resources).unwrap().is_none());
}
