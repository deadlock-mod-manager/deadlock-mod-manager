//! `mods.install`: installs a staged snapshot into the granted profile
//! through the regular mod manager update path, so manifests, shards, the
//! running-game guard and VPK staging rollback all apply unchanged.

use super::snapshots::{self, SnapshotError, SnapshotStore};
use crate::Error;
use crate::{Deployment, HostAdapter};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// How grants and `mods.list` name the default profile, whose mods live in
/// the root addons folder.
pub const DEFAULT_PROFILE: &str = "default";

/// A profile folder name, or [`DEFAULT_PROFILE`].
pub fn is_profile_folder(folder: &str) -> bool {
  !folder.is_empty()
    && folder.len() <= 128
    && folder
      .bytes()
      .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

/// A dedicated profile keeps plugin installs away from the default addons
/// folder the player actually uses.
pub fn is_dedicated_profile(folder: &str) -> bool {
  folder != DEFAULT_PROFILE && is_profile_folder(folder)
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeployState {
  pending: Option<PendingDeploy>,
  #[serde(default)]
  deployed: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PendingDeploy {
  hash: String,
  profile_folder: String,
}

pub struct Deployments {
  state_path: PathBuf,
}

#[derive(Debug)]
pub enum DeployError {
  Invalid(String),
  Host(Error),
}

impl From<Error> for DeployError {
  fn from(error: Error) -> Self {
    Self::Host(error)
  }
}

impl From<SnapshotError> for DeployError {
  fn from(error: SnapshotError) -> Self {
    match error {
      SnapshotError::Io(error) => Self::Host(error.into()),
      other => Self::Invalid(other.to_string()),
    }
  }
}

impl Deployments {
  pub fn new(data_dir: &Path) -> Self {
    Self {
      state_path: data_dir.join("deploy.json"),
    }
  }

  fn load(&self) -> Result<DeployState, Error> {
    match fs::read(&self.state_path) {
      Ok(bytes) => {
        serde_json::from_slice(&bytes).map_err(|error| Error::InvalidInput(error.to_string()))
      }
      Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(DeployState::default()),
      Err(error) => Err(error.into()),
    }
  }

  fn save(&self, state: &DeployState) -> Result<(), Error> {
    if let Some(parent) = self.state_path.parent() {
      fs::create_dir_all(parent)?;
    }
    let bytes =
      serde_json::to_vec(state).map_err(|error| Error::InvalidInput(error.to_string()))?;
    let partial = self.state_path.with_extension("json.part");
    fs::write(&partial, bytes)?;
    fs::rename(partial, &self.state_path)?;
    Ok(())
  }

  /// Snapshots the quota must not evict: the last deployed one and
  /// one whose deployment may still be in flight.
  pub fn pinned(&self) -> Result<Vec<String>, Error> {
    let state = self.load()?;
    Ok(
      state
        .pending
        .map(|pending| pending.hash)
        .into_iter()
        .chain(state.deployed)
        .collect(),
    )
  }

  /// Resolves an interrupted deployment: if the profile ended up running a
  /// staged build, keep a copy of it in the mods store like a completed
  /// deploy would; either way the pending marker is cleared.
  pub fn reconcile(
    &self,
    access: &dyn HostAdapter,
    store: &SnapshotStore,
    plugin_id: &str,
    profile_folder: &str,
  ) -> Result<Option<String>, DeployError> {
    let mut state = self.load()?;
    let installed = access.installed_hash(plugin_id, profile_folder)?;
    if let Some(pending) = &state.pending
      && pending.profile_folder == profile_folder
      && installed.as_ref() == Some(&pending.hash)
      && let Some(source) = store.path(&pending.hash).filter(|path| path.is_file())
    {
      access.retain_source(plugin_id, profile_folder, &source)?;
    }
    if state.pending.is_some() || state.deployed != installed {
      state.pending = None;
      state.deployed.clone_from(&installed);
      self.save(&state)?;
    }
    Ok(installed)
  }

  pub fn deploy(
    &self,
    access: &dyn HostAdapter,
    store: &SnapshotStore,
    plugin_id: &str,
    plugin_name: &str,
    profile_folder: &str,
    hash: &str,
  ) -> Result<(), DeployError> {
    if !is_dedicated_profile(profile_folder) {
      return Err(DeployError::Invalid(
        "The granted profile is not a dedicated profile".into(),
      ));
    }
    self.reconcile(access, store, plugin_id, profile_folder)?;
    let source = store
      .path(hash)
      .filter(|path| path.is_file())
      .ok_or_else(|| DeployError::Invalid("That snapshot is not staged".into()))?;
    snapshots::validate_vpk(&source)?;
    if snapshots::hash(&source)? != hash {
      return Err(DeployError::Invalid(
        "The staged snapshot was modified".into(),
      ));
    }
    let mut state = self.load()?;
    state.pending = Some(PendingDeploy {
      hash: hash.to_owned(),
      profile_folder: profile_folder.to_owned(),
    });
    self.save(&state)?;
    access.deploy(Deployment {
      plugin_id,
      plugin_name,
      profile_folder,
      source: &source,
    })?;
    self.save(&DeployState {
      pending: None,
      deployed: Some(hash.to_owned()),
    })?;
    Ok(())
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::adapter::tests::TestProfiles;
  use crate::snapshots::tests::vpk;
  use std::sync::atomic::{AtomicBool, Ordering};

  struct InterruptedProfiles {
    profiles: TestProfiles,
    interrupt: AtomicBool,
    retained: AtomicBool,
  }

  impl HostAdapter for InterruptedProfiles {
    fn validate_profile(&self, folder: &str) -> Result<(), Error> {
      self.profiles.validate_profile(folder)
    }
    fn installed_hash(&self, id: &str, folder: &str) -> Result<Option<String>, Error> {
      self.profiles.installed_hash(id, folder)
    }
    fn deploy(&self, request: Deployment<'_>) -> Result<(), Error> {
      self.profiles.deploy(request)?;
      if self.interrupt.swap(false, Ordering::SeqCst) {
        return Err(Error::Host {
          code: "interrupted",
          message: "Interrupted after commit".into(),
        });
      }
      Ok(())
    }
    fn retain_source(&self, _: &str, _: &str, _: &Path) -> Result<(), Error> {
      self.retained.store(true, Ordering::SeqCst);
      Ok(())
    }
    fn profiles(&self) -> Result<Vec<String>, Error> {
      self.profiles.profiles()
    }
    fn profile_mods(&self, folder: &str) -> Result<Vec<crate::ProfileMod>, Error> {
      self.profiles.profile_mods(folder)
    }
    fn fetch(&self, request: &crate::HttpRequest) -> Result<crate::HttpResponse, Error> {
      self.profiles.fetch(request)
    }
    fn game_running(&self) -> Result<bool, Error> {
      self.profiles.game_running()
    }
  }

  #[test]
  fn recovers_an_interrupted_adapter_deployment_and_preserves_its_snapshot() {
    let dir = tempfile::tempdir().unwrap();
    let profiles = dir.path().join("profiles");
    fs::create_dir_all(profiles.join("test-profile")).unwrap();
    let adapter = InterruptedProfiles {
      profiles: TestProfiles::new(profiles),
      interrupt: AtomicBool::new(true),
      retained: AtomicBool::new(false),
    };
    let store = SnapshotStore::new(&dir.path().join("data"));
    let deployments = Deployments::new(&dir.path().join("data"));
    let source = dir.path().join("output.vpk");
    fs::write(&source, vpk("build")).unwrap();
    let (snapshot, _) = store
      .stage(&source, snapshots::stamp(&source).unwrap(), &[])
      .unwrap();
    assert!(
      deployments
        .deploy(
          &adapter,
          &store,
          "example.plugin",
          "P",
          "test-profile",
          &snapshot.hash
        )
        .is_err()
    );
    assert_eq!(deployments.pinned().unwrap(), vec![snapshot.hash.clone()]);
    assert_eq!(
      deployments
        .reconcile(&adapter, &store, "example.plugin", "test-profile")
        .unwrap(),
      Some(snapshot.hash)
    );
    assert!(adapter.retained.load(Ordering::SeqCst));
    assert!(deployments.load().unwrap().pending.is_none());
  }

  #[test]
  fn refuses_default_profiles_unknown_and_tampered_snapshots() {
    let dir = tempfile::tempdir().unwrap();
    fs::create_dir_all(dir.path().join("profiles/test-profile")).unwrap();
    let adapter = TestProfiles::new(dir.path().join("profiles"));
    let store = SnapshotStore::new(&dir.path().join("data"));
    let deployments = Deployments::new(&dir.path().join("data"));
    let source = dir.path().join("output.vpk");
    fs::write(&source, vpk("build")).unwrap();
    let (snapshot, _) = store
      .stage(&source, snapshots::stamp(&source).unwrap(), &[])
      .unwrap();
    assert!(matches!(
      deployments.deploy(
        &adapter,
        &store,
        "example.plugin",
        "P",
        "default",
        &snapshot.hash
      ),
      Err(DeployError::Invalid(_))
    ));
    assert!(matches!(
      deployments.deploy(
        &adapter,
        &store,
        "example.plugin",
        "P",
        "test-profile",
        &"0".repeat(64)
      ),
      Err(DeployError::Invalid(_))
    ));
    fs::write(store.path(&snapshot.hash).unwrap(), vpk("tampered")).unwrap();
    assert!(matches!(
      deployments.deploy(
        &adapter,
        &store,
        "example.plugin",
        "P",
        "test-profile",
        &snapshot.hash
      ),
      Err(DeployError::Invalid(_))
    ));
  }
}
