use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::path::PathBuf;

use tauri::{AppHandle, Emitter};
use vpkmerger::{
  CancelToken, CompressionLevel, CompressionManifest, ModRebuildInput, apply_bucket_rebuild,
  default_max_shard_bytes, find_bucket_id_for_mod, insert_mod_into_next_slot, read_manifest,
  rebuild_addon_compressed_bucketing, rebuild_bucket, remove_mod_from_buckets,
  remove_mod_from_manifest, write_manifest_atomic,
};

use crate::errors::Error;
use crate::mod_compression::paths::compression_staged_dir;
use crate::mod_compression::paths::manifest_merge_base_name;
use crate::mod_compression::state;
use crate::mod_manager::ModManager;
use crate::mod_manager::mod_repository::Mod;

fn install_order_pair_flipped(
  mod_ids: &[String],
  old_orders: &HashMap<String, u32>,
  manager: &ModManager,
) -> bool {
  let repo = manager.get_mod_repository();
  for i in 0..mod_ids.len() {
    for j in (i + 1)..mod_ids.len() {
      let a = mod_ids[i].as_str();
      let b = mod_ids[j].as_str();
      let Some(oa) = old_orders.get(a).copied() else {
        continue;
      };
      let Some(ob) = old_orders.get(b).copied() else {
        continue;
      };
      let na = repo
        .get_mod(a)
        .and_then(|m| m.install_order)
        .unwrap_or(u32::MAX);
      let nb = repo
        .get_mod(b)
        .and_then(|m| m.install_order)
        .unwrap_or(u32::MAX);
      if na == u32::MAX || nb == u32::MAX {
        continue;
      }
      if (oa < ob) != (na < nb) {
        return true;
      }
    }
  }
  false
}

pub fn rebuild_compression_after_reorder(
  app: &AppHandle,
  manager: &mut ModManager,
  profile_folder: Option<String>,
  cancel: &CancelToken,
  old_install_orders: &HashMap<String, u32>,
) -> Result<(), Error> {
  let profile_ref = profile_folder.as_deref();
  let addons_path = addons_path_for(manager, profile_ref)?;
  let manifest_path = vpkmerger::manifest_path(&addons_path);
  if !manifest_path.exists() {
    return rebuild_compressed_addon(app, manager, profile_folder, cancel);
  }
  let mut manifest = read_manifest(&manifest_path).map_err(|e| Error::ModInvalid(e.to_string()))?;
  let level = state::get_compression_level();
  let to_rebuild: Vec<u32> = manifest
    .buckets
    .iter()
    .filter(|b| install_order_pair_flipped(&b.mod_ids, old_install_orders, manager))
    .map(|b| b.id)
    .collect();
  if to_rebuild.is_empty() {
    return Ok(());
  }
  for bid in to_rebuild {
    cancel
      .check()
      .map_err(|e| Error::ModInvalid(e.to_string()))?;
    rebuild_and_apply_one_bucket(
      app,
      manager,
      &addons_path,
      &mut manifest,
      cancel,
      bid,
      level,
    )?;
  }
  Ok(())
}

/// Validates a user-supplied addons subfolder (profile scope). See SECURITY.md.
pub fn validate_profile_folder_component(folder: &str) -> Result<(), Error> {
  if folder.is_empty() {
    return Err(Error::InvalidInput(
      "Profile folder name cannot be empty".to_string(),
    ));
  }
  if folder.contains("..") || folder.contains('/') || folder.contains('\\') {
    return Err(Error::InvalidInput(
      "Invalid profile folder name".to_string(),
    ));
  }
  let p = Path::new(folder);
  let mut it = p.components();
  let first = it.next();
  let second = it.next();
  if let (Some(std::path::Component::Normal(_)), None) = (first, second) {
    Ok(())
  } else {
    Err(Error::InvalidInput(
      "Invalid profile folder name".to_string(),
    ))
  }
}

