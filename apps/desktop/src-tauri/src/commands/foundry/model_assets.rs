//! Private GLB artifacts. IPC carries descriptors; the asset protocol carries bytes.

use std::collections::HashMap;
use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;

use tauri::State;
use tempfile::{TempDir, TempPath};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};
use tokio_util::sync::CancellationToken;

use super::staging::staged_base_game_vpk;
use super::types::FoundryModel;
use crate::errors::Error;
use crate::vpk_archive_cache::open_archive;

pub struct ModelAssets {
  files: Mutex<HashMap<String, TempPath>>,
  jobs: Mutex<HashMap<String, CancellationToken>>,
  _session_lock: File,
  directory: TempDir,
}

impl ModelAssets {
  pub fn open() -> Result<Self, Error> {
    Self::in_directory(
      &std::env::temp_dir()
        .join("deadlock-mod-manager")
        .join("foundry-models"),
    )
  }

  fn in_directory(root: &Path) -> Result<Self, Error> {
    std::fs::create_dir_all(root)?;
    clean_abandoned_sessions(root)?;
    let directory = tempfile::Builder::new()
      .prefix("session-")
      .tempdir_in(root)?;
    let session_lock = File::create(directory.path().join(".lock"))?;
    session_lock.try_lock().map_err(std::io::Error::other)?;
    Ok(Self {
      files: Mutex::new(HashMap::new()),
      jobs: Mutex::new(HashMap::new()),
      _session_lock: session_lock,
      directory,
    })
  }

  pub fn directory(&self) -> &Path {
    self.directory.path()
  }

  fn publish(
    &self,
    glb: &[u8],
    vertex_count: u32,
    index_count: u32,
  ) -> Result<FoundryModel, Error> {
    let mut file = tempfile::Builder::new()
      .prefix("model-")
      .suffix(".glb")
      .tempfile_in(self.directory())?;
    file.write_all(glb)?;
    file.flush()?;
    let path = file.into_temp_path();
    let asset_id = path.file_name().unwrap().to_string_lossy().into_owned();
    let model = FoundryModel {
      asset_id: asset_id.clone(),
      file_path: path.to_string_lossy().into_owned(),
      byte_length: glb.len(),
      vertex_count,
      index_count,
    };
    self
      .files
      .lock()
      .unwrap_or_else(|e| e.into_inner())
      .insert(asset_id, path);
    Ok(model)
  }

  fn release(&self, asset_id: &str) -> Result<(), Error> {
    let path = self
      .files
      .lock()
      .unwrap_or_else(|e| e.into_inner())
      .remove(asset_id);
    if let Some(path) = path {
      path.close()?;
    }
    Ok(())
  }

  fn start_job(self: &Arc<Self>, id: String) -> Result<ModelJob, Error> {
    let mut jobs = self.jobs.lock().unwrap_or_else(|e| e.into_inner());
    if id.is_empty() || id.len() > 128 || jobs.contains_key(&id) {
      return Err(Error::InvalidInput(
        "Invalid or duplicate model decode request".into(),
      ));
    }
    let token = CancellationToken::new();
    jobs.insert(id.clone(), token.clone());
    Ok(ModelJob {
      id,
      token,
      assets: self.clone(),
    })
  }

  fn cancel(&self, request_id: &str) {
    if let Some(token) = self
      .jobs
      .lock()
      .unwrap_or_else(|e| e.into_inner())
      .get(request_id)
    {
      token.cancel();
    }
  }
}

// Each session holds its lock until shutdown. A crashed process leaves an unlocked
// directory; other running app instances keep their files, regardless of age.
fn clean_abandoned_sessions(root: &Path) -> Result<(), Error> {
  for entry in std::fs::read_dir(root)? {
    let entry = entry?;
    if !entry.file_type()?.is_dir() || !entry.file_name().to_string_lossy().starts_with("session-")
    {
      continue;
    }
    let path = entry.path();
    let Ok(lock) = File::options()
      .read(true)
      .write(true)
      .open(path.join(".lock"))
    else {
      continue;
    };
    if lock.try_lock().is_err() {
      continue;
    }
    drop(lock);
    if let Err(error) = std::fs::remove_dir_all(&path) {
      log::warn!(
        "[Foundry] Could not clean abandoned model assets {}: {error}",
        path.display()
      );
    }
  }
  Ok(())
}

struct ModelJob {
  id: String,
  token: CancellationToken,
  assets: Arc<ModelAssets>,
}

impl ModelJob {
  fn check(&self) -> Result<(), Error> {
    if self.token.is_cancelled() {
      Err(Error::InvalidInput("Model decode cancelled".into()))
    } else {
      Ok(())
    }
  }

  async fn acquire(&self, slot: Arc<Semaphore>) -> Result<OwnedSemaphorePermit, Error> {
    tokio::select! {
      biased;
      _ = self.token.cancelled() => Err(Error::InvalidInput("Model decode cancelled".into())),
      permit = slot.acquire_owned() => permit.map_err(|e| Error::InvalidInput(format!("model decode slot closed: {e}"))),
    }
  }
}

impl Drop for ModelJob {
  fn drop(&mut self) {
    self
      .assets
      .jobs
      .lock()
      .unwrap_or_else(|e| e.into_inner())
      .remove(&self.id);
  }
}

