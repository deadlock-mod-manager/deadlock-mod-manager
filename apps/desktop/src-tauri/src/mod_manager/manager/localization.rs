use super::*;
use crate::mod_manager::localization_overlay::{
  LocalizationModInput, LocalizationOverlayAnalysis, LocalizationOverlayApplyResult,
  LocalizationOverlayPlan, LocalizationResolution, OVERLAY_VPK_NAME,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

mod preference;
mod receipt;
use std::fs;
use std::time::SystemTime;

const OVERLAY_DIRECTORY_PREFIX: &str = "dmm_localization_";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct LocalizationInputStamp {
  path: PathBuf,
  length: u64,
  modified: Option<SystemTime>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct LocalizationOverlayPlanKey {
  output_path: PathBuf,
  base_game: Vec<LocalizationInputStamp>,
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
    let mut base_game = game_archive_stamps(&citadel_dir)?;
    base_game.extend(game_archive_stamps(&citadel_dir.with_file_name("core"))?);
    // steam.inf changes with the game build; Steam's appmanifest also changes on play.
    let version = citadel_dir.join("steam.inf");
    if version.is_file() {
      base_game.push(localization_input_stamp(&version)?);
    }
    let mods = inputs
      .iter()
      .map(|input| {
        Ok((
          input.mod_id.clone(),
          input
            .vpks
            .iter()
            .map(|path| archive_input_stamps(path))
            .collect::<Result<Vec<_>, Error>>()?
            .into_iter()
            .flatten()
            .collect(),
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
    if !self.mod_compatibility_enabled()? {
      return Err(Error::InvalidInput("Mod compatibility is disabled".into()));
    }
    if self.is_game_running()? {
      return Err(Error::GameRunning);
    }
    let (citadel_dir, inputs, key) = self.localization_overlay_inputs(profile_folder.as_deref())?;
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
    let result = receipt::write(&plan, key, &resolutions)?;
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
    self.prepare_localization_overlay_for_launch(profile_folder, self.mod_compatibility_enabled()?)
  }

  fn prepare_localization_overlay_for_launch(
    &self,
    profile_folder: Option<&str>,
    enabled: bool,
  ) -> Result<(), Error> {
    if !enabled {
      return self.delete_localization_overlay(profile_folder);
    }
    let (citadel, inputs, key) = self.localization_overlay_inputs(profile_folder)?;
    let previous = receipt::load(&key.output_path)?;
    if let Some(previous) = &previous
      && previous.is_current(&key)?
    {
      return Ok(());
    }
    let reviewed = previous.filter(|receipt| receipt.key == key);
    receipt::remove(&key.output_path)?;
    let plan = LocalizationOverlayPlan::build(&citadel, &inputs)?;
    if requires_review(&plan.analysis) && reviewed.is_none() {
      return Err(Error::ModDataReviewRequired);
    }
    let resolutions = reviewed
      .map(|receipt| receipt.resolutions)
      .unwrap_or_default();
    let result = receipt::write(&plan, key, &resolutions)?;
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
    if let Err(error) = receipt::remove(&path) {
      log::warn!(
        "Failed to invalidate localization overlay at {}: {error}",
        path.display()
      );
    }
  }

  pub fn delete_localization_overlay(&self, profile_folder: Option<&str>) -> Result<(), Error> {
    let path = self.localization_overlay_vpk_path(profile_folder)?;
    receipt::remove(&path)?;
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
      self.mod_compatibility_enabled()?
        && self
          .localization_overlay_vpk_path(profile_folder)?
          .is_file(),
    )
  }
}

fn requires_review(analysis: &LocalizationOverlayAnalysis) -> bool {
  !analysis.conflicts.is_empty()
    || !analysis.compiled_data_conflicts.is_empty()
    || !analysis.snapshot_warnings.is_empty()
    || !analysis.parse_warnings.is_empty()
    || !analysis.asset_warnings.is_empty()
}

fn game_archive_stamps(directory: &Path) -> Result<Vec<LocalizationInputStamp>, Error> {
  if !directory.is_dir() {
    return Ok(Vec::new());
  }
  let mut paths = fs::read_dir(directory)?
    .map(|entry| entry.map(|entry| entry.path()))
    .collect::<Result<Vec<_>, _>>()?;
  paths.retain(|path| {
    path
      .file_name()
      .and_then(|name| name.to_str())
      .is_some_and(|name| name.ends_with("_dir.vpk"))
  });
  paths.sort();
  let mut stamps = Vec::new();
  for path in paths {
    stamps.extend(archive_input_stamps(&path)?);
  }
  Ok(stamps)
}

fn archive_input_stamps(path: &Path) -> Result<Vec<LocalizationInputStamp>, Error> {
  let mut stamps = vec![localization_input_stamp(path)?];
  let Some(prefix) = path
    .file_name()
    .and_then(|name| name.to_str())
    .and_then(|name| name.strip_suffix("_dir.vpk"))
  else {
    return Ok(stamps);
  };
  let directory = path
    .parent()
    .ok_or_else(|| Error::InvalidInput("VPK has no parent directory".into()))?;
  let mut chunks = fs::read_dir(directory)?
    .map(|entry| entry.map(|entry| entry.path()))
    .collect::<Result<Vec<_>, _>>()?;
  chunks.retain(|chunk| {
    chunk
      .file_name()
      .and_then(|name| name.to_str())
      .and_then(|name| name.strip_prefix(&format!("{prefix}_")))
      .and_then(|name| name.strip_suffix(".vpk"))
      .is_some_and(|number| !number.is_empty() && number.bytes().all(|byte| byte.is_ascii_digit()))
  });
  chunks.sort();
  for chunk in chunks {
    stamps.push(localization_input_stamp(&chunk)?);
  }
  Ok(stamps)
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

  fn test_manager(root: &Path) -> ModManager {
    let citadel = root.join("game/citadel");
    fs::create_dir_all(&citadel).unwrap();
    fs::write(citadel.join("gameinfo.gi"), b"").unwrap();
    let mut steam_manager = SteamManager::new();
    steam_manager.set_game_path(root.to_path_buf()).unwrap();
    ModManager {
      steam_manager,
      process_manager: GameProcessManager::new(),
      config_manager: GameConfigManager::new(),
      vpk_manager: VpkManager::new(),
      file_tree_analyzer: FileTreeAnalyzer::new(),
      filesystem: FileSystemHelper::new(),
      mod_repository: ModRepository::new(),
      addons_backup_manager: AddonsBackupManager::new(),
      autoexec_manager: AutoexecManager::new(),
      app_handle: None,
      localization_overlay_plan_cache: Mutex::new(None),
    }
  }

  #[test]
  fn compatibility_is_opt_in_and_disabled_launch_ignores_stale_overlays() {
    let temp = tempfile::tempdir().unwrap();
    let manager = test_manager(temp.path());
    let path = manager.localization_overlay_vpk_path(None).unwrap();
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(&path, b"stale repair package").unwrap();
    fs::write(receipt::path(&path), b"stale receipt").unwrap();
    manager
      .ensure_localization_overlay_for_launch(None)
      .unwrap();
    assert!(
      !path.exists(),
      "opt-out must remove an existing repair package"
    );
    assert!(
      !receipt::path(&path).exists(),
      "opt-out must not create a new receipt"
    );
  }

  #[test]
  fn disabled_compatibility_does_not_add_existing_overlays_to_game_search_paths() {
    let temp = tempfile::tempdir().unwrap();
    let manager = test_manager(temp.path());
    let path = manager.localization_overlay_vpk_path(None).unwrap();
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(&path, b"stale repair package").unwrap();
    assert_eq!(
      manager.profile_gameinfo_paths(None).unwrap(),
      vec!["citadel/addons"]
    );
  }

  #[test]
  fn launch_preparation_replaces_untracked_overlays_and_reuses_verified_receipts() {
    let temp = tempfile::tempdir().unwrap();
    let manager = test_manager(temp.path());
    let path = manager.localization_overlay_vpk_path(None).unwrap();
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(&path, b"stale untracked overlay").unwrap();
    manager
      .prepare_localization_overlay_for_launch(None, true)
      .unwrap();
    assert!(!path.exists());
    let receipt_path = receipt::path(&path);
    let old_time = SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(1000);
    fs::File::options()
      .write(true)
      .open(&receipt_path)
      .unwrap()
      .set_times(fs::FileTimes::new().set_modified(old_time))
      .unwrap();
    manager
      .prepare_localization_overlay_for_launch(None, true)
      .unwrap();
    assert_eq!(
      fs::metadata(&receipt_path).unwrap().modified().unwrap(),
      old_time
    );
  }

  #[test]
  fn launch_preparation_refreshes_receipts_after_game_chunk_or_version_changes() {
    let temp = tempfile::tempdir().unwrap();
    let manager = test_manager(temp.path());
    let citadel = temp.path().join("game/citadel");
    fs::write(citadel.join("pak01_dir.vpk"), b"index").unwrap();
    fs::write(citadel.join("pak01_000.vpk"), b"chunk").unwrap();
    fs::write(citadel.join("steam.inf"), b"ClientVersion=1").unwrap();
    manager
      .prepare_localization_overlay_for_launch(None, true)
      .unwrap();
    let path = manager.localization_overlay_vpk_path(None).unwrap();
    let before = receipt::load(&path).unwrap().unwrap().key;
    fs::write(citadel.join("pak01_000.vpk"), b"updated game data chunk").unwrap();
    manager
      .prepare_localization_overlay_for_launch(None, true)
      .unwrap();
    let after = receipt::load(&path).unwrap().unwrap().key;
    assert_ne!(before, after);
    fs::write(citadel.join("steam.inf"), b"ClientVersion=200").unwrap();
    manager
      .prepare_localization_overlay_for_launch(None, true)
      .unwrap();
    assert_ne!(after, receipt::load(&path).unwrap().unwrap().key);
  }

  #[test]
  fn archive_stamps_track_data_chunks_and_ignore_other_mod_archives() {
    let temp = tempfile::tempdir().unwrap();
    let index = temp.path().join("pak01_dir.vpk");
    fs::write(&index, b"index").unwrap();
    fs::write(temp.path().join("pak01_000.vpk"), b"chunk").unwrap();
    fs::write(temp.path().join("pak02_000.vpk"), b"unrelated").unwrap();
    let before = archive_input_stamps(&index).unwrap();
    assert_eq!(before.len(), 2);
    fs::write(temp.path().join("pak01_000.vpk"), b"changed chunk").unwrap();
    let after = archive_input_stamps(&index).unwrap();
    assert_ne!(before, after);
    fs::write(temp.path().join("pak02_000.vpk"), b"changed unrelated").unwrap();
    assert_eq!(after, archive_input_stamps(&index).unwrap());
    fs::remove_file(temp.path().join("pak01_000.vpk")).unwrap();
    assert_ne!(after, archive_input_stamps(&index).unwrap());
  }

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
