use super::*;
use crate::mod_manager::autoexec_manager::AutoexecManager;

fn config() -> CrosshairConfig {
  CrosshairConfig {
    gap: -15.0,
    width: 20.0,
    height: 3.7,
    pip_opacity: 1.0,
    dot_opacity: 1.0,
    dot_outline_opacity: 0.0,
    color: Color { r: 255, g: 0, b: 0 },
    pip_border: false,
    pip_gap_static: true,
  }
}

fn fixture() -> String {
  EMPTY_SETTINGS.replace("base = {}", "base = {\n\t\tcrosshair_themed = \"true\"\n\t\tcrosshair_color_r = \"125\" // keep comment\n\t\tmouse_sensitivity = \"1.25\"\n\t}")
    .replace("heroes = {}", "heroes = { hero_haze = { crosshair_color_r = \"77\" note = \"braces { } and \\\"quotes\\\"\" } }")
}

fn setup() -> (tempfile::TempDir, PathBuf) {
  let directory = tempfile::tempdir().unwrap();
  let cfg = directory.path().join("game/citadel/cfg");
  fs::create_dir_all(&cfg).unwrap();
  fs::write(cfg.join(SETTINGS_FILE), fixture()).unwrap();
  fs::write(cfg.join("autoexec.cfg"), "echo keep\n").unwrap();
  (directory, cfg)
}

#[test]
fn apply_preserves_hero_overrides_and_unrelated_settings() {
  let (game, cfg) = setup();
  AutoexecManager::new()
    .apply_crosshair(game.path(), &config(), None)
    .unwrap();
  let content = fs::read_to_string(cfg.join(SETTINGS_FILE)).unwrap();
  let settings = HeroSettings::parse(&content).unwrap();
  assert_eq!(
    settings.get("crosshair_themed").unwrap().as_deref(),
    Some("\"false\"")
  );
  assert_eq!(
    settings
      .get("crosshair_pip_outline_border")
      .unwrap()
      .as_deref(),
    Some("\"0\"")
  );
  assert_eq!(
    settings.get("crosshair_color_r").unwrap().as_deref(),
    Some("\"255\"")
  );
  assert!(content.contains("mouse_sensitivity = \"1.25\""));
  assert!(content.contains("// keep comment"));
  assert_eq!(
    content.split("heroes = ").nth(1),
    fixture().split("heroes = ").nth(1)
  );
  let autoexec = fs::read_to_string(cfg.join("autoexec.cfg")).unwrap();
  assert!(autoexec.starts_with("echo keep\n"));
  assert!(autoexec.contains("citadel_crosshair_pip_outline_border \"0\""));
  assert!(!autoexec.contains("citadel_crosshair_pip_border"));
  assert!(!autoexec.contains("citadel_crosshair_themed"));
}

#[test]
fn repeated_apply_and_disable_restore_original_crosshair() {
  let (game, cfg) = setup();
  let manager = AutoexecManager::new();
  manager
    .apply_crosshair(game.path(), &config(), None)
    .unwrap();
  let mut second = config();
  second.color.r = 10;
  manager.apply_crosshair(game.path(), &second, None).unwrap();
  manager
    .disable_custom_crosshairs(game.path(), None)
    .unwrap();
  let content = fs::read_to_string(cfg.join(SETTINGS_FILE)).unwrap();
  let settings = HeroSettings::parse(&content).unwrap();
  assert_eq!(
    settings.get("crosshair_color_r").unwrap().as_deref(),
    Some("\"125\"")
  );
  assert_eq!(
    settings.get("crosshair_themed").unwrap().as_deref(),
    Some("\"true\"")
  );
  assert_eq!(settings.get("crosshair_pip_width").unwrap(), None);
  assert!(!cfg.join(BACKUP_FILE).exists());
  assert_eq!(
    fs::read_to_string(cfg.join("autoexec.cfg")).unwrap(),
    "echo keep"
  );
  manager
    .disable_custom_crosshairs(game.path(), None)
    .unwrap();
  assert_eq!(
    fs::read_to_string(cfg.join(SETTINGS_FILE)).unwrap(),
    content
  );
}

#[test]
fn disable_preserves_game_edits_made_after_apply() {
  let (game, cfg) = setup();
  let manager = AutoexecManager::new();
  manager
    .apply_crosshair(game.path(), &config(), None)
    .unwrap();
  let path = cfg.join(SETTINGS_FILE);
  let content = fs::read_to_string(&path)
    .unwrap()
    .replace("crosshair_color_r = \"255\"", "crosshair_color_r = \"90\"");
  fs::write(&path, content).unwrap();
  manager
    .disable_custom_crosshairs(game.path(), None)
    .unwrap();
  assert!(
    fs::read_to_string(path)
      .unwrap()
      .contains("crosshair_color_r = \"90\"")
  );
}

