//! Read-only inspection of authored ability effects and loose hero particles.

use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::sync::OnceLock;

use serde::Serialize;
use source2_model::{Resource, kv3::KvValue, vpk_extract::VpkArchive};
use ts_rs::TS;

use super::animation::{archives, invalid};
use super::hero::{hero_asset_terms, panorama_codenames};
use super::particles::{PreviewParticles, effect_model, effect_slot, preview_particles};
use super::vdata::{TableCache, base_table};
use crate::errors::Error;

const ABILITIES_VDATA: &str = "scripts/abilities.vdata_c";
const MAX_CHOICES: usize = 512;
const MAX_CLASSES: usize = 16;
const MAX_TABLE_BYTES: usize = 32 * 1024 * 1024;
const MAX_TABLE_CLASSES: usize = 4096;
const MAX_INDEX_EFFECTS: usize = 16_384;
const MAX_VISITED_VALUES: usize = 8192;
const MAX_DEPTH: usize = 24;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct PreviewEffectChoice {
  pub path: String,
  pub ability: Option<String>,
  /// The authored VData field, retained so target/impact effects are identifiable.
  pub field: Option<String>,
}

type AbilityEffects = HashMap<String, Vec<PreviewEffectChoice>>;

fn particle_path(path: &str) -> Option<&str> {
  let path = path.strip_suffix("_c").unwrap_or(path);
  if path.len() > 512
    || !path.starts_with("particles/")
    || !path.ends_with(".vpcf")
    || path
      .split('/')
      .any(|part| part.is_empty() || part == "." || part == "..")
    || !path
      .bytes()
      .all(|byte| byte.is_ascii_alphanumeric() || b"/_-.".contains(&byte))
  {
    return None;
  }
  Some(path)
}

fn collect_effects(
  value: &KvValue,
  field: &str,
  ability: &str,
  depth: usize,
  remaining: &mut usize,
  output: &mut BTreeMap<String, PreviewEffectChoice>,
) {
  if depth > MAX_DEPTH || *remaining == 0 || output.len() >= MAX_CHOICES {
    return;
  }
  *remaining -= 1;
  match value {
    KvValue::String(path) => {
      if let Some(path) = particle_path(path) {
        output
          .entry(path.to_owned())
          .or_insert_with(|| PreviewEffectChoice {
            path: path.to_owned(),
            ability: Some(ability.to_owned()),
            field: Some(field.to_owned()),
          });
      }
    }
    KvValue::Object(fields) => {
      for (key, child) in fields {
        collect_effects(child, key, ability, depth + 1, remaining, output);
        if *remaining == 0 || output.len() >= MAX_CHOICES {
          break;
        }
      }
    }
    KvValue::Array(values) => {
      for child in values {
        collect_effects(child, field, ability, depth + 1, remaining, output);
        if *remaining == 0 || output.len() >= MAX_CHOICES {
          break;
        }
      }
    }
    _ => {}
  }
}

fn ability_index(root: KvValue) -> Result<AbilityEffects, Error> {
  let KvValue::Object(abilities) = root else {
    return Err(invalid("Ability effect table must be an object"));
  };
  let mut index = AbilityEffects::new();
  let mut remaining_effects = MAX_INDEX_EFFECTS;
  for (class, definition) in abilities.into_iter().take(MAX_TABLE_CLASSES) {
    let mut effects = BTreeMap::new();
    let mut remaining_values = MAX_VISITED_VALUES;
    collect_effects(
      &definition,
      "",
      &class,
      0,
      &mut remaining_values,
      &mut effects,
    );
    let choices: Vec<_> = effects.into_values().take(remaining_effects).collect();
    remaining_effects -= choices.len();
    if !choices.is_empty() {
      index.insert(class, choices);
    }
    if remaining_effects == 0 {
      break;
    }
  }
  Ok(index)
}

