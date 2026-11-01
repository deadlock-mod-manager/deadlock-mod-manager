use super::receipt::REPAIR_REVISION;
use super::*;
use crate::mod_manager::localization_overlay::{self, GameIndex};
use crate::mod_manager::mod_health::{
  self, CachedModHealth, CompatibilityChoice, FixModsResult, FixModsStatus, HealthKey, ModFindings,
  ModHealthProgress, ModHealthReport, ModHealthSource, ProfileHealth,
};
use crate::mod_manager::vdata_history::VdataHistoryIndex;
use std::collections::BTreeSet;
use std::ops::DerefMut;
use std::sync::Arc;

static CHECK_LOCK: Mutex<()> = Mutex::new(());

/// Paths needed to check a profile's mods without holding the mod manager.
pub struct ModHealthContext {
  citadel: PathBuf,
  base: ProfileBase,
  app_data: PathBuf,
  overlay_path: PathBuf,
}

struct InstalledMod {
  id: String,
  vpks: Vec<PathBuf>,
  key: HealthKey,
  choice: CompatibilityChoice,
}

impl InstalledMod {
  fn input(&self) -> LocalizationModInput {
    LocalizationModInput {
      mod_id: self.id.clone(),
      vpks: self.vpks.clone(),
    }
  }
}

impl ModManager {
  pub fn mod_health_context(
    &self,
    profile_folder: Option<&str>,
  ) -> Result<ModHealthContext, Error> {
    self.mod_health_context_in(profile_folder, self.get_app_local_data_path()?)
  }

  pub(super) fn mod_health_context_in(
    &self,
    profile_folder: Option<&str>,
    app_data: PathBuf,
  ) -> Result<ModHealthContext, Error> {
    Ok(ModHealthContext {
      citadel: self.citadel_path()?,
      base: self.get_addons_path(profile_folder)?,
      app_data,
      overlay_path: self.localization_overlay_vpk_path(profile_folder)?,
    })
  }

  /// Turns compatibility on for exactly the listed mods, clearing any earlier
  /// choice of original files, and captures what the repair package needs.
  /// Fixing is an explicit choice, so it also accepts the mods' own asset and
  /// data findings for their current files. The choices stay saved when
  /// something else still needs review. Returns `None` when the package is
  /// already current; otherwise build the plan without the lock and pass it
  /// to [`Self::finish_fix_mods`].
  pub fn begin_fix_mods(
    &mut self,
    profile_folder: Option<&str>,
    mod_ids: &[String],
  ) -> Result<Option<ModFixRefresh>, Error> {
    if self.is_game_running()? {
      return Err(Error::GameRunning);
    }
    self.write_mod_compatibility(mod_ids, true, profile_folder)?;
    let refresh = self.begin_mod_fix_refresh(profile_folder)?;
    if refresh.is_none() {
      self.apply_profile_gameinfo(profile_folder.map(str::to_owned))?;
    }
    Ok(refresh)
  }

  /// Writes the repair package from a plan built by [`ModFixRefresh::build`].
  /// Mods that changed during the build send the player to the review, which
  /// analyses them again.
  pub fn finish_fix_mods(
    &mut self,
    refresh: ModFixRefresh,
    plan: LocalizationOverlayPlan,
  ) -> Result<FixModsResult, Error> {
    if self.is_game_running()? {
      return Err(Error::GameRunning);
    }
    let profile_folder = refresh.profile_folder.clone();
    self.report_plan_stage(RepairPlanStage::WritingPackage);
    let status = match self.commit_mod_fix_refresh(refresh, plan) {
      Ok(true) => FixModsStatus::Applied,
      Ok(false) | Err(Error::ModDataReviewRequired) => FixModsStatus::ReviewRequired,
      Err(error) => return Err(error),
    };
    self.apply_profile_gameinfo(profile_folder)?;
    Ok(FixModsResult { status })
  }

