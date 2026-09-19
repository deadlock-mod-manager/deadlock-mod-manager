//! Reader adapter: Grimoire's native on-disk data -> interchange document.
//!
//! Grimoire (an Electron mod manager) keeps no mod library of its own. The
//! game folder is the library:
//! - enabled mods are `pakNN_dir.vpk` in `citadel/addons` and the overflow
//!   roots `citadel/addons1..9`,
//! - disabled mods are free-form `*_dir.vpk` files in `citadel/addons/.disabled`,
//! - identity lives in `<userData>/mod-metadata.json`, keyed by the file name
//!   (`addonsN/<file>` for overflow roots) and fingerprinted with `sha256`.
//!
//! Every Grimoire version writes the same shape, but the sidecar drifts: slots
//! get reused by other tools and entries go stale. So an entry whose `sha256`
//! no longer matches the file is ignored, and the file is imported as a local
//! mod instead of under a wrong GameBanana identity. A missing or corrupt
//! sidecar falls back to Grimoire's own backups, then to no metadata at all.

use super::format::{
  GameBananaOrigin, InterchangeCrosshair, InterchangeDocument, InterchangeFile, InterchangeMod,
  InterchangeOrigin, InterchangeProfile, InterchangeProfileMod, InterchangeSource, LocalOrigin,
  SECTION_CROSSHAIRS, SECTION_PROFILES, SubmissionKind, drop_dangling_profile_entries,
  is_plain_vpk_name, slugify,
};
use super::hash_cache::HashCache;
use crate::errors::Error;
use crate::mod_manager::shard::ProfileBase;
use crate::mod_manager::vpk_manifest::ProfileVpkManifest;
use crate::providers::SubmissionRef;
use regex::Regex;
use serde::Serialize;
use serde_json::{Map, Value};
use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

pub const MANAGER_ID: &str = "grimoire";

static ENABLED_PAK: LazyLock<Regex> =
  LazyLock::new(|| Regex::new(r"(?i)^pak(\d+)_dir\.vpk$").expect("valid regex"));
static OVERFLOW_ROOT: LazyLock<Regex> =
  LazyLock::new(|| Regex::new(r"(?i)^addons(\d+)$").expect("valid regex"));
static VPK_CHUNK: LazyLock<Regex> =
  LazyLock::new(|| Regex::new(r"(?i)_\d{3}\.vpk$").expect("valid regex"));

