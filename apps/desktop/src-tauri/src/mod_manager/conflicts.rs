//! File-level conflict detection between the enabled mods of a profile.
//!
//! Two mods conflict when their VPKs ship the same entry path with different
//! contents. The engine resolves each path from the first VPK that provides it:
//! shard search paths are registered in ascending order in `gameinfo.gi`, and
//! inside a shard `pak01_dir.vpk` is mounted before `pak02_dir.vpk`. So the
//! mod with the lowest `(shard, pak number)` wins every file it shares.
//!
//! Only VPK directory trees are read, never file data, and parsed trees are
//! cached per VPK path until its mtime or size changes.

use crate::errors::Error;
use crate::mod_manager::shard::ProfileBase;
use crate::mod_manager::vpk_manager::VpkManager;
use crate::mod_manager::vpk_manifest::ProfileVpkManifest;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::SystemTime;
use ts_rs::TS;
use vpk_parser::VpkParser;

const IGNORES_FILENAME: &str = ".dmm-conflicts.json";
pub(crate) const IGNORES_TEMP_FILENAME: &str = ".dmm-conflicts.json.tmp";

/// How badly a shared file is likely to break the losing mod.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "lowercase")]
pub enum ConflictSeverity {
  Low,
  Normal,
  /// Model swaps: the losing mod's model never loads, and usually the rest of
  /// that mod looks broken without it.
  Critical,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct ConflictFile {
  pub path: String,
  pub severity: ConflictSeverity,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "lowercase")]
pub enum ConflictIgnoreReason {
  /// The pair itself was ignored.
  Pair,
  /// One of the two mods is ignored everywhere.
  Mod,
  /// Every shared file was ignored one by one.
  Files,
}

/// Two enabled mods that ship at least one identical path with different contents.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct ModConflict {
  /// Mod that loads first and therefore provides every shared file in game.
  pub winner: String,
  pub loser: String,
  /// Highest severity among the files that still count.
  pub severity: ConflictSeverity,
  /// Shared files that still count, most severe first.
  pub files: Vec<ConflictFile>,
  #[ts(optional)]
  #[serde(skip_serializing_if = "Option::is_none")]
  pub ignore_reason: Option<ConflictIgnoreReason>,
}

