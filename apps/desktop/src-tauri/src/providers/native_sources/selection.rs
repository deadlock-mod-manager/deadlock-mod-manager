use std::collections::{BTreeMap, HashSet};

use crate::errors::Error;
use crate::mod_manager::file_tree::{ModFile, ModFileTree};

use super::NativeSourceRelease;
use super::network::invalid;

/// Carries an explicit component decision into the existing archive selection
/// mechanism. Defaults are a UI suggestion for first install, never an update
/// fallback when a component disappears or a required group changes.
pub fn build_component_selection(
  release: &NativeSourceRelease,
  component_ids: &[String],
  selected_artifact_ids: &[String],
) -> Result<Option<ModFileTree>, Error> {
  let installation = &release.installation;
  let chosen_artifacts: HashSet<_> = selected_artifact_ids.iter().collect();
  if chosen_artifacts.is_empty()
    || chosen_artifacts.len() != selected_artifact_ids.len()
    || selected_artifact_ids
      .iter()
      .any(|id| !release.artifacts.iter().any(|artifact| &artifact.id == id))
  {
    return Err(invalid(
      "Selected artifacts are missing, repeated, or unknown",
    ));
  }
  if installation.mode == "manual" {
    if !component_ids.is_empty() {
      return Err(invalid("Manual release cannot accept component selections"));
    }
    return Ok(None);
  }
  if installation.mode != "components" {
    return Err(invalid("Unsupported installation mode"));
  }
  let selected: HashSet<_> = component_ids.iter().collect();
  if selected.len() != component_ids.len()
    || component_ids.iter().any(|id| {
      !installation
        .components
        .iter()
        .any(|component| &component.id == id)
    })
    || installation
      .required_components
      .iter()
      .any(|id| !selected.contains(id))
  {
    return Err(invalid(
      "Selected components are missing, repeated, or omit required content",
    ));
  }
  for group in &installation.choice_groups {
    let count = group
      .component_ids
      .iter()
      .filter(|id| selected.contains(id))
      .count();
    if count < group.min_selections || count > group.max_selections {
      return Err(invalid(format!(
        "Choose between {} and {} options for {}",
        group.min_selections, group.max_selections, group.label
      )));
    }
  }
  let needed_artifacts: HashSet<_> = installation
    .components
    .iter()
    .filter(|component| selected.contains(&component.id))
    .flat_map(|component| component.files.iter().map(|file| &file.artifact_id))
    .collect();
  if needed_artifacts != chosen_artifacts {
    return Err(invalid(
      "Selected artifacts must exactly match the selected components",
    ));
  }
  let mut files: BTreeMap<(String, String), ModFile> = BTreeMap::new();
  for component in &installation.components {
    for file in &component.files {
      let artifact = release
        .artifacts
        .iter()
        .find(|artifact| artifact.id == file.artifact_id)
        .ok_or_else(|| invalid("Component references a missing artifact"))?;
      let entry = files
        .entry((artifact.id.clone(), file.path.clone()))
        .or_insert_with(|| ModFile {
          name: file
            .path
            .rsplit('/')
            .next()
            .unwrap_or(&file.path)
            .to_string(),
          path: format!("{}/{}", artifact.filename, file.path),
          size: 0,
          is_selected: false,
          archive_name: artifact.filename.clone(),
        });
      entry.is_selected |= selected.contains(&component.id);
    }
  }
  let files: Vec<_> = files.into_values().collect();
  let total_files = files.len();
  Ok(Some(ModFileTree {
    files,
    total_files,
    has_multiple_files: total_files > 1,
  }))
}
