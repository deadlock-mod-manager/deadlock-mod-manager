//! Reading a skin VPK into the categorized manifest the Foundry UI renders.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::thread;

use base64::Engine;
use hero_parser::detect_hero;
use vpk_parser::VpkParser;

use crate::errors::Error;

use super::game::paths_equal;
use super::hero::{art_names, card_prefixes, hero_asset_terms, panorama_codenames};
use super::sounds::group_sounds;
use super::staging::{stage_source_vpk, staged_base_game_vpk};
use super::vdata::primary_model_path;

use super::types::{
  FoundryCardPreview, FoundryCardSource, FoundryCategory, FoundryEntry, FoundryEntrySource,
  FoundryManifest, VARIANT_ORDER,
};

pub(crate) fn is_hero_card_path(path: &str, prefixes: &[String]) -> bool {
  let lower = path.to_ascii_lowercase();
  lower.ends_with(".vtex_c") && prefixes.iter().any(|prefix| lower.starts_with(prefix))
}

/// Whether a base-game entry belongs to one hero. Used to filter the multi-GB
/// `pak01_dir.vpk` down to a single hero's assets instead of listing the lot.
fn is_default_hero_asset(path: &str, card_prefixes: &[String], terms: &[String]) -> bool {
  let lower = path.to_ascii_lowercase();
  if is_hero_card_path(&lower, card_prefixes) {
    return true;
  }

  let in_hero_area = lower.contains("models/heroes")
    || lower.contains("materials/models/heroes")
    || lower.contains("sounds/abilities")
    || lower.contains("sounds/vo")
    || lower.contains("soundevents")
    || lower.starts_with("panorama/images/heroes/");

  in_hero_area && terms.iter().any(|term| lower.contains(term))
}

pub(crate) fn card_variant(path: &str, names: &[String]) -> String {
  let lower = path.to_ascii_lowercase();
  if lower.contains("/heroes/backgrounds/") {
    return "background".to_string();
  }
  if lower.contains("/heroes/guns/") {
    return "weapon".to_string();
  }
  let filename = Path::new(path)
    .file_name()
    .and_then(|name| name.to_str())
    .unwrap_or(path)
    .to_ascii_lowercase();
  let stem = filename
    .strip_suffix(".vtex_c")
    .or_else(|| filename.strip_suffix(".vtex"))
    .unwrap_or(&filename);

  let without_codename = names
    .iter()
    .find_map(|name| stem.strip_prefix(&format!("{name}_")))
    .unwrap_or(stem);
  let variant = without_codename
    .strip_suffix("_psd")
    .or_else(|| without_codename.strip_suffix("_png"))
    .unwrap_or(without_codename);

  if lower.contains("/hud/abilities/") {
    format!("ability_{variant}")
  } else if variant.is_empty() {
    "card".to_string()
  } else {
    variant.to_string()
  }
}

pub(crate) fn variant_rank(variant: &str) -> usize {
  VARIANT_ORDER
    .iter()
    .position(|known| *known == variant)
    .unwrap_or(VARIANT_ORDER.len())
}

/// Classify a VPK entry by its compiled Source 2 extension, promoting textures
/// that live under a hero-card path to the dedicated `card` bucket.
///
/// Particle (`.vpcf_c`) and physics (`.vphys_c`) entries land in `other`: the
/// Foundry previews a static character model only, so they are carried through
/// an export untouched but never surfaced as something to edit.
pub(crate) fn classify(ext: &str, full_path: &str, card_prefixes: &[String]) -> FoundryCategory {
  let lower = full_path.to_ascii_lowercase();
  match ext {
    "vmdl_c" | "vmesh_c" | "vmorf_c" => FoundryCategory::Model,
    "vmat_c" => FoundryCategory::Material,
    "vtex_c" => {
      if is_hero_card_path(&lower, card_prefixes)
        || lower.contains("hero_card")
        || lower.contains("herocard")
        || lower.contains("/cards/")
        || lower.contains("_card")
        || lower.contains("selection")
      {
        FoundryCategory::Card
      } else {
        FoundryCategory::Texture
      }
    }
    "vsnd_c" | "vsndevts_c" | "vsndstck_c" => FoundryCategory::Sound,
    _ => FoundryCategory::Other,
  }
}

