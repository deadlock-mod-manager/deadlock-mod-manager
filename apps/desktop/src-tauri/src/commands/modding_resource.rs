use super::{
  modding_edits::{self, Edit},
  modding_workspace::{ModdingHierarchy, contained, resolve},
};
use crate::{app_runtime::AppHandle, errors::Error};
use serde::Serialize;
use source2_model::{kv3::KvValue, resource::Resource};
use std::{
  collections::{BTreeSet, VecDeque},
  path::Path,
};
use ts_rs::TS;
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingProperty {
  pub path: String,
  pub name: String,
  pub value: String,
}
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingReference {
  pub path: String,
  pub via: String,
  pub origin: String,
  pub diagnostic: Option<String>,
}
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingResourceDocument {
  pub text: String,
  pub fingerprint: String,
  pub editable: bool,
  pub properties: Vec<ModdingProperty>,
  pub references: Vec<ModdingReference>,
  pub diagnostics: Vec<String>,
}
fn flatten(value: &KvValue, path: &str, name: &str, properties: &mut Vec<ModdingProperty>) {
  match value {
    KvValue::Object(values) => {
      for (name, value) in values {
        flatten(value, &format!("{path}/{name}"), name, properties);
      }
    }
    KvValue::Array(values) => {
      for (index, value) in values.iter().enumerate() {
        flatten(
          value,
          &format!("{path}[{index}]"),
          &index.to_string(),
          properties,
        );
      }
    }
    KvValue::Binary(bytes) => properties.push(ModdingProperty {
      path: path.into(),
      name: name.into(),
      value: format!("<binary: {} bytes; read-only>", bytes.len()),
    }),
    _ => properties.push(ModdingProperty {
      path: path.into(),
      name: name.into(),
      value: value.to_json().to_string(),
    }),
  }
}
fn source_reference(value: &str) -> Option<String> {
  let value = value.trim();
  let first = value.find('"')?;
  let last = value.rfind('"')?;
  if last <= first {
    return None;
  }
  let value = &value[first + 1..last];
  if [
    ".vtex", ".vmat", ".vpcf", ".png", ".tga", ".psd", ".jpg", ".svg",
  ]
  .iter()
  .any(|ext| value.to_ascii_lowercase().ends_with(ext))
    && super::modding_workspace::relative(value, false).is_ok()
  {
    Some(value.into())
  } else {
    None
  }
}
fn parse_document(bytes: &[u8], compiled: bool) -> Result<ModdingResourceDocument, Error> {
  let mut document = ModdingResourceDocument {
    text: String::new(),
    fingerprint: modding_edits::fingerprint(bytes),
    editable: !compiled,
    properties: Vec::new(),
    references: Vec::new(),
    diagnostics: Vec::new(),
  };
  if compiled {
    let resource =
      Resource::parse(bytes.to_vec()).map_err(|error| Error::InvalidInput(error.to_string()))?;
    let data = resource
      .block_bytes("DATA")
      .ok_or_else(|| Error::InvalidInput("This resource has no DATA block".into()))?;
    let tree = source2_model::kv3::parse(data).map_err(|error| {
      Error::InvalidInput(format!(
        "This resource DATA format is not supported by the property inspector: {error}"
      ))
    })?;
    flatten(&tree, "", "", &mut document.properties);
    document.text = serde_json::to_string_pretty(&tree.to_json())
      .map_err(|error| Error::InvalidInput(error.to_string()))?;
    if let Some(table) = resource.block_bytes("RERL") {
      for path in super::modding_dependencies::references(table)? {
        document.references.push(ModdingReference {
          path,
          via: String::new(),
          origin: String::new(),
          diagnostic: None,
        });
      }
    }
  } else {
    if bytes.len() > 4 * 1024 * 1024 {
      return Err(Error::InvalidInput(
        "Resource source editing is limited to 4 MB".into(),
      ));
    }
    document.text = String::from_utf8(bytes.to_vec())
      .map_err(|error| Error::InvalidInput(format!("Source is not UTF-8: {error}")))?;
    match super::modding_source::fields(&document.text) {
      Ok(fields) => {
        for field in fields {
          let value = document.text[field.start..field.end].to_owned();
          if let Some(path) = source_reference(&value) {
            document.references.push(ModdingReference {
              path,
              via: field.path.clone(),
              origin: String::new(),
              diagnostic: None,
            });
          }
          document.properties.push(ModdingProperty {
            path: field.path,
            name: field.name,
            value,
          });
        }
      }
      Err(error) => document
        .diagnostics
        .push(format!("{error}. Use raw source to repair this document.")),
    }
  }
  Ok(document)
}
fn read_limited(path: &Path) -> Result<Vec<u8>, Error> {
  if std::fs::metadata(path)?.len() > 64 * 1024 * 1024 {
    return Err(Error::InvalidInput(
      "Resource inspection is limited to 64 MB".into(),
    ));
  }
  Ok(std::fs::read(path)?)
}

