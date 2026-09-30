use super::animation_skeleton::equivalent_pose;
use super::{
  CompiledDataSource, Kv3Value, Resource, asset_compatibility, decode_compiled_data, kv3,
  normalize_path,
};
use source2_model::vpk_extract::VpkArchive;
use std::collections::{BTreeMap, BTreeSet};

/// Additional evidence for sampling changes. The model's deformation rig is never replaced.
pub(super) struct ModelEvidence {
  old: ModelRig,
  current: ModelRig,
  unused_current_bones: BTreeSet<String>,
}

struct ModelRig {
  value: Kv3Value,
  indices: BTreeMap<String, usize>,
}

impl ModelRig {
  fn parse(model: &Kv3Value) -> Option<Self> {
    let value = model.get("m_modelSkeleton")?.clone();
    if !asset_compatibility::valid_skeleton(
      &value,
      "m_boneName",
      "m_nParent",
      &[
        ("m_bonePosParent", 3),
        ("m_boneRotParent", 4),
        ("m_boneScaleParent", 0),
      ],
    ) {
      return None;
    }
    let indices = value
      .get("m_boneName")?
      .as_array()?
      .iter()
      .enumerate()
      .map(|(index, name)| Some((name.as_str()?.to_owned(), index)))
      .collect::<Option<BTreeMap<_, _>>>()?;
    if indices.is_empty() {
      return None;
    }
    Some(Self { value, indices })
  }

  fn parent(&self, name: &str) -> Option<&str> {
    let index = *self.indices.get(name)?;
    let parent = self
      .value
      .get("m_nParent")?
      .as_array()?
      .get(index)?
      .as_int()?;
    if parent == -1 {
      Some("")
    } else {
      self
        .value
        .get("m_boneName")?
        .as_array()?
        .get(usize::try_from(parent).ok()?)?
        .as_str()
    }
  }

  fn pose(&self, name: &str) -> Option<Kv3Value> {
    let index = *self.indices.get(name)?;
    let position = self
      .value
      .get("m_bonePosParent")?
      .as_array()?
      .get(index)?
      .as_array()?;
    let rotation = self
      .value
      .get("m_boneRotParent")?
      .as_array()?
      .get(index)?
      .as_array()?;
    let scale = self
      .value
      .get("m_boneScaleParent")?
      .as_array()?
      .get(index)?;
    Some(Kv3Value::Array(
      position
        .iter()
        .chain(std::iter::once(scale))
        .chain(rotation)
        .cloned()
        .collect(),
    ))
  }
}

#[derive(Default)]
pub(super) struct AnimationInputs {
  mod_ids: BTreeSet<String>,
  has_current_overrides: bool,
}

impl AnimationInputs {
  pub(super) fn record(&mut self, path: &str, mod_id: &str) {
    if is_animation_path(path) {
      self.mod_ids.insert(mod_id.to_owned());
      // Legacy graphs cannot replace the active NM graphs required by this proof.
      // A legacy graph belonging to the skeleton's own mod still prevents migration.
      self.has_current_overrides |= !normalize_path(path).ends_with(".vanmgrph_c");
    }
  }
}

fn is_animation_path(path: &str) -> bool {
  let path = normalize_path(path);
  path.starts_with("animations/")
    || path.starts_with("animgraphs/")
    || [
      ".vanim_c",
      ".vnmgraph_c",
      ".vnmclip_c",
      ".vagrp_c",
      ".vseq_c",
      ".vanmgrph_c",
    ]
    .iter()
    .any(|suffix| path.ends_with(suffix))
}

pub(super) fn find(
  archive: &VpkArchive,
  game_paths: &BTreeMap<String, String>,
  models: &BTreeMap<String, Vec<CompiledDataSource>>,
  animation_inputs: &AnimationInputs,
  source: &CompiledDataSource,
  skeleton_path: &str,
) -> Option<ModelEvidence> {
  // Custom current animation data could still use the retired sampling layout.
  if animation_inputs.has_current_overrides || animation_inputs.mod_ids.contains(&source.mod_id) {
    return None;
  }
  let mut candidates = Vec::new();
  for (path, sources) in models {
    let Some(base_path) = game_paths.get(path) else {
      continue;
    };
    let matching = sources
      .iter()
      .map(|model| decode_compiled_data(&model.bytes, path).ok())
      .collect::<Option<Vec<_>>>()?;
    if !matching
      .iter()
      .any(|(_, model, _)| references_skeleton(model, skeleton_path))
    {
      continue;
    }
    let [model_source] = sources.as_slice() else {
      return None;
    };
    if model_source.mod_id != source.mod_id
      || model_source.priority != source.priority
      || model_source.source_vpk != source.source_vpk
    {
      return None;
    }
    let (_, model, _) = matching.into_iter().next()?;
    let current_bytes = archive.extract_entry(base_path).ok()?;
    let (_, current, _) = decode_compiled_data(&current_bytes, path).ok()?;
    if !references_skeleton(&current, skeleton_path) {
      return None;
    }
    let resource = Resource::parse(&current_bytes).ok()?;
    let meshes = resource
      .blocks()
      .iter()
      .filter(|block| block.kind == *b"MDAT")
      .map(|block| {
        kv3::decode(
          &current_bytes[block.offset as usize..(block.offset as usize + block.size as usize)],
        )
        .ok()
      })
      .collect::<Option<Vec<_>>>();
    candidates.push(ModelEvidence::from_models(
      &model,
      &current,
      meshes.as_deref(),
    )?);
  }
  if candidates.len() != 1 {
    return None;
  }
  candidates.pop()
}

