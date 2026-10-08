//! Status, preview, apply, remove and re-apply, composed from the other modules.
//!
//! Every write: read the file, build the new text, verify it parses and strips
//! back to the base, then write atomically (temp file + rename) after checking
//! the file didn't change since it was read. Errors here are never
//! `GameConfigParse`: on the launch path that variant triggers a full reset to
//! vanilla.

use std::fs;
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};

use super::catalog::Catalog;
use super::live::LiveGameinfo;
use super::patch::{self, OverlayPlan};
use super::resolve::{self, ResolveOptions};
use super::types::{
  CatalogSummary, CommunityConfigSummary, DesiredOverlay, EntryStatus, PerfApplyRequest,
  PerfApplyResult, PerfConfigSource, PerfStatus, PresetSourceInfo, PresetSummary, ResolvedConfig,
};
use super::{gameinfo_path, store};
use crate::errors::Error;

pub struct PerfContext<'a> {
  pub game_path: Option<&'a Path>,
  pub app_data_dir: &'a Path,
  pub catalog: &'a Catalog,
  /// The game's [`client_version`](super::client_version), the build number
  /// the catalog uses; not Steam's build id.
  pub build_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReapplyOutcome {
  NothingDesired,
  AlreadyInSync,
  Applied,
  /// Nothing is chosen but the file carried an overlay (a backup restored
  /// after an apply, a lost choice), so it was removed.
  RemovedOrphan,
  Failed(String),
}

/// `in_sync` compares revisions. A config with nothing to write leaves the
/// file without an overlay, so for it "no overlay" is the synced state.
pub fn status(ctx: &PerfContext) -> Result<PerfStatus, Error> {
  let desired = store::load(ctx.app_data_dir);
  let text = match ctx.game_path {
    Some(game_path) => read_if_exists(&gameinfo_path(game_path))?,
    None => None,
  };
  let applied = text.as_deref().and_then(patch::read_overlay);
  let foreign = text
    .as_deref()
    .map(patch::detect_foreign)
    .unwrap_or_default();
  let in_sync = match (&desired, &applied) {
    (Some(desired), Some(applied)) => desired.rev == applied.rev,
    (Some(desired), None) => text.is_some() && desired.counts.applies == 0,
    _ => false,
  };
  Ok(PerfStatus {
    game_path_set: ctx.game_path.is_some(),
    gameinfo_found: text.is_some(),
    desired,
    applied,
    in_sync,
    foreign,
    build_id: ctx.build_id.clone(),
  })
}

/// What applying `request` would write, without writing it.
pub fn preview(ctx: &PerfContext, request: &PerfApplyRequest) -> Result<ResolvedConfig, Error> {
  let entries = resolve::entries_for_source(ctx.catalog, &request.source)?;
  let live = live_gameinfo(ctx)?;
  Ok(resolve::resolve(
    ctx.catalog,
    &entries,
    &live,
    &resolve_options(request),
  ))
}

/// Replaces whatever overlay the file carries with `request`'s and remembers
/// `request` as the desired config. When nothing in the config changes the
/// live file, the file is left without an overlay but the choice is still
/// saved, so a later game update that makes it relevant re-applies it.
pub fn apply(
  ctx: &PerfContext,
  request: PerfApplyRequest,
  remove_foreign: bool,
) -> Result<PerfApplyResult, Error> {
  let path = existing_gameinfo(ctx)?;
  let original = fs::read_to_string(&path)?;
  let (mut base, _) = patch::strip_overlay(&original);
  let mut removed_foreign = Vec::new();
  if remove_foreign {
    (base, removed_foreign) = patch::strip_foreign(&base);
  }

  let live = LiveGameinfo::parse(&base)?;
  let entries = resolve::entries_for_source(ctx.catalog, &request.source)?;
  let resolved = resolve::resolve(ctx.catalog, &entries, &live, &resolve_options(&request));
  let plan = OverlayPlan {
    config_id: &request.config_id,
    name: &request.name,
    rev: &resolved.rev,
    entries: resolved
      .entries
      .iter()
      .filter(|entry| entry.status == EntryStatus::Applies)
      .collect(),
    credits: credits(ctx.catalog, &request.source),
  };
  let updated = if plan.entries.is_empty() {
    base
  } else {
    patch::apply_overlay(&base, &plan)?
  };

  let desired = DesiredOverlay {
    request,
    rev: resolved.rev.clone(),
    applied_at: chrono::Utc::now().to_rfc3339(),
    counts: resolved.counts.clone(),
  };
  save_choice_then(ctx.app_data_dir, &desired, || {
    if updated == original {
      Ok(())
    } else {
      write_gameinfo(&path, &original, &updated)
    }
  })?;

  Ok(PerfApplyResult {
    status: status(ctx)?,
    resolved,
    removed_foreign,
  })
}

/// Removes our overlay from the file and forgets the desired config.
///
/// Without a game folder this fails and keeps the choice: forgetting it would
/// leave its overlay in a file we can't reach, with nothing left that says
/// what wrote it.
pub fn remove(ctx: &PerfContext) -> Result<PerfStatus, Error> {
  let path = gameinfo_path(game_folder(ctx)?);
  if let Some(original) = read_if_exists(&path)? {
    write_stripped(&path, &original)?;
  }
  store::clear(ctx.app_data_dir)?;
  status(ctx)
}

