use super::*;
use std::collections::BTreeMap;

impl ModManager {
  /// Mirrors the frontend's Mod Compatibility Repairs experimental flag. While
  /// it is off, no gameinfo write includes the repair package, even one that is
  /// still on disk from an earlier launch.
  pub fn set_mod_compatibility_feature(&self, enabled: bool) {
    self
      .mod_compatibility_feature
      .store(enabled, std::sync::atomic::Ordering::Relaxed);
  }

  pub(super) fn mod_compatibility_feature_enabled(&self) -> bool {
    self
      .mod_compatibility_feature
      .load(std::sync::atomic::Ordering::Relaxed)
  }

  pub fn mod_compatibility_settings(
    &self,
    profile_folder: Option<&str>,
  ) -> Result<BTreeMap<String, bool>, Error> {
    let base = self.get_addons_path(profile_folder)?;
    Ok(
      ProfileVpkManifest::load(&base)?
        .mods
        .into_iter()
        .map(|(id, entry)| (id, entry.compatibility_enabled))
        .collect(),
    )
  }

  pub fn mod_compatibility_enabled(&self, profile_folder: Option<&str>) -> Result<bool, Error> {
    if self.steam_manager.get_game_path().is_none() {
      return Ok(false);
    }
    let base = self.get_addons_path(profile_folder)?;
    Ok(
      ProfileVpkManifest::load(&base)?
        .mods
        .values()
        .any(|entry| entry.enabled && entry.compatibility_enabled),
    )
  }

  pub fn set_mod_compatibility_for_mod(
    &mut self,
    mod_id: String,
    enabled: bool,
    profile_folder: Option<String>,
  ) -> Result<(), Error> {
    if self.is_game_running()? {
      return Err(Error::GameRunning);
    }
    let base = self.get_addons_path(profile_folder.as_deref())?;
    let mut manifest = ProfileVpkManifest::open_for_write(&base)?;
    let entry = manifest.mods.get_mut(&mod_id).ok_or_else(|| {
      Error::InvalidInput(format!(
        "Install mod {mod_id} before changing compatibility"
      ))
    })?;
    if entry.compatibility_enabled == enabled {
      return Ok(());
    }
    // Remove any previously generated replacements before committing the new scope.
    // If saving fails, the next launch rebuilds the previous selection safely.
    self.delete_localization_overlay(profile_folder.as_deref())?;
    entry.compatibility_enabled = enabled;
    manifest.save(&base)?;
    self
      .localization_overlay_plan_cache
      .lock()
      .map_err(|_| Error::BackgroundTaskFailed("Localization plan cache poisoned".into()))?
      .take();
    self.apply_profile_gameinfo(profile_folder)?;
    Ok(())
  }
}
