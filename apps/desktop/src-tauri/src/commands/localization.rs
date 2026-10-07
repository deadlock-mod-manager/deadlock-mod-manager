use crate::errors::Error;
use crate::mod_manager::localization_overlay::{
  LocalizationOverlayAnalysis, LocalizationOverlayApplyResult, LocalizationResolution,
};

use super::state::MANAGER;

#[tauri::command]
pub async fn set_mod_compatibility_feature(enabled: bool) -> Result<(), Error> {
  tauri::async_runtime::spawn_blocking(move || {
    MANAGER
      .lock()
      .map_err(|_| Error::BackgroundTaskFailed("Mod manager is unavailable".into()))?
      .set_mod_compatibility_feature(enabled);
    Ok(())
  })
  .await
  .map_err(|error| {
    Error::BackgroundTaskFailed(format!("Could not change mod compatibility: {error}"))
  })?
}

#[tauri::command]
pub async fn get_mod_compatibility_settings(
  profile_folder: Option<String>,
) -> Result<std::collections::BTreeMap<String, bool>, Error> {
  tauri::async_runtime::spawn_blocking(move || {
    MANAGER
      .lock()
      .map_err(|_| Error::BackgroundTaskFailed("Mod manager is unavailable".into()))?
      .mod_compatibility_settings(profile_folder.as_deref())
  })
  .await
  .map_err(|error| {
    Error::BackgroundTaskFailed(format!("Could not read mod compatibility: {error}"))
  })?
}

#[tauri::command]
pub async fn set_mod_compatibility_for_mod(
  mod_id: String,
  enabled: bool,
  profile_folder: Option<String>,
) -> Result<(), Error> {
  tauri::async_runtime::spawn_blocking(move || {
    MANAGER
      .lock()
      .map_err(|_| Error::BackgroundTaskFailed("Mod manager is unavailable".into()))?
      .set_mod_compatibility_for_mod(mod_id, enabled, profile_folder)
  })
  .await
  .map_err(|error| {
    Error::BackgroundTaskFailed(format!("Could not change mod compatibility: {error}"))
  })?
}

#[tauri::command]
pub async fn analyze_localization_overlay(
  profile_folder: Option<String>,
  resolutions: Option<Vec<LocalizationResolution>>,
) -> Result<LocalizationOverlayAnalysis, Error> {
  tauri::async_runtime::spawn_blocking(move || {
    let mut mod_manager = MANAGER.lock().map_err(|_| {
      Error::BackgroundTaskFailed(
        "Mod manager is unavailable. Restart the manager and retry compatibility review".into(),
      )
    })?;
    mod_manager
      .analyze_localization_overlay(profile_folder, resolutions.as_deref().unwrap_or_default())
  })
  .await
  .map_err(|error| {
    Error::BackgroundTaskFailed(format!(
      "Compatibility analysis could not finish: {error}. Retry compatibility review"
    ))
  })?
}

#[tauri::command]
pub async fn apply_localization_overlay(
  profile_folder: Option<String>,
  resolutions: Vec<LocalizationResolution>,
  expected_fingerprint: String,
) -> Result<LocalizationOverlayApplyResult, Error> {
  tauri::async_runtime::spawn_blocking(move || {
    let mut mod_manager = MANAGER.lock().map_err(|_| {
      Error::BackgroundTaskFailed(
        "Mod manager is unavailable. Restart the manager and retry compatibility review".into(),
      )
    })?;
    mod_manager.apply_localization_overlay(profile_folder, resolutions, expected_fingerprint)
  })
  .await
  .map_err(|error| {
    Error::BackgroundTaskFailed(format!(
      "Compatibility fixes could not be prepared: {error}. Retry compatibility review"
    ))
  })?
}