/// Per-profile conflict ignores, keyed by manifest mod id (the remote id).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct ConflictIgnores {
  /// Ignored pairs, as [`pair_key`]s.
  #[serde(default)]
  pub pairs: BTreeSet<String>,
  /// Files ignored for one pair only, keyed by [`pair_key`].
  #[serde(default)]
  pub pair_files: BTreeMap<String, BTreeSet<String>>,
  /// Mods whose conflicts are all ignored.
  #[serde(default)]
  pub mods: BTreeSet<String>,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export, rename_all = "camelCase", tag = "type")]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum ConflictIgnoreAction {
  #[serde(rename_all = "camelCase")]
  #[ts(rename_all = "camelCase")]
  IgnorePair {
    mod_a: String,
    mod_b: String,
  },
  /// Restores the pair and every file ignored for it alone.
  #[serde(rename_all = "camelCase")]
  #[ts(rename_all = "camelCase")]
  UnignorePair {
    mod_a: String,
    mod_b: String,
  },
  #[serde(rename_all = "camelCase")]
  #[ts(rename_all = "camelCase")]
  IgnorePairFile {
    mod_a: String,
    mod_b: String,
    path: String,
  },
  #[serde(rename_all = "camelCase")]
  #[ts(rename_all = "camelCase")]
  IgnoreMod {
    mod_id: String,
  },
  #[serde(rename_all = "camelCase")]
  #[ts(rename_all = "camelCase")]
  UnignoreMod {
    mod_id: String,
  },
  ClearAll,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export, rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct ProfileConflicts {
  pub conflicts: Vec<ModConflict>,
  /// Conflicts hidden by an ignore, so they can be restored.
  pub ignored: Vec<ModConflict>,
  pub ignores: ConflictIgnores,
}

/// Order-independent key for a pair of mods.
pub fn pair_key(mod_a: &str, mod_b: &str) -> String {
  if mod_a <= mod_b {
    format!("{mod_a}::{mod_b}")
  } else {
    format!("{mod_b}::{mod_a}")
  }
}

impl ConflictIgnores {
  pub fn apply(&mut self, action: ConflictIgnoreAction) {
    match action {
      ConflictIgnoreAction::IgnorePair { mod_a, mod_b } => {
        self.pairs.insert(pair_key(&mod_a, &mod_b));
      }
      ConflictIgnoreAction::UnignorePair { mod_a, mod_b } => {
        let key = pair_key(&mod_a, &mod_b);
        self.pairs.remove(&key);
        self.pair_files.remove(&key);
      }
      ConflictIgnoreAction::IgnorePairFile { mod_a, mod_b, path } => {
        self
          .pair_files
          .entry(pair_key(&mod_a, &mod_b))
          .or_default()
          .insert(normalize_entry_path(&path));
      }
      ConflictIgnoreAction::IgnoreMod { mod_id } => {
        self.mods.insert(mod_id);
      }
      ConflictIgnoreAction::UnignoreMod { mod_id } => {
        self.mods.remove(&mod_id);
      }
      ConflictIgnoreAction::ClearAll => *self = Self::default(),
    }
  }

  /// Read a profile's ignores. A missing file means nothing is ignored.
  pub fn load(base: &Path) -> Result<Self, Error> {
    let path = base.join(IGNORES_FILENAME);
    match fs::read_to_string(&path) {
      Ok(json) => serde_json::from_str(&json).map_err(|e| {
        Error::InvalidInput(format!(
          "Failed to parse conflict ignores at {}: {e}",
          path.display()
        ))
      }),
      Err(err) if err.kind() == ErrorKind::NotFound => Ok(Self::default()),
      Err(err) => Err(err.into()),
    }
  }

  pub fn save(&self, base: &Path) -> Result<(), Error> {
    fs::create_dir_all(base)?;
    let path = base.join(IGNORES_FILENAME);
    let temp_path = base.join(IGNORES_TEMP_FILENAME);
    let json = serde_json::to_string_pretty(self).map_err(|e| {
      Error::InvalidInput(format!(
        "Failed to serialize conflict ignores at {}: {e}",
        path.display()
      ))
    })?;
    fs::write(&temp_path, json)?;
    if let Err(err) = fs::rename(&temp_path, &path) {
      if err.kind() != ErrorKind::AlreadyExists {
        return Err(err.into());
      }
      fs::remove_file(&path)?;
      fs::rename(&temp_path, &path)?;
    }
    Ok(())
  }
}

/// Load order position of a mod: the lowest `(shard, pak number)` it occupies.
type LoadRank = (u32, u32);

/// One enabled mod's merged directory tree, as input to [`find_conflicts`].
struct ModEntries {
  mod_id: String,
  rank: LoadRank,
  /// Normalized entry path -> CRC32 of its contents.
  files: HashMap<String, String>,
}

fn normalize_entry_path(path: &str) -> String {
  path.trim().replace('\\', "/").to_lowercase()
}

/// Files every packed mod tends to carry, which say nothing about what the
/// mod changes in game.
fn is_noise_file(path: &str) -> bool {
  const NOISE_NAMES: &[&str] = &["addoninfo.txt", "modinfo.json"];
  const NOISE_DOC_STEMS: &[&str] = &["readme", "license", "credits", "changelog", "info"];

  let filename = path.rsplit('/').next().unwrap_or(path);
  if NOISE_NAMES.contains(&filename) {
    return true;
  }
  if let Some((stem, ext)) = filename.rsplit_once('.')
    && matches!(ext, "txt" | "md")
    && NOISE_DOC_STEMS.contains(&stem)
  {
    return true;
  }
  // Compiler output bundled with any panorama mod, and fallback textures some
  // packers add to every VPK.
  path == "panorama/image_compiler.vdata_c" || path.starts_with("materials/default/default_")
}

fn severity_of(path: &str) -> ConflictSeverity {
  let ext = path.rsplit_once('.').map(|(_, ext)| ext).unwrap_or("");
  match ext {
    "vmdl_c" => ConflictSeverity::Critical,
    "vmat_c" | "vtex_c" | "vpcf_c" | "vanim_c" | "vanmgrph_c" | "vnmgraph_c" => {
      ConflictSeverity::Normal
    }
    _ => ConflictSeverity::Low,
  }
}

/// Find every pair of mods that ship the same path with different contents,
/// then split them into active and ignored conflicts.
fn find_conflicts(mods: &[ModEntries], ignores: &ConflictIgnores) -> ProfileConflicts {
  let mut owners: HashMap<&str, Vec<(usize, &str)>> = HashMap::new();
  for (index, entries) in mods.iter().enumerate() {
    for (path, crc) in &entries.files {
      if !is_noise_file(path) {
        owners.entry(path).or_default().push((index, crc));
      }
    }
  }

  let mut shared: BTreeMap<(usize, usize), Vec<&str>> = BTreeMap::new();
  for (path, providers) in &owners {
    for (i, (index_a, crc_a)) in providers.iter().enumerate() {
      for (index_b, crc_b) in &providers[i + 1..] {
        // Byte-identical files look the same whichever mod wins.
        if crc_a == crc_b {
          continue;
        }
        let pair = if index_a < index_b {
          (*index_a, *index_b)
        } else {
          (*index_b, *index_a)
        };
        shared.entry(pair).or_default().push(path);
      }
    }
  }

  let mut result = ProfileConflicts {
    conflicts: Vec::new(),
    ignored: Vec::new(),
    ignores: ignores.clone(),
  };

  for ((index_a, index_b), paths) in shared {
    let (winner, loser) = if mods[index_a].rank <= mods[index_b].rank {
      (&mods[index_a], &mods[index_b])
    } else {
      (&mods[index_b], &mods[index_a])
    };
    let key = pair_key(&winner.mod_id, &loser.mod_id);
    let pair_ignored_files = ignores.pair_files.get(&key);

    let is_file_ignored =
      |path: &str| pair_ignored_files.is_some_and(|ignored| ignored.contains(path));

    let ignore_reason = if ignores.pairs.contains(&key) {
      Some(ConflictIgnoreReason::Pair)
    } else if ignores.mods.contains(&winner.mod_id) || ignores.mods.contains(&loser.mod_id) {
      Some(ConflictIgnoreReason::Mod)
    } else if paths.iter().all(|path| is_file_ignored(path)) {
      Some(ConflictIgnoreReason::Files)
    } else {
      None
    };

    // A pair or mod ignore lists every shared file so the user knows what
    // restoring brings back; otherwise only the files that still count.
    let lists_every_file = matches!(
      ignore_reason,
      Some(ConflictIgnoreReason::Pair | ConflictIgnoreReason::Mod)
    );
    let mut listed: Vec<ConflictFile> = paths
      .into_iter()
      .filter(|path| lists_every_file || !is_file_ignored(path))
      .map(|path| ConflictFile {
        path: path.to_string(),
        severity: severity_of(path),
      })
      .collect();
    sort_files(&mut listed);

    let conflict = ModConflict {
      winner: winner.mod_id.clone(),
      loser: loser.mod_id.clone(),
      severity: listed
        .iter()
        .map(|file| file.severity)
        .max()
        .unwrap_or(ConflictSeverity::Low),
      files: listed,
      ignore_reason,
    };
    if conflict.ignore_reason.is_some() {
      result.ignored.push(conflict);
    } else {
      result.conflicts.push(conflict);
    }
  }

  let by_severity = |a: &ModConflict, b: &ModConflict| {
    b.severity
      .cmp(&a.severity)
      .then_with(|| b.files.len().cmp(&a.files.len()))
      .then_with(|| a.winner.cmp(&b.winner))
      .then_with(|| a.loser.cmp(&b.loser))
  };
  result.conflicts.sort_by(by_severity);
  result.ignored.sort_by(by_severity);
  result
}

fn sort_files(files: &mut [ConflictFile]) {
  files.sort_by(|a, b| {
    b.severity
      .cmp(&a.severity)
      .then_with(|| a.path.cmp(&b.path))
  });
}

/// Parsed directory trees, valid while a VPK's mtime and size are unchanged.
struct CachedTree {
  modified: Option<SystemTime>,
  size: u64,
  files: Arc<Vec<(String, String)>>,
}

static TREE_CACHE: LazyLock<Mutex<HashMap<PathBuf, CachedTree>>> =
  LazyLock::new(|| Mutex::new(HashMap::new()));

fn read_tree(vpk_path: &Path) -> Result<Arc<Vec<(String, String)>>, Error> {
  let metadata = fs::metadata(vpk_path)?;
  let modified = metadata.modified().ok();
  let size = metadata.len();

  if let Some(cached) = TREE_CACHE.lock().unwrap().get(vpk_path)
    && cached.modified == modified
    && cached.size == size
  {
    return Ok(Arc::clone(&cached.files));
  }

  let files: Arc<Vec<(String, String)>> = Arc::new(
    VpkParser::parse_directory_from_file(vpk_path)
      .map_err(|e| {
        Error::InvalidInput(format!(
          "Failed to read VPK directory {}: {e}",
          vpk_path.display()
        ))
      })?
      .into_iter()
      .map(|entry| (normalize_entry_path(&entry.full_path), entry.crc32_hex))
      .collect(),
  );
  TREE_CACHE.lock().unwrap().insert(
    vpk_path.to_path_buf(),
    CachedTree {
      modified,
      size,
      files: Arc::clone(&files),
    },
  );
  Ok(files)
}

/// Read the enabled mods of a profile and find their conflicts.
pub fn detect_profile_conflicts(base: &ProfileBase) -> Result<ProfileConflicts, Error> {
  let manifest = ProfileVpkManifest::load(base)?;
  let ignores = ConflictIgnores::load(base)?;

  let mut mods = Vec::new();
  let mut scanned = HashSet::new();
  for (mod_id, entry) in &manifest.mods {
    if !entry.enabled || entry.current_vpks.is_empty() {
      continue;
    }
    let pak = entry
      .current_vpks
      .iter()
      .filter_map(|name| {
        let filename = Path::new(name).file_name()?.to_str()?;
        VpkManager::enabled_vpk_number(filename)
      })
      .min()
      .unwrap_or(u32::MAX);

    let mut files = HashMap::new();
    for vpk_path in entry.file_paths(base) {
      scanned.insert(vpk_path.clone());
      // A VPK can vanish or be half-written during a concurrent operation;
      // skipping it only hides its conflicts until the next scan.
      match read_tree(&vpk_path) {
        Ok(tree) => {
          for (path, crc) in tree.iter() {
            files.entry(path.clone()).or_insert_with(|| crc.clone());
          }
        }
        Err(err) => log::warn!("Skipping {} in conflict scan: {err}", vpk_path.display()),
      }
    }

    mods.push(ModEntries {
      mod_id: mod_id.clone(),
      rank: (entry.shard.get(), pak),
      files,
    });
  }

  // Reordering renames paks and only the active profile is scanned, so keep
  // just the trees this scan used instead of growing with every old path.
  TREE_CACHE
    .lock()
    .unwrap()
    .retain(|path, _| scanned.contains(path));

  Ok(find_conflicts(&mods, &ignores))
}

/// Apply ignore changes to a profile with a single write.
pub fn update_profile_conflict_ignores(
  base: &ProfileBase,
  actions: Vec<ConflictIgnoreAction>,
) -> Result<(), Error> {
  let mut ignores = ConflictIgnores::load(base)?;
  for action in actions {
    ignores.apply(action);
  }
  ignores.save(base)
}

#[cfg(test)]
mod tests {
  use super::*;

  fn mod_entries(mod_id: &str, rank: LoadRank, files: &[(&str, &str)]) -> ModEntries {
    ModEntries {
      mod_id: mod_id.to_string(),
      rank,
      files: files
        .iter()
        .map(|(path, crc)| (path.to_string(), crc.to_string()))
        .collect(),
    }
  }

  fn paths(conflict: &ModConflict) -> Vec<&str> {
    conflict
      .files
      .iter()
      .map(|file| file.path.as_str())
      .collect()
  }

  #[test]
  fn reports_shared_paths_with_the_first_loaded_mod_as_winner() {
    let mods = [
      mod_entries(
        "b",
        (1, 2),
        &[("models/hat.vmdl_c", "1"), ("models/pants.vmdl_c", "2")],
      ),
      mod_entries(
        "a",
        (1, 1),
        &[("models/hat.vmdl_c", "3"), ("models/jacket.vmdl_c", "4")],
      ),
    ];

    let result = find_conflicts(&mods, &ConflictIgnores::default());

    assert_eq!(result.conflicts.len(), 1);
    let conflict = &result.conflicts[0];
    assert_eq!(conflict.winner, "a");
    assert_eq!(conflict.loser, "b");
    assert_eq!(paths(conflict), ["models/hat.vmdl_c"]);
    assert_eq!(conflict.severity, ConflictSeverity::Critical);
  }

  #[test]
  fn earlier_shard_wins_over_lower_pak_number() {
    let mods = [
      mod_entries("late", (2, 1), &[("sounds/a.vsnd_c", "1")]),
      mod_entries("early", (1, 40), &[("sounds/a.vsnd_c", "2")]),
    ];

    let result = find_conflicts(&mods, &ConflictIgnores::default());

    assert_eq!(result.conflicts[0].winner, "early");
  }

  #[test]
  fn identical_contents_are_not_a_conflict() {
    let mods = [
      mod_entries("a", (1, 1), &[("materials/x.vmat_c", "abcd")]),
      mod_entries("b", (1, 2), &[("materials/x.vmat_c", "abcd")]),
    ];

    let result = find_conflicts(&mods, &ConflictIgnores::default());

    assert!(result.conflicts.is_empty());
    assert!(result.ignored.is_empty());
  }

  #[test]
  fn packer_noise_is_not_a_conflict() {
    let noise = [
      ("addoninfo.txt", "1"),
      ("readme.txt", "1"),
      ("docs/credits.md", "1"),
      ("panorama/image_compiler.vdata_c", "1"),
      ("materials/default/default_color_tga_1.vtex_c", "1"),
    ];
    let other_noise: Vec<(&str, &str)> = noise.iter().map(|(path, _)| (*path, "2")).collect();
    let mods = [
      mod_entries("a", (1, 1), &noise),
      mod_entries("b", (1, 2), &other_noise),
    ];

    assert!(
      find_conflicts(&mods, &ConflictIgnores::default())
        .conflicts
        .is_empty()
    );
  }

  #[test]
  fn files_are_ranked_by_severity() {
    let shared = [
      ("sounds/a.vsnd_c", "1"),
      ("materials/a.vmat_c", "1"),
      ("models/a.vmdl_c", "1"),
    ];
    let other: Vec<(&str, &str)> = shared.iter().map(|(path, _)| (*path, "2")).collect();
    let mods = [
      mod_entries("a", (1, 1), &shared),
      mod_entries("b", (1, 2), &other),
    ];

    let result = find_conflicts(&mods, &ConflictIgnores::default());

    assert_eq!(
      paths(&result.conflicts[0]),
      ["models/a.vmdl_c", "materials/a.vmat_c", "sounds/a.vsnd_c"]
    );
  }

  #[test]
  fn three_mods_on_one_path_report_every_pair() {
    let mods = [
      mod_entries("a", (1, 1), &[("x.vmat_c", "1")]),
      mod_entries("b", (1, 2), &[("x.vmat_c", "2")]),
      mod_entries("c", (1, 3), &[("x.vmat_c", "3")]),
    ];

    let result = find_conflicts(&mods, &ConflictIgnores::default());

    assert_eq!(result.conflicts.len(), 3);
  }

  fn two_mods_sharing(paths: &[&str]) -> [ModEntries; 2] {
    let a: Vec<(&str, &str)> = paths.iter().map(|path| (*path, "1")).collect();
    let b: Vec<(&str, &str)> = paths.iter().map(|path| (*path, "2")).collect();
    [mod_entries("a", (1, 1), &a), mod_entries("b", (1, 2), &b)]
  }

  #[test]
  fn ignored_pair_moves_to_ignored_list_with_every_file() {
    let mods = two_mods_sharing(&["x.vmat_c", "y.vmat_c"]);
    let mut ignores = ConflictIgnores::default();
    ignores.apply(ConflictIgnoreAction::IgnorePair {
      mod_a: "b".into(),
      mod_b: "a".into(),
    });

    let result = find_conflicts(&mods, &ignores);

    assert!(result.conflicts.is_empty());
    assert_eq!(
      result.ignored[0].ignore_reason,
      Some(ConflictIgnoreReason::Pair)
    );
    assert_eq!(result.ignored[0].files.len(), 2);
  }

  #[test]
  fn ignored_mod_hides_its_conflicts() {
    let mods = two_mods_sharing(&["x.vmat_c"]);
    let mut ignores = ConflictIgnores::default();
    ignores.apply(ConflictIgnoreAction::IgnoreMod { mod_id: "b".into() });

    let result = find_conflicts(&mods, &ignores);

    assert!(result.conflicts.is_empty());
    assert_eq!(
      result.ignored[0].ignore_reason,
      Some(ConflictIgnoreReason::Mod)
    );
  }

  #[test]
  fn pair_file_ignores_only_apply_to_that_pair() {
    let mut mods = Vec::from(two_mods_sharing(&["x.vmat_c", "y.vmat_c"]));
    mods.push(mod_entries("c", (1, 3), &[("x.vmat_c", "3")]));
    let mut ignores = ConflictIgnores::default();
    ignores.apply(ConflictIgnoreAction::IgnorePairFile {
      mod_a: "a".into(),
      mod_b: "b".into(),
      path: "X.vmat_c".into(),
    });

    let result = find_conflicts(&mods, &ignores);

    let ab = result
      .conflicts
      .iter()
      .find(|c| c.winner == "a" && c.loser == "b")
      .unwrap();
    assert_eq!(paths(ab), ["y.vmat_c"]);
    let ac = result
      .conflicts
      .iter()
      .find(|c| c.winner == "a" && c.loser == "c")
      .unwrap();
    assert_eq!(paths(ac), ["x.vmat_c"]);
  }

  #[test]
  fn ignoring_every_file_of_a_pair_moves_it_to_ignored() {
    let mods = two_mods_sharing(&["x.vmat_c"]);
    let mut ignores = ConflictIgnores::default();
    ignores.apply(ConflictIgnoreAction::IgnorePairFile {
      mod_a: "a".into(),
      mod_b: "b".into(),
      path: "x.vmat_c".into(),
    });

    let result = find_conflicts(&mods, &ignores);

    assert!(result.conflicts.is_empty());
    assert_eq!(
      result.ignored[0].ignore_reason,
      Some(ConflictIgnoreReason::Files)
    );

    ignores.apply(ConflictIgnoreAction::UnignorePair {
      mod_a: "b".into(),
      mod_b: "a".into(),
    });
    assert_eq!(find_conflicts(&mods, &ignores).conflicts.len(), 1);
  }

  #[test]
  fn ignore_actions_deserialize_from_the_frontend_shape() {
    let action: ConflictIgnoreAction =
      serde_json::from_str(r#"{"type":"ignorePairFile","modA":"a","modB":"b","path":"x"}"#)
        .unwrap();
    assert!(matches!(
      action,
      ConflictIgnoreAction::IgnorePairFile { .. }
    ));
  }

  mod on_disk {
    use super::*;
    use crate::mod_manager::shard::ShardIndex;

    fn write_vpk(dir: &Path, name: &str, files: &[(&str, &str)]) {
      let source = tempfile::tempdir().unwrap();
      for (path, contents) in files {
        let file = source.path().join(path);
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(file, contents).unwrap();
      }
      vpkmanager::pack_directory(source.path(), &dir.join(name)).unwrap();
    }

    #[test]
    fn detects_conflicts_from_the_profile_manifest() {
      let root = tempfile::tempdir().unwrap();
      let base_dir = root.path().join("citadel").join("addons").join("profile");
      fs::create_dir_all(&base_dir).unwrap();
      let base = ProfileBase::new(&base_dir).unwrap();

      write_vpk(
        &base_dir,
        "pak01_dir.vpk",
        &[
          ("models/hat.vmdl_c", "hat a"),
          ("models/jacket.vmdl_c", "jacket"),
        ],
      );
      write_vpk(
        &base_dir,
        "pak02_dir.vpk",
        &[
          ("models/hat.vmdl_c", "hat b"),
          ("models/pants.vmdl_c", "pants"),
        ],
      );
      write_vpk(
        &base_dir,
        "pak03_dir.vpk",
        &[("models/hat.vmdl_c", "hat a")],
      );
      write_vpk(
        &base_dir,
        "mod-d_pak04_dir.vpk",
        &[("models/hat.vmdl_c", "hat d")],
      );

      let mut manifest = ProfileVpkManifest::default();
      for (id, vpk) in [
        ("mod-a", "pak01_dir.vpk"),
        ("mod-b", "pak02_dir.vpk"),
        ("mod-c", "pak03_dir.vpk"),
      ] {
        manifest.mark_enabled(
          id,
          vec![vpk.to_string()],
          Vec::new(),
          None,
          ShardIndex::FIRST,
        );
      }
      manifest
        .mods
        .entry("mod-d".to_string())
        .or_default()
        .disabled_vpks = vec!["mod-d_pak04_dir.vpk".to_string()];
      manifest.save(&base_dir).unwrap();

      let result = detect_profile_conflicts(&base).unwrap();

      let pairs: Vec<(&str, &str)> = result
        .conflicts
        .iter()
        .map(|c| (c.winner.as_str(), c.loser.as_str()))
        .collect();
      assert_eq!(pairs.len(), 2, "{pairs:?}");
      assert!(pairs.contains(&("mod-a", "mod-b")));
      assert!(pairs.contains(&("mod-b", "mod-c")));

      update_profile_conflict_ignores(
        &base,
        vec![ConflictIgnoreAction::IgnoreMod {
          mod_id: "mod-b".into(),
        }],
      )
      .unwrap();
      let result = detect_profile_conflicts(&base).unwrap();
      assert!(result.conflicts.is_empty());
      assert_eq!(result.ignored.len(), 2);
    }
  }
}
