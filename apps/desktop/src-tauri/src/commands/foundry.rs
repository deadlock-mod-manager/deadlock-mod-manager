use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::thread;

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

/// A decoded hero-card texture, either from the imported mod VPK or from the
/// base game's default `pak01_dir.vpk`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundryCardPreview {
  pub source: String,
  pub path: String,
  pub filename: String,
  pub variant: String,
  pub width: u32,
  pub height: u32,
  pub data_url: String,
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
const CARD_SOURCE_MOD: &str = "mod";
const CARD_SOURCE_DEFAULT: &str = "default";

const VARIANT_ORDER: &[&str] = &[
  "card",
  "vertical",
  "card_critical",
  "card_gloat",
  "minimap",
  "small",
  "other",
];

/// Display-name to panorama `class_name` namespace. This mirrors Grimoire's
/// Locker card picker so Foundry sees the same card variants and legacy packs.
fn panorama_codenames(hero_name: &str) -> Vec<&'static str> {
  match hero_name {
    "Abrams" => vec!["atlas", "bull"],
    "Apollo" => vec!["fencer"],
    "Bebop" => vec!["bebop"],
    "Billy" => vec!["punkgoat"],
    "Calico" => vec!["nano"],
    "Celeste" => vec!["unicorn"],
    "Doorman" | "The Doorman" => vec!["doorman"],
    "Drifter" => vec!["drifter"],
    "Dynamo" => vec!["dynamo", "sumo"],
    "Graves" => vec!["necro"],
    "Grey Talon" => vec!["orion", "archer"],
    "Haze" => vec!["haze"],
    "Holliday" => vec!["astro"],
    "Infernus" => vec!["inferno"],
    "Ivy" => vec!["tengu"],
    "Kelvin" => vec!["kelvin"],
    "Lady Geist" => vec!["ghost", "spectre"],
    "Lash" => vec!["lash"],
    "McGinnis" => vec!["forge", "engineer"],
    "Mina" => vec!["vampirebat"],
    "Mirage" => vec!["mirage"],
    "Mo & Krill" => vec!["krill", "digger"],
    "Paige" => vec!["bookworm"],
    "Paradox" => vec!["chrono"],
    "Pocket" => vec!["synth"],
    "Rem" => vec!["familiar"],
    "Seven" => vec!["gigawatt"],
    "Shiv" => vec!["shiv"],
    "Silver" => vec!["werewolf"],
    "Sinclair" => vec!["magician"],
    "Venator" => vec!["priest"],
    "Victor" => vec!["frank"],
    "Vindicta" => vec!["hornet"],
    "Viscous" => vec!["viscous"],
    "Vyper" => vec!["viper"],
    "Warden" => vec!["warden"],
    "Wraith" => vec!["wraith"],
    "Wrecker" => vec!["butcher"],
    "Yamato" => vec!["yamato"],
    _ => Vec::new(),
  }
}

fn card_prefixes(codenames: &[&str]) -> Vec<String> {
  codenames
    .iter()
    .map(|codename| format!("panorama/images/heroes/{codename}_"))
    .collect()
}

fn default_model_codenames(hero_name: &str) -> Vec<&'static str> {
  match hero_name {
    "Abrams" => vec!["abrams", "atlas_detective"],
    "Grey Talon" => vec!["greytalon", "grey_talon", "archer"],
    "Lady Geist" => vec!["geist", "lady_geist", "ladygeist"],
    "McGinnis" => vec!["mcginnis", "engineer"],
    "Mo & Krill" => vec!["mokrill", "mo_krill", "mo_and_krill", "digger"],
    "Seven" => vec!["gigawatt_prisoner"],
    _ => Vec::new(),
  }
}

fn normalized_hero_terms(hero_name: &str) -> Vec<String> {
  let lower = hero_name.to_ascii_lowercase();
  let underscored = lower
    .chars()
    .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
    .collect::<String>()
    .split('_')
    .filter(|part| !part.is_empty() && *part != "and")
    .collect::<Vec<_>>()
    .join("_");
  let compact = underscored.replace('_', "");
  [underscored, compact]
    .into_iter()
    .filter(|term| !term.is_empty())
    .collect()
}