/// SECURITY.md: VPK names in mod records must be single-segment .vpk basenames.
pub fn validate_vpk_basename(s: &str) -> Result<&str, Error> {
  if s.is_empty() {
    return Err(Error::InvalidInput("VPK name cannot be empty".to_string()));
  }
  if s.contains("..") || s.contains('/') || s.contains('\\') {
    return Err(Error::InvalidInput("Invalid VPK name".to_string()));
  }
  let p = Path::new(s);
  let Some(b) = p.file_name().and_then(|n| n.to_str()) else {
    return Err(Error::InvalidInput("Invalid VPK name".to_string()));
  };
  if b != s {
    return Err(Error::InvalidInput("Invalid VPK name".to_string()));
  }
  if !s.to_ascii_lowercase().ends_with(".vpk") {
    return Err(Error::InvalidInput(
      "VPK name must end with .vpk".to_string(),
    ));
  }
  Ok(s)
}

pub fn addons_path_for(
  manager: &ModManager,
  profile_folder: Option<&str>,
) -> Result<PathBuf, Error> {
  let game_path = manager
    .get_steam_manager()
    .get_game_path()
    .ok_or(Error::GamePathNotSet)?;
  Ok(if let Some(folder) = profile_folder {
    validate_profile_folder_component(folder)?;
    game_path
      .join("game")
      .join("citadel")
      .join("addons")
      .join(folder)
  } else {
    game_path.join("game").join("citadel").join("addons")
  })
}

fn effective_original_names(m: &Mod) -> Vec<String> {
  m.installed_vpks
    .iter()
    .enumerate()
    .map(|(i, vpk)| {
      m.original_vpk_names
        .get(i)
        .cloned()
        .unwrap_or_else(|| vpk.clone())
    })
    .collect()
}

pub fn stage_mod_vpks(mods_store: &Path, addons_path: &Path, m: &Mod) -> Result<(), Error> {
  let dir = compression_staged_dir(mods_store, &m.id);
  fs::create_dir_all(&dir).map_err(Error::Io)?;
  let names = effective_original_names(m);
  for (i, vpk) in m.installed_vpks.iter().enumerate() {
    let orig = &names[i];
    let vpk = validate_vpk_basename(vpk)?;
    let orig = validate_vpk_basename(orig)?;
    let src = addons_path.join(vpk);
    let dst = dir.join(orig);
    if src.exists() {
      if dst.exists() {
        let _ = fs::remove_file(&dst);
      }
      fs::copy(&src, &dst).map_err(Error::Io)?;
    }
  }
  Ok(())
}

fn collect_rebuild_inputs(
  manager: &ModManager,
  mods_store: &Path,
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
    let names = effective_original_names(&m);
    let staged = compression_staged_dir(mods_store, &m.id);
    let dir_vpk_paths: Vec<PathBuf> = names.iter().map(|orig| staged.join(orig)).collect();
    for p in &dir_vpk_paths {
      if !p.exists() {
        return Err(Error::ModInvalid(format!(
          "missing staged VPK for mod {}: {}",
          m.id,
          p.display()
        )));
      }
    }
    inputs.push(ModRebuildInput {
      mod_id: m.id.clone(),
      load_order: m.install_order.unwrap_or(0),
      dir_vpk_paths,
      original_vpk_names: names,
    });
  }
  Ok(inputs)
}

fn input_for_mod(
  manager: &ModManager,
  mods_store: &Path,
  mod_id: &str,
) -> Result<Option<ModRebuildInput>, Error> {
  let m = match manager.get_mod_repository().get_mod(mod_id) {
    Some(m) => m,
    None => return Ok(None),
  };
  if m.is_map || m.installed_vpks.is_empty() {
    return Ok(None);
  }
  let names = effective_original_names(m);
  let staged = compression_staged_dir(mods_store, &m.id);
  let dir_vpk_paths: Vec<PathBuf> = names.iter().map(|orig| staged.join(orig)).collect();
  for p in &dir_vpk_paths {
    if !p.exists() {
      return Err(Error::ModInvalid(format!(
        "missing staged VPK for mod {}: {}",
        mod_id,
        p.display()
      )));
    }
  }
  Ok(Some(ModRebuildInput {
    mod_id: m.id.clone(),
    load_order: m.install_order.unwrap_or(0),
    dir_vpk_paths,
    original_vpk_names: names,
  }))
}

fn bucket_inputs(
  manager: &ModManager,
  mods_store: &Path,
  mod_ids: &[String],
) -> Result<Vec<ModRebuildInput>, Error> {
  let mut v = Vec::new();
  for id in mod_ids {
    if let Some(inp) = input_for_mod(manager, mods_store, id)? {
      v.push(inp);
    }
  }
  v.sort_by_key(|i| i.load_order);
  Ok(v)
}

