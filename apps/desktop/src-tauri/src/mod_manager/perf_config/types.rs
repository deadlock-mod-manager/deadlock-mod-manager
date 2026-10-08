//! Data shapes shared by the patcher, the import analyzer, the catalog and the
//! frontend. Everything the UI sees is exported through ts-rs.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// One value a config sets in gameinfo.gi.
///
/// `path` starts below the `GameInfo` root: `["ConVars", "r_ssao"]`,
/// `["ConVars", "rate", "max"]` for an object-valued convar, or
/// `["SceneSystem", "CSMCascadeResolution"]` for an engine section. Section and
/// key names keep the author's casing but compare case-insensitively, as the
/// engine does.
///
/// `value` is the raw text without quotes. `None` means the config comments the
/// key out, which only means something when the key exists in the live file.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct ConfigEntry {
  pub path: Vec<String>,
  pub value: Option<String>,
}

/// A user's change on top of a config.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct EntryOverride {
  pub path: Vec<String>,
  pub action: OverrideAction,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum OverrideAction {
  /// Write this value instead of the config's (or add the key if the config
  /// doesn't set it).
  Set { value: String },
  /// Leave the config's value out of the file.
  Omit,
  /// Turn on an entry that is off by default (developer and hideout tools).
  Enable,
}

/// Where the entries of the config being applied come from.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PerfConfigSource {
  /// A curated preset from the catalog, looked up by id.
  Preset { id: String },
  /// A config the frontend holds (imported, pasted, forked).
  Inline { definition: PerfConfigDefinition },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct PerfConfigDefinition {
  pub id: String,
  pub name: String,
  pub entries: Vec<ConfigEntry>,
}

/// Everything needed to turn a config into lines in gameinfo.gi. The same
/// request is stored as the desired state, so a launch can re-apply it after a
/// game update wiped the file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct PerfApplyRequest {
  /// Stable id the frontend uses for this config: `preset:<id>` or `user:<uuid>`.
  pub config_id: String,
  pub name: String,
  pub source: PerfConfigSource,
  #[serde(default)]
  pub overrides: Vec<EntryOverride>,
  /// Write edits to engine sections (SceneSystem, RenderSystem, ...). Off by
  /// default; Valve's matchmaking message names these sections.
  #[serde(default)]
  pub include_engine_sections: bool,
}

/// What happens to one entry when the config is applied.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub enum EntryStatus {
  /// Written to the file.
  Applies,
  /// The live file already has this value; nothing to write.
  Unchanged,
  /// Valve flags the convar `gameinfo_cannot_override`; the game ignores it.
  Blocked,
  /// Not a convar in the current game build.
  Removed,
  /// A console command, not a convar.
  NotConvar,
  /// An edit outside ConVars that is only written when engine sections are
  /// included.
  EngineSection,
  /// A section or root key we never write (SearchPaths, RenderModes, PGIVersion,
  /// editor-only sections).
  Excluded,
  /// A key we refuse with a recorded reason (crashes, cheats).
  Denied,
  /// Turned off by the user, or a developer tool that is off by default.
  Omitted,
  /// Can't be expressed as an edit to the live file (object value for a new
  /// key, missing section).
  Unsupported,
}

/// Convars that change what the player sees or how the camera is framed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub enum GameplayClass {
  Camera,
  Visibility,
  /// Developer, debug and hideout tools: off unless the user enables them.
  Devtools,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub enum ConvarKind {
  Bool,
  Int,
  Float,
  String,
  Enum,
  Color,
  Vector,
}

/// Whether the current game build still reads a convar from gameinfo.gi.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub enum ConvarStatus {
  #[default]
  Active,
  /// Flagged `gameinfo_cannot_override`.
  Blocked,
  /// No longer in Valve's convar dump.
  Removed,
  /// A console command rather than a convar.
  NotConvar,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct EnumValue {
  pub value: String,
  pub label: String,
}

/// Facts about one convar: Valve's dump plus our curated layer.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct ConvarMeta {
  pub name: String,
  pub kind: ConvarKind,
  /// The engine's code default, as text.
  #[serde(default)]
  pub default: Option<String>,
  #[serde(default)]
  pub min: Option<f64>,
  #[serde(default)]
  pub max: Option<f64>,
  #[serde(default)]
  pub step: Option<f64>,
  #[serde(default)]
  pub enum_values: Vec<EnumValue>,
  #[serde(default)]
  pub flags: Vec<String>,
  /// Valve's help text.
  #[serde(default)]
  pub help: Option<String>,
  /// Curated human label, e.g. "Shadow casting".
  #[serde(default)]
  pub label: Option<String>,
  /// Curated description of what it does and what it costs.
  #[serde(default)]
  pub description: Option<String>,
  /// Category id from the catalog's category list.
  pub category: String,
  #[serde(default)]
  pub gameplay: Option<GameplayClass>,
  /// Known visible side effects ("Doorman's door stops rendering").
  #[serde(default)]
  pub side_effects: Option<String>,
  #[serde(default)]
  pub status: ConvarStatus,
  /// Build in which the status last changed (e.g. 6711 for blocked convars).
  #[serde(default)]
  pub status_since_build: Option<u32>,
}

