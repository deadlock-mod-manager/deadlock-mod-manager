//! Resolving a hero to the body model the game actually loads.
//!
//! Deadlock ships more than one model per hero: the current body, the
//! pre-rework body still sitting in `heroes_staging` after the live hero moved
//! to `heroes_wip`, and the weapon. Choosing between them by filename is a
//! guess, and it guesses wrong often enough to matter — a skin carrying both a
//! body and a weapon `.vmdl_c` surfaced whichever came first in the VPK
//! directory, which is how importing Calico opened on her gun.
//!
//! `scripts/heroes.vdata_c` settles it. Every `hero_<codename>` entry there
//! carries `m_strModelName`: the model the live game loads for that hero. So
//! the Foundry asks the game rather than guessing.
//!
//! Measured against the installed pak (2026-08-12): all 39 heroes in our roster
//! resolve, and the answers reproduce on their own every special case that a
//! name-matching approach has to hardcode — Abrams' body is `abrams` (not his
//! `atlas` codename), Seven's is `gigawatt_prisoner`, Grey Talon's is `archer`,
//! Rem's is `familiar_wip`, and the reworked heroes land in `heroes_wip` rather
//! than on their stale `heroes_staging` twin.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

use source2_model::kv3::KvValue;
use source2_model::resource::Resource;

use crate::errors::Error;

use super::archive_cache::open_archive;
use super::hero::panorama_codenames;
use super::staging::staged_base_game_vpk;
use super::types::FoundryEntry;

/// The hero definition table, inside the base game's own pak.
const HEROES_VDATA: &str = "scripts/heroes.vdata_c";

/// Codename (without the `hero_` prefix) to the compiled model entry it names.
type HeroModels = HashMap<String, String>;

/// Identity of the pak a table was read from, so a game update is picked up
/// rather than served from a stale parse. Mirrors `archive_cache`'s keying.
type TableKey = (PathBuf, u64, u128);

/// One slot is enough: there is only ever one base pak to read.
type Cache = Mutex<Option<(TableKey, Arc<HeroModels>)>>;

fn cache() -> &'static Cache {
  static CACHE: OnceLock<Cache> = OnceLock::new();
  CACHE.get_or_init(|| Mutex::new(None))
}

fn key_for(path: &Path) -> Result<TableKey, Error> {
  let metadata = std::fs::metadata(path)?;
  let modified_nanos = metadata
    .modified()
    .ok()
    .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
    .map(|since| since.as_nanos())
    .unwrap_or_default();
  Ok((path.to_path_buf(), metadata.len(), modified_nanos))
}

fn as_str(value: Option<&KvValue>) -> Option<&str> {
  match value? {
    KvValue::String(text) if !text.is_empty() => Some(text),
    _ => None,
  }
}

/// Read every `hero_<codename> -> m_strModelName` pair out of the pak.
///
/// `m_strModelName` is the *uncompiled* path (`....vmdl`); a VPK stores the
/// compiled resource, so the entry we want carries a trailing `_c`.
fn read_table(pak: &Path) -> Result<HeroModels, Error> {
  let archive = open_archive(pak, None)?;
  let bytes = archive
    .extract_entry(HEROES_VDATA)
    .map_err(|e| Error::InvalidInput(format!("failed to read {HEROES_VDATA}: {e}")))?;
  let resource = Resource::parse(bytes)
    .map_err(|e| Error::InvalidInput(format!("failed to parse {HEROES_VDATA}: {e}")))?;
  let data = resource
    .block_bytes("DATA")
    .ok_or_else(|| Error::InvalidInput(format!("{HEROES_VDATA} has no DATA block")))?;
  let root = source2_model::kv3::parse(data)
    .map_err(|e| Error::InvalidInput(format!("failed to decode {HEROES_VDATA}: {e}")))?;

  let KvValue::Object(heroes) = &root else {
    return Err(Error::InvalidInput(format!(
      "{HEROES_VDATA} root is not an object"
    )));
  };

  let mut models = HeroModels::new();
  for (key, hero) in heroes {
    let Some(codename) = key.strip_prefix("hero_") else {
      continue;
    };
    let Some(model) = as_str(hero.get("m_strModelName")) else {
      continue;
    };
    models.insert(codename.to_ascii_lowercase(), format!("{model}_c"));
  }

  log::info!(
    "[Foundry] Read {} hero models from {HEROES_VDATA}",
    models.len()
  );
  Ok(models)
}

/// The hero model table, parsed once per base pak.
fn hero_models() -> Option<Arc<HeroModels>> {
  let pak = match staged_base_game_vpk() {
    Ok(Some(pak)) => pak,
    Ok(None) => return None,
    Err(error) => {
      log::warn!("[Foundry] No base pak for hero model lookup: {error}");
      return None;
    }
  };
  let key = key_for(&pak).ok()?;

  if let Ok(cached) = cache().lock()
    && let Some((cached_key, models)) = cached.as_ref()
    && *cached_key == key
  {
    return Some(Arc::clone(models));
  }

  // Parsed outside the lock: reading the table costs ~70 ms on top of opening
  // the pak, which is long enough that holding the mutex would stall callers.
  let models = match read_table(&pak) {
    Ok(models) => Arc::new(models),
    Err(error) => {
      // A missing or unreadable table is not fatal: the caller falls back to
      // its heuristic and the Foundry still opens.
      log::warn!("[Foundry] Could not read the hero model table: {error}");
      return None;
    }
  };

  if let Ok(mut cached) = cache().lock() {
    *cached = Some((key, Arc::clone(&models)));
  }
  Some(models)
}

