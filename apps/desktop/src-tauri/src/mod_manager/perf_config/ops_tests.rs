use std::path::PathBuf;

use tempfile::TempDir;

use super::*;
use crate::mod_manager::perf_config::catalog::cache_dir;
use crate::mod_manager::perf_config::patch::test_support::{CURRENT_STOCK, fixture, test_catalog};
use crate::mod_manager::perf_config::types::{ForeignTool, PerfConfigSource};

struct Setup {
  _game_dir: TempDir,
  _data_dir: TempDir,
  game_path: PathBuf,
  data_path: PathBuf,
  catalog: Catalog,
}

impl Setup {
  fn new(gameinfo: &str) -> Self {
    let game_dir = tempfile::tempdir().expect("game dir");
    let data_dir = tempfile::tempdir().expect("data dir");
    let game_path = game_dir.path().to_path_buf();
    fs::create_dir_all(game_path.join("game").join("citadel")).expect("citadel");
    fs::write(gameinfo_path(&game_path), gameinfo).expect("gameinfo");
    Self {
      game_path,
      data_path: data_dir.path().to_path_buf(),
      _game_dir: game_dir,
      _data_dir: data_dir,
      catalog: test_catalog(),
    }
  }

  fn ctx(&self) -> PerfContext<'_> {
    PerfContext {
      game_path: Some(&self.game_path),
      app_data_dir: &self.data_path,
      catalog: &self.catalog,
      build_id: Some("6711".to_string()),
    }
  }

  fn gameinfo(&self) -> String {
    fs::read_to_string(gameinfo_path(&self.game_path)).expect("read gameinfo")
  }

  fn replace_gameinfo(&self, text: &str) {
    fs::write(gameinfo_path(&self.game_path), text).expect("write gameinfo");
  }
}

fn preset_request(id: &str) -> PerfApplyRequest {
  PerfApplyRequest {
    config_id: format!("preset:{id}"),
    name: format!("Preset {id}"),
    source: PerfConfigSource::Preset { id: id.to_string() },
    overrides: Vec::new(),
    include_engine_sections: false,
  }
}

#[test]
fn apply_writes_the_overlay_and_remembers_the_choice() {
  let setup = Setup::new(&fixture(CURRENT_STOCK));
  let result = apply(&setup.ctx(), preset_request("synthetic"), false).expect("apply");
  let status = &result.status;
  assert!(status.in_sync);
  assert!(status.game_path_set && status.gameinfo_found);
  assert_eq!(status.build_id.as_deref(), Some("6711"));
  assert!(status.foreign.is_empty());
  let applied = status.applied.as_ref().expect("applied");
  assert_eq!(applied.config_id, "preset:synthetic");
  assert_eq!(applied.rev, result.resolved.rev);
  let desired = status.desired.as_ref().expect("desired");
  assert_eq!(desired.rev, result.resolved.rev);
  assert_eq!(desired.counts, result.resolved.counts);
  assert!(chrono::DateTime::parse_from_rfc3339(&desired.applied_at).is_ok());

  let text = setup.gameinfo();
  assert!(text.contains("\"fps_max\"\t\t\"0\" // dmm-perf was \"400\""));
  assert!(text.contains("// Preset synthetic: values by Tester (GPL-3.0) [dmm-perf]"));
  assert!(text.contains("// https://github.com/tester/configs @ 0123456789ab [dmm-perf]"));
  assert!(!text.contains("CSMCascadeResolution 512"));
  assert!(text.contains("\r\n") && !text.replace("\r\n", "").contains('\n'));
}

#[test]
fn engine_sections_are_written_only_when_included() {
  let setup = Setup::new(&fixture(CURRENT_STOCK));
  let mut request = preset_request("synthetic");
  request.include_engine_sections = true;
  let result = apply(&setup.ctx(), request, false).expect("apply");
  assert_eq!(result.resolved.counts.engine_section, 0);
  assert!(
    setup
      .gameinfo()
      .contains("CSMCascadeResolution 512 // dmm-perf was 2048")
  );
}

