//! Validate the effective NM dependency closure, including models whose bindings
//! already exist. Passing these structural checks does not verify playback or
//! the author's track order, retargeting, or deformation intent.
use super::asset_compatibility::{AssetRepair, AssetWarning, WarningKind, valid_skeleton};
use super::resources::{ResourceSnapshot, resource_path};
use super::{CompiledDataSource, Kv3Value, decode_compiled_data};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use ts_rs::TS;

mod cache;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub enum AnimationDependencyStatus {
  Verified,
  Unresolved,
  NotChecked,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub enum AnimationDependencyIssueKind {
  MissingResource,
  UnreadableResource,
  InvalidSkeleton,
  AnimationMapping,
  NotChecked,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct AnimationDependencyIssue {
  pub resource: String,
  pub kind: AnimationDependencyIssueKind,
  pub detail: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct AnimationDependencySummary {
  pub status: AnimationDependencyStatus,
  pub checked_resources: usize,
  pub issues: Vec<AnimationDependencyIssue>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct AnimationDependencyCheck {
  pub mod_id: String,
  pub file_path: String,
  pub before: AnimationDependencySummary,
  pub after: AnimationDependencySummary,
}

#[derive(Clone)]
enum Node {
  Skeleton(usize),
  Graph {
    skeleton: Option<String>,
    children: Vec<String>,
  },
  Clip {
    skeleton: String,
    tracks: usize,
  },
}

type IssueKind = AnimationDependencyIssueKind;
type NodeResult = Result<Node, IssueKind>;

struct Checker<'a> {
  resources: &'a ResourceSnapshot,
  repaired: &'a BTreeMap<&'a str, &'a [u8]>,
  nodes: BTreeMap<String, NodeResult>,
}

impl Checker<'_> {
  fn node(&mut self, path: &str) -> NodeResult {
    if let Some(node) = self.nodes.get(path) {
      return node.clone();
    }
    let result = self.read_node(path);
    self.nodes.insert(path.to_owned(), result.clone());
    result
  }

  fn read_node(&self, path: &str) -> NodeResult {
    if ![".vnmskel_c", ".vnmclip_c", ".vnmgraph_c"]
      .iter()
      .any(|suffix| path.ends_with(suffix))
    {
      return Err(IssueKind::NotChecked);
    }
    let original;
    let bytes = if let Some(bytes) = self.repaired.get(path) {
      *bytes
    } else {
      original = self
        .resources
        .resolve(path)
        .map_err(|_| IssueKind::UnreadableResource)?
        .ok_or(IssueKind::MissingResource)?
        .1;
      original.as_slice()
    };
    cache::decode(bytes, path)
  }

  fn model(&mut self, path: &str, bytes: &[u8]) -> Option<AnimationDependencySummary> {
    let mut summary = AnimationDependencySummary::new();
    let Ok((_, model, _)) = decode_compiled_data(bytes, path) else {
      summary.add(
        path,
        IssueKind::UnreadableResource,
        "Model animation bindings could not be decoded".into(),
      );
      return Some(summary);
    };
    let active = ["m_animGraph2Refs", "m_vecNmSkeletonRefs"]
      .iter()
      .any(|field| {
        model
          .get(field)
          .is_some_and(|value| value.as_array().is_none_or(|values| !values.is_empty()))
      });
    if !active {
      return None;
    }
    let skeletons = model
      .get("m_vecNmSkeletonRefs")
      .and_then(Kv3Value::as_array)
      .and_then(|values| {
        values
          .iter()
          .map(|value| {
            value
              .as_str()
              .and_then(resource_path)
              .filter(|path| path.ends_with(".vnmskel_c"))
          })
          .collect::<Option<BTreeSet<_>>>()
      });
    let graphs = super::animation_model_evidence::graphs(&model);
    let (Some(skeletons), Some(graphs)) = (skeletons.filter(|paths| !paths.is_empty()), graphs)
    else {
      summary.add(
        path,
        IssueKind::NotChecked,
        "Model animation bindings are incomplete or use an unsupported layout".into(),
      );
      return Some(summary);
    };
    let mut visited = BTreeSet::new();
    let mut pending: Vec<_> = skeletons.iter().cloned().collect();
    for name in graphs.values() {
      if let Some(graph) = resource_path(name).filter(|path| path.ends_with(".vnmgraph_c")) {
        pending.push(graph);
      } else {
        summary.add(
          name,
          IssueKind::NotChecked,
          "Unsupported model graph reference".into(),
        );
      }
    }
    while let Some(path) = pending.pop() {
      if visited.contains(&path) {
        continue;
      }
      if visited.len() >= 4096 {
        summary.add(
          &path,
          IssueKind::NotChecked,
          "Animation dependency traversal limit reached".into(),
        );
        break;
      }
      visited.insert(path.clone());
      match self.node(&path) {
        Err(kind) => summary.add(
          &path,
          kind,
          match kind {
            IssueKind::MissingResource => "Referenced animation resource is missing",
            IssueKind::UnreadableResource => "Animation resource could not be decoded",
            IssueKind::InvalidSkeleton => {
              "Invalid bone names, parent hierarchy, or reference poses"
            }
            _ => "Animation resource layout is not covered by these checks",
          }
          .into(),
        ),
        Ok(Node::Skeleton(_)) => summary.checked_resources += 1,
        Ok(Node::Graph { skeleton, children }) => {
          summary.checked_resources += 1;
          if let Some(skeleton) = skeleton {
            self.binding(&path, &skeleton, &skeletons, &mut pending, &mut summary);
          } else {
            summary.add(
              &path,
              IssueKind::NotChecked,
              "Graph has no explicit skeleton binding".into(),
            );
          }
          for child in children {
            // Shipped graphs retain optional clips that the installed game does
            // not provide. Their absence alone is not evidence of a broken mod.
            if child.ends_with(".vnmclip_c")
              && !self.repaired.contains_key(child.as_str())
              && self.resources.provider(&child).is_none()
              && self
                .resources
                .provider(&path)
                .is_some_and(|owner| owner.mod_id.is_none())
              && !self.repaired.contains_key(path.as_str())
            {
              summary.add(
                &child,
                IssueKind::NotChecked,
                "Absent clip referenced by the installed game; runtime use is unknown".into(),
              );
            } else {
              pending.push(child);
            }
          }
        }
        Ok(Node::Clip { skeleton, tracks }) => {
          summary.checked_resources += 1;
          self.binding(&path, &skeleton, &skeletons, &mut pending, &mut summary);
          if let Ok(Node::Skeleton(bones)) = self.node(&skeleton)
            && tracks != bones
          {
            summary.add(
              &path,
              IssueKind::AnimationMapping,
              format!("Animation has {tracks} tracks for {bones} bones in {skeleton}"),
            );
          }
        }
      }
    }
    summary
      .issues
      .sort_by(|a, b| (&a.resource, a.kind, &a.detail).cmp(&(&b.resource, b.kind, &b.detail)));
    summary.issues.dedup();
    Some(summary)
  }

  fn binding(
    &self,
    path: &str,
    skeleton: &str,
    model_skeletons: &BTreeSet<String>,
    pending: &mut Vec<String>,
    summary: &mut AnimationDependencySummary,
  ) {
    if !model_skeletons.contains(skeleton) {
      summary.add(path, IssueKind::NotChecked, format!("Dependency uses {skeleton}, outside the model's declared skeletons; retargeting is not verified"));
    }
    pending.push(skeleton.into());
  }
}

impl AnimationDependencySummary {
  fn new() -> Self {
    Self {
      status: AnimationDependencyStatus::Verified,
      checked_resources: 0,
      issues: Vec::new(),
    }
  }

  fn add(&mut self, path: &str, kind: IssueKind, detail: String) {
    if kind != IssueKind::NotChecked {
      self.status = AnimationDependencyStatus::Unresolved;
    } else if self.status == AnimationDependencyStatus::Verified {
      self.status = AnimationDependencyStatus::NotChecked;
    }
    self.issues.push(AnimationDependencyIssue {
      resource: path.into(),
      kind,
      detail,
    });
  }
}

pub(super) fn analyze(
  resources: &ResourceSnapshot,
  models: &BTreeMap<String, Vec<CompiledDataSource>>,
  repaired: &BTreeMap<&str, &[u8]>,
  repairs: &[AssetRepair],
  warnings: &mut Vec<AssetWarning>,
) -> Vec<AnimationDependencyCheck> {
  let empty = BTreeMap::new();
  let mut before = Checker {
    resources,
    repaired: &empty,
    nodes: BTreeMap::new(),
  };
  let mut checks = Vec::new();
  for (path, inputs) in models {
    if !path.ends_with(".vmdl_c") {
      continue;
    }
    for source in inputs {
      let original = before.model(path, &source.bytes);
      checks.push((
        path,
        &source.mod_id,
        &source.source_vpk,
        source.bytes.as_slice(),
        original,
      ));
    }
  }
  let mut roots: BTreeSet<_> = models.keys().collect();
  for repair in repairs.iter().filter(|repair| {
    repair.file_path.ends_with(".vmdl_c") && repaired.contains_key(repair.file_path.as_str())
  }) {
    if roots.insert(&repair.file_path) {
      checks.push((
        &repair.file_path,
        &repair.mod_id,
        &repair.source_vpk,
        &[][..],
        None,
      ));
    }
  }
  let mut after = Checker {
    resources,
    repaired,
    nodes: before.nodes,
  };
  after
    .nodes
    .retain(|path, _| !repaired.contains_key(path.as_str()));
  checks
    .into_iter()
    .filter_map(|(path, mod_id, source_vpk, original_bytes, original)| {
      let bytes = repaired
        .get(path.as_str())
        .copied()
        .unwrap_or(original_bytes);
      let result = match after.model(path, bytes) {
        Some(result) => result,
        None if original.is_some() => {
          let mut result = AnimationDependencySummary::new();
          result.add(
            path,
            IssueKind::NotChecked,
            "Previously present animation bindings are absent after repair".into(),
          );
          result
        }
        None => return None,
      };
      for issue in &result.issues {
        let kind = match issue.kind {
          IssueKind::MissingResource => WarningKind::MissingResource,
          IssueKind::UnreadableResource => WarningKind::UnreadableResource,
          IssueKind::InvalidSkeleton => WarningKind::InvalidSkeleton,
          IssueKind::AnimationMapping => WarningKind::AnimationMapping,
          IssueKind::NotChecked => continue,
        };
        if warnings.iter().any(|warning| {
          warning.mod_id == *mod_id
            && warning.file_path == *path
            && warning.kind == kind
            && resource_path(&warning.detail).as_deref() == Some(issue.resource.as_str())
        }) {
          continue;
        }
        warnings.push(AssetWarning {
          mod_id: mod_id.clone(),
          source_vpk: source_vpk.clone(),
          file_path: path.clone(),
          kind,
          detail: format!("{}: {}", issue.resource, issue.detail),
        });
      }
      Some(AnimationDependencyCheck {
        mod_id: mod_id.clone(),
        file_path: path.clone(),
        before: original.unwrap_or(AnimationDependencySummary {
          status: AnimationDependencyStatus::NotChecked,
          checked_resources: 0,
          issues: vec![AnimationDependencyIssue {
            resource: path.clone(),
            kind: IssueKind::NotChecked,
            detail: "No authored model bindings were available at this path before repair".into(),
          }],
        }),
        after: result,
      })
    })
    .collect()
}

fn decode_node(bytes: &[u8], path: &str) -> NodeResult {
  let decoded =
    super::compiled_resource::decode(bytes, path).map_err(|_| IssueKind::UnreadableResource)?;
  let value = &decoded.root;
  if path.ends_with(".vnmskel_c") {
    if !valid_skeleton(
      value,
      "m_boneIDs",
      "m_parentIndices",
      &[
        ("m_parentSpaceReferencePose", 8),
        ("m_modelSpaceReferencePose", 8),
      ],
    ) {
      return Err(IssueKind::InvalidSkeleton);
    }
    return Ok(Node::Skeleton(
      value
        .get("m_boneIDs")
        .and_then(Kv3Value::as_array)
        .unwrap()
        .len(),
    ));
  }
  let skeleton = value
    .get("m_skeleton")
    .and_then(Kv3Value::as_str)
    .and_then(resource_path)
    .filter(|path| path.ends_with(".vnmskel_c"));
  if path.ends_with(".vnmclip_c") {
    let tracks = value
      .get("m_trackCompressionSettings")
      .and_then(Kv3Value::as_array)
      .ok_or(IssueKind::NotChecked)?
      .len();
    return Ok(Node::Clip {
      skeleton: skeleton.ok_or(IssueKind::NotChecked)?,
      tracks,
    });
  }
  if path.ends_with(".vnmgraph_c") {
    if value.get("m_skeleton").is_some() && skeleton.is_none() {
      return Err(IssueKind::NotChecked);
    }
    let children = value
      .get("m_resources")
      .and_then(Kv3Value::as_array)
      .and_then(|values| {
        values
          .iter()
          .map(|value| value.as_str().and_then(resource_path))
          .collect::<Option<Vec<_>>>()
      })
      .ok_or(IssueKind::NotChecked)?;
    return Ok(Node::Graph { skeleton, children });
  }
  Err(IssueKind::NotChecked)
}
