//! DMM host adapter for the external plugin runtime: profiles, installs,
//! game detection and the network.
use crate::{errors::Error, mod_manager::ModManager};
use dmm_plugin_runtime::{
  Deployment, Error as RuntimeError, HostAdapter, HttpRequest, HttpResponse, ProfileMod,
};
use sha2::{Digest, Sha256};
use std::{
  fs,
  io::Read,
  path::{Path, PathBuf},
  sync::Mutex,
  time::SystemTime,
};

type Stamp = (u64, SystemTime);

fn stamp(path: &Path) -> Result<Stamp, Error> {
  let meta = fs::metadata(path)?;
  Ok((meta.len(), meta.modified()?))
}

fn hash(path: &Path) -> Result<String, Error> {
  let mut file = fs::File::open(path)?;
  let mut digest = Sha256::new();
  let mut buffer = [0u8; 65536];
  loop {
    let count = file.read(&mut buffer)?;
    if count == 0 {
      break;
    }
    digest.update(&buffer[..count]);
  }
  Ok(format!("{:x}", digest.finalize()))
}

fn runtime_error(error: Error) -> RuntimeError {
  let code = if matches!(error, Error::GameRunning) {
    "game_running"
  } else {
    "host_error"
  };
  RuntimeError::Host {
    code,
    message: error.to_string(),
  }
}

#[derive(Default)]
enum ManagerAccess {
  #[default]
  Global,
  #[cfg(test)]
  Owned {
    manager: Box<Mutex<ModManager>>,
    mods_store: PathBuf,
  },
}

impl ManagerAccess {
  fn with<T>(
    &self,
    f: impl FnOnce(&mut ModManager, &Path) -> Result<T, Error>,
  ) -> Result<T, Error> {
    match self {
      Self::Global => {
        let mut manager = crate::commands::state::MANAGER
          .lock()
          .map_err(|_| Error::BackgroundTaskFailed("Mod manager lock poisoned".into()))?;
        let mods_store = manager.get_mods_store_path()?;
        f(&mut manager, &mods_store)
      }
      #[cfg(test)]
      Self::Owned {
        manager,
        mods_store,
      } => f(&mut manager.lock().unwrap(), mods_store),
    }
  }

  fn ensure_game_idle(&self) -> Result<(), Error> {
    match self {
      Self::Global => crate::game_guard::ensure_game_idle_locked("external_plugin_deploy", None),
      #[cfg(test)]
      Self::Owned { .. } => Ok(()),
    }
  }
}

fn mod_id(plugin_id: &str, profile_folder: &str) -> String {
  let digest = Sha256::digest(format!("{plugin_id}\0{profile_folder}").as_bytes());
  format!("local-ext-{}", &format!("{digest:x}")[..32])
}

fn retain_source(mods_store: &Path, mod_id: &str, source: &Path) -> Result<(), Error> {
  let files = mods_store.join(mod_id).join("files");
  fs::create_dir_all(&files)?;
  let retained = files.join("artifact_dir.vpk");
  let partial = retained.with_extension("part");
  fs::copy(source, &partial)?;
  fs::rename(partial, retained)?;
  Ok(())
}

#[derive(Default)]
pub struct DesktopAdapter {
  access: ManagerAccess,
  cache: Mutex<Option<(PathBuf, Stamp, String)>>,
}

impl DesktopAdapter {
  /// Hash of the artifact that is actually enabled in the profile, read from
  /// the profile's VPK manifest rather than trusted from our own records.
  fn read_installed_hash(
    &self,
    manager: &ModManager,
    plugin_id: &str,
    profile_folder: &str,
  ) -> Result<Option<String>, Error> {
    let base = manager.get_addons_path(Some(profile_folder))?;
    let manifest = manager.get_profile_vpk_manifest(Some(profile_folder.to_owned()))?;
    let Some(entry) = manifest
      .mods
      .get(&mod_id(plugin_id, profile_folder))
      .filter(|entry| entry.enabled)
    else {
      return Ok(None);
    };
    let files = entry.file_paths(&base);
    let [file] = files.as_slice() else {
      return Ok(None);
    };
    if !file.is_file() {
      return Ok(None);
    }
    let current = stamp(file)?;
    let mut cache = self
      .cache
      .lock()
      .map_err(|_| Error::InvalidInput("cache poisoned".into()))?;
    if let Some((path, stamp, digest)) = cache.as_ref()
      && path == file
      && *stamp == current
    {
      return Ok(Some(digest.clone()));
    }
    let digest = hash(file)?;
    *cache = Some((file.clone(), current, digest.clone()));
    Ok(Some(digest))
  }
}

/// The runtime names the default profile `"default"`; the mod manager names
/// it with no folder.
fn profile_arg(folder: &str) -> Option<&str> {
  (folder != DEFAULT_PROFILE).then_some(folder)
}

const DEFAULT_PROFILE: &str = "default";
const MAX_METADATA_BYTES: u64 = 64 * 1024;