#[test]
fn applying_again_changes_nothing() {
  let setup = Setup::new(&fixture(CURRENT_STOCK));
  apply(&setup.ctx(), preset_request("synthetic"), false).expect("apply");
  let once = setup.gameinfo();
  apply(&setup.ctx(), preset_request("synthetic"), false).expect("apply again");
  assert!(setup.gameinfo() == once);

  apply(&setup.ctx(), preset_request("sqooky"), false).expect("switch");
  let switched = setup.gameinfo();
  assert_eq!(switched.matches(patch::BEGIN_MARKER).count(), 1);
  assert!(switched.contains("config=preset:sqooky"));
}

#[test]
fn remove_restores_the_file_and_forgets_the_choice() {
  let original = fixture(CURRENT_STOCK);
  let setup = Setup::new(&original);
  apply(&setup.ctx(), preset_request("synthetic"), false).expect("apply");
  let status = remove(&setup.ctx()).expect("remove");
  assert!(setup.gameinfo() == original);
  assert_eq!(status.desired, None);
  assert_eq!(status.applied, None);
  assert!(!status.in_sync);
  remove(&setup.ctx()).expect("removing twice is fine");
}

#[test]
fn remove_without_a_game_folder_keeps_the_choice() {
  let setup = Setup::new(&fixture(CURRENT_STOCK));
  apply(&setup.ctx(), preset_request("synthetic"), false).expect("apply");
  let applied = setup.gameinfo();
  let without_game = PerfContext {
    game_path: None,
    ..setup.ctx()
  };
  let error = remove(&without_game).expect_err("no game folder");
  assert!(matches!(error, Error::PerformanceConfig(_)), "{error:?}");
  assert!(store::load(&setup.data_path).is_some());
  assert!(setup.gameinfo() == applied);
}

#[test]
fn remove_refuses_a_strip_that_would_break_the_file() {
  let setup = Setup::new(&fixture(CURRENT_STOCK));
  apply(&setup.ctx(), preset_request("synthetic"), false).expect("apply");
  let applied = setup.gameinfo();
  let cases = [
    (
      "// dmm-perf removed: \"sv_minrate\"\t\"98304\"",
      "// dmm-perf removed: \"sv_minrate\"\t{",
    ),
    (
      "\"version\"\t\t\"3\" // dmm-perf added",
      "\"version\"\t\t\"3\" // dmm-perf added {",
    ),
  ];
  for (ours, edited) in cases {
    let damaged = applied.replace(ours, edited);
    assert_ne!(damaged, applied, "{edited}");
    setup.replace_gameinfo(&damaged);
    let error = remove(&setup.ctx()).expect_err(edited);
    assert!(matches!(error, Error::PerformanceConfig(_)), "{error:?}");
    assert!(setup.gameinfo() == damaged);
    assert!(store::load(&setup.data_path).is_some());
  }
}

#[test]
fn a_failed_write_puts_the_previous_choice_back() {
  let setup = Setup::new(&fixture(CURRENT_STOCK));
  let first = apply(&setup.ctx(), preset_request("synthetic"), false)
    .expect("apply")
    .status
    .desired
    .expect("desired");
  let second = DesiredOverlay {
    rev: "ffffffffffff".to_string(),
    ..first.clone()
  };
  let failing = || Err(Error::PerformanceConfig("write failed".into()));

  save_choice_then(&setup.data_path, &second, failing).expect_err("write fails");
  assert_eq!(store::load(&setup.data_path), Some(first));
  store::clear(&setup.data_path).expect("clear");
  save_choice_then(&setup.data_path, &second, failing).expect_err("write fails");
  assert_eq!(store::load(&setup.data_path), None);

  let mut saved_before_write = None;
  save_choice_then(&setup.data_path, &second, || {
    saved_before_write = store::load(&setup.data_path);
    Ok(())
  })
  .expect("write");
  assert_eq!(saved_before_write, Some(second));
}

