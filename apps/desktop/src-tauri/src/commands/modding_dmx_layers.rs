use std::{collections::BTreeSet, path::Path};

use serde::Serialize;
use source2_model::kv3::KvValue;
use ts_rs::TS;

use super::{modding_model_source, modding_workspace::contained};
use crate::errors::Error;

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingDmxLayer {
  pub id: String,
  pub name: String,
  pub path: String,
  pub scale: f32,
  pub skeleton: bool,
  pub default_visible: bool,
}

fn visit<'a>(value: &'a KvValue, class: &str, out: &mut Vec<&'a KvValue>, depth: usize) {
  if depth > 64 {
    return;
  }
  if value.get("_class").and_then(KvValue::as_string) == Some(class) {
    out.push(value);
  }
  if let Some(children) = value.get("children").and_then(KvValue::as_array) {
    for child in children {
      visit(child, class, out, depth + 1);
    }
  }
}

fn defaults(tree: &KvValue, names: &[String]) -> BTreeSet<String> {
  let mut lods = Vec::new();
  visit(tree, "LODGroup", &mut lods, 0);
  let detail = lods.into_iter().min_by(|a, b| {
    let threshold = |node: &KvValue| {
      node
        .get("switch_threshold")
        .and_then(KvValue::as_f32)
        .unwrap_or(0.)
    };
    threshold(a).total_cmp(&threshold(b))
  });
  let mut visible: BTreeSet<_> = detail
    .and_then(|node| node.get("mesh_references").and_then(KvValue::as_array))
    .map(|values| {
      values
        .iter()
        .filter_map(|node| {
          node
            .get("mesh_name")
            .and_then(KvValue::as_string)
            .map(str::to_owned)
        })
        .collect()
    })
    .unwrap_or_else(|| names.iter().cloned().collect());
  let mut groups = Vec::new();
  visit(tree, "BodyGroup", &mut groups, 0);
  let mut grouped = BTreeSet::new();
  let mut selected = BTreeSet::new();
  for group in groups {
    let mut choices = Vec::new();
    visit(group, "BodyGroupChoice", &mut choices, 0);
    for (i, choice) in choices.into_iter().enumerate() {
      if let Some(meshes) = choice.get("meshes").and_then(KvValue::as_array) {
        for name in meshes.iter().filter_map(KvValue::as_string) {
          grouped.insert(name.to_owned());
          if i == 0 {
            selected.insert(name.to_owned());
          }
        }
      }
    }
  }
  visible.retain(|name| !grouped.contains(name) || selected.contains(name));
  visible
}

fn mesh_path(root: &Path, model: &Path, path: &str) -> Option<String> {
  for candidate in [root.join(path), model.parent()?.join(path)] {
    let relative = candidate
      .strip_prefix(root)
      .ok()?
      .to_string_lossy()
      .replace('\\', "/");
    if contained(root, &relative).is_ok_and(|file| file.is_file()) {
      return Some(relative);
    }
  }
  None
}