/// What a re-apply does with lines edited by hand since the overlay was written.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HandEdits {
  /// Leave the file alone while the config itself is unchanged (launches).
  Keep,
  /// Always write the overlay again (the user's "Re-apply now").
  Overwrite,
}

/// Writes the desired overlay again if the file lost it, or removes an
/// overlay when nothing is desired. Used on launch, so it never fails the
/// launch: problems come back as `Failed`.
///
/// The desired request is resolved against the file as it is now and compared
/// with the revision the file's marker carries, so a game update that changed
/// stock values or a catalog update that blocked a convar also re-applies.
pub fn reapply_desired(ctx: &PerfContext, hand_edits: HandEdits) -> ReapplyOutcome {
  let reapply = || -> Result<ReapplyOutcome, Error> {
    let Some(desired) = store::load(ctx.app_data_dir) else {
      return remove_orphan(ctx);
    };
    let path = existing_gameinfo(ctx)?;
    let text = fs::read_to_string(&path)?;
    let applied = patch::read_overlay(&text);
    let marker_id = patch::marker_config_id(&desired.request.config_id);
    let carries_desired = applied
      .as_ref()
      .is_some_and(|applied| applied.config_id == marker_id);

    let resolved = match resolve::entries_for_source(ctx.catalog, &desired.request.source) {
      Ok(entries) => {
        let live = LiveGameinfo::parse(&text)?;
        resolve::resolve(
          ctx.catalog,
          &entries,
          &live,
          &resolve_options(&desired.request),
        )
      }
      Err(error) => {
        let unchanged = carries_desired
          && applied
            .as_ref()
            .is_some_and(|applied| applied.rev == desired.rev);
        return if unchanged {
          Ok(ReapplyOutcome::AlreadyInSync)
        } else {
          Err(error)
        };
      }
    };
    let in_sync = match &applied {
      Some(applied) => carries_desired && applied.rev == resolved.rev,
      None => resolved.counts.applies == 0,
    };
    if in_sync && hand_edits == HandEdits::Keep {
      return Ok(ReapplyOutcome::AlreadyInSync);
    }
    apply(ctx, desired.request, false)?;
    Ok(ReapplyOutcome::Applied)
  };
  reapply().unwrap_or_else(|error| ReapplyOutcome::Failed(error.to_string()))
}

fn remove_orphan(ctx: &PerfContext) -> Result<ReapplyOutcome, Error> {
  let Some(game_path) = ctx.game_path else {
    return Ok(ReapplyOutcome::NothingDesired);
  };
  let path = gameinfo_path(game_path);
  let Some(text) = read_if_exists(&path)? else {
    return Ok(ReapplyOutcome::NothingDesired);
  };
  if patch::read_overlay(&text).is_none() {
    return Ok(ReapplyOutcome::NothingDesired);
  }
  write_stripped(&path, &text)?;
  Ok(ReapplyOutcome::RemovedOrphan)
}

/// The catalog with preset counts and scale positions computed against the
/// live file (or the catalog's latest stock when the game isn't set up).
pub fn catalog_summary(ctx: &PerfContext) -> Result<CatalogSummary, Error> {
  let catalog = ctx.catalog;
  let live = live_gameinfo(ctx).unwrap_or_else(|error| {
    log::warn!("Scoring performance presets against stock gameinfo.gi: {error}");
    LiveGameinfo::latest_stock(catalog)
  });
  let options = ResolveOptions {
    overrides: &[],
    include_engine_sections: false,
  };
  let presets = catalog
    .presets()
    .iter()
    .map(|preset| {
      let resolved = resolve::resolve(catalog, &preset.entries, &live, &options);
      PresetSummary {
        id: preset.id.clone(),
        name: preset.name.clone(),
        author: preset.author.clone(),
        tier: preset.tier,
        blurb: preset.blurb.clone(),
        highlights: preset.highlights.clone(),
        recommended: preset.recommended,
        version: preset.version.clone(),
        updated_at: preset.updated_at.clone(),
        base_build: preset.base_build,
        source: preset.source.clone(),
        video_settings: preset.video_settings.clone(),
        notes: preset.notes.clone(),
        counts: resolved.counts,
        cut_score: resolved.cut_score,
      }
    })
    .collect();
  let community = catalog
    .community()
    .iter()
    .map(|config| CommunityConfigSummary {
      id: config.id.clone(),
      gamebanana_id: config.gamebanana_id,
      name: config.name.clone(),
      author: config.author.clone(),
      downloads: config.downloads,
      updated_at: config.updated_at.clone(),
      tier: config.tier,
      blurb: config.blurb.clone(),
      base_build: config.base_build,
      file_id: config.file_id,
      variant_hint: config.variant_hint.clone(),
      settings_count: config.settings_count,
      engine_edit_count: config.engine_edit_count,
      cut_score: resolve::cut_score_from_category_counts(catalog, &config.category_counts),
    })
    .collect();
  Ok(CatalogSummary {
    version: catalog.version().to_string(),
    generated_at: catalog.file.generated_at.clone(),
    origin: catalog.origin,
    latest_build: catalog.file.latest_build,
    convar_build: catalog.file.convar_build,
    categories: catalog.categories().to_vec(),
    guarded_sections: catalog.rules().guarded_sections.clone(),
    presets,
    community,
  })
}

