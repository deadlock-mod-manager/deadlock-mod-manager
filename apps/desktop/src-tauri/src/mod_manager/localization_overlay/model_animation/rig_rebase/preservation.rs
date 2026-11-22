use super::*;

fn close(a: [f64; 3], b: [f64; 3]) -> bool {
  a.iter().zip(b).all(|(a, b)| (a - b).abs() <= 0.003)
}

fn skin(world: Transform, inverse: [f64; 12]) -> [f64; 12] {
  let m = world.matrix();
  std::array::from_fn(|i| {
    let r = i / 4;
    let c = i % 4;
    (0..3)
      .map(|k| m[r * 4 + k] * inverse[k * 4 + c])
      .sum::<f64>()
      + if c == 3 { m[r * 4 + 3] } else { 0. }
  })
}

pub(in super::super) fn verify(source: &[u8], rebuilt: &[u8]) -> Option<()> {
  let before = Resource::parse(source).ok()?;
  let after = Resource::parse(rebuilt).ok()?;
  let (_, old, _) = decode_compiled_data(source, "original bind proof").ok()?;
  let (_, new, _) = decode_compiled_data(rebuilt, "rebuilt bind proof").ok()?;
  let old_indices = indices(&old)?;
  let new_indices = indices(&new)?;
  if old_indices
    .iter()
    .any(|(name, i)| new_indices.get(name) != Some(i))
  {
    return None;
  }
  for field in ["m_remappingTable", "m_remappingTableStarts", "m_refMeshes"] {
    if old.get(field) != new.get(field) {
      return None;
    }
  }
  let ow = worlds(&old)?;
  let nw = worlds(&new)?;
  // NM supplies a named model-space pose independently of these bind frames.
  // Equal rest-pose skin matrices are insufficient: authored and repaired rigs
  // must skin identically under the SAME animated pose, for every old bone.
  for (a, b) in ow.iter().zip(&nw) {
    if a
      .inverse()
      .matrix()
      .iter()
      .zip(b.inverse().matrix())
      .any(|(a, b)| (a - b).abs() > 0.003)
    {
      return None;
    }
  }
  if before.blocks().len() != after.blocks().len() {
    return None;
  }
  for (index, block) in before.blocks().iter().enumerate() {
    if block.kind != after.blocks()[index].kind {
      return None;
    }
    let a = before.get_block_by_index(index)?;
    let b = after.get_block_by_index(index)?;
    if block.kind == *b"MDAT" {
      let old_mesh = kv3::decode(a).ok()?;
      let new_mesh = kv3::decode(b).ok()?;
      verify_mesh(&old_mesh, &new_mesh, &old_indices, &ow, &nw)?;
    } else if ![*b"DATA", *b"RERL"].contains(&block.kind) && a != b {
      return None;
    }
  }
  Some(())
}