pub(super) fn discover(
  root: &Path,
  selected: &str,
  skeleton: bool,
) -> Result<(Option<String>, Vec<ModdingDmxLayer>), Error> {
  let source = contained(root, selected)?;
  let Some(parent) = source.parent() else {
    return Ok((None, Vec::new()));
  };
  let exact = source.with_extension("vmdl");
  let mut candidates = Vec::new();
  for entry in std::fs::read_dir(parent)? {
    let entry = entry?;
    if entry.file_type()?.is_file()
      && entry
        .path()
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("vmdl"))
    {
      candidates.push(entry.path());
      if candidates.len() > 64 {
        return Ok((None, Vec::new()));
      }
    }
  }
  candidates.sort_by_key(|path| (path != &exact, path.clone()));
  let mut matches = Vec::new();
  for candidate in candidates {
    let relative = candidate
      .strip_prefix(root)
      .map_err(|e| Error::InvalidInput(e.to_string()))?
      .to_string_lossy()
      .replace('\\', "/");
    let candidate = contained(root, &relative)?;
    if std::fs::metadata(&candidate)?.len() > 16 * 1024 * 1024 {
      continue;
    }
    let Ok(text) = std::fs::read_to_string(&candidate) else {
      continue;
    };
    let Ok(document) = super::modding_source::tree(&text) else {
      continue;
    };
    let tree = document.get("rootNode").unwrap_or(&document);
    let mut references = Vec::new();
    if modding_model_source::meshes(tree, &mut references, 0).is_err() || references.len() > 64 {
      continue;
    }
    let references = references
      .into_iter()
      .filter_map(|mesh| {
        if !mesh.path.to_ascii_lowercase().ends_with(".dmx") {
          return None;
        }
        let path = mesh_path(root, &candidate, &mesh.path)?;
        Some((mesh, path))
      })
      .collect::<Vec<_>>();
    if references.is_empty()
      || (candidate != exact
        && !references
          .iter()
          .any(|(_, path)| path.eq_ignore_ascii_case(selected)))
    {
      continue;
    }
    let names = references
      .iter()
      .map(|(mesh, _)| mesh.name.clone())
      .collect::<Vec<_>>();
    let visible = defaults(tree, &names);
    let mut layers = references
      .into_iter()
      .enumerate()
      .map(|(i, (mesh, path))| ModdingDmxLayer {
        id: format!("mesh:{i}"),
        default_visible: visible.contains(&mesh.name),
        name: mesh.name,
        path,
        scale: mesh.scale,
        skeleton: false,
      })
      .collect::<Vec<_>>();
    let rig = if skeleton {
      Some(selected.to_owned())
    } else {
      let path = candidate.with_extension("dmx");
      let relative = path
        .strip_prefix(root)
        .ok()
        .map(|p| p.to_string_lossy().replace('\\', "/"));
      relative.filter(|path| {
        if path.eq_ignore_ascii_case(selected) {
          return false;
        }
        contained(root, path)
          .ok()
          .filter(|file| std::fs::metadata(file).is_ok_and(|info| info.len() <= 256 * 1024 * 1024))
          .and_then(|file| std::fs::read(file).ok())
          .and_then(|bytes| source2_model::dmx::DmxModel::decode(&bytes).ok())
          .is_some_and(|model| model.is_skeleton_only())
      })
    };
    if let Some(path) = rig {
      layers.push(ModdingDmxLayer {
        id: "skeleton".into(),
        name: "Skeleton".into(),
        path,
        scale: 1.,
        skeleton: true,
        default_visible: false,
      });
    }
    if !layers
      .iter()
      .any(|layer| layer.path.eq_ignore_ascii_case(selected))
    {
      layers.push(ModdingDmxLayer {
        id: "selected".into(),
        name: source
          .file_stem()
          .unwrap_or_default()
          .to_string_lossy()
          .into_owned(),
        path: selected.into(),
        scale: 1.,
        skeleton,
        default_visible: true,
      });
    }
    matches.push((Some(relative), layers));
    if candidate == exact {
      break;
    }
  }
  if matches.len() == 1 {
    Ok(matches.remove(0))
  } else {
    Ok((None, Vec::new()))
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn associated_layers_use_lod_zero_and_default_body_groups() {
    let root = tempfile::tempdir().unwrap();
    for path in [
      "hero.dmx",
      "body.dmx",
      "head.dmx",
      "head_ui.dmx",
      "body_lod1.dmx",
    ] {
      std::fs::write(root.path().join(path), b"source placeholder").unwrap();
    }
    std::fs::write(root.path().join("hero.dmx"), br#"<!-- dmx encoding keyvalues2 4 format model 22 -->
      "DmElement" {"skeleton" "DmeModel" {"children" "element_array" ["DmeJoint" {
        "children" "element_array" ["DmeJoint" {"transform" "DmeTransform" {"position" "vector3" "0 0 10"}}]
      }]}}"#).unwrap();
    std::fs::write(root.path().join("hero.vmdl"), r#"{rootNode={ children=[
      {_class="RenderMeshList" children=[
        {_class="RenderMeshFile" name="body" filename="body.dmx"}
        {_class="RenderMeshFile" name="head" filename="head.dmx"}
        {_class="RenderMeshFile" name="head_ui" filename="head_ui.dmx"}
        {_class="RenderMeshFile" name="body_lod1" filename="body_lod1.dmx"}
      ]}
      {_class="LODGroup" switch_threshold=0 mesh_references=[{mesh_name="body"} {mesh_name="head"} {mesh_name="head_ui"}]}
      {_class="LODGroup" switch_threshold=18 mesh_references=[{mesh_name="body_lod1"}]}
      {_class="BodyGroup" children=[{_class="BodyGroupChoice" meshes=["head"]} {_class="BodyGroupChoice" meshes=["head_ui"]}]}
    ]}}"#).unwrap();
    for (path, skeleton) in [("hero.dmx", true), ("body.dmx", false)] {
      let (model, layers) = discover(root.path(), path, skeleton).unwrap();
      assert_eq!(model.as_deref(), Some("hero.vmdl"));
      assert_eq!(layers.len(), 5);
      assert_eq!(
        layers
          .iter()
          .filter(|l| l.default_visible)
          .map(|l| l.name.as_str())
          .collect::<Vec<_>>(),
        vec!["body", "head"]
      );
      assert_eq!(layers.last().unwrap().path, "hero.dmx");
      assert!(layers.last().unwrap().skeleton);
    }
  }

  #[test]
  fn ambiguous_and_escaping_companions_do_not_get_loaded() {
    let root = tempfile::tempdir().unwrap();
    std::fs::write(root.path().join("body.dmx"), b"source").unwrap();
    let document = r#"{rootNode={children=[{_class="RenderMeshFile" filename="body.dmx"}]}}"#;
    std::fs::write(root.path().join("one.vmdl"), document).unwrap();
    std::fs::write(root.path().join("two.vmdl"), document).unwrap();
    assert!(
      discover(root.path(), "body.dmx", false)
        .unwrap()
        .1
        .is_empty()
    );
    std::fs::write(
      root.path().join("body.vmdl"),
      document.replace("body.dmx", "../outside.dmx"),
    )
    .unwrap();
    std::fs::remove_file(root.path().join("two.vmdl")).unwrap();
    assert_eq!(
      discover(root.path(), "body.dmx", false)
        .unwrap()
        .0
        .as_deref(),
      Some("one.vmdl")
    );
  }
}
