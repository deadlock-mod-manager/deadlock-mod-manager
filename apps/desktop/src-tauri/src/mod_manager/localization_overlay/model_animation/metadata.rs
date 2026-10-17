use super::*;
use crate::mod_manager::localization_overlay::model_camera::root_fields;
use std::ops::Range;

const GAME_DATA: &str = "CCitadelHeroModelGameData_t";
const GRAPH_FIELDS: &[&str] = &[
  "anim_graph_resource",
  "m_UIAnimgraph",
  "m_UIShopAnimgraph",
  "m_sAG2HeroPawnAnimGraph",
  "m_sAG2UIAnimGraph",
];

/// Activate the proven NM bindings without an unavailable legacy graph selector.
/// Only missing pawn controls are inherited; authored particles and settings survive.
pub(super) fn restore(
  old: &str,
  current: &str,
  modern_graphs: &BTreeMap<String, String>,
  available: impl Fn(&str) -> bool,
) -> Option<String> {
  let (closing, fields) = root_fields(old)?;
  let (_, current_fields) = root_fields(current)?;
  let mut edits = Vec::new();
  retire_graphs(old, &fields, modern_graphs, &available, &mut edits)?;
  if let Some(current_range) = current_fields.get(GAME_DATA) {
    let current_data = &current[current_range.clone()];
    let current_object = current_data.get(current_data.find('=')? + 1..)?.trim();
    let (_, current_members) = root_fields(current_object)?;
    if let Some(old_range) = fields.get(GAME_DATA) {
      let old_data = &old[old_range.clone()];
      let object_start = old_range.start + old_data.find('=')? + 1;
      let old_object = &old[object_start..old_range.end];
      let (end, members) = root_fields(old_object)?;
      let mut member_edits = Vec::new();
      retire_graphs(
        old_object,
        &members,
        modern_graphs,
        &available,
        &mut member_edits,
      )?;
      for (range, text) in member_edits {
        edits.push((object_start + range.start..object_start + range.end, text));
      }
      let additions: String = current_members
        .iter()
        .filter(|(name, _)| !members.contains_key(*name))
        .map(|(_, range)| format!("\n{}\n", &current_object[range.clone()]))
        .collect();
      edits.push((object_start + end..object_start + end, additions));
    } else {
      edits.push((closing..closing, format!("\n{current_data}\n")));
    }
  }
  edits.sort_by_key(|(range, _)| std::cmp::Reverse(range.start));
  let mut result = old.to_owned();
  for (range, text) in edits {
    result.replace_range(range, &text);
  }
  root_fields(&result)?;
  Some(result)
}

fn retire_graphs(
  text: &str,
  fields: &BTreeMap<String, Range<usize>>,
  modern_graphs: &BTreeMap<String, String>,
  available: &impl Fn(&str) -> bool,
  edits: &mut Vec<(Range<usize>, String)>,
) -> Option<()> {
  for name in GRAPH_FIELDS {
    let Some(range) = fields.get(*name) else {
      continue;
    };
    let assignment = &text[range.clone()];
    let value = assignment.get(assignment.find('=')? + 1..)?.trim();
    let value = value
      .strip_prefix("resource:")
      .or_else(|| value.strip_prefix("resource_name:"))
      .unwrap_or(value);
    let path: Option<String> = serde_json::from_str(value).ok()?;
    let path = path.unwrap_or_default();
    let modern_identifier = match *name {
      "m_sAG2HeroPawnAnimGraph" => Some(""),
      "m_sAG2UIAnimGraph" => Some("ui"),
      _ => None,
    };
    let matching_modern = modern_identifier
      .and_then(|identifier| modern_graphs.get(identifier))
      .is_some_and(|graph| {
        crate::mod_manager::localization_overlay::resources::resource_path(graph)
          == crate::mod_manager::localization_overlay::resources::resource_path(&path)
      });
    if !path.is_empty() && available(&path) && !matching_modern {
      return None;
    }
    edits.push((range.clone(), String::new()));
  }
  Some(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn nullable_selectors_do_not_prevent_binding_activation() {
    let old = "{ CCitadelHeroModelGameData_t = { m_sAG2UIAnimGraph = null } }";
    let current = "{ CCitadelHeroModelGameData_t = { m_bTurnToFaceVelocity = false } }";
    let repaired = restore(old, current, &BTreeMap::new(), |_| false).unwrap();
    assert!(!repaired.contains("m_sAG2UIAnimGraph"));
    assert!(repaired.contains("m_bTurnToFaceVelocity = false"));
  }

  #[test]
  fn retired_selectors_are_removed_and_missing_controls_are_inherited() {
    let old = "{ anim_graph_resource = resource:\"old.vanmgrph\" CCitadelHeroModelGameData_t = { m_UIAnimgraph = \"old_ui.vanmgrph\" m_flTurnDuration = 1.0 m_hAmbientParticle = \"custom.vpcf\" } custom = { anim_graph_resource = \"preserved\" } }";
    let current =
      "{ CCitadelHeroModelGameData_t = { m_flTurnDuration = 0.5 m_bTurnToFaceVelocity = false } }";
    let repaired = restore(old, current, &BTreeMap::new(), |_| false).unwrap();
    assert!(!repaired.contains("old.vanmgrph"));
    assert!(!repaired.contains("old_ui.vanmgrph"));
    assert!(repaired.contains("m_bTurnToFaceVelocity = false"));
    assert!(repaired.contains("m_flTurnDuration = 1.0"));
    assert!(repaired.contains("custom.vpcf"));
    assert!(repaired.contains("anim_graph_resource = \"preserved\""));
    assert_eq!(
      restore(&repaired, current, &BTreeMap::new(), |_| false).unwrap(),
      repaired
    );
    assert!(
      restore(old, current, &BTreeMap::new(), |path| path
        == "old.vanmgrph")
      .is_none()
    );
    assert!(
      restore(old, current, &BTreeMap::new(), |path| path
        == "old_ui.vanmgrph")
      .is_none()
    );
  }

  #[test]
  fn modern_selectors_migrate_only_to_the_same_binding_identifier() {
    let old = "{ CCitadelHeroModelGameData_t = { m_sAG2UIAnimGraph = null m_sAG2HeroPawnAnimGraph = resource:\"hero.vnmgraph\" } }";
    let current = "{ CCitadelHeroModelGameData_t = { m_bTurnToFaceVelocity = false } }";
    let graphs = BTreeMap::from([("".into(), "hero.vnmgraph".into())]);
    let repaired = restore(old, current, &graphs, |_| true).unwrap();
    assert!(!repaired.contains("m_sAG2HeroPawnAnimGraph"));
    assert!(repaired.contains("m_bTurnToFaceVelocity = false"));
    assert!(
      restore(
        old,
        current,
        &BTreeMap::from([("ui".into(), "hero.vnmgraph".into())]),
        |_| true
      )
      .is_none()
    );
    assert!(
      restore(
        old,
        current,
        &BTreeMap::from([("".into(), "different.vnmgraph".into())]),
        |_| true
      )
      .is_none()
    );
  }
}
