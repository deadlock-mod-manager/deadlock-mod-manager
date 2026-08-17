use crate::commands::state::MANAGER;
use crate::errors::Error;
use hero_parser::HeroDetectionResult;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::LazyLock;
use vpkmanager::locate;

static HERO_CACHE: LazyLock<hero_parser::VpkEntryCache> =
  LazyLock::new(hero_parser::VpkEntryCache::new);

#[tauri::command]
pub fn clear_vpk_entry_cache() {
  let count = HERO_CACHE.clear();
  log::info!("VPK entry cache cleared ({count} entries removed)");
}

/// Every VPK of a mod that hero detection can read: the ones installed in any
/// profile, plus the ones still sitting in its download folder.
///
/// Locating the installed files is the VPK layer's job — it is the only thing
/// that can find a file the user renamed.
fn collect_vpk_files_for_mod(addons_root: Option<&Path>, mod_id: &str) -> Vec<PathBuf> {
  let mut vpk_files = match addons_root.filter(|root| root.exists()) {
    Some(root) => locate::mod_vpks_in_all_profiles(root, mod_id),
    None => Vec::new(),
  };

  if let Ok(app_data) = std::env::var("LOCALAPPDATA") {
    let mod_data_path = PathBuf::from(app_data)
      .join("dev.stormix.deadlock-mod-manager")
      .join("mods")
      .join(mod_id);
    if mod_data_path.exists() {
      vpk_files.extend(locate::vpks_under(&mod_data_path));
    }
  }

  vpk_files
}

/// `citadel/addons` of the current game install, if there is one.
fn addons_root() -> Option<PathBuf> {
  let mod_manager = MANAGER.lock().unwrap();
  let game_path = mod_manager.get_steam_manager().get_game_path()?;
  Some(game_path.join("game").join("citadel").join("addons"))
}

#[tauri::command]
pub async fn detect_mod_hero(mod_id: String) -> Result<HeroDetectionResult, Error> {
  let addons_root = addons_root();
  tauri::async_runtime::spawn_blocking(move || {
    log::info!("Detecting hero for mod: {mod_id}");
    let vpk_files = collect_vpk_files_for_mod(addons_root.as_deref(), &mod_id);
    log::info!("Found {} VPK file(s) for mod {mod_id}", vpk_files.len());

    let result = hero_parser::detect_hero_from_vpk_files(&vpk_files, &HERO_CACHE);
    log::info!(
      "Hero detection result for mod {mod_id}: hero={:?}, category={}, internal_names={:?}",
      result.hero,
      result.category,
      result.internal_names
    );

    Ok(result)
  })
  .await
  .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModDetectionRequest {
  pub mod_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModDetectionResponse {
  pub mod_id: String,
  pub result: HeroDetectionResult,
}

#[tauri::command]
pub async fn detect_mod_heroes_batch(
  mods: Vec<ModDetectionRequest>,
) -> Result<Vec<ModDetectionResponse>, Error> {
  let addons_root = addons_root();
  let items: Vec<hero_parser::BatchDetectionItem> = mods
    .into_iter()
    .map(|req| hero_parser::BatchDetectionItem {
      vpk_paths: collect_vpk_files_for_mod(addons_root.as_deref(), &req.mod_id),
      id: req.mod_id,
    })
    .collect();

  log::info!("Batch hero detection for {} mods", items.len());

  let results = tauri::async_runtime::spawn_blocking(move || {
    hero_parser::detect_heroes_batch(items, &HERO_CACHE)
  })
  .await
  .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?;

  log::info!("Batch hero detection complete: {} results", results.len());

  Ok(
    results
      .into_iter()
      .map(|r| ModDetectionResponse {
        mod_id: r.id,
        result: r.result,
      })
      .collect(),
  )
}