/// Metadata flags that mark a VPK Grimoire generates itself (Locker output).
/// These are rebuilt from Grimoire's own state and mean nothing elsewhere.
const GENERATED_FLAGS: &[&str] = &[
  "lockerCosmetics",
  "lockerSounds",
  "lockerColors",
  "lockerTrippySkins",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrimoireDetection {
  pub found: bool,
  pub user_data_dir: Option<String>,
  pub deadlock_path: Option<String>,
  pub has_metadata: bool,
  pub searched: Vec<String>,
}

/// Where Electron puts Grimoire's `userData` (`app.getPath('userData')`, named
/// after the package, so `grimoire`). E2E builds look inside the owned world.
pub fn candidate_user_data_dirs() -> Vec<PathBuf> {
  if let Some(configuration) = crate::runtime_environment::current().e2e() {
    return vec![
      configuration
        .roots
        .world
        .join("foreign-apps")
        .join("grimoire"),
    ];
  }
  let mut candidates = Vec::new();
  if let Some(config) = dirs::config_dir() {
    candidates.push(config.join("grimoire"));
    candidates.push(config.join("Grimoire"));
  }
  #[cfg(target_os = "linux")]
  if let Some(home) = dirs::home_dir() {
    // Flatpak/Snap sandboxes keep their own config dir.
    candidates.push(home.join(".var/app/com.grimoire.modmanager/config/grimoire"));
  }
  let mut seen = HashSet::new();
  candidates.retain(|path| seen.insert(path.to_string_lossy().to_lowercase()));
  candidates
}

fn looks_like_user_data(dir: &Path) -> bool {
  dir.join("settings.json").is_file() || dir.join("mod-metadata.json").is_file()
}

pub fn detect(explicit: Option<PathBuf>, fallback_game_path: Option<&Path>) -> GrimoireDetection {
  let candidates = match explicit {
    Some(path) => vec![path],
    None => candidate_user_data_dirs(),
  };
  let searched = candidates
    .iter()
    .map(|path| path.display().to_string())
    .collect();
  let Some(dir) = candidates.into_iter().find(|dir| looks_like_user_data(dir)) else {
    return GrimoireDetection {
      found: false,
      user_data_dir: None,
      deadlock_path: None,
      has_metadata: false,
      searched,
    };
  };
  let deadlock_path = resolve_deadlock_path(&read_settings(&dir), fallback_game_path);
  GrimoireDetection {
    found: true,
    has_metadata: dir.join("mod-metadata.json").is_file(),
    user_data_dir: Some(dir.display().to_string()),
    deadlock_path: deadlock_path.map(|path| path.display().to_string()),
    searched,
  }
}

fn read_settings(user_data_dir: &Path) -> Map<String, Value> {
  fs::read_to_string(user_data_dir.join("settings.json"))
    .ok()
    .and_then(|text| serde_json::from_str::<Value>(&text).ok())
    .and_then(|value| value.as_object().cloned())
    .unwrap_or_default()
}

fn is_deadlock_root(path: &Path) -> bool {
  path.join("game").join("citadel").is_dir()
}

/// Mirrors Grimoire's `getActiveDeadlockPath` (dev dummy path first when dev
/// mode is on), then falls back to DMM's own game path: both managers almost
/// always point at the same Steam install.
fn resolve_deadlock_path(
  settings: &Map<String, Value>,
  fallback_game_path: Option<&Path>,
) -> Option<PathBuf> {
  let text = |key: &str| {
    settings
      .get(key)
      .and_then(Value::as_str)
      .filter(|value| !value.trim().is_empty())
      .map(PathBuf::from)
  };
  let mut candidates = Vec::new();
  if settings.get("devMode").and_then(Value::as_bool) == Some(true)
    && let Some(dev) = text("devDeadlockPath")
  {
    candidates.push(dev);
  }
  if let Some(path) = text("deadlockPath") {
    candidates.push(path);
  }
  if let Some(path) = fallback_game_path {
    candidates.push(path.to_path_buf());
  }
  candidates.into_iter().find(|path| is_deadlock_root(path))
}

struct MetadataSource {
  entries: Map<String, Value>,
  warning: Option<String>,
}

fn parse_metadata(path: &Path) -> Option<Map<String, Value>> {
  fs::read_to_string(path)
    .ok()
    .and_then(|text| serde_json::from_str::<Value>(&text).ok())
    .and_then(|value| value.as_object().cloned())
}

fn load_metadata(user_data_dir: &Path) -> MetadataSource {
  let primary = user_data_dir.join("mod-metadata.json");
  if let Some(entries) = parse_metadata(&primary) {
    return MetadataSource {
      entries,
      warning: None,
    };
  }

  // Grimoire keeps timestamped copies before batch writes; newest first.
  let backups_dir = user_data_dir.join("mod-metadata.backups");
  let mut backups: Vec<PathBuf> = fs::read_dir(&backups_dir)
    .map(|entries| {
      entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "json"))
        .collect()
    })
    .unwrap_or_default();
  backups.sort();
  backups.reverse();
  for backup in backups {
    if let Some(entries) = parse_metadata(&backup) {
      return MetadataSource {
        entries,
        warning: Some(format!(
          "Grimoire's mod-metadata.json is missing or unreadable; used the backup {}",
          backup.display()
        )),
      };
    }
  }

  MetadataSource {
    entries: Map::new(),
    warning: primary.exists().then(|| {
      "Grimoire's mod-metadata.json is unreadable and has no usable backup; mods are imported by file only"
        .to_string()
    }),
  }
}

/// One VPK on disk, as Grimoire sees it.
struct Candidate {
  path: PathBuf,
  file_name: String,
  meta_key: String,
  enabled: bool,
  /// Global load position: folder * 100 + pak number for enabled files.
  load_position: u64,
}

fn vpk_files_in(dir: &Path) -> Vec<(PathBuf, String)> {
  let mut files: Vec<(PathBuf, String)> = fs::read_dir(dir)
    .map(|entries| {
      entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()))
        .filter_map(|entry| {
          let name = entry.file_name().to_str()?.to_string();
          let lower = name.to_ascii_lowercase();
          (lower.ends_with(".vpk")
            && !VPK_CHUNK.is_match(&name)
            && !lower.contains(".merge-rebuild"))
          .then(|| (entry.path(), name))
        })
        .collect()
    })
    .unwrap_or_default();
  files.sort_by(|a, b| a.1.cmp(&b.1));
  files
}

/// Files the DMM default profile already owns. When both managers share
/// `citadel/addons`, these must never be imported back into DMM.
fn dmm_owned_files(addons: &Path) -> HashSet<String> {
  let mut owned = HashSet::new();
  let Ok(base) = ProfileBase::new(addons) else {
    return owned;
  };
  let Ok(manifest) = ProfileVpkManifest::load(addons) else {
    return owned;
  };
  for entry in manifest.mods.values() {
    for path in entry.file_paths(&base) {
      owned.insert(normalize(&path));
    }
  }
  owned
}

fn normalize(path: &Path) -> String {
  path.to_string_lossy().replace('\\', "/").to_lowercase()
}

fn is_dmm_prefixed(file_name: &str) -> bool {
  file_name
    .split_once('_')
    .is_some_and(|(slug, _)| SubmissionRef::parse_slug(slug).is_ok())
}

