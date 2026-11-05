use super::*;

const PLAYER: &str = "\"video.cfg\"\r\n{\r\n\t\"Version\"\t\t\"20\"\r\n\t\"DeviceID\"\t\t\"9988\"\r\n\t\"setting.r_citadel_shadow_quality\"\t\t\"3\"\r\n\t\"setting.defaultres\"\t\t\"2560\"\r\n}\r\n";

struct Setup {
  data: tempfile::TempDir,
  game: tempfile::TempDir,
}

impl Setup {
  fn new() -> Self {
    let setup = Setup {
      data: tempfile::tempdir().unwrap(),
      game: tempfile::tempdir().unwrap(),
    };
    fs::write(setup.path(), PLAYER).unwrap();
    setup
  }

  fn path(&self) -> PathBuf {
    self.game.path().join("video.txt")
  }

  fn text(&self) -> String {
    fs::read_to_string(self.path()).unwrap()
  }

  fn apply(&self, settings: &[(&str, &str)], changed: ChangedKeys) -> VideoOutcome {
    self.apply_to(&self.path(), settings, changed)
  }

  fn apply_to(&self, path: &Path, settings: &[(&str, &str)], changed: ChangedKeys) -> VideoOutcome {
    let settings: Vec<VideoSetting> = settings
      .iter()
      .map(|(key, value)| VideoSetting {
        key: key.to_string(),
        value: value.to_string(),
        label: None,
        display: None,
      })
      .collect();
    apply(self.data.path(), Some(path), &settings, changed).unwrap()
  }
}

#[test]
fn writes_in_place_keeps_the_header_and_backs_up_the_original() {
  let setup = Setup::new();
  let outcome = setup.apply(
    &[
      ("r_citadel_shadow_quality", "0"),
      ("r_texture_stream_mip_bias", "8"),
    ],
    ChangedKeys::Overwrite,
  );
  assert_eq!(
    outcome,
    VideoOutcome::Written {
      path: setup.path().display().to_string(),
      settings: 2
    }
  );
  assert_eq!(
    setup.text(),
    "\"video.cfg\"\r\n{\r\n\t\"Version\"\t\t\"20\"\r\n\t\"DeviceID\"\t\t\"9988\"\r\n\t\"setting.r_citadel_shadow_quality\"\t\t\"0\"\r\n\t\"setting.defaultres\"\t\t\"2560\"\r\n\t\"setting.r_texture_stream_mip_bias\"\t\t\"8\"\r\n}\r\n"
  );
  assert_eq!(
    fs::read_to_string(cache_dir(setup.data.path()).join(BACKUP_FILE)).unwrap(),
    PLAYER
  );

  // A second apply keeps the first backup: it is the player's file, not ours.
  setup.apply(&[("r_citadel_shadow_quality", "1")], ChangedKeys::Overwrite);
  assert_eq!(
    fs::read_to_string(cache_dir(setup.data.path()).join(BACKUP_FILE)).unwrap(),
    PLAYER
  );
}

#[test]
fn revert_restores_our_keys_and_leaves_the_players_changes() {
  let setup = Setup::new();
  setup.apply(
    &[
      ("r_citadel_shadow_quality", "0"),
      ("r_texture_stream_mip_bias", "8"),
    ],
    ChangedKeys::Overwrite,
  );
  let changed_in_game = setup.text().replace(
    "\"setting.r_texture_stream_mip_bias\"\t\t\"8\"",
    "\"setting.r_texture_stream_mip_bias\"\t\t\"1\"",
  );
  fs::write(setup.path(), &changed_in_game).unwrap();

  revert(setup.data.path()).unwrap();
  assert_eq!(
    setup.text(),
    PLAYER.replace(
      "}\r\n",
      "\t\"setting.r_texture_stream_mip_bias\"\t\t\"1\"\r\n}\r\n"
    )
  );
}

