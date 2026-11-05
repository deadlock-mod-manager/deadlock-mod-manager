use super::{ModdingAddon, fingerprint, storage};
use crate::errors::Error;
use source2_model::{Resource as ReadResource, skeleton};
use std::{
  collections::{BTreeMap, BTreeSet},
  path::Path,
};
use vpkmanager::source2::{
  kv3::{self, Encoding, Format, Value},
  resource::Resource,
};

const CLOTH: u32 = 0x8;
const PROCEDURAL: u32 = 0x400000;
const ANIMATION: u32 = 0x40;

fn invalid(error: impl std::fmt::Display) -> Error {
  super::invalid(error.to_string())
}

fn decode(bytes: &[u8], kind: [u8; 4]) -> Result<Option<(Value, Encoding, Format)>, Error> {
  let resource = Resource::parse(bytes).map_err(invalid)?;
  let Some(payload) = resource.find_block(kind) else {
    return Ok(None);
  };
  let (value, encoding) = kv3::decode_preserving(payload).map_err(invalid)?;
  Ok(Some((
    value,
    encoding,
    Format::from_payload(payload).map_err(invalid)?,
  )))
}

fn rebuild(
  bytes: &[u8],
  kind: [u8; 4],
  value: &Value,
  encoding: &Encoding,
  format: &Format,
) -> Result<Vec<u8>, Error> {
  let payload = kv3::encode_preserving(value, encoding, format).map_err(invalid)?;
  let (actual, metadata) = kv3::decode_preserving(&payload).map_err(invalid)?;
  if actual != *value || !kv3::encoding_preserved(value, encoding, &metadata) {
    return Err(invalid(
      "Runtime cloth rebuild failed value/encoding verification",
    ));
  }
  let resource = Resource::parse(bytes).map_err(invalid)?;
  let index = resource
    .blocks()
    .iter()
    .position(|block| block.kind == kind)
    .ok_or_else(|| invalid("Missing runtime cloth resource block"))?;
  resource
    .rebuild_with_block_preserving(index, &payload)
    .map_err(invalid)
}

/// Restore only a missing FE setup on an unchanged rig; retain authored collision data.
pub(super) fn restore(target: &[u8], original: &[u8]) -> Result<Option<Vec<u8>>, Error> {
  let Some((source_phys, source_meta, _)) = decode(original, *b"PHYS")? else {
    return Ok(None);
  };
  let Some(fe) = source_phys
    .get("m_pFeModel")
    .filter(|value| !matches!(value, Value::Null))
  else {
    return Ok(None);
  };
  let Some((mut physics, mut phys_meta, phys_format)) = decode(target, *b"PHYS")? else {
    return Err(invalid("The recompiled model has no physics container"));
  };
  if physics
    .get("m_pFeModel")
    .is_some_and(|value| !matches!(value, Value::Null))
  {
    return Ok(None);
  }
  let source = ReadResource::parse(original.to_vec()).map_err(invalid)?;
  let destination = ReadResource::parse(target.to_vec()).map_err(invalid)?;
  let source_rig = skeleton::parse_model_skeleton(&source)
    .map_err(invalid)?
    .ok_or_else(|| invalid("Original cloth model has no skeleton"))?;
  let target_rig = skeleton::parse_model_skeleton(&destination)
    .map_err(invalid)?
    .ok_or_else(|| invalid("Recompiled cloth model has no skeleton"))?;
  if source_rig.bones.len() != target_rig.bones.len() {
    return Err(invalid(
      "Cloth cannot be inherited after adding or removing bones",
    ));
  }
  let mut mapping = Vec::new();
  let mut used = BTreeSet::new();
  for bone in &source_rig.bones {
    let index = target_rig
      .bones
      .iter()
      .position(|candidate| candidate.name.eq_ignore_ascii_case(&bone.name))
      .or_else(|| {
        let name = bone.name.strip_prefix('$')?;
        target_rig.bones.iter().position(|candidate| {
          candidate
            .name
            .strip_prefix('_')
            .is_some_and(|candidate| candidate.eq_ignore_ascii_case(name))
        })
      })
      .ok_or_else(|| invalid(format!("Missing cloth skeleton binding: {}", bone.name)))?;
    let target = &target_rig.bones[index];
    if !used.insert(index)
      || bone
        .model_bind_matrix
        .iter()
        .zip(target.model_bind_matrix)
        .any(|(a, b)| !a.is_finite() || !b.is_finite() || (a - b).abs() > 0.02)
    {
      return Err(invalid(format!("Cloth bind pose changed: {}", bone.name)));
    }
    mapping.push(index);
  }
  for (index, bone) in source_rig.bones.iter().enumerate() {
    let expected = if bone.parent < 0 {
      -1
    } else {
      mapping[bone.parent as usize] as i32
    };
    if target_rig.bones[mapping[index]].parent != expected {
      return Err(invalid(format!(
        "Cloth bone hierarchy changed: {}",
        bone.name
      )));
    }
  }
  let Some((mut data, data_meta, data_format)) = decode(target, *b"DATA")? else {
    return Err(invalid("Missing model DATA"));
  };
  let model_skeleton = data
    .get_mut("m_modelSkeleton")
    .ok_or_else(|| invalid("Missing model skeleton"))?;
  for (index, bone) in source_rig
    .bones
    .iter()
    .enumerate()
    .filter(|(_, bone)| bone.flags & CLOTH != 0)
  {
    let target_index = mapping[index];
    let Value::Array(names) = model_skeleton
      .get_mut("m_boneName")
      .ok_or_else(|| invalid("Missing bone names"))?
    else {
      return Err(invalid("Invalid bone names"));
    };
    *names
      .get_mut(target_index)
      .ok_or_else(|| invalid("Missing cloth bone name"))? = Value::String(bone.name.clone());
    let Value::Array(flags) = model_skeleton
      .get_mut("m_nFlag")
      .ok_or_else(|| invalid("Missing bone flags"))?
    else {
      return Err(invalid("Invalid bone flags"));
    };
    let mask = CLOTH | PROCEDURAL | ANIMATION;
    let value = (target_rig.bones[target_index].flags & !mask) | (bone.flags & mask);
    let flag = flags
      .get_mut(target_index)
      .ok_or_else(|| invalid("Missing cloth bone flag"))?;
    *flag = match flag {
      Value::UInt(_) => Value::UInt(u64::from(value)),
      Value::Int(_) => Value::Int(i64::from(value)),
      _ => return Err(invalid("Invalid bone flag type")),
    };
  }
  *physics
    .get_mut("m_pFeModel")
    .ok_or_else(|| invalid("Missing FE field"))? = fe.clone();
  *phys_meta
    .get_mut("m_pFeModel")
    .ok_or_else(|| invalid("Missing FE encoding"))? = source_meta
    .get("m_pFeModel")
    .ok_or_else(|| invalid("Missing original FE encoding"))?
    .clone();
  let restored = rebuild(target, *b"PHYS", &physics, &phys_meta, &phys_format)?;
  let restored = rebuild(&restored, *b"DATA", &data, &data_meta, &data_format)?;
  let check = ReadResource::parse(restored.clone()).map_err(invalid)?;
  if source2_model::fe_model::parse_model_cloth(&check)
    .map_err(invalid)?
    .is_none()
  {
    return Err(invalid("Restored model has no usable cloth setup"));
  }
  Ok(Some(restored))
}