fn collect_candidates(citadel: &Path, warnings: &mut Vec<String>) -> Vec<Candidate> {
  let addons = citadel.join("addons");
  let owned = dmm_owned_files(&addons);
  let mut roots: Vec<(u64, PathBuf, Option<String>)> = vec![(0, addons.clone(), None)];
  if let Ok(entries) = fs::read_dir(citadel) {
    for entry in entries.flatten() {
      let Some(name) = entry.file_name().to_str().map(str::to_string) else {
        continue;
      };
      if let Some(captures) = OVERFLOW_ROOT.captures(&name)
        && entry.path().is_dir()
        && let Ok(index) = captures[1].parse::<u64>()
      {
        roots.push((index, entry.path(), Some(name)));
      }
    }
  }
  roots.sort_by_key(|(index, _, _)| *index);

  let mut candidates = Vec::new();
  let mut skipped_dmm = 0usize;
  for (folder_index, root, root_name) in &roots {
    for (path, file_name) in vpk_files_in(root) {
      if owned.contains(&normalize(&path)) {
        skipped_dmm += 1;
        continue;
      }
      let Some(captures) = ENABLED_PAK.captures(&file_name) else {
        // A DMM-parked `<id>_<name>.vpk`, a `.bak`, or anything else the
        // game does not load from this folder: not part of Grimoire's list.
        if is_dmm_prefixed(&file_name) {
          skipped_dmm += 1;
        }
        continue;
      };
      let pak: u64 = captures[1].parse().unwrap_or(99);
      let meta_key = match root_name {
        Some(root_name) => format!("{root_name}/{file_name}"),
        None => file_name.clone(),
      };
      candidates.push(Candidate {
        path,
        file_name,
        meta_key,
        enabled: true,
        load_position: folder_index * 100 + pak,
      });
    }
  }

  let disabled_dir = addons.join(".disabled");
  for (index, (path, file_name)) in vpk_files_in(&disabled_dir).into_iter().enumerate() {
    candidates.push(Candidate {
      meta_key: file_name.clone(),
      file_name,
      path,
      enabled: false,
      load_position: 100_000 + index as u64,
    });
  }

  if skipped_dmm > 0 {
    warnings.push(format!(
      "{skipped_dmm} file(s) in the shared addons folder belong to Deadlock Mod Manager and were left out"
    ));
  }
  candidates
}

fn meta_str<'a>(meta: &'a Map<String, Value>, key: &str) -> Option<&'a str> {
  meta
    .get(key)
    .and_then(Value::as_str)
    .map(str::trim)
    .filter(|value| !value.is_empty())
}

fn meta_u64(meta: &Map<String, Value>, key: &str) -> Option<u64> {
  meta
    .get(key)
    .and_then(|value| value.as_u64().or_else(|| value.as_str()?.parse().ok()))
    .filter(|value| *value > 0)
}

/// The identity a group of VPKs is imported under.
#[derive(Clone, PartialEq, Eq, PartialOrd, Ord)]
enum GroupKey {
  GameBanana(SubmissionKindOrd, u64),
  Local(String),
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum SubmissionKindOrd {
  Mod,
  Sound,
}

struct Resolved {
  candidate: Candidate,
  sha256: String,
  size: u64,
  meta: Option<Map<String, Value>>,
}

/// Read Grimoire's library as an interchange document. File paths are
/// absolute; nothing on disk is modified.
/// How a read reports progress and where it caches file hashes.
pub struct ReadContext<'a> {
  pub hashes: &'a HashCache,
  /// `(files checked, total files, current file name)`.
  pub progress: &'a (dyn Fn(usize, usize, &str) + Sync),
}

/// Read without a persistent hash cache or progress reporting.
#[cfg(test)]
pub fn read(
  user_data_dir: &Path,
  fallback_game_path: Option<&Path>,
) -> Result<InterchangeDocument, Error> {
  let hashes = HashCache::open(None);
  read_with(
    user_data_dir,
    fallback_game_path,
    &ReadContext {
      hashes: &hashes,
      progress: &|_, _, _| {},
    },
  )
}

