use super::*;
use crate::mod_manager::vdata_history::VdataBaselineMatch;

/// A copied hero inherits current donor data; only its authored deltas are replayed.
/// The donor must be the unique closest unchanged historical row with the same model and class.
pub(super) struct HeroRebaser<'a> {
  current_rows: &'a [(String, Kv3Value)],
  current_encodings: &'a [(String, Kv3Encoding)],
  source_rows: &'a [(String, Kv3Value)],
  baseline: Option<&'a VdataBaselineMatch>,
}

impl<'a> HeroRebaser<'a> {
  pub(super) fn new(
    current_rows: &'a [(String, Kv3Value)],
    current_encodings: &'a [(String, Kv3Encoding)],
    source_rows: &'a [(String, Kv3Value)],
    baseline: Option<&'a VdataBaselineMatch>,
  ) -> Self {
    Self {
      current_rows,
      current_encodings,
      source_rows,
      baseline,
    }
  }

  pub(super) fn rebase(
    &self,
    hero: &Kv3Value,
    encoding: &Kv3Encoding,
  ) -> Result<Option<(Kv3Value, Kv3Encoding)>, Error> {
    let Some(baseline) = self.baseline else {
      return Ok(None);
    };
    let Some(class) = hero.get("_class").and_then(Kv3Value::as_str) else {
      return Ok(None);
    };
    if class != "CitadelHeroData_t" {
      return Ok(None);
    }
    let Some(model) = hero.get("m_strModelName").and_then(Kv3Value::as_str) else {
      return Ok(None);
    };
    let donors = self.source_rows.iter().filter(|(name, row)| {
      row.get("_class").and_then(Kv3Value::as_str) == Some(class)
        && row.get("m_strModelName").and_then(Kv3Value::as_str) == Some(model)
        && baseline.row_matches(name, row)
        && object_get_case_insensitive(self.current_rows, name).is_some()
    });
    let mut best = None;
    let mut best_score = usize::MAX;
    let mut tied = false;
    for (name, donor) in donors {
      let mut patches = Vec::new();
      collect_compiled_patches(donor, hero, encoding, &mut Vec::new(), &mut patches)?;
      if patches.len() < best_score {
        best_score = patches.len();
        best = Some((name, patches));
        tied = false;
      } else if patches.len() == best_score {
        tied = true;
      }
    }
    let Some((donor_name, patches)) = best else {
      return Ok(None);
    };
    // Model reuse is common in development heroes. Equal distances remain ambiguous.
    if tied {
      return Ok(None);
    }
    let current_donor = object_get_case_insensitive(self.current_rows, donor_name)
      .expect("donor presence was checked");
    let current_encoding = encoding_get_case_insensitive(self.current_encodings, donor_name)
      .ok_or_else(|| {
        Error::ModInvalid(format!("Missing current hero encoding for {donor_name}"))
      })?;
    let mut rebased = current_donor.clone();
    let mut rebased_encoding = current_encoding.clone();
    for patch in patches {
      let (path, value, encoding) = promote_patch_to_applicable_ancestor(
        current_donor,
        current_encoding,
        hero,
        encoding,
        patch,
      )?;
      if path.is_empty() {
        rebased = value;
        rebased_encoding = encoding;
      } else {
        set_compiled_value_at_path(&mut rebased, &path, value)?;
        set_compiled_encoding_at_path(&mut rebased_encoding, &path, encoding)?;
      }
    }
    Ok(Some((rebased, rebased_encoding)))
  }

