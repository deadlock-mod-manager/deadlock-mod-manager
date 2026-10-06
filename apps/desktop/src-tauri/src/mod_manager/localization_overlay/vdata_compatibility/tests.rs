use super::super::tests::compiled_resource;
use super::*;

fn definition(extra: Vec<(&str, Kv3Value)>) -> Kv3Value {
  Kv3Value::Object(
    std::iter::once(("_class".into(), Kv3Value::String("TestAbility".into())))
      .chain(extra.into_iter().map(|(k, v)| (k.into(), v)))
      .collect(),
  )
}

fn bound_hero(target: &str) -> Kv3Value {
  Kv3Value::Object(vec![
    (
      "_class".into(),
      Kv3Value::String("CitadelHeroData_t".into()),
    ),
    (
      "m_mapBoundAbilities".into(),
      Kv3Value::Object(vec![(
        "ESlot_Weapon_Primary".into(),
        Kv3Value::String(target.into()),
      )]),
    ),
  ])
}

fn source(id: &str, priority: usize, rows: Vec<(String, Kv3Value)>) -> CompiledDataSource {
  CompiledDataSource {
    mod_id: id.into(),
    source_vpk: format!("{id}.vpk"),
    priority,
    bytes: compiled_resource(rows),
  }
}

fn heroes(sources: Vec<CompiledDataSource>, current: Vec<(String, Kv3Value)>) -> CompiledDataTable {
  build_compiled_table(HEROES_VDATA_PATH, compiled_resource(current), sources, None).unwrap()
}

fn abilities(retired: Vec<(String, Kv3Value)>) -> CompiledDataTable {
  let mut current = vec![("current_ability".into(), definition(vec![]))];
  current.extend((0..40).map(|i| (format!("unchanged_{i}"), Kv3Value::Int(i))));
  let mut historical = current.clone();
  historical.extend(retired);
  let history = VdataHistoryIndex::from_bytes(
    &crate::mod_manager::vdata_history::encode_history_index(&[(
      ABILITIES_PATH.into(),
      vec![(1, Kv3Value::Object(historical.clone()))],
    )])
    .unwrap(),
  )
  .unwrap();
  build_compiled_table(
    ABILITIES_PATH,
    compiled_resource(current),
    vec![source("ability-mod", 0, historical)],
    Some(&history),
  )
  .unwrap()
}

fn hero_table(target: &str) -> CompiledDataTable {
  heroes(
    vec![source(
      "hero-mod",
      0,
      vec![("hero_custom".into(), bound_hero(target))],
    )],
    vec![],
  )
}

#[test]
fn retains_complete_dependency_chains_and_preserves_source_types() {
  let child = definition(vec![("damage", Kv3Value::Double(17.25))]);
  let parent = definition(vec![(
    "m_AbilityToTrigger",
    Kv3Value::String("retired_child".into()),
  )]);
  let tables = vec![
    hero_table("retired_parent"),
    abilities(vec![
      ("retired_parent".into(), parent.clone()),
      ("retired_child".into(), child.clone()),
      ("unused".into(), definition(vec![])),
    ]),
  ];
  let PreparedData {
    merged,
    repairs,
    warnings,
  } = prepare(&tables, &[]).unwrap();
  assert!(warnings.is_empty());
  assert_eq!(repairs.len(), 2);
  assert_eq!(row(&merged[1].root, "retired_parent"), Some(&parent));
  assert_eq!(row(&merged[1].root, "retired_child"), Some(&child));
  assert!(row(&merged[1].root, "unused").is_none());
  let expected = &tables[1].retired_rows["retired_child"][0].encoding;
  assert_eq!(merged[1].encoding.get("retired_child"), Some(expected));
}