/// Why an entry has the status it has, when the status alone isn't enough for
/// the UI to explain it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum EntryNote {
  /// The value is outside the convar's range; the game uses `effective`.
  Clamped { effective: String },
  /// The value doesn't match the convar's type ("0.25" for an int).
  TypeMismatch { expected: ConvarKind },
  /// A denied key, with the catalog's reason.
  Denied { reason: String },
  /// Excluded section or root key, naming it.
  ExcludedSection { section: String },
  /// Engine section that Valve's matchmaking message names.
  GuardedSection { section: String },
  /// The section this edit targets doesn't exist in the live file.
  MissingSection { section: String },
  /// Blocked or removed since this build.
  SinceBuild { build: u32 },
  /// A ConVars key that isn't a convar, but that Valve's latest gameinfo.gi
  /// sets in this other section.
  SectionKey { section: String },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct ResolvedEntry {
  pub path: Vec<String>,
  /// Value that will be written (after overrides). `None` comments the key out.
  pub value: Option<String>,
  /// The config's own value, before the user's overrides.
  pub config_value: Option<String>,
  /// The entry comes from the config itself, not only from the user's
  /// overrides.
  pub in_config: bool,
  /// Value in the live file right now (ignoring our own overlay), if the key exists.
  pub live_value: Option<String>,
  pub status: EntryStatus,
  #[serde(default)]
  pub notes: Vec<EntryNote>,
  /// The user changed, added, omitted or enabled this entry.
  pub overridden: bool,
  /// Category id; engine-section entries get their section's category.
  pub category: String,
  pub gameplay: Option<GameplayClass>,
  pub meta: Option<ConvarMeta>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct ResolvedCounts {
  pub applies: u32,
  pub unchanged: u32,
  pub blocked: u32,
  pub removed: u32,
  pub not_convar: u32,
  pub engine_section: u32,
  pub excluded: u32,
  pub denied: u32,
  pub omitted: u32,
  pub unsupported: u32,
  pub overridden: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct ResolvedConfig {
  pub entries: Vec<ResolvedEntry>,
  pub counts: ResolvedCounts,
  /// Position on the Looks ⟷ Frames scale, 0 (looks) to 1 (frames).
  pub cut_score: f32,
  /// First 12 hex chars of a hash over the entries that will be written.
  pub rev: String,
}

/// Author-declared tier, shown on preset cards.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub enum PerfTier {
  Pretty,
  Balanced,
  Lean,
  Sweaty,
  Potato,
}

/// One in-game video setting an author recommends. We never write video.txt;
/// these are shown as a checklist.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct VideoSetting {
  /// The `setting.*` key without the prefix, e.g. `r_citadel_shadow_quality`.
  pub key: String,
  pub value: String,
  /// Name of the in-game menu option, when we know it.
  #[serde(default)]
  pub label: Option<String>,
  /// Menu value as the player sees it ("Off", "Low"), when we know it.
  #[serde(default)]
  pub display: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PresetSourceInfo {
  Github {
    repo: String,
    path: String,
    commit: String,
    url: String,
    license: String,
  },
  Bundled,
}

/// A curated preset as the UI lists it. Counts are computed against the live
/// file, so they reflect the user's game build.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct PresetSummary {
  pub id: String,
  pub name: String,
  pub author: String,
  pub tier: PerfTier,
  pub blurb: String,
  #[serde(default)]
  pub highlights: Vec<String>,
  pub recommended: bool,
  pub version: Option<String>,
  pub updated_at: Option<String>,
  pub base_build: Option<u32>,
  pub source: PresetSourceInfo,
  #[serde(default)]
  pub video_settings: Vec<VideoSetting>,
  #[serde(default)]
  pub notes: Vec<String>,
  pub counts: ResolvedCounts,
  pub cut_score: f32,
}