fn model_decode_slot() -> Arc<Semaphore> {
  static SLOT: OnceLock<Arc<Semaphore>> = OnceLock::new();
  SLOT.get_or_init(|| Arc::new(Semaphore::new(1))).clone()
}

#[tauri::command]
pub async fn foundry_decode_model(
  assets: State<'_, Arc<ModelAssets>>,
  request_id: String,
  file_path: String,
  entry_path: String,
  workspace_root: Option<String>,
) -> Result<FoundryModel, Error> {
  let job = assets.start_job(request_id)?;
  let permit = job.acquire(model_decode_slot()).await?;
  tauri::async_runtime::spawn_blocking(move || {
    let _permit = permit;
    job.check()?;
    let started = Instant::now();
    let overlay = workspace_root.map(|root| PathBuf::from(root).join("files"));
    let base = staged_base_game_vpk()?
      .map(|path| open_archive(&path, None))
      .transpose()?;
    job.check()?;
    let archive = source2_model::vpk_extract::VpkArchive::open_with_overlay(
      Path::new(&file_path),
      overlay.as_deref(),
    )
    .map_err(|e| Error::InvalidInput(e.to_string()))?
    .with_fallbacks(base.iter().cloned().collect());
    let decoded = source2_model::decode_model_glb_from_archive(&archive, &entry_path)
      .map_err(|e| Error::InvalidInput(format!("failed to decode model: {e}")))?;
    job.check()?;
    let decoded = match base {
      Some(base) => source2_model::pose_model_at_rest(decoded, &base, &archive, &entry_path),
      None => decoded,
    };
    job.check()?;
    let decoded_ms = started.elapsed().as_millis();
    let model = job
      .assets
      .publish(&decoded.glb, decoded.vertex_count, decoded.index_count)?;
    if let Err(error) = job.check() {
      job.assets.release(&model.asset_id)?;
      return Err(error);
    }
    log::info!(
      "[Foundry] Model artifact {}: {} bytes, decode {} ms, write {} ms",
      model.asset_id,
      model.byte_length,
      decoded_ms,
      started.elapsed().as_millis() - decoded_ms
    );
    Ok(model)
  })
  .await
  .map_err(|e| Error::InvalidInput(format!("model decode task failed: {e}")))?
}

#[tauri::command]
pub fn foundry_cancel_model_decode(assets: State<'_, Arc<ModelAssets>>, request_id: String) {
  assets.cancel(&request_id);
}

#[tauri::command]
pub async fn foundry_release_model(
  assets: State<'_, Arc<ModelAssets>>,
  asset_id: String,
) -> Result<(), Error> {
  let assets = assets.inner().clone();
  tauri::async_runtime::spawn_blocking(move || assets.release(&asset_id))
    .await
    .map_err(|e| Error::InvalidInput(format!("model release task failed: {e}")))?
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn artifacts_are_immutable_and_only_registered_ids_can_be_released() {
    let root = tempfile::tempdir().unwrap();
    let assets = ModelAssets::in_directory(root.path()).unwrap();
    let first = assets.publish(b"first glb", 3, 3).unwrap();
    let second = assets.publish(b"second glb", 6, 6).unwrap();
    assert_ne!(first.asset_id, second.asset_id);
    assert_eq!(std::fs::read(&first.file_path).unwrap(), b"first glb");
    assert_eq!(first.byte_length, 9);
    assets.release(&second.file_path).unwrap();
    assets.release("../../outside.glb").unwrap();
    assert!(Path::new(&second.file_path).exists());
    assets.release(&first.asset_id).unwrap();
    assets.release(&first.asset_id).unwrap();
    assert!(!Path::new(&first.file_path).exists());
    assert!(Path::new(&second.file_path).exists());
    drop(assets);
    assert!(!Path::new(&second.file_path).exists());
  }

  #[test]
  fn startup_removes_abandoned_sessions_and_preserves_live_sessions() {
    let root = tempfile::tempdir().unwrap();
    let live = ModelAssets::in_directory(root.path()).unwrap();
    let model = live.publish(b"live glb", 3, 3).unwrap();
    let abandoned = root.path().join("session-abandoned");
    std::fs::create_dir(&abandoned).unwrap();
    File::create(abandoned.join(".lock")).unwrap();
    std::fs::write(abandoned.join("model-old.glb"), b"old").unwrap();
    clean_abandoned_sessions(root.path()).unwrap();
    assert!(!abandoned.exists());
    assert_eq!(std::fs::read(&model.file_path).unwrap(), b"live glb");
  }

  #[tokio::test]
  async fn queued_decode_waits_and_cancellation_releases_the_job() {
    let root = tempfile::tempdir().unwrap();
    let assets = Arc::new(ModelAssets::in_directory(root.path()).unwrap());
    let slot = Arc::new(Semaphore::new(1));
    let held = slot.clone().acquire_owned().await.unwrap();
    let job = assets.start_job("waiting".into()).unwrap();
    assert!(
      tokio::time::timeout(
        std::time::Duration::from_millis(25),
        job.acquire(slot.clone())
      )
      .await
      .is_err()
    );
    assets.cancel("waiting");
    assert!(job.acquire(slot.clone()).await.is_err());
    drop(job);
    assert!(assets.jobs.lock().unwrap().is_empty());
    drop(held);
    let next = assets.start_job("next".into()).unwrap();
    assert!(next.acquire(slot).await.is_ok());
  }
}