fn apply_manifest_to_repository(manager: &mut ModManager, manifest: &CompressionManifest) {
  let id_to_shards: std::collections::HashMap<String, Vec<String>> = {
    let mut m: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
    for b in &manifest.buckets {
      for id in &b.mod_ids {
        m.insert(id.clone(), b.shard_files.clone());
      }
    }
    m
  };
  let ids: Vec<String> = manager
    .get_mod_repository()
    .get_all_mods()
    .map(|m| m.id.clone())
    .collect();
  for id in ids {
    if let Some(mut entry) = manager.get_mod_repository().get_mod(&id).cloned() {
      if entry.is_map {
        continue;
      }
      if !manifest.mods.contains_key(&id) {
        // Clear stale compression data for mods not in the manifest
        entry.installed_vpks = Vec::new();
        entry.uses_compression = false;
        manager.get_mod_repository_mut().add_mod(entry);
        continue;
      }
      if let Some(vpks) = id_to_shards.get(&id) {
        if !vpks.is_empty() {
          entry.installed_vpks = vpks.clone();
          entry.uses_compression = true;
          manager.get_mod_repository_mut().add_mod(entry);
        }
      }
    }
  }
}

fn delete_obsolete_shards(
  addons_path: &Path,
  previous: &HashSet<String>,
  current: &HashSet<String>,
) {
  for n in previous.difference(current) {
    let p = addons_path.join(n);
    if p.exists() {
      let _ = fs::remove_file(p);
    }
  }
}

fn try_remove_stale_manifest(addons_path: &Path) {
  let p = vpkmerger::manifest_path(addons_path);
  if p.exists() {
    let _ = fs::remove_file(p);
  }
  let d = vpkmerger::manifest_dir_under_addons(addons_path);
  if d.exists() {
    let _ = fs::remove_dir_all(d);
  }
}

fn delete_file_if_exists(p: &Path) {
  if p.exists() {
    let _ = fs::remove_file(p);
  }
}

pub fn rebuild_compressed_addon(
  app: &AppHandle,
  manager: &mut ModManager,
  profile_folder: Option<String>,
  cancel: &CancelToken,
) -> Result<(), Error> {
  let level = state::get_compression_level();
  rebuild_compressed_addon_with_level(app, manager, profile_folder, cancel, level)
}

