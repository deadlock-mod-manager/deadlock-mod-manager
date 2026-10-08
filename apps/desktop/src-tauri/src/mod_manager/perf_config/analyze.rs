//! The import pipeline: detect the format, find the stock build a full file was
//! built on (`PGIVersion`, else the closest stock version), keep only the
//! author's changes, and resolve them against the live file for review.
//!
//! Diffing against the file's own base rather than today's stock is what
//! keeps Valve's later changes from reading as the author's: a config built
//! on April's gameinfo.gi lacks keys Valve added since, and that absence is
//! never a removal.

use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use tokio_util::sync::CancellationToken;

use super::catalog::{Catalog, StockBuild};
use super::formats::{self, ParsedConfig, ParsedLeaf};
use super::live::{LiveGameinfo, normalize_value, path_key};
use super::resolve::{self, ResolveOptions};
use super::share;
use super::staging::{self, StagedImport};
use super::types::{
  BaseMatch, ConfigEntry, EntryOverride, IgnoredKind, IgnoredPart, ImportFormat, ImportReport,
  ImportSource, ImportVariant, VideoSetting,
};
use crate::download_manager::downloader::{PauseHandle, download_file_resumable};
use crate::errors::Error;
use crate::mod_manager::archive_extractor::ArchiveExtractor;

const MAX_TEXT_BYTES: u64 = 4 * 1024 * 1024;
const MAX_ARCHIVE_BYTES: u64 = 64 * 1024 * 1024;
/// Total unpacked size an archive may declare; config archives are a few MB.
const MAX_UNPACKED_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_IGNORED_PARTS: usize = 500;
const GAMEBANANA_DOWNLOAD_URL: &str = "https://gamebanana.com/dl/";

/// Root keys that matter even when they match stock: `PGIVersion` is how the
/// base build is found, and `DisallowGameInfoConditionals 0` is a common edit.
const NOTABLE_ROOT_KEYS: &[&str] = &["PGIVersion", "DisallowGameInfoConditionals"];

/// File names that say nothing about the config, so the folder name is used.
const GENERIC_FILE_NAMES: &[&str] = &[
  "gameinfo",
  "autoexec",
  "video",
  "config",
  "overrides",
  "rawcode",
  "convars",
];
const GENERIC_FOLDER_NAMES: &[&str] = &["citadel", "game", "cfg", "downloads", "desktop"];

#[derive(Clone)]
pub struct AnalyzeContext {
  pub catalog: Arc<Catalog>,
  pub game_path: Option<PathBuf>,
  pub app_data_dir: PathBuf,
}

pub async fn analyze(ctx: &AnalyzeContext, source: ImportSource) -> Result<ImportReport, Error> {
  if let ImportSource::GameBanana { mod_id, file_id } = source {
    return analyze_gamebanana(ctx, mod_id, file_id).await;
  }
  let ctx = ctx.clone();
  run_blocking(move || analyze_local(&ctx, source)).await
}

/// What staging needs to know about a candidate file without resolving it.
pub(super) struct VariantFacts {
  /// The file changes something relative to its base (a stock copy doesn't).
  pub has_changes: bool,
  /// Some change is in ConVars or a section the catalog has a category for,
  /// not just SearchPaths or an addon switch.
  pub performance_changes: bool,
}

pub(super) fn variant_facts(catalog: &Catalog, parsed: &ParsedConfig) -> VariantFacts {
  let draft = draft_from_parsed(catalog, parsed.clone());
  VariantFacts {
    has_changes: !draft.entries.is_empty(),
    performance_changes: draft.entries.iter().any(|entry| {
      entry.path[0].eq_ignore_ascii_case("ConVars")
        || catalog
          .file
          .section_categories
          .contains_key(&entry.path[0].to_ascii_lowercase())
    }),
  }
}

/// An import before it is resolved against the live file.
#[derive(Debug)]
struct Draft {
  format: ImportFormat,
  suggested_name: Option<String>,
  base: Option<BaseMatch>,
  entries: Vec<ConfigEntry>,
  ignored: Vec<IgnoredPart>,
  video_settings: Vec<VideoSetting>,
  warnings: Vec<String>,
  preset_id: Option<String>,
  overrides: Vec<EntryOverride>,
  include_engine_sections: bool,
}

