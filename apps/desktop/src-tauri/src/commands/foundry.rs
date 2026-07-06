use std::path::PathBuf;

use base64::Engine;
use hero_parser::detect_hero;
use serde::{Deserialize, Serialize};
use vpk_parser::{VpkParseOptions, VpkParser};

use crate::errors::Error;

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

/// Parse a skin VPK, detect its hero, and return the entries grouped by editing
/// category. Read-only: this never writes to disk.
#[tauri::command]
pub fn foundry_analyze_vpk(file_path: String) -> Result<FoundryManifest, Error> {
  log::info!("[Foundry] Analyzing VPK: {file_path}");

  let path = PathBuf::from(&file_path);
  let vpk_data = std::fs::read(&path).map_err(|e| {
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

/// Resolve the absolute path to a mod's primary VPK from the DMM mod store
/// (`<app_local_data>/mods/<mod_id>/`). Downloaded mods keep their VPK under
/// `verified-vpk/`, local mods under `files/`, so the whole mod folder is
/// scanned. Prefers a `_dir.vpk`, else the largest VPK.
#[tauri::command]
pub fn foundry_resolve_mod_vpk(mod_id: String) -> Result<String, Error> {
  let store_path = {
    let manager = MANAGER
      .lock()
      .map_err(|e| Error::InvalidInput(format!("manager lock poisoned: {e}")))?;
    manager.get_mods_store_path()?
  };
  let mod_dir = store_path.join(&mod_id);
  if !mod_dir.exists() {
    return Err(Error::InvalidInput(format!(
      "no stored files for mod {mod_id}"
    )));
  }

  let mut candidates = Vec::new();
  collect_vpks(&mod_dir, 0, &mut candidates);
  if candidates.is_empty() {
    return Err(Error::InvalidInput(format!(
      "no VPK found for mod {mod_id}"
    )));
  }

  // Prefer a `_dir.vpk`; otherwise the largest file.
  let chosen = candidates
    .iter()
    .find(|p| {
      p.file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.ends_with("_dir"))
        .unwrap_or(false)
    })
    .cloned()
    .unwrap_or_else(|| {
      candidates
        .iter()
        .max_by_key(|p| std::fs::metadata(p).map(|m| m.len()).unwrap_or(0))
        .cloned()
        .unwrap()
    });

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

/// Decode a `.vtex_c` entry (card or texture) inside a skin VPK to a PNG data URL.
#[tauri::command]
pub async fn foundry_decode_texture(
  file_path: String,
  entry_path: String,
) -> Result<FoundryTexture, Error> {
  let vpk_path = PathBuf::from(&file_path);
  let decoded = tauri::async_runtime::spawn_blocking(move || {
    source2_model::decode_texture_png(&vpk_path, &entry_path)
  })
  .await
  .map_err(|e| Error::InvalidInput(format!("texture decode task failed: {e}")))?
  .map_err(|e| Error::InvalidInput(format!("failed to decode texture: {e}")))?;

  let b64 = base64::engine::general_purpose::STANDARD.encode(&decoded.png);
  Ok(FoundryTexture {
    width: decoded.width,
    height: decoded.height,
    data_url: format!("data:image/png;base64,{b64}"),
  })
}
