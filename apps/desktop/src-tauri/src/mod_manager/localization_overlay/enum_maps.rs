use super::*;

const FIELD: &str = "m_mapStandardLevelUpUpgrades";
const CLASS: &str = "CitadelHeroData_t";

/// This native map uses modifier enum keys, unlike open ability or string maps.
/// The installed table supplies the observed domain across all heroes.
pub(super) struct EnumMapCompatibility {
  keys: BTreeSet<String>,
}

impl EnumMapCompatibility {
  pub(super) fn learn(rows: &[(String, Kv3Value)]) -> Self {
    Self {
      keys: rows
        .iter()
        .filter(|(_, row)| row.get("_class").and_then(Kv3Value::as_str) == Some(CLASS))
        .flat_map(|(_, row)| row.get(FIELD).and_then(Kv3Value::as_object))
        .flatten()
        .map(|(key, _)| key.clone())
        .collect(),
    }
  }

  pub(super) fn normalize(
    &self,
    value: &mut Kv3Value,
    encoding: &mut Kv3Encoding,
  ) -> Result<Vec<String>, Error> {
    if self.keys.is_empty() || value.get("_class").and_then(Kv3Value::as_str) != Some(CLASS) {
      return Ok(Vec::new());
    }
    let Some(Kv3Value::Object(fields)) = value.get_mut(FIELD) else {
      return Ok(Vec::new());
    };
    let removed: Vec<_> = fields
      .iter()
      .filter(|(key, _)| !self.keys.contains(key))
      .map(|(key, _)| key.clone())
      .collect();
    if removed.is_empty() {
      return Ok(removed);
    }
    let encodings = encoding
      .get_mut(FIELD)
      .and_then(Kv3Encoding::as_object_mut)
      .ok_or_else(|| Error::ModInvalid("Enum map lacks object encoding metadata".into()))?;
    fields.retain(|(key, _)| self.keys.contains(key));
    encodings.retain(|(key, _)| self.keys.contains(key));
    Ok(removed)
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn exported_hero_maps_exclude_retired_keys_and_preserve_supported_edits() {
    let hero = |entries: Vec<(&str, f64)>| {
      Kv3Value::Object(vec![
        ("_class".into(), Kv3Value::String(CLASS.into())),
        (
          FIELD.into(),
          Kv3Value::Object(
            entries
              .into_iter()
              .map(|(key, value)| (key.into(), Kv3Value::Double(value)))
              .collect(),
          ),
        ),
        (
          "m_strModelName".into(),
          Kv3Value::String("models/custom.vmdl".into()),
        ),
      ])
    };
    let table = build_compiled_table(
      HEROES_VDATA_PATH,
      super::super::tests::compiled_resource(vec![
        (
          "hero_one".into(),
          hero(vec![("MODIFIER_VALUE_HEALTH", 10.0)]),
        ),
        (
          "hero_two".into(),
          hero(vec![("MODIFIER_VALUE_SPIRIT", 2.0)]),
        ),
      ]),
      vec![CompiledDataSource {
        mod_id: "skin".into(),
        source_vpk: "skin.vpk".into(),
        priority: 0,
        bytes: super::super::tests::compiled_resource(vec![(
          "hero_one".into(),
          hero(vec![
            ("MODIFIER_VALUE_HEALTH", 20.0),
            ("MODIFIER_VALUE_SPIRIT", 3.0),
            ("MODIFIER_VALUE_RETIRED", 0.0),
            ("MODIFIER_VALUE_RETIRED_NONZERO", 0.625),
          ]),
        )]),
      }],
      None,
    )
    .unwrap();
    let output = TempDir::new().unwrap();
    table.write_to_directory(output.path(), &[]).unwrap();
    let bytes = fs::read(output.path().join(HEROES_VDATA_PATH)).unwrap();
    let (_, root, encoding) = decode_compiled_data(&bytes, "enum map regression").unwrap();
    let map = root.get("hero_one").unwrap().get(FIELD).unwrap();
    assert_eq!(table.row_repairs.len(), 2);
    assert_eq!(table.row_warnings.len(), 1);
    assert_eq!(
      root
        .get("hero_one")
        .unwrap()
        .get("m_strModelName")
        .and_then(Kv3Value::as_str),
      Some("models/custom.vmdl")
    );
    assert!(map.get("MODIFIER_VALUE_RETIRED").is_none());
    assert!(map.get("MODIFIER_VALUE_RETIRED_NONZERO").is_none());
    assert_eq!(
      map.get("MODIFIER_VALUE_HEALTH"),
      Some(&Kv3Value::Double(20.0))
    );
    assert_eq!(
      map.get("MODIFIER_VALUE_SPIRIT"),
      Some(&Kv3Value::Double(3.0))
    );
    assert_eq!(
      map.as_object().unwrap().len(),
      encoding
        .get("hero_one")
        .unwrap()
        .get(FIELD)
        .unwrap()
        .as_object()
        .unwrap()
        .len()
    );
  }

  #[test]
  fn missing_current_domain_and_other_classes_are_not_modified() {
    let format = kv3::Format([0; 16]);
    let value = Kv3Value::Object(vec![
      ("_class".into(), Kv3Value::String("OtherData_t".into())),
      (
        FIELD.into(),
        Kv3Value::Object(vec![("custom".into(), Kv3Value::Int(1))]),
      ),
      (
        "m_mapBoundAbilities".into(),
        Kv3Value::Object(vec![("custom".into(), Kv3Value::String("ability".into()))]),
      ),
    ]);
    let (mut value, mut encoding) = kv3::decode_preserving(&kv3::encode(&value, &format)).unwrap();
    let before = (value.clone(), encoding.clone());
    let compatibility = EnumMapCompatibility {
      keys: BTreeSet::from(["supported".into()]),
    };
    assert!(
      compatibility
        .normalize(&mut value, &mut encoding)
        .unwrap()
        .is_empty()
    );
    assert_eq!((value.clone(), encoding.clone()), before);
    *value.get_mut("_class").unwrap() = Kv3Value::String(CLASS.into());
    let before = (value.clone(), encoding.clone());
    assert!(
      EnumMapCompatibility::learn(&[])
        .normalize(&mut value, &mut encoding)
        .unwrap()
        .is_empty()
    );
    assert_eq!((value, encoding), before);
  }
}