fn foundry_entry_from_vpk_entry(
  entry: &vpk_parser::VpkEntry,
  category: FoundryCategory,
  source: FoundryEntrySource,
) -> FoundryEntry {
  FoundryEntry {
    path: entry.full_path.clone(),
    filename: entry.filename.clone(),
    ext: entry.ext.clone(),
    size: entry.entry_length + u32::from(entry.preload_bytes),
    category,
    source,
  }
}

fn push_manifest_entry(manifest: &mut FoundryManifest, entry: FoundryEntry) {
  match entry.category {
    FoundryCategory::Model => manifest.models.push(entry),
    FoundryCategory::Material => manifest.materials.push(entry),
    FoundryCategory::Texture => manifest.textures.push(entry),
    FoundryCategory::Card => manifest.cards.push(entry),
    FoundryCategory::Sound => manifest.sounds.push(entry),
    FoundryCategory::Other => manifest.other.push(entry),
  }
}

fn manifest_paths(manifest: &FoundryManifest) -> HashSet<String> {
  [
    &manifest.models,
    &manifest.materials,
    &manifest.textures,
    &manifest.cards,
    &manifest.sounds,
    &manifest.other,
  ]
  .into_iter()
  .flat_map(|entries| entries.iter().map(|entry| entry.path.to_ascii_lowercase()))
  .collect()
}

fn empty_manifest(file_path: String) -> FoundryManifest {
  FoundryManifest {
    file_path,
    source_path: String::new(),
    hero: None,
    hero_display: None,
    is_hero_skin: false,
    entry_count: 0,
    models: Vec::new(),
    materials: Vec::new(),
    textures: Vec::new(),
    cards: Vec::new(),
    sounds: Vec::new(),
    other: Vec::new(),
    sound_groups: Vec::new(),
    primary_model_path: None,
  }
}

/// Fold the base game's sounds for this hero into the manifest when the skin
/// ships none of its own, so the sound tab always has something to replace.
fn append_default_hero_sounds(
  manifest: &mut FoundryManifest,
  hero_display: &str,
) -> Result<(), Error> {
  let Some(vpk_path) = staged_base_game_vpk()? else {
    return Ok(());
  };
  if paths_equal(Path::new(&manifest.file_path), &vpk_path) {
    return Ok(());
  }

  let codenames = panorama_codenames(hero_display);
  let prefixes = card_prefixes(&art_names(hero_display, &codenames));
  let terms = hero_asset_terms(hero_display, &codenames);
  let entries = VpkParser::parse_directory_from_file(&vpk_path)
    .map_err(|e| Error::InvalidInput(format!("Failed to parse base VPK: {e}")))?;
  let mut existing = manifest_paths(manifest);

  for entry in &entries {
    if !is_default_hero_asset(&entry.full_path, &prefixes, &terms) {
      continue;
    }
    if classify(&entry.ext, &entry.full_path, &prefixes) != FoundryCategory::Sound {
      continue;
    }
    if !existing.insert(entry.full_path.to_ascii_lowercase()) {
      continue;
    }
    push_manifest_entry(
      manifest,
      foundry_entry_from_vpk_entry(entry, FoundryCategory::Sound, FoundryEntrySource::Default),
    );
    manifest.entry_count += 1;
  }

  Ok(())
}

fn finalize(manifest: &mut FoundryManifest) {
  let hero = manifest
    .hero_display
    .clone()
    .or_else(|| manifest.hero.clone());
  manifest.sound_groups = group_sounds(hero.as_deref(), &manifest.sounds);
  manifest.primary_model_path =
    primary_model_path(hero.as_deref(), &manifest.models).or_else(|| {
      hero
        .as_deref()
        .and_then(super::vdata::canonical_model_entry)
    });

  log::info!(
    "[Foundry] Analyzed {} entries (hero={:?}, skin={}): {} models, {} materials, {} textures, {} cards, {} sounds in {} groups, body={:?}",
    manifest.entry_count,
    manifest.hero_display,
    manifest.is_hero_skin,
    manifest.models.len(),
    manifest.materials.len(),
    manifest.textures.len(),
    manifest.cards.len(),
    manifest.sounds.len(),
    manifest.sound_groups.len(),
    manifest.primary_model_path,
  );
}

