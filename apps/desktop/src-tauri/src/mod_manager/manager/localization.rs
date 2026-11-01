use super::*;
use crate::mod_manager::localization_overlay::{
  LocalizationInputWarning, LocalizationModInput, LocalizationOverlayAnalysis,
  LocalizationOverlayApplyResult, LocalizationOverlayPlan, LocalizationResolution,
  OVERLAY_VPK_NAME, RepairPlanProgress, RepairPlanStage, UnmanagedVpk,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

mod health;
mod history;
mod inventory;
#[cfg(all(test, unix))]
mod performance;
mod preference;
mod receipt;
mod review;
use std::fs;
use std::time::{Instant, SystemTime};

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
  unmanaged_vpks: Vec<UnmanagedVpk>,
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

/// Inputs for a repair package rebuild, captured under the mod manager lock so
/// the slow plan build can run without it.
pub struct ModFixRefresh {
  profile_folder: Option<String>,
  citadel: PathBuf,
  inputs: Vec<LocalizationModInput>,
  key: LocalizationOverlayPlanKey,
}

impl ModFixRefresh {
  pub fn build(
    mut self,
    progress: &dyn Fn(RepairPlanProgress),
  ) -> Result<(Self, LocalizationOverlayPlan), Error> {
    let plan = build_overlay_plan(&self.citadel, &self.inputs, &mut self.key, progress)?;
    Ok((self, plan))
  }
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

  fn citadel_path(&self) -> Result<PathBuf, Error> {
    Ok(
      self
        .steam_manager
        .get_game_path()
        .ok_or(Error::GamePathNotSet)?
        .join("game")
        .join("citadel"),
    )
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
    Self::localization_overlay_inputs_at(
      self.citadel_path()?,
      self.get_addons_path(profile_folder)?,
      self.localization_overlay_vpk_path(profile_folder)?,
    )
  }

  fn localization_overlay_inputs_at(
    citadel_dir: PathBuf,
    profile_base: ProfileBase,
    output_path: PathBuf,
  ) -> Result<
    (
      PathBuf,
      Vec<LocalizationModInput>,
      LocalizationOverlayPlanKey,
    ),
    Error,
  > {
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
    let (inputs, unmanaged_vpks) = inventory::mounted_inputs(&profile_base, inputs)?;
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
        unmanaged_vpks,
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
      None => build_overlay_plan(&citadel_dir, &inputs, &mut key, &self.plan_progress())?,
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
      None => build_overlay_plan(&citadel_dir, &inputs, &mut key, &self.plan_progress())?,
    };
    let (_, _, current_key) = self.localization_overlay_inputs(profile_folder)?;
    if current_key != key || input_fingerprint(&key)? != expected_fingerprint {
      return Err(Error::InvalidInput(
        "Mods or game files changed while preparing compatibility fixes. Reopen the review before applying changes".into()
      ));
    }
    self.report_plan_stage(RepairPlanStage::WritingPackage);
    let reviewed = review::ReviewedInputs::new(&plan.analysis, &key)?;
    let output = key.output_path.clone();
    let result = receipt::write(&plan, key, resolutions)?;
    review::save(&output, reviewed, resolutions)?;
    Ok(result)
  }

  pub(super) fn prepare_localization_overlay_with_progress(
    &self,
    profile_folder: Option<&str>,
    enabled: bool,
    before_rebuild: impl FnOnce(),
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
    before_rebuild();
    receipt::remove(&key.output_path)?;
    let plan = build_overlay_plan(&citadel, &inputs, &mut key, &|_| {})?;
    let (_, _, current_key) = self.localization_overlay_inputs(profile_folder)?;
    if current_key != key {
      return Err(Error::ModDataReviewRequired);
    }
    self.commit_overlay_plan(profile_folder, key, plan)
  }

  /// Starts rebuilding the repair package after a library change. Returns
  /// `None` when the game is running, fixes are off or the package is current.
  pub fn begin_mod_fix_refresh(
    &mut self,
    profile_folder: Option<&str>,
  ) -> Result<Option<ModFixRefresh>, Error> {
    if self.is_game_running()? {
      return Ok(None);
    }
    if !self.mod_compatibility_enabled(profile_folder)? {
      self.delete_localization_overlay(profile_folder)?;
      return Ok(None);
    }
    let (citadel, inputs, key) = self.localization_overlay_inputs(profile_folder)?;
    if let Some(previous) = receipt::load(&key.output_path)?
      && previous.is_current(&key)?
    {
      previous.log_status("reused");
      return Ok(None);
    }
    Ok(Some(ModFixRefresh {
      profile_folder: profile_folder.map(str::to_owned),
      citadel,
      inputs,
      key,
    }))
  }

  /// Writes a plan built by [`ModFixRefresh::build`]. A library change, a game
  /// start or a launch that already prepared the package during the build
  /// makes the plan stale, so it is dropped; the change schedules a new one.
  pub fn finish_mod_fix_refresh(
    &mut self,
    refresh: ModFixRefresh,
    plan: LocalizationOverlayPlan,
  ) -> Result<(), Error> {
    if self.is_game_running()? {
      return Ok(());
    }
    match self.commit_mod_fix_refresh(refresh, plan) {
      Ok(true) => Ok(()),
      Ok(false) => {
        log::info!("Mods changed while rebuilding the repair package; dropping the stale plan");
        Ok(())
      }
      Err(Error::ModDataReviewRequired) => {
        log::info!("Repair package needs review; launch will prepare it");
        Ok(())
      }
      Err(error) => Err(error),
    }
  }

  /// Writes a plan built without the lock. Returns false when the mods changed
  /// during the build, so the plan no longer matches them.
  fn commit_mod_fix_refresh(
    &self,
    refresh: ModFixRefresh,
    plan: LocalizationOverlayPlan,
  ) -> Result<bool, Error> {
    let ModFixRefresh {
      profile_folder,
      key,
      ..
    } = refresh;
    let profile_folder = profile_folder.as_deref();
    let (_, _, current_key) = self.localization_overlay_inputs(profile_folder)?;
    if current_key != key {
      return Ok(false);
    }
    if let Some(previous) = receipt::load(&key.output_path)?
      && previous.is_current(&key)?
    {
      return Ok(true);
    }
    receipt::remove(&key.output_path)?;
    self.commit_overlay_plan(profile_folder, key, plan)?;
    Ok(true)
  }

  fn commit_overlay_plan(
    &self,
    profile_folder: Option<&str>,
    key: LocalizationOverlayPlanKey,
    plan: LocalizationOverlayPlan,
  ) -> Result<(), Error> {
    if let Err(error) = self.record_launch_health(profile_folder, &plan.analysis) {
      log::warn!("Could not record mod health from the launch analysis: {error}");
    }
    let resolutions = if requires_review(&plan.analysis) {
      match self.reviewed_resolutions(&plan, &key)? {
        Some(resolutions) => resolutions,
        None => {
          // The review dialog analyzes the same inputs next; hand it this plan.
          self
            .localization_overlay_plan_cache
            .lock()
            .map_err(|_| Error::BackgroundTaskFailed("Localization plan cache poisoned".into()))?
            .replace(CachedLocalizationOverlayPlan { key, plan });
          return Err(Error::ModDataReviewRequired);
        }
      }
    } else {
      Vec::new()
    };
    let result = receipt::write(&plan, key, &resolutions)?;
    log::info!(
      "Prepared merged mod-data overlay for launch: {} localization tokens and {} compiled rows",
      result.applied_tokens,
      result.applied_compiled_rows
    );
    Ok(())
  }

  /// The player's saved choices, when they reviewed exactly the findings and
  /// inputs this plan pauses for. Library changes elsewhere don't discard them.
  fn reviewed_resolutions(
    &self,
    plan: &LocalizationOverlayPlan,
    key: &LocalizationOverlayPlanKey,
  ) -> Result<Option<Vec<LocalizationResolution>>, Error> {
    let Some(saved) = review::load(&key.output_path)? else {
      return Ok(None);
    };
    let inputs = review::ReviewedInputs::new(&plan.analysis, key)?;
    let Some(resolutions) = saved.resolutions_for(&inputs) else {
      log::info!(
        "Mods or game files changed since the compatibility review; it needs review again"
      );
      return Ok(None);
    };
    if let Err(error) = plan.analyze(&resolutions) {
      log::warn!("Saved compatibility review no longer applies: {error}");
      return Ok(None);
    }
    log::info!("Reusing the saved compatibility review");
    Ok(Some(resolutions))
  }

  /// Sends repair plan progress to the window while the player waits on it.
  fn plan_progress(&self) -> impl Fn(RepairPlanProgress) + '_ {
    move |progress: RepairPlanProgress| {
      if let Some(app) = &self.app_handle {
        progress.emit(app);
      }
    }
  }

  pub(super) fn report_plan_stage(&self, stage: RepairPlanStage) {
    self.plan_progress()(RepairPlanProgress {
      stage,
      checked: 0,
      total: 0,
    });
  }

  fn notify_compatibility_changed(&self, profile_folder: Option<&str>) {
    use tauri::Emitter;
    if let Some(app) = &self.app_handle {
      app.emit("mod-compatibility-changed", profile_folder).ok();
    }
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
    self.notify_compatibility_changed(profile_folder);
  }

  /// Removes a deleted profile's repair package and its saved review.
  pub fn delete_profile_localization_overlay(&self, profile_folder: &str) -> Result<(), Error> {
    review::remove(&self.localization_overlay_vpk_path(Some(profile_folder))?)?;
    self.delete_localization_overlay(Some(profile_folder))
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
  progress: &dyn Fn(RepairPlanProgress),
) -> Result<LocalizationOverlayPlan, Error> {
  let started = Instant::now();
  let (mut plan, observed, changed) = LocalizationOverlayPlan::build_learning_history(
    citadel,
    inputs,
    history::load(citadel),
    history::version(citadel),
    &key.compatibility_mod_ids,
    progress,
  )?;
  log::info!(
    "Built repair plan for {} mods ({} repaired) in {} ms",
    inputs.len(),
    key.compatibility_mod_ids.len(),
    started.elapsed().as_millis()
  );
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
  plan.analysis.unmanaged_vpks = key.unmanaged_vpks.clone();
  Ok(plan)
}

