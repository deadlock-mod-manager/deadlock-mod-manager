//! Reversible, addon-local model edits applied again after resource compilation.
mod bake;
mod patches;
pub use patches::ModdingModelPatch;
pub(crate) mod paint;
mod runtime_cloth;
mod storage;
mod style;
pub use paint::ModdingModelPaint;
pub use style::{
  ModdingMaterialControl, ModdingMaterialExpression, ModdingMaterialProperty, ModdingModelPattern,
};

use super::{
  foundry::{FoundryModel, ModelAssets},
  modding_edits::fingerprint,
  modding_workspace::{ModdingAddon, contained, relative},
};
use crate::{app_runtime::AppHandle, errors::Error};
use serde::{Deserialize, Serialize};
use source2_model::vpk_extract::VpkArchive;
use std::{
  collections::{BTreeMap, BTreeSet},
  path::Path,
  sync::Arc,
};
use tauri::State;
use ts_rs::TS;
use vpkmanager::model_edit::material_layout;

fn invalid(message: impl Into<String>) -> Error {
  Error::InvalidInput(message.into())
}
#[derive(Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingModelPartEdit {
  pub material: String,
  pub hidden: bool,
  pub tint: Option<String>,
  pub recolor: Option<ModdingModelRecolor>,
  pub roughness: Option<f64>,
  pub metalness: Option<f64>,
  #[serde(default)]
  pub pattern: Option<ModdingModelPattern>,
  #[serde(default)]
  pub paint: Option<ModdingModelPaint>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  #[ts(optional)]
  pub patches: Option<Vec<ModdingModelPatch>>,
  #[serde(default)]
  pub parameters: Vec<ModdingMaterialProperty>,
  #[serde(default)]
  pub expressions: Vec<ModdingMaterialExpression>,
}
#[derive(Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingModelRecolor {
  pub color: String,
  pub saturation: f64,
  pub brightness: f64,
}
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingModelPart {
  pub material: String,
  pub tintable: bool,
  pub roughness_editable: bool,
  pub metalness_editable: bool,
  pub diagnostic: Option<String>,
  pub controls: Vec<ModdingMaterialControl>,
  pub attributes: Vec<String>,
}
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename_all = "camelCase")]
pub struct ModdingModelEditDocument {
  pub fingerprint: String,
  pub parts: Vec<ModdingModelPart>,
  pub edits: Vec<ModdingModelPartEdit>,
  pub model: FoundryModel,
}
fn validate_model_path(path: &str) -> Result<(), Error> {
  relative(path, false)?;
  if !path.ends_with(".vmdl_c") {
    return Err(invalid(
      "Select a VMDL model; compile a new source model before editing its parts",
    ));
  }
  Ok(())
}
fn hex(value: &str) -> bool {
  value.len() == 7 && value.starts_with('#') && value[1..].bytes().all(|b| b.is_ascii_hexdigit())
}
fn validate_edits(edits: &[ModdingModelPartEdit]) -> Result<(), Error> {
  let mut seen = BTreeSet::new();
  if edits.is_empty() || edits.len() > 256 || edits.iter().all(|e| e.hidden) {
    return Err(invalid(
      "Choose 1–256 material groups and keep at least one visible",
    ));
  }
  let mut patch_ids = BTreeSet::new();
  for edit in edits {
    style::validate(edit)?;
    if let Some(paint) = &edit.paint {
      paint::validate(paint)?;
    }
    if let Some(patches) = &edit.patches {
      patches::validate(patches)?;
      for patch in patches {
        if !patch_ids.insert(&patch.id) || patch_ids.len() > 8 {
          return Err(invalid(
            "A model supports at most eight stickers with unique IDs",
          ));
        }
      }
    }
    relative(&edit.material, false)?;
    if !edit.material.ends_with(".vmat")
      || !seen.insert(edit.material.to_ascii_lowercase())
      || edit.tint.as_ref().is_some_and(|c| !hex(c))
      || edit.recolor.as_ref().is_some_and(|r| {
        !hex(&r.color)
          || !r.saturation.is_finite()
          || !(0.0..=2.0).contains(&r.saturation)
          || !r.brightness.is_finite()
          || !(0.0..=2.0).contains(&r.brightness)
      })
      || [edit.roughness, edit.metalness]
        .into_iter()
        .flatten()
        .any(|v| !v.is_finite() || !(0.0..=1.0).contains(&v))
    {
      return Err(invalid("Invalid or duplicate model material edit"));
    }
  }
  Ok(())
}
fn changed(edit: &ModdingModelPartEdit) -> bool {
  edit.hidden
    || edit.tint.is_some()
    || edit.recolor.is_some()
    || edit.roughness.is_some()
    || edit.metalness.is_some()
    || edit.pattern.is_some()
    || edit.paint.is_some()
    || edit
      .patches
      .as_ref()
      .is_some_and(|patches| !patches.is_empty())
    || !edit.parameters.is_empty()
    || !edit.expressions.is_empty()
}
fn default_edit(material: String) -> ModdingModelPartEdit {
  ModdingModelPartEdit {
    material,
    hidden: false,
    tint: None,
    recolor: None,
    roughness: None,
    metalness: None,
    pattern: None,
    paint: None,
    patches: None,
    parameters: Vec::new(),
    expressions: Vec::new(),
  }
}
fn archive(addon: &ModdingAddon) -> Result<Arc<VpkArchive>, Error> {
  super::foundry::open_archive(
    Path::new(&addon.archive_path),
    Some(Path::new(&addon.game_path)),
  )
}
fn inspect(
  addon: &ModdingAddon,
  path: &str,
  saved: &storage::Saved,
  archive: &VpkArchive,
) -> Result<(String, Vec<ModdingModelPart>, Vec<ModdingModelPartEdit>), Error> {
  validate_model_path(path)?;
  storage::verify(addon, saved)?;
  let model = storage::original(addon, saved, archive, path)?;
  let names = vpkmanager::material_repair::drawn_materials(&model).map_err(|e| {
    invalid(format!(
      "This model needs compiled embedded meshes before editing: {e}"
    ))
  })?;
  let mut parts = Vec::new();
  let mut editable_textures = BTreeMap::new();
  let mut fingerprints = BTreeMap::new();
  fingerprints.insert(path.to_owned(), fingerprint(&model));
  let source = contained(Path::new(&addon.content_path), path.trim_end_matches("_c"))?;
  if source.is_file() {
    fingerprints.insert("source".into(), fingerprint(&storage::read(&source)?));
  }
  for name in names {
    let name = name.trim_end_matches("_c").to_owned();
    relative(&name, false)?;
    let compiled = format!("{name}_c");
    let bytes = storage::original(addon, saved, archive, &compiled)?;
    fingerprints.insert(compiled.clone(), fingerprint(&bytes));
    let layout = material_layout(&bytes).map_err(|e| invalid(e.to_string()))?;
    let (material_tree, _, _) =
      vpkmanager::material_repair::decode(&bytes).map_err(|e| invalid(e.to_string()))?;
    let mask_textures = vpkmanager::model_edit::material::PARAMETERS
      .iter()
      .filter_map(|spec| vpkmanager::model_edit::material::texture_binding(spec.name))
      .filter_map(|(slot, _)| {
        vpkmanager::model_edit::material::texture_path(&material_tree, slot).map(str::to_owned)
      })
      .collect::<Vec<_>>();
    for texture in layout
      .color
      .iter()
      .map(|(_, path)| path)
      .chain(layout.roughness.iter().map(|(_, path, _)| path))
      .chain(layout.metalness.iter().map(|(_, path, _)| path))
      .chain(mask_textures.iter())
    {
      let texture = if texture.ends_with("_c") {
        texture.clone()
      } else {
        format!("{texture}_c")
      };
      relative(&texture, false)?;
      if !fingerprints.contains_key(&texture) {
        let bytes = storage::original(addon, saved, archive, &texture)?;
        editable_textures.insert(
          texture.clone(),
          vpkmanager::model_edit::texture_editable(&bytes),
        );
        fingerprints.insert(texture.clone(), fingerprint(&bytes));
      }
    }
    let editable = |path: &str| {
      let path = if path.ends_with("_c") {
        path.into()
      } else {
        format!("{path}_c")
      };
      editable_textures.get(&path) == Some(&true)
    };
    let tintable = layout.pbr
      && layout
        .color
        .as_ref()
        .is_some_and(|(_, path)| editable(path));
    let roughness_editable = layout.finishable
      && layout
        .roughness
        .as_ref()
        .is_some_and(|(_, path, _)| editable(path));
    let metalness_editable = layout.finishable
      && layout
        .metalness
        .as_ref()
        .is_some_and(|(_, path, _)| editable(path));
    parts.push(ModdingModelPart {
      controls: if layout.pbr {
        style::controls(&bytes)?
      } else {
        Vec::new()
      },
      attributes: {
        let (tree, _, _) =
          vpkmanager::material_repair::decode(&bytes).map_err(|e| invalid(e.to_string()))?;
        tree
          .get("m_renderAttributesUsed")
          .and_then(vpkmanager::source2::kv3::Value::as_array)
          .unwrap_or(&[])
          .iter()
          .filter_map(|v| v.as_str().map(str::to_owned))
          .collect()
      },
      material: name,
      tintable,
      roughness_editable,
      metalness_editable,
      diagnostic: if !layout.pbr {
        Some("shader".into())
      } else if !layout.finishable {
        Some("dynamicFinish".into())
      } else if layout.color.is_none() || layout.roughness.is_none() || layout.metalness.is_none() {
        Some("missingChannels".into())
      } else if !tintable || !roughness_editable || !metalness_editable {
        Some("textureFormat".into())
      } else {
        None
      },
    });
  }
  if parts.is_empty() || parts.len() > 256 {
    return Err(invalid(
      "This model must have 1–256 embedded material groups",
    ));
  }
  let edits = parts
    .iter()
    .map(|part| {
      let mut edit = saved
        .models
        .values()
        .flatten()
        .find(|edit| {
          edit.material == part.material
            && (edit.tint.is_some()
              || edit.recolor.is_some()
              || edit.roughness.is_some()
              || edit.metalness.is_some()
              || edit.pattern.is_some()
              || edit.paint.is_some()
              || !edit.parameters.is_empty()
              || !edit.expressions.is_empty())
        })
        .cloned()
        .unwrap_or_else(|| default_edit(part.material.clone()));
      edit.patches = saved
        .models
        .get(path)
        .into_iter()
        .flatten()
        .find(|local| local.material == part.material)
        .and_then(|local| local.patches.clone());
      edit.hidden = saved
        .models
        .get(path)
        .into_iter()
        .flatten()
        .any(|edit| edit.material == part.material && edit.hidden);
      edit
    })
    .collect();
  // Reapplying a recipe can refresh generated hashes and cache keys without changing its inputs.
  let serialized =
    serde_json::to_vec(&(&saved.models, fingerprints)).map_err(|e| invalid(e.to_string()))?;
  Ok((fingerprint(&serialized), parts, edits))
}

