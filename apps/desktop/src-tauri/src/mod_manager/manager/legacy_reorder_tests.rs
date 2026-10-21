use super::tests::test_manager;
use crate::mod_manager::shard::{ProfileBase, ShardIndex};
use crate::mod_manager::vpk_manifest::ProfileVpkManifest;
use std::fs;

fn game_fixture() -> tempfile::TempDir {
  let game = tempfile::tempdir().unwrap();
  let citadel = game.path().join("game/citadel");
  fs::create_dir_all(&citadel).unwrap();
  fs::write(citadel.join("gameinfo.gi"), b"").unwrap();
  game
}

#[test]
fn legacy_reorder_recovery_prevents_forgetting_stranded_mods() {
  let game = game_fixture();
  let base = game.path().join("game/citadel/addons");
  fs::create_dir_all(base.join("temp_reorder")).unwrap();
  fs::write(base.join("temp_reorder/pak01_dir.vpk"), b"stranded").unwrap();
  let mut manifest = ProfileVpkManifest::default();
  manifest.mark_enabled(
    "stranded",
    vec!["pak01_dir.vpk".into()],
    vec!["skin.vpk".into()],
    Some(0),
    ShardIndex::FIRST,
  );
  manifest.save(&base).unwrap();

  let forgotten = test_manager(game.path())
    .forget_orphaned_mods(&["stranded".into()], None)
    .unwrap();

  assert!(forgotten.is_empty());
  assert_eq!(ProfileVpkManifest::load(&base).unwrap(), manifest);
  assert_eq!(fs::read(base.join("pak01_dir.vpk")).unwrap(), b"stranded");
}

#[test]
fn legacy_reorder_collision_blocks_forgetting_mods_and_preserves_both_copies() {
  let game = game_fixture();
  let base = game.path().join("game/citadel/addons");
  fs::create_dir_all(base.join("temp_reorder")).unwrap();
  fs::write(base.join("temp_reorder/pak01_dir.vpk"), b"stranded").unwrap();
  fs::write(base.join("temp_reorder/pak02_dir.vpk"), b"original").unwrap();
  fs::write(base.join("pak02_dir.vpk"), b"replacement").unwrap();
  let mut manifest = ProfileVpkManifest::default();
  manifest.mark_enabled(
    "stranded",
    vec!["pak01_dir.vpk".into()],
    vec!["skin.vpk".into()],
    Some(0),
    ShardIndex::FIRST,
  );
  manifest.save(&base).unwrap();
  let manifest_bytes = fs::read(base.join(".dmm.json")).unwrap();

  let error = test_manager(game.path())
    .forget_orphaned_mods(&["stranded".into()], None)
    .unwrap_err();

  assert!(error.to_string().contains("pak02_dir.vpk"));
  assert_eq!(fs::read(base.join(".dmm.json")).unwrap(), manifest_bytes);
  assert_eq!(
    fs::read(base.join("temp_reorder/pak01_dir.vpk")).unwrap(),
    b"stranded"
  );
  assert_eq!(
    fs::read(base.join("temp_reorder/pak02_dir.vpk")).unwrap(),
    b"original"
  );
  assert_eq!(
    fs::read(base.join("pak02_dir.vpk")).unwrap(),
    b"replacement"
  );
  assert!(!base.join("pak01_dir.vpk").exists());
}

#[test]
fn legacy_reorder_recovery_runs_before_deciding_whether_to_migrate_shards() {
  let game = game_fixture();
  let base = ProfileBase::new(game.path().join("game/citadel/addons/profile_fixture")).unwrap();
  fs::create_dir_all(base.join("temp_reorder")).unwrap();
  let mut manifest = ProfileVpkManifest::default();
  for number in 1..=100 {
    let filename = format!("pak{number:02}_dir.vpk");
    let directory = if number <= 63 {
      base.join("temp_reorder")
    } else {
      base.to_path_buf()
    };
    fs::write(directory.join(&filename), format!("payload-{number}")).unwrap();
    manifest.mark_enabled(
      &format!("mod{number}"),
      vec![filename],
      vec![format!("original-{number}.vpk")],
      Some(number),
      ShardIndex::FIRST,
    );
  }
  manifest.save(&base).unwrap();

  test_manager(game.path())
    .migrate_profile_to_shards(Some("profile_fixture".into()))
    .unwrap();

  let recovered = ProfileVpkManifest::load(&base).unwrap();
  assert_eq!(recovered.mods.len(), 100);
  for number in 1..=100 {
    let entry = &recovered.mods[&format!("mod{number}")];
    assert_eq!(entry.current_vpks.len(), 1);
    assert_eq!(
      fs::read(base.shard_dir(entry.shard).join(&entry.current_vpks[0])).unwrap(),
      format!("payload-{number}").as_bytes()
    );
  }
  assert_eq!(recovered.mods["mod100"].shard, ShardIndex::new(2).unwrap());
  assert!(!base.join("temp_reorder").exists());
}