pub fn read_with(
  user_data_dir: &Path,
  fallback_game_path: Option<&Path>,
  context: &ReadContext,
) -> Result<InterchangeDocument, Error> {
  let settings = read_settings(user_data_dir);
  let deadlock_path = resolve_deadlock_path(&settings, fallback_game_path).ok_or_else(|| {
    Error::InvalidInput(format!(
      "Could not find the Deadlock folder Grimoire uses (checked the settings in {} and DMM's game path)",
      user_data_dir.display()
    ))
  })?;
  let citadel = deadlock_path.join("game").join("citadel");

  let mut document = InterchangeDocument::new(InterchangeSource {
    manager: MANAGER_ID.to_string(),
    manager_version: None,
    profile_name: active_profile_name(user_data_dir, &settings),
  });

  let metadata = load_metadata(user_data_dir);
  document.warnings.extend(metadata.warning);

  let mut resolved = Vec::new();
  let mut stale = 0usize;
  let mut generated = 0usize;
  // Locker output is left out before any file is read.
  let mut kept = Vec::new();
  for candidate in collect_candidates(&citadel, &mut document.warnings) {
    let meta = metadata
      .entries
      .get(&candidate.meta_key)
      .and_then(Value::as_object)
      .cloned();
    if meta
      .as_ref()
      .is_some_and(|entry| GENERATED_FLAGS.iter().any(|flag| entry.contains_key(*flag)))
    {
      generated += 1;
      continue;
    }
    kept.push((candidate, meta));
  }
  // Hashing dominates the read: all cores, and unchanged files come from the
  // cache without being read at all.
  let paths: Vec<PathBuf> = kept.iter().map(|(c, _)| c.path.clone()).collect();
  let hashes = context.hashes.hash_all(&paths, context.progress);
  context.hashes.save();
  for ((candidate, mut meta), hash) in kept.into_iter().zip(hashes) {
    let size = match fs::metadata(&candidate.path) {
      Ok(stat) => stat.len(),
      Err(error) => {
        document.warnings.push(format!(
          "{}: unreadable ({error})",
          candidate.path.display()
        ));
        continue;
      }
    };
    let sha256 = match hash {
      Ok(hash) => hash,
      Err(error) => {
        document.warnings.push(format!(
          "{}: could not be hashed ({error})",
          candidate.path.display()
        ));
        continue;
      }
    };
    if let Some(entry) = &meta
      && let Some(recorded) = meta_str(entry, "sha256")
      && !recorded.eq_ignore_ascii_case(&sha256)
    {
      stale += 1;
      meta = None;
    }
    resolved.push(Resolved {
      candidate,
      sha256,
      size,
      meta,
    });
  }
  if stale > 0 {
    document.warnings.push(format!(
      "{stale} file(s) no longer match Grimoire's recorded fingerprint (the slot was reused); they are imported as local mods"
    ));
  }
  if generated > 0 {
    document.warnings.push(format!(
      "{generated} Grimoire Locker file(s) were left out; Grimoire rebuilds them from its own settings"
    ));
  }

  // Group VPKs into mods. Grimoire tracks variants of one GameBanana
  // submission as separate files; the interchange keeps them together.
  let mut groups: BTreeMap<GroupKey, Vec<Resolved>> = BTreeMap::new();
  for item in resolved {
    let key = match item
      .meta
      .as_ref()
      .and_then(|meta| meta_u64(meta, "gameBananaId"))
    {
      Some(id) => {
        let kind = if item
          .meta
          .as_ref()
          .and_then(|meta| meta_str(meta, "sourceSection"))
          == Some("Sound")
        {
          SubmissionKindOrd::Sound
        } else {
          SubmissionKindOrd::Mod
        };
        GroupKey::GameBanana(kind, id)
      }
      None => GroupKey::Local(item.sha256.clone()),
    };
    groups.entry(key).or_default().push(item);
  }

  let mut mods = Vec::new();
  // Every file name / metaKey Grimoire might use in a profile, per entry key.
  let mut key_by_file: std::collections::HashMap<String, String> = std::collections::HashMap::new();
  for (key, mut items) in groups {
    items.sort_by_key(|item| (!item.candidate.enabled, item.candidate.load_position));
    let entry_key = group_entry_key(&key);
    for item in &items {
      key_by_file.insert(item.candidate.meta_key.to_lowercase(), entry_key.clone());
      key_by_file.insert(item.candidate.file_name.to_lowercase(), entry_key.clone());
    }
    // Byte-identical copies (Grimoire re-imports, leftovers) collapse to one.
    let mut seen_hashes = HashSet::new();
    items.retain(|item| seen_hashes.insert(item.sha256.clone()));
    if let Some(entry) = build_mod(&key, &items) {
      mods.push((items[0].candidate.load_position, entry));
    }
  }

  mods.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.name.cmp(&b.1.name)));
  document.mods = mods
    .into_iter()
    .enumerate()
    .map(|(order, (_, mut entry))| {
      entry.order = order as u32;
      entry
    })
    .collect();

  read_profiles(user_data_dir, &settings, &key_by_file, &mut document);
  read_crosshair_presets(user_data_dir, &mut document);
  let mut warnings = Vec::new();
  drop_dangling_profile_entries(&document.mods, &mut document.profiles, &mut warnings);
  document.warnings.extend(warnings);
  Ok(document)
}

fn group_entry_key(key: &GroupKey) -> String {
  match key {
    GroupKey::GameBanana(SubmissionKindOrd::Mod, id) => format!("gamebanana:mod:{id}"),
    GroupKey::GameBanana(SubmissionKindOrd::Sound, id) => format!("gamebanana:sound:{id}"),
    GroupKey::Local(hash) => format!("local:sha256:{hash}"),
  }
}

/// Grimoire's `CrosshairSettings` field -> the game convar it writes.
const CROSSHAIR_CONVARS: &[(&str, &str)] = &[
  ("pipGap", "citadel_crosshair_pip_gap"),
  ("pipGapStatic", "citadel_crosshair_pip_gap_static"),
  ("pipHeight", "citadel_crosshair_pip_height"),
  ("pipWidth", "citadel_crosshair_pip_width"),
  ("pipOpacity", "citadel_crosshair_pip_opacity"),
  ("pipOutlineBorder", "citadel_crosshair_pip_outline_border"),
  ("pipOutlineGap", "citadel_crosshair_pip_outline_gap"),
  ("pipOutlineOpacity", "citadel_crosshair_pip_outline_opacity"),
  ("pipBorder", "citadel_crosshair_pip_border"),
  ("dotSize", "citadel_crosshair_dot_size"),
  ("dotOpacity", "citadel_crosshair_dot_opacity"),
  ("dotOutlineBorder", "citadel_crosshair_dot_outline_border"),
  ("dotOutlineGap", "citadel_crosshair_dot_outline_gap"),
  ("dotOutlineOpacity", "citadel_crosshair_dot_outline_opacity"),
  ("colorR", "citadel_crosshair_color_r"),
  ("colorG", "citadel_crosshair_color_g"),
  ("colorB", "citadel_crosshair_color_b"),
  ("outlineColorR", "citadel_crosshair_outline_color_r"),
  ("outlineColorG", "citadel_crosshair_outline_color_g"),
  ("outlineColorB", "citadel_crosshair_outline_color_b"),
  (
    "disableHeroSpecificCrosshairs",
    "citadel_crosshair_disable_hero_specific_crosshairs",
  ),
];