/// The codenames to look for in the table, most specific first. The panorama
/// namespace covers almost the whole roster; the display name reduced to a
/// codename covers the rest (Wrecker is `hero_wrecker` in the table but
/// `butcher` in panorama).
fn codename_candidates(hero_name: &str) -> Vec<String> {
  let mut candidates: Vec<String> = panorama_codenames(hero_name)
    .into_iter()
    .map(str::to_string)
    .collect();

  let compacted = hero_name
    .to_ascii_lowercase()
    .chars()
    .filter(|c| c.is_ascii_alphanumeric())
    .collect::<String>();
  if !compacted.is_empty() && !candidates.contains(&compacted) {
    candidates.push(compacted);
  }
  candidates
}

/// The model entry the live game loads for a hero, if the table knows them.
pub(crate) fn canonical_model_entry(hero_name: &str) -> Option<String> {
  let models = hero_models()?;
  codename_candidates(hero_name)
    .into_iter()
    .find_map(|codename| models.get(&codename).cloned())
}

fn file_name_of(path: &str) -> &str {
  path.rsplit('/').next().unwrap_or(path)
}

/// How good a stand-in a model entry is when the authoritative lookup found
/// nothing to match. Higher wins; ties keep VPK order.
fn fallback_score(path: &str) -> i32 {
  let lower = path.to_ascii_lowercase();
  let mut score = 0;
  // A `.vmdl_c` assembles the whole character (every mesh plus the skeleton),
  // so it beats a lone `.vmesh_c`, which is a single body part.
  if lower.ends_with(".vmdl_c") {
    score += 4;
  }
  // Showing the gun instead of the hero is the exact failure this module
  // exists to prevent, so weight it heavily even in the fallback.
  if !super::paint::is_weapon_path(&lower) {
    score += 8;
  }
  score
}

/// The model the preview should open on, and that an export is named after.
///
/// Three tiers, in descending order of how much they know:
/// 1. the entry `heroes.vdata_c` names for this hero, if the skin ships it —
///    skins normally override the game's canonical path in place, so this is
///    the common case and it is authoritative rather than a guess;
/// 2. the same file name somewhere else in the skin, for a skin that relocated
///    the model instead of overriding it;
/// 3. a scored guess, which at least keeps a weapon out of the slot.
pub(crate) fn primary_model_path(
  hero_name: Option<&str>,
  models: &[FoundryEntry],
) -> Option<String> {
  if models.is_empty() {
    return None;
  }

  if let Some(canonical) = hero_name.and_then(canonical_model_entry) {
    let wanted = canonical.to_ascii_lowercase();
    if let Some(entry) = models
      .iter()
      .find(|entry| entry.path.to_ascii_lowercase() == wanted)
    {
      return Some(entry.path.clone());
    }

    let wanted_name = file_name_of(&wanted).to_string();
    if let Some(entry) = models
      .iter()
      .find(|entry| file_name_of(&entry.path.to_ascii_lowercase()) == wanted_name)
    {
      log::info!(
        "[Foundry] {} ships {} under a different path: {}",
        hero_name.unwrap_or("?"),
        wanted_name,
        entry.path,
      );
      return Some(entry.path.clone());
    }

    log::info!(
      "[Foundry] {} does not ship its own body model ({canonical}); falling back",
      hero_name.unwrap_or("?"),
    );
  }

  models
    .iter()
    .max_by_key(|entry| fallback_score(&entry.path))
    .map(|entry| entry.path.clone())
}

#[cfg(test)]
mod tests {
  use super::super::types::{FoundryCategory, FoundryEntrySource};
  use super::*;

  fn model(path: &str) -> FoundryEntry {
    FoundryEntry {
      path: path.to_string(),
      filename: file_name_of(path).to_string(),
      ext: "vmdl_c".to_string(),
      size: 0,
      category: FoundryCategory::Model,
      source: FoundryEntrySource::Mod,
    }
  }

  #[test]
  fn the_weapon_never_wins_the_preview_slot() {
    // The reported failure: a skin shipping the gun before the body. Without a
    // hero name there is no table lookup, so this exercises the fallback only.
    let models = [
      model("models/weapons/hero/nano_gun.vmdl_c"),
      model("models/heroes_staging/nano/nano_v2/nano.vmdl_c"),
    ];
    assert_eq!(
      primary_model_path(None, &models).as_deref(),
      Some("models/heroes_staging/nano/nano_v2/nano.vmdl_c")
    );
  }

  #[test]
  fn a_whole_model_beats_a_single_mesh() {
    let models = [
      model("models/heroes_wip/wraith/wraith_body.vmesh_c"),
      model("models/heroes_wip/wraith/wraith.vmdl_c"),
    ];
    assert_eq!(
      primary_model_path(None, &models).as_deref(),
      Some("models/heroes_wip/wraith/wraith.vmdl_c")
    );
  }

  #[test]
  fn nothing_to_pick_from_stays_none() {
    assert_eq!(primary_model_path(Some("Calico"), &[]), None);
  }

  #[test]
  fn panorama_and_display_name_are_both_offered_as_codenames() {
    // Wrecker is `hero_wrecker` in the table but `butcher` in panorama, so the
    // compacted display name is what actually resolves them.
    assert!(codename_candidates("Wrecker").contains(&"wrecker".to_string()));
    assert!(codename_candidates("Wrecker").contains(&"butcher".to_string()));
    assert!(codename_candidates("Mo & Krill").contains(&"mokrill".to_string()));
  }
}
