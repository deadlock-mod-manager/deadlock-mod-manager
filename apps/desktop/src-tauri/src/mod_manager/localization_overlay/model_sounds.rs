//! Restore the tagged-sound binding that plays a model's footstep and movement
//! sounds. Models compiled before the game renamed the block keep their own
//! bindings under the old name, which the game no longer reads.
use super::asset_compatibility::{AssetRepair, RepairKind};
use super::model_text::{array_items, assigned_value, field, resource_name, root_fields};
use super::{
  CompiledDataSource, Kv3Value, Resource, compiled_resource, decode_compiled_data, kv3,
  object_set_case_insensitive, resources::ResourceSnapshot, runtime_values_equal,
};
use crate::errors::Error;
use std::collections::BTreeMap;
use vpkmanager::{material_repair, resource_id::resource_id};

const SETTINGS: &str = "TaggedSoundSettings_t";
const LEGACY_SETTINGS: &str = "CitadelTaggedSoundSettings_t";
const TABLES: &str = "scripts/tagged_sounds/";

/// Repairs effective models in place. Paths in `excluded` are owned by another
/// repair that already writes the current game's model.
pub(super) fn prepare(
  resources: &ResourceSnapshot,
  sources: &BTreeMap<String, Vec<CompiledDataSource>>,
  models: &mut BTreeMap<String, Vec<u8>>,
  excluded: &BTreeMap<String, Vec<u8>>,
  repairs: &mut Vec<AssetRepair>,
) -> Result<(), Error> {
  for (path, sources) in sources {
    let [source] = sources.as_slice() else {
      continue;
    };
    if excluded.contains_key(path) {
      continue;
    }
    let Some(base) = resources.game_bytes(path)? else {
      continue;
    };
    let input = models.get(path).map(Vec::as_slice).unwrap_or(&source.bytes);
    if let Some(repaired) = repair(input, &base, resources)? {
      log::info!(
        "Restored tagged sound bindings for {}:{path}",
        source.mod_id
      );
      models.insert(path.clone(), repaired);
      repairs.push(AssetRepair {
        mod_id: source.mod_id.clone(),
        source_vpk: source.source_vpk.clone(),
        file_path: path.clone(),
        kind: RepairKind::TaggedSounds,
      });
    }
  }
  Ok(())
}

/// The current game model binds tagged sounds and this model has no binding
/// the game reads.
pub(super) fn missing(model: &Kv3Value, current: &Kv3Value) -> bool {
  let Some((_, current)) = model_text(current).and_then(root_fields) else {
    return false;
  };
  if field(&current, SETTINGS).is_none() {
    return false;
  }
  match model_text(model) {
    Some(text) if !text.trim().is_empty() => {
      root_fields(text).is_some_and(|(_, fields)| field(&fields, SETTINGS).is_none())
    }
    _ => true,
  }
}

fn model_text(model: &Kv3Value) -> Option<&str> {
  model.get("m_modelInfo")?.get("m_keyValueText")?.as_str()
}

