use super::*;

fn rewrite(text: &str, paths: Option<&[String]>, deadworks: bool) -> Result<String, Error> {
  let mode = paths.map_or(MountMode::Disabled, MountMode::Enabled);
  super::rewrite(text, mode, deadworks).map(|result| result.content)
}

#[test]
fn conditional_roles_do_not_become_unconditional_defaults() {
  let original = fixture().replace(FOREIGN, "").replace(
    "      Game citadel\n",
    "      Mod linux_mod [$LINUX]\n      Write linux_write [$LINUX]\n      Game citadel\n",
  );
  let mounted = rewrite(&original, Some(&paths()), false).unwrap();
  let expected = "citadel";
  assert!(mounted.contains(&format!("Mod\t\t\"{expected}\" // dmm-search-path")));
  let expected_write = "citadel";
  assert!(mounted.contains(&format!("Write\t\t\"{expected_write}\" // dmm-search-path")));
  assert!(mounted.contains("Mod linux_mod [$LINUX]"));
  assert!(mounted.contains("Write linux_write [$LINUX]"));
  assert_eq!(rewrite(&mounted, None, false).unwrap(), original);
}

#[test]
fn conditional_game_roots_supply_defaults_only_on_their_platform() {
  let original = fixture().replace(FOREIGN, "").replace(
    "      Game citadel\n",
    "      Game linux_base [$LINUX]\n      Game citadel\n",
  );
  let mounted = rewrite(&original, Some(&paths()), false).unwrap();
  let expected = "citadel";
  assert!(mounted.contains(&format!("Mod\t\t\"{expected}\" // dmm-search-path")));
  assert_eq!(rewrite(&mounted, None, false).unwrap(), original);
}

#[test]
fn client_conditions_apply_to_windows_and_proton_launches() {
  let original = fixture().replace(FOREIGN, "").replace(
    "      Game citadel\n",
    "      Mod win_mod [$WIN64]\n      Write win_write [!$LINUX]\n      Game citadel\n",
  );
  let mounted = rewrite(&original, Some(&paths()), false).unwrap();
  assert!(mounted.contains("Mod\t\t\"win_mod\" // dmm-search-path"));
  assert!(mounted.contains("Write\t\t\"win_write\" // dmm-search-path"));
  assert_eq!(rewrite(&mounted, None, false).unwrap(), original);
}

#[test]
fn unknown_conditions_do_not_guess_a_new_default() {
  let original = fixture().replace("      Mod citadel", "      Mod custom_mod [$CUSTOM]");
  assert!(rewrite(&original, Some(&paths()), false).is_err());
  assert_eq!(rewrite(&original, None, false).unwrap(), original);
}

#[test]
fn foreign_fences_cannot_move_profile_mounts_below_stock_paths() {
  let original = fixture().replace(FOREIGN, "")
    .replace("      Game citadel\n", "      // Other tool BEGIN\n      Game citadel/deadworks_mods\n      Mod citadel\n      Write citadel\n      Game citadel\n      // Other tool END\n");
  let mounted = rewrite(&original, Some(&paths()), true).unwrap();
  assert!(mounted.find("citadel/deadworks_mods").unwrap() < mounted.find(&paths()[0]).unwrap());
  assert!(mounted.find(&paths()[0]).unwrap() < mounted.find("      Game citadel\n").unwrap());
  assert_eq!(rewrite(&mounted, None, false).unwrap(), original);
}

// Captured from the actual renderer in Deadworks-net/deadworks at 4656f48056b0.
const DEADWORKS_FIRST: &str = include_str!("fixtures/deadworks-first.gi");
const DEADWORKS_AFTER_DMM: &str = include_str!("fixtures/deadworks-after-dmm.gi");

fn assert_defaults(text: &str, expected: &str) {
  let doc = Document::parse(text).unwrap();
  for role in ["Mod", "Write"] {
    let effective = doc
      .entries()
      .find(|site| has_role(site, role))
      .or_else(|| doc.entries().find(|site| has_role(site, "Game")))
      .unwrap();
    let SiteKind::Scalar { value, .. } = &effective.kind else {
      panic!("not a scalar")
    };
    assert_eq!(value, expected, "{role} was redirected:\n{text}");
  }
}

fn deadworks_block(text: &str) -> &str {
  let start = text.find("// Deadworks Launcher - Start").unwrap();
  let end = text.find("// Deadworks Launcher - End").unwrap();
  &text[start..line_end(text, end)]
}

