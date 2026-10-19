use super::resources::{ResourceSnapshot, resource_path};
use super::{CompiledDataSource, Kv3Value, Resource, decode_compiled_data, kv3, normalize_path};
use crate::errors::Error;
use crate::mod_manager::vdata_history::VdataHistoryIndex;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RepairKind {
  AnimationSkeleton,
  AnimationSkeletonRebased,
  AnimationInterface,
  AnimationClipTracks,
  AnimationRigRebase,
  CameraInterface,
  CameraControls,
  CameraAttachmentFrame,
  MaterialBindings,
  ModelRelocation,
  TaggedSounds,
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
  MissingCameraInterface,
  OutdatedCameraAttachments,
  MissingSoundBindings,
  MissingAnimationInterface,
  AnimationMapping,
  UnreadableResource,
  MaterialMapping,
  MaterialInterface,
  ModelMapping,
  OverlappingModel,
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

pub(super) fn model_overlaps(
  resources: &ResourceSnapshot,
  mods: &[super::LocalizationModInput],
  scope: &super::repair_scope::RepairScope,
) -> Vec<AssetWarning> {
  let mut providers: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
  for input in mods {
    for archive in &input.vpks {
      let label = format!(
        "{}:{}",
        input.mod_id,
        archive.file_name().unwrap_or_default().to_string_lossy()
      );
      for path in resources
        .archive(archive)
        .list_entries()
        .into_iter()
        .filter(|path| super::model_camera::is_path(path))
      {
        providers
          .entry(normalize_path(&path))
          .or_default()
          .insert(label.clone());
      }
    }
  }
  let mut warnings = Vec::new();
  for (path, providers) in providers {
    if providers.len() < 2 || scope.protects(&path) {
      continue;
    }
    let Some(owner) = resources.provider(&path) else {
      continue;
    };
    let Some(mod_id) = owner.mod_id else {
      continue;
    };
    if !scope.includes_mod(&mod_id) {
      continue;
    }
    let source_vpk = owner
      .archive
      .file_name()
      .unwrap_or_default()
      .to_string_lossy()
      .into_owned();
    let detail = format!(
      "Load order uses {source_vpk}. Enabled archives providing this model: {}. Disable unused variations or skins to avoid mixing their animation and accessory files.",
      providers.into_iter().collect::<Vec<_>>().join(", ")
    );
    warnings.push(AssetWarning {
      mod_id,
      source_vpk,
      file_path: path,
      kind: WarningKind::OverlappingModel,
      detail,
    });
  }
  warnings
}

/// Mod-only models with warnings that nothing loads. The game cannot reference
/// a path it does not ship, so such a model loads only when a mod file that
/// replaces a game path, or an old hero model that relocation moves, reaches it
/// through resource references.
pub(super) fn unloaded_models(
  resources: &ResourceSnapshot,
  history: &VdataHistoryIndex,
  warnings: &[AssetWarning],
) -> Result<Vec<String>, Error> {
  let mod_models: BTreeSet<&str> = resources
    .mod_paths()
    .map(String::as_str)
    .filter(|path| super::model_camera::is_path(path) && !resources.has_game_resource(path))
    .collect();
  let mut candidates: BTreeSet<&str> = warnings
    .iter()
    .map(|warning| warning.file_path.as_str())
    .filter(|path| mod_models.contains(path))
    .collect();
  if candidates.is_empty() {
    return Ok(Vec::new());
  }
  let relocated = super::model_relocation::historical_hero_models(
    resources,
    history,
    mod_models.iter().copied(),
  )?;
  let mut pending: Vec<String> = resources
    .mod_paths()
    .filter(|path| resources.has_game_resource(path) || relocated.contains(*path))
    .cloned()
    .collect();
  for path in &relocated {
    candidates.remove(path.as_str());
  }
  let mut visited = BTreeSet::new();
  while let Some(path) = pending.pop() {
    if candidates.is_empty() {
      break;
    }
    if !visited.insert(path.clone()) || !may_reference_models(&path) {
      continue;
    }
    let bytes = match resources.resolve(&path) {
      Ok(Some((_, bytes))) => bytes,
      Ok(None) => continue,
      // An unread file may reference any candidate, so none is proven unloaded.
      Err(error) => {
        log::warn!("Could not read {path} while tracing model references: {error}");
        return Ok(Vec::new());
      }
    };
    for name in referenced_names(&path, &bytes)
      .iter()
      .filter_map(|name| resource_path(name))
    {
      if resources
        .provider(&name)
        .is_some_and(|provider| provider.mod_id.is_some())
      {
        candidates.remove(name.as_str());
        pending.push(name);
      }
    }
  }
  Ok(candidates.into_iter().map(str::to_owned).collect())
}

fn may_reference_models(path: &str) -> bool {
  path.ends_with("_c")
    && ![
      ".vtex_c",
      ".vsnd_c",
      ".vmat_c",
      ".vmesh_c",
      ".vphys_c",
      ".vnmclip_c",
      ".vnmskel_c",
    ]
    .iter()
    .any(|suffix| path.ends_with(suffix))
}

/// Compiled resources list their dependencies in RERL. VData also names
/// resources in plain string fields, such as a hero's model path.
fn referenced_names(path: &str, bytes: &[u8]) -> Vec<String> {
  let mut names: Vec<_> = vpkmanager::material_repair::references(bytes)
    .map(|references| references.into_iter().map(|(_, name)| name).collect())
    .unwrap_or_default();
  if path.ends_with(".vdata_c")
    && let Ok((_, root, _)) = decode_compiled_data(bytes, path)
  {
    collect_strings(&root, &mut names);
  }
  names
}

fn collect_strings(value: &Kv3Value, names: &mut Vec<String>) {
  match value {
    Kv3Value::String(text) => names.push(text.clone()),
    Kv3Value::Array(values) => {
      for value in values {
        collect_strings(value, names);
      }
    }
    Kv3Value::Object(rows) => {
      for (_, value) in rows {
        collect_strings(value, names);
      }
    }
    _ => {}
  }
}

pub(super) fn is_mesh_path(path: &str) -> bool {
  let path = normalize_path(path);
  path.starts_with("models/") && path.ends_with(".vmesh_c") && safe_path(&path)
}

fn safe_path(path: &str) -> bool {
  path.split('/').all(|part| !matches!(part, "" | "." | ".."))
}

pub(super) fn analyze(
  resources: &ResourceSnapshot,
  sources: &BTreeMap<String, Vec<CompiledDataSource>>,
  repaired: &BTreeMap<&str, &[u8]>,
) -> Result<Vec<AssetWarning>, Error> {
  if sources.is_empty() {
    return Ok(Vec::new());
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
            if !resource_exists(name, resources) {
              add(WarningKind::MissingResource, name.into());
            }
          }
        }
      }
      if path.ends_with(".vmdl_c") {
        let graphs = value
          .get("m_animGraph2Refs")
          .and_then(Kv3Value::as_array)
          .into_iter()
          .flatten()
          .filter_map(|graph| graph.get("m_hGraph").and_then(Kv3Value::as_str));
        for name in graphs.chain(super::model_camera::legacy_animation_graph(&value)) {
          if !resource_exists(name, resources) {
            add(WarningKind::MissingResource, name.into());
          }
        }
        if let Some(base) = resources.game_bytes(path)?
          && let Ok((_, vanilla, _)) = decode_compiled_data(&base, path)
        {
          for field in super::model_camera::missing_camera_fields(&value, &vanilla) {
            add(WarningKind::MissingCameraInterface, field);
          }
          if super::model_sounds::missing(&value, &vanilla) {
            add(
              WarningKind::MissingSoundBindings,
              "TaggedSoundSettings_t".into(),
            );
          }
          let missing = missing_animation_fields(&value, &vanilla);
          if !missing.is_empty() {
            add(WarningKind::MissingAnimationInterface, missing.join(" / "));
          }
        }
      }
      let Ok(resource) = Resource::parse(bytes) else {
        continue;
      };
      for (index, block) in resource.blocks().iter().enumerate().filter(|(_, block)| {
        block.kind == *b"MDAT" || (path.ends_with(".vmesh_c") && block.kind == *b"DATA")
      }) {
        let Some(data) = resource.get_block_by_index(index) else {
          add(
            WarningKind::UnreadableResource,
            String::from_utf8_lossy(&block.kind).into_owned(),
          );
          continue;
        };
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

fn missing_animation_fields(source: &Kv3Value, current: &Kv3Value) -> Vec<&'static str> {
  ["m_animGraph2Refs", "m_vecNmSkeletonRefs"]
    .into_iter()
    .filter(|field| {
      current
        .get(field)
        .and_then(Kv3Value::as_array)
        .is_some_and(|values| !values.is_empty())
        && source
          .get(field)
          .and_then(Kv3Value::as_array)
          .is_none_or(|values| values.is_empty())
    })
    .collect()
}