/// Grimoire crosshair settings as convars. Unknown or legacy fields are
/// skipped rather than guessed.
pub fn crosshair_convars(settings: &Value) -> std::collections::BTreeMap<String, String> {
  let mut convars = std::collections::BTreeMap::new();
  let Some(object) = settings.as_object() else {
    return convars;
  };
  for (field, convar) in CROSSHAIR_CONVARS {
    let value = match object.get(*field) {
      Some(Value::Bool(flag)) => flag.to_string(),
      Some(Value::Number(number)) => number.to_string(),
      _ => continue,
    };
    convars.insert((*convar).to_string(), value);
  }
  convars
}

fn read_json_array(path: &Path) -> Vec<Value> {
  fs::read_to_string(path)
    .ok()
    .and_then(|text| serde_json::from_str::<Value>(&text).ok())
    .and_then(|value| value.as_array().cloned())
    .unwrap_or_default()
}

/// Grimoire profiles are snapshots of which installed files were enabled, in
/// which order, plus an optional crosshair and autoexec commands. Entries are
/// matched to library mods by GameBanana id first (stable), then by file name.
fn read_profiles(
  user_data_dir: &Path,
  settings: &Map<String, Value>,
  key_by_file: &std::collections::HashMap<String, String>,
  document: &mut InterchangeDocument,
) {
  let active_id = settings.get("activeProfileId").and_then(Value::as_str);
  let library_keys: HashSet<String> = document.mods.iter().map(|m| m.key.clone()).collect();
  let mut unresolved = 0usize;
  for raw in read_json_array(&user_data_dir.join("profiles.json")) {
    let Some(id) = raw.get("id").and_then(Value::as_str) else {
      continue;
    };
    let name = raw
      .get("name")
      .and_then(Value::as_str)
      .filter(|n| !n.trim().is_empty())
      .unwrap_or(id)
      .to_string();
    let mut mods: Vec<InterchangeProfileMod> = Vec::new();
    let entries = raw
      .get("mods")
      .and_then(Value::as_array)
      .cloned()
      .unwrap_or_default();
    for (index, entry) in entries.iter().enumerate() {
      let by_id = entry
        .get("gameBananaId")
        .and_then(Value::as_u64)
        .and_then(|gb| {
          [
            format!("gamebanana:mod:{gb}"),
            format!("gamebanana:sound:{gb}"),
          ]
          .into_iter()
          .find(|key| library_keys.contains(key))
        });
      let by_file = || {
        entry
          .get("fileName")
          .and_then(Value::as_str)
          .and_then(|file| key_by_file.get(&file.to_lowercase()).cloned())
      };
      let Some(mod_key) = by_id.or_else(by_file) else {
        unresolved += 1;
        continue;
      };
      if mods.iter().any(|m| m.mod_key == mod_key) {
        continue;
      }
      let order = entry
        .get("priority")
        .and_then(Value::as_u64)
        .unwrap_or(index as u64) as u32;
      mods.push(InterchangeProfileMod {
        mod_key,
        enabled: entry
          .get("enabled")
          .and_then(Value::as_bool)
          .unwrap_or(false),
        order,
      });
    }
    mods.sort_by_key(|m| m.order);

    let key = format!("profile:{id}");
    let crosshair_key = raw
      .get("crosshair")
      .map(crosshair_convars)
      .filter(|convars| !convars.is_empty())
      .map(|convars| {
        let crosshair_key = format!("crosshair:{key}");
        document.crosshairs.push(InterchangeCrosshair {
          key: crosshair_key.clone(),
          name: format!("{name} crosshair"),
          active: false,
          convars,
        });
        crosshair_key
      });
    let autoexec = raw
      .get("autoexecCommands")
      .and_then(Value::as_array)
      .map(|commands| {
        commands
          .iter()
          .filter_map(|c| c.as_str().map(str::to_string))
          .collect::<Vec<_>>()
      })
      .filter(|commands| !commands.is_empty());

    document.profiles.push(InterchangeProfile {
      key,
      name,
      active: Some(id) == active_id,
      description: None,
      mods,
      crosshair_key,
      autoexec,
    });
  }
  if !document.profiles.is_empty() {
    document.include(SECTION_PROFILES);
  }
  if unresolved > 0 {
    document.warnings.push(format!(
      "{unresolved} profile entr(ies) point at mods that are no longer installed in Grimoire and were left out"
    ));
  }
}

