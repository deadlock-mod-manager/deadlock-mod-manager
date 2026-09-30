use super::{CompiledDataSource, Kv3Value, Resource, decode_compiled_data, kv3, normalize_path};
use crate::errors::Error;
use serde::{Deserialize, Serialize};
use source2_model::vpk_extract::VpkArchive;
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RepairKind {
  AnimationSkeleton,
  AnimationSkeletonRebased,
  CameraInterface,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetRepair {
  pub mod_id: String,
  pub source_vpk: String,
  pub file_path: String,
  pub kind: RepairKind,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WarningKind {
  UnverifiedSkeleton,
  InvalidSkeleton,
  InvalidBoneRemapping,
  InvalidAttachment,
  InvalidHitbox,
  MissingResource,
  UnreadableResource,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetWarning {
  pub mod_id: String,
  pub source_vpk: String,
  pub file_path: String,
  pub kind: WarningKind,
  pub detail: String,
}

pub(super) fn is_mesh_path(path: &str) -> bool {
  let path = normalize_path(path);
  path.starts_with("models/") && path.ends_with(".vmesh_c") && safe_path(&path)
}

fn safe_path(path: &str) -> bool {
  path.split('/').all(|part| !matches!(part, "" | "." | ".."))
}

pub(super) fn analyze(
  citadel: &Path,
  sources: &BTreeMap<String, Vec<CompiledDataSource>>,
  available: &mut BTreeSet<String>,
  repaired: &BTreeMap<&str, &[u8]>,
) -> Result<Vec<AssetWarning>, Error> {
  if sources.is_empty() {
    return Ok(Vec::new());
  }
  // The game and core archives plus every enabled mod form the resource search set.
  for directory in [citadel.to_path_buf(), citadel.with_file_name("core")] {
    if !directory.is_dir() {
      continue;
    }
    for entry in std::fs::read_dir(directory)? {
      let path = entry?.path();
      if !path
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.ends_with("_dir.vpk"))
      {
        continue;
      }
      let archive = VpkArchive::open(&path).map_err(|error| {
        Error::ModInvalid(format!(
          "Failed to index model dependencies in {}: {error}",
          path.display()
        ))
      })?;
      available.extend(
        archive
          .list_entries()
          .iter()
          .map(|path| normalize_path(path)),
      );
    }
  }
  let mut warnings = Vec::new();
  for (path, inputs) in sources {
    for source in inputs {
      let bytes = repaired
        .get(path.as_str())
        .copied()
        .unwrap_or(&source.bytes);
      let mut add = |kind, detail| {
        warnings.push(AssetWarning {
          mod_id: source.mod_id.clone(),
          source_vpk: source.source_vpk.clone(),
          file_path: path.clone(),
          kind,
          detail,
        })
      };
      let Ok((_, value, _)) = decode_compiled_data(bytes, path) else {
        add(WarningKind::UnreadableResource, "DATA".into());
        continue;
      };
      if path.ends_with(".vnmskel_c") {
        if !valid_skeleton(
          &value,
          "m_boneIDs",
          "m_parentIndices",
          &[
            ("m_parentSpaceReferencePose", 8),
            ("m_modelSpaceReferencePose", 8),
          ],
        ) {
          add(
            WarningKind::InvalidSkeleton,
            "m_parentIndices / m_boneIDs / referencePose".into(),
          );
        }
        continue;
      }
      if let Some(rig) = value.get("m_modelSkeleton") {
        if !valid_skeleton(
          rig,
          "m_boneName",
          "m_nParent",
          &[
            ("m_bonePosParent", 3),
            ("m_boneRotParent", 4),
            ("m_boneScaleParent", 0),
          ],
        ) {
          add(WarningKind::InvalidSkeleton, "m_modelSkeleton".into());
        }
        if !valid_remapping(&value, rig) {
          add(
            WarningKind::InvalidBoneRemapping,
            "m_remappingTable / m_remappingTableStarts".into(),
          );
        }
      }
      for field in [
        "m_refMeshes",
        "m_refPhysicsData",
        "m_refPhysicsHitboxData",
        "m_vecNmSkeletonRefs",
        "m_refAnimGroups",
        "m_refAnimIncludeModels",
        "m_refSequenceGroups",
      ] {
        if let Some(refs) = value.get(field).and_then(Kv3Value::as_array) {
          for name in refs.iter().filter_map(Kv3Value::as_str) {
            if !resource_exists(name, available) {
              add(WarningKind::MissingResource, name.into());
            }
          }
        }
      }
      let Ok(resource) = Resource::parse(bytes) else {
        continue;
      };
      for block in resource.blocks().iter().filter(|block| {
        block.kind == *b"MDAT" || (path.ends_with(".vmesh_c") && block.kind == *b"DATA")
      }) {
        let data = &bytes[block.offset as usize..(block.offset as usize + block.size as usize)];
        let Ok(mesh) = kv3::decode(data) else {
          add(WarningKind::UnreadableResource, "MDAT".into());
          continue;
        };
        let model_bones = value
          .get("m_modelSkeleton")
          .and_then(|rig| rig.get("m_boneName"))
          .and_then(Kv3Value::as_array)
          .map(|names| names.iter().filter_map(Kv3Value::as_str).collect())
          .unwrap_or_default();
        for (kind, detail) in mesh_warnings(&mesh, &model_bones) {
          add(kind, detail);
        }
      }
    }
  }
  let mut seen = BTreeSet::new();
  warnings.retain(|warning| {
    seen.insert((
      warning.mod_id.clone(),
      warning.source_vpk.clone(),
      warning.file_path.clone(),
      warning.kind.clone(),
      warning.detail.clone(),
    ))
  });
  Ok(warnings)
}

fn resource_exists(name: &str, available: &BTreeSet<String>) -> bool {
  if name.is_empty() || name.contains('#') {
    return true;
  }
  let path = normalize_path(name);
  safe_path(&path) && (available.contains(&path) || available.contains(&format!("{path}_c")))
}

pub(super) fn valid_skeleton(
  rig: &Kv3Value,
  names_key: &str,
  parents_key: &str,
  pose_keys: &[(&str, usize)],
) -> bool {
  let Some(names) = rig.get(names_key).and_then(Kv3Value::as_array) else {
    return false;
  };
  let Some(parents) = rig.get(parents_key).and_then(Kv3Value::as_array) else {
    return false;
  };
  let unique: BTreeSet<_> = names
    .iter()
    .filter_map(Kv3Value::as_str)
    .filter(|name| !name.is_empty())
    .collect();
  if unique.len() != names.len() || parents.len() != names.len() {
    return false;
  }
  if pose_keys.iter().any(|(key, width)| {
    rig
      .get(key)
      .and_then(Kv3Value::as_array)
      .is_none_or(|poses| {
        poses.len() != names.len()
          || poses.iter().any(|pose| {
            if *width == 0 {
              return !pose.as_f64().is_some_and(f64::is_finite);
            }
            pose.as_array().is_none_or(|values| {
              values.len() != *width
                || !values
                  .iter()
                  .all(|value| value.as_f64().is_some_and(f64::is_finite))
            })
          })
      })
  }) {
    return false;
  }
  // Each node has one parent; finished paths keep cycle checking linear in bone count.
  let mut finished = vec![false; names.len()];
  for start in 0..names.len() {
    let mut visiting = BTreeSet::new();
    let mut node = start;
    while !finished[node] {
      if !visiting.insert(node) {
        return false;
      }
      let Some(parent) = parents[node].as_int() else {
        return false;
      };
      if parent == -1 {
        break;
      }
      let Ok(parent) = usize::try_from(parent) else {
        return false;
      };
      if parent >= names.len() {
        return false;
      }
      node = parent;
    }
    for node in visiting {
      finished[node] = true;
    }
  }
  true
}

fn valid_remapping(model: &Kv3Value, rig: &Kv3Value) -> bool {
  let Some(table) = model.get("m_remappingTable").and_then(Kv3Value::as_array) else {
    return true;
  };
  let Some(names) = rig.get("m_boneName").and_then(Kv3Value::as_array) else {
    return false;
  };
  if table.iter().any(|value| {
    value
      .as_int()
      .and_then(|index| usize::try_from(index).ok())
      .is_none_or(|index| index >= names.len())
  }) {
    return false;
  }
  let Some(starts) = model
    .get("m_remappingTableStarts")
    .and_then(Kv3Value::as_array)
  else {
    return table.is_empty();
  };
  let mut previous = 0;
  for start in starts {
    let Some(start) = start.as_int().and_then(|index| usize::try_from(index).ok()) else {
      return false;
    };
    if start < previous || start > table.len() {
      return false;
    }
    previous = start;
  }
  true
}

fn mesh_warnings(mesh: &Kv3Value, model_bones: &BTreeSet<&str>) -> Vec<(WarningKind, String)> {
  let mut warnings = Vec::new();
  let Some(bones) = mesh
    .get("m_skeleton")
    .and_then(|rig| rig.get("m_bones"))
    .and_then(Kv3Value::as_array)
  else {
    return warnings;
  };
  let mut names: BTreeSet<_> = bones
    .iter()
    .filter_map(|bone| bone.get("m_boneName").and_then(Kv3Value::as_str))
    .collect();
  let unique_mesh_bones = names.len() == bones.len();
  names.extend(model_bones);
  if !unique_mesh_bones
    || bones.iter().any(|bone| {
      bone
        .get("m_parentName")
        .and_then(Kv3Value::as_str)
        .is_none_or(|name| !name.is_empty() && !names.contains(name))
    })
  {
    warnings.push((WarningKind::InvalidSkeleton, "m_skeleton.m_bones".into()));
  }
  if let Some(attachments) = mesh.get("m_attachments").and_then(Kv3Value::as_array) {
    for attachment in attachments {
      let label = attachment
        .get("key")
        .and_then(Kv3Value::as_str)
        .unwrap_or("m_attachments");
      let valid = (|| {
        let value = attachment.get("value")?;
        let count = usize::try_from(value.get("m_nInfluences")?.as_int()?).ok()?;
        let influences = value.get("m_influenceNames")?.as_array()?;
        let roots = value.get("m_bInfluenceRootTransform")?.as_array()?;
        let weights = value.get("m_influenceWeights")?.as_array()?;
        if count > influences.len() || count > roots.len() || count > weights.len() {
          return Some(false);
        }
        Some((0..count).all(|i| {
          let rooted = roots[i] == Kv3Value::Bool(true);
          weights[i]
            .as_f64()
            .is_some_and(|weight| weight.is_finite() && weight >= 0.0)
            && (rooted
              || influences[i]
                .as_str()
                .is_some_and(|name| names.contains(name)))
        }))
      })();
      if valid != Some(true) {
        warnings.push((WarningKind::InvalidAttachment, label.into()));
      }
    }
  }
  if let Some(sets) = mesh.get("m_hitboxsets").and_then(Kv3Value::as_array) {
    for set in sets {
      if let Some(hitboxes) = set
        .get("value")
        .and_then(|value| value.get("m_HitBoxes"))
        .and_then(Kv3Value::as_array)
      {
        for hitbox in hitboxes {
          if let Some(name) = hitbox.get("m_sBoneName").and_then(Kv3Value::as_str)
            && !name.is_empty()
            && !names.contains(name)
          {
            warnings.push((WarningKind::InvalidHitbox, name.into()));
          }
        }
      }
    }
  }
  warnings
}

#[cfg(test)]
mod tests {
  use super::*;

  fn rig(parents: &[i64]) -> Kv3Value {
    Kv3Value::Object(vec![
      (
        "names".into(),
        Kv3Value::Array(
          (0..parents.len())
            .map(|i| Kv3Value::String(format!("bone{i}")))
            .collect(),
        ),
      ),
      (
        "parents".into(),
        Kv3Value::Array(parents.iter().copied().map(Kv3Value::Int).collect()),
      ),
      (
        "poses".into(),
        Kv3Value::Array(vec![
          Kv3Value::Array(vec![Kv3Value::Double(0.0); 3]);
          parents.len()
        ]),
      ),
    ])
  }

  #[test]
  fn skeleton_checks_reject_cycles_and_out_of_bounds_parents() {
    for parents in [&[-1, 0, 1][..], &[2, 0, -1][..], &[][..]] {
      assert!(valid_skeleton(
        &rig(parents),
        "names",
        "parents",
        &[("poses", 3)]
      ));
    }
    for parents in [&[1, 0][..], &[-1, 9][..], &[-1, -2][..], &[0][..]] {
      assert!(!valid_skeleton(
        &rig(parents),
        "names",
        "parents",
        &[("poses", 3)]
      ));
    }
  }

  #[test]
  fn dependencies_resolve_against_enabled_mods_and_compiled_game_paths() {
    let available = BTreeSet::from([
      "models/current.vnmskel_c".into(),
      "models/custom.vmesh_c".into(),
    ]);
    assert!(resource_exists("models/current.vnmskel", &available));
    assert!(resource_exists("MODELS\\custom.vmesh", &available));
    assert!(!resource_exists("models/missing.vmesh", &available));
    assert!(!resource_exists("models/../current.vnmskel", &available));
  }

  #[test]
  fn hitboxes_can_reference_model_bones_outside_the_mesh_subset() {
    let mesh = Kv3Value::Object(vec![
      (
        "m_skeleton".into(),
        Kv3Value::Object(vec![("m_bones".into(), Kv3Value::Array(Vec::new()))]),
      ),
      (
        "m_hitboxsets".into(),
        Kv3Value::Array(vec![Kv3Value::Object(vec![(
          "value".into(),
          Kv3Value::Object(vec![(
            "m_HitBoxes".into(),
            Kv3Value::Array(vec![Kv3Value::Object(vec![(
              "m_sBoneName".into(),
              Kv3Value::String("pelvis".into()),
            )])]),
          )]),
        )])]),
      ),
    ]);
    assert!(mesh_warnings(&mesh, &BTreeSet::from(["pelvis"])).is_empty());
    assert_eq!(
      mesh_warnings(&mesh, &BTreeSet::new()),
      vec![(WarningKind::InvalidHitbox, "pelvis".into())]
    );
  }

  #[test]
  fn skeleton_checks_reject_duplicate_bones_and_incomplete_poses() {
    let mut value = rig(&[-1, 0]);
    let Kv3Value::Array(names) = value.get_mut("names").unwrap() else {
      unreachable!()
    };
    names[1] = names[0].clone();
    assert!(!valid_skeleton(&value, "names", "parents", &[("poses", 3)]));
    let mut value = rig(&[-1, 0]);
    let Kv3Value::Array(poses) = value.get_mut("poses").unwrap() else {
      unreachable!()
    };
    poses.pop();
    assert!(!valid_skeleton(&value, "names", "parents", &[("poses", 3)]));
  }

  #[test]
  fn remapping_checks_reject_indices_outside_the_model_skeleton() {
    let rig = Kv3Value::Object(vec![(
      "m_boneName".into(),
      Kv3Value::Array(vec![Kv3Value::String("root".into())]),
    )]);
    let model = |index, starts| {
      Kv3Value::Object(vec![
        (
          "m_remappingTable".into(),
          Kv3Value::Array(vec![Kv3Value::Int(index)]),
        ),
        ("m_remappingTableStarts".into(), Kv3Value::Array(starts)),
      ])
    };
    assert!(valid_remapping(&model(0, vec![Kv3Value::Int(0)]), &rig));
    assert!(!valid_remapping(&model(1, vec![Kv3Value::Int(0)]), &rig));
    assert!(!valid_remapping(&model(0, vec![Kv3Value::Int(2)]), &rig));
  }

  #[test]
  fn mesh_attachment_checks_distinguish_root_space_from_missing_bones() {
    let mesh = |rooted| {
      Kv3Value::Object(vec![
        (
          "m_skeleton".into(),
          Kv3Value::Object(vec![("m_bones".into(), Kv3Value::Array(Vec::new()))]),
        ),
        (
          "m_attachments".into(),
          Kv3Value::Array(vec![Kv3Value::Object(vec![
            ("key".into(), Kv3Value::String("camera".into())),
            (
              "value".into(),
              Kv3Value::Object(vec![
                ("m_nInfluences".into(), Kv3Value::Int(1)),
                (
                  "m_influenceNames".into(),
                  Kv3Value::Array(vec![Kv3Value::String(String::new())]),
                ),
                (
                  "m_bInfluenceRootTransform".into(),
                  Kv3Value::Array(vec![Kv3Value::Bool(rooted)]),
                ),
                (
                  "m_influenceWeights".into(),
                  Kv3Value::Array(vec![Kv3Value::Double(1.0)]),
                ),
              ]),
            ),
          ])]),
        ),
      ])
    };
    assert!(mesh_warnings(&mesh(true), &BTreeSet::new()).is_empty());
    assert_eq!(
      mesh_warnings(&mesh(false), &BTreeSet::new()),
      vec![(WarningKind::InvalidAttachment, "camera".into())]
    );
  }
}