#[test]
fn deadworks_launcher_first_preserves_its_complete_block_and_priority() {
  for newline in ["\n", "\r\n"] {
    for detected in [false, true] {
      let original = DEADWORKS_FIRST.replace('\n', newline);
      let mounted = rewrite(&original, Some(&paths()), detected).unwrap();
      assert!(mounted.contains(deadworks_block(&original)));
      assert_eq!(mounted.matches("citadel/deadworks_mods").count(), 1);
      assert_eq!(mounted.matches("citadel/deadworks_addons").count(), 1);
      assert!(mounted.find("citadel/deadworks_mods").unwrap() < mounted.find(&paths()[0]).unwrap());
      assert_eq!(
        rewrite(&mounted, Some(&paths()), detected).unwrap(),
        mounted
      );
      let other = vec!["citadel/addons/profile_other".into()];
      let updated = rewrite(&mounted, Some(&other), detected).unwrap();
      assert_eq!(mounted_paths(&updated).unwrap(), other);
      assert_eq!(rewrite(&updated, None, detected).unwrap(), original);
      assert_defaults(&mounted, "citadel");
    }
  }
}

#[test]
fn deadworks_launcher_after_dmm_keeps_dependent_defaults_through_cleanup() {
  for newline in ["\n", "\r\n"] {
    for default in ["citadel", "custom_root"] {
      let original = DEADWORKS_AFTER_DMM.replace('\n', newline).replace(
        "\"citadel\" // dmm-search-path",
        &format!("\"{default}\" // dmm-search-path"),
      );
      let cleaned = rewrite(&original, None, true).unwrap();
      assert!(cleaned.contains(deadworks_block(&original)));
      assert!(mounted_paths(&cleaned).unwrap().is_empty());
      assert_eq!(rewrite(&cleaned, None, true).unwrap(), cleaned);
      assert_defaults(&cleaned, default);
      let enabled = rewrite(&cleaned, Some(&paths()), true).unwrap();
      assert_eq!(enabled.matches("citadel/deadworks_mods").count(), 1);
      assert_eq!(enabled.matches("citadel/deadworks_addons").count(), 1);
      assert_eq!(mounted_paths(&enabled).unwrap(), paths());
      assert_eq!(rewrite(&enabled, None, true).unwrap(), cleaned);
      assert_defaults(&enabled, default);
    }
  }
}

#[test]
fn legacy_bare_deadworks_entries_survive_migration_and_cleanup() {
  let bare = "      Game citadel/deadworks_mods\n      addonroot citadel/deadworks_addons\n";
  let original = fixture()
    .replace(FOREIGN, bare)
    .replace(
      "    \"SearchPaths\"",
      &format!("{LEGACY_START}\n    \"SearchPaths\""),
    )
    .replace("    }\n  }", &format!("    }}\n{LEGACY_END}\n  }}"));
  for detected in [false, true] {
    assert!(rewrite(&original, None, detected).unwrap().contains(bare));
    let migrated = rewrite(&original, Some(&paths()), detected).unwrap();
    assert_eq!(migrated.matches("citadel/deadworks_mods").count(), 1);
    let cleaned = rewrite(&migrated, None, detected).unwrap();
    assert!(cleaned.contains(bare));
    assert_defaults(&cleaned, "citadel");
  }
}

#[test]
fn conditional_or_late_deadworks_mounts_do_not_hide_required_bootstrap_paths() {
  let conditional = fixture().replace(
    "      Game citadel\n",
    "      Game citadel/deadworks_mods [$LINUX]\n      Game citadel\n",
  );
  let late = fixture().replace(
    "      Game core",
    "      Game citadel/deadworks_mods\n      Game core",
  );
  for original in [conditional, late] {
    let mounted = rewrite(&original, Some(&paths()), true).unwrap();
    assert!(mounted.contains("Game\t\tcitadel/deadworks_mods // dmm-search-path"));
    assert!(mounted.find(&paths()[0]).unwrap() < mounted.find("      Game citadel\n").unwrap());
    assert_eq!(rewrite(&mounted, None, false).unwrap(), original);
  }
}

#[test]
fn deadworks_nested_in_another_tool_block_is_not_split() {
  let foreign = FOREIGN.replace(
    "      Game citadel/hyperline/startup",
    &format!(
      "      {}      Game citadel/hyperline/startup",
      deadworks_block(DEADWORKS_AFTER_DMM)
    ),
  );
  let original = fixture().replace(FOREIGN, &foreign);
  let mounted = rewrite(&original, Some(&paths()), true).unwrap();
  let (startup, panorama) = foreign
    .split_once("      // HYPERLINE PANORAMA BEGIN")
    .unwrap();
  assert!(mounted.contains(startup));
  assert!(mounted.contains(&format!("      // HYPERLINE PANORAMA BEGIN{panorama}")));
  assert_eq!(mounted.matches("citadel/deadworks_mods").count(), 1);
  assert!(mounted.find("citadel/deadworks_mods").unwrap() < mounted.find(&paths()[0]).unwrap());
  assert_eq!(rewrite(&mounted, None, true).unwrap(), original);
}

