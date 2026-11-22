use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use crate::errors::Error;
use crate::vpk_archive_cache::open_archive;

use super::paint::model_paint_parts;
use super::types::{FoundryRemovedParts, PaintTarget};
use super::workspace::{
  base_archive, extract_either, read_edit_journal, read_journal, record_edits,
  revert_workspace_file, workspace_files_dir, write_journal, write_workspace_entry,
};

pub(super) const REMOVED_JOURNAL: &str = "removed.json";

fn read_removed_journal(workspace_root: &Path) -> BTreeMap<String, FoundryRemovedParts> {
  read_journal::<Vec<FoundryRemovedParts>>(workspace_root, REMOVED_JOURNAL)
    .into_iter()
    .map(|removed| (removed.model_path.clone(), removed))
    .collect()
}

pub(crate) fn removal_owner(workspace_root: &Path, entry_path: &str) -> Option<String> {
  read_removed_journal(workspace_root)
    .into_values()
    .find(|removed| {
      removed
        .resources
        .iter()
        .any(|resource| resource == entry_path)
    })
    .map(|removed| removed.model_path)
}

pub(crate) fn removed_parts_list(workspace_root: &Path) -> Vec<FoundryRemovedParts> {
  read_removed_journal(workspace_root).into_values().collect()
}

pub(crate) fn remove_parts(
  workspace_root: PathBuf,
  vpk_path: PathBuf,
  model_path: &str,
  hero_display: Option<&str>,
  textures: Vec<String>,
) -> Result<FoundryRemovedParts, Error> {
  let files_dir = workspace_files_dir(&workspace_root)?;
  let parts = model_paint_parts(&vpk_path, model_path, hero_display)?;
  let selected = textures
    .iter()
    .map(|texture| {
      parts
        .iter()
        .find(|part| part.texture.eq_ignore_ascii_case(texture))
        .ok_or_else(|| Error::InvalidInput(format!("{texture} is not a part of {model_path}")))
    })
    .collect::<Result<Vec<_>, Error>>()?;
  let body = parts
    .iter()
    .filter(|part| part.target == PaintTarget::Body)
    .collect::<Vec<_>>();
  if !body.is_empty()
    && body
      .iter()
      .all(|part| selected.iter().any(|chosen| chosen.texture == part.texture))
  {
    return Err(Error::InvalidInput(
      "at least one body section must stay visible".into(),
    ));
  }
  let materials = selected
    .iter()
    .flat_map(|part| part.materials.iter().cloned())
    .collect::<Vec<_>>();

  let skin = open_archive(&vpk_path, None)?;
  let base = base_archive();
  let model_bytes = extract_either(&skin, base.as_deref(), model_path)?;
  let model = source2_model::Resource::parse(model_bytes.clone())
    .map_err(|e| Error::InvalidInput(format!("failed to read {model_path}: {e}")))?;
  let meshes = source2_model::vmesh::referenced_meshes(&model)
    .map_err(|e| Error::InvalidInput(format!("failed to list {model_path}'s meshes: {e}")))?;

  let mut journal = read_removed_journal(&workspace_root);
  let previous = journal.remove(model_path).unwrap_or_default();
  let edited = read_edit_journal(&workspace_root)
    .into_iter()
    .collect::<BTreeSet<_>>();
  let resources = std::iter::once(model_path.to_string())
    .chain(meshes)
    .collect::<Vec<_>>();
  if let Some(resource) = resources
    .iter()
    .find(|resource| edited.contains(*resource) && !previous.resources.contains(resource))
  {
    return Err(Error::InvalidInput(format!(
      "{resource} has other edits; revert it before removing parts"
    )));
  }

  let mut rewritten = Vec::new();
  if !materials.is_empty() {
    for resource in &resources {
      let original = if resource == model_path {
        model_bytes.clone()
      } else {
        extract_either(&skin, base.as_deref(), resource)?
      };
      if let Some(bytes) = vpkmanager::hide_draw_calls(&original, &materials)
        .map_err(|e| Error::InvalidInput(format!("failed to remove parts from {resource}: {e}")))?
      {
        rewritten.push((resource.clone(), bytes));
      }
    }
    if rewritten.is_empty() {
      return Err(Error::InvalidInput(format!(
        "no draw call of {model_path} uses the selected parts"
      )));
    }
  }

  for (resource, bytes) in &rewritten {
    write_workspace_entry(&files_dir, resource, bytes)?;
  }
  let removed = FoundryRemovedParts {
    model_path: model_path.to_string(),
    textures,
    resources: rewritten
      .into_iter()
      .map(|(resource, _)| resource)
      .collect(),
  };
  record_edits(&workspace_root, &removed.resources, true)?;
  for resource in &previous.resources {
    if !removed.resources.contains(resource) {
      revert_workspace_file(
        workspace_root.clone(),
        resource.clone(),
        Some(vpk_path.clone()),
      )?;
    }
  }

  if !removed.textures.is_empty() {
    journal.insert(model_path.to_string(), removed.clone());
  }
  write_journal(
    &workspace_root,
    REMOVED_JOURNAL,
    &journal.into_values().collect::<Vec<_>>(),
  )?;
  log::info!(
    "[Foundry] Removed {} sections of {model_path} across {} files",
    removed.textures.len(),
    removed.resources.len(),
  );
  Ok(removed)
}