pub(super) fn prepare(addon: &ModdingAddon) -> Result<(), Error> {
  let base = super::super::foundry::open_archive(Path::new(&addon.archive_path), None)?;
  let mut saved = storage::load(addon)?;
  let mut files = BTreeMap::new();
  let mut repaired = 0;
  for path in super::super::modding_batch::files(Path::new(&addon.game_path))?
    .into_iter()
    .filter(|path| path.ends_with(".vmdl_c"))
  {
    if !base.contains_entry(&path) {
      continue;
    }
    let target = super::contained(Path::new(&addon.game_path), &path)?;
    let current = storage::read(&target)?;
    let mut record = saved.resources.get(&path).cloned();
    let baseline = match &record {
      Some(record) if fingerprint(&current) == record.applied => {
        let bytes = storage::read(&storage::original_path(addon, &path)?)?;
        if record.original.as_ref() != Some(&fingerprint(&bytes)) {
          return Err(invalid(
            "Model edit original changed before cloth restoration",
          ));
        }
        bytes
      }
      _ => current.clone(),
    };
    // Most addon models already have authored cloth or do not use cloth at all.
    if decode(&baseline, *b"PHYS")?.is_some_and(|(value, _, _)| {
      value
        .get("m_pFeModel")
        .is_some_and(|value| !matches!(value, Value::Null))
    }) {
      continue;
    }
    let original = base
      .extract_entry_limited(&path, 32 * 1024 * 1024)
      .map_err(invalid)?;
    let restored = match restore(&baseline, &original) {
      Ok(Some(bytes)) => bytes,
      Ok(None) => continue,
      Err(error) => {
        return Err(invalid(format!(
          "Cannot restore runtime cloth for {path}: {error}"
        )));
      }
    };
    let hidden: Vec<_> = saved
      .models
      .get(&path)
      .into_iter()
      .flatten()
      .filter(|edit| edit.hidden)
      .map(|edit| edit.material.clone())
      .collect();
    let output = if hidden.is_empty() {
      restored.clone()
    } else {
      vpkmanager::model_edit::hide_materials(&restored, &hidden).map_err(invalid)?
    };
    files.insert(
      super::contained(
        Path::new(&addon.content_path),
        &format!(".dmm-model-editor/runtime-cloth-originals/{path}"),
      )?,
      Some(baseline),
    );
    if let Some(record) = &mut record {
      record.original = Some(fingerprint(&restored));
      record.applied = fingerprint(&output);
      record.local = true;
      files.insert(storage::original_path(addon, &path)?, Some(restored));
      saved.resources.insert(path.clone(), record.clone());
    }
    files.insert(target, Some(output));
    repaired += 1;
  }
  if files.is_empty() {
    return Ok(());
  }
  files.insert(
    super::contained(Path::new(&addon.content_path), storage::STATE)?,
    Some(serde_json::to_vec_pretty(&saved).map_err(invalid)?),
  );
  storage::write_transaction(files)?;
  log::info!(
    "[Workbench] Restored runtime cloth for {repaired} models in {}",
    addon.name
  );
  Ok(())
}

#[cfg(test)]
#[path = "runtime_cloth_tests.rs"]
mod tests;