#[test]
fn incomplete_chains_do_not_produce_partial_repairs() {
  let parent = definition(vec![(
    "m_AbilityToTrigger",
    Kv3Value::String("missing_child".into()),
  )]);
  let tables = vec![
    hero_table("retired_parent"),
    abilities(vec![("retired_parent".into(), parent)]),
  ];
  let PreparedData {
    merged,
    repairs,
    warnings,
  } = prepare(&tables, &[]).unwrap();
  assert!(repairs.is_empty());
  assert!(
    row(&merged[0].root, "hero_custom").is_none(),
    "a hero with an unavailable required ability must not reach the game"
  );
  assert!(row(&merged[1].root, "retired_parent").is_none());
  assert_eq!(warnings.len(), 1);
  assert!(matches!(
    warnings[0].kind,
    WarningKind::OmittedHeroDefinition
  ));
  assert_eq!(warnings[0].target_row, "retired_parent");
  assert_eq!(
    warnings[0].detail,
    "scripts/abilities.vdata_c:missing_child"
  );
  assert!(matches!(
    warnings[0].reason,
    WarningReason::DefinitionUnavailable
  ));
}

#[test]
fn inheritance_cycles_are_rejected_but_mutual_triggers_can_resolve() {
  for (field, repaired) in [("_base", false), ("m_AbilityToTrigger", true)] {
    let tables = vec![
      hero_table("retired_a"),
      abilities(vec![
        (
          "retired_a".into(),
          definition(vec![(field, Kv3Value::String("retired_b".into()))]),
        ),
        (
          "retired_b".into(),
          definition(vec![(field, Kv3Value::String("retired_a".into()))]),
        ),
      ]),
    ];
    let PreparedData {
      merged,
      repairs,
      warnings,
    } = prepare(&tables, &[]).unwrap();
    assert_eq!(
      row(&merged[1].root, "retired_a").is_some(),
      repaired,
      "{field}"
    );
    assert_eq!(repairs.len(), if repaired { 2 } else { 0 });
    assert_eq!(warnings.len(), if repaired { 0 } else { 1 });
  }
}

#[test]
fn unsupported_classes_enums_and_competing_definitions_are_left_out() {
  let unknown_class = Kv3Value::Object(vec![(
    "_class".into(),
    Kv3Value::String("RetiredNativeClass".into()),
  )]);
  let unknown_enum = definition(vec![("m_eMode", Kv3Value::String("UnknownEnum".into()))]);
  for value in [unknown_class, unknown_enum] {
    let tables = vec![
      hero_table("retired"),
      abilities(vec![("retired".into(), value)]),
    ];
    let PreparedData {
      merged,
      repairs,
      warnings,
    } = prepare(&tables, &[]).unwrap();
    assert!(row(&merged[1].root, "retired").is_none());
    assert!(repairs.is_empty());
    assert!(matches!(
      warnings[0].kind,
      WarningKind::UnverifiedDefinition
    ));
  }
  let mut target = abilities(vec![("retired".into(), definition(vec![]))]);
  let mut competitor = target.retired_rows["retired"][0].clone();
  competitor.value = definition(vec![("damage", Kv3Value::Int(999))]);
  target
    .retired_rows
    .get_mut("retired")
    .unwrap()
    .push(competitor);
  let PreparedData {
    merged,
    repairs,
    warnings,
  } = prepare(&[hero_table("retired"), target], &[]).unwrap();
  assert!(row(&merged[1].root, "retired").is_none());
  assert!(repairs.is_empty());
  assert!(matches!(
    warnings[0].kind,
    WarningKind::UnverifiedDefinition
  ));
}

