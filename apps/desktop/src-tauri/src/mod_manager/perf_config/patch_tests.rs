use std::path::Path;

use super::test_support::*;
use super::*;
use crate::mod_manager::game_config_manager::GameConfigManager;
use crate::mod_manager::perf_config::catalog::Catalog;
use crate::mod_manager::perf_config::live::LiveGameinfo;
use crate::mod_manager::perf_config::resolve::{ResolveOptions, resolve};
use crate::mod_manager::perf_config::types::{ConfigEntry, EntryStatus};

const EOLS: [&str; 2] = ["\n", "\r\n"];

fn plan<'a>(entries: &'a [ResolvedEntry], rev: &'a str) -> OverlayPlan<'a> {
  OverlayPlan {
    config_id: "preset:test",
    name: "Test config",
    rev,
    entries: entries.iter().collect(),
    credits: vec![
      "values by Someone (GPL-3.0)".to_string(),
      "https://github.com/someone/configs @ 0123456789ab".to_string(),
    ],
  }
}

/// The entries `resolve` would hand the patcher for `config` on `base`.
fn applied_entries(catalog: &Catalog, base: &str, config: &[ConfigEntry]) -> Vec<ResolvedEntry> {
  let live = LiveGameinfo::parse(base).expect("parse base");
  let options = ResolveOptions {
    overrides: &[],
    include_engine_sections: true,
  };
  resolve(catalog, config, &live, &options)
    .entries
    .into_iter()
    .filter(|entry| entry.status == EntryStatus::Applies)
    .collect()
}

fn apply(base: &str, entries: &[ResolvedEntry]) -> String {
  apply_overlay(base, &plan(entries, "0123456789ab")).expect("apply overlay")
}

fn current_stock(eol: &str) -> String {
  with_eol(&fixture(CURRENT_STOCK), eol)
}

fn synthetic_on_current(eol: &str) -> (String, String) {
  let catalog = test_catalog();
  let base = current_stock(eol);
  let entries = applied_entries(&catalog, &base, &synthetic_config());
  let patched = apply(&base, &entries);
  (base, patched)
}

fn lines_of(text: &str) -> Vec<&str> {
  text
    .split('\n')
    .map(|line| line.trim_end_matches('\r'))
    .collect()
}

fn assert_round_trip(base: &str, config: &[ConfigEntry], catalog: &Catalog, label: &str) {
  let entries = applied_entries(catalog, base, config);
  assert!(!entries.is_empty(), "{label}: nothing to apply");
  let patched = apply(base, &entries);
  assert_ne!(patched, base, "{label}");
  assert!(patched.contains(BEGIN_MARKER), "{label}");
  let (stripped, applied) = strip_overlay(&patched);
  assert!(stripped == base, "{label}: strip is not byte-identical");
  let applied = applied.expect("overlay is described");
  assert_eq!(applied.config_id, "preset:test", "{label}");
  assert_eq!(applied.rev, "0123456789ab", "{label}");
  assert!(
    applied.hand_edited.is_empty(),
    "{label}: {:?}",
    applied.hand_edited
  );
  assert_eq!(
    apply(&stripped, &entries),
    patched,
    "{label}: reapply differs"
  );
  assert!(detect_foreign(&patched).is_empty(), "{label}");
}

#[test]
fn apply_then_strip_is_byte_identical() {
  let catalog = test_catalog();
  let sqooky = fixture(SQOOKY);
  let optilock = fixture(OPTILOCK);
  for name in STOCK_FIXTURES {
    let stock = fixture(name);
    let configs = [
      ("synthetic", synthetic_config()),
      ("sqooky", config_from_file(&sqooky, &stock)),
      ("optilock", config_from_file(&optilock, &stock)),
    ];
    for eol in EOLS {
      let base = with_eol(&stock, eol);
      for (config_name, config) in &configs {
        assert_round_trip(
          &base,
          config,
          &catalog,
          &format!("{name} {eol:?} {config_name}"),
        );
      }
    }
    let unterminated = with_eol(&stock, "\r\n").trim_end().to_string();
    assert_round_trip(
      &unterminated,
      &synthetic_config(),
      &catalog,
      &format!("{name} without final newline"),
    );
  }
}

