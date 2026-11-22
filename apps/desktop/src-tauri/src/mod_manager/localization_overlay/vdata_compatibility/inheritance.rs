use super::*;
use crate::mod_manager::vdata_history::VdataBaselineMatch;

type Rows<'a> = (&'a [(String, Kv3Value)], &'a [(String, Kv3Encoding)]);

pub(in super::super) enum InheritedRebase {
  NotApplicable,
  Ambiguous,
  Rebased(Kv3Value, Kv3Encoding),
}

pub(in super::super) fn rebase_inherited(
  candidate: (&Kv3Value, &Kv3Encoding),
  current: Rows<'_>,
  source: Rows<'_>,
  baseline: &VdataBaselineMatch,
  enums: &enum_compatibility::EnumCompatibility,
) -> Result<InheritedRebase, Error> {
  let (value, encoding) = candidate;
  let Some(class) = value.get("_class").and_then(Kv3Value::as_str) else {
    return Ok(InheritedRebase::NotApplicable);
  };
  let parents: BTreeSet<_> = references(value, ABILITIES_PATH)
    .into_iter()
    .filter(|reference| reference.inheritance && reference.path.len() <= 2
      && matches!(reference.path.first(), Some(Kv3Seg::Key(name)) if name == "_base" || name == "_multibase"))
    .map(|reference| reference.row.to_ascii_lowercase())
    .collect();
  let mut donor = None;
  for name in parents {
    let Some(old) = object_get_case_insensitive(source.0, &name) else {
      continue;
    };
    let Some(new) = object_get_case_insensitive(current.0, &name) else {
      continue;
    };
    if old.get("_class").and_then(Kv3Value::as_str) != Some(class)
      || new.get("_class").and_then(Kv3Value::as_str) != Some(class)
      || !baseline.row_matches(&name, old)
    {
      continue;
    }
    // Multiple same-class parents have uncertain precedence in flattened data.
    if donor.is_some() {
      return Ok(InheritedRebase::Ambiguous);
    }
    let Some(old_encoding) = encoding_get_case_insensitive(source.1, &name) else {
      return Ok(InheritedRebase::NotApplicable);
    };
    let Some(new_encoding) = encoding_get_case_insensitive(current.1, &name) else {
      return Ok(InheritedRebase::NotApplicable);
    };
    donor = Some((old, old_encoding, new, new_encoding));
  }
  let Some((old, old_encoding, new, new_encoding)) = donor else {
    return Ok(InheritedRebase::NotApplicable);
  };
  let mut old = old.clone();
  let mut old_encoding = old_encoding.clone();
  enums.normalize(&mut old, &mut old_encoding)?;
  let mut patches = Vec::new();
  collect_compiled_patches(&old, value, encoding, &mut Vec::new(), &mut patches)?;
  let mut rebased = new.clone();
  let mut rebased_encoding = new_encoding.clone();
  for patch in patches {
    let (path, value, encoding) =
      promote_patch_to_applicable_ancestor(new, new_encoding, value, encoding, patch)?;
    if path.is_empty() {
      return Ok(InheritedRebase::NotApplicable);
    }
    set_compiled_value_at_path(&mut rebased, &path, value)?;
    set_compiled_encoding_at_path(&mut rebased_encoding, &path, encoding)?;
  }
  Ok(InheritedRebase::Rebased(rebased, rebased_encoding))
}
