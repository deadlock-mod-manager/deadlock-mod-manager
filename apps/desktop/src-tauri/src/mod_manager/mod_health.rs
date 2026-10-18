use crate::errors::Error;
use crate::mod_manager::localization_overlay::LocalizationOverlayAnalysis;
use crate::mod_manager::localization_overlay::asset_compatibility::{
  AssetWarning, RepairKind as AssetRepairKind, WarningKind as AssetWarningKind,
};
use crate::mod_manager::localization_overlay::vdata_compatibility::{
  RepairKind as DataRepairKind, WarningKind as DataWarningKind,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;
use ts_rs::TS;

const CACHE_FILE: &str = "mod-health.json";
// Increment when status or symptom rules change, so cached verdicts are rechecked.
const HEALTH_RULES_REVISION: u32 = 6;

static CACHE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub enum ModHealthStatus {
  Works,
  Fixable,
  /// Has repairs, but some findings remain after them.
  PartlyFixable,
  Fixed,
  /// Fixable or partly fixable, but the player chose to keep the mod's
  /// original files.
  OriginalFiles,
  NeedsUpdate,
  NotCovered,
}

/// What a player would notice in game, grouped from the detailed repair and
/// finding kinds of the compatibility analysis.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub enum ModHealthSymptom {
  CameraAim,
  Animations,
  Appearance,
  Model,
  GameData,
  CrashRisk,
}

