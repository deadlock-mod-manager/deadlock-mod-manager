//! Where a profile's addon VPKs are allowed to live.
//!
//! The Source 2 engine only loads up to 99 `pak##_dir.vpk` files per search-path
//! directory. To let a profile hold more enabled mods than that, the enabled
//! VPKs are spread across sibling `citadel/addonsN` directories, with one
//! `Game citadel/addonsN/<...>` search-path line per shard in `gameinfo.gi`.
//!
//! Layout for a profile named `profile_x`:
//!   - Shard 1 is `citadel/addons/profile_x`.
//!   - Shard k >= 2 is `citadel/addons<k>/profile_x`.
//!
//! Disabled (prefixed `{mod_id}_*.vpk`) files and the `.dmm.json` ledger always
//! live in the base dir regardless of which shard a mod's enabled VPKs occupy.

use std::fs;
use std::ops::Deref;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{Result, VpkManagerError};

/// Max enabled `pak##_dir.vpk` files the engine loads per search-path directory.
pub const SHARD_CAPACITY: u32 = 99;

/// Max number of shard roots per profile (`addons`, `addons2` ..= `addons10`).
pub const MAX_SHARDS: u32 = 10;

/// A 1-based shard index, always within `1..=MAX_SHARDS`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(try_from = "u32", into = "u32")]
pub struct ShardIndex(u32);

impl ShardIndex {
    /// The profile base directory; always exists when the profile does.
    pub const FIRST: ShardIndex = ShardIndex(1);

    pub fn new(value: u32) -> Result<Self> {
        Self::try_from(value).map_err(VpkManagerError::Invalid)
    }

    pub const fn get(self) -> u32 {
        self.0
    }

    fn from_root_name(root: &str) -> Option<Self> {
        if root == "addons" {
            return Some(Self::FIRST);
        }
        root.strip_prefix("addons")
            .and_then(|value| value.parse::<u32>().ok())
            .and_then(|value| Self::try_from(value).ok())
            .filter(|shard| *shard != Self::FIRST)
    }

    /// `addons` for shard 1, `addonsN` otherwise.
    pub fn root_name(self) -> String {
        if self.0 <= 1 {
            "addons".to_string()
        } else {
            format!("addons{}", self.0)
        }
    }

    /// The `gameinfo.gi` search-path line for this shard.
    pub fn search_path(self, profile_folder: Option<&str>) -> String {
        let root = self.root_name();
        match profile_folder {
            Some(profile) => format!("citadel/{root}/{profile}"),
            None => format!("citadel/{root}"),
        }
    }
}

impl TryFrom<u32> for ShardIndex {
    type Error = String;

    fn try_from(value: u32) -> std::result::Result<Self, String> {
        if (1..=MAX_SHARDS).contains(&value) {
            Ok(ShardIndex(value))
        } else {
            Err(format!(
                "shard index {value} is outside the supported range 1..={MAX_SHARDS}"
            ))
        }
    }
}

impl From<ShardIndex> for u32 {
    fn from(value: ShardIndex) -> u32 {
        value.0
    }
}

impl std::fmt::Display for ShardIndex {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Every shard index, ascending. Cheap; does not touch the filesystem.
pub fn all_shards() -> impl Iterator<Item = ShardIndex> {
    (1..=MAX_SHARDS).map(ShardIndex)
}

/// A profile's root directory, validated to be shaped like `citadel/addons` or
/// `citadel/addons/<profile>`. Validating the shape here is what lets
/// [`ProfileBase::shard_dir`] resolve any shard without a fallback.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProfileBase {
    path: PathBuf,
    citadel_dir: PathBuf,
    /// `None` for the default profile (base *is* `citadel/addons`).
    profile_folder: Option<PathBuf>,
}

impl ProfileBase {
    pub fn new(path: impl Into<PathBuf>) -> Result<Self> {
        Self::from_path(path.into(), true)
    }