fn resource_exists(name: &str, resources: &ResourceSnapshot) -> bool {
  if name.is_empty() || name.contains('#') {
    return true;
  }
  resources.provider(name).is_some()
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

pub(super) fn mesh_warnings(
  mesh: &Kv3Value,
  model_bones: &BTreeSet<&str>,
) -> Vec<(WarningKind, String)> {
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

  #[test]
  fn models_are_unloaded_until_a_loaded_file_references_them() {
    use super::super::resources::tests::pack;
    use super::super::tests::compiled_resource;
    let root = tempfile::tempdir().unwrap();
    let citadel = root.path().join("citadel");
    std::fs::create_dir_all(&citadel).unwrap();
    let table = "scripts/custom.vdata_c";
    let replaced = "models/heroes/hero.vmdl_c";
    pack(
      &citadel,
      "pak01",
      &[
        (table, &compiled_resource(vec![])),
        (replaced, b"game model"),
      ],
    );
    let backup = "models/heroes/hero_backup.vmdl_c";
    let referencing = |model: &str| {
      compiled_resource(vec![(
        "row".into(),
        Kv3Value::Object(vec![(
          "m_strModelName".into(),
          Kv3Value::String(model.into()),
        )]),
      )])
    };
    let warnings = [backup, replaced].map(|file_path| AssetWarning {
      mod_id: "skin".into(),
      source_vpk: "skin_dir.vpk".into(),
      file_path: file_path.into(),
      kind: WarningKind::MissingResource,
      detail: "models/heroes/hero.vanmgrph".into(),
    });
    let unloaded = |name: &str, entries: &[(&str, &[u8])]| {
      let mods = [super::super::LocalizationModInput {
        mod_id: "skin".into(),
        vpks: vec![pack(root.path(), name, entries)],
      }];
      let resources = ResourceSnapshot::open(&citadel, &mods).unwrap();
      unloaded_models(&resources, VdataHistoryIndex::embedded(), &warnings).unwrap()
    };
    let model: &[u8] = b"mod model";
    assert_eq!(
      unloaded("alone", &[(backup, model), (replaced, model)]),
      [backup]
    );
    let custom_table = referencing("models/heroes/hero_backup.vmdl");
    assert_eq!(
      unloaded(
        "unloaded_referrer",
        &[(backup, model), ("scripts/mod_only.vdata_c", &custom_table)]
      ),
      [backup],
      "a mod-only file that references the model is not loaded itself"
    );
    assert!(unloaded("referenced", &[(backup, model), (table, &custom_table)]).is_empty());
  }

  #[test]
  fn legacy_models_report_missing_current_animation_bindings_without_guessing_a_repair() {
    let empty = Kv3Value::Object(vec![]);
    let current = Kv3Value::Object(vec![
      (
        "m_animGraph2Refs".into(),
        Kv3Value::Array(vec![Kv3Value::String("graph.vnmgraph".into())]),
      ),
      (
        "m_vecNmSkeletonRefs".into(),
        Kv3Value::Array(vec![Kv3Value::String("rig.vnmskel".into())]),
      ),
    ]);
    assert_eq!(
      missing_animation_fields(&empty, &current),
      vec!["m_animGraph2Refs", "m_vecNmSkeletonRefs"]
    );
    assert!(missing_animation_fields(&current, &current).is_empty());
    assert!(missing_animation_fields(&empty, &empty).is_empty());
  }

  #[test]
  fn model_only_mods_report_missing_embedded_animation_dependencies() {
    let root = tempfile::tempdir().unwrap();
    let resources = ResourceSnapshot::open(root.path(), &[]).unwrap();
    let model = super::super::tests::compiled_resource(vec![
      (
        "m_modelInfo".into(),
        Kv3Value::Object(vec![(
          "m_keyValueText".into(),
          Kv3Value::String("{ anim_graph_resource = resource:\"models/old.vanmgrph\" }".into()),
        )]),
      ),
      (
        "m_animGraph2Refs".into(),
        Kv3Value::Array(vec![Kv3Value::Object(vec![(
          "m_hGraph".into(),
          Kv3Value::String("animgraphs/missing.vnmgraph".into()),
        )])]),
      ),
    ]);
    let source = CompiledDataSource {
      mod_id: "talon".into(),
      source_vpk: "talon_dir.vpk".into(),
      bytes: model,
      priority: 0,
    };
    let warnings = analyze(
      &resources,
      &BTreeMap::from([("models/talon.vmdl_c".into(), vec![source])]),
      &BTreeMap::new(),
    )
    .unwrap();
    let missing: BTreeSet<_> = warnings
      .iter()
      .filter(|warning| warning.kind == WarningKind::MissingResource)
      .map(|warning| warning.detail.as_str())
      .collect();
    assert_eq!(
      missing,
      BTreeSet::from(["models/old.vanmgrph", "animgraphs/missing.vnmgraph"])
    );
    assert!(warnings.iter().all(|warning| warning.mod_id == "talon"));
  }

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
    let root = tempfile::tempdir().unwrap();
    std::fs::create_dir(root.path().join("models")).unwrap();
    for path in ["models/current.vnmskel_c", "models/custom.vmesh_c"] {
      std::fs::write(root.path().join(path), b"present").unwrap();
    }
    let resources = ResourceSnapshot::open(root.path(), &[]).unwrap();
    assert!(resource_exists("models/current.vnmskel", &resources));
    assert!(resource_exists("MODELS\\custom.vmesh", &resources));
    assert!(!resource_exists("models/missing.vmesh", &resources));
    assert!(!resource_exists("models/../current.vnmskel", &resources));
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
