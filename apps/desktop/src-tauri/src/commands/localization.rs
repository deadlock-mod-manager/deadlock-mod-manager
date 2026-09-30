use crate::errors::Error;
use crate::mod_manager::localization_overlay::{
  LocalizationOverlayAnalysis, LocalizationOverlayApplyResult, LocalizationResolution,
};

use super::state::MANAGER;

#[tauri::command]
pub async fn get_mod_compatibility_enabled() -> Result<bool, Error> {
  MANAGER.lock().unwrap().mod_compatibility_enabled()
}

#[tauri::command]
pub async fn set_mod_compatibility_enabled(
  enabled: bool,
  profile_folder: Option<String>,
) -> Result<(), Error> {
  MANAGER
    .lock()
    .unwrap()
    .set_mod_compatibility_enabled(enabled, profile_folder)
}

#[tauri::command]
pub async fn analyze_localization_overlay(
  profile_folder: Option<String>,
) -> Result<LocalizationOverlayAnalysis, Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager.analyze_localization_overlay(profile_folder)
}

#[tauri::command]
pub async fn apply_localization_overlay(
  profile_folder: Option<String>,
  resolutions: Vec<LocalizationResolution>,
) -> Result<LocalizationOverlayApplyResult, Error> {
  let mut mod_manager = MANAGER.lock().unwrap();
  mod_manager.apply_localization_overlay(profile_folder, resolutions)
}
