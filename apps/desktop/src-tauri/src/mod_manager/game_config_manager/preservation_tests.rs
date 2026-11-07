use super::*;

fn fixture() -> String {
  "GameInfo\n{\n FileSystem\n {\n  SearchPaths\n  {\n   // HYPERLINE STARTUP BEGIN\n   Game citadel/hyperline/startup\n   // HYPERLINE STARTUP END\n   Game citadel/addons/external // user's mount\n   Game citadel\n   Game core\n  }\n }\n ConVars { fps_max 240 }\n}".replace('\n', "\r\n")
}

fn game() -> (tempfile::TempDir, PathBuf) {
  let dir = tempfile::tempdir().unwrap();
  let path = dir.path().join("game/citadel/gameinfo.gi");
  fs::create_dir_all(path.parent().unwrap()).unwrap();
  fs::write(&path, fixture()).unwrap();
  (dir, path)
}

#[test]
fn a_write_conflict_does_not_fall_back_to_restoring_a_backup() {
  let (game, path) = game();
  let observed = fs::read(&path).unwrap();
  fs::write(path.with_extension("gi.bak"), fixture()).unwrap();
  let external = b"// another tool changed this file\n";
  fs::write(&path, external).unwrap();

  let error = GameConfigManager::commit_gameinfo(&path, Some(&observed), &fixture())
    .expect_err("the stale snapshot must be rejected");
  let mut manager = GameConfigManager::new();
  assert!(matches!(
    manager.reset_gameinfo(game.path(), Err(error)),
    Err(Error::FileWriteFailed(_))
  ));
  assert_eq!(fs::read(&path).unwrap(), external);
  assert_eq!(manager.search_paths_revision, 0);
}

#[test]
fn explicit_recovery_handles_missing_and_non_utf8_live_files() {
  for restore in [false, true] {
    for current in [None, Some(vec![0xff, 0xfe, b'{'])] {
      let (game, path) = game();
      let backup = fixture();
      fs::write(path.with_extension("gi.bak"), &backup).unwrap();
      if let Some(content) = &current {
        fs::write(&path, content).unwrap();
      } else {
        fs::remove_file(&path).unwrap();
      }
      let mut manager = GameConfigManager::new();
      let purpose = if restore {
        manager.restore_gameinfo_backup(game.path()).unwrap();
        "pre-restore"
      } else {
        manager
          .apply_vanilla_gameinfo(game.path(), backup.clone())
          .unwrap();
        "pre-reset"
      };
      assert_eq!(fs::read_to_string(&path).unwrap(), backup);
      let copies: Vec<_> = fs::read_dir(path.parent().unwrap())
        .unwrap()
        .map(Result::unwrap)
        .filter(|entry| {
          entry
            .file_name()
            .to_string_lossy()
            .starts_with(&format!("gameinfo.gi.{purpose}-"))
        })
        .collect();
      if let Some(current) = current {
        assert_eq!(copies.len(), 1);
        assert_eq!(fs::read(copies[0].path()).unwrap(), current);
      } else {
        assert!(copies.is_empty());
      }
    }
  }
}

#[test]
fn backup_restore_keeps_the_live_file_before_replacing_it() {
  let (game, path) = game();
  let current = fs::read(&path).unwrap();
  let backup = fixture().replace("fps_max 240", "fps_max 0");
  fs::write(path.with_extension("gi.bak"), &backup).unwrap();
  GameConfigManager::new()
    .restore_gameinfo_backup(game.path())
    .unwrap();
  assert_eq!(fs::read_to_string(&path).unwrap(), backup);
  let copies: Vec<_> = fs::read_dir(path.parent().unwrap())
    .unwrap()
    .map(Result::unwrap)
    .filter(|entry| {
      entry
        .file_name()
        .to_string_lossy()
        .starts_with("gameinfo.gi.pre-restore-")
    })
    .collect();
  assert_eq!(
    copies.len(),
    1,
    "restoring an older backup must retain current settings"
  );
  assert_eq!(fs::read(copies[0].path()).unwrap(), current);
  assert_eq!(
    fs::read_to_string(path.with_extension("gi.bak")).unwrap(),
    backup
  );
}