  /// Fixes the listed mods in one step. `manager` is called before and after
  /// the plan build, so the slow build can run without the mod manager lock.
  pub fn fix_mods<M: DerefMut<Target = ModManager>>(
    manager: impl Fn() -> Result<M, Error>,
    profile_folder: Option<&str>,
    mod_ids: &[String],
    progress: &dyn Fn(RepairPlanProgress),
  ) -> Result<FixModsResult, Error> {
    let Some(refresh) = manager()?.begin_fix_mods(profile_folder, mod_ids)? else {
      return Ok(FixModsResult {
        status: FixModsStatus::Applied,
      });
    };
    let (refresh, plan) = refresh.build(progress)?;
    manager()?.finish_fix_mods(refresh, plan)
  }

  pub(super) fn record_launch_health(
    &self,
    profile_folder: Option<&str>,
    analysis: &LocalizationOverlayAnalysis,
  ) -> Result<(), Error> {
    let context = self.mod_health_context(profile_folder)?;
    let entries = context
      .installed()?
      .into_iter()
      .filter(|installed| analysis.compatibility_mod_ids.contains(&installed.id))
      .map(|installed| {
        let covered = localization_overlay::has_checkable_resources(&installed.input())?;
        let findings = ModFindings::from_analysis(analysis, &installed.id, covered);
        Ok((
          installed.id,
          CachedModHealth::new(installed.key, findings, ModHealthSource::Launch),
        ))
      })
      .collect::<Result<Vec<_>, Error>>()?;
    mod_health::record(
      &context.app_data,
      &context.profile_key(),
      history::version(&context.citadel),
      entries,
    )
  }
}

impl ModHealthContext {
  fn profile_key(&self) -> String {
    self.base.to_string_lossy().into_owned()
  }

  /// Every manifest mod whose files exist, enabled or not.
  fn installed(&self) -> Result<Vec<InstalledMod>, Error> {
    let game_build = history::version(&self.citadel);
    let mut installed = Vec::new();
    for (id, entry) in ProfileVpkManifest::load(&self.base)?.mods {
      let vpks = entry.file_paths(&self.base);
      if vpks.is_empty() {
        continue;
      }
      match HealthKey::stamp(&vpks, game_build, REPAIR_REVISION) {
        Ok(key) => installed.push(InstalledMod {
          id,
          vpks,
          key,
          choice: if entry.compatibility_enabled {
            CompatibilityChoice::Enabled
          } else if entry.compatibility_opted_out {
            CompatibilityChoice::OriginalFiles
          } else {
            CompatibilityChoice::Unset
          },
        }),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
      }
    }
    Ok(installed)
  }

  fn report_for(&self, health: &ProfileHealth, installed: &[InstalledMod]) -> ModHealthReport {
    let applied = self.applied_mods().unwrap_or_else(|error| {
      log::warn!("Could not verify applied compatibility repairs: {error}");
      BTreeSet::new()
    });
    health.report(
      history::version(&self.citadel),
      installed.iter().map(|installed| {
        let choice = match installed.choice {
          CompatibilityChoice::Enabled if !applied.contains(&installed.id) => {
            CompatibilityChoice::Unset
          }
          choice => choice,
        };
        (installed.id.as_str(), &installed.key, choice)
      }),
    )
  }

  fn applied_mods(&self) -> Result<BTreeSet<String>, Error> {
    let Some(receipt) = receipt::load(&self.overlay_path)? else {
      return Ok(BTreeSet::new());
    };
    let (_, _, key) = ModManager::localization_overlay_inputs_at(
      self.citadel.clone(),
      self.base.clone(),
      self.overlay_path.clone(),
    )?;
    if receipt.is_current(&key)? {
      Ok(key.compatibility_mod_ids)
    } else {
      Ok(BTreeSet::new())
    }
  }

  pub fn report(&self) -> Result<ModHealthReport, Error> {
    let installed = self.installed()?;
    Ok(self.report_for(
      &mod_health::load(&self.app_data, &self.profile_key()),
      &installed,
    ))
  }