pub fn rebuild_compressed_addon_with_level(
  app: &AppHandle,
  manager: &mut ModManager,
  profile_folder: Option<String>,
  cancel: &CancelToken,
  level: CompressionLevel,
) -> Result<(), Error> {
  log::info!("rebuild_compressed_addon: profile={profile_folder:?} level={level:?}");
  if manager.is_game_running()? {
    return Err(Error::GameRunning);
  }
  let profile_ref = profile_folder.as_deref();
  let addons_path = addons_path_for(manager, profile_ref)?;
  if !addons_path.exists() {
    return Err(Error::GamePathNotSet);
  }
  let mods_store = manager.get_mods_store_path()?;
  let mut previous: HashSet<String> = HashSet::new();
  let mods_snapshot: Vec<Mod> = manager
    .get_mod_repository()
    .get_all_mods()
    .cloned()
    .collect();
  for m in &mods_snapshot {
    if m.is_map || m.installed_vpks.is_empty() {
      continue;
    }
    if !m.uses_compression {
      stage_mod_vpks(&mods_store, &addons_path, m)?;
    }
    for v in &m.installed_vpks {
      previous.insert(v.clone());
    }
    if m.original_vpk_names.is_empty() && !m.uses_compression {
      let mut updated = m.clone();
      updated.original_vpk_names = effective_original_names(m);
      manager.get_mod_repository_mut().add_mod(updated);
    }
  }
  let inputs = collect_rebuild_inputs(manager, &mods_store)?;
  if inputs.is_empty() {
    log::warn!("rebuild_compressed_addon: no mods, disabling compression");
    try_remove_stale_manifest(&addons_path);
    state::set_compression_enabled(false, profile_folder.clone());
    return Ok(());
  }
  let total_mods = inputs.len() as u64;
  let _ = app.emit(
    "mod-compression-progress",
    serde_json::json!({
      "stage": "merging",
      "current": 0,
      "total": total_mods,
      "currentMod": serde_json::Value::Null,
    }),
  );
  let manifest_path = vpkmerger::manifest_path(&addons_path);
  if manifest_path.exists() {
    if let Ok(prev_manifest) = read_manifest(&manifest_path) {
      for n in prev_manifest.all_shard_file_names() {
        previous.insert(n);
      }
    }
  }
  let report = rebuild_addon_compressed_bucketing(
    &inputs,
    &addons_path,
    level,
    default_max_shard_bytes(),
    manifest_merge_base_name(),
    cancel,
  )
  .map_err(|e| {
    try_remove_stale_manifest(&addons_path);
    Error::ModInvalid(e.to_string())
  })?;
  let _ = app.emit(
    "mod-compression-progress",
    serde_json::json!({
      "stage": "merging",
      "current": total_mods,
      "total": total_mods,
      "currentMod": serde_json::Value::Null,
    }),
  );
  let new_set: HashSet<String> = report.manifest.all_shard_file_names().into_iter().collect();
  delete_obsolete_shards(&addons_path, &previous, &new_set);
  state::set_compression_level(level);
  write_manifest_atomic(&manifest_path, &report.manifest)
    .map_err(|e| Error::ModInvalid(e.to_string()))?;
  apply_manifest_to_repository(manager, &report.manifest);
  let total_bytes: u64 = report.output_files.iter().map(|(_, s)| s).sum();
  let shard_list: Vec<String> = report.manifest.all_shard_file_names();
  let id_to_shards: std::collections::HashMap<String, Vec<String>> = {
    let mut m: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
    for b in &report.manifest.buckets {
      for id in &b.mod_ids {
        m.insert(id.clone(), b.shard_files.clone());
      }
    }
    m
  };
  let id_to_originals: std::collections::HashMap<String, Vec<String>> = inputs
    .iter()
    .map(|i| (i.mod_id.clone(), i.original_vpk_names.clone()))
    .collect();
  let mod_updates: Vec<serde_json::Value> = id_to_shards
    .iter()
    .map(|(mod_id, vpks)| {
      let originals = id_to_originals.get(mod_id).cloned().unwrap_or_default();
      serde_json::json!({
        "modId": mod_id,
        "installedVpks": vpks,
        "usesCompression": true,
        "originalVpkNames": originals,
      })
    })
    .collect();
  let _ = app.emit(
    "mod-compression-completed",
    serde_json::json!({
      "shardCount": shard_list.len(),
      "totalBytes": total_bytes,
      "shardFiles": shard_list,
      "modUpdates": mod_updates,
    }),
  );
  Ok(())
}

