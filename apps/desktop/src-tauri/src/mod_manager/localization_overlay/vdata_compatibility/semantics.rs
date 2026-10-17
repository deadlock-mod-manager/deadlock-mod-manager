use super::{ABILITIES_PATH, BTreeSet, Kv3Seg, Kv3Value};

#[derive(Clone)]
pub(super) struct Reference {
  pub(super) path: Vec<Kv3Seg>,
  pub(super) table: String,
  pub(super) row: String,
  pub(super) inheritance: bool,
}

// These are VData references. Native `_class` names, resource paths and CSS classes
// have different lookup rules and must not be treated as table rows.
pub(super) fn references(value: &Kv3Value, file: &str) -> Vec<Reference> {
  fn walk(value: &Kv3Value, file: &str, path: &mut Vec<Kv3Seg>, out: &mut Vec<Reference>) {
    match value {
      Kv3Value::Object(fields) => {
        for (field, child) in fields {
          if field.eq_ignore_ascii_case("_editor") {
            continue;
          }
          path.push(Kv3Seg::Key(field.clone()));
          let inheritance = matches!(field.as_str(), "_base" | "_multibase");
          let target = if inheritance {
            Some(file)
          } else if field == "m_mapBoundAbilities"
            || (file == ABILITIES_PATH
              && matches!(
                field.as_str(),
                "m_AbilityToTrigger"
                  | "m_NewWeaponAbility"
                  | "m_StartingWeaponAbility"
                  | "m_strBaseSlideAbility"
                  | "m_strViperSlideAbility"
              ))
          {
            Some(ABILITIES_PATH)
          } else {
            None
          };
          if let Some(target) = target {
            collect(child, target, inheritance, path, out);
          } else {
            walk(child, file, path, out);
          }
          path.pop();
        }
      }
      Kv3Value::Array(values) => {
        for (index, child) in values.iter().enumerate() {
          path.push(Kv3Seg::Index(index));
          walk(child, file, path, out);
          path.pop();
        }
      }
      _ => {}
    }
  }
  fn collect(
    value: &Kv3Value,
    table: &str,
    inheritance: bool,
    path: &mut Vec<Kv3Seg>,
    out: &mut Vec<Reference>,
  ) {
    match value {
      Kv3Value::String(row) if !row.is_empty() => out.push(Reference {
        path: path.clone(),
        table: table.into(),
        row: row.clone(),
        inheritance,
      }),
      Kv3Value::Object(fields) => {
        for (name, child) in fields {
          path.push(Kv3Seg::Key(name.clone()));
          collect(child, table, inheritance, path, out);
          path.pop();
        }
      }
      Kv3Value::Array(values) => {
        for (index, child) in values.iter().enumerate() {
          path.push(Kv3Seg::Index(index));
          collect(child, table, inheritance, path, out);
          path.pop();
        }
      }
      _ => {}
    }
  }
  let mut out = Vec::new();
  walk(value, file, &mut Vec::new(), &mut out);
  out
}

pub(super) fn known_class_and_enums(value: &Kv3Value, current: &Kv3Value) -> bool {
  unsupported_definition(value, current).is_none()
}

pub(super) fn known_native_class(value: &Kv3Value, current: &Kv3Value) -> bool {
  value
    .get("_class")
    .and_then(Kv3Value::as_str)
    .is_some_and(|class| {
      current.as_object().is_some_and(|rows| {
        rows
          .iter()
          .any(|(_, row)| row.get("_class").and_then(Kv3Value::as_str) == Some(class))
      })
    })
}

pub(super) fn unsupported_definition(value: &Kv3Value, current: &Kv3Value) -> Option<String> {
  let Some(class) = value.get("_class").and_then(Kv3Value::as_str) else {
    return Some("_class".into());
  };
  if !current.as_object().is_some_and(|rows| {
    rows
      .iter()
      .any(|(_, current)| current.get("_class").and_then(Kv3Value::as_str) == Some(class))
  }) {
    return Some(format!("_class={class}"));
  }
  fn enums(value: &Kv3Value, path: &mut Vec<String>, out: &mut BTreeSet<(Vec<String>, String)>) {
    match value {
      Kv3Value::Object(fields) => {
        for (name, value) in fields {
          if name.eq_ignore_ascii_case("_editor") {
            continue;
          }
          path.push(name.clone());
          if name
            .strip_prefix("m_e")
            .is_some_and(|tail| tail.starts_with(|c: char| c.is_ascii_uppercase()))
            && let Some(value) = value.as_str()
          {
            for item in value.split('|').map(str::trim).filter(|s| !s.is_empty()) {
              out.insert((path.clone(), item.into()));
            }
          }
          enums(value, path, out);
          path.pop();
        }
      }
      Kv3Value::Array(values) => {
        path.push("[]".into());
        for value in values {
          enums(value, path, out);
        }
        path.pop();
      }
      _ => {}
    }
  }
  let mut authored = BTreeSet::new();
  let mut known = BTreeSet::new();
  enums(value, &mut Vec::new(), &mut authored);
  for (_, current) in current.as_object().expect("base root is an object") {
    enums(current, &mut Vec::new(), &mut known);
  }
  authored
    .difference(&known)
    .next()
    .map(|(path, value)| format!("{}={value}", path.join(".")))
}