  /// Analyses each selected mod on its own against the installed game. Without
  /// `force`, mods with a current cache entry are skipped. A mod that cannot be
  /// analysed is logged and left unchecked rather than labelled.
  ///
  /// `history_saved` runs once the check has saved newly observed game data.
  /// Every repair receipt on this install digests that data, so the caller
  /// must have the active profile's repairs rebuilt.
  pub fn check(
    &self,
    mod_ids: Option<&[String]>,
    force: bool,
    progress: impl Fn(ModHealthProgress),
    history_saved: impl FnOnce(),
  ) -> Result<ModHealthReport, Error> {
    let _running = CHECK_LOCK.lock().unwrap_or_else(|error| error.into_inner());
    let profile = self.profile_key();
    let installed = self.installed()?;
    let cached = mod_health::load(&self.app_data, &profile);
    let pending: Vec<_> = installed
      .iter()
      .filter(|installed| mod_ids.is_none_or(|ids| ids.contains(&installed.id)))
      .filter(|installed| force || !cached.is_current(&installed.id, &installed.key))
      .collect();
    let total = pending.len() as u32;
    progress(ModHealthProgress { checked: 0, total });
    if pending.is_empty() {
      return Ok(self.report_for(&cached, &installed));
    }
    let game_build = history::version(&self.citadel);
    let game = Arc::new(GameIndex::open(&self.citadel)?);
    let mut observed = history::load(&self.citadel);
    let mut recorded = BTreeSet::new();
    let mut learned = false;
    let mut entries = Vec::with_capacity(pending.len());
    for (index, installed) in pending.into_iter().enumerate() {
      match check_mod(&game, installed, &mut observed, game_build, &mut recorded) {
        Ok((findings, changed)) => {
          learned |= changed;
          entries.push((
            installed.id.clone(),
            CachedModHealth::new(installed.key.clone(), findings, ModHealthSource::Standalone),
          ));
        }
        Err(error) => log::warn!(
          "Skipped compatibility check for mod {}: {error}",
          installed.id
        ),
      }
      progress(ModHealthProgress {
        checked: index as u32 + 1,
        total,
      });
    }
    // Persist the batch once instead of reading and rewriting the whole cache
    // for each mod. Progress events still describe every completed analysis.
    if !entries.is_empty() {
      mod_health::record(&self.app_data, &profile, game_build, entries)?;
    }
    if learned {
      match history::save(&self.citadel, &observed) {
        Ok(()) => history_saved(),
        Err(error) => log::warn!("Could not persist observed compatibility history: {error}"),
      }
    }
    self.report()
  }
}

fn check_mod(
  game: &Arc<GameIndex>,
  installed: &InstalledMod,
  observed: &mut VdataHistoryIndex,
  game_build: Option<u32>,
  recorded: &mut BTreeSet<String>,
) -> Result<(ModFindings, bool), Error> {
  let input = installed.input();
  if !localization_overlay::has_checkable_resources(&input)? {
    return Ok((ModFindings::uncovered(), false));
  }
  let (plan, changed) =
    LocalizationOverlayPlan::build_standalone(game, input, observed, game_build, recorded)?;
  Ok((
    ModFindings::from_analysis(&plan.analysis, &installed.id, true),
    changed,
  ))
}

#[cfg(test)]
mod tests {
  use super::super::tests::write_vpk;
  use super::*;
  use crate::mod_manager::mod_health::ModHealthStatus;
  use crate::mod_manager::vpk_manifest::ProfileVpkManifestEntry;

  fn status(report: &ModHealthReport, mod_id: &str) -> Option<ModHealthStatus> {
    report
      .mods
      .iter()
      .find(|health| health.mod_id == mod_id)
      .map(|health| health.status)
  }