#[test]
fn backup_restore_stops_if_the_safety_copy_cannot_be_verified() {
  let (game, path) = game();
  let current = fs::read(&path).unwrap();
  let backup = fixture().replace("fps_max 240", "fps_max 0");
  fs::write(path.with_extension("gi.bak"), &backup).unwrap();
  GameConfigManager::keep_gameinfo_copy(&path, &current, "pre-restore").unwrap();
  let copy = fs::read_dir(path.parent().unwrap())
    .unwrap()
    .map(Result::unwrap)
    .find(|entry| {
      entry
        .file_name()
        .to_string_lossy()
        .starts_with("gameinfo.gi.pre-restore-")
    })
    .unwrap();
  fs::write(copy.path(), "damaged safety copy").unwrap();
  assert!(
    GameConfigManager::new()
      .restore_gameinfo_backup(game.path())
      .is_err()
  );
  assert_eq!(fs::read(&path).unwrap(), current);
  assert_eq!(
    fs::read_to_string(path.with_extension("gi.bak")).unwrap(),
    backup
  );
}

#[test]
fn stale_cleanup_cannot_remove_paths_reapplied_without_changing_the_file() {
  let (game, path) = game();
  let mut manager = GameConfigManager::new();
  let paths = ["citadel/addons/profile_current".into()];
  manager.update_mod_paths(game.path(), &paths).unwrap();
  let revision = manager.cleanup_revision(game.path()).unwrap().unwrap();
  let original = fs::read(&path).unwrap();
  let timestamp = fs::metadata(&path).unwrap().modified().unwrap();
  manager.update_mod_paths(game.path(), &paths).unwrap();
  assert!(
    !manager
      .remove_mod_paths_at_revision(game.path(), revision)
      .unwrap()
  );
  assert_eq!(fs::read(&path).unwrap(), original);
  assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), timestamp);
  let current = manager.cleanup_revision(game.path()).unwrap().unwrap();
  assert!(
    manager
      .remove_mod_paths_at_revision(game.path(), current)
      .unwrap()
  );
  assert_eq!(fs::read_to_string(path).unwrap(), fixture());
}

#[test]
fn legacy_migration_removes_manifest_owned_paths_and_keeps_unknown_profiles() {
  use crate::mod_manager::vpk_manifest::ProfileVpkManifest;
  let (game, path) = game();
  let managed = path.parent().unwrap().join("addons/profile_managed");
  fs::create_dir_all(&managed).unwrap();
  ProfileVpkManifest::default().save(&managed).unwrap();
  let original = fixture()
    .replace("  SearchPaths", &format!("{MOD_MANAGER_MARKER_START}\r\n  SearchPaths"))
    .replace("   Game citadel\r\n", "   Game citadel/addons/profile_managed\r\n   Game citadel/addons/profile_external\r\n   Game citadel\r\n")
    .replace("  }\r\n }", &format!("  }}\r\n{MOD_MANAGER_MARKER_END}\r\n }}"));
  fs::write(&path, original).unwrap();
  let mut manager = GameConfigManager::new();
  assert_eq!(
    manager.marker_addons_paths(game.path()).unwrap(),
    ["citadel/addons/profile_managed"]
  );
  manager.toggle_mods(game.path(), true).unwrap();
  let cleaned = fs::read_to_string(&path).unwrap();
  assert!(!cleaned.contains("profile_managed"));
  assert!(cleaned.contains("Game citadel/addons/profile_external"));
}

#[test]
fn reset_rejects_candidates_without_an_active_game_mount_before_writing() {
  for candidate in [
    "GameInfo { FileSystem { SearchPaths {} } }",
    "GameInfo { FileSystem { SearchPaths { Game linux_only [$LINUX] } } }",
    "GameInfo { FileSystem { SearchPaths { Game citadel } } }}",
  ] {
    let (game, path) = game();
    let original = fs::read(&path).unwrap();
    let mut manager = GameConfigManager::new();
    assert!(
      manager
        .apply_vanilla_gameinfo(game.path(), candidate.into())
        .is_err()
    );
    assert_eq!(fs::read(&path).unwrap(), original);
    fs::write(path.with_extension("gi.bak"), candidate).unwrap();
    assert!(manager.restore_gameinfo_backup(game.path()).is_err());
    assert_eq!(fs::read(&path).unwrap(), original);
  }
}

#[test]
fn role_only_cleanup_is_owned_by_dmm_without_enabled_mod_mounts() {
  let (game, path) = game();
  fs::write(
    &path,
    include_str!("../gameinfo_search_paths/fixtures/deadworks-after-dmm.gi"),
  )
  .unwrap();
  let mut manager = GameConfigManager::new();
  manager.toggle_mods(game.path(), true).unwrap();
  let status = manager.get_gameinfo_status(game.path()).unwrap();
  assert!(status.is_modified_by_mod_manager);
  assert!(!status.has_mod_paths);
  assert!(status.syntax_valid);
}

