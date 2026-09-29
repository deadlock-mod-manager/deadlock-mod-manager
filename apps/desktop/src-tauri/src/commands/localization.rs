use crate::errors::Error;
use crate::mod_manager::localization_overlay::{
  LocalizationOverlayAnalysis, LocalizationOverlayApplyResult, LocalizationResolution,
};

use super::state::MANAGER;

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
