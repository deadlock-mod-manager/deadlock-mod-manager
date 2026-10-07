//! Reader adapter: Grimoire's native on-disk data -> interchange document.
//!
//! Grimoire (an Electron mod manager) keeps no mod library of its own. The
//! game folder is the library:
//! - enabled mods are `pakNN_dir.vpk` in `citadel/addons`, the overflow roots
//!   `citadel/addons1..9`, and the "Global" priority root `citadel/grimoire`
//!   (slots 5+; 1-4 are Locker output), which the game searches first,
//! - disabled mods are free-form `*_dir.vpk` files in `citadel/addons/.disabled`,
//! - identity lives in `<userData>/mod-metadata.json`, keyed by the file name
//!   (`addonsN/<file>` and `grimoire/<file>` outside the base folder) and
//!   fingerprinted with `sha256`. Grimoire can "imprint" a VPK, which changes
//!   its bytes; the original hash then travels inside it as `addoninfo.txt`.
//!
//! Every Grimoire version writes the same shape, but the sidecar drifts: slots
//! get reused by other tools and entries go stale. So a file's identity comes
//! from its bytes, never from its name alone:
//! 1. A file DMM claims (its manifest, or its `<id>_` parking prefix) is that
//!    DMM mod when the bytes match a file in DMM's mod store.
//! 2. Grimoire's entry under the file's name, when its `sha256` matches.
//! 3. Grimoire's entry with the same `sha256` under another name: files move
//!    when either manager reorders slots, and Grimoire writes bare rows for
//!    files it moves without knowing them.
//! 4. Otherwise a local mod.
//!
//! A missing or corrupt sidecar falls back to Grimoire's own backups, then to
//! no metadata at all.

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
use crate::providers::{SubmissionProvider, SubmissionRef, SubmissionType};
use regex::Regex;
use serde::Serialize;
use serde_json::{Map, Value};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::LazyLock;
use vpk_parser::VpkParser;

pub const MANAGER_ID: &str = "grimoire";

static ENABLED_PAK: LazyLock<Regex> =
  LazyLock::new(|| Regex::new(r"(?i)^pak(\d+)_dir\.vpk$").expect("valid regex"));
static OVERFLOW_ROOT: LazyLock<Regex> =
  LazyLock::new(|| Regex::new(r"(?i)^addons(\d+)$").expect("valid regex"));
static VPK_CHUNK: LazyLock<Regex> =
  LazyLock::new(|| Regex::new(r"(?i)_\d{3}\.vpk$").expect("valid regex"));
/// Grimoire's staging names while it moves files (`tmp<hex>_<n>_<name>`).
static STAGING_TEMP: LazyLock<Regex> =
  LazyLock::new(|| Regex::new(r"(?i)^tmp[0-9a-f]{8}_\d+_").expect("valid regex"));
static EMBEDDED_ORIGINAL: LazyLock<Regex> = LazyLock::new(|| {
  Regex::new(r#"(?i)"?(?:grimoire)?originalsha256"?\s+"?([0-9a-f]{64})"?"#).expect("valid regex")
});

/// `archive_index` of a VPK entry stored in the `_dir.vpk` itself.
const INLINE_ARCHIVE_INDEX: u16 = 0x7fff;

/// Grimoire's priority root and its first slot for user ("Global") mods.
const PRIORITY_ROOT: &str = "grimoire";
const PRIORITY_FIRST_SLOT: u64 = 5;

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
  let fallback_dir = candidates.first().cloned();
  let Some(dir) = candidates.into_iter().find(|dir| looks_like_user_data(dir)) else {
    // Grimoire's own data is gone (uninstalled and cleaned up), but its mods
    // may still be in the game folder: read them from there, by file only.
    if let Some(game) = fallback_game_path.filter(|game| has_grimoire_mods(game))
      && let Some(dir) = fallback_dir
    {
      return GrimoireDetection {
        found: true,
        user_data_dir: Some(dir.display().to_string()),
        deadlock_path: Some(game.display().to_string()),
        has_metadata: false,
        searched,
      };
    }
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

/// Grimoire's own folders in the game: `.disabled` parking and the priority
/// root. Neither is created by the game or by DMM.
fn has_grimoire_mods(game: &Path) -> bool {
  let citadel = game.join("game").join("citadel");
  [
    citadel.join("addons").join(".disabled"),
    citadel.join(PRIORITY_ROOT),
  ]
  .iter()
  .any(|dir| !vpk_files_in(dir).is_empty())
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
  /// Global load position: the priority root first, then each addon folder
  /// (folder * 100 + pak number), then everything that is not loaded.
  load_position: u64,
  /// The DMM mod id DMM's records give this file, if any.
  dmm_claim: Option<String>,
}

/// The `*_dir.vpk` files Grimoire lists from one folder (its scan ignores any
/// other `.vpk`), minus its own transient staging files.
fn vpk_files_in(dir: &Path) -> Vec<(PathBuf, String)> {
  let mut files: Vec<(PathBuf, String)> = fs::read_dir(dir)
    .map(|entries| {
      entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()))
        .filter_map(|entry| {
          let name = entry.file_name().to_str()?.to_string();
          let lower = name.to_ascii_lowercase();
          (lower.ends_with("_dir.vpk")
            && !name.starts_with('.')
            && !STAGING_TEMP.is_match(&name)
            && !lower.contains(".merge-rebuild"))
          .then(|| (entry.path(), name))
        })
        .collect()
    })
    .unwrap_or_default();
  files.sort_by(|a, b| a.1.cmp(&b.1));
  files
}

