use super::*;

/// A small uniform authored size change may keep the same animation interface.
/// This proves correspondence; it never scales or rewrites the authored poses.
pub(super) fn compatible(poses: &[(String, Kv3Value, Kv3Value)]) -> bool {
  let numbers = |pose: &Kv3Value| -> Option<Vec<f64>> {
    let values: Option<Vec<_>> = pose.as_array()?.iter().map(Kv3Value::as_f64).collect();
    values.filter(|values| values.len() == 8 && values.iter().all(|value| value.is_finite()))
  };
  let Some(pairs) = poses
    .iter()
    .map(|(_, old, current)| Some((numbers(old)?, numbers(current)?)))
    .collect::<Option<Vec<_>>>()
  else {
    return false;
  };
  let mut numerator = 0.0;
  let mut denominator = 0.0;
  for (old, current) in &pairs {
    for (a, b) in old[..3].iter().zip(&current[..3]) {
      numerator += a * b;
      denominator += b * b;
    }
  }
  if denominator <= 1e-12 {
    return false;
  }
  let scale = numerator / denominator;
  if !scale.is_finite() || !(0.98..=1.02).contains(&scale) {
    return false;
  }
  pairs.iter().all(|(old, current)| {
    let positions_match = old[..3]
      .iter()
      .zip(&current[..3])
      .all(|(a, b)| (a - b * scale).abs() <= 0.002);
    let mut rotation_and_scale = current.clone();
    rotation_and_scale[..3].copy_from_slice(&old[..3]);
    positions_match
      && equivalent_pose(
        &Kv3Value::Array(old.iter().copied().map(Kv3Value::Double).collect()),
        &Kv3Value::Array(
          rotation_and_scale
            .into_iter()
            .map(Kv3Value::Double)
            .collect(),
        ),
      ) == Some(true)
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn uniform_size_changes_are_proven_across_the_entire_sample_chain() {
    let pose = |x: f64| {
      Kv3Value::Array(
        [x, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]
          .map(Kv3Value::Double)
          .to_vec(),
      )
    };
    let pairs = vec![
      ("one".into(), pose(10.08), pose(10.0)),
      ("two".into(), pose(20.16), pose(20.0)),
    ];
    assert!(compatible(&pairs));
    let mut nonuniform = pairs.clone();
    nonuniform[1].1 = pose(20.0);
    assert!(!compatible(&nonuniform));
    let large = vec![("one".into(), pose(10.3), pose(10.0))];
    assert!(!compatible(&large));
    let mut rotated = pairs.clone();
    let Kv3Value::Array(values) = &mut rotated[0].1 else {
      unreachable!()
    };
    values[4] = Kv3Value::Double(0.1);
    assert!(!compatible(&rotated));
  }
}
