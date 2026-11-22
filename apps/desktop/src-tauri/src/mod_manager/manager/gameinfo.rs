use super::*;

fn search_paths_for(
  base: &ProfileBase,
  manifest: &ProfileVpkManifest,
  profile_folder: Option<&str>,
) -> Vec<String> {
  let mut max_shard = ShardIndex::FIRST;
  for entry in manifest.mods.values() {
    if entry.enabled && !entry.current_vpks.is_empty() {
      max_shard = max_shard.max(entry.shard);
    }
  }

  for (shard_index, dir) in base.shards().skip(1) {
    if VpkManager::count_enabled_vpks(&dir) > 0 {
      max_shard = max_shard.max(shard_index);
    }
  }

  shard::all_shards()
    .take(max_shard.get() as usize)
    .map(|shard| shard.search_path(profile_folder))
    .collect()
}

fn needs_shard_migration(base: &ProfileBase) -> bool {
  base.shards().any(|(_, dir)| {
    VpkManager::count_enabled_vpks(&dir) > shard::SHARD_CAPACITY
      || VpkManager::has_out_of_range_enabled_vpks(&dir)
  })
}

impl ModManager {
  pub fn profile_gameinfo_paths(
    &self,
    profile_folder: Option<String>,
  ) -> Result<Vec<String>, Error> {
    let base = self.get_addons_path(profile_folder.as_deref())?;
    let manifest = ProfileVpkManifest::load(&base)?;
    let mut paths = search_paths_for(&base, &manifest, profile_folder.as_deref());
    if self.mod_fix_saved(profile_folder.as_deref())? {
      paths.insert(
        0,
        Self::localization_overlay_search_path(profile_folder.as_deref()),
      );
    }
    Ok(paths)
  }

  pub fn profile_needs_shard_migration(&self, profile_folder: Option<&str>) -> Result<bool, Error> {
    Ok(needs_shard_migration(
      &self.get_addons_path(profile_folder)?,
    ))
  }

  pub fn migrate_profile_to_shards(&mut self, profile_folder: Option<String>) -> Result<(), Error> {
    let base = self.get_addons_path(profile_folder.as_deref())?;
    if base.exists() {
      ProfileVpkManifest::recover_profile(&base)?;
    }
    if needs_shard_migration(&base) {
      log::info!("Migrating legacy VPK numbering into addon shards for profile {profile_folder:?}");
      self.reorder_all_mods_for_profile(profile_folder)?;
    }
    Ok(())
  }

  pub fn apply_profile_gameinfo(&mut self, profile_folder: Option<String>) -> Result<(), Error> {
    let game_path = self
      .steam_manager
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?
      .clone();
    let paths = self.profile_gameinfo_paths(profile_folder)?;
    self.config_manager.update_mod_paths(&game_path, &paths)
  }

  pub fn apply_layered_gameinfo(
    &mut self,
    server_folder: Option<String>,
    profile_folder: Option<String>,
  ) -> Result<(), Error> {
    let game_path = self
      .steam_manager
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?
      .clone();

    let mut paths = Vec::new();
    if let Some(server) = server_folder {
      paths.extend(self.profile_gameinfo_paths(Some(server))?);
    }
    paths.extend(self.profile_gameinfo_paths(profile_folder)?);

    self.config_manager.update_mod_paths(&game_path, &paths)
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;

  fn citadel(temp: &tempfile::TempDir) -> PathBuf {
    let citadel = temp.path().join("game").join("citadel");
    fs::create_dir_all(citadel.join("addons")).unwrap();
    citadel
  }

  fn write_pak(dir: &Path, name: &str) {
    fs::create_dir_all(dir).unwrap();
    fs::write(dir.join(name), b"vpk").unwrap();
  }

  fn paths_for(citadel: &Path, profile_folder: Option<&str>) -> Vec<String> {
    let addons = citadel.join("addons");
    let base = ProfileBase::new(match profile_folder {
      Some(folder) => addons.join(folder),
      None => addons,
    })
    .unwrap();
    search_paths_for(&base, &ProfileVpkManifest::default(), profile_folder)
  }

  #[test]
  fn search_paths_cover_every_shard_that_holds_enabled_vpks() {
    let temp = tempfile::tempdir().unwrap();
    let citadel = citadel(&temp);

    write_pak(&citadel.join("addons"), "pak01_dir.vpk");
    assert_eq!(
      paths_for(&citadel, None),
      vec!["citadel/addons".to_string()]
    );

    write_pak(&citadel.join("addons2"), "pak01_dir.vpk");
    write_pak(&citadel.join("addons3"), "pak01_dir.vpk");
    assert_eq!(
      paths_for(&citadel, None),
      vec![
        "citadel/addons".to_string(),
        "citadel/addons2".to_string(),
        "citadel/addons3".to_string(),
      ]
    );
  }

  #[test]
  fn search_paths_follow_the_manifest_when_disk_is_behind() {
    let temp = tempfile::tempdir().unwrap();
    let citadel = citadel(&temp);
    let base = ProfileBase::new(citadel.join("addons")).unwrap();

    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "123",
      vec!["pak01_dir.vpk".to_string()],
      Vec::new(),
      None,
      ShardIndex::new(4).unwrap(),
    );

    assert_eq!(search_paths_for(&base, &manifest, None).len(), 4);
  }

  #[test]
  fn search_paths_survive_a_missing_base_directory() {
    let temp = tempfile::tempdir().unwrap();
    let citadel = citadel(&temp);
    write_pak(&citadel.join("addons2").join("profile_x"), "pak01_dir.vpk");

    assert_eq!(
      paths_for(&citadel, Some("profile_x")),
      vec![
        "citadel/addons/profile_x".to_string(),
        "citadel/addons2/profile_x".to_string(),
      ]
    );
  }

  #[test]
  fn search_paths_are_scoped_to_the_profile_folder() {
    let temp = tempfile::tempdir().unwrap();
    let citadel = citadel(&temp);

    write_pak(&citadel.join("addons").join("profile_x"), "pak01_dir.vpk");
    write_pak(&citadel.join("addons2").join("profile_x"), "pak01_dir.vpk");
    write_pak(&citadel.join("addons3").join("profile_y"), "pak01_dir.vpk");

    assert_eq!(
      paths_for(&citadel, Some("profile_x")),
      vec![
        "citadel/addons/profile_x".to_string(),
        "citadel/addons2/profile_x".to_string(),
      ]
    );
  }

  #[test]
  fn migration_only_triggers_for_a_pre_sharding_layout() {
    let temp = tempfile::tempdir().unwrap();
    let citadel = citadel(&temp);
    let profile = citadel.join("addons").join("profile_x");
    write_pak(&profile, "pak01_dir.vpk");
    let base = ProfileBase::new(&profile).unwrap();

    assert!(!needs_shard_migration(&base));

    write_pak(&profile, "pak100_dir.vpk");
    assert!(needs_shard_migration(&base));
  }
}