pub(super) fn repair(
  source: &[u8],
  base: &[u8],
  resources: &ResourceSnapshot,
) -> Result<Option<Vec<u8>>, Error> {
  let Ok((format, mut model, encoding)) = decode_compiled_data(source, "mod model sounds") else {
    return Ok(None);
  };
  let Ok(decoded_current) = compiled_resource::decode(base, "current model sounds") else {
    return Ok(None);
  };
  let current = &decoded_current.root;
  let Some(current_text) = model_text(current) else {
    return Ok(None);
  };
  let Some((_, current_fields)) = root_fields(current_text) else {
    return Ok(None);
  };
  let Some(current_binding) = field(&current_fields, SETTINGS) else {
    return Ok(None);
  };
  let Some(text) = model_text(&model) else {
    return Ok(None);
  };
  let Some((closing, fields)) = root_fields(text) else {
    return Ok(None);
  };
  // An authored binding, even an empty one, may silence these sounds on purpose.
  if field(&fields, SETTINGS).is_some() {
    return Ok(None);
  }
  // Renaming keeps the mod's own tables, including custom sounds.
  let (updated, tables) = if let Some(legacy) = field(&fields, LEGACY_SETTINGS) {
    let Some(tables) = tables(&text[legacy.clone()]) else {
      return Ok(None);
    };
    let name_end = legacy.start + LEGACY_SETTINGS.len();
    (
      format!("{}{SETTINGS}{}", &text[..legacy.start], &text[name_end..]),
      tables,
    )
  } else {
    let binding = &current_text[current_binding.clone()];
    let Some(tables) = tables(binding) else {
      return Ok(None);
    };
    (
      format!("{}\n{binding}\n{}", &text[..closing], &text[closing..]),
      tables,
    )
  };
  if !root_fields(&updated).is_some_and(|(_, fields)| field(&fields, SETTINGS).is_some()) {
    return Ok(None);
  }
  let game_references = material_repair::references(base).unwrap_or_default();
  let mut references = Vec::new();
  for table in tables {
    let Some((_, bytes)) = resources.resolve(&table)? else {
      return Ok(None);
    };
    let Ok(decoded_root) = compiled_resource::decode(&bytes, &table) else {
      return Ok(None);
    };
    let root = &decoded_root.root;
    let Ok(id) = resource_id(&table) else {
      return Ok(None);
    };
    if root.get("generic_data_type").and_then(Kv3Value::as_str) != Some("CTaggedSound_t")
      || game_references
        .iter()
        .any(|(game_id, name)| *name == table && *game_id != id)
    {
      return Ok(None);
    }
    references.push((id, table));
  }
  let Some(Kv3Value::Object(info)) = model.get_mut("m_modelInfo") else {
    return Ok(None);
  };
  object_set_case_insensitive(info, "m_keyValueText", Kv3Value::String(updated));
  Ok(rebuild(source, &model, &encoding, &format, &references))
}

fn rebuild(
  source: &[u8],
  model: &Kv3Value,
  encoding: &kv3::Encoding,
  format: &kv3::Format,
  references: &[(u64, String)],
) -> Option<Vec<u8>> {
  let data = kv3::encode_preserving(model, encoding, format).ok()?;
  let mut rebuilt = Resource::parse(source)
    .ok()?
    .rebuild_with_data_preserving(&data)
    .ok()?;
  let existing = material_repair::references(&rebuilt).ok()?;
  let additions: Vec<_> = references
    .iter()
    .filter(|reference| !existing.contains(reference))
    .cloned()
    .collect();
  if !additions.is_empty() {
    rebuilt = material_repair::add_references(&rebuilt, &additions).ok()?;
  }
  let (actual_format, actual, actual_encoding) =
    decode_compiled_data(&rebuilt, "restored sound bindings").ok()?;
  (actual_format == *format
    && runtime_values_equal(model, &actual)
    && kv3::encoding_preserved(model, encoding, &actual_encoding))
  .then_some(rebuilt)
}

/// Table paths of a `{ m_taggedSounds = [ resource:"…", … ] }` binding.
/// Any other field or reference form is an unknown schema.
fn tables(assignment: &str) -> Option<Vec<String>> {
  let object = assigned_value(assignment)?;
  let (_, fields) = root_fields(object)?;
  let [(name, range)] = fields.iter().collect::<Vec<_>>()[..] else {
    return None;
  };
  if name != "m_taggedSounds" {
    return None;
  }
  let tables = array_items(assigned_value(&object[range.clone()])?)?
    .into_iter()
    .map(|item| {
      let table = resource_name(item)?;
      (table.starts_with(TABLES)
        && table.ends_with(".vdata")
        && table
          .split('/')
          .all(|part| !matches!(part, "" | "." | "..")))
      .then_some(table)
    })
    .collect::<Option<Vec<_>>>()?;
  (!tables.is_empty()).then_some(tables)
}

#[cfg(test)]
mod tests;