#[test]
fn missing_settings_are_created_and_missing_keys_are_restored() {
  let game = tempfile::tempdir().unwrap();
  let manager = AutoexecManager::new();
  manager
    .apply_crosshair(game.path(), &config(), None)
    .unwrap();
  manager
    .disable_custom_crosshairs(game.path(), None)
    .unwrap();
  let content =
    fs::read_to_string(game.path().join("game/citadel/cfg").join(SETTINGS_FILE)).unwrap();
  assert!(!content.contains("crosshair_"));
  HeroSettings::parse(&content).unwrap();
}

#[test]
fn malformed_settings_do_not_change_any_files() {
  for content in [
    "broken",
    &fixture().replace(
      "crosshair_themed = \"true\"",
      "crosshair_themed = \"true\" crosshair_themed = \"false\"",
    ),
    &fixture().replace("heroes =", "heroes ["),
  ] {
    let (game, cfg) = setup();
    fs::write(cfg.join(SETTINGS_FILE), content).unwrap();
    assert!(
      AutoexecManager::new()
        .apply_crosshair(game.path(), &config(), None)
        .is_err()
    );
    assert_eq!(
      fs::read_to_string(cfg.join(SETTINGS_FILE)).unwrap(),
      content
    );
    assert_eq!(
      fs::read_to_string(cfg.join("autoexec.cfg")).unwrap(),
      "echo keep\n"
    );
    assert!(!cfg.join(BACKUP_FILE).exists());
  }
}

#[test]
fn invalid_machine_convars_leave_restore_backup_and_settings_untouched() {
  let (game, cfg) = setup();
  let manager = AutoexecManager::new();
  manager
    .apply_crosshair(game.path(), &config(), None)
    .unwrap();
  let applied = fs::read_to_string(cfg.join(SETTINGS_FILE)).unwrap();
  fs::write(cfg.join("machine_convars.vcfg"), "invalid {").unwrap();
  assert!(
    manager
      .disable_custom_crosshairs(game.path(), None)
      .is_err()
  );
  assert!(cfg.join(BACKUP_FILE).exists());
  assert_eq!(
    fs::read_to_string(cfg.join(SETTINGS_FILE)).unwrap(),
    applied
  );
}

#[test]
fn failed_write_rolls_back_preceding_files() {
  let directory = tempfile::tempdir().unwrap();
  let good = directory.path().join("good");
  let blocked = directory.path().join("blocked");
  fs::write(&good, "original").unwrap();
  let edits = vec![
    ConfigEdit::new(good.clone(), Some("changed".into())).unwrap(),
    ConfigEdit::new(blocked.clone(), Some("fail".into())).unwrap(),
  ];
  fs::create_dir(&blocked).unwrap();
  assert!(commit(edits).is_err());
  assert_eq!(fs::read_to_string(good).unwrap(), "original");
}

#[test]
fn concurrent_game_edit_is_preserved_and_backup_is_rolled_back() {
  let (game, cfg) = setup();
  let edits = prepare(game.path(), Some(&config()), None).unwrap();
  let path = cfg.join(SETTINGS_FILE);
  let external = fixture().replace("1.25", "2.5");
  fs::write(&path, &external).unwrap();
  assert!(commit(edits).is_err());
  assert_eq!(fs::read_to_string(path).unwrap(), external);
  assert!(!cfg.join(BACKUP_FILE).exists());
}

#[test]
fn deleted_settings_are_not_recreated_when_disabling() {
  let (game, cfg) = setup();
  let manager = AutoexecManager::new();
  manager
    .apply_crosshair(game.path(), &config(), None)
    .unwrap();
  fs::remove_file(cfg.join(SETTINGS_FILE)).unwrap();
  manager
    .disable_custom_crosshairs(game.path(), None)
    .unwrap();
  assert!(!cfg.join(SETTINGS_FILE).exists());
  assert!(!cfg.join(BACKUP_FILE).exists());
}

#[test]
fn quoted_keys_comments_and_crlf_are_preserved() {
  let source = fixture()
    .replace(
      "crosshair_color_r =",
      "\"crosshair_color_r\" /* comment */ =",
    )
    .replace('\n', "\r\n");
  let settings = HeroSettings::parse(&source).unwrap();
  let updated = settings
    .update(&BTreeMap::from([(
      "crosshair_color_r".into(),
      Some("\"42\"".into()),
    )]))
    .unwrap();
  assert!(updated.contains("\"crosshair_color_r\" /* comment */ = \"42\""));
  assert_eq!(
    updated.matches("\r\n").count(),
    source.matches("\r\n").count()
  );
}