#[test]
fn applies_on_top_of_community_files() {
  let catalog = test_catalog();
  for name in [SQOOKY, OPTILOCK] {
    let base = fixture(name);
    assert_round_trip(&base, &synthetic_config(), &catalog, name);
    let markers = base.matches("// Deadlock Mod Manager - Start").count();
    let entries = applied_entries(&catalog, &base, &synthetic_config());
    let patched = apply(&base, &entries);
    assert_eq!(
      patched.matches("// Deadlock Mod Manager - Start").count(),
      markers
    );
    assert_eq!(
      patched.matches("citadel/addons").count(),
      base.matches("citadel/addons").count()
    );
  }
}

#[test]
fn mixed_line_endings_survive_a_round_trip() {
  let catalog = test_catalog();
  let crlf = current_stock("\r\n");
  let split = crlf.find("\tConVars").expect("ConVars");
  let base = format!("{}{}", &crlf[..split], crlf[split..].replace("\r\n", "\n"));
  assert_round_trip(&base, &synthetic_config(), &catalog, "mixed");
}

#[test]
fn switching_configs_never_accumulates_markers() {
  let catalog = test_catalog();
  let base = current_stock("\r\n");
  let first = applied_entries(&catalog, &base, &synthetic_config());
  let second = applied_entries(&catalog, &base, &config_from_file(&fixture(SQOOKY), &base));
  let mut text = base.clone();
  for entries in [&first, &second, &first, &second] {
    let (stripped, _) = strip_overlay(&text);
    text = apply(&stripped, entries);
    assert_eq!(text.matches(BEGIN_MARKER).count(), 1);
    assert_eq!(text.matches(END_MARKER).count(), 1);
    assert!(
      text
        .lines()
        .all(|line| line.matches("dmm-perf").count() <= 1)
    );
  }
  assert!(strip_overlay(&text).0 == base);
}

#[test]
fn edits_keep_quoting_spacing_and_trailing_comments() {
  let (_, patched) = synthetic_on_current("\r\n");
  let lines = lines_of(&patched);
  assert!(lines.contains(&"\t\t\"fps_max\"\t\t\"0\" // dmm-perf was \"400\""));
  assert!(lines.contains(
    &"\t\t\"cl_tickpacket_recvmargin_desired\" \"9\" \t\t\t\t\t// 5 ms base, min. floor for protecting against thrashing the queue // dmm-perf was \"5\""
  ));
  assert!(lines.contains(&"\t\tCSMCascadeResolution 512 // dmm-perf was 2048"));
  assert!(lines.contains(&"\t\t\"LowLatency\"\t\t\t\t\t\t\t\t\"0\" // dmm-perf was \"1\""));
  assert!(lines.contains(&"\t\t\tFakeLag\t\t\t0 // dmm-perf was 40"));
}

#[test]
fn duplicate_keys_are_edited_everywhere_and_never_injected() {
  let (_, patched) = synthetic_on_current("\n");
  let edited = "\t\t\"snd_steamaudio_enable_pathing\"\t\t\t\t\"1\" // dmm-perf was \"0\"";
  assert_eq!(
    lines_of(&patched)
      .iter()
      .filter(|line| **line == edited)
      .count(),
    2
  );
  assert_eq!(patched.matches("snd_steamaudio_enable_pathing").count(), 2);
}

#[test]
fn object_leaves_are_edited_and_added_inside_their_block() {
  let (_, patched) = synthetic_on_current("\r\n");
  let lines = lines_of(&patched);
  let rate = lines
    .iter()
    .position(|line| *line == "\t\t\"rate\"")
    .expect("rate block");
  assert_eq!(
    &lines[rate..rate + 7],
    &[
      "\t\t\"rate\"",
      "\t\t{",
      "\t\t\t\"min\"\t\t\"98304\"",
      "\t\t\t\"default\"\t\"786432\"",
      "\t\t\t\"max\"\t\t\"2000000\" // dmm-perf was \"1000000\"",
      "\t\t\t\"version\"\t\t\"3\" // dmm-perf added",
      "\t\t}",
    ]
  );
}

