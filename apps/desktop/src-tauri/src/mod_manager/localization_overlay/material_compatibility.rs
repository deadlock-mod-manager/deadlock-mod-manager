//! Material migrations are reviewed correspondences, not filename guesses.
//! Resolve the current definition, then validate draw calls, mesh scope and
//! shader interfaces before publishing any assets from a recipe.
use super::{
  asset_compatibility::{AssetRepair, AssetWarning, RepairKind, WarningKind},
  resources::ResourceSnapshot,
};
use crate::errors::Error;
use sha2::{Digest, Sha256};
use std::{
  collections::{BTreeMap, BTreeSet},
  sync::Arc,
};
use vpkmanager::{material_repair as edit, resource_id::resource_id};

mod interface;
mod minion_glow;

type Assets = BTreeMap<String, Vec<u8>>;

pub(super) fn prepare(
  resources: &ResourceSnapshot,
  other_repairs: &Assets,
  scope: &super::repair_scope::RepairScope,
  repairs: &mut Vec<AssetRepair>,
  warnings: &mut Vec<AssetWarning>,
) -> Result<Assets, Error> {
  inspect_materials(resources, scope, warnings)?;
  let candidates: Vec<_> = resources
    .mod_paths()
    .filter(|path| {
      minion_glow::source_role(path).is_some()
        && !scope.protects(path)
        && resources
          .provider(path)
          .and_then(|provider| provider.mod_id)
          .is_some_and(|id| scope.includes_mod(&id))
    })
    .cloned()
    .collect();
  if candidates.is_empty() {
    return Ok(Assets::new());
  }
  let providers: Vec<_> = candidates
    .iter()
    .filter_map(|path| resources.provider(path))
    .collect();
  let Some(owner) = providers.first() else {
    return Ok(Assets::new());
  };
  let mod_id = owner
    .mod_id
    .clone()
    .expect("candidate is an enabled mod resource");
  let source_vpk = owner
    .archive
    .file_name()
    .unwrap_or_default()
    .to_string_lossy()
    .into_owned();
  let attempt = (|| {
    if candidates.len() != minion_glow::ROLES.len()
      || providers
        .iter()
        .any(|provider| provider.archive != owner.archive)
    {
      return Err(Error::ModInvalid("The four material roles must resolve from one source archive; partial or competing overrides cannot be migrated".into()));
    }
    let generated = minion_glow::build(resources, &candidates)?;
    if let Some(path) = generated.keys().find(|path| scope.protects(path)) {
      return Err(Error::ModInvalid(format!(
        "Compatibility is disabled for a mod providing {path}"
      )));
    }
    if let Some(path) = generated
      .keys()
      .find(|path| other_repairs.contains_key(*path))
    {
      return Err(Error::ModInvalid(format!(
        "Another compatibility repair owns {path}"
      )));
    }
    Ok(generated)
  })();
  match attempt {
    Ok(generated) => {
      for path in generated.keys().filter(|path| path.ends_with(".vmdl_c")) {
        repairs.push(AssetRepair {
          mod_id: mod_id.clone(),
          source_vpk: source_vpk.clone(),
          file_path: path.clone(),
          kind: RepairKind::MaterialBindings,
        });
      }
      Ok(generated)
    }
    Err(error) => {
      for provider in providers {
        warnings.push(AssetWarning {
          mod_id: provider.mod_id.unwrap_or_default(),
          source_vpk: provider
            .archive
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
          file_path: provider.entry,
          kind: WarningKind::MaterialMapping,
          detail: error.to_string(),
        });
      }
      Ok(Assets::new())
    }
  }
}

