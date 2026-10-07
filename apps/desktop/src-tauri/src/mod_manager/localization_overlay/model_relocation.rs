//! Follow recorded hero model bindings to the current registry, preserving authored assets.
use super::{
  CompiledDataSource, HEROES_VDATA_PATH,
  animation_model_evidence::AnimationInputs,
  asset_compatibility::{self, AssetRepair, AssetWarning, RepairKind, WarningKind},
  decode_compiled_data, model_animation, model_camera,
  repair_scope::RepairScope,
  resources::{ResourceSnapshot, resource_path},
};
use crate::{errors::Error, mod_manager::vdata_history::VdataHistoryIndex};
use std::collections::{BTreeMap, BTreeSet};
use std::sync::OnceLock;

#[derive(serde::Deserialize)]
struct ArchivedBindings {
  bindings: BTreeMap<String, Vec<String>>,
}

fn observed_binding(history: &VdataHistoryIndex, row: &str, model: &str) -> bool {
  static ARCHIVE: OnceLock<ArchivedBindings> = OnceLock::new();
  history.observed_string_field(HEROES_VDATA_PATH, row, "m_strModelName", model)
    || ARCHIVE
      .get_or_init(|| {
        serde_json::from_slice(include_bytes!("../../../assets/hero-model-bindings.json"))
          .expect("archived hero bindings must be valid")
      })
      .bindings
      .get(row)
      .is_some_and(|models| {
        models
          .iter()
          .any(|name| resource_path(name) == resource_path(model))
      })
}