fn hero_asset_terms(hero_name: &str, codenames: &[&str]) -> Vec<String> {
  let mut terms = normalized_hero_terms(hero_name);
  terms.extend(codenames.iter().map(|codename| codename.to_string()));
  terms.extend(
    default_model_codenames(hero_name)
      .into_iter()
      .map(str::to_string),
  );
  terms.sort();
  terms.dedup();
  terms
}

fn is_hero_card_path(path: &str, prefixes: &[String]) -> bool {
  let lower = path.to_ascii_lowercase();
  lower.ends_with(".vtex_c") && prefixes.iter().any(|prefix| lower.starts_with(prefix))
}

fn is_default_hero_asset(path: &str, card_prefixes: &[String], terms: &[String]) -> bool {
  let lower = path.to_ascii_lowercase();
  if is_hero_card_path(&lower, card_prefixes) {
    return true;
  }

  let in_hero_area = lower.contains("models/heroes")
    || lower.contains("materials/models/heroes")
    || lower.contains("particles/abilities")
    || lower.contains("sounds/abilities")
    || lower.contains("soundevents")
    || lower.contains("panorama/images/hud/abilities")
    || lower.starts_with("panorama/images/heroes/");

  in_hero_area && terms.iter().any(|term| lower.contains(term))
}

fn card_variant(path: &str, codenames: &[&str]) -> String {
  let filename = Path::new(path)
    .file_name()
    .and_then(|name| name.to_str())
    .unwrap_or(path)
    .to_ascii_lowercase();
  let stem = filename
    .strip_suffix(".vtex_c")
    .or_else(|| filename.strip_suffix(".vtex"))
    .unwrap_or(&filename);

  let variant = codenames
    .iter()
    .find_map(|codename| stem.strip_prefix(&format!("{codename}_")))
    .unwrap_or(stem)
    .strip_suffix("_psd")
    .or_else(|| stem.strip_suffix("_png"))
    .unwrap_or_else(|| {
      codenames
        .iter()
        .find_map(|codename| stem.strip_prefix(&format!("{codename}_")))
        .unwrap_or(stem)
    });

  if variant.is_empty() {
    "card".to_string()
  } else {
    variant.to_string()
  }
}

fn variant_rank(variant: &str) -> usize {
  VARIANT_ORDER
    .iter()
    .position(|known| *known == variant)
    .unwrap_or(VARIANT_ORDER.len())
}