/// `crosshair-presets.json` is `{ presets: [...], activePresetId }`; very old
/// builds wrote a bare array.
fn read_crosshair_presets(user_data_dir: &Path, document: &mut InterchangeDocument) {
  let file: Value = fs::read_to_string(user_data_dir.join("crosshair-presets.json"))
    .ok()
    .and_then(|text| serde_json::from_str(&text).ok())
    .unwrap_or(Value::Null);
  let active_id = file.get("activePresetId").and_then(Value::as_str);
  let presets = match &file {
    Value::Array(items) => items.clone(),
    Value::Object(object) => object
      .get("presets")
      .and_then(Value::as_array)
      .cloned()
      .unwrap_or_default(),
    _ => Vec::new(),
  };
  for raw in presets {
    let Some(id) = raw.get("id").and_then(Value::as_str) else {
      continue;
    };
    let convars = raw
      .get("settings")
      .map(crosshair_convars)
      .unwrap_or_default();
    if convars.is_empty() {
      continue;
    }
    document.crosshairs.push(InterchangeCrosshair {
      key: format!("crosshair:preset:{id}"),
      name: raw
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or("Grimoire crosshair")
        .to_string(),
      active: Some(id) == active_id,
      convars,
    });
  }
  if !document.crosshairs.is_empty() {
    document.include(SECTION_CROSSHAIRS);
  }
}

fn active_profile_name(user_data_dir: &Path, settings: &Map<String, Value>) -> Option<String> {
  let active = settings.get("activeProfileId").and_then(Value::as_str)?;
  let profiles: Value =
    serde_json::from_str(&fs::read_to_string(user_data_dir.join("profiles.json")).ok()?).ok()?;
  profiles
    .as_array()?
    .iter()
    .find(|profile| profile.get("id").and_then(Value::as_str) == Some(active))?
    .get("name")?
    .as_str()
    .map(str::to_string)
}

fn file_stem(file_name: &str) -> String {
  let lower = file_name.to_ascii_lowercase();
  let trimmed = if lower.ends_with("_dir.vpk") {
    &file_name[..file_name.len() - "_dir.vpk".len()]
  } else if lower.ends_with(".vpk") {
    &file_name[..file_name.len() - ".vpk".len()]
  } else {
    file_name
  };
  trimmed.to_string()
}