#[test]
fn unresolved_conditions_leave_the_file_and_backups_unchanged() {
  let (game, path) = game();
  let original = fixture().replace(
    "   Game citadel\r\n",
    "   Mod custom_mod [$CUSTOM]\r\n   Game citadel\r\n",
  );
  fs::write(&path, &original).unwrap();
  let mut manager = GameConfigManager::new();
  manager.game_setup = true;
  let error = manager
    .update_mod_paths(game.path(), &["citadel/addons/profile_alpha".into()])
    .unwrap_err();
  assert!(error.to_string().contains("unsupported symbol"));
  assert_eq!(fs::read_to_string(&path).unwrap(), original);
  assert!(!path.with_extension("gi.bak").exists());
}

#[test]
fn deadworks_paths_and_default_roles_survive_real_cleanup_writes() {
  for original in [
    include_str!("../gameinfo_search_paths/fixtures/deadworks-first.gi"),
    include_str!("../gameinfo_search_paths/fixtures/deadworks-after-dmm.gi"),
  ] {
    let (game, path) = game();
    fs::write(&path, original).unwrap();
    fs::create_dir_all(path.parent().unwrap().join("deadworks_addons")).unwrap();
    let mut manager = GameConfigManager::new();
    manager.game_setup = true;
    manager
      .update_mod_paths(game.path(), &["citadel/addons/profile_beta".into()])
      .unwrap();
    manager.toggle_mods(game.path(), true).unwrap();
    let cleaned = fs::read_to_string(&path).unwrap();
    for target in ["citadel/deadworks_mods", "citadel/deadworks_addons"] {
      assert_eq!(cleaned.matches(target).count(), 1);
    }
    for role in ["Mod", "Write"] {
      assert!(cleaned.lines().any(|line| {
        let mut tokens = line.split_whitespace();
        tokens.next() == Some(role)
          && tokens
            .next()
            .is_some_and(|value| value.trim_matches('"') == "citadel")
      }));
    }
    assert!(manager.marker_addons_paths(game.path()).unwrap().is_empty());
    assert!(
      !manager
        .get_gameinfo_status(game.path())
        .unwrap()
        .has_mod_paths
    );
    let timestamp = fs::metadata(&path).unwrap().modified().unwrap();
    manager.toggle_mods(game.path(), true).unwrap();
    assert_eq!(fs::read_to_string(&path).unwrap(), cleaned);
    assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), timestamp);
  }
}

#[test]
fn real_writers_preserve_custom_content_and_do_not_rewrite_noops() {
  let (game, path) = game();
  let original = fs::read(&path).unwrap();
  let mut manager = GameConfigManager::new();
  manager.game_setup = true;
  let paths = vec!["citadel/addons/profile_alpha".to_string()];
  manager.update_mod_paths(game.path(), &paths).unwrap();
  let updated = fs::read(&path).unwrap();
  let timestamp = fs::metadata(&path).unwrap().modified().unwrap();
  manager.update_mod_paths(game.path(), &paths).unwrap();
  assert_eq!(fs::read(&path).unwrap(), updated);
  assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), timestamp);
  assert_eq!(manager.marker_addons_paths(game.path()).unwrap(), paths);
  manager.toggle_mods(game.path(), true).unwrap();
  assert_eq!(fs::read(&path).unwrap(), original);
  assert!(
    !manager
      .get_gameinfo_status(game.path())
      .unwrap()
      .has_mod_paths
  );
  assert_eq!(fs::read(path.with_extension("gi.bak")).unwrap(), original);
}