fn dependency(
  path: &str,
  addon: Option<&super::modding_workspace::ModdingAddon>,
  selected: Option<&source2_model::vpk_extract::VpkArchive>,
  stock: &[std::sync::Arc<source2_model::vpk_extract::VpkArchive>],
) -> (String, Result<Vec<u8>, String>) {
  let compiled = if path.ends_with("_c") {
    path.to_owned()
  } else {
    format!("{path}_c")
  };
  if let Some(addon) = addon {
    for (hierarchy, entry) in [
      (ModdingHierarchy::Content, path),
      (ModdingHierarchy::Game, compiled.as_str()),
    ] {
      match contained(&addon.root(hierarchy), entry) {
        Ok(file) if file.is_file() => {
          return (
            "addon".into(),
            read_limited(&file).map_err(|error| error.to_string()),
          );
        }
        Err(error) => return ("missing".into(), Err(error.to_string())),
        _ => {}
      }
    }
  }
  if let Some(selected) = selected
    && let Some(entry) = [path, compiled.as_str()]
      .into_iter()
      .find(|entry| selected.contains_entry(entry))
  {
    return (
      "archive".into(),
      selected
        .extract_entry_limited(entry, 64 * 1024 * 1024)
        .map_err(|error| error.to_string()),
    );
  }
  for archive in stock {
    if archive.contains_entry(&compiled) {
      return (
        "stock".into(),
        archive
          .extract_entry_limited(&compiled, 64 * 1024 * 1024)
          .map_err(|error| error.to_string()),
      );
    }
  }
  (
    "missing".into(),
    Err("Not present in the addon, selected archive, or installed stock game".into()),
  )
}

fn inspect(
  addon: Option<super::modding_workspace::ModdingAddon>,
  hierarchy: ModdingHierarchy,
  path: &str,
  archive_path: Option<String>,
) -> Result<ModdingResourceDocument, Error> {
  let archive = super::modding_archive::archive_path(archive_path)
    .and_then(|path| super::foundry::open_archive(&path, None));
  let bytes = if let Some(addon) = &addon {
    read_limited(&contained(&addon.root(hierarchy), path)?)?
  } else {
    archive
      .as_ref()
      .map_err(|error| Error::InvalidInput(error.to_string()))?
      .extract_entry_limited(path, 64 * 1024 * 1024)
      .map_err(|error| Error::InvalidInput(error.to_string()))?
  };
  let mut document = parse_document(&bytes, path.ends_with("_c"))?;
  document.editable = !path.ends_with("_c")
    && addon
      .as_ref()
      .is_some_and(|addon| !addon.id.starts_with("local:"))
    && matches!(hierarchy, ModdingHierarchy::Content);
  let mut stock = Vec::new();
  if let Ok(game) = super::state::game_path() {
    for path in ["game/citadel/pak01_dir.vpk", "game/core/pak01_dir.vpk"] {
      let path = game.join(path);
      if path.is_file() {
        stock.push(super::foundry::open_archive(&path, None)?);
      }
    }
  }
  let mut pending: VecDeque<_> = std::mem::take(&mut document.references).into();
  let mut seen = BTreeSet::new();
  let mut expanded = BTreeSet::new();
  while let Some(mut reference) = pending.pop_front() {
    if !seen.insert((reference.path.clone(), reference.via.clone())) {
      continue;
    }
    if seen.len() > 4096 {
      document.diagnostics.push("Dependency traversal reached 4096 references; remaining transitive dependencies were not inspected".into());
      break;
    }
    let (origin, bytes) = dependency(
      &reference.path,
      addon.as_ref(),
      archive.as_deref().ok(),
      &stock,
    );
    reference.origin = origin;
    match bytes {
      Err(error) => reference.diagnostic = Some(error),
      Ok(bytes)
        if expanded.insert(reference.path.clone())
          && [".vmat", ".vmat_c", ".vpcf", ".vpcf_c"]
            .iter()
            .any(|extension| reference.path.ends_with(extension)) =>
      {
        if let Ok(resource) = Resource::parse(bytes)
          && let Some(table) = resource.block_bytes("RERL")
        {
          match super::modding_dependencies::references(table) {
            Ok(children) => pending.extend(children.into_iter().map(|path| ModdingReference {
              path,
              via: reference.path.clone(),
              origin: String::new(),
              diagnostic: None,
            })),
            Err(error) => reference.diagnostic = Some(error.to_string()),
          }
        }
      }
      _ => {}
    }
    document.references.push(reference);
  }
  Ok(document)
}