fn analyze_local(ctx: &AnalyzeContext, source: ImportSource) -> Result<ImportReport, Error> {
  match source {
    ImportSource::Text { text, file_name } => {
      if text.len() as u64 > MAX_TEXT_BYTES {
        return Err(Error::InvalidInput(
          "The text is too large to be a config".to_string(),
        ));
      }
      let mut draft = draft_from_text(&ctx.catalog, &text, file_name.as_deref())?;
      if draft.suggested_name.is_none() {
        draft.suggested_name = file_name
          .as_deref()
          .and_then(|name| name_from_path(Path::new(name)));
      }
      Ok(finish(ctx, draft, live_gameinfo(ctx)))
    }
    ImportSource::File { path } => analyze_file(ctx, Path::new(&path), FileName::FromPath),
    ImportSource::CurrentGameinfo => analyze_current(ctx),
    ImportSource::Staged {
      staging_id,
      variant_path,
    } => {
      let staged = staging::open(&ctx.app_data_dir, &staging_id)?;
      let variant_path = Some(variant_path.as_str()).filter(|path| !path.is_empty());
      analyze_staged(ctx, &staged, variant_path, None)
    }
    ImportSource::GameBanana { .. } => Err(Error::PerformanceConfig(
      "GameBanana imports are downloaded first".to_string(),
    )),
  }
}

/// Where the suggested name of a file import comes from.
enum FileName {
  /// The user's file: its name, or its folder's for `gameinfo.gi`.
  FromPath,
  /// A download, named after the mod when the catalog knows it.
  Given(Option<String>),
}

fn analyze_file(ctx: &AnalyzeContext, path: &Path, name: FileName) -> Result<ImportReport, Error> {
  let metadata = fs::metadata(path)?;
  if !metadata.is_file() {
    return Err(Error::InvalidInput("Choose a file to import".to_string()));
  }
  if let Some(kind) = archive_kind(path)? {
    if metadata.len() > MAX_ARCHIVE_BYTES {
      return Err(Error::InvalidInput(format!(
        "The archive is larger than {} MB",
        MAX_ARCHIVE_BYTES / (1024 * 1024)
      )));
    }
    let label = match name {
      FileName::FromPath => path
        .file_stem()
        .map(|stem| stem.to_string_lossy().to_string()),
      FileName::Given(label) => label,
    };
    return analyze_archive(ctx, path, kind, label, None);
  }
  if metadata.len() > MAX_TEXT_BYTES {
    return Err(Error::InvalidInput(
      "The file is too large to be a config".to_string(),
    ));
  }
  let text = formats::decode_text(&fs::read(path)?);
  let file_name = path
    .file_name()
    .map(|name| name.to_string_lossy().to_string());
  let mut draft = draft_from_text(&ctx.catalog, &text, file_name.as_deref())?;
  if draft.suggested_name.is_none() {
    draft.suggested_name = match name {
      FileName::FromPath => name_from_path(path),
      FileName::Given(label) => label,
    };
  }
  Ok(finish(ctx, draft, live_gameinfo(ctx)))
}

fn analyze_current(ctx: &AnalyzeContext) -> Result<ImportReport, Error> {
  let game_path = ctx.game_path.as_ref().ok_or(Error::GamePathNotSet)?;
  let text = formats::decode_text(&fs::read(super::gameinfo_path(game_path))?);
  let live = LiveGameinfo::parse(&text)?;
  let draft = draft_from_text(&ctx.catalog, &live.text, Some("gameinfo.gi"))?;
  Ok(finish(ctx, draft, live))
}

async fn analyze_gamebanana(
  ctx: &AnalyzeContext,
  mod_id: u64,
  file_id: u64,
) -> Result<ImportReport, Error> {
  let community = ctx
    .catalog
    .community()
    .iter()
    .find(|config| config.gamebanana_id == mod_id);
  let label = community.map(|config| config.name.clone());
  let variant_hint = community
    .filter(|config| config.file_id == file_id)
    .and_then(|config| config.variant_hint.clone());

  let work_dir = tempfile::tempdir()?;
  let download = work_dir.path().join("download");
  download_file_resumable(
    &format!("{GAMEBANANA_DOWNLOAD_URL}{file_id}"),
    &download,
    0,
    |_| {},
    CancellationToken::new(),
    PauseHandle::new(),
    Some(MAX_ARCHIVE_BYTES),
    None,
    true,
  )
  .await?;

  let ctx = ctx.clone();
  run_blocking(move || {
    let report = match archive_kind(&download)? {
      Some(kind) => analyze_archive(&ctx, &download, kind, label, variant_hint.as_deref()),
      None => analyze_file(&ctx, &download, FileName::Given(label)),
    };
    drop(work_dir);
    report
  })
  .await
}

