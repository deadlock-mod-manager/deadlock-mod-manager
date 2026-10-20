//! Explain mixed original-file animation dependencies using effective VPK order.
//! This is provenance evidence for overlap review, not a playback validation.
use super::{
  Kv3Value, LocalizationModInput, compiled_resource,
  resources::{ResourceSnapshot, resource_path},
};
use crate::errors::Error;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, PartialEq, Eq)]
pub(super) struct MixedDependency {
  pub path: String,
  pub mod_id: String,
}

fn animation_path(path: &str) -> bool {
  [
    ".vnmskel_c",
    ".vnmgraph_c",
    ".vnmclip_c",
    ".vanmgrph_c",
    ".vanim_c",
    ".vagrp_c",
  ]
  .iter()
  .any(|suffix| path.ends_with(suffix))
}

pub(super) fn describe(dependencies: &[MixedDependency]) -> String {
  let mut by_mod: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
  for dependency in dependencies {
    by_mod
      .entry(&dependency.mod_id)
      .or_default()
      .push(&dependency.path);
  }
  by_mod
    .into_iter()
    .map(|(mod_id, paths)| {
      let examples = paths.iter().take(3).copied().collect::<Vec<_>>().join(", ");
      let remaining = paths.len().saturating_sub(3);
      let more = if remaining == 0 {
        String::new()
      } else {
        format!("; {remaining} more")
      };
      let kind = if paths.len() == 1 {
        "dependency"
      } else {
        "dependencies"
      };
      format!("mod {mod_id}: {} {kind} ({examples}{more})", paths.len())
    })
    .collect::<Vec<_>>()
    .join("; ")
}

/// Follow the selected model's actual references, including graph/clip children.
/// Identical dependencies and overrides outside that closure do not mix assets.
/// Callers retain the general overlap warning when files cannot be decoded.
pub(super) fn mixed_animation_dependencies(
  resources: &ResourceSnapshot,
  owner: &LocalizationModInput,
  model: &str,
) -> Result<Vec<MixedDependency>, Error> {
  if !resources.mod_paths().any(|path| {
    animation_path(path)
      && resources.provider(path).is_some_and(|provider| {
        provider
          .mod_id
          .as_deref()
          .is_some_and(|id| id != owner.mod_id)
      })
  }) {
    return Ok(Vec::new());
  }
  let mut pending = vec![model.to_owned()];
  let mut visited = BTreeSet::new();
  let mut mixed = Vec::new();
  while let Some(path) = pending.pop() {
    if visited.len() >= 4096 {
      break;
    }
    if !visited.insert(path.clone()) {
      continue;
    }
    let Some((provider, bytes)) = resources.resolve(&path)? else {
      continue;
    };
    if let Some(mod_id) = provider.mod_id.filter(|id| id != &owner.mod_id) {
      let expected = resources.standalone_bytes(owner, &path)?;
      if expected
        .as_deref()
        .is_none_or(|expected| expected.as_slice() != bytes.as_slice())
      {
        mixed.push(MixedDependency {
          path: path.clone(),
          mod_id,
        });
      }
    }
    // Skeletons and clips are leaves except for their explicit skeleton binding.
    let Ok(decoded) = compiled_resource::decode(&bytes, &path) else {
      continue;
    };
    let root = &decoded.root;
    let mut references = Vec::new();
    for field in [
      "m_vecNmSkeletonRefs",
      "m_resources",
      "m_refAnimGroups",
      "m_refAnimIncludeModels",
    ] {
      references.extend(
        root
          .get(field)
          .and_then(Kv3Value::as_array)
          .into_iter()
          .flatten()
          .filter_map(Kv3Value::as_str),
      );
    }
    references.extend(
      root
        .get("m_animGraph2Refs")
        .and_then(Kv3Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|graph| graph.get("m_hGraph").and_then(Kv3Value::as_str)),
    );
    references.extend(root.get("m_skeleton").and_then(Kv3Value::as_str));
    references.extend(super::model_camera::legacy_animation_graph(root));
    pending.extend(
      references
        .into_iter()
        .filter_map(resource_path)
        .filter(|path| animation_path(path)),
    );
  }
  mixed.sort_by(|a, b| a.path.cmp(&b.path));
  Ok(mixed)
}

#[cfg(test)]
mod tests;