/// A GameBanana config. We never redistribute its file: the user downloads it
/// from GameBanana and it goes through the import review.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct CommunityConfigSummary {
  pub id: String,
  #[ts(type = "number")]
  pub gamebanana_id: u64,
  pub name: String,
  pub author: String,
  #[ts(type = "number")]
  pub downloads: u64,
  pub updated_at: Option<String>,
  pub tier: PerfTier,
  pub blurb: String,
  pub base_build: Option<u32>,
  #[ts(type = "number")]
  pub file_id: u64,
  /// Which file in the archive to import by default (path fragment).
  pub variant_hint: Option<String>,
  pub settings_count: u32,
  pub engine_edit_count: u32,
  pub cut_score: f32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct CategoryInfo {
  pub id: String,
  pub label: String,
  pub weight: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub enum CatalogOrigin {
  Bundled,
  Downloaded,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct CatalogSummary {
  pub version: String,
  pub generated_at: String,
  pub origin: CatalogOrigin,
  pub latest_build: Option<u32>,
  pub convar_build: Option<u32>,
  pub categories: Vec<CategoryInfo>,
  pub guarded_sections: Vec<String>,
  pub presets: Vec<PresetSummary>,
  pub community: Vec<CommunityConfigSummary>,
}

/// Another tool's performance overlay found in gameinfo.gi.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub enum ForeignTool {
  Grimoire,
  Deadtune,
  SqookyUpdater,
  GameinfoEditor,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct ForeignOverlay {
  pub tool: ForeignTool,
  /// What its marker says, e.g. Grimoire's preset id.
  pub label: Option<String>,
  pub line_count: u32,
}

/// The overlay our markers describe in the live file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct AppliedOverlay {
  pub config_id: String,
  pub rev: String,
  /// Lines we added or edited.
  pub line_count: u32,
  /// Marker lines whose value no longer matches what we wrote (hand edits).
  pub hand_edited: Vec<Vec<String>>,
}

/// The config the user chose, persisted in the app's data folder.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct DesiredOverlay {
  pub request: PerfApplyRequest,
  pub rev: String,
  pub applied_at: String,
  pub counts: ResolvedCounts,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct PerfStatus {
  pub game_path_set: bool,
  pub gameinfo_found: bool,
  pub desired: Option<DesiredOverlay>,
  pub applied: Option<AppliedOverlay>,
  /// The file carries exactly the desired overlay.
  pub in_sync: bool,
  pub foreign: Vec<ForeignOverlay>,
  pub build_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct PerfApplyResult {
  pub status: PerfStatus,
  pub resolved: ResolvedConfig,
  /// Foreign overlays that were removed because the request asked for it.
  pub removed_foreign: Vec<ForeignOverlay>,
}

/// What to import. Archives (zip/rar/7z) are extracted to a staging folder and
/// may hold several variants.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ImportSource {
  Text {
    text: String,
    file_name: Option<String>,
  },
  File {
    path: String,
  },
  /// The live gameinfo.gi, minus our own overlay.
  CurrentGameinfo,
  GameBanana {
    #[ts(type = "number")]
    mod_id: u64,
    #[ts(type = "number")]
    file_id: u64,
  },
  /// A variant of an archive analyzed earlier.
  Staged {
    staging_id: String,
    variant_path: String,
  },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub enum ImportFormat {
  FullGameinfo,
  ConvarsSnippet,
  Cfg,
  OverridesGi,
  VideoTxt,
  ShareCode,
  Archive,
}

/// The stock gameinfo.gi a full config was built on.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct BaseMatch {
  pub build: u32,
  pub date: String,
  /// Matched by `PGIVersion` rather than by closest diff.
  pub exact: bool,
  /// Stock entries that differ from the file (0 for an exact match).
  pub distance: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub enum IgnoredKind {
  SearchPaths,
  ListSection,
  RootKey,
  EditorSection,
  ModManagerMarkers,
  Bind,
  Alias,
  Exec,
  ConsoleCommand,
  DuplicateKey,
  ParseError,
  MachineSpecific,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct IgnoredPart {
  pub kind: IgnoredKind,
  pub detail: String,
  pub line: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct ImportVariant {
  /// Path inside the archive.
  pub path: String,
  pub label: String,
  pub format: ImportFormat,
  /// Same settings as another variant (e.g. a translated copy).
  pub duplicate_of: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
  pub format: ImportFormat,
  /// Name to prefill: archive or file name, share-code name, or marker label.
  pub suggested_name: Option<String>,
  pub base: Option<BaseMatch>,
  /// The author's intended changes, relative to `base` when known. This is what
  /// gets saved as the config.
  pub entries: Vec<ConfigEntry>,
  /// The entries resolved against the live file with default options.
  pub resolved: ResolvedConfig,
  pub ignored: Vec<IgnoredPart>,
  pub video_settings: Vec<VideoSetting>,
  /// Set when the source was an archive.
  pub staging_id: Option<String>,
  pub variants: Vec<ImportVariant>,
  /// Variant the report describes, when there are several.
  pub selected_variant: Option<String>,
  /// Present when the text was a DMM share code built on a preset.
  pub preset_id: Option<String>,
  pub overrides: Vec<EntryOverride>,
  /// A share code asks for engine-section edits to be written.
  pub include_engine_sections: bool,
  pub warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct PerfExport {
  /// `dmm-perf:1:<base64url>`; paste it into the import dialog.
  pub share_code: String,
  /// The written entries as a ConVars block, for pasting into gameinfo.gi by hand.
  pub snippet: String,
}

/// A config found inside a mod archive the user downloaded.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct ConfigFoundEvent {
  pub mod_id: String,
  pub mod_name: String,
  pub staging_id: String,
  pub variants: Vec<ImportVariant>,
  /// The archive also contained VPKs that were installed as a mod.
  pub installed_vpks: u32,
}
