use super::*;
use tauri_plugin_store::StoreExt;

const ENABLED_KEY: &str = "mod-compatibility-enabled";

impl ModManager {
  pub fn mod_compatibility_enabled(&self) -> Result<bool, Error> {
    let Some(app) = &self.app_handle else {
      return Ok(false);
    };
    let store = app
      .store(crate::runtime_environment::state_store_path())
      .map_err(|error| {
        Error::InvalidInput(format!("Failed to read compatibility preference: {error}"))
      })?;
    Ok(
      store
        .get(ENABLED_KEY)
        .and_then(|value| value.as_bool())
        .unwrap_or(false),
    )
  }

  pub fn set_mod_compatibility_enabled(
    &mut self,
    enabled: bool,
    profile_folder: Option<String>,
  ) -> Result<(), Error> {
    if self.is_game_running()? {
      return Err(Error::GameRunning);
    }
    let app = self
      .app_handle
      .as_ref()
      .ok_or(Error::AppHandleNotInitialized)?;
    let store = app
      .store(crate::runtime_environment::state_store_path())
      .map_err(|error| {
        Error::InvalidInput(format!(
          "Failed to access compatibility preference: {error}"
        ))
      })?;
    let previous = store.get(ENABLED_KEY);
    store.set(ENABLED_KEY, serde_json::json!(enabled));
    if let Err(error) = store.save() {
      match previous {
        Some(value) => store.set(ENABLED_KEY, value),
        None => {
          store.delete(ENABLED_KEY);
        }
      }
      return Err(Error::InvalidInput(format!(
        "Failed to save compatibility preference: {error}"
      )));
    }
    if !enabled && self.steam_manager.get_game_path().is_some() {
      self.delete_localization_overlay(profile_folder.as_deref())?;
      self
        .localization_overlay_plan_cache
        .lock()
        .map_err(|_| Error::BackgroundTaskFailed("Localization plan cache poisoned".into()))?
        .take();
      self.apply_profile_gameinfo(profile_folder)?;
    }
    Ok(())
  }
}
