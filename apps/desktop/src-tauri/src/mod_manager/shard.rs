use crate::errors::Error;
use serde::{Deserialize, Serialize};
use std::fs;
use std::ops::Deref;
use std::path::{Path, PathBuf};

pub const SHARD_CAPACITY: u32 = 99;

pub const MAX_SHARDS: u32 = 10;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(try_from = "u32", into = "u32")]
pub struct ShardIndex(u32);

impl ShardIndex {
  pub const FIRST: ShardIndex = ShardIndex(1);

  pub fn new(value: u32) -> Result<Self, Error> {
    Self::try_from(value).map_err(Error::InvalidInput)
  }

  pub const fn get(self) -> u32 {
    self.0
  }

  fn from_root_name(root: &str) -> Option<Self> {
    if root == "addons" {
      return Some(Self::FIRST);
    }
    root
      .strip_prefix("addons")
      .and_then(|value| value.parse::<u32>().ok())
      .and_then(|value| Self::try_from(value).ok())
      .filter(|shard| *shard != Self::FIRST)
  }

  pub fn root_name(self) -> String {
    if self.0 <= 1 {
      "addons".to_string()
    } else {
      format!("addons{}", self.0)
    }
  }

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

  fn try_from(value: u32) -> Result<Self, String> {
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

pub fn all_shards() -> impl Iterator<Item = ShardIndex> {
  (1..=MAX_SHARDS).map(ShardIndex)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProfileBase {
  path: PathBuf,
  citadel_dir: PathBuf,
  profile_folder: Option<PathBuf>,
}

impl ProfileBase {
  pub fn new(path: impl Into<PathBuf>) -> Result<Self, Error> {
    Self::from_path(path.into(), true)
  }

  pub(crate) fn from_snapshot(path: impl Into<PathBuf>) -> Result<Self, Error> {
    Self::from_path(path.into(), false)
  }

  fn from_path(path: PathBuf, require_citadel: bool) -> Result<Self, Error> {
    let invalid = || {
      Error::InvalidInput(format!(
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
    if require_citadel && citadel_dir.file_name().and_then(|name| name.to_str()) != Some("citadel")
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

  pub fn shards(&self) -> impl Iterator<Item = (ShardIndex, PathBuf)> + '_ {
    all_shards().map(|shard| (shard, self.shard_dir(shard)))
  }

  pub fn existing_shards(&self) -> impl Iterator<Item = (ShardIndex, PathBuf)> + '_ {
    self.shards().filter(|(_, dir)| dir.exists())
  }

  pub fn shard_of_dir(&self, dir: &Path) -> Option<ShardIndex> {
    self.shards().find(|(_, path)| path == dir).map(|(s, _)| s)
  }

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

  pub fn parse(value: &str) -> Result<Self, Error> {
    let invalid = || Error::InvalidInput(format!("Invalid VPK shard locator: {value}"));

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

  pub fn from_legacy_name(value: &str) -> Self {
    let normalized = value.replace('\\', "/");
    Self::parse(&normalized).unwrap_or_else(|_| Self {
      shard: ShardIndex::FIRST,
      filename: file_name_of(&normalized),
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

  pub fn parse(name: &str) -> Result<Self, Error> {
    let invalid = || Error::ModInvalid(format!("Invalid VPK staging file: {name}"));

    let encoded = name.strip_suffix(STAGED_SUFFIX).unwrap_or(name);
    let (shard_prefix, filename) = encoded.split_once("__").ok_or_else(invalid)?;
    let shard = shard_prefix
      .strip_prefix('s')
      .and_then(|digits| digits.parse::<u32>().ok())
      .and_then(|value| ShardIndex::try_from(value).ok())
      .ok_or_else(|| Error::ModInvalid(format!("Invalid VPK staging shard: {name}")))?;

    if filename.is_empty()
      || Path::new(filename).file_name().and_then(|n| n.to_str()) != Some(filename)
    {
      return Err(Error::ModInvalid(format!(
        "Invalid VPK staging destination: {name}"
      )));
    }

    Ok(Self {
      shard,
      filename: filename.to_string(),
    })
  }
}

pub fn is_internal_artifact(name: &str) -> bool {
  name == ".dmm.json.tmp"
    || name == crate::mod_manager::conflicts::IGNORES_TEMP_FILENAME
    || name == CLEAR_STAGING_DIR
    || name == REORDER_STAGING_DIR
    || name.starts_with(UPDATE_STAGING_PREFIX)
    || name.starts_with(DELETE_STAGING_PREFIX)
}

pub(crate) const CLEAR_STAGING_DIR: &str = ".dmm-clear";
pub(crate) const REORDER_STAGING_DIR: &str = ".dmm-reorder";
pub(crate) const UPDATE_STAGING_PREFIX: &str = ".dmm-update-";
pub(crate) const DELETE_STAGING_PREFIX: &str = ".dmm-deleting-";

fn file_name_of(value: &str) -> String {
  Path::new(value)
    .file_name()
    .map(|name| name.to_string_lossy().to_string())
    .unwrap_or_else(|| value.to_string())
}

pub fn remove_profile_shards(base: &Path) -> std::io::Result<bool> {
  let base = ProfileBase::new(base)
    .map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidInput, error.to_string()))?;
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
      restore(&staged[index..]);
      return Err(err);
    }
  }
  Ok(removed)
}

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
  if let Some(suffix) = root.strip_prefix("dmm_localization_") {
    let valid_suffix = suffix == "default"
      || (suffix.len() == 16
        && suffix
          .chars()
          .all(|character| character.is_ascii_hexdigit()));
    return valid_suffix && segments.next().is_none();
  }
  if ShardIndex::from_root_name(root).is_none() {
    return false;
  }

  match (segments.next(), segments.next()) {
    (None, None) => true,
    (Some(profile), None) => is_gameinfo_safe_profile(profile),
    _ => false,
  }
}

fn is_gameinfo_safe_profile(profile: &str) -> bool {
  !profile.is_empty()
    && profile
      .chars()
      .all(|c| c.is_alphanumeric() || c == '_' || c == '-')
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
    let base = ProfileBase::new("/game/citadel/addons").unwrap();
    assert_eq!(base.shard_dir(ShardIndex::FIRST), Path::new(base.path()));
    assert_eq!(base.shard_dir(shard(2)), Path::new("/game/citadel/addons2"));
    assert_eq!(
      base.shard_dir(shard(10)),
      Path::new("/game/citadel/addons10")
    );

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
    assert_eq!(StagedName::parse("s4__pak07_dir.vpk").unwrap(), staged);

    assert!(StagedName::parse("pak01_dir.vpk").is_err());
    assert!(StagedName::parse("s0__pak01_dir.vpk").is_err());
    assert!(StagedName::parse("s1__../escape.vpk").is_err());
  }

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
    assert!(is_valid_search_path(
      "citadel/addons/profile_1790733456494_hq878upvz_нов"
    ));
    assert!(is_valid_search_path("citadel/dmm_localization_default"));
    assert!(is_valid_search_path(
      "citadel/dmm_localization_0123456789abcdef"
    ));
  }

  #[test]
  fn valid_search_paths_reject_unsafe_or_out_of_range() {
    assert!(!is_valid_search_path("citadel/addons/evil profile"));
    assert!(!is_valid_search_path("citadel/addons/pro\"file"));
    assert!(!is_valid_search_path("citadel/addons/pro{file}"));
    assert!(!is_valid_search_path("citadel/addons/../escape"));
    assert!(!is_valid_search_path("citadel/addons/a/b"));
    assert!(!is_valid_search_path("citadel/addons11/profile"));
    assert!(!is_valid_search_path("citadel/addons1/profile"));
    assert!(!is_valid_search_path("other/addons/profile"));
    assert!(!is_valid_search_path(
      "citadel/dmm_localization_unsafe-name"
    ));
    assert!(!is_valid_search_path(
      "citadel/dmm_localization_0123456789abcdef/nested"
    ));
  }
}