  #[test]
  fn checks_enabled_and_disabled_mods_once_until_their_files_change() {
    let temp = tempfile::tempdir().unwrap();
    let citadel = temp.path().join("game/citadel");
    fs::create_dir_all(&citadel).unwrap();
    fs::write(citadel.join("steam.inf"), b"ClientVersion=100\n").unwrap();
    let base = ProfileBase::new(citadel.join("addons")).unwrap();
    write_vpk(
      &base.join("pak01_dir.vpk"),
      &[("sounds/a.vsnd_c", b"sound")],
    );
    write_vpk(
      &base.join("text_pak02_dir.vpk"),
      &[(
        "resource/localization/custom/custom_english.txt",
        b"\"lang\"\n{\n\"Language\" \"English\"\n\"Tokens\"\n{\n\"custom_token\" \"Hello\"\n}\n}\n",
      )],
    );
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "sounds",
      vec!["pak01_dir.vpk".into()],
      vec![],
      None,
      ShardIndex::FIRST,
    );
    manifest.mods.insert(
      "text".into(),
      ProfileVpkManifestEntry {
        disabled_vpks: vec!["text_pak02_dir.vpk".into()],
        ..Default::default()
      },
    );
    manifest.mods.insert(
      "deleted".into(),
      ProfileVpkManifestEntry {
        disabled_vpks: vec!["deleted_pak03_dir.vpk".into()],
        ..Default::default()
      },
    );
    manifest.save(&base).unwrap();
    let context = ModHealthContext {
      citadel,
      base: base.clone(),
      app_data: temp.path().join("app-data"),
      overlay_path: temp
        .path()
        .join("game/citadel/dmm_localization_default")
        .join(OVERLAY_VPK_NAME),
    };
    assert!(context.report().unwrap().mods.is_empty());

    let progress = Mutex::new(Vec::new());
    let record = |update: ModHealthProgress| progress.lock().unwrap().push(update);
    let report = context.check(None, false, record, || {}).unwrap();
    assert_eq!(report.game_build, Some(100));
    assert_eq!(status(&report, "sounds"), Some(ModHealthStatus::NotCovered));
    assert_eq!(status(&report, "text"), Some(ModHealthStatus::Works));
    assert_eq!(status(&report, "deleted"), None);
    assert_eq!(
      progress.lock().unwrap().last(),
      Some(&ModHealthProgress {
        checked: 2,
        total: 2
      })
    );
    assert_eq!(context.report().unwrap(), report);

    progress.lock().unwrap().clear();
    context.check(None, false, record, || {}).unwrap();
    assert_eq!(
      *progress.lock().unwrap(),
      [ModHealthProgress {
        checked: 0,
        total: 0
      }]
    );

    write_vpk(
      &base.join("pak01_dir.vpk"),
      &[("sounds/b.vsnd_c", b"changed sound")],
    );
    assert_eq!(status(&context.report().unwrap(), "sounds"), None);
    progress.lock().unwrap().clear();
    context
      .check(
        Some(&["sounds".into(), "text".into()]),
        false,
        record,
        || {},
      )
      .unwrap();
    assert_eq!(progress.lock().unwrap()[0].total, 1);

    progress.lock().unwrap().clear();
    context
      .check(Some(&["text".into()]), true, record, || {})
      .unwrap();
    assert_eq!(progress.lock().unwrap()[0].total, 1);