    /// Build the same shard mapping for a backup snapshot whose shard roots are
    /// intentionally stored outside a directory named `citadel`.
    pub fn from_snapshot(path: impl Into<PathBuf>) -> Result<Self> {
        Self::from_path(path.into(), false)
    }

    fn from_path(path: PathBuf, require_citadel: bool) -> Result<Self> {
        let invalid = || {
            VpkManagerError::Invalid(format!(
                "Addons path is not shaped like citadel/addons[/<profile>]: {}",
                path.display()
            ))
        };

        let name = path.file_name().and_then(|name| name.to_str());
        if name == Some("addons") {
            let citadel_dir = path.parent().ok_or_else(invalid)?.to_path_buf();
            if require_citadel
                && citadel_dir.file_name().and_then(|name| name.to_str()) != Some("citadel")
            {
                return Err(invalid());
            }
            return Ok(Self {
                path,
                citadel_dir,
                profile_folder: None,
            });
        }

        let addons_root = path
            .ancestors()
            .skip(1)
            .find(|ancestor| ancestor.file_name().and_then(|name| name.to_str()) == Some("addons"))
            .ok_or_else(invalid)?;
        let profile_folder = path
            .strip_prefix(addons_root)
            .map_err(|_| invalid())?
            .to_path_buf();
        let citadel_dir = addons_root.parent().ok_or_else(invalid)?.to_path_buf();
        if require_citadel
            && citadel_dir.file_name().and_then(|name| name.to_str()) != Some("citadel")
        {
            return Err(invalid());
        }

        Ok(Self {
            path,
            citadel_dir,
            profile_folder: Some(profile_folder),
        })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// On-disk directory holding this shard's enabled pak files.
    pub fn shard_dir(&self, shard: ShardIndex) -> PathBuf {
        if shard == ShardIndex::FIRST {
            return self.path.clone();
        }
        let root = self.citadel_dir.join(shard.root_name());
        match &self.profile_folder {
            Some(folder) => root.join(folder),
            None => root,
        }
    }

    /// Every shard directory, ascending, whether or not it exists on disk.
    pub fn shards(&self) -> impl Iterator<Item = (ShardIndex, PathBuf)> + '_ {
        all_shards().map(|shard| (shard, self.shard_dir(shard)))
    }

    /// Only the shard directories that exist on disk, ascending.
    pub fn existing_shards(&self) -> impl Iterator<Item = (ShardIndex, PathBuf)> + '_ {
        self.shards().filter(|(_, dir)| dir.exists())
    }

    /// The shard whose directory is `dir`, if any.
    pub fn shard_of_dir(&self, dir: &Path) -> Option<ShardIndex> {
        self.shards().find(|(_, path)| path == dir).map(|(s, _)| s)
    }

    /// Resolve a locator against this profile.
    pub fn locator_path(&self, locator: &ShardLocator) -> PathBuf {
        self.shard_dir(locator.shard).join(&locator.filename)
    }
}

impl Deref for ProfileBase {
    type Target = Path;

    fn deref(&self) -> &Path {
        &self.path
    }
}

impl AsRef<Path> for ProfileBase {
    fn as_ref(&self) -> &Path {
        &self.path
    }
}

/// A shard-qualified VPK filename in the `addonsN/file.vpk` wire format shared
/// with the frontend. Shard 1 is written bare (`file.vpk`) so the format stays
/// backwards compatible with pre-sharding clients.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShardLocator {
    pub shard: ShardIndex,
    pub filename: String,
}

impl ShardLocator {
    pub fn new(shard: ShardIndex, filename: impl Into<String>) -> Self {
        Self {
            shard,
            filename: filename.into(),
        }
    }

