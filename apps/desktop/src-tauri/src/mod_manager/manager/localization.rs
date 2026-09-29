use super::*;
use crate::mod_manager::localization_overlay::{
  LocalizationModInput, LocalizationOverlayAnalysis, LocalizationOverlayApplyResult,
  LocalizationOverlayPlan, LocalizationResolution, OVERLAY_VPK_NAME,
};
use sha2::{Digest, Sha256};
use std::fs;
use std::time::SystemTime;

const OVERLAY_DIRECTORY_PREFIX: &str = "dmm_localization_";

#[derive(Debug, PartialEq, Eq)]
struct LocalizationInputStamp {
  path: PathBuf,
  length: u64,
  modified: Option<SystemTime>,
}

#[derive(Debug, PartialEq, Eq)]
struct LocalizationOverlayPlanKey {
  output_path: PathBuf,
  base_game: Option<LocalizationInputStamp>,
  mods: Vec<(String, Vec<LocalizationInputStamp>)>,
}

pub(super) struct CachedLocalizationOverlayPlan {
  key: LocalizationOverlayPlanKey,
  plan: LocalizationOverlayPlan,
}

impl ModManager {
  pub(super) fn localization_overlay_search_path(profile_folder: Option<&str>) -> String {
    let suffix = match profile_folder {
      None => "default".to_string(),
      Some(folder) => {
        let digest = Sha256::digest(folder.as_bytes());
        hex::encode(&digest[..8])
      }
    };
    format!("citadel/{OVERLAY_DIRECTORY_PREFIX}{suffix}")
  }

  fn localization_overlay_vpk_path(&self, profile_folder: Option<&str>) -> Result<PathBuf, Error> {
    let game_path = self
      .steam_manager
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?;
    Ok(
      game_path
        .join("game")
        .join(Self::localization_overlay_search_path(profile_folder))
        .join(OVERLAY_VPK_NAME),
    )
  }

  fn localization_overlay_inputs(
    &self,
    profile_folder: Option<&str>,
  ) -> Result<
    (
      PathBuf,
      Vec<LocalizationModInput>,
      LocalizationOverlayPlanKey,
    ),
    Error,
  > {
    let game_path = self
      .steam_manager
      .get_game_path()
      .ok_or(Error::GamePathNotSet)?;
    let citadel_dir = game_path.join("game").join("citadel");
    let profile_base = self.get_addons_path(profile_folder)?;
    let manifest = ProfileVpkManifest::load(&profile_base)?;
    let inputs = Self::ordered_assignments(&manifest)
      .into_iter()
      .map(|assignment| LocalizationModInput {
        mod_id: assignment.mod_id,
        vpks: assignment
          .vpks
          .iter()
          .map(|vpk| {
            profile_base
              .shard_dir(assignment.shard)
              .join(Self::vpk_filename(vpk))
          })
          .collect(),
      })
      .collect::<Vec<_>>();
    let output_path = game_path
      .join("game")
      .join(Self::localization_overlay_search_path(profile_folder))
      .join(OVERLAY_VPK_NAME);
    let base_game_path = citadel_dir.join("pak01_dir.vpk");
    let base_game = base_game_path
      .is_file()
      .then(|| localization_input_stamp(&base_game_path))
      .transpose()?;
    let mods = inputs
      .iter()
      .map(|input| {
        Ok((
          input.mod_id.clone(),
          input
            .vpks
            .iter()
            .map(|path| localization_input_stamp(path))
            .collect::<Result<Vec<_>, Error>>()?,
        ))
      })
      .collect::<Result<Vec<_>, Error>>()?;
    Ok((
      citadel_dir,
      inputs,
      LocalizationOverlayPlanKey {
        output_path,
        base_game,
        mods,
      },
    ))
  }

  fn localization_overlay_plan(
    &self,
    profile_folder: Option<&str>,
  ) -> Result<LocalizationOverlayPlan, Error> {
    let (citadel_dir, inputs, _) = self.localization_overlay_inputs(profile_folder)?;
    LocalizationOverlayPlan::build(&citadel_dir, &inputs)
  }

  pub fn analyze_localization_overlay(
    &mut self,
    profile_folder: Option<String>,
  ) -> Result<LocalizationOverlayAnalysis, Error> {
    let (citadel_dir, inputs, key) = self.localization_overlay_inputs(profile_folder.as_deref())?;
    let plan = LocalizationOverlayPlan::build(&citadel_dir, &inputs)?;
    let analysis = plan.analysis.clone();
    self
      .localization_overlay_plan_cache
      .lock()
      .map_err(|_| Error::BackgroundTaskFailed("Localization plan cache poisoned".to_string()))?
      .replace(CachedLocalizationOverlayPlan { key, plan });
    Ok(analysis)
  }

