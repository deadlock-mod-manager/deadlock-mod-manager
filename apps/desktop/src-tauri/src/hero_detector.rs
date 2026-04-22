use crate::commands::MANAGER;
use crate::errors::Error;
use hero_parser::HeroDetectionResult;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::LazyLock;

static HERO_CACHE: LazyLock<hero_parser::VpkEntryCache> =
  LazyLock::new(hero_parser::VpkEntryCache::new);

#[tauri::command]
pub fn clear_vpk_entry_cache() {
  let count = HERO_CACHE.clear();
  log::info!("VPK entry cache cleared ({count} entries removed)");
}

fn collect_vpk_files_recursive(dir: &PathBuf, out: &mut Vec<PathBuf>) {
  let Ok(entries) = std::fs::read_dir(dir) else {
    return;
  };
  for entry in entries.filter_map(|e| e.ok()) {
    let path = entry.path();
    if path.is_dir() {
      collect_vpk_files_recursive(&path, out);
    } else if path.extension().and_then(|e| e.to_str()) == Some("vpk") {
      out.push(path);
    }
  }
}

fn collect_vpk_files_for_mod(mod_id: &str, installed_vpks: Option<Vec<String>>) -> Vec<PathBuf> {
  let mut vpk_files: Vec<PathBuf> = Vec::new();

  let mod_manager = MANAGER.lock().unwrap();
  let uses_compression = mod_manager
    .get_mod_repository()
    .get_mod(mod_id)
    .map(|m| m.uses_compression)
    .unwrap_or(false);

  if uses_compression
    && let Some(m) = mod_manager.get_mod_repository().get_mod(mod_id)
    && let Ok(mods_store) = mod_manager.get_mods_store_path()
  {
    let staged = crate::mod_compression::paths::compression_staged_dir(&mods_store, mod_id);
    for orig in &m.original_vpk_names {
      let p = staged.join(orig);
      if p.exists() {
        vpk_files.push(p);
      }
    }
    if !vpk_files.is_empty() {
      log::debug!(
        "Hero detection using {} staged VPK(s) for compressed mod {mod_id}",
        vpk_files.len()
      );
      return vpk_files;
    }
  }

  if !uses_compression
    && let Some(game_path) = mod_manager.get_steam_manager().get_game_path()
  {
    let addons_path = game_path.join("game").join("citadel").join("addons");
    if addons_path.exists() {
      let repo_vpks = mod_manager
        .get_mod_repository()
        .get_mod(mod_id)
        .map(|m| m.installed_vpks.clone());
      let known_vpks = repo_vpks
        .filter(|v| !v.is_empty())
        .or(installed_vpks)
        .unwrap_or_default();
      for vpk_name in &known_vpks {
        let vpk_path = addons_path.join(vpk_name);
        if vpk_path.exists() {
          vpk_files.push(vpk_path);
        }
      }

      let prefix = format!("{mod_id}_");
      let scan_dirs: Vec<PathBuf> = std::iter::once(addons_path.clone())
        .chain(
          std::fs::read_dir(&addons_path)
            .into_iter()
            .flatten()
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.is_dir()),
        )
        .collect();

      for dir in scan_dirs {
        if let Ok(entries) = std::fs::read_dir(&dir) {
          for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("vpk")
              && let Some(name) = path.file_name().and_then(|n| n.to_str())
              && name.starts_with(&prefix)
            {
              vpk_files.push(path);
            }
          }
        }
      }
    }
  }
  drop(mod_manager);

  if vpk_files.is_empty()
    && let Ok(app_data) = std::env::var("LOCALAPPDATA")
  {
    let mod_data_path = PathBuf::from(app_data)
      .join("dev.stormix.deadlock-mod-manager")
      .join("mods")
      .join(mod_id);
    if mod_data_path.exists() {
      collect_vpk_files_recursive(&mod_data_path, &mut vpk_files);
    }
  }

  if uses_compression {
    log::debug!(
      "Hero detection using {} source VPK(s) (LOCALAPPDATA fallback) for compressed mod {mod_id}",
      vpk_files.len()
    );
  }

  vpk_files
}

#[tauri::command]
pub async fn detect_mod_hero(
  mod_id: String,
  installed_vpks: Option<Vec<String>>,
) -> Result<HeroDetectionResult, Error> {
  tauri::async_runtime::spawn_blocking(move || {
    log::info!("Detecting hero for mod: {mod_id}");
    let vpk_files = collect_vpk_files_for_mod(&mod_id, installed_vpks);
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
  pub installed_vpks: Option<Vec<String>>,
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
  let items: Vec<hero_parser::BatchDetectionItem> = {
    let mod_manager = MANAGER.lock().unwrap();
    let game_path = mod_manager.get_steam_manager().get_game_path().cloned();
    let app_data = std::env::var("LOCALAPPDATA").ok();

    mods
      .into_iter()
      .map(|req| {
        let mut vpk_files: Vec<PathBuf> = Vec::new();

        let repo_mod = mod_manager.get_mod_repository().get_mod(&req.mod_id);
        let uses_compression = repo_mod.map(|m| m.uses_compression).unwrap_or(false);

        if uses_compression
          && let Some(m) = repo_mod
          && let Ok(mods_store) = mod_manager.get_mods_store_path()
        {
          let staged =
            crate::mod_compression::paths::compression_staged_dir(&mods_store, &req.mod_id);
          for orig in &m.original_vpk_names {
            let p = staged.join(orig);
            if p.exists() {
              vpk_files.push(p);
            }
          }
        }

        if !uses_compression
          && vpk_files.is_empty()
          && let Some(ref gp) = game_path
        {
          let addons_path = gp.join("game").join("citadel").join("addons");
          if addons_path.exists() {
            let repo_vpks = repo_mod.map(|m| m.installed_vpks.clone());
            let known_vpks = repo_vpks
              .filter(|v| !v.is_empty())
              .or(req.installed_vpks)
              .unwrap_or_default();
            for vpk_name in &known_vpks {
              let vpk_path = addons_path.join(vpk_name);
              if vpk_path.exists() {
                vpk_files.push(vpk_path);
              }
            }

            let prefix = format!("{}_", req.mod_id);
            let scan_dirs: Vec<PathBuf> = std::iter::once(addons_path.clone())
              .chain(
                std::fs::read_dir(&addons_path)
                  .into_iter()
                  .flatten()
                  .filter_map(|e| e.ok())
                  .map(|e| e.path())
                  .filter(|p| p.is_dir()),
              )
              .collect();

            for dir in scan_dirs {
              if let Ok(entries) = std::fs::read_dir(&dir) {
                for entry in entries.filter_map(|e| e.ok()) {
                  let path = entry.path();
                  if path.extension().and_then(|e| e.to_str()) == Some("vpk")
                    && let Some(name) = path.file_name().and_then(|n| n.to_str())
                    && name.starts_with(&prefix)
                  {
                    vpk_files.push(path);
                  }
                }
              }
            }
          }
        }

        if vpk_files.is_empty()
          && let Some(ref ad) = app_data
        {
          let mod_data_path = PathBuf::from(ad)
            .join("dev.stormix.deadlock-mod-manager")
            .join("mods")
            .join(&req.mod_id);
          if mod_data_path.exists() {
            collect_vpk_files_recursive(&mod_data_path, &mut vpk_files);
          }
        }

        hero_parser::BatchDetectionItem {
          id: req.mod_id,
          vpk_paths: vpk_files,
        }
      })
      .collect()
  };

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
