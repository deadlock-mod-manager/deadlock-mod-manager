use serde::Serialize;
use source2_model::kv3::KvValue;
use ts_rs::TS;

use super::animation::{archives_with_overlay, invalid};
use super::source_particles::kv;
use crate::errors::Error;

#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct PreviewModelAbility {
  pub class_name: String,
  pub name: String,
}

fn normalized(path: &str) -> String {
  path
    .replace('\\', "/")
    .trim_end_matches("_c")
    .to_ascii_lowercase()
}

fn hero_for_model<'a>(heroes: &'a KvValue, entry: &str) -> Option<&'a KvValue> {
  let KvValue::Object(heroes) = heroes else {
    return None;
  };
  let entry = normalized(entry);
  let mut candidates: Vec<_> = heroes
    .values()
    .filter_map(|hero| {
      let path = normalized(hero.get("m_strModelName")?.as_string()?);
      if path == entry {
        return Some((usize::MAX, hero));
      }
      let directory = path.rsplit_once('/')?.0;
      entry
        .strip_prefix(directory)?
        .starts_with('/')
        .then_some((directory.len(), hero))
    })
    .collect();
  candidates.sort_by_key(|(score, _)| std::cmp::Reverse(*score));
  let (score, hero) = candidates.first()?;
  if candidates.get(1).is_some_and(|(other, _)| other == score) {
    return None;
  }
  Some(hero)
}

fn ability_label(class: &str, definition: Option<&KvValue>) -> String {
  let stem = definition
    .and_then(|data| data.get("m_strAbilityImage"))
    .and_then(KvValue::as_string)
    .and_then(|path| {
      let (directory, file) = path.rsplit_once('/')?;
      let hero = directory.rsplit('/').next()?;
      let stem = file.split('.').next()?;
      Some(stem.strip_prefix(&format!("{hero}_")).unwrap_or(stem))
    })
    .unwrap_or(
      class
        .trim_start_matches("citadel_ability_")
        .trim_start_matches("ability_"),
    );
  stem
    .split('_')
    .filter(|part| !part.is_empty())
    .map(|part| {
      let mut chars = part.chars();
      chars
        .next()
        .map(|first| first.to_uppercase().collect::<String>() + chars.as_str())
        .unwrap_or_default()
    })
    .collect::<Vec<_>>()
    .join(" ")
}

fn model_abilities(heroes: &KvValue, abilities: &KvValue, entry: &str) -> Vec<PreviewModelAbility> {
  let Some(bound) = hero_for_model(heroes, entry).and_then(|hero| hero.get("m_mapBoundAbilities"))
  else {
    return vec![];
  };
  (1..=4)
    .filter_map(|slot| {
      let class = bound.get(&format!("ESlot_Signature_{slot}"))?.as_string()?;
      Some(PreviewModelAbility {
        class_name: class.trim_start_matches("citadel_ability_").to_owned(),
        name: ability_label(class, abilities.get(class)),
      })
    })
    .collect()
}

#[tauri::command]
pub async fn foundry_model_abilities(
  file_path: String,
  entry_path: String,
  overlay_root: Option<String>,
) -> Result<Vec<PreviewModelAbility>, Error> {
  tauri::async_runtime::spawn_blocking(move || {
    if !entry_path.ends_with(".vmdl_c") || entry_path.contains("..") {
      return Err(invalid("Abilities require a compiled character model"));
    }
    let (archive, base) = archives_with_overlay(&file_path, overlay_root.as_deref())?;
    let base = base.as_deref().unwrap_or(&archive);
    let heroes = kv(&archive, base, None, "scripts/heroes.vdata_c")?;
    let abilities = kv(&archive, base, None, "scripts/abilities.vdata_c")?;
    Ok(model_abilities(&heroes, &abilities, &entry_path))
  })
  .await
  .map_err(invalid)?
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::collections::BTreeMap;
  fn object(fields: &[(&str, KvValue)]) -> KvValue {
    KvValue::Object(
      fields
        .iter()
        .map(|(k, v)| (k.to_string(), v.clone()))
        .collect::<BTreeMap<_, _>>(),
    )
  }
  fn hero(model: &str, class: &str) -> KvValue {
    object(&[
      ("m_strModelName", KvValue::String(model.into())),
      (
        "m_mapBoundAbilities",
        object(&[("ESlot_Signature_1", KvValue::String(class.into()))]),
      ),
    ])
  }
  #[test]
  fn discovers_an_unregistered_hero_from_installed_data() {
    let heroes = object(&[(
      "hero_new",
      hero("models/new/body.vmdl", "ability_new_power"),
    )]);
    let abilities = object(&[(
      "ability_new_power",
      object(&[(
        "m_strAbilityImage",
        KvValue::String("file://{images}/hud/abilities/new/new_void_step.psd".into()),
      )]),
    )]);
    let found = model_abilities(&heroes, &abilities, "MODELS\\new\\body.vmdl_c");
    assert_eq!(found[0].class_name, "ability_new_power");
    assert_eq!(found[0].name, "Void Step");
    assert!(model_abilities(&heroes, &abilities, "models/newcomer/body.vmdl_c").is_empty());
  }
  #[test]
  fn prefers_exact_models_and_rejects_ambiguous_directory_matches() {
    let heroes = object(&[
      ("a", hero("models/shared/a.vmdl", "a")),
      ("b", hero("models/shared/b.vmdl", "b")),
    ]);
    assert_eq!(
      model_abilities(&heroes, &KvValue::Null, "models/shared/b.vmdl_c")[0].class_name,
      "b"
    );
    assert!(
      model_abilities(&heroes, &KvValue::Null, "models/shared/replacement.vmdl_c").is_empty()
    );
  }
  #[test]
  fn keeps_signature_slot_order_and_uses_the_most_specific_directory() {
    let nested = object(&[
      (
        "m_strModelName",
        KvValue::String("models/new/v2/body.vmdl".into()),
      ),
      (
        "m_mapBoundAbilities",
        object(&[
          (
            "ESlot_Signature_4",
            KvValue::String("citadel_ability_four".into()),
          ),
          (
            "ESlot_Signature_1",
            KvValue::String("citadel_ability_one".into()),
          ),
          ("ESlot_Weapon_Primary", KvValue::String("weapon".into())),
        ]),
      ),
    ]);
    let heroes = object(&[("old", hero("models/new/old.vmdl", "old")), ("new", nested)]);
    let found = model_abilities(&heroes, &KvValue::Null, "models/new/v2/replacement.vmdl_c");
    assert_eq!(
      found
        .iter()
        .map(|x| x.class_name.as_str())
        .collect::<Vec<_>>(),
      ["one", "four"]
    );
  }
}