/// Extracts an archive (with the mod installer's path checks), stages its
/// config files and analyzes the best variant.
fn analyze_archive(
  ctx: &AnalyzeContext,
  archive_path: &Path,
  kind: &str,
  label: Option<String>,
  variant_hint: Option<&str>,
) -> Result<ImportReport, Error> {
  check_unpacked_size(archive_path, kind)?;
  let work_dir = tempfile::tempdir()?;
  // The extractor picks the format from a lower-case extension.
  let archive = if archive_path.extension().and_then(|ext| ext.to_str()) == Some(kind) {
    archive_path.to_path_buf()
  } else {
    let copy = work_dir.path().join(format!("archive.{kind}"));
    fs::copy(archive_path, &copy)?;
    copy
  };
  let extracted = work_dir.path().join("extracted");
  ArchiveExtractor::new().extract_archive(&archive, &extracted)?;
  let staged = staging::stage_import(
    &ctx.app_data_dir,
    &extracted,
    &ctx.catalog,
    label.as_deref(),
  )?
  .ok_or_else(|| {
    Error::PerformanceConfig(
      "The archive has no gameinfo.gi, ConVars snippet, cfg, overrides.gi or video.txt".to_string(),
    )
  })?;
  analyze_staged(ctx, &staged, None, variant_hint)
}

fn analyze_staged(
  ctx: &AnalyzeContext,
  staged: &StagedImport,
  variant_path: Option<&str>,
  variant_hint: Option<&str>,
) -> Result<ImportReport, Error> {
  let variant = match variant_path {
    Some(path) => staged
      .variant(path)
      .ok_or_else(|| Error::InvalidInput("That file isn't part of this import".to_string()))?,
    None => default_variant(&staged.variants, variant_hint)
      .ok_or_else(|| Error::PerformanceConfig("The archive has no config files".to_string()))?,
  };
  let text = staged.read(variant)?;
  let mut draft = draft_from_text(&ctx.catalog, &text, Some(&variant.path))?;
  if variant.format != ImportFormat::VideoTxt
    && let Some(video) = staged.companion_video(variant)
  {
    let video = formats::parse(&video, ImportFormat::VideoTxt);
    draft.video_settings = video.video_settings;
    draft.ignored.extend(
      video
        .ignored
        .into_iter()
        .filter(|part| part.kind == IgnoredKind::MachineSpecific)
        .map(|part| IgnoredPart { line: None, ..part }),
    );
  }
  let copies = staged
    .variants
    .iter()
    .filter(|variant| variant.duplicate_of.is_some())
    .count();
  if copies > 0 {
    let noun = if copies == 1 { "copy" } else { "copies" };
    draft.warnings.push(format!(
      "The archive also has {copies} translated {noun} with the same settings"
    ));
  }
  if draft.format != ImportFormat::ShareCode {
    let distinct = staged
      .variants
      .iter()
      .filter(|variant| variant.duplicate_of.is_none())
      .count();
    draft.suggested_name = match &staged.label {
      Some(label) if distinct > 1 => Some(format!("{label} – {}", variant.label)),
      Some(label) => Some(label.clone()),
      None if distinct > 1 => Some(variant.label.clone()),
      None => draft.suggested_name.or_else(|| Some(variant.label.clone())),
    };
  }
  let mut report = finish(ctx, draft, live_gameinfo(ctx));
  report.staging_id = Some(staged.id.clone());
  report.variants = staged.variants.clone();
  report.selected_variant = Some(variant.path.clone());
  Ok(report)
}

/// The catalog's hint for this archive when it names a variant (or the
/// original of the copy it names), else the best ranked variant. Variants come
/// best first with copies last.
fn default_variant<'a>(
  variants: &'a [ImportVariant],
  variant_hint: Option<&str>,
) -> Option<&'a ImportVariant> {
  let hinted = variant_hint.map(str::to_lowercase).and_then(|hint| {
    variants.iter().find(|variant| {
      let path = variant.path.to_lowercase();
      path == hint || path.ends_with(&format!("/{hint}"))
    })
  });
  let hinted = hinted.map(|variant| match &variant.duplicate_of {
    Some(original) => variants
      .iter()
      .find(|other| &other.path == original)
      .unwrap_or(variant),
    None => variant,
  });
  hinted.or_else(|| variants.first())
}