#[test]
fn comment_outs_round_trip() {
  let (base, patched) = synthetic_on_current("\r\n");
  let lines = lines_of(&patched);
  assert!(lines.contains(&"\t\t// dmm-perf removed: \"sv_minrate\"\t\"98304\""));
  assert!(lines.contains(&"\t\t// dmm-perf removed: CubemapFog 1"));
  let live = LiveGameinfo::parse(&base).expect("parse");
  assert_eq!(live.value(&path("ConVars/sv_minrate")), Some("98304"));
  let sites = parse_sites(&patched).expect("parse patched");
  let values = scalar_values(&sites);
  assert!(!values.contains_key("convars/sv_minrate"));
  assert!(!values.contains_key("scenesystem/cubemapfog"));
}

#[test]
fn engine_sections_are_edited_and_extended_in_place() {
  let (_, patched) = synthetic_on_current("\n");
  let lines = lines_of(&patched);
  let added = lines
    .iter()
    .position(|line| *line == "\t\t\"DmmTestKey\"\t\t\"1\" // dmm-perf added")
    .expect("added key");
  assert_eq!(lines[added - 1], "\t\tComputeShaderSkinning 1");
  assert_eq!(lines[added + 1], "\t}");
  let values = scalar_values(&parse_sites(&patched).expect("parse"));
  assert_eq!(values["scenesystem/dmmtestkey"], "1");
  assert_eq!(values["networksystem/betauniverse/fakelag"], "0");
}

#[test]
fn the_block_follows_the_convars_brace_line() {
  let (_, patched) = synthetic_on_current("\r\n");
  let lines = lines_of(&patched);
  let convars = lines
    .iter()
    .position(|line| *line == "\tConVars")
    .expect("ConVars");
  assert_eq!(lines[convars + 1], "\t{\t ");
  assert_eq!(
    lines[convars + 2],
    "\t\t// ==== Deadlock Mod Manager · Performance BEGIN (config=preset:test rev=0123456789ab) ===="
  );
  assert_eq!(
    lines[convars + 3],
    "\t\t// Test config: values by Someone (GPL-3.0) [dmm-perf]"
  );
  assert_eq!(
    lines[convars + 4],
    "\t\t// https://github.com/someone/configs @ 0123456789ab [dmm-perf]"
  );
  let end = lines
    .iter()
    .position(|line| *line == format!("\t\t{END_MARKER}"))
    .expect("END");
  let injected: Vec<&str> = lines[convars + 5..end].to_vec();
  assert_eq!(
    injected,
    [
      "\t\t\"r_ssao\"\t\t\"0\"",
      "\t\t\"lb_enable_shadow_casting\"\t\t\"false\"",
      "\t\t\"r_farz\"\t\t\"7000\"",
    ]
  );
  assert_eq!(lines[end + 1], "\t\t\"rate\"");
}

#[test]
fn markers_never_spell_strings_other_code_looks_for() {
  let base = current_stock("\r\n");
  let entries = [applies("ConVars/r_ssao", Some("0"))];
  let hostile = "citadel/addons SearchPaths // Deadlock Mod Manager - Start {x} \
                 // ==== Deadlock Mod Manager · Performance END ==== grimoire-perf dmm-perf \
                 Grimoire Performance Config BEGIN (preset=x v1) Editor OptimizationsPreset - Start";
  let plan = OverlayPlan {
    config_id: "user:SearchPaths/citadel/addons",
    name: hostile,
    rev: "0123456789ab",
    entries: entries.iter().collect(),
    credits: vec![
      hostile.to_string(),
      "// Deadlock Mod Manager - End\nnext".to_string(),
    ],
  };
  let patched = apply_overlay(&base, &plan).expect("apply");
  for reserved in RESERVED {
    assert_eq!(
      patched.matches(reserved).count(),
      base.matches(reserved).count(),
      "{reserved}"
    );
  }
  assert!(detect_foreign(&patched).is_empty());
  assert!(strip_overlay(&patched).0 == base);
  let applied = read_overlay(&patched).expect("overlay");
  assert_eq!(applied.config_id, marker_config_id(plan.config_id));
  assert!(!applied.config_id.contains("SearchPaths"));
}