fn references_skeleton(model: &Kv3Value, path: &str) -> bool {
  model
    .get("m_vecNmSkeletonRefs")
    .and_then(Kv3Value::as_array)
    .is_some_and(|refs| {
      refs.len() == 1
        && refs[0].as_str().is_some_and(|name| {
          let name = normalize_path(name);
          name == path || format!("{name}_c") == path
        })
    })
}

fn graphs(model: &Kv3Value) -> Option<BTreeMap<String, String>> {
  let mut graphs = BTreeMap::new();
  for graph in model.get("m_animGraph2Refs")?.as_array()? {
    let name = graph.get("m_sIdentifier")?.as_str()?.to_ascii_lowercase();
    let path = normalize_path(graph.get("m_hGraph")?.as_str()?);
    if path.is_empty() || graphs.insert(name, path).is_some() {
      return None;
    }
  }
  (!graphs.is_empty()).then_some(graphs)
}

fn contains_bone(value: &Kv3Value, name: &str) -> bool {
  match value {
    Kv3Value::String(value) => value == name,
    Kv3Value::Array(values) => values.iter().any(|value| contains_bone(value, name)),
    Kv3Value::Object(fields) => fields.iter().any(|(_, value)| contains_bone(value, name)),
    _ => false,
  }
}

impl ModelEvidence {
  pub(super) fn from_models(
    old: &Kv3Value,
    current: &Kv3Value,
    meshes: Option<&[Kv3Value]>,
  ) -> Option<Self> {
    if graphs(old)? != graphs(current)? {
      return None;
    }
    for field in ["m_refAnimGroups", "m_refSequenceGroups"] {
      if !old.get(field)?.as_array()?.is_empty() || !current.get(field)?.as_array()?.is_empty() {
        return None;
      }
    }
    let old = ModelRig::parse(old)?;
    let rig = ModelRig::parse(current)?;
    let mut unused_current_bones = BTreeSet::new();
    if current
      .get("m_refMeshes")
      .and_then(Kv3Value::as_array)
      .is_some_and(|refs| refs.is_empty())
      && let Some(meshes) = meshes.filter(|meshes| !meshes.is_empty())
      && meshes.iter().all(|mesh| {
        mesh
          .get("m_skeleton")
          .and_then(|rig| rig.get("m_bones"))
          .and_then(Kv3Value::as_array)
          .is_some()
      })
      && meshes.iter().all(|mesh| {
        mesh
          .get("m_constraints")
          .and_then(Kv3Value::as_array)
          .is_some_and(|constraints| constraints.is_empty())
      })
      && let Some(spheres) = rig
        .value
        .get("m_boneSphere")
        .and_then(Kv3Value::as_array)
        .filter(|spheres| spheres.len() == rig.indices.len())
    {
      for (name, index) in &rig.indices {
        if spheres[*index].as_f64() == Some(0.0)
          && !meshes.iter().any(|mesh| contains_bone(mesh, name))
        {
          unused_current_bones.insert(name.clone());
        }
      }
    }
    Some(Self {
      old,
      current: rig,
      unused_current_bones,
    })
  }

  /// Removed samples must form closed branches. Their deformation bones either
  /// remain unchanged in both model rigs, or are virtual samples absent from both.
  pub(super) fn permits_removed(&self, name: &str, parent: &str) -> bool {
    match (
      self.old.indices.contains_key(name),
      self.current.indices.contains_key(name),
    ) {
      (false, false) => true,
      (true, true) => {
        self.old.parent(name) == Some(parent)
          && self.current.parent(name) == Some(parent)
          && self
            .old
            .pose(name)
            .zip(self.current.pose(name))
            .is_some_and(|(a, b)| equivalent_pose(&a, &b) == Some(true))
      }
      _ => false,
    }
  }

  /// An added control must be a leaf, unused by embedded meshes or their interfaces,
  /// and anchored to a retained bone whose model bind transform is unchanged.
  pub(super) fn permits_added(&self, name: &str, parent: &str, pose: &Kv3Value) -> bool {
    self.unused_current_bones.contains(name)
      && !self.old.indices.contains_key(name)
      && self.current.parent(name) == Some(parent)
      && self
        .old
        .pose(parent)
        .zip(self.current.pose(parent))
        .is_some_and(|(a, b)| equivalent_pose(&a, &b) == Some(true))
      && self
        .current
        .pose(name)
        .is_some_and(|bind| equivalent_pose(pose, &bind) == Some(true))
      && !self
        .current
        .value
        .get("m_nParent")
        .and_then(Kv3Value::as_array)
        .is_some_and(|parents| {
          parents.iter().any(|parent| {
            parent.as_int() == self.current.indices.get(name).map(|index| *index as i64)
          })
        })
  }

  /// A large authored pose difference is accepted only when each sampling pose
  /// agrees with its own model's bind pose. Both world transforms must also agree
  /// with their own parent/local transforms (checked by the sampling comparer).
  pub(super) fn permits_pose(
    &self,
    name: &str,
    parent: &str,
    old: &Kv3Value,
    current: &Kv3Value,
  ) -> bool {
    self.old.parent(name) == Some(parent)
      && self.current.parent(name) == Some(parent)
      && self
        .old
        .pose(name)
        .is_some_and(|bind| equivalent_pose(old, &bind) == Some(true))
      && self
        .current
        .pose(name)
        .is_some_and(|bind| equivalent_pose(current, &bind) == Some(true))
  }
}
