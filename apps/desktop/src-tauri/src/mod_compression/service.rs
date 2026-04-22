use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Emitter};
use vpkmerger::{
  default_max_shard_bytes, read_manifest, rebuild_addon_compressed, write_manifest_atomic,
  CancelToken, ModRebuildInput,
};

use crate::errors::Error;
use crate::mod_compression::paths::{compression_staged_dir, merged_base_name, pak_shard_name};
use crate::mod_compression::state;
use crate::mod_manager::mod_repository::Mod;
use crate::mod_manager::ModManager;

struct EmitProgress<'a> {
  app: &'a AppHandle,
}

impl vpkmerger::ProgressSink for EmitProgress<'_> {
  fn report(&self, done: u64, total: u64) {
    let _ = self.app.emit(
      "mod-compression-progress",
      serde_json::json!({
        "stage": "merging",
        "current": done,
        "total": total,
        "currentMod": serde_json::Value::Null,
      }),
    );
  }
}

pub fn addons_path_for(manager: &ModManager, profile_folder: Option<&str>) -> Result<PathBuf, Error> {
  let game_path = manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?;
  Ok(if let Some(folder) = profile_folder {
    game_path
      .join("game")
      .join("citadel")
      .join("addons")
      .join(folder)
  } else {
    game_path.join("game").join("citadel").join("addons")
  })
}

pub fn stage_mod_vpks(mods_store: &Path, addons_path: &Path, m: &Mod) -> Result<(), Error> {
  let dir = compression_staged_dir(mods_store, &m.id);
  fs::create_dir_all(&dir).map_err(Error::Io)?;
  for (i, vpk) in m.installed_vpks.iter().enumerate() {
    let orig = m
      .original_vpk_names
      .get(i)
      .cloned()
      .unwrap_or_else(|| format!("file_{i}.vpk"));
    let src = addons_path.join(vpk);
    if src.exists() {
      fs::copy(&src, dir.join(&orig)).map_err(Error::Io)?;
    }
  }
  Ok(())
}

fn collect_rebuild_inputs(
  manager: &ModManager,
  mods_store: &Path,
  addons_path: &Path,
) -> Result<Vec<ModRebuildInput>, Error> {
  let mut mods: Vec<Mod> = manager
    .get_mod_repository()
    .get_all_mods()
    .cloned()
    .collect();
  mods.sort_by_key(|m| m.install_order.unwrap_or(999));
  let mut inputs: Vec<ModRebuildInput> = Vec::new();
  for m in mods {
    if m.is_map {
      continue;
    }
    if m.installed_vpks.is_empty() {
      continue;
    }
    let dir_vpk_paths: Vec<PathBuf> = if m.uses_compression {
      m.original_vpk_names
        .iter()
        .map(|orig| compression_staged_dir(mods_store, &m.id).join(orig))
        .collect()
    } else {
      m.installed_vpks.iter().map(|v| addons_path.join(v)).collect()
    };
    for p in &dir_vpk_paths {
      if !p.exists() {
        return Err(Error::ModInvalid(format!(
          "missing VPK for mod {}: {}",
          m.id,
          p.display()
        )));
      }
    }
    inputs.push(ModRebuildInput {
      mod_id: m.id.clone(),
      load_order: m.install_order.unwrap_or(0),
      dir_vpk_paths,
      original_vpk_names: m.original_vpk_names.clone(),
    });
  }
  Ok(inputs)
}

fn delete_files_unique(paths: HashSet<PathBuf>) {
  for p in paths {
    if p.exists() {
      let _ = fs::remove_file(p);
    }
  }
}