#[test]
fn refuses_what_it_cannot_write_safely() {
  let base = current_stock("\n");
  let refused = [
    applies("FileSystem/SearchPaths/Game", Some("citadel/addons")),
    applies("ConVars/r_ssao", Some("a\"b")),
    applies("ConVars/r_ssao", Some("citadel/addons")),
    applies("ConVars/r_ssao", Some("x // dmm-perf added")),
    applies("ConVars/bad key", Some("1")),
    applies("ConVars/rate", Some("5")),
    applies("NoSuchSection/Key", Some("1")),
    applies("PGIVersion", Some("1")),
  ];
  for entry in refused {
    let entries = [entry];
    let result = apply_overlay(&base, &plan(&entries, "0123456789ab"));
    assert!(
      matches!(result, Err(Error::PerformanceConfig(_))),
      "{:?} was written",
      entries[0].path
    );
  }
  let (_, patched) = synthetic_on_current("\n");
  let entries = [applies("ConVars/r_ssao", Some("1"))];
  assert!(apply_overlay(&patched, &plan(&entries, "0123456789ab")).is_err());
}

#[test]
fn read_overlay_reports_what_the_file_alone_shows() {
  let (_, patched) = synthetic_on_current("\r\n");
  let applied = read_overlay(&patched).expect("overlay");
  assert_eq!(applied.config_id, "preset:test");
  assert_eq!(applied.rev, "0123456789ab");
  let lines = lines_of(&patched);
  let begin = lines
    .iter()
    .position(|line| line.contains(BEGIN_MARKER))
    .expect("BEGIN");
  let end = lines
    .iter()
    .position(|line| line.contains(END_MARKER))
    .expect("END");
  let marked_outside = lines
    .iter()
    .enumerate()
    .filter(|(index, line)| (*index < begin || *index > end) && line.contains("dmm-perf"))
    .count();
  assert_eq!(
    applied.line_count as usize,
    end - begin + 1 + marked_outside
  );
  assert!(applied.hand_edited.is_empty());

  let edited = patched
    .replace(
      "\"fps_max\"\t\t\"0\" // dmm-perf was \"400\"",
      "\"fps_max\"\t\t\"400\" // dmm-perf was \"400\"",
    )
    .replace("\t\t\"r_ssao\"\t\t\"0\"", "\t\t//\"r_ssao\"\t\t\"0\"")
    .replace(
      "\t\t\"DmmTestKey\"\t\t\"1\" // dmm-perf added",
      "\t\t// \"DmmTestKey\"\t\t\"1\" // dmm-perf added",
    );
  let applied = read_overlay(&edited).expect("overlay");
  assert_eq!(
    applied.hand_edited,
    vec![
      path("SceneSystem/DmmTestKey"),
      path("ConVars/r_ssao"),
      path("ConVars/fps_max"),
    ]
  );
  assert!(!strip_overlay(&edited).0.contains("dmm-perf"));
  assert_eq!(read_overlay(&current_stock("\n")), None);
}

/// Without END there is no telling where our keys stop, so the keys we
/// injected stay and only our own comment lines go.
#[test]
fn a_missing_end_marker_only_loses_our_comment_lines() {
  let (base, patched) = synthetic_on_current("\n");
  let damaged = patched.replace(&format!("\t\t{END_MARKER}\n"), "");
  let (stripped, _) = strip_overlay(&damaged);
  let injected = [
    "\t\t\"r_ssao\"\t\t\"0\"",
    "\t\t\"lb_enable_shadow_casting\"\t\t\"false\"",
    "\t\t\"r_farz\"\t\t\"7000\"",
  ];
  assert!(stripped == insert_after_convars_line(&base, &injected, "\n"));
}