fn rebuild_and_apply_one_bucket(
  app: &AppHandle,
  manager: &mut ModManager,
  addons_path: &Path,
  manifest: &mut CompressionManifest,
  cancel: &CancelToken,
  bucket_id: u32,
  level: CompressionLevel,
) -> Result<(), Error> {
  let bucket_mod_ids: Vec<String> = manifest
    .buckets
    .iter()
    .find(|b| b.id == bucket_id)
    .map(|b| b.mod_ids.clone())
    .ok_or_else(|| Error::ModInvalid("bucket missing in manifest".to_string()))?;
  let mods_store = manager.get_mods_store_path()?;
  let mut previous: HashSet<String> = manifest
    .buckets
    .iter()
    .find(|b| b.id == bucket_id)
    .map(|b| b.shard_files.iter().cloned().collect())
    .unwrap_or_default();
  for m in &bucket_mod_ids {
    if let Some(mm) = manager.get_mod_repository().get_mod(m) {
      if !mm.is_map {
        if !mm.uses_compression {
          stage_mod_vpks(&mods_store, addons_path, mm)?;
          for v in &mm.installed_vpks {
            previous.insert(v.clone());
          }
        }
      }
    }
  }
  let inps = bucket_inputs(manager, &mods_store, &bucket_mod_ids)?;
  if inps.is_empty() {
    return Ok(());
  }
  let total_mods = inps.len() as u64;
  let _ = app.emit(
    "mod-compression-progress",
    serde_json::json!({
      "stage": "merging",
      "current": 0,
      "total": total_mods,
      "currentMod": serde_json::Value::Null,
    }),
  );
  let out_base = addons_path.join(format!("pak{bucket_id:02}_dir.vpk"));
  let br = rebuild_bucket(
    bucket_id,
    &inps,
    &out_base,
    default_max_shard_bytes(),
    cancel,
  )
  .map_err(|e| {
    try_remove_stale_manifest(addons_path);
    Error::ModInvalid(e.to_string())
  })?;
  let _ = app.emit(
    "mod-compression-progress",
    serde_json::json!({
      "stage": "merging",
      "current": total_mods,
      "total": total_mods,
      "currentMod": serde_json::Value::Null,
    }),
  );
  let shard_n = br.shard_file_names.len();
  let new_s: HashSet<String> = br.shard_file_names.iter().cloned().collect();
  delete_obsolete_shards(addons_path, &previous, &new_s);
  apply_bucket_rebuild(manifest, level, &br);
  let manifest_path = vpkmerger::manifest_path(addons_path);
  write_manifest_atomic(&manifest_path, manifest).map_err(|e| Error::ModInvalid(e.to_string()))?;
  apply_manifest_to_repository(manager, manifest);
  let vpks_for_bucket: Vec<String> = manifest
    .buckets
    .iter()
    .find(|b| b.id == bucket_id)
    .map(|b| b.shard_files.clone())
    .unwrap_or_default();
  let id_to_originals: std::collections::HashMap<String, Vec<String>> = inps
    .iter()
    .map(|i| (i.mod_id.clone(), i.original_vpk_names.clone()))
    .collect();
  let mod_updates: Vec<serde_json::Value> = br
    .mod_manifest_entries
    .keys()
    .map(|mod_id| {
      let originals = id_to_originals.get(mod_id).cloned().unwrap_or_default();
      serde_json::json!({
        "modId": mod_id,
        "installedVpks": vpks_for_bucket,
        "usesCompression": true,
        "originalVpkNames": originals,
      })
    })
    .collect();
  let _ = app.emit(
    "mod-compression-completed",
    serde_json::json!({
      "bucketId": bucket_id,
      "shardCount": shard_n,
      "modUpdates": mod_updates,
    }),
  );
  Ok(())
}

pub fn add_mod_to_compression(
  app: &AppHandle,
  manager: &mut ModManager,
  profile_folder: Option<String>,
  cancel: &CancelToken,
  new_mod_id: &str,
) -> Result<(), Error> {
  let level = state::get_compression_level();
  if manager.is_game_running()? {
    return Err(Error::GameRunning);
  }
  let profile_ref = profile_folder.as_deref();
  let addons_path = addons_path_for(manager, profile_ref)?;
  let manifest_path = vpkmerger::manifest_path(&addons_path);
  if !manifest_path.exists() {
    return rebuild_compressed_addon_with_level(app, manager, profile_folder, cancel, level);
  }
  let mut manifest = read_manifest(&manifest_path).map_err(|e| Error::ModInvalid(e.to_string()))?;
  if let Some(same_bucket) = find_bucket_id_for_mod(&manifest.buckets, new_mod_id) {
    return rebuild_and_apply_one_bucket(
      app,
      manager,
      &addons_path,
      &mut manifest,
      cancel,
      same_bucket,
      level,
    );
  }
  insert_mod_into_next_slot(&mut manifest.buckets, level, new_mod_id);
  if let Some(bid) = find_bucket_id_for_mod(&manifest.buckets, new_mod_id) {
    if let Some(mm) = manager.get_mod_repository().get_mod(new_mod_id) {
      if !mm.is_map {
        let mods_store = manager.get_mods_store_path()?;
        if !mm.uses_compression {
          stage_mod_vpks(&mods_store, &addons_path, mm)?;
        }
      }
    }
    rebuild_and_apply_one_bucket(
      app,
      manager,
      &addons_path,
      &mut manifest,
      cancel,
      bid,
      level,
    )?;
  }
  Ok(())
}

