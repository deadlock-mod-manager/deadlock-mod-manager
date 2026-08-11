use serde::{Deserialize, Serialize};

/// A single VPK entry surfaced to the Mod Foundry, tagged with the editing
/// category it belongs to so the UI can group it into the right tab.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundryEntry {
  pub path: String,
  pub filename: String,
  pub ext: String,
  pub size: u32,
  pub category: String,
  /// `mod`, `default` or `workspace` — where the bytes behind this entry live.
  pub source: String,
}

/// A decoded hero-card texture, either from the imported mod VPK or from the
/// base game's default `pak01_dir.vpk`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundryCardPreview {
  pub source: String,
  pub path: String,
  pub filename: String,
  pub variant: String,
  pub width: u32,
  pub height: u32,
  pub data_url: String,
}

/// The categorized contents of an imported skin VPK. Map / non-hero mods report
/// `is_hero_skin = false` so the Foundry can refuse them up front.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundryManifest {
  /// The staged copy of the source VPK, not the file the user picked. Every
  /// follow-up command takes this path so nothing reads the original again.
  pub file_path: String,
  /// The VPK the user actually opened. Only the "replace this mod" export
  /// writes here; empty for a default-hero load, which has no mod to replace.
  pub source_path: String,
  pub hero: Option<String>,
  pub hero_display: Option<String>,
  pub is_hero_skin: bool,
  pub entry_count: usize,
  pub models: Vec<FoundryEntry>,
  pub materials: Vec<FoundryEntry>,
  pub textures: Vec<FoundryEntry>,
  pub cards: Vec<FoundryEntry>,
  pub sounds: Vec<FoundryEntry>,
  pub other: Vec<FoundryEntry>,
  /// Sounds grouped into ability / voice / weapon buckets for the sound tab.
  pub sound_groups: Vec<FoundrySoundGroup>,
}

/// One bucket in the sound browser: an ability slot, the hero's voice lines, or
/// a catch-all for clips that don't map to a slot.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundrySoundGroup {
  /// Stable id (`ability-1`, `voice`, `weapon`, `other`, `soundevents`).
  pub id: String,
  pub kind: String,
  pub slot: Option<u8>,
  pub label: String,
  pub entries: Vec<FoundryEntry>,
}

/// An on-disk, unpacked working copy of the skin currently loaded in the
/// Foundry, laid out under `<app_local_data>/foundry/<id>/`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundryWorkspace {
  /// The workspace root: `<app_local_data>/foundry/<id>`.
  pub root: String,
  /// The unpacked, editable file tree: `<root>/files`.
  pub files_dir: String,
  /// A copy of the source VPK kept beside the unpacked files.
  pub vpk_copy: String,
  /// Number of files unpacked into `files_dir`.
  pub file_count: usize,
  /// True when this run performed the extraction; false when a prior unpack was
  /// reused (so in-progress edits are preserved).
  pub created: bool,
}

/// Result of bundling the editable Foundry `files/` tree into a VPK.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundryBuildResult {
  pub output_path: String,
  pub file_count: usize,
  pub size: u64,
}

/// Result of replacing one editable workspace file. Texture replacements return
/// a fresh preview so the UI can update without rebuilding the VPK first.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundryReplacementResult {
  pub entry: FoundryEntry,
  pub texture: Option<FoundryTexture>,
}

/// A decoded texture (top mip) as a base64 PNG data URL, ready for an `<img>`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundryTexture {
  pub width: u32,
  pub height: u32,
  pub data_url: String,
}

/// A decoded model as a base64 GLB data URL, ready for the webview viewer.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundryModel {
  pub vertex_count: u32,
  pub index_count: u32,
  pub data_url: String,
}

/// How much of a hero one paint target covers in the loaded skin, so the UI can
/// show the parts that exist and disable the ones it doesn't.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundryPaintTargetInfo {
  pub id: String,
  pub texture_count: usize,
  pub particle_count: usize,
}

/// What a paint pass actually rewrote. `skipped_paths` holds entries the
/// recolor could not handle (an HDR map, an unsupported container); the pass
/// still succeeds, because one odd texture should not block repainting a hero.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundryPaintResult {
  pub target: String,
  pub painted_paths: Vec<String>,
  pub skipped_paths: Vec<String>,
}

/// A browser-playable clip extracted from a compiled `.vsnd_c`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundrySoundPreview {
  pub data_url: String,
  pub mime_type: String,
}

pub(crate) const CATEGORY_MODEL: &str = "model";
pub(crate) const CATEGORY_MATERIAL: &str = "material";
pub(crate) const CATEGORY_TEXTURE: &str = "texture";
pub(crate) const CATEGORY_CARD: &str = "card";
pub(crate) const CATEGORY_SOUND: &str = "sound";
pub(crate) const CATEGORY_OTHER: &str = "other";
pub(crate) const CARD_SOURCE_MOD: &str = "mod";
pub(crate) const CARD_SOURCE_DEFAULT: &str = "default";
pub(crate) const ENTRY_SOURCE_MOD: &str = "mod";
pub(crate) const ENTRY_SOURCE_DEFAULT: &str = "default";
pub(crate) const ENTRY_SOURCE_WORKSPACE: &str = "workspace";

pub(crate) const VARIANT_ORDER: &[&str] = &[
  "card",
  "vertical",
  "card_critical",
  "card_gloat",
  "minimap",
  "small",
  "other",
];