#[test]
fn launch_reapply_keeps_values_changed_in_game_and_apply_overwrites_them() {
  let setup = Setup::new();
  setup.apply(&[("r_citadel_shadow_quality", "0")], ChangedKeys::Overwrite);
  let changed_in_game = setup
    .text()
    .replace("_quality\"\t\t\"0\"", "_quality\"\t\t\"2\"");
  fs::write(setup.path(), &changed_in_game).unwrap();

  setup.apply(&[("r_citadel_shadow_quality", "0")], ChangedKeys::Keep);
  assert_eq!(setup.text(), changed_in_game);

  setup.apply(&[("r_citadel_shadow_quality", "0")], ChangedKeys::Overwrite);
  assert!(setup.text().contains("_quality\"\t\t\"0\""));
  // Remove still restores the value from before the first write.
  revert(setup.data.path()).unwrap();
  assert_eq!(setup.text(), PLAYER);
}

#[test]
fn switching_configs_reverts_keys_the_new_one_does_not_set() {
  let setup = Setup::new();
  setup.apply(
    &[("r_citadel_shadow_quality", "0"), ("shaderquality", "0")],
    ChangedKeys::Overwrite,
  );
  setup.apply(&[("r_citadel_shadow_quality", "1")], ChangedKeys::Overwrite);
  assert!(!setup.text().contains("shaderquality"));

  setup.apply(&[], ChangedKeys::Overwrite);
  assert_eq!(setup.text(), PLAYER);
}

#[test]
fn restore_writes_back_the_exact_original_file() {
  let setup = Setup::new();
  setup.apply(&[("r_citadel_shadow_quality", "0")], ChangedKeys::Overwrite);
  fs::write(setup.path(), "\"video.cfg\"\n{\n}\n").unwrap();

  restore_backup(setup.data.path()).unwrap();
  assert_eq!(setup.text(), PLAYER);
  assert!(backup(setup.data.path()).is_none());
  assert!(restore_backup(setup.data.path()).is_err());
}

#[test]
fn a_missing_file_skips_the_video_half() {
  let setup = Setup::new();
  let settings = [VideoSetting {
    key: "r_shadows".into(),
    value: "0".into(),
    label: None,
    display: None,
  }];
  assert_eq!(
    apply(setup.data.path(), None, &settings, ChangedKeys::Overwrite).unwrap(),
    VideoOutcome::FileMissing
  );
  assert!(backup(setup.data.path()).is_none());
}

#[test]
fn the_account_copy_wins_over_the_game_folder() {
  let account = tempfile::tempdir().unwrap();
  let game = tempfile::tempdir().unwrap();
  let game_file = game.path().join("game").join("citadel").join("cfg");
  fs::create_dir_all(&game_file).unwrap();
  fs::write(game_file.join("video.txt"), PLAYER).unwrap();
  assert_eq!(
    locate(Some(game.path()), Some(account.path())),
    Some(game_file.join("video.txt"))
  );

  let account_file = account.path().join("local").join("cfg");
  fs::create_dir_all(&account_file).unwrap();
  fs::write(account_file.join("video.txt"), PLAYER).unwrap();
  assert_eq!(
    locate(Some(game.path()), Some(account.path())),
    Some(account_file.join("video.txt"))
  );
}

#[test]
fn state_reports_values_changed_since_and_ignores_reformatted_numbers() {
  let setup = Setup::new();
  setup.apply(
    &[
      ("r_citadel_shadow_quality", "0"),
      ("mat_viewportscale", "0.5"),
    ],
    ChangedKeys::Overwrite,
  );
  // The game rewrites the whole file when a setting changes in its menu.
  let rewritten = setup
    .text()
    .replace("_quality\"\t\t\"0\"", "_quality\"\t\t\"2\"")
    .replace("\"0.5\"", "\"0.500000\"");
  fs::write(setup.path(), rewritten).unwrap();

  assert_eq!(
    state(setup.data.path(), Some(&setup.path())),
    VideoState {
      in_effect: 1,
      changed: vec![VideoChange {
        key: "r_citadel_shadow_quality".into(),
        written: "0".into(),
        current: Some("2".into()),
        kept: false,
      }],
    }
  );
}