/// Parse a skin VPK from a staging copy and group its entries by editing
/// category. The manifest carries the staged path onward, so every later decode
/// and workspace unpack reads that copy too.
pub(crate) fn analyze_vpk_path(path: &Path) -> Result<FoundryManifest, Error> {
  let staged = stage_source_vpk(path)?;
  let file_path = staged.to_string_lossy().to_string();
  log::info!(
    "[Foundry] Analyzing VPK: {} (staged from {})",
    file_path,
    path.display(),
  );

  let entries = VpkParser::parse_directory_from_file(&staged)
    .map_err(|e| Error::InvalidInput(format!("Failed to parse VPK {file_path}: {e}")))?;

  let detection = detect_hero(&entries);
  let is_hero_skin = detection.category == "hero";
  let hero_name = detection
    .hero_display
    .as_deref()
    .or(detection.hero.as_deref())
    .unwrap_or_default();
  let prefixes = card_prefixes(&art_names(hero_name, &panorama_codenames(hero_name)));

  let mut manifest = empty_manifest(file_path);
  manifest.source_path = path.to_string_lossy().to_string();
  manifest.hero = detection.hero;
  manifest.hero_display = detection.hero_display;
  manifest.is_hero_skin = is_hero_skin;
  manifest.entry_count = entries.len();

  for entry in &entries {
    let category = classify(&entry.ext, &entry.full_path, &prefixes);
    push_manifest_entry(
      &mut manifest,
      foundry_entry_from_vpk_entry(entry, category, FoundryEntrySource::Mod),
    );
  }

  if manifest.sounds.is_empty()
    && let Some(hero_display) = manifest.hero_display.clone().or(manifest.hero.clone())
  {
    append_default_hero_sounds(&mut manifest, &hero_display)?;
  }

  finalize(&mut manifest);
  Ok(manifest)
}

/// Open the base game's default assets for one hero as a Foundry source. This
/// filters `pak01_dir.vpk` to that hero instead of surfacing the whole archive.
pub(crate) fn analyze_default_hero(hero_display: String) -> Result<FoundryManifest, Error> {
  let vpk_path = staged_base_game_vpk()?.ok_or_else(|| {
    Error::InvalidInput("Deadlock base VPK not found for default hero import".to_string())
  })?;
  let file_path = vpk_path.to_string_lossy().to_string();
  let codenames = panorama_codenames(&hero_display);
  let prefixes = card_prefixes(&art_names(&hero_display, &codenames));
  let terms = hero_asset_terms(&hero_display, &codenames);

  let entries = VpkParser::parse_directory_from_file(&vpk_path)
    .map_err(|e| Error::InvalidInput(format!("Failed to parse VPK {file_path}: {e}")))?;

  let mut manifest = empty_manifest(file_path);
  manifest.hero = Some(hero_display.clone());
  manifest.hero_display = Some(hero_display.clone());
  manifest.is_hero_skin = true;

  for entry in &entries {
    if !is_default_hero_asset(&entry.full_path, &prefixes, &terms) {
      continue;
    }
    let category = classify(&entry.ext, &entry.full_path, &prefixes);
    manifest.entry_count += 1;
    push_manifest_entry(
      &mut manifest,
      foundry_entry_from_vpk_entry(entry, category, FoundryEntrySource::Default),
    );
  }

  finalize(&mut manifest);
  Ok(manifest)
}

struct CardDecodeJob {
  source: FoundryCardSource,
  vpk_path: PathBuf,
  entry_path: String,
  filename: String,
  variant: String,
}

