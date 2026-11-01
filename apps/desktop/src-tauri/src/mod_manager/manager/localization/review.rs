//! The player's applied compatibility review, kept apart from the repair
//! package. Library changes discard the package and its receipt, but a review
//! still answers the same questions while the inputs it covered are unchanged.

use super::receipt::REPAIR_REVISION;
use super::{LocalizationInputStamp, LocalizationOverlayPlanKey, LocalizationResolution};
use crate::errors::Error;
use crate::mod_manager::localization_overlay::LocalizationOverlayAnalysis;
use crate::mod_manager::localization_overlay::asset_compatibility::WarningKind;
use crate::mod_manager::localization_overlay::vdata_compatibility::WarningReason;
use crate::mod_manager::vdata_history::BaselineStatus;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::{
  fs,
  io::Write,
  path::{Path, PathBuf},
};

const REVIEW_NAME: &str = "compatibility-review.json";

/// What a review answered. Reuse requires every field to match, so a saved
/// review never answers a question the player was not asked.
#[derive(Debug, PartialEq, Serialize, Deserialize)]
pub(super) struct ReviewedInputs {
  revision: u32,
  /// Digest of every finding that paused for review, without absolute load
  /// priorities, so unrelated mods moving in the load order do not change it.
  subject: String,
  /// Stamps of each mod the findings name; `None` when its files were missing.
  mods: BTreeMap<String, Option<Vec<LocalizationInputStamp>>>,
  base_game: Vec<LocalizationInputStamp>,
  /// Compiled data is read against learned game history and the app's bundled
  /// history, which the findings only summarise. Text reviews leave it unset.
  compiled_history: Option<CompiledHistory>,
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
struct CompiledHistory {
  observed: Option<String>,
  app_version: String,
}

#[derive(Serialize, Deserialize)]
pub(super) struct SavedReview {
  inputs: ReviewedInputs,
  resolutions: Vec<LocalizationResolution>,
}

#[derive(Serialize)]
struct Subject<'a> {
  conflicts: Vec<TextConflict<'a>>,
  compiled_conflicts: Vec<CompiledConflict<'a>>,
  input_warnings: &'a [crate::mod_manager::localization_overlay::LocalizationInputWarning],
  snapshot_warnings: &'a [crate::mod_manager::localization_overlay::LocalizationSnapshotWarning],
  parse_warnings: &'a [crate::mod_manager::localization_overlay::LocalizationParseWarning],
  model_warnings:
    Vec<&'a crate::mod_manager::localization_overlay::asset_compatibility::AssetWarning>,
  data_warnings:
    Vec<&'a crate::mod_manager::localization_overlay::vdata_compatibility::DataWarning>,
  baselines: Vec<&'a crate::mod_manager::localization_overlay::CompiledDataBaseline>,
}

#[derive(Serialize)]
struct TextConflict<'a> {
  key: &'a str,
  vanilla_value: Option<&'a str>,
  /// In load order, so accepting the recommended winner stays tied to it.
  candidates: Vec<(&'a str, &'a str, &'a str)>,
}

#[derive(Serialize)]
struct CompiledConflict<'a> {
  key: &'a str,
  existed_in_vanilla: bool,
  candidates: Vec<(&'a str, &'a str)>,
}