#[test]
fn dependencies_follow_resolved_winners_and_explicit_vanilla_choices() {
  let heroes = heroes(
    vec![
      source(
        "first",
        0,
        vec![("hero_custom".into(), bound_hero("retired"))],
      ),
      source(
        "second",
        1,
        vec![("hero_custom".into(), bound_hero("missing"))],
      ),
    ],
    vec![],
  );
  let key = heroes.groups.values().next().unwrap().key.clone();
  let tables = vec![
    heroes,
    abilities(vec![("retired".into(), definition(vec![]))]),
  ];
  let PreparedData {
    repairs, warnings, ..
  } = prepare(&tables, &[]).unwrap();
  assert_eq!(repairs.len(), 1);
  assert!(warnings.is_empty());
  let mut resolution = LocalizationResolution {
    conflict_key: key,
    winner_mod_id: Some("second".into()),
    winner_source_vpk: Some("second.vpk".into()),
    winner_value: None,
    use_vanilla: false,
  };
  let PreparedData {
    repairs, warnings, ..
  } = prepare(&tables, &[resolution.clone()]).unwrap();
  assert!(repairs.is_empty());
  assert_eq!(warnings.len(), 1);
  assert_eq!(warnings[0].mod_id, "second");
  assert_eq!(warnings[0].target_row, "missing");
  let temp = tempfile::tempdir().unwrap();
  let mut plan = LocalizationOverlayPlan::build(temp.path(), &[]).unwrap();
  plan.compiled_data = tables;
  let preview = plan.analyze(&[resolution.clone()]).unwrap();
  let output = plan
    .write(&temp.path().join("choices_dir.vpk"), &[resolution.clone()])
    .unwrap();
  assert_eq!(preview.data_repairs.len(), output.data_repairs.len());
  assert_eq!(preview.data_warnings.len(), output.data_warnings.len());
  assert_eq!(output.data_warnings[0].target_row, "missing");
  resolution.use_vanilla = true;
  let PreparedData {
    merged,
    repairs,
    warnings,
  } = prepare(&plan.compiled_data, &[resolution]).unwrap();
  assert!(repairs.is_empty());
  assert!(warnings.is_empty());
  assert!(row(&merged[0].root, "hero_custom").is_none());
  assert!(row(&merged[1].root, "retired").is_none());
}

#[test]
fn native_classes_resource_paths_and_vanilla_fallbacks_are_not_missing_rows() {
  let authored = definition(vec![
    (
      "m_strModelName",
      Kv3Value::String("models/not_a_table_row.vmdl".into()),
    ),
    ("m_strCSSClass", Kv3Value::String("not_a_definition".into())),
  ]);
  let table = build_compiled_table(
    ABILITIES_PATH,
    compiled_resource(vec![("ability_current".into(), authored.clone())]),
    vec![source("author", 0, vec![("custom".into(), authored)])],
    None,
  )
  .unwrap();
  let vanilla = bound_hero("engine_fallback");
  let mut changed = vanilla.clone();
  let Kv3Value::Object(fields) = &mut changed else {
    unreachable!()
  };
  fields.push(("health".into(), Kv3Value::Int(900)));
  let hero = heroes(
    vec![source(
      "hero-mod",
      0,
      vec![("hero_current".into(), changed)],
    )],
    vec![("hero_current".into(), vanilla)],
  );
  let PreparedData {
    repairs, warnings, ..
  } = prepare(&[hero, table], &[]).unwrap();
  assert!(repairs.is_empty());
  assert!(warnings.is_empty());
}

#[test]
fn current_and_authored_definitions_take_precedence_over_retired_copies() {
  let mut target = abilities(vec![(
    "retired".into(),
    definition(vec![("damage", Kv3Value::Int(10))]),
  )]);
  let authored = definition(vec![("damage", Kv3Value::Int(70))]);
  let group = CompiledDataGroup {
    key: "authored".into(),
    file_path: ABILITIES_PATH.into(),
    row_name: "retired".into(),
    path: vec![],
    existed_in_vanilla: false,
    candidates: vec![CompiledDataCandidateValue {
      candidate: CompiledDataCandidate {
        mod_id: "author".into(),
        source_vpk: "author.vpk".into(),
        priority: 0,
      },
      value: authored.clone(),
      encoding: target.retired_rows["retired"][0].encoding.clone(),
      unrebased: None,
    }],
  };
  target.groups.insert(group.key.clone(), group);
  let PreparedData {
    merged,
    repairs,
    warnings,
  } = prepare(&[hero_table("retired"), target], &[]).unwrap();
  assert_eq!(row(&merged[1].root, "retired"), Some(&authored));
  assert!(repairs.is_empty());
  assert!(warnings.is_empty());
}

