use super::*;
use crate::mod_manager::localization_overlay::{
  LocalizationInputWarning, LocalizationModInput, LocalizationOverlayAnalysis,
  LocalizationOverlayApplyResult, LocalizationOverlayPlan, LocalizationResolution,
  OVERLAY_VPK_NAME,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

mod history;
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
  #[serde(default)]
  digest: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct LocalizationOverlayPlanKey {
  output_path: PathBuf,
  #[serde(default)]
  input_warnings: Vec<LocalizationInputWarning>,
  #[serde(default)]
  history_digest: Option<String>,
  #[serde(default)]
  compatibility_mod_ids: std::collections::BTreeSet<String>,
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
    let compatibility_mod_ids = manifest
      .mods
      .iter()
      .filter(|(_, entry)| entry.enabled && entry.compatibility_enabled)
      .map(|(id, _)| id.clone())
      .collect();
    let mut inputs = Vec::new();
    let mut input_warnings = Vec::new();
    let mut claimed = HashSet::new();
    for assignment in Self::ordered_assignments(&manifest) {
      let mut vpks = Vec::new();
      let mut missing = Vec::new();
      for vpk in &assignment.vpks {
        let path = profile_base
          .shard_dir(assignment.shard)
          .join(Self::vpk_filename(vpk));
        match fs::metadata(&path) {
          Ok(metadata) if metadata.is_file() => vpks.push(path),
          Ok(_) => {
            return Err(Error::ModInvalid(format!(
              "Expected a VPK file for mod {} at {}. Reinstall this mod or disable it before retrying compatibility review",
              assignment.mod_id,
              path.display()
            )));
          }
          Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            missing.push(path.display().to_string())
          }
          Err(error) => {
            return Err(Error::io_context(
              &format!("inspect VPK for mod {} at", assignment.mod_id),
              &path,
              error,
            ));
          }
        }
      }
      if !missing.is_empty() {
        if !vpks.is_empty() {
          return Err(Error::ModInvalid(format!(
            "Mod {} is missing some of its VPK files: {}. Reinstall this mod or disable it before retrying compatibility review",
            assignment.mod_id,
            missing.join(", ")
          )));
        }
        input_warnings.push(LocalizationInputWarning {
          mod_id: assignment.mod_id,
          file_paths: missing,
        });
        continue;
      }
      // Old addon analysis could register the same physical VPK under two IDs.
      // Match reorder's first-owner rule without modifying the manifest on a read.
      vpks.retain(|path| claimed.insert(path.clone()));
      if !vpks.is_empty() {
        inputs.push(LocalizationModInput {
          mod_id: assignment.mod_id,
          vpks,
        });
      }
    }
    let output_path = game_path
      .join("game")
      .join(Self::localization_overlay_search_path(profile_folder))
      .join(OVERLAY_VPK_NAME);
    let mut base_game = game_archive_stamps(&citadel_dir)?;
    base_game.extend(game_archive_stamps(&citadel_dir.with_file_name("core"))?);
    let localization_paths = crate::mod_manager::localization_overlay::localization_paths(&inputs)?;
    base_game.extend(loose_resource_stamps(&citadel_dir, &localization_paths)?);
    base_game.extend(loose_resource_stamps(
      &citadel_dir.with_file_name("core"),
      &localization_paths,
    )?);
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
    let history_digest = history::digest(&citadel_dir);
    Ok((
      citadel_dir,
      inputs,
      LocalizationOverlayPlanKey {
        output_path,
        input_warnings,
        history_digest,
        compatibility_mod_ids,
        base_game,
        mods,
      },
    ))
  }

  pub fn analyze_localization_overlay(
    &mut self,
    profile_folder: Option<String>,
    resolutions: &[LocalizationResolution],
  ) -> Result<LocalizationOverlayAnalysis, Error> {
    let (citadel_dir, inputs, mut key) =
      self.localization_overlay_inputs(profile_folder.as_deref())?;
    let cached_plan = self
      .localization_overlay_plan_cache
      .lock()
      .map_err(|_| Error::BackgroundTaskFailed("Localization plan cache poisoned".into()))?
      .take()
      .filter(|cached| cached.key == key)
      .map(|cached| cached.plan);
    let plan = match cached_plan {
      Some(plan) => plan,
      None => build_overlay_plan(&citadel_dir, &inputs, &mut key)?,
    };
    let analysis = plan.analyze(resolutions);
    self
      .localization_overlay_plan_cache
      .lock()
      .map_err(|_| Error::BackgroundTaskFailed("Localization plan cache poisoned".to_string()))?
      .replace(CachedLocalizationOverlayPlan { key, plan });
    analysis
  }

  pub fn apply_localization_overlay(
    &mut self,
    profile_folder: Option<String>,
    resolutions: Vec<LocalizationResolution>,
    expected_fingerprint: String,
  ) -> Result<LocalizationOverlayApplyResult, Error> {
    if !self.mod_compatibility_enabled(profile_folder.as_deref())? {
      return Err(Error::InvalidInput("Mod compatibility is disabled".into()));
    }
    if self.is_game_running()? {
      return Err(Error::GameRunning);
    }
    let result = self.write_reviewed_localization_overlay(
      profile_folder.as_deref(),
      &resolutions,
      &expected_fingerprint,
    )?;
    self.apply_profile_gameinfo(profile_folder)?;
    log::info!(
      "Applied merged mod-data overlay: {} localization tokens and {} compiled rows across {} packed files",
      result.applied_tokens,
      result.applied_compiled_rows,
      result.packed_files
    );
    Ok(result)
  }

  fn write_reviewed_localization_overlay(
    &mut self,
    profile_folder: Option<&str>,
    resolutions: &[LocalizationResolution],
    expected_fingerprint: &str,
  ) -> Result<LocalizationOverlayApplyResult, Error> {
    let (citadel_dir, inputs, mut key) = self.localization_overlay_inputs(profile_folder)?;
    if input_fingerprint(&key)? != expected_fingerprint {
      return Err(Error::InvalidInput(
        "Mods or game files changed since compatibility review. Reopen the review before applying changes".into()
      ));
    }
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
      None => build_overlay_plan(&citadel_dir, &inputs, &mut key)?,
    };
    let (_, _, current_key) = self.localization_overlay_inputs(profile_folder)?;
    if current_key != key || input_fingerprint(&key)? != expected_fingerprint {
      return Err(Error::InvalidInput(
        "Mods or game files changed while preparing compatibility fixes. Reopen the review before applying changes".into()
      ));
    }
    receipt::write(&plan, key, resolutions)
  }

  pub(super) fn ensure_localization_overlay_for_launch(
    &self,
    profile_folder: Option<&str>,
  ) -> Result<(), Error> {
    self.prepare_localization_overlay_for_launch(
      profile_folder,
      self.mod_compatibility_enabled(profile_folder)?,
    )
  }

  fn prepare_localization_overlay_for_launch(
    &self,
    profile_folder: Option<&str>,
    enabled: bool,
  ) -> Result<(), Error> {
    if !enabled {
      return self.delete_localization_overlay(profile_folder);
    }
    let (citadel, inputs, mut key) = self.localization_overlay_inputs(profile_folder)?;
    let previous = receipt::load(&key.output_path)?;
    if let Some(previous) = &previous
      && previous.is_current(&key)?
    {
      previous.log_status("reused");
      return Ok(());
    }
    let reviewed = previous.filter(|receipt| receipt.key == key);
    receipt::remove(&key.output_path)?;
    let plan = build_overlay_plan(&citadel, &inputs, &mut key)?;
    let reviewed = reviewed.filter(|receipt| receipt.key == key);
    let (_, _, current_key) = self.localization_overlay_inputs(profile_folder)?;
    if current_key != key {
      return Err(Error::ModDataReviewRequired);
    }
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
      self.mod_compatibility_enabled(profile_folder)?
        && self
          .localization_overlay_vpk_path(profile_folder)?
          .is_file(),
    )
  }
}

