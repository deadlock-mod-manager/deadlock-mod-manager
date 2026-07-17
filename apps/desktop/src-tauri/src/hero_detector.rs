use crate::commands::state::MANAGER;
use crate::errors::Error;
use crate::mod_manager::{shard, vpk_manifest::ProfileVpkManifest};
use hero_parser::HeroDetectionResult;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
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

fn profile_bases(addons_root: &Path) -> Vec<PathBuf> {
  let mut bases = vec![addons_root.to_path_buf()];
  if let Ok(entries) = std::fs::read_dir(addons_root) {
    bases.extend(
      entries
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.is_dir()),
    );
  }
  bases
}

fn push_existing_unique(out: &mut Vec<PathBuf>, path: PathBuf) {
  if path.is_file() && !out.contains(&path) {
    out.push(path);
  }
}

fn collect_game_vpks_for_mod(
  addons_root: &Path,
  mod_id: &str,
  known_vpks: &[String],
  out: &mut Vec<PathBuf>,
) {
  let bases = profile_bases(addons_root);
  let mut found_manifest_entry = false;

  for base in &bases {
    let Ok(manifest) = ProfileVpkManifest::load(base) else {
      continue;
    };
    let Some(entry) = manifest.mods.get(mod_id) else {
      continue;
    };
    found_manifest_entry = true;

    if entry.enabled {
      let enabled_dir = shard::shard_dir(base, entry.shard.max(1));
      for vpk in &entry.current_vpks {
        push_existing_unique(out, enabled_dir.join(vpk));
      }
    } else {
      for vpk in &entry.disabled_vpks {
        push_existing_unique(out, base.join(vpk));
      }
    }
  }

  if !found_manifest_entry {
    for base in &bases {
      for shard_index in 1..=shard::MAX_SHARDS {
        let dir = shard::shard_dir(base, shard_index);
        for vpk in known_vpks {
          let Some(filename) = Path::new(vpk).file_name() else {
            continue;
          };
          push_existing_unique(out, dir.join(filename));
        }
      }
    }
  }

  let prefix = format!("{mod_id}_");
  for base in bases {
    if let Ok(entries) = std::fs::read_dir(base) {
      for entry in entries.filter_map(|entry| entry.ok()) {
        let path = entry.path();
        if path.extension().and_then(|extension| extension.to_str()) == Some("vpk")
          && path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with(&prefix))
        {
          push_existing_unique(out, path);
        }
      }
    }
  }
}

fn collect_vpk_files_for_mod(mod_id: &str, installed_vpks: Option<Vec<String>>) -> Vec<PathBuf> {
  let mut vpk_files: Vec<PathBuf> = Vec::new();

  let mod_manager = MANAGER.lock().unwrap();
  if let Some(game_path) = mod_manager.get_steam_manager().get_game_path() {
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
      collect_game_vpks_for_mod(&addons_path, mod_id, &known_vpks, &mut vpk_files);
    }
  }
  drop(mod_manager);

  if let Ok(app_data) = std::env::var("LOCALAPPDATA") {
    let mod_data_path = PathBuf::from(app_data)
      .join("dev.stormix.deadlock-mod-manager")
      .join("mods")
      .join(mod_id);
    if mod_data_path.exists() {
      collect_vpk_files_recursive(&mod_data_path, &mut vpk_files);
    }
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

        if let Some(ref gp) = game_path {
          let addons_path = gp.join("game").join("citadel").join("addons");
          if addons_path.exists() {
            let repo_vpks = mod_manager
              .get_mod_repository()
              .get_mod(&req.mod_id)
              .map(|m| m.installed_vpks.clone());
            let known_vpks = repo_vpks
              .filter(|v| !v.is_empty())
              .or(req.installed_vpks)
              .unwrap_or_default();
            collect_game_vpks_for_mod(&addons_path, &req.mod_id, &known_vpks, &mut vpk_files);
          }
        }

        if let Some(ref ad) = app_data {
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
