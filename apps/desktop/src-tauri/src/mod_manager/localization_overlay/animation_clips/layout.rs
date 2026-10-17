use super::super::animation_model_evidence::ModelRig;
use super::super::resources::Provider;
use super::*;
use std::collections::BTreeSet;

mod tree;

const MIN_STATIC_ANCHORS: usize = 8;

pub(super) fn infer(
  resources: &ResourceSnapshot,
  models: &BTreeMap<String, Vec<CompiledDataSource>>,
  scope: &RepairScope,
  provider: &Provider,
  skeleton_path: &str,
  skeleton: &Kv3Value,
  track_count: usize,
) -> Option<Vec<Option<usize>>> {
  let mut result = None;
  for (path, sources) in models {
    let [source] = sources.as_slice() else {
      continue;
    };
    if source.priority != provider.priority
      || Some(source.mod_id.as_str()) != provider.mod_id.as_deref()
      || source.source_vpk != provider.archive.file_name()?.to_str()?
      || scope.protects(path)
    {
      continue;
    }
    let (_, model, _) = decode_compiled_data(&source.bytes, path).ok()?;
    let Some(refs) = model
      .get("m_vecNmSkeletonRefs")
      .and_then(Kv3Value::as_array)
    else {
      continue;
    };
    if refs.len() != 1 || refs[0].as_str().and_then(resource_path).as_deref() != Some(skeleton_path)
    {
      continue;
    }
    let mut evidence = None;
    for clip_path in resources
      .mod_paths()
      .filter(|path| path.ends_with(".vnmclip_c") && !scope.protects(path))
    {
      let Some((owner, bytes)) = resources.resolve(clip_path).ok()? else {
        continue;
      };
      if owner.archive != provider.archive || owner.mod_id != provider.mod_id {
        continue;
      }
      let (_, clip, _) = decode_compiled_data(&bytes, clip_path).ok()?;
      if clip.get("m_bIsAdditive").and_then(Kv3Value::as_bool) != Some(false)
        || clip
          .get("m_skeleton")
          .and_then(Kv3Value::as_str)
          .and_then(resource_path)
          .as_deref()
          != Some(skeleton_path)
      {
        continue;
      }
      let tracks = clip.get("m_trackCompressionSettings")?.as_array()?;
      if tracks.len() == track_count
        && super::frame_words(&clip, tracks).is_some()
        && let Some(layout) = mapping(skeleton, &model, tracks)
      {
        evidence = Some(layout);
        break;
      }
    }
    let evidence = evidence?;
    if result
      .as_ref()
      .is_some_and(|previous| *previous != evidence)
    {
      return None;
    }
    result = Some(evidence);
  }
  result
}

pub(super) fn mapping(
  skeleton: &Kv3Value,
  model: &Kv3Value,
  tracks: &[Kv3Value],
) -> Option<Vec<Option<usize>>> {
  let rig = ModelRig::parse(model)?;
  let names: Vec<_> = skeleton
    .get("m_boneIDs")?
    .as_array()?
    .iter()
    .map(Kv3Value::as_str)
    .collect::<Option<_>>()?;
  if names.iter().collect::<BTreeSet<_>>().len() != names.len() {
    return None;
  }
  let parents = skeleton.get("m_parentIndices")?.as_array()?;
  let poses = skeleton.get("m_parentSpaceReferencePose")?.as_array()?;
  if parents.len() != names.len() || poses.len() != names.len() {
    return None;
  }
  let present: Vec<_> = names
    .iter()
    .map(|name| rig.parent(name).is_some())
    .collect();
  if present.iter().filter(|value| **value).count() != tracks.len() || tracks.len() >= names.len() {
    return None;
  }
  let identity = Kv3Value::Array(
    [0., 0., 0., 1., 0., 0., 0., 1.]
      .map(Kv3Value::Double)
      .to_vec(),
  );
  let mut children = vec![Vec::new(); names.len()];
  let mut root = None;
  for (index, name) in names.iter().enumerate() {
    number_array(&poses[index], 8)?;
    let mut parent = parents[index].as_int()?;
    if parent < -1 || parent >= index as i64 {
      return None;
    }
    if !present[index] {
      continue;
    }
    while parent >= 0 && !present[parent as usize] {
      if super::super::animation_skeleton::equivalent_pose(&poses[parent as usize], &identity)
        != Some(true)
      {
        return None;
      }
      parent = parents[parent as usize].as_int()?;
    }
    let parent_name = if parent < 0 {
      ""
    } else {
      names[parent as usize]
    };
    if rig.parent(name)? != parent_name {
      return None;
    }
    if parent >= 0 {
      children[parent as usize].push(index);
    } else if root.replace(index).is_some() {
      return None;
    }
  }
  let root = root?;
  if root != 0 {
    return None;
  }
  // The authored model supplies sibling order where animation poses cannot
  // distinguish a branch. Static, named bind poses constrain reordered branches.
  let authored = model
    .get("m_modelSkeleton")?
    .get("m_boneName")?
    .as_array()?;
  for siblings in &mut children {
    siblings.sort_by_key(|index| {
      authored
        .iter()
        .position(|name| name.as_str() == Some(names[*index]))
    });
  }
  let anchors = anchors(&rig, &names, &present, tracks)?;
  if anchors.iter().flatten().count() < MIN_STATIC_ANCHORS.max(tracks.len().div_ceil(2)) {
    return None;
  }
  let low_count = skeleton
    .get("m_numBonesToSampleAtLowLOD")
    .and_then(Kv3Value::as_uint)
    .map_or(Some(names.len()), |v| usize::try_from(v).ok())?;
  if low_count == 0 || low_count > names.len() {
    return None;
  }
  let old_low_count = present[..low_count].iter().filter(|p| **p).count();
  let mut tree = tree::LayoutTree::new(children, anchors, low_count);
  let order = tree.solve(root, 0, old_low_count)?;
  let mut result = vec![None; names.len()];
  for (old, bone) in order.into_iter().enumerate() {
    result[bone] = Some(old);
  }
  Some(result)
}