/// Text after our tags, a second `was` and Grimoire's markers stacked on our
/// lines must not leave anything that blocks the next apply.
#[test]
fn stacked_markers_still_strip() {
  let catalog = test_catalog();
  let (base, patched) = synthetic_on_current("\r\n");
  let added = "\"DmmTestKey\"\t\t\"1\" // dmm-perf added";
  let was = "\"fps_max\"\t\t\"0\" // dmm-perf was \"400\"";
  let cases = [
    (
      added,
      "\"DmmTestKey\"\t\t\"1\" // dmm-perf added // tweaked",
    ),
    (
      added,
      "\"DmmTestKey\"\t\t\"2\" // dmm-perf added // grimoire-perf was \"1\"",
    ),
    (
      "\t\t\"DmmTestKey\"\t\t\"1\" // dmm-perf added",
      "\t\t// grimoire-perf removed: \"DmmTestKey\"\t\t\"1\" // dmm-perf added",
    ),
    (
      was,
      "\"fps_max\"\t\t\"60\" // dmm-perf was \"400\" // dmm-perf was \"0\"",
    ),
  ];
  for (ours, edited) in cases {
    let damaged = patched.replace(ours, edited);
    assert_ne!(damaged, patched, "{edited}");
    let (stripped, _) = strip_overlay(&damaged);
    assert!(stripped == base, "{edited}: strip differs");
    let entries = applied_entries(&catalog, &stripped, &synthetic_config());
    assert_eq!(apply(&stripped, &entries), patched, "{edited}");
  }

  let grimoire_on_ours = patched.replace(
    was,
    "\"fps_max\"\t\t\"60\" // dmm-perf was \"400\" // grimoire-perf was \"0\"",
  );
  let (stripped, _) = strip_overlay(&grimoire_on_ours);
  assert!(!stripped.contains("dmm-perf"));
  assert!(lines_of(&stripped).contains(&"\t\t\"fps_max\"\t\t\"400\" // grimoire-perf was \"0\""));
  assert_eq!(detect_foreign(&stripped)[0].tool, ForeignTool::Grimoire);
  let entries = applied_entries(&catalog, &stripped, &synthetic_config());
  assert!(strip_overlay(&apply(&stripped, &entries)).0 == stripped);
}

#[test]
fn only_markers_block_an_apply() {
  let base = current_stock("\n");
  let entries = [applies("ConVars/r_ssao", Some("0"))];
  let noted = base.replacen(
    "\tConVars\n",
    "\t// tuned with dmm-perf once\n\tConVars\n",
    1,
  );
  let patched = apply_overlay(&noted, &plan(&entries, "0123456789ab")).expect("apply");
  assert!(strip_overlay(&patched).0 == noted);

  let stray_end = base.replacen("\tConVars\n", &format!("\t{END_MARKER}\n\tConVars\n"), 1);
  let error = apply_overlay(&stray_end, &plan(&entries, "0123456789ab")).expect_err("stray END");
  let Error::PerformanceConfig(message) = error else {
    panic!("{error:?}");
  };
  let line = lines_of(&stray_end)
    .iter()
    .position(|line| line.contains(END_MARKER))
    .expect("END")
    + 1;
  assert!(message.contains(&format!("line {line}:")), "{message}");
}

#[test]
fn values_with_brackets_are_quoted() {
  let base = current_stock("\n");
  let entries = [applies(
    "NetworkSystem/BetaUniverse/FakeLag",
    Some("40[$X360]"),
  )];
  let patched = apply(&base, &entries);
  assert!(lines_of(&patched).contains(&"\t\t\tFakeLag\t\t\t\"40[$X360]\" // dmm-perf was 40"));
  assert!(strip_overlay(&patched).0 == base);
  assert!(!is_bare_token("40[$X360]"));
  assert!(!is_bare_token("1]"));
  assert!(is_bare_token("40"));
}

