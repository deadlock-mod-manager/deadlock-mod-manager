use super::animation_skeleton::equivalent_pose;
use super::{
  CompiledDataSource, Kv3Value, Resource, asset_compatibility, decode_compiled_data, kv3,
  normalize_path, resources::ResourceSnapshot,
};
use std::collections::{BTreeMap, BTreeSet};

/// Additional evidence for sampling changes. The model's deformation rig is never replaced.
pub(super) struct ModelEvidence {
  old: ModelRig,
  current: ModelRig,
  unused_current_bones: BTreeSet<String>,
}

pub(super) struct ModelRig {
  value: Kv3Value,
  indices: BTreeMap<String, usize>,
}

impl ModelRig {
  pub(super) fn names(&self) -> impl Iterator<Item = &str> {
    self.indices.keys().map(String::as_str)
  }
  pub(super) fn parse(model: &Kv3Value) -> Option<Self> {
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

  pub(super) fn parent(&self, name: &str) -> Option<&str> {
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

  pub(super) fn pose(&self, name: &str) -> Option<Kv3Value> {
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
  overrides: BTreeMap<String, String>,
}

impl AnimationInputs {
  pub(super) fn needs_dependency_proof(&self, mod_id: &str) -> bool {
    !self.overrides.is_empty() || self.mod_ids.contains(mod_id)
  }

  pub(super) fn permits_camera_controls(
    &self,
    resources: &ResourceSnapshot,
    current: &Kv3Value,
    mod_id: &str,
  ) -> bool {
    // Authored animations in the model's own mod still need a migration proof.
    if self.mod_ids.contains(mod_id) {
      return false;
    }
    let Some(references) = current
      .get("m_vecNmSkeletonRefs")
      .and_then(Kv3Value::as_array)
    else {
      return false;
    };
    let [reference] = references else {
      return false;
    };
    let Some(skeleton) = reference.as_str().and_then(super::resources::resource_path) else {
      return false;
    };
    if !skeleton.ends_with(".vnmskel_c")
      || resources
        .provider(&skeleton)
        .is_none_or(|provider| provider.mod_id.is_some())
    {
      return false;
    }
    // Reuse the graph-closure proof instead of treating every animation override
    // in the library as an override of this model's camera controls.
    self.unrelated(resources, current, &skeleton)
  }

  pub(super) fn record(&mut self, path: &str, mod_id: &str) {
    if is_animation_path(path) {
      self.mod_ids.insert(mod_id.to_owned());
      // Legacy graphs cannot replace the active NM graphs required by this proof.
      // A legacy graph belonging to the skeleton's own mod still prevents migration.
      let path = normalize_path(path);
      if !path.ends_with(".vanmgrph_c") {
        self
          .overrides
          .entry(path)
          .or_insert_with(|| mod_id.to_owned());
      }
    }
  }

  /// Prove that effective overrides neither enter this model's graph closure nor
  /// sample this skeleton through another graph. Unknown animation formats fail closed.
  fn unrelated(&self, resources: &ResourceSnapshot, model: &Kv3Value, skeleton: &str) -> bool {
    if self.overrides.is_empty() {
      return true;
    }
    let Some(bindings) = graphs(model) else {
      return false;
    };
    let mut visited = BTreeSet::new();
    let mut visiting = BTreeSet::new();
    for graph in bindings.values() {
      if !walk_animation(
        resources,
        graph,
        skeleton,
        true,
        &mut visited,
        &mut visiting,
      ) {
        return false;
      }
    }
    visited.clear();
    for path in self.overrides.keys() {
      if !walk_animation(
        resources,
        path,
        skeleton,
        false,
        &mut visited,
        &mut visiting,
      ) {
        return false;
      }
    }
    true
  }
}

fn walk_animation(
  resources: &ResourceSnapshot,
  name: &str,
  skeleton: &str,
  model_closure: bool,
  visited: &mut BTreeSet<String>,
  visiting: &mut BTreeSet<String>,
) -> bool {
  let Some(path) = super::resources::resource_path(name) else {
    return false;
  };
  if !path.ends_with(".vnmclip_c") && !path.ends_with(".vnmgraph_c") {
    return false;
  }
  if visited.contains(&path) {
    return true;
  }
  if visiting.len() >= 64 || visited.len() >= 4096 || !visiting.insert(path.clone()) {
    return false;
  }
  let Some((provider, bytes)) = resources.resolve(&path).ok().flatten() else {
    return false;
  };
  if model_closure && provider.mod_id.is_some() {
    return false;
  }
  let Ok((_, root, _)) = decode_compiled_data(&bytes, &path) else {
    return false;
  };
  let binding = root.get("m_skeleton").map(|value| {
    value
      .as_str()
      .and_then(super::resources::resource_path)
      .is_some_and(|reference| {
        reference.ends_with(".vnmskel_c")
          && if model_closure {
            reference == skeleton
          } else {
            reference != skeleton
          }
      })
  });
  let valid = if path.ends_with(".vnmclip_c") {
    binding == Some(true)
  } else if path.ends_with(".vnmgraph_c") {
    root
      .get("m_resources")
      .and_then(Kv3Value::as_array)
      .is_some_and(|refs| {
        // Event graphs can be leaves. Their explicit skeleton binding supplies
        // the evidence that would otherwise come from child graphs or clips.
        binding != Some(false)
          && (!refs.is_empty() || binding == Some(true))
          && refs.iter().all(|reference| {
            reference.as_str().is_some_and(|name| {
              // Installed graphs can retain references to optional, absent clips.
              // A verified game graph binding proves its target, and an absent
              // provider cannot introduce an override into this closure.
              let absent_clip = model_closure
                && binding == Some(true)
                && super::resources::resource_path(name).is_some_and(|path| {
                  path.ends_with(".vnmclip_c") && resources.provider(&path).is_none()
                });
              absent_clip
                || walk_animation(resources, name, skeleton, model_closure, visited, visiting)
            })
          })
      })
  } else {
    false
  };
  visiting.remove(&path);
  if valid {
    visited.insert(path);
  }
  valid
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
  resources: &ResourceSnapshot,
  models: &BTreeMap<String, Vec<CompiledDataSource>>,
  animation_inputs: &AnimationInputs,
  source: &CompiledDataSource,
  skeleton_path: &str,
) -> Option<ModelEvidence> {
  // Custom current animation data could still use the retired sampling layout.
  if animation_inputs.mod_ids.contains(&source.mod_id) {
    return None;
  }
  let mut candidates = Vec::new();
  for (path, sources) in models {
    let Some(current_bytes) = resources.game_bytes(path).ok()? else {
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
    let (_, current, _) = decode_compiled_data(&current_bytes, path).ok()?;
    if !references_skeleton(&current, skeleton_path) {
      return None;
    }
    if !animation_inputs.unrelated(resources, &current, skeleton_path) {
      return None;
    }
    let resource = Resource::parse(&current_bytes).ok()?;
    let meshes = resource
      .blocks()
      .iter()
      .enumerate()
      .filter(|(_, block)| block.kind == *b"MDAT")
      .map(|(index, _)| kv3::decode(resource.get_block_by_index(index)?).ok())
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

pub(super) fn graphs(model: &Kv3Value) -> Option<BTreeMap<String, String>> {
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

#[cfg(test)]
mod tests {
  use super::super::{LocalizationModInput, resources::tests::pack, tests::compiled_resource};
  use super::*;

  fn clip(skeleton: &str) -> Vec<u8> {
    compiled_resource(vec![(
      "m_skeleton".into(),
      Kv3Value::String(skeleton.into()),
    )])
  }

  fn graph(resources: &[&str]) -> Vec<u8> {
    compiled_resource(vec![(
      "m_resources".into(),
      Kv3Value::Array(
        resources
          .iter()
          .map(|name| Kv3Value::String((*name).into()))
          .collect(),
      ),
    )])
  }

  #[test]
  fn camera_control_proof_distinguishes_unrelated_and_affected_overrides() {
    let game_graph = compiled_resource(vec![
      (
        "m_skeleton".into(),
        Kv3Value::String("models/a.vnmskel".into()),
      ),
      ("m_resources".into(), Kv3Value::Array(vec![])),
    ]);
    let skeleton = compiled_resource(vec![]);
    let model = compiled_resource(vec![
      (
        "m_vecNmSkeletonRefs".into(),
        Kv3Value::Array(vec![Kv3Value::String("models/a.vnmskel".into())]),
      ),
      (
        "m_animGraph2Refs".into(),
        Kv3Value::Array(vec![Kv3Value::Object(vec![
          ("m_sIdentifier".into(), Kv3Value::String("default".into())),
          (
            "m_hGraph".into(),
            Kv3Value::String("animgraphs/a.vnmgraph".into()),
          ),
        ])]),
      ),
    ]);
    let (_, model, _) = decode_compiled_data(&model, "camera test model").unwrap();
    for (path, bytes, owner, allowed) in [
      (
        "animations/b.vnmclip_c",
        clip("models/b.vnmskel"),
        "other",
        true,
      ),
      (
        "animations/b.vnmclip_c",
        clip("models/a.vnmskel"),
        "other",
        false,
      ),
      ("models/a.vnmskel_c", skeleton.clone(), "other", false),
      (
        "animgraphs/a.vnmgraph_c",
        game_graph.clone(),
        "other",
        false,
      ),
      (
        "animations/b.vanim_c",
        clip("models/b.vnmskel"),
        "other",
        false,
      ),
      (
        "animations/b.vnmclip_c",
        clip("models/b.vnmskel"),
        "skin",
        false,
      ),
    ] {
      let temp = tempfile::tempdir().unwrap();
      let citadel = temp.path().join("citadel");
      std::fs::create_dir_all(&citadel).unwrap();
      pack(
        &citadel,
        "pak01",
        &[
          ("animgraphs/a.vnmgraph_c", &game_graph),
          ("models/a.vnmskel_c", &skeleton),
        ],
      );
      let other = pack(temp.path(), "other", &[(path, &bytes)]);
      let resources = ResourceSnapshot::open(
        &citadel,
        &[LocalizationModInput {
          mod_id: owner.into(),
          vpks: vec![other],
        }],
      )
      .unwrap();
      let mut inputs = AnimationInputs::default();
      inputs.record(path, owner);
      assert_eq!(
        inputs.permits_camera_controls(&resources, &model, "skin"),
        allowed,
        "{owner}:{path}"
      );
    }
  }

  #[test]
  fn dependency_proof_accepts_skeleton_bound_graphs_without_child_resources() {
    let temp = tempfile::tempdir().unwrap();
    let citadel = temp.path().join("citadel");
    std::fs::create_dir_all(&citadel).unwrap();
    let event_graph = compiled_resource(vec![
      (
        "m_skeleton".into(),
        Kv3Value::String("models/a.vnmskel".into()),
      ),
      ("m_resources".into(), Kv3Value::Array(vec![])),
    ]);
    let root_graph = graph(&["animgraphs/events.vnmgraph"]);
    pack(
      &citadel,
      "pak01",
      &[
        ("animgraphs/a.vnmgraph_c", &root_graph),
        ("animgraphs/events.vnmgraph_c", &event_graph),
      ],
    );
    let other = clip("models/b.vnmskel");
    let archive = pack(temp.path(), "other", &[("animations/b.vnmclip_c", &other)]);
    let snapshot = ResourceSnapshot::open(
      &citadel,
      &[LocalizationModInput {
        mod_id: "other".into(),
        vpks: vec![archive],
      }],
    )
    .unwrap();
    let model = Kv3Value::Object(vec![(
      "m_animGraph2Refs".into(),
      Kv3Value::Array(vec![Kv3Value::Object(vec![
        ("m_sIdentifier".into(), Kv3Value::String("default".into())),
        (
          "m_hGraph".into(),
          Kv3Value::String("animgraphs/a.vnmgraph".into()),
        ),
      ])]),
    )]);
    let mut inputs = AnimationInputs::default();
    inputs.record("animations/b.vnmclip_c", "other");
    assert!(inputs.unrelated(&snapshot, &model, "models/a.vnmskel_c"));
  }

  #[test]
  fn missing_game_clips_require_a_verified_binding_and_no_override() {
    let model = Kv3Value::Object(vec![(
      "m_animGraph2Refs".into(),
      Kv3Value::Array(vec![Kv3Value::Object(vec![
        ("m_sIdentifier".into(), Kv3Value::String("default".into())),
        (
          "m_hGraph".into(),
          Kv3Value::String("animgraphs/a.vnmgraph".into()),
        ),
      ])]),
    )]);
    for (binding, child, override_missing, allowed) in [
      (
        Some("models/a.vnmskel"),
        "animations/optional.vnmclip",
        false,
        true,
      ),
      (None, "animations/optional.vnmclip", false, false),
      (
        Some("models/b.vnmskel"),
        "animations/optional.vnmclip",
        false,
        false,
      ),
      (
        Some("models/a.vnmskel"),
        "animgraphs/missing.vnmgraph",
        false,
        false,
      ),
      (
        Some("models/a.vnmskel"),
        "animations/optional.vnmclip",
        true,
        false,
      ),
    ] {
      let temp = tempfile::tempdir().unwrap();
      let citadel = temp.path().join("citadel");
      std::fs::create_dir_all(&citadel).unwrap();
      let mut fields = vec![(
        "m_resources".into(),
        Kv3Value::Array(vec![Kv3Value::String(child.into())]),
      )];
      if let Some(binding) = binding {
        fields.push(("m_skeleton".into(), Kv3Value::String(binding.into())));
      }
      let base_graph = compiled_resource(fields);
      pack(
        &citadel,
        "pak01",
        &[("animgraphs/a.vnmgraph_c", &base_graph)],
      );
      let other = clip("models/b.vnmskel");
      let path = if override_missing {
        "animations/optional.vnmclip_c"
      } else {
        "animations/b.vnmclip_c"
      };
      let archive = pack(temp.path(), "other", &[(path, &other)]);
      let snapshot = ResourceSnapshot::open(
        &citadel,
        &[LocalizationModInput {
          mod_id: "other".into(),
          vpks: vec![archive],
        }],
      )
      .unwrap();
      let mut inputs = AnimationInputs::default();
      inputs.record(path, "other");
      assert_eq!(
        inputs.unrelated(&snapshot, &model, "models/a.vnmskel_c"),
        allowed,
        "binding={binding:?} child={child} override={override_missing}"
      );
    }
  }

  #[test]
  fn dependency_proof_accepts_unrelated_clips_and_refuses_affected_or_unknown_overrides() {
    let temp = tempfile::tempdir().unwrap();
    let citadel = temp.path().join("citadel");
    std::fs::create_dir_all(&citadel).unwrap();
    let base_clip = clip("models/a.vnmskel");
    let base_graph = graph(&["animations/a.vnmclip"]);
    pack(
      &citadel,
      "pak01",
      &[
        ("animgraphs/a.vnmgraph_c", &base_graph),
        ("animations/a.vnmclip_c", &base_clip),
      ],
    );
    let model = Kv3Value::Object(vec![(
      "m_animGraph2Refs".into(),
      Kv3Value::Array(vec![Kv3Value::Object(vec![
        ("m_sIdentifier".into(), Kv3Value::String("default".into())),
        (
          "m_hGraph".into(),
          Kv3Value::String("animgraphs/a.vnmgraph".into()),
        ),
      ])]),
    )]);
    let skeleton = "models/a.vnmskel_c";
    let unrelated_clip = clip("models/b.vnmskel");
    let unrelated_graph = graph(&["animations/b.vnmclip"]);
    let nested_graph = graph(&["animgraphs/b.vnmgraph"]);
    let cycle = graph(&["animgraphs/cycle.vnmgraph"]);
    let missing = graph(&["animations/missing.vnmclip"]);
    let unbound_leaf = graph(&[]);
    let bound_leaf = compiled_resource(vec![
      (
        "m_skeleton".into(),
        Kv3Value::String("models/b.vnmskel".into()),
      ),
      ("m_resources".into(), Kv3Value::Array(vec![])),
    ]);
    let malformed_leaf = compiled_resource(vec![
      ("m_skeleton".into(), Kv3Value::Int(7)),
      ("m_resources".into(), Kv3Value::Array(vec![])),
    ]);
    let affected_graph = compiled_resource(vec![
      (
        "m_skeleton".into(),
        Kv3Value::String("models/a.vnmskel".into()),
      ),
      (
        "m_resources".into(),
        Kv3Value::Array(vec![Kv3Value::String("animations/b.vnmclip".into())]),
      ),
    ]);
    let affected_leaf = compiled_resource(vec![
      (
        "m_skeleton".into(),
        Kv3Value::String("models/a.vnmskel".into()),
      ),
      ("m_resources".into(), Kv3Value::Array(vec![])),
    ]);
    for (name, entries, allowed) in [
      (
        "bound_leaf",
        vec![("animgraphs/leaf.vnmgraph_c", bound_leaf.as_slice())],
        true,
      ),
      (
        "unbound_leaf",
        vec![("animgraphs/leaf.vnmgraph_c", unbound_leaf.as_slice())],
        false,
      ),
      (
        "malformed_leaf",
        vec![("animgraphs/leaf.vnmgraph_c", malformed_leaf.as_slice())],
        false,
      ),
      (
        "affected_leaf",
        vec![("animgraphs/leaf.vnmgraph_c", affected_leaf.as_slice())],
        false,
      ),
      (
        "affected_graph",
        vec![
          ("animgraphs/b.vnmgraph_c", affected_graph.as_slice()),
          ("animations/b.vnmclip_c", unrelated_clip.as_slice()),
        ],
        false,
      ),
      (
        "unrelated",
        vec![("animations/b.vnmclip_c", unrelated_clip.as_slice())],
        true,
      ),
      (
        "nested",
        vec![
          ("animations/b.vnmclip_c", unrelated_clip.as_slice()),
          ("animgraphs/b.vnmgraph_c", unrelated_graph.as_slice()),
          ("animgraphs/nested.vnmgraph_c", nested_graph.as_slice()),
        ],
        true,
      ),
      (
        "reverse",
        vec![("animations/b.vnmclip_c", base_clip.as_slice())],
        false,
      ),
      (
        "forward",
        vec![("animations/a.vnmclip_c", unrelated_clip.as_slice())],
        false,
      ),
      (
        "graph_override",
        vec![("animgraphs/a.vnmgraph_c", unrelated_graph.as_slice())],
        false,
      ),
      (
        "cycle",
        vec![("animgraphs/cycle.vnmgraph_c", cycle.as_slice())],
        false,
      ),
      (
        "missing",
        vec![("animgraphs/missing.vnmgraph_c", missing.as_slice())],
        false,
      ),
      (
        "legacy_clip",
        vec![("animations/b.vanim_c", unrelated_clip.as_slice())],
        false,
      ),
      (
        "malformed",
        vec![("animations/b.vnmclip_c", b"truncated".as_slice())],
        false,
      ),
    ] {
      let archive = pack(temp.path(), name, &entries);
      let snapshot = ResourceSnapshot::open(
        &citadel,
        &[LocalizationModInput {
          mod_id: name.into(),
          vpks: vec![archive],
        }],
      )
      .unwrap();
      let mut inputs = AnimationInputs::default();
      for (path, _) in &entries {
        inputs.record(path, name);
      }
      assert_eq!(
        inputs.unrelated(&snapshot, &model, skeleton),
        allowed,
        "{name}"
      );
    }
  }
}