fn decode_card_preview(job: CardDecodeJob) -> Option<FoundryCardPreview> {
  // An edited card points at its loose workspace file rather than an archive.
  let edited = job
    .vpk_path
    .extension()
    .is_some_and(|ext| ext.eq_ignore_ascii_case("vtex_c"));
  let decoded = if edited {
    source2_model::decode_texture_file(&job.vpk_path)
  } else {
    source2_model::decode_texture_png(&job.vpk_path, &job.entry_path)
  }
  .ok()?;
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
  source: FoundryCardSource,
  names: &[String],
) -> Result<Vec<CardDecodeJob>, Error> {
  let prefixes = card_prefixes(names);
  let entries = source2_model::vpk_extract::list_entries(vpk_path)
    .map_err(|e| Error::InvalidInput(format!("failed to list VPK entries: {e}")))?;
  let mut jobs = entries
    .into_iter()
    .filter(|entry_path| is_hero_card_path(entry_path, &prefixes))
    .map(|entry_path| CardDecodeJob {
      source,
      filename: Path::new(&entry_path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(&entry_path)
        .to_string(),
      variant: card_variant(&entry_path, names),
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

/// Decode every hero-card texture for the active skin: the mod's own cards plus
/// the base game's defaults, so the user can swap between them.
pub(crate) fn decode_foundry_cards(
  file_path: PathBuf,
  hero: Option<String>,
  hero_display: Option<String>,
  workspace_root: Option<PathBuf>,
) -> Result<Vec<FoundryCardPreview>, Error> {
  let hero_name = hero_display.or(hero).unwrap_or_default();
  let codenames = panorama_codenames(&hero_name);
  if codenames.is_empty() {
    return Ok(Vec::new());
  }
  let names = art_names(&hero_name, &codenames);

  let default_vpk = staged_base_game_vpk()?;
  let mut jobs = if default_vpk
    .as_ref()
    .is_some_and(|base_vpk| paths_equal(&file_path, base_vpk))
  {
    Vec::new()
  } else {
    collect_card_jobs(&file_path, FoundryCardSource::Mod, &names)?
  };
  if let Some(default_vpk) = default_vpk {
    match collect_card_jobs(&default_vpk, FoundryCardSource::Default, &names) {
      Ok(default_jobs) => jobs.extend(default_jobs),
      Err(error) => log::warn!("[Foundry] Failed to collect default cards: {error}"),
    }
  }

  // An edited card in the workspace wins over the packed original, so the
  // gallery reflects what an export would actually contain. That holds for a
  // base-game card too: replacing one writes it into the workspace.
  if let Some(files_dir) = workspace_root.map(|root| root.join("files")) {
    for job in &mut jobs {
      let Ok(relative) = super::workspace::safe_entry_relative(&job.entry_path) else {
        continue;
      };
      let edited = files_dir.join(relative);
      if edited.is_file() {
        job.vpk_path = edited;
      }
    }
  }

  Ok(decode_card_jobs(jobs))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn hero_cards_are_split_out_of_plain_textures() {
    let prefixes = card_prefixes(&art_names("Haze", &["haze"]));
    assert_eq!(
      classify(
        "vtex_c",
        "panorama/images/heroes/haze_card.vtex_c",
        &prefixes
      ),
      FoundryCategory::Card
    );
    assert_eq!(
      classify(
        "vtex_c",
        "materials/models/heroes/haze/body_color.vtex_c",
        &prefixes
      ),
      FoundryCategory::Texture
    );
  }

  #[test]
  fn particles_and_physics_are_not_editable_categories() {
    assert_eq!(
      classify("vpcf_c", "particles/abilities/haze.vpcf_c", &[]),
      FoundryCategory::Other
    );
    assert_eq!(
      classify("vphys_c", "models/heroes/haze/haze.vphys_c", &[]),
      FoundryCategory::Other
    );
    assert_eq!(
      classify("vanim_c", "models/heroes/haze/idle.vanim_c", &[]),
      FoundryCategory::Other
    );
  }

  #[test]
  fn card_variants_drop_the_codename_and_source_suffix() {
    let names = art_names("Haze", &["haze"]);
    assert_eq!(
      card_variant("panorama/images/heroes/haze_card_psd.vtex_c", &names),
      "card"
    );
    assert_eq!(
      card_variant("panorama/images/heroes/haze_minimap.vtex_c", &names),
      "minimap"
    );
  }

  #[test]
  fn backgrounds_guns_and_ability_icons_count_as_hero_art() {
    // Abrams files his art under three names: atlas cards, bull guns and
    // abilities, and his display name for the background.
    let names = art_names("Abrams", &["atlas", "bull"]);
    let prefixes = card_prefixes(&names);
    for (path, variant) in [
      ("panorama/images/heroes/backgrounds/abrams_bg_psd.vtex_c", "background"),
      ("panorama/images/heroes/guns/bull_gun_psd.vtex_c", "weapon"),
      ("panorama/images/hud/abilities/bull_charge_psd.vtex_c", "ability_charge"),
    ] {
      assert!(is_hero_card_path(path, &prefixes), "{path}");
      assert_eq!(card_variant(path, &names), variant);
    }
    let dynamo = art_names("Dynamo", &["dynamo", "sumo"]);
    assert_eq!(
      card_variant(
        "panorama/images/hud/abilities/sumo/sumo_pork_bun_psd.vtex_c",
        &dynamo
      ),
      "ability_pork_bun"
    );
    assert!(!is_hero_card_path(
      "panorama/images/heroes/backgrounds/haze_bg_psd.vtex_c",
      &prefixes
    ));
  }
}