#[test]
fn strips_grimoire_exactly() {
  for eol in EOLS {
    let patched = with_eol(&fixture("grimoire-optilock-fps.gi"), eol);
    let stock = current_stock(eol);
    let found = detect_foreign(&patched);
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].tool, ForeignTool::Grimoire);
    assert_eq!(found[0].label.as_deref(), Some("optilock-fps v5.1"));
    assert_eq!(found[0].line_count, 18);
    let (stripped, removed) = strip_foreign(&patched);
    assert!(stripped == stock, "grimoire strip differs ({eol:?})");
    assert_eq!(removed, found);
    assert!(detect_foreign(&stripped).is_empty());
  }
}

#[test]
fn our_overlay_and_grimoire_unwind_independently() {
  let catalog = test_catalog();
  let grimoire = fixture("grimoire-optilock-fps.gi");
  let entries = applied_entries(&catalog, &grimoire, &synthetic_config());
  let patched = apply(&grimoire, &entries);
  assert_eq!(detect_foreign(&patched)[0].tool, ForeignTool::Grimoire);
  let (without_ours, _) = strip_overlay(&patched);
  assert!(without_ours == grimoire);
  assert!(strip_foreign(&without_ours).0 == fixture(CURRENT_STOCK));
}

fn insert_after_convars_line(stock: &str, block: &[&str], eol: &str) -> String {
  let mut lines: Vec<String> = stock.split(eol).map(str::to_string).collect();
  let convars = lines
    .iter()
    .position(|line| line == "\tConVars")
    .expect("ConVars");
  for (offset, line) in block.iter().enumerate() {
    lines.insert(convars + 2 + offset, line.to_string());
  }
  lines.join(eol)
}

#[test]
fn strips_deadtune_and_sqooky_updater_blocks() {
  let cases = [
    (
      ForeignTool::Deadtune,
      [
        "\t\t// ===== deadtune managed convars -- do not edit this block manually =====",
        "\t\tr_ssao \"0\"",
        "\t\t// ===== end deadtune managed convars =====",
      ],
    ),
    (
      ForeignTool::SqookyUpdater,
      [
        "        // ===== gameinfo-updater added convars -- do not edit this block manually =====",
        "        r_ssao \"0\"",
        "        // ===== end gameinfo-updater added convars =====",
      ],
    ),
  ];
  for eol in EOLS {
    let stock = current_stock(eol);
    for (tool, block) in &cases {
      let patched = insert_after_convars_line(&stock, block, eol);
      let found = detect_foreign(&patched);
      assert_eq!(found.len(), 1);
      assert_eq!(found[0].tool, *tool);
      assert_eq!(found[0].line_count, 3);
      assert!(strip_foreign(&patched).0 == stock);
    }
    let unterminated = insert_after_convars_line(&stock, &cases[0].1[..2], eol);
    assert!(detect_foreign(&unterminated).is_empty());
  }
}

#[test]
fn strips_gameinfo_editor_blocks_spliced_after_the_brace() {
  let stock = current_stock("\r\n");
  let convars = stock.find("\tConVars\r\n\t{").expect("ConVars") + "\tConVars\r\n\t{".len();
  let block = "\n\t\t// Editor OptimizationsPreset - Start\n\t\t\"r_ssao\"\t\"0\"\n\t\t\"r_farz\"\t\"7000\"\n\t\t// Editor OptimizationsPreset - End\n";
  let patched = format!("{}{block}{}", &stock[..convars], &stock[convars..]);
  let found = detect_foreign(&patched);
  assert_eq!(found.len(), 1);
  assert_eq!(found[0].tool, ForeignTool::GameinfoEditor);
  assert_eq!(found[0].line_count, 4);
  assert!(strip_foreign(&patched).0 == stock);
}

#[test]
fn stock_files_have_no_foreign_overlays() {
  for name in STOCK_FIXTURES {
    assert!(detect_foreign(&fixture(name)).is_empty(), "{name}");
  }
}