/// Launch pauses only for choices between mods and for inputs that could not
/// be read or matched. A mod's own asset and data findings describe that mod
/// whether or not it is repaired, so mod health reports them instead; model
/// overlaps and competing definitions involve other mods and still pause.
fn requires_review(analysis: &LocalizationOverlayAnalysis) -> bool {
  use crate::mod_manager::localization_overlay::asset_compatibility::WarningKind;
  use crate::mod_manager::localization_overlay::vdata_compatibility::WarningReason;
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
    || analysis.asset_warnings.iter().any(|warning| {
      warning.kind == WarningKind::OverlappingModel
        && !analysis.unloaded_models.contains(&warning.file_path)
    })
    || analysis.data_warnings.iter().any(|warning| {
      matches!(
        warning.reason,
        WarningReason::CompetingDefinitions | WarningReason::UnreadableResource
      )
    })
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
  use crate::mod_manager::mod_health::{
    self, CachedModHealth, FixModsResult, FixModsStatus, HealthKey, ModFindings, ModHealthSource,
    ModHealthStatus,
  };

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

  pub(super) fn test_manager(root: &Path) -> ModManager {
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
  fn untracked_enabled_archives_invalidate_compatibility_review() {
    let temp = tempfile::tempdir().unwrap();
    let mut manager = test_manager(temp.path());
    let base = manager.get_addons_path(None).unwrap();
    let before = manager.analyze_localization_overlay(None, &[]).unwrap();
    write_test_vpk(&base.join("pak01_dir.vpk"));
    let after = manager.analyze_localization_overlay(None, &[]).unwrap();
    assert_ne!(
      before.review_fingerprint, after.review_fingerprint,
      "A newly mounted archive must invalidate a reviewed overlay even without a manifest entry"
    );
    assert_eq!(after.scanned_vpks, 1);
    assert!(!requires_review(&after));
    assert_eq!(after.unmanaged_vpks[0].file_path, "pak01_dir.vpk");
    let output = manager.localization_overlay_vpk_path(None).unwrap();
    fs::create_dir_all(output.parent().unwrap()).unwrap();
    fs::write(&output, b"previous overlay").unwrap();
    assert!(
      manager
        .write_reviewed_localization_overlay(None, &[], &before.review_fingerprint)
        .unwrap_err()
        .to_string()
        .contains("changed since compatibility review")
    );
    assert_eq!(fs::read(output).unwrap(), b"previous overlay");
    assert!(ProfileVpkManifest::load(&base).unwrap().mods.is_empty());
  }

  #[test]
  fn untracked_archive_between_skin_variants_protects_its_winning_model() {
    let temp = tempfile::tempdir().unwrap();
    let mut manager = test_manager(temp.path());
    let base = manager.get_addons_path(None).unwrap();
    let model = "models/heroes/test/test.vmdl_c";
    for (filename, entry, contents) in [
      ("pak01_dir.vpk", "unrelated.txt", "first variant"),
      ("pak02_dir.vpk", model, "untracked model"),
      ("pak03_dir.vpk", model, "selected model"),
    ] {
      let source = tempfile::tempdir().unwrap();
      let file = source.path().join(entry);
      fs::create_dir_all(file.parent().unwrap()).unwrap();
      fs::write(file, contents).unwrap();
      fs::create_dir_all(&base).unwrap();
      vpkmanager::pack_directory(source.path(), &base.join(filename)).unwrap();
    }
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "skin",
      vec!["pak03_dir.vpk".into(), "pak01_dir.vpk".into()],
      vec![],
      Some(0),
      ShardIndex::FIRST,
    );
    manifest.mods.get_mut("skin").unwrap().compatibility_enabled = true;
    manifest.save(&base).unwrap();
    let original = fs::read(base.join("pak02_dir.vpk")).unwrap();
    let analysis = manager.analyze_localization_overlay(None, &[]).unwrap();
    assert_eq!(analysis.scanned_mods, 2);
    assert_eq!(analysis.scanned_vpks, 3);
    assert_eq!(analysis.compatibility_mod_ids, ["skin"]);
    assert_eq!(analysis.unmanaged_vpks.len(), 1);
    assert_eq!(analysis.protected_resources.len(), 1);
    assert_eq!(analysis.protected_resources[0].file_path, model);
    assert_eq!(
      analysis.protected_resources[0].mod_ids,
      [analysis.unmanaged_vpks[0].mod_id.clone()]
    );
    assert!(analysis.asset_repairs.is_empty());
    assert!(
      analysis.asset_warnings.is_empty(),
      "An opted-out model must not be decoded or rewritten"
    );
    assert_eq!(fs::read(base.join("pak02_dir.vpk")).unwrap(), original);
    assert_eq!(ProfileVpkManifest::load(&base).unwrap(), manifest);
    if let Some(path) = std::env::var_os("DMM_PROFILE_INVENTORY_REPORT") {
      fs::write(path, serde_json::to_vec_pretty(&analysis).unwrap()).unwrap();
    }
  }

  #[test]
  fn compatibility_inputs_follow_mounted_order_instead_of_stale_manifest_order() {
    let temp = tempfile::tempdir().unwrap();
    let manager = test_manager(temp.path());
    let base = manager.get_addons_path(None).unwrap();
    let mut manifest = ProfileVpkManifest::default();
    for (id, name, order) in [
      ("first", "pak01_dir.vpk", 9),
      ("second", "pak02_dir.vpk", 0),
    ] {
      write_test_vpk(&base.join(name));
      manifest.mark_enabled(
        id,
        vec![name.into()],
        vec![],
        Some(order),
        ShardIndex::FIRST,
      );
    }
    manifest.save(&base).unwrap();
    let (_, inputs, _) = manager.localization_overlay_inputs(None).unwrap();
    assert_eq!(
      inputs
        .iter()
        .map(|input| input.mod_id.as_str())
        .collect::<Vec<_>>(),
      ["first", "second"]
    );
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
        None,
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
          None,
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
        None,
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
          .register_analyzed_mod(None, "invalid".into(), "Invalid".into(), files, None, None)
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
      .prepare_localization_overlay_with_progress(None, true, || {})
      .unwrap();
  }

  #[test]
  fn analyzed_registration_retains_supplied_original_names_and_rejects_unsafe_names() {
    let temp = tempfile::tempdir().unwrap();
    let mut manager = test_manager(temp.path());
    let base = manager.get_addons_path(None).unwrap();
    write_test_vpk(&base.join("pak01_dir.vpk"));
    manager
      .register_analyzed_mod(
        Some(vec!["authored_skin.vpk".into()]),
        "skin".into(),
        "Skin".into(),
        vec!["pak01_dir.vpk".into()],
        None,
        None,
      )
      .unwrap();
    let manifest = ProfileVpkManifest::load(&base).unwrap();
    assert_eq!(
      manifest.mods["skin"].original_vpk_names,
      ["authored_skin.vpk"]
    );
    assert!(
      manager
        .register_analyzed_mod(
          Some(vec!["../escape.vpk".into()]),
          "skin".into(),
          "Skin".into(),
          vec!["pak01_dir.vpk".into()],
          None,
          None
        )
        .is_err()
    );
    assert_eq!(
      ProfileVpkManifest::load(&base).unwrap().mods["skin"].original_vpk_names,
      ["authored_skin.vpk"]
    );
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
        None,
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
      .prepare_localization_overlay_with_progress(
        None,
        manager.mod_compatibility_enabled(None).unwrap(),
        || {},
      )
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
  fn gameinfo_includes_the_repair_package_while_an_enabled_mod_is_opted_in() {
    let temp = tempfile::tempdir().unwrap();
    let mut manager = test_manager(temp.path());
    fs::write(
      temp.path().join("game/citadel/gameinfo.gi"),
      b"GameInfo
{
FileSystem
{
SearchPaths
{
Game citadel
Game core
}
}
}
",
    )
    .unwrap();
    let base = manager.get_addons_path(None).unwrap();
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
    manager
      .set_mod_compatibility_for_mod("mod".into(), true, None)
      .unwrap();
    let path = manager.localization_overlay_vpk_path(None).unwrap();
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(&path, b"repair package").unwrap();
    let overlay = ModManager::localization_overlay_search_path(None);
    assert_eq!(manager.profile_gameinfo_paths(None).unwrap()[0], overlay);
    manager
      .set_mod_compatibility_for_mod("mod".into(), false, None)
      .unwrap();
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(&path, b"repair package").unwrap();
    assert!(
      !manager
        .profile_gameinfo_paths(None)
        .unwrap()
        .contains(&overlay)
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
  fn protected_winning_assets_keep_original_files_without_blocking_launch() {
    let temp = tempfile::tempdir().unwrap();
    let mut manager = test_manager(temp.path());
    let base = manager.get_addons_path(None).unwrap();
    fs::create_dir_all(&base).unwrap();
    let source = tempfile::tempdir().unwrap();
    let path = source.path().join("models/shared_skin.vmdl_c");
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, b"original model must not be parsed or repaired").unwrap();
    let mut manifest = ProfileVpkManifest::default();
    for (order, id) in ["original-winner", "selected-loser"]
      .into_iter()
      .enumerate()
    {
      let name = format!("pak0{}_dir.vpk", order + 1);
      vpkmanager::pack_directory(source.path(), &base.join(&name)).unwrap();
      manifest.mark_enabled(
        id,
        vec![name],
        vec![],
        Some(order as u32),
        ShardIndex::FIRST,
      );
    }
    manifest
      .mods
      .get_mut("selected-loser")
      .unwrap()
      .compatibility_enabled = true;
    manifest.save(&base).unwrap();
    let analysis = manager.analyze_localization_overlay(None, &[]).unwrap();
    assert_eq!(analysis.protected_resources.len(), 1);
    assert!(analysis.asset_warnings.is_empty());
    assert!(analysis.parse_warnings.is_empty());
    assert!(!requires_review(&analysis));
    manager
      .prepare_localization_overlay_with_progress(None, true, || {})
      .unwrap();
    assert!(
      !manager
        .localization_overlay_vpk_path(None)
        .unwrap()
        .exists(),
      "the protected model must not be packed into the overlay"
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
      .prepare_localization_overlay_with_progress(None, true, || {})
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
      .prepare_localization_overlay_with_progress(None, true, || {})
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
      .prepare_localization_overlay_with_progress(None, true, || {})
      .unwrap();
    let path = manager.localization_overlay_vpk_path(None).unwrap();
    let before = receipt::load(&path).unwrap().unwrap().key;
    fs::write(citadel.join("pak01_000.vpk"), b"updated game data chunk").unwrap();
    manager
      .prepare_localization_overlay_with_progress(None, true, || {})
      .unwrap();
    let after = receipt::load(&path).unwrap().unwrap().key;
    assert_ne!(before, after);
    fs::write(citadel.join("steam.inf"), b"ClientVersion=200").unwrap();
    manager
      .prepare_localization_overlay_with_progress(None, true, || {})
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
  fn fixing_mods_sets_every_preference_and_reports_when_review_is_needed() {
    let temp = tempfile::tempdir().unwrap();
    let mut manager = manager_with_gameinfo(temp.path());
    let base = manager.get_addons_path(None).unwrap();
    let mut manifest = ProfileVpkManifest::default();
    for (id, name) in [("first", "pak01_dir.vpk"), ("second", "pak02_dir.vpk")] {
      write_test_vpk(&base.join(name));
      manifest.mark_enabled(id, vec![name.into()], vec![], None, ShardIndex::FIRST);
    }
    manifest.save(&base).unwrap();
    assert!(fix_mods(&mut manager, vec!["first".into(), "missing".into()]).is_err());
    assert_eq!(ProfileVpkManifest::load(&base).unwrap(), manifest);

    let result = fix_mods(&mut manager, vec!["first".into(), "second".into()]).unwrap();
    assert_eq!(result.status, FixModsStatus::Applied);
    assert!(manager.mod_compatibility_settings(None).unwrap()["first"]);
    assert!(manager.mod_compatibility_settings(None).unwrap()["second"]);
    let overlay = manager.localization_overlay_vpk_path(None).unwrap();
    assert!(receipt::load(&overlay).unwrap().is_some());

    let mut manifest = ProfileVpkManifest::load(&base).unwrap();
    manifest.mark_enabled(
      "deleted",
      vec!["pak03_dir.vpk".into()],
      vec![],
      None,
      ShardIndex::FIRST,
    );
    manifest.save(&base).unwrap();
    let result = fix_mods(&mut manager, vec!["deleted".into()]).unwrap();
    assert_eq!(result.status, FixModsStatus::ReviewRequired);
    assert!(manager.mod_compatibility_settings(None).unwrap()["deleted"]);
    assert!(receipt::load(&overlay).unwrap().is_none());
  }

  pub(super) fn write_vpk(path: &Path, entries: &[(&str, &[u8])]) {
    let source = tempfile::tempdir().unwrap();
    for (entry, bytes) in entries {
      let file = source.path().join(entry);
      fs::create_dir_all(file.parent().unwrap()).unwrap();
      fs::write(file, bytes).unwrap();
    }
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    vpkmanager::pack_directory(source.path(), path).unwrap();
  }

  fn manager_with_gameinfo(root: &Path) -> ModManager {
    let manager = test_manager(root);
    fs::write(
      root.join("game/citadel/gameinfo.gi"),
      b"GameInfo\n{\nFileSystem\n{\nSearchPaths\n{\nGame citadel\nGame core\n}\n}\n}\n",
    )
    .unwrap();
    manager
  }

  fn fix_mods(manager: &mut ModManager, mod_ids: Vec<String>) -> Result<FixModsResult, Error> {
    let manager = std::cell::RefCell::new(manager);
    ModManager::fix_mods(
      || {
        Ok(std::cell::RefMut::map(manager.borrow_mut(), |manager| {
          &mut **manager
        }))
      },
      None,
      &mod_ids,
      &|_| {},
    )
  }

  pub(super) fn refresh_repairs(
    manager: &mut ModManager,
    profile: Option<&str>,
  ) -> Result<(), Error> {
    if let Some(refresh) = manager.begin_mod_fix_refresh(profile)? {
      let (refresh, plan) = refresh.build(&|_| {})?;
      manager.finish_mod_fix_refresh(refresh, plan)?;
    }
    Ok(())
  }

  fn manager_with_applied_repair() -> (tempfile::TempDir, ModManager) {
    let temp = tempfile::tempdir().unwrap();
    let mut manager = manager_with_gameinfo(temp.path());
    let base = manager.get_addons_path(None).unwrap();
    let locale = "resource/localization/citadel_gc/citadel_gc_english.txt";
    write_vpk(
      &temp.path().join("game/citadel/pak01_dir.vpk"),
      &[(
        locale,
        br#""lang" { "Language" "English" "Tokens" { "shared" "Game" "retained" "Game token" } }"#,
      )],
    );
    write_vpk(
      &base.join("pak01_dir.vpk"),
      &[(
        locale,
        br#""lang" { "Language" "English" "Tokens" { "shared" "Mod" } }"#,
      )],
    );
    write_test_vpk(&base.join("pak02_dir.vpk"));
    let mut manifest = ProfileVpkManifest::default();
    for (id, name) in [("fixed", "pak01_dir.vpk"), ("unrelated", "pak02_dir.vpk")] {
      manifest.mark_enabled(
        id,
        vec![name.into()],
        vec![name.into()],
        None,
        ShardIndex::FIRST,
      );
    }
    manifest.save(&base).unwrap();
    assert_eq!(
      fix_mods(&mut manager, vec!["fixed".into()]).unwrap().status,
      FixModsStatus::Applied
    );
    (temp, manager)
  }

  #[test]
  fn unchanged_repairs_survive_a_fresh_manager_without_rebuilding() {
    let (temp, manager) = manager_with_applied_repair();
    let overlay = manager.localization_overlay_vpk_path(None).unwrap();
    let receipt_path = receipt::path(&overlay);
    let repaired = fs::read(&overlay).unwrap();
    let recorded = fs::read(&receipt_path).unwrap();
    let old_time = SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(1000);
    for path in [&overlay, &receipt_path] {
      fs::File::options()
        .write(true)
        .open(path)
        .unwrap()
        .set_times(fs::FileTimes::new().set_modified(old_time))
        .unwrap();
    }
    drop(manager);
    let manager = test_manager(temp.path());
    let mut rebuilds = 0;
    for _ in 0..2 {
      manager
        .prepare_localization_overlay_with_progress(None, true, || rebuilds += 1)
        .unwrap();
    }
    assert_eq!(fs::read(&overlay).unwrap(), repaired);
    assert_eq!(fs::read(&receipt_path).unwrap(), recorded);
    for path in [&overlay, &receipt_path] {
      assert_eq!(
        fs::metadata(path).unwrap().modified().unwrap(),
        old_time,
        "cache hit must not rewrite files"
      );
    }
    assert_eq!(rebuilds, 0, "cache hits must not announce a rebuild");
    fs::remove_file(&overlay).unwrap();
    manager
      .prepare_localization_overlay_with_progress(None, true, || rebuilds += 1)
      .unwrap();
    assert_eq!(rebuilds, 1, "a missing cache artifact must be rebuilt");
    assert_eq!(fs::read(&overlay).unwrap(), repaired);
  }

  #[test]
  fn disabling_an_unrelated_mod_keeps_applied_repairs_available() {
    let (_temp, mut manager) = manager_with_applied_repair();
    let overlay = manager.localization_overlay_vpk_path(None).unwrap();
    assert!(
      overlay.exists(),
      "fixture must produce an applied repair package"
    );
    let repaired = fs::read(&overlay).unwrap();
    manager
      .uninstall_mod("unrelated".into(), vec![], None)
      .unwrap();
    assert!(manager.mod_compatibility_settings(None).unwrap()["fixed"]);
    assert!(
      !overlay.exists(),
      "library actions invalidate without rebuilding under the manager lock"
    );
    refresh_repairs(&mut manager, None).unwrap();
    let survived = overlay.exists();
    assert_applied_repair(&manager, &repaired);
    manager
      .prepare_localization_overlay_with_progress(
        None,
        manager.mod_compatibility_enabled(None).unwrap(),
        || {},
      )
      .unwrap();
    assert_eq!(
      fs::read(&overlay).unwrap(),
      repaired,
      "manager launch must preserve the refreshed package"
    );
    assert!(
      survived,
      "disabling an unrelated mod removed the applied repair package before manager launch"
    );
    let (_, _, key) = manager.localization_overlay_inputs(None).unwrap();
    assert!(
      receipt::load(&overlay)
        .unwrap()
        .unwrap()
        .is_current(&key)
        .unwrap()
    );
  }

  fn assert_applied_repair(manager: &ModManager, expected: &[u8]) {
    let overlay = manager.localization_overlay_vpk_path(None).unwrap();
    assert_eq!(
      fs::read(&overlay).expect("repair must remain installed"),
      expected
    );
    let (_, _, key) = manager.localization_overlay_inputs(None).unwrap();
    assert!(
      receipt::load(&overlay)
        .unwrap()
        .unwrap()
        .is_current(&key)
        .unwrap()
    );
    assert_eq!(
      manager.profile_gameinfo_paths(None).unwrap()[0],
      ModManager::localization_overlay_search_path(None)
    );
  }

  #[test]
  fn library_operations_refresh_applied_repairs_without_a_manager_launch() {
    for operation in ["remove", "reorder", "enable", "replace", "download"] {
      let (temp, mut manager) = manager_with_applied_repair();
      let base = manager.get_addons_path(None).unwrap();
      let overlay = manager.localization_overlay_vpk_path(None).unwrap();
      let repaired = fs::read(&overlay).unwrap();
      let gameinfo = fs::read(temp.path().join("game/citadel/gameinfo.gi")).unwrap();
      match operation {
        "remove" => {
          manager.remove_mod_vpks("unrelated", &[], None).unwrap();
        }
        "reorder" => {
          // The fixed mod retains pak01 while other mods swap places.
          write_test_vpk(&base.join("pak03_dir.vpk"));
          let mut manifest = ProfileVpkManifest::load(&base).unwrap();
          manifest.mark_enabled(
            "third",
            vec!["pak03_dir.vpk".into()],
            vec!["third.vpk".into()],
            Some(2),
            ShardIndex::FIRST,
          );
          manifest.save(&base).unwrap();
          manager
            .reorder_mods_by_remote_id(
              vec![
                ("fixed".into(), vec![], 0),
                ("third".into(), vec![], 1),
                ("unrelated".into(), vec![], 2),
              ],
              None,
            )
            .unwrap();
          assert_eq!(
            ProfileVpkManifest::load(&base).unwrap().mods["fixed"].current_vpks,
            ["pak01_dir.vpk"]
          );
        }
        "enable" => {
          write_test_vpk(&base.join("new_new.vpk"));
          manager
            .install_mod(
              Mod {
                id: "new".into(),
                name: "New unrelated mod".into(),
                is_map: false,
                installed_vpks: vec![],
                original_vpk_names: vec![],
                file_tree: None,
                install_order: Some(2),
              },
              None,
            )
            .unwrap();
        }
        "replace" | "download" => {
          let source = temp.path().join("replacement.vpk");
          write_vpk(&source, &[("unrelated.txt", b"updated unrelated file")]);
          manager
            .update_mod_from_prepared(
              if operation == "download" {
                "downloaded"
              } else {
                "unrelated"
              },
              "Unrelated",
              &[source],
              None,
              None,
              operation != "download",
            )
            .unwrap();
        }
        _ => unreachable!(),
      }
      refresh_repairs(&mut manager, None).unwrap();
      assert_applied_repair(&manager, &repaired);
      assert_eq!(
        fs::read(temp.path().join("game/citadel/gameinfo.gi")).unwrap(),
        gameinfo,
        "{operation} changed the active search paths"
      );
    }
  }

  #[test]
  fn refreshing_an_inactive_profile_keeps_the_active_profile_and_its_repairs() {
    let (temp, mut manager) = manager_with_applied_repair();
    let base = manager.get_addons_path(None).unwrap();
    let other = manager.get_addons_path(Some("other")).unwrap();
    fs::create_dir_all(&other).unwrap();
    for name in ["pak01_dir.vpk", "pak02_dir.vpk"] {
      fs::copy(base.join(name), other.join(name)).unwrap();
    }
    ProfileVpkManifest::load(&base)
      .unwrap()
      .save(&other)
      .unwrap();
    let active_overlay = fs::read(manager.localization_overlay_vpk_path(None).unwrap()).unwrap();
    let gameinfo_path = temp.path().join("game/citadel/gameinfo.gi");
    let active_gameinfo = fs::read(&gameinfo_path).unwrap();
    refresh_repairs(&mut manager, Some("other")).unwrap();
    let other_overlay = manager
      .localization_overlay_vpk_path(Some("other"))
      .unwrap();
    assert!(other_overlay.exists());
    manager
      .uninstall_mod("unrelated".into(), vec![], Some("other".into()))
      .unwrap();
    refresh_repairs(&mut manager, Some("other")).unwrap();
    assert!(other_overlay.exists());
    let (_, _, key) = manager.localization_overlay_inputs(Some("other")).unwrap();
    assert!(
      receipt::load(&other_overlay)
        .unwrap()
        .unwrap()
        .is_current(&key)
        .unwrap()
    );
    assert_eq!(fs::read(&gameinfo_path).unwrap(), active_gameinfo);
    assert_applied_repair(&manager, &active_overlay);
  }

  #[test]
  fn removing_the_fixed_mod_does_not_keep_its_replacements_mounted() {
    let (_temp, mut manager) = manager_with_applied_repair();
    manager.uninstall_mod("fixed".into(), vec![], None).unwrap();
    assert!(
      !manager
        .localization_overlay_vpk_path(None)
        .unwrap()
        .exists()
    );
    assert!(
      !manager
        .profile_gameinfo_paths(None)
        .unwrap()
        .contains(&ModManager::localization_overlay_search_path(None))
    );
    assert!(manager.mod_compatibility_settings(None).unwrap()["fixed"]);
  }

  #[test]
  fn failed_refresh_removes_stale_repairs_without_clearing_the_saved_choice() {
    let (_temp, mut manager) = manager_with_applied_repair();
    let base = manager.get_addons_path(None).unwrap();
    let mut manifest = ProfileVpkManifest::load(&base).unwrap();
    // A partially missing multifile mod makes input collection fail before
    // launch preparation reaches its normal stale-overlay removal.
    manifest
      .mods
      .get_mut("unrelated")
      .unwrap()
      .current_vpks
      .push("pak03_dir.vpk".into());
    manifest.save(&base).unwrap();
    manager.invalidate_localization_overlay(None);
    assert!(refresh_repairs(&mut manager, None).is_err());
    let overlay = manager.localization_overlay_vpk_path(None).unwrap();
    assert!(!overlay.exists());
    assert!(receipt::load(&overlay).unwrap().is_none());
    assert!(manager.mod_compatibility_settings(None).unwrap()["fixed"]);
  }

  #[test]
  fn library_conflicts_remove_stale_repairs_and_wait_for_review() {
    let (_temp, mut manager) = manager_with_applied_repair();
    let base = manager.get_addons_path(None).unwrap();
    let locale = "resource/localization/citadel_gc/citadel_gc_english.txt";
    write_vpk(
      &base.join("pak02_dir.vpk"),
      &[(
        locale,
        br#""lang" { "Language" "English" "Tokens" { "shared" "Other mod" } }"#,
      )],
    );
    let mut manifest = ProfileVpkManifest::load(&base).unwrap();
    manifest
      .mods
      .get_mut("unrelated")
      .unwrap()
      .compatibility_enabled = true;
    manifest.save(&base).unwrap();
    manager.invalidate_localization_overlay(None);
    refresh_repairs(&mut manager, None).unwrap();
    let overlay = manager.localization_overlay_vpk_path(None).unwrap();
    assert!(!overlay.exists());
    assert!(receipt::load(&overlay).unwrap().is_none());
    let cache = manager.localization_overlay_plan_cache.lock().unwrap();
    assert!(requires_review(
      &cache
        .as_ref()
        .expect("review plan must be retained")
        .plan
        .analysis
    ));
    assert!(manager.mod_compatibility_settings(None).unwrap()["fixed"]);
  }

  #[test]
  fn missing_overlay_is_not_reported_as_fixed() {
    let (temp, mut manager) = manager_with_applied_repair();
    let base = manager.get_addons_path(None).unwrap();
    let app_data = temp.path().join("app-data");
    let key = HealthKey::stamp(
      &[base.join("pak01_dir.vpk")],
      None,
      receipt::REPAIR_REVISION,
    )
    .unwrap();
    mod_health::record(
      &app_data,
      &base.to_string_lossy(),
      None,
      [(
        "fixed".into(),
        CachedModHealth::new(key, ModFindings::with_repairs(1), ModHealthSource::Launch),
      )],
    )
    .unwrap();
    let context = manager.mod_health_context_in(None, app_data).unwrap();
    assert_eq!(
      context.report().unwrap().mods[0].status,
      ModHealthStatus::Fixed
    );
    let overlay = manager.localization_overlay_vpk_path(None).unwrap();
    let repaired = fs::read(&overlay).unwrap();
    let receipt_bytes = fs::read(receipt::path(&overlay)).unwrap();
    fs::remove_file(&overlay).unwrap();
    assert!(manager.mod_compatibility_settings(None).unwrap()["fixed"]);
    assert_eq!(
      context.report().unwrap().mods[0].status,
      ModHealthStatus::Fixable,
      "saved preference does not prove the repair is installed"
    );
    fs::write(&overlay, &repaired).unwrap();
    assert_eq!(
      context.report().unwrap().mods[0].status,
      ModHealthStatus::Fixed
    );
    fs::write(&overlay, b"damaged overlay").unwrap();
    assert_eq!(
      context.report().unwrap().mods[0].status,
      ModHealthStatus::Fixable
    );
    fs::write(&overlay, &repaired).unwrap();
    fs::remove_file(receipt::path(&overlay)).unwrap();
    assert_eq!(
      context.report().unwrap().mods[0].status,
      ModHealthStatus::Fixable
    );
    fs::write(receipt::path(&overlay), receipt_bytes).unwrap();
    // The original mod's health key is unchanged; the full applied receipt
    // still must stop matching when another enabled input changes.
    write_vpk(
      &base.join("pak02_dir.vpk"),
      &[("unrelated.txt", b"updated unrelated mod")],
    );
    assert_eq!(
      context.report().unwrap().mods[0].status,
      ModHealthStatus::Fixable
    );
    manager.invalidate_localization_overlay(None);
    refresh_repairs(&mut manager, None).unwrap();
    assert_eq!(
      context.report().unwrap().mods[0].status,
      ModHealthStatus::Fixed
    );
  }

  #[test]
  fn a_mods_own_findings_do_not_pause_launch() {
    let temp = tempfile::tempdir().unwrap();
    let mut manager = manager_with_gameinfo(temp.path());
    let citadel = temp.path().join("game/citadel");
    let model = "models/heroes/hero.vmdl_c";
    write_vpk(
      &citadel.join("pak01_dir.vpk"),
      &[(model, b"current game model")],
    );
    let base = manager.get_addons_path(None).unwrap();
    write_vpk(&base.join("pak01_dir.vpk"), &[(model, b"outdated model")]);
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "skin",
      vec!["pak01_dir.vpk".into()],
      vec![],
      None,
      ShardIndex::FIRST,
    );
    manifest.save(&base).unwrap();
    manager
      .set_mod_compatibility_for_mod("skin".into(), true, None)
      .unwrap();
    let analysis = manager.analyze_localization_overlay(None, &[]).unwrap();
    assert!(!analysis.asset_warnings.is_empty());
    manager
      .prepare_localization_overlay_with_progress(
        None,
        manager.mod_compatibility_enabled(None).unwrap(),
        || {},
      )
      .expect("a mod's own findings are reported by mod health, not review");
    let result = fix_mods(&mut manager, vec!["skin".into()]).unwrap();
    assert_eq!(result.status, FixModsStatus::Applied);
  }

  #[test]
  fn conflicts_between_mods_pause_launch_and_hand_the_plan_to_review() {
    let temp = tempfile::tempdir().unwrap();
    let mut manager = manager_with_gameinfo(temp.path());
    let base = manager.get_addons_path(None).unwrap();
    let mut manifest = ProfileVpkManifest::default();
    for (id, name, value) in [
      ("first", "pak01_dir.vpk", "First"),
      ("second", "pak02_dir.vpk", "Second"),
    ] {
      let text = format!(
        "\"lang\"\n{{\n\"Language\" \"English\"\n\"Tokens\"\n{{\n\"shared_token\" \"{value}\"\n}}\n}}\n"
      );
      write_vpk(
        &base.join(name),
        &[(
          "resource/localization/custom/custom_english.txt",
          text.as_bytes(),
        )],
      );
      manifest.mark_enabled(id, vec![name.into()], vec![], None, ShardIndex::FIRST);
    }
    manifest.save(&base).unwrap();
    let result = fix_mods(&mut manager, vec!["first".into(), "second".into()]).unwrap();
    assert_eq!(result.status, FixModsStatus::ReviewRequired);
    let analysis = manager.analyze_localization_overlay(None, &[]).unwrap();
    assert_eq!(analysis.conflicts.len(), 1);

    manager.invalidate_localization_overlay(None);
    assert!(matches!(
      manager.prepare_localization_overlay_with_progress(
        None,
        manager.mod_compatibility_enabled(None).unwrap(),
        || {},
      ),
      Err(Error::ModDataReviewRequired)
    ));
    assert!(
      manager
        .localization_overlay_plan_cache
        .lock()
        .unwrap()
        .is_some(),
      "the review dialog reuses the plan launch built"
    );
  }

  #[test]
  fn choosing_original_files_is_kept_until_the_player_fixes_the_mod() {
    let temp = tempfile::tempdir().unwrap();
    let mut manager = manager_with_gameinfo(temp.path());
    let citadel = temp.path().join("game/citadel");
    let base = manager.get_addons_path(None).unwrap();
    let vpk = base.join("pak01_dir.vpk");
    write_test_vpk(&vpk);
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "skin",
      vec!["pak01_dir.vpk".into()],
      vec![],
      None,
      ShardIndex::FIRST,
    );
    manifest.save(&base).unwrap();
    let app_data = temp.path().join("app-data");
    let key =
      HealthKey::stamp(&[vpk], history::version(&citadel), receipt::REPAIR_REVISION).unwrap();
    mod_health::record(
      &app_data,
      &base.to_string_lossy(),
      None,
      [(
        "skin".to_owned(),
        CachedModHealth::new(
          key,
          ModFindings::with_repairs(2),
          ModHealthSource::Standalone,
        ),
      )],
    )
    .unwrap();
    let context = manager.mod_health_context_in(None, app_data).unwrap();
    let status = || context.report().unwrap().mods[0].status;
    assert_eq!(status(), ModHealthStatus::Fixable);

    manager
      .set_mod_compatibility_for_mod("skin".into(), false, None)
      .unwrap();
    assert!(ProfileVpkManifest::load(&base).unwrap().mods["skin"].compatibility_opted_out);
    assert_eq!(status(), ModHealthStatus::OriginalFiles);
    manager
      .prepare_localization_overlay_with_progress(
        None,
        manager.mod_compatibility_enabled(None).unwrap(),
        || {},
      )
      .unwrap();
    assert!(!manager.mod_compatibility_settings(None).unwrap()["skin"]);

    let result = fix_mods(&mut manager, vec!["skin".into()]).unwrap();
    assert_eq!(result.status, FixModsStatus::Applied);
    let entry = ProfileVpkManifest::load(&base)
      .unwrap()
      .mods
      .remove("skin")
      .unwrap();
    assert!(entry.compatibility_enabled);
    assert!(!entry.compatibility_opted_out);
    assert_eq!(status(), ModHealthStatus::Fixed);
  }

  #[test]
  fn refresh_drops_a_plan_built_before_the_library_changed() {
    let temp = tempfile::tempdir().unwrap();
    let mut manager = manager_with_gameinfo(temp.path());
    let base = manager.get_addons_path(None).unwrap();
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
    manager
      .set_mod_compatibility_for_mod("mod".into(), true, None)
      .unwrap();

    let (refresh, plan) = manager
      .begin_mod_fix_refresh(None)
      .unwrap()
      .unwrap()
      .build(&|_| {})
      .unwrap();
    // The library changes while the plan builds without the manager lock.
    write_test_vpk(&base.join("pak02_dir.vpk"));
    let mut manifest = ProfileVpkManifest::load(&base).unwrap();
    manifest.mark_enabled(
      "other",
      vec!["pak02_dir.vpk".into()],
      vec![],
      None,
      ShardIndex::FIRST,
    );
    manifest.save(&base).unwrap();
    manager.finish_mod_fix_refresh(refresh, plan).unwrap();
    let overlay = manager.localization_overlay_vpk_path(None).unwrap();
    assert!(
      receipt::load(&overlay).unwrap().is_none(),
      "a stale plan must not be written as the package"
    );

    let (refresh, plan) = manager
      .begin_mod_fix_refresh(None)
      .unwrap()
      .unwrap()
      .build(&|_| {})
      .unwrap();
    manager.finish_mod_fix_refresh(refresh, plan).unwrap();
    assert!(manager.begin_mod_fix_refresh(None).unwrap().is_none());
  }

  #[test]
  fn refresh_keeps_the_package_a_launch_prepared_during_the_build() {
    let temp = tempfile::tempdir().unwrap();
    let mut manager = manager_with_gameinfo(temp.path());
    let base = manager.get_addons_path(None).unwrap();
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
    manager
      .set_mod_compatibility_for_mod("mod".into(), true, None)
      .unwrap();

    let (refresh, plan) = manager
      .begin_mod_fix_refresh(None)
      .unwrap()
      .unwrap()
      .build(&|_| {})
      .unwrap();
    // Launch takes the manager lock while the refresh builds without it.
    manager
      .prepare_localization_overlay_with_progress(
        None,
        manager.mod_compatibility_enabled(None).unwrap(),
        || {},
      )
      .unwrap();
    let receipt_path = receipt::path(&manager.localization_overlay_vpk_path(None).unwrap());
    let launched = std::time::SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(1);
    fs::File::options()
      .write(true)
      .open(&receipt_path)
      .unwrap()
      .set_modified(launched)
      .unwrap();

    manager.finish_mod_fix_refresh(refresh, plan).unwrap();
    assert_eq!(
      fs::metadata(&receipt_path).unwrap().modified().unwrap(),
      launched,
      "the refresh must not replace the package launch prepared"
    );
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

  const REVIEW_LOCALE: &str = "resource/localization/custom/custom_english.txt";

  fn review_text(tokens: &str) -> String {
    format!("\"lang\"\n{{\n\"Language\" \"English\"\n\"Tokens\"\n{{\n{tokens}\n}}\n}}\n")
  }

  fn write_review_vpk(path: &Path, value: &str, extra: &str) {
    let text = review_text(&format!("\"shared_token\" \"{value}\"\n{extra}"));
    write_vpk(path, &[(REVIEW_LOCALE, text.as_bytes())]);
  }

  /// Two fixed mods set the same game token differently, so fixing them needs
  /// a review. A third, plain mod is unrelated to it.
  fn manager_with_conflict() -> (tempfile::TempDir, ModManager) {
    let temp = tempfile::tempdir().unwrap();
    let mut manager = manager_with_gameinfo(temp.path());
    write_review_vpk(&temp.path().join("game/citadel/pak01_dir.vpk"), "Game", "");
    let base = manager.get_addons_path(None).unwrap();
    write_review_vpk(&base.join("pak01_dir.vpk"), "First", "");
    write_review_vpk(&base.join("pak02_dir.vpk"), "Second", "");
    write_test_vpk(&base.join("pak03_dir.vpk"));
    let mut manifest = ProfileVpkManifest::default();
    for (id, name) in [
      ("first", "pak01_dir.vpk"),
      ("second", "pak02_dir.vpk"),
      ("plain", "pak03_dir.vpk"),
    ] {
      manifest.mark_enabled(
        id,
        vec![name.into()],
        vec![name.into()],
        None,
        ShardIndex::FIRST,
      );
    }
    manifest.save(&base).unwrap();
    assert_eq!(
      fix_mods(&mut manager, vec!["first".into(), "second".into()])
        .unwrap()
        .status,
      FixModsStatus::ReviewRequired
    );
    (temp, manager)
  }

  /// Applies the review with `choice` (`load order`, `vanilla` or a mod ID)
  /// and returns the value the package must hold.
  fn apply_review(manager: &mut ModManager, choice: &str) -> String {
    let analysis = manager.analyze_localization_overlay(None, &[]).unwrap();
    let [conflict] = analysis.conflicts.as_slice() else {
      panic!("expected one conflict, got {:?}", analysis.conflicts);
    };
    let (resolutions, expected) = match choice {
      "load order" => (Vec::new(), conflict.candidates[0].value.clone()),
      "vanilla" => (
        vec![LocalizationResolution {
          conflict_key: conflict.key.clone(),
          winner_mod_id: None,
          winner_value: None,
          winner_source_vpk: None,
          use_vanilla: true,
        }],
        conflict.vanilla_value.clone().unwrap(),
      ),
      mod_id => {
        let candidate = conflict
          .candidates
          .iter()
          .find(|candidate| candidate.mod_id == mod_id)
          .unwrap();
        (
          vec![LocalizationResolution {
            conflict_key: conflict.key.clone(),
            winner_mod_id: Some(candidate.mod_id.clone()),
            winner_value: Some(candidate.value.clone()),
            winner_source_vpk: Some(candidate.source_vpk.clone()),
            use_vanilla: false,
          }],
          candidate.value.clone(),
        )
      }
    };
    manager
      .write_reviewed_localization_overlay(None, &resolutions, &analysis.review_fingerprint)
      .unwrap();
    assert_reviewed_package(manager, &expected);
    expected
  }

  fn assert_reviewed_package(manager: &ModManager, expected: &str) {
    use source2_model::vpk_extract::VpkArchive;
    let overlay = manager.localization_overlay_vpk_path(None).unwrap();
    let archive = VpkArchive::open(&overlay).expect("the reviewed package must be written");
    let text = String::from_utf8(archive.extract_entry(REVIEW_LOCALE).unwrap()).unwrap();
    assert!(
      text.contains(&format!("\"{expected}\"")),
      "package must keep the reviewed value {expected}: {text}"
    );
    let (_, _, key) = manager.localization_overlay_inputs(None).unwrap();
    assert!(
      receipt::load(&overlay)
        .unwrap()
        .unwrap()
        .is_current(&key)
        .unwrap()
    );
  }

  fn assert_review_required(manager: &ModManager, change: &str) {
    manager.invalidate_localization_overlay(None);
    let result = manager.prepare_localization_overlay_with_progress(None, true, || {});
    assert!(
      matches!(result, Err(Error::ModDataReviewRequired)),
      "{change}: {result:?}"
    );
    let overlay = manager.localization_overlay_vpk_path(None).unwrap();
    assert!(!overlay.exists());
    assert!(receipt::load(&overlay).unwrap().is_none());
  }

  #[test]
  fn reviewed_choices_survive_unrelated_library_changes() {
    for choice in ["load order", "second", "vanilla"] {
      let (temp, mut manager) = manager_with_conflict();
      let expected = apply_review(&mut manager, choice);

      manager.uninstall_mod("plain".into(), vec![], None).unwrap();
      refresh_repairs(&mut manager, None).unwrap();
      assert_reviewed_package(&manager, &expected);

      manager
        .install_mod(
          Mod {
            id: "plain".into(),
            name: "Plain mod".into(),
            is_map: false,
            installed_vpks: vec![],
            original_vpk_names: vec![],
            file_tree: None,
            install_order: None,
          },
          None,
        )
        .unwrap();
      refresh_repairs(&mut manager, None).unwrap();
      assert_reviewed_package(&manager, &expected);

      // The review outlives the manager, and launch reuses it like a refresh.
      drop(manager);
      let manager = test_manager(temp.path());
      manager.invalidate_localization_overlay(None);
      manager
        .prepare_localization_overlay_with_progress(None, true, || {})
        .unwrap();
      assert_reviewed_package(&manager, &expected);
    }
  }

  #[test]
  fn a_saved_review_is_asked_again_when_what_it_covered_changes() {
    for change in [
      "new contender",
      "reordered contenders",
      "loser rewritten",
      "game rewritten",
      "missing mod",
    ] {
      let (temp, mut manager) = manager_with_conflict();
      apply_review(&mut manager, "load order");
      let base = manager.get_addons_path(None).unwrap();
      match change {
        // Only fixed mods take part in a review.
        "new contender" => {
          write_review_vpk(&base.join("pak04_dir.vpk"), "Third", "");
          let mut manifest = ProfileVpkManifest::load(&base).unwrap();
          manifest.mark_enabled(
            "third",
            vec!["pak04_dir.vpk".into()],
            vec![],
            None,
            ShardIndex::FIRST,
          );
          manifest.mods.get_mut("third").unwrap().compatibility_enabled = true;
          manifest.save(&base).unwrap();
        }
        "reordered contenders" => {
          manager
            .reorder_mods_by_remote_id(
              vec![
                ("second".into(), vec![], 0),
                ("first".into(), vec![], 1),
                ("plain".into(), vec![], 2),
              ],
              None,
            )
            .unwrap();
        }
        // Same conflicting value; only the losing mod's files changed.
        "loser rewritten" => {
          let analysis = manager.analyze_localization_overlay(None, &[]).unwrap();
          let loser = &analysis.conflicts[0].candidates[1];
          let (name, value) = if loser.mod_id == "first" {
            ("pak01_dir.vpk", "First")
          } else {
            ("pak02_dir.vpk", "Second")
          };
          write_review_vpk(&base.join(name), value, "\"other_token\" \"Other\"");
        }
        "game rewritten" => {
          write_review_vpk(
            &temp.path().join("game/citadel/pak01_dir.vpk"),
            "Game",
            "\"other_token\" \"Game other\"",
          );
        }
        // A new finding that pauses launch, beside the same conflict.
        "missing mod" => {
          let mut manifest = ProfileVpkManifest::load(&base).unwrap();
          manifest.mark_enabled(
            "missing",
            vec!["pak05_dir.vpk".into()],
            vec![],
            None,
            ShardIndex::FIRST,
          );
          manifest.save(&base).unwrap();
        }
        _ => unreachable!(),
      }
      assert_review_required(&manager, change);
    }
  }

  #[test]
  fn deleting_a_profile_removes_its_saved_review() {
    let (_temp, mut manager) = manager_with_conflict();
    apply_review(&mut manager, "load order");
    let overlay = manager.localization_overlay_vpk_path(None).unwrap();
    assert!(review::path(&overlay).is_file());
    manager.invalidate_localization_overlay(None);
    manager.delete_localization_overlay(None).unwrap();
    assert!(
      review::path(&overlay).is_file(),
      "removing the package keeps the player's review"
    );

    let profile = manager.get_addons_path(Some("other")).unwrap();
    fs::create_dir_all(&profile).unwrap();
    let other = manager
      .localization_overlay_vpk_path(Some("other"))
      .unwrap();
    fs::create_dir_all(other.parent().unwrap()).unwrap();
    fs::write(&other, b"package").unwrap();
    fs::write(review::path(&other), b"{}").unwrap();
    manager
      .delete_profile_localization_overlay("other")
      .unwrap();
    assert!(!other.parent().unwrap().exists());
  }
}