fn draft_from_text(catalog: &Catalog, text: &str, file_name: Option<&str>) -> Result<Draft, Error> {
  let format = formats::detect_format(text, file_name).ok_or_else(|| {
    Error::InvalidInput(
      "This isn't a gameinfo.gi, ConVars block, cfg, overrides.gi, video.txt or share code"
        .to_string(),
    )
  })?;
  match format {
    ImportFormat::ShareCode => draft_from_share(catalog, text),
    ImportFormat::Archive => Err(Error::InvalidInput("Import archives as a file".to_string())),
    format => Ok(draft_from_parsed(catalog, formats::parse(text, format))),
  }
}

fn draft_from_share(catalog: &Catalog, text: &str) -> Result<Draft, Error> {
  let share = share::decode(text)?;
  let mut warnings = Vec::new();
  let entries = match &share.preset_id {
    Some(id) => match catalog.preset(id) {
      Some(preset) => preset.entries.clone(),
      None => {
        warnings.push(format!(
          "The preset \"{id}\" isn't in this version of the catalog"
        ));
        Vec::new()
      }
    },
    None => share.entries,
  };
  Ok(Draft {
    format: ImportFormat::ShareCode,
    suggested_name: Some(share.name).filter(|name| !name.is_empty()),
    base: None,
    entries,
    ignored: Vec::new(),
    video_settings: Vec::new(),
    warnings,
    preset_id: share.preset_id,
    overrides: share.overrides,
    include_engine_sections: share.include_engine_sections,
  })
}

/// Keeps the author's changes: every entry for a snippet, cfg or overrides
/// file; for a full gameinfo.gi only what differs from its base build.
/// SearchPaths, list sections, root keys and editor-only sections are never
/// imported and are reported instead.
fn draft_from_parsed(catalog: &Catalog, parsed: ParsedConfig) -> Draft {
  let mut ignored = parsed.ignored;
  let mut warnings = Vec::new();
  if parsed.unreadable_lines > 0 {
    warnings.push(format!(
      "{} lines couldn't be read and were skipped",
      parsed.unreadable_lines
    ));
  }

  let base = if parsed.format == ImportFormat::FullGameinfo {
    find_base(catalog, &parsed.leaves, &mut warnings)
  } else {
    None
  };
  let (kept, excluded): (Vec<ParsedLeaf>, Vec<ParsedLeaf>) = parsed
    .leaves
    .into_iter()
    .partition(|leaf| leaf.path.len() > 1 && catalog.excluded_section(&leaf.path).is_none());
  let (effective, duplicates) = formats::collapse(&kept);
  ignored.extend(duplicates);
  ignored.extend(excluded_parts(catalog, &excluded, base.as_ref()));
  let entries = match &base {
    Some(base) => effective
      .into_iter()
      .filter(|entry| base.differs(&entry.path, entry.value.as_deref()))
      .collect(),
    None => effective,
  };

  if let Some(base) = &base
    && catalog
      .stock_builds()
      .iter()
      .any(|stock| stock.build > base.build.build)
  {
    warnings.push(format!(
      "Built for game build {} ({}); only the author's changes to that version are kept",
      base.build.build, base.build.date
    ));
  }
  ignored.sort_by_key(|part| part.line.unwrap_or(u32::MAX));
  if ignored.len() > MAX_IGNORED_PARTS {
    warnings.push(format!(
      "{} more lines aren't listed",
      ignored.len() - MAX_IGNORED_PARTS
    ));
    ignored.truncate(MAX_IGNORED_PARTS);
  }

  Draft {
    format: parsed.format,
    suggested_name: None,
    base: base.map(|base| base.matched),
    entries,
    ignored,
    video_settings: parsed.video_settings,
    warnings,
    preset_id: None,
    overrides: Vec::new(),
    include_engine_sections: false,
  }
}

/// The stock gameinfo.gi a full file was made from.
struct Base<'a> {
  build: &'a StockBuild,
  matched: BaseMatch,
  /// Every normalized stock value by path key.
  values: HashMap<String, String>,
}

impl Base<'_> {
  /// The file sets a value the base doesn't have. A comment-out is always a
  /// change; a key the file lacks never is.
  fn differs(&self, path: &[String], value: Option<&str>) -> bool {
    match value {
      Some(value) => self.values.get(&path_key(path)) != Some(&normalize_value(value)),
      None => true,
    }
  }
}

