use super::{Kv3Encoding, Kv3Value, kv3, object_set_case_insensitive, runtime_values_equal};
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn rebase(
  old: &Kv3Value,
  current: &Kv3Value,
  old_encoding: &Kv3Encoding,
  current_encoding: &Kv3Encoding,
) -> Option<(Kv3Value, Kv3Encoding)> {
  let names = |rig: &Kv3Value| -> Option<BTreeSet<String>> {
    rig
      .get("m_boneIDs")?
      .as_array()?
      .iter()
      .map(|name| name.as_str().map(str::to_owned))
      .collect()
  };
  let old_bones = names(old)?;
  let current_bones = names(current)?;
  let old_masks = old.get("m_maskDefinitions")?.as_array()?;
  let old_encodings = old_encoding.get("m_maskDefinitions")?.as_array()?;
  let current_masks = current.get("m_maskDefinitions")?.as_array()?;
  let current_encodings = current_encoding.get("m_maskDefinitions")?.as_array()?;
  if old_masks.len() != old_encodings.len() || current_masks.len() != current_encodings.len() {
    return None;
  }
  let indexed = |masks: &[Kv3Value]| -> Option<BTreeMap<String, usize>> {
    let mut result = BTreeMap::new();
    for (index, mask) in masks.iter().enumerate() {
      if result
        .insert(mask.get("m_ID")?.as_str()?.to_ascii_lowercase(), index)
        .is_some()
      {
        return None;
      }
    }
    Some(result)
  };
  let old_indices = indexed(old_masks)?;
  let current_indices = indexed(current_masks)?;
  let mut values = Vec::new();
  let mut encodings = Vec::new();
  for (index, mask) in current_masks.iter().enumerate() {
    let id = mask.get("m_ID")?.as_str()?.to_ascii_lowercase();
    let Some(&old_index) = old_indices.get(&id) else {
      values.push(mask.clone());
      encodings.push(current_encodings[index].clone());
      continue;
    };
    let source = &old_masks[old_index];
    if !empty_secondary(source)? || !empty_secondary(mask)? {
      return None;
    }
    if !matching_metadata(source, mask, &["m_ID", "m_primaryWeightList"])?
      || !matching_metadata(
        source.get("m_primaryWeightList")?,
        mask.get("m_primaryWeightList")?,
        &["m_boneIDs", "m_weights"],
      )?
    {
      return None;
    }
    let mut value = mask.clone();
    let mut encoding = current_encodings[index].clone();
    copy_weights(
      source,
      &old_encodings[old_index],
      &mut value,
      &mut encoding,
      &old_bones,
      &current_bones,
      true,
    )?;
    values.push(value);
    encodings.push(encoding);
  }
  // Extra mod masks remain available, with obsolete bone references removed.
  for (id, index) in old_indices {
    if current_indices.contains_key(&id) {
      continue;
    }
    if !empty_secondary(&old_masks[index])? {
      return None;
    }
    let mut value = old_masks[index].clone();
    let mut encoding = old_encodings[index].clone();
    copy_weights(
      &old_masks[index],
      &old_encodings[index],
      &mut value,
      &mut encoding,
      &old_bones,
      &current_bones,
      false,
    )?;
    values.push(value);
    encodings.push(encoding);
  }
  let mut encoding = current_encoding.get("m_maskDefinitions")?.clone();
  encoding.children = kv3::EncodingChildren::Array(encodings);
  Some((Kv3Value::Array(values), encoding))
}

fn empty_secondary(mask: &Kv3Value) -> Option<bool> {
  Some(mask.get("m_secondaryWeightLists")?.as_array()?.is_empty())
}

fn matching_metadata(old: &Kv3Value, current: &Kv3Value, excluded: &[&str]) -> Option<bool> {
  Some(old.as_object()?.iter().all(|(name, value)| {
    excluded.contains(&name.as_str())
      || current
        .get(name)
        .is_some_and(|current| runtime_values_equal(value, current))
  }))
}

fn copy_weights(
  source: &Kv3Value,
  source_encoding: &Kv3Encoding,
  target: &mut Kv3Value,
  target_encoding: &mut Kv3Encoding,
  old_bones: &BTreeSet<String>,
  current_bones: &BTreeSet<String>,
  inherit_new: bool,
) -> Option<()> {
  let source_weights = source.get("m_primaryWeightList")?;
  let source_weights_encoding = source_encoding.get("m_primaryWeightList")?;
  let mut names = Vec::new();
  let mut weights = Vec::new();
  let mut name_encodings = Vec::new();
  let mut weight_encodings = Vec::new();
  let mut seen = BTreeSet::new();
  let mut append = |value: &Kv3Value, encoding: &Kv3Encoding, new_only: bool| -> Option<()> {
    let bone_names = value.get("m_boneIDs")?.as_array()?;
    let bone_weights = value.get("m_weights")?.as_array()?;
    let bone_name_encodings = encoding.get("m_boneIDs")?.as_array()?;
    let bone_weight_encodings = encoding.get("m_weights")?.as_array()?;
    if bone_names.len() != bone_weights.len()
      || bone_names.len() != bone_name_encodings.len()
      || bone_names.len() != bone_weight_encodings.len()
    {
      return None;
    }
    for (index, name) in bone_names.iter().enumerate() {
      let name = name.as_str()?;
      if !bone_weights[index].as_f64()?.is_finite() {
        return None;
      }
      if !current_bones.contains(name) || (new_only && old_bones.contains(name)) {
        continue;
      }
      if !seen.insert(name.to_owned()) {
        return None;
      }
      names.push(bone_names[index].clone());
      weights.push(bone_weights[index].clone());
      name_encodings.push(bone_name_encodings[index].clone());
      weight_encodings.push(bone_weight_encodings[index].clone());
    }
    Some(())
  };
  append(source_weights, source_weights_encoding, false)?;
  if inherit_new {
    append(
      target.get("m_primaryWeightList")?,
      target_encoding.get("m_primaryWeightList")?,
      true,
    )?;
  }
  let Kv3Value::Object(fields) = target.get_mut("m_primaryWeightList")? else {
    return None;
  };
  object_set_case_insensitive(fields, "m_boneIDs", Kv3Value::Array(names));
  object_set_case_insensitive(fields, "m_weights", Kv3Value::Array(weights));
  let encoding = target_encoding.get_mut("m_primaryWeightList")?;
  encoding.get_mut("m_boneIDs")?.children = kv3::EncodingChildren::Array(name_encodings);
  encoding.get_mut("m_weights")?.children = kv3::EncodingChildren::Array(weight_encodings);
  Some(())
}