fn verify_mesh(
  old: &Kv3Value,
  new: &Kv3Value,
  indices: &BTreeMap<String, usize>,
  ow: &[Transform],
  nw: &[Transform],
) -> Option<()> {
  let old_bones = old.get("m_skeleton")?.get("m_bones")?.as_array()?;
  let new_bones = new.get("m_skeleton")?.get("m_bones")?.as_array()?;
  if old_bones.len() != new_bones.len()
    || old.get("m_sceneObjects") != new.get("m_sceneObjects")
    || old.get("m_skeleton")?.get("m_boneParents") != new.get("m_skeleton")?.get("m_boneParents")
  {
    return None;
  }
  for (a, b) in old_bones.iter().zip(new_bones) {
    if a.get("m_boneName") != b.get("m_boneName") || a.get("m_parentName") != b.get("m_parentName")
    {
      return None;
    }
    let i = *indices.get(&a.get("m_boneName")?.as_str()?.to_ascii_lowercase())?;
    let a = skin(ow[i], numbers(a.get("m_invBindPose")?)?);
    let b = skin(nw[i], numbers(b.get("m_invBindPose")?)?);
    if a.iter().zip(b).any(|(a, b)| (a - b).abs() > 0.003) {
      return None;
    }
  }
  let points = new.get("m_attachments")?.as_array()?;
  for attachment in old.get("m_attachments")?.as_array()? {
    let a = attachment.get("value")?;
    let b = points
      .iter()
      .find(|p| p.get("value").and_then(|v| v.get("m_name")) == a.get("m_name"))?
      .get("value")?;
    for key in [
      "m_nInfluences",
      "m_influenceNames",
      "m_influenceWeights",
      "m_bInfluenceRootTransform",
      "m_bIgnoreRotation",
    ] {
      if a.get(key) != b.get(key) {
        return None;
      }
    }
    let count = usize::try_from(a.get("m_nInfluences")?.as_int()?).ok()?;
    for i in 0..count {
      let root = a
        .get("m_bInfluenceRootTransform")?
        .as_array()?
        .get(i)?
        .as_bool()?;
      let (old_world, new_world) = if root {
        (Transform::IDENTITY, Transform::IDENTITY)
      } else {
        let index = *indices.get(
          &a.get("m_influenceNames")?
            .as_array()?
            .get(i)?
            .as_str()?
            .to_ascii_lowercase(),
        )?;
        (ow[index], nw[index])
      };
      let at = Transform::new(
        numbers(a.get("m_vInfluenceOffsets")?.as_array()?.get(i)?)?,
        numbers(a.get("m_vInfluenceRotations")?.as_array()?.get(i)?)?,
        1.,
      )?;
      let bt = Transform::new(
        numbers(b.get("m_vInfluenceOffsets")?.as_array()?.get(i)?)?,
        numbers(b.get("m_vInfluenceRotations")?.as_array()?.get(i)?)?,
        1.,
      )?;
      let at = old_world.compose(at);
      let bt = new_world.compose(bt);
      if !close(at.position, bt.position) {
        return None;
      }
      if !a.get("m_bIgnoreRotation")?.as_bool()? {
        for axis in [[1., 0., 0.], [0., 1., 0.], [0., 0., 1.]] {
          if !close(at.vector(axis), bt.vector(axis)) {
            return None;
          }
        }
      }
    }
  }
  let old_sets = old.get("m_hitboxsets")?.as_array()?;
  let new_sets = new.get("m_hitboxsets")?.as_array()?;
  if old_sets.len() != new_sets.len() {
    return None;
  }
  for (a, b) in old_sets.iter().zip(new_sets) {
    let a = a.get("value")?.get("m_HitBoxes")?.as_array()?;
    let b = b.get("value")?.get("m_HitBoxes")?.as_array()?;
    if a.len() != b.len() {
      return None;
    }
    for (a, b) in a.iter().zip(b) {
      let i = *indices.get(&a.get("m_sBoneName")?.as_str()?.to_ascii_lowercase())?;
      for field in [
        "m_sBoneName",
        "m_nShapeType",
        "m_bTranslationOnly",
        "m_nGroupId",
        "m_name",
      ] {
        if a.get(field) != b.get(field) {
          return None;
        }
      }
      let mut old_world = ow[i];
      let mut new_world = nw[i];
      if a.get("m_bTranslationOnly")?.as_bool()? {
        old_world.rotation = Transform::IDENTITY.rotation;
        old_world.scale = 1.;
        new_world.rotation = Transform::IDENTITY.rotation;
        new_world.scale = 1.;
      }
      for field in ["m_vMinBounds", "m_vMaxBounds"] {
        if !close(
          old_world.point(numbers(a.get(field)?)?),
          new_world.point(numbers(b.get(field)?)?),
        ) {
          return None;
        }
      }
      let a = a.get("m_flShapeRadius")?.as_f64()? * old_world.scale;
      let b = b.get("m_flShapeRadius")?.as_f64()? * new_world.scale;
      if (a - b).abs() > 0.003 {
        return None;
      }
    }
  }
  Some(())
}