#[test]
fn migration_saves_the_current_file_even_when_the_backup_is_stale() {
  let (game, path) = game();
  let stale_profile = path.parent().unwrap().join("addons/server_stale");
  fs::create_dir_all(&stale_profile).unwrap();
  crate::mod_manager::vpk_manifest::ProfileVpkManifest::default()
    .save(&stale_profile)
    .unwrap();
  let stale = fixture().replace("   Game citadel/addons/external // user's mount\r\n", "");
  fs::write(path.with_extension("gi.bak"), &stale).unwrap();
  let legacy = fixture()
    .replace(
      "  SearchPaths",
      &format!("{MOD_MANAGER_MARKER_START}\r\n  SearchPaths"),
    )
    .replace(
      "   Game citadel\r\n",
      "   Game citadel/addons/server_stale\r\n   Game citadel\r\n",
    )
    .replace(
      "  }\r\n }",
      &format!("  }}\r\n{MOD_MANAGER_MARKER_END}\r\n }}"),
    );
  fs::write(&path, &legacy).unwrap();
  let mut manager = GameConfigManager::new();
  manager.game_setup = true;
  manager
    .update_mod_paths(game.path(), &["citadel/addons/profile_alpha".into()])
    .unwrap();
  manager.toggle_mods(game.path(), true).unwrap();
  assert_eq!(fs::read_to_string(&path).unwrap(), fixture());
  assert_eq!(
    fs::read_to_string(path.with_extension("gi.bak")).unwrap(),
    stale
  );
  let snapshots: Vec<_> = fs::read_dir(path.parent().unwrap())
    .unwrap()
    .map(Result::unwrap)
    .filter(|entry| {
      entry
        .file_name()
        .to_string_lossy()
        .starts_with("gameinfo.gi.pre-dmm-migration-")
    })
    .collect();
  assert_eq!(snapshots.len(), 1);
  assert_eq!(fs::read_to_string(snapshots[0].path()).unwrap(), legacy);
}

#[test]
fn invalid_syntax_and_broken_markers_never_restore_a_stale_backup() {
  for broken in [
    fixture().trim_end_matches('}').to_string(),
    fixture().replace(
      "  SearchPaths",
      &format!("{MOD_MANAGER_MARKER_START}\r\n  SearchPaths"),
    ),
  ] {
    for restarted in [false, true] {
      let (game, path) = game();
      fs::write(path.with_extension("gi.bak"), fixture()).unwrap();
      fs::write(&path, &broken).unwrap();
      let mut manager = GameConfigManager::new();
      manager.game_setup = !restarted;
      assert!(manager.update_mod_paths(game.path(), &[]).is_err());
      assert_eq!(fs::read_to_string(&path).unwrap(), broken);
      assert!(manager.toggle_mods(game.path(), true).is_err());
      assert_eq!(fs::read_to_string(&path).unwrap(), broken);
    }
  }
}

#[test]
fn explicit_reset_keeps_a_copy_of_the_current_custom_file() {
  let (game, path) = game();
  fs::write(path.with_extension("gi.bak"), "old backup").unwrap();
  let mut manager = GameConfigManager::new();
  manager
    .apply_vanilla_gameinfo(game.path(), fixture().replace("fps_max 240", "fps_max 0"))
    .unwrap();
  let snapshots: Vec<_> = fs::read_dir(path.parent().unwrap())
    .unwrap()
    .map(Result::unwrap)
    .filter(|entry| {
      entry
        .file_name()
        .to_string_lossy()
        .starts_with("gameinfo.gi.pre-reset-")
    })
    .collect();
  assert_eq!(snapshots.len(), 1);
  assert_eq!(fs::read_to_string(snapshots[0].path()).unwrap(), fixture());
}

#[test]
fn offline_explicit_reset_also_keeps_the_current_file() {
  let (game, path) = game();
  let current = fixture();
  fs::write(
    path.with_extension("gi.bak"),
    current.replace("fps_max 240", "fps_max 0"),
  )
  .unwrap();
  let mut manager = GameConfigManager::new();
  assert_eq!(
    manager
      .reset_gameinfo(game.path(), Err(Error::Network("offline".into())))
      .unwrap(),
    GameInfoResetSource::Backup
  );
  let snapshots: Vec<_> = fs::read_dir(path.parent().unwrap())
    .unwrap()
    .map(Result::unwrap)
    .filter(|entry| {
      entry
        .file_name()
        .to_string_lossy()
        .starts_with("gameinfo.gi.pre-reset-")
    })
    .collect();
  assert_eq!(snapshots.len(), 1);
  assert_eq!(fs::read_to_string(snapshots[0].path()).unwrap(), current);
}

#[test]
fn migration_and_atomic_rewrites_support_long_game_paths() {
  let root = tempfile::tempdir().unwrap();
  let game_path = root.path().join("long-game-directory-".repeat(10));
  let path = game_path.join("game/citadel/gameinfo.gi");
  fs::create_dir_all(path.parent().unwrap()).unwrap();
  fs::write(&path, fixture()).unwrap();
  GameConfigManager::keep_gameinfo_copy(&path, fixture().as_bytes(), "pre-dmm-migration").unwrap();
  let mut manager = GameConfigManager::new();
  manager.game_setup = true;
  manager
    .update_mod_paths(&game_path, &["citadel/addons/profile_alpha".into()])
    .unwrap();
  manager.toggle_mods(&game_path, true).unwrap();
  assert_eq!(fs::read_to_string(path).unwrap(), fixture());
}