  pub(super) fn restore_development_state(
    &self,
    hero: &mut Kv3Value,
    encoding: &mut Kv3Encoding,
  ) -> Result<(), Error> {
    const FIELD: &str = "m_eHeroDevelopmentState";
    if hero.get(FIELD).is_some()
      || hero.get("_class").and_then(Kv3Value::as_str) != Some("CitadelHeroData_t")
      || hero.get("m_bDisabled").and_then(Kv3Value::as_bool) != Some(false)
      || hero.get("m_bInDevelopment").and_then(Kv3Value::as_bool) != Some(false)
    {
      return Ok(());
    }
    let Some(model) = hero.get("m_strModelName").and_then(Kv3Value::as_str) else {
      return Ok(());
    };
    if model.is_empty() {
      return Ok(());
    }
    let mut state = None;
    for (name, donor) in self.current_rows {
      if donor.get("_class") != hero.get("_class")
        || donor.get("m_bDisabled") != hero.get("m_bDisabled")
        || donor.get("m_bInDevelopment") != hero.get("m_bInDevelopment")
        || !donor
          .get("m_strModelName")
          .and_then(Kv3Value::as_str)
          .is_some_and(|path| normalize_path(path) == normalize_path(model))
      {
        continue;
      }
      let Some(value) = donor.get(FIELD).filter(|value| value.as_str().is_some()) else {
        continue;
      };
      let Some(wire_encoding) =
        encoding_get_case_insensitive(self.current_encodings, name).and_then(|row| row.get(FIELD))
      else {
        return Ok(());
      };
      // Shared models are safe only when every matching donor agrees on the field and type.
      if state
        .is_some_and(|(known, known_encoding)| known != value || known_encoding != wire_encoding)
      {
        return Ok(());
      }
      state = Some((value, wire_encoding));
    }
    let Some((value, wire_encoding)) = state else {
      return Ok(());
    };
    let Kv3Value::Object(fields) = hero else {
      unreachable!("hero class was checked");
    };
    let fields_encoding = encoding
      .as_object_mut()
      .ok_or_else(|| Error::ModInvalid("Custom hero has no object encoding metadata".into()))?;
    object_set_case_insensitive(fields, FIELD, value.clone());
    encoding_set_case_insensitive(fields_encoding, FIELD, wire_encoding.clone());
    Ok(())
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn hero(state: Option<&str>) -> Kv3Value {
    let mut fields = vec![
      (
        "_class".into(),
        Kv3Value::String("CitadelHeroData_t".into()),
      ),
      (
        "m_strModelName".into(),
        Kv3Value::String("models/template.vmdl".into()),
      ),
      ("m_bDisabled".into(), Kv3Value::Bool(false)),
      ("m_bInDevelopment".into(), Kv3Value::Bool(false)),
    ];
    if let Some(state) = state {
      fields.push((
        "m_eHeroDevelopmentState".into(),
        Kv3Value::String(state.into()),
      ));
    }
    Kv3Value::Object(fields)
  }

  fn restore(current: Vec<(String, Kv3Value)>, source: &Kv3Value) -> (Kv3Value, Kv3Encoding) {
    let format = kv3::Format([0; 16]);
    let (current, current_encoding) =
      kv3::decode_preserving(&kv3::encode(&Kv3Value::Object(current), &format)).unwrap();
    let (mut restored, mut restored_encoding) =
      kv3::decode_preserving(&kv3::encode(source, &format)).unwrap();
    HeroRebaser::new(
      current.as_object().unwrap(),
      current_encoding.as_object().unwrap(),
      &[],
      None,
    )
    .restore_development_state(&mut restored, &mut restored_encoding)
    .unwrap();
    (restored, restored_encoding)
  }

  #[test]
  fn visibility_migration_requires_agreement_and_preserves_author_choices() {
    let donor = hero(Some("EHeroDevState_Release"));
    let source = hero(None);
    let current = vec![("hero_template".into(), donor.clone())];
    let explicit = hero(Some("EHeroDevState_DebugOnly"));
    assert_eq!(restore(current.clone(), &explicit).0, explicit);

    for (field, value) in [
      ("m_bDisabled", Kv3Value::Bool(true)),
      ("m_bInDevelopment", Kv3Value::Bool(true)),
      ("_class", Kv3Value::String("OtherHeroData_t".into())),
      (
        "m_strModelName",
        Kv3Value::String("models/another.vmdl".into()),
      ),
    ] {
      let mut authored = source.clone();
      *authored.get_mut(field).unwrap() = value;
      assert_eq!(restore(current.clone(), &authored).0, authored, "{field}");
    }

    let ambiguous = vec![
      ("hero_template".into(), donor.clone()),
      ("hero_other".into(), hero(Some("EHeroDevState_PreRelease"))),
    ];
    assert_eq!(restore(ambiguous, &source).0, source);
    assert_eq!(
      restore(vec![("hero_old".into(), hero(None))], &source).0,
      source
    );

    let agreed = vec![
      ("hero_template".into(), donor.clone()),
      ("hero_other".into(), donor.clone()),
    ];
    let (restored, encoding) = restore(agreed, &source);
    assert_eq!(restored, donor);
    let (_, donor_encoding) =
      kv3::decode_preserving(&kv3::encode(&donor, &kv3::Format([0; 16]))).unwrap();
    assert_eq!(
      encoding.get("m_eHeroDevelopmentState"),
      donor_encoding.get("m_eHeroDevelopmentState")
    );
  }
}