/// `PGIVersion` names the stock file exactly (several builds can share one,
/// so the closest of those wins). Without it, the stock build whose values
/// the file keeps best: distance counts stock values the file changes or
/// lacks, over ConVars and the engine sections (root keys and excluded
/// sections left out on both sides), and ties go to the newer build, because
/// a newer build only adds keys an older file would lack.
fn find_base<'a>(
  catalog: &'a Catalog,
  leaves: &[ParsedLeaf],
  warnings: &mut Vec<String>,
) -> Option<Base<'a>> {
  let mut file_values: HashMap<String, String> = HashMap::new();
  for leaf in leaves {
    if let Some(value) = &leaf.value {
      file_values.insert(path_key(&leaf.path), normalize_value(value));
    }
  }
  let pgi_version = leaves
    .iter()
    .rev()
    .find(|leaf| leaf.path.len() == 1 && leaf.path[0].eq_ignore_ascii_case("PGIVersion"))
    .and_then(|leaf| leaf.value.as_deref());

  let scored: Vec<(&StockBuild, u32)> = catalog
    .stock_builds()
    .iter()
    .map(|build| {
      let distance = build
        .entries
        .iter()
        .filter(|entry| entry.path.len() > 1 && catalog.excluded_section(&entry.path).is_none())
        .filter_map(|entry| {
          Some((
            path_key(&entry.path),
            normalize_value(entry.value.as_deref()?),
          ))
        })
        .filter(|(key, value)| file_values.get(key) != Some(value))
        .count() as u32;
      (build, distance)
    })
    .collect();
  let closest = |exact: bool| {
    scored
      .iter()
      .filter(|(build, _)| {
        !exact
          || build
            .pgi_version
            .as_deref()
            .zip(pgi_version)
            .is_some_and(|(stock, file)| stock.eq_ignore_ascii_case(file.trim()))
      })
      .min_by(|a, b| a.1.cmp(&b.1).then_with(|| b.0.build.cmp(&a.0.build)))
  };

  let (build, distance, exact) = match closest(true) {
    Some((build, _)) => (*build, 0, true),
    None => {
      let (build, distance) = closest(false)?;
      if pgi_version.is_some() {
        warnings.push(
          "Its PGIVersion doesn't match a stock build we know; compared with the closest one"
            .to_string(),
        );
      }
      (*build, *distance, false)
    }
  };
  let values = build
    .entries
    .iter()
    .filter_map(|entry| {
      Some((
        path_key(&entry.path),
        normalize_value(entry.value.as_deref()?),
      ))
    })
    .collect();
  Some(Base {
    build,
    matched: BaseMatch {
      build: build.build,
      date: build.date.clone(),
      exact,
      distance,
    },
    values,
  })
}

/// One part per excluded section or root key the file sets. SearchPaths and
/// list sections are always reported (configs ship the author's own mounts);
/// editor sections and root keys only when they differ from the base, apart
/// from the root keys every config tool cares about.
fn excluded_parts(
  catalog: &Catalog,
  leaves: &[ParsedLeaf],
  base: Option<&Base>,
) -> Vec<IgnoredPart> {
  let mut parts: Vec<IgnoredPart> = Vec::new();
  for leaf in leaves {
    let (kind, detail) = match catalog.excluded_section(&leaf.path) {
      Some(section) => (excluded_kind(section), section.to_string()),
      None => (IgnoredKind::RootKey, leaf.path.join("/")),
    };
    let report = match kind {
      IgnoredKind::RootKey => {
        NOTABLE_ROOT_KEYS
          .iter()
          .any(|key| key.eq_ignore_ascii_case(&detail))
          || base.is_some_and(|base| base.differs(&leaf.path, leaf.value.as_deref()))
      }
      IgnoredKind::EditorSection => {
        base.is_none_or(|base| base.differs(&leaf.path, leaf.value.as_deref()))
      }
      _ => true,
    };
    if report
      && !parts
        .iter()
        .any(|part| part.kind == kind && part.detail == detail)
    {
      parts.push(IgnoredPart {
        kind,
        detail,
        line: Some(leaf.line),
      });
    }
  }
  parts
}

fn excluded_kind(section: &str) -> IgnoredKind {
  let last = section.rsplit('/').next().unwrap_or(section);
  if section.eq_ignore_ascii_case("FileSystem") || last.eq_ignore_ascii_case("SearchPaths") {
    IgnoredKind::SearchPaths
  } else if last.eq_ignore_ascii_case("RenderModes") {
    IgnoredKind::ListSection
  } else {
    IgnoredKind::EditorSection
  }
}

