use super::*;
use crate::mod_manager::vpk_manager::staging::RenameTransaction;

/// Hold the conflicting skins' renames until the replacement and manifest
/// commit together. No copies of large archives are needed.
pub(super) fn disable_conflicts(
  vpks: &VpkManager,
  base: &ProfileBase,
  manifest: &mut ProfileVpkManifest,
  conflicts: &[String],
) -> Result<RenameTransaction, Error> {
  let mut transaction = RenameTransaction::new();
  let result = (|| {
    for id in conflicts {
      let entry = &manifest.mods[id];
      let originals = if entry.original_vpk_names.is_empty() {
        entry.current_vpks.clone()
      } else {
        entry.original_vpk_names.clone()
      };
      // disable_vpks_in can discard an active copy when a staged variant
      // already exists. A skin switch must preserve both copies instead.
      if originals
        .iter()
        .any(|name| base.join(format!("{id}_{name}")).exists())
      {
        return Err(Error::ModInvalid(format!(
          "Cannot switch skin {id}: a staged VPK already exists. Disable it separately first."
        )));
      }
      let sources = entry.file_paths(base);
      let disabled = vpks.disable_vpks_in(
        &base.shard_dir(entry.shard),
        base,
        id,
        &entry.current_vpks,
        &originals,
        MissingVpkPolicy::Strict,
      )?;
      for (name, source) in disabled.iter().zip(sources) {
        transaction.record(base.join(name), source);
      }
      manifest.mark_disabled(id, disabled, originals);
    }
    Ok(())
  })();
  match result {
    Ok(()) => Ok(transaction),
    Err(error) => Err(transaction.rollback(error)),
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;

  fn pack(path: &Path, model: &str, bytes: &[u8]) {
    let source = tempfile::tempdir().unwrap();
    let file = source.path().join(model);
    fs::create_dir_all(file.parent().unwrap()).unwrap();
    fs::write(file, bytes).unwrap();
    vpkmanager::pack_directory(source.path(), path).unwrap();
  }

  fn skin(id: &str) -> Mod {
    Mod {
      id: id.into(),
      name: id.into(),
      is_map: false,
      installed_vpks: vec![],
      file_tree: None,
      install_order: None,
      original_vpk_names: vec![],
    }
  }

  fn world() -> (tempfile::TempDir, ModManager, ProfileBase) {
    let game = tempfile::tempdir().unwrap();
    let citadel = game.path().join("game/citadel");
    fs::create_dir_all(citadel.join("addons")).unwrap();
    fs::write(
      citadel.join("gameinfo.gi"),
      "\"GameInfo\"\n{\n\"FileSystem\"\n{\nSearchPaths\n{\nGame citadel\n}\n}\n}\n",
    )
    .unwrap();
    let mut manager = super::super::tests::test_manager(game.path());
    manager
      .config_manager
      .setup_game_for_mods(game.path())
      .unwrap();
    let base = manager.get_addons_path(None).unwrap();
    pack(
      &base.join("josuke_skin.vpk"),
      "models/shiv.vmdl_c",
      b"josuke",
    );
    pack(&base.join("suit_skin.vpk"), "models/shiv.vmdl_c", b"suit");
    pack(
      &base.join("other_skin.vpk"),
      "models/bebop.vmdl_c",
      b"bebop",
    );
    manager.install_mod(skin("josuke"), None).unwrap();
    manager.install_mod(skin("other"), None).unwrap();
    (game, manager, base)
  }

  #[test]
  fn activation_requires_choice_then_switches_only_conflicting_skin() {
    let (_game, mut manager, base) = world();
    let before = fs::read(base.join(".dmm.json")).unwrap();
    let error = manager.install_mod(skin("suit"), None).unwrap_err();
    assert!(matches!(error, Error::ModelConflict(ref ids) if ids == &["josuke"]));
    assert_eq!(fs::read(base.join(".dmm.json")).unwrap(), before);
    let installed = manager
      .install_mod_resolving_conflicts(skin("suit"), None, &["josuke".into()])
      .unwrap();
    let manifest = ProfileVpkManifest::load(&base).unwrap();
    assert!(!manifest.mods["josuke"].enabled);
    assert!(manifest.mods["suit"].enabled);
    assert!(manifest.mods["other"].enabled);
    assert!(base.join("josuke_skin.vpk").is_file());
    assert!(base.join(&installed.installed_vpks[0]).is_file());
    // The reverse choice works too, independent of hero names or load order.
    manager
      .install_mod_resolving_conflicts(skin("josuke"), None, &["suit".into()])
      .unwrap();
    let manifest = ProfileVpkManifest::load(&base).unwrap();
    assert!(manifest.mods["josuke"].enabled);
    assert!(!manifest.mods["suit"].enabled);
    assert!(manifest.mods["other"].enabled);
  }

  #[test]
  fn failed_manifest_commit_restores_both_skins_and_unrelated_mods() {
    let (_game, mut manager, base) = world();
    let before = fs::read(base.join(".dmm.json")).unwrap();
    let manifest = ProfileVpkManifest::load(&base).unwrap();
    let files: Vec<_> = manifest
      .mods
      .values()
      .flat_map(|entry| entry.file_paths(&base))
      .map(|path| {
        let bytes = fs::read(&path).unwrap();
        (path, bytes)
      })
      .collect();
    fs::create_dir(base.join(".dmm.json.tmp")).unwrap();
    assert!(
      manager
        .install_mod_resolving_conflicts(skin("suit"), None, &["josuke".into()])
        .is_err()
    );
    assert_eq!(fs::read(base.join(".dmm.json")).unwrap(), before);
    assert!(base.join("suit_skin.vpk").is_file());
    assert!(!base.join("josuke_skin.vpk").exists());
    for (path, bytes) in files {
      assert_eq!(fs::read(path).unwrap(), bytes);
    }
  }

  #[test]
  fn stale_approval_does_not_disable_new_conflicts() {
    let (_game, mut manager, base) = world();
    let before = fs::read(base.join(".dmm.json")).unwrap();
    assert!(matches!(
      manager.install_mod_resolving_conflicts(skin("suit"), None, &["other".into()]),
      Err(Error::ModelConflict(_))
    ));
    assert_eq!(fs::read(base.join(".dmm.json")).unwrap(), before);
  }

  #[test]
  fn identical_models_and_unselected_variants_do_not_require_switching() {
    let (_game, mut manager, base) = world();
    pack(&base.join("same_skin.vpk"), "models/shiv.vmdl_c", b"josuke");
    manager.install_mod(skin("same"), None).unwrap();
    pack(
      &base.join("variants_sound.vpk"),
      "sounds/music.vsnd_c",
      b"music",
    );
    pack(
      &base.join("variants_skin.vpk"),
      "models/shiv.vmdl_c",
      b"third",
    );
    let mut target = skin("variants");
    target.file_tree = Some(ModFileTree::from_options(
      &["sound.vpk".into(), "skin.vpk".into()],
      &HashSet::from(["sound.vpk".into()]),
    ));
    manager.install_mod(target, None).unwrap();
    assert!(base.join("variants_skin.vpk").is_file());
  }

  #[test]
  #[ignore = "requires the local Josuke and Suit Shiv VPK fixtures"]
  fn real_shiv_pair_requires_a_choice_in_both_directions() {
    let (_game, mut manager, base) = world();
    // Replace synthetic archives with the real pair; no live game files are changed.
    manager
      .uninstall_mod("josuke".into(), vec![], None)
      .unwrap();
    fs::copy(
      std::env::var("DMM_JOSUKE_VPK").unwrap(),
      base.join("josuke_skin.vpk"),
    )
    .unwrap();
    fs::copy(
      std::env::var("DMM_SUIT_SHIV_VPK").unwrap(),
      base.join("suit_skin.vpk"),
    )
    .unwrap();
    manager.install_mod(skin("josuke"), None).unwrap();
    assert!(matches!(
      manager.install_mod(skin("suit"), None),
      Err(Error::ModelConflict(_))
    ));
    manager
      .install_mod_resolving_conflicts(skin("suit"), None, &["josuke".into()])
      .unwrap();
    assert!(matches!(
      manager.install_mod(skin("josuke"), None),
      Err(Error::ModelConflict(_))
    ));
    manager
      .install_mod_resolving_conflicts(skin("josuke"), None, &["suit".into()])
      .unwrap();
    let manifest = ProfileVpkManifest::load(&base).unwrap();
    assert!(manifest.mods["josuke"].enabled);
    assert!(!manifest.mods["suit"].enabled);
    assert!(manifest.mods["other"].enabled);
  }
}
