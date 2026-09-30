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
}