#[test]
fn disable_restores_values_after_game_normalizes_numbers() {
  let (game, cfg) = setup();
  let manager = AutoexecManager::new();
  manager
    .apply_crosshair(game.path(), &config(), None)
    .unwrap();
  let path = cfg.join(SETTINGS_FILE);
  let content = fs::read_to_string(&path).unwrap().replace(
    "crosshair_color_r = \"255\"",
    "crosshair_color_r = \"255.000000\"",
  );
  fs::write(&path, content).unwrap();
  manager
    .disable_custom_crosshairs(game.path(), None)
    .unwrap();
  assert!(
    fs::read_to_string(path)
      .unwrap()
      .contains("crosshair_color_r = \"125\"")
  );
}

#[test]
fn corrupt_backup_does_not_change_game_files() {
  let (game, cfg) = setup();
  let manager = AutoexecManager::new();
  manager
    .apply_crosshair(game.path(), &config(), None)
    .unwrap();
  let path = cfg.join(SETTINGS_FILE);
  let applied = fs::read_to_string(&path).unwrap();
  fs::write(cfg.join(BACKUP_FILE), "invalid json").unwrap();
  assert!(
    manager
      .disable_custom_crosshairs(game.path(), None)
      .is_err()
  );
  assert!(
    manager
      .apply_crosshair(game.path(), &config(), None)
      .is_err()
  );
  assert_eq!(fs::read_to_string(path).unwrap(), applied);
}

#[test]
fn restore_values_cannot_inject_extra_settings() {
  let source = fixture();
  let settings = HeroSettings::parse(&source).unwrap();
  let changes = BTreeMap::from([(
    "crosshair_color_r".into(),
    Some("\"1\" mouse_sensitivity = \"99\"".into()),
  )]);
  assert!(settings.update(&changes).is_err());
}

#[test]
fn steam_remote_settings_and_game_fallback_restore_their_own_values() {
  let (game, cfg) = setup();
  let steam = tempfile::tempdir().unwrap();
  let user = steam.path().join("userdata/123/1422450");
  let remote = user.join("remote/cfg");
  fs::create_dir_all(&remote).unwrap();
  let remote_original = fixture().replace("\"125\"", "\"90\"");
  fs::write(remote.join(SETTINGS_FILE), &remote_original).unwrap();
  let other_account = steam.path().join("userdata/456/1422450/remote/cfg");
  fs::create_dir_all(&other_account).unwrap();
  fs::write(other_account.join(SETTINGS_FILE), "other account").unwrap();
  let manager = AutoexecManager::new();
  manager
    .apply_crosshair(game.path(), &config(), Some(&user))
    .unwrap();
  assert!(
    fs::read_to_string(remote.join(SETTINGS_FILE))
      .unwrap()
      .contains("crosshair_themed = \"false\"")
  );
  assert!(user.join("local").join(BACKUP_FILE).exists());
  assert!(!remote.join(BACKUP_FILE).exists());
  assert_eq!(
    fs::read_to_string(other_account.join(SETTINGS_FILE)).unwrap(),
    "other account"
  );
  manager
    .disable_custom_crosshairs(game.path(), Some(&user))
    .unwrap();
  let restored = fs::read_to_string(remote.join(SETTINGS_FILE)).unwrap();
  assert_eq!(
    HeroSettings::parse(&restored)
      .unwrap()
      .get("crosshair_color_r")
      .unwrap()
      .as_deref(),
    Some("\"90\"")
  );
  assert!(
    fs::read_to_string(cfg.join(SETTINGS_FILE))
      .unwrap()
      .contains("crosshair_color_r = \"125\"")
  );
  assert!(!user.join("local").join(BACKUP_FILE).exists());
}

#[test]
fn malformed_remote_settings_abort_before_changing_game_fallback() {
  let (game, cfg) = setup();
  let steam = tempfile::tempdir().unwrap();
  let remote = steam.path().join("remote/cfg");
  fs::create_dir_all(&remote).unwrap();
  fs::write(remote.join(SETTINGS_FILE), "broken").unwrap();
  assert!(
    AutoexecManager::new()
      .apply_crosshair(game.path(), &config(), Some(steam.path()))
      .is_err()
  );
  assert_eq!(
    fs::read_to_string(cfg.join(SETTINGS_FILE)).unwrap(),
    fixture()
  );
  assert!(!cfg.join(BACKUP_FILE).exists());
}
