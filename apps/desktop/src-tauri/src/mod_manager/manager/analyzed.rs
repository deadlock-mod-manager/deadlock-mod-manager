use super::*;
use std::fs;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzedModRegistration {
  pub replaced_mod_ids: Vec<String>,
  pub install_order: Option<u32>,
}

impl ModManager {
  pub fn register_analyzed_mod(
    &mut self,
    mod_id: String,
    mod_name: String,
    installed_vpks: Vec<String>,
    installed_paths: Option<Vec<String>>,
    profile_folder: Option<String>,
  ) -> Result<AnalyzedModRegistration, Error> {
    Self::ensure_safe_mod_id(&mod_id)?;
    if installed_vpks.is_empty() {
      return Err(Error::InvalidInput(
        "Addon analysis did not provide any VPK files".into(),
      ));
    }
    let mut filenames = HashSet::new();
    for filename in &installed_vpks {
      if filename.contains('/')
        || filename.contains('\\')
        || Path::new(filename)
          .file_name()
          .and_then(|name| name.to_str())
          != Some(filename)
        || !filename.to_ascii_lowercase().ends_with(".vpk")
        || !filenames.insert(filename.clone())
      {
        return Err(Error::InvalidInput(format!(
          "Invalid or duplicate analyzed VPK filename: {filename}"
        )));
      }
    }
    let base = self.get_addons_path(profile_folder.as_deref())?;
    let mut manifest = ProfileVpkManifest::open_for_write(&base)?;
    let shard = analyzed_shard(&base, &installed_vpks, installed_paths.as_deref())?;
    let original_names = manifest
      .mods
      .get(&mod_id)
      .filter(|entry| entry.enabled && entry.shard == shard && entry.current_vpks == installed_vpks)
      .map(|entry| entry.original_vpk_names.clone())
      .unwrap_or_default();
    let mut order = manifest.mods.get(&mod_id).and_then(|entry| entry.order);
    let mut aliases = Vec::new();
    for (owner, entry) in &manifest.mods {
      if owner == &mod_id || !entry.enabled || entry.shard != shard {
        continue;
      }
      if !entry
        .current_vpks
        .iter()
        .any(|file| filenames.contains(file))
      {
        continue;
      }
      let previous: HashSet<_> = entry.current_vpks.iter().cloned().collect();
      if previous != filenames {
        return Err(Error::ModInvalid(format!(
          "Analyzed mod {mod_name} overlaps VPK files owned by {owner} in {}. Reinstall the affected mods, then run addon analysis again. This file assignment was not saved",
          base.shard_dir(shard).display()
        )));
      }
      order = order.or(entry.order);
      aliases.push(owner.clone());
    }
    for alias in &aliases {
      manifest.remove_mod(alias);
    }
    manifest.mark_enabled(&mod_id, installed_vpks.clone(), Vec::new(), order, shard);
    if let Some(entry) = manifest.mods.get_mut(&mod_id) {
      // Only unchanged known installations retain their pre-install names.
      entry.original_vpk_names = original_names.clone();
    }
    manifest.save(&base).map_err(|error| {
      Error::FileWriteFailed(format!(
        "Could not register analyzed mod {mod_name} in {}: {error}. Retry addon analysis",
        base.display()
      ))
    })?;
    for alias in &aliases {
      self.mod_repository.remove_mod(alias);
    }
    let mut registered = self
      .mod_repository
      .get_mod(&mod_id)
      .cloned()
      .unwrap_or_else(|| Mod {
        id: mod_id,
        name: mod_name,
        is_map: false,
        installed_vpks: Vec::new(),
        file_tree: None,
        install_order: order,
        original_vpk_names: Vec::new(),
      });
    registered.installed_vpks = installed_vpks;
    registered.install_order = order;
    if original_names.is_empty() {
      registered.file_tree = None;
    }
    registered.original_vpk_names = original_names;
    self.mod_repository.add_mod(registered);
    self.invalidate_localization_overlay(profile_folder.as_deref());
    Ok(AnalyzedModRegistration {
      replaced_mod_ids: aliases,
      install_order: order,
    })
  }
}

fn analyzed_shard(
  base: &ProfileBase,
  filenames: &[String],
  paths: Option<&[String]>,
) -> Result<ShardIndex, Error> {
  let actual_paths = paths
    .map(|paths| {
      if paths.len() != filenames.len() {
        return Err(Error::InvalidInput(
          "Analyzed VPK filenames and paths do not match".into(),
        ));
      }
      paths
        .iter()
        .map(|path| {
          fs::canonicalize(path)
            .map_err(|error| Error::io_context("locate analyzed VPK", Path::new(path), error))
        })
        .collect::<Result<Vec<_>, Error>>()
    })
    .transpose()?;
  let mut matches = Vec::new();
  for shard in shard::all_shards() {
    let directory = base.shard_dir(shard);
    let mut all_present = true;
    for (index, filename) in filenames.iter().enumerate() {
      let path = directory.join(filename);
      match fs::metadata(&path) {
        Ok(metadata) if metadata.is_file() => {
          if let Some(actual) = &actual_paths {
            let expected = fs::canonicalize(&path)
              .map_err(|error| Error::io_context("locate analyzed VPK", &path, error))?;
            if actual[index] != expected {
              all_present = false;
              break;
            }
          }
        }
        Ok(_) => {
          all_present = false;
          break;
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
          all_present = false;
          break;
        }
        Err(error) => return Err(Error::io_context("inspect analyzed VPK", &path, error)),
      }
    }
    if all_present {
      matches.push(shard);
    }
  }
  match matches.as_slice() {
    [shard] => Ok(*shard),
    [] => Err(Error::ModInvalid(format!(
      "Analyzed VPK files ({}) were moved, deleted, or split across addon folders. Keep this mod's files together and run addon analysis again",
      filenames.join(", ")
    ))),
    _ => Err(Error::ModInvalid(format!(
      "VPK filenames ({}) occur in multiple addon folders. Run addon analysis again to identify their full paths",
      filenames.join(", ")
    ))),
  }
}