fn archive_ability_index(archive: &VpkArchive) -> Result<AbilityEffects, Error> {
  let bytes = archive
    .extract_entry_limited(ABILITIES_VDATA, MAX_TABLE_BYTES)
    .map_err(invalid)?;
  let resource = Resource::parse(bytes).map_err(invalid)?;
  let data = resource
    .block_bytes("DATA")
    .ok_or_else(|| invalid("Ability table has no DATA block"))?;
  ability_index(source2_model::kv3::parse(data).map_err(invalid)?)
}

fn hero_particle(path: &str, terms: &[String]) -> Option<String> {
  let path = particle_path(path)?;
  let stem = path.strip_prefix("particles/")?;
  terms
    .iter()
    .any(|term| {
      stem.split('/').any(|part| {
        part == term
          || part
            .strip_prefix(term)
            .is_some_and(|rest| rest.starts_with('_'))
      })
    })
    .then(|| path.to_owned())
}

fn choices_for(
  index: &AbilityEffects,
  classes: &[String],
  entries: impl Iterator<Item = String>,
  terms: &[String],
) -> Vec<PreviewEffectChoice> {
  let mut choices = BTreeMap::new();
  // Authored ability associations take priority over the loose namespace fallback.
  for class in classes {
    if let Some(effects) = index
      .get(class)
      .or_else(|| index.get(&format!("citadel_ability_{class}")))
    {
      for effect in effects {
        if choices.len() >= MAX_CHOICES {
          break;
        }
        choices
          .entry(effect.path.clone())
          .or_insert_with(|| effect.clone());
      }
    }
  }
  for entry in entries {
    if choices.len() >= MAX_CHOICES {
      break;
    }
    if let Some(path) = hero_particle(&entry, terms) {
      choices.entry(path.clone()).or_insert(PreviewEffectChoice {
        path,
        ability: None,
        field: None,
      });
    }
  }
  choices.into_values().collect()
}

#[tauri::command]
pub async fn foundry_list_effects(
  file_path: String,
  entry_path: String,
  hero_name: String,
  ability_classes: Vec<String>,
) -> Result<Vec<PreviewEffectChoice>, Error> {
  if ability_classes.len() > MAX_CLASSES
    || hero_name.len() > 128
    || ability_classes.iter().any(|class| {
      class.len() > 128
        || !class
          .bytes()
          .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
    })
    || !entry_path.ends_with(".vmdl_c")
    || entry_path.contains("..")
    || entry_path.len() > 1024
  {
    return Err(invalid("Invalid effect catalog source or ability classes"));
  }
  let permit = effect_slot()
    .clone()
    .acquire_owned()
    .await
    .map_err(invalid)?;
  tauri::async_runtime::spawn_blocking(move || {
    let _permit = permit;
    let (archive, base) = archives(&file_path)?;
    static CACHE: TableCache<AbilityEffects> = OnceLock::new();
    let base_index = base_table(&CACHE, ABILITIES_VDATA, ability_index);
    let mut index = base_index.as_deref().cloned().unwrap_or_default();
    let source_entries = archive.list_entries();
    if source_entries.iter().any(|entry| entry == ABILITIES_VDATA) {
      index.extend(archive_ability_index(&archive)?);
    }
    let terms = hero_asset_terms(&hero_name, &panorama_codenames(&hero_name));
    let mut entries: BTreeSet<_> = source_entries
      .into_iter()
      .filter_map(|entry| hero_particle(&entry, &terms))
      .take(MAX_CHOICES)
      .collect();
    if let Some(base) = base {
      entries.extend(
        base
          .list_entries()
          .into_iter()
          .filter_map(|entry| hero_particle(&entry, &terms))
          .take(MAX_CHOICES),
      );
    }
    Ok(choices_for(
      &index,
      &ability_classes,
      entries.into_iter(),
      &terms,
    ))
  })
  .await
  .map_err(invalid)?
}

