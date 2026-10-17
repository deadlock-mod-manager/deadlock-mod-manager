//! Migrate authored NM tracks using named poses and the model hierarchy.
use super::asset_compatibility::{AssetRepair, AssetWarning, RepairKind, WarningKind};
use super::repair_scope::RepairScope;
use super::resources::{ResourceSnapshot, resource_path};
use super::{
  CompiledDataSource, Kv3Value, Resource, decode_compiled_data, kv3, runtime_values_equal,
};
use crate::errors::Error;
use std::collections::BTreeMap;
mod layout;
#[cfg(test)]
mod tests;

pub(super) fn prepare(
  resources: &ResourceSnapshot,
  models: &BTreeMap<String, Vec<CompiledDataSource>>,
  scope: &RepairScope,
  repairs: &mut Vec<AssetRepair>,
  warnings: &mut Vec<AssetWarning>,
) -> Result<BTreeMap<String, Vec<u8>>, Error> {
  let mut output = BTreeMap::new();
  let mut layouts = BTreeMap::new();
  for path in resources
    .mod_paths()
    .filter(|path| path.ends_with(".vnmclip_c"))
  {
    let Some((provider, bytes)) = resources.resolve(path)? else {
      continue;
    };
    let Some(mod_id) = provider.mod_id.as_ref() else {
      continue;
    };
    if !scope.includes_mod(mod_id) || scope.protects(path) {
      continue;
    }
    let Ok((_, clip, _)) = decode_compiled_data(&bytes, path) else {
      continue;
    };
    let Some(skeleton_path) = clip
      .get("m_skeleton")
      .and_then(Kv3Value::as_str)
      .and_then(resource_path)
    else {
      continue;
    };
    let Some((owner, skeleton_bytes)) = resources.resolve(&skeleton_path)? else {
      continue;
    };
    // A bundled skeleton can intentionally keep a custom animation contract.
    if owner.mod_id.is_some() {
      continue;
    }
    let Ok((_, skeleton, _)) = decode_compiled_data(&skeleton_bytes, &skeleton_path) else {
      continue;
    };
    let Some(tracks) = clip
      .get("m_trackCompressionSettings")
      .and_then(Kv3Value::as_array)
    else {
      continue;
    };
    let Some(bones) = skeleton.get("m_boneIDs").and_then(Kv3Value::as_array) else {
      continue;
    };
    if tracks.len() == bones.len() {
      continue;
    }
    let key = (
      provider.archive.clone(),
      skeleton_path.clone(),
      tracks.len(),
    );
    let inferred = layouts.entry(key).or_insert_with(|| {
      layout::infer(
        resources,
        models,
        scope,
        &provider,
        &skeleton_path,
        &skeleton,
        tracks.len(),
      )
    });
    if let Some(rebuilt) = inferred
      .as_ref()
      .and_then(|layout| expand(&bytes, &skeleton, layout))
    {
      output.insert(path.to_owned(), rebuilt);
      repairs.push(AssetRepair {
        mod_id: mod_id.clone(),
        source_vpk: provider
          .archive
          .file_name()
          .unwrap_or_default()
          .to_string_lossy()
          .into_owned(),
        file_path: path.to_owned(),
        kind: RepairKind::AnimationClipTracks,
      });
    } else {
      warnings.push(AssetWarning {
        mod_id: mod_id.clone(),
        source_vpk: provider.archive.file_name().unwrap_or_default().to_string_lossy().into_owned(),
        file_path: path.to_owned(),
        kind: WarningKind::AnimationMapping,
        detail: format!(
          "Authored animation has {} tracks for {} active skeleton bones; authored bone order could not be established",
          tracks.len(), bones.len(),
        ),
      });
    }
  }
  Ok(output)
}

fn number_array(value: &Kv3Value, count: usize) -> Option<Vec<f64>> {
  let values: Vec<_> = value
    .as_array()?
    .iter()
    .map(Kv3Value::as_f64)
    .collect::<Option<_>>()?;
  (values.len() == count && values.iter().all(|v| v.is_finite())).then_some(values)
}

fn frame_words(clip: &Kv3Value, tracks: &[Kv3Value]) -> Option<usize> {
  for field in [
    "m_secondaryAnimations",
    "m_modelSpaceBoneSamplingIndices",
    "m_modelSpaceSamplingChain",
    "m_floatChannelData",
  ] {
    if !clip.get(field)?.as_array()?.is_empty() {
      return None;
    }
  }
  let mut words = 0usize;
  for track in tracks {
    if track.get("m_nTrackReadOffset")?.as_uint()? != words as u64 {
      return None;
    }
    for (field, size) in [
      ("m_bIsRotationStatic", 3),
      ("m_bIsTranslationStatic", 3),
      ("m_bIsScaleStatic", 1),
    ] {
      if !track.get(field)?.as_bool()? {
        words += size;
      }
    }
  }
  let frames = usize::try_from(clip.get("m_nNumFrames")?.as_uint()?).ok()?;
  let offsets = clip.get("m_compressedPoseOffsets")?.as_array()?;
  if frames == 0
    || offsets.len() != frames
    || !offsets
      .iter()
      .enumerate()
      .all(|(i, v)| v.as_uint() == Some((i * words) as u64))
  {
    return None;
  }
  let Kv3Value::Binary(data) = clip.get("m_compressedPoseData")? else {
    return None;
  };
  (frames.checked_mul(words)?.checked_mul(2)? == data.len()).then_some(words)
}