#[tauri::command]
pub async fn inspect_modding_resource(
  app: AppHandle,
  addon_id: Option<String>,
  hierarchy: ModdingHierarchy,
  path: String,
  archive_path: Option<String>,
) -> Result<ModdingResourceDocument, Error> {
  super::modding_workspace::relative(&path, false)?;
  let addon = addon_id
    .map(|id| super::modding_local::resolve_read(&app, &id))
    .transpose()?;
  let archive_path =
    archive_path.or_else(|| addon.as_ref().map(|addon| addon.archive_path.clone()));
  tauri::async_runtime::spawn_blocking(move || inspect(addon, hierarchy, &path, archive_path))
    .await
    .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}

#[tauri::command]
pub async fn save_modding_resource(
  app: AppHandle,
  addon_id: String,
  path: String,
  fingerprint: String,
  text: String,
) -> Result<String, Error> {
  let addon = resolve(&app, &addon_id)?;
  if !["vmat", "vpcf", "vdata", "vsndevts"].contains(
    &Path::new(&path)
      .extension()
      .and_then(|value| value.to_str())
      .unwrap_or(""),
  ) {
    return Err(Error::InvalidInput(
      "Only editable VMAT, VPCF, VDATA, and VSNDEVTS sources can be saved here".into(),
    ));
  }
  tauri::async_runtime::spawn_blocking(move || {
    let _guard = modding_edits::EDIT_LOCK
      .lock()
      .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?;
    if text.len() > 4 * 1024 * 1024 {
      return Err(Error::InvalidInput(
        "Resource source editing is limited to 4 MB".into(),
      ));
    }
    super::modding_source::fields(&text)?;
    let root = Path::new(&addon.content_path);
    let current = std::fs::read(contained(root, &path)?)?;
    if modding_edits::fingerprint(&current) != fingerprint {
      return Err(Error::InvalidInput(
        "The source changed on disk. Reopen it before saving to preserve newer edits.".into(),
      ));
    }
    modding_edits::commit(
      root,
      vec![Edit {
        from: path.clone(),
        to: path,
        bytes: text.into_bytes(),
      }],
    )
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}

#[tauri::command]
pub async fn edit_modding_source_field(
  text: String,
  path: String,
  value: String,
) -> Result<String, Error> {
  tauri::async_runtime::spawn_blocking(move || {
    super::modding_source::replace_field(&text, &path, &value)
  })
  .await
  .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}

#[tauri::command]
pub async fn parse_modding_resource_source(text: String) -> Result<ModdingResourceDocument, Error> {
  if text.len() > 4 * 1024 * 1024 {
    return Err(Error::InvalidInput(
      "Source inspection is limited to 4 MB".into(),
    ));
  }
  tauri::async_runtime::spawn_blocking(move || parse_document(text.as_bytes(), false))
    .await
    .map_err(|error| Error::BackgroundTaskFailed(error.to_string()))?
}

#[cfg(test)]
mod editor_tests {
  use super::*;
  #[test]
  fn source_editor_updates_properties_and_preserves_typed_references_and_comments() {
    let source = "{\n // keep this comment\n damage = 100\n m_strAbilityImage = panorama:\"file://{images}/hud/abilities/wraith_lift.psd\"\n}\n";
    let updated = super::super::modding_source::replace_field(source, "damage", "125").unwrap();
    let parsed = parse_document(updated.as_bytes(), false).unwrap();
    assert!(parsed.editable);
    assert!(parsed.diagnostics.is_empty(), "{:?}", parsed.diagnostics);
    assert_eq!(
      parsed
        .properties
        .iter()
        .find(|field| field.path == "damage")
        .unwrap()
        .value,
      "125"
    );
    assert!(updated.contains("// keep this comment"));
    assert!(updated.contains("panorama:\"file://{images}/hud/abilities/wraith_lift.psd\""));
    assert_eq!(parsed.text, updated);
  }
  #[test]
  fn incomplete_source_reports_validation_errors_without_changing_the_draft() {
    let source = "{ damage = ";
    let parsed = parse_document(source.as_bytes(), false).unwrap();
    assert_eq!(parsed.text, source);
    assert!(!parsed.diagnostics.is_empty());
  }
}