/// Whether a `_dir.vpk` has `_000.vpk`-style archive parts next to it. DMM
/// moves and copies single files only, so such a mod would arrive broken.
fn has_archive_parts(path: &Path) -> bool {
  let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
    return false;
  };
  let Some(stem) = name
    .len()
    .checked_sub("_dir.vpk".len())
    .map(|end| name[..end].to_ascii_lowercase())
  else {
    return false;
  };
  let Some(dir) = path.parent() else {
    return false;
  };
  fs::read_dir(dir).is_ok_and(|entries| {
    entries.flatten().any(|entry| {
      entry.file_name().to_str().is_some_and(|other| {
        let other = other.to_ascii_lowercase();
        other
          .strip_prefix(&stem)
          .is_some_and(|rest| VPK_CHUNK.is_match(rest) && rest.len() == "_000.vpk".len())
      })
    })
  })
}

/// Files DMM's default profile lists, by path, with the mod id that lists
/// them. Both managers share `citadel/addons`, and either may have moved the
/// file since, so a listing is only a claim (see [`DmmClaim`]).
fn dmm_listed_files(addons: &Path) -> HashMap<String, String> {
  let mut listed = HashMap::new();
  let Ok(base) = ProfileBase::new(addons) else {
    return listed;
  };
  let Ok(manifest) = ProfileVpkManifest::load(addons) else {
    return listed;
  };
  for (mod_id, entry) in &manifest.mods {
    for path in entry.file_paths(&base) {
      listed.insert(normalize(&path), mod_id.clone());
    }
  }
  listed
}

fn normalize(path: &Path) -> String {
  path.to_string_lossy().replace('\\', "/").to_lowercase()
}

/// The DMM mod id in a parked file's `<id>_<name>.vpk` prefix.
fn dmm_prefix(file_name: &str) -> Option<&str> {
  file_name
    .split_once('_')
    .map(|(slug, _)| slug)
    .filter(|slug| SubmissionRef::parse_slug(slug).is_ok())
}

/// What DMM's own records say about a file, checked against its bytes.
#[derive(Debug, Clone, PartialEq, Eq)]
enum DmmClaim {
  /// The bytes match a file DMM keeps for this mod: the file is that mod.
  Confirmed(String),
  /// DMM keeps files for the mod, but not these bytes: the listing is stale
  /// (Grimoire moved another mod into the slot).
  Stale,
  /// DMM keeps no files for the mod, so the bytes cannot be checked.
  Unverifiable,
}

/// `(path, size)` of the VPKs DMM keeps for `mod_id`; empty when it keeps none.
fn dmm_store_files(store: &Path, mod_id: &str) -> Vec<(PathBuf, u64)> {
  fs::read_dir(store.join(mod_id).join("files"))
    .map(|entries| {
      entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
          path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("vpk"))
        })
        .filter_map(|path| Some((path.clone(), fs::metadata(&path).ok()?.len())))
        .collect()
    })
    .unwrap_or_default()
}

/// What the bytes say about DMM's claim on a file. `kept` is what
/// [`dmm_store_files`] found for the mod, `store_hashes` the hashes of those
/// files that could match.
fn judge_dmm_claim(
  mod_id: &str,
  sha256: &str,
  kept: &[(PathBuf, u64)],
  store_hashes: &HashMap<PathBuf, String>,
) -> DmmClaim {
  if kept.is_empty() {
    DmmClaim::Unverifiable
  } else if kept.iter().any(|(path, _)| {
    store_hashes
      .get(path)
      .is_some_and(|hash| hash.eq_ignore_ascii_case(sha256))
  }) {
    DmmClaim::Confirmed(mod_id.to_string())
  } else {
    DmmClaim::Stale
  }
}