    fs::write(context.citadel.join("steam.inf"), b"ClientVersion=101\n").unwrap();
    let report = context.report().unwrap();
    assert!(report.mods.is_empty());
    assert_eq!(report.previous_game_build, Some(100));
    let report = context.check(None, false, |_| {}, || {}).unwrap();
    assert_eq!(report.mods.len(), 2);
    assert_eq!(report.game_build, Some(101));
    assert_eq!(report.previous_game_build, Some(100));
  }
  // A compiled KV3 table (four rows of `{ value: i }`), encoded by
  // `compiled_resource` in the localization_overlay tests.
  const DATA_TABLE_HEX: &str = "eb0000000c0000000800000001000000444154410c000000cb000000000000000433564b000000000000000000000000000000000000000000000000000000000e0000000200000037000000000000008300000083000000000000000000000000000000000000000500000004000000000000000100000001000000020000000100000001000000030000000100000001000000040000000100000001000000020000000000000003000000000000006532655f726f775f300076616c7565006532655f726f775f31006532655f726f775f32006532655f726f775f330009090f09100903090300ddeeff";

  /// Removes this install's observed history from the real cache folder.
  struct RemoveHistory(PathBuf);

  impl Drop for RemoveHistory {
    fn drop(&mut self) {
      if let Some(installation) = self.0.parent() {
        fs::remove_dir_all(installation).ok();
      }
    }
  }

  #[test]
  fn signals_only_when_it_saves_newly_observed_game_data() {
    let temp = tempfile::tempdir().unwrap();
    let citadel = temp.path().join("game/citadel");
    fs::create_dir_all(&citadel).unwrap();
    fs::write(citadel.join("steam.inf"), b"ClientVersion=100\n").unwrap();
    let table = hex::decode(DATA_TABLE_HEX).unwrap();
    let table_path = "scripts/e2e_status.vdata_c";
    write_vpk(&citadel.join("pak01_dir.vpk"), &[(table_path, &table)]);
    let base = ProfileBase::new(citadel.join("addons")).unwrap();
    write_vpk(&base.join("pak01_dir.vpk"), &[(table_path, &table)]);
    let mut manifest = ProfileVpkManifest::default();
    manifest.mark_enabled(
      "data",
      vec!["pak01_dir.vpk".into()],
      vec![],
      None,
      ShardIndex::FIRST,
    );
    manifest.save(&base).unwrap();
    let history = history::path(&citadel).unwrap();
    let _cleanup = RemoveHistory(history.clone());
    let context = ModHealthContext {
      citadel,
      base,
      app_data: temp.path().join("app-data"),
      overlay_path: temp
        .path()
        .join("game/citadel/dmm_localization_default")
        .join(OVERLAY_VPK_NAME),
    };
    let saved = std::cell::Cell::new(0);
    let check = || {
      context
        .check(None, true, |_| {}, || saved.set(saved.get() + 1))
        .unwrap()
    };

    check();
    assert_eq!(saved.get(), 1, "learning the game's table saves history");
    assert!(history.is_file());

    check();
    assert_eq!(saved.get(), 1, "the same table is already known");

    // History can't be saved over a directory, so nothing was saved and the
    // check must not report a change.
    fs::remove_file(&history).unwrap();
    fs::create_dir(&history).unwrap();
    check();
    assert_eq!(saved.get(), 1, "a failed save is not a history change");
  }

  #[test]
  fn a_failed_mod_does_not_discard_successful_batch_results() {
    let temp = tempfile::tempdir().unwrap();
    let citadel = temp.path().join("citadel");
    fs::create_dir_all(&citadel).unwrap();
    let base = ProfileBase::new(citadel.join("addons")).unwrap();
    write_vpk(&base.join("good_dir.vpk"), &[("sounds/a.vsnd_c", b"sound")]);
    fs::write(base.join("bad_dir.vpk"), b"broken archive").unwrap();
    let mut manifest = ProfileVpkManifest::default();
    for id in ["good", "bad"] {
      manifest.mods.insert(
        id.into(),
        ProfileVpkManifestEntry {
          disabled_vpks: vec![format!("{id}_dir.vpk")],
          ..Default::default()
        },
      );
    }
    manifest.save(&base).unwrap();
    let context = ModHealthContext {
      citadel,
      base,
      app_data: temp.path().join("app-data"),
      overlay_path: temp
        .path()
        .join("dmm_localization_default")
        .join(OVERLAY_VPK_NAME),
    };
    let progress = Mutex::new(Vec::new());
    let report = context
      .check(
        None,
        false,
        |event| progress.lock().unwrap().push(event),
        || {},
      )
      .unwrap();
    assert_eq!(status(&report, "good"), Some(ModHealthStatus::NotCovered));
    assert_eq!(status(&report, "bad"), None);
    assert_eq!(context.report().unwrap(), report);
    assert_eq!(
      progress.lock().unwrap().last(),
      Some(&ModHealthProgress {
        checked: 2,
        total: 2
      })
    );
  }
}
