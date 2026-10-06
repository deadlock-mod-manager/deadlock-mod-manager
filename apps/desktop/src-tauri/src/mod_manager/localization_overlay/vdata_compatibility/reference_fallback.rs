//! Unavailable non-inheritance references cannot be made executable by retaining
//! a stale name. Existing definitions may restore the installed game's contract;
//! new definitions and unverified dependency chains still require author review.
use super::*;

pub(super) fn unavailable_new_hero(
  table: &CompiledDataTable,
  merged: &MergedCompiledData,
  name: &str,
  reference: &Reference,
) -> bool {
  row(&table.base_root, name).is_none()
    && table.file_path == HEROES_VDATA_PATH
    && !reference.inheritance
    && reference.table == ABILITIES_PATH
    && matches!(reference.path.first(), Some(Kv3Seg::Key(key)) if key == "m_mapBoundAbilities")
    && row(&merged.root, name)
      .and_then(|value| value.get("_class"))
      .and_then(Kv3Value::as_str)
      == Some("CitadelHeroData_t")
    // Never introduce a dangling inheritance edge by removing a shared template.
    && merged.root.as_object().is_some_and(|rows| rows.iter().all(|(other, value)| {
      other.eq_ignore_ascii_case(name)
        || references(value, HEROES_VDATA_PATH).iter().all(|reference| {
          reference.table != HEROES_VDATA_PATH || !reference.row.eq_ignore_ascii_case(name)
        })
    }))
}

pub(super) fn omit(merged: &mut MergedCompiledData, name: &str) {
  if let Kv3Value::Object(rows) = &mut merged.root {
    rows.retain(|(key, _)| !key.eq_ignore_ascii_case(name));
  }
  if let Some(rows) = merged.encoding.as_object_mut() {
    rows.retain(|(key, _)| !key.eq_ignore_ascii_case(name));
  }
  merged.applied_rows.remove(&name.to_ascii_lowercase());
  merged.origins.remove(&name.to_ascii_lowercase());
}

pub(super) fn restore(
  table: &CompiledDataTable,
  merged: &mut MergedCompiledData,
  name: &str,
  reference: &Reference,
) -> Result<bool, Error> {
  if reference.inheritance {
    return Ok(false);
  }
  let Some(current) = row(&table.base_root, name) else {
    return Ok(false);
  };
  let Some(authored) = row(&merged.root, name) else {
    return Ok(false);
  };
  let class = current.get("_class").and_then(Kv3Value::as_str);
  if class.is_none() || class != authored.get("_class").and_then(Kv3Value::as_str) {
    return Ok(false);
  }
  // Scope this migration to the known hero ability-binding contract. A missing
  // authored ability trigger can change behavior in ways this rule cannot prove.
  if table.file_path != HEROES_VDATA_PATH
    || class != Some("CitadelHeroData_t")
    || !matches!(reference.path.first(), Some(Kv3Seg::Key(key)) if key == "m_mapBoundAbilities")
    || reference.table != ABILITIES_PATH
  {
    return Ok(false);
  }
  let Some(authored_encoding) = merged.encoding.get(name) else {
    return Ok(false);
  };
  let Some(current_encoding) = table.base_encoding.get(name) else {
    return Ok(false);
  };
  let mut value = authored.clone();
  let mut encoding = authored_encoding.clone();
  if let Some(replacement) = compiled_value_at_path(current, &reference.path) {
    // Reference leaves are strings. Decline a schema-changing container edit.
    if replacement.as_str().is_none() {
      return Ok(false);
    }
    let Some(replacement_encoding) = compiled_encoding_at_path(current_encoding, &reference.path)
    else {
      return Ok(false);
    };
    set_compiled_value_at_path(&mut value, &reference.path, replacement.clone())?;
    set_compiled_encoding_at_path(&mut encoding, &reference.path, replacement_encoding.clone())?;
  } else if !remove_optional_slot(&mut value, &mut encoding, &reference.path) {
    return Ok(false);
  }
  let Kv3Value::Object(rows) = &mut merged.root else {
    unreachable!("merged root is an object");
  };
  object_set_case_insensitive(rows, name, value);
  encoding_set_case_insensitive(
    merged
      .encoding
      .as_object_mut()
      .expect("merged encoding is an object"),
    name,
    encoding,
  );
  Ok(true)
}

fn remove_optional_slot(value: &mut Kv3Value, encoding: &mut Kv3Encoding, path: &[Kv3Seg]) -> bool {
  // Only an obsolete direct map entry may be removed. Never shift array indices
  // or erase nested metadata merely because a current parent field is absent.
  let [Kv3Seg::Key(map), Kv3Seg::Key(slot)] = path else {
    return false;
  };
  let Some(Kv3Value::Object(values)) = value.get_mut(map) else {
    return false;
  };
  let Some(encodings) = encoding.get_mut(map).and_then(Kv3Encoding::as_object_mut) else {
    return false;
  };
  let Some(index) = values.iter().position(|(name, _)| name == slot) else {
    return false;
  };
  let Some(encoded_index) = encodings.iter().position(|(name, _)| name == slot) else {
    return false;
  };
  if values[index].1.as_str().is_none() {
    return false;
  }
  values.remove(index);
  encodings.remove(encoded_index);
  true
}
