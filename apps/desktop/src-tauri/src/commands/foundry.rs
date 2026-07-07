use std::collections::HashSet;
use std::path::{Path, PathBuf};

use base64::Engine;
use hero_parser::detect_hero;
use serde::{Deserialize, Serialize};
use vpk_parser::{VpkParseOptions, VpkParser};

use crate::errors::Error;
use crate::mod_manager::vpk_manifest::ProfileVpkManifest;

use super::state::MANAGER;

/// A single VPK entry surfaced to the Mod Foundry, tagged with the editing
/// category it belongs to so the UI can group it into the right tab.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundryEntry {
  pub path: String,
  pub filename: String,
  pub ext: String,
  pub size: u32,
  pub category: String,
}

/// The categorized contents of an imported skin VPK. Map / non-hero mods report
/// `is_hero_skin = false` so the Foundry can refuse them up front.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundryManifest {
  pub file_path: String,
  pub hero: Option<String>,
  pub hero_display: Option<String>,
  pub is_hero_skin: bool,
  pub entry_count: usize,
  pub models: Vec<FoundryEntry>,
  pub materials: Vec<FoundryEntry>,
  pub textures: Vec<FoundryEntry>,
  pub cards: Vec<FoundryEntry>,
  pub particles: Vec<FoundryEntry>,
  pub sounds: Vec<FoundryEntry>,
  pub other: Vec<FoundryEntry>,
}

const CATEGORY_MODEL: &str = "model";
const CATEGORY_MATERIAL: &str = "material";
const CATEGORY_TEXTURE: &str = "texture";
const CATEGORY_CARD: &str = "card";
const CATEGORY_PARTICLE: &str = "particle";
const CATEGORY_SOUND: &str = "sound";
const CATEGORY_OTHER: &str = "other";

/// Classify a VPK entry by its compiled Source 2 extension, promoting textures
/// that live under a hero-card path to the dedicated `card` bucket.
fn classify(ext: &str, full_path: &str) -> &'static str {
  let lower = full_path.to_ascii_lowercase();
  match ext {
    "vmdl_c" | "vmesh_c" | "vmorf_c" | "vphys_c" | "vanim_c" | "vagrp_c" | "vseq_c" => {
      CATEGORY_MODEL
    }
    "vmat_c" => CATEGORY_MATERIAL,
    "vtex_c" => {
      if lower.contains("hero_card")
        || lower.contains("herocard")
        || lower.contains("/cards/")
        || lower.contains("_card")
        || lower.contains("selection")
      {
        CATEGORY_CARD
      } else {
        CATEGORY_TEXTURE
      }
    }
    "vpcf_c" | "vpcf" => CATEGORY_PARTICLE,
    "vsnd_c" | "vsndevts_c" | "vsndstck_c" => CATEGORY_SOUND,
    _ => CATEGORY_OTHER,
  }
}

fn analyze_vpk_path(path: &Path) -> Result<FoundryManifest, Error> {
  let file_path = path.to_string_lossy().to_string();
  log::info!("[Foundry] Analyzing VPK: {file_path}");

  let vpk_data = std::fs::read(path).map_err(|e| {
    log::error!("[Foundry] Failed to read VPK {file_path}: {e}");
    e
  })?;

  let options = VpkParseOptions {
    include_entries: true,
    file_path: file_path.clone(),
    ..Default::default()
  };

  let parsed = VpkParser::parse(vpk_data, options)
    .map_err(|e| Error::InvalidInput(format!("Failed to parse VPK {file_path}: {e}")))?;

  let detection = detect_hero(&parsed.entries);
  let is_hero_skin = detection.category == "hero";

  let mut manifest = FoundryManifest {
    file_path,
    hero: detection.hero,
    hero_display: detection.hero_display,
    is_hero_skin,
    entry_count: parsed.entries.len(),
    models: Vec::new(),
    materials: Vec::new(),
    textures: Vec::new(),
    cards: Vec::new(),
    particles: Vec::new(),
    sounds: Vec::new(),
    other: Vec::new(),
  };

  for entry in &parsed.entries {
    let category = classify(&entry.ext, &entry.full_path);
    let foundry_entry = FoundryEntry {
      path: entry.full_path.clone(),
      filename: entry.filename.clone(),
      ext: entry.ext.clone(),
      size: entry.entry_length + u32::from(entry.preload_bytes),
      category: category.to_string(),
    };
    match category {
      CATEGORY_MODEL => manifest.models.push(foundry_entry),
      CATEGORY_MATERIAL => manifest.materials.push(foundry_entry),
      CATEGORY_TEXTURE => manifest.textures.push(foundry_entry),
      CATEGORY_CARD => manifest.cards.push(foundry_entry),
      CATEGORY_PARTICLE => manifest.particles.push(foundry_entry),
      CATEGORY_SOUND => manifest.sounds.push(foundry_entry),
      _ => manifest.other.push(foundry_entry),
    }
  }

  log::info!(
    "[Foundry] Analyzed {} entries (hero={:?}, skin={}): {} models, {} materials, {} textures, {} cards, {} particles, {} sounds",
    manifest.entry_count,
    manifest.hero_display,
    manifest.is_hero_skin,
    manifest.models.len(),
    manifest.materials.len(),
    manifest.textures.len(),
    manifest.cards.len(),
    manifest.particles.len(),
    manifest.sounds.len(),
  );

  Ok(manifest)
}

