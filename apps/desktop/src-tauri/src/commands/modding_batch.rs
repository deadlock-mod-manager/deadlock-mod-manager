use super::{
  modding_edits::{self, Edit},
  modding_workspace::{ModdingHierarchy, contained, relative, resolve},
};
use crate::{app_runtime::AppHandle, errors::Error};
use serde::{Deserialize, Serialize};
use std::{
  collections::{BTreeMap, BTreeSet},
  path::Path,
};
use ts_rs::TS;
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingBatchPlan {
  pub entries: Vec<ModdingRenameEntry>,
  pub conflicts: Vec<String>,
  pub reference_files: Vec<String>,
  pub fingerprint: String,
  pub usage: Option<super::modding_usage::ModdingUsageReport>,
}
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingRenameEntry {
  pub from: String,
  pub to: String,
}
#[derive(Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingRenameRequest {
  pub paths: Vec<String>,
  pub find: String,
  pub replace: String,
  pub update_source_references: bool,
}
pub(super) fn files(root: &Path) -> Result<Vec<String>, Error> {
  let mut result = Vec::new();
  let mut pending = vec![(root.to_owned(), 0)];
  while let Some((folder, depth)) = pending.pop() {
    if depth > 64 {
      return Err(Error::InvalidInput(
        "Project nesting exceeds 64 folders".into(),
      ));
    }
    for entry in std::fs::read_dir(folder)? {
      let entry = entry?;
      if entry.file_name().to_string_lossy().starts_with('.') {
        continue;
      }
      let kind = entry.file_type()?;
      if kind.is_dir() {
        pending.push((entry.path(), depth + 1));
      } else if kind.is_file() {
        result.push(
          entry
            .path()
            .strip_prefix(root)
            .map_err(|error| Error::InvalidInput(error.to_string()))?
            .to_string_lossy()
            .replace('\\', "/"),
        );
        if result.len() > 100_000 {
          return Err(Error::InvalidInput(
            "Project contains more than 100,000 files".into(),
          ));
        }
      }
    }
  }
  result.sort();
  Ok(result)
}
fn selected(root: &Path, paths: &[String]) -> Result<Vec<String>, Error> {
  if paths.is_empty() {
    return Err(Error::InvalidInput("Select files or folders".into()));
  }
  for path in paths {
    relative(path, true)?;
  }
  let found: Vec<_> = files(root)?
    .into_iter()
    .filter(|file| {
      paths
        .iter()
        .any(|path| path.is_empty() || file == path || file.starts_with(&format!("{path}/")))
    })
    .collect();
  if found.is_empty() || found.len() > 8192 {
    return Err(Error::InvalidInput(
      "Select between 1 and 8192 existing files".into(),
    ));
  }
  Ok(found)
}
fn source_updates(text: &str, mapping: &BTreeMap<String, String>) -> Result<Option<String>, Error> {
  let mut result = text.to_owned();
  let mut replacements = Vec::new();
  for field in super::modding_source::fields(text)? {
    let raw = &text[field.start..field.end];
    let (prefix, literal) = raw
      .split_once(':')
      .filter(|(prefix, _)| *prefix == "resource")
      .map_or(("", raw), |(_, literal)| ("resource:", literal));
    let value = literal.trim_matches('"');
    if let Some(target) = mapping.get(value) {
      replacements.push((
        field.start,
        field.end,
        format!(
          "{prefix}{}",
          serde_json::to_string(target).map_err(|error| Error::InvalidInput(error.to_string()))?
        ),
      ));
    }
  }
  for (start, end, value) in replacements.iter().rev() {
    result.replace_range(*start..*end, value);
  }
  Ok((!replacements.is_empty()).then_some(result))
}
fn rename_plan(
  root: &Path,
  request: &ModdingRenameRequest,
) -> Result<(ModdingBatchPlan, Vec<Edit>), Error> {
  if request.find.is_empty()
    || request.find.contains(['/', '\\'])
    || request.replace.contains(['/', '\\'])
  {
    return Err(Error::InvalidInput(
      "Enter a filename substring without folder separators".into(),
    ));
  }
  let mut plan = ModdingBatchPlan {
    entries: Vec::new(),
    conflicts: Vec::new(),
    reference_files: Vec::new(),
    fingerprint: String::new(),
    usage: None,
  };
  let mut edits = Vec::new();
  let mut mapping = BTreeMap::new();
  let mut targets = BTreeSet::new();
  for from in selected(root, &request.paths)? {
    let path = Path::new(&from);
    let name = path.file_name().unwrap().to_string_lossy();
    let renamed = name.replace(&request.find, &request.replace);
    if renamed == name {
      continue;
    }
    let to = path
      .with_file_name(renamed)
      .to_string_lossy()
      .replace('\\', "/");
    relative(&to, false)?;
    let target = contained(root, &to)?;
    if !targets.insert(to.to_lowercase()) || target.symlink_metadata().is_ok() {
      plan.conflicts.push(format!(
        "Destination already exists or is selected twice: {to}"
      ));
    }
    let bytes = std::fs::read(contained(root, &from)?)?;
    mapping.insert(from.clone(), to.clone());
    if let (Some(old), Some(new)) = (from.strip_suffix("_c"), to.strip_suffix("_c")) {
      mapping.insert(old.into(), new.into());
    }
    plan.entries.push(ModdingRenameEntry {
      from: from.clone(),
      to: to.clone(),
    });
    edits.push(Edit { from, to, bytes });
  }
  if edits.is_empty() {
    plan
      .conflicts
      .push("No selected filenames match the substring".into());
  }
  for path in files(root)? {
    let file = contained(root, &path)?;
    if path.ends_with(".vmat_c") || path.ends_with(".vpcf_c") {
      let resource = source2_model::resource::Resource::parse(std::fs::read(file)?)
        .map_err(|error| Error::InvalidInput(error.to_string()))?;
      if let Some(table) = resource.block_bytes("RERL")
        && super::modding_dependencies::references(table)?
          .iter()
          .any(|reference| mapping.contains_key(reference))
      {
        plan.conflicts.push(format!("{path} references a renamed resource. Decompile and rebuild it; compiled references are not rewritten."));
      }
    } else if request.update_source_references
      && ["vmat", "vpcf", "vdata"].contains(
        &Path::new(&path)
          .extension()
          .and_then(|ext| ext.to_str())
          .unwrap_or(""),
      )
    {
      let text = std::fs::read_to_string(file)?;
      if let Some(changed) = source_updates(&text, &mapping)? {
        plan.reference_files.push(path.clone());
        if let Some(edit) = edits.iter_mut().find(|edit| edit.from == path) {
          edit.bytes = changed.into_bytes();
        } else {
          edits.push(Edit {
            from: path.clone(),
            to: path,
            bytes: changed.into_bytes(),
          });
        }
      }
    }
  }
  let mut identity = Vec::new();
  for edit in &edits {
    identity.extend(edit.from.as_bytes());
    identity.push(0);
    identity.extend(edit.to.as_bytes());
    identity.push(0);
    identity
      .extend(modding_edits::fingerprint(&std::fs::read(contained(root, &edit.from)?)?).as_bytes());
  }
  plan.fingerprint = modding_edits::fingerprint(&identity);
  Ok((plan, edits))
}
fn list_files(root: &Path) -> Result<Vec<String>, Error> {
  if !root.try_exists()? {
    return Ok(Vec::new());
  }
  files(root)
}

