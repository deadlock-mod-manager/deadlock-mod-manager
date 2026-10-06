use super::{LocalizationModInput, normalize_path};
use crate::errors::Error;
use source2_model::vpk_extract::VpkArchive;
use std::{
  cell::RefCell,
  collections::BTreeMap,
  fs,
  path::{Path, PathBuf},
  sync::Arc,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Provider {
  pub archive: PathBuf,
  pub entry: String,
  pub mod_id: Option<String>,
  pub priority: usize,
}

type ResolvedResource = (Provider, Arc<Vec<u8>>);

/// One ordered view of enabled addons and the installed citadel/core resources.
/// It deliberately excludes inactive profiles and unrelated workshop/map packages.
pub(super) struct ResourceSnapshot {
  directories: Vec<PathBuf>,
  archives: BTreeMap<PathBuf, VpkArchive>,
  game: BTreeMap<String, Provider>,
  mods: BTreeMap<String, Provider>,
  bytes: RefCell<BTreeMap<PathBuf, Arc<Vec<u8>>>>,
}

impl ResourceSnapshot {
  pub(super) fn open(citadel: &Path, mods: &[LocalizationModInput]) -> Result<Self, Error> {
    let mut snapshot = Self {
      directories: vec![citadel.to_path_buf(), citadel.with_file_name("core")],
      archives: BTreeMap::new(),
      game: BTreeMap::new(),
      mods: BTreeMap::new(),
      bytes: RefCell::new(BTreeMap::new()),
    };
    if mods.is_empty() {
      return Ok(snapshot);
    }
    for (priority, input) in mods.iter().enumerate() {
      for path in &input.vpks {
        let archive = VpkArchive::open(path).map_err(|error| Error::ModInvalid(format!(
          "Could not read VPK {} for mod {}: {error}. Reinstall this mod or disable it before retrying compatibility review", path.display(), input.mod_id
        )))?;
        for entry in archive.list_entries() {
          snapshot
            .mods
            .entry(normalize_path(&entry))
            .or_insert_with(|| Provider {
              archive: path.clone(),
              entry,
              mod_id: Some(input.mod_id.clone()),
              priority,
            });
        }
        snapshot.archives.insert(path.clone(), archive);
      }
    }
    for directory in &snapshot.directories {
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
        if snapshot.archives.contains_key(&path) {
          continue;
        }
        let archive = VpkArchive::open(&path).map_err(|error| {
          Error::ModInvalid(format!(
            "Failed to index game resources in {}: {error}",
            path.display()
          ))
        })?;
        for entry in archive.list_entries() {
          snapshot
            .game
            .entry(normalize_path(&entry))
            .or_insert_with(|| Provider {
              archive: path.clone(),
              entry,
              mod_id: None,
              priority: usize::MAX,
            });
        }
        snapshot.archives.insert(path, archive);
      }
    }
    Ok(snapshot)
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
    for directory in &self.directories {
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
        .get(path)
        .filter(|provider| provider.archive.parent() == Some(directory.as_path()))
      {
        return Some(provider.clone());
      }
    }
    None
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

  fn read(&self, provider: &Provider) -> Result<Arc<Vec<u8>>, Error> {
    let key = provider.archive.join(&provider.entry);
    if let Some(bytes) = self.bytes.borrow().get(&key) {
      return Ok(Arc::clone(bytes));
    }
    let bytes = if provider.entry.is_empty() {
      fs::read(&provider.archive)?
    } else {
      self.archives[&provider.archive]
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
    self.bytes.borrow_mut().insert(key, Arc::clone(&bytes));
    Ok(bytes)
  }
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