/// `launch` results come from the full analysis of every opted-in mod together
/// and take precedence over `standalone` checks of the same files.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub enum ModHealthSource {
  Standalone,
  Launch,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct ModHealth {
  pub mod_id: String,
  pub status: ModHealthStatus,
  /// Union of `fix_symptoms` and `remaining_symptoms`.
  pub symptoms: Vec<ModHealthSymptom>,
  /// What the available repairs address.
  pub fix_symptoms: Vec<ModHealthSymptom>,
  /// What the repairs leave unresolved.
  pub remaining_symptoms: Vec<ModHealthSymptom>,
  pub repairs: u32,
  pub warnings: u32,
  pub game_build: Option<u32>,
  pub checked_at: String,
  pub source: ModHealthSource,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct ModHealthReport {
  pub game_build: Option<u32>,
  /// The game build of the check before the latest one, so the UI can tell
  /// when Deadlock updated since mods were last checked.
  pub previous_game_build: Option<u32>,
  pub mods: Vec<ModHealth>,
}

/// Sent as `mod-health-progress` while `check_mod_health` runs.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct ModHealthProgress {
  pub checked: u32,
  pub total: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub enum FixModsStatus {
  Applied,
  ReviewRequired,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct FixModsResult {
  pub status: FixModsStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CompatibilityChoice {
  Unset,
  Enabled,
  OriginalFiles,
}

pub(crate) enum Finding<'a> {
  AssetRepair(&'a AssetRepairKind),
  AssetWarning(&'a AssetWarning),
  DataRepair(&'a DataRepairKind),
  DataWarning(&'a DataWarningKind),
  Localization,
}

/// Structural model faults the engine can reject outright, and missing
/// references it may not have a fallback for, are reported as crash risks.
/// A missing texture only changes how the model looks.
pub(crate) fn symptom(finding: Finding) -> ModHealthSymptom {
  use ModHealthSymptom::*;
  match finding {
    Finding::AssetRepair(kind) => match kind {
      AssetRepairKind::AnimationSkeleton
      | AssetRepairKind::AnimationSkeletonRebased
      | AssetRepairKind::AnimationInterface
      | AssetRepairKind::AnimationClipTracks
      | AssetRepairKind::AnimationRigRebase => Animations,
      AssetRepairKind::CameraInterface
      | AssetRepairKind::CameraControls
      | AssetRepairKind::CameraAttachmentFrame => CameraAim,
      AssetRepairKind::MaterialBindings => Appearance,
      AssetRepairKind::ModelRelocation => Model,
    },
    Finding::AssetWarning(warning) if is_missing_texture(warning) => Appearance,
    Finding::AssetWarning(warning) => match warning.kind {
      AssetWarningKind::UnverifiedSkeleton
      | AssetWarningKind::MissingAnimationInterface
      | AssetWarningKind::AnimationMapping => Animations,
      AssetWarningKind::OutdatedCameraAttachments => CameraAim,
      AssetWarningKind::MaterialMapping | AssetWarningKind::MaterialInterface => Appearance,
      AssetWarningKind::ModelMapping | AssetWarningKind::OverlappingModel => Model,
      AssetWarningKind::InvalidSkeleton
      | AssetWarningKind::InvalidBoneRemapping
      | AssetWarningKind::InvalidAttachment
      | AssetWarningKind::InvalidHitbox
      | AssetWarningKind::MissingResource
      | AssetWarningKind::UnreadableResource
      | AssetWarningKind::MissingCameraInterface => CrashRisk,
    },
    Finding::DataRepair(
      DataRepairKind::HeroDevelopmentState
      | DataRepairKind::InheritedDefinition
      | DataRepairKind::RetainedDependency
      | DataRepairKind::CurrentReference
      | DataRepairKind::EnumMapEntry,
    ) => GameData,
    Finding::DataWarning(
      DataWarningKind::MissingDefinition
      | DataWarningKind::UnverifiedDefinition
      | DataWarningKind::UnverifiedInheritance
      | DataWarningKind::MissingDevelopmentState
      | DataWarningKind::OmittedHeroDefinition
      | DataWarningKind::OmittedEnumMapEntry,
    ) => GameData,
    Finding::Localization => GameData,
  }
}

fn is_missing_texture(warning: &AssetWarning) -> bool {
  let target = warning.detail.to_ascii_lowercase();
  warning.kind == AssetWarningKind::MissingResource
    && (target.ends_with(".vtex") || target.ends_with(".vtex_c"))
}

/// Warnings that stay listed in review but don't mark a mod as needing an
/// update. Missing textures and shader differences only change
/// looks. Retired `.vanmgrph` graphs are what animation includes still name
/// after an update; a primary model that really lost its animations reports
/// `MissingAnimationInterface` as well. Portrait attachments only frame the HUD
/// portrait. A skin updated for Paint the Town that plays correctly in game
/// still reports every one of these.
fn is_informational(warning: &AssetWarning) -> bool {
  match warning.kind {
    AssetWarningKind::MaterialInterface => true,
    AssetWarningKind::MissingResource => {
      is_missing_texture(warning) || warning.detail.to_ascii_lowercase().ends_with(".vanmgrph")
    }
    AssetWarningKind::InvalidAttachment => warning.detail.starts_with("portrait_"),
    _ => false,
  }
}

/// Whether a loaded asset warning marks the mod as needing an update. A prop model, such as a particle's model, never acts as a hero,
/// so hero interface warnings do not apply.
fn affects_mod(analysis: &LocalizationOverlayAnalysis, warning: &AssetWarning) -> bool {
  !is_informational(warning)
    && !(analysis.prop_models.contains(&warning.file_path)
      && matches!(
        warning.kind,
        AssetWarningKind::MissingCameraInterface
          | AssetWarningKind::MissingAnimationInterface
          | AssetWarningKind::OutdatedCameraAttachments
          | AssetWarningKind::ModelMapping
      ))
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ModFindings {
  repairs: u32,
  warnings: u32,
  needs_update: bool,
  fix_symptoms: BTreeSet<ModHealthSymptom>,
  remaining_symptoms: BTreeSet<ModHealthSymptom>,
  /// Whether the mod has any resource the analysis can check.
  covered: bool,
}

impl ModFindings {
  pub(crate) fn uncovered() -> Self {
    Self::default()
  }

  #[cfg(test)]
  pub(crate) fn with_repairs(repairs: u32) -> Self {
    Self {
      repairs,
      covered: true,
      ..Self::default()
    }
  }

  /// Uncertain baselines and stale localization snapshots still pause launch
  /// for review, but they describe how a mod's edits are merged rather than a
  /// defect, so they do not mark the mod as needing an update. Warnings on
  /// models the game never loads are left out, and informational warnings
  /// count as warnings without requiring an update.
  pub(crate) fn from_analysis(
    analysis: &LocalizationOverlayAnalysis,
    mod_id: &str,
    covered: bool,
  ) -> Self {
    let repairs: Vec<_> = analysis
      .asset_repairs
      .iter()
      .filter(|repair| repair.mod_id == mod_id)
      .map(|repair| Finding::AssetRepair(&repair.kind))
      .chain(
        analysis
          .data_repairs
          .iter()
          .filter(|repair| repair.mod_id == mod_id)
          .map(|repair| Finding::DataRepair(&repair.kind)),
      )
      .collect();
    let warnings: Vec<_> = analysis
      .asset_warnings
      .iter()
      .filter(|warning| {
        warning.mod_id == mod_id && !analysis.unloaded_models.contains(&warning.file_path)
      })
      .map(Finding::AssetWarning)
      .chain(
        analysis
          .data_warnings
          .iter()
          .filter(|warning| warning.mod_id == mod_id)
          .map(|warning| Finding::DataWarning(&warning.kind)),
      )
      .chain(
        analysis
          .parse_warnings
          .iter()
          .filter(|warning| warning.mod_id == mod_id)
          .map(|_| Finding::Localization),
      )
      .collect();
    let warning_count = warnings.len() as u32;
    let remaining_symptoms: BTreeSet<_> = warnings
      .into_iter()
      .filter(
        |finding| !matches!(finding, Finding::AssetWarning(warning) if !affects_mod(analysis, warning)),
      )
      .map(symptom)
      .collect();
    Self {
      repairs: repairs.len() as u32,
      warnings: warning_count,
      needs_update: !remaining_symptoms.is_empty(),
      fix_symptoms: repairs.into_iter().map(symptom).collect(),
      remaining_symptoms,
      covered,
    }
  }

  pub(crate) fn status(&self, choice: CompatibilityChoice) -> ModHealthStatus {
    if self.repairs > 0 {
      match choice {
        CompatibilityChoice::Enabled => ModHealthStatus::Fixed,
        CompatibilityChoice::OriginalFiles => ModHealthStatus::OriginalFiles,
        CompatibilityChoice::Unset if self.needs_update => ModHealthStatus::PartlyFixable,
        CompatibilityChoice::Unset => ModHealthStatus::Fixable,
      }
    } else if self.needs_update {
      ModHealthStatus::NeedsUpdate
    } else if !self.covered {
      ModHealthStatus::NotCovered
    } else {
      ModHealthStatus::Works
    }
  }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileStamp {
  length: u64,
  modified: Option<SystemTime>,
}

/// Identifies the analysed files without their location: enabling, disabling,
/// and reordering a mod renames its VPKs but keeps their size and timestamp.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthKey {
  files: Vec<FileStamp>,
  game_build: Option<u32>,
  revision: u32,
  rules: u32,
}

impl HealthKey {
  pub(crate) fn stamp(
    vpks: &[PathBuf],
    game_build: Option<u32>,
    revision: u32,
  ) -> std::io::Result<Self> {
    let files = vpks
      .iter()
      .map(|path| {
        let metadata = std::fs::metadata(path)?;
        Ok(FileStamp {
          length: metadata.len(),
          modified: metadata.modified().ok(),
        })
      })
      .collect::<std::io::Result<_>>()?;
    Ok(Self {
      files,
      game_build,
      revision,
      rules: HEALTH_RULES_REVISION,
    })
  }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CachedModHealth {
  key: HealthKey,
  findings: ModFindings,
  checked_at: DateTime<Utc>,
  source: ModHealthSource,
}

impl CachedModHealth {
  pub(crate) fn new(key: HealthKey, findings: ModFindings, source: ModHealthSource) -> Self {
    Self {
      key,
      findings,
      checked_at: Utc::now(),
      source,
    }
  }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProfileHealth {
  checked_build: Option<u32>,
  previous_build: Option<u32>,
  mods: BTreeMap<String, CachedModHealth>,
}

impl ProfileHealth {
  pub(crate) fn is_current(&self, mod_id: &str, key: &HealthKey) -> bool {
    self.mods.get(mod_id).is_some_and(|entry| entry.key == *key)
  }

  fn record(&mut self, game_build: Option<u32>, mod_id: String, entry: CachedModHealth) {
    if self.checked_build != game_build {
      self.previous_build = self.checked_build;
      self.checked_build = game_build;
    }
    let replaces_launch_result = entry.source == ModHealthSource::Standalone
      && self.mods.get(&mod_id).is_some_and(|current| {
        current.source == ModHealthSource::Launch && current.key == entry.key
      });
    if !replaces_launch_result {
      self.mods.insert(mod_id, entry);
    }
  }

  /// `installed` lists each mod with its current key and the player's
  /// compatibility choice in the profile. Stale entries are omitted.
  pub(crate) fn report<'a>(
    &self,
    game_build: Option<u32>,
    installed: impl IntoIterator<Item = (&'a str, &'a HealthKey, CompatibilityChoice)>,
  ) -> ModHealthReport {
    let mods = installed
      .into_iter()
      .filter_map(|(mod_id, key, choice)| {
        let entry = self.mods.get(mod_id).filter(|entry| entry.key == *key)?;
        Some(ModHealth {
          mod_id: mod_id.to_owned(),
          status: entry.findings.status(choice),
          symptoms: entry
            .findings
            .fix_symptoms
            .union(&entry.findings.remaining_symptoms)
            .copied()
            .collect(),
          fix_symptoms: entry.findings.fix_symptoms.iter().copied().collect(),
          remaining_symptoms: entry.findings.remaining_symptoms.iter().copied().collect(),
          repairs: entry.findings.repairs,
          warnings: entry.findings.warnings,
          game_build: entry.key.game_build,
          checked_at: entry.checked_at.to_rfc3339(),
          source: entry.source,
        })
      })
      .collect();
    ModHealthReport {
      game_build,
      previous_game_build: if self.checked_build == game_build {
        self.previous_build
      } else {
        self.checked_build
      },
      mods,
    }
  }
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HealthCache {
  profiles: BTreeMap<String, ProfileHealth>,
}

fn cache_path(app_data: &Path) -> PathBuf {
  app_data.join(CACHE_FILE)
}

fn read_cache(app_data: &Path) -> HealthCache {
  let path = cache_path(app_data);
  match std::fs::read(&path) {
    Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_else(|error| {
      log::warn!(
        "Ignoring unreadable mod health cache {}: {error}",
        path.display()
      );
      HealthCache::default()
    }),
    Err(error) => {
      if error.kind() != std::io::ErrorKind::NotFound {
        log::warn!(
          "Could not read mod health cache {}: {error}",
          path.display()
        );
      }
      HealthCache::default()
    }
  }
}

pub(crate) fn load(app_data: &Path, profile: &str) -> ProfileHealth {
  let _guard = CACHE_LOCK.lock().unwrap_or_else(|error| error.into_inner());
  read_cache(app_data)
    .profiles
    .remove(profile)
    .unwrap_or_default()
}

pub(crate) fn record(
  app_data: &Path,
  profile: &str,
  game_build: Option<u32>,
  entries: impl IntoIterator<Item = (String, CachedModHealth)>,
) -> Result<(), Error> {
  let _guard = CACHE_LOCK.lock().unwrap_or_else(|error| error.into_inner());
  let mut cache = read_cache(app_data);
  let health = cache.profiles.entry(profile.to_owned()).or_default();
  for (mod_id, entry) in entries {
    health.record(game_build, mod_id, entry);
  }
  std::fs::create_dir_all(app_data)?;
  let mut staged = tempfile::NamedTempFile::new_in(app_data)?;
  serde_json::to_writer(staged.as_file_mut(), &cache)
    .map_err(|error| Error::InvalidInput(format!("Could not save mod health: {error}")))?;
  staged.as_file_mut().flush()?;
  staged
    .persist(cache_path(app_data))
    .map_err(|error| Error::Io(error.error))?;
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::mod_manager::localization_overlay::asset_compatibility::AssetRepair;
  use crate::mod_manager::localization_overlay::vdata_compatibility::WarningReason;
  use crate::mod_manager::localization_overlay::vdata_compatibility::{DataRepair, DataWarning};

  fn findings(repairs: u32, needs_update: bool, covered: bool) -> ModFindings {
    ModFindings {
      repairs,
      warnings: u32::from(needs_update),
      needs_update,
      fix_symptoms: BTreeSet::new(),
      remaining_symptoms: BTreeSet::new(),
      covered,
    }
  }

  fn key(length: u64, game_build: Option<u32>) -> HealthKey {
    HealthKey {
      files: vec![FileStamp {
        length,
        modified: None,
      }],
      game_build,
      revision: 1,
      rules: HEALTH_RULES_REVISION,
    }
  }

  fn repair(mod_id: &str, kind: AssetRepairKind) -> AssetRepair {
    AssetRepair {
      mod_id: mod_id.into(),
      source_vpk: "pak01_dir.vpk".into(),
      file_path: "models/a.vmdl_c".into(),
      kind,
    }
  }

  fn warning(mod_id: &str, file_path: &str, kind: AssetWarningKind, detail: &str) -> AssetWarning {
    AssetWarning {
      mod_id: mod_id.into(),
      source_vpk: "pak01_dir.vpk".into(),
      file_path: file_path.into(),
      kind,
      detail: detail.into(),
    }
  }

  #[test]
  fn repairs_with_remaining_warnings_are_partly_fixable() {
    use CompatibilityChoice::*;
    assert_eq!(
      findings(3, true, true).status(Unset),
      ModHealthStatus::PartlyFixable
    );
    assert_eq!(
      findings(3, true, true).status(Enabled),
      ModHealthStatus::Fixed
    );
    assert_eq!(
      findings(3, true, true).status(OriginalFiles),
      ModHealthStatus::OriginalFiles
    );
    assert_eq!(
      findings(0, true, true).status(Enabled),
      ModHealthStatus::NeedsUpdate
    );
    assert_eq!(
      findings(0, true, false).status(Unset),
      ModHealthStatus::NeedsUpdate
    );
    assert_eq!(
      findings(2, false, true).status(Unset),
      ModHealthStatus::Fixable
    );
    assert_eq!(
      findings(2, false, true).status(Enabled),
      ModHealthStatus::Fixed
    );
    assert_eq!(
      findings(2, false, true).status(OriginalFiles),
      ModHealthStatus::OriginalFiles
    );
    assert_eq!(
      findings(0, false, false).status(OriginalFiles),
      ModHealthStatus::NotCovered
    );
    assert_eq!(
      findings(0, false, true).status(Enabled),
      ModHealthStatus::Works
    );
  }

  fn sorted(symptoms: &BTreeSet<ModHealthSymptom>) -> Vec<ModHealthSymptom> {
    symptoms.iter().copied().collect()
  }

  #[test]
  fn findings_split_fix_and_remaining_symptoms_for_the_requested_mod() {
    let mut analysis = LocalizationOverlayAnalysis {
      asset_repairs: vec![
        repair("skin", AssetRepairKind::CameraControls),
        repair("skin", AssetRepairKind::CameraInterface),
        repair("skin", AssetRepairKind::AnimationClipTracks),
        repair("other", AssetRepairKind::MaterialBindings),
      ],
      asset_warnings: vec![warning(
        "other",
        "models/a.vmdl_c",
        AssetWarningKind::MissingResource,
        "models/a.vmesh",
      )],
      data_repairs: vec![DataRepair {
        mod_id: "skin".into(),
        source_vpk: "pak01_dir.vpk".into(),
        file_path: "scripts/heroes.vdata_c".into(),
        row_name: "hero".into(),
        kind: DataRepairKind::CurrentReference,
        detail: String::new(),
      }],
      ..Default::default()
    };
    let skin = ModFindings::from_analysis(&analysis, "skin", true);
    assert_eq!(skin.repairs, 4);
    assert_eq!(skin.warnings, 0);
    assert_eq!(
      sorted(&skin.fix_symptoms),
      [
        ModHealthSymptom::CameraAim,
        ModHealthSymptom::Animations,
        ModHealthSymptom::GameData
      ]
    );
    assert!(skin.remaining_symptoms.is_empty());
    analysis.data_warnings = vec![DataWarning {
      mod_id: "skin".into(),
      source_vpk: "pak01_dir.vpk".into(),
      file_path: "scripts/heroes.vdata_c".into(),
      row_name: "hero".into(),
      kind: DataWarningKind::MissingDefinition,
      field_path: String::new(),
      target_file: String::new(),
      target_row: String::new(),
      reason: WarningReason::DefinitionUnavailable,
      detail: String::new(),
    }];
    let other = ModFindings::from_analysis(&analysis, "other", true);
    assert_eq!((other.repairs, other.warnings), (1, 1));
    assert_eq!(sorted(&other.fix_symptoms), [ModHealthSymptom::Appearance]);
    assert_eq!(
      sorted(&other.remaining_symptoms),
      [ModHealthSymptom::CrashRisk]
    );
    let skin = ModFindings::from_analysis(&analysis, "skin", true);
    assert_eq!(
      sorted(&skin.remaining_symptoms),
      [ModHealthSymptom::GameData]
    );
    assert_eq!(
      skin.status(CompatibilityChoice::Unset),
      ModHealthStatus::PartlyFixable
    );
    let current = key(1, Some(100));
    let mut health = ProfileHealth::default();
    health.record(
      Some(100),
      "skin".into(),
      CachedModHealth::new(current.clone(), skin, ModHealthSource::Standalone),
    );
    let report = health.report(Some(100), [("skin", &current, CompatibilityChoice::Unset)]);
    let reported = &report.mods[0];
    assert_eq!(reported.status, ModHealthStatus::PartlyFixable);
    assert_eq!(
      reported.symptoms,
      [
        ModHealthSymptom::CameraAim,
        ModHealthSymptom::Animations,
        ModHealthSymptom::GameData
      ]
    );
    assert_eq!(reported.remaining_symptoms, [ModHealthSymptom::GameData]);
  }

  #[test]
  fn missing_textures_are_counted_without_leaving_remaining_symptoms() {
    let analysis = LocalizationOverlayAnalysis {
      asset_repairs: vec![repair("skin", AssetRepairKind::CameraControls)],
      asset_warnings: vec![
        warning(
          "skin",
          "materials/skin.vmat_c",
          AssetWarningKind::MissingResource,
          "materials/default/default_tga_1234.vtex",
        ),
        warning(
          "plain",
          "materials/plain.vmat_c",
          AssetWarningKind::MissingResource,
          "Materials/Default/Default.VTEX_C",
        ),
      ],
      ..Default::default()
    };
    let skin = ModFindings::from_analysis(&analysis, "skin", true);
    assert_eq!((skin.repairs, skin.warnings), (1, 1));
    assert_eq!(sorted(&skin.fix_symptoms), [ModHealthSymptom::CameraAim]);
    assert!(skin.remaining_symptoms.is_empty());
    assert_eq!(
      skin.status(CompatibilityChoice::Unset),
      ModHealthStatus::Fixable
    );
    assert_eq!(
      ModFindings::from_analysis(&analysis, "plain", true).status(CompatibilityChoice::Unset),
      ModHealthStatus::Works
    );
  }

  #[test]
  fn informational_warnings_leave_a_working_skin_without_remaining_symptoms() {
    let model = "models/heroes_wip/pocket/pocket.vmdl_c";
    let analysis = LocalizationOverlayAnalysis {
      asset_warnings: vec![
        warning(
          "skin",
          "models/heroes_wip/pocket/materials/pocket_body.vmat_c",
          AssetWarningKind::MaterialInterface,
          "Authored shader feature differs: m_intParams.F_SELF_ILLUM",
        ),
        warning(
          "skin",
          "models/heroes_wip/pocket/pocket_backup.vmdl_c",
          AssetWarningKind::MissingResource,
          "models/heroes_wip/pocket/pocket.vanmgrph",
        ),
        warning(
          "skin",
          model,
          AssetWarningKind::InvalidAttachment,
          "portrait_camera_attach",
        ),
      ],
      ..Default::default()
    };
    let skin = ModFindings::from_analysis(&analysis, "skin", true);
    assert_eq!(skin.warnings, 3);
    assert!(skin.remaining_symptoms.is_empty());
    assert_eq!(
      skin.status(CompatibilityChoice::Unset),
      ModHealthStatus::Works
    );

    let gameplay = LocalizationOverlayAnalysis {
      asset_warnings: vec![warning(
        "skin",
        model,
        AssetWarningKind::InvalidAttachment,
        "camera_pivot",
      )],
      ..Default::default()
    };
    assert_eq!(
      ModFindings::from_analysis(&gameplay, "skin", true).status(CompatibilityChoice::Unset),
      ModHealthStatus::NeedsUpdate
    );

    let projectile = "models/heroes_staging/synth/synth.vmdl_c";
    let prop = |prop_models: Vec<String>| LocalizationOverlayAnalysis {
      asset_warnings: vec![warning(
        "skin",
        projectile,
        AssetWarningKind::MissingCameraInterface,
        "CitadelCameraSettings_t",
      )],
      prop_models,
      ..Default::default()
    };
    assert_eq!(
      ModFindings::from_analysis(&prop(vec![projectile.into()]), "skin", true)
        .status(CompatibilityChoice::Unset),
      ModHealthStatus::Works,
      "a particle's model needs no hero camera"
    );
    assert_eq!(
      ModFindings::from_analysis(&prop(Vec::new()), "skin", true)
        .status(CompatibilityChoice::Unset),
      ModHealthStatus::NeedsUpdate
    );
  }

  #[test]
  fn warnings_on_models_the_game_never_loads_do_not_affect_status() {
    let backup = "models/heroes/custom/custom_backup.vmdl_c";
    let analysis = LocalizationOverlayAnalysis {
      asset_repairs: vec![repair("skin", AssetRepairKind::CameraControls)],
      asset_warnings: vec![warning(
        "skin",
        backup,
        AssetWarningKind::MissingResource,
        "models/heroes/custom/custom.vanmgrph",
      )],
      unloaded_models: vec![backup.into()],
      ..Default::default()
    };
    let skin = ModFindings::from_analysis(&analysis, "skin", true);
    assert_eq!((skin.repairs, skin.warnings), (1, 0));
    assert!(skin.remaining_symptoms.is_empty());
    assert_eq!(
      skin.status(CompatibilityChoice::Unset),
      ModHealthStatus::Fixable
    );
  }

  #[test]
  fn symptoms_follow_the_player_visible_effect() {
    let asset_warning = |kind| warning("mod", "models/a.vmdl_c", kind, "models/a.vmesh");
    assert_eq!(
      symptom(Finding::AssetRepair(
        &AssetRepairKind::CameraAttachmentFrame
      )),
      ModHealthSymptom::CameraAim
    );
    assert_eq!(
      symptom(Finding::AssetRepair(&AssetRepairKind::AnimationSkeleton)),
      ModHealthSymptom::Animations
    );
    assert_eq!(
      symptom(Finding::AssetRepair(&AssetRepairKind::ModelRelocation)),
      ModHealthSymptom::Model
    );
    assert_eq!(
      symptom(Finding::AssetWarning(&asset_warning(
        AssetWarningKind::MaterialInterface
      ))),
      ModHealthSymptom::Appearance
    );
    assert_eq!(
      symptom(Finding::AssetWarning(&asset_warning(
        AssetWarningKind::OverlappingModel
      ))),
      ModHealthSymptom::Model
    );
    for kind in [
      AssetWarningKind::MissingResource,
      AssetWarningKind::InvalidSkeleton,
      AssetWarningKind::InvalidBoneRemapping,
      AssetWarningKind::InvalidAttachment,
      AssetWarningKind::InvalidHitbox,
      AssetWarningKind::UnreadableResource,
      AssetWarningKind::MissingCameraInterface,
    ] {
      assert_eq!(
        symptom(Finding::AssetWarning(&asset_warning(kind))),
        ModHealthSymptom::CrashRisk
      );
    }
    assert_eq!(
      symptom(Finding::DataWarning(&DataWarningKind::OmittedEnumMapEntry)),
      ModHealthSymptom::GameData
    );
    assert_eq!(symptom(Finding::Localization), ModHealthSymptom::GameData);
  }

  #[test]
  fn changed_files_game_build_or_revision_make_entries_stale() {
    let mut health = ProfileHealth::default();
    let current = key(10, Some(100));
    health.record(
      Some(100),
      "mod".into(),
      CachedModHealth::new(
        current.clone(),
        findings(1, false, true),
        ModHealthSource::Standalone,
      ),
    );
    assert!(health.is_current("mod", &current));
    assert!(!health.is_current("other", &current));
    assert!(!health.is_current("mod", &key(11, Some(100))));
    assert!(!health.is_current("mod", &key(10, Some(101))));
    let mut revised = current.clone();
    revised.revision += 1;
    assert!(!health.is_current("mod", &revised));
    let mut new_rules = current.clone();
    new_rules.rules += 1;
    assert!(!health.is_current("mod", &new_rules));
    let report = health.report(Some(100), [("mod", &revised, CompatibilityChoice::Enabled)]);
    assert!(report.mods.is_empty());
    let report = health.report(Some(100), [("mod", &current, CompatibilityChoice::Enabled)]);
    assert_eq!(report.mods[0].status, ModHealthStatus::Fixed);
    let report = health.report(
      Some(100),
      [("mod", &current, CompatibilityChoice::OriginalFiles)],
    );
    assert_eq!(report.mods[0].status, ModHealthStatus::OriginalFiles);
  }

  #[test]
  fn file_stamps_ignore_location_but_track_content_changes() {
    let temp = tempfile::tempdir().unwrap();
    let enabled = temp.path().join("pak01_dir.vpk");
    std::fs::write(&enabled, b"mod").unwrap();
    let before = HealthKey::stamp(std::slice::from_ref(&enabled), Some(1), 1).unwrap();
    let disabled = temp.path().join("disabled_pak01_dir.vpk");
    std::fs::rename(&enabled, &disabled).unwrap();
    assert_eq!(
      before,
      HealthKey::stamp(std::slice::from_ref(&disabled), Some(1), 1).unwrap()
    );
    std::fs::write(&disabled, b"updated mod").unwrap();
    assert_ne!(before, HealthKey::stamp(&[disabled], Some(1), 1).unwrap());
    assert!(HealthKey::stamp(&[enabled], Some(1), 1).is_err());
  }

  #[test]
  fn previous_build_tracks_the_check_before_a_game_update() {
    let mut health = ProfileHealth::default();
    let entry = |build| {
      CachedModHealth::new(
        key(1, Some(build)),
        findings(0, false, true),
        ModHealthSource::Standalone,
      )
    };
    health.record(Some(100), "mod".into(), entry(100));
    assert_eq!(health.report(Some(100), []).previous_game_build, None);
    assert_eq!(
      health.report(Some(101), []).previous_game_build,
      Some(100),
      "an unchecked game update compares against the last check"
    );
    health.record(Some(101), "mod".into(), entry(101));
    let report = health.report(Some(101), []);
    assert_eq!(report.game_build, Some(101));
    assert_eq!(report.previous_game_build, Some(100));
    health.record(Some(101), "other".into(), entry(101));
    assert_eq!(health.report(Some(101), []).previous_game_build, Some(100));
  }

  #[test]
  fn standalone_checks_do_not_replace_current_launch_results() {
    let mut health = ProfileHealth::default();
    let current = key(1, Some(100));
    health.record(
      Some(100),
      "mod".into(),
      CachedModHealth::new(
        current.clone(),
        findings(0, true, true),
        ModHealthSource::Launch,
      ),
    );
    health.record(
      Some(100),
      "mod".into(),
      CachedModHealth::new(
        current.clone(),
        findings(1, false, true),
        ModHealthSource::Standalone,
      ),
    );
    let report = health.report(Some(100), [("mod", &current, CompatibilityChoice::Enabled)]);
    assert_eq!(report.mods[0].source, ModHealthSource::Launch);
    assert_eq!(report.mods[0].status, ModHealthStatus::NeedsUpdate);
    let changed = key(2, Some(100));
    health.record(
      Some(100),
      "mod".into(),
      CachedModHealth::new(
        changed.clone(),
        findings(1, false, true),
        ModHealthSource::Standalone,
      ),
    );
    let report = health.report(Some(100), [("mod", &changed, CompatibilityChoice::Unset)]);
    assert_eq!(report.mods[0].source, ModHealthSource::Standalone);
  }

  #[test]
  fn cache_round_trips_per_profile_and_survives_corruption() {
    let temp = tempfile::tempdir().unwrap();
    let current = key(1, Some(100));
    record(
      temp.path(),
      "profile-a",
      Some(100),
      [(
        "mod".to_owned(),
        CachedModHealth::new(
          current.clone(),
          findings(1, false, true),
          ModHealthSource::Standalone,
        ),
      )],
    )
    .unwrap();
    assert!(load(temp.path(), "profile-a").is_current("mod", &current));
    assert!(!load(temp.path(), "profile-b").is_current("mod", &current));
    std::fs::write(cache_path(temp.path()), b"{ partial").unwrap();
    assert!(!load(temp.path(), "profile-a").is_current("mod", &current));
  }
}
