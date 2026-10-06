use super::super::*;

/// Source-space uniform TRS. No viewer coordinate conversion is involved.
#[derive(Clone, Copy, Debug)]
pub(super) struct Transform {
  pub position: [f64; 3],
  pub rotation: [f64; 4],
  pub scale: f64,
}

pub(super) fn numbers<const N: usize>(value: &Kv3Value) -> Option<[f64; N]> {
  let values: [f64; N] = value
    .as_array()?
    .iter()
    .map(Kv3Value::as_f64)
    .collect::<Option<Vec<_>>>()?
    .try_into()
    .ok()?;
  values.iter().all(|v| v.is_finite()).then_some(values)
}

pub(super) fn replace_numbers(value: &mut Kv3Value, numbers: &[f64]) -> Option<()> {
  let Kv3Value::Array(values) = value else {
    return None;
  };
  if values.len() != numbers.len() || numbers.iter().any(|v| !v.is_finite()) {
    return None;
  }
  for (value, number) in values.iter_mut().zip(numbers) {
    *value = match value {
      Kv3Value::Double(_) => source_float(*number)?,
      _ => return None,
    };
  }
  Some(())
}

// Source 2 transform fields are floats. Quantize edits before exact roundtrip
// comparisons, while performing the frame calculations themselves in f64.
pub(super) fn source_float(number: f64) -> Option<Kv3Value> {
  let number = number as f32;
  number
    .is_finite()
    .then_some(Kv3Value::Double(f64::from(number)))
}

impl Transform {
  pub const IDENTITY: Self = Self {
    position: [0.; 3],
    rotation: [0., 0., 0., 1.],
    scale: 1.,
  };

  pub fn new(position: [f64; 3], rotation: [f64; 4], scale: f64) -> Option<Self> {
    let norm = rotation.iter().map(|v| v * v).sum::<f64>().sqrt();
    if position.iter().chain(&rotation).any(|v| !v.is_finite())
      || !scale.is_finite()
      || scale <= 0.
      || (norm - 1.).abs() > 0.001
    {
      return None;
    }
    Some(Self {
      position,
      rotation: rotation.map(|v| v / norm),
      scale,
    })
  }

  pub fn vector(self, v: [f64; 3]) -> [f64; 3] {
    let [x, y, z, w] = self.rotation;
    let a = [
      y * v[2] - z * v[1],
      z * v[0] - x * v[2],
      x * v[1] - y * v[0],
    ];
    let b = [
      y * a[2] - z * a[1],
      z * a[0] - x * a[2],
      x * a[1] - y * a[0],
    ];
    std::array::from_fn(|i| self.scale * (v[i] + 2. * (w * a[i] + b[i])))
  }

  pub fn point(self, v: [f64; 3]) -> [f64; 3] {
    let v = self.vector(v);
    std::array::from_fn(|i| v[i] + self.position[i])
  }

  pub fn compose(self, local: Self) -> Self {
    let [x, y, z, w] = self.rotation;
    let [a, b, c, d] = local.rotation;
    Self {
      position: self.point(local.position),
      scale: self.scale * local.scale,
      rotation: [
        w * a + x * d + y * c - z * b,
        w * b - x * c + y * d + z * a,
        w * c + x * b - y * a + z * d,
        w * d - x * a - y * b - z * c,
      ],
    }
  }

  pub fn inverse(self) -> Self {
    let [x, y, z, w] = self.rotation;
    let mut inverse = Self {
      position: [0.; 3],
      rotation: [-x, -y, -z, w],
      scale: 1. / self.scale,
    };
    inverse.position = inverse.vector(self.position.map(|v| -v));
    inverse
  }

  /// Render skeleton matrices are row-major affine 3x4, unlike glTF matrices.
  pub fn matrix(self) -> [f64; 12] {
    let axes = [[1., 0., 0.], [0., 1., 0.], [0., 0., 1.]].map(|v| self.vector(v));
    std::array::from_fn(|i| {
      if i % 4 == 3 {
        self.position[i / 4]
      } else {
        axes[i % 4][i / 4]
      }
    })
  }
}

pub(super) fn worlds(model: &Kv3Value) -> Option<Vec<Transform>> {
  ModelRig::parse(model)?; // validates dimensions, unique names, finite poses and acyclic parents
  let rig = model.get("m_modelSkeleton")?;
  let parents = rig.get("m_nParent")?.as_array()?;
  let locals: Vec<_> = (0..parents.len())
    .map(|i| {
      Transform::new(
        numbers(rig.get("m_bonePosParent")?.as_array()?.get(i)?)?,
        numbers(rig.get("m_boneRotParent")?.as_array()?.get(i)?)?,
        rig.get("m_boneScaleParent")?.as_array()?.get(i)?.as_f64()?,
      )
    })
    .collect::<Option<_>>()?;
  let mut out: Vec<Option<Transform>> = vec![None; parents.len()];
  for start in 0..parents.len() {
    if out[start].is_some() {
      continue;
    }
    let mut chain = Vec::new();
    let mut node = start;
    let mut parent_world = loop {
      if let Some(world) = out[node] {
        break world;
      }
      chain.push(node);
      let parent = parents[node].as_int()?;
      if parent == -1 {
        break Transform::IDENTITY;
      }
      node = usize::try_from(parent).ok()?;
    };
    for index in chain.into_iter().rev() {
      parent_world = parent_world.compose(locals[index]);
      out[index] = Some(parent_world);
    }
  }
  out.into_iter().collect()
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn world_frames_accept_forward_parents_and_multiple_roots_but_reject_cycles() {
    let mut value =
      super::super::super::tests::model(&["leaf", "root", "mid", "other"], &[2, -1, 1, -1]);
    let Kv3Value::Array(positions) = value
      .get_mut("m_modelSkeleton")
      .unwrap()
      .get_mut("m_bonePosParent")
      .unwrap()
    else {
      unreachable!()
    };
    for (i, x) in [(0, 2.), (1, 5.), (2, 3.)] {
      positions[i] = Kv3Value::Array([x, 0., 0.].map(Kv3Value::Double).to_vec());
    }
    let result = worlds(&value).unwrap();
    assert_eq!(result[0].position, [10., 0., 0.]);
    assert_eq!(result[3].position, [0.; 3]);
    let cycle = super::super::super::tests::model(&["a", "b"], &[1, 0]);
    assert!(worlds(&cycle).is_none());
  }

  #[test]
  fn nonidentity_bind_and_attachment_frames_roundtrip_in_source_space() {
    let q = 0.5_f64.sqrt();
    let old = Transform::new([2., -3., 8.], [0., 0., q, q], 2.).unwrap();
    let new = Transform::new([-4., 1., 3.], [q, 0., 0., q], 0.5).unwrap();
    let point = [1., 2., 3.];
    let delta = new.inverse().compose(old);
    let actual = new.point(delta.point(point));
    let expected = old.point(point);
    for (a, b) in actual.iter().zip(expected) {
      assert!((a - b).abs() < 1e-10);
    }
    let matrix = old.inverse().matrix();
    let world = old.point(point);
    for row in 0..3 {
      let actual = (0..3)
        .map(|col| matrix[row * 4 + col] * world[col])
        .sum::<f64>()
        + matrix[row * 4 + 3];
      assert!((actual - point[row]).abs() < 1e-10);
    }
    assert!(Transform::new([0.; 3], [0.; 4], 1.).is_none());
    assert!(Transform::new([0.; 3], [0., 0., 0., 1.], -1.).is_none());
  }
}