fn input_fingerprint(key: &LocalizationOverlayPlanKey) -> Result<String, Error> {
  let bytes = serde_json::to_vec(key).map_err(|error| {
    Error::InvalidInput(format!("Could not identify compatibility inputs: {error}"))
  })?;
  Ok(hex::encode(Sha256::digest(bytes)))
}

fn build_overlay_plan(
  citadel: &Path,
  inputs: &[LocalizationModInput],
  key: &mut LocalizationOverlayPlanKey,
) -> Result<LocalizationOverlayPlan, Error> {
  let (mut plan, observed, changed) = LocalizationOverlayPlan::build_learning_history(
    citadel,
    inputs,
    history::load(citadel),
    history::version(citadel),
    &key.compatibility_mod_ids,
  )?;
  if changed {
    // Learning is reproducible from these stamped inputs. A cache write failure
    // must not prevent analysis; the next plan can learn the same snapshot again.
    if let Err(error) = history::save(citadel, &observed) {
      log::warn!("Could not persist observed compatibility history: {error}");
    }
    key.history_digest = history::digest(citadel);
  }
  plan.analysis.review_fingerprint = input_fingerprint(key)?;
  plan.analysis.input_warnings = key.input_warnings.clone();
  Ok(plan)
}

fn requires_review(analysis: &LocalizationOverlayAnalysis) -> bool {
  use crate::mod_manager::vdata_history::BaselineStatus;
  !analysis.input_warnings.is_empty()
    || analysis
      .baselines
      .iter()
      .any(|baseline| baseline.evidence.status != BaselineStatus::Matched)
    || !analysis.conflicts.is_empty()
    || !analysis.compiled_data_conflicts.is_empty()
    || !analysis.snapshot_warnings.is_empty()
    || !analysis.parse_warnings.is_empty()
    || !analysis.asset_warnings.is_empty()
    || !analysis.data_warnings.is_empty()
}