fn build_mod(key: &GroupKey, items: &[Resolved]) -> Option<InterchangeMod> {
  let first = items.first()?;
  let meta = items.iter().find_map(|item| item.meta.as_ref());
  let pick = |field: &str| {
    meta
      .and_then(|meta| meta_str(meta, field))
      .map(str::to_string)
  };

  let hero = pick("lockerHero");
  let source_file_name = pick("sourceFileName");
  let name = pick("modName")
    .or_else(|| source_file_name.clone())
    .or_else(|| {
      let stem = file_stem(&first.candidate.file_name);
      let readable = !ENABLED_PAK.is_match(&first.candidate.file_name);
      match (&hero, readable) {
        (_, true) => Some(stem.replace('_', " ")),
        (Some(hero), false) => Some(format!("{hero} mod ({stem})")),
        (None, false) => Some(format!("Grimoire mod ({stem})")),
      }
    })?;

  let enabled = items.iter().any(|item| item.candidate.enabled);
  let base_slug = {
    let slug = slugify(&name, 40);
    if slug.is_empty() {
      "mod".to_string()
    } else {
      slug
    }
  };
  let mut used_names = HashSet::new();
  let files: Vec<InterchangeFile> = items
    .iter()
    .enumerate()
    .map(|(index, item)| {
      // Grimoire's enabled files are bare `pakNN_dir.vpk`; give them a
      // readable, unique name so the target library does not show slots.
      let original = &item.candidate.file_name;
      let mut file_name = if ENABLED_PAK.is_match(original) || !is_plain_vpk_name(original) {
        format!("{base_slug}_dir.vpk")
      } else {
        original.clone()
      };
      let mut counter = 2;
      while !used_names.insert(file_name.to_lowercase()) {
        file_name = format!("{base_slug}_{counter}_dir.vpk");
        counter += 1;
      }
      let selected = if enabled {
        item.candidate.enabled
      } else {
        index == 0
      };
      InterchangeFile {
        name: file_name,
        path: item.candidate.path.to_string_lossy().to_string(),
        sha256: Some(item.sha256.clone()),
        size: Some(item.size),
        selected: Some(selected),
      }
    })
    .collect();

  let (entry_key, origin, link) = match key {
    GroupKey::GameBanana(kind, id) => {
      let (type_name, kind, section) = match kind {
        SubmissionKindOrd::Mod => ("mod", SubmissionKind::Mod, "mods"),
        SubmissionKindOrd::Sound => ("sound", SubmissionKind::Sound, "sounds"),
      };
      (
        format!("gamebanana:{type_name}:{id}"),
        InterchangeOrigin::GameBanana(GameBananaOrigin {
          submission_type: kind,
          submission_id: id.to_string(),
          file_id: meta.and_then(|meta| meta_u64(meta, "gameBananaFileId")),
          file_name: source_file_name,
        }),
        Some(format!("https://gamebanana.com/{section}/{id}")),
      )
    }
    GroupKey::Local(hash) => (
      format!("local:sha256:{hash}"),
      InterchangeOrigin::Local(LocalOrigin::default()),
      None,
    ),
  };

  let meta_keys: Vec<String> = items
    .iter()
    .map(|item| item.candidate.meta_key.clone())
    .collect();

  Some(InterchangeMod {
    key: entry_key,
    name,
    enabled,
    order: 0,
    origin,
    author: pick("author"),
    description: None,
    category: pick("categoryName"),
    hero,
    thumbnail_url: pick("thumbnailUrl").filter(|url| url.starts_with("http")),
    link,
    nsfw: meta
      .and_then(|meta| meta.get("nsfw"))
      .and_then(Value::as_bool),
    files,
    extensions: Some(serde_json::json!({ MANAGER_ID: { "metaKeys": meta_keys } })),
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  fn write(path: &Path, bytes: &[u8]) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, bytes).unwrap();
  }

  struct World {
    _dir: tempfile::TempDir,
    user_data: PathBuf,
    game: PathBuf,
  }

  fn world(metadata: Value) -> World {
    let dir = tempfile::tempdir().unwrap();
    let user_data = dir.path().join("grimoire");
    let game = dir.path().join("Deadlock");
    let addons = game.join("game/citadel/addons");
    fs::create_dir_all(&addons).unwrap();
    write(
      &user_data.join("settings.json"),
      serde_json::json!({ "deadlockPath": game })
        .to_string()
        .as_bytes(),
    );
    write(
      &user_data.join("mod-metadata.json"),
      metadata.to_string().as_bytes(),
    );
    World {
      _dir: dir,
      user_data,
      game,
    }
  }

  fn hash(bytes: &[u8]) -> String {
    use sha2::Digest;
    format!("{:x}", sha2::Sha256::digest(bytes))
  }

  #[test]
  fn reads_enabled_disabled_and_overflow_mods_in_load_order() {
    let w = world(serde_json::json!({
      "pak02_dir.vpk": { "modName": "Second", "gameBananaId": 22, "sha256": hash(b"second") },
      "pak01_dir.vpk": { "modName": "First", "gameBananaId": 11, "gameBananaFileId": 5, "sha256": hash(b"first") },
      "addons1/pak01_dir.vpk": { "modName": "Overflow", "sha256": hash(b"overflow") },
      "cool_skin_dir.vpk": { "modName": "Parked", "gameBananaId": 33, "sourceSection": "Sound", "lastPriority": 4 }
    }));
    let citadel = w.game.join("game/citadel");
    write(&citadel.join("addons/pak01_dir.vpk"), b"first");
    write(&citadel.join("addons/pak02_dir.vpk"), b"second");
    write(&citadel.join("addons1/pak01_dir.vpk"), b"overflow");
    write(
      &citadel.join("addons/.disabled/cool_skin_dir.vpk"),
      b"parked",
    );

    let document = read(&w.user_data, None).unwrap();
    let names: Vec<&str> = document.mods.iter().map(|m| m.name.as_str()).collect();
    assert_eq!(names, ["First", "Second", "Overflow", "Parked"]);
    assert!(document.mods[0].enabled && !document.mods[3].enabled);
    assert_eq!(document.mods[3].key, "gamebanana:sound:33");
    assert_eq!(
      document.mods[2].key,
      format!("local:sha256:{}", hash(b"overflow"))
    );
    match &document.mods[0].origin {
      InterchangeOrigin::GameBanana(origin) => assert_eq!(origin.file_id, Some(5)),
      InterchangeOrigin::Local(_) => panic!("expected GameBanana origin"),
    }
  }

  #[test]
  fn stale_fingerprints_downgrade_to_local_and_dmm_files_are_excluded() {
    let w = world(serde_json::json!({
      "pak01_dir.vpk": { "modName": "Old identity", "gameBananaId": 9, "sha256": hash(b"old bytes") }
    }));
    let addons = w.game.join("game/citadel/addons");
    write(&addons.join("pak01_dir.vpk"), b"new bytes");
    write(&addons.join("pak02_dir.vpk"), b"dmm owned");
    write(&addons.join("123_cool_dir.vpk"), b"dmm parked");
    write(
      &addons.join(".dmm.json"),
      br#"{"version":3,"mods":{"123":{"enabled":true,"order":0,"shard":1,"currentVpks":["pak02_dir.vpk"]}}}"#,
    );

    let document = read(&w.user_data, None).unwrap();
    assert_eq!(document.mods.len(), 1);
    assert!(document.mods[0].key.starts_with("local:sha256:"));
    assert!(document.warnings.iter().any(|w| w.contains("fingerprint")));
    assert!(
      document
        .warnings
        .iter()
        .any(|w| w.contains("Deadlock Mod Manager"))
    );
  }

  #[test]
  fn corrupt_metadata_falls_back_to_backup_then_to_files_only() {
    let w = world(serde_json::json!({}));
    fs::write(w.user_data.join("mod-metadata.json"), b"{broken").unwrap();
    write(
      &w.user_data
        .join("mod-metadata.backups/2026-01-01_pre-x.json"),
      serde_json::json!({ "pak01_dir.vpk": { "modName": "From backup", "gameBananaId": 7 } })
        .to_string()
        .as_bytes(),
    );
    write(&w.game.join("game/citadel/addons/pak01_dir.vpk"), b"x");
    let document = read(&w.user_data, None).unwrap();
    assert_eq!(document.mods[0].name, "From backup");

    fs::remove_dir_all(w.user_data.join("mod-metadata.backups")).unwrap();
    let document = read(&w.user_data, None).unwrap();
    assert_eq!(document.mods[0].name, "Grimoire mod (pak01)");
  }

  #[test]
  fn variants_of_one_submission_become_one_mod_with_selection() {
    let w = world(serde_json::json!({
      "pak01_dir.vpk": { "modName": "Skin", "gameBananaId": 5, "sha256": hash(b"blue") },
      "skin_red_dir.vpk": { "modName": "Skin", "gameBananaId": 5 },
      "skin_copy_dir.vpk": { "modName": "Skin", "gameBananaId": 5 }
    }));
    let addons = w.game.join("game/citadel/addons");
    write(&addons.join("pak01_dir.vpk"), b"blue");
    write(&addons.join(".disabled/skin_red_dir.vpk"), b"red");
    write(&addons.join(".disabled/skin_copy_dir.vpk"), b"blue");

    let document = read(&w.user_data, None).unwrap();
    assert_eq!(document.mods.len(), 1);
    let files = &document.mods[0].files;
    assert_eq!(files.len(), 2);
    assert_eq!(files[0].name, "skin_dir.vpk");
    assert_eq!(files[0].selected, Some(true));
    assert_eq!(files[1].selected, Some(false));
  }

  #[test]
  fn reads_profiles_crosshairs_and_autoexec() {
    let w = world(serde_json::json!({
      "pak01_dir.vpk": { "modName": "Skin", "gameBananaId": 5, "sha256": hash(b"skin") },
      "thing_dir.vpk": { "modName": "Thing" }
    }));
    let addons = w.game.join("game/citadel/addons");
    write(&addons.join("pak01_dir.vpk"), b"skin");
    write(&addons.join(".disabled/thing_dir.vpk"), b"thing");
    write(
      &w.user_data.join("settings.json"),
      serde_json::json!({ "deadlockPath": w.game, "activeProfileId": "p2" })
        .to_string()
        .as_bytes(),
    );
    write(
      &w.user_data.join("profiles.json"),
      serde_json::json!([
        { "id": "p1", "name": "Casual", "mods": [
          { "fileName": "thing_dir.vpk", "enabled": true, "priority": 3 },
          { "fileName": "gone_dir.vpk", "enabled": true, "priority": 4 }
        ], "crosshair": { "pipGap": 4, "pipGapStatic": true, "legacyField": 1 },
          "autoexecCommands": ["fps_max 240"] },
        { "id": "p2", "name": "Ranked", "mods": [
          { "fileName": "pak09_dir.vpk", "gameBananaId": 5, "enabled": true, "priority": 1 }
        ] }
      ])
      .to_string()
      .as_bytes(),
    );
    write(
      &w.user_data.join("crosshair-presets.json"),
      serde_json::json!({
        "presets": [{ "id": "x", "name": "Dot", "settings": { "dotSize": 3 } }],
        "activePresetId": "x"
      })
      .to_string()
      .as_bytes(),
    );

    let document = read(&w.user_data, None).unwrap();
    assert_eq!(document.contents, ["mods", "profiles", "crosshairs"]);
    let casual = &document.profiles[0];
    assert_eq!(casual.mods.len(), 1);
    assert!(casual.mods[0].mod_key.starts_with("local:sha256:"));
    assert_eq!(
      casual.autoexec.as_deref(),
      Some(&["fps_max 240".to_string()][..])
    );
    let ranked = &document.profiles[1];
    assert!(ranked.active);
    assert_eq!(ranked.mods[0].mod_key, "gamebanana:mod:5");
    let profile_crosshair = document
      .crosshairs
      .iter()
      .find(|c| Some(&c.key) == casual.crosshair_key.as_ref())
      .unwrap();
    assert_eq!(profile_crosshair.convars["citadel_crosshair_pip_gap"], "4");
    assert_eq!(
      profile_crosshair.convars["citadel_crosshair_pip_gap_static"],
      "true"
    );
    assert!(!profile_crosshair.convars.contains_key("legacyField"));
    assert!(
      document
        .crosshairs
        .iter()
        .any(|c| c.name == "Dot" && c.active)
    );
    assert!(
      document
        .warnings
        .iter()
        .any(|w| w.contains("no longer installed"))
    );
  }

  #[test]
  fn falls_back_to_the_dmm_game_path() {
    let w = world(serde_json::json!({}));
    fs::write(w.user_data.join("settings.json"), b"{}").unwrap();
    assert!(read(&w.user_data, None).is_err());
    assert!(read(&w.user_data, Some(&w.game)).is_ok());
  }
}