    /// Parse the wire format. Rejects anything that is not exactly `file.vpk` or
    /// `addonsN/file.vpk` with `N` in `2..=MAX_SHARDS` — shard 1 must be bare, so
    /// there is exactly one spelling per file.
    pub fn parse(value: &str) -> Result<Self> {
        let invalid = || VpkManagerError::Invalid(format!("Invalid VPK shard locator: {value}"));

        let (shard, filename) = match value.split_once('/') {
            Some((root, filename)) => {
                let shard = ShardIndex::from_root_name(root)
                    .filter(|shard| *shard != ShardIndex::FIRST)
                    .ok_or_else(invalid)?;
                (shard, filename)
            }
            None => (ShardIndex::FIRST, value),
        };

        if filename.is_empty()
            || Path::new(filename).file_name().and_then(|n| n.to_str()) != Some(filename)
        {
            return Err(invalid());
        }

        Ok(Self {
            shard,
            filename: filename.to_string(),
        })
    }

    /// Interpret a name that may predate the wire format (a bare filename from
    /// the in-memory repository, a frontend path with backslashes, or a nested
    /// relative path). Anything unrecognized resolves to its basename in shard 1,
    /// which is where pre-sharding installs put every file.
    pub fn from_legacy_name(value: &str) -> Self {
        let normalized = value.replace('\\', "/");
        Self::parse(&normalized).unwrap_or_else(|_| Self {
            shard: ShardIndex::FIRST,
            filename: crate::naming::file_name_of(&normalized),
        })
    }

    pub fn to_wire(&self) -> String {
        if self.shard == ShardIndex::FIRST {
            self.filename.clone()
        } else {
            format!("{}/{}", self.shard.root_name(), self.filename)
        }
    }
}

/// The filename a VPK carries while it sits in a staging directory.
///
/// Encodes the shard the file came from so any interrupted operation can be
/// recovered by the same code path, and appends `.pending` so a staged file is
/// never mistaken for a live VPK by a recursive scan.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StagedName {
    pub shard: ShardIndex,
    pub filename: String,
}

const STAGED_SUFFIX: &str = ".pending";

impl StagedName {
    pub fn new(shard: ShardIndex, filename: impl Into<String>) -> Self {
        Self {
            shard,
            filename: filename.into(),
        }
    }

    pub fn encode(&self) -> String {
        format!("s{}__{}{STAGED_SUFFIX}", self.shard, self.filename)
    }

    /// Parse a staged filename. The `.pending` suffix is optional on read so
    /// staging directories written by an older build still recover.
    pub fn parse(name: &str) -> Result<Self> {
        let invalid = || VpkManagerError::Vpk(format!("Invalid VPK staging file: {name}"));

        let encoded = name.strip_suffix(STAGED_SUFFIX).unwrap_or(name);
        let (shard_prefix, filename) = encoded.split_once("__").ok_or_else(invalid)?;
        let shard = shard_prefix
            .strip_prefix('s')
            .and_then(|digits| digits.parse::<u32>().ok())
            .and_then(|value| ShardIndex::try_from(value).ok())
            .ok_or_else(|| VpkManagerError::Vpk(format!("Invalid VPK staging shard: {name}")))?;

        if filename.is_empty()
            || Path::new(filename).file_name().and_then(|n| n.to_str()) != Some(filename)
        {
            return Err(VpkManagerError::Vpk(format!(
                "Invalid VPK staging destination: {name}"
            )));
        }

        Ok(Self {
            shard,
            filename: filename.to_string(),
        })
    }
}

/// Every profile rooted at an `addons` directory: the default profile, which is
/// the directory itself, plus each named profile folder directly inside it.
///
/// Callers that work across all of a game install's profiles — hero detection,
/// analysis, reporting — need this to enumerate them without hand-rolling the
/// layout rules.
pub fn profiles_in(addons_root: &Path) -> Vec<ProfileBase> {
    let mut profiles = Vec::new();
    if let Ok(base) = ProfileBase::new(addons_root) {
        profiles.push(base);
    }

    let Ok(entries) = fs::read_dir(addons_root) else {
        return profiles;
    };
    let mut named: Vec<ProfileBase> = entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().is_dir())
        .filter(|entry| {
            entry
                .file_name()
                .to_str()
                .is_some_and(|name| !is_internal_artifact(name))
        })
        .filter_map(|entry| ProfileBase::new(entry.path()).ok())
        .collect();
    named.sort_by(|left, right| left.path().cmp(right.path()));
    profiles.extend(named);
    profiles
}

