use super::*;
use vpkmanager::source2::kv3::Value;

/// A current material is evidence of an interface, not a complete shader schema.
/// Feature differences may be intentional; never replace authored parameters here.
pub(super) fn differences(source: &Value, current: &Value) -> Result<Vec<String>, String> {
  let shader = |value: &Value| {
    value
      .get("m_shaderName")
      .and_then(Value::as_str)
      .filter(|name| !name.is_empty())
      .map(str::to_owned)
      .ok_or_else(|| "Missing or invalid material shader name".to_owned())
  };
  let source_shader = shader(source)?;
  let current_shader = shader(current)?;
  if source_shader != current_shader {
    return Ok(vec![format!(
      "Authored shader {source_shader} differs from current reference {current_shader}; parameter correspondence is unverified"
    )]);
  }
  let textures = |value| named(value, "m_textureParams", "m_pValue", false);
  let source_textures = textures(source)?;
  let current_textures = textures(current)?;
  let source_features = named(source, "m_intParams", "m_nValue", true)?;
  let current_features = named(current, "m_intParams", "m_nValue", true)?;
  let mut details = Vec::new();
  let same_features = source_features
    .keys()
    .chain(current_features.keys())
    .all(|name| {
      let source = source_features
        .get(name)
        .and_then(|value| value.as_int())
        .unwrap_or(0);
      let current = current_features
        .get(name)
        .and_then(|value| value.as_int())
        .unwrap_or(0);
      source == current
    });
  if same_features {
    for name in current_textures.keys() {
      if !source_textures.contains_key(name) {
        details.push(format!(
          "Current reference texture slot is absent: m_textureParams.{name}; enabled shader features match, but a replacement requires additional evidence"
        ));
      }
    }
  }
  for (name, value) in source_features {
    if value.as_int().is_some_and(|value| value != 0) && current_features.get(&name) != Some(&value)
    {
      details.push(format!(
        "Authored shader feature differs: m_intParams.{name}; current reference does not enable the same value. This may be intentional; its texture requirements are unverified"
      ));
    }
  }
  Ok(details)
}

fn named<'a>(
  material: &'a Value,
  table: &str,
  value_key: &str,
  features_only: bool,
) -> Result<BTreeMap<String, &'a Value>, String> {
  let entries = material
    .get(table)
    .and_then(Value::as_array)
    .ok_or_else(|| format!("Missing or invalid parameter table: {table}"))?;
  let mut result = BTreeMap::new();
  let mut names = BTreeSet::new();
  for entry in entries {
    let name = entry
      .get("m_name")
      .and_then(Value::as_str)
      .filter(|name| !name.is_empty())
      .ok_or_else(|| format!("Invalid parameter name in {table}"))?;
    if !names.insert(name) {
      return Err(format!("Duplicate material parameter: {table}.{name}"));
    }
    let value = entry
      .get(value_key)
      .ok_or_else(|| format!("Missing parameter value: {table}.{name}.{value_key}"))?;
    if (features_only && value.as_int().is_none())
      || (!features_only && value.as_str().is_none_or(str::is_empty))
    {
      return Err(format!(
        "Invalid parameter value: {table}.{name}.{value_key}"
      ));
    }
    if !features_only || name.starts_with("F_") {
      result.insert(name.to_owned(), value);
    }
  }
  Ok(result)
}
