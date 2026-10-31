use crate::Error;
use serde::Serialize;
use std::path::Path;

/// A runtime-validated staged snapshot and its approved destination.
pub struct Deployment<'a> {
  pub plugin_id: &'a str,
  pub plugin_name: &'a str,
  pub profile_folder: &'a str,
  pub source: &'a Path,
}

/// One mod of a profile, as `mods.list` reports it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileMod {
  pub id: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub name: Option<String>,
  pub enabled: bool,
  /// File names of the mod's VPKs in the profile.
  pub files: Vec<String>,
}

/// A request the runtime has checked against the plugin's `network` grant.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HttpRequest {
  pub url: String,
  /// The approved host the URL names; the adapter must not reach another.
  pub host: String,
  pub method: String,
  pub headers: Vec<(String, String)>,
  pub body: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HttpResponse {
  pub status: u16,
  pub headers: Vec<(String, String)>,
  pub body: Vec<u8>,
}

/// Integration with the application. The runtime handles grants, staging,
/// quotas, request policy and recovery records; the adapter handles game
/// files, profile manifests, transactional installation, game detection and
/// the network.
pub trait HostAdapter: Send + Sync {
  /// Checks that a profile folder exists. `"default"` names the default
  /// profile.
  fn validate_profile(&self, folder: &str) -> Result<(), Error>;
  /// Every profile folder, `"default"` included.
  fn profiles(&self) -> Result<Vec<String>, Error>;
  fn profile_mods(&self, folder: &str) -> Result<Vec<ProfileMod>, Error>;
  fn installed_hash(&self, plugin_id: &str, folder: &str) -> Result<Option<String>, Error>;
  fn deploy(&self, deployment: Deployment<'_>) -> Result<(), Error>;
  fn retain_source(&self, plugin_id: &str, folder: &str, source: &Path) -> Result<(), Error>;
  /// Performs a request without following redirects, refusing destinations
  /// that resolve to private, loopback or link-local addresses, with a 15 s
  /// timeout and a 4 MiB response cap. Runs on a plain thread.
  fn fetch(&self, request: &HttpRequest) -> Result<HttpResponse, Error>;
  fn game_running(&self) -> Result<bool, Error>;
}

#[cfg(test)]
pub(crate) mod tests {
  use super::*;
  use crate::snapshots;
  use std::sync::Mutex;
  use std::sync::atomic::{AtomicBool, Ordering};
  use std::{fs, path::PathBuf};

  pub struct TestProfiles {
    root: PathBuf,
    pub fetches: Mutex<Vec<HttpRequest>>,
    pub game_running: AtomicBool,
  }

  impl TestProfiles {
    pub fn new(root: PathBuf) -> Self {
      Self {
        root,
        fetches: Mutex::new(Vec::new()),
        game_running: AtomicBool::new(false),
      }
    }
    fn folder(&self, folder: &str) -> PathBuf {
      if folder == crate::deploy::DEFAULT_PROFILE {
        self.root.clone()
      } else {
        self.root.join(folder)
      }
    }
    fn installed(&self, id: &str, folder: &str) -> PathBuf {
      self.folder(folder).join(format!("{id}.vpk"))
    }
  }

  impl HostAdapter for TestProfiles {
    fn validate_profile(&self, folder: &str) -> Result<(), Error> {
      if self.folder(folder).is_dir() {
        Ok(())
      } else {
        Err(Error::InvalidInput(
          "That profile folder no longer exists".into(),
        ))
      }
    }
    fn profiles(&self) -> Result<Vec<String>, Error> {
      let mut folders = vec![crate::deploy::DEFAULT_PROFILE.to_owned()];
      for entry in fs::read_dir(&self.root)? {
        let entry = entry?;
        if entry.file_type()?.is_dir() {
          folders.push(entry.file_name().to_string_lossy().into_owned());
        }
      }
      Ok(folders)
    }
    fn profile_mods(&self, folder: &str) -> Result<Vec<ProfileMod>, Error> {
      let mut mods = Vec::new();
      for entry in fs::read_dir(self.folder(folder))? {
        let name = entry?.file_name().to_string_lossy().into_owned();
        if let Some(id) = name.strip_suffix(".vpk") {
          mods.push(ProfileMod {
            id: id.to_owned(),
            name: None,
            enabled: true,
            files: vec![name.clone()],
          });
        }
      }
      Ok(mods)
    }
    fn installed_hash(&self, id: &str, folder: &str) -> Result<Option<String>, Error> {
      let path = self.installed(id, folder);
      if !path.exists() {
        return Ok(None);
      }
      snapshots::hash(&path)
        .map(Some)
        .map_err(|e| Error::InvalidInput(e.to_string()))
    }
    fn deploy(&self, deployment: Deployment<'_>) -> Result<(), Error> {
      if self.game_running()? {
        return Err(Error::Host {
          code: "game_running",
          message: "Close Deadlock before installing a snapshot".into(),
        });
      }
      self.validate_profile(deployment.profile_folder)?;
      fs::copy(
        deployment.source,
        self.installed(deployment.plugin_id, deployment.profile_folder),
      )?;
      Ok(())
    }
    fn retain_source(&self, _: &str, _: &str, _: &Path) -> Result<(), Error> {
      Ok(())
    }
    fn fetch(&self, request: &HttpRequest) -> Result<HttpResponse, Error> {
      self
        .fetches
        .lock()
        .map_err(|_| Error::InvalidInput("poisoned".into()))?
        .push(request.clone());
      Ok(HttpResponse {
        status: 200,
        headers: vec![
          ("content-type".into(), "application/json".into()),
          ("set-cookie".into(), "session=1".into()),
        ],
        body: br#"{"ok":true}"#.to_vec(),
      })
    }
    fn game_running(&self) -> Result<bool, Error> {
      Ok(self.game_running.load(Ordering::SeqCst))
    }
  }
}