/// Names that belong to the mod manager rather than to the user's addons: an
/// in-progress or crashed operation's staging directory, a half-written
/// fingerprint stamp, a parked file, a backup the app made.
pub fn is_internal_artifact(name: &str) -> bool {
    name == ".dmm.json.tmp"
        || name == CLEAR_STAGING_DIR
        || name == REORDER_STAGING_DIR
        || name.starts_with(UPDATE_STAGING_PREFIX)
        || name.starts_with(DELETE_STAGING_PREFIX)
        || name.starts_with('.') && name.ends_with(".dmm-stamp")
        || name.ends_with(".pending")
        || name.ends_with(".bak")
}

pub const CLEAR_STAGING_DIR: &str = ".dmm-clear";
pub const REORDER_STAGING_DIR: &str = ".dmm-reorder";
pub const UPDATE_STAGING_PREFIX: &str = ".dmm-update-";
pub const DELETE_STAGING_PREFIX: &str = ".dmm-deleting-";

/// Delete every existing shard directory for a profile `base` transactionally.
///
/// Each existing shard is first moved aside to a sibling staging name; only once
/// *all* shards have been staged are the staged directories removed. If staging
/// any shard fails, the already-staged shards are renamed back so a partial
/// failure leaves the profile intact rather than half-deleted. Returns whether
/// any shard existed.
pub fn remove_profile_shards(base: &Path) -> std::io::Result<bool> {
    let base = ProfileBase::new(base).map_err(|error| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, error.to_string())
    })?;
    let mut staged: Vec<(PathBuf, PathBuf)> = Vec::new();

    let restore = |pairs: &[(PathBuf, PathBuf)]| {
        for (original, staging) in pairs.iter().rev() {
            if let Err(error) = fs::rename(staging, original) {
                log::error!("Failed to restore staged shard {staging:?}: {error}");
            }
        }
    };

    for (_, dir) in base.existing_shards() {
        let staging = shard_delete_staging(&dir);
        if let Err(err) = fs::rename(&dir, &staging) {
            restore(&staged);
            return Err(err);
        }
        staged.push((dir, staging));
    }

    let removed = !staged.is_empty();
    for (index, (_, staging)) in staged.iter().enumerate() {
        if let Err(err) = fs::remove_dir_all(staging) {
            // Restore the shard that failed to delete along with every shard we
            // haven't processed yet, so their canonical paths reappear and a later
            // deletion attempt can discover and retry them. The original delete error
            // is preserved and returned.
            restore(&staged[index..]);
            return Err(err);
        }
    }
    Ok(removed)
}