fn game_archive_stamps(directory: &Path) -> Result<Vec<LocalizationInputStamp>, Error> {
  match fs::metadata(directory) {
    Ok(metadata) if metadata.is_dir() => {}
    Ok(_) => {
      return Err(Error::InvalidInput(format!(
        "Expected a game directory at {}",
        directory.display()
      )));
    }
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
    Err(error) => {
      return Err(Error::io_context(
        "inspect game directory",
        directory,
        error,
      ));
    }
  }
  let mut paths = fs::read_dir(directory)
    .map_err(|error| Error::io_context("list compatibility input directory", directory, error))?
    .map(|entry| entry.map(|entry| entry.path()))
    .collect::<Result<Vec<_>, _>>()
    .map_err(|error| Error::io_context("list compatibility input directory", directory, error))?;
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
  let sidecar = source2_model::vpk_extract::origin_sidecar_path(path);
  if sidecar.is_file() {
    let mut stamp = localization_input_stamp(&sidecar)?;
    stamp.digest = Some(hex::encode(Sha256::digest(fs::read(&sidecar)?)));
    stamps.push(stamp);
  }
  let Some(prefix) = path
    .file_stem()
    .and_then(|name| name.to_str())
    .map(|name| name.strip_suffix("_dir").unwrap_or(name))
  else {
    return Ok(stamps);
  };
  let directory = source2_model::vpk_extract::companion_dir(path);
  let mut chunks = fs::read_dir(&directory)
    .map_err(|error| Error::io_context("list compatibility input directory", &directory, error))?
    .map(|entry| entry.map(|entry| entry.path()))
    .collect::<Result<Vec<_>, _>>()
    .map_err(|error| Error::io_context("list compatibility input directory", &directory, error))?;
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
  let metadata = fs::metadata(path)
    .map_err(|error| Error::io_context("inspect compatibility input", path, error))?;
  Ok(LocalizationInputStamp {
    path: path.to_path_buf(),
    length: metadata.len(),
    modified: metadata.modified().ok(),
    digest: None,
  })
}

