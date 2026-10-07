use super::*;

#[derive(Clone, PartialEq)]
struct EnumReplacement {
  value: String,
  encoding: Kv3Encoding,
}

/// Only aliases demonstrated by matching old/current vanilla fields are migrated.
/// No prefix is removed from arbitrary strings or unrecognized enum values.
pub(super) struct EnumCompatibility {
  aliases: BTreeMap<(String, String), Option<EnumReplacement>>,
}

impl EnumCompatibility {
  pub(super) fn learn(
    current_rows: &[(String, Kv3Value)],
    current_encodings: &[(String, Kv3Encoding)],
    source_rows: &[(String, Kv3Value)],
  ) -> Self {
    let mut compatibility = Self {
      aliases: BTreeMap::new(),
    };
    for (name, source) in source_rows {
      if let Some(current) = object_get_case_insensitive(current_rows, name)
        && let Some(encoding) = encoding_get_case_insensitive(current_encodings, name)
      {
        compatibility.compare(current, encoding, source, "");
      }
    }
    compatibility
  }

  fn compare(
    &mut self,
    current: &Kv3Value,
    encoding: &Kv3Encoding,
    source: &Kv3Value,
    field: &str,
  ) {
    match (current, source) {
      (Kv3Value::Object(current_fields), Kv3Value::Object(source_fields)) => {
        let Some(encodings) = encoding.as_object() else {
          return;
        };
        for (name, source) in source_fields {
          if name.eq_ignore_ascii_case("_editor") {
            continue;
          }
          if let Some(current) = object_get_case_insensitive(current_fields, name)
            && let Some(encoding) = encoding_get_case_insensitive(encodings, name)
          {
            self.compare(current, encoding, source, name);
          }
        }
      }
      (Kv3Value::Array(current), Kv3Value::Array(source)) if current.len() == source.len() => {
        if let Some(encodings) = encoding.as_array() {
          for ((current, source), encoding) in current.iter().zip(source).zip(encodings) {
            self.compare(current, encoding, source, field);
          }
        }
      }
      (Kv3Value::String(current), Kv3Value::String(old))
        if field.starts_with("m_e") && !current.is_empty() =>
      {
        let Some(prefix) = old.strip_suffix(current) else {
          return;
        };
        if !prefix.starts_with('E')
          || !prefix.ends_with('_')
          || !prefix
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_')
        {
          return;
        }
        let replacement = EnumReplacement {
          value: current.clone(),
          encoding: encoding.clone(),
        };
        self
          .aliases
          .entry((field.to_ascii_lowercase(), old.clone()))
          .and_modify(|known| {
            if known.as_ref() != Some(&replacement) {
              *known = None;
            }
          })
          .or_insert(Some(replacement));
      }
      _ => {}
    }
  }

  pub(super) fn normalize(
    &self,
    value: &mut Kv3Value,
    encoding: &mut Kv3Encoding,
  ) -> Result<usize, Error> {
    if self.aliases.is_empty() {
      return Ok(0);
    }
    self.normalize_field(value, encoding, "")
  }

  fn normalize_field(
    &self,
    value: &mut Kv3Value,
    encoding: &mut Kv3Encoding,
    field: &str,
  ) -> Result<usize, Error> {
    match value {
      Kv3Value::Object(fields) => {
        let encodings = encoding.as_object_mut().ok_or_else(|| {
          Error::ModInvalid("Object lacks enum migration encoding metadata".into())
        })?;
        let mut count = 0;
        for (name, child) in fields {
          if name.eq_ignore_ascii_case("_editor") {
            continue;
          }
          let child_encoding =
            encoding_get_case_insensitive_mut(encodings, name).ok_or_else(|| {
              Error::ModInvalid(format!("Missing enum migration encoding for {name}"))
            })?;
          count += self.normalize_field(child, child_encoding, name)?;
        }
        Ok(count)
      }
      Kv3Value::Array(values) => {
        let encodings = encoding.as_array_mut().ok_or_else(|| {
          Error::ModInvalid("Array lacks enum migration encoding metadata".into())
        })?;
        let mut count = 0;
        for (child, encoding) in values.iter_mut().zip(encodings) {
          count += self.normalize_field(child, encoding, field)?;
        }
        Ok(count)
      }
      Kv3Value::String(old) => {
        if let Some(Some(replacement)) =
          self.aliases.get(&(field.to_ascii_lowercase(), old.clone()))
        {
          *old = replacement.value.clone();
          *encoding = replacement.encoding.clone();
          Ok(1)
        } else {
          Ok(0)
        }
      }
      _ => Ok(0),
    }
  }
}