#[test]
fn visibility_findings_only_report_mod_introduced_missing_fields() {
  let current = Kv3Value::Object(vec![
    (
      "_class".into(),
      Kv3Value::String("CitadelHeroData_t".into()),
    ),
    ("m_bDisabled".into(), Kv3Value::Bool(false)),
    ("m_bInDevelopment".into(), Kv3Value::Bool(false)),
    (DEVELOPMENT_STATE.into(), Kv3Value::String("Release".into())),
  ]);
  let mut custom = current.clone();
  let Kv3Value::Object(fields) = &mut custom else {
    unreachable!()
  };
  fields.retain(|(k, _)| k != DEVELOPMENT_STATE);
  let table = heroes(
    vec![source(
      "author",
      0,
      vec![
        ("hero_custom".into(), custom.clone()),
        ("hero_fallback".into(), custom.clone()),
      ],
    )],
    vec![
      ("hero_current".into(), current),
      ("hero_fallback".into(), custom),
    ],
  );
  let PreparedData {
    repairs, warnings, ..
  } = prepare(&[table], &[]).unwrap();
  assert!(repairs.is_empty());
  assert_eq!(warnings.len(), 1);
  assert_eq!(warnings[0].row_name, "hero_custom");
  assert!(matches!(
    warnings[0].kind,
    WarningKind::MissingDevelopmentState
  ));
}

fn inherited_table(extra_sources: Vec<CompiledDataSource>, ambiguous: bool) -> CompiledDataTable {
  let old_parent = definition(vec![
    ("damage", Kv3Value::Int(10)),
    ("obsolete", Kv3Value::Int(42)),
    ("m_eMode", Kv3Value::String("OldMode".into())),
  ]);
  let new_parent = definition(vec![
    ("damage", Kv3Value::Int(20)),
    ("required", Kv3Value::Int(7)),
    ("m_eMode", Kv3Value::String("NewMode".into())),
  ]);
  let mut historical = vec![("template".into(), old_parent.clone())];
  let mut current = vec![("template".into(), new_parent.clone())];
  if ambiguous {
    historical.push(("other_template".into(), old_parent));
    current.push(("other_template".into(), new_parent));
  }
  let child = definition(vec![
    ("damage", Kv3Value::Int(99)),
    ("obsolete", Kv3Value::Int(42)),
    ("m_eMode", Kv3Value::String("OldMode".into())),
    (
      "_multibase",
      Kv3Value::Array(if ambiguous {
        vec![
          Kv3Value::String("template".into()),
          Kv3Value::String("other_template".into()),
        ]
      } else {
        vec![Kv3Value::String("template".into())]
      }),
    ),
  ]);
  historical.push(("retired_child".into(), child.clone()));
  for i in 0..40 {
    historical.push((format!("unchanged_{i}"), Kv3Value::Int(i)));
    current.push((format!("unchanged_{i}"), Kv3Value::Int(i)));
  }
  let history = VdataHistoryIndex::from_bytes(
    &crate::mod_manager::vdata_history::encode_history_index(&[(
      ABILITIES_PATH.into(),
      vec![(1, Kv3Value::Object(historical.clone()))],
    )])
    .unwrap(),
  )
  .unwrap();
  historical.push(("authored_child".into(), child));
  let mut sources = vec![source("author", 0, historical)];
  sources.extend(extra_sources);
  build_compiled_table(
    ABILITIES_PATH,
    compiled_resource(current),
    sources,
    Some(&history),
  )
  .unwrap()
}

#[test]
fn declared_inheritance_updates_defaults_and_preserves_distinct_child_settings() {
  let table = inherited_table(vec![], false);
  let tables = vec![hero_table("retired_child"), table];
  let PreparedData {
    merged,
    repairs,
    warnings,
  } = prepare(&tables, &[]).unwrap();
  assert!(warnings.is_empty());
  assert_eq!(repairs.len(), 2);
  for name in ["retired_child", "authored_child"] {
    let child = row(&merged[1].root, name).unwrap();
    assert_eq!(child.get("damage"), Some(&Kv3Value::Int(99)));
    assert_eq!(child.get("required"), Some(&Kv3Value::Int(7)));
    assert!(child.get("obsolete").is_none());
    assert_eq!(
      child.get("m_eMode").and_then(Kv3Value::as_str),
      Some("NewMode")
    );
    assert_eq!(
      child.get("_multibase"),
      Some(&Kv3Value::Array(vec![Kv3Value::String("template".into())]))
    );
  }
  assert!(
    repairs
      .iter()
      .any(|repair| matches!(repair.kind, RepairKind::InheritedDefinition))
  );
}