pub fn rebuild_compressed_addon(
  app: &AppHandle,
  manager: &mut ModManager,
  profile_folder: Option<String>,
  cancel: &CancelToken,
) -> Result<(), Error> {
  log::info!(
    "rebuild_compressed_addon: profile={profile_folder:?}"
  );
  if manager.is_game_running()? {
    log::warn!("rebuild_compressed_addon aborted: game is running");
    return Err(Error::GameRunning);
  }
  let profile_ref = profile_folder.as_deref();
  let addons_path = addons_path_for(manager, profile_ref)?;
  log::info!("rebuild_compressed_addon: addons_path={}", addons_path.display());
  if !addons_path.exists() {
    return Err(Error::GamePathNotSet);
  }

  let mods_store = manager.get_mods_store_path()?;

  for m in manager.get_mod_repository().get_all_mods() {
    if m.is_map || m.installed_vpks.is_empty() {
      continue;
    }
    if !m.uses_compression {
      stage_mod_vpks(&mods_store, &addons_path, m)?;
    }
  }

  let inputs = collect_rebuild_inputs(manager, &mods_store, &addons_path)?;
  log::info!("rebuild_compressed_addon: {} mod(s) to merge", inputs.len());
  if inputs.is_empty() {
    log::warn!(
      "rebuild_compressed_addon: no installed mods found, disabling compression"
    );
    state::set_compression_enabled(false, profile_folder.clone());
    return Ok(());
  }

  let mut to_delete: HashSet<PathBuf> = HashSet::new();
  for m in manager.get_mod_repository().get_all_mods() {
    for v in &m.installed_vpks {
      to_delete.insert(addons_path.join(v));
    }
  }

  let temp_base = addons_path.join(merged_base_name());
  let progress = EmitProgress { app };
  log::info!("rebuild_compressed_addon: starting merge into {temp_base:?}");
  let mut report = rebuild_addon_compressed(
    &inputs,
    &temp_base,
    default_max_shard_bytes(),
    merged_base_name(),
    cancel,
    &progress,
  )
  .map_err(|e| {
    log::error!("rebuild_addon_compressed failed: {e}");
    Error::ModInvalid(e.to_string())
  })?;
  log::info!(
    "rebuild_compressed_addon: merge produced {} shard(s)",
    report.output_files.len()
  );

  delete_files_unique(to_delete);

  let shard_count = report.output_files.len();
  for (idx, (path, _)) in report.output_files.iter().enumerate() {
    let target = addons_path.join(pak_shard_name(idx as u32));
    if target.exists() {
      fs::remove_file(&target).map_err(Error::Io)?;
    }
    fs::rename(path, &target)
      .map_err(|e| Error::ModInvalid(format!("rename shard: {e}")))?;
  }

  report.manifest.shard_files = (0..shard_count)
    .map(|i| pak_shard_name(i as u32))
    .collect();

  let manifest_path = vpkmerger::manifest_path(&addons_path);
  write_manifest_atomic(&manifest_path, &report.manifest)
    .map_err(|e| Error::ModInvalid(e.to_string()))?;

  let shared_vpks: Vec<String> = (0..shard_count)
    .map(|i| pak_shard_name(i as u32))
    .collect();

  let ids: Vec<String> = manager
    .get_mod_repository()
    .get_all_mods()
    .map(|m| m.id.clone())
    .collect();
  for id in ids {
    if let Some(mut m) = manager.get_mod_repository().get_mod(&id).cloned() {
      if m.is_map {
        continue;
      }
      if m.installed_vpks.is_empty() {
        continue;
      }
      m.installed_vpks = shared_vpks.clone();
      m.uses_compression = true;
      manager.get_mod_repository_mut().add_mod(m);
    }
  }

  let total_bytes: u64 = report.output_files.iter().map(|(_, s)| s).sum();
  let shard_files: Vec<String> = (0..shard_count)
    .map(|i| pak_shard_name(i as u32))
    .collect();
  let _ = app.emit(
    "mod-compression-completed",
    serde_json::json!({
      "shardCount": shard_count,
      "totalBytes": total_bytes,
      "shardFiles": shard_files,
    }),
  );

  Ok(())
}

