use super::*;

/// Keep existing model-space bind frames through a hierarchy change. New controls
/// inherit their canonical local frame from the retained authored parent frame.
pub(super) fn preserve(model: &mut Kv3Value, authored: &[Transform]) -> Option<()> {
  let canonical = worlds(model)?;
  let rig = model.get("m_modelSkeleton")?;
  let parents = rig.get("m_nParent")?.as_array()?;
  let mut target: Vec<Option<Transform>> = (0..parents.len())
    .map(|i| authored.get(i).copied())
    .collect();
  for start in authored.len()..parents.len() {
    let mut chain = Vec::new();
    let mut index = start;
    while target[index].is_none() {
      chain.push(index);
      let parent = parents[index].as_int()?;
      if parent < 0 {
        break;
      }
      index = usize::try_from(parent).ok()?;
    }
    for index in chain.into_iter().rev() {
      let parent = parents[index].as_int()?;
      let (before, after) = if parent < 0 {
        (Transform::IDENTITY, Transform::IDENTITY)
      } else {
        let parent = usize::try_from(parent).ok()?;
        (canonical[parent], target[parent]?)
      };
      target[index] = Some(after.compose(before.inverse().compose(canonical[index])));
    }
  }
  let locals: Vec<_> = (0..parents.len())
    .map(|i| {
      let parent = parents[i].as_int()?;
      let parent = if parent < 0 {
        Transform::IDENTITY
      } else {
        target[usize::try_from(parent).ok()?]?
      };
      Some(parent.inverse().compose(target[i]?))
    })
    .collect::<Option<_>>()?;
  let rig = model.get_mut("m_modelSkeleton")?;
  // Uniform float lanes are needed when a constant integer scale array changes.
  for (i, local) in locals.iter().enumerate() {
    replace_numbers(array_item_mut(rig, "m_bonePosParent", i)?, &local.position)?;
    replace_numbers(array_item_mut(rig, "m_boneRotParent", i)?, &local.rotation)?;
    *array_item_mut(rig, "m_boneScaleParent", i)? = source_float(local.scale)?;
  }
  let actual = worlds(model)?;
  for (a, b) in authored.iter().zip(actual) {
    if a
      .matrix()
      .iter()
      .zip(b.matrix())
      .any(|(a, b)| (a - b).abs() > 0.001)
    {
      return None;
    }
  }
  Some(())
}

pub(super) fn validate_mesh(
  mesh: &Kv3Value,
  indices: &BTreeMap<String, usize>,
  worlds: &[Transform],
) -> Option<()> {
  if !mesh.get("m_constraints")?.as_array()?.is_empty()
    || mesh
      .get("m_pGroomData")
      .is_some_and(|value| !matches!(value, Kv3Value::Null))
  {
    return None;
  }
  let mut seen = BTreeSet::new();
  for bone in mesh.get("m_skeleton")?.get("m_bones")?.as_array()? {
    let name = bone.get("m_boneName")?.as_str()?.to_ascii_lowercase();
    if !seen.insert(name.clone()) {
      return None;
    }
    let world = worlds[*indices.get(&name)?].matrix();
    let inverse = numbers::<12>(bone.get("m_invBindPose")?)?;
    for row in 0..3 {
      for col in 0..4 {
        let value = (0..3)
          .map(|k| world[row * 4 + k] * inverse[k * 4 + col])
          .sum::<f64>()
          + if col == 3 { world[row * 4 + 3] } else { 0. };
        if (value - if row == col { 1. } else { 0. }).abs() > 0.003 {
          return None;
        }
      }
    }
  }
  Some(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn articulated_mesh_keeps_its_binding_when_controls_and_parents_change() {
    let mut old = super::super::super::tests::model(&["root", "rider"], &[-1, 0]);
    let rig = old.get_mut("m_modelSkeleton").unwrap();
    replace_numbers(
      array_item_mut(rig, "m_bonePosParent", 1).unwrap(),
      &[10., 20., 70.],
    )
    .unwrap();
    replace_numbers(
      array_item_mut(rig, "m_boneRotParent", 1).unwrap(),
      &[
        0.,
        0.,
        std::f64::consts::FRAC_1_SQRT_2,
        std::f64::consts::FRAC_1_SQRT_2,
      ],
    )
    .unwrap();
    let authored = worlds(&old).unwrap();
    let mut current =
      super::super::super::tests::model(&["root", "rider", "offset", "control"], &[-1, 2, 0, 1]);
    let rig = current.get_mut("m_modelSkeleton").unwrap();
    replace_numbers(
      array_item_mut(rig, "m_bonePosParent", 1).unwrap(),
      &[20., 0., 20.],
    )
    .unwrap();
    replace_numbers(
      array_item_mut(rig, "m_bonePosParent", 2).unwrap(),
      &[2., 0., 0.],
    )
    .unwrap();
    replace_numbers(
      array_item_mut(rig, "m_bonePosParent", 3).unwrap(),
      &[1., 0., 0.],
    )
    .unwrap();
    let wrong = worlds(&current).unwrap();
    let animated = Transform::new([30., -5., 60.], [0., 0., 0., 1.], 1.).unwrap();
    let vertex = [12., 21., 72.];
    let expected = animated.compose(authored[1].inverse()).point(vertex);
    let stretched = animated.compose(wrong[1].inverse()).point(vertex);
    assert!(
      expected
        .iter()
        .zip(stretched)
        .any(|(a, b)| (a - b).abs() > 40.)
    );
    preserve(&mut current, &authored).unwrap();
    let actual = worlds(&current).unwrap();
    let repaired = animated.compose(actual[1].inverse()).point(vertex);
    assert!(
      expected
        .iter()
        .zip(repaired)
        .all(|(a, b)| (a - b).abs() < 0.00001)
    );
    assert!(
      actual[3]
        .position
        .iter()
        .zip(authored[1].point([1., 0., 0.]))
        .all(|(a, b)| (a - b).abs() < 0.00001)
    );
    // Bone order/remap indices remain stable despite the appended forward parent.
    assert_eq!(
      current
        .get("m_modelSkeleton")
        .unwrap()
        .get("m_nParent")
        .unwrap()
        .as_array()
        .unwrap()[1]
        .as_int(),
      Some(2)
    );
  }
}
