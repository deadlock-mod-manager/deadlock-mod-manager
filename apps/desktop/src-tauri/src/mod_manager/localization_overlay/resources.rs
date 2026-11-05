use super::{LocalizationModInput, normalize_path};
use crate::errors::Error;
use source2_model::vpk_extract::VpkArchive;
use std::{
  cell::RefCell,
  collections::{BTreeMap, VecDeque},
  fs,
  path::{Path, PathBuf},
  sync::{Arc, Mutex},
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Provider {
  pub archive: PathBuf,
  pub entry: String,
  pub mod_id: Option<String>,
  pub priority: usize,
}

type ResolvedResource = (Provider, Arc<Vec<u8>>);
type ModArchives = (BTreeMap<PathBuf, VpkArchive>, BTreeMap<String, Provider>);

/// Installed citadel/core archives, indexed once and shared by every snapshot
/// that analyses mods against the same game files.
pub(crate) struct GameIndex {
  directories: Vec<PathBuf>,
  archives: BTreeMap<PathBuf, VpkArchive>,
  resources: BTreeMap<String, Provider>,
  bytes: Mutex<GameBytes>,
}

impl GameIndex {
  fn new(citadel: &Path) -> Self {
    Self {
      directories: vec![citadel.to_path_buf(), citadel.with_file_name("core")],
      archives: BTreeMap::new(),
      resources: BTreeMap::new(),
      bytes: Mutex::new(GameBytes::default()),
    }
  }

  pub(crate) fn open(citadel: &Path) -> Result<Self, Error> {
    Self::open_excluding(citadel, &BTreeMap::new())
  }

  fn open_excluding(
    citadel: &Path,
    mod_archives: &BTreeMap<PathBuf, VpkArchive>,
  ) -> Result<Self, Error> {
    let mut index = Self::new(citadel);
    for directory in &index.directories {
      if !directory.is_dir() {
        continue;
      }
      let mut paths = fs::read_dir(directory)?
        .map(|entry| entry.map(|entry| entry.path()))
        .collect::<Result<Vec<_>, _>>()?;
      paths.retain(|path| {
        path
          .file_name()
          .and_then(|name| name.to_str())
          .is_some_and(|name| name.ends_with("_dir.vpk"))
      });
      paths.sort();
      for path in paths {
        if mod_archives.contains_key(&path) {
          continue;
        }
        let archive = VpkArchive::open(&path).map_err(|error| {
          Error::ModInvalid(format!(
            "Failed to index game resources in {}: {error}",
            path.display()
          ))
        })?;
        for entry in archive.list_entries() {
          index
            .resources
            .entry(normalize_path(&entry))
            .or_insert_with(|| Provider {
              archive: path.clone(),
              entry,
              mod_id: None,
              priority: usize::MAX,
            });
        }
        index.archives.insert(path, archive);
      }
    }
    Ok(index)
  }
}

// This cache lives only for one game index/check batch. A new check reopens the
// game files; mod bytes stay in their own snapshot and cannot contaminate it.
const MAX_GAME_BYTES: usize = 64 * 1024 * 1024;
const MAX_GAME_ENTRIES: usize = 128;

#[derive(Default)]
struct GameBytes {
  entries: VecDeque<(PathBuf, Arc<Vec<u8>>)>,
  bytes: usize,
}

impl GameBytes {
  fn get(&mut self, key: &Path) -> Option<Arc<Vec<u8>>> {
    let index = self.entries.iter().position(|(path, _)| path == key)?;
    let entry = self.entries.remove(index)?;
    let bytes = Arc::clone(&entry.1);
    self.entries.push_back(entry);
    Some(bytes)
  }

  fn insert(&mut self, key: PathBuf, bytes: Arc<Vec<u8>>) {
    let size = bytes.capacity();
    if size > MAX_GAME_BYTES || self.get(&key).is_some() {
      return;
    }
    while self.bytes + size > MAX_GAME_BYTES || self.entries.len() >= MAX_GAME_ENTRIES {
      let (_, removed) = self
        .entries
        .pop_front()
        .expect("cache has an eviction candidate");
      self.bytes -= removed.capacity();
    }
    self.bytes += size;
    self.entries.push_back((key, bytes));
  }
}

/// One ordered view of enabled addons and the installed citadel/core resources.
/// It deliberately excludes inactive profiles and unrelated workshop/map packages.
pub(super) struct ResourceSnapshot {
  game: Arc<GameIndex>,
  archives: BTreeMap<PathBuf, VpkArchive>,
  mods: BTreeMap<String, Provider>,
  bytes: RefCell<BTreeMap<PathBuf, Arc<Vec<u8>>>>,
}

impl ResourceSnapshot {
  pub(super) fn console_log(&self) -> PathBuf {
    self.game.directories[0].join("console.log")
  }
  pub(super) fn open(citadel: &Path, mods: &[LocalizationModInput]) -> Result<Self, Error> {
    let (archives, providers) = open_mod_archives(mods)?;
    let game = if mods.is_empty() {
      GameIndex::new(citadel)
    } else {
      GameIndex::open_excluding(citadel, &archives)?
    };
    Ok(Self {
      game: Arc::new(game),
      archives,
      mods: providers,
      bytes: RefCell::new(BTreeMap::new()),
    })
  }

  pub(super) fn with_game(
    game: Arc<GameIndex>,
    mods: &[LocalizationModInput],
  ) -> Result<Self, Error> {
    let (archives, providers) = open_mod_archives(mods)?;
    Ok(Self {
      game,
      archives,
      mods: providers,
      bytes: RefCell::new(BTreeMap::new()),
    })
  }

  pub(super) fn archive(&self, path: &Path) -> &VpkArchive {
    self
      .archives
      .get(path)
      .expect("enabled archives were indexed")
  }

  pub(super) fn mod_paths(&self) -> impl Iterator<Item = &String> {
    self.mods.keys()
  }

  pub(super) fn provider(&self, name: &str) -> Option<Provider> {
    let path = resource_path(name)?;
    self
      .mods
      .get(&path)
      .cloned()
      .or_else(|| self.game_provider(&path))
  }

  fn game_provider(&self, path: &str) -> Option<Provider> {
    for directory in &self.game.directories {
      let loose = directory.join(path);
      if loose.is_file() {
        return Some(Provider {
          archive: loose,
          entry: String::new(),
          mod_id: None,
          priority: usize::MAX,
        });
      }
      if let Some(provider) = self
        .game
        .resources
        .get(path)
        .filter(|provider| provider.archive.parent() == Some(directory.as_path()))
      {
        return Some(provider.clone());
      }
    }
    None
  }

  pub(super) fn has_game_resource(&self, name: &str) -> bool {
    resource_path(name).is_some_and(|path| self.game_provider(&path).is_some())
  }

  pub(super) fn game_bytes(&self, name: &str) -> Result<Option<Arc<Vec<u8>>>, Error> {
    let Some(path) = resource_path(name) else {
      return Ok(None);
    };
    self
      .game_provider(&path)
      .map(|provider| self.read(&provider))
      .transpose()
  }

  pub(super) fn resolve(&self, name: &str) -> Result<Option<ResolvedResource>, Error> {
    self
      .provider(name)
      .map(|provider| self.read(&provider).map(|bytes| (provider, bytes)))
      .transpose()
  }

  /// The dependency this mod would load on its own, using its own VPK order.
  pub(super) fn standalone_bytes(
    &self,
    input: &LocalizationModInput,
    path: &str,
  ) -> Result<Option<Arc<Vec<u8>>>, Error> {
    for archive in &input.vpks {
      if self.archive(archive).contains_entry(path) {
        return self
          .read(&Provider {
            archive: archive.clone(),
            entry: path.into(),
            mod_id: Some(input.mod_id.clone()),
            priority: 0,
          })
          .map(Some);
      }
    }
    self.game_bytes(path)
  }

  fn read(&self, provider: &Provider) -> Result<Arc<Vec<u8>>, Error> {
    let key = provider.archive.join(&provider.entry);
    if let Some(bytes) = self.bytes.borrow().get(&key) {
      return Ok(Arc::clone(bytes));
    }
    if provider.mod_id.is_none()
      && let Some(bytes) = self
        .game
        .bytes
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .get(&key)
    {
      self.bytes.borrow_mut().insert(key, Arc::clone(&bytes));
      return Ok(bytes);
    }
    let bytes = if provider.entry.is_empty() {
      fs::read(&provider.archive)?
    } else {
      self
        .archives
        .get(&provider.archive)
        .unwrap_or_else(|| &self.game.archives[&provider.archive])
        .extract_entry(&provider.entry)
        .map_err(|error| {
          Error::ModInvalid(format!(
            "Failed to read {}:{}: {error}",
            provider.archive.display(),
            provider.entry
          ))
        })?
    };
    let bytes = Arc::new(bytes);
    if provider.mod_id.is_none() {
      self
        .game
        .bytes
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .insert(key.clone(), Arc::clone(&bytes));
    }
    self.bytes.borrow_mut().insert(key, Arc::clone(&bytes));
    Ok(bytes)
  }
}

fn open_mod_archives(mods: &[LocalizationModInput]) -> Result<ModArchives, Error> {
  let mut archives = BTreeMap::new();
  let mut providers = BTreeMap::new();
  for (priority, input) in mods.iter().enumerate() {
    for path in &input.vpks {
      let archive = VpkArchive::open(path).map_err(|error| Error::ModInvalid(format!(
        "Could not read VPK {} for mod {}: {error}. Reinstall this mod or disable it before retrying compatibility review", path.display(), input.mod_id
      )))?;
      for entry in archive.list_entries() {
        providers
          .entry(normalize_path(&entry))
          .or_insert_with(|| Provider {
            archive: path.clone(),
            entry,
            mod_id: Some(input.mod_id.clone()),
            priority,
          });
      }
      archives.insert(path.clone(), archive);
    }
  }
  Ok((archives, providers))
}

pub(super) fn resource_path(name: &str) -> Option<String> {
  let mut path = normalize_path(name);
  if path
    .split('/')
    .any(|part| matches!(part, "" | "." | "..") || part.contains(':'))
    || path.contains('#')
  {
    return None;
  }
  if !path.ends_with("_c") && !path.ends_with(".txt") {
    path.push_str("_c");
  }
  Some(path)
}

#[cfg(test)]
pub(super) mod tests {
  use super::*;

  pub(in crate::mod_manager::localization_overlay) fn pack(
    root: &Path,
    name: &str,
    entries: &[(&str, &[u8])],
  ) -> PathBuf {
    let source = root.join(format!("{name}-source"));
    for (entry, bytes) in entries {
      let path = source.join(entry);
      fs::create_dir_all(path.parent().unwrap()).unwrap();
      fs::write(path, bytes).unwrap();
    }
    let path = root.join(format!("{name}_dir.vpk"));
    super::super::pack_directory(&source, &path).unwrap();
    path
  }

  #[test]
  fn ordered_providers_share_bytes_and_keep_mods_out_of_vanilla() {
    let temp = tempfile::tempdir().unwrap();
    let citadel = temp.path().join("citadel");
    let core = temp.path().join("core");
    fs::create_dir_all(&citadel).unwrap();
    fs::create_dir_all(&core).unwrap();
    let path = "scripts/table.vdata_c";
    pack(
      &core,
      "pak01",
      &[(path, b"core"), ("scripts/core.vdata_c", b"core-only")],
    );
    pack(&citadel, "pak01", &[(path, b"citadel")]);
    let first = pack(
      &citadel,
      "first",
      &[(path, b"first"), ("scripts/custom.vdata_c", b"custom")],
    );
    let second = pack(&citadel, "second", &[(path, b"second")]);
    let mods = [
      LocalizationModInput {
        mod_id: "first".into(),
        vpks: vec![first],
      },
      LocalizationModInput {
        mod_id: "second".into(),
        vpks: vec![second],
      },
    ];
    let snapshot = ResourceSnapshot::open(&citadel, &mods).unwrap();
    let (provider, bytes) = snapshot.resolve("SCRIPTS\\TABLE.vdata").unwrap().unwrap();
    assert_eq!(provider.mod_id.as_deref(), Some("first"));
    assert_eq!(bytes.as_slice(), b"first");
    assert!(Arc::ptr_eq(
      &bytes,
      &snapshot.resolve(path).unwrap().unwrap().1
    ));
    assert_eq!(
      snapshot.game_bytes(path).unwrap().unwrap().as_slice(),
      b"citadel"
    );
    assert_eq!(
      snapshot
        .game_bytes("scripts/core.vdata")
        .unwrap()
        .unwrap()
        .as_slice(),
      b"core-only"
    );
    assert!(
      snapshot
        .game_bytes("scripts/custom.vdata")
        .unwrap()
        .is_none()
    );
    fs::create_dir_all(citadel.join("scripts")).unwrap();
    fs::write(citadel.join(path), b"loose").unwrap();
    assert_eq!(
      ResourceSnapshot::open(&citadel, &mods)
        .unwrap()
        .game_bytes(path)
        .unwrap()
        .unwrap()
        .as_slice(),
      b"loose"
    );
  }

  #[test]
  fn game_bytes_are_shared_across_mod_checks_but_refresh_with_the_index() {
    let temp = tempfile::tempdir().unwrap();
    let path = "scripts/shared.vdata_c";
    fs::create_dir_all(temp.path().join("scripts")).unwrap();
    fs::write(temp.path().join(path), b"before").unwrap();
    let game = Arc::new(GameIndex::open(temp.path()).unwrap());
    let first = ResourceSnapshot::with_game(Arc::clone(&game), &[]).unwrap();
    let bytes = first.game_bytes(path).unwrap().unwrap();
    let second = ResourceSnapshot::with_game(game, &[]).unwrap();
    assert!(Arc::ptr_eq(
      &bytes,
      &second.game_bytes(path).unwrap().unwrap()
    ));
    fs::write(temp.path().join(path), b"after").unwrap();
    let fresh =
      ResourceSnapshot::with_game(Arc::new(GameIndex::open(temp.path()).unwrap()), &[]).unwrap();
    assert_eq!(
      fresh.game_bytes(path).unwrap().unwrap().as_slice(),
      b"after"
    );
  }

  #[test]
  fn game_cache_evicts_old_entries_and_rejects_oversized_files() {
    let mut cache = GameBytes::default();
    for index in 0..MAX_GAME_ENTRIES {
      cache.insert(index.to_string().into(), Arc::new(vec![1]));
    }
    cache.get(Path::new("0")).unwrap();
    cache.insert("new".into(), Arc::new(vec![2]));
    assert!(cache.get(Path::new("1")).is_none());
    assert!(cache.get(Path::new("0")).is_some());
    cache.insert("oversized".into(), Arc::new(vec![0; MAX_GAME_BYTES + 1]));
    assert!(cache.get(Path::new("oversized")).is_none());
    assert!(cache.bytes <= MAX_GAME_BYTES);
    for index in 0..4 {
      cache.insert(
        format!("large-{index}").into(),
        Arc::new(vec![0; MAX_GAME_BYTES / 2]),
      );
    }
    assert!(cache.get(Path::new("large-0")).is_none());
    assert_eq!(cache.entries.len(), 2);
    assert_eq!(cache.bytes, MAX_GAME_BYTES);
  }

  #[test]
  fn resource_names_cannot_escape_the_snapshot() {
    for path in [
      "",
      "../secret",
      "/tmp/file",
      "models/../secret",
      "models//file",
      "C:\\file",
      "models/./file",
      "#external",
    ] {
      assert!(resource_path(path).is_none(), "{path}");
    }
    assert_eq!(
      resource_path("MODELS\\hero.vmdl"),
      Some("models/hero.vmdl_c".into())
    );
  }
}