impl ReviewedInputs {
  /// Describes what the review of `analysis` covers. `key` must be the plan's
  /// key after the build, so its history digest includes anything it learned.
  pub fn new(
    analysis: &LocalizationOverlayAnalysis,
    key: &LocalizationOverlayPlanKey,
  ) -> Result<Self, Error> {
    let model_warnings: Vec<_> = analysis
      .asset_warnings
      .iter()
      .filter(|warning| {
        warning.kind == WarningKind::OverlappingModel
          && !analysis.unloaded_models.contains(&warning.file_path)
      })
      .collect();
    let data_warnings: Vec<_> = analysis
      .data_warnings
      .iter()
      .filter(|warning| {
        matches!(
          warning.reason,
          WarningReason::CompetingDefinitions | WarningReason::UnreadableResource
        )
      })
      .collect();
    let mut involved = BTreeSet::new();
    for conflict in &analysis.conflicts {
      involved.extend(
        conflict
          .candidates
          .iter()
          .map(|candidate| candidate.mod_id.as_str()),
      );
    }
    for conflict in &analysis.compiled_data_conflicts {
      involved.extend(
        conflict
          .candidates
          .iter()
          .map(|candidate| candidate.mod_id.as_str()),
      );
    }
    involved.extend(
      analysis
        .input_warnings
        .iter()
        .map(|warning| warning.mod_id.as_str()),
    );
    involved.extend(
      analysis
        .snapshot_warnings
        .iter()
        .map(|warning| warning.mod_id.as_str()),
    );
    involved.extend(
      analysis
        .parse_warnings
        .iter()
        .map(|warning| warning.mod_id.as_str()),
    );
    involved.extend(model_warnings.iter().map(|warning| warning.mod_id.as_str()));
    involved.extend(data_warnings.iter().map(|warning| warning.mod_id.as_str()));
    involved.extend(
      analysis
        .baselines
        .iter()
        .filter(|baseline| baseline.evidence.status != BaselineStatus::Matched)
        .map(|baseline| baseline.mod_id.as_str()),
    );
    // Every baseline of an involved mod, matched or not: learning can change
    // how its compiled files are read without changing the findings above.
    let baselines: Vec<_> = analysis
      .baselines
      .iter()
      .filter(|baseline| involved.contains(baseline.mod_id.as_str()))
      .collect();
    let compiled = !analysis.compiled_data_conflicts.is_empty()
      || !data_warnings.is_empty()
      || !baselines.is_empty();
    let subject = Subject {
      conflicts: analysis
        .conflicts
        .iter()
        .map(|conflict| TextConflict {
          key: &conflict.key,
          vanilla_value: conflict.vanilla_value.as_deref(),
          candidates: conflict
            .candidates
            .iter()
            .map(|candidate| {
              (
                candidate.mod_id.as_str(),
                candidate.source_vpk.as_str(),
                candidate.value.as_str(),
              )
            })
            .collect(),
        })
        .collect(),
      compiled_conflicts: analysis
        .compiled_data_conflicts
        .iter()
        .map(|conflict| CompiledConflict {
          key: &conflict.key,
          existed_in_vanilla: conflict.existed_in_vanilla,
          candidates: conflict
            .candidates
            .iter()
            .map(|candidate| (candidate.mod_id.as_str(), candidate.source_vpk.as_str()))
            .collect(),
        })
        .collect(),
      input_warnings: &analysis.input_warnings,
      snapshot_warnings: &analysis.snapshot_warnings,
      parse_warnings: &analysis.parse_warnings,
      model_warnings,
      data_warnings,
      baselines,
    };
    let subject = serde_json::to_vec(&subject).map_err(|error| {
      Error::InvalidInput(format!("Could not identify compatibility review: {error}"))
    })?;
    let mods = involved
      .into_iter()
      .map(|mod_id| {
        let stamps = key
          .mods
          .iter()
          .find(|(id, _)| id == mod_id)
          .map(|(_, stamps)| stamps.clone());
        (mod_id.to_owned(), stamps)
      })
      .collect();
    Ok(Self {
      revision: REPAIR_REVISION,
      subject: hex::encode(Sha256::digest(subject)),
      mods,
      base_game: key.base_game.clone(),
      compiled_history: compiled.then(|| CompiledHistory {
        observed: key.history_digest.clone(),
        app_version: env!("CARGO_PKG_VERSION").to_owned(),
      }),
    })
  }
}

impl SavedReview {
  /// The saved choices when they were made for exactly these inputs.
  pub fn resolutions_for(self, inputs: &ReviewedInputs) -> Option<Vec<LocalizationResolution>> {
    (self.inputs == *inputs).then_some(self.resolutions)
  }
}

pub(super) fn path(overlay: &Path) -> PathBuf {
  overlay.with_file_name(REVIEW_NAME)
}

/// Loads the saved review. A missing or unreadable file means the player has
/// not reviewed these mods, so review is asked again.
pub(super) fn load(overlay: &Path) -> Result<Option<SavedReview>, Error> {
  match fs::read(path(overlay)) {
    Ok(bytes) => Ok(
      serde_json::from_slice(&bytes)
        .inspect_err(|error| log::warn!("Ignoring unreadable compatibility review: {error}"))
        .ok(),
    ),
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
    Err(error) => Err(Error::io_context(
      "read compatibility review",
      &path(overlay),
      error,
    )),
  }
}

