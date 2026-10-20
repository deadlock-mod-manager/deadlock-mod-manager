use super::receipt::REPAIR_REVISION;
use super::*;
use crate::mod_manager::localization_overlay::{self, GameIndex};
use crate::mod_manager::mod_health::{
  self, CachedModHealth, CompatibilityChoice, FixModsResult, FixModsStatus, HealthKey, ModFindings,
  ModHealthProgress, ModHealthReport, ModHealthSource, ProfileHealth,
};
use crate::mod_manager::vdata_history::VdataHistoryIndex;
use std::collections::BTreeSet;
use std::sync::Arc;

static CHECK_LOCK: Mutex<()> = Mutex::new(());

/// Paths needed to check a profile's mods without holding the mod manager.
pub struct ModHealthContext {
  citadel: PathBuf,
  base: ProfileBase,
  app_data: PathBuf,
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
    })
  }

  /// Turns compatibility on for exactly the listed mods, clearing any earlier
  /// choice of original files, and prepares the overlay the way launch does.
  /// Fixing is an explicit choice, so it also accepts the mods' own asset and
  /// data findings for their current files. The choices stay saved when
  /// something else still needs review.
  pub fn fix_mods(
    &mut self,
    profile_folder: Option<String>,
    mod_ids: Vec<String>,
  ) -> Result<FixModsResult, Error> {
    if self.is_game_running()? {
      return Err(Error::GameRunning);
    }
    self.write_mod_compatibility(&mod_ids, true, profile_folder.as_deref())?;
    let status = match self.ensure_localization_overlay_for_launch(profile_folder.as_deref()) {
      Ok(()) => FixModsStatus::Applied,
      Err(Error::ModDataReviewRequired) => FixModsStatus::ReviewRequired,
      Err(error) => return Err(error),
    };
    self.apply_profile_gameinfo(profile_folder)?;
    Ok(FixModsResult { status })
  }

  /// Rebuilds the repair package that installing, enabling, disabling or
  /// reordering a mod deleted, so fixed mods keep their repairs when the game
  /// starts outside the manager. gameinfo.gi keeps the package's search path
  /// through those changes, so it is left as is. While the game runs, or when
  /// the rebuild needs review, launch prepares the package instead.
  pub fn refresh_mod_fixes(&mut self, profile_folder: Option<&str>) -> Result<(), Error> {
    if self.is_game_running()? {
      return Ok(());
    }
    match self.ensure_localization_overlay_for_launch(profile_folder) {
      Err(Error::ModDataReviewRequired) => {
        log::info!("Repair package needs review; launch will prepare it");
        Ok(())
      }
      result => result,
    }
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
    health.report(
      history::version(&self.citadel),
      installed
        .iter()
        .map(|installed| (installed.id.as_str(), &installed.key, installed.choice)),
    )
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
  pub fn check(
    &self,
    mod_ids: Option<&[String]>,
    force: bool,
    progress: impl Fn(ModHealthProgress),
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
    if learned && let Err(error) = history::save(&self.citadel, &observed) {
      log::warn!("Could not persist observed compatibility history: {error}");
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
    };
    assert!(context.report().unwrap().mods.is_empty());

    let progress = Mutex::new(Vec::new());
    let record = |update: ModHealthProgress| progress.lock().unwrap().push(update);
    let report = context.check(None, false, record).unwrap();
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
    context.check(None, false, record).unwrap();
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
      .check(Some(&["sounds".into(), "text".into()]), false, record)
      .unwrap();
    assert_eq!(progress.lock().unwrap()[0].total, 1);

    progress.lock().unwrap().clear();
    context.check(Some(&["text".into()]), true, record).unwrap();
    assert_eq!(progress.lock().unwrap()[0].total, 1);

    fs::write(context.citadel.join("steam.inf"), b"ClientVersion=101\n").unwrap();
    let report = context.report().unwrap();
    assert!(report.mods.is_empty());
    assert_eq!(report.previous_game_build, Some(100));
    let report = context.check(None, false, |_| {}).unwrap();
    assert_eq!(report.mods.len(), 2);
    assert_eq!(report.game_build, Some(101));
    assert_eq!(report.previous_game_build, Some(100));
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
    };
    let progress = Mutex::new(Vec::new());
    let report = context
      .check(None, false, |event| progress.lock().unwrap().push(event))
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