/// Windows only creates symlinks in Developer Mode or as an administrator.
#[test]
fn writes_through_a_symlinked_gameinfo() {
  let original = fixture(CURRENT_STOCK);
  let setup = Setup::new(&original);
  let link = gameinfo_path(&setup.game_path);
  let target = setup.game_path.join("gameinfo-real.gi");
  fs::rename(&link, &target).expect("move gameinfo");
  #[cfg(unix)]
  let linked = std::os::unix::fs::symlink(&target, &link);
  #[cfg(windows)]
  let linked = std::os::windows::fs::symlink_file(&target, &link);
  if let Err(error) = linked {
    eprintln!("skipped, can't create a symlink here: {error}");
    return;
  }
  let is_link = || {
    fs::symlink_metadata(&link)
      .expect("link")
      .file_type()
      .is_symlink()
  };

  apply(&setup.ctx(), preset_request("synthetic"), false).expect("apply");
  assert!(is_link());
  assert!(
    fs::read_to_string(&target)
      .expect("target")
      .contains(patch::BEGIN_MARKER)
  );
  remove(&setup.ctx()).expect("remove");
  assert!(is_link());
  assert!(fs::read_to_string(&target).expect("target") == original);
}

#[test]
fn reapply_puts_back_what_an_update_removed() {
  let original = fixture(CURRENT_STOCK);
  let setup = Setup::new(&original);
  assert_eq!(
    reapply_desired(&setup.ctx(), HandEdits::Keep),
    ReapplyOutcome::NothingDesired
  );

  apply(&setup.ctx(), preset_request("synthetic"), false).expect("apply");
  let applied = setup.gameinfo();
  assert_eq!(
    reapply_desired(&setup.ctx(), HandEdits::Keep),
    ReapplyOutcome::AlreadyInSync
  );

  setup.replace_gameinfo(&original);
  assert!(!status(&setup.ctx()).expect("status").in_sync);
  assert_eq!(
    reapply_desired(&setup.ctx(), HandEdits::Keep),
    ReapplyOutcome::Applied
  );
  assert!(setup.gameinfo() == applied);
  assert!(status(&setup.ctx()).expect("status").in_sync);
  assert_eq!(
    reapply_desired(&setup.ctx(), HandEdits::Keep),
    ReapplyOutcome::AlreadyInSync
  );
}

/// A game update swaps in a different stock file: the config is resolved
/// against the new file, and turning it off afterwards gives that file back.
#[test]
fn reapply_after_an_update_to_a_different_build() {
  let old_build = fixture("stock-2026-03-27.gi");
  let new_build = fixture("stock-2026-09-29.gi");
  assert!(old_build != new_build);
  let setup = Setup::new(&old_build);
  apply(&setup.ctx(), preset_request("synthetic"), false).expect("apply");

  setup.replace_gameinfo(&new_build);
  assert_eq!(
    reapply_desired(&setup.ctx(), HandEdits::Keep),
    ReapplyOutcome::Applied
  );
  assert!(setup.gameinfo().contains(patch::BEGIN_MARKER));
  assert!(status(&setup.ctx()).expect("status").in_sync);
  assert_eq!(
    reapply_desired(&setup.ctx(), HandEdits::Keep),
    ReapplyOutcome::AlreadyInSync
  );

  remove(&setup.ctx()).expect("remove");
  assert!(setup.gameinfo() == new_build);
}