fn setup_game(text: &str) -> (tempfile::TempDir, std::path::PathBuf) {
  let dir = tempfile::tempdir().expect("tempdir");
  let game = dir.path().to_path_buf();
  let citadel = game.join("game").join("citadel");
  std::fs::create_dir_all(&citadel).expect("citadel");
  std::fs::write(citadel.join("gameinfo.gi"), text).expect("write gameinfo");
  (dir, game)
}

fn read_gameinfo(game: &Path) -> String {
  std::fs::read_to_string(game.join("game").join("citadel").join("gameinfo.gi")).expect("read")
}

fn write_gameinfo(game: &Path, text: &str) {
  std::fs::write(game.join("game").join("citadel").join("gameinfo.gi"), text).expect("write");
}

/// The SearchPaths code and the overlay edit the same file without touching
/// each other's lines: a twin game folder without the overlay goes through the
/// same SearchPaths changes, and stripping the overlay must give its file.
#[test]
fn search_paths_and_overlay_leave_each_other_alone() {
  let catalog = test_catalog();
  let stock = current_stock("\r\n");
  let (_with_dir, with_overlay) = setup_game(&stock);
  let (_twin_dir, twin) = setup_game(&stock);
  let mut with_manager = GameConfigManager::new();
  let mut twin_manager = GameConfigManager::new();

  let first = ["citadel/addons/profile_a".to_string()];
  with_manager
    .update_mod_paths(&with_overlay, &first)
    .expect("mod paths");
  twin_manager
    .update_mod_paths(&twin, &first)
    .expect("twin mod paths");

  let base = read_gameinfo(&with_overlay);
  let entries = applied_entries(&catalog, &base, &synthetic_config());
  let patched = apply(&base, &entries);
  write_gameinfo(&with_overlay, &patched);
  assert_eq!(
    with_manager
      .marker_addons_paths(&with_overlay)
      .expect("paths"),
    first
  );

  let second = [
    "citadel/addons/profile_b".to_string(),
    "citadel/addons2/profile_b".to_string(),
  ];
  with_manager
    .update_mod_paths(&with_overlay, &second)
    .expect("mod paths");
  twin_manager
    .update_mod_paths(&twin, &second)
    .expect("twin mod paths");
  let text = read_gameinfo(&with_overlay);
  assert_eq!(read_overlay(&text).expect("overlay").rev, "0123456789ab");
  assert!(strip_overlay(&text).0 == read_gameinfo(&twin));

  for vanilla in [true, false] {
    with_manager
      .toggle_mods(&with_overlay, vanilla)
      .expect("toggle");
    twin_manager
      .toggle_mods(&twin, vanilla)
      .expect("twin toggle");
    let text = read_gameinfo(&with_overlay);
    assert!(read_overlay(&text).is_some());
    assert!(strip_overlay(&text).0 == read_gameinfo(&twin));
    let entries = applied_entries(&catalog, &strip_overlay(&text).0, &synthetic_config());
    assert_eq!(apply(&strip_overlay(&text).0, &entries), text);
  }
}

/// Every stock file GameTracking has, under every config and line ending.
/// Needs `temp/perf-configs` from the research checkout.
#[test]
#[ignore]
fn exhaustive_round_trip_over_all_stock_versions() {
  let versions = Path::new(env!("CARGO_MANIFEST_DIR"))
    .join("../../../temp/perf-configs/github/gametracking/versions");
  let catalog = test_catalog();
  let sqooky = fixture(SQOOKY);
  let optilock = fixture(OPTILOCK);
  let mut checked = 0;
  for file in std::fs::read_dir(&versions).expect("versions folder") {
    let file = file.expect("entry").path();
    let stock = std::fs::read_to_string(&file).expect("read version");
    let name = file.display().to_string();
    for eol in EOLS {
      let base = with_eol(&stock, eol);
      for config in [
        synthetic_config(),
        config_from_file(&sqooky, &stock),
        config_from_file(&optilock, &stock),
      ] {
        assert_round_trip(&base, &config, &catalog, &name);
        checked += 1;
      }
    }
  }
  assert!(checked >= 40 * 2 * 3, "only {checked} combinations");
}