fn collect_candidates(citadel: &Path, warnings: &mut Vec<String>) -> Vec<Candidate> {
  let addons = citadel.join("addons");
  let listed = dmm_listed_files(&addons);
  // (load rank, folder, metadata key prefix). The priority root is searched
  // before every addon folder; overflow folders follow the base folder.
  let mut roots: Vec<(u64, PathBuf, Option<String>)> = vec![
    (
      0,
      citadel.join(PRIORITY_ROOT),
      Some(PRIORITY_ROOT.to_string()),
    ),
    (1, addons.clone(), None),
  ];
  if let Ok(entries) = fs::read_dir(citadel) {
    for entry in entries.flatten() {
      let Some(name) = entry.file_name().to_str().map(str::to_string) else {
        continue;
      };
      if let Some(captures) = OVERFLOW_ROOT.captures(&name)
        && entry.path().is_dir()
        && let Ok(index) = captures[1].parse::<u64>()
      {
        roots.push((index + 1, entry.path(), Some(name)));
      }
    }
  }
  roots.sort_by_key(|(rank, _, _)| *rank);

  let mut candidates = Vec::new();
  let mut parked_by_dmm = 0usize;
  let mut multipart = Vec::new();
  let mut unloaded = 0u64;
  for (rank, root, root_name) in &roots {
    let is_priority_root = *rank == 0;
    for (path, file_name) in vpk_files_in(root) {
      // DMM parks disabled mods next to the slots; they are DMM's alone.
      if dmm_prefix(&file_name).is_some() {
        parked_by_dmm += 1;
        continue;
      }
      let dmm_claim = listed.get(&normalize(&path)).cloned();
      let meta_key = match root_name {
        Some(root_name) => format!("{root_name}/{file_name}"),
        None => file_name.clone(),
      };
      let slot = ENABLED_PAK
        .captures(&file_name)
        .and_then(|captures| captures[1].parse::<u64>().ok());
      if is_priority_root && slot.is_none_or(|slot| slot < PRIORITY_FIRST_SLOT) {
        // Locker output (pak01-04) and anything the game does not mount.
        continue;
      }
      if has_archive_parts(&path) {
        multipart.push(file_name);
        continue;
      }
      // Grimoire lists any `*_dir.vpk` in an addon folder, but the game only
      // mounts `pakNN_dir.vpk`: anything else is imported as disabled.
      let (enabled, load_position) = match slot {
        Some(slot) => (true, rank * 100 + slot),
        None => {
          unloaded += 1;
          (false, 50_000 + unloaded)
        }
      };
      candidates.push(Candidate {
        path,
        file_name,
        meta_key,
        enabled,
        load_position,
        dmm_claim,
      });
    }
  }

  let disabled_dir = addons.join(".disabled");
  for (index, (path, file_name)) in vpk_files_in(&disabled_dir).into_iter().enumerate() {
    if has_archive_parts(&path) {
      multipart.push(file_name);
      continue;
    }
    // Grimoire moves every unknown `*_dir.vpk` out of the slots, DMM's parked
    // copies included; the prefix still names the mod they came from.
    let dmm_claim = dmm_prefix(&file_name).map(str::to_string);
    candidates.push(Candidate {
      meta_key: file_name.clone(),
      file_name,
      path,
      enabled: false,
      load_position: 100_000 + index as u64,
      dmm_claim,
    });
  }

  if parked_by_dmm > 0 {
    warnings.push(format!(
      "{parked_by_dmm} disabled Deadlock Mod Manager file(s) in the shared addons folder were left out"
    ));
  }
  if !multipart.is_empty() {
    warnings.push(format!(
      "{} mod(s) are split into several archive parts, which Deadlock Mod Manager cannot load, and were left out: {}",
      multipart.len(),
      multipart.join(", ")
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

/// Grimoire also writes a bare row (a hash, a guessed hero) for every VPK it
/// sees without knowing it, including other managers' files. Only a row that
/// says which mod the file is counts as an identity.
fn has_identity(meta: &Map<String, Value>) -> bool {
  meta_u64(meta, "gameBananaId").is_some() || meta_str(meta, "modName").is_some()
}

/// The GameBanana submission a row names, as `(id, is_sound)`; `None` for a
/// local mod, which its bytes identify.
fn meta_submission(meta: &Map<String, Value>) -> Option<(u64, bool)> {
  meta_u64(meta, "gameBananaId").map(|id| (id, meta_str(meta, "sourceSection") == Some("Sound")))
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
  /// A local mod DMM already has, by its DMM id.
  DmmLocal(String),
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
  /// Grimoire's identity for the file (see [`embedded_original_sha256`]).
  canonical: String,
  size: u64,
  meta: Option<Map<String, Value>>,
  /// The DMM mod these bytes are (see [`DmmClaim::Confirmed`]).
  dmm_id: Option<String>,
}

/// The group a DMM mod id imports under; `None` for ids the interchange
/// cannot name (WIP submissions).
fn dmm_group_key(mod_id: &str) -> Option<GroupKey> {
  let reference = SubmissionRef::parse_slug(mod_id).ok()?;
  let number = || reference.submission_id.parse::<u64>().ok();
  match (reference.provider, reference.submission_type) {
    (SubmissionProvider::Local, _) => Some(GroupKey::DmmLocal(mod_id.to_string())),
    (SubmissionProvider::Gamebanana, SubmissionType::Mod) => {
      Some(GroupKey::GameBanana(SubmissionKindOrd::Mod, number()?))
    }
    (SubmissionProvider::Gamebanana, SubmissionType::Sound) => {
      Some(GroupKey::GameBanana(SubmissionKindOrd::Sound, number()?))
    }
    (SubmissionProvider::Gamebanana, SubmissionType::Wip) => None,
  }
}

impl Resolved {
  fn group_key(&self) -> GroupKey {
    if let Some(key) = self.dmm_id.as_deref().and_then(dmm_group_key) {
      return key;
    }
    let Some(meta) = &self.meta else {
      return GroupKey::Local(self.sha256.clone());
    };
    match meta_u64(meta, "gameBananaId") {
      Some(id) if meta_str(meta, "sourceSection") == Some("Sound") => {
        GroupKey::GameBanana(SubmissionKindOrd::Sound, id)
      }
      Some(id) => GroupKey::GameBanana(SubmissionKindOrd::Mod, id),
      None => GroupKey::Local(self.sha256.clone()),
    }
  }
}

/// How a read reports progress and where it caches file hashes.
pub struct ReadContext<'a> {
  pub hashes: &'a HashCache,
  /// `(files checked, total files, current file name)`.
  pub progress: &'a (dyn Fn(usize, usize, &str) + Sync),
  /// DMM's mod store (`<app data>/mods`), to check DMM's claims on files.
  pub dmm_store: Option<&'a Path>,
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
      dmm_store: None,
    },
  )
}

/// Read Grimoire's library as an interchange document. File paths are
/// absolute; nothing on disk is modified.
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
  if !looks_like_user_data(user_data_dir) {
    document.warnings.push(
      "Grimoire's settings were not found; mods are read from the game folder only, without names, profiles or crosshairs"
        .to_string(),
    );
  }

  // Locker output is left out before any file is read.
  let mut generated = 0usize;
  let mut kept = Vec::new();
  for candidate in collect_candidates(&citadel, &mut document.warnings) {
    let meta = metadata
      .entries
      .get(&candidate.meta_key)
      .and_then(Value::as_object)
      .cloned();
    if meta.as_ref().is_some_and(is_generated) {
      generated += 1;
      continue;
    }
    kept.push((candidate, meta));
  }
  let mut sized = Vec::new();
  for (candidate, meta) in kept {
    match fs::metadata(&candidate.path) {
      Ok(stat) => sized.push((candidate, meta, stat.len())),
      Err(error) => document.warnings.push(format!(
        "{}: unreadable ({error})",
        candidate.path.display()
      )),
    }
  }
  // DMM's claims are checked against the store files of the claimed size.
  let mut store_files: HashMap<String, Vec<(PathBuf, u64)>> = HashMap::new();
  for (candidate, _, _) in &sized {
    if let Some(mod_id) = &candidate.dmm_claim {
      store_files.entry(mod_id.clone()).or_insert_with(|| {
        context
          .dmm_store
          .map(|store| dmm_store_files(store, mod_id))
          .unwrap_or_default()
      });
    }
  }
  let mut store_paths: Vec<PathBuf> = sized
    .iter()
    .filter_map(|(candidate, _, size)| Some((candidate.dmm_claim.as_ref()?, *size)))
    .flat_map(|(mod_id, size)| {
      store_files[mod_id]
        .iter()
        .filter(move |(_, kept_size)| *kept_size == size)
        .map(|(path, _)| path.clone())
    })
    .collect();
  store_paths.sort();
  store_paths.dedup();

  // Hashing dominates the read: library and store files in one pass on all
  // cores, and unchanged files come from the cache without being read at all.
  let mut paths: Vec<PathBuf> = sized.iter().map(|(c, _, _)| c.path.clone()).collect();
  paths.extend(store_paths.iter().cloned());
  let mut hashes = context.hashes.hash_all(&paths, context.progress);
  context.hashes.save();
  let store_hashes: HashMap<PathBuf, String> = store_paths
    .into_iter()
    .zip(hashes.split_off(sized.len()))
    .filter_map(|(path, hash)| Some((path, hash.ok()?)))
    .collect();

  // Grimoire's entries that name a mod, by the hash they record. Rows that
  // record one hash as different mods name none of them.
  let mut by_hash: HashMap<String, Option<&Map<String, Value>>> = HashMap::new();
  for entry in metadata
    .entries
    .values()
    .filter_map(Value::as_object)
    .filter(|entry| has_identity(entry) && !is_generated(entry))
  {
    let Some(hash) = meta_str(entry, "sha256") else {
      continue;
    };
    by_hash
      .entry(hash.to_ascii_lowercase())
      .and_modify(|seen| {
        if seen.is_some_and(|seen| meta_submission(seen) != meta_submission(entry)) {
          *seen = None;
        }
      })
      .or_insert(Some(entry));
  }

  let mut resolved = Vec::new();
  let mut stale = 0usize;
  let mut dmm_only = 0usize;
  for ((candidate, meta, size), hash) in sized.into_iter().zip(hashes) {
    let sha256 = match hash {
      Ok(sha256) => sha256,
      Err(error) => {
        document.warnings.push(format!(
          "{}: could not be hashed ({error})",
          candidate.path.display()
        ));
        continue;
      }
    };
    // The identity Grimoire matches on: the original hash an imprint carries,
    // else the live bytes.
    let canonical = embedded_original_sha256(&candidate.path).unwrap_or_else(|| sha256.clone());
    let recorded_elsewhere = meta
      .as_ref()
      .and_then(|entry| meta_str(entry, "sha256"))
      .is_some_and(|recorded| !recorded.eq_ignore_ascii_case(&canonical));
    // The row under this name is about other bytes or names no mod: the
    // file's own entry, if Grimoire has one, carries the same hash.
    let meta = match meta {
      Some(entry) if !recorded_elsewhere && has_identity(&entry) => Some(entry),
      _ => by_hash.get(&canonical).copied().flatten().cloned(),
    };

    let claim = candidate
      .dmm_claim
      .as_deref()
      .map(|mod_id| judge_dmm_claim(mod_id, &sha256, &store_files[mod_id], &store_hashes));
    let dmm_id = match claim {
      Some(DmmClaim::Confirmed(mod_id)) if dmm_group_key(&mod_id).is_some() => Some(mod_id),
      // A DMM mod the interchange cannot name (a WIP submission), or one
      // only DMM's unverifiable record identifies: it stays DMM's alone
      // rather than coming back as a second copy.
      Some(DmmClaim::Confirmed(_)) => {
        dmm_only += 1;
        continue;
      }
      Some(DmmClaim::Unverifiable) if meta.is_none() => {
        dmm_only += 1;
        continue;
      }
      _ => None,
    };
    resolved.push((
      Resolved {
        candidate,
        sha256,
        canonical,
        size,
        meta,
        dmm_id,
      },
      recorded_elsewhere,
    ));
  }
  // Identical bytes are one mod: Grimoire's own copy of a file DMM confirmed
  // (it keeps one when DMM took over the slot) joins DMM's mod. Bytes DMM
  // confirmed as two different mods name neither.
  let mut confirmed: HashMap<String, Option<String>> = HashMap::new();
  for (item, _) in &resolved {
    let Some(mod_id) = &item.dmm_id else { continue };
    confirmed
      .entry(item.sha256.clone())
      .and_modify(|seen| {
        if seen.as_ref() != Some(mod_id) {
          *seen = None;
        }
      })
      .or_insert_with(|| Some(mod_id.clone()));
  }
  let resolved: Vec<Resolved> = resolved
    .into_iter()
    .map(|(mut item, recorded_elsewhere)| {
      if item.dmm_id.is_none() {
        item.dmm_id = confirmed.get(&item.sha256).cloned().flatten();
      }
      if item.dmm_id.is_none() && item.meta.is_none() && recorded_elsewhere {
        stale += 1;
      }
      // Bytes DMM confirmed as one GameBanana mod carry no other submission.
      if let Some(GroupKey::GameBanana(_, dmm_number)) =
        item.dmm_id.as_deref().and_then(dmm_group_key)
      {
        item.meta = item
          .meta
          .filter(|entry| meta_u64(entry, "gameBananaId").is_none_or(|n| n == dmm_number));
      }
      item
    })
    .collect();
  if stale > 0 {
    document.warnings.push(format!(
      "{stale} file(s) no longer match Grimoire's recorded fingerprint (the slot was reused); they are imported as local mods"
    ));
  }
  if dmm_only > 0 {
    document.warnings.push(format!(
      "{dmm_only} file(s) in the shared addons folder belong to Deadlock Mod Manager and were left out"
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
    groups.entry(item.group_key()).or_default().push(item);
  }

  let mut mods = Vec::new();
  let mut lookup = ProfileLookup::default();
  for (key, mut items) in groups {
    items.sort_by_key(|item| (!item.candidate.enabled, item.candidate.load_position));
    let entry_key = group_entry_key(&key);
    for item in &items {
      // Grimoire only matches a profile entry by file name when neither side
      // carries a GameBanana id (pakNN names are reused after every reorder);
      // its side is the file's own entry, whatever mod the bytes became here.
      let grimoire_id = item
        .meta
        .as_ref()
        .and_then(|meta| meta_u64(meta, "gameBananaId"));
      if grimoire_id.is_none() {
        lookup
          .by_file
          .insert(item.candidate.meta_key.to_lowercase(), entry_key.clone());
        lookup
          .by_file
          .insert(item.candidate.file_name.to_lowercase(), entry_key.clone());
      }
      lookup
        .by_hash
        .insert(item.canonical.to_lowercase(), entry_key.clone());
      if item
        .candidate
        .meta_key
        .starts_with(&format!("{PRIORITY_ROOT}/"))
      {
        lookup.global.insert(entry_key.clone());
      }
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

  read_profiles(user_data_dir, &settings, &lookup, &mut document);
  read_crosshair_presets(user_data_dir, &mut document);
  let mut warnings = Vec::new();
  drop_dangling_profile_entries(&document.mods, &mut document.profiles, &mut warnings);
  document.warnings.extend(warnings);
  Ok(document)
}

/// The pre-imprint hash Grimoire embeds in `addoninfo.txt` when it tags a
/// VPK in place. Runs for every file, so only the directory tree and that one
/// entry are read, never the whole VPK.
fn embedded_original_sha256(path: &Path) -> Option<String> {
  let entry = VpkParser::parse_directory_from_file(path)
    .ok()?
    .into_iter()
    .find(|entry| entry.full_path.eq_ignore_ascii_case("addoninfo.txt"))?;
  // Grimoire stores it inline, in the data section after the tree.
  if entry.archive_index != INLINE_ARCHIVE_INDEX {
    return None;
  }
  let mut file = fs::File::open(path).ok()?;
  let mut header = [0u8; 12];
  file.read_exact(&mut header).ok()?;
  let version = u32::from_le_bytes(header[4..8].try_into().ok()?);
  let tree_length = u32::from_le_bytes(header[8..12].try_into().ok()?);
  let data_start = if version >= 2 { 28 } else { 12 } + u64::from(tree_length);
  file
    .seek(SeekFrom::Start(data_start + u64::from(entry.entry_offset)))
    .ok()?;
  let mut bytes = vec![0u8; entry.entry_length as usize];
  file.read_exact(&mut bytes).ok()?;
  let text = String::from_utf8_lossy(&bytes);
  EMBEDDED_ORIGINAL
    .captures(&text)
    .map(|captures| captures[1].to_ascii_lowercase())
}

fn group_entry_key(key: &GroupKey) -> String {
  match key {
    GroupKey::GameBanana(SubmissionKindOrd::Mod, id) => format!("gamebanana:mod:{id}"),
    GroupKey::GameBanana(SubmissionKindOrd::Sound, id) => format!("gamebanana:sound:{id}"),
    GroupKey::DmmLocal(id) => format!("local:dmm:{id}"),
    GroupKey::Local(hash) => format!("local:sha256:{hash}"),
  }
}

fn is_generated(meta: &Map<String, Value>) -> bool {
  GENERATED_FLAGS.iter().any(|flag| meta.contains_key(*flag))
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
/// How Grimoire's profile entries find their library mod.
#[derive(Default)]
struct ProfileLookup {
  /// File name or metadata key -> entry key, local mods only.
  by_file: std::collections::HashMap<String, String>,
  /// Canonical sha256 -> entry key.
  by_hash: std::collections::HashMap<String, String>,
  /// Entry keys of "Global" mods, which load before every addon folder.
  global: HashSet<String>,
}

fn read_profiles(
  user_data_dir: &Path,
  settings: &Map<String, Value>,
  lookup: &ProfileLookup,
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
    let entries = raw
      .get("mods")
      .and_then(Value::as_array)
      .cloned()
      .unwrap_or_default();
    // (global first, saved priority, position) -> entry, like Grimoire's apply.
    let mut matched: Vec<((bool, u64, usize), InterchangeProfileMod)> = Vec::new();
    for (index, entry) in entries.iter().enumerate() {
      let gb_id = entry.get("gameBananaId").and_then(Value::as_u64);
      let by_id = gb_id.and_then(|gb| {
        [
          format!("gamebanana:mod:{gb}"),
          format!("gamebanana:sound:{gb}"),
        ]
        .into_iter()
        .find(|key| library_keys.contains(key))
      });
      let by_hash = || {
        entry
          .get("sha256")
          .and_then(Value::as_str)
          .and_then(|hash| lookup.by_hash.get(&hash.to_lowercase()).cloned())
      };
      let by_file = || {
        gb_id.is_none().then_some(())?;
        entry
          .get("fileName")
          .and_then(Value::as_str)
          .and_then(|file| lookup.by_file.get(&file.to_lowercase()).cloned())
      };
      let Some(mod_key) = by_id.or_else(by_hash).or_else(by_file) else {
        unresolved += 1;
        continue;
      };
      if matched.iter().any(|(_, m)| m.mod_key == mod_key) {
        continue;
      }
      let priority = entry
        .get("priority")
        .and_then(Value::as_u64)
        .unwrap_or(index as u64);
      matched.push((
        (!lookup.global.contains(&mod_key), priority, index),
        InterchangeProfileMod {
          mod_key,
          enabled: entry
            .get("enabled")
            .and_then(Value::as_bool)
            .unwrap_or(false),
          order: 0,
        },
      ));
    }
    matched.sort_by_key(|(rank, _)| *rank);
    let mods: Vec<InterchangeProfileMod> = matched
      .into_iter()
      .enumerate()
      .map(|(order, (_, mut entry))| {
        entry.order = order as u32;
        entry
      })
      .collect();

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
    GroupKey::DmmLocal(id) => (
      format!("local:dmm:{id}"),
      InterchangeOrigin::Local(LocalOrigin {
        local_id: Some(id.clone()),
      }),
      None,
    ),
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
  fn imprinted_files_keep_the_identity_of_their_original_hash() {
    let original = hash(b"before imprint");
    let w = world(serde_json::json!({
      "pak01_dir.vpk": { "modName": "Imprinted", "gameBananaId": 44, "sha256": original }
    }));
    let source = w.user_data.parent().unwrap().join("imprint");
    write(
      &source.join("addoninfo.txt"),
      format!(r#""AddonInfo" {{ "grimoireOriginalSha256" "{original}" }}"#).as_bytes(),
    );
    write(&source.join("scripts/skin.txt"), b"skin");
    let vpk = w.game.join("game/citadel/addons/pak01_dir.vpk");
    vpkmanager::pack_directory(&source, &vpk).unwrap();

    assert_eq!(embedded_original_sha256(&vpk), Some(original));
    let document = read(&w.user_data, None).unwrap();
    assert_eq!(keys(&document), ["gamebanana:mod:44"]);
    assert!(!document.warnings.iter().any(|w| w.contains("fingerprint")));
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

  fn read_with_store(w: &World, store: &Path) -> InterchangeDocument {
    let hashes = HashCache::open(None);
    read_with(
      &w.user_data,
      None,
      &ReadContext {
        hashes: &hashes,
        progress: &|_, _, _| {},
        dmm_store: Some(store),
      },
    )
    .unwrap()
  }

  fn keys(document: &InterchangeDocument) -> Vec<&str> {
    document.mods.iter().map(|m| m.key.as_str()).collect()
  }

  #[test]
  fn dmm_listings_count_only_when_the_bytes_match_dmms_store() {
    let w = world(serde_json::json!({
      "pak01_dir.vpk": { "modName": "Skin", "gameBananaId": 5, "sha256": hash(b"skin") },
      "pak02_dir.vpk": { "modName": "Hud", "gameBananaId": 6, "sha256": hash(b"hud") }
    }));
    let addons = w.game.join("game/citadel/addons");
    let store = w.user_data.parent().unwrap().join("dmm-store");
    // DMM imported both and laid them out; Grimoire then swapped the slots,
    // and a third mod DMM installed itself sits in pak03.
    write(&addons.join("pak01_dir.vpk"), b"hud");
    write(&addons.join("pak02_dir.vpk"), b"skin");
    write(&addons.join("pak03_dir.vpk"), b"dmm own");
    // Grimoire kept its own copy of the HUD when DMM took the slot over.
    write(&addons.join(".disabled/hud_copy_dir.vpk"), b"hud");
    write(&store.join("5/files/skin_dir.vpk"), b"skin");
    write(&store.join("6/files/hud_dir.vpk"), b"hud");
    write(&store.join("7/files/own_dir.vpk"), b"dmm own");
    write(
      &addons.join(".dmm.json"),
      br#"{"version":3,"mods":{
        "5":{"enabled":true,"order":0,"shard":1,"currentVpks":["pak01_dir.vpk"]},
        "6":{"enabled":true,"order":1,"shard":1,"currentVpks":["pak02_dir.vpk"]},
        "7":{"enabled":true,"order":2,"shard":1,"currentVpks":["pak03_dir.vpk"]}}}"#,
    );

    let document = read_with_store(&w, &store);
    // Bytes decide: pak01 is the HUD, pak02 the skin, pak03 DMM's own mod.
    let by_key = |key: &str| document.mods.iter().find(|m| m.key == key).unwrap();
    assert!(
      by_key("gamebanana:mod:6").files[0]
        .path
        .ends_with("pak01_dir.vpk")
    );
    assert!(
      by_key("gamebanana:mod:5").files[0]
        .path
        .ends_with("pak02_dir.vpk")
    );
    assert!(
      by_key("gamebanana:mod:7").files[0]
        .path
        .ends_with("pak03_dir.vpk")
    );
    assert_eq!(by_key("gamebanana:mod:6").name, "Hud");
    assert_eq!(document.mods.len(), 3, "the copy is the same mod");
    assert_eq!(by_key("gamebanana:mod:6").files.len(), 1);
    assert!(!document.warnings.iter().any(|w| w.contains("fingerprint")));
  }

  #[test]
  fn a_copy_of_bytes_dmm_confirmed_as_two_mods_joins_neither() {
    let w = world(serde_json::json!({}));
    let addons = w.game.join("game/citadel/addons");
    let store = w.user_data.parent().unwrap().join("dmm-store");
    write(&addons.join("pak01_dir.vpk"), b"same");
    write(&addons.join("pak02_dir.vpk"), b"same");
    write(&addons.join(".disabled/copy_dir.vpk"), b"same");
    write(&store.join("5/files/a_dir.vpk"), b"same");
    write(&store.join("6/files/b_dir.vpk"), b"same");
    write(
      &addons.join(".dmm.json"),
      br#"{"version":3,"mods":{
        "5":{"enabled":true,"order":0,"shard":1,"currentVpks":["pak01_dir.vpk"]},
        "6":{"enabled":true,"order":1,"shard":1,"currentVpks":["pak02_dir.vpk"]}}}"#,
    );

    let document = read_with_store(&w, &store);
    for key in ["gamebanana:mod:5", "gamebanana:mod:6"] {
      let found = document.mods.iter().find(|m| m.key == key).unwrap();
      assert_eq!(found.files.len(), 1, "{key} keeps only its own file");
    }
    assert_eq!(
      keys(&document)[2],
      format!("local:sha256:{}", hash(b"same")),
      "the copy stays a mod of its own"
    );
  }

  #[test]
  fn moved_files_take_an_identity_only_when_grimoire_rows_agree() {
    let w = world(serde_json::json!({
      "a_dir.vpk": { "modName": "Skin", "gameBananaId": 5, "sha256": hash(b"agreed") },
      "b_dir.vpk": { "modName": "Skin (copy)", "gameBananaId": 5, "sha256": hash(b"agreed") },
      "c_dir.vpk": { "modName": "Hud", "gameBananaId": 6, "sha256": hash(b"disputed") },
      "d_dir.vpk": { "modName": "Other", "gameBananaId": 7, "sha256": hash(b"disputed") }
    }));
    let addons = w.game.join("game/citadel/addons");
    write(&addons.join("pak01_dir.vpk"), b"agreed");
    write(&addons.join("pak02_dir.vpk"), b"disputed");

    let document = read(&w.user_data, None).unwrap();
    assert_eq!(
      keys(&document),
      [
        "gamebanana:mod:5".to_string(),
        format!("local:sha256:{}", hash(b"disputed"))
      ]
    );
  }

  #[test]
  fn files_grimoire_moved_without_knowing_them_keep_their_identity() {
    let w = world(serde_json::json!({
      "barkeep_dir.vpk": { "modName": "Barkeep", "gameBananaId": 720480, "sha256": hash(b"barkeep") },
      // Grimoire's bare row for DMM's parked copy it moved into `.disabled`.
      "720480_barkeep_dir.vpk": { "lockerHero": "Infernus", "lockerHeroVpkChecked": true },
      // A row left under a slot another mod now occupies.
      "pak01_dir.vpk": { "modName": "Old", "gameBananaId": 1, "sha256": hash(b"old") },
      "renamed_dir.vpk": { "modName": "Renamed", "gameBananaId": 9, "sha256": hash(b"renamed") }
    }));
    let addons = w.game.join("game/citadel/addons");
    write(&addons.join(".disabled/barkeep_dir.vpk"), b"barkeep");
    write(&addons.join(".disabled/720480_barkeep_dir.vpk"), b"barkeep");
    write(&addons.join("pak01_dir.vpk"), b"renamed");

    let document = read(&w.user_data, None).unwrap();
    assert_eq!(
      keys(&document),
      ["gamebanana:mod:9", "gamebanana:mod:720480"]
    );
    assert_eq!(document.mods[0].name, "Renamed");
    assert_eq!(document.mods[1].files.len(), 1, "identical copies collapse");
    assert!(!document.warnings.iter().any(|w| w.contains("fingerprint")));
  }

  #[test]
  fn dmm_local_mods_keep_their_dmm_id_and_unknown_dmm_files_stay_out() {
    let local = "local-0f8fad5b-d9cb-469f-a165-70867728950e";
    let w = world(serde_json::json!({}));
    let addons = w.game.join("game/citadel/addons");
    let store = w.user_data.parent().unwrap().join("dmm-store");
    write(&addons.join("pak01_dir.vpk"), b"local bytes");
    write(&addons.join("pak02_dir.vpk"), b"no store copy");
    write(&addons.join("pak03_dir.vpk"), b"wip bytes");
    write(
      &store.join(format!("{local}/files/mine_dir.vpk")),
      b"local bytes",
    );
    write(&store.join("wip-44/files/wip_dir.vpk"), b"wip bytes");
    write(
      &addons.join(".dmm.json"),
      format!(
        r#"{{"version":3,"mods":{{
          "{local}":{{"enabled":true,"order":0,"shard":1,"currentVpks":["pak01_dir.vpk"]}},
          "8":{{"enabled":true,"order":1,"shard":1,"currentVpks":["pak02_dir.vpk"]}},
          "wip-44":{{"enabled":true,"order":2,"shard":1,"currentVpks":["pak03_dir.vpk"]}}}}}}"#
      )
      .as_bytes(),
    );

    let document = read_with_store(&w, &store);
    assert_eq!(keys(&document), [format!("local:dmm:{local}").as_str()]);
    match &document.mods[0].origin {
      InterchangeOrigin::Local(origin) => assert_eq!(origin.local_id.as_deref(), Some(local)),
      InterchangeOrigin::GameBanana(_) => panic!("expected a local origin"),
    }
    assert_eq!(
      super::super::import::dmm_mod_id(&document.mods[0]).unwrap(),
      local
    );
    assert!(
      document
        .warnings
        .iter()
        .any(|w| w.starts_with("2 file(s)") && w.contains("Deadlock Mod Manager"))
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