fn static_track(
  template: &Kv3Value,
  pose: &[f64],
  offset: usize,
  additive: bool,
) -> Option<Kv3Value> {
  let mut result = template.clone();
  for field in [
    "m_bIsRotationStatic",
    "m_bIsTranslationStatic",
    "m_bIsScaleStatic",
  ] {
    *result.get_mut(field)? = Kv3Value::Bool(true);
  }
  let pose = if additive {
    &[0., 0., 0., 0., 0., 0., 0., 1.][..]
  } else {
    pose
  };
  *result.get_mut("m_constantRotation")? =
    Kv3Value::Array(pose[4..].iter().copied().map(Kv3Value::Double).collect());
  // No new frame bytes are needed for static tracks; existing offsets stay valid.
  *result.get_mut("m_nTrackReadOffset")? = Kv3Value::UInt(offset as u64);
  for (field, start) in [
    ("m_translationRangeX", pose[0]),
    ("m_translationRangeY", pose[1]),
    ("m_translationRangeZ", pose[2]),
    ("m_scaleRange", pose[3]),
  ] {
    *result.get_mut(field)?.get_mut("m_flRangeStart")? = Kv3Value::Double(start);
  }
  Some(result)
}

fn expand(bytes: &[u8], skeleton: &Kv3Value, layout: &[Option<usize>]) -> Option<Vec<u8>> {
  let (format, mut clip, mut encoding) =
    decode_compiled_data(bytes, "authored NM animation").ok()?;
  let tracks = clip.get("m_trackCompressionSettings")?.as_array()?;
  let words = frame_words(&clip, tracks)?;
  let additive = clip.get("m_bIsAdditive")?.as_bool()?;
  let track_encodings = encoding.get("m_trackCompressionSettings")?.as_array()?;
  if track_encodings.len() != tracks.len() {
    return None;
  }
  let poses = skeleton.get("m_parentSpaceReferencePose")?.as_array()?;
  let mut values = Vec::new();
  let mut encodings = Vec::new();
  if layout.len() != poses.len() {
    return None;
  }
  let mut seen = vec![false; tracks.len()];
  let mut segments = Vec::new();
  let mut offset = 0;
  for (index, old) in layout.iter().enumerate() {
    if let Some(old) = old {
      if *seen.get(*old)? {
        return None;
      }
      seen[*old] = true;
      let mut track = tracks[*old].clone();
      let start = usize::try_from(track.get("m_nTrackReadOffset")?.as_uint()?).ok()?;
      let end = tracks.get(old + 1).map_or(Some(words), |next| {
        usize::try_from(next.get("m_nTrackReadOffset")?.as_uint()?).ok()
      })?;
      segments.push((start * 2, end * 2));
      *track.get_mut("m_nTrackReadOffset")? = Kv3Value::UInt(offset as u64);
      offset += end.checked_sub(start)?;
      values.push(track);
      encodings.push(track_encodings[*old].clone());
    } else {
      values.push(static_track(
        tracks.first()?,
        &number_array(&poses[index], 8)?,
        offset,
        additive,
      )?);
      encodings.push(track_encodings.first()?.clone());
    }
  }
  if seen.iter().any(|seen| !seen) || offset != words {
    return None;
  }
  let Kv3Value::Binary(data) = clip.get("m_compressedPoseData")? else {
    return None;
  };
  let mut reordered = Vec::with_capacity(data.len());
  if words > 0 {
    for frame in data.chunks_exact(words * 2) {
      for (start, end) in &segments {
        reordered.extend_from_slice(frame.get(*start..*end)?);
      }
    }
  }
  *clip.get_mut("m_compressedPoseData")? = Kv3Value::Binary(reordered);
  *clip.get_mut("m_trackCompressionSettings")? = Kv3Value::Array(values);
  encoding.get_mut("m_trackCompressionSettings")?.children =
    kv3::EncodingChildren::Array(encodings);
  kv3::normalize_numeric_array_encoding(&clip, &mut encoding).ok()?;
  let payload = kv3::encode_preserving(&clip, &encoding, &format).ok()?;
  let rebuilt = Resource::parse(bytes)
    .ok()?
    .rebuild_with_data_preserving(&payload)
    .ok()?;
  let (_, decoded, decoded_encoding) =
    decode_compiled_data(&rebuilt, "expanded NM animation").ok()?;
  (runtime_values_equal(&clip, &decoded)
    && kv3::encoding_preserved(&clip, &encoding, &decoded_encoding))
  .then_some(rebuilt)
}