#[test]
fn unrelated_end_comments_do_not_close_another_tools_fence() {
  let foreign = FOREIGN.replace(
    "      Game citadel/hyperline/startup",
    &format!(
      "      {}      // Diagnostic END\n      Game citadel/hyperline/startup",
      deadworks_block(DEADWORKS_AFTER_DMM)
    ),
  );
  let original = fixture().replace(FOREIGN, &foreign);
  let mounted = rewrite(&original, Some(&paths()), true).unwrap();
  let (startup, _) = foreign
    .split_once("      // HYPERLINE PANORAMA BEGIN")
    .unwrap();
  assert!(mounted.contains(startup));
  assert_eq!(rewrite(&mounted, None, true).unwrap(), original);
}

const FOREIGN: &str = "      // HYPERLINE STARTUP BEGIN\n      Game citadel/hyperline/startup\n      Mod citadel\n      Write citadel\n      // HYPERLINE STARTUP END\n      // HYPERLINE PANORAMA BEGIN\n      Game citadel/hyperline/panorama [$WIN64]\n      // HYPERLINE PANORAMA END\n";

fn fixture() -> String {
  format!(
    "\"GameInfo\"\n{{\n  // SearchPaths {{ mentioned in a comment }} — café\n  FileSystem\n  {{\n    \"SearchPaths\" // engine mounts\n    {{\n      Game_UILanguage citadel_*LANGUAGE*\n{FOREIGN}      Game citadel\n      Game core\n    }}\n  }}\n  ConVars {{ fps_max 240 }}\n}}"
  )
}

fn paths() -> Vec<String> {
  vec![
    "citadel/addons/server_test".into(),
    "citadel/addons2/profile_test".into(),
  ]
}

#[test]
fn enable_update_disable_round_trip_preserves_every_foreign_byte() {
  for newline in ["\n", "\r\n"] {
    for bom in ["", "\u{feff}"] {
      let original = format!("{bom}{}", fixture().replace('\n', newline));
      let mounted = rewrite(&original, Some(&paths()), false).unwrap();
      assert!(mounted.contains(&FOREIGN.replace('\n', newline)));
      assert_eq!(mounted_paths(&mounted).unwrap(), paths());
      assert_eq!(rewrite(&mounted, Some(&paths()), false).unwrap(), mounted);
      let other = vec!["citadel/addons/profile_other".into()];
      let updated = rewrite(&mounted, Some(&other), false).unwrap();
      assert_eq!(mounted_paths(&updated).unwrap(), other);
      assert!(!updated.contains("citadel/addons/server_test"));
      assert_eq!(rewrite(&updated, None, false).unwrap(), original);
      assert_eq!(rewrite(&original, None, false).unwrap(), original);
    }
  }
}

#[test]
fn legacy_migration_preserves_foreign_fences_and_unknown_addon_paths() {
  let original = fixture().replace("    \"SearchPaths\"", &format!("{LEGACY_START}\n    \"SearchPaths\""))
    .replace("      Game citadel\n", "      Game citadel/addons/server_stale\n      Game citadel/addons/unattributed\n      Game citadel/addons/profile_annotated // another tool\n      Game citadel\n")
    .replace("    }\n  }", &format!("    }}\n{LEGACY_END}\n  }}"));
  let updated = rewrite(&original, Some(&paths()), false).unwrap();
  assert!(!updated.contains(LEGACY_START));
  assert!(!updated.contains("citadel/addons/server_stale"));
  for content in [
    FOREIGN,
    "Game citadel/addons/unattributed",
    "Game citadel/addons/profile_annotated // another tool",
  ] {
    assert!(updated.contains(content), "lost {content}");
  }
  let disabled = rewrite(&updated, None, false).unwrap();
  assert!(mounted_paths(&disabled).unwrap().is_empty());
  assert!(disabled.contains("citadel/addons/unattributed"));
  assert!(disabled.contains(FOREIGN));
}

#[test]
fn foreign_addon_entries_inside_a_foreign_fence_are_never_adopted() {
  let foreign = FOREIGN.replace(
    "citadel/hyperline/startup",
    "citadel/addons/profile_external",
  );
  let source = fixture()
    .replace(FOREIGN, &foreign)
    .replace(
      "    \"SearchPaths\"",
      &format!("{LEGACY_START}\n    \"SearchPaths\""),
    )
    .replace("    }\n  }", &format!("    }}\n{LEGACY_END}\n  }}"));
  assert!(mounted_paths(&source).unwrap().is_empty());
  assert!(rewrite(&source, None, false).unwrap().contains(&foreign));
}