/// Classify a VPK entry by its compiled Source 2 extension, promoting textures
/// that live under a hero-card path to the dedicated `card` bucket.
fn classify(ext: &str, full_path: &str, card_prefixes: &[String]) -> &'static str {
  let lower = full_path.to_ascii_lowercase();
  match ext {
    "vmdl_c" | "vmesh_c" | "vmorf_c" | "vphys_c" | "vanim_c" | "vagrp_c" | "vseq_c" => {
      CATEGORY_MODEL
    }
    "vmat_c" => CATEGORY_MATERIAL,
    "vtex_c" => {
      if is_hero_card_path(&lower, card_prefixes)
        || lower.contains("hero_card")
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
  let codenames = detection
    .hero_display
    .as_deref()
    .or(detection.hero.as_deref())
    .map(panorama_codenames)
    .unwrap_or_default();
  let card_prefixes = card_prefixes(&codenames);

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
    let category = classify(&entry.ext, &entry.full_path, &card_prefixes);
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

fn analyze_default_hero(hero_display: String) -> Result<FoundryManifest, Error> {
  let vpk_path = base_game_vpk_path()?.ok_or_else(|| {
    Error::InvalidInput("Deadlock base VPK not found for default hero import".to_string())
  })?;
  let file_path = vpk_path.to_string_lossy().to_string();
  let codenames = panorama_codenames(&hero_display);
  let card_prefixes = card_prefixes(&codenames);
  let terms = hero_asset_terms(&hero_display, &codenames);

  let vpk_data = std::fs::read(&vpk_path).map_err(|e| {
    log::error!("[Foundry] Failed to read base VPK {file_path}: {e}");
    e
  })?;

  let options = VpkParseOptions {
    include_entries: true,
    file_path: file_path.clone(),
    ..Default::default()
  };

  let parsed = VpkParser::parse(vpk_data, options)
    .map_err(|e| Error::InvalidInput(format!("Failed to parse VPK {file_path}: {e}")))?;

  let mut manifest = FoundryManifest {
    file_path,
    hero: Some(hero_display.clone()),
    hero_display: Some(hero_display.clone()),
    is_hero_skin: true,
    entry_count: 0,
    models: Vec::new(),
    materials: Vec::new(),
    textures: Vec::new(),
    cards: Vec::new(),
    particles: Vec::new(),
    sounds: Vec::new(),
    other: Vec::new(),
  };

  for entry in &parsed.entries {
    if !is_default_hero_asset(&entry.full_path, &card_prefixes, &terms) {
      continue;
    }
    let category = classify(&entry.ext, &entry.full_path, &card_prefixes);
    let foundry_entry = FoundryEntry {
      path: entry.full_path.clone(),
      filename: entry.filename.clone(),
      ext: entry.ext.clone(),
      size: entry.entry_length + u32::from(entry.preload_bytes),
      category: category.to_string(),
    };
    manifest.entry_count += 1;
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
    "[Foundry] Analyzed default hero {}: {} entries, {} models, {} materials, {} textures, {} cards, {} particles, {} sounds",
    hero_display,
    manifest.entry_count,
    manifest.models.len(),
    manifest.materials.len(),
    manifest.textures.len(),
    manifest.cards.len(),
    manifest.particles.len(),
    manifest.sounds.len(),
  );

  Ok(manifest)
}

struct CardDecodeJob {
  source: String,
  vpk_path: PathBuf,
  entry_path: String,
  filename: String,
  variant: String,
}

fn decode_card_preview(job: CardDecodeJob) -> Option<FoundryCardPreview> {
  let decoded = source2_model::decode_texture_png(&job.vpk_path, &job.entry_path).ok()?;
  let b64 = base64::engine::general_purpose::STANDARD.encode(&decoded.png);
  Some(FoundryCardPreview {
    source: job.source,
    path: job.entry_path,
    filename: job.filename,
    variant: job.variant,
    width: decoded.width,
    height: decoded.height,
    data_url: format!("data:image/png;base64,{b64}"),
  })
}

fn collect_card_jobs(
  vpk_path: &Path,
  source: &str,
  codenames: &[&str],
) -> Result<Vec<CardDecodeJob>, Error> {
  let prefixes = card_prefixes(codenames);
  let entries = source2_model::vpk_extract::list_entries(vpk_path)
    .map_err(|e| Error::InvalidInput(format!("failed to list VPK entries: {e}")))?;
  let mut jobs = entries
    .into_iter()
    .filter(|entry_path| is_hero_card_path(entry_path, &prefixes))
    .map(|entry_path| CardDecodeJob {
      source: source.to_string(),
      filename: Path::new(&entry_path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(&entry_path)
        .to_string(),
      variant: card_variant(&entry_path, codenames),
      vpk_path: vpk_path.to_path_buf(),
      entry_path,
    })
    .collect::<Vec<_>>();

  jobs.sort_by(|a, b| {
    variant_rank(&a.variant)
      .cmp(&variant_rank(&b.variant))
      .then_with(|| a.entry_path.cmp(&b.entry_path))
  });
  Ok(jobs)
}

fn decode_card_jobs(jobs: Vec<CardDecodeJob>) -> Vec<FoundryCardPreview> {
  let mut previews = thread::scope(|scope| {
    let handles = jobs
      .into_iter()
      .map(|job| scope.spawn(move || decode_card_preview(job)))
      .collect::<Vec<_>>();

    handles
      .into_iter()
      .filter_map(|handle| handle.join().ok().flatten())
      .collect::<Vec<_>>()
  });
  previews.sort_by(|a, b| {
    variant_rank(&a.variant)
      .cmp(&variant_rank(&b.variant))
      .then_with(|| a.path.cmp(&b.path))
  });
  previews
}

fn base_game_vpk_path() -> Result<Option<PathBuf>, Error> {
  let mut manager = MANAGER
    .lock()
    .map_err(|e| Error::InvalidInput(format!("manager lock poisoned: {e}")))?;
  let game_path = manager
    .get_steam_manager()
    .get_game_path()
    .cloned()
    .or_else(|| manager.find_game().ok());
  let Some(game_path) = game_path else {
    return Ok(None);
  };
  let pak_path = game_path.join("game").join("citadel").join("pak01_dir.vpk");
  Ok(pak_path.exists().then_some(pak_path))
}

fn paths_equal(left: &Path, right: &Path) -> bool {
  let left = std::fs::canonicalize(left).unwrap_or_else(|_| left.to_path_buf());
  let right = std::fs::canonicalize(right).unwrap_or_else(|_| right.to_path_buf());
  left == right
}

fn decode_foundry_cards(
  file_path: PathBuf,
  hero: Option<String>,
  hero_display: Option<String>,
) -> Result<Vec<FoundryCardPreview>, Error> {
  let hero_name = hero_display.or(hero).unwrap_or_default();
  let codenames = panorama_codenames(&hero_name);
  if codenames.is_empty() {
    return Ok(Vec::new());
  }

  let default_vpk = base_game_vpk_path()?;
  let mut jobs = if default_vpk
    .as_ref()
    .is_some_and(|base_vpk| paths_equal(&file_path, base_vpk))
  {
    Vec::new()
  } else {
    collect_card_jobs(&file_path, CARD_SOURCE_MOD, &codenames)?
  };
  if let Some(default_vpk) = default_vpk {
    match collect_card_jobs(&default_vpk, CARD_SOURCE_DEFAULT, &codenames) {
      Ok(default_jobs) => jobs.extend(default_jobs),
      Err(error) => log::warn!("[Foundry] Failed to collect default cards: {error}"),
    }
  }

  Ok(decode_card_jobs(jobs))
}

/// Parse a skin VPK, detect its hero, and return the entries grouped by editing
/// category. Read-only: this never writes to disk.
#[tauri::command]
pub async fn foundry_analyze_vpk(file_path: String) -> Result<FoundryManifest, Error> {
  tauri::async_runtime::spawn_blocking(move || analyze_vpk_path(&PathBuf::from(file_path)))
    .await
    .map_err(|e| Error::InvalidInput(format!("VPK analysis task failed: {e}")))?
}

/// Open the base game's default hero assets as a Foundry source. This is
/// read-only and filters `pak01_dir.vpk` to one hero instead of surfacing the
/// entire game archive.
#[tauri::command]
pub async fn foundry_analyze_default_hero(hero_display: String) -> Result<FoundryManifest, Error> {
  tauri::async_runtime::spawn_blocking(move || analyze_default_hero(hero_display))
    .await
    .map_err(|e| Error::InvalidInput(format!("default hero analysis task failed: {e}")))?
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
      push_named_vpks(&mut candidates, &mut seen, addons_path, &entry.current_vpks);
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

/// Decode every hero-card texture for the active Foundry skin in one background
/// pass. This returns both mod-provided cards and the base game's defaults.
#[tauri::command]
pub async fn foundry_decode_cards(
  file_path: String,
  hero: Option<String>,
  hero_display: Option<String>,
) -> Result<Vec<FoundryCardPreview>, Error> {
  tauri::async_runtime::spawn_blocking(move || {
    decode_foundry_cards(PathBuf::from(file_path), hero, hero_display)
  })
  .await
  .map_err(|e| Error::InvalidInput(format!("card decode task failed: {e}")))?
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