#[tauri::command]
pub async fn inspect_modding_model_edits(
  app: AppHandle,
  assets: State<'_, Arc<ModelAssets>>,
  addon_id: String,
  path: String,
  request_id: String,
) -> Result<ModdingModelEditDocument, Error> {
  let addon = super::modding_workspace::resolve(&app, &addon_id)?;
  let assets = assets.inner().clone();
  let job = assets.start_job(request_id)?;
  tauri::async_runtime::spawn_blocking(move || {
    let _guard = super::modding_build::BUILD_LOCK
      .lock()
      .map_err(|e| invalid(e.to_string()))?;
    job.check()?;
    let saved = storage::load(&addon)?;
    let current = archive(&addon)?;
    let (fingerprint, parts, edits) = inspect(&addon, &path, &saved, &current)?;
    let (_empty, baseline) = storage::baseline_archive(&addon, current)?;
    let decoded =
      source2_model::decode_model_glb_from_archive_with_texture_side(&baseline, &path, 1024)
        .map_err(|e| invalid(e.to_string()))?;
    job.check()?;
    let model = assets.publish(&decoded.glb, decoded.vertex_count, decoded.index_count)?;
    if let Err(error) = job.check() {
      assets.release(&model.asset_id)?;
      return Err(error);
    }
    Ok(ModdingModelEditDocument {
      fingerprint,
      parts,
      edits,
      model,
    })
  })
  .await
  .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?
}