/// The display name a local mod records in the mods store. Downloaded mods
/// keep theirs in the frontend store, which the backend cannot read cheaply.
fn stored_mod_name(mods_store: &Path, mod_id: &str) -> Option<String> {
  ModManager::ensure_safe_mod_id(mod_id).ok()?;
  let path = mods_store.join(mod_id).join("metadata.json");
  if fs::metadata(&path).ok()?.len() > MAX_METADATA_BYTES {
    return None;
  }
  let metadata: serde_json::Value = serde_json::from_slice(&fs::read(path).ok()?).ok()?;
  metadata["name"].as_str().map(str::to_owned)
}

fn profile_mods(
  manager: &ModManager,
  mods_store: &Path,
  folder: &str,
) -> Result<Vec<ProfileMod>, Error> {
  let profile = profile_arg(folder);
  let base = manager.get_addons_path(profile)?;
  let manifest = manager.get_profile_vpk_manifest(profile.map(str::to_owned))?;
  Ok(
    manifest
      .mods
      .iter()
      .map(|(id, entry)| ProfileMod {
        id: id.clone(),
        name: stored_mod_name(mods_store, id),
        enabled: entry.enabled,
        files: entry
          .file_paths(&base)
          .iter()
          .filter_map(|path| path.file_name())
          .map(|name| name.to_string_lossy().into_owned())
          .collect(),
      })
      .collect(),
  )
}

/// `"default"` and every `profile_*` folder, like `list_profile_folders`.
fn profile_folders(manager: &ModManager) -> Result<Vec<String>, Error> {
  let addons = manager.get_addons_path(None)?;
  let mut folders = vec![DEFAULT_PROFILE.to_owned()];
  if addons.is_dir() {
    for entry in fs::read_dir(&*addons)? {
      let entry = entry?;
      if entry.file_type()?.is_dir()
        && let Ok(name) = entry.file_name().into_string()
        && name.starts_with("profile_")
      {
        folders.push(name);
      }
    }
  }
  folders[1..].sort();
  Ok(folders)
}