pub fn remove_mod_from_compression_artifacts(
  app: &AppHandle,
  manager: &mut ModManager,
  profile_folder: Option<String>,
  cancel: &CancelToken,
  mod_id: &str,
) -> Result<(), Error> {
  let level = state::get_compression_level();
  if manager.is_game_running()? {
    return Err(Error::GameRunning);
  }
  let profile_ref = profile_folder.as_deref();
  let addons_path = addons_path_for(manager, profile_ref)?;
  let manifest_path = vpkmerger::manifest_path(&addons_path);
  if !manifest_path.exists() {
    return Ok(());
  }
  let mut manifest = read_manifest(&manifest_path).map_err(|e| Error::ModInvalid(e.to_string()))?;
  let old_shards: Option<(u32, Vec<String>)> = find_bucket_id_for_mod(&manifest.buckets, mod_id)
    .and_then(|bid| {
      manifest
        .buckets
        .iter()
        .find(|b| b.id == bid)
        .map(|b| (b.id, b.shard_files.clone()))
    });
  remove_mod_from_manifest(&mut manifest, mod_id);
  remove_mod_from_buckets(&mut manifest.buckets, mod_id);
  if let Some((bid, files)) = old_shards {
    if manifest.buckets.iter().any(|b| b.id == bid) {
      rebuild_and_apply_one_bucket(
        app,
        manager,
        &addons_path,
        &mut manifest,
        cancel,
        bid,
        level,
      )?;
    } else {
      for f in &files {
        delete_file_if_exists(&addons_path.join(f));
      }
      write_manifest_atomic(&manifest_path, &manifest)
        .map_err(|e| Error::ModInvalid(e.to_string()))?;
      apply_manifest_to_repository(manager, &manifest);
    }
  } else {
    write_manifest_atomic(&manifest_path, &manifest)
      .map_err(|e| Error::ModInvalid(e.to_string()))?;
  }
  let shard_list: Vec<String> = manifest.all_shard_file_names();
  let _ = app.emit(
    "mod-compression-completed",
    serde_json::json!({
      "removedModId": mod_id,
      "shardCount": shard_list.len(),
      "shardFiles": shard_list,
      "modUpdates": Vec::<serde_json::Value>::new(),
    }),
  );
  Ok(())
}

pub fn replace_mod_in_compression(
  app: &AppHandle,
  manager: &mut ModManager,
  profile_folder: Option<String>,
  cancel: &CancelToken,
  mod_id: &str,
) -> Result<(), Error> {
  let level = state::get_compression_level();
  if manager.is_game_running()? {
    return Err(Error::GameRunning);
  }
  let profile_ref = profile_folder.as_deref();
  let addons_path = addons_path_for(manager, profile_ref)?;
  let manifest_path = vpkmerger::manifest_path(&addons_path);
  if !manifest_path.exists() {
    return rebuild_compressed_addon(app, manager, profile_folder, cancel);
  }
  let mut manifest = read_manifest(&manifest_path).map_err(|e| Error::ModInvalid(e.to_string()))?;
  let bid = find_bucket_id_for_mod(&manifest.buckets, mod_id)
    .ok_or_else(|| Error::ModInvalid("mod not in manifest".to_string()))?;
  if let Some(m) = manager.get_mod_repository().get_mod(mod_id) {
    if !m.is_map && !m.uses_compression {
      let ms = manager.get_mods_store_path()?;
      stage_mod_vpks(&ms, &addons_path, m)?;
    }
  }
  rebuild_and_apply_one_bucket(
    app,
    manager,
    &addons_path,
    &mut manifest,
    cancel,
    bid,
    level,
  )
}

pub fn change_compression_level(
  app: &AppHandle,
  manager: &mut ModManager,
  profile_folder: Option<String>,
  cancel: &CancelToken,
  new_level: CompressionLevel,
) -> Result<(), Error> {
  state::set_compression_level(new_level);
  rebuild_compressed_addon_with_level(app, manager, profile_folder, cancel, new_level)
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
  for p in to_remove {
    if p.exists() {
      let _ = fs::remove_file(p);
    }
  }
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
  let mods_store = manager.get_mods_store_path()?;
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
      "originalVpkNames": m.original_vpk_names,
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
  for n in &manifest.all_shard_file_names() {
    let p = addons_path.join(n);
    if !p.exists() {
      try_remove_stale_manifest(addons_path);
      return Ok(false);
    }
  }
  Ok(true)
}
