use super::*;
use std::collections::BTreeMap;

impl ModManager {
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
    if self.write_mod_compatibility(&[mod_id], enabled, profile_folder.as_deref())? {
      self.notify_compatibility_changed(profile_folder.as_deref());
      self.apply_profile_gameinfo(profile_folder)?;
    }
    Ok(())
  }

  /// Saves the choice for every listed mod in one manifest write. Turning
  /// compatibility off records that the player chose the original files.
  /// Returns whether the set of repaired mods changed.
  pub(super) fn write_mod_compatibility(
    &self,
    mod_ids: &[String],
    enabled: bool,
    profile_folder: Option<&str>,
  ) -> Result<bool, Error> {
    let base = self.get_addons_path(profile_folder)?;
    let mut manifest = ProfileVpkManifest::open_for_write(&base)?;
    let mut scope_changed = false;
    let mut changed = false;
    for mod_id in mod_ids {
      let entry = manifest.mods.get_mut(mod_id).ok_or_else(|| {
        Error::InvalidInput(format!(
          "Install mod {mod_id} before changing compatibility"
        ))
      })?;
      scope_changed |= entry.compatibility_enabled != enabled;
      changed |= entry.compatibility_opted_out == enabled;
      entry.compatibility_enabled = enabled;
      entry.compatibility_opted_out = !enabled;
    }
    if !scope_changed {
      if changed {
        manifest.save(&base)?;
      }
      return Ok(false);
    }
    // Remove any previously generated replacements before committing the new scope.
    // If saving fails, the next launch rebuilds the previous selection safely.
    self.delete_localization_overlay(profile_folder)?;
    manifest.save(&base)?;
    self
      .localization_overlay_plan_cache
      .lock()
      .map_err(|_| Error::BackgroundTaskFailed("Localization plan cache poisoned".into()))?
      .take();
    Ok(true)
  }
}