#[tauri::command]
pub async fn list_modding_batch_files(
  app: AppHandle,
  addon_id: String,
  hierarchy: ModdingHierarchy,
) -> Result<Vec<String>, Error> {
  let root = resolve(&app, &addon_id)?.root(hierarchy);
  tauri::async_runtime::spawn_blocking(move || list_files(&root))
    .await
    .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}
#[tauri::command]
pub async fn plan_modding_rename(
  app: AppHandle,
  addon_id: String,
  hierarchy: ModdingHierarchy,
  request: ModdingRenameRequest,
) -> Result<ModdingBatchPlan, Error> {
  let addon = resolve(&app, &addon_id)?;
  let game = super::state::game_path();
  tauri::async_runtime::spawn_blocking(move || {
    let (mut plan, _) = rename_plan(&addon.root(hierarchy), &request)?;
    let paths = plan
      .entries
      .iter()
      .map(|entry| entry.from.clone())
      .collect::<Vec<_>>();
    if !paths.is_empty() {
      plan.usage = Some(super::modding_usage::check(&addon, &paths, game));
    }
    Ok(plan)
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}
#[tauri::command]
pub async fn apply_modding_rename(
  app: AppHandle,
  addon_id: String,
  hierarchy: ModdingHierarchy,
  request: ModdingRenameRequest,
  fingerprint: String,
) -> Result<String, Error> {
  let root = resolve(&app, &addon_id)?.root(hierarchy);
  tauri::async_runtime::spawn_blocking(move || {
    let _guard = modding_edits::EDIT_LOCK
      .lock()
      .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?;
    let (plan, edits) = rename_plan(&root, &request)?;
    if !plan.conflicts.is_empty() || plan.fingerprint != fingerprint {
      return Err(Error::InvalidInput(
        "The plan has conflicts or files changed. Preview the rename again.".into(),
      ));
    }
    let backup = modding_edits::commit(&root, edits)?;
    if matches!(hierarchy, ModdingHierarchy::Content) {
      super::modding_image_compiler::sync(&root)?;
    }
    Ok(backup)
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}
fn audio_edits(root: &Path, paths: &[String], source: &Path) -> Result<Vec<Edit>, Error> {
  let extension = source
    .extension()
    .and_then(|extension| extension.to_str())
    .unwrap_or("")
    .to_ascii_lowercase();
  if !["mp3", "wav"].contains(&extension.as_str()) {
    return Err(Error::InvalidInput("Bulk audio replacement supports MP3 or WAV sources; select matching uncompiled targets in Content".into()));
  }
  if std::fs::metadata(source)?.len() > 64 * 1024 * 1024 {
    return Err(Error::InvalidInput(
      "Audio replacements are limited to 64 MB".into(),
    ));
  }
  let bytes = std::fs::read(source)?;
  let valid = if extension == "wav" {
    bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WAVE")
  } else {
    bytes.starts_with(b"ID3")
      || bytes
        .windows(2)
        .take(4096)
        .any(|window| window[0] == 0xff && window[1] & 0xe0 == 0xe0)
  };
  if !valid {
    return Err(Error::InvalidInput(
      "Replacement must contain valid MP3 or WAV audio".into(),
    ));
  }
  let targets = selected(root, paths)?;
  if bytes
    .len()
    .checked_mul(targets.len())
    .is_none_or(|size| size > 512 * 1024 * 1024)
  {
    return Err(Error::InvalidInput(
      "Select a smaller audio batch; reversible edits are limited to 512 MB".into(),
    ));
  }
  let mut edits = Vec::new();
  for path in targets {
    let target_extension = Path::new(&path)
      .extension()
      .and_then(|value| value.to_str())
      .unwrap_or("");
    if !target_extension.eq_ignore_ascii_case(&extension) {
      return Err(Error::InvalidInput(format!(
        "{path} is not a matching .{extension} source; exclude it before replacing"
      )));
    }
    edits.push(Edit {
      from: path.clone(),
      to: path,
      bytes: bytes.clone(),
    });
  }
  Ok(edits)
}

#[tauri::command]
pub async fn replace_modding_audio_batch(
  app: AppHandle,
  addon_id: String,
  paths: Vec<String>,
  source_path: String,
) -> Result<String, Error> {
  let root = resolve(&app, &addon_id)?.root(ModdingHierarchy::Content);
  tauri::async_runtime::spawn_blocking(move || {
    let _guard = modding_edits::EDIT_LOCK
      .lock()
      .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?;
    let edits = audio_edits(&root, &paths, Path::new(&source_path))?;
    modding_edits::commit(&root, edits)
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn uncompiled_addons_list_no_game_files_without_creating_a_folder() {
    let root = tempfile::tempdir().unwrap();
    let game = root.path().join("not-built-yet");
    assert!(list_files(&game).unwrap().is_empty());
    assert!(!game.exists());
    assert!(files(&game).is_err());
    std::fs::write(&game, b"not a directory").unwrap();
    assert!(list_files(&game).is_err());
  }
  #[test]
  fn recursive_icon_rename_preserves_unrelated_files_detects_collisions_and_can_undo() {
    let root = tempfile::tempdir().unwrap();
    std::fs::create_dir(root.path().join("icons")).unwrap();
    std::fs::write(root.path().join("icons/haze_png.vtex_c"), b"texture").unwrap();
    std::fs::write(root.path().join("readme.txt"), b"keep").unwrap();
    let request = ModdingRenameRequest {
      paths: vec!["icons".into()],
      find: "_png".into(),
      replace: String::new(),
      update_source_references: false,
    };
    let (plan, edits) = rename_plan(root.path(), &request).unwrap();
    assert!(plan.conflicts.is_empty());
    let id = modding_edits::commit(root.path(), edits).unwrap();
    assert!(root.path().join("icons/haze.vtex_c").is_file());
    assert_eq!(
      std::fs::read(root.path().join("readme.txt")).unwrap(),
      b"keep"
    );
    modding_edits::undo(root.path(), &id).unwrap();
    std::fs::write(root.path().join("icons/haze.vtex_c"), b"collision").unwrap();
    assert!(
      !rename_plan(root.path(), &request)
        .unwrap()
        .0
        .conflicts
        .is_empty()
    );
  }
  #[test]
  fn exact_source_reference_edits_preserve_unrelated_values() {
    let mapping = BTreeMap::from([("textures/a.png".into(), "textures/b.png".into())]);
    let source = "Layer0 { TextureColor \"textures/a.png\" Note \"prefix textures/a.png suffix\" }";
    let result = source_updates(source, &mapping).unwrap().unwrap();
    assert!(result.contains("TextureColor \"textures/b.png\""));
    assert!(result.contains("prefix textures/a.png suffix"));
  }
  #[test]
  fn one_sound_replaces_multiple_targets_preserving_paths_and_donor() {
    let root = tempfile::tempdir().unwrap();
    std::fs::create_dir(root.path().join("sounds")).unwrap();
    for name in ["one.wav", "two.wav"] {
      std::fs::write(root.path().join("sounds").join(name), b"original").unwrap();
    }
    let donor = tempfile::tempdir().unwrap();
    let path = donor.path().join("replacement.wav");
    let bytes = b"RIFF0000WAVEfmt replacement fixture";
    std::fs::write(&path, bytes).unwrap();
    let edits = audio_edits(root.path(), &["sounds".into()], &path).unwrap();
    assert_eq!(edits.len(), 2);
    let id = modding_edits::commit(root.path(), edits).unwrap();
    for name in ["one.wav", "two.wav"] {
      assert_eq!(
        std::fs::read(root.path().join("sounds").join(name)).unwrap(),
        bytes
      );
    }
    assert_eq!(std::fs::read(&path).unwrap(), bytes);
    modding_edits::undo(root.path(), &id).unwrap();
    assert_eq!(
      std::fs::read(root.path().join("sounds/one.wav")).unwrap(),
      b"original"
    );
  }
}