#[test]
fn foreign_lines_inserted_inside_the_new_fence_survive_disable() {
  let mounted = rewrite(&fixture(), Some(&paths()), false).unwrap();
  let edited = mounted.replace(
    END,
    &format!("Game citadel/custom // user entry\n      {END}"),
  );
  let result = rewrite(&edited, None, false).unwrap();
  assert!(result.contains("Game citadel/custom // user entry"));
  assert!(result.contains(FOREIGN));
  assert!(mounted_paths(&result).unwrap().is_empty());
}

#[test]
fn markers_must_be_real_comments_in_the_correct_block() {
  let source = fixture().replace(
    "ConVars { fps_max 240 }",
    &format!("ConVars {{ note \"{START}\" }}"),
  );
  assert_eq!(
    rewrite(&rewrite(&source, Some(&[]), false).unwrap(), None, false).unwrap(),
    source
  );
  for markers in [
    START.to_string(),
    END.to_string(),
    format!("{END}\n{START}"),
    format!("{START}\n{START}\n{END}"),
    format!("{LEGACY_END}\n{LEGACY_START}"),
  ] {
    let malformed = fixture().replace(
      "      Game citadel\n",
      &format!("      {markers}\n      Game citadel\n"),
    );
    assert!(
      rewrite(&malformed, Some(&paths()), false).is_err(),
      "accepted {markers}"
    );
    assert!(rewrite(&malformed, None, false).is_err());
  }
}

#[test]
fn deadworks_server_profile_and_shards_keep_their_priority() {
  let original = fixture();
  let updated = rewrite(&original, Some(&paths()), true).unwrap();
  let ordered = [
    "citadel/deadworks_mods",
    "citadel/deadworks_addons",
    "citadel/addons/server_test",
    "citadel/addons2/profile_test",
    "citadel/hyperline/startup",
  ];
  for pair in ordered.windows(2) {
    assert!(updated.find(pair[0]).unwrap() < updated.find(pair[1]).unwrap());
  }
  assert_eq!(rewrite(&updated, None, false).unwrap(), original);
}

#[test]
fn comments_do_not_move_mounts_above_language_and_violence_paths() {
  let source = fixture().replace("      Game_UILanguage", "      // Engine localization\n      Game_LowViolence citadel_lv // Keep violence preference\n      Game_UILanguage");
  let mounted = rewrite(&source, Some(&paths()), false).unwrap();
  assert!(mounted.find("Game_UILanguage").unwrap() < mounted.find(START).unwrap());
  assert!(mounted.find("Game_LowViolence").unwrap() < mounted.find(START).unwrap());
  assert_eq!(rewrite(&mounted, None, false).unwrap(), source);
}

#[test]
fn default_roles_stay_on_the_original_game_path() {
  let original = "GameInfo\n{\n FileSystem\n {\n  SearchPaths\n  {\n   Game custom_base\n   Game core\n  }\n }\n}";
  let updated = rewrite(original, Some(&[]), false).unwrap();
  assert!(updated.contains("Mod\t\t\"custom_base\""));
  assert!(updated.contains("Write\t\t\"custom_base\""));
  assert_eq!(rewrite(&updated, None, false).unwrap(), original);
}

#[test]
fn compound_roles_and_existing_custom_write_paths_are_preserved() {
  let original = fixture()
    .replace("      Mod citadel", "      Mod+Game custom_mod")
    .replace("      Write citadel", "      Write custom_write");
  let updated = rewrite(&original, Some(&[]), false).unwrap();
  assert!(updated.contains("Mod\t\t\"custom_mod\""));
  assert!(updated.contains("Write\t\t\"custom_write\""));
  assert_eq!(rewrite(&updated, None, false).unwrap(), original);
}

#[test]
fn only_the_active_search_paths_block_is_changed() {
  let later = "    SearchPaths { Game secondary }\n";
  let original = fixture().replace("  ConVars", &format!("  Other {{ {later} }}\n  ConVars"));
  let result = rewrite(&original, Some(&[]), false).unwrap();
  assert!(result.contains(later));
  assert_eq!(rewrite(&result, None, false).unwrap(), original);
}

#[test]
fn compact_documents_stay_valid_and_repeated_mounts_are_stable() {
  let original = "GameInfo { FileSystem { SearchPaths { Game citadel Game core } } }";
  let mounted = rewrite(
    "GameInfo { FileSystem { SearchPaths { Game citadel Game core } } }",
    Some(&[]),
    false,
  )
  .unwrap();
  assert_eq!(rewrite(&mounted, Some(&[]), false).unwrap(), mounted);
  let disabled = rewrite(&mounted, None, false).unwrap();
  assert_eq!(disabled, original);
  assert!(disabled.contains("Game citadel Game core"));
  validate(&disabled).unwrap();
}
