use super::*;

const FIELDS: &[&str] = &[
  "m_boneName",
  "m_nParent",
  "m_bonePosParent",
  "m_boneRotParent",
  "m_boneScaleParent",
  "m_boneSphere",
  "m_nFlag",
];

pub(super) fn missing_samples(old: &Kv3Value, skeleton: &Kv3Value) -> Option<Vec<String>> {
  let names = old.get("m_modelSkeleton")?.get("m_boneName")?.as_array()?;
  let existing = names
    .iter()
    .map(|name| Some(name.as_str()?.to_ascii_lowercase()))
    .collect::<Option<BTreeSet<_>>>()?;
  if existing.len() != names.len() {
    return None;
  }
  let mut missing = BTreeSet::new();
  for sample in skeleton.get("m_boneIDs")?.as_array()? {
    let name = sample.as_str()?;
    if !existing.contains(&name.to_ascii_lowercase()) {
      missing.insert(name.to_owned());
    }
  }
  Some(missing.into_iter().collect())
}

/// Append only absent NM samples that are identity leaves directly under a root.
/// Existing model indices and every mesh/remapping byte remain unchanged.
pub(super) fn prepare(
  old: &Kv3Value,
  old_encoding: &kv3::Encoding,
  current: &Kv3Value,
  current_encoding: &kv3::Encoding,
  skeleton: &Kv3Value,
) -> Option<(Kv3Value, kv3::Encoding)> {
  let rig = old.get("m_modelSkeleton")?;
  let names = rig.get("m_boneName")?.as_array()?;
  let indices: BTreeMap<_, _> = names
    .iter()
    .enumerate()
    .map(|(index, name)| Some((name.as_str()?.to_ascii_lowercase(), index)))
    .collect::<Option<_>>()?;
  if indices.len() != names.len() {
    return None;
  }
  let base = current.get("m_modelSkeleton")?;
  let base_names = base.get("m_boneName")?.as_array()?;
  let base_indices: BTreeMap<_, _> = base_names
    .iter()
    .enumerate()
    .map(|(index, name)| Some((name.as_str()?.to_ascii_lowercase(), index)))
    .collect::<Option<_>>()?;
  if base_indices.len() != base_names.len() {
    return None;
  }
  let mut additions = Vec::new();
  for sample in skeleton.get("m_boneIDs")?.as_array()? {
    let name = sample.as_str()?.to_ascii_lowercase();
    if indices.contains_key(&name) {
      continue;
    }
    let index = *base_indices.get(&name)?;
    let parent = usize::try_from(base.get("m_nParent")?.as_array()?.get(index)?.as_int()?).ok()?;
    let parent_name = base_names.get(parent)?.as_str()?.to_ascii_lowercase();
    let old_parent = *indices.get(&parent_name)?;
    if base.get("m_nParent")?.as_array()?.get(parent)?.as_int()? != -1
      || rig
        .get("m_nParent")?
        .as_array()?
        .get(old_parent)?
        .as_int()?
        != -1
      || base.get("m_boneSphere")?.as_array()?.get(index)?.as_f64()? != 0.0
      || base
        .get("m_nParent")?
        .as_array()?
        .iter()
        .any(|value| value.as_int() == i64::try_from(index).ok())
    {
      return None;
    }
    let model = ModelRig::parse(current)?;
    let actual_name = base_names.get(index)?.as_str()?;
    let identity = Kv3Value::Array(
      [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]
        .map(Kv3Value::Double)
        .to_vec(),
    );
    if equivalent_pose(&model.pose(actual_name)?, &identity) != Some(true) {
      return None;
    }
    additions.push((index, old_parent));
  }
  if additions.is_empty() {
    return Some((old.clone(), old_encoding.clone()));
  }
  if rig.as_object()?.len() != FIELDS.len()
    || base.as_object()?.len() != FIELDS.len()
    || !old.get("m_refMeshes")?.as_array()?.is_empty()
    || FIELDS.iter().any(|field| {
      rig
        .get(field)
        .and_then(Kv3Value::as_array)
        .is_none_or(|values| values.len() != names.len())
        || base
          .get(field)
          .and_then(Kv3Value::as_array)
          .is_none_or(|values| values.len() != base_names.len())
    })
  {
    return None;
  }
  let mut value = old.clone();
  let mut encoding = old_encoding.clone();
  for (index, parent) in additions {
    for field in FIELDS {
      let mut item = base.get(field)?.as_array()?.get(index)?.clone();
      if *field == "m_nParent" {
        item = match item {
          Kv3Value::Int(_) => Kv3Value::Int(i64::try_from(parent).ok()?),
          Kv3Value::UInt(_) => Kv3Value::UInt(u64::try_from(parent).ok()?),
          _ => return None,
        };
      }
      let Kv3Value::Array(values) = value.get_mut("m_modelSkeleton")?.get_mut(field)? else {
        return None;
      };
      let kv3::EncodingChildren::Array(encodings) = &mut encoding
        .get_mut("m_modelSkeleton")?
        .get_mut(field)?
        .children
      else {
        return None;
      };
      if values.len() != encodings.len() {
        return None;
      }
      values.push(item);
      encodings.push(
        current_encoding
          .get("m_modelSkeleton")?
          .get(field)?
          .as_array()?
          .get(index)?
          .clone(),
      );
    }
  }
  Some((value, encoding))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn missing_sample_evidence_uses_unambiguous_names_and_preserves_required_spelling() {
    let old = super::super::tests::model(&["Root", "Hand"], &[-1, 0]);
    let skeleton = Kv3Value::Object(vec![(
      "m_boneIDs".into(),
      Kv3Value::Array(
        ["root", "hand", "WeaponHand_L", "attachWorld"]
          .map(|name| Kv3Value::String(name.into()))
          .to_vec(),
      ),
    )]);
    assert_eq!(
      missing_samples(&old, &skeleton).unwrap(),
      vec!["WeaponHand_L", "attachWorld"]
    );
    let ambiguous = super::super::tests::model(&["Root", "root"], &[-1, 0]);
    assert!(missing_samples(&ambiguous, &skeleton).is_none());
  }

  fn model(names: &[&str], parents: &[i64]) -> Kv3Value {
    let mut value = super::super::tests::model(names, parents);
    let Kv3Value::Object(fields) = value.get_mut("m_modelSkeleton").unwrap() else {
      unreachable!()
    };
    fields.push((
      "m_boneSphere".into(),
      Kv3Value::Array(vec![Kv3Value::Double(0.0); names.len()]),
    ));
    fields.push((
      "m_nFlag".into(),
      Kv3Value::Array(vec![Kv3Value::Int(1); names.len()]),
    ));
    let Kv3Value::Object(fields) = &mut value else {
      unreachable!()
    };
    fields.push(("m_refMeshes".into(), Kv3Value::Array(Vec::new())));
    value
  }

  #[test]
  fn sampled_control_append_keeps_existing_indices_and_rejects_deformation_bones() {
    let format = kv3::Format([0; 16]);
    let old = model(&["custom", "root", "head"], &[2, -1, 1]);
    let (old, old_encoding) = kv3::decode_preserving(&kv3::encode(&old, &format)).unwrap();
    let current = model(&["root", "head", "control"], &[-1, 0, 0]);
    let (current, current_encoding) =
      kv3::decode_preserving(&kv3::encode(&current, &format)).unwrap();
    let skeleton = Kv3Value::Object(vec![(
      "m_boneIDs".into(),
      super::super::tests::strings(&["head", "control"]),
    )]);
    let (restored, encoding) =
      prepare(&old, &old_encoding, &current, &current_encoding, &skeleton).unwrap();
    for field in FIELDS {
      let original = old
        .get("m_modelSkeleton")
        .unwrap()
        .get(field)
        .unwrap()
        .as_array()
        .unwrap();
      let updated = restored
        .get("m_modelSkeleton")
        .unwrap()
        .get(field)
        .unwrap()
        .as_array()
        .unwrap();
      assert_eq!(&updated[..original.len()], original);
      assert_eq!(updated.len(), original.len() + 1);
    }
    assert_eq!(
      restored
        .get("m_modelSkeleton")
        .unwrap()
        .get("m_nParent")
        .unwrap()
        .as_array()
        .unwrap()[3],
      Kv3Value::Int(1)
    );
    let bytes = kv3::encode_preserving(&restored, &encoding, &format).unwrap();
    let (decoded, actual_encoding) = kv3::decode_preserving(&bytes).unwrap();
    assert!(runtime_values_equal(&restored, &decoded));
    assert!(kv3::encoding_preserved(
      &restored,
      &encoding,
      &actual_encoding
    ));
    for (field, replacement) in [
      ("m_boneSphere", Kv3Value::Double(2.0)),
      ("m_nParent", Kv3Value::Int(1)),
    ] {
      let mut invalid = current.clone();
      let Kv3Value::Array(values) = invalid
        .get_mut("m_modelSkeleton")
        .unwrap()
        .get_mut(field)
        .unwrap()
      else {
        unreachable!()
      };
      values[2] = replacement;
      assert!(prepare(&old, &old_encoding, &invalid, &current_encoding, &skeleton).is_none());
    }
  }
}
