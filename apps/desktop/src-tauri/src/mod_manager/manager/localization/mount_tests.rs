use super::tests::{manager_with_gameinfo, write_vpk};
use super::*;
use crate::mod_manager::mod_health::FixModsStatus;

fn pending_fix() -> (tempfile::TempDir, ModManager, ModFixRefresh) {
  let temp = tempfile::tempdir().unwrap();
  let mut manager = manager_with_gameinfo(temp.path());
  let locale = "resource/localization/custom/custom_english.txt";
  write_vpk(
    &temp.path().join("game/citadel/pak01_dir.vpk"),
    &[(
      locale,
      br#""lang" { "Language" "English" "Tokens" { "shared" "Game" "retained" "Game token" } }"#,
    )],
  );
  let base = manager.get_addons_path(Some("first")).unwrap();
  write_vpk(
    &base.join("pak01_dir.vpk"),
    &[(
      locale,
      br#""lang" { "Language" "English" "Tokens" { "shared" "Mod" } }"#,
    )],
  );
  let mut manifest = ProfileVpkManifest::default();
  manifest.mark_enabled(
    "fixed",
    vec!["pak01_dir.vpk".into()],
    vec![],
    None,
    ShardIndex::FIRST,
  );
  manifest.save(&base).unwrap();
  manager
    .apply_profile_gameinfo(Some("first".into()))
    .unwrap();
  let refresh = manager
    .begin_fix_mods(Some("first"), &["fixed".into()])
    .unwrap()
    .unwrap();
  (temp, manager, refresh)
}

fn finish_fix(manager: &mut ModManager, refresh: ModFixRefresh) {
  let (refresh, plan) = refresh.build(&|_| {}).unwrap();
  assert_eq!(
    manager.finish_fix_mods(refresh, plan).unwrap().status,
    FixModsStatus::Applied
  );
  let overlay = manager
    .localization_overlay_vpk_path(Some("first"))
    .unwrap();
  assert!(overlay.is_file());
  let (_, _, key) = manager.localization_overlay_inputs(Some("first")).unwrap();
  assert!(
    receipt::load(&overlay)
      .unwrap()
      .unwrap()
      .is_current(&key)
      .unwrap()
  );
}

#[test]
fn finishing_a_fix_keeps_the_newly_mounted_profile() {
  let (temp, mut manager, refresh) = pending_fix();
  manager
    .apply_profile_gameinfo(Some("second".into()))
    .unwrap();
  let gameinfo = temp.path().join("game/citadel/gameinfo.gi");
  let mounted = fs::read(&gameinfo).unwrap();
  finish_fix(&mut manager, refresh);
  assert_eq!(fs::read(&gameinfo).unwrap(), mounted);
  assert_eq!(
    manager
      .config_manager
      .marker_addons_paths(temp.path())
      .unwrap(),
    vec!["citadel/addons/second"]
  );
}

#[test]
fn finishing_a_fix_without_an_intervening_mount_adds_the_repair_path() {
  let (temp, mut manager, refresh) = pending_fix();
  let gameinfo = temp.path().join("game/citadel/gameinfo.gi");
  let before = fs::read(&gameinfo).unwrap();
  finish_fix(&mut manager, refresh);
  assert_ne!(fs::read(&gameinfo).unwrap(), before);
  let mounted = fs::read_to_string(&gameinfo).unwrap();
  let repair = ModManager::localization_overlay_search_path(Some("first"));
  assert!(mounted.find(&repair).unwrap() < mounted.find("citadel/addons/first").unwrap());
}

#[test]
fn finishing_a_fix_keeps_a_layered_mount() {
  let (temp, mut manager, refresh) = pending_fix();
  manager
    .apply_layered_gameinfo(Some("server".into()), Some("second".into()))
    .unwrap();
  let gameinfo = temp.path().join("game/citadel/gameinfo.gi");
  let mounted = fs::read(&gameinfo).unwrap();
  finish_fix(&mut manager, refresh);
  assert_eq!(fs::read(&gameinfo).unwrap(), mounted);
  assert_eq!(
    manager
      .config_manager
      .marker_addons_paths(temp.path())
      .unwrap(),
    vec!["citadel/addons/server", "citadel/addons/second"]
  );
}

#[test]
fn finishing_a_fix_keeps_a_same_profile_remount_including_a_noop_mount() {
  let (temp, mut manager, refresh) = pending_fix();
  manager
    .apply_profile_gameinfo(Some("first".into()))
    .unwrap();
  let gameinfo = temp.path().join("game/citadel/gameinfo.gi");
  let mounted = fs::read(&gameinfo).unwrap();
  let revision = manager.config_manager.search_paths_revision();
  manager
    .apply_profile_gameinfo(Some("first".into()))
    .unwrap();
  assert_eq!(fs::read(&gameinfo).unwrap(), mounted);
  assert!(manager.config_manager.search_paths_revision() > revision);
  let revision = manager.config_manager.search_paths_revision();
  finish_fix(&mut manager, refresh);
  assert_eq!(manager.config_manager.search_paths_revision(), revision);
  assert_eq!(fs::read(&gameinfo).unwrap(), mounted);
  let mounted = fs::read_to_string(&gameinfo).unwrap();
  assert!(mounted.contains(&ModManager::localization_overlay_search_path(Some("first"))));
  assert!(mounted.contains("citadel/addons/first"));
}