pub(super) fn prepare(
  resources: &ResourceSnapshot,
  sources: &BTreeMap<String, Vec<CompiledDataSource>>,
  history: &VdataHistoryIndex,
  inputs: &AnimationInputs,
  scope: &RepairScope,
  repairs: &mut Vec<AssetRepair>,
  warnings: &mut Vec<AssetWarning>,
) -> Result<BTreeMap<String, Vec<u8>>, Error> {
  let mut output = BTreeMap::new();
  if sources.is_empty() {
    return Ok(output);
  }
  let Some(bytes) = resources.game_bytes(HEROES_VDATA_PATH)? else {
    return Ok(output);
  };
  let Ok((_, heroes, _)) = decode_compiled_data(&bytes, HEROES_VDATA_PATH) else {
    return Ok(output);
  };
  let Some(rows) = heroes.as_object() else {
    return Ok(output);
  };
  let registry_modified = resources
    .provider(HEROES_VDATA_PATH)
    .is_some_and(|provider| provider.mod_id.is_some());
  let effective = if registry_modified {
    resources
      .resolve(HEROES_VDATA_PATH)?
      .and_then(|(_, bytes)| decode_compiled_data(&bytes, HEROES_VDATA_PATH).ok())
      .map(|(_, root, _)| root)
  } else {
    None
  };
  let overridden_roots: BTreeSet<_> = rows
    .iter()
    .filter_map(|(name, row)| {
      let target = resource_path(row.get("m_strModelName")?.as_str()?)?;
      let effective_target = effective
        .as_ref()
        .and_then(|root| root.get(name))
        .and_then(|row| row.get("m_strModelName"))
        .and_then(|model| model.as_str())
        .and_then(resource_path);
      (registry_modified && effective_target.as_ref() != Some(&target)).then_some(target)
    })
    .collect();
  let roots: BTreeSet<_> = rows
    .iter()
    .filter_map(|(_, row)| {
      let name = row.get("m_strModelName")?.as_str()?;
      let path = resource_path(name)?;
      model_camera::is_path(&path).then_some(path)
    })
    .collect();
  let mut candidates = BTreeMap::<String, Vec<(&String, &CompiledDataSource)>>::new();
  for (path, providers) in sources {
    if roots.contains(path) {
      continue;
    }
    let [source] = providers.as_slice() else {
      continue;
    };
    let Some(old_name) = path.strip_suffix("_c") else {
      continue;
    };
    let targets: BTreeSet<_> = rows
      .iter()
      .filter_map(|(row_name, row)| {
        if !observed_binding(history, row_name, old_name) {
          return None;
        }
        let target = resource_path(row.get("m_strModelName")?.as_str()?)?;
        model_camera::is_path(&target).then_some(target)
      })
      .collect();
    if targets.is_empty() {
      continue;
    }
    let targets: Vec<_> = targets.into_iter().collect();
    let [target] = targets.as_slice() else {
      warn(
        warnings,
        source,
        path,
        format!(
          "Historical hero bindings associate this old model with multiple current models: {}",
          targets.join(", ")
        ),
      );
      continue;
    };
    candidates
      .entry(target.clone())
      .or_default()
      .push((path, source));
  }
  for (target, providers) in candidates {
    for (path, source) in &providers {
      if providers.len() != 1
        || scope.protects(&target)
        || overridden_roots.contains(&target)
        || resources
          .provider(&target)
          .is_some_and(|provider| provider.mod_id.is_some())
      {
        warn(
          warnings,
          source,
          path,
          format!(
            "Model relocation to {target} is blocked by competing models, opted-out resources, or modified hero model bindings"
          ),
        );
        continue;
      }
      let relocated = BTreeMap::from([(
        target.clone(),
        vec![CompiledDataSource {
          mod_id: source.mod_id.clone(),
          source_vpk: source.source_vpk.clone(),
          priority: source.priority,
          bytes: source.bytes.clone(),
        }],
      )]);
      let mut verified_repairs = Vec::new();
      let mut unverified = Vec::new();
      let mut animation = model_animation::prepare(
        resources,
        &relocated,
        inputs,
        &mut verified_repairs,
        &mut unverified,
      )?;
      if !animation.contains_key(&target) {
        let existing = resources
          .game_bytes(&target)?
          .and_then(|bytes| decode_compiled_data(&bytes, &target).ok())
          .zip(decode_compiled_data(&source.bytes, path).ok());
        if let Some(((_, current, _), (_, old, _))) = existing
          && model_animation::prove_current_bindings(
            resources,
            &old,
            &current,
            inputs,
            &source.mod_id,
          )
          .is_ok()
          {
            animation.insert(target.clone(), source.bytes.clone());
          }
      }
      if !animation.contains_key(&target) {
        let reasons = unverified
          .iter()
          .map(|warning| warning.detail.as_str())
          .collect::<Vec<_>>()
          .join("; ");
        warn(
          warnings,
          source,
          path,
          format!(
            "Historical hero binding maps this model to current hero model {target}, but animation preservation could not be verified. {reasons}"
          ),
        );
        continue;
      }
      let models = model_camera::prepare(
        resources,
        &relocated,
        inputs,
        &animation,
        &mut verified_repairs,
      )?;
      let repaired = models
        .iter()
        .map(|(path, bytes)| (path.as_str(), bytes.as_slice()))
        .collect();
      unverified.extend(asset_compatibility::analyze(
        resources, &relocated, &repaired,
      )?);
      if !unverified.is_empty() {
        let reasons = unverified
          .iter()
          .map(|warning| warning.detail.as_str())
          .collect::<Vec<_>>()
          .join("; ");
        warn(
          warnings,
          source,
          path,
          format!("Model relocation to {target} remains unverified: {reasons}"),
        );
        continue;
      }
      repairs.extend(verified_repairs);
      repairs.push(AssetRepair {
        mod_id: source.mod_id.clone(),
        source_vpk: source.source_vpk.clone(),
        file_path: target.clone(),
        kind: RepairKind::ModelRelocation,
      });
      output.extend(models);
    }
  }
  Ok(output)
}

fn warn(warnings: &mut Vec<AssetWarning>, source: &CompiledDataSource, path: &str, detail: String) {
  warnings.push(AssetWarning {
    mod_id: source.mod_id.clone(),
    source_vpk: source.source_vpk.clone(),
    file_path: path.into(),
    kind: WarningKind::ModelMapping,
    detail,
  });
}

#[cfg(test)]
mod tests;