  pub fn apply_localization_overlay(
    &mut self,
    profile_folder: Option<String>,
    resolutions: Vec<LocalizationResolution>,
  ) -> Result<LocalizationOverlayApplyResult, Error> {
    let (citadel_dir, inputs, key) = self.localization_overlay_inputs(profile_folder.as_deref())?;
    let output_path = key.output_path.clone();
    let cached_plan = self
      .localization_overlay_plan_cache
      .lock()
      .map_err(|_| Error::BackgroundTaskFailed("Localization plan cache poisoned".to_string()))?
      .take()
      .filter(|cached| cached.key == key)
      .map(|cached| cached.plan);
    let plan = match cached_plan {
      Some(plan) => {
        log::debug!("Reusing analyzed shared-data plan for overlay apply");
        plan
      }
      None => LocalizationOverlayPlan::build(&citadel_dir, &inputs)?,
    };
    let result = plan.write(&output_path, &resolutions)?;
    self.apply_profile_gameinfo(profile_folder)?;
    log::info!(
      "Applied merged mod-data overlay: {} localization tokens and {} compiled rows across {} packed files",
      result.applied_tokens,
      result.applied_compiled_rows,
      result.packed_files
    );
    Ok(result)
  }

  pub(super) fn ensure_localization_overlay_for_launch(
    &self,
    profile_folder: Option<&str>,
  ) -> Result<(), Error> {
    if self.has_localization_overlay(profile_folder)? {
      return Ok(());
    }

    let plan = self.localization_overlay_plan(profile_folder)?;
    let analysis = &plan.analysis;
    if !analysis.conflicts.is_empty()
      || !analysis.compiled_data_conflicts.is_empty()
      || !analysis.snapshot_warnings.is_empty()
      || !analysis.parse_warnings.is_empty()
    {
      return Err(Error::ModDataReviewRequired);
    }

    let output_path = self.localization_overlay_vpk_path(profile_folder)?;
    let result = plan.write(&output_path, &[])?;
    log::info!(
      "Prepared merged mod-data overlay for launch: {} localization tokens and {} compiled rows",
      result.applied_tokens,
      result.applied_compiled_rows
    );
    Ok(())
  }

  pub(crate) fn invalidate_localization_overlay(&self, profile_folder: Option<&str>) {
    match self.localization_overlay_plan_cache.lock() {
      Ok(mut cache) => *cache = None,
      Err(_) => log::warn!("Could not clear poisoned localization plan cache"),
    }
    let path = match self.localization_overlay_vpk_path(profile_folder) {
      Ok(path) => path,
      Err(error) => {
        log::warn!("Could not resolve localization overlay for invalidation: {error}");
        return;
      }
    };
    if path.is_file() {
      if let Err(error) = fs::remove_file(&path) {
        log::warn!(
          "Failed to invalidate localization overlay at {}: {error}",
          path.display()
        );
      } else {
        log::info!("Invalidated localization overlay at {}", path.display());
      }
    }
  }

  pub fn delete_localization_overlay(&self, profile_folder: Option<&str>) -> Result<(), Error> {
    let path = self.localization_overlay_vpk_path(profile_folder)?;
    if path.is_file() {
      fs::remove_file(&path)?;
    }
    if let Some(parent) = path.parent()
      && parent.is_dir()
      && fs::read_dir(parent)?.next().is_none()
    {
      fs::remove_dir(parent)?;
    }
    Ok(())
  }

  pub(super) fn has_localization_overlay(
    &self,
    profile_folder: Option<&str>,
  ) -> Result<bool, Error> {
    Ok(
      self
        .localization_overlay_vpk_path(profile_folder)?
        .is_file(),
    )
  }
}

fn localization_input_stamp(path: &Path) -> Result<LocalizationInputStamp, Error> {
  let metadata = fs::metadata(path)?;
  Ok(LocalizationInputStamp {
    path: path.to_path_buf(),
    length: metadata.len(),
    modified: metadata.modified().ok(),
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn localization_input_stamp_changes_when_a_source_vpk_changes() {
    let temp = tempfile::tempdir().unwrap();
    let vpk = temp.path().join("mod_dir.vpk");
    fs::write(&vpk, b"before").unwrap();
    let before = localization_input_stamp(&vpk).unwrap();

    fs::write(&vpk, b"after with a different length").unwrap();
    let after = localization_input_stamp(&vpk).unwrap();

    assert_ne!(before, after);
  }
}