#[test]
fn reapply_removes_an_overlay_nothing_asks_for() {
  let original = fixture(CURRENT_STOCK);
  let setup = Setup::new(&original);
  apply(&setup.ctx(), preset_request("synthetic"), false).expect("apply");
  let applied = setup.gameinfo();

  // A backup taken while the config was on, restored after removing it.
  remove(&setup.ctx()).expect("remove");
  setup.replace_gameinfo(&applied);
  assert_eq!(
    reapply_desired(&setup.ctx(), HandEdits::Keep),
    ReapplyOutcome::RemovedOrphan
  );
  assert!(setup.gameinfo() == original);
  assert_eq!(
    reapply_desired(&setup.ctx(), HandEdits::Keep),
    ReapplyOutcome::NothingDesired
  );

  apply(&setup.ctx(), preset_request("synthetic"), false).expect("apply");
  fs::write(
    cache_dir(&setup.data_path).join("active.json"),
    "{ not json",
  )
  .expect("corrupt the saved choice");
  assert_eq!(
    reapply_desired(&setup.ctx(), HandEdits::Keep),
    ReapplyOutcome::RemovedOrphan
  );
  assert!(setup.gameinfo() == original);
}

#[test]
fn reapply_keeps_hand_edits_while_the_config_is_unchanged() {
  let setup = Setup::new(&fixture(CURRENT_STOCK));
  apply(&setup.ctx(), preset_request("synthetic"), false).expect("apply");
  let edited = setup
    .gameinfo()
    .replace("\"r_farz\"\t\t\"7000\"", "\"r_farz\"\t\t\"9000\"");
  setup.replace_gameinfo(&edited);
  assert_eq!(
    reapply_desired(&setup.ctx(), HandEdits::Keep),
    ReapplyOutcome::AlreadyInSync
  );
  assert!(setup.gameinfo() == edited);
}

#[test]
fn re_apply_now_overwrites_hand_edits() {
  let setup = Setup::new(&fixture(CURRENT_STOCK));
  apply(&setup.ctx(), preset_request("synthetic"), false).expect("apply");
  let applied = setup.gameinfo();
  let edited = applied.replace("\"r_farz\"		\"7000\"", "\"r_farz\"		\"9000\"");
  assert!(edited != applied);
  setup.replace_gameinfo(&edited);
  assert_eq!(
    reapply_desired(&setup.ctx(), HandEdits::Overwrite),
    ReapplyOutcome::Applied
  );
  assert!(setup.gameinfo() == applied);
}

#[test]
fn reapply_failures_never_stop_a_launch() {
  let setup = Setup::new(&fixture(CURRENT_STOCK));
  apply(&setup.ctx(), preset_request("synthetic"), false).expect("apply");
  setup.replace_gameinfo("\"GameInfo\"\r\n{\r\n\tConVars\r\n\t{\r\n");
  assert!(matches!(
    reapply_desired(&setup.ctx(), HandEdits::Keep),
    ReapplyOutcome::Failed(_)
  ));

  let without_game = PerfContext {
    game_path: None,
    ..setup.ctx()
  };
  assert!(matches!(
    reapply_desired(&without_game, HandEdits::Keep),
    ReapplyOutcome::Failed(_)
  ));
}

#[test]
fn a_broken_file_is_a_performance_error_not_a_parse_reset() {
  let setup = Setup::new("\"GameInfo\"\n{\n\tConVars\n\t{\n");
  let error = apply(&setup.ctx(), preset_request("synthetic"), false).expect_err("broken file");
  assert!(matches!(error, Error::PerformanceConfig(_)), "{error:?}");
  assert!(setup.gameinfo() == "\"GameInfo\"\n{\n\tConVars\n\t{\n");
  let error = preview(&setup.ctx(), &preset_request("synthetic")).expect_err("broken file");
  assert!(matches!(error, Error::PerformanceConfig(_)));
}

#[test]
fn foreign_overlays_are_removed_only_when_asked() {
  let grimoire = fixture("grimoire-optilock-fps.gi");
  let setup = Setup::new(&grimoire);
  let kept = apply(&setup.ctx(), preset_request("synthetic"), false).expect("apply");
  assert!(kept.removed_foreign.is_empty());
  assert_eq!(kept.status.foreign[0].tool, ForeignTool::Grimoire);

  let removed = apply(&setup.ctx(), preset_request("synthetic"), true).expect("apply");
  assert_eq!(removed.removed_foreign.len(), 1);
  assert_eq!(removed.removed_foreign[0].tool, ForeignTool::Grimoire);
  assert!(removed.status.foreign.is_empty());
  remove(&setup.ctx()).expect("remove");
  assert!(setup.gameinfo() == fixture(CURRENT_STOCK));
}

