use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

use source2_model::kv3::KvValue;
use source2_model::resource::Resource;

use crate::errors::Error;

use super::hero::panorama_codenames;
use super::staging::staged_base_game_vpk;
use super::types::FoundryEntry;
use crate::vpk_archive_cache::open_archive;

const HEROES_VDATA: &str = "scripts/heroes.vdata_c";

type HeroModels = HashMap<String, String>;

type TableKey = (PathBuf, u64, u128, Option<String>);

pub(super) type TableCache<T> = OnceLock<Mutex<Option<(TableKey, Arc<T>)>>>;

fn key_for(path: &Path) -> Result<TableKey, Error> {
  let metadata = std::fs::metadata(path)?;
  let modified_nanos = metadata
    .modified()
    .ok()
    .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
    .map(|since| since.as_nanos())
    .unwrap_or_default();
  Ok((
    path.to_path_buf(),
    metadata.len(),
    modified_nanos,
    std::fs::read_to_string(path.with_extension("stamp")).ok(),
  ))
}

fn as_str(value: Option<&KvValue>) -> Option<&str> {
  match value? {
    KvValue::String(text) if !text.is_empty() => Some(text),
    _ => None,
  }
}

fn read_vdata(pak: &Path, entry: &str) -> Result<KvValue, Error> {
  let archive = open_archive(pak, None)?;
  let bytes = archive
    .extract_entry(entry)
    .map_err(|e| Error::InvalidInput(format!("failed to read {entry}: {e}")))?;
  let resource = Resource::parse(bytes)
    .map_err(|e| Error::InvalidInput(format!("failed to parse {entry}: {e}")))?;
  let data = resource
    .block_bytes("DATA")
    .ok_or_else(|| Error::InvalidInput(format!("{entry} has no DATA block")))?;
  source2_model::kv3::parse(data)
    .map_err(|e| Error::InvalidInput(format!("failed to decode {entry}: {e}")))
}

pub(super) fn base_table<T>(
  cache: &'static TableCache<T>,
  entry: &str,
  build: impl FnOnce(KvValue) -> Result<T, Error>,
) -> Option<Arc<T>> {
  let cache = cache.get_or_init(|| Mutex::new(None));
  let pak = match staged_base_game_vpk() {
    Ok(Some(pak)) => pak,
    Ok(None) => return None,
    Err(error) => {
      log::warn!("[Foundry] No base pak to read {entry}: {error}");
      return None;
    }
  };
  let key = key_for(&pak).ok()?;

  if let Ok(cached) = cache.lock()
    && let Some((cached_key, table)) = cached.as_ref()
    && *cached_key == key
  {
    return Some(Arc::clone(table));
  }

  let table = match read_vdata(&pak, entry).and_then(build) {
    Ok(table) => Arc::new(table),
    Err(error) => {
      log::warn!("[Foundry] Could not read {entry}: {error}");
      return None;
    }
  };

  if let Ok(mut cached) = cache.lock() {
    *cached = Some((key, Arc::clone(&table)));
  }
  Some(table)
}

fn hero_table(root: KvValue) -> Result<HeroModels, Error> {
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

fn hero_models() -> Option<Arc<HeroModels>> {
  static CACHE: TableCache<HeroModels> = OnceLock::new();
  base_table(&CACHE, HEROES_VDATA, hero_table)
}

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

pub(crate) fn canonical_model_entry(hero_name: &str) -> Option<String> {
  let models = hero_models()?;
  codename_candidates(hero_name)
    .into_iter()
    .find_map(|codename| models.get(&codename).cloned())
}

fn file_name_of(path: &str) -> &str {
  path.rsplit('/').next().unwrap_or(path)
}

fn fallback_score(path: &str) -> i32 {
  let lower = path.to_ascii_lowercase();
  let mut score = 0;
  if lower.ends_with(".vmdl_c") {
    score += 4;
  }
  if !super::paint::is_weapon_path(&lower) {
    score += 8;
  }
  score
}

fn body_model_path(canonical: String, models: &[FoundryEntry]) -> String {
  let wanted = canonical.to_ascii_lowercase();
  if let Some(entry) = models
    .iter()
    .find(|entry| entry.path.to_ascii_lowercase() == wanted)
  {
    return entry.path.clone();
  }

  let wanted_name = file_name_of(&wanted).to_string();
  if let Some(entry) = models
    .iter()
    .find(|entry| file_name_of(&entry.path.to_ascii_lowercase()) == wanted_name)
  {
    return entry.path.clone();
  }

  canonical
}

pub(crate) fn primary_model_path(
  hero_name: Option<&str>,
  models: &[FoundryEntry],
) -> Option<String> {
  if let Some(canonical) = hero_name.and_then(canonical_model_entry) {
    return Some(body_model_path(canonical, models));
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
    assert_eq!(primary_model_path(None, &[]), None);
  }

  #[test]
  fn accessory_and_ability_models_use_the_canonical_character() {
    let canonical = "models/heroes_wip/bookworm/bookworm.vmdl_c";
    let models = [
      model("models/heroes_wip/bookworm/bookworm_dragon_fullbody.vmdl_c"),
      model("models/heroes_wip/bookworm/bookworm_shield.vmdl_c"),
      model("models/abilities/text_a_model_fx.vmdl_c"),
    ];
    assert_eq!(body_model_path(canonical.into(), &models), canonical);
    assert_eq!(body_model_path(canonical.into(), &[]), canonical);
  }

  #[test]
  fn a_relocated_custom_body_keeps_its_mod_path() {
    let relocated = "models/custom/hero/bookworm.vmdl_c";
    assert_eq!(
      body_model_path(
        "models/heroes_wip/bookworm/bookworm.vmdl_c".into(),
        &[model(relocated)],
      ),
      relocated,
    );
  }

  #[test]
  fn panorama_and_display_name_are_both_offered_as_codenames() {
    assert!(codename_candidates("Wrecker").contains(&"wrecker".to_string()));
    assert!(codename_candidates("Wrecker").contains(&"butcher".to_string()));
    assert!(codename_candidates("Mo & Krill").contains(&"mokrill".to_string()));
  }
}