fn resolve_options(request: &PerfApplyRequest) -> ResolveOptions<'_> {
  ResolveOptions {
    overrides: &request.overrides,
    include_engine_sections: request.include_engine_sections,
  }
}

fn read_if_exists(path: &Path) -> Result<Option<String>, Error> {
  match fs::read_to_string(path) {
    Ok(text) => Ok(Some(text)),
    Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
    Err(error) => Err(error.into()),
  }
}

fn game_folder<'a>(ctx: &PerfContext<'a>) -> Result<&'a Path, Error> {
  ctx
    .game_path
    .ok_or_else(|| Error::PerformanceConfig("The Deadlock folder isn't set".into()))
}

fn existing_gameinfo(ctx: &PerfContext) -> Result<PathBuf, Error> {
  let path = gameinfo_path(game_folder(ctx)?);
  if !path.is_file() {
    return Err(Error::PerformanceConfig(format!(
      "gameinfo.gi not found at {}",
      path.display()
    )));
  }
  Ok(path)
}

/// The live file, or the catalog's newest stock file when there is none.
fn live_gameinfo(ctx: &PerfContext) -> Result<LiveGameinfo, Error> {
  if let Some(game_path) = ctx.game_path
    && let Some(text) = read_if_exists(&gameinfo_path(game_path))?
  {
    return LiveGameinfo::parse(&text);
  }
  Ok(LiveGameinfo::latest_stock(ctx.catalog))
}

fn credits(catalog: &Catalog, source: &PerfConfigSource) -> Vec<String> {
  let mut credits = Vec::new();
  if let PerfConfigSource::Preset { id } = source
    && let Some(preset) = catalog.preset(id)
  {
    match &preset.source {
      PresetSourceInfo::Github {
        url,
        commit,
        license,
        ..
      } => {
        credits.push(format!("values by {} ({license})", preset.author));
        let commit = commit.get(..12).unwrap_or(commit);
        credits.push(format!("{url} @ {commit}"));
      }
      PresetSourceInfo::Bundled => credits.push(format!("values by {}", preset.author)),
    }
  }
  credits.push("change or remove it on the Performance page of Deadlock Mod Manager".to_string());
  credits
}

/// Saves `desired`, then runs `write`, putting the previous choice back if
/// `write` fails. Saving first means that if the app dies in between, the next
/// launch re-applies the new choice instead of reverting to the old one.
fn save_choice_then(
  app_data_dir: &Path,
  desired: &DesiredOverlay,
  write: impl FnOnce() -> Result<(), Error>,
) -> Result<(), Error> {
  let previous = store::load(app_data_dir);
  store::save(app_data_dir, desired)?;
  let Err(error) = write() else {
    return Ok(());
  };
  let rollback = match &previous {
    Some(previous) => store::save(app_data_dir, previous),
    None => store::clear(app_data_dir),
  };
  if let Err(rollback_error) = rollback {
    log::error!(
      "Could not restore the saved performance config after failing to write gameinfo.gi: {rollback_error}"
    );
  }
  Err(error)
}

/// Writes `original` without our overlay, once the result parses and kept
/// every brace.
fn write_stripped(path: &Path, original: &str) -> Result<(), Error> {
  let (stripped, _) = patch::strip_overlay(original);
  if stripped == original {
    return Ok(());
  }
  patch::verify_stripped(original, &stripped)?;
  write_gameinfo(path, original, &stripped)
}

/// Writes `updated` through a temp file in the same folder, after checking the
/// file still holds `expected`: Steam, the user or another tool may have
/// written it since we read it.
fn write_gameinfo(path: &Path, expected: &str, updated: &str) -> Result<(), Error> {
  if fs::read_to_string(path)? != expected {
    return Err(Error::PerformanceConfig(
      "gameinfo.gi changed while the performance config was being written; try again".into(),
    ));
  }
  // Renaming over a symlink would replace the link with a regular file, so a
  // linked gameinfo.gi is written at its target.
  let target = if fs::symlink_metadata(path)?.file_type().is_symlink() {
    fs::canonicalize(path)?
  } else {
    path.to_path_buf()
  };
  let dir = target
    .parent()
    .ok_or_else(|| Error::FileWriteFailed(format!("{} has no folder", target.display())))?;
  let mut temp = tempfile::NamedTempFile::new_in(dir)?;
  temp.write_all(updated.as_bytes())?;
  temp.as_file().sync_all()?;
  #[cfg(unix)]
  temp
    .as_file()
    .set_permissions(fs::metadata(&target)?.permissions())?;
  temp
    .persist(&target)
    .map_err(|error| Error::FileWriteFailed(format!("{}: {}", target.display(), error.error)))?;
  Ok(())
}

#[cfg(test)]
#[path = "ops_tests.rs"]
mod tests;