/// Parse a skin VPK, detect its hero, and return the entries grouped by editing
/// category. Read-only: this never writes to disk.
#[tauri::command]
pub async fn foundry_analyze_vpk(file_path: String) -> Result<FoundryManifest, Error> {
  tauri::async_runtime::spawn_blocking(move || analyze_vpk_path(&PathBuf::from(file_path)))
    .await
    .map_err(|e| Error::InvalidInput(format!("VPK analysis task failed: {e}")))?
}

/// Recursively collect `.vpk` files under `dir` (bounded depth), skipping the
/// multi-part companion archives (`*_NNN.vpk`) so only dir/standalone VPKs match.
fn collect_vpks(dir: &std::path::Path, depth: usize, out: &mut Vec<PathBuf>) {
  if depth > 6 {
    return;
  }
  let Ok(entries) = std::fs::read_dir(dir) else {
    return;
  };
  for entry in entries.flatten() {
    let path = entry.path();
    if path.is_dir() {
      collect_vpks(&path, depth + 1, out);
    } else if path.extension().and_then(|e| e.to_str()) == Some("vpk") {
      let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
      // Skip `<base>_003.vpk` numbered archives; keep `_dir.vpk` and plain names.
      let is_numbered_archive = stem
        .rsplit_once('_')
        .map(|(_, tail)| tail.len() == 3 && tail.chars().all(|c| c.is_ascii_digit()))
        .unwrap_or(false);
      if !is_numbered_archive {
        out.push(path);
      }
    }
  }
}

fn collect_vpks_shallow(dir: &Path, out: &mut Vec<PathBuf>) {
  let Ok(entries) = std::fs::read_dir(dir) else {
    return;
  };
  for entry in entries.flatten() {
    let path = entry.path();
    if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("vpk") {
      out.push(path);
    }
  }
}

fn push_candidate(out: &mut Vec<PathBuf>, seen: &mut HashSet<PathBuf>, path: PathBuf) {
  if path.exists() && seen.insert(path.clone()) {
    out.push(path);
  }
}

fn push_named_vpks(
  out: &mut Vec<PathBuf>,
  seen: &mut HashSet<PathBuf>,
  base_dir: &Path,
  names: &[String],
) {
  for name in names {
    let filename = Path::new(name)
      .file_name()
      .map(PathBuf::from)
      .unwrap_or_else(|| PathBuf::from(name));
    push_candidate(out, seen, base_dir.join(filename));
  }
}

fn sort_store_candidates(candidates: &mut [PathBuf]) {
  candidates.sort_by(|a, b| {
    let a_stem = a.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    let b_stem = b.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    let a_is_dir = a_stem.ends_with("_dir");
    let b_is_dir = b_stem.ends_with("_dir");
    b_is_dir.cmp(&a_is_dir).then_with(|| {
      std::fs::metadata(b)
        .map(|m| m.len())
        .unwrap_or(0)
        .cmp(&std::fs::metadata(a).map(|m| m.len()).unwrap_or(0))
    })
  });
}