fn anchors(
  rig: &ModelRig,
  names: &[&str],
  present: &[bool],
  tracks: &[Kv3Value],
) -> Option<Vec<Option<usize>>> {
  let poses: Vec<_> = names
    .iter()
    .zip(present)
    .map(|(name, present)| {
      if *present {
        rig.pose(name).and_then(|pose| number_array(&pose, 8))
      } else {
        None
      }
    })
    .collect();
  let mut candidates = vec![Vec::new(); names.len()];
  for (old, track) in tracks.iter().enumerate() {
    if ![
      "m_bIsTranslationStatic",
      "m_bIsRotationStatic",
      "m_bIsScaleStatic",
    ]
    .iter()
    .all(|field| track.get(field).and_then(Kv3Value::as_bool) == Some(true))
    {
      continue;
    }
    let mut pose = Vec::new();
    for axis in ['X', 'Y', 'Z'] {
      pose.push(
        track
          .get(&format!("m_translationRange{axis}"))?
          .get("m_flRangeStart")?
          .as_f64()?,
      );
    }
    // Identity helper poses are common and cannot identify a bone.
    if pose.iter().all(|v| v.abs() < 0.0001) {
      continue;
    }
    pose.push(track.get("m_scaleRange")?.get("m_flRangeStart")?.as_f64()?);
    pose.extend(number_array(track.get("m_constantRotation")?, 4)?);
    let matching: Vec<_> = poses
      .iter()
      .enumerate()
      .filter(|(_, expected)| {
        expected
          .as_ref()
          .is_some_and(|expected| pose_matches(&pose, expected))
      })
      .map(|(index, _)| index)
      .collect();
    if let [bone] = matching.as_slice() {
      candidates[*bone].push(old);
    }
  }
  let mut result: Vec<_> = candidates
    .iter()
    .map(|matches| {
      if let [old] = matches.as_slice() {
        Some(*old)
      } else {
        None
      }
    })
    .collect();
  // NM clips always start with the root; its animation frame can differ from
  // the deformation skeleton's coordinate frame.
  result[0] = Some(0);
  Some(result)
}

fn pose_matches(a: &[f64], b: &[f64]) -> bool {
  if !a.iter().chain(b).all(|v| v.is_finite())
    || !a[..3]
      .iter()
      .zip(&b[..3])
      .all(|(a, b)| (a - b).abs() <= 0.005)
    || (a[3] - b[3]).abs() > 0.001
  {
    return false;
  }
  let norm = |q: &[f64]| q.iter().map(|v| v * v).sum::<f64>().sqrt();
  let denom = norm(&a[4..]) * norm(&b[4..]);
  denom > 0.0001
    && (a[4..].iter().zip(&b[4..]).map(|(a, b)| a * b).sum::<f64>() / denom)
      .abs()
      .min(1.)
      .acos()
      * 2.
      <= 0.002
}