/// Pick a unique sibling staging path for a shard directory about to be deleted.
fn shard_delete_staging(dir: &Path) -> PathBuf {
    let file_name = dir
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("shard");
    for attempt in 0..u32::MAX {
        let candidate = dir.with_file_name(format!("{DELETE_STAGING_PREFIX}{file_name}-{attempt}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    dir.with_file_name(format!("{DELETE_STAGING_PREFIX}{file_name}"))
}

pub fn is_valid_search_path(path: &str) -> bool {
    let mut segments = path.split('/');
    if segments.next() != Some("citadel") {
        return false;
    }

    let Some(root) = segments.next() else {
        return false;
    };
    if ShardIndex::from_root_name(root).is_none() {
        return false;
    }

    match (segments.next(), segments.next()) {
        (None, None) => true,
        (Some(profile), None) => is_gameinfo_safe_profile(profile),
        _ => false,
    }
}

/// Profile/server folder names are interpolated verbatim into `Game
/// citadel/addonsN/<profile>` lines in gameinfo.gi. Restrict them to a strict
/// allowlist so characters that are safe path components but unsafe in the KV
/// syntax (spaces, quotes, braces, control chars) can never reach that file.
/// Created folders are already sanitized to this set; this is defense in depth.
fn is_gameinfo_safe_profile(profile: &str) -> bool {
    !profile.is_empty()
        && profile
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn shard(value: u32) -> ShardIndex {
        ShardIndex::new(value).unwrap()
    }

    #[test]
    fn shard_dir_resolves_sibling_addon_folders() {
        // Default profile: base is `citadel/addons`; shard N is the sibling
        // `citadel/addonsN`.
        let base = ProfileBase::new("/game/citadel/addons").unwrap();
        assert_eq!(base.shard_dir(ShardIndex::FIRST), Path::new(base.path()));
        assert_eq!(base.shard_dir(shard(2)), Path::new("/game/citadel/addons2"));
        assert_eq!(
            base.shard_dir(shard(10)),
            Path::new("/game/citadel/addons10")
        );

        // Named profile: shard N lives under `citadel/addonsN/<profile>`.
        let profile = ProfileBase::new("/game/citadel/addons/profile_x").unwrap();
        assert_eq!(profile.shard_dir(ShardIndex::FIRST), profile.path());
        assert_eq!(
            profile.shard_dir(shard(2)),
            Path::new("/game/citadel/addons2/profile_x")
        );
    }

    #[test]
    fn profile_base_rejects_paths_that_are_not_addons_rooted() {
        assert!(ProfileBase::new("/tmp/scratch").is_err());
        assert!(ProfileBase::new("/tmp/addons").is_err());
        let nested = ProfileBase::new("/game/citadel/addons/a/b").unwrap();
        assert_eq!(
            nested.shard_dir(shard(2)),
            Path::new("/game/citadel/addons2/a/b")
        );
        assert!(ProfileBase::new("/game/citadel/addons2").is_err());
        assert!(ProfileBase::from_snapshot("/snapshot/addons").is_ok());
    }

    #[test]
    fn shard_index_rejects_out_of_range_values() {
        assert!(ShardIndex::new(0).is_err());
        assert!(ShardIndex::new(MAX_SHARDS + 1).is_err());
        assert_eq!(shard(1), ShardIndex::FIRST);
    }

    #[test]
    fn locators_round_trip_through_the_wire_format() {
        assert_eq!(
            ShardLocator::parse("pak01_dir.vpk").unwrap(),
            ShardLocator::new(ShardIndex::FIRST, "pak01_dir.vpk")
        );
        assert_eq!(
            ShardLocator::parse("addons3/pak01_dir.vpk").unwrap(),
            ShardLocator::new(shard(3), "pak01_dir.vpk")
        );

        for wire in ["pak01_dir.vpk", "addons2/pak01_dir.vpk", "addons10/x.vpk"] {
            assert_eq!(ShardLocator::parse(wire).unwrap().to_wire(), wire);
        }
    }

    #[test]
    fn locator_parsing_rejects_ambiguous_and_out_of_range_spellings() {
        // Shard 1 has exactly one spelling: the bare filename.
        assert!(ShardLocator::parse("addons1/pak01_dir.vpk").is_err());
        assert!(ShardLocator::parse("addons11/pak01_dir.vpk").is_err());
        assert!(ShardLocator::parse("addons2/nested/pak01_dir.vpk").is_err());
        assert!(ShardLocator::parse("addons2/").is_err());
        assert!(ShardLocator::parse("").is_err());
    }

    #[test]
    fn legacy_names_fall_back_to_the_base_shard() {
        assert_eq!(
            ShardLocator::from_legacy_name("some\\nested\\pak01_dir.vpk"),
            ShardLocator::new(ShardIndex::FIRST, "pak01_dir.vpk")
        );
        assert_eq!(
            ShardLocator::from_legacy_name("addons2/pak01_dir.vpk"),
            ShardLocator::new(shard(2), "pak01_dir.vpk")
        );
    }

    #[test]
    fn staged_names_round_trip_and_tolerate_the_legacy_spelling() {
        let staged = StagedName::new(shard(4), "pak07_dir.vpk");
        assert_eq!(staged.encode(), "s4__pak07_dir.vpk.pending");
        assert_eq!(StagedName::parse(&staged.encode()).unwrap(), staged);
        // Written by a build that omitted the suffix.
        assert_eq!(StagedName::parse("s4__pak07_dir.vpk").unwrap(), staged);

        assert!(StagedName::parse("pak01_dir.vpk").is_err());
        assert!(StagedName::parse("s0__pak01_dir.vpk").is_err());
        assert!(StagedName::parse("s1__../escape.vpk").is_err());
    }

    /// An interrupted stamp leaves a temp file next to the VPK it was rewriting.
    /// It is ours, not the user's, and must never be scanned as an addon.
    #[test]
    fn stamp_temp_files_count_as_internal_artifacts() {
        assert!(is_internal_artifact(".pak01_dir.vpk.dmm-stamp"));
        assert!(!is_internal_artifact("pak01_dir.vpk"));
    }

    /// Deleting a profile has to take every shard with it; a leftover `addons2`
    /// folder would keep loading mods for a profile the user removed.
    #[test]
    fn removing_a_profile_deletes_all_of_its_shards() {
        let temp = tempfile::tempdir().unwrap();
        let citadel = temp.path().join("citadel");
        let profile = "profile_x";
        for root in ["addons", "addons2", "addons5"] {
            let dir = citadel.join(root).join(profile);
            fs::create_dir_all(&dir).unwrap();
            fs::write(dir.join("pak01_dir.vpk"), b"vpk").unwrap();
        }
        // A sibling profile must survive untouched.
        let other = citadel.join("addons2").join("profile_y");
        fs::create_dir_all(&other).unwrap();

        let removed = remove_profile_shards(&citadel.join("addons").join(profile)).unwrap();

        assert!(removed);
        for root in ["addons", "addons2", "addons5"] {
            assert!(!citadel.join(root).join(profile).exists());
        }
        assert!(other.exists());
    }

    #[test]
    fn removing_a_profile_that_never_existed_reports_nothing_removed() {
        let temp = tempfile::tempdir().unwrap();
        let base = temp.path().join("citadel").join("addons").join("profile_x");
        fs::create_dir_all(base.parent().unwrap()).unwrap();

        assert!(!remove_profile_shards(&base).unwrap());
    }

    #[test]
    fn valid_search_paths_accept_safe_profiles_and_shards() {
        assert!(is_valid_search_path("citadel/addons"));
        assert!(is_valid_search_path("citadel/addons/profile_123_my-mod"));
        assert!(is_valid_search_path("citadel/addons2/server_abc"));
        assert!(is_valid_search_path("citadel/addons10/profile_x"));
    }

    #[test]
    fn valid_search_paths_reject_unsafe_or_out_of_range() {
        // Hardened allowlist: characters that survive `Path::components()` but break
        // gameinfo.gi KV syntax must be rejected.
        assert!(!is_valid_search_path("citadel/addons/evil profile")); // space
        assert!(!is_valid_search_path("citadel/addons/pro\"file")); // quote
        assert!(!is_valid_search_path("citadel/addons/pro{file}")); // braces
        assert!(!is_valid_search_path("citadel/addons/../escape")); // traversal
        assert!(!is_valid_search_path("citadel/addons/a/b")); // nested
        assert!(!is_valid_search_path("citadel/addons11/profile")); // shard > MAX
        assert!(!is_valid_search_path("citadel/addons1/profile")); // shard 1 must be "addons"
        assert!(!is_valid_search_path("other/addons/profile")); // wrong root
    }
}