pub fn disable_compressed_addon(
  app: &AppHandle,
  manager: &mut ModManager,
  profile_folder: Option<String>,
  cancel: &CancelToken,
) -> Result<(), Error> {
  if manager.is_game_running()? {
    return Err(Error::GameRunning);
  }
  let profile_ref = profile_folder.as_deref();
  let addons_path = addons_path_for(manager, profile_ref)?;
  let manifest_path = vpkmerger::manifest_path(&addons_path);
  if !manifest_path.exists() {
    state::set_compression_enabled(false, profile_folder.clone());
    return Ok(());
  }

  cancel
    .check()
    .map_err(|_| Error::InvalidInput("cancelled".into()))?;

  let mods_store = manager.get_mods_store_path()?;
  let mut ordered: Vec<Mod> = manager
    .get_mod_repository()
    .get_all_mods()
    .cloned()
    .collect();
  ordered.sort_by_key(|m| m.install_order.unwrap_or(999));

  let mut to_remove: HashSet<PathBuf> = HashSet::new();
  for m in &ordered {
    for v in &m.installed_vpks {
      to_remove.insert(addons_path.join(v));
    }
  }
  delete_files_unique(to_remove);
  if manifest_path.exists() {
    fs::remove_file(&manifest_path).map_err(Error::Io)?;
  }
  let dir = vpkmerger::manifest_dir_under_addons(&addons_path);
  if dir.exists() {
    let _ = fs::remove_dir_all(&dir);
  }

  cancel
    .check()
    .map_err(|_| Error::InvalidInput("cancelled".into()))?;

  let mut mod_updates: Vec<serde_json::Value> = Vec::new();
  for mut m in ordered {
    if m.is_map || !m.uses_compression {
      continue;
    }
    let staged = compression_staged_dir(&mods_store, &m.id);
    if !staged.exists() {
      continue;
    }
    let mut prefixed_names: Vec<String> = Vec::new();
    for orig in &m.original_vpk_names {
      let src = staged.join(orig);
      if src.exists() {
        let name = format!("{}_{}", m.id, orig);
        let dst = addons_path.join(&name);
        fs::copy(&src, &dst).map_err(Error::Io)?;
        prefixed_names.push(name);
      }
    }
    if prefixed_names.is_empty() {
      continue;
    }
    let installed = manager.enable_mod_prefixed_vpks(&addons_path, &m.id, &prefixed_names)?;
    m.installed_vpks = installed;
    m.uses_compression = false;
    mod_updates.push(serde_json::json!({
      "modId": m.id,
      "installedVpks": m.installed_vpks,
      "usesCompression": false,
    }));
    manager.get_mod_repository_mut().add_mod(m);
  }

  let _ = app.emit(
    "mod-compression-completed",
    serde_json::json!({
      "shardCount": 0,
      "totalBytes": 0,
      "modUpdates": mod_updates,
    }),
  );

  state::set_compression_enabled(false, profile_folder.clone());
  Ok(())
}

pub fn cleanup_stale_compression_tmp_files(game_addons_path: &Path) {
  cleanup_one_addons_root(game_addons_path);
  if let Ok(entries) = fs::read_dir(game_addons_path) {
    for entry in entries.flatten() {
      let p = entry.path();
      if !p.is_dir() {
        continue;
      }
      let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
      if name.starts_with('.') {
        continue;
      }
      cleanup_one_addons_root(&p);
    }
  }
}

fn cleanup_one_addons_root(addons_path: &Path) {
  let dir = vpkmerger::manifest_dir_under_addons(addons_path);
  if dir.exists()
    && let Ok(entries) = fs::read_dir(&dir)
  {
    for entry in entries.flatten() {
      let p = entry.path();
      if p.is_file()
        && let Some(name) = p.file_name().and_then(|n| n.to_str())
        && name.ends_with(".tmp")
      {
        let _ = fs::remove_file(&p);
      }
    }
  }
  if let Ok(entries) = fs::read_dir(addons_path) {
    for entry in entries.flatten() {
      let p = entry.path();
      if p.is_file()
        && let Some(name) = p.file_name().and_then(|n| n.to_str())
        && name.ends_with(".vpk.tmp")
      {
        let _ = fs::remove_file(&p);
      }
    }
  }
}

pub fn validate_manifest_on_disk(addons_path: &Path) -> Result<bool, Error> {
  let manifest_path = vpkmerger::manifest_path(addons_path);
  if !manifest_path.exists() {
    return Ok(true);
  }
  let manifest = read_manifest(&manifest_path).map_err(|e| Error::ModInvalid(e.to_string()))?;
  for name in &manifest.shard_files {
    let p = addons_path.join(name);
    if !p.exists() {
      return Ok(false);
    }
  }
  Ok(true)
}