#[test]
fn a_config_with_nothing_to_write_leaves_the_file_alone() {
  let original = fixture(CURRENT_STOCK);
  let setup = Setup::new(&original);
  let result = apply(&setup.ctx(), preset_request("noop"), false).expect("apply");
  assert_eq!(result.resolved.counts.applies, 0);
  assert!(setup.gameinfo() == original);
  assert!(result.status.desired.is_some());
  assert_eq!(result.status.applied, None);
  assert!(result.status.in_sync);
  assert_eq!(
    reapply_desired(&setup.ctx(), HandEdits::Keep),
    ReapplyOutcome::AlreadyInSync
  );

  apply(&setup.ctx(), preset_request("synthetic"), false).expect("apply");
  apply(&setup.ctx(), preset_request("noop"), false).expect("apply");
  assert!(setup.gameinfo() == original);
}

#[test]
fn preview_falls_back_to_the_latest_stock_file() {
  let setup = Setup::new(&fixture(CURRENT_STOCK));
  let request = preset_request("synthetic");
  let with_game = preview(&setup.ctx(), &request).expect("preview");
  let without_game = preview(
    &PerfContext {
      game_path: None,
      ..setup.ctx()
    },
    &request,
  )
  .expect("preview without game");
  assert_eq!(with_game.rev, without_game.rev);
  assert_eq!(with_game.counts, without_game.counts);
  assert!(setup.gameinfo() == fixture(CURRENT_STOCK));
}

#[test]
fn status_without_a_game_folder() {
  let setup = Setup::new(&fixture(CURRENT_STOCK));
  let status = status(&PerfContext {
    game_path: None,
    ..setup.ctx()
  })
  .expect("status");
  assert!(!status.game_path_set && !status.gameinfo_found);
  assert_eq!(status.applied, None);
  assert!(!status.in_sync);
}

#[test]
fn catalog_summary_scores_presets_against_the_live_file() {
  let setup = Setup::new(&fixture(CURRENT_STOCK));
  let summary = catalog_summary(&setup.ctx()).expect("summary");
  assert_eq!(summary.presets.len(), 3);
  let synthetic = &summary.presets[0];
  assert_eq!(synthetic.id, "synthetic");
  assert!(synthetic.counts.applies > 0);
  assert!(synthetic.cut_score > 0.0);
  let noop = &summary.presets[2];
  assert_eq!(noop.counts.applies, 0);
  assert_eq!(noop.cut_score, 0.0);
  assert!(summary.community[0].cut_score > 0.0);
  assert_eq!(summary.latest_build, Some(6711));
  assert_eq!(summary.guarded_sections.len(), 7);

  setup.replace_gameinfo("not a gameinfo file {");
  let fallback = catalog_summary(&setup.ctx()).expect("summary on a broken file");
  assert_eq!(fallback.presets[0].counts, synthetic.counts);
}

#[test]
fn writes_refuse_a_file_that_changed_since_it_was_read() {
  let setup = Setup::new("current");
  let path = gameinfo_path(&setup.game_path);
  let error = write_gameinfo(&path, "what we read", "new").expect_err("stale");
  assert!(matches!(error, Error::PerformanceConfig(_)));
  assert_eq!(setup.gameinfo(), "current");
  write_gameinfo(&path, "current", "new").expect("write");
  assert_eq!(setup.gameinfo(), "new");
  let leftovers = fs::read_dir(path.parent().expect("dir"))
    .expect("list")
    .count();
  assert_eq!(leftovers, 1);
}