impl HostAdapter for DesktopAdapter {
  fn validate_profile(&self, folder: &str) -> Result<(), RuntimeError> {
    self
      .access
      .with(|manager, _| {
        if manager.get_addons_path(profile_arg(folder))?.is_dir() {
          Ok(())
        } else {
          Err(Error::InvalidInput(
            "That profile folder no longer exists".into(),
          ))
        }
      })
      .map_err(runtime_error)
  }
  fn profiles(&self) -> Result<Vec<String>, RuntimeError> {
    self
      .access
      .with(|manager, _| profile_folders(manager))
      .map_err(runtime_error)
  }
  fn profile_mods(&self, folder: &str) -> Result<Vec<ProfileMod>, RuntimeError> {
    self
      .access
      .with(|manager, mods_store| profile_mods(manager, mods_store, folder))
      .map_err(runtime_error)
  }
  fn fetch(&self, request: &HttpRequest) -> Result<HttpResponse, RuntimeError> {
    super::network::fetch(request)
  }
  fn game_running(&self) -> Result<bool, RuntimeError> {
    self
      .access
      .with(|manager, _| manager.is_game_running())
      .map_err(runtime_error)
  }
  fn installed_hash(&self, id: &str, folder: &str) -> Result<Option<String>, RuntimeError> {
    self
      .access
      .with(|manager, _| self.read_installed_hash(manager, id, folder))
      .map_err(runtime_error)
  }
  fn retain_source(&self, id: &str, folder: &str, source: &Path) -> Result<(), RuntimeError> {
    self
      .access
      .with(|_, store| retain_source(store, &mod_id(id, folder), source))
      .map_err(runtime_error)
  }
  fn deploy(&self, deployment: Deployment<'_>) -> Result<(), RuntimeError> {
    let Deployment {
      plugin_id,
      plugin_name,
      profile_folder,
      source,
      ..
    } = deployment;
    self.access.ensure_game_idle().map_err(runtime_error)?;
    let mod_id = mod_id(plugin_id, profile_folder);
    self
      .access
      .with(|manager, mods_store| {
        if !manager.get_addons_path(Some(profile_folder))?.is_dir() {
          return Err(Error::InvalidInput(
            "The granted profile folder no longer exists".into(),
          ));
        }
        let mod_dir = mods_store.join(&mod_id);
        fs::create_dir_all(mod_dir.join("files"))?;
        let metadata = serde_json::json!({
          "id": mod_id,
          "kind": "local",
          "name": plugin_name,
          "author": plugin_name,
          "description": format!("Deployed by the {plugin_name} plugin"),
          "category": "Skins",
          "createdAt": chrono::Utc::now().to_rfc3339(),
          "_schema": 1
        });
        fs::write(
          mod_dir.join("metadata.json"),
          serde_json::to_vec(&metadata).map_err(|error| Error::InvalidInput(error.to_string()))?,
        )?;
        manager.update_mod_from_prepared(
          &mod_id,
          plugin_name,
          std::slice::from_ref(&source.to_path_buf()),
          None,
          Some(profile_folder.to_owned()),
          true,
        )?;
        retain_source(mods_store, &mod_id, source)
      })
      .map_err(runtime_error)
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::mod_manager::vpk_manifest::ProfileVpkManifest;
  fn vpk(name: &str) -> Vec<u8> {
    let mut tree = b"txt\0 \0".to_vec();
    tree.extend_from_slice(name.as_bytes());
    tree.push(0);
    tree.extend_from_slice(&0xcbf43926u32.to_le_bytes());
    tree.extend_from_slice(&0u16.to_le_bytes());
    tree.extend_from_slice(&0x7fffu16.to_le_bytes());
    tree.extend_from_slice(&0u32.to_le_bytes());
    tree.extend_from_slice(&9u32.to_le_bytes());
    tree.extend_from_slice(&0xffffu16.to_le_bytes());
    tree.extend_from_slice(&[0, 0, 0]);
    let mut bytes = 0x55aa1234u32.to_le_bytes().to_vec();
    bytes.extend_from_slice(&1u32.to_le_bytes());
    bytes.extend_from_slice(&(tree.len() as u32).to_le_bytes());
    bytes.extend(tree);
    bytes.extend_from_slice(b"123456789");
    bytes
  }

  fn adapter(root: &Path) -> DesktopAdapter {
    let citadel = root.join("game/citadel");
    fs::create_dir_all(citadel.join("addons/test-profile")).unwrap();
    fs::create_dir_all(citadel.join("addons/other-profile")).unwrap();
    fs::write(citadel.join("gameinfo.gi"), b"").unwrap();
    fs::write(citadel.join("addons/untouched.vpk"), b"default").unwrap();
    fs::write(citadel.join("addons/other-profile/untouched.vpk"), b"other").unwrap();
    let mut manager = ModManager::new();
    manager.set_game_path(root.to_path_buf()).unwrap();
    DesktopAdapter {
      access: ManagerAccess::Owned {
        manager: Box::new(Mutex::new(manager)),
        mods_store: root.join("mods-store"),
      },
      cache: Mutex::new(None),
    }
  }
  #[test]
  fn deploys_and_redeploys_without_touching_other_profiles() {
    let dir = tempfile::tempdir().unwrap();
    let profiles = adapter(dir.path());
    let plugin = "example.creator-workspace-bridge";
    for name in ["old", "new", "old"] {
      let source = dir.path().join(format!("{name}.vpk"));
      fs::write(&source, vpk(name)).unwrap();
      let digest = hash(&source).unwrap();
      profiles
        .deploy(Deployment {
          plugin_id: plugin,
          plugin_name: "Bridge",
          profile_folder: "test-profile",
          source: &source,
        })
        .unwrap();
      assert_eq!(
        profiles.installed_hash(plugin, "test-profile").unwrap(),
        Some(digest.clone())
      );
      let retained = dir
        .path()
        .join("mods-store")
        .join(mod_id(plugin, "test-profile"))
        .join("files/artifact_dir.vpk");
      assert_eq!(hash(&retained).unwrap(), digest);
    }
    let citadel = dir.path().join("game/citadel");
    let manifest = ProfileVpkManifest::load(
      &crate::mod_manager::shard::ProfileBase::new(citadel.join("addons/test-profile")).unwrap(),
    )
    .unwrap();
    assert!(manifest.mods[&mod_id(plugin, "test-profile")].enabled);
    let listed = profiles.profile_mods("test-profile").unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].id, mod_id(plugin, "test-profile"));
    assert_eq!(listed[0].name.as_deref(), Some("Bridge"));
    assert!(listed[0].enabled);
    assert_eq!(listed[0].files.len(), 1);
    assert!(profiles.profile_mods("default").unwrap().is_empty());
    assert_eq!(
      fs::read(citadel.join("addons/untouched.vpk")).unwrap(),
      b"default"
    );
    assert_eq!(
      fs::read(citadel.join("addons/other-profile/untouched.vpk")).unwrap(),
      b"other"
    );
    assert_ne!(
      mod_id(plugin, "test-profile"),
      mod_id(plugin, "other-profile")
    );
    assert_ne!(
      mod_id(plugin, "test-profile"),
      mod_id("example.other", "test-profile")
    );
  }
  #[test]
  fn validates_existing_profiles() {
    let dir = tempfile::tempdir().unwrap();
    let profiles = adapter(dir.path());
    assert!(profiles.validate_profile("test-profile").is_ok());
    assert!(profiles.validate_profile("default").is_ok());
    assert!(profiles.validate_profile("missing").is_err());
    fs::create_dir_all(dir.path().join("game/citadel/addons/profile_1_main")).unwrap();
    assert_eq!(
      profiles.profiles().unwrap(),
      ["default", "profile_1_main"],
      "the default profile and profile folders, not other addons folders"
    );
  }
}