/// Resolve the absolute path to a mod's primary VPK from the DMM mod store
/// (`<app_local_data>/mods/<mod_id>/`). Downloaded mods keep their VPK under
/// `verified-vpk/`, local mods under `files/`, so the whole mod folder is
/// scanned. Installed mods may no longer have a cached VPK, so the active
/// profile's addons folder is used as a fallback.
#[tauri::command]
pub fn foundry_resolve_mod_vpk(
  mod_id: String,
  installed_vpks: Option<Vec<String>>,
  profile_folder: Option<String>,
) -> Result<String, Error> {
  let (store_path, addons_path) = {
    let manager = MANAGER
      .lock()
      .map_err(|e| Error::InvalidInput(format!("manager lock poisoned: {e}")))?;
    (
      manager.get_mods_store_path()?,
      manager.get_addons_path(profile_folder.as_deref()).ok(),
    )
  };

  let mut candidates = Vec::new();
  let mut seen = HashSet::new();

  if let Some(addons_path) = addons_path.as_ref().filter(|path| path.exists()) {
    if let Ok(manifest) = ProfileVpkManifest::load(addons_path)
      && let Some(entry) = manifest.mods.get(&mod_id)
    {
      push_named_vpks(
        &mut candidates,
        &mut seen,
        addons_path,
        &entry.current_vpks,
      );
      push_named_vpks(
        &mut candidates,
        &mut seen,
        addons_path,
        &entry.disabled_vpks,
      );
    }

    if let Some(installed_vpks) = installed_vpks.as_ref() {
      push_named_vpks(&mut candidates, &mut seen, addons_path, installed_vpks);
    }
  }

  let mod_dir = store_path.join(&mod_id);
  if mod_dir.exists() {
    let mut store_candidates = Vec::new();
    collect_vpks(&mod_dir, 0, &mut store_candidates);
    sort_store_candidates(&mut store_candidates);
    for candidate in store_candidates {
      push_candidate(&mut candidates, &mut seen, candidate);
    }
  }

  if let Some(addons_path) = addons_path.as_ref().filter(|path| path.exists()) {
    let mut prefixed = Vec::new();
    collect_vpks_shallow(addons_path, &mut prefixed);
    prefixed.sort();
    for candidate in prefixed {
      let filename = candidate
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or_default();
      if filename.starts_with(&format!("{mod_id}_")) {
        push_candidate(&mut candidates, &mut seen, candidate);
      }
    }
  }

  let Some(chosen) = candidates.first() else {
    return Err(Error::InvalidInput(format!(
      "no VPK found for mod {mod_id}"
    )));
  };

  log::info!(
    "[Foundry] Resolved mod {mod_id} to VPK {} from {} candidates",
    chosen.display(),
    candidates.len()
  );

  Ok(chosen.to_string_lossy().to_string())
}

/// A decoded texture (top mip) as a base64 PNG data URL, ready for an `<img>`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundryTexture {
  pub width: u32,
  pub height: u32,
  pub data_url: String,
}

/// A decoded model as a base64 GLB data URL, ready for the webview viewer.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundryModel {
  pub vertex_count: u32,
  pub index_count: u32,
  pub data_url: String,
}

/// Decode a `.vtex_c` entry (card or texture) inside a skin VPK to a PNG data URL.
#[tauri::command]
pub async fn foundry_decode_texture(
  file_path: String,
  entry_path: String,
) -> Result<FoundryTexture, Error> {
  let vpk_path = PathBuf::from(&file_path);
  tauri::async_runtime::spawn_blocking(move || {
    let decoded = source2_model::decode_texture_png(&vpk_path, &entry_path)
      .map_err(|e| Error::InvalidInput(format!("failed to decode texture: {e}")))?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&decoded.png);
    Ok(FoundryTexture {
      width: decoded.width,
      height: decoded.height,
      data_url: format!("data:image/png;base64,{b64}"),
    })
  })
  .await
  .map_err(|e| Error::InvalidInput(format!("texture decode task failed: {e}")))?
}

/// Decode a `.vmesh_c`, or resolve a `.vmdl_c` to its first referenced mesh, to
/// a GLB data URL for the interactive 3D preview.
#[tauri::command]
pub async fn foundry_decode_model(
  file_path: String,
  entry_path: String,
) -> Result<FoundryModel, Error> {
  let vpk_path = PathBuf::from(&file_path);
  tauri::async_runtime::spawn_blocking(move || {
    let decoded = source2_model::decode_model_glb(&vpk_path, &entry_path)
      .map_err(|e| Error::InvalidInput(format!("failed to decode model: {e}")))?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&decoded.glb);
    Ok(FoundryModel {
      vertex_count: decoded.vertex_count,
      index_count: decoded.index_count,
      data_url: format!("data:model/gltf-binary;base64,{b64}"),
    })
  })
  .await
  .map_err(|e| Error::InvalidInput(format!("model decode task failed: {e}")))?
}