fn finish(ctx: &AnalyzeContext, draft: Draft, live: LiveGameinfo) -> ImportReport {
  let resolved = resolve::resolve(
    &ctx.catalog,
    &draft.entries,
    &live,
    &ResolveOptions {
      overrides: &draft.overrides,
      include_engine_sections: draft.include_engine_sections,
    },
  );
  ImportReport {
    format: draft.format,
    suggested_name: draft.suggested_name,
    base: draft.base,
    entries: draft.entries,
    resolved,
    ignored: draft.ignored,
    video_settings: draft.video_settings,
    staging_id: None,
    variants: Vec::new(),
    selected_variant: None,
    preset_id: draft.preset_id,
    overrides: draft.overrides,
    include_engine_sections: draft.include_engine_sections,
    warnings: draft.warnings,
  }
}

/// The live file when the game is set up and readable, else the catalog's
/// newest stock file as a stand-in.
fn live_gameinfo(ctx: &AnalyzeContext) -> LiveGameinfo {
  if let Some(game_path) = &ctx.game_path {
    let path = super::gameinfo_path(game_path);
    match fs::read(&path) {
      Ok(bytes) => match LiveGameinfo::parse(&formats::decode_text(&bytes)) {
        Ok(live) => return live,
        Err(error) => {
          log::warn!("Comparing the import with stock: live gameinfo.gi didn't parse: {error}")
        }
      },
      Err(error) => log::warn!("Comparing the import with stock: can't read {path:?}: {error}"),
    }
  }
  LiveGameinfo::latest_stock(&ctx.catalog)
}

/// Archive format from the file's magic bytes; `None` for anything else.
fn archive_kind(path: &Path) -> Result<Option<&'static str>, Error> {
  let mut magic = [0u8; 6];
  let mut file = fs::File::open(path)?;
  let read = file.read(&mut magic)?;
  let magic = &magic[..read];
  Ok(
    if magic.starts_with(b"PK\x03\x04") || magic.starts_with(b"PK\x05\x06") {
      Some("zip")
    } else if magic.starts_with(b"Rar!\x1a\x07") {
      Some("rar")
    } else if magic.starts_with(b"7z\xbc\xaf\x27\x1c") {
      Some("7z")
    } else {
      None
    },
  )
}

/// Refuses archives whose entries declare more than [`MAX_UNPACKED_BYTES`],
/// before anything is written.
fn check_unpacked_size(path: &Path, kind: &str) -> Result<(), Error> {
  let total: u64 = match kind {
    "zip" => {
      let mut archive = zip::ZipArchive::new(fs::File::open(path)?)?;
      let mut total = 0u64;
      for index in 0..archive.len() {
        total = total.saturating_add(archive.by_index_raw(index)?.size());
      }
      total
    }
    "7z" => sevenz_rust2::ArchiveReader::open(path, sevenz_rust2::Password::empty())
      .map_err(|e| Error::ModExtractionFailed(e.to_string()))?
      .archive()
      .files
      .iter()
      .fold(0u64, |total, entry| total.saturating_add(entry.size())),
    _ => {
      let mut total = 0u64;
      for header in unrar::Archive::new(path.to_string_lossy().as_ref()).open_for_listing()? {
        total = total.saturating_add(header?.unpacked_size);
      }
      total
    }
  };
  if total > MAX_UNPACKED_BYTES {
    return Err(Error::InvalidInput(
      "The archive unpacks to more than 1 GB; config archives are much smaller".to_string(),
    ));
  }
  Ok(())
}

/// A name for the config from its file, or its folder when the file is just
/// `gameinfo.gi` (`OptiLock FPS Config (Recommended)/gameinfo.gi`).
fn name_from_path(path: &Path) -> Option<String> {
  let stem = path.file_stem()?.to_string_lossy().to_string();
  if !GENERIC_FILE_NAMES.contains(&stem.to_lowercase().as_str()) {
    return Some(stem);
  }
  let folder = path.parent()?.file_name()?.to_string_lossy().to_string();
  (!GENERIC_FOLDER_NAMES.contains(&folder.to_lowercase().as_str())).then_some(folder)
}

async fn run_blocking<T: Send + 'static>(
  task: impl FnOnce() -> Result<T, Error> + Send + 'static,
) -> Result<T, Error> {
  tokio::task::spawn_blocking(task)
    .await
    .map_err(|e| Error::PerformanceConfig(format!("The import stopped unexpectedly: {e}")))?
}

#[cfg(test)]
#[path = "analyze_tests.rs"]
mod tests;