/// Dependency validation also covers materials without a migration recipe.
/// Parsing and dependency presence do not establish runtime shader correctness.
fn inspect_materials(
  resources: &ResourceSnapshot,
  scope: &super::repair_scope::RepairScope,
  warnings: &mut Vec<AssetWarning>,
) -> Result<(), Error> {
  for path in resources
    .mod_paths()
    .filter(|path| path.ends_with(".vmat_c") && minion_glow::source_role(path).is_none())
  {
    let Some(provider) = resources.provider(path) else {
      continue;
    };
    if !provider
      .mod_id
      .as_deref()
      .is_some_and(|id| scope.includes_mod(id))
      || scope.protects(path)
    {
      continue;
    }
    let Some((provider, bytes)) = resources.resolve(path)? else {
      continue;
    };
    let mut add = |kind, detail| {
      warnings.push(AssetWarning {
        mod_id: provider.mod_id.clone().unwrap_or_default(),
        source_vpk: provider
          .archive
          .file_name()
          .unwrap_or_default()
          .to_string_lossy()
          .into_owned(),
        file_path: path.clone(),
        kind,
        detail,
      })
    };
    let source = match edit::decode(&bytes) {
      Ok((value, _, _)) => value,
      Err(error) => {
        add(WarningKind::UnreadableResource, error.to_string());
        continue;
      }
    };
    if let Some(current) = resources.game_bytes(path)? {
      match edit::decode(&current) {
        Ok((current, _, _)) => match interface::differences(&source, &current) {
          Ok(details) => {
            for detail in details {
              add(WarningKind::MaterialInterface, detail);
            }
          }
          Err(detail) => add(WarningKind::MaterialInterface, detail),
        },
        Err(error) => add(
          WarningKind::MaterialInterface,
          format!("Current material interface could not be decoded: {error}"),
        ),
      }
    }
    let resource = match vpkmanager::source2::resource::Resource::parse(&bytes) {
      Ok(resource) => resource,
      Err(error) => {
        add(WarningKind::UnreadableResource, error.to_string());
        continue;
      }
    };
    if resource.find_block(*b"RERL").is_none() {
      continue;
    }
    match edit::references(&bytes) {
      Ok(references) => {
        for (_, name) in references {
          if resources.resolve(&name)?.is_none() {
            add(WarningKind::MissingResource, name);
          }
        }
      }
      Err(error) => add(WarningKind::UnreadableResource, error.to_string()),
    }
  }
  Ok(())
}

fn invalid(error: impl std::fmt::Display) -> Error {
  Error::ModInvalid(error.to_string())
}

/// A recipe cannot replace assets supplied by another mod, including textures.
fn baseline(resources: &ResourceSnapshot, path: &str) -> Result<Arc<Vec<u8>>, Error> {
  let current = resources
    .game_bytes(path)?
    .ok_or_else(|| invalid(format!("Missing current game dependency {path}")))?;
  if let Some((provider, effective)) = resources.resolve(path)?
    && provider.mod_id.is_some()
      && effective != current
      && !((path.ends_with(".vtex") || path.ends_with(".vtex_c"))
        && same_texture_runtime(&effective, &current))
    {
      return Err(invalid(format!(
        "Enabled mod overrides migration dependency {path}"
      )));
    }
  Ok(current)
}

fn same_texture_runtime(left: &[u8], right: &[u8]) -> bool {
  use vpkmanager::source2::{inspect, resource::Resource};
  let payload = |bytes: &[u8]| -> Option<(Vec<u8>, Vec<u8>, bool)> {
    let resource = Resource::parse(bytes).ok()?;
    // Only compiler provenance may differ; do not ignore unknown runtime blocks.
    if resource
      .blocks()
      .iter()
      .any(|block| ![*b"DATA", *b"REDI", *b"RED2"].contains(&block.kind))
      || resource
        .blocks()
        .iter()
        .filter(|block| block.kind == *b"DATA")
        .count()
        != 1
    {
      return None;
    }
    let end = u32::from_le_bytes(bytes.get(..4)?.try_into().ok()?) as usize;
    if end
      < resource
        .blocks()
        .iter()
        .map(|b| b.offset as usize + b.size as usize)
        .max()?
    {
      return None;
    }
    let info = inspect(bytes).ok()?;
    Some((
      resource.data_block().ok()?.to_vec(),
      bytes.get(end..)?.to_vec(),
      info.ycocg,
    ))
  };
  left.get(4..8) == right.get(4..8)
    && payload(left).is_some_and(|a| payload(right).is_some_and(|b| a == b))
}

fn validate_dependencies(resources: &ResourceSnapshot, assets: &Assets) -> Result<(), Error> {
  for (path, bytes) in assets {
    let mut ids = BTreeMap::new();
    let mut names = BTreeSet::new();
    for (id, name) in edit::references(bytes).map_err(invalid)? {
      if ids.insert(id, name.clone()).is_some_and(|old| old != name) || !names.insert(name.clone())
      {
        return Err(invalid(format!("Ambiguous resource references in {path}")));
      }
      let compiled = format!("{name}_c");
      if !assets.contains_key(&compiled) && resources.resolve(&name)?.is_none() {
        return Err(invalid(format!("{path} requires missing resource {name}")));
      }
    }
  }
  Ok(())
}

#[cfg(test)]
mod tests;