/// Another Steam account's video.txt holds that account's own values: ours
/// replace them, and restoring undoes both files.
#[test]
fn a_move_to_another_file_is_caught_and_restore_undoes_both() {
  let setup = Setup::new();
  setup.apply(&[("r_citadel_shadow_quality", "0")], ChangedKeys::Overwrite);
  let account = setup.game.path().join("account-video.txt");
  fs::write(&account, PLAYER).unwrap();

  assert_eq!(
    state(setup.data.path(), Some(&account)),
    VideoState::default()
  );
  assert!(out_of_place(setup.data.path(), Some(&account)));
  assert!(!out_of_place(setup.data.path(), Some(&setup.path())));

  setup.apply_to(
    &account,
    &[("r_citadel_shadow_quality", "0")],
    ChangedKeys::Keep,
  );
  assert_eq!(setup.text(), PLAYER);
  assert!(
    fs::read_to_string(&account)
      .unwrap()
      .contains("_quality\"\t\t\"0\"")
  );
  assert_eq!(state(setup.data.path(), Some(&account)).in_effect, 1);

  restore_backup(setup.data.path()).unwrap();
  assert_eq!(setup.text(), PLAYER);
  assert_eq!(fs::read_to_string(&account).unwrap(), PLAYER);
}

/// The game builds the account's copy from the game folder's, ours included:
/// Turn off still puts back the player's values from before the first write.
#[test]
fn a_move_keeps_the_players_original_values() {
  let setup = Setup::new();
  setup.apply(&[("r_citadel_shadow_quality", "0")], ChangedKeys::Overwrite);
  let account = setup.game.path().join("account-video.txt");
  fs::copy(setup.path(), &account).unwrap();

  setup.apply_to(
    &account,
    &[("r_citadel_shadow_quality", "0")],
    ChangedKeys::Keep,
  );
  revert(setup.data.path()).unwrap();
  assert_eq!(fs::read_to_string(&account).unwrap(), PLAYER);
}

#[test]
fn a_kept_value_survives_applies_until_the_config_value_is_asked_for() {
  let setup = Setup::new();
  setup.apply(&[("r_citadel_shadow_quality", "0")], ChangedKeys::Overwrite);
  let changed_in_game = setup
    .text()
    .replace("_quality\"\t\t\"0\"", "_quality\"\t\t\"2\"");
  fs::write(setup.path(), &changed_in_game).unwrap();

  keep_current(setup.data.path(), &["R_CITADEL_SHADOW_QUALITY".into()]).unwrap();
  let kept = state(setup.data.path(), Some(&setup.path()));
  assert_eq!((kept.in_effect, kept.changed[0].kept), (0, true));
  setup.apply(&[("r_citadel_shadow_quality", "0")], ChangedKeys::Overwrite);
  assert_eq!(setup.text(), changed_in_game);

  use_written(setup.data.path(), &["r_citadel_shadow_quality".into()]).unwrap();
  assert!(setup.text().contains("_quality\"\t\t\"0\""));
  assert_eq!(state(setup.data.path(), Some(&setup.path())).in_effect, 1);
}

#[test]
fn an_adopted_file_is_the_new_base_for_the_next_config() {
  let setup = Setup::new();
  setup.apply(
    &[("r_citadel_shadow_quality", "0"), ("shaderquality", "0")],
    ChangedKeys::Overwrite,
  );
  let liked = setup.text();
  adopt(setup.data.path(), Some(&setup.path())).unwrap();

  // A config without video settings leaves the adopted values alone.
  setup.apply(&[], ChangedKeys::Overwrite);
  assert_eq!(setup.text(), liked);

  // One with video settings goes back to them, not to the first file.
  setup.apply(&[("shaderquality", "2")], ChangedKeys::Overwrite);
  revert(setup.data.path()).unwrap();
  assert_eq!(setup.text(), liked);

  setup.apply(&[("shaderquality", "2")], ChangedKeys::Overwrite);
  restore_backup(setup.data.path()).unwrap();
  assert_eq!(setup.text(), liked);
}