#[tauri::command]
pub async fn foundry_decode_effect(
  file_path: String,
  entry_path: String,
  effect_path: String,
) -> Result<PreviewParticles, Error> {
  let effect_path = particle_path(&effect_path)
    .ok_or_else(|| invalid("Effect must be a particle resource under particles/"))?
    .to_owned();
  let permit = effect_slot()
    .clone()
    .acquire_owned()
    .await
    .map_err(invalid)?;
  tauri::async_runtime::spawn_blocking(move || {
    let _permit = permit;
    let (archive, resource) = effect_model(
      &file_path,
      &entry_path,
      "Effect preview requires a compiled character model",
      None,
    )?;
    preview_particles(&archive, &resource, &[effect_path], Vec::new())
  })
  .await
  .map_err(invalid)?
}

#[cfg(test)]
mod tests {
  use super::*;

  fn object(fields: &[(&str, KvValue)]) -> KvValue {
    KvValue::Object(
      fields
        .iter()
        .map(|(key, value)| (key.to_string(), value.clone()))
        .collect(),
    )
  }

  fn text(value: &str) -> KvValue {
    KvValue::String(value.to_owned())
  }

  #[test]
  fn catalog_includes_nested_target_projectile_and_array_references() {
    let index = ability_index(object(&[(
      "citadel_ability_chrono",
      object(&[
        (
          "m_TargetModifier",
          object(&[("m_strParticleEffect", text("particles/chrono/target.vpcf"))]),
        ),
        (
          "m_ProjectileParticle",
          text("particles/chrono/projectile.vpcf_c"),
        ),
        (
          "m_Impacts",
          KvValue::Array(vec![text("particles/chrono/impact.vpcf")]),
        ),
      ]),
    )]))
    .unwrap();
    let choices = choices_for(&index, &["chrono".into()], std::iter::empty(), &[]);
    assert_eq!(choices.len(), 3);
    assert!(
      choices
        .iter()
        .all(|choice| choice.ability.as_deref() == Some("citadel_ability_chrono"))
    );
    assert!(
      choices
        .iter()
        .any(|choice| choice.field.as_deref() == Some("m_strParticleEffect"))
    );
    assert!(
      choices
        .iter()
        .any(|choice| choice.path == "particles/chrono/projectile.vpcf")
    );
  }

  #[test]
  fn catalog_preserves_ability_metadata_and_hero_namespace_boundaries() {
    let index = ability_index(object(&[(
      "lash",
      object(&[("effect", text("particles/lash/sparkle.vpcf"))]),
    )]))
    .unwrap();
    let choices = choices_for(
      &index,
      &["lash".into()],
      [
        "particles/lash/sparkle.vpcf_c",
        "particles/abilities/lash/whip.vpcf_c",
        "particles/lash_ground.vpcf_c",
        "particles/flash/projectile.vpcf_c",
      ]
      .into_iter()
      .map(str::to_owned),
      &["lash".into()],
    );
    assert_eq!(choices.len(), 3);
    assert_eq!(
      choices
        .iter()
        .find(|choice| choice.path == "particles/lash/sparkle.vpcf")
        .unwrap()
        .ability
        .as_deref(),
      Some("lash")
    );
  }

  #[test]
  fn rejects_path_traversal_non_particles_and_absolute_paths() {
    for path in [
      "../particles/test.vpcf",
      "particles/../test.vpcf",
      "particles//test.vpcf",
      "C:/particles/test.vpcf",
      "materials/test.vpcf",
      "particles/test.vpcf/extra",
      "particles\\test.vpcf",
      "particles/./test.vpcf",
    ] {
      assert_eq!(particle_path(path), None, "{path}");
    }
  }

  #[test]
  fn catalog_and_recursive_scans_are_bounded() {
    let definition = KvValue::Array(
      (0..MAX_CHOICES + 100)
        .map(|index| text(&format!("particles/lash/{index}.vpcf")))
        .collect(),
    );
    let index = ability_index(object(&[("lash", definition)])).unwrap();
    let choices = choices_for(&index, &["lash".into()], std::iter::empty(), &[]);
    assert_eq!(choices.len(), MAX_CHOICES);
    let deep = (0..MAX_DEPTH + 1).fold(text("particles/lash/deep.vpcf"), |value, _| {
      KvValue::Array(vec![value])
    });
    assert!(ability_index(object(&[("lash", deep)])).unwrap().is_empty());
  }
}