#[test]
fn template_overrides_disable_rebasing_until_the_user_selects_vanilla() {
  let template = definition(vec![
    ("damage", Kv3Value::Int(70)),
    ("required", Kv3Value::Int(7)),
    ("m_eMode", Kv3Value::String("NewMode".into())),
  ]);
  let table = inherited_table(
    vec![source(
      "template-mod",
      1,
      vec![("template".into(), template)],
    )],
    false,
  );
  let key = table
    .groups
    .values()
    .find(|group| group.row_name == "template")
    .unwrap()
    .key
    .clone();
  let PreparedData {
    merged,
    repairs,
    warnings,
  } = prepare(std::slice::from_ref(&table), &[]).unwrap();
  let child = row(&merged[0].root, "authored_child").unwrap();
  assert_eq!(child.get("obsolete"), Some(&Kv3Value::Int(42)));
  assert!(child.get("required").is_none());
  assert!(repairs.is_empty());
  assert_eq!(warnings.len(), 1);
  assert!(matches!(
    warnings[0].kind,
    WarningKind::UnverifiedInheritance
  ));
  let resolution = LocalizationResolution {
    conflict_key: key,
    winner_mod_id: None,
    winner_value: None,
    winner_source_vpk: None,
    use_vanilla: true,
  };
  let PreparedData {
    merged,
    repairs,
    warnings,
  } = prepare(&[table], &[resolution]).unwrap();
  assert!(
    row(&merged[0].root, "authored_child")
      .unwrap()
      .get("obsolete")
      .is_none()
  );
  assert_eq!(repairs.len(), 1);
  assert!(warnings.is_empty());
}

#[test]
fn equally_eligible_declared_templates_are_not_guessed() {
  let PreparedData {
    merged,
    repairs,
    warnings,
  } = prepare(&[inherited_table(vec![], true)], &[]).unwrap();
  let child = row(&merged[0].root, "authored_child").unwrap();
  assert_eq!(child.get("obsolete"), Some(&Kv3Value::Int(42)));
  assert!(child.get("required").is_none());
  assert!(repairs.is_empty());
  assert_eq!(warnings.len(), 1);
  assert!(matches!(
    warnings[0].kind,
    WarningKind::UnverifiedInheritance
  ));
  assert!(matches!(
    warnings[0].reason,
    WarningReason::AmbiguousTemplates
  ));
}

#[test]
fn unavailable_ability_binding_uses_current_contract_and_preserves_custom_model() {
  let mut authored = bound_hero("missing_legacy_ability");
  let Kv3Value::Object(fields) = &mut authored else {
    panic!("hero object");
  };
  fields.push((
    "m_strModelName".into(),
    Kv3Value::String("models/custom.vmdl".into()),
  ));
  let table = heroes(
    vec![source("skin", 0, vec![("hero_test".into(), authored)])],
    vec![("hero_test".into(), bound_hero("current_ability"))],
  );
  let PreparedData {
    merged,
    repairs,
    warnings,
  } = prepare(&[table, abilities(vec![])], &[]).unwrap();
  let actual = row(&merged[0].root, "hero_test").unwrap();
  assert_eq!(
    actual.get("m_mapBoundAbilities"),
    bound_hero("current_ability").get("m_mapBoundAbilities")
  );
  assert_eq!(
    actual.get("m_strModelName").and_then(Kv3Value::as_str),
    Some("models/custom.vmdl")
  );
  assert_eq!(repairs.len(), 1);
  assert!(warnings.is_empty());
}