fn update_models(saved: &mut storage::Saved, path: &str, edits: Vec<ModdingModelPartEdit>) {
  for existing in saved.models.values_mut().flatten() {
    if let Some(edit) = edits.iter().find(|edit| edit.material == existing.material) {
      existing.tint = edit.tint.clone();
      existing.recolor = edit.recolor.clone();
      existing.roughness = edit.roughness;
      existing.metalness = edit.metalness;
      existing.pattern = edit.pattern.clone();
      existing.parameters = edit.parameters.clone();
      existing.expressions = edit.expressions.clone();
    }
  }
  saved.models.insert(path.into(), edits);
  saved.models.retain(|_, edits| edits.iter().any(changed));
}

#[tauri::command]
pub async fn save_modding_model_edits(
  app: AppHandle,
  addon_id: String,
  path: String,
  expected_fingerprint: String,
  edits: Vec<ModdingModelPartEdit>,
) -> Result<(), Error> {
  let addon = super::modding_workspace::resolve(&app, &addon_id)?;
  tauri::async_runtime::spawn_blocking(move || {
    let _guard = super::modding_build::BUILD_LOCK
      .lock()
      .map_err(|e| invalid(e.to_string()))?;
    validate_edits(&edits)?;
    let mut saved = storage::load(&addon)?;
    let current = archive(&addon)?;
    let (fingerprint, parts, _) = inspect(&addon, &path, &saved, &current)?;
    if fingerprint != expected_fingerprint {
      return Err(invalid(
        "Model inputs changed. Reload the model editor before saving",
      ));
    }
    if parts.len() != edits.len() {
      return Err(invalid(
        "Edits must cover the model's exact material groups",
      ));
    }
    for edit in &edits {
      let part = parts
        .iter()
        .find(|p| p.material == edit.material)
        .ok_or_else(|| invalid("Unknown model material"))?;
      if ((edit.tint.is_some()
        || edit.recolor.is_some()
        || edit.pattern.is_some()
        || edit.paint.is_some())
        && !part.tintable)
        || (edit.roughness.is_some() && !part.roughness_editable)
        || (edit.metalness.is_some() && !part.metalness_editable)
        || ((!edit.parameters.is_empty() || !edit.expressions.is_empty())
          && part.controls.is_empty())
      {
        return Err(invalid("This material does not support the requested edit"));
      }
    }
    update_models(&mut saved, &path, edits);
    bake::apply(&addon, saved, false, Some((path, expected_fingerprint)))
  })
  .await
  .map_err(|e| Error::BackgroundTaskFailed(e.to_string()))?
}

pub(super) fn reapply_after_compile(addon: &ModdingAddon) -> Result<(), Error> {
  runtime_cloth::prepare(addon)?;
  let saved = storage::load(addon)?;
  if saved.models.is_empty() {
    return Ok(());
  }
  bake::apply(addon, saved, true, None)
}

pub(super) fn hidden_materials(addon: &ModdingAddon, path: &str) -> Result<Vec<String>, Error> {
  Ok(
    storage::load(addon)?
      .models
      .get(&format!("{path}_c"))
      .into_iter()
      .flatten()
      .filter(|edit| edit.hidden)
      .map(|edit| edit.material.clone())
      .collect(),
  )
}

#[cfg(test)]
mod tests;

#[tauri::command]
pub fn preview_modding_model_pattern(style: String, phase: f64) -> Result<String, Error> {
  use base64::Engine;
  if !phase.is_finite() || !(0.0..=1.0).contains(&phase) {
    return Err(invalid("Invalid pattern phase"));
  }
  let style =
    vpkmanager::PatternStyle::parse(&style).ok_or_else(|| invalid("Unsupported pattern"))?;
  let bytes = vpkmanager::pattern_swatch(vpkmanager::Pattern::new(style, 1., phase as f32), 128);
  Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}