pub(super) fn save(
  overlay: &Path,
  inputs: ReviewedInputs,
  resolutions: &[LocalizationResolution],
) -> Result<(), Error> {
  let target = path(overlay);
  let parent = target
    .parent()
    .ok_or_else(|| Error::InvalidInput("Compatibility review has no parent directory".into()))?;
  let review = SavedReview {
    inputs,
    resolutions: resolutions.to_vec(),
  };
  let save = || -> Result<(), Error> {
    fs::create_dir_all(parent)?;
    let mut staged = tempfile::NamedTempFile::new_in(parent)?;
    serde_json::to_writer_pretty(staged.as_file_mut(), &review).map_err(|error| {
      Error::ModInvalid(format!("Failed to record compatibility review: {error}"))
    })?;
    staged.as_file_mut().flush()?;
    staged.as_file().sync_all()?;
    staged
      .persist(&target)
      .map_err(|error| Error::Io(error.error))?;
    Ok(())
  };
  save().map_err(|error| match error {
    Error::Io(error) => Error::io_context("save compatibility review", &target, error),
    error => error,
  })
}

pub(super) fn remove(overlay: &Path) -> Result<(), Error> {
  let path = path(overlay);
  match fs::remove_file(&path) {
    Ok(()) => Ok(()),
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
    Err(error) => Err(Error::io_context(
      "remove compatibility review",
      &path,
      error,
    )),
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::mod_manager::localization_overlay::{
    CompiledDataBaseline, CompiledDataCandidate, CompiledDataConflict, LocalizationCandidate,
    LocalizationConflict,
  };
  use crate::mod_manager::vdata_history::BaselineEvidence;

  fn stamp(name: &str, length: u64) -> LocalizationInputStamp {
    LocalizationInputStamp {
      path: PathBuf::from(name),
      length,
      modified: None,
      digest: None,
    }
  }

  fn key(history: &str) -> LocalizationOverlayPlanKey {
    LocalizationOverlayPlanKey {
      output_path: PathBuf::from("dmm_localization_default/overlay_dir.vpk"),
      input_warnings: Vec::new(),
      unmanaged_vpks: Vec::new(),
      history_digest: Some(history.into()),
      compatibility_mod_ids: BTreeSet::new(),
      base_game: vec![stamp("game/pak01_dir.vpk", 1)],
      mods: ["first", "second", "plain"]
        .into_iter()
        .map(|id| (id.to_owned(), vec![stamp(id, 1)]))
        .collect(),
    }
  }

  fn text_conflict(candidates: &[(&str, usize)]) -> LocalizationConflict {
    LocalizationConflict {
      key: "custom\u{1f}shared_token".into(),
      file_path: "custom".into(),
      token: "shared_token".into(),
      vanilla_value: Some("Game".into()),
      candidates: candidates
        .iter()
        .map(|(mod_id, priority)| LocalizationCandidate {
          mod_id: (*mod_id).into(),
          source_vpk: format!("{mod_id}.vpk"),
          value: mod_id.to_uppercase(),
          priority: *priority,
        })
        .collect(),
    }
  }

  fn text_review(candidates: &[(&str, usize)]) -> LocalizationOverlayAnalysis {
    LocalizationOverlayAnalysis {
      conflicts: vec![text_conflict(candidates)],
      ..Default::default()
    }
  }

  fn baseline(mod_id: &str, build: u32) -> CompiledDataBaseline {
    CompiledDataBaseline {
      mod_id: mod_id.into(),
      source_vpk: format!("{mod_id}.vpk"),
      file_path: "scripts/abilities.vdata_c".into(),
      evidence: BaselineEvidence {
        status: BaselineStatus::Matched,
        build_versions: vec![build],
        comparable_rows: 3,
        changed_rows: 1,
      },
    }
  }

  fn compiled_review(first_build: u32, plain_build: u32) -> LocalizationOverlayAnalysis {
    LocalizationOverlayAnalysis {
      compiled_data_conflicts: vec![CompiledDataConflict {
        key: "compiled\u{1f}scripts/abilities.vdata_c\u{1f}row\u{1f}k:5:value".into(),
        file_path: "scripts/abilities.vdata_c".into(),
        row_name: "row".into(),
        field_path: "value".into(),
        existed_in_vanilla: true,
        candidates: ["first", "second"]
          .into_iter()
          .enumerate()
          .map(|(priority, mod_id)| CompiledDataCandidate {
            mod_id: mod_id.into(),
            source_vpk: format!("{mod_id}.vpk"),
            priority,
          })
          .collect(),
      }],
      baselines: vec![
        baseline("first", first_build),
        baseline("plain", plain_build),
      ],
      ..Default::default()
    }
  }

  fn inputs(
    analysis: &LocalizationOverlayAnalysis,
    key: &LocalizationOverlayPlanKey,
  ) -> ReviewedInputs {
    ReviewedInputs::new(analysis, key).unwrap()
  }

  #[test]
  fn text_reviews_ignore_unrelated_mods_load_positions_and_history() {
    let reviewed = inputs(
      &text_review(&[("first", 0), ("second", 1)]),
      &key("learned"),
    );
    let mut later = key("learned more");
    later.mods[2].1 = vec![stamp("plain", 2)];
    later.mods.push(("new".into(), vec![stamp("new", 1)]));
    assert_eq!(
      inputs(&text_review(&[("first", 4), ("second", 7)]), &later),
      reviewed
    );
  }

  #[test]
  fn reviews_cover_contender_order_their_files_and_the_game() {
    let reviewed = inputs(&text_review(&[("first", 0), ("second", 1)]), &key("h"));
    assert_ne!(
      inputs(&text_review(&[("second", 0), ("first", 1)]), &key("h")),
      reviewed,
      "the recommended winner follows load order"
    );
    let mut loser_changed = key("h");
    loser_changed.mods[1].1 = vec![stamp("second", 2)];
    assert_ne!(
      inputs(&text_review(&[("first", 0), ("second", 1)]), &loser_changed),
      reviewed
    );
    let mut loser_missing = key("h");
    loser_missing.mods.remove(1);
    assert_ne!(
      inputs(&text_review(&[("first", 0), ("second", 1)]), &loser_missing),
      reviewed
    );
    let mut game_changed = key("h");
    game_changed.base_game[0].length = 2;
    assert_ne!(
      inputs(&text_review(&[("first", 0), ("second", 1)]), &game_changed),
      reviewed
    );
  }

  #[test]
  fn compiled_reviews_also_cover_learned_history_and_involved_baselines() {
    let reviewed = inputs(&compiled_review(1, 1), &key("h"));
    assert_eq!(
      inputs(&compiled_review(1, 2), &key("h")),
      reviewed,
      "an uninvolved mod's baseline is not part of the review"
    );
    assert_ne!(inputs(&compiled_review(2, 1), &key("h")), reviewed);
    assert_ne!(
      inputs(&compiled_review(1, 1), &key("learned since")),
      reviewed,
      "equal evidence can hide a changed history match"
    );
  }

  #[test]
  fn saved_reviews_round_trip_and_answer_only_their_inputs() {
    let temp = tempfile::tempdir().unwrap();
    let overlay = temp.path().join("dmm_localization_default/overlay_dir.vpk");
    let analysis = text_review(&[("first", 0), ("second", 1)]);
    save(&overlay, inputs(&analysis, &key("h")), &[]).unwrap();
    let saved = load(&overlay).unwrap().unwrap();
    assert_eq!(
      saved
        .resolutions_for(&inputs(&analysis, &key("h")))
        .unwrap()
        .len(),
      0,
      "keeping the recommended order is a review too"
    );
    let saved = load(&overlay).unwrap().unwrap();
    assert!(
      saved
        .resolutions_for(&inputs(
          &text_review(&[("second", 0), ("first", 1)]),
          &key("h")
        ))
        .is_none()
    );
    fs::write(path(&overlay), b"partial json").unwrap();
    assert!(load(&overlay).unwrap().is_none());
    remove(&overlay).unwrap();
    remove(&overlay).unwrap();
    assert!(!path(&overlay).exists());
  }
}