#[test]
fn obsolete_optional_ability_slot_is_removed_without_dropping_other_bindings() {
  let mut authored = bound_hero("current_ability");
  let Kv3Value::Object(fields) = authored.get_mut("m_mapBoundAbilities").unwrap() else {
    panic!("bound abilities object");
  };
  fields.push((
    "ESlot_Cosmetic_1".into(),
    Kv3Value::String("cosmetic_item_snowball".into()),
  ));
  let table = heroes(
    vec![source("skin", 0, vec![("hero_test".into(), authored)])],
    vec![("hero_test".into(), bound_hero("current_ability"))],
  );
  let PreparedData {
    merged,
    repairs,
    warnings,
  } = prepare(&[table, abilities(vec![])], &[]).unwrap();
  assert_eq!(
    row(&merged[0].root, "hero_test")
      .unwrap()
      .get("m_mapBoundAbilities"),
    bound_hero("current_ability").get("m_mapBoundAbilities")
  );
  assert_eq!(repairs.len(), 1);
  assert!(warnings.is_empty());
}

#[test]
fn recoverable_authored_ability_takes_precedence_over_current_binding_fallback() {
  let table = heroes(
    vec![source(
      "skin",
      0,
      vec![("hero_test".into(), bound_hero("retired_custom_ability"))],
    )],
    vec![("hero_test".into(), bound_hero("current_ability"))],
  );
  let PreparedData {
    merged,
    repairs,
    warnings,
  } = prepare(
    &[
      table,
      abilities(vec![("retired_custom_ability".into(), definition(vec![]))]),
    ],
    &[],
  )
  .unwrap();
  assert_eq!(
    row(&merged[0].root, "hero_test")
      .unwrap()
      .get("m_mapBoundAbilities"),
    bound_hero("retired_custom_ability").get("m_mapBoundAbilities")
  );
  assert_eq!(repairs.len(), 1);
  assert!(matches!(repairs[0].kind, RepairKind::RetainedDependency));
  assert!(warnings.is_empty());
}

#[test]
fn current_native_fallback_reference_remains_when_mod_only_changes_the_model() {
  let mut authored = bound_hero("native_engine_fallback");
  let Kv3Value::Object(fields) = &mut authored else {
    panic!("hero object");
  };
  fields.push((
    "m_strModelName".into(),
    Kv3Value::String("models/custom.vmdl".into()),
  ));
  let table = heroes(
    vec![source("skin", 0, vec![("hero_test".into(), authored)])],
    vec![("hero_test".into(), bound_hero("native_engine_fallback"))],
  );
  let PreparedData {
    merged,
    repairs,
    warnings,
  } = prepare(&[table, abilities(vec![])], &[]).unwrap();
  assert_eq!(
    row(&merged[0].root, "hero_test")
      .unwrap()
      .get("m_mapBoundAbilities"),
    bound_hero("native_engine_fallback").get("m_mapBoundAbilities")
  );
  assert!(repairs.is_empty());
  assert!(warnings.is_empty());
}

#[test]
fn unavailable_new_hero_is_not_removed_while_another_definition_inherits_it() {
  let child = Kv3Value::Object(vec![
    (
      "_class".into(),
      Kv3Value::String("CitadelHeroData_t".into()),
    ),
    ("_base".into(), Kv3Value::String("hero_template".into())),
  ]);
  let table = heroes(
    vec![source(
      "skin",
      0,
      vec![
        ("hero_template".into(), bound_hero("missing_ability")),
        ("hero_child".into(), child),
      ],
    )],
    vec![],
  );
  let PreparedData {
    merged, warnings, ..
  } = prepare(&[table, abilities(vec![])], &[]).unwrap();
  assert!(row(&merged[0].root, "hero_template").is_some());
  assert!(row(&merged[0].root, "hero_child").is_some());
  assert!(
    warnings
      .iter()
      .any(|warning| matches!(warning.kind, WarningKind::MissingDefinition))
  );
  assert!(
    !warnings
      .iter()
      .any(|warning| matches!(warning.kind, WarningKind::OmittedHeroDefinition))
  );
}