/// Loose resources precede packed game data in the compatibility resolver.
/// Hash these small inputs so equal-sized edits also invalidate reviewed plans.
fn loose_resource_stamps(
  directory: &Path,
  localization_paths: &std::collections::BTreeSet<String>,
) -> Result<Vec<LocalizationInputStamp>, Error> {
  let mut stamps = std::collections::BTreeMap::new();
  // Probe exact language paths as well as walking the tree. Directory aliases
  // may share a canonical target, but each requested language still needs a hash.
  for name in localization_paths {
    let path = directory.join(name);
    if path.is_file() {
      let mut stamp = localization_input_stamp(&path)?;
      stamp.digest = Some(hex::encode(Sha256::digest(fs::read(&path)?)));
      stamps.insert(path, stamp);
    }
  }
  let mut visited = HashSet::new();
  let mut pending: Vec<_> = [
    "resource/localization",
    "scripts",
    "models",
    "materials",
    "animations",
    "animgraphs",
  ]
  .iter()
  .map(|path| directory.join(path))
  .filter(|path| path.is_dir())
  .collect();
  while let Some(current_directory) = pending.pop() {
    if !visited.insert(fs::canonicalize(&current_directory)?) {
      continue;
    }
    for entry in fs::read_dir(current_directory)? {
      let entry = entry?;
      let kind = entry.file_type()?;
      if kind.is_symlink() {
        let path = entry.path();
        let mut stamp = LocalizationInputStamp {
          path: path.clone(),
          length: entry.metadata()?.len(),
          modified: fs::symlink_metadata(&path)?.modified().ok(),
          digest: Some(hex::encode(Sha256::digest(
            fs::read_link(&path)?.as_os_str().as_encoded_bytes(),
          ))),
        };
        if path.is_file() {
          // A leaf alias may provide compiled data, so hash its contents too.
          if crate::mod_manager::localization_overlay::reads_compiled_baseline(
            &path.to_string_lossy(),
          ) {
            stamp.digest = Some(hex::encode(Sha256::digest(fs::read(&path)?)));
          }
        }
        stamps.entry(path.clone()).or_insert(stamp);
        if path.is_dir() {
          pending.push(path);
        }
      } else if kind.is_dir() {
        pending.push(entry.path());
      } else if kind.is_file()
        && entry.path().extension().is_some_and(|extension| {
          extension == "txt" || extension.to_string_lossy().ends_with("_c")
        })
      {
        let path = entry.path();
        if stamps.contains_key(&path) {
          continue;
        }
        let mut stamp = localization_input_stamp(&path)?;
        let name = path
          .strip_prefix(directory)
          .expect("loose path is beneath the game directory")
          .to_string_lossy()
          .replace('\\', "/")
          .to_ascii_lowercase();
        if localization_paths.contains(&name)
          || crate::mod_manager::localization_overlay::reads_compiled_baseline(&name)
        {
          stamp.digest = Some(hex::encode(Sha256::digest(fs::read(&path)?)));
        }
        stamps.insert(path, stamp);
      }
    }
  }
  Ok(stamps.into_values().collect())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn only_requested_languages_are_content_hashed() {
    let temp = tempfile::tempdir().unwrap();
    let locale = temp.path().join("resource/localization");
    fs::create_dir_all(&locale).unwrap();
    fs::write(locale.join("english.txt"), b"english").unwrap();
    fs::write(locale.join("german.txt"), b"german").unwrap();
    let watched = ["resource/localization/english.txt".into()]
      .into_iter()
      .collect();
    let stamps = loose_resource_stamps(temp.path(), &watched).unwrap();
    assert_eq!(stamps.len(), 2);
    assert!(
      stamps
        .iter()
        .find(|stamp| stamp.path.ends_with("english.txt"))
        .unwrap()
        .digest
        .is_some()
    );
    assert!(
      stamps
        .iter()
        .find(|stamp| stamp.path.ends_with("german.txt"))
        .unwrap()
        .digest
        .is_none()
    );
  }

  #[cfg(unix)]
  #[test]
  fn language_aliases_and_directory_cycles_are_stamped_safely() {
    use std::os::unix::fs::symlink;
    let temp = tempfile::tempdir().unwrap();
    let locale = temp.path().join("resource/localization");
    let target = locale.join("actual");
    fs::create_dir_all(&target).unwrap();
    fs::write(target.join("english.txt"), b"first").unwrap();
    symlink("actual", locale.join("alias")).unwrap();
    symlink("..", target.join("cycle")).unwrap();
    let watched = ["resource/localization/alias/english.txt".into()]
      .into_iter()
      .collect();
    let before = loose_resource_stamps(temp.path(), &watched).unwrap();
    assert!(
      before
        .iter()
        .any(|stamp| stamp.path.ends_with("alias/english.txt") && stamp.digest.is_some())
    );
    fs::write(target.join("english.txt"), b"other").unwrap();
    assert_ne!(
      before,
      loose_resource_stamps(temp.path(), &watched).unwrap()
    );
    fs::remove_file(locale.join("alias")).unwrap();
    symlink("missing", locale.join("alias")).unwrap();
    let after = loose_resource_stamps(temp.path(), &watched).unwrap();
    assert!(
      !after
        .iter()
        .any(|stamp| stamp.path.ends_with("alias/english.txt"))
    );
  }

  #[test]
  fn archive_stamps_follow_the_extractor_origin_sidecar() {
    let temp = tempfile::tempdir().unwrap();
    let origin = temp.path().join("origin");
    fs::create_dir_all(&origin).unwrap();
    let path = temp.path().join("pak01_dir.vpk");
    fs::write(&path, b"index").unwrap();
    let sidecar = source2_model::vpk_extract::origin_sidecar_path(&path);
    fs::write(&sidecar, origin.to_str().unwrap()).unwrap();
    let chunk = origin.join("pak01_000.vpk");
    fs::write(&chunk, b"payload").unwrap();
    let before = archive_input_stamps(&path).unwrap();
    assert!(
      before
        .iter()
        .any(|stamp| stamp.path == sidecar && stamp.digest.is_some())
    );
    assert!(before.iter().any(|stamp| stamp.path == chunk));
    fs::write(chunk, b"changed payload").unwrap();
    assert_ne!(before, archive_input_stamps(&path).unwrap());
    fs::write(sidecar, "missing-origin").unwrap();
    assert_eq!(archive_input_stamps(&path).unwrap().len(), 2);
  }

  #[test]
  fn loose_resource_content_and_additions_invalidate_review_inputs() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("scripts/table.vdata_c");
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(&path, b"first").unwrap();
    let before = loose_resource_stamps(temp.path(), &Default::default()).unwrap();
    let modified = fs::metadata(&path).unwrap().modified().unwrap();
    fs::write(&path, b"other").unwrap();
    fs::File::options()
      .write(true)
      .open(&path)
      .unwrap()
      .set_times(fs::FileTimes::new().set_modified(modified))
      .unwrap();
    let after = loose_resource_stamps(temp.path(), &Default::default()).unwrap();
    assert_eq!(before[0].length, after[0].length);
    assert_eq!(before[0].modified, after[0].modified);
    assert_ne!(before, after);
    fs::write(temp.path().join("scripts/added.vdata_c"), b"added").unwrap();
    assert_eq!(
      loose_resource_stamps(temp.path(), &Default::default())
        .unwrap()
        .len(),
      2
    );
    fs::remove_file(path).unwrap();
    assert_eq!(
      loose_resource_stamps(temp.path(), &Default::default())
        .unwrap()
        .len(),
      1
    );
  }

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

  fn write_test_vpk(path: &Path) {
    let source = tempfile::tempdir().unwrap();
    fs::write(source.path().join("unrelated.txt"), b"test").unwrap();
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    vpkmanager::pack_directory(source.path(), path).unwrap();
  }

  #[test]
  fn review_after_deleting_an_analyzed_mod_handles_duplicate_records() {
    let temp = tempfile::tempdir().unwrap();
    let mut manager = test_manager(temp.path());
    let base = manager.get_addons_path(None).unwrap();
    let file = base.join("pak01_dir.vpk");
    write_test_vpk(&file);
    let mut manifest = ProfileVpkManifest::default();
    for id in ["original-owner", "analyzed-copy"] {
      manifest.mark_enabled(
        id,
        vec!["pak01_dir.vpk".into()],
        vec![],
        None,
        ShardIndex::FIRST,
      );
    }
    manifest.save(&base).unwrap();
    manager.remove_mod_vpks("analyzed-copy", &[], None).unwrap();
    assert!(!file.exists());
    let manifest = ProfileVpkManifest::load(&base).unwrap();
    assert!(
      manifest
        .mods
        .values()
        .all(|entry| !entry.enabled || entry.current_vpks.is_empty())
    );
    assert_eq!(
      manager
        .analyze_localization_overlay(None, &[])
        .unwrap()
        .scanned_vpks,
      0
    );
  }

  #[test]
  fn review_ignores_deleted_records_without_mutating_the_manifest() {
    let temp = tempfile::tempdir().unwrap();
    let mut manager = test_manager(temp.path());
    let base = manager.get_addons_path(None).unwrap();
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "deleted",
      vec!["pak01_dir.vpk".into()],
      vec![],
      None,
      ShardIndex::FIRST,
    );
    manifest.save(&base).unwrap();
    let before = fs::read(base.join(".dmm.json")).unwrap();
    let analysis = manager.analyze_localization_overlay(None, &[]).unwrap();
    assert_eq!(analysis.scanned_vpks, 0);
    assert_eq!(fs::read(base.join(".dmm.json")).unwrap(), before);
  }

  #[test]
  fn review_rejects_incomplete_multifile_mod_with_path_and_recovery_action() {
    let temp = tempfile::tempdir().unwrap();
    let mut manager = test_manager(temp.path());
    let base = manager.get_addons_path(None).unwrap();
    write_test_vpk(&base.join("pak01_dir.vpk"));
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "incomplete",
      vec!["pak01_dir.vpk".into(), "pak02_dir.vpk".into()],
      vec![],
      None,
      ShardIndex::FIRST,
    );
    manifest.save(&base).unwrap();
    let error = manager
      .analyze_localization_overlay(None, &[])
      .unwrap_err()
      .to_string();
    assert!(error.contains("incomplete"), "{error}");
    assert!(error.contains("pak02_dir.vpk"), "{error}");
    assert!(error.contains("Reinstall"), "{error}");
  }

  #[test]
  fn analyzed_registration_transfers_exact_alias_and_deletion_is_safe() {
    let temp = tempfile::tempdir().unwrap();
    let mut manager = test_manager(temp.path());
    let base = manager.get_addons_path(None).unwrap();
    let file = base.join("pak01_dir.vpk");
    write_test_vpk(&file);
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "old-local-id",
      vec!["pak01_dir.vpk".into()],
      vec![],
      Some(3),
      ShardIndex::FIRST,
    );
    manifest.save(&base).unwrap();
    manager
      .register_analyzed_mod(
        "remote-id".into(),
        "Identified mod".into(),
        vec!["pak01_dir.vpk".into()],
        Some(vec![file.display().to_string()]),
        None,
      )
      .unwrap();
    let manifest = ProfileVpkManifest::load(&base).unwrap();
    assert_eq!(manifest.mods.len(), 1);
    assert_eq!(manifest.mods["remote-id"].order, Some(3));
    // Removing the old identity must not delete the newly identified owner's file.
    manager
      .remove_mod_vpks("old-local-id", &["pak01_dir.vpk".into()], None)
      .unwrap();
    assert!(file.is_file());
    assert_eq!(
      manager
        .analyze_localization_overlay(None, &[])
        .unwrap()
        .scanned_mods,
      1
    );
    manager.remove_mod_vpks("remote-id", &[], None).unwrap();
    assert_eq!(
      manager
        .analyze_localization_overlay(None, &[])
        .unwrap()
        .scanned_mods,
      0
    );
  }

  #[test]
  fn analyzed_registration_uses_full_paths_and_rejects_ambiguous_names() {
    let temp = tempfile::tempdir().unwrap();
    let mut manager = test_manager(temp.path());
    let base = manager.get_addons_path(None).unwrap();
    let second = ShardIndex::new(2).unwrap();
    write_test_vpk(&base.join("pak01_dir.vpk"));
    let file = base.shard_dir(second).join("pak01_dir.vpk");
    write_test_vpk(&file);
    assert!(
      manager
        .register_analyzed_mod(
          "ambiguous".into(),
          "Ambiguous".into(),
          vec!["pak01_dir.vpk".into()],
          None,
          None
        )
        .is_err()
    );
    assert!(manager.mod_repository.get_mod("ambiguous").is_none());
    manager
      .register_analyzed_mod(
        "second".into(),
        "Second shard".into(),
        vec!["pak01_dir.vpk".into()],
        Some(vec![file.display().to_string()]),
        None,
      )
      .unwrap();
    assert_eq!(
      ProfileVpkManifest::load(&base).unwrap().shard_of("second"),
      second
    );
  }

  #[test]
  fn failed_registration_does_not_change_repository_or_manifest() {
    let temp = tempfile::tempdir().unwrap();
    let mut manager = test_manager(temp.path());
    let base = manager.get_addons_path(None).unwrap();
    write_test_vpk(&base.join("pak01_dir.vpk"));
    write_test_vpk(&base.join("pak02_dir.vpk"));
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "owner",
      vec!["pak01_dir.vpk".into(), "pak02_dir.vpk".into()],
      vec![],
      None,
      ShardIndex::FIRST,
    );
    manifest.save(&base).unwrap();
    let before = fs::read(base.join(".dmm.json")).unwrap();
    for files in [
      vec![],
      vec!["../bad.vpk".into()],
      vec!["missing.vpk".into()],
      vec!["pak01_dir.vpk".into()],
    ] {
      assert!(
        manager
          .register_analyzed_mod("invalid".into(), "Invalid".into(), files, None, None)
          .is_err()
      );
      assert!(manager.mod_repository.get_mod("invalid").is_none());
      assert_eq!(fs::read(base.join(".dmm.json")).unwrap(), before);
    }
  }

  #[test]
  fn reviewed_input_fingerprint_changes_after_deleted_files_reappear() {
    let temp = tempfile::tempdir().unwrap();
    let mut manager = test_manager(temp.path());
    let base = manager.get_addons_path(None).unwrap();
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "restored",
      vec!["pak01_dir.vpk".into()],
      vec![],
      None,
      ShardIndex::FIRST,
    );
    manifest.save(&base).unwrap();
    let before = manager.analyze_localization_overlay(None, &[]).unwrap();
    assert_eq!(before.input_warnings.len(), 1);
    assert!(requires_review(&before));
    write_test_vpk(&base.join("pak01_dir.vpk"));
    let after = manager.analyze_localization_overlay(None, &[]).unwrap();
    assert!(after.input_warnings.is_empty());
    assert_eq!(after.scanned_mods, 1);
    assert_ne!(before.review_fingerprint, after.review_fingerprint);
  }

  #[test]
  fn apply_rejects_changed_inputs_without_replacing_existing_overlay() {
    let temp = tempfile::tempdir().unwrap();
    let mut manager = test_manager(temp.path());
    let base = manager.get_addons_path(None).unwrap();
    let file = base.join("pak01_dir.vpk");
    write_test_vpk(&file);
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "changing",
      vec!["pak01_dir.vpk".into()],
      vec![],
      None,
      ShardIndex::FIRST,
    );
    manifest.save(&base).unwrap();
    let reviewed = manager.analyze_localization_overlay(None, &[]).unwrap();
    let output = manager.localization_overlay_vpk_path(None).unwrap();
    fs::create_dir_all(output.parent().unwrap()).unwrap();
    fs::write(&output, b"previous overlay").unwrap();
    fs::remove_file(file).unwrap();
    let error = manager
      .write_reviewed_localization_overlay(None, &[], &reviewed.review_fingerprint)
      .unwrap_err();
    assert!(
      error
        .to_string()
        .contains("changed since compatibility review"),
      "{error}"
    );
    assert_eq!(fs::read(&output).unwrap(), b"previous overlay");
    let refreshed = manager.analyze_localization_overlay(None, &[]).unwrap();
    assert_eq!(refreshed.input_warnings.len(), 1);
    manager
      .write_reviewed_localization_overlay(None, &[], &refreshed.review_fingerprint)
      .unwrap();
    assert!(!output.exists());
    manager
      .prepare_localization_overlay_for_launch(None, true)
      .unwrap();
  }

  #[test]
  fn reanalyzing_known_mod_preserves_original_names() {
    let temp = tempfile::tempdir().unwrap();
    let mut manager = test_manager(temp.path());
    let base = manager.get_addons_path(None).unwrap();
    write_test_vpk(&base.join("pak01_dir.vpk"));
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "known",
      vec!["pak01_dir.vpk".into()],
      vec!["custom-original.vpk".into()],
      Some(4),
      ShardIndex::FIRST,
    );
    manifest.save(&base).unwrap();
    manager
      .register_analyzed_mod(
        "known".into(),
        "Known".into(),
        vec!["pak01_dir.vpk".into()],
        None,
        None,
      )
      .unwrap();
    let entry = ProfileVpkManifest::load(&base)
      .unwrap()
      .mods
      .remove("known")
      .unwrap();
    assert_eq!(entry.original_vpk_names, ["custom-original.vpk"]);
    assert_eq!(entry.order, Some(4));
    assert_eq!(
      manager
        .mod_repository
        .get_mod("known")
        .unwrap()
        .original_vpk_names,
      ["custom-original.vpk"]
    );
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
  #[test]
  fn per_mod_preferences_are_profile_scoped_and_invalidate_review_and_overlay() {
    let temp = tempfile::tempdir().unwrap();
    let mut manager = test_manager(temp.path());
    fs::write(
      temp.path().join("game/citadel/gameinfo.gi"),
      b"GameInfo\n{\nFileSystem\n{\nSearchPaths\n{\nGame citadel\nGame core\n}\n}\n}\n",
    )
    .unwrap();
    for profile in [None, Some("other")] {
      let base = manager.get_addons_path(profile).unwrap();
      write_test_vpk(&base.join("pak01_dir.vpk"));
      let mut manifest = ProfileVpkManifest::default();
      manifest.mark_enabled(
        "mod",
        vec!["pak01_dir.vpk".into()],
        vec![],
        None,
        ShardIndex::FIRST,
      );
      manifest.save(&base).unwrap();
    }
    assert!(!manager.mod_compatibility_enabled(None).unwrap());
    let before = manager.analyze_localization_overlay(None, &[]).unwrap();
    let overlay = manager.localization_overlay_vpk_path(None).unwrap();
    fs::create_dir_all(overlay.parent().unwrap()).unwrap();
    fs::write(&overlay, b"old repair").unwrap();
    manager
      .set_mod_compatibility_for_mod("mod".into(), true, None)
      .unwrap();
    assert!(!overlay.exists());
    assert!(manager.mod_compatibility_settings(None).unwrap()["mod"]);
    assert!(!manager.mod_compatibility_settings(Some("other")).unwrap()["mod"]);
    assert!(manager.mod_compatibility_enabled(None).unwrap());
    let after = manager.analyze_localization_overlay(None, &[]).unwrap();
    assert_ne!(before.review_fingerprint, after.review_fingerprint);
    assert!(
      manager
        .write_reviewed_localization_overlay(None, &[], &before.review_fingerprint)
        .is_err()
    );
    manager
      .set_mod_compatibility_for_mod("mod".into(), false, None)
      .unwrap();
    assert!(!manager.mod_compatibility_enabled(None).unwrap());
  }
}
